import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { commitEducationEvidenceInTransaction } from "../lib/server/education-evidence-commit";
import { EducationEvidenceReservationError, educationPersonalStorageFloor } from "../lib/server/education-evidence-reservation";
import { withdrawEducationEvidenceInTransaction } from "../lib/server/education-evidence-withdrawal";

const prisma = new PrismaClient({ log: [] });
const rollback = new Error("OWN_WITHDRAWAL_ROLLBACK");
let phase = "scope";
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
  assert.equal(process.env.TEST_PORTAL_URL, "https://api.terraqoglobal.com");
  const workspace = await prisma.terraqoWorkspace.findFirstOrThrow({ where: { slug: "icc-topografia", active: true,
    companies: { some: { document: "20616116313", deletedAt: null } } }, select: { id: true } });
  const sql = await readFile(new URL("../prisma/migrations/20261008015500_education_evidence_withdrawal/migration.sql", import.meta.url), "utf8");
  const email = `education-withdrawal-${randomUUID()}@example.test`;
  let verified = false;
  try {
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      for (const statement of sql.split(";").map(value => value.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
      const user = await tx.user.create({ data: { email, name: "Fixture propio retirada formación", role: "CUSTOMER",
        terraqoMemberships: { create: { workspaceId: workspace.id, role: "PROFESSIONAL", active: true } },
        terraqoProfessionalProfile: { create: { liveCvEnabled: false, education: { create: {
          institution: "Institución propia", degree: "Formación propia", visibility: "PRIVATE", evidence: ["Texto propio"],
        } } } },
      }, select: { id: true, terraqoProfessionalProfile: { select: { id: true, education: { select: { id: true, updatedAt: true } } } } } });
      const education = user.terraqoProfessionalProfile!.education[0];
      const jti = randomUUID(), now = Math.floor(Date.now() / 1000);
      const token = { sub: user.id, workspaceId: workspace.id, workspaceSlug: "icc-topografia", role: "PROFESSIONAL" as const,
        jti, iat: now, exp: now + 3600 };
      await tx.verificationToken.create({ data: { identifier: `portal-session:${workspace.id}:${user.id}`,
        token: createHash("sha256").update(jti).digest("hex"), expires: new Date(Date.now() + 3600_000) } });
      const file = { fileName: "propio.pdf", contentType: "application/pdf", size: 32, fingerprint: randomBytes(32).toString("hex") };
      const attempt = await tx.terraqoEducationEvidenceAttempt.create({ data: { educationId: education.id, actorId: user.id,
        operationKey: randomBytes(16).toString("hex"), fingerprint: file.fingerprint, originalVersion: education.updatedAt,
        storageKey: `education-evidence/${education.id}/${randomUUID()}`, size: file.size, reservedUnits: 1, state: "RESERVED" } });
      const bucket = { ownerKey_period_metric: { ownerKey: `user:${user.id}`, period: "retained", metric: "storage-mb" } };
      await tx.terraqoUsageBucket.create({ data: { ...bucket.ownerKey_period_metric, used: 1 } });
      const upload = await commitEducationEvidenceInTransaction(tx, token, education.id, attempt.id, file);
      const input = { evidenceId: upload.receipt.evidenceId!, version: upload.currentVersion, operationKey: randomBytes(16).toString("hex") };
      let index = 0;
      const denied = async (status: number, action: () => Promise<unknown>) => {
        const name = `own_withdrawal_${index++}`;
        await tx.$executeRawUnsafe(`SAVEPOINT ${name}`);
        await assert.rejects(action, error => error instanceof EducationEvidenceReservationError && error.status === status);
        await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${name}`);
        await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`);
      };
      const withdraw = () => withdrawEducationEvidenceInTransaction(tx, token, education.id, input);
      phase = "live authority and request guards";
      await denied(401, () => withdrawEducationEvidenceInTransaction(tx, { ...token, jti: randomUUID() }, education.id, input));
      await denied(401, () => withdrawEducationEvidenceInTransaction(tx, { ...token, exp: now - 1 }, education.id, input));
      await denied(409, () => withdrawEducationEvidenceInTransaction(tx, token, education.id, { ...input, version: education.updatedAt.toISOString() }));
      await denied(422, () => withdrawEducationEvidenceInTransaction(tx, token, education.id, { ...input, operationKey: "bad" }));
      await denied(404, () => withdrawEducationEvidenceInTransaction(tx, token, education.id, { ...input, evidenceId: randomUUID() }));
      await tx.terraqoWorkspaceMember.updateMany({ where: { workspaceId: workspace.id, userId: user.id }, data: { role: "CLIENT" } });
      await denied(403, withdraw);
      await tx.terraqoWorkspaceMember.updateMany({ where: { workspaceId: workspace.id, userId: user.id }, data: { role: "PROFESSIONAL" } });
      await tx.terraqoProfessionalEducation.update({ where: { id: education.id }, data: { verificationStatus: "APPROVED", updatedAt: new Date(input.version) } });
      await denied(403, withdraw);
      await tx.terraqoProfessionalEducation.update({ where: { id: education.id }, data: { verificationStatus: "NOT_REQUESTED", updatedAt: new Date(input.version) } });
      phase = "retention and quota guards";
      await tx.terraqoEducationEvidenceAttempt.update({ where: { id: attempt.id }, data: { state: "CLEANUP_PENDING" } });
      await denied(409, withdraw);
      await tx.terraqoEducationEvidenceAttempt.update({ where: { id: attempt.id }, data: { state: "COMMITTED" } });
      await tx.terraqoUsageBucket.update({ where: bucket, data: { used: 0 } }); await denied(409, withdraw);
      await tx.terraqoUsageBucket.update({ where: bucket, data: { used: 1 } });
      phase = "audit FK failure atomically restores file and fence";
      await tx.$executeRaw`SAVEPOINT own_withdrawal_audit`;
      const failedAudit = new Proxy(tx, { get(target, key, receiver) {
        if (key === "activityLog") return { create: () => tx.activityLog.create({ data: { actorId: randomUUID(),
          terraqoWorkspaceId: workspace.id, action: "DELETED", entityType: "EducationEvidenceWithdrawal",
          entityId: input.evidenceId, title: "Fallo propio" } }) };
        return Reflect.get(target, key, receiver);
      } });
      await assert.rejects(() => withdrawEducationEvidenceInTransaction(failedAudit, token, education.id, input),
        error => (error as { code?: string }).code === "P2003");
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT own_withdrawal_audit`;
      await tx.$executeRaw`RELEASE SAVEPOINT own_withdrawal_audit`;
      assert.equal(await tx.terraqoEducationEvidence.count({ where: { id: input.evidenceId } }), 1);
      assert.equal((await tx.terraqoEducationEvidenceAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).state, "COMMITTED");
      assert.equal((await tx.terraqoProfessionalEducation.findUniqueOrThrow({ where: { id: education.id } })).updatedAt.toISOString(), input.version);
      assert.equal(await tx.terraqoEducationEvidenceWithdrawal.count({ where: { educationId: education.id } }), 0);
      phase = "expiration after audit rolls back the completed SQL unit";
      const expiringToken = { ...token };
      const expireAfterAudit = new Proxy(tx, { get(target, key, receiver) {
        if (key === "activityLog") return { create: async (args: Parameters<typeof tx.activityLog.create>[0]) => {
          const saved = await tx.activityLog.create(args); expiringToken.exp = now - 1; return saved;
        } };
        return Reflect.get(target, key, receiver);
      } });
      await denied(401, () => withdrawEducationEvidenceInTransaction(expireAfterAudit, expiringToken, education.id, input));
      assert.equal(await tx.terraqoEducationEvidence.count({ where: { id: input.evidenceId } }), 1);
      assert.equal((await tx.terraqoEducationEvidenceAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).state, "COMMITTED");
      phase = "logical withdrawal and exact historical replay";
      const result = await withdraw();
      assert.equal(result.kind, "withdrawn"); assert.ok(new Date(result.currentVersion) > new Date(input.version));
      assert.equal(await tx.terraqoEducationEvidence.count({ where: { educationId: education.id } }), 0);
      const fenced = await tx.terraqoEducationEvidenceAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
      assert.equal(fenced.state, "CLEANUP_PENDING"); assert.equal(fenced.reservedUnits, 1);
      assert.equal((await tx.terraqoUsageBucket.findUniqueOrThrow({ where: bucket })).used, 1);
      assert.equal(await educationPersonalStorageFloor(tx, user.id), 1);
      const original = await tx.terraqoEducationEvidenceOperation.findUniqueOrThrow({ where: { id: upload.receipt.id } });
      assert.equal(original.evidenceId, null); assert.equal(original.fingerprint, upload.receipt.fingerprint);
      const replay = await withdraw(); assert.equal(replay.kind, "receipt"); assert.equal(replay.receipt.id, result.receipt.id);
      phase = "withdrawal receipt SQL invariants";
      for (const data of [{ ...result.receipt, fingerprint: "invalid" },
        { ...result.receipt, resultVersion: result.receipt.originalVersion },
        { ...result.receipt, targetEvidenceId: "../unsafe" }]) {
        await tx.$executeRaw`SAVEPOINT own_withdrawal_constraint`;
        // Remove the original only within the savepoint, so unique indexes do
        // not mask the CHECK constraint under examination.
        await tx.terraqoEducationEvidenceWithdrawal.delete({ where: { id: result.receipt.id } });
        await assert.rejects(() => tx.$executeRaw`INSERT INTO icc."TerraqoEducationEvidenceWithdrawal"
          (id,"educationId","actorId","operationKey",fingerprint,"targetEvidenceId","uploadOperationId","attemptId","originalVersion","resultVersion")
          VALUES (${data.id},${data.educationId},${data.actorId},${data.operationKey},${data.fingerprint},${data.targetEvidenceId},
            ${data.uploadOperationId},${data.attemptId},${data.originalVersion},${data.resultVersion})`,
          error => (error as { code?: string; meta?: { code?: string } }).code === "P2010" &&
            (error as { meta?: { code?: string } }).meta?.code === "23514");
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT own_withdrawal_constraint`;
        await tx.$executeRaw`RELEASE SAVEPOINT own_withdrawal_constraint`;
      }
      assert.equal(await tx.activityLog.count({ where: { actorId: user.id, entityType: "EducationEvidenceWithdrawal" } }), 1);
      await denied(409, () => withdrawEducationEvidenceInTransaction(tx, token, education.id, { ...input, evidenceId: randomUUID() }));
      await denied(409, () => withdrawEducationEvidenceInTransaction(tx, token, education.id, { ...input, version: result.currentVersion }));
      await denied(404, () => withdrawEducationEvidenceInTransaction(tx, token, education.id, { ...input,
        operationKey: randomBytes(16).toString("hex"), version: result.currentVersion }));
      phase = "receipt remains historical under protected current state";
      await tx.terraqoProfessionalEducation.update({ where: { id: education.id }, data: { verificationStatus: "APPROVED" } });
      assert.equal((await withdraw()).receipt.id, result.receipt.id);
      const unchanged = await tx.terraqoProfessionalEducation.findUniqueOrThrow({ where: { id: education.id } });
      assert.equal(unchanged.visibility, "PRIVATE"); assert.deepEqual(unchanged.evidence, ["Texto propio"]);
      assert.equal((await tx.terraqoProfessionalProfile.findUniqueOrThrow({ where: { id: user.terraqoProfessionalProfile!.id } })).liveCvEnabled, false);
      phase = "RESTRICT retains tombstone and upload history";
      for (const action of [() => tx.terraqoEducationEvidenceAttempt.delete({ where: { id: attempt.id } }),
        () => tx.terraqoEducationEvidenceOperation.delete({ where: { id: upload.receipt.id } })]) {
        await tx.$executeRaw`SAVEPOINT own_withdrawal_parent`;
        await assert.rejects(action, error => (error as { code?: string }).code === "P2003");
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT own_withdrawal_parent`;
        await tx.$executeRaw`RELEASE SAVEPOINT own_withdrawal_parent`;
      }
      verified = true; throw rollback;
    }, { maxWait: 5000, timeout: 90000 });
  } catch (error) { if (error !== rollback || !verified) throw error; }
  assert.equal(await prisma.user.count({ where: { email } }), 0);
  console.log("PASS own SQL rollback: authority/state/version/retention/quota guards, real audit FK atomic rollback, independent withdrawal receipt, exact replay/conflict, pending fence with units unchanged, upload history SETNULL and RESTRICT parents. PRIVATE/text/CV preserved. No physical deletion, concurrency or HTTP claimed.");
}
main().catch(() => { console.error({ phase }); console.error("Withdrawal verification failed; private diagnostics suppressed."); process.exitCode = 1;
}).finally(() => prisma.$disconnect());
