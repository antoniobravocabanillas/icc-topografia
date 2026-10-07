import "server-only";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "../prisma";
import { parseNativeEducationEvidence } from "./native-education-evidence-payload";
import { reserveEducationEvidenceAttempt } from "./education-evidence-reservation";
import { commitEducationEvidenceAttempt } from "./education-evidence-commit";
import { markEducationEvidenceCleanupInTransaction, recoverEducationEvidenceAttempt } from "./education-evidence-cleanup";
import { getWorklogEvidenceStore } from "./media";
import type { WorkspacePortalToken } from "./workspace-portal-session";

type Database = Pick<PrismaClient, "$transaction" | "terraqoEducationEvidenceAttempt">;
type Store = { set(key: string, data: ArrayBuffer): Promise<unknown>; delete(key: string): Promise<unknown> };

/** Internal service only, not exposed through a route. The only substituted
 * ports are database/storage; owner authority is always checked in the locked
 * transaction services. HTTP adapters must never derive ports from a request. */
export async function uploadEducationEvidence(request: Request, token: WorkspacePortalToken, educationId: string,
  database: Database = prisma, providedStore?: Store) {
  const payload = await parseNativeEducationEvidence(request);
  const reservation = await reserveEducationEvidenceAttempt(database, token, educationId, {
    size: payload.file.size, fingerprint: payload.file.fingerprint, version: payload.version, operationKey: payload.operationKey,
  });
  if (reservation.kind === "receipt") return reservation; // No quota/store/recreation on replay.
  const attempt = reservation.attempt;
  let store: Store | undefined;
  try {
    store = providedStore ?? getWorklogEvidenceStore();
    await store.set(attempt.storageKey, payload.bytes);
    const result = await commitEducationEvidenceAttempt(database, token, educationId, attempt.id, payload.file);
    if (result.cleanupAttemptId) await recoverEducationEvidenceAttempt(database, result.cleanupAttemptId, store);
    return result;
  } catch (error) {
    // A SQL reply may be lost after commit. Recovery checks the durable fence
    // and the exact live reference; never delete directly on an exception.
    // A failed/timed-out physical write may finish later: CLEANED tombstones
    // remain under durable watch, even if this worker never gets a callback.
    if (store) await recoverEducationEvidenceAttempt(database, attempt.id, store);
    else {
      // Even adapter initialization can fail after reservation. Persist a
      // pending fence without inventing successful deletion/refund. If this
      // SQL acknowledgement is also lost, the RESERVED row remains sweepable.
      await database.$transaction(tx => markEducationEvidenceCleanupInTransaction(tx, attempt.id, token.sub),
        { maxWait: 5000, timeout: 15000 }).catch(() => undefined);
    }
    throw error;
  }
}
