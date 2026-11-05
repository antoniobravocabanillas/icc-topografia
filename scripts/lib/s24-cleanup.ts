import assert from "node:assert/strict";
import { Prisma, type PrismaClient } from "@prisma/client";
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
