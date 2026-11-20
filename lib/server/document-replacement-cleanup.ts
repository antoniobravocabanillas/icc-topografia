import "server-only";
import { Prisma, type PrismaClient } from "@prisma/client";
import { documentReplacementStorageFloor, fenceDocumentReplacementCleanupInTransaction, lockDocumentReplacementAttempt } from "./document-replacement-attempt";

type Store = { delete(key: string): Promise<unknown> };
const watchInterval = 6 * 60 * 60 * 1000;
const transactionOptions = { maxWait: 5000, timeout: 15000 };

/** Internal recovery. The pending fence must be committed in a prior transaction.
 * Store timeouts do not prove cancellation: retain charge and durable intent.
 */
export async function recoverDocumentReplacementInTransaction(tx: Prisma.TransactionClient, actorId: string, id: string, store: Store, now = new Date()) {
  const row = await lockDocumentReplacementAttempt(tx, actorId, id);
  if (row.state !== "CLEANUP_PENDING") return "skipped" as const;
  if (row.nextAttemptAt && row.nextAttemptAt > now) return "skipped" as const;
  const fence = await tx.$queryRaw<{ committed: boolean }[]>(Prisma.sql`SELECT xmin::text <> pg_current_xact_id()::text AS committed FROM icc."TerraqoDocumentReplacementAttempt" WHERE id=${id}`);
  if (!fence[0]?.committed) throw Error("DOCUMENT_CLEANUP_FENCE_NOT_COMMITTED");
  if (!row.storageKey.startsWith(`professional-documents/${row.professionalProfileId}/`) || row.storageKey.includes("..") || row.storageKey.includes("\\") ||
      !Number.isSafeInteger(row.reservedUnits) || ![0, Math.ceil(row.size / 1000000)].includes(row.reservedUnits)) return "blocked" as const;
  const live = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM icc."TerraqoProfessionalDocument" WHERE "storageKey"=${row.storageKey}`);
  if (live.length) return "retained" as const;
  const floor = await documentReplacementStorageFloor(tx, actorId, row.professionalProfileId);
  const buckets = await tx.$queryRaw<{ used: number }[]>(Prisma.sql`SELECT used FROM icc."TerraqoUsageBucket" WHERE "ownerKey"=${`user:${actorId}`} AND period='retained' AND metric='storage-mb' FOR UPDATE`);
  if (row.reservedUnits && (!buckets[0] || buckets[0].used < floor)) return "blocked" as const;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([store.delete(row.storageKey), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(Error("DOCUMENT_DELETE_TIMEOUT")), 5000);
    })]);
  } catch {
    const count = Math.min(1000, row.cleanupAttempts + 1);
    const next = new Date(now.getTime() + Math.min(watchInterval, 60000 * 2 ** Math.min(count, 9)));
    await tx.$executeRaw(Prisma.sql`UPDATE icc."TerraqoDocumentReplacementAttempt" SET "cleanupAttempts"=${count},"nextAttemptAt"=${next} WHERE id=${id}`);
    return "retry" as const;
  } finally { if (timer) clearTimeout(timer); }
  if (row.reservedUnits) {
    const refunded = await tx.$executeRaw(Prisma.sql`UPDATE icc."TerraqoUsageBucket" SET used=used-${row.reservedUnits}
      WHERE "ownerKey"=${`user:${actorId}`} AND period='retained' AND metric='storage-mb' AND used>=${floor}`);
    if (refunded !== 1) throw Error("DOCUMENT_QUOTA_FENCE_CHANGED");
  }
  // Keep a zero-charge tombstone: a dead producer's object write can arrive late.
  await tx.$executeRaw(Prisma.sql`UPDATE icc."TerraqoDocumentReplacementAttempt" SET state='CLEANED',"reservedUnits"=0,
    "cleanupAttempts"=0,"nextAttemptAt"=${new Date(now.getTime() + watchInterval)} WHERE id=${id}`);
  return "completed" as const;
}

export async function recoverDocumentReplacementAttempt(database: Pick<PrismaClient, "$transaction">, actorId: string, id: string, store: Store, now = new Date()) {
  try {
    const fence = await database.$transaction(tx => fenceDocumentReplacementCleanupInTransaction(tx, actorId, id, now), transactionOptions);
    if (fence !== "pending") return fence;
    return await database.$transaction(tx => recoverDocumentReplacementInTransaction(tx, actorId, id, store, now), transactionOptions);
  } catch {
    // Lost SQL acknowledgements are resolved from durable state on retry.
    return "retry" as const;
  }
}
