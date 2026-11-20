import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { seedConversation, cleanConversation, verifyConversationRemoved,
  type ConversationFixture } from "@/scripts/lib/s15-conversation-fixture";

export type S16Fixture = ConversationFixture;
export type OwnedIds = { dossiers: string[]; conversations: string[]; collaborations: string[];
  closures: string[]; revisions: string[]; certificates: string[] };
export const ownedIds = (): OwnedIds => ({ dossiers: [], conversations: [], collaborations: [],
  closures: [], revisions: [], certificates: [] });
export { seedConversation };

/** Extra cancellation scenario only. Main proposal/acceptance is never seeded. */
export async function seedCancellation(db: PrismaClient, f: S16Fixture, ids: OwnedIds) {
  const value = await db.$transaction(async tx => {
    const conversation = await tx.terraqoConversation.create({ data: {
      workspaceId: f.workspace, createdById: f.owner, title: "S16 synthetic cancellation " + f.run,
      participants: { create: [{ userId: f.owner }, { userId: f.author }] },
    } });
    const collaboration = await tx.terraqoCollaboration.create({ data: {
      workspaceId: f.workspace, conversationId: conversation.id, professionalUserId: f.author,
      status: "ACCEPTED", acceptedRevisionNo: 1, acceptedAt: new Date(),
      proposals: { create: { revisionNo: 1, scope: "Alcance sintético exclusivo de cancelación " + f.run,
        roleTitle: "Cancelación S16", status: "ACCEPTED", decidedAt: new Date(), decidedById: f.author,
        createdById: f.owner, operationKey: randomUUID(), operationFingerprint: "synthetic-s16-" + f.run,
        acceptances: { create: [{ party: "WORKSPACE", actorId: f.owner },
          { party: "PROFESSIONAL", actorId: f.author }] } } },
    } });
    return { conversation, collaboration };
  });
  ids.conversations.push(value.conversation.id);
  ids.collaborations.push(value.collaboration.id);
  return value.collaboration;
}

/** Compare only fixture-owned sharing rows; unrelated tenants may change concurrently. */
export async function sharingSnapshot(db: PrismaClient, f: S16Fixture) {
  const actors = { in: [f.owner, f.author, f.publisher, f.otherOwner] };
  return {
    collections: await db.terraqoShareCollection.findMany({ where: { createdById: actors }, orderBy: { id: "asc" } }),
    grants: await db.terraqoAccessGrant.findMany({ where: { OR: [{ issuedById: actors }, { subjectUserId: actors }] }, orderBy: { id: "asc" } }),
    projections: await db.terraqoPublicProjection.findMany({ where: { collection: { createdById: actors } }, orderBy: { id: "asc" } }),
    reviews: await db.terraqoPublicationReview.findMany({ where: { workspaceId: f.workspace }, orderBy: { id: "asc" } }),
    memberships: await db.terraqoWorkspaceMember.findMany({ where: { userId: { in: [f.author, f.publisher] } }, orderBy: { id: "asc" } }),
    worklogs: await db.terraqoWorklogEntry.findMany({ where: { authorId: actors }, orderBy: { id: "asc" } }),
    media: await db.terraqoWorklogMedia.findMany({ where: { worklog: { authorId: actors } }, orderBy: { id: "asc" } }),
  };
}

export async function cleanS16(db: PrismaClient, f: S16Fixture, ids: OwnedIds) {
  const failures: unknown[] = [];
  try {
    // Certificates have RESTRICT edges to closure/revision and must go first.
    await db.terraqoCollaborationCertificate.deleteMany({ where: { closure: { collaboration: {
      workspaceId: f.workspace, conversation: { createdById: f.owner },
    } } } });
  } catch (error) { failures.push(error); }
  // Cancellation audit has a RESTRICT workspace edge. Delete only this owned run before workspace cleanup.
  try { await db.activityLog.deleteMany({ where: { terraqoWorkspaceId: f.workspace, actorId: f.owner,
    entityType: "TerraqoCollaboration", entityId: { in: ids.collaborations }, id: { startsWith: "collaboration-cancel:v1:" } } }); }
  catch (error) { failures.push(error); }
  try { await cleanConversation(db, f); } catch (error) { failures.push(error); }
  const independent = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  try {
    try { await verifyConversationRemoved(independent, f, ids.dossiers, ids.conversations); }
    catch (error) { failures.push(error); }
    // IDs cover known rows; actor/reference predicates catch unrecorded partial responses.
    const actors = { in: [f.owner, f.author, f.publisher, f.otherOwner] };
    const counts = await independent.$transaction([
      independent.terraqoCollaborationClosure.count({ where: { OR: [{ id: { in: ids.closures } },
        { collaborationId: { in: ids.collaborations } }] } }),
      independent.terraqoClosureRevision.count({ where: { OR: [{ id: { in: ids.revisions } }, { createdById: actors }] } }),
      independent.terraqoClosureReference.count({ where: { worklogRevisionId: { in: [f.solo.revision, f.limited.revision] } } }),
      independent.terraqoCollaborationCertificate.count({ where: { OR: [{ id: { in: ids.certificates } }, { issuedById: actors }] } }),
      independent.activityLog.count({ where: { OR: [{ actorId: actors },
        { terraqoWorkspaceId: f.workspace, id: { startsWith: "collaboration-cancel:v1:" } }] } }),
    ]);
    assert.ok(counts.every(count => count === 0), "Independent S16 cleanup found remaining rows");
  } catch (error) { failures.push(error); }
  finally { await independent.$disconnect(); }
  if (failures.length) throw new AggregateError(failures, "S16 cleanup incomplete; operator review required");
}
