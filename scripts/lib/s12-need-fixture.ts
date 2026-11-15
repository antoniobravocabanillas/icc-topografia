import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

export function needFixture(commit: string) {
  assert.match(commit, /^[0-9a-f]{40}$/);
  const run = randomUUID();
  const owner = "s12-owner-" + run;
  return { run, owner, workspace: "s12-need-" + commit.slice(0, 16), slug: "s12-company-" + run,
    profile: "s12-profile-" + run, dossier: "s12-evaluation-" + run,
    email: owner + "@example.invalid", password: randomBytes(24).toString("base64url") };
}
export type NeedFixture = ReturnType<typeof needFixture>;

export async function seedNeedCompany(db: PrismaClient, f: NeedFixture) {
  const passwordHash = await bcrypt.hash(f.password, 10);
  // The pilot id is shared by retries of one candidate. A collision rolls back the entire seed.
  await db.$transaction(async tx => {
    await tx.user.create({ data: { id: f.owner, email: f.email, passwordHash, emailVerified: new Date(),
      name: "Responsable de prueba S12", role: "ADMIN" } });
    await tx.terraqoWorkspace.create({ data: { id: f.workspace, slug: f.slug, ownerUserId: f.owner,
      type: "CLIENT_COMPANY", name: "Empresa sintética S12", members: { create: { userId: f.owner, role: "OWNER" } } } });
    await tx.terraqoProfessionalProfile.create({ data: { id: f.profile, userId: f.owner, liveCvEnabled: false } });
  });
}

export async function cleanNeedCompany(db: PrismaClient, f: NeedFixture) {
  await db.$transaction(async tx => {
    await tx.terraqoEvaluationDossier.deleteMany({ where: { id: f.dossier, workspaceId: f.workspace, createdById: f.owner } });
    await tx.terraqoWorkNeed.deleteMany({ where: { workspaceId: f.workspace, createdById: f.owner } });
    await tx.terraqoProfessionalProfile.delete({ where: { id: f.profile, userId: f.owner } });
    await tx.activityLog.deleteMany({ where: { actorId: f.owner } });
    await tx.terraqoWorkspace.delete({ where: { id: f.workspace, slug: f.slug, ownerUserId: f.owner } });
    await tx.user.delete({ where: { id: f.owner, email: f.email } });
  });
}

export async function assertNeedCompanyRemoved(db: PrismaClient, f: NeedFixture, requirementIds: string[]) {
  // A subsequent run can already own the same pilot id. Verify the unique ownership of this run.
  const counts = await db.$transaction([
    db.terraqoWorkspace.count({ where: { slug: f.slug } }),
    db.user.count({ where: { id: f.owner } }),
    db.terraqoWorkspaceMember.count({ where: { userId: f.owner } }),
    db.terraqoProfessionalProfile.count({ where: { id: f.profile } }),
    db.terraqoWorkNeed.count({ where: { createdById: f.owner } }),
    db.terraqoWorkNeedRevision.count({ where: { createdById: f.owner } }),
    db.terraqoNeedRequirement.count({ where: { id: { in: requirementIds } } }),
    db.terraqoEvaluationDossier.count({ where: { id: f.dossier } }),
    db.activityLog.count({ where: { actorId: f.owner } }),
  ]);
  assert.ok(counts.every(n => n === 0), "S12 fixture data survived cleanup");
}
