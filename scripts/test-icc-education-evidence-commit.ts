import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { commitEducationEvidenceInTransaction } from "../lib/server/education-evidence-commit";
import { EducationEvidenceReservationError } from "../lib/server/education-evidence-reservation";

const prisma = new PrismaClient({ log: [] });
const tables = ["TerraqoEducationEvidence", "TerraqoEducationEvidenceOperation", "TerraqoEducationEvidenceAttempt"];
const rollback = new Error("OWN_COMMIT_TEST_ROLLBACK");
let phase = "scope";
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
  assert.equal(process.env.TEST_PORTAL_URL, "https://api.terraqoglobal.com");
  const workspace = await prisma.terraqoWorkspace.findFirstOrThrow({ where: { slug: "icc-topografia", active: true,
    companies: { some: { document: "20616116313", deletedAt: null } } }, select: { id: true } });
  for (const table of tables) assert.equal((await prisma.$queryRaw<{ present: string | null }[]>`
    SELECT to_regclass(${`icc."${table}"`})::text AS present`)[0].present, null);
  const sql = await readFile(new URL("../prisma/migrations/20261007195600_education_evidence_prerequisites/migration.sql", import.meta.url), "utf8");
  const email = `education-commit-${randomUUID()}@example.test`;
  let verified = false;
  try {
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      for (const statement of sql.split(";").map(value => value.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
      const user = await tx.user.create({ data: { email, name: "Fixture propio confirmación formación", role: "CUSTOMER",
        terraqoMemberships: { create: { workspaceId: workspace.id, role: "PROFESSIONAL", active: true } },
        terraqoProfessionalProfile: { create: { liveCvEnabled: false, education: { create: {
          institution: "Institución propia", degree: "Formación propia", visibility: "PRIVATE", evidence: ["Texto legado propio"],
        } } } },
      }, select: { id: true, terraqoProfessionalProfile: { select: { id: true, education: { select: { id: true, updatedAt: true } } } } } });
      const education = user.terraqoProfessionalProfile!.education[0];
      const jti = randomUUID(), now = Math.floor(Date.now() / 1000);
      const token = { sub: user.id, workspaceId: workspace.id, workspaceSlug: "icc-topografia", role: "PROFESSIONAL" as const,
        jti, iat: now, exp: now + 3600 };
      await tx.verificationToken.create({ data: { identifier: `portal-session:${workspace.id}:${user.id}`,
        token: createHash("sha256").update(jti).digest("hex"), expires: new Date(Date.now() + 3600_000) } });
      const file = { fileName: "propio.pdf", contentType: "application/pdf", size: 32, fingerprint: randomBytes(32).toString("hex") };
      const operationKey = randomBytes(16).toString("hex");
      const attempt = (version: Date, key = randomBytes(16).toString("hex")) => tx.terraqoEducationEvidenceAttempt.create({ data: {
        educationId: education.id, actorId: user.id, operationKey: key, fingerprint: file.fingerprint, originalVersion: version,
        storageKey: `education-evidence/${education.id}/${randomUUID()}`, size: file.size, reservedUnits: 1, state: "RESERVED",
      } });
      const winner = await attempt(education.updatedAt, operationKey), loser = await attempt(education.updatedAt, operationKey);
      const bucket = { ownerKey_period_metric: { ownerKey: `user:${user.id}`, period: "retained", metric: "storage-mb" } };
      await tx.terraqoUsageBucket.create({ data: { ...bucket.ownerKey_period_metric, used: 2 } });
      let index = 0;
      const denied = async (status: number, action: () => Promise<unknown>) => {
        const savepoint = `owned_commit_${index++}`;
        await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
        await assert.rejects(action, error => error instanceof EducationEvidenceReservationError && error.status === status);
        await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
      };
      phase = "revocation and demotion before retention";
      await denied(401, () => commitEducationEvidenceInTransaction(tx, { ...token, jti: randomUUID() }, education.id, winner.id, file));
      await tx.terraqoWorkspaceMember.updateMany({ where: { workspaceId: workspace.id, userId: user.id }, data: { role: "CLIENT" } });
      await denied(403, () => commitEducationEvidenceInTransaction(tx, token, education.id, winner.id, file));
      await tx.terraqoWorkspaceMember.updateMany({ where: { workspaceId: workspace.id, userId: user.id }, data: { role: "PROFESSIONAL" } });
      phase = "audit FK failure rolls back entire retention";
      await tx.$executeRaw`SAVEPOINT owned_audit_failure`;
      // Only the test changes the audit port. The actual INSERT fails its FK;
      // production has no injectable audit bypass or error-swallowing hook.
      const failedAudit = new Proxy(tx, { get(target, key, receiver) {
        if (key === "activityLog") return { create: () => tx.activityLog.create({ data: { actorId: randomUUID(), terraqoWorkspaceId: workspace.id,
          action: "CREATED", entityType: "EducationEvidence", entityId: winner.id, title: "Fallo propio de auditoría" } }) };
        return Reflect.get(target, key, receiver);
      } });
      await assert.rejects(() => commitEducationEvidenceInTransaction(failedAudit, token, education.id, winner.id, file),
        error => (error as { code?: string }).code === "P2003");
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT owned_audit_failure`;
      await tx.$executeRaw`RELEASE SAVEPOINT owned_audit_failure`;
      assert.equal((await tx.terraqoEducationEvidenceAttempt.findUniqueOrThrow({ where: { id: winner.id } })).state, "RESERVED");
      assert.equal(await tx.terraqoEducationEvidence.count({ where: { educationId: education.id } }), 0);
      assert.equal(await tx.terraqoEducationEvidenceOperation.count({ where: { educationId: education.id } }), 0);
      assert.equal((await tx.terraqoProfessionalEducation.findUniqueOrThrow({ where: { id: education.id } })).updatedAt.getTime(), education.updatedAt.getTime());
      phase = "winner and sequential losing attempt replay";
      const committed = await commitEducationEvidenceInTransaction(tx, token, education.id, winner.id, file);
      assert.equal(committed.kind, "committed"); assert.ok(new Date(committed.currentVersion) > education.updatedAt);
      const replay = await commitEducationEvidenceInTransaction(tx, token, education.id, loser.id, file);
      assert.equal(replay.kind, "receipt"); assert.equal(replay.cleanupAttemptId, loser.id);
      assert.equal(replay.receipt.id, committed.receipt.id);
      assert.equal((await tx.terraqoUsageBucket.findUniqueOrThrow({ where: bucket })).used, 2);
      assert.equal(await tx.activityLog.count({ where: { actorId: user.id, entityType: "EducationEvidence" } }), 1);
      await denied(409, () => commitEducationEvidenceInTransaction(tx, token, education.id, loser.id, { ...file, fileName: "otro.pdf" }));
      await denied(409, () => commitEducationEvidenceInTransaction(tx, token, education.id, loser.id, { ...file, fingerprint: randomBytes(32).toString("hex") }));
      phase = "lost fence and stale version cannot commit";
      const stale = await attempt(education.updatedAt);
      await tx.terraqoUsageBucket.update({ where: bucket, data: { used: { increment: 1 } } });
      await denied(409, () => commitEducationEvidenceInTransaction(tx, token, education.id, stale.id, file));
      const fenced = await attempt(new Date(committed.currentVersion));
      await tx.terraqoEducationEvidenceAttempt.update({ where: { id: fenced.id }, data: { state: "CLEANUP_PENDING" } });
      await denied(409, () => commitEducationEvidenceInTransaction(tx, token, education.id, fenced.id, file));
      phase = "protected state prevents fresh retention";
      const fresh = await attempt(new Date(committed.currentVersion));
      await tx.terraqoProfessionalEducation.update({ where: { id: education.id }, data: { verificationStatus: "APPROVED", updatedAt: new Date(committed.currentVersion) } });
      await denied(403, () => commitEducationEvidenceInTransaction(tx, token, education.id, fresh.id, file));
      phase = "six files and personal capacity fences";
      await tx.terraqoProfessionalEducation.update({ where: { id: education.id }, data: { verificationStatus: "NOT_REQUESTED", updatedAt: new Date(committed.currentVersion) } });
      const extra = Array.from({ length: 5 }, () => ({ id: randomUUID(), educationId: education.id, uploadedById: user.id,
        storageKey: `education-evidence/${education.id}/${randomUUID()}`, fileName: "propio-extra.pdf", contentType: "application/pdf", size: 32 }));
      await tx.terraqoEducationEvidence.createMany({ data: extra });
      await denied(422, () => commitEducationEvidenceInTransaction(tx, token, education.id, fresh.id, file));
      await tx.terraqoEducationEvidence.deleteMany({ where: { id: { in: extra.map(row => row.id) }, educationId: education.id } });
      await tx.terraqoUsageBucket.update({ where: bucket, data: { used: 0 } });
      await denied(409, () => commitEducationEvidenceInTransaction(tx, token, education.id, fresh.id, file));
      await tx.terraqoUsageBucket.update({ where: bucket, data: { used: 1_000_000 } });
      await denied(429, () => commitEducationEvidenceInTransaction(tx, token, education.id, fresh.id, file));
      await tx.terraqoUsageBucket.update({ where: bucket, data: { used: 3 } });
      await denied(401, () => commitEducationEvidenceInTransaction(tx, { ...token, exp: now - 1 }, education.id, fresh.id, file));
      phase = "historical receipt after withdrawal is not recreation";
      await tx.terraqoEducationEvidence.delete({ where: { id: committed.receipt.evidenceId! } });
      const history = await commitEducationEvidenceInTransaction(tx, token, education.id, winner.id, file);
      assert.equal(history.kind, "receipt"); assert.equal(history.receipt.evidenceId, null); assert.equal(history.cleanupAttemptId, null);
      assert.equal(await tx.terraqoEducationEvidence.count({ where: { educationId: education.id } }), 0);
      assert.equal(await tx.activityLog.count({ where: { actorId: user.id, entityType: "EducationEvidence" } }), 1);
      const unchanged = await tx.terraqoProfessionalEducation.findUniqueOrThrow({ where: { id: education.id } });
      assert.equal(unchanged.visibility, "PRIVATE"); assert.deepEqual(unchanged.evidence, ["Texto legado propio"]);
      assert.equal((await tx.terraqoProfessionalProfile.findUniqueOrThrow({ where: { id: user.terraqoProfessionalProfile!.id } })).liveCvEnabled, false);
      verified = true; throw rollback;
    }, { maxWait: 5000, timeout: 90000 });
  } catch (error) { if (error !== rollback || !verified) throw error; }
  assert.equal(await prisma.user.count({ where: { email } }), 0);
  for (const table of tables) assert.equal((await prisma.$queryRaw<{ present: string | null }[]>`
    SELECT to_regclass(${`icc."${table}"`})::text AS present`)[0].present, null);
  console.log("PASS own SQL rollback: revoked/expired grant/demotion, actual audit FK rollback, one winner/receipt/audit, sequential loser replay, lost RESERVED/stale/protected/six-file/quota fences, historical receipt without recreation and private/text/CV unchanged. No physical store, HTTP or concurrent connections claimed; fixture and DDL rolled back.");
}
main().catch((error: unknown) => { const value = error as { code?: string; name?: string; meta?: { code?: string } };
  console.error({ phase, code: value.code, databaseCode: value.meta?.code, name: value.name });
  console.error("Education commit verification failed; private diagnostics suppressed."); process.exitCode = 1;
}).finally(() => prisma.$disconnect());
