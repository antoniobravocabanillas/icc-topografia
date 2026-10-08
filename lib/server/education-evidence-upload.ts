import "server-only";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "../prisma";
import { parseNativeEducationEvidence } from "./native-education-evidence-payload";
import { reserveEducationEvidenceInTransaction } from "./education-evidence-reservation";
import { commitEducationEvidenceInTransaction } from "./education-evidence-commit";
import { markEducationEvidenceCleanupInTransaction } from "./education-evidence-cleanup";
import { EducationUploadBudget, EDUCATION_UPLOAD_TRANSACTION } from "./education-upload-budget";
import { getWorklogEvidenceStore } from "./media";
import type { WorkspacePortalToken } from "./workspace-portal-session";

type Database = Pick<PrismaClient, "$transaction" | "terraqoEducationEvidenceAttempt">;
type Store = { set(key: string, data: ArrayBuffer): Promise<unknown>; delete(key: string): Promise<unknown> };

/** Internal service only, not exposed through a route. The only substituted
 * ports are database/storage; owner authority is always checked in the locked
 * transaction services. HTTP adapters must never derive ports from a request. */
export async function uploadEducationEvidence(request: Request, token: WorkspacePortalToken, educationId: string,
  database: Database = prisma, providedStore?: Store, budget = new EducationUploadBudget()) {
  budget.beforeParse();
  const payload = await parseNativeEducationEvidence(request);
  budget.beforeReserve();
  // Never race a SQL transaction against an external timer: its callback could
  // otherwise commit after the caller has reported timeout. Check within the
  // callback so an exhausted allowance rolls back before SQL confirmation.
  const reservation = await database.$transaction(async tx => {
    budget.beforeReserve();
    const value = await reserveEducationEvidenceInTransaction(tx, token, educationId, {
      size: payload.file.size, fingerprint: payload.file.fingerprint, version: payload.version, operationKey: payload.operationKey,
    });
    budget.afterTransaction(); return value;
  }, EDUCATION_UPLOAD_TRANSACTION);
  if (reservation.kind === "receipt") return reservation; // No quota/store/recreation on replay.
  const attempt = reservation.attempt;
  const fence = async (id: string) => {
    if (!budget.canFence()) return; // RESERVED remains durable and sweepable.
    await database.$transaction(async tx => {
      budget.afterTransaction();
      await markEducationEvidenceCleanupInTransaction(tx, id, token.sub);
      budget.afterTransaction();
    }, EDUCATION_UPLOAD_TRANSACTION).catch(() => undefined);
  };
  try {
    const store = providedStore ?? getWorklogEvidenceStore();
    await budget.store(() => store.set(attempt.storageKey, payload.bytes));
    budget.beforeCommit();
    const result = await database.$transaction(async tx => {
      budget.beforeCommit();
      const value = await commitEducationEvidenceInTransaction(tx, token, educationId, attempt.id, payload.file);
      budget.afterTransaction(); return value;
    }, EDUCATION_UPLOAD_TRANSACTION);
    if (result.cleanupAttemptId) await fence(result.cleanupAttemptId);
    return result;
  } catch (error) {
    // A SQL reply may be lost after commit. Recovery checks the durable fence
    // and the exact live reference; never delete directly on an exception.
    // A failed/timed-out physical write may finish later: CLEANED tombstones
    // remain under durable watch, even if this worker never gets a callback.
    // No physical compensation in this request. The committed fence keeps the
    // charge until operational recovery proves deletion; a live SQL reference
    // wins even when the commit acknowledgement was lost. Never race this SQL.
    await fence(attempt.id);
    throw error;
  }
}
