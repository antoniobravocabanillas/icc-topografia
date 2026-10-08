import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { getStore } from "@netlify/blobs";
import { WORKLOG_EVIDENCE_STORE } from "../lib/server/media";
import { reserveEducationEvidenceAttempt } from "../lib/server/education-evidence-reservation";
import { uploadEducationEvidence } from "../lib/server/education-evidence-upload";

const database = new PrismaClient({ log: [] }); let phase = "preflight";
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
  assert.equal(process.env.TEST_PORTAL_URL, "https://api.terraqoglobal.com");
  const secret = process.env.PROFESSIONAL_DOCUMENT_CLEANUP_SECRET!; assert.ok(secret?.length >= 32);
  const workerMode = process.env.TERRAQO_EDUCATION_WORKER_TEST === "1";
  const url = "https://api.terraqoglobal.com/api/internal/education-evidence-cleanup";
  const call = (body?: unknown, authorized = true) => fetch(url, { method: body === undefined ? "GET" : "POST",
    redirect: "error", signal: AbortSignal.timeout(55000), headers: {
      ...(authorized ? { authorization: `Bearer ${secret}` } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  // Read-only preflight before creating anything. Never send global DISPATCH
  // to production from this verifier; every POST carries one own attempt ID.
  const preflight = await call(); phase = `preflight HTTP ${preflight.status}`;
  console.log("Operational preflight HTTP", preflight.status, "cache-control", preflight.headers.get("cache-control"));
  assert.equal(preflight.status, 200);
  const cache = preflight.headers.get("cache-control")?.split(",").map(value => value.trim()) ?? [];
  assert.ok(cache.includes("private") && cache.includes("no-store"));
  const health = await preflight.json();
  for (const field of ["pending", "overdue", "quarantined", "watchesDue", "orphaned"])
    assert.ok(Number.isSafeInteger(health.backlog[field]) && health.backlog[field] >= 0);
  assert.equal((await call(undefined, false)).status, 401);
  const workspace = await database.terraqoWorkspace.findFirstOrThrow({ where: { slug: "icc-topografia", active: true,
    companies: { some: { document: "20616116313", deletedAt: null } } }, select: { id: true } });
  const helpers = await import(pathToFileURL(join(process.env.APPDATA!, "npm/node_modules/netlify-cli/dist/utils/command-helpers.js")).href);
  const [providerToken] = await helpers.getToken(); assert.ok(providerToken);
  const store = getStore({ name: WORKLOG_EVIDENCE_STORE, siteID: "2d38524a-44f9-4473-8a1f-9270e03bc2bf",
    token: providerToken, consistency: "strong" });
  const email = `education-operations-${randomUUID()}@example.test`;
  const user = await database.user.create({ data: { email, name: "Fixture propio operación formación", role: "CUSTOMER",
    terraqoMemberships: { create: { workspaceId: workspace.id, role: "PROFESSIONAL", active: true } },
    terraqoProfessionalProfile: { create: { liveCvEnabled: false, education: { create: {
      institution: "Institución propia", degree: "Formación propia", visibility: "PRIVATE", evidence: ["Texto propio"] } } } } },
    select: { id: true, terraqoProfessionalProfile: { select: { id: true, education: { select: { id: true, updatedAt: true } } } } } });
  const education = user.terraqoProfessionalProfile!.education[0], jti = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const token = { sub: user.id, workspaceId: workspace.id, workspaceSlug: "icc-topografia", role: "PROFESSIONAL" as const,
    jti, iat: now, exp: now + 3600 };
  const grant = { identifier: `portal-session:${workspace.id}:${user.id}`, token: createHash("sha256").update(jti).digest("hex"),
    expires: new Date(Date.now() + 3600_000) };
  const bucket = { ownerKey: `user:${user.id}`, period: "retained", metric: "storage-mb" };
  const bytes = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGMsAAAAASUVORK5CYII=", "base64"));
  const keys = new Set<string>();
  try {
    await database.verificationToken.create({ data: grant });
    phase = "targeted HTTP cleanup and concurrent exact refund";
    const reserved = await reserveEducationEvidenceAttempt(database, token, education.id, { size: bytes.length,
      version: education.updatedAt.toISOString(), operationKey: randomBytes(16).toString("hex"),
      fingerprint: createHash("sha256").update(bytes).digest("hex") });
    assert.equal(reserved.kind, "reserved"); if (reserved.kind !== "reserved") throw Error("RESERVE_REQUIRED");
    keys.add(reserved.attempt.storageKey); await store.set(reserved.attempt.storageKey, bytes.buffer);
    const command = { action: "RECOVER", attemptId: reserved.attempt.id };
    if (workerMode) {
      phase = "background target queue and durable completion";
      // Queue receipts do not prove authorization or completion. Observe only
      // this fixture's persisted state, quota and physical key afterwards.
      const queue = () => fetch("https://api.terraqoglobal.com/.netlify/functions/education-evidence-cleanup-background", {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
        headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: JSON.stringify(command) });
      for (const response of await Promise.all(Array.from({ length: 3 }, queue))) {
        assert.equal(response.status, 202); assert.equal(await response.text(), "");
      }
      const deadline = performance.now() + 90000;
      let completed = false;
      while (performance.now() < deadline) {
        const attempt = await database.terraqoEducationEvidenceAttempt.findUniqueOrThrow({ where: { id: reserved.attempt.id } });
        if (attempt.state === "CLEANED") { assert.equal(attempt.reservedUnits, 0); completed = true; break; }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      assert.ok(completed, "BACKGROUND_COMPLETION_REQUIRED");
      assert.equal((await database.terraqoUsageBucket.findUniqueOrThrow({ where: { ownerKey_period_metric: bucket } })).used, 0);
      assert.equal(await store.get(reserved.attempt.storageKey, { type: "arrayBuffer" }), null);
      assert.equal(await database.terraqoEducationEvidenceOperation.count({ where: { educationId: education.id } }), 0);
      assert.equal(await database.activityLog.count({ where: { actorId: user.id, entityType: "EducationEvidence" } }), 0);
      const current = await database.terraqoProfessionalEducation.findUniqueOrThrow({ where: { id: education.id } });
      assert.equal(current.visibility, "PRIVATE"); assert.deepEqual(current.evidence, ["Texto propio"]);
      assert.equal((await database.terraqoProfessionalProfile.findUniqueOrThrow({ where: { id: user.terraqoProfessionalProfile!.id } })).liveCvEnabled, false);
      console.log("PASS deployed background worker: three targeted 202 invocation receipts followed by own SQL CLEANED/units0/quota0 and physical blob absence, no receipt/audit or visibility changes. No global dispatch or cron invoked.");
      return;
    }
    assert.equal((await call(command, false)).status, 401);
    assert.equal((await call({ ...command, force: true })).status, 422);
    assert.equal((await call({ noise: "x".repeat(1100) })).status, 413);
    assert.equal((await database.terraqoEducationEvidenceAttempt.findUniqueOrThrow({ where: { id: reserved.attempt.id } })).state, "RESERVED");
    const replies = await Promise.all(Array.from({ length: 3 }, async () => {
      const response = await call(command); assert.equal(response.status, 200); return (await response.json()).result;
    }));
    assert.equal(replies.filter(result => result === "completed").length, 1);
    assert.ok(replies.every(result => ["completed", "skipped"].includes(result)));
    assert.equal(await store.get(reserved.attempt.storageKey, { type: "arrayBuffer" }), null);
    assert.equal((await database.terraqoUsageBucket.findUniqueOrThrow({ where: { ownerKey_period_metric: bucket } })).used, 0);
    phase = "live reference and quarantine preserved through targeted HTTP";
    const form = new FormData(); form.set("file", new File([bytes], "propio.png", { type: "image/png" }));
    form.set("operationKey", randomBytes(16).toString("hex")); form.set("version", education.updatedAt.toISOString());
    const uploaded = await uploadEducationEvidence(new Request("https://api.terraqoglobal.com/own-internal", { method: "POST", body: form }),
      token, education.id, database, { delete: store.delete.bind(store), set: async (key, data) => { keys.add(key); await store.set(key, data); } });
    const live = await database.terraqoEducationEvidence.findUniqueOrThrow({ where: { id: uploaded.receipt.evidenceId! } });
    const liveAttempt = await database.terraqoEducationEvidenceAttempt.findUniqueOrThrow({ where: { storageKey: live.storageKey } });
    const retained = await call({ action: "RECOVER", attemptId: liveAttempt.id }); assert.equal(retained.status, 200);
    assert.equal((await retained.json()).result, "retained");
    assert.deepEqual(Buffer.from((await store.get(live.storageKey, { type: "arrayBuffer" }))!), Buffer.from(bytes));
    const quarantinedKey = `education-evidence/${education.id}/${randomUUID()}`; keys.add(quarantinedKey);
    const quarantined = await database.terraqoEducationEvidenceAttempt.create({ data: { educationId: education.id, actorId: user.id,
      storageKey: quarantinedKey, operationKey: randomBytes(16).toString("hex"), fingerprint: "a".repeat(64),
      originalVersion: education.updatedAt, size: bytes.length, state: "QUARANTINED", attempts: 8 } });
    const blocked = await call({ action: "RECOVER", attemptId: quarantined.id }); assert.equal(blocked.status, 200);
    assert.equal((await blocked.json()).result, "quarantined");
    assert.equal((await database.terraqoUsageBucket.findUniqueOrThrow({ where: { ownerKey_period_metric: bucket } })).used, 1);
    const current = await database.terraqoProfessionalEducation.findUniqueOrThrow({ where: { id: education.id } });
    assert.equal(current.visibility, "PRIVATE"); assert.deepEqual(current.evidence, ["Texto propio"]);
    assert.equal((await database.terraqoProfessionalProfile.findUniqueOrThrow({ where: { id: user.terraqoProfessionalProfile!.id } })).liveCvEnabled, false);
    console.log("PASS deployed internal education operation HTTP/SQL/private blobs: secret gate, strict body, targeted concurrent cleanup/refund once, live reference retained, quarantine never retried, private aggregate health. No global dispatch or scheduler executed.");
  } finally {
    for (const key of keys) { await store.delete(key); assert.equal(await store.get(key), null); }
    await database.$transaction(async tx => {
      await tx.activityLog.deleteMany({ where: { actorId: user.id, entityType: "EducationEvidence" } });
      await tx.terraqoEducationEvidenceOperation.deleteMany({ where: { educationId: education.id, actorId: user.id } });
      await tx.terraqoEducationEvidence.deleteMany({ where: { educationId: education.id, uploadedById: user.id } });
      await tx.terraqoEducationEvidenceAttempt.deleteMany({ where: { educationId: education.id, actorId: user.id } });
      await tx.verificationToken.deleteMany({ where: { identifier: grant.identifier, token: grant.token } });
      await tx.terraqoUsageBucket.deleteMany({ where: bucket }); await tx.user.delete({ where: { id: user.id, email } });
    }, { timeout: 15000 });
    assert.equal(await database.user.count({ where: { email } }), 0);
    console.log("CLEANUP own operational education fixture: all own blobs and SQL rows removed, no customer/ledger changes.");
  }
}
main().catch(() => { console.error(`Education operation verification failed in ${phase}; private diagnostics suppressed.`); process.exitCode = 1; })
  .finally(() => database.$disconnect());
