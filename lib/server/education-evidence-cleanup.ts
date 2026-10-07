import "server-only";
import { Prisma, type PrismaClient } from "@prisma/client";
import { educationPersonalStorageFloor } from "./education-evidence-reservation";
import { cleanupRetrySchedule } from "./private-upload-retry";

type Store = { delete(key: string): Promise<unknown> };
type Result = "completed" | "retained" | "retry" | "quarantined" | "skipped" | "pending";
type Database = Pick<PrismaClient, "$transaction" | "terraqoEducationEvidenceAttempt">;
// Revisit interval, NOT a settlement deadline. Tombstones are never purged:
// the storage adapter cannot prove that an interrupted write has stopped.
const WATCH_INTERVAL_MS = 6 * 60 * 60_000;

async function lockAttempt(tx: Prisma.TransactionClient, id: string) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) return null;
  const initial = await tx.terraqoEducationEvidenceAttempt.findUnique({ where: { id }, select: {
    educationId: true, education: { select: { professionalProfileId: true, professionalProfile: { select: { userId: true } } } },
  } });
  if (!initial) return null;
  await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoProfessionalProfile"
    WHERE id=${initial.education.professionalProfileId} FOR UPDATE`);
  await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoProfessionalEducation"
    WHERE id=${initial.educationId} AND "professionalProfileId"=${initial.education.professionalProfileId} FOR UPDATE`);
  await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoEducationEvidenceAttempt" WHERE id=${id} FOR UPDATE`);
  const row = await tx.terraqoEducationEvidenceAttempt.findUnique({ where: { id }, include: {
    education: { select: { professionalProfileId: true, professionalProfile: { select: { userId: true } } } },
  } });
  if (!row || row.educationId !== initial.educationId || row.education.professionalProfileId !== initial.education.professionalProfileId) return null;
  return row;
}

/** Internal compensation only. No caller-supplied key, size or quota units.
 * A completed attempt may be rearmed after a late store write, with zero units. */
export async function markEducationEvidenceCleanupInTransaction(tx: Prisma.TransactionClient, id: string, actorId: string,
  lateWrite = false) {
  const row = await lockAttempt(tx, id);
  if (!row || row.actorId !== actorId) return "skipped" as const;
  if (row.education.professionalProfile.userId !== actorId) {
    await tx.terraqoEducationEvidenceAttempt.update({ where: { id }, data: { state: "QUARANTINED", nextAttemptAt: null } });
    return "quarantined" as const;
  }
  if (row.state === "QUARANTINED") return "quarantined" as const;
  if (await tx.terraqoEducationEvidence.count({ where: { storageKey: row.storageKey } })) return "retained" as const;
  if (row.state === "CLEANED" && !lateWrite) return "skipped" as const;
  if (row.state === "CLEANUP_PENDING" && !lateWrite) return "pending" as const;
  await tx.terraqoEducationEvidenceAttempt.update({ where: { id }, data: {
    state: "CLEANUP_PENDING", reservedUnits: row.state === "CLEANED" ? 0 : row.reservedUnits, nextAttemptAt: null,
  } });
  return "pending" as const;
}

/** Internal durable sweep. Caller commits this fence BEFORE invoking delete.
 * Re-read under the owner locks, even if a dispatch selected a stale row. */
export async function rearmDueEducationEvidenceWatchInTransaction(tx: Prisma.TransactionClient, id: string, now = new Date()) {
  const row = await lockAttempt(tx, id);
  if (!row || row.state !== "CLEANED") return "skipped" as const;
  if (row.nextAttemptAt && row.nextAttemptAt > now) return "skipped" as const;
  if (row.reservedUnits !== 0 || row.actorId !== row.education.professionalProfile.userId) {
    await tx.terraqoEducationEvidenceAttempt.update({ where: { id }, data: { state: "QUARANTINED", nextAttemptAt: null } });
    return "quarantined" as const;
  }
  if (await tx.terraqoEducationEvidence.count({ where: { storageKey: row.storageKey } })) {
    // Keep the anomalous tombstone under watch without monopolizing each batch.
    await tx.terraqoEducationEvidenceAttempt.update({ where: { id }, data: {
      nextAttemptAt: new Date(now.getTime() + WATCH_INTERVAL_MS),
    } });
    return "retained" as const;
  }
  await tx.terraqoEducationEvidenceAttempt.update({ where: { id }, data: { state: "CLEANUP_PENDING", nextAttemptAt: null } });
  return "pending" as const;
}

export async function recoverEducationEvidenceInTransaction(tx: Prisma.TransactionClient, id: string, store: Store,
  now = new Date()): Promise<Result> {
  const row = await lockAttempt(tx, id);
  if (!row || row.state === "CLEANED") return "skipped";
  if (row.state === "QUARANTINED") return "quarantined";
  const expectedUnits = Math.ceil(row.size / 1_000_000);
  const keyParts = /^education-evidence\/([A-Za-z0-9_-]{1,100})\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.exec(row.storageKey);
  const valid = /^[A-Za-z0-9_-]{1,100}$/.test(row.educationId) && row.actorId === row.education.professionalProfile.userId &&
    Number.isSafeInteger(row.size) && row.size >= 1 && row.size <= 4 * 1024 * 1024 && keyParts?.[1] === row.educationId &&
    Number.isSafeInteger(row.reservedUnits) && [0, expectedUnits].includes(row.reservedUnits);
  if (!valid) {
    await tx.terraqoEducationEvidenceAttempt.update({ where: { id }, data: { state: "QUARANTINED", nextAttemptAt: null } });
    return "quarantined";
  }
  // Recovery remains possible after logout/revocation. Immutable parent FKs
  // preserve ownership; reference protection uses the same owner lock as commit.
  if (await tx.terraqoEducationEvidence.count({ where: { storageKey: row.storageKey } })) return "retained";
  // A pending fence MUST have committed before an external delete starts.
  // Transaction timeout may release SQL locks while the store promise continues;
  // rollback must never restore RESERVED and allow a writer to commit this key.
  if (row.state !== "CLEANUP_PENDING") return "pending";
  if (row.nextAttemptAt && row.nextAttemptAt > now) return "skipped";
  const fullFloor = await educationPersonalStorageFloor(tx, row.actorId);
  const otherFloor = fullFloor - row.reservedUnits;
  const bucket = { ownerKey: `user:${row.actorId}`, period: "retained", metric: "storage-mb" };
  if (row.reservedUnits > 0) {
    const buckets = await tx.$queryRaw<{ used: number }[]>(Prisma.sql`SELECT used FROM icc."TerraqoUsageBucket"
      WHERE "ownerKey"=${bucket.ownerKey} AND period='retained' AND metric='storage-mb' FOR UPDATE`);
    if (!buckets[0] || buckets[0].used < otherFloor + row.reservedUnits) {
      await tx.terraqoEducationEvidenceAttempt.update({ where: { id }, data: { state: "QUARANTINED", nextAttemptAt: null } });
      return "quarantined";
    }
  }
  try { await store.delete(row.storageKey); } catch {
    const retry = cleanupRetrySchedule(row.attempts, now);
    const quarantined = retry.storageCleanupAttempts >= 8;
    await tx.terraqoEducationEvidenceAttempt.update({ where: { id }, data: {
      state: quarantined ? "QUARANTINED" : "CLEANUP_PENDING", attempts: retry.storageCleanupAttempts,
      nextAttemptAt: quarantined ? null : new Date(retry.storageCleanupNextAttemptAt),
    } });
    return quarantined ? "quarantined" : "retry";
  }
  if (row.reservedUnits > 0) {
    const refunded = await tx.terraqoUsageBucket.updateMany({ where: { ...bucket, used: { gte: otherFloor + row.reservedUnits } },
      data: { used: { decrement: row.reservedUnits } } });
    if (refunded.count !== 1) throw Error("EDUCATION_QUOTA_FENCE_CHANGED");
  }
  // If the SQL reply is lost, replay reads CLEANED and never refunds again.
  await tx.terraqoEducationEvidenceAttempt.update({ where: { id }, data: {
    state: "CLEANED", reservedUnits: 0, attempts: 0, nextAttemptAt: new Date(now.getTime() + WATCH_INTERVAL_MS),
  } });
  return "completed";
}

export async function recoverEducationEvidenceAttempt(database: Database, id: string, store: Store): Promise<Result> {
  try {
    const fence = await database.$transaction(async tx => {
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) return "skipped" as const;
      const row = await tx.terraqoEducationEvidenceAttempt.findUnique({ where: { id }, select: { actorId: true, state: true } });
      if (!row) return "skipped" as const;
      if (row.state === "CLEANED") return rearmDueEducationEvidenceWatchInTransaction(tx, id);
      // Existing retry timestamps are preserved by skipping redundant rearm.
      if (row.state === "CLEANUP_PENDING") return "pending" as const;
      return markEducationEvidenceCleanupInTransaction(tx, id, row.actorId);
    }, { maxWait: 5000, timeout: 15000 });
    if (fence !== "pending") return fence;
    return await database.$transaction(tx => recoverEducationEvidenceInTransaction(tx, id, store), { maxWait: 5000, timeout: 15000 });
  } catch {
    // A failed/uncertain SQL transaction cannot reopen CLEANED or refund twice.
    // Its durable row is re-read by the next dispatch, including after deletion.
    return "retry";
  }
}

// Prepared dispatcher query only: not connected to an HTTP route or cron while
// tables/recovery integration remain unapplied. Never auto-retry quarantine.
export async function dueEducationEvidenceAttempts(database: Pick<Prisma.TransactionClient, "terraqoEducationEvidenceAttempt">, now = new Date()) {
  const active = await database.terraqoEducationEvidenceAttempt.findMany({ where: { OR: [
    { state: { in: ["PREPARED", "RESERVED"] }, updatedAt: { lte: new Date(now.getTime() - 5 * 60_000) } },
    { state: "CLEANUP_PENDING", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
  ] }, select: { id: true }, orderBy: [{ nextAttemptAt: { sort: "asc", nulls: "first" } }, { updatedAt: "asc" }, { id: "asc" }], take: 5 });
  if (active.length === 5) return active;
  const watches = await database.terraqoEducationEvidenceAttempt.findMany({ where: {
    state: "CLEANED", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
  }, select: { id: true }, orderBy: [{ nextAttemptAt: { sort: "asc", nulls: "first" } }, { updatedAt: "asc" }, { id: "asc" }], take: 5 - active.length });
  return [...active, ...watches];
}

/** Internal bounded runner only. No HTTP entry, retry loop or quarantine retry.
 * Competing dispatches are safe because recovery re-reads under owner locks.
 * Counts expose no identifiers, keys, names or private file metadata. */
export async function dispatchEducationEvidenceCleanup(database: Database, store: Store) {
  const selected = await dueEducationEvidenceAttempts(database);
  const counts: Record<Result, number> = { completed: 0, retained: 0, retry: 0, quarantined: 0, skipped: 0, pending: 0 };
  for (const row of selected) counts[await recoverEducationEvidenceAttempt(database, row.id, store)]++;
  return { selected: selected.length, counts };
}
