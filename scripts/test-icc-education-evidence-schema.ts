import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

// Expected constraint failures can contain entire private rows in Prisma logs.
// This verifier uses its own direct client with diagnostics disabled.
const prisma = new PrismaClient({ log: [] });
import { EducationEvidenceReservationError, educationPersonalStorageFloor, reserveEducationEvidenceInTransaction } from "../lib/server/education-evidence-reservation";

const tables = ["TerraqoEducationEvidence", "TerraqoEducationEvidenceOperation", "TerraqoEducationEvidenceAttempt"];
let phase = "scope";
const rollback = new Error("OWN_SCHEMA_TEST_ROLLBACK");
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
  assert.equal(process.env.TEST_PORTAL_URL, "https://api.terraqoglobal.com");
  const workspace = await prisma.terraqoWorkspace.findFirstOrThrow({ where: { slug: "icc-topografia", active: true,
    companies: { some: { document: "20616116313", deletedAt: null } } }, select: { id: true } });
  for (const table of tables) {
    const rows = await prisma.$queryRaw<{ present: string | null }[]>`SELECT to_regclass(${`icc."${table}"`})::text AS present`;
    assert.equal(rows[0].present, null, "Rollback-only verifier requires unapplied prerequisite tables.");
  }
  const sql = await readFile(new URL("../prisma/migrations/20261007195600_education_evidence_prerequisites/migration.sql", import.meta.url), "utf8");
  const email = `education-schema-${randomUUID()}@example.test`;
  let verified = false;
  try {
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      phase = "additive DDL in rollback transaction";
      for (const statement of sql.split(";").map(value => value.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
      // Replaying the additive statements must not change or drop existing data.
      for (const statement of sql.split(";").map(value => value.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
      const user = await tx.user.create({ data: { email, name: "Fixture propio esquema formación", role: "CUSTOMER",
        terraqoMemberships: { create: { workspaceId: workspace.id, role: "PROFESSIONAL", active: true } },
        terraqoProfessionalProfile: { create: { liveCvEnabled: false, education: { create: {
          institution: "Institución sintética propia", degree: "Formación propia", visibility: "PRIVATE", evidence: ["Texto legado propio"],
        } } } },
      }, select: { id: true, terraqoProfessionalProfile: { select: { id: true, education: { select: { id: true, updatedAt: true } } } } } });
      const education = user.terraqoProfessionalProfile!.education[0];
      const storageKey = `education-evidence/${education.id}/${randomUUID()}`;
      const file = await tx.terraqoEducationEvidence.create({ data: { educationId: education.id, uploadedById: user.id,
        storageKey, fileName: "propio.pdf", contentType: "application/pdf", size: 32 } });
      const operationKey = randomBytes(16).toString("hex");
      const receipt = await tx.terraqoEducationEvidenceOperation.create({ data: { id: randomBytes(32).toString("hex"),
        educationId: education.id, actorId: user.id, operationKey, fingerprint: randomBytes(32).toString("hex"), evidenceId: file.id,
        fileName: file.fileName, contentType: file.contentType, size: file.size, originalVersion: education.updatedAt,
        resultVersion: new Date(education.updatedAt.getTime() + 1) } });
      const attempt = await tx.terraqoEducationEvidenceAttempt.create({ data: { educationId: education.id, actorId: user.id,
        operationKey, fingerprint: receipt.fingerprint, originalVersion: education.updatedAt,
        storageKey: `education-evidence/${education.id}/${randomUUID()}`, size: 4194304 } });
      let index = 0;
      const rejects = async (label: string, code: string, action: () => Promise<unknown>) => {
        phase = label; const savepoint = `owned_case_${index++}`;
        await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
        let actual: string | undefined;
        try { await action(); } catch (error) { actual = (error as { meta?: { code?: string } }).meta?.code; }
        await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
        assert.equal(actual, code, label);
      };
      await rejects("education parent retained", "23503", () => tx.$executeRaw`DELETE FROM icc."TerraqoProfessionalEducation" WHERE id=${education.id}`);
      await rejects("profile/user cascade cannot strand cleanup", "23503", () => tx.$executeRaw`DELETE FROM icc."User" WHERE id=${user.id}`);
      await rejects("receipt key unique per education", "23505", () => tx.$executeRaw`INSERT INTO icc."TerraqoEducationEvidenceOperation" SELECT ${randomBytes(32).toString("hex")}, "educationId", "actorId", "operationKey", "fingerprint", NULL, "fileName", "contentType", "size", "originalVersion", "resultVersion", "createdAt" FROM icc."TerraqoEducationEvidenceOperation" WHERE id=${receipt.id}`);
      await rejects("file size bounded", "23514", () => tx.$executeRaw`UPDATE icc."TerraqoEducationEvidence" SET size=4194305 WHERE id=${file.id}`);
      await rejects("binary MIME allowlist", "23514", () => tx.$executeRaw`UPDATE icc."TerraqoEducationEvidence" SET "contentType"='text/html' WHERE id=${file.id}`);
      await rejects("blob namespace belongs to education", "23514", () => tx.$executeRaw`UPDATE icc."TerraqoEducationEvidence" SET "storageKey"=${`education-evidence/wrong/${randomUUID()}`} WHERE id=${file.id}`);
      await rejects("version must advance", "23514", () => tx.$executeRaw`UPDATE icc."TerraqoEducationEvidenceOperation" SET "resultVersion"="originalVersion" WHERE id=${receipt.id}`);
      await rejects("unreserved PREPARED state", "23514", () => tx.$executeRaw`UPDATE icc."TerraqoEducationEvidenceAttempt" SET "reservedUnits"=5 WHERE id=${attempt.id}`);
      await rejects("reserved state requires exact units", "23514", () => tx.$executeRaw`UPDATE icc."TerraqoEducationEvidenceAttempt" SET state='RESERVED',"reservedUnits"=4 WHERE id=${attempt.id}`);
      await tx.terraqoEducationEvidenceAttempt.update({ where: { id: attempt.id }, data: { state: "RESERVED", reservedUnits: 5 } });
      await rejects("unknown lifecycle rejected", "23514", () => tx.$executeRaw`UPDATE icc."TerraqoEducationEvidenceAttempt" SET state='UNKNOWN' WHERE id=${attempt.id}`);
      phase = "receipt survives later file removal";
      await tx.terraqoEducationEvidence.delete({ where: { id: file.id } });
      const historical = await tx.terraqoEducationEvidenceOperation.findUniqueOrThrow({ where: { id: receipt.id } });
      assert.equal(historical.evidenceId, null); assert.equal(historical.fingerprint, receipt.fingerprint); assert.equal(historical.size, 32);
      await rejects("receipt and physical attempt retain parent without file", "23503", () => tx.$executeRaw`DELETE FROM icc."TerraqoProfessionalEducation" WHERE id=${education.id}`);
      const unchanged = await tx.terraqoProfessionalEducation.findUniqueOrThrow({ where: { id: education.id } });
      assert.deepEqual(unchanged.evidence, ["Texto legado propio"]); assert.equal(unchanged.visibility, "PRIVATE");
      phase = "durable reservation permissions and rollback";
      const jti = randomUUID(), now = Math.floor(Date.now() / 1000);
      const token = { sub: user.id, workspaceId: workspace.id, workspaceSlug: "icc-topografia", role: "PROFESSIONAL" as const,
        jti, iat: now, exp: now + 3600 };
      const grant = { identifier: `portal-session:${workspace.id}:${user.id}`, token: createHash("sha256").update(jti).digest("hex"),
        expires: new Date(Date.now() + 3600_000) };
      await tx.verificationToken.create({ data: grant });
      const payload = { size: 32, version: education.updatedAt.toISOString(), operationKey: randomBytes(16).toString("hex"),
        fingerprint: randomBytes(32).toString("hex") };
      const denied = async (status: number, action: () => Promise<unknown>) => {
        const savepoint = `owned_access_${index++}`;
        await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
        await assert.rejects(action, error => error instanceof EducationEvidenceReservationError && error.status === status);
        // Same rollback boundary enforced by the service's transaction wrapper.
        await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
      };
      await denied(401, () => reserveEducationEvidenceInTransaction(tx, { ...token, jti: undefined }, education.id, payload));
      await denied(401, () => reserveEducationEvidenceInTransaction(tx, { ...token, jti: randomUUID() }, education.id, payload));
      await tx.terraqoWorkspaceMember.updateMany({ where: { userId: user.id, workspaceId: workspace.id }, data: { role: "CLIENT" } });
      await denied(403, () => reserveEducationEvidenceInTransaction(tx, token, education.id, payload));
      await tx.terraqoWorkspaceMember.updateMany({ where: { userId: user.id, workspaceId: workspace.id }, data: { role: "PROFESSIONAL" } });
      await denied(409, () => reserveEducationEvidenceInTransaction(tx, token, education.id, { ...payload, version: new Date(0).toISOString() }));
      await tx.terraqoProfessionalEducation.update({ where: { id: education.id }, data: { verificationStatus: "APPROVED", updatedAt: education.updatedAt } });
      await denied(403, () => reserveEducationEvidenceInTransaction(tx, token, education.id, payload));
      const replay = await reserveEducationEvidenceInTransaction(tx, token, education.id, { ...payload, operationKey: receipt.operationKey,
        fingerprint: receipt.fingerprint });
      assert.equal(replay.kind, "receipt"); if (replay.kind === "receipt") assert.equal(replay.receipt.evidenceId, null);
      await denied(409, () => reserveEducationEvidenceInTransaction(tx, token, education.id, { ...payload, operationKey: receipt.operationKey }));
      await tx.terraqoProfessionalEducation.update({ where: { id: education.id }, data: { verificationStatus: "NOT_REQUESTED", updatedAt: education.updatedAt } });
      await tx.terraqoProfessionalDocument.create({ data: { professionalProfileId: user.terraqoProfessionalProfile!.id, type: "OTHER",
        storageKey: `professional-documents/${user.terraqoProfessionalProfile!.id}/other/${randomUUID()}.pdf`,
        fileName: "propio.pdf", contentType: "application/pdf", size: 1_000_000 } });
      const unrelatedUploader = randomUUID();
      await tx.terraqoEducationEvidence.create({ data: { educationId: education.id, uploadedById: unrelatedUploader,
        storageKey: `education-evidence/${education.id}/${randomUUID()}`, fileName: "propio.pdf", contentType: "application/pdf", size: 1_000_000 } });
      const initialFloor = await educationPersonalStorageFloor(tx, user.id); assert.equal(initialFloor, 7);
      assert.equal(await educationPersonalStorageFloor(tx, unrelatedUploader), 0);
      const reserved = await reserveEducationEvidenceInTransaction(tx, token, education.id, payload);
      assert.equal(reserved.kind, "reserved");
      if (reserved.kind !== "reserved") throw Error("Own reservation missing");
      assert.equal(reserved.attempt.state, "RESERVED"); assert.equal(reserved.attempt.reservedUnits, 1);
      assert.equal(reserved.attempt.fingerprint, payload.fingerprint); assert.equal(reserved.attempt.originalVersion.toISOString(), payload.version);
      const bucketWhere = { ownerKey_period_metric: { ownerKey: `user:${user.id}`, period: "retained", metric: "storage-mb" } };
      assert.equal((await tx.terraqoUsageBucket.findUniqueOrThrow({ where: bucketWhere })).used, 8);
      const previousCount = await tx.terraqoEducationEvidenceAttempt.count({ where: { educationId: education.id } });
      await tx.terraqoUsageBucket.update({ where: bucketWhere, data: { used: 249 } });
      await tx.terraqoBillingAccount.create({ data: { ownerKey: `user:${user.id}`, userId: user.id, mode: "test",
        planCode: "personal-premium", paidThrough: new Date(Date.now() + 3600_000) } });
      const expiredPlan = await tx.terraqoBillingAccount.create({ data: { ownerKey: `user:${user.id}`, userId: user.id, mode: "live",
        planCode: "personal-premium", paidThrough: new Date(Date.now() - 60_000) } });
      await denied(429, () => reserveEducationEvidenceInTransaction(tx, token, education.id, { ...payload, size: 4194304 }));
      assert.equal((await tx.terraqoUsageBucket.findUniqueOrThrow({ where: bucketWhere })).used, 249);
      assert.equal(await tx.terraqoEducationEvidenceAttempt.count({ where: { educationId: education.id } }), previousCount);
      await tx.terraqoBillingAccount.update({ where: { id: expiredPlan.id }, data: { paidThrough: new Date(Date.now() + 3600_000) } });
      await tx.$executeRaw`SAVEPOINT owned_live_capacity`;
      const higherCapacity = await reserveEducationEvidenceInTransaction(tx, token, education.id, { ...payload, size: 4194304 });
      assert.equal(higherCapacity.kind, "reserved");
      assert.equal((await tx.terraqoUsageBucket.findUniqueOrThrow({ where: bucketWhere })).used, 254);
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT owned_live_capacity`;
      await tx.$executeRaw`RELEASE SAVEPOINT owned_live_capacity`;
      assert.equal(await tx.terraqoEducationEvidenceAttempt.count({ where: { educationId: education.id } }), previousCount);
      await tx.terraqoUsageBucket.update({ where: bucketWhere, data: { used: 8 } });
      await tx.verificationToken.delete({ where: { identifier_token: { identifier: grant.identifier, token: grant.token } } });
      await denied(401, () => reserveEducationEvidenceInTransaction(tx, token, education.id, payload));
      assert.equal((await tx.terraqoUsageBucket.findUniqueOrThrow({ where: bucketWhere })).used, 8);
      assert.equal(await tx.terraqoEducationEvidenceAttempt.count({ where: { educationId: education.id } }), previousCount);
      verified = true; throw rollback;
    }, { maxWait: 5000, timeout: 60000 });
  } catch (error) { if (error !== rollback || !verified) throw error; }
  phase = "rollback verification";
  assert.equal(await prisma.user.count({ where: { email } }), 0);
  for (const table of tables) {
    const rows = await prisma.$queryRaw<{ present: string | null }[]>`SELECT to_regclass(${`icc."${table}"`})::text AS present`;
    assert.equal(rows[0].present, null);
  }
  console.log("PASS own SQL rollback-only schema/reservation: restrictive parents, receipt replay after file removal, versions/states/revoked and missing grant, quota/attempt atomic boundary and shared pending floor. Legacy text/private visibility unchanged; fixtures, DDL and temporary own quota/grants rolled back. No blobs, routes or migration ledger touched.");
}
main().catch((error: unknown) => { const value = error as { code?: string; name?: string; meta?: { code?: string } };
  console.error({ phase, code: value.code, databaseCode: value.meta?.code, name: value.name });
  console.error("Education prerequisite verification failed; private diagnostics suppressed."); process.exitCode = 1;
}).finally(() => prisma.$disconnect());
