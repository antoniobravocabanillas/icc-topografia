import assert from "node:assert/strict";
import { Prisma, type PrismaClient } from "@prisma/client";
import { s24BlobFixtures } from "./s24-blob-fixtures.mjs";
import { createHash } from "node:crypto";

// Hash in PostgreSQL. The harness never reads or logs the retained invitation token,
// user credentials or mail contents. Canonical JSONB order includes every column.
const tables = ["User", "TerraqoWorkspace", "TerraqoWorkspaceMember", "TerraqoWorkspaceInvitation",
  "TerraqoProfessionalProfile", "TerraqoWorkspaceModule", "VerificationToken", "TerraqoWorklogEntry",
  "TerraqoWorklogRevision", "TerraqoWorklogMedia", "TerraqoShareCollection", "TerraqoShareCollectionItem",
  "TerraqoPublicationReview", "TerraqoPublicProjection", "TerraqoAccessGrant", "TerraqoWorkNeed",
  "TerraqoWorkNeedRevision", "TerraqoNeedRequirement", "TerraqoEvaluationDossier", "TerraqoEvaluationSource",
  "TerraqoAnalysisJob", "TerraqoAnalysisJobSource", "TerraqoConversationRequest"] as const;

export async function s24Baseline(db: PrismaClient) {
  const rows = await db.$transaction(tables.map(table => db.$queryRaw<{ count: number; digest: string }[]>(
    Prisma.sql`SELECT count(*)::int AS count, encode(sha256(convert_to(COALESCE(string_agg(to_jsonb(t)::text,
      E'\n' ORDER BY to_jsonb(t)::text), ''), 'UTF8')), 'hex') AS digest FROM ${Prisma.raw('icc."' + table + '"')} AS t`
  )), { isolationLevel: "RepeatableRead" });
  return { digest: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
    users: rows[0][0].count, workspaces: rows[1][0].count, invitations: rows[3][0].count, tables: tables.length };
}
export type S24Ids = { userIds: string[]; workspaceIds: string[]; worklogIds: string[] };
export async function cleanupS24(db: PrismaClient, ids: S24Ids) {
  const user = { in: ids.userIds }, workspace = { in: ids.workspaceIds }, worklog = { in: ids.worklogIds };
  await db.$transaction([
    db.terraqoConversationRequest.deleteMany({ where: { workspaceId: workspace, requesterId: user } }),
    db.terraqoAnalysisJob.deleteMany({ where: { workspaceId: workspace, createdById: user } }),
    db.terraqoEvaluationDossier.deleteMany({ where: { workspaceId: workspace, createdById: user } }),
    db.terraqoWorkNeed.deleteMany({ where: { workspaceId: workspace, createdById: user } }),
    db.terraqoPublicationReview.deleteMany({ where: { workspaceId: workspace, requestedById: user } }),
    db.terraqoShareCollection.deleteMany({ where: { createdById: user } }),
    db.terraqoWorklogEntry.deleteMany({ where: { id: worklog, authorId: user } }),
    db.terraqoWorkspace.deleteMany({ where: { id: workspace } }),
    db.verificationToken.deleteMany({ where: { identifier: { in: ids.userIds.map(id => `web-cv-session:${id}`) } } }),
    db.user.deleteMany({ where: { id: user } }),
  ]);
  assert.deepEqual(await Promise.all([db.user.count({ where: { id: user } }), db.terraqoWorkspace.count({ where: { id: workspace } }),
    db.terraqoWorklogEntry.count({ where: { id: worklog } }), db.terraqoWorklogMedia.count({ where: { worklogId: worklog } })]), [0, 0, 0, 0]);
}

// Only recover the IDs supplied for a known interrupted run. A mismatched
// account, workspace or media manifest aborts before any delete is issued.
export async function recoverInterruptedS24(db: PrismaClient, runId: string, suffix: string) {
  assert.match(suffix, /^[a-f0-9]{12}$/);
  const keys = s24BlobFixtures(runId).flat().map(item => item.key).sort();
  const userIds = ["owner", "reviewer", "stranger"].map(role => `s24-${role}-${suffix}`);
  const workspaceIds = [`s24-a-${suffix}`, `s24-b-${suffix}`];
  const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } });
  const spaces = await db.terraqoWorkspace.findMany({ where: { id: { in: workspaceIds } },
    select: { id: true, slug: true, ownerUserId: true, members: { select: { userId: true } } } });
  const entries = await db.terraqoWorklogEntry.findMany({ where: { authorId: { in: userIds } },
    select: { id: true, workspaceId: true, authorId: true, media: { select: { storageKey: true } } } });
  if (!users.length && !spaces.length && !entries.length) return;
  assert.equal(users.length, 3);
  assert.ok(users.every(user => user.email === user.id + "@example.invalid"));
  assert.equal(spaces.length, 2);
  for (const space of spaces) {
    assert.equal(space.slug, space.id);
    assert.equal(space.ownerUserId, space.id === workspaceIds[0] ? userIds[0] : userIds[2]);
    assert.ok(space.members.every(member => userIds.includes(member.userId)));
  }
  assert.equal(entries.length, 2);
  assert.ok(entries.every(entry => entry.authorId === userIds[0] && entry.workspaceId === workspaceIds[0]));
  assert.deepEqual(entries.flatMap(entry => entry.media.map(media => media.storageKey)).sort(), keys);
  assert.equal(await db.terraqoWorkspaceInvitation.count({ where: { workspaceId: { in: workspaceIds } } }), 0);
  await cleanupS24(db, { userIds, workspaceIds, worklogIds: entries.map(entry => entry.id) });
}
