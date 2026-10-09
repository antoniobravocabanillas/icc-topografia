import "server-only";
import { Prisma } from "@prisma/client";
import { NativeWorklogOperationError } from "./native-worklog-http";
import { NativeWorklogBudget } from "./native-worklog-budget";
import { requireNativeCreationAuthority } from "./native-worklog-creation-authority";
import { requireNativeWorklogDecision } from "./native-worklog-decision";

function fail(): never { throw new NativeWorklogOperationError(503); }
type Accounting = { state: string; attempts: number; nextAttemptAt: Date; completedAt: Date | null };
const validDate = (value: Date) => value instanceof Date && Number.isFinite(value.getTime());

/** Internal directed eligibility inspection, not a worker or permission to credit.
 * Historical creation authority is evaluated at creation, independently of current
 * session expiry/revocation. Never reconstruct a token or renew a grant to settle
 * earned points. The caller must still inspect all accounting/legacy phases in the
 * same transaction; this read cannot authorize APPLIED or owner-facing access.
 * Locks are retained by the caller transaction. No balances or outbox fields change.
 */
export async function inspectNativeWorkerEligibilityInTransaction(tx: Prisma.TransactionClient,
  operationId: string, budget: NativeWorklogBudget, clock: () => Date = () => new Date()) {
  budget.require();
  if (!/^[a-f0-9]{64}$/.test(operationId)) fail();
  const identity = await tx.terraqoNativeWorklogOperation.findUnique({ where: { id: operationId } });
  if (!identity) fail();
  const [owner] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM icc."TerraqoProfessionalProfile"
    WHERE id=${identity.professionalProfileId} AND "userId"=${identity.actorId} FOR UPDATE`);
  if (!owner) fail();
  await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoNativeWorklogOperation" WHERE id=${operationId} FOR SHARE`);
  const receipt = await tx.terraqoNativeWorklogOperation.findUnique({ where: { id: operationId } });
  if (!receipt || receipt.actorId !== identity.actorId || receipt.professionalProfileId !== owner.id ||
      receipt.workspaceId !== identity.workspaceId || receipt.fingerprint !== identity.fingerprint ||
      receipt.createdAt.getTime() !== identity.createdAt.getTime()) fail();
  const [outbox] = await tx.$queryRaw<Accounting[]>(Prisma.sql`SELECT state, attempts, "nextAttemptAt", "completedAt"
    FROM icc."TerraqoNativeWorklogAccounting" WHERE "operationId"=${operationId} FOR UPDATE`);
  const now = clock(); // Time is sampled after locks, never taken from request metadata.
  if (!validDate(now) || !validDate(receipt.createdAt) || receipt.createdAt > now || !outbox ||
      !["PENDING", "APPLIED", "QUARANTINED"].includes(outbox.state) ||
      !Number.isSafeInteger(outbox.attempts) || outbox.attempts < 0 || outbox.attempts > 2147483647 ||
      !validDate(outbox.nextAttemptAt) || (outbox.state === "APPLIED") !== (outbox.completedAt !== null) ||
      (outbox.completedAt !== null && (!validDate(outbox.completedAt) || outbox.completedAt > now ||
        outbox.completedAt < receipt.createdAt))) fail();
  await requireNativeCreationAuthority(tx, receipt);
  await tx.$queryRaw(Prisma.sql`SELECT "operationId" FROM icc."TerraqoNativeWorklogDecision"
    WHERE "operationId"=${operationId} FOR SHARE`);
  await requireNativeWorklogDecision(tx, receipt);
  budget.require();
  const result = (disposition: "TERMINAL" | "REVIEW_REQUIRED" | "NOT_DUE" | "TARGET_MISSING" | "INSPECT_PHASES") =>
    Object.freeze({ disposition, completionAuthorized: false as const, ownerAccessAuthorized: false as const });
  if (outbox.state !== "PENDING") return result("TERMINAL");
  if (outbox.attempts >= 8) return result("REVIEW_REQUIRED");
  if (outbox.nextAttemptAt > now) return result("NOT_DUE");
  if (!receipt.worklogId) return result("TARGET_MISSING");
  // Entry state, floors, ledger and exhaustive legacy recovery remain phase responsibilities.
  return result("INSPECT_PHASES");
}
