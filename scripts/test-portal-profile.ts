import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { listPortalResource, savePortalResource, PortalResourceError } from "../lib/server/portal-resources";
import type { WorkspacePortalToken } from "../lib/server/workspace-portal-session";

async function main() {
  const original = { transaction: prisma.$transaction, profile: prisma.terraqoProfessionalProfile.findUnique,
    billing: prisma.terraqoBillingAccount.findUnique, module: prisma.terraqoWorkspaceModule.findUnique };
  let enabled = true, visible = true, stale = false, writes = 0;
  const version = "2026-01-01T00:00:00.000Z";
  const row = { id: "profile", username: null, headline: "", bio: null, status: "AVAILABLE",
    professionalCategories: [], specialties: [], equipment: [], software: [], messagePrivacy: "NOBODY", updatedAt: new Date(version) };
  const verifySelect = (select: Record<string, boolean>) => {
    assert.ok(!("userId" in select) && !("bankCci" in select) && !("bankAccountNumber" in select) && !("identityVerificationStatus" in select));
  };
  prisma.terraqoBillingAccount.findUnique = (async () => null) as unknown as typeof original.billing;
  prisma.terraqoWorkspaceModule.findUnique = (async () => ({ active: enabled })) as unknown as typeof original.module;
  prisma.terraqoProfessionalProfile.findUnique = (async (args: { where: unknown; select: Record<string, boolean> }) => {
    assert.deepEqual(args.where, { userId: "user" }); verifySelect(args.select); return row;
  }) as unknown as typeof original.profile;
  const tx = { terraqoProfessionalProfile: {
    findFirst: async (args: { where: unknown }) => { assert.deepEqual(args.where, { id: "profile", userId: "user" }); return visible ? row : null; },
    updateMany: async (args: { where: unknown; data: Record<string, unknown> }) => {
      assert.deepEqual(args.where, { id: "profile", userId: "user", updatedAt: new Date(version) });
      assert.ok(!("liveCvEnabled" in args.data) && !("visibility" in args.data));
      assert.deepEqual(args.data.specialties, ["Topografía", "Geodesia"]);
      if (stale) return { count: 0 }; writes++; return { count: 1 };
    },
    findFirstOrThrow: async (args: { where: unknown; select: Record<string, boolean> }) => {
      assert.deepEqual(args.where, { id: "profile", userId: "user" }); verifySelect(args.select); return row;
    },
  } };
  prisma.$transaction = (async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx)) as unknown as typeof original.transaction;
  const token: WorkspacePortalToken = { sub: "user", workspaceId: "workspace", workspaceSlug: "fixture", role: "PROFESSIONAL", iat: 1, exp: 2 };
  const fields = { headline: "Ingeniero", bio: "Mi trayectoria", status: "AVAILABLE", professionalCategories: "Ingeniería",
    specialties: "Topografía\nGeodesia\nTopografía", equipment: "", software: "", messagePrivacy: "NOBODY" };
  const rejected = (status: number) => (error: unknown) => error instanceof PortalResourceError && error.status === status;
  const save = (input: unknown = fields) => savePortalResource(token, "profile", input, null, "profile", version);
  try {
    const page = await listPortalResource(token, "profile"); assert.equal(page.canCreate, false); assert.equal(page.records.length, 1);
    await save(); assert.equal(writes, 1);
    stale = true; await assert.rejects(save(), rejected(409)); stale = false;
    visible = false; await assert.rejects(save(), rejected(404)); visible = true;
    await assert.rejects(savePortalResource(token, "profile", fields, null), rejected(409));
    for (const field of ["bankAccountNumber", "identityVerificationStatus", "userId", "liveCvVisibility", "planTier"])
      await assert.rejects(save({ ...fields, [field]: "PUBLIC" }));
    await assert.rejects(save({ ...fields, specialties: "x".repeat(161) }));
    await assert.rejects(save({ ...fields, specialties: Array.from({ length: 17 }, (_, i) => `item-${i}`).join("\n") }));
    for (const role of ["ADMIN", "MEMBER", "CLIENT", "VIEWER"] as const)
      await assert.rejects(listPortalResource({ ...token, role }, "profile"), rejected(403));
    enabled = false; await assert.rejects(save(), rejected(403)); assert.equal(writes, 1);
    console.log("PASS own profile: role/module gates, restricted fields, ownership, stale writes, bounded lists and unchanged publication settings.");
  } finally {
    prisma.$transaction = original.transaction; prisma.terraqoProfessionalProfile.findUnique = original.profile;
    prisma.terraqoBillingAccount.findUnique = original.billing; prisma.terraqoWorkspaceModule.findUnique = original.module;
    await prisma.$disconnect();
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
