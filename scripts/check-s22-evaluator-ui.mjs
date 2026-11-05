import { build } from "esbuild";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";

// Synthetic component/visual check. Loopback only; no auth, database or real mail.
const out = path.resolve("output/s22/evaluator-ui");
await mkdir(out, { recursive: true });
await build({ stdin: { contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {WorkspaceMembers} from './components/admin/workspace-members';
import {AssignedEvaluations} from './components/portal/assigned-evaluations';
import {WorkspaceInvitationAccept} from './components/admin/workspace-invitation-accept';
const enabled=location.pathname!=='/disabled';
const evaluator={id:'evaluator-one',userId:'reader',name:'Evaluador de prueba',email:'reader@synthetic.invalid',active:true,canReadEvaluations:true,updatedAt:'2026-11-04T00:00:00.000Z',dossierIds:['dossier-one']};
const dossiers=[{id:'dossier-one',title:'Revisión de levantamiento topográfico'},{id:'dossier-two',title:'Evaluación de evidencias de supervisión y control de calidad en campo'}];
const evaluation={id:'dossier-one',title:dossiers[0].title,workspaceName:'Empresa de prueba',criteria:['Precisión del levantamiento','Trazabilidad de las evidencias'],sources:[{id:'source-one',title:'Informe de campo autorizado'},{id:'source-two'}]};
createRoot(document.getElementById('root')).render(location.pathname==='/reader'||location.pathname==='/empty' ? <AssignedEvaluations evaluations={location.pathname==='/empty'?[]:[evaluation]}/> : location.pathname==='/accept' ? <WorkspaceInvitationAccept signedIn={true} email="reader@synthetic.invalid" evaluatorsEnabled={true}/> : <WorkspaceMembers workspaceId="workspace-synthetic" name="Empresa de prueba" evaluatorsEnabled={enabled} members={[{id:'owner',name:'Administrador de prueba',email:'owner@synthetic.invalid',role:'OWNER',active:true}]} invitations={[]} evaluators={[evaluator]} dossiers={dossiers}/>);
`, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, jsx: "automatic", outfile: path.join(out, "app.js"), define: { "process.env.NODE_ENV": '"production"', "process.env": '{}' } });

const evaluator = { id: "evaluator-one", userId: "reader", name: "Evaluador de prueba", email: "reader@synthetic.invalid", active: true, canReadEvaluations: true, updatedAt: "2026-11-04T00:00:00.000Z", dossierIds: ["dossier-one"] };
const dossiers = [{ id: "dossier-one", title: "Revisión de levantamiento topográfico" }, { id: "dossier-two", title: "Evaluación de evidencias de supervisión y control de calidad en campo" }];
const invitations = [];
const invitationCommands = [];
const evaluatorCommands = [];
let conflictNext = false;
let failGet = false;
let failInvite = false;
let evaluatorReads = 0;
let version = 0;
const server = createServer(async (req, res) => {
  if (req.url.startsWith("/api/terraqo/workspace-evaluators")) {
    res.setHeader("Content-Type", "application/json");
    if (req.method === "GET") {
      evaluatorReads++;
      assert.equal(req.url, "/api/terraqo/workspace-evaluators?workspaceId=workspace-synthetic");
      if (failGet) { res.statusCode = 503; return res.end(JSON.stringify({ error: "No disponible" })); }
      return res.end(JSON.stringify({ evaluators: [evaluator], dossiers }));
    }
    let body = ""; for await (const chunk of req) body += chunk;
    const data = JSON.parse(body); evaluatorCommands.push(data);
    assert.equal(req.method, "PATCH");
    assert.equal(req.headers["content-type"], "application/json");
    if (conflictNext) {
      conflictNext = false;
      evaluator.updatedAt = `2026-11-04T00:0${++version}:00.000Z`;
      res.statusCode = 409;
      return res.end(JSON.stringify({ error: "Conflicto" }));
    }
    assert.equal(data.expectedUpdatedAt, evaluator.updatedAt, "PATCH always uses the current server version");
    Object.assign(evaluator, { active: data.active, canReadEvaluations: data.canReadEvaluations, dossierIds: data.dossierIds, updatedAt: `2026-11-04T00:0${++version}:00.000Z` });
    return res.end(JSON.stringify({ saved: true }));
  }
  if (req.url.startsWith("/api/terraqo/workspace-invitations")) {
    res.setHeader("Content-Type", "application/json");
    if (req.method === "GET") return res.end(JSON.stringify({ invitations }));
    let body = ""; for await (const chunk of req) body += chunk;
    const data = JSON.parse(body); invitationCommands.push(data);
    if (failInvite) { failInvite = false; res.statusCode = 503; return res.end(JSON.stringify({ error: "Reintenta la invitación" })); }
    if (data.action === "create") invitations.push({ id: `invite-${invitations.length}`, email: data.email, role: data.role, status: "PENDING", resendCount: 0, expiresAt: "2099-01-01T00:00:00Z" });
    return res.end(JSON.stringify(data.action === "accept" ? { workspaceId: "workspace-synthetic", access: "EVALUATOR" } : { token: "x".repeat(43), delivery: "disabled" }));
  }
  if (req.url === "/app.js" || req.url === "/app.css") { res.setHeader("Content-Type", req.url.endsWith("js") ? "text/javascript" : "text/css"); return res.end(await readFile(path.join(out, req.url.slice(1)))); }
  if (req.url === "/font.woff2") { res.setHeader("Content-Type", "font/woff2"); return res.end(await readFile("public/fonts/satoshi/satoshi-regular.woff2")); }
  res.setHeader("Content-Type", "text/html");
  res.end(`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"><style>@font-face{font-family:Satoshi;src:url(/font.woff2)}*{box-sizing:border-box}body{margin:0;padding:24px;background:#091725;font-family:Satoshi,sans-serif}h1,h2,h3,p{margin:0}button,input,select{font:inherit}#root{max-width:1440px;margin:auto}@media(max-width:520px){body{padding:0}}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>`);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/disabled`);
  assert.equal(await page.getByRole("option", { name: "Evaluador", exact: true }).count(), 0);
  assert.equal(await page.getByRole("heading", { name: /Evaluadores/ }).count(), 0);

  await page.goto(base);
  await page.getByRole("combobox", { name: /^Rol/ }).selectOption("EVALUATOR");
  await page.getByText("No disponible para evaluadores", { exact: true }).waitFor();
  assert.equal(await page.getByRole("checkbox").count(), 1, "general documents cannot be enabled");
  await page.getByLabel("Correo electrónico", { exact: true }).fill("reader@synthetic.invalid");
  await page.getByRole("button", { name: "Crear enlace de invitación" }).click();
  await page.getByLabel("Enlace privado").waitFor();
  assert.equal(invitationCommands.at(-1).role, "EVALUATOR");
  assert.equal(invitationCommands.at(-1).canReadEvaluations, false, "least privilege invitation default");

  await page.getByLabel("Correo electrónico", { exact: true }).fill("reader-two@synthetic.invalid");
  await page.getByRole("checkbox", { name: "Ver evaluaciones autorizadas" }).check();
  failInvite = true;
  await page.getByRole("button", { name: "Crear enlace de invitación" }).click();
  await page.getByRole("alert").waitFor();
  const retryKey = invitationCommands.at(-1).operationKey;
  await page.getByRole("button", { name: "Crear enlace de invitación" }).click();
  await page.getByLabel("Enlace privado").waitFor();
  assert.equal(invitationCommands.at(-1).operationKey, retryKey);
  assert.equal(invitationCommands.at(-1).canReadEvaluations, true);
  await page.getByRole("combobox", { name: /^Rol/ }).selectOption("VIEWER");
  await page.getByLabel("Correo electrónico", { exact: true }).fill("member@synthetic.invalid");
  await page.getByRole("button", { name: "Crear enlace de invitación" }).click();
  await page.getByLabel("Enlace privado").waitFor();
  assert.equal("canReadEvaluations" in invitationCommands.at(-1), false, "ordinary invitation payload is preserved");

  const manage = page.getByRole("button", { name: /Gestionar evaluador/ });
  await manage.click();
  const form = page.getByRole("form", { name: "Acceso de Evaluador de prueba" });
  await form.getByLabel(dossiers[1].title, { exact: true }).check();
  await form.getByLabel("Acceso activo", { exact: true }).uncheck();
  assert.equal(evaluatorCommands.length, 0, "draft does not mutate access");
  await page.getByRole("combobox", { name: /^Rol/ }).selectOption("EVALUATOR");
  await page.screenshot({ path: path.join(out, "desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(out, "mobile.png"), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByRole("button", { name: "Guardar acceso de evaluador", exact: true }).click();
  await page.getByText("Acceso de evaluador actualizado.", { exact: true }).waitFor();
  assert.deepEqual(evaluatorCommands[0], { workspaceId: "workspace-synthetic", evaluatorId: "evaluator-one", active: false, canReadEvaluations: true, dossierIds: ["dossier-one", "dossier-two"], expectedUpdatedAt: "2026-11-04T00:00:00.000Z" });
  assert.equal(evaluatorReads, 1, "saved:true triggers authoritative GET");
  await manage.click();
  await form.getByLabel("Ver evaluaciones autorizadas", { exact: true }).uncheck();
  await form.getByLabel(dossiers[0].title, { exact: true }).uncheck();
  conflictNext = true;
  await page.getByRole("button", { name: "Guardar acceso de evaluador", exact: true }).click();
  await page.getByText("El acceso cambió mientras lo editabas.", { exact: false }).waitFor();
  assert.equal(await form.count(), 0, "conflict requires a new explicit edit");
  const freshTimestamp = evaluator.updatedAt;
  await manage.click();
  assert.equal(await form.getByLabel(dossiers[0].title, { exact: true }).isChecked(), true, "conflicting draft is discarded");
  await form.getByLabel("Ver evaluaciones autorizadas", { exact: true }).uncheck();
  failGet = true;
  await page.getByRole("button", { name: "Guardar acceso de evaluador", exact: true }).click();
  await page.getByRole("button", { name: "Recargar accesos" }).waitFor();
  assert.equal(evaluatorCommands.at(-1).expectedUpdatedAt, freshTimestamp);
  assert.equal(await manage.isDisabled(), true, "failed refresh prevents a stale PATCH retry");
  failGet = false;
  await page.getByRole("button", { name: "Recargar accesos" }).click();
  await page.getByText("Lista actualizada. Revisa los permisos antes de editar.").waitFor();
  await manage.click();
  assert.equal(await form.getByLabel("Ver evaluaciones autorizadas", { exact: true }).isChecked(), false);
  await page.getByRole("button", { name: "Cancelar edición", exact: true }).click();
  assert.equal(evaluatorCommands.length, 3, "reload and cancel do not mutate");
  await page.setViewportSize({ width: 320, height: 740 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "320px has no overflow");

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/reader`);
    await page.getByRole("heading", { name: "Evaluaciones autorizadas", exact: true }).waitFor();
    await page.getByText("Informe de campo autorizado", { exact: true }).waitFor();
    await page.getByText("Evidencia autorizada", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button").count(), 0);
    assert.equal(await page.getByRole("link").count(), 0, "source IDs never become unapproved document links");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(out, `reader-${width === 1440 ? "desktop" : "mobile"}.png`), fullPage: true });
  }
  await page.goto(`${base}/empty`);
  await page.getByRole("heading", { name: "Aún no tienes evaluaciones disponibles" }).waitFor();
  await page.goto(`${base}/accept#${"x".repeat(43)}`);
  await page.getByRole("button", { name: "Aceptar invitación", exact: true }).click();
  const destination = page.getByRole("link", { name: "Ver evaluaciones autorizadas", exact: true });
  await destination.waitFor();
  assert.equal(await destination.getAttribute("href"), "/portal/evaluaciones");
  assert.equal(new URL(page.url()).hash, "");
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.deepEqual(errors, []);
  console.log("PASS S22 evaluator UI: flag off, invitation defaults/payload/retry, ordinary roles, inline selection, saved:true + GET, conflict fresh timestamp, failed refresh lock, cancel, 320/390/1440px, reader data/empty state, acceptance destination. Synthetic components only; no DB/session or real API tested.");
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
