import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { getStore } from "@netlify/blobs";
import { WORKLOG_EVIDENCE_STORE } from "../lib/server/media";

const database = new PrismaClient({ log: [] }); let phase = "preflight";
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
  assert.equal(process.env.TEST_PORTAL_URL, "https://api.terraqoglobal.com");
  const secret = process.env.AUTH_SECRET!; assert.ok(secret?.length >= 32);
  const cleanupSecret = process.env.PROFESSIONAL_DOCUMENT_CLEANUP_SECRET!; assert.ok(cleanupSecret?.length >= 32);
  const base = "https://api.terraqoglobal.com/api/public/workspaces/icc-topografia/portal/education/";
  const call = async (path: string, bearer?: string, body?: BodyInit) => {
    const response = await fetch(base + path, { method: body === undefined ? "GET" : "POST", redirect: "error",
      signal: AbortSignal.timeout(55000), headers: { ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        ...(typeof body === "string" ? { "content-type": "application/json" } : {}) }, body });
    const cache = response.headers.get("cache-control")?.split(",").map(value => value.trim()) ?? [];
    assert.ok(cache.includes("private") && cache.includes("no-store")); assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    return response;
  };
  const key = randomBytes(16).toString("hex");
  assert.equal((await call(`own-preflight/evidence?operationKey=${key}`)).status, 401);
  assert.equal((await call("own-preflight/evidence", undefined, "{}")).status, 401);
  const workspace = await database.terraqoWorkspace.findFirstOrThrow({ where: { slug: "icc-topografia", active: true,
    companies: { some: { document: "20616116313", deletedAt: null } } }, select: { id: true } });
  const helpers = await import(pathToFileURL(join(process.env.APPDATA!, "npm/node_modules/netlify-cli/dist/utils/command-helpers.js")).href);
  const [providerToken] = await helpers.getToken(); assert.ok(providerToken);
  const store = getStore({ name: WORKLOG_EVIDENCE_STORE, siteID: "2d38524a-44f9-4473-8a1f-9270e03bc2bf", token: providerToken, consistency: "strong" });
  const ownIds: string[] = [], keys = new Set<string>(); let educationId: string | undefined;
  const emails = Array.from({ length: 2 }, () => `education-upload-http-${randomUUID()}@example.test`);
  try {
    phase = "own fixtures";
    for (const email of emails) {
      const user = await database.user.create({ data: { email, name: "Fixture propio carga HTTP formación", role: "CUSTOMER",
        terraqoMemberships: { create: { workspaceId: workspace.id, role: "PROFESSIONAL", active: true } },
        terraqoProfessionalProfile: { create: { liveCvEnabled: false, education: { create: {
          institution: "Institución propia", degree: "Formación propia", visibility: "PRIVATE", evidence: ["Texto propio"] } } } } }, select: { id: true } });
      ownIds.push(user.id);
    }
    const profile = await database.terraqoProfessionalProfile.findUniqueOrThrow({ where: { userId: ownIds[0] }, include: { education: true } });
    const education = profile.education[0]; educationId = education.id;
    const payload = (sub: string, jti?: string) => ({ sub, workspaceId: workspace.id, workspaceSlug: "icc-topografia",
      role: "PROFESSIONAL" as const, jti, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 });
    const sign = (value: object) => {
      const unsigned = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify(value)).toString("base64url")}`;
      return `${unsigned}.${createHmac("sha256", secret).update(unsigned).digest("base64url")}`;
    };
    const grantData = (sub: string, jti: string) => ({ identifier: `portal-session:${workspace.id}:${sub}`,
      token: createHash("sha256").update(jti).digest("hex"), expires: new Date(Date.now() + 3600000) });
    const jti = randomUUID(), otherJti = randomUUID(), token = payload(ownIds[0], jti);
    await database.verificationToken.create({ data: grantData(ownIds[0], jti) });
    await database.verificationToken.create({ data: grantData(ownIds[1], otherJti) });
    const bearer = sign(token), legacy = sign(payload(ownIds[0])), other = sign(payload(ownIds[1], otherJti));
    const writePath = `${educationId}/evidence`;
    const bytes = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGMsAAAAASUVORK5CYII=", "base64"));
    const form = (version: string, op = key, data: Uint8Array = bytes) => {
      const input = new FormData(); input.set("file", new File([data as Uint8Array<ArrayBuffer>], "propio.png", { type: "image/png" }));
      input.set("operationKey", op); input.set("version", version); return input;
    };
    let version = education.updatedAt.toISOString();
    phase = "strict upload input/live authority before mutation";
    assert.equal((await call(writePath, legacy, form(version))).status, 401);
    assert.equal((await call(writePath, other, form(version))).status, 404);
    assert.equal((await call(writePath + "?owner=own", bearer, form(version))).status, 422);
    const extra = form(version); extra.set("owner", ownIds[0]);
    assert.equal((await call(writePath, bearer, extra)).status, 422);
    const duplicate = form(version); duplicate.append("operationKey", key);
    assert.equal((await call(writePath, bearer, duplicate)).status, 422);
    assert.equal((await call(writePath, bearer, form(version, key, new Uint8Array(4 * 1024 * 1024 + 1)))).status, 413);
    await database.terraqoProfessionalEducation.update({ where: { id: educationId }, data: { verificationStatus: "APPROVED" } });
    assert.equal((await call(writePath, bearer, form(version))).status, 403);
    const editable = await database.terraqoProfessionalEducation.update({ where: { id: educationId }, data: { verificationStatus: "NOT_REQUESTED" } });
    assert.equal((await call(writePath, bearer, form(version))).status, 409); version = editable.updatedAt.toISOString();
    await database.terraqoWorkspaceMember.updateMany({ where: { workspaceId: workspace.id, userId: ownIds[0] }, data: { role: "CLIENT" } });
    assert.equal((await call(writePath, bearer, form(version))).status, 401);
    await database.terraqoWorkspaceMember.updateMany({ where: { workspaceId: workspace.id, userId: ownIds[0] }, data: { role: "PROFESSIONAL" } });
    await database.verificationToken.deleteMany({ where: { identifier: `portal-session:${workspace.id}:${ownIds[0]}` } });
    assert.equal((await call(writePath, bearer, form(version))).status, 401);
    await database.verificationToken.create({ data: grantData(ownIds[0], jti) });
    assert.equal(await database.terraqoEducationEvidenceAttempt.count({ where: { educationId } }), 0);
    phase = "maximum four MiB HTTPS binary multipart";
    const large = new Uint8Array(4 * 1024 * 1024); large.set(bytes); // Signature validation only, not malware/image decoding.
    const largeKey = randomBytes(16).toString("hex");
    const maximum = await call(writePath, bearer, form(version, largeKey, large)); assert.equal(maximum.status, 200);
    const maximumDto = (await maximum.json()).data; assert.equal(maximumDto.receipt.size, large.byteLength);
    const largeFile = await database.terraqoEducationEvidence.findUniqueOrThrow({ where: { id: maximumDto.receipt.evidenceId } });
    keys.add(largeFile.storageKey); assert.deepEqual(Buffer.from((await store.get(largeFile.storageKey, { type: "arrayBuffer" }))!), Buffer.from(large));
    const withdrawKey = randomBytes(16).toString("hex");
    assert.equal((await call(`${writePath}/${largeFile.id}/withdrawal`, bearer, JSON.stringify({ version: maximumDto.currentVersion, operationKey: withdrawKey }))).status, 200);
    const recoverOwn = async (attemptId: string) => {
      const result = await fetch("https://api.terraqoglobal.com/api/internal/education-evidence-cleanup", { method: "POST", redirect: "error",
        signal: AbortSignal.timeout(55000), headers: { authorization: `Bearer ${cleanupSecret}`, "content-type": "application/json" },
        body: JSON.stringify({ action: "RECOVER", attemptId }) });
      assert.equal(result.status, 200); assert.ok(["completed", "skipped", "retained"].includes((await result.json()).result));
    };
    const largeAttempt = await database.terraqoEducationEvidenceAttempt.findUniqueOrThrow({ where: { storageKey: largeFile.storageKey } });
    await recoverOwn(largeAttempt.id); assert.equal(await store.get(largeFile.storageKey), null);
    version = (await database.terraqoProfessionalEducation.findUniqueOrThrow({ where: { id: educationId } })).updatedAt.toISOString();
    phase = "concurrent identical HTTPS uploads/idempotent replay";
    const responses = await Promise.all(Array.from({ length: 2 }, () => call(writePath, bearer, form(version))));
    let receiptId: string | undefined;
    for (const response of responses) { assert.equal(response.status, 200); const dto = (await response.json()).data;
      assert.equal(dto.receipt.originalVersion, version); receiptId ??= dto.receipt.evidenceId; assert.equal(dto.receipt.evidenceId, receiptId);
      for (const field of ["actorId", "attemptId", "storageKey", "fingerprint", "cleanupAttemptId", "bank", "identity", "notes"])
        assert.ok(!JSON.stringify(dto).includes(`"${field}"`)); }
    assert.equal(await database.terraqoEducationEvidenceOperation.count({ where: { educationId, operationKey: key } }), 1);
    assert.equal(await database.terraqoEducationEvidence.count({ where: { educationId } }), 1);
    assert.equal(await database.activityLog.count({ where: { actorId: ownIds[0], entityType: "EducationEvidence" } }), 2);
    const attempts = await database.terraqoEducationEvidenceAttempt.findMany({ where: { educationId, actorId: ownIds[0], operationKey: key } });
    for (const attempt of attempts) { keys.add(attempt.storageKey); if (attempt.state !== "COMMITTED") await recoverOwn(attempt.id); }
    const file = await database.terraqoEducationEvidence.findUniqueOrThrow({ where: { id: receiptId! } });
    assert.deepEqual(Buffer.from((await store.get(file.storageKey, { type: "arrayBuffer" }))!), Buffer.from(bytes));
    assert.equal((await database.terraqoUsageBucket.findUniqueOrThrow({ where: { ownerKey_period_metric: { ownerKey: `user:${ownIds[0]}`, period: "retained", metric: "storage-mb" } } })).used, 1);
    assert.equal((await call(writePath, bearer, form(version))).status, 200);
    const changed = new Uint8Array(bytes); changed[changed.length - 1] ^= 1;
    assert.equal((await call(writePath, bearer, form(version, key, changed))).status, 409);
    await database.terraqoProfessionalEducation.update({ where: { id: educationId }, data: { verificationStatus: "APPROVED" } });
    assert.equal((await call(writePath, bearer, form(version))).status, 200);
    const history = await call(`${writePath}?operationKey=${key}`, bearer); assert.equal(history.status, 200);
    assert.equal((await history.json()).data.current.verificationStatus, "APPROVED");
    assert.equal(await database.activityLog.count({ where: { actorId: ownIds[0], entityType: "EducationEvidence" } }), 2);
    const unchanged = await database.terraqoProfessionalEducation.findUniqueOrThrow({ where: { id: educationId } });
    assert.equal(unchanged.visibility, "PRIVATE"); assert.deepEqual(unchanged.evidence, ["Texto propio"]);
    assert.equal((await database.terraqoProfessionalProfile.findUniqueOrThrow({ where: { id: profile.id } })).liveCvEnabled, false);
    console.log("PASS HTTPS upload/SQL/private blobs: auth/input/protected/stale/revocation/owner, actual four MiB multipart gateway and exact physical bytes, concurrent one receipt/file/audit, directed own loser recovery/refund, replay/history/minimal DTO/PRIVATE text/CV. No global dispatch or manual cron.");
  } finally {
    if (educationId) {
      const attempts = await database.terraqoEducationEvidenceAttempt.findMany({ where: { educationId, actorId: { in: ownIds } } });
      for (const attempt of attempts) { assert.ok(attempt.storageKey.startsWith(`education-evidence/${educationId}/`)); keys.add(attempt.storageKey); }
    }
    for (const storageKey of keys) { await store.delete(storageKey); assert.equal(await store.get(storageKey), null); }
    await database.$transaction(async tx => {
      await tx.activityLog.deleteMany({ where: { actorId: { in: ownIds }, entityType: { in: ["EducationEvidence", "EducationEvidenceWithdrawal"] } } });
      if (educationId) {
        await tx.terraqoEducationEvidenceWithdrawal.deleteMany({ where: { educationId, actorId: { in: ownIds } } });
        await tx.terraqoEducationEvidenceOperation.deleteMany({ where: { educationId, actorId: { in: ownIds } } });
        await tx.terraqoEducationEvidence.deleteMany({ where: { educationId, uploadedById: { in: ownIds } } });
        await tx.terraqoEducationEvidenceAttempt.deleteMany({ where: { educationId, actorId: { in: ownIds } } });
      }
      for (const id of ownIds) {
        await tx.verificationToken.deleteMany({ where: { identifier: `portal-session:${workspace.id}:${id}` } });
        await tx.terraqoUsageBucket.deleteMany({ where: { ownerKey: `user:${id}`, period: "retained", metric: "storage-mb" } });
      }
      await tx.user.deleteMany({ where: { id: { in: ownIds }, email: { in: emails } } });
    }, { maxWait: 5000, timeout: 15000 });
    assert.equal(await database.user.count({ where: { email: { in: emails } } }), 0);
    if (educationId) assert.equal(await database.terraqoEducationEvidenceWithdrawal.count({ where: { educationId } }), 0);
    console.log("CLEANUP only own upload HTTPS fixtures/blobs/SQL removed, parents after withdrawal receipts.");
  }
}
main().catch(() => { console.error({ phase }); console.error("Upload HTTPS verification failed; private diagnostics suppressed."); process.exitCode = 1;
}).finally(() => database.$disconnect());
