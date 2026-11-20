import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { cleanDiscovery, seedDiscovery, verifyDiscoveryRemoved, type DiscoveryFixture } from "./s13-discovery-fixture";

export type EvaluationFixture = DiscoveryFixture & { otherOwner: string; otherWorkspace: string };

export async function seedEvaluation(db: PrismaClient, commit: string, blobRun: string): Promise<EvaluationFixture> {
  const f = await seedDiscovery(db, commit, blobRun);
  const otherOwner = "s14-other-" + f.run, otherWorkspace = "s14-other-" + f.run;
  try {
    await db.$transaction(async tx => {
      const { passwordHash } = await tx.user.findUniqueOrThrow({ where: { id: f.owner }, select: { passwordHash: true } });
      await tx.user.create({ data: { id: otherOwner, email: otherOwner + "@example.invalid", name: "Otra empresa S14",
        emailVerified: new Date(), passwordHash, role: "ADMIN" } });
      await tx.terraqoWorkspace.create({ data: { id: otherWorkspace, slug: otherWorkspace, name: "Otra empresa S14",
        type: "CLIENT_COMPANY", ownerUserId: otherOwner, members: { create: { userId: otherOwner, role: "OWNER" } } } });
    });
  } catch (error) {
    // Only the successful S13 seed is owned here; the extension transaction rolled back.
    await cleanDiscovery(db, f);
    const independent = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
    try { await verifyDiscoveryRemoved(independent, f, []); } finally { await independent.$disconnect(); }
    throw error;
  }
  return { ...f, otherOwner, otherWorkspace };
}

export async function cleanEvaluation(db: PrismaClient, f: EvaluationFixture) {
  // Jobs reference evaluation sources with RESTRICT; remove jobs before the S13 cascade.
  await db.terraqoAnalysisJob.deleteMany({ where: { workspaceId: f.workspace, createdById: f.owner } });
  await db.$transaction(async tx => {
    await tx.terraqoWorkspace.delete({ where: { id: f.otherWorkspace, ownerUserId: f.otherOwner, slug: f.otherWorkspace } });
    await tx.verificationToken.deleteMany({ where: { identifier: "web-cv-session:" + f.otherOwner } });
    await tx.activityLog.deleteMany({ where: { actorId: f.otherOwner } });
    await tx.user.delete({ where: { id: f.otherOwner, email: f.otherOwner + "@example.invalid" } });
  });
  await cleanDiscovery(db, f);
}

export async function verifyEvaluationRemoved(db: PrismaClient, f: EvaluationFixture, dossierIds: string[]) {
  await verifyDiscoveryRemoved(db, f, []);
  const dossiers = { in: dossierIds };
  const counts = await db.$transaction([
    db.user.count({ where: { id: f.otherOwner } }),
    db.terraqoWorkspace.count({ where: { id: f.otherWorkspace } }),
    db.terraqoWorkspaceMember.count({ where: { userId: f.otherOwner } }),
    db.activityLog.count({ where: { actorId: f.otherOwner } }),
    db.verificationToken.count({ where: { identifier: "web-cv-session:" + f.otherOwner } }),
    db.terraqoEvaluationAssessment.count({ where: { dossierId: dossiers } }),
    db.terraqoEvaluationAssessmentSource.count({ where: { source: { worklogRevisionId: f.limited.revision } } }),
    db.terraqoEvaluationNote.count({ where: { dossierId: dossiers } }),
    db.terraqoEvaluationQuestion.count({ where: { dossierId: dossiers } }),
    db.terraqoAnalysisJob.count({ where: { workspaceId: f.workspace } }),
    db.terraqoAnalysisJobSource.count({ where: { worklogRevisionId: f.limited.revision } }),
  ]);
  assert.ok(counts.every(count => count === 0), "S14 fixture data survived independent cleanup readback");
}
