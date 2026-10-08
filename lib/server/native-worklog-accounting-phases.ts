import "server-only";
import { Prisma } from "@prisma/client";
import { NativeWorklogOperationError } from "./native-worklog-http";
import { requireNativeWorklogDecision } from "./native-worklog-decision";
import { applyNativeWorklogBaseInTransaction } from "./native-worklog-base-accounting";
import { applyNativeFirstWorklogInTransaction } from "./native-worklog-first-award";
import { releaseNativeWorklogBaseInTransaction } from "./native-worklog-base-release";
import { reconcileNativeLegacyReleaseInTransaction } from "./native-worklog-legacy-release";

function fail(): never { throw new NativeWorklogOperationError(503); }

/** Internal directed coordination, never a worker/auth bypass or APPLIED proof.
 * The caller owns one transaction and MUST roll it all back on any exception.
 * Legacy IDs are an explicit bounded internal selection, never request parameters or a global scan.
 * Deferred outcomes preserve earned balances; they cannot authorize outbox completion.
 */
export async function applyNativeWorklogAccountingPhasesInTransaction(tx: Prisma.TransactionClient,
  operationId: string, legacyContributionIds: readonly string[] = []) {
  if (!/^[a-f0-9]{64}$/.test(operationId) || legacyContributionIds.length > 5 ||
      new Set(legacyContributionIds).size !== legacyContributionIds.length ||
      legacyContributionIds.some(id => !/^[a-z0-9]{25}$/.test(id))) fail();
  const identity = await tx.terraqoNativeWorklogOperation.findUnique({ where: { id: operationId } });
  if (!identity) fail();
  const [owner] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM icc."TerraqoProfessionalProfile"
    WHERE id=${identity.professionalProfileId} AND "userId"=${identity.actorId} FOR UPDATE`);
  if (!owner) fail();
  await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoNativeWorklogOperation" WHERE id=${operationId} FOR UPDATE`);
  const receipt = await tx.terraqoNativeWorklogOperation.findUniqueOrThrow({ where: { id: operationId } });
  if (receipt.actorId !== identity.actorId || receipt.professionalProfileId !== owner.id) fail();
  const [outbox] = await tx.$queryRaw<{ state: string }[]>(Prisma.sql`SELECT state FROM icc."TerraqoNativeWorklogAccounting"
    WHERE "operationId"=${operationId} FOR UPDATE`);
  if (!outbox) fail();
  if (outbox.state !== "PENDING") return { outcome: "deferred" } as const;
  await tx.$queryRaw(Prisma.sql`SELECT "operationId" FROM icc."TerraqoNativeWorklogDecision"
    WHERE "operationId"=${operationId} FOR SHARE`);
  await requireNativeWorklogDecision(tx, receipt);
  if (!receipt.worklogId) return { outcome: "deferred" } as const;
  await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoWorklogEntry" WHERE id=${receipt.worklogId} FOR UPDATE`);
  const entry = await tx.terraqoWorklogEntry.findUnique({ where: { id: receipt.worklogId } });
  if (!entry || entry.deletedAt) return { outcome: "deferred" } as const;
  if (entry.id !== receipt.targetWorklogId || entry.authorId !== receipt.actorId ||
      entry.professionalProfileId !== owner.id || entry.workspaceId !== receipt.workspaceId) fail();
  await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoBuilderContribution"
    WHERE "sourceKey"=${`worklog:${receipt.targetWorklogId}`} FOR UPDATE`);
  const prior = await tx.terraqoBuilderContribution.findUnique({ where: { sourceKey: `worklog:${receipt.targetWorklogId}` } });
  // Base deliberately rejects released contributions. Release validates their exact saved
  // binding/ledger/floor instead; replay must never recreate pending or trust increments.
  const base = prior?.releasedAt ? "released-history" as const : await applyNativeWorklogBaseInTransaction(tx, operationId);
  if (base === "deferred") return { outcome: "deferred" } as const;
  const first = await applyNativeFirstWorklogInTransaction(tx, operationId);
  const release = await releaseNativeWorklogBaseInTransaction(tx, operationId);
  const legacy: Awaited<ReturnType<typeof reconcileNativeLegacyReleaseInTransaction>>[] = [];
  for (const id of [...legacyContributionIds].sort()) legacy.push(await reconcileNativeLegacyReleaseInTransaction(tx, operationId, id));
  // Reporting phase outcomes is not evidence that all legacy/accounting work has been inspected.
  return { outcome: "pending", base, first, release, legacy } as const;
}
