import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
import { sharingSession } from "./lib/s06-sharing-browser";
import { assertS15Prerequisites } from "./verify-s15-conversation";
import { seedConversation, cleanConversation, verifyConversationRemoved } from "./lib/s15-conversation-fixture";

/** Independent route prerequisite: never relax the global administration boundary. */
export async function verifyWorkspaceMessagingRoute(origin: string, commit: string) {
  const { target, blobRun } = assertS15Prerequisites(origin, commit);
  assert.equal(target, "local");
  const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  try {
    const f = await seedConversation(db, commit, blobRun);
    try {
      const browser = await chromium.launch();
      try {
        const company = await sharingSession(browser, origin, f.owner, f.password);
        const professional = await sharingSession(browser, origin, f.author, f.password);
        const anonymous = await sharingSession(browser, origin);
        const options = { maxRedirects: 0, timeout: 60000 };
        const page = await company.newPage();
        await page.setViewportSize({ width: 1440, height: 1000 });
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.name));
        assert.equal((await page.goto(origin + "/admin/mensajes"))?.status(), 200);
        await page.getByRole("heading", { name: "Mensajes profesionales", exact: true }).waitFor();
        assert.equal(new URL(page.url()).pathname, "/admin/mensajes");
        await page.getByRole("button", { name: "Comunicacion", exact: true }).click();
        assert.ok(await page.locator('a[href="/admin/mensajes"]').count());
        for (const route of ["/admin/terraqo", "/admin/terraqo/mensajes"]) {
          const response = await company.request.get(route, options);
          assert.equal(response.status(), 307);
          assert.equal(new URL(response.headers().location, origin).pathname, "/admin");
        }
        for (const context of [professional, anonymous]) {
          const response = await context.request.get("/admin/mensajes", options);
          assert.equal(response.status(), 307);
        }
        await db.terraqoWorkspaceModule.updateMany({ where: { workspaceId: f.workspace, code: "PROFESSIONAL_MESSAGING" }, data: { active: false } });
        const disabled = await company.request.get("/admin/mensajes", options);
        // Streamed Next pages may have committed 200 before rendering not-found.
        assert.ok([200, 404].includes(disabled.status()));
        const body = await disabled.text();
        assert.ok(body.includes("NEXT_HTTP_ERROR_FALLBACK;404") || disabled.status() === 404);
        assert.ok(!body.includes("Mensajeria del workspace"));
        assert.deepEqual(errors, []);
        return { route: "/admin/mensajes", company: "200", globalRoutes: "restricted", professionalAndAnonymous: "redirected", disabledModule: "not-found" };
      } finally { await browser.close(); }
    } finally {
      await cleanConversation(db, f);
      const independent = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
      try { await verifyConversationRemoved(independent, f, [], []); }
      finally { await independent.$disconnect(); }
      console.log("S15_ROUTE_CLEANUP_VERIFIED", f.run);
    }
  } finally { await db.$disconnect(); }
}
