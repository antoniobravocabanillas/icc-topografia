import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { getStore } from "@netlify/blobs";
import { WORKLOG_EVIDENCE_STORE } from "../lib/server/media";
import { uploadEducationEvidence } from "../lib/server/education-evidence-upload";

const database = new PrismaClient({ log: [] }); let phase = "preflight";
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
  assert.equal(process.env.TEST_PORTAL_URL, "https://api.terraqoglobal.com");
  const secret = process.env.AUTH_SECRET!; assert.ok(secret?.length >= 32);
  const cleanupSecret = process.env.PROFESSIONAL_DOCUMENT_CLEANUP_SECRET!; assert.ok(cleanupSecret?.length >= 32);
  const base = "https://api.terraqoglobal.com/api/public/workspaces/icc-topografia/portal/education/";
  const call = async (path: string, bearer?: string, body?: string) => {
    const response = await fetch(base + path, { method: body === undefined ? "GET" : "POST", redirect: "error",
      signal: AbortSignal.timeout(55000), headers: { ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        ...(body === undefined ? {} : { "content-type": "application/json" }) }, body });
    const cache = response.headers.get("cache-control")?.split(",").map(value => value.trim()) ?? [];
    assert.ok(cache.includes("private") && cache.includes("no-store")); assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    return response;
  };
  const key = randomBytes(16).toString("hex");
  assert.equal((await call(`own-preflight/evidence/withdrawals?operationKey=${key}`)).status, 401);
  assert.equal((await call("own-preflight/evidence/own-file/withdrawal", undefined, "{}")).status, 401);
  const workspace = await database.terraqoWorkspace.findFirstOrThrow({ where: { slug: "icc-topografia", active: true,
    companies: { some: { document: "20616116313", deletedAt: null } } }, select: { id: true } });
  const helpers = await import(pathToFileURL(join(process.env.APPDATA!, "npm/node_modules/netlify-cli/dist/utils/command-helpers.js")).href);
  const [providerToken] = await helpers.getToken(); assert.ok(providerToken);
  const store = getStore({ name: WORKLOG_EVIDENCE_STORE, siteID: "2d38524a-44f9-4473-8a1f-9270e03bc2bf", token: providerToken, consistency: "strong" });
  const ownIds: string[] = [], keys = new Set<string>(); let educationId: string | undefined;
  const emails = Array.from({ length: 2 }, () => `education-withdrawal-http-${randomUUID()}@example.test`);
  try {
    phase = "own fixtures";
    for (const email of emails) {
      const user = await database.user.create({ data: { email, name: "Fixture propio retirada HTTP formación", role: "CUSTOMER",
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
    const historyPath = `${educationId}/evidence/withdrawals?operationKey=${key}`;
    phase = "null history has no mutation";
    const empty = await call(historyPath, bearer); assert.equal(empty.status, 200); assert.equal((await empty.json()).data.receipt, null);
    assert.equal(await database.terraqoEducationEvidenceAttempt.count({ where: { educationId } }), 0);
    assert.equal((await call(historyPath, legacy)).status, 401); assert.equal((await call(historyPath, other)).status, 404);
    const bytes = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGMsAAAAASUVORK5CYII=", "base64"));
    const uploadKey = randomBytes(16).toString("hex"), form = new FormData();
    form.set("file", new File([bytes], "propio.png", { type: "image/png" })); form.set("operationKey", uploadKey); form.set("version", education.updatedAt.toISOString());
    const upload = await uploadEducationEvidence(new Request("https://api.terraqoglobal.com/own-internal", { method: "POST", body: form }),
      token, educationId, database, { delete: store.delete.bind(store), set: async (storageKey, data) => { keys.add(storageKey); await store.set(storageKey, data); } });
    const file = await database.terraqoEducationEvidence.findUniqueOrThrow({ where: { id: upload.receipt.evidenceId! } });
    const attempt = await database.terraqoEducationEvidenceAttempt.findUniqueOrThrow({ where: { storageKey: file.storageKey } });
    const writePath = `${educationId}/evidence/${file.id}/withdrawal`;
    let input = { version: upload.currentVersion, operationKey: key };
    phase = "strict input and owner isolation";
    assert.equal((await call(writePath, legacy, JSON.stringify(input))).status, 401);
    assert.equal((await call(writePath, other, JSON.stringify(input))).status, 404);
    assert.equal((await call(writePath, bearer, JSON.stringify({ ...input, owner: ownIds[0] }))).status, 422);
    assert.equal((await call(writePath, bearer, `{"version":"${input.version}","version":"${input.version}","operationKey":"${key}"}`)).status, 422);
    assert.equal((await call(writePath, bearer, " ".repeat(1025))).status, 413);
    assert.equal(await database.terraqoEducationEvidenceWithdrawal.count({ where: { educationId } }), 0);
    phase = "protected and stale authority";
    await database.terraqoProfessionalEducation.update({ where: { id: educationId }, data: { verificationStatus: "APPROVED" } });
    assert.equal((await call(writePath, bearer, JSON.stringify(input))).status, 403);
    const editable = await database.terraqoProfessionalEducation.update({ where: { id: educationId }, data: { verificationStatus: "NOT_REQUESTED" } });
    assert.equal((await call(writePath, bearer, JSON.stringify(input))).status, 409); input = { ...input, version: editable.updatedAt.toISOString() };
    await database.terraqoWorkspaceMember.updateMany({ where: { workspaceId: workspace.id, userId: ownIds[0] }, data: { role: "CLIENT" } });
    assert.equal((await call(writePath, bearer, JSON.stringify(input))).status, 401); assert.equal((await call(historyPath, bearer)).status, 401);
    await database.terraqoWorkspaceMember.updateMany({ where: { workspaceId: workspace.id, userId: ownIds[0] }, data: { role: "PROFESSIONAL" } });
    await database.verificationToken.deleteMany({ where: { identifier: `portal-session:${workspace.id}:${ownIds[0]}` } });
    assert.equal((await call(writePath, bearer, JSON.stringify(input))).status, 401); assert.equal((await call(historyPath, bearer)).status, 401);
    await database.verificationToken.create({ data: grantData(ownIds[0], jti) });
    phase = "HTTPS concurrent withdrawal and replay";
    const responses = await Promise.all(Array.from({ length: 3 }, () => call(writePath, bearer, JSON.stringify(input))));
    for (const response of responses) { assert.equal(response.status, 200); const dto = (await response.json()).data;
      assert.equal(dto.receipt.outcome, "WITHDRAWN"); assert.equal(dto.receipt.originalVersion, input.version);
      for (const field of ["actorId", "attemptId", "storageKey", "fingerprint", "uploadOperationId", "bank", "identity", "notes"])
        assert.ok(!JSON.stringify(dto).includes(`"${field}"`)); }
    assert.equal(await database.terraqoEducationEvidenceWithdrawal.count({ where: { educationId } }), 1);
    assert.equal(await database.activityLog.count({ where: { actorId: ownIds[0], entityType: "EducationEvidenceWithdrawal" } }), 1);
    assert.equal(await database.terraqoEducationEvidence.count({ where: { educationId } }), 0);
    assert.equal((await call(writePath, bearer, JSON.stringify({ ...input, version: education.updatedAt.toISOString() }))).status, 409);
    phase = "targeted operational cleanup only own attempt";
    const recovered = await fetch("https://api.terraqoglobal.com/api/internal/education-evidence-cleanup", { method: "POST", redirect: "error",
      signal: AbortSignal.timeout(55000), headers: { authorization: `Bearer ${cleanupSecret}`, "content-type": "application/json" },
      body: JSON.stringify({ action: "RECOVER", attemptId: attempt.id }) });
    assert.equal(recovered.status, 200); assert.ok(["completed", "skipped"].includes((await recovered.json()).result));
    assert.equal(await store.get(file.storageKey), null);
    assert.equal((await database.terraqoUsageBucket.findUniqueOrThrow({ where: { ownerKey_period_metric: {
      ownerKey: `user:${ownIds[0]}`, period: "retained", metric: "storage-mb" } } })).used, 0);
    phase = "separate protected historical receipt";
    await database.terraqoProfessionalEducation.update({ where: { id: educationId }, data: { verificationStatus: "APPROVED" } });
    const history = await call(historyPath, bearer); assert.equal(history.status, 200); const dto = (await history.json()).data;
    assert.equal(dto.current.verificationStatus, "APPROVED"); assert.equal(dto.receipt.outcome, "WITHDRAWN");
    assert.equal((await call(writePath, bearer, JSON.stringify(input))).status, 200);
    const original = await call(`${educationId}/evidence?operationKey=${uploadKey}`, bearer);
    assert.equal(original.status, 200); assert.equal((await original.json()).data.receipt.evidenceId, null);
    assert.equal((await call(`${educationId}/evidence/${file.id}`, bearer)).status, 404);
    assert.equal(await database.activityLog.count({ where: { actorId: ownIds[0], entityType: "EducationEvidenceWithdrawal" } }), 1);
    const unchanged = await database.terraqoProfessionalEducation.findUniqueOrThrow({ where: { id: educationId } });
    assert.equal(unchanged.visibility, "PRIVATE"); assert.deepEqual(unchanged.evidence, ["Texto propio"]);
    assert.equal((await database.terraqoProfessionalProfile.findUniqueOrThrow({ where: { id: profile.id } })).liveCvEnabled, false);
    console.log("PASS HTTPS withdrawal/SQL/private blobs: preflight before fixtures, null no mutation, strict input/auth/legacy/owner/protected/stale/revocation/demotion, three requests one receipt/audit, targeted cleanup and refund, separate protected history/replay/upload SETNULL/download404/private DTO. No global dispatch or cron invoked.");
  } finally {
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
    console.log("CLEANUP only own withdrawal HTTPS fixtures/blobs/SQL removed, parents after withdrawal receipts.");
  }
}
main().catch(() => { console.error({ phase }); console.error("Withdrawal HTTPS verification failed; private diagnostics suppressed."); process.exitCode = 1;
}).finally(() => database.$disconnect());
