import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { seedEvaluation, cleanEvaluation, verifyEvaluationRemoved, type EvaluationFixture } from "./s14-evaluation-fixture";

export type ConversationFixture = EvaluationFixture;
export async function seedConversation(db: PrismaClient, commit: string, blobRun: string) {
  const f = await seedEvaluation(db, commit, blobRun);
  try {
    await db.terraqoWorkspaceModule.createMany({ data: [f.workspace, f.otherWorkspace].flatMap(workspaceId =>
      ["PROFESSIONAL_MESSAGING", "TERRAQO_MEET"].map(code => ({ workspaceId, code: code as "PROFESSIONAL_MESSAGING" | "TERRAQO_MEET", active: true }))) });
    // Deliberately do NOT add either professional to a company: acceptance grants messaging only.
    assert.equal(await db.terraqoWorkspaceMember.count({ where: { userId: { in: [f.author, f.publisher] } } }), 0);
    return f;
  } catch (error) {
    await cleanEvaluation(db, f);
    const independent = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
    try { await verifyEvaluationRemoved(independent, f, []); } finally { await independent.$disconnect(); }
    throw error;
  }
}

export async function cleanConversation(db: PrismaClient, f: ConversationFixture) {
  // Restrict edges must be removed before S14/S13 cascades. Every predicate is fixture-owned.
  await db.$transaction(async tx => {
    await tx.terraqoUsageBucket.deleteMany({ where: { ownerKey: { in: [f.owner, f.author, f.publisher, f.otherOwner].map(id => `user:${id}`) } } });
    await tx.terraqoCollaboration.deleteMany({ where: { workspaceId: f.workspace } });
    await tx.terraqoConversationRequest.deleteMany({ where: { workspaceId: f.workspace, requesterId: f.owner } });
    await tx.terraqoMessageOperation.deleteMany({ where: { actorId: { in: [f.owner, f.author, f.publisher, f.otherOwner] } } });
    await tx.terraqoConversation.deleteMany({ where: { workspaceId: f.workspace, createdById: f.owner } });
  });
  await cleanEvaluation(db, f);
}

export async function verifyConversationRemoved(db: PrismaClient, f: ConversationFixture, dossierIds: string[], conversationIds: string[]) {
  await verifyEvaluationRemoved(db, f, dossierIds);
  const ids = { in: conversationIds }, actors = { in: [f.owner, f.author, f.publisher, f.otherOwner] };
  const counts = await db.$transaction([
    db.terraqoUsageBucket.count({ where: { ownerKey: { in: [f.owner, f.author, f.publisher, f.otherOwner].map(id => `user:${id}`) } } }),
    db.terraqoConversationRequest.count({ where: { workspaceId: f.workspace } }),
    db.terraqoConversation.count({ where: { OR: [{ id: ids }, { workspaceId: f.workspace }] } }),
    db.terraqoConversationParticipant.count({ where: { userId: actors } }),
    db.terraqoConversationContext.count({ where: { createdById: actors } }),
    db.terraqoDirectMessage.count({ where: { conversationId: ids } }),
    db.terraqoMessageOperation.count({ where: { actorId: actors } }),
    db.terraqoMessageAttachment.count({ where: { storageKey: f.plan.key } }),
    db.terraqoCollaboration.count({ where: { workspaceId: f.workspace } }),
    db.terraqoCollaborationProposal.count({ where: { createdById: actors } }),
    db.terraqoCollaborationAcceptance.count({ where: { actorId: actors } }),
    db.terraqoWorkspaceModule.count({ where: { workspaceId: { in: [f.workspace, f.otherWorkspace] } } }),
  ]);
  assert.ok(counts.every(count => count === 0), "S15 independent cleanup readback found surviving fixture data");
}
