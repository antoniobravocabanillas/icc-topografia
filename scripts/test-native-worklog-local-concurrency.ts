import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { createNativeWorklog } from "../lib/server/native-worklog-operation";
import { parseNativeWorklogPayload } from "../lib/server/native-worklog-payload";
import { NativeWorklogBudget } from "../lib/server/native-worklog-budget";
import { applyNativeFirstWorklogInTransaction } from "../lib/server/native-worklog-first-award";
import type { WorkspacePortalToken } from "../lib/server/workspace-portal-session";
import { NativeWorklogOperationError } from "../lib/server/native-worklog-http";

/** Test-only committed local schema. Never accepts the production connection.
 * Barriers hold the first callback before commit; pg_blocking_pids proves the
 * second connection actually waits on its locks. No productive automatic retry.
 */
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  const marker = process.env.TERRAQO_LOCAL_SCHEMA_MARKER;
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.pathname, "/terraqo_own_native_schema");
  assert.equal(url.username, "terraqo_own_schema");
  assert.match(marker ?? "", /^[a-f0-9]{32}$/);
  const a = new PrismaClient({ log: [], datasourceUrl: url.toString() });
  const b = new PrismaClient({ log: [], datasourceUrl: url.toString() });
  let userId: string | undefined, workspaceId: string | undefined, companyId: string | undefined;
  let identifier: string | undefined;
  try {
    const [owned] = await a.$queryRaw<{ marker: string }[]>`SELECT marker FROM public.terraqo_owned_schema_test`;
    assert.equal(owned.marker, marker);
    const [settings] = await a.$queryRaw<{ timezone: string }[]>`SELECT current_setting('TimeZone') AS timezone`;
    assert.equal(settings.timezone, "UTC");
    assert.equal(await a.user.count(), 0);
    assert.equal(await a.terraqoWorkspace.count(), 0);
    const workspace = await a.terraqoWorkspace.create({ data: { slug: "icc-topografia", name: "ICC own LOCAL concurrency" } });
    workspaceId = workspace.id;
    const company = await a.company.create({ data: { legalName: "ICC Topografia OWN LOCAL fixture",
      document: "20616116313", terraqoWorkspaceId: workspace.id } });
    companyId = company.id;
    await a.terraqoWorkspaceModule.createMany({ data: ["PROFESSIONAL_NETWORK", "LIVE_CV"].map(code => ({
      workspaceId: workspace.id, active: true, code: code as "PROFESSIONAL_NETWORK" | "LIVE_CV",
    })) });
    const user = await a.user.create({ data: { name: "ICC own LOCAL concurrency",
      email: `local-concurrency-${randomUUID()}@example.invalid`, role: "CUSTOMER" } });
    userId = user.id;
    await a.terraqoProfessionalProfile.create({ data: { userId: user.id, visibility: "PRIVATE", liveCvEnabled: false } });
    await a.terraqoWorkspaceMember.create({ data: { userId: user.id, workspaceId: workspace.id, role: "PROFESSIONAL", active: true } });
    const token: WorkspacePortalToken = { sub: user.id, workspaceId: workspace.id, workspaceSlug: workspace.slug,
      role: "PROFESSIONAL", jti: randomUUID(), iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 };
    identifier = `portal-session:${workspace.id}:${user.id}`;
    await a.verificationToken.create({ data: { identifier,
      token: createHash("sha256").update(token.jti!).digest("hex"), expires: new Date(Date.now() + 3500000) } });
    const parsed = (key: string, title = "ICC creación concurrente propia") => parseNativeWorklogPayload(new Request("https://example.invalid", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operationKey: key,
        title, summary: "Texto temporal propio de concurrencia en base local aislada.", outcome: "", type: "FIELD_UPDATE", projectId: "", projectVersion: "" }),
    }));

    async function blockedPair<T>(action: (db: Pick<PrismaClient, "$transaction">, index: number) => Promise<T>) {
      let firstPid = 0, secondPid = 0;
      let firstReady!: () => void, secondReady!: () => void, release!: () => void;
      const ready = new Promise<void>(resolve => { firstReady = resolve; });
      const entering = new Promise<void>(resolve => { secondReady = resolve; });
      const held = new Promise<void>(resolve => { release = resolve; });
      function boundary(client: PrismaClient, index: number): Pick<PrismaClient, "$transaction"> {
        return new Proxy(client, { get(target, field) {
          if (field !== "$transaction") return Reflect.get(target, field);
          return (callback: (tx: Prisma.TransactionClient) => Promise<T>, options: { maxWait: number; timeout: number }) =>
            target.$transaction(async tx => {
              const [pid] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
              if (index === 0) firstPid = pid.pid;
              else { secondPid = pid.pid; secondReady(); }
              const result = await callback(tx);
              if (index === 0) { firstReady(); await held; }
              return result;
            }, options);
        } });
      }
      const first = action(boundary(a, 0), 0);
      // Attach handlers immediately: a callback failure must not become an unhandled rejection.
      const firstObserved = first.then(value => ({ value }), error => ({ error }));
      let secondObserved: Promise<{ value: T } | { error: unknown }> | undefined;
      try {
        await Promise.race([ready, firstObserved.then(value => { if ("error" in value) throw value.error; })]);
        const second = action(boundary(b, 1), 1);
        secondObserved = second.then(value => ({ value }), error => ({ error }));
        await Promise.race([entering, secondObserved.then(value => { if ("error" in value) throw value.error; })]);
        assert.notEqual(firstPid, secondPid);
        let blocked = false;
        const deadline = performance.now() + 2000;
        while (performance.now() < deadline) {
          const [row] = await a.$queryRaw<{ blocked: boolean }[]>(Prisma.sql`SELECT ${firstPid}::int = ANY(pg_blocking_pids(${secondPid}::int)) AS blocked`);
          if (row.blocked) { blocked = true; break; }
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.equal(blocked, true, "Own second connection must actually block before first commit");
      } finally {
        release();
        // Drain both transactions before cleanup, including a failed blocking assertion.
        await Promise.all([firstObserved, ...(secondObserved ? [secondObserved] : [])]);
      }
      const results = await Promise.all([firstObserved, secondObserved!]);
      for (const value of results) if ("error" in value) throw value.error;
      return results.map(value => (value as { value: T }).value);
    }

    const same = await parsed("a".repeat(32));
    const created = await blockedPair(db => createNativeWorklog(db, token, same, new NativeWorklogBudget()));
    assert.deepEqual(created[1], created[0]);
    assert.equal(await a.terraqoWorklogEntry.count({ where: { authorId: user.id } }), 1);
    assert.equal(await a.terraqoNativeWorklogOperation.count({ where: { actorId: user.id } }), 1);
    assert.equal(await a.activityLog.count({ where: { actorId: user.id } }), 1);
    assert.equal(await a.terraqoNativeWorklogFirstDecision.count({ where: { actorId: user.id, disposition: "RESERVED" } }), 1);
    const different = await Promise.all([parsed("b".repeat(32), "ICC segunda bitácora propia"), parsed("c".repeat(32), "ICC tercera bitácora propia")]);
    await blockedPair((db, index) => createNativeWorklog(db, token, different[index], new NativeWorklogBudget()));
    assert.equal(await a.terraqoNativeWorklogOperation.count({ where: { actorId: user.id } }), 3);
    assert.equal(await a.terraqoNativeWorklogFirstDecision.count({ where: { actorId: user.id, disposition: "EXISTING" } }), 2);
    assert.equal(await a.terraqoBuilderContribution.count({ where: { userId: user.id, type: "FIRST_WORKLOG" } }), 1);
    const receipt = await a.terraqoNativeWorklogOperation.findFirstOrThrow({ where: { actorId: user.id, operationKey: same.payload.operationKey } });
    const outcomes = await blockedPair(db => db.$transaction(tx => applyNativeFirstWorklogInTransaction(tx, receipt.id), { maxWait: 1000, timeout: 7000 }));
    assert.deepEqual(outcomes, ["credited", "historical"]);
    const account = await a.terraqoBuilderAccount.findUniqueOrThrow({ where: { userId: user.id } });
    assert.equal(account.availablePoints, 25); assert.equal(account.lifetimeEarned, 25);
    assert.equal(account.contributionScore, 25); assert.equal(account.pendingPoints, 0);
    assert.equal(await a.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 1);
    await assert.rejects(() => createNativeWorklog(a, token, different[0], new NativeWorklogBudget()).then(async () =>
      createNativeWorklog(a, token, await parsed("b".repeat(32), "ICC payload distinto conflicto"), new NativeWorklogBudget())),
    (error: unknown) => error instanceof NativeWorklogOperationError && error.status === 409);
    assert.equal(await a.terraqoNativeWorklogAccounting.count({ where: { operation: { actorId: user.id }, state: "PENDING" } }), 3);
    assert.equal(await a.terraqoWorklogEntry.count({ where: { authorId: user.id, visibility: "PRIVATE" } }), 3);
    console.log(JSON.stringify({ outcome: "passed", environment: "LOCAL_ISOLATED_ONLY", blocked_pairs: 3,
      same_key_receipts: 1, total_receipts: 3, first_reservations: 1, first_credit: 25, first_ledgers: 1,
      jwt_http_proved: false, cross_owner_proved: false, release_settlement_proved: false }));
  } finally {
    if (userId) {
      const account = await a.terraqoBuilderAccount.findUnique({ where: { userId } });
      if (account) await a.terraqoBuilderLedger.deleteMany({ where: { accountId: account.id } });
      await a.terraqoNativeWorklogFirstDecision.deleteMany({ where: { actorId: userId } });
      await a.terraqoBuilderContribution.deleteMany({ where: { userId } });
      await a.terraqoBuilderAccount.deleteMany({ where: { userId } });
      await a.terraqoNativeWorklogAuthority.deleteMany({ where: { actorId: userId } });
      await a.terraqoNativeWorklogDecision.deleteMany({ where: { operation: { actorId: userId } } });
      await a.terraqoNativeWorklogAccounting.deleteMany({ where: { operation: { actorId: userId } } });
      await a.terraqoNativeWorklogOperation.deleteMany({ where: { actorId: userId } });
      await a.activityLog.deleteMany({ where: { actorId: userId } });
      if (identifier) await a.verificationToken.deleteMany({ where: { identifier } });
      await a.user.delete({ where: { id: userId } });
    }
    if (companyId) await a.company.delete({ where: { id: companyId } });
    if (workspaceId) await a.terraqoWorkspace.delete({ where: { id: workspaceId } });
    assert.equal(await a.user.count(), 0); assert.equal(await a.terraqoWorkspace.count(), 0);
    assert.equal(await a.terraqoBuilderLedger.count(), 0); assert.equal(await a.terraqoNativeWorklogOperation.count(), 0);
    await Promise.all([a.$disconnect(), b.$disconnect()]);
    console.log(JSON.stringify({ own_local_fixtures_absent: true }));
  }
}
main().catch((error: unknown) => {
  const category = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : error instanceof assert.AssertionError ? "assertion" : "unknown";
  const location = error instanceof Error ? error.stack?.match(/test-native-worklog-local-concurrency\.ts:\d+:\d+/)?.[0] : undefined;
  const sqlState = error instanceof Prisma.PrismaClientKnownRequestError && /^[A-Z0-9]{5}$/.test(String(error.meta?.code)) ? error.meta?.code : undefined;
  const privateMessage = error instanceof Error ? error.message : "";
  const diagnostics = ["pg_blocking_pids", "does not exist", "permission denied", "violates", "null value", "invalid input"]
    .filter(value => privateMessage.includes(value));
  const constraint = privateMessage.match(/NativeWorklog[A-Za-z_]+_fk/)?.[0];
  console.error(JSON.stringify({ outcome: "failed", category, location, sqlState, diagnostics, constraint })); process.exitCode = 1;
});
