import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { parseNativeWorklogPayload } from "../lib/server/native-worklog-payload";
import { planNativeWorklogDecision, saveNativeWorklogDecision } from "../lib/server/native-worklog-decision";
import { chooseNativeFirstWorklogInTransaction, saveNativeFirstWorklogDecision } from "../lib/server/native-worklog-first-decision";
import { inspectNativeLegacyWorklogInventoryInTransaction } from "../lib/server/native-worklog-legacy-inventory";
import { executeNativeAccounting } from "../lib/server/native-worklog-accounting-executor";
import { NativeWorklogBudget } from "../lib/server/native-worklog-budget";

/** Only the guarded disposable LOCAL schema runner. Synthetic historical proofs,
 * not a production worker, JWT/WebAuthn boundary or arbitrary database entrypoint.
 */
export async function testNativeReciprocalWorkers(a: PrismaClient, b: PrismaClient,
  firstUserId: string, workspaceId: string, firstOperationId: string) {
  let secondUserId: string | undefined;
  const validationIds: string[] = [], validationContributions: string[] = [];
  try {
    const user = await a.user.create({ data: { role: "CUSTOMER", name: "ICC own reciprocal author",
      email: `local-reciprocal-${randomUUID()}@example.invalid` } });
    secondUserId = user.id;
    const secondOperationId = createHash("sha256").update(randomUUID()).digest("hex");
    const parsed = await parseNativeWorklogPayload(new Request("https://example.invalid", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ operationKey: "e".repeat(32),
        title: "ICC own reciprocal accounting", summary: "Own reciprocal inventory and accounting fixture, no production flow.",
        outcome: "", type: "FIELD_UPDATE", projectId: "", projectVersion: "" }) }));
    await a.$transaction(async tx => {
      const profile = await tx.terraqoProfessionalProfile.create({ data: { userId: user.id, visibility: "PRIVATE", liveCvEnabled: false } });
      const oldStamp = new Date("2026-08-01T12:00:00.000Z");
      const old = await tx.terraqoWorklogEntry.create({ data: { authorId: user.id, professionalProfileId: profile.id,
        workspaceId, visibility: "PRIVATE", title: "Own second earned legacy", summary: "Synthetic earned history.",
        tqPointsAwarded: 3, createdAt: oldStamp } });
      await tx.terraqoBuilderContribution.create({ data: { userId: user.id, workspaceId,
        type: "BETA_PARTICIPATION", sourceKey: `worklog:${old.id}`, title: "Own second legacy three",
        detail: "Manual saved earned points", approvedPoints: 3, createdAt: oldStamp,
        availableAt: new Date("2026-08-08T12:00:00.000Z") } });
      const stamp = new Date("2026-09-01T12:00:00.000Z");
      const plan = await planNativeWorklogDecision(tx, user.id, parsed, stamp);
      const first = await chooseNativeFirstWorklogInTransaction(tx, user.id, secondOperationId, stamp);
      assert.equal(first.disposition, "INELIGIBLE"); assert.equal(first.priorEntries, 1);
      assert.deepEqual([plan.decision.tqPoints, plan.decision.trustScore], [1, 1]);
      const entry = await tx.terraqoWorklogEntry.create({ data: { authorId: user.id, professionalProfileId: profile.id,
        workspaceId, visibility: "PRIVATE", title: parsed.payload.title, summary: parsed.payload.summary,
        contentFingerprint: plan.contentKey, createdAt: stamp, updatedAt: stamp } });
      await tx.terraqoNativeWorklogOperation.create({ data: { id: secondOperationId, actorId: user.id, workspaceId,
        professionalProfileId: profile.id, operationKey: parsed.payload.operationKey, fingerprint: parsed.fingerprint,
        targetWorklogId: entry.id, worklogId: entry.id, createdAt: stamp, resultVersion: stamp } });
      await saveNativeWorklogDecision(tx, secondOperationId, plan);
      await saveNativeFirstWorklogDecision(tx, secondOperationId, first);
      await tx.terraqoNativeWorklogAuthority.create({ data: { operationId: secondOperationId, actorId: user.id, workspaceId,
        professionalProfileId: profile.id, createdAt: stamp, fingerprint: parsed.fingerprint,
        policyVersion: "native-creation-authority-v1", grantHash: "b".repeat(64), tokenIssuedAt: stamp,
        tokenExpiresAt: new Date("2026-09-02T12:00:00.000Z"), grantExpiresAt: new Date("2026-09-02T12:00:00.000Z"),
        paidThrough: null, role: "PROFESSIONAL", modules: ["LIVE_CV", "PROFESSIONAL_NETWORK"] } });
      await tx.terraqoNativeWorklogAccounting.create({ data: { operationId: secondOperationId, createdAt: stamp, nextAttemptAt: stamp } });
      await tx.terraqoBuilderAccount.create({ data: { userId: user.id, pendingPoints: 5,
        availablePoints: 2, lifetimeEarned: 2, contributionScore: 2, trustScore: 4 } });
      await tx.terraqoBuilderContribution.create({ data: { userId: user.id, type: "BUG_REPORT", title: "Own second future two",
        detail: "Retained future floor", approvedPoints: 2, availableAt: new Date("2099-01-01T00:00:00.000Z") } });
    }, { maxWait: 1000, timeout: 7000 });
    const actors = [firstUserId, user.id], operations = [firstOperationId, secondOperationId];
    const legacyEntries = await a.terraqoWorklogEntry.findMany({ where: { authorId: { in: actors },
      createdAt: { lt: new Date("2026-09-01T00:00:00.000Z") } }, orderBy: { authorId: "asc" } });
    assert.equal(legacyEntries.length, 2);
    for (let index = 0; index < 2; index++) {
      const target = legacyEntries.find(row => row.authorId === actors[1 - index])!;
      const validation = await a.terraqoWorklogValidation.create({ data: { workspaceId, worklogId: target.id,
        requestedByUserId: target.authorId, validatorUserId: actors[index], status: "APPROVED", credentialId: "own-synthetic-reciprocal",
        requestedAt: new Date("2026-08-02T00:00:00.000Z"), createdAt: new Date("2026-08-02T00:00:00.001Z"),
        resolvedAt: new Date("2026-08-03T00:00:00.000Z") } });
      validationIds.push(validation.id);
      const contribution = await a.terraqoBuilderContribution.create({ data: { userId: actors[index],
        type: "EXPERIENCE_VALIDATION", sourceKey: `worklog-validation:${validation.id}`, status: "VALIDATED",
        title: "Own reciprocal saved five", detail: "Synthetic historical credit, not pair counter recalculation.",
        requestedPoints: 5, approvedPoints: 5, createdAt: new Date("2026-08-04T00:00:01.000Z"),
        reviewedAt: new Date("2026-08-04T00:00:02.000Z") } });
      validationContributions.push(contribution.id);
      const account = await a.terraqoBuilderAccount.update({ where: { userId: actors[index] }, data: {
        availablePoints: { increment: 5 }, lifetimeEarned: { increment: 5 }, contributionScore: { increment: 5 } } });
      await a.terraqoBuilderLedger.create({ data: { accountId: account.id, contributionId: contribution.id,
        type: "CREDIT", pointsDelta: 5, scoreDelta: 5, balanceAfter: 7, description: "Own synthetic historical five",
        idempotencyKey: `contribution:${contribution.id}:5`, createdAt: new Date("2026-08-04T00:00:01.999Z") } });
    }
    const validationsBefore = await a.terraqoWorklogValidation.findMany({ where: { id: { in: validationIds } }, orderBy: { id: "asc" } });
    const creditsBefore = await a.terraqoBuilderLedger.findMany({ where: { contributionId: { in: validationContributions } }, orderBy: { id: "asc" } });
    const contributionsBefore = await a.terraqoBuilderContribution.findMany({ where: { id: { in: validationContributions } }, orderBy: { id: "asc" } });
    let ready!: () => void, release!: () => void;
    const bothReady = new Promise<void>(resolve => { ready = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const pids = new Set<number>(); let primaryTransactions = 0, inspected = 0;
    const boundary = (client: PrismaClient, index: number): Pick<PrismaClient, "$transaction"> => new Proxy(client, { get(target, field) {
      if (field !== "$transaction") return Reflect.get(target, field);
      return (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options: { maxWait: number; timeout: number }) =>
        target.$transaction(async tx => {
          primaryTransactions++;
          const [pid] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
          pids.add(pid.pid);
          // Test-only rendezvous AFTER both real inventories acquired their locks,
          // BEFORE either real executor callback starts phases. No runtime bypass.
          const inventory = await inspectNativeLegacyWorklogInventoryInTransaction(tx, operations[index]);
          assert.equal(inventory.unsupported, 0); assert.equal(inventory.historical, 1); assert.equal(inventory.due, 1);
          inspected++;
          if (inspected === 2) ready();
          await gate;
          return callback(tx);
        }, options);
    } });
    const jobs = [a, b].map((client, index) => executeNativeAccounting(boundary(client, index), operations[index], new NativeWorklogBudget()));
    const observed = jobs.map(job => job.then(value => ({ value }), error => ({ error })));
    try {
      await Promise.race([bothReady, ...observed.map(job => job.then(result => { if ("error" in result) throw result.error; }))]);
      assert.equal(pids.size, 2);
      assert.equal(inspected, 2);
    } finally { release(); await Promise.all(observed); }
    const outcomes = await Promise.all(jobs);
    assert.deepEqual(outcomes, actors.map(() => ({ outcome: "applied", retryAuthorized: false, ownerAccessAuthorized: false })));
    assert.equal(primaryTransactions, 2); // No recovery transaction or automatic phase retry.
    for (let index = 0; index < 2; index++) {
      const account = await b.terraqoBuilderAccount.findUniqueOrThrow({ where: { userId: actors[index] } });
      assert.deepEqual([account.pendingPoints, account.availablePoints, account.lifetimeEarned, account.contributionScore, account.trustScore], [2, 11, 11, 11, 5]);
      assert.equal(await b.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 3);
      const outbox = await b.terraqoNativeWorklogAccounting.findUniqueOrThrow({ where: { operationId: operations[index] } });
      assert.equal(outbox.state, "APPLIED"); assert.equal(outbox.attempts, 0); assert.ok(outbox.completedAt);
    }
    assert.equal(await b.terraqoBuilderContribution.count({ where: { userId: { in: actors }, type: "FIRST_WORKLOG" } }), 0);
    assert.deepEqual(await b.terraqoWorklogEntry.findMany({ where: { id: { in: legacyEntries.map(row => row.id) } }, orderBy: { authorId: "asc" } }), legacyEntries);
    assert.deepEqual(await b.terraqoWorklogValidation.findMany({ where: { id: { in: validationIds } }, orderBy: { id: "asc" } }), validationsBefore);
    assert.deepEqual(await b.terraqoBuilderContribution.findMany({ where: { id: { in: validationContributions } }, orderBy: { id: "asc" } }), contributionsBefore);
    assert.deepEqual(await b.terraqoBuilderLedger.findMany({ where: { contributionId: { in: validationContributions } }, orderBy: { id: "asc" } }), creditsBefore);
    const snapshot = async () => (await b.$queryRaw<{ snapshot: unknown }[]>`SELECT jsonb_build_object(
      'accounts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM icc."TerraqoBuilderAccount" r),
      'contributions',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM icc."TerraqoBuilderContribution" r),
      'ledger',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM icc."TerraqoBuilderLedger" r),
      'entries',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM icc."TerraqoWorklogEntry" r),
      'validations',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM icc."TerraqoWorklogValidation" r),
      'receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM icc."TerraqoNativeWorklogOperation" r),
      'decisions',(SELECT jsonb_agg(to_jsonb(r) ORDER BY "operationId") FROM icc."TerraqoNativeWorklogDecision" r),
      'first',(SELECT jsonb_agg(to_jsonb(r) ORDER BY "operationId") FROM icc."TerraqoNativeWorklogFirstDecision" r),
      'authority',(SELECT jsonb_agg(to_jsonb(r) ORDER BY "operationId") FROM icc."TerraqoNativeWorklogAuthority" r),
      'outbox',(SELECT jsonb_agg(to_jsonb(r) ORDER BY "operationId") FROM icc."TerraqoNativeWorklogAccounting" r)) AS snapshot`)[0].snapshot;
    const after = await snapshot();
    assert.deepEqual(await Promise.all([a, b].map((client, index) => executeNativeAccounting(client, operations[index], new NativeWorklogBudget()))),
      actors.map(() => ({ outcome: "applied-history", retryAuthorized: false, ownerAccessAuthorized: false })));
    assert.deepEqual(await snapshot(), after);
    console.log(JSON.stringify({ outcome: "passed", environment: "LOCAL_PG18_ONLY", reciprocal_workers: 2,
      primary_transactions: 2, legacy_entries_unchanged: true, validation_credits_unchanged: true,
      accounting_credits: 4, first_credit: 0, attempts_charged: 0, network_cut_proved: false }));
  } finally {
    await a.terraqoWorklogValidation.deleteMany({ where: { id: { in: validationIds } } });
    await a.terraqoBuilderLedger.deleteMany({ where: { contributionId: { in: validationContributions } } });
    await a.terraqoBuilderContribution.deleteMany({ where: { id: { in: validationContributions } } });
    if (secondUserId) {
      const account = await a.terraqoBuilderAccount.findUnique({ where: { userId: secondUserId } });
      if (account) await a.terraqoBuilderLedger.deleteMany({ where: { accountId: account.id } });
      await a.terraqoNativeWorklogFirstDecision.deleteMany({ where: { actorId: secondUserId } });
      await a.terraqoBuilderContribution.deleteMany({ where: { userId: secondUserId } });
      await a.terraqoBuilderAccount.deleteMany({ where: { userId: secondUserId } });
      await a.terraqoNativeWorklogAuthority.deleteMany({ where: { actorId: secondUserId } });
      await a.terraqoNativeWorklogDecision.deleteMany({ where: { operation: { actorId: secondUserId } } });
      await a.terraqoNativeWorklogAccounting.deleteMany({ where: { operation: { actorId: secondUserId } } });
      await a.terraqoNativeWorklogOperation.deleteMany({ where: { actorId: secondUserId } });
      await a.user.delete({ where: { id: secondUserId } });
      assert.equal(await a.user.count({ where: { id: secondUserId } }), 0);
    }
    assert.equal(await a.terraqoWorklogValidation.count({ where: { id: { in: validationIds } } }), 0);
  }
}
