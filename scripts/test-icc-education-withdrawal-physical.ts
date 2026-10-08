import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient, type Prisma } from "@prisma/client";
import { getStore } from "@netlify/blobs";
import { WORKLOG_EVIDENCE_STORE } from "../lib/server/media";
import { reserveEducationEvidenceAttempt } from "../lib/server/education-evidence-reservation";
import { commitEducationEvidenceAttempt } from "../lib/server/education-evidence-commit";
import { withdrawEducationEvidence } from "../lib/server/education-evidence-withdrawal";
import { recoverEducationEvidenceAttempt } from "../lib/server/education-evidence-cleanup";

const first = new PrismaClient({ log: [] }), second = new PrismaClient({ log: [] });
let phase = "scope";
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
  assert.equal(process.env.TEST_PORTAL_URL, "https://api.terraqoglobal.com");
  const workspace = await first.terraqoWorkspace.findFirstOrThrow({ where: { slug: "icc-topografia", active: true,
    deletedAt: null, companies: { some: { document: "20616116313", deletedAt: null } } }, select: { id: true } });
  assert.ok((await first.$queryRaw<{ present: string | null }[]>`SELECT to_regclass('icc."TerraqoEducationEvidenceWithdrawal"')::text AS present`)[0].present);
  const helpers = await import(pathToFileURL(join(process.env.APPDATA!, "npm/node_modules/netlify-cli/dist/utils/command-helpers.js")).href);
  const [providerToken] = await helpers.getToken(); assert.ok(providerToken);
  const store = getStore({ name: WORKLOG_EVIDENCE_STORE, siteID: "2d38524a-44f9-4473-8a1f-9270e03bc2bf", token: providerToken, consistency: "strong" });
  const email = `education-withdrawal-physical-${randomUUID()}@example.test`;
  const user = await first.user.create({ data: { email, name: "Fixture propio retirada física formación", role: "CUSTOMER",
    terraqoMemberships: { create: { workspaceId: workspace.id, role: "PROFESSIONAL", active: true } },
    terraqoProfessionalProfile: { create: { liveCvEnabled: false, education: { create: {
      institution: "Institución propia", degree: "Formación propia", visibility: "PRIVATE", evidence: ["Texto propio"],
    } } } } }, select: { id: true, terraqoProfessionalProfile: { select: { id: true, education: { select: { id: true } } } } } });
  const educationId = user.terraqoProfessionalProfile!.education[0].id;
  const now = Math.floor(Date.now() / 1000), jti = randomUUID();
  const token = { sub: user.id, workspaceId: workspace.id, workspaceSlug: "icc-topografia", role: "PROFESSIONAL" as const, jti, iat: now, exp: now + 3600 };
  const grant = { identifier: `portal-session:${workspace.id}:${user.id}`, token: createHash("sha256").update(jti).digest("hex"), expires: new Date(Date.now() + 3600_000) };
  const keys = new Set<string>();
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGMsAAAAASUVORK5CYII=", "base64");
  const bucket = { ownerKey: `user:${user.id}`, period: "retained", metric: "storage-mb" };
  const used = async () => (await first.terraqoUsageBucket.findUniqueOrThrow({ where: { ownerKey_period_metric: bucket } })).used;
  const read = async (key: string) => { assert.ok(keys.has(key)); return store.get(key, { type: "arrayBuffer" }); };
  const port = { delete: async (key: string) => { assert.ok(keys.has(key)); await store.delete(key); } };
  const upload = async () => {
    const version = (await first.terraqoProfessionalEducation.findUniqueOrThrow({ where: { id: educationId } })).updatedAt.toISOString();
    const file = { fileName: "propio.png", contentType: "image/png", size: bytes.length,
      fingerprint: createHash("sha256").update(JSON.stringify(["education-evidence-v1", createHash("sha256").update(bytes).digest("hex"), "propio.png", "image/png", bytes.length, version])).digest("hex") };
    const reserved = await reserveEducationEvidenceAttempt(first, token, educationId, { ...file, version, operationKey: randomBytes(16).toString("hex") });
    assert.equal(reserved.kind, "reserved"); if (reserved.kind !== "reserved") throw Error("Own reservation unavailable");
    keys.add(reserved.attempt.storageKey);
    await store.set(reserved.attempt.storageKey, Uint8Array.from(bytes).buffer);
    const committed = await commitEducationEvidenceAttempt(first, token, educationId, reserved.attempt.id, file);
    return { attempt: reserved.attempt, committed, input: { evidenceId: committed.receipt.evidenceId!, version: committed.currentVersion, operationKey: randomBytes(16).toString("hex") } };
  };
  try {
    await first.verificationToken.create({ data: grant });
    const a = await upload();
    phase = "live reference retained before withdrawal";
    assert.equal(await recoverEducationEvidenceAttempt(second, a.attempt.id, port), "retained");
    assert.deepEqual(Buffer.from((await read(a.attempt.storageKey))!), bytes); assert.equal(await used(), 1);
    phase = "concurrent withdrawals on independent clients";
    const results = await Promise.all([withdrawEducationEvidence(first, token, educationId, a.input),
      withdrawEducationEvidence(second, token, educationId, a.input)]);
    assert.equal(results.filter(value => value.kind === "withdrawn").length, 1);
    assert.equal(results.filter(value => value.kind === "receipt").length, 1);
    assert.equal(results[0].receipt.id, results[1].receipt.id);
    assert.equal(await first.terraqoEducationEvidenceWithdrawal.count({ where: { educationId } }), 1);
    assert.equal(await first.activityLog.count({ where: { actorId: user.id, entityType: "EducationEvidenceWithdrawal" } }), 1);
    assert.equal(await first.terraqoEducationEvidence.count({ where: { educationId } }), 0);
    assert.equal((await second.terraqoEducationEvidenceAttempt.findUniqueOrThrow({ where: { id: a.attempt.id } })).state, "CLEANUP_PENDING");
    assert.equal(await used(), 1); assert.deepEqual(Buffer.from((await read(a.attempt.storageKey))!), bytes);
    phase = "concurrent targeted cleanup refunds once";
    const cleanup = await Promise.all([recoverEducationEvidenceAttempt(first, a.attempt.id, port),
      recoverEducationEvidenceAttempt(second, a.attempt.id, port)]);
    assert.equal(cleanup.filter(value => value === "completed").length, 1);
    assert.equal(cleanup.filter(value => value === "skipped").length, 1);
    assert.equal(await used(), 0); assert.equal(await read(a.attempt.storageKey), null);
    const b = await upload();
    phase = "controlled lost reply after committed withdrawal";
    let committed = false;
    const lostReply = new Proxy(first, { get(target, key) {
      if (key !== "$transaction") return Reflect.get(target, key, target);
      return async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options: unknown) => {
        await target.$transaction(callback, options as { maxWait: number; timeout: number });
        committed = true; throw new Error("CONTROLLED_REPLY_LOST_AFTER_COMMIT");
      };
    } });
    await assert.rejects(() => withdrawEducationEvidence(lostReply, token, educationId, b.input), /CONTROLLED_REPLY_LOST_AFTER_COMMIT/);
    assert.ok(committed);
    assert.equal((await second.terraqoEducationEvidenceAttempt.findUniqueOrThrow({ where: { id: b.attempt.id } })).state, "CLEANUP_PENDING");
    assert.equal(await used(), 1); assert.deepEqual(Buffer.from((await read(b.attempt.storageKey))!), bytes);
    const replay = await withdrawEducationEvidence(second, token, educationId, b.input);
    assert.equal(replay.kind, "receipt");
    assert.equal(await first.activityLog.count({ where: { actorId: user.id, entityType: "EducationEvidenceWithdrawal" } }), 2);
    assert.equal(await recoverEducationEvidenceAttempt(second, b.attempt.id, port), "completed");
    assert.equal(await used(), 0); assert.equal(await read(b.attempt.storageKey), null);
    assert.equal((await withdrawEducationEvidence(first, token, educationId, a.input)).kind, "receipt");
    assert.equal((await first.terraqoEducationEvidenceOperation.findUniqueOrThrow({ where: { id: a.committed.receipt.id } })).evidenceId, null);
    const education = await first.terraqoProfessionalEducation.findUniqueOrThrow({ where: { id: educationId } });
    assert.equal(education.visibility, "PRIVATE"); assert.deepEqual(education.evidence, ["Texto propio"]);
    assert.equal((await first.terraqoProfessionalProfile.findUniqueOrThrow({ where: { id: user.terraqoProfessionalProfile!.id } })).liveCvEnabled, false);
    console.log("PASS withdrawal SQL/private physical blobs: two independent clients produce one withdrawal/receipt/audit; committed pending fence retains charge/blob; targeted concurrent cleanup refunds once; controlled lost SQL reply reconciles history without duplicate audit/refund. No HTTP, network cut, process kill or global dispatcher claimed.");
  } finally {
    for (const key of keys) { await port.delete(key); assert.equal(await read(key), null); }
    await first.$transaction(async tx => {
      await tx.activityLog.deleteMany({ where: { actorId: user.id, entityType: { in: ["EducationEvidence", "EducationEvidenceWithdrawal"] } } });
      await tx.terraqoEducationEvidenceWithdrawal.deleteMany({ where: { educationId, actorId: user.id } });
      await tx.terraqoEducationEvidenceOperation.deleteMany({ where: { educationId, actorId: user.id } });
      await tx.terraqoEducationEvidence.deleteMany({ where: { educationId, uploadedById: user.id } });
      await tx.terraqoEducationEvidenceAttempt.deleteMany({ where: { educationId, actorId: user.id } });
      await tx.verificationToken.deleteMany({ where: { identifier: grant.identifier, token: grant.token } });
      await tx.terraqoUsageBucket.deleteMany({ where: bucket });
      await tx.user.delete({ where: { id: user.id, email } });
    }, { maxWait: 5000, timeout: 15000 });
    assert.equal(await first.user.count({ where: { email } }), 0);
    assert.equal(await first.terraqoEducationEvidenceWithdrawal.count({ where: { educationId } }), 0);
    assert.equal(await first.terraqoEducationEvidenceAttempt.count({ where: { educationId } }), 0);
    assert.equal(await first.terraqoUsageBucket.count({ where: bucket }), 0);
    console.log("CLEANUP own withdrawal fixture: physical blobs and withdrawal/upload receipts, attempts, audits, grant, quota, user removed.");
  }
}
main().catch(() => { console.error({ phase }); console.error("Withdrawal physical verification failed; private diagnostics suppressed."); process.exitCode = 1;
}).finally(async () => { await Promise.all([first.$disconnect(), second.$disconnect()]); });
