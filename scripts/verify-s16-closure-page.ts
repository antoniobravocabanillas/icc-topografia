import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { chromium, expect } from "@playwright/test";
import { sharingSession } from "./lib/s06-sharing-browser";
import { seedConversation, seedCancellation, ownedIds, cleanS16 } from "./lib/s16-collaboration-fixture";

/** Narrow prerequisite for S16: page rendering and protected preview, not the full closure journey. */
export async function verifyS16ClosurePage() {
  const origin = process.env.AUTH_URL!;
  assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  const db = new PrismaClient();
  const ids = ownedIds();
  try {
    assert.deepEqual(await db.$queryRaw`SELECT current_user AS role, current_database() AS database`, [{ role: "terraqo_s22_test", database: "postgres" }]);
    const f = await seedConversation(db, process.env.S22_STAGING_CANDIDATE_SHA!, process.env.PLATFORM_STAGING_S24_BLOB_RUN!);
    const browser = await chromium.launch();
    try {
      const c = await seedCancellation(db, f, ids);
      const company = await sharingSession(browser, origin, f.owner, f.password);
      const professional = await sharingSession(browser, origin, f.author, f.password);
      const anonymous = await sharingSession(browser, origin);
      const page = await company.newPage(), errors: string[] = [];
      page.on("pageerror", e => errors.push(e.name));
      const url = `${origin}/admin/colaboraciones/${c.id}/cierre`;
      assert.equal((await page.goto(url))?.status(), 200, "Initial closure page GET");
      await expect(page.getByLabel("Contribución realizada", { exact: true })).toBeVisible();
      const api = `/api/v1/collaborations/${c.id}`;
      for (const suffix of ["/closures", "/closures/submit", "/proposals"]) {
        const denied = await anonymous.request.post(api + suffix, { headers: { Origin: origin }, data: "not-json" });
        assert.equal(denied.status(), 401);
      }
      const save = await company.request.post(api + "/closures", { headers: { Origin: origin, "Idempotency-Key": randomUUID() }, data: {
        contribution: "Control topográfico sintético del frente norte", deliverables: ["Informe de control"], result: "",
        referenceSources: [{ worklogRevisionId: f.solo.revision, accessKind: "PUBLIC_CV", accessReferenceId: f.solo.id }],
      } });
      assert.equal(save.status(), 201);
      const closure = (await save.json()).data;
      ids.closures.push(closure.id); ids.revisions.push(closure.currentRevision.id);
      assert.equal((await page.reload())?.status(), 200, "Draft closure page GET");
      await expect(page.getByLabel("Contribución realizada", { exact: true })).toHaveValue("Control topográfico sintético del frente norte");
      const submit = await company.request.post(api + "/closures/submit", { headers: { Origin: origin, "Idempotency-Key": randomUUID() }, data: { expectedRevisionNo: 1 } });
      assert.equal(submit.status(), 200);
      const pro = await professional.newPage(); pro.on("pageerror", e => errors.push(e.name));
      assert.equal((await pro.goto(`${origin}/portal/colaboraciones/${c.id}/cierre`))?.status(), 200, "Submitted professional page GET");
      const evidence = pro.getByRole("region", { name: "Referencias autorizadas" });
      await evidence.locator("summary").first().click();
      const image = evidence.getByRole("img", { name: "Evidencia autorizada 1", exact: true });
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate(n => (n as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      for (const width of [1440, 390, 320]) {
        await pro.setViewportSize({ width, height: 900 });
        assert.equal(await pro.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      }
      assert.deepEqual(errors, []);
      console.log("PASS S16 narrow real-session GET: empty/draft/company/submitted-professional, anonymous POST, protected image and responsive layout");
    } finally {
      await browser.close();
      await cleanS16(db, f, ids);
      console.log("PASS S16 page prerequisite independent cleanup", f.run);
    }
  } finally { await db.$disconnect(); }
}
