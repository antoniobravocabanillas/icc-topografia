import "server-only";
import { createHash } from "node:crypto";
import { Prisma, type PrismaClient, type TerraqoNativeWorklogOperation } from "@prisma/client";
import { getBillingPlan } from "@/lib/terraqo/billing/catalog";
import { getDefaultModulesForTier } from "@/lib/workspace";
import type { WorkspacePortalToken } from "./workspace-portal-session";
import { NativeWorklogOperationError, type NativeWorklogOperationResult } from "./native-worklog-http";
import { isParsedNativeWorklogSnapshot, nativeWorklogFingerprint, type parseNativeWorklogPayload } from "./native-worklog-payload";
import { NativeWorklogBudget } from "./native-worklog-budget";

import { reserveNativeFirstWorklog } from "./native-worklog-first-award";
import { advanceNativeWorklogOwnerVersion } from "./native-worklog-owner-version";

const fail = (status: 401 | 403 | 404 | 409 | 503): never => { throw new NativeWorklogOperationError(status); };
type Parsed = Awaited<ReturnType<typeof parseNativeWorklogPayload>>;

async function lockAccess(tx: Prisma.TransactionClient, token: WorkspacePortalToken) {
  if (token.role !== "PROFESSIONAL" || !token.jti || !Number.isFinite(token.exp) || token.exp <= Date.now() / 1000) fail(401);
  const [profile] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM icc."TerraqoProfessionalProfile" WHERE "userId"=${token.sub} FOR UPDATE`);
  if (!profile) fail(404);
  const workspace = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM icc."TerraqoWorkspace" WHERE id=${token.workspaceId} AND slug=${token.workspaceSlug}
    AND active=true AND "deletedAt" IS NULL FOR SHARE`);
  const member = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM icc."TerraqoWorkspaceMember" WHERE "workspaceId"=${token.workspaceId}
    AND "userId"=${token.sub} AND active=true AND role='PROFESSIONAL' FOR SHARE`);
  const modules = await tx.$queryRaw<{ code: string }[]>(Prisma.sql`
    SELECT code FROM icc."TerraqoWorkspaceModule" WHERE "workspaceId"=${token.workspaceId}
    AND code IN ('PROFESSIONAL_NETWORK','LIVE_CV') AND active=true ORDER BY code FOR SHARE`);
  if (!workspace.length || !member.length || modules.length !== 2) fail(403);
  const [billing] = await tx.$queryRaw<{ planCode: string; paidThrough: Date | null }[]>(Prisma.sql`
    SELECT "planCode","paidThrough" FROM icc."TerraqoBillingAccount"
    WHERE "ownerKey"=${`workspace:${token.workspaceId}`} AND mode='live' FOR SHARE`);
  const stamp = new Date();
  const paidThrough = billing?.paidThrough && billing.paidThrough > stamp ? billing.paidThrough : null;
  if (billing) {
    const plan = getBillingPlan(paidThrough ? billing.planCode : "workspace-free");
    if (plan.audience !== "WORKSPACE" || !["PROFESSIONAL_NETWORK", "LIVE_CV"].every(code =>
      getDefaultModulesForTier(plan.tier).some(module => module === code))) fail(403);
  }
  const [grant] = await tx.$queryRaw<{ expires: Date }[]>(Prisma.sql`
    SELECT expires FROM icc."VerificationToken" WHERE identifier=${`portal-session:${token.workspaceId}:${token.sub}`}
    AND token=${createHash("sha256").update(token.jti!).digest("hex")} AND expires>${stamp} FOR SHARE`);
  if (!grant) fail(401);
  return { profileId: profile.id, grantExpires: grant.expires, paidThrough };
}
function finalAuthority(access: Awaited<ReturnType<typeof lockAccess>>, token: WorkspacePortalToken, budget: NativeWorklogBudget) {
  if (token.exp <= Date.now() / 1000 || access.grantExpires <= new Date()) fail(401);
  if (access.paidThrough && access.paidThrough <= new Date()) fail(409);
  budget.require();
}
async function result(tx: Prisma.TransactionClient, token: WorkspacePortalToken, profileId: string,
  receipt: TerraqoNativeWorklogOperation | null): Promise<NativeWorklogOperationResult> {
  if (!receipt) return { receipt: null, current: null };
  if (receipt.professionalProfileId !== profileId || receipt.actorId !== token.sub || receipt.workspaceId !== token.workspaceId) fail(503);
  if (!await tx.terraqoNativeWorklogAccounting.findUnique({ where: { operationId: receipt.id }, select: { operationId: true } })) fail(503);
  const [current] = receipt.worklogId ? await tx.$queryRaw<{ id: string; updatedAt: Date }[]>(Prisma.sql`
    SELECT id,"updatedAt" FROM icc."TerraqoWorklogEntry" WHERE id=${receipt.worklogId}
    AND "authorId"=${token.sub} AND "professionalProfileId"=${profileId} AND "workspaceId"=${token.workspaceId}
    AND "deletedAt" IS NULL FOR SHARE`) : [];
  return { receipt: { operationKey: receipt.operationKey, worklogId: receipt.targetWorklogId, createdAt: receipt.createdAt,
    originalProjectVersion: receipt.originalProjectVersion?.toISOString() ?? null },
    current: current ? { worklogId: current.id, version: current.updatedAt.toISOString() } : null };
}

/** Caller must roll back any failure. No legacy reputation, provider I/O or award is invoked. */
export async function createNativeWorklogInTransaction(tx: Prisma.TransactionClient, token: WorkspacePortalToken,
  parsed: Parsed, budget: NativeWorklogBudget): Promise<NativeWorklogOperationResult> {
  budget.require();
  const { payload } = parsed;
  if (!isParsedNativeWorklogSnapshot(parsed) || !Object.isFrozen(payload) || !/^[a-f0-9]{32}$/.test(payload.operationKey) ||
    nativeWorklogFingerprint(payload) !== parsed.fingerprint) fail(503);
  const access = await lockAccess(tx, token);
  const prior = await tx.terraqoNativeWorklogOperation.findUnique({ where: {
    actorId_workspaceId_operationKey: { actorId: token.sub, workspaceId: token.workspaceId, operationKey: payload.operationKey },
  } });
  if (prior) {
    if (prior.fingerprint !== parsed.fingerprint) fail(409);
    const historical = await result(tx, token, access.profileId, prior);
    finalAuthority(access, token, budget); return historical;
  }
  if (payload.projectId) {
    const [project] = await tx.$queryRaw<{ updatedAt: Date }[]>(Prisma.sql`
      SELECT "updatedAt" FROM icc."Project" WHERE id=${payload.projectId} AND "terraqoWorkspaceId"=${token.workspaceId}
      AND "deletedAt" IS NULL FOR SHARE`);
    if (!project) fail(403);
    if (project.updatedAt.toISOString() !== payload.projectVersion) fail(409);
    const experience = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM icc."TerraqoProfessionalExperience" WHERE "projectId"=${payload.projectId}
      AND "professionalProfileId"=${access.profileId} ORDER BY id FOR SHARE`);
    if (!experience.length) {
      const application = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT a.id FROM icc."TerraqoProjectApplication" a JOIN icc."TerraqoJobPost" j ON j.id=a."jobPostId"
        WHERE j."projectId"=${payload.projectId} AND j."workspaceId"=${token.workspaceId} AND j."deletedAt" IS NULL
        AND a."workspaceId"=${token.workspaceId} AND a."professionalProfileId"=${access.profileId}
        AND a.status='ACCEPTED' ORDER BY a.id FOR SHARE OF a,j`);
      if (!application.length) fail(403);
    }
  }
  const createdAt = new Date();
  const id = createHash("sha256").update(JSON.stringify(["native-worklog-operation-v1", token.sub, token.workspaceId, payload.operationKey])).digest("hex");
  await advanceNativeWorklogOwnerVersion(tx, access.profileId, token.sub, createdAt);
  await reserveNativeFirstWorklog(tx, { actorId: token.sub, operationId: id, createdAt });
  const entry = await tx.terraqoWorklogEntry.create({ data: {
    authorId: token.sub, professionalProfileId: access.profileId, workspaceId: token.workspaceId,
    projectId: payload.projectId || null, title: payload.title, summary: payload.summary, outcome: payload.outcome || null,
    type: payload.type, visibility: "PRIVATE", evidenceUrls: [], skills: [], contentFingerprint: parsed.fingerprint,
    createdAt, updatedAt: createdAt, occurredAt: createdAt,
  } });
  const receipt = await tx.terraqoNativeWorklogOperation.create({ data: {
    id, actorId: token.sub, workspaceId: token.workspaceId, professionalProfileId: access.profileId,
    operationKey: payload.operationKey, fingerprint: parsed.fingerprint, targetWorklogId: entry.id, worklogId: entry.id,
    originalProjectId: payload.projectId || null, originalProjectVersion: payload.projectVersion ? new Date(payload.projectVersion) : null,
    createdAt, resultVersion: createdAt,
  } });
  // Missing accounting or audit aborts the entire creation; PENDING is not an award.
  await tx.terraqoNativeWorklogAccounting.create({ data: { operationId: id, state: "PENDING", createdAt, nextAttemptAt: createdAt } });
  await tx.activityLog.create({ data: { actorId: token.sub, terraqoWorkspaceId: token.workspaceId,
    action: "CREATED", entityType: "NativeWorklog", entityId: entry.id, title: "Bitácora profesional creada",
    metadata: { source: "native-portal", operationId: id } } });
  const confirmed = await result(tx, token, access.profileId, receipt);
  finalAuthority(access, token, budget); return confirmed;
}

export async function readNativeWorklogInTransaction(tx: Prisma.TransactionClient, token: WorkspacePortalToken,
  operationKey: string, budget: NativeWorklogBudget): Promise<NativeWorklogOperationResult> {
  budget.require(); if (!/^[a-f0-9]{32}$/.test(operationKey)) fail(503);
  const access = await lockAccess(tx, token);
  const receipt = await tx.terraqoNativeWorklogOperation.findUnique({ where: {
    actorId_workspaceId_operationKey: { actorId: token.sub, workspaceId: token.workspaceId, operationKey },
  } });
  const observation = await result(tx, token, access.profileId, receipt);
  finalAuthority(access, token, budget); return observation;
}

export function createNativeWorklog(database: Pick<PrismaClient, "$transaction">, token: WorkspacePortalToken,
  parsed: Parsed, budget: NativeWorklogBudget) {
  budget.require(8000);
  return database.$transaction(tx => createNativeWorklogInTransaction(tx, token, parsed, budget), { maxWait: 1000, timeout: 7000 });
}
export function readNativeWorklog(database: Pick<PrismaClient, "$transaction">, token: WorkspacePortalToken,
  operationKey: string, budget: NativeWorklogBudget) {
  budget.require(8000);
  return database.$transaction(tx => readNativeWorklogInTransaction(tx, token, operationKey, budget), { maxWait: 1000, timeout: 7000 });
}
