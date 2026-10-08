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
  const base = "https://api.terraqoglobal.com/api/public/workspaces/icc-topografia/portal/education/";
  const call = (path: string, bearer?: string, method = "GET") => fetch(base + path, { method, redirect: "error",
    signal: AbortSignal.timeout(55000), headers: bearer ? { authorization: `Bearer ${bearer}` } : {} });
  const privateHeaders = (response: Response) => {
    const cache = response.headers.get("cache-control")?.split(",").map(value => value.trim()) ?? [];
    assert.ok(cache.includes("private") && cache.includes("no-store"));
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  };
  const preflight = await call("own-preflight/evidence"); phase = `preflight HTTP ${preflight.status}`;
  assert.equal(preflight.status, 401); privateHeaders(preflight);
  const workspace = await database.terraqoWorkspace.findFirstOrThrow({ where: { slug: "icc-topografia", active: true,
    companies: { some: { document: "20616116313", deletedAt: null } } }, select: { id: true } });
  const helpers = await import(pathToFileURL(join(process.env.APPDATA!, "npm/node_modules/netlify-cli/dist/utils/command-helpers.js")).href);
  const [providerToken] = await helpers.getToken(); assert.ok(providerToken);
  const store = getStore({ name: WORKLOG_EVIDENCE_STORE, siteID: "2d38524a-44f9-4473-8a1f-9270e03bc2bf",
    token: providerToken, consistency: "strong" });
  const ownIds: string[] = [], keys = new Set<string>();
  const emails = Array.from({ length: 2 }, () => `education-owner-${randomUUID()}@example.test`);
  let educationId: string | undefined;
  try {
    phase = "own fixtures";
    for (const email of emails) {
      const user = await database.user.create({ data: { email, name: "Fixture propio lectura formación", role: "CUSTOMER",
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
    const bearer = sign(token), other = sign(payload(ownIds[1], otherJti)), path = `${education.id}/evidence`;
    phase = "HTTP null observation and strict query/legacy";
    const absent = await call(path + "?operationKey=" + randomBytes(16).toString("hex"), bearer);
    assert.equal(absent.status, 200); privateHeaders(absent); assert.equal((await absent.json()).data.receipt, null);
    assert.equal(await database.terraqoEducationEvidenceAttempt.count({ where: { educationId } }), 0);
    assert.equal((await call(path + "?owner=" + ownIds[0], bearer)).status, 422);
    const legacy = await call(path, sign(payload(ownIds[0]))); assert.equal(legacy.status, 401); privateHeaders(legacy);
    assert.match((await legacy.json()).error.message, /iniciar tu sesión/);
    assert.equal((await call(path, other)).status, 404);
    // Upload is now supported; a body without multipart must still fail before
    // any reservation. The previous read-only 405 proof remains historical.
    const write = await call(path, bearer, "POST"); assert.equal(write.status, 415); privateHeaders(write);
    const bytes = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGMsAAAAASUVORK5CYII=", "base64"));
    const operationKey = randomBytes(16).toString("hex"), form = new FormData();
    form.set("file", new File([bytes], "propio.png", { type: "image/png" }));
    form.set("operationKey", operationKey); form.set("version", education.updatedAt.toISOString());
    const uploaded = await uploadEducationEvidence(new Request("https://api.terraqoglobal.com/own-internal", { method: "POST", body: form }),
      token, education.id, database, { delete: store.delete.bind(store), set: async (key, data) => { keys.add(key); await store.set(key, data); } });
    const file = await database.terraqoEducationEvidence.findUniqueOrThrow({ where: { id: uploaded.receipt.evidenceId! } });
    phase = "HTTP protected read and exact download";
    await database.terraqoProfessionalEducation.update({ where: { id: education.id }, data: { verificationStatus: "APPROVED" } });
    const listed = await call(path + "?operationKey=" + operationKey, bearer);
    phase = `protected listing HTTP ${listed.status}`; assert.equal(listed.status, 200); privateHeaders(listed);
    const dto = (await listed.json()).data;
    phase = "protected listing DTO projection";
    assert.equal(dto.current.verificationStatus, "APPROVED"); assert.equal(dto.files.length, 1);
    assert.equal(dto.receipt.evidenceId, file.id); assert.equal(dto.receipt.originalVersion, education.updatedAt.toISOString());
    for (const forbidden of ["storageKey", "fingerprint", "actorId", "uploadedById", "userId", "notes", "bank", "identity"])
      assert.ok(!JSON.stringify(dto).includes(`"${forbidden}"`));
    const downloaded = await call(`${path}/${file.id}`, bearer);
    phase = `protected download HTTP ${downloaded.status}`; assert.equal(downloaded.status, 200); privateHeaders(downloaded);
    phase = "protected download attachment";
    assert.ok(downloaded.headers.get("content-disposition")?.startsWith("attachment;"));
    phase = `protected download type ${downloaded.headers.get("content-type")}`;
    assert.equal(downloaded.headers.get("content-type"), "image/png");
    // A streaming gateway may remove Content-Length. Integrity is measured
    // from actual bytes; any declared length still must match exactly.
    const declared = downloaded.headers.get("content-length");
    phase = `protected download declared length ${declared}`;
    if (declared !== null) assert.equal(declared, String(bytes.length));
    phase = "protected download exact physical bytes";
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), Buffer.from(bytes));
    phase = "protected download other own owner denied";
    assert.equal((await call(`${path}/${file.id}`, other)).status, 404);
    phase = "HTTP own corruption/role/grant revocation";
    await store.set(file.storageKey, Uint8Array.from(bytes, value => value ^ 1).buffer);
    const corrupt = await call(`${path}/${file.id}`, bearer); assert.equal(corrupt.status, 409); privateHeaders(corrupt);
    await store.set(file.storageKey, bytes.buffer);
    await database.terraqoWorkspaceMember.updateMany({ where: { userId: ownIds[0], workspaceId: workspace.id }, data: { role: "CLIENT" } });
    assert.equal((await call(path, bearer)).status, 401); assert.equal((await call(`${path}/${file.id}`, bearer)).status, 401);
    await database.terraqoWorkspaceMember.updateMany({ where: { userId: ownIds[0], workspaceId: workspace.id }, data: { role: "PROFESSIONAL" } });
    await database.verificationToken.deleteMany({ where: {
      identifier: `portal-session:${workspace.id}:${ownIds[0]}`, token: createHash("sha256").update(jti).digest("hex") } });
    assert.equal((await call(path, bearer)).status, 401); assert.equal((await call(`${path}/${file.id}`, bearer)).status, 401);
    await database.verificationToken.create({ data: grantData(ownIds[0], jti) });
    phase = "HTTP historical receipt after own SQL fixture withdrawal";
    // Test fixture removal only: no production withdrawal endpoint is claimed.
    await database.terraqoEducationEvidence.delete({ where: { id: file.id } });
    const historical = await call(path + "?operationKey=" + operationKey, bearer); assert.equal(historical.status, 200);
    const history = (await historical.json()).data; assert.equal(history.receipt.evidenceId, null); assert.equal(history.files.length, 0);
    assert.equal(history.receipt.originalVersion, education.updatedAt.toISOString());
    assert.equal((await call(`${path}/${file.id}`, bearer)).status, 404);
    assert.equal(await database.terraqoEducationEvidenceOperation.count({ where: { educationId } }), 1);
    assert.equal(await database.activityLog.count({ where: { actorId: ownIds[0], entityType: "EducationEvidence" } }), 1);
    const current = await database.terraqoProfessionalEducation.findUniqueOrThrow({ where: { id: education.id } });
    assert.equal(current.visibility, "PRIVATE"); assert.deepEqual(current.evidence, ["Texto propio"]);
    assert.equal((await database.terraqoProfessionalProfile.findUniqueOrThrow({ where: { id: profile.id } })).liveCvEnabled, false);
    console.log("PASS owner HTTPS/SQL/private blobs: null GET no attempt, strict query/legacy/write denied, other own owner denied, APPROVED read/exact bytes/private DTO, corrupt own bytes rejected, own demotion/revocation, historical receipt after own SQL fixture removal. No upload/withdrawal HTTP or global dispatch tested.");
  } finally {
    for (const key of keys) { await store.delete(key); assert.equal(await store.get(key), null); }
    for (const userId of ownIds) {
      const owned = await database.terraqoProfessionalEducation.findMany({ where: { professionalProfile: { userId } }, select: { id: true } });
      await database.$transaction(async tx => {
        await tx.activityLog.deleteMany({ where: { actorId: userId, entityType: "EducationEvidence" } });
        for (const item of owned) {
          await tx.terraqoEducationEvidenceOperation.deleteMany({ where: { educationId: item.id, actorId: userId } });
          await tx.terraqoEducationEvidence.deleteMany({ where: { educationId: item.id, uploadedById: userId } });
          await tx.terraqoEducationEvidenceAttempt.deleteMany({ where: { educationId: item.id, actorId: userId } });
        }
        await tx.verificationToken.deleteMany({ where: { identifier: `portal-session:${workspace.id}:${userId}` } });
        await tx.terraqoUsageBucket.deleteMany({ where: { ownerKey: `user:${userId}`, period: "retained", metric: "storage-mb" } });
        await tx.user.delete({ where: { id: userId, email: emails[ownIds.indexOf(userId)] } });
      }, { timeout: 15000 });
    }
    assert.equal(await database.user.count({ where: { email: { in: emails } } }), 0);
    console.log("CLEANUP own owner education fixtures: private blobs/SQL rows removed exclusively for newly created own IDs.");
  }
}
main().catch(() => { console.error(`Owner education HTTP test failed in ${phase}; private diagnostics suppressed.`); process.exitCode = 1; })
  .finally(() => database.$disconnect());
