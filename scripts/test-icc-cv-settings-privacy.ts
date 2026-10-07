import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prisma } from "../lib/prisma";

// Exercise the real actions and SQL writes. Only Next's request context is
// replaced; every authenticated identity belongs to this temporary fixture.
Object.assign(globalThis, { React });
const require = createRequire(import.meta.url);
const redirected = Symbol("redirected");
let actorId = "";
let phase = "setup";
function replaceModule(path: string, exports: object) {
  const id = require.resolve(path);
  require.cache[id] = { id, filename: id, loaded: true, exports } as NodeModule;
}
replaceModule("server-only", {});
replaceModule("../auth", { auth: async () => ({ user: { id: actorId } }) });
replaceModule("next/cache", { revalidatePath: () => undefined });
replaceModule("next/navigation", { redirect: () => { throw redirected; } });

async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
  const workspace = await prisma.terraqoWorkspace.findFirstOrThrow({ where: {
    slug: "icc-topografia", active: true, deletedAt: null,
    companies: { some: { document: "20616116313", deletedAt: null } },
  }, select: { id: true } });
  const alias = `cv-save-${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const user = await prisma.user.create({ data: {
    email: `${alias}@example.test`, name: "Fixture privado de configuración", role: "CUSTOMER",
    terraqoMemberships: { create: { workspaceId: workspace.id, role: "PROFESSIONAL", active: true } },
    terraqoProfessionalProfile: { create: { username: alias, liveCvEnabled: false, liveCvVisibility: "PRIVATE" } },
  }, select: { id: true, terraqoProfessionalProfile: { select: { id: true } } } });
  actorId = user.id;
  const profileId = user.terraqoProfessionalProfile!.id;
  const originalUpdate = prisma.terraqoProfessionalProfile.update;
  try {
    phase = "load action module";
    const { updateProfessionalUsernameAction, updateProfessionalSettingsAction } = await import("../lib/server/professional-actions");
    const current = () => prisma.terraqoProfessionalProfile.findUniqueOrThrow({ where: { id: profileId },
      select: { liveCvEnabled: true, liveCvVisibility: true, username: true, headline: true } });
    for (const [name, action] of [["alias", updateProfessionalUsernameAction], ["settings", updateProfessionalSettingsAction]] as const) {
      const form = new FormData(); form.set("username", alias); form.set("headline", "Cambio sintético");
      // A stale/forged legacy form must never be a publication command.
      form.set("liveCvEnabled", "true"); form.set("liveCvVisibility", "PUBLIC"); form.set("userId", "foreign");
      for (const enabled of [false, true]) {
        phase = `${name}: preserve ${enabled}`;
        await originalUpdate.call(prisma.terraqoProfessionalProfile, { where: { id: profileId }, data: { liveCvEnabled: enabled } });
        await assert.rejects(action(form), error => error === redirected);
        const saved = await current();
        assert.equal(saved.liveCvEnabled, enabled); assert.equal(saved.liveCvVisibility, "PRIVATE");
        assert.equal(saved.username, alias);
        if (name === "settings") assert.equal(saved.headline, "Cambio sintético");
      }
      phase = `${name}: concurrent withdrawal`;
      // Withdraw after the action's initial read, before its actual UPDATE.
      // Omitting the switch from UPDATE preserves the latest committed state.
      let intercepted = false;
      prisma.terraqoProfessionalProfile.update = (async (args: Parameters<typeof originalUpdate>[0]) => {
        intercepted = true;
        await originalUpdate.call(prisma.terraqoProfessionalProfile, { where: { id: profileId }, data: { liveCvEnabled: false } });
        return originalUpdate.call(prisma.terraqoProfessionalProfile, args);
      }) as unknown as typeof originalUpdate;
      await originalUpdate.call(prisma.terraqoProfessionalProfile, { where: { id: profileId }, data: { liveCvEnabled: true } });
      await assert.rejects(action(form), error => error === redirected);
      assert.ok(intercepted); assert.equal((await current()).liveCvEnabled, false);
      prisma.terraqoProfessionalProfile.update = originalUpdate;
    }
    phase = "settings publication status";
    const { default: SettingsPage } = await import("../app/(commerce)/portal/configuracion/page");
    for (const enabled of [false, true]) {
      await originalUpdate.call(prisma.terraqoProfessionalProfile, { where: { id: profileId }, data: { liveCvEnabled: enabled } });
      const html = renderToStaticMarkup(await SettingsPage({ searchParams: Promise.resolve({}) }));
      assert.equal(html.includes("Ver CV público"), enabled);
      assert.equal(html.includes("Enlace activo:"), enabled);
      assert.equal(html.includes("CV sin publicar."), !enabled);
      assert.equal(html.includes("Guardar este formulario no publica ni reactiva tu CV."), !enabled);
    }
    console.log("PASS real settings/alias actions and SQL: preserve publication and visibility, ignore forged publication/owner fields, concurrent withdrawal stays withdrawn.");
  } finally {
    prisma.terraqoProfessionalProfile.update = originalUpdate;
    await prisma.user.delete({ where: { id: user.id } });
    console.log("CLEANUP: only this invocation's synthetic user/profile/membership/social links removed.");
  }
}
main().catch(() => { console.error(`CV settings verification failed at ${phase}; private diagnostics suppressed.`); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
