import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch();
try {
 for (const width of [1280, 375]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } }); const decisions = [];
  await page.route('**/api/v1/publication-reviews/*/media/*', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320"><rect width="640" height="320" fill="#dce8ee"/><text x="24" y="160" font-size="24">Adjunto de prueba</text></svg>' }));
  await page.route('**/api/v1/publication-reviews', async route => { decisions.push(route.request().postDataJSON()); await route.fulfill({ json: { data: { id: 'review-fixture', decision: 'APPROVED' } } }); });
  await page.goto('http://localhost:3191');
  await page.getByRole('button', { name: /Control geométrico/ }).click();
  const approve = page.getByRole('button', { name: 'Autorizar selección', exact: true });
  const confirm = page.getByRole('checkbox');
  await expect(confirm).not.toBeChecked(); await expect(approve).toBeDisabled();
  await expect(page.getByText('Responsable de control topográfico', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pedir cambios' })).toBeDisabled();
  await expect(confirm).toBeEnabled(); await confirm.check(); await expect(approve).toBeEnabled();
  await page.screenshot({ path: `output/publication-review-${width}.png`, fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await approve.click(); await expect(page.getByRole('status')).toContainText('El profesional debe publicar');
  assert.equal(decisions.length, 1); assert.equal(decisions[0].payload.confirmed, true); assert.equal(decisions[0].payload.scopeHash, 'a'.repeat(64));
  await page.getByRole('button', { name: 'Volver a las solicitudes' }).click();
  await page.getByRole('button', { name: /Control geométrico/ }).click(); await expect(confirm).not.toBeChecked();
  await page.getByLabel(/Motivo o comentario/).fill('Ocultar datos del frente de trabajo.');
  await page.getByRole('button', { name: 'Pedir cambios' }).click();
  await expect(page.getByRole('status')).toContainText('Decisión guardada'); assert.equal(decisions.at(-1).payload.decision, 'CHANGES_REQUESTED');
  await page.close();
 }
 const page = await browser.newPage();
 await page.route('**/api/v1/publication-reviews/*/media/*', route => route.fulfill({ status: 404, body: 'Unavailable' }));
 await page.goto('http://localhost:3191'); await page.getByRole('button', { name: /Control geométrico/ }).click();
 await expect(page.getByRole('alert').filter({hasText:'No se pudo cargar'})).toBeVisible(); await expect(page.getByRole('checkbox')).toBeDisabled();
 await expect(page.getByRole('button', { name: 'Autorizar selección', exact: true })).toBeDisabled();
 await page.goto('http://localhost:3191?view=professional'); await page.getByRole('button', { name: /Control geométrico/ }).click();
 await expect(page.getByRole('button', { name: 'Autorizar selección', exact: true })).toHaveCount(0);
 console.log('PASS desktop/mobile explicit approval, exact preview, decision payload, changes reason, fresh selection reset and missing-media approval block. Synthetic fixture; no DB changes.');
} finally { await browser.close(); }
