import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { dueEducationEvidenceAttempts, markEducationEvidenceCleanupInTransaction, recoverEducationEvidenceInTransaction, rearmDueEducationEvidenceWatchInTransaction } from "../lib/server/education-evidence-cleanup";

const prisma = new PrismaClient({ log: [] });
const tables = ["TerraqoEducationEvidence", "TerraqoEducationEvidenceOperation", "TerraqoEducationEvidenceAttempt"];
const rollback = new Error("OWN_CLEANUP_TEST_ROLLBACK");
let phase = "scope";
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
  assert.equal(process.env.TEST_PORTAL_URL, "https://api.terraqoglobal.com");
  const workspace = await prisma.terraqoWorkspace.findFirstOrThrow({ where: { slug: "icc-topografia", active: true,
    companies: { some: { document: "20616116313", deletedAt: null } } }, select: { id: true } });
  const initialPresence = new Map<string, string | null>();
  for (const table of tables) initialPresence.set(table, (await prisma.$queryRaw<{ present: string | null }[]>`
    SELECT to_regclass(${`icc."${table}"`})::text AS present`)[0].present);
  assert.ok([...initialPresence.values()].every(value => value === null) || [...initialPresence.values()].every(value => value !== null));
  const sql = await readFile(new URL("../prisma/migrations/20261007195600_education_evidence_prerequisites/migration.sql", import.meta.url), "utf8");
  const email = `education-cleanup-${randomUUID()}@example.test`;
  let verified = false;
  try {
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      for (const statement of sql.split(";").map(value => value.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
      const user = await tx.user.create({ data: { email, name: "Fixture propio recuperación formación", role: "CUSTOMER",
        terraqoMemberships: { create: { workspaceId: workspace.id, role: "PROFESSIONAL", active: true } },
        terraqoProfessionalProfile: { create: { education: { create: { institution: "Institución propia", degree: "Formación propia", visibility: "PRIVATE" } } } },
      }, select: { id: true, terraqoProfessionalProfile: { select: { id: true, education: { select: { id: true, updatedAt: true } } } } } });
      const profile = user.terraqoProfessionalProfile!, education = profile.education[0];
      const now = new Date(), old = new Date(now.getTime() - 10 * 60_000);
      const key = () => `education-evidence/${education.id}/${randomUUID()}`;
      const attempt = (state = "RESERVED", reservedUnits = 1, storageKey = key(), attempts = 0) => tx.terraqoEducationEvidenceAttempt.create({ data: {
        educationId: education.id, actorId: user.id, operationKey: randomBytes(16).toString("hex"), fingerprint: randomBytes(32).toString("hex"),
        originalVersion: education.updatedAt, storageKey, size: 1_000_000, state, reservedUnits, attempts, updatedAt: old,
      } });
      await tx.terraqoProfessionalDocument.create({ data: { professionalProfileId: profile.id, type: "OTHER",
        storageKey: `professional-documents/${profile.id}/other/${randomUUID()}.pdf`, fileName: "propio.pdf", contentType: "application/pdf", size: 1_000_000 } });
      const winner = await attempt("COMMITTED");
      await tx.terraqoEducationEvidence.create({ data: { educationId: education.id, uploadedById: user.id, storageKey: winner.storageKey,
        fileName: "propio.pdf", contentType: "application/pdf", size: 1_000_000 } });
      const bucketWhere = { ownerKey_period_metric: { ownerKey: `user:${user.id}`, period: "retained", metric: "storage-mb" } };
      await tx.terraqoUsageBucket.create({ data: { ...bucketWhere.ownerKey_period_metric, used: 2 } });
      const used = async () => (await tx.terraqoUsageBucket.findUniqueOrThrow({ where: bucketWhere })).used;
      const charge = () => tx.terraqoUsageBucket.update({ where: bucketWhere, data: { used: { increment: 1 } } });
      // Blob presence/delete is a controlled double. SQL, ownership and quota
      // are real; this verifier does not claim Netlify storage or concurrency.
      const blobs = new Set<string>([winner.storageKey]); let deletions = 0;
      const store = { delete: async (storageKey: string) => { deletions++; blobs.delete(storageKey); } };
      phase = "live reference retained without logout dependence";
      assert.equal(await recoverEducationEvidenceInTransaction(tx, winner.id, store, now), "retained");
      assert.equal(await markEducationEvidenceCleanupInTransaction(tx, winner.id, user.id), "retained");
      assert.equal(deletions, 0); assert.equal(await used(), 2); assert.ok(blobs.has(winner.storageKey));
      phase = "single refund and repeated reconciliation";
      const orphan = await attempt(); await charge(); blobs.add(orphan.storageKey);
      assert.ok((await dueEducationEvidenceAttempts(tx, now)).some(row => row.id === orphan.id));
      assert.equal(await recoverEducationEvidenceInTransaction(tx, orphan.id, store, now), "pending");
      assert.equal(deletions, 0); assert.equal(await used(), 3);
      assert.equal(await markEducationEvidenceCleanupInTransaction(tx, orphan.id, user.id), "pending");
      assert.equal(await recoverEducationEvidenceInTransaction(tx, orphan.id, store, now), "completed");
      assert.equal(await used(), 2); assert.equal(await recoverEducationEvidenceInTransaction(tx, orphan.id, store, now), "skipped");
      assert.equal(deletions, 1); assert.ok(!blobs.has(orphan.storageKey));
      phase = "late physical write rearmed without another refund";
      blobs.add(orphan.storageKey);
      assert.equal(await markEducationEvidenceCleanupInTransaction(tx, orphan.id, user.id), "skipped");
      assert.equal(await markEducationEvidenceCleanupInTransaction(tx, orphan.id, user.id, true), "pending");
      assert.equal((await tx.terraqoEducationEvidenceAttempt.findUniqueOrThrow({ where: { id: orphan.id } })).reservedUnits, 0);
      assert.equal(await recoverEducationEvidenceInTransaction(tx, orphan.id, store, now), "completed");
      assert.equal(await used(), 2); assert.ok(!blobs.has(orphan.storageKey));
      assert.equal((await tx.terraqoEducationEvidenceAttempt.updateMany({ where: { id: orphan.id, state: "RESERVED" }, data: { state: "COMMITTED" } })).count, 0);
      phase = "late write followed by process death without callback";
      const tombstone = await tx.terraqoEducationEvidenceAttempt.findUniqueOrThrow({ where: { id: orphan.id } });
      assert.ok(tombstone.nextAttemptAt && tombstone.nextAttemptAt > now);
      // A physical write occurs, then its worker dies: NO lateWrite marker.
      blobs.add(orphan.storageKey);
      assert.equal(await rearmDueEducationEvidenceWatchInTransaction(tx, orphan.id, now), "skipped");
      assert.ok(!(await dueEducationEvidenceAttempts(tx, now)).some(row => row.id === orphan.id));
      const sweepAt = tombstone.nextAttemptAt!;
      assert.ok((await dueEducationEvidenceAttempts(tx, sweepAt)).some(row => row.id === orphan.id));
      assert.equal(await rearmDueEducationEvidenceWatchInTransaction(tx, orphan.id, sweepAt), "pending");
      assert.equal(await recoverEducationEvidenceInTransaction(tx, orphan.id, store, sweepAt), "completed");
      assert.ok(!blobs.has(orphan.storageKey)); assert.equal(await used(), 2);
      const nextSweep = await tx.terraqoEducationEvidenceAttempt.findUniqueOrThrow({ where: { id: orphan.id } });
      assert.ok(nextSweep.nextAttemptAt && nextSweep.nextAttemptAt > sweepAt);
      assert.equal(nextSweep.reservedUnits, 0); assert.equal(nextSweep.attempts, 0);
      // Even after a year there is no assumed settlement/purge deadline.
      const muchLater = new Date(sweepAt.getTime() + 366 * 86400_000);
      blobs.add(orphan.storageKey);
      assert.equal(await rearmDueEducationEvidenceWatchInTransaction(tx, orphan.id, muchLater), "pending");
      assert.equal(await recoverEducationEvidenceInTransaction(tx, orphan.id, store, muchLater), "completed");
      assert.equal(await used(), 2); assert.ok(!blobs.has(orphan.storageKey));
      assert.equal(await rearmDueEducationEvidenceWatchInTransaction(tx, winner.id, muchLater), "skipped");
      await tx.terraqoEducationEvidenceAttempt.update({ where: { id: winner.id }, data: { state: "CLEANED", reservedUnits: 0, nextAttemptAt: null } });
      assert.equal(await rearmDueEducationEvidenceWatchInTransaction(tx, winner.id, muchLater), "retained");
      assert.ok(blobs.has(winner.storageKey)); assert.equal(await used(), 2);
      assert.ok((await tx.terraqoEducationEvidenceAttempt.findUniqueOrThrow({ where: { id: winner.id } })).nextAttemptAt! > muchLater);
      await tx.terraqoEducationEvidenceAttempt.update({ where: { id: winner.id }, data: { state: "COMMITTED", reservedUnits: 1 } });
      phase = "retry preserves reserve and respects due time";
      const retry = await attempt(); await charge(); blobs.add(retry.storageKey);
      assert.equal(await markEducationEvidenceCleanupInTransaction(tx, retry.id, user.id), "pending");
      let failures = 0;
      const failingStore = { delete: async () => { failures++; throw Error("OWN_STORE_FAILURE"); } };
      assert.equal(await recoverEducationEvidenceInTransaction(tx, retry.id, failingStore, now), "retry");
      const waiting = await tx.terraqoEducationEvidenceAttempt.findUniqueOrThrow({ where: { id: retry.id } });
      assert.equal(waiting.attempts, 1); assert.equal(waiting.reservedUnits, 1); assert.equal(await used(), 3);
      assert.ok(waiting.nextAttemptAt && waiting.nextAttemptAt > now);
      assert.equal(await markEducationEvidenceCleanupInTransaction(tx, retry.id, user.id), "pending");
      assert.equal((await tx.terraqoEducationEvidenceAttempt.findUniqueOrThrow({ where: { id: retry.id } })).nextAttemptAt?.toISOString(), waiting.nextAttemptAt?.toISOString());
      assert.equal(await recoverEducationEvidenceInTransaction(tx, retry.id, failingStore, now), "skipped");
      assert.equal(failures, 1); assert.ok(!(await dueEducationEvidenceAttempts(tx, now)).some(row => row.id === retry.id));
      assert.equal(await recoverEducationEvidenceInTransaction(tx, retry.id, store, waiting.nextAttemptAt!), "completed");
      assert.equal(await used(), 2); assert.ok(!blobs.has(retry.storageKey));
      phase = "SQL rollback after delete remains recoverable";
      const uncertain = await attempt(); await charge(); blobs.add(uncertain.storageKey);
      assert.equal(await markEducationEvidenceCleanupInTransaction(tx, uncertain.id, user.id), "pending");
      await tx.$executeRaw`SAVEPOINT owned_uncertain_cleanup`;
      assert.equal(await recoverEducationEvidenceInTransaction(tx, uncertain.id, store, now), "completed");
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT owned_uncertain_cleanup`;
      await tx.$executeRaw`RELEASE SAVEPOINT owned_uncertain_cleanup`;
      assert.equal(await used(), 3); assert.ok(!blobs.has(uncertain.storageKey));
      assert.equal((await tx.terraqoEducationEvidenceAttempt.findUniqueOrThrow({ where: { id: uncertain.id } })).state, "CLEANUP_PENDING");
      assert.equal((await tx.terraqoEducationEvidenceAttempt.updateMany({ where: { id: uncertain.id, state: "RESERVED" }, data: { state: "COMMITTED" } })).count, 0);
      assert.equal(await recoverEducationEvidenceInTransaction(tx, uncertain.id, store, now), "completed");
      assert.equal(await used(), 2); assert.equal(await recoverEducationEvidenceInTransaction(tx, uncertain.id, store, now), "skipped");
      phase = "retry exhaustion quarantined without refund";
      const exhausted = await attempt("CLEANUP_PENDING", 1, key(), 7); await charge();
      assert.equal(await recoverEducationEvidenceInTransaction(tx, exhausted.id, failingStore, now), "quarantined");
      assert.equal(await used(), 3); assert.ok(!(await dueEducationEvidenceAttempts(tx, new Date(now.getTime() + 86400_000))).some(row => row.id === exhausted.id));
      phase = "invalid key and owner cannot reach deletion";
      const invalid = await attempt("PREPARED", 0, `education-evidence/${education.id}/${"0".repeat(36)}`);
      const before = deletions;
      assert.equal(await recoverEducationEvidenceInTransaction(tx, invalid.id, store, now), "quarantined");
      const wrongActor = await attempt("PREPARED", 0);
      await tx.terraqoEducationEvidenceAttempt.update({ where: { id: wrongActor.id }, data: { actorId: randomUUID() } });
      assert.equal(await recoverEducationEvidenceInTransaction(tx, wrongActor.id, store, now), "quarantined");
      assert.equal(await markEducationEvidenceCleanupInTransaction(tx, orphan.id, randomUUID(), true), "skipped");
      assert.equal(deletions, before); assert.equal(await used(), 3);
      phase = "inconsistent bucket quarantined before deletion";
      const inconsistent = await attempt();
      assert.equal(await markEducationEvidenceCleanupInTransaction(tx, inconsistent.id, user.id), "pending");
      assert.equal(await recoverEducationEvidenceInTransaction(tx, inconsistent.id, store, now), "quarantined");
      assert.equal(deletions, before); assert.equal(await used(), 3);
      assert.ok(blobs.has(winner.storageKey));
      phase = "bounded cleanup priority over older watch backlog";
      // Give watch tombstones an earlier timestamp than active cleanup. They
      // must not consume the five slots needed to release outstanding reserves.
      await tx.terraqoEducationEvidenceAttempt.createMany({ data: Array.from({ length: 6 }, () => ({
        id: randomUUID(), educationId: education.id, actorId: user.id, operationKey: randomBytes(16).toString("hex"),
        fingerprint: randomBytes(32).toString("hex"), originalVersion: education.updatedAt, storageKey: key(), size: 32,
        reservedUnits: 0, state: "CLEANED", nextAttemptAt: old, updatedAt: old,
      })) });
      const priority = await tx.terraqoEducationEvidenceAttempt.createManyAndReturn({ data: Array.from({ length: 5 }, () => ({
        id: randomUUID(), educationId: education.id, actorId: user.id, operationKey: randomBytes(16).toString("hex"),
        fingerprint: randomBytes(32).toString("hex"), originalVersion: education.updatedAt, storageKey: key(), size: 32,
        reservedUnits: 0, state: "CLEANUP_PENDING", nextAttemptAt: now,
      })), select: { id: true } });
      const selected = await dueEducationEvidenceAttempts(tx, now);
      assert.equal(selected.length, 5);
      assert.deepEqual(selected.map(row => row.id).sort(), priority.map(row => row.id).sort());
      verified = true; throw rollback;
    }, { maxWait: 5000, timeout: 90000 });
  } catch (error) { if (error !== rollback || !verified) throw error; }
  assert.equal(await prisma.user.count({ where: { email } }), 0);
  for (const table of tables) assert.equal((await prisma.$queryRaw<{ present: string | null }[]>`
    SELECT to_regclass(${`icc."${table}"`})::text AS present`)[0].present, initialPresence.get(table));
  console.log("PASS own SQL rollback + controlled blob double: live reference, one refund, late write without callback recovered by durable tombstone watch, no expiry after a year, retry/due/quarantine, SQL rollback after deletion, invalid owner/key/bucket fenced and bounded cleanup priority. No live storage, HTTP or cross-connection concurrency claimed; fixture/quota rolled back and initial catalog preserved.");
}
main().catch((error: unknown) => { const value = error as { code?: string; name?: string; meta?: { code?: string } };
  console.error({ phase, code: value.code, databaseCode: value.meta?.code, name: value.name });
  console.error("Education cleanup verification failed; private diagnostics suppressed."); process.exitCode = 1;
}).finally(() => prisma.$disconnect());
