import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
let phase = "setup";
let httpStatus: number | undefined;

async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
  const workspace = await prisma.terraqoWorkspace.findFirstOrThrow({ where: {
    slug: "icc-topografia", active: true, deletedAt: null,
    companies: { some: { document: "20616116313", deletedAt: null } },
  }, select: { id: true } });
  const username = `cv-fixture-${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const user = await prisma.user.create({ data: {
    email: `${username}@example.test`, name: "Muestra sintética de privacidad",
    role: "CUSTOMER", emailVerified: new Date(),
    terraqoMemberships: { create: { workspaceId: workspace.id, role: "PROFESSIONAL", active: true } },
    terraqoProfessionalProfile: { create: { username, liveCvEnabled: false, liveCvVisibility: "PRIVATE",
      headline: "Perfil ficticio de validación", experiences: { create: {
        title: "Experiencia ficticia pública", visibility: "PUBLIC",
      } } } },
  }, select: { id: true, terraqoProfessionalProfile: { select: { id: true, experiences: { select: { id: true } } } } } });
  const profile = user.terraqoProfessionalProfile!;
  const get = (path: string) => fetch((path.startsWith("/api/")
    ? "https://api.terraqoglobal.com" : "https://terraqoglobal.com") + path, { redirect: "error", signal: AbortSignal.timeout(90000) });
  const paths = [`/cv/${username}`, `/cv/${username}/experiencias`, `/cv/${username}/documentos`,
    `/cv/${username}/experiencias/${profile.experiences[0].id}`, `/cv/${username}/opengraph-image`,
    `/api/terraqo/cv/${username}/pdf`];
  try {
    if (process.env.TERRAQO_CV_BOUNDARY_BASELINE === "1") {
      const response = await get(paths.at(-1)!);
      assert.equal(response.status, 200);
      assert.ok(Buffer.from(await response.arrayBuffer()).subarray(0, 5).equals(Buffer.from("%PDF-")));
      console.log("REPRODUCED with own synthetic profile only: anonymous PDF available while liveCvEnabled=false.");
      return;
    }
    for (const [index, path] of paths.entries()) {
      phase = `unpublished route ${index}`;
      const response = await get(path); httpStatus = response.status; assert.equal(response.status, 404, "Unpublished synthetic CV must be inaccessible.");
      if (response.headers.get("content-type")?.includes("text/html")) {
        const html = await response.text();
        assert.ok(!html.includes("Muestra sintética de privacidad"));
        assert.ok(!html.includes("Perfil ficticio de validación"));
      }
    }
    await prisma.terraqoProfessionalProfile.update({ where: { id: profile.id }, data: { liveCvEnabled: true, liveCvVisibility: "PUBLIC" } });
    for (const [index, path] of paths.entries()) {
      phase = `published route ${index}`;
      const response = await get(path); httpStatus = response.status;
      assert.equal(httpStatus, 200, "Explicitly published synthetic CV remains accessible.");
      if (index === 4 || index === 5) {
        assert.match(response.headers.get("cache-control") ?? "", /no-store/);
        const bytes = Buffer.from(await response.arrayBuffer());
        assert.ok(index === 4 ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
          : bytes.subarray(0, 5).equals(Buffer.from("%PDF-")));
      }
    }
    await prisma.terraqoProfessionalProfile.update({ where: { id: profile.id }, data: { liveCvEnabled: false } });
    for (const [index, path] of paths.entries()) { phase = `withdrawn route ${index}`; httpStatus = (await get(path)).status; assert.equal(httpStatus, 404, "Withdrawal must close subsequent anonymous requests."); }
    console.log("PASS CV publication boundary: unpublished HTML/sections/detail/OG/PDF denied, synthetic public positive case, withdrawal denied again.");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    console.log("CLEANUP: only this invocation's synthetic CV, experience, profile, user and membership removed.");
  }
}
main().catch(() => { console.error(`CV boundary verification failed at ${phase}, HTTP ${httpStatus ?? "unavailable"}; private diagnostics suppressed.`); process.exitCode = 1; }).finally(() => prisma.$disconnect());
