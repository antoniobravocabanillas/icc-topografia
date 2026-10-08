import "server-only";
import { Prisma } from "@prisma/client";
import type { WorkspacePortalToken } from "./workspace-portal-session";
import { NativeWorklogOperationError } from "./native-worklog-http";
import { NativeWorklogBudget } from "./native-worklog-budget";
import { lockNativeWorklogAccess, requireFinalNativeWorklogAuthority } from "./native-worklog-operation";
import { applyNativeWorklogAccountingPhasesInTransaction } from "./native-worklog-accounting-phases";

/** Internal live-authority gate, not a background worker or durable creation proof.
 * Token must come from the authenticated server boundary, never an outbox/request DTO.
 * Expired/revoked authority aborts without discarding earned points. Caller MUST
 * roll back this entire transaction on any failure, including the final gate.
 * No grant is emitted/extended, no expired token is reconstructed, no APPLIED write.
 */
export async function applyAuthorizedNativeAccountingInTransaction(tx: Prisma.TransactionClient,
  token: WorkspacePortalToken, operationId: string, budget: NativeWorklogBudget,
  legacyContributionIds: readonly string[] = []) {
  budget.require();
  if (!/^[a-f0-9]{64}$/.test(operationId)) throw new NativeWorklogOperationError(503);
  const access = await lockNativeWorklogAccess(tx, token);
  await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoNativeWorklogOperation" WHERE id=${operationId} FOR SHARE`);
  const receipt = await tx.terraqoNativeWorklogOperation.findUnique({ where: { id: operationId } });
  if (!receipt || receipt.actorId !== token.sub || receipt.workspaceId !== token.workspaceId ||
      receipt.professionalProfileId !== access.profileId) throw new NativeWorklogOperationError(404);
  const result = await applyNativeWorklogAccountingPhasesInTransaction(tx, operationId, legacyContributionIds);
  requireFinalNativeWorklogAuthority(access, token, budget);
  return result;
}
