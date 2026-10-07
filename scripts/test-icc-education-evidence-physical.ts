import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient, type Prisma } from "@prisma/client";
import { getStore } from "@netlify/blobs";
import { WORKLOG_EVIDENCE_STORE } from "../lib/server/media";
import { EducationEvidenceReservationError, reserveEducationEvidenceAttempt } from "../lib/server/education-evidence-reservation";
import { commitEducationEvidenceAttempt } from "../lib/server/education-evidence-commit";
import { dispatchEducationEvidenceCleanup, recoverEducationEvidenceAttempt } from "../lib/server/education-evidence-cleanup";
import { uploadEducationEvidence } from "../lib/server/education-evidence-upload";

// Separate direct clients exercise committed boundaries, not savepoints. Never
// print credentials, SQL rows, blob keys or failed provider request objects.
const first = new PrismaClient({ log: [] }), second = new PrismaClient({ log: [] });
let phase = "scope";
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
  assert.equal(process.env.TEST_PORTAL_URL, "https://api.terraqoglobal.com");
  const workspace = await first.terraqoWorkspace.findFirstOrThrow({ where: { slug: "icc-topografia", active: true,
    deletedAt: null, companies: { some: { document: "20616116313", deletedAt: null } } }, select: { id: true } });
  for (const table of ["TerraqoEducationEvidence", "TerraqoEducationEvidenceOperation", "TerraqoEducationEvidenceAttempt"])
    assert.ok((await first.$queryRaw<{ present: string | null }[]>`SELECT to_regclass(${`icc."${table}"`})::text AS present`)[0].present);
  const helpers = await import(pathToFileURL(join(process.env.APPDATA!, "npm/node_modules/netlify-cli/dist/utils/command-helpers.js")).href);
  const [providerToken] = await helpers.getToken(); assert.ok(providerToken);
  const store = getStore({ name: WORKLOG_EVIDENCE_STORE, siteID: "2d38524a-44f9-4473-8a1f-9270e03bc2bf",
    token: providerToken, consistency: "strong" });
  if (process.argv.includes("--cleanup-interrupted")) {
    // Recovery for exactly one recently interrupted run of THIS verifier only.
    // Refuse ambiguous/old fixture selection and validate every physical key.
    const own = await first.user.findMany({ where: { email: { startsWith: "education-physical-", endsWith: "@example.test" },
      name: "Fixture propio formación física", createdAt: { gte: new Date(Date.now() - 30 * 60_000) },
      terraqoMemberships: { some: { workspaceId: workspace.id, role: "PROFESSIONAL" } } }, include: {
      terraqoProfessionalProfile: { include: { education: true } },
    } });
    assert.equal(own.length, 1, "Interrupted fixture selection must be unambiguous");
    const target = own[0]; const entries = target.terraqoProfessionalProfile!.education;
    assert.equal(entries.length, 1);
    const entry = entries[0];
    const attempts = await first.terraqoEducationEvidenceAttempt.findMany({ where: { educationId: entry.id } });
    assert.ok(attempts.every(value => value.actorId === target.id &&
      value.storageKey.startsWith(`education-evidence/${entry.id}/`)));
    for (const value of attempts) { await store.delete(value.storageKey); assert.equal(await store.get(value.storageKey), null); }
    await first.$transaction(async tx => {
      await tx.activityLog.deleteMany({ where: { actorId: target.id, entityType: "EducationEvidence" } });
      await tx.terraqoEducationEvidenceOperation.deleteMany({ where: { educationId: entry.id, actorId: target.id } });
      await tx.terraqoEducationEvidence.deleteMany({ where: { educationId: entry.id, uploadedById: target.id } });
      await tx.terraqoEducationEvidenceAttempt.deleteMany({ where: { educationId: entry.id, actorId: target.id } });
      await tx.verificationToken.deleteMany({ where: { identifier: `portal-session:${workspace.id}:${target.id}` } });
      await tx.terraqoUsageBucket.deleteMany({ where: { ownerKey: `user:${target.id}`, period: "retained", metric: "storage-mb" } });
      await tx.user.delete({ where: { id: target.id, email: target.email! } });
    });
    assert.equal(await first.user.count({ where: { id: target.id } }), 0);
    console.log("CLEANUP interrupted own verifier fixture removed; no customer data touched."); return;
  }
  const email = `education-physical-${randomUUID()}@example.test`;
  const user = await first.user.create({ data: { email, name: "Fixture propio formación física", role: "CUSTOMER",
    terraqoMemberships: { create: { workspaceId: workspace.id, role: "PROFESSIONAL", active: true } },
    terraqoProfessionalProfile: { create: { liveCvEnabled: false, education: { create: {
      institution: "Institución propia", degree: "Formación propia", visibility: "PRIVATE", evidence: ["Texto propio"],
    } } } } }, select: { id: true, terraqoProfessionalProfile: { select: { id: true,
      education: { select: { id: true, updatedAt: true } } } } } });
  const education = user.terraqoProfessionalProfile!.education[0];
  const now = Math.floor(Date.now() / 1000), jti = randomUUID();
  const token = { sub: user.id, workspaceId: workspace.id, workspaceSlug: "icc-topografia", role: "PROFESSIONAL" as const,
    jti, iat: now, exp: now + 3600 };
  const grant = { identifier: `portal-session:${workspace.id}:${user.id}`, token: createHash("sha256").update(jti).digest("hex"),
    expires: new Date(Date.now() + 3600_000) };
  const keys = new Set<string>();
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGMsAAAAASUVORK5CYII=", "base64");
  const file = { fileName: "propio.png", contentType: "image/png", size: bytes.length,
    fingerprint: createHash("sha256").update(bytes).update("propio.png:image/png").digest("hex") };
  const bucket = { ownerKey: `user:${user.id}`, period: "retained", metric: "storage-mb" };
  const used = async () => (await first.terraqoUsageBucket.findUniqueOrThrow({ where: { ownerKey_period_metric: bucket } })).used;
  const prepare = async (client: PrismaClient, operationKey = randomBytes(16).toString("hex"), version?: string) => {
    const current = version ?? (await first.terraqoProfessionalEducation.findUniqueOrThrow({ where: { id: education.id } })).updatedAt.toISOString();
    const result = await reserveEducationEvidenceAttempt(client, token, education.id,
      { size: file.size, fingerprint: file.fingerprint, operationKey, version: current });
    assert.equal(result.kind, "reserved");
    if (result.kind !== "reserved") throw Error("Own reservation unavailable");
    keys.add(result.attempt.storageKey); return result.attempt;
  };
  const write = async (key: string) => { assert.ok(keys.has(key)); await store.set(key, Uint8Array.from(bytes).buffer); };
  const read = async (key: string) => { assert.ok(keys.has(key)); return store.get(key, { type: "arrayBuffer" }); };
  const denied = (status: number, action: () => Promise<unknown>) => assert.rejects(action,
    error => error instanceof EducationEvidenceReservationError && error.status === status);
  try {
    await first.verificationToken.create({ data: grant });
    phase = "concurrent reservations on independently held connections";
    const operationKey = randomBytes(16).toString("hex"), version = education.updatedAt.toISOString();
    const [a, b] = await Promise.all([prepare(first, operationKey, version), prepare(second, operationKey, version)]);
    assert.notEqual(a.storageKey, b.storageKey); assert.equal(await used(), 2);
    await Promise.all([write(a.storageKey), write(b.storageKey)]);
    phase = "concurrent commit winner and historical loser";
    const results = await Promise.all([commitEducationEvidenceAttempt(first, token, education.id, a.id, file),
      commitEducationEvidenceAttempt(second, token, education.id, b.id, file)]);
    assert.deepEqual(results.map(value => value.kind).sort(), ["committed", "receipt"]);
    assert.equal(results[0].receipt.id, results[1].receipt.id);
    const loserId = results.find(value => value.kind === "receipt")!.cleanupAttemptId!;
    const winner = loserId === a.id ? b : a, loser = loserId === a.id ? a : b;
    assert.equal(await first.terraqoEducationEvidenceOperation.count({ where: { educationId: education.id } }), 1);
    assert.equal(await first.activityLog.count({ where: { actorId: user.id, entityType: "EducationEvidence" } }), 1);
    const recovery = await Promise.all([recoverEducationEvidenceAttempt(first, loser.id, store),
      recoverEducationEvidenceAttempt(second, loser.id, store)]);
    assert.deepEqual(recovery.sort(), ["completed", "skipped"]); assert.equal(await used(), 1);
    assert.equal(await read(loser.storageKey), null); assert.deepEqual(Buffer.from((await read(winner.storageKey))!), bytes);
    assert.equal(await recoverEducationEvidenceAttempt(second, winner.id, store), "retained");
    phase = "lost delivery after actual SQL commit (controlled caller fault)";
    await assert.rejects(async () => { await commitEducationEvidenceAttempt(second, token, education.id, winner.id, file);
      throw Error("CONTROLLED_REPLY_LOST"); }, /CONTROLLED_REPLY_LOST/);
    const replay = await commitEducationEvidenceAttempt(first, token, education.id, winner.id, file);
    assert.equal(replay.kind, "receipt"); assert.equal(replay.receipt.id, results[0].receipt.id);
    assert.equal(await used(), 1);
    phase = "revocation interleaved after physical write";
    const revoked = await prepare(first); await write(revoked.storageKey);
    await second.verificationToken.deleteMany({ where: { identifier: grant.identifier, token: grant.token } });
    await denied(401, () => commitEducationEvidenceAttempt(first, token, education.id, revoked.id, file));
    assert.equal(await recoverEducationEvidenceAttempt(second, revoked.id, store), "completed");
    assert.equal(await read(revoked.storageKey), null); assert.equal(await used(), 1);
    await first.verificationToken.create({ data: grant });
    phase = "delete deadline persists retry before releasing physical delete";
    const slow = await prepare(first); await write(slow.storageKey);
    let started!: () => void, release!: () => void, removed!: () => void;
    const deleting = new Promise<void>(resolve => { started = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const deleted = new Promise<void>(resolve => { removed = resolve; });
    const pending = recoverEducationEvidenceAttempt(first, slow.id, { delete: async key => {
      assert.equal(key, slow.storageKey); started(); await gate;
      try { await store.delete(key); } finally { removed(); }
    } });
    await deleting;
    // A second connection sees the first transaction's committed fence while
    // the external deletion is still waiting inside the second transaction.
    try {
      assert.equal((await second.terraqoEducationEvidenceAttempt.findUniqueOrThrow({ where: { id: slow.id } })).state, "CLEANUP_PENDING");
      assert.equal(await pending, "retry");
      const afterDeadline = await second.terraqoEducationEvidenceAttempt.findUniqueOrThrow({ where: { id: slow.id } });
      assert.equal(afterDeadline.state, "CLEANUP_PENDING"); assert.equal(afterDeadline.attempts, 1);
      assert.ok(afterDeadline.nextAttemptAt); assert.equal(afterDeadline.reservedUnits, 1);
      await denied(409, () => commitEducationEvidenceAttempt(second, token, education.id, slow.id, file));
    } finally { release(); }
    assert.equal(await pending, "retry");
    await deleted;
    assert.equal(await read(slow.storageKey), null);
    assert.equal(await used(), 2);
    await denied(409, () => commitEducationEvidenceAttempt(second, token, education.id, slow.id, file));
    assert.equal(await recoverEducationEvidenceAttempt(second, slow.id, store), "skipped");
    await second.terraqoEducationEvidenceAttempt.update({ where: { id: slow.id }, data: { nextAttemptAt: new Date(0) } });
    assert.equal(await recoverEducationEvidenceAttempt(second, slow.id, store), "completed"); assert.equal(await used(), 1);
    phase = "late physical write without rearm callback; durable tombstone watch";
    // An actual provider write after CLEANED, without invoking lateWrite. This
    // models an absent worker callback; it is not a killed-process experiment.
    await write(slow.storageKey);
    assert.equal(await recoverEducationEvidenceAttempt(first, slow.id, store), "skipped");
    assert.ok(await read(slow.storageKey));
    await second.terraqoEducationEvidenceAttempt.update({ where: { id: slow.id }, data: { nextAttemptAt: new Date(0) } });
    assert.equal(await recoverEducationEvidenceAttempt(first, slow.id, store), "completed");
    assert.equal(await used(), 1); assert.equal(await read(slow.storageKey), null);
    const retained = await first.terraqoProfessionalEducation.findUniqueOrThrow({ where: { id: education.id } });
    assert.equal(retained.visibility, "PRIVATE"); assert.deepEqual(retained.evidence, ["Texto propio"]);
    assert.equal((await first.terraqoProfessionalProfile.findUniqueOrThrow({ where: { id: user.terraqoProfessionalProfile!.id } })).liveCvEnabled, false);
    assert.equal(await first.terraqoEducationEvidence.count({ where: { educationId: education.id } }), 1);
    assert.equal(await first.activityLog.count({ where: { actorId: user.id, entityType: "EducationEvidence" } }), 1);
    phase = "orchestrator concurrent upload and no-store historical replay";
    const uploadKey = randomBytes(16).toString("hex");
    const uploadVersion = retained.updatedAt.toISOString();
    const request = (key = uploadKey, current = uploadVersion) => {
      const form = new FormData(); form.set("file", new File([bytes], "propio.png", { type: "image/png" }));
      form.set("operationKey", key); form.set("version", current);
      return new Request("https://api.terraqoglobal.com/own-internal-fixture", { method: "POST", body: form });
    };
    const physicalStore = { delete: store.delete.bind(store), set: async (key: string, data: ArrayBuffer) => {
      assert.ok(key.startsWith(`education-evidence/${education.id}/`)); keys.add(key); await store.set(key, data);
    } };
    let arrivals = 0, releaseUploads!: () => void;
    const bothReserved = new Promise<void>(resolve => { releaseUploads = resolve; });
    const concurrentStore = { ...physicalStore, set: async (key: string, data: ArrayBuffer) => {
      if (++arrivals === 2) releaseUploads(); await bothReserved; await physicalStore.set(key, data);
    } };
    const uploads = await Promise.all([uploadEducationEvidence(request(), token, education.id, first, concurrentStore),
      uploadEducationEvidence(request(), token, education.id, second, concurrentStore)]);
    assert.deepEqual(uploads.map(value => value.kind).sort(), ["committed", "receipt"]);
    assert.equal(uploads[0].receipt.id, uploads[1].receipt.id); assert.equal(await used(), 2);
    assert.equal(await first.terraqoEducationEvidence.count({ where: { educationId: education.id } }), 2);
    const noStore = { set: async () => { throw Error("REPLAY_MUST_NOT_WRITE"); }, delete: async () => { throw Error("REPLAY_MUST_NOT_DELETE"); } };
    assert.equal((await uploadEducationEvidence(request(), token, education.id, first, noStore)).kind, "receipt");
    phase = "orchestrator store reply failure compensates its exact attempt";
    const freshVersion = (await first.terraqoProfessionalEducation.findUniqueOrThrow({ where: { id: education.id } })).updatedAt.toISOString();
    await assert.rejects(uploadEducationEvidence(request(randomBytes(16).toString("hex"), freshVersion), token, education.id, first, {
      ...physicalStore, set: async (key, data) => { await physicalStore.set(key, data); throw Error("CONTROLLED_STORE_REPLY_LOST"); },
    }), /CONTROLLED_STORE_REPLY_LOST/);
    assert.equal(await used(), 2); assert.equal(await first.terraqoEducationEvidence.count({ where: { educationId: education.id } }), 2);
    phase = "orchestrator SQL acknowledgement loss retains committed reference";
    const uncertainKey = randomBytes(16).toString("hex");
    const uncertainDatabase = new Proxy(first, { get(target, property) {
      if (property !== "$transaction") return Reflect.get(target, property, target);
      return new Proxy(target.$transaction, { apply(transaction, _receiver, argumentsList) {
        return Reflect.apply(transaction, target, argumentsList).then((value: unknown) => {
          if ((value as { kind?: string })?.kind === "committed") throw Error("CONTROLLED_SQL_REPLY_LOST");
          return value;
        });
      } });
    } });
    await assert.rejects(uploadEducationEvidence(request(uncertainKey, freshVersion), token, education.id, uncertainDatabase, physicalStore),
      /CONTROLLED_SQL_REPLY_LOST/);
    assert.equal(await used(), 3);
    const confirmed = await first.terraqoEducationEvidenceOperation.findUniqueOrThrow({ where: {
      educationId_operationKey: { educationId: education.id, operationKey: uncertainKey } } });
    const confirmedFile = await first.terraqoEducationEvidence.findUniqueOrThrow({ where: { id: confirmed.evidenceId! } });
    assert.deepEqual(Buffer.from((await read(confirmedFile.storageKey))!), bytes);
    assert.equal((await uploadEducationEvidence(request(uncertainKey, freshVersion), token, education.id, second, noStore)).receipt.id, confirmed.id);
    assert.equal(await first.activityLog.count({ where: { actorId: user.id, entityType: "EducationEvidence" } }), 3);
    console.log("PASS internal education orchestrator Request/SQL/private blobs: concurrent loser compensated, historical replay never touches store, actual stored-file acknowledgement fault refunded once, controlled post-commit SQL acknowledgement fault retains live blob and reconciles receipt. Not deployed HTTP.");
    phase = "dispatcher admission budget against only own fixture IDs";
    const batch = await first.terraqoEducationEvidenceAttempt.createManyAndReturn({ data: Array.from({ length: 5 }, () => {
      const storageKey = `education-evidence/${education.id}/${randomUUID()}`; keys.add(storageKey);
      return { educationId: education.id, actorId: user.id, operationKey: randomBytes(16).toString("hex"),
        fingerprint: file.fingerprint, originalVersion: retained.updatedAt, storageKey, size: file.size,
        state: "CLEANUP_PENDING", reservedUnits: 0 };
    }), select: { id: true } });
    const batchIds = batch.map(value => value.id);
    // Scope every selector inside dispatcher transactions to these five own
    // IDs. Never execute a global runner against production recovery rows.
    const scoped = new Proxy(first, { get(target, property) {
      if (property !== "$transaction") return Reflect.get(target, property, target);
      return new Proxy(target.$transaction, { apply(transaction, _receiver, args) {
        const callback = args[0] as (tx: Prisma.TransactionClient) => Promise<unknown>;
        return Reflect.apply(transaction, target, [(tx: Prisma.TransactionClient) => callback(new Proxy(tx, {
          get(txTarget, key) {
            if (key !== "terraqoEducationEvidenceAttempt") return Reflect.get(txTarget, key, txTarget);
            const delegate = txTarget.terraqoEducationEvidenceAttempt;
            return new Proxy(delegate, { get(model, method) {
              if (method !== "findMany") return Reflect.get(model, method, model);
              return new Proxy(model.findMany, { apply(query, _modelReceiver, queryArgs) {
                const input = queryArgs[0];
                return Reflect.apply(query, model, [{ ...input, where: { AND: [input.where ?? {},
                  { educationId: education.id, id: { in: batchIds } }] } }]);
              } });
            } });
          },
        })), args[1]]);
      } });
    } });
    const dispatched = await dispatchEducationEvidenceCleanup(scoped, { delete: async key => {
      const row = await second.terraqoEducationEvidenceAttempt.findUniqueOrThrow({ where: { storageKey: key } });
      assert.ok(batchIds.includes(row.id)); return new Promise<void>(() => undefined);
    } });
    assert.equal(dispatched.selected, 5); assert.ok(dispatched.processed > 0 && dispatched.processed < 5);
    assert.equal(dispatched.deferred, 5 - dispatched.processed);
    assert.equal(dispatched.counts.retry, dispatched.processed); assert.equal(await used(), 3);
    console.log("PASS scoped dispatcher: slow external deletes persist retry without refund, admission budget defers remainder; only five own fixture IDs selected, no global runner.");
    console.log("PASS education physical store and independent transactions: winner/loser, concurrent refund once, references, controlled lost reply, revocation, 5s delete deadline durable retry and late physical write watch. Historical 15s SQL-timeout proof remains in prior commit; no HTTP/process-kill claim.");
  } finally {
    // Explicitly scoped disposable fixture cleanup. No global dispatcher or
    // tombstone purge in production; only this newly created user's rows/keys.
    for (const key of keys) { await store.delete(key); assert.equal(await read(key), null); }
    await first.$transaction(async tx => {
      await tx.activityLog.deleteMany({ where: { actorId: user.id, entityType: "EducationEvidence" } });
      await tx.terraqoEducationEvidenceOperation.deleteMany({ where: { educationId: education.id, actorId: user.id } });
      await tx.terraqoEducationEvidence.deleteMany({ where: { educationId: education.id, uploadedById: user.id } });
      await tx.terraqoEducationEvidenceAttempt.deleteMany({ where: { educationId: education.id, actorId: user.id } });
      await tx.verificationToken.deleteMany({ where: { identifier: grant.identifier, token: grant.token } });
      await tx.terraqoUsageBucket.deleteMany({ where: bucket });
      await tx.user.delete({ where: { id: user.id, email } });
    }, { timeout: 15000 });
    assert.equal(await first.user.count({ where: { email } }), 0);
    assert.equal(await first.terraqoEducationEvidenceAttempt.count({ where: { educationId: education.id } }), 0);
    assert.equal(await first.terraqoUsageBucket.count({ where: bucket }), 0);
    console.log("CLEANUP own education fixture: blobs, attempts, receipts, file, audit, grant, quota and user removed; no customer rows or migration ledger touched.");
  }
}
main().catch((error: unknown) => {
  const value = error as { code?: string; name?: string };
  console.error({ phase, code: value.code, name: value.name });
  console.error("Education physical verification failed; private diagnostics suppressed."); process.exitCode = 1;
}).finally(async () => { await Promise.all([first.$disconnect(), second.$disconnect()]); });
