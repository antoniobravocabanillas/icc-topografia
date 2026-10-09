import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { handleNativeAccountingOperations } from "../lib/server/native-worklog-accounting-operations";
import { executeNativeAccounting } from "../lib/server/native-worklog-accounting-executor";

/** Invoked only after the disposable local runner checks its database marker.
 * A fresh in-memory test secret proves service ordering, not deployed credentials.
 */
export async function testNativeLocalOperations(a: PrismaClient, b: PrismaClient,
  operationId: string, userId: string,
  state: (db: Pick<Prisma.TransactionClient, "$queryRaw">) => Promise<unknown>) {
  const secret = randomBytes(32).toString("hex");
  let executeCalls = 0;
  const ports = (db: PrismaClient) => ({ secret,
    execute: (id: string, budget: Parameters<typeof executeNativeAccounting>[2]) => {
      executeCalls++;
      return executeNativeAccounting(db, id, budget);
    } });
  const request = (body: string, authenticated = true, method = "POST", query = "") =>
    new Request(`https://example.invalid/internal-own-accounting${query}`, { method,
      headers: { "content-type": "application/json", ...(authenticated ? { authorization: `Bearer ${secret}` } : {}) },
      ...(method === "POST" ? { body } : {}) });
  const command = JSON.stringify({ action: "EXECUTE", operationId });
  const baseline = await state(b);
  const unauthorized = request(command, false);
  Object.defineProperty(unauthorized, "body", { get() { throw new Error("BODY_BEFORE_AUTHENTICATION"); } });
  assert.equal((await handleNativeAccountingOperations(unauthorized, ports(a))).status, 401);
  const negatives: [Request, number][] = [
    [request("", true, "GET"), 405],
    [request(command, true, "POST", "?owner=invalid"), 422],
    [request(JSON.stringify({ action: "DISPATCH", operationId })), 422],
    [request('{"action":"EXECUTE","operati\\u006fnId":"' + operationId + '","operationId":"' + operationId + '"}'), 422],
    [request(" ".repeat(1025)), 413],
  ];
  for (const [input, status] of negatives) {
    const result = await handleNativeAccountingOperations(input, ports(a));
    assert.equal(result.status, status);
    assert.equal(result.headers.get("cache-control"), "private, no-store");
    assert.equal(result.headers.get("x-content-type-options"), "nosniff");
  }
  assert.equal(executeCalls, 0);
  assert.deepEqual(await state(b), baseline);

  // Real independent connections and primary transactions. No mocked executor or
  // caller-supplied phase IDs; committed receipt state reconciles the second call.
  const replies = await Promise.all([
    handleNativeAccountingOperations(request(command), ports(a)),
    handleNativeAccountingOperations(request(command), ports(b)),
  ]);
  const outcomes: string[] = [];
  for (const reply of replies) {
    assert.equal(reply.status, 200);
    const dto = await reply.json();
    outcomes.push(dto.result.outcome);
    assert.deepEqual(dto, { result: { outcome: dto.result.outcome,
      retryAuthorized: false, ownerAccessAuthorized: false } });
  }
  assert.deepEqual(outcomes.sort(), ["applied", "applied-history"]);
  const account = await b.terraqoBuilderAccount.findUniqueOrThrow({ where: { userId } });
  assert.deepEqual([account.pendingPoints, account.availablePoints, account.lifetimeEarned,
    account.contributionScore, account.trustScore], [2, 6, 6, 6, 5]);
  assert.equal(await b.terraqoBuilderLedger.count({ where: { accountId: account.id } }), 2);
  const accounting = await b.terraqoNativeWorklogAccounting.findUniqueOrThrow({ where: { operationId } });
  assert.equal(accounting.state, "APPLIED"); assert.equal(accounting.attempts, 0);
  const committed = await state(b);
  const replay = await handleNativeAccountingOperations(request(command), ports(a));
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), { result: { outcome: "applied-history",
    retryAuthorized: false, ownerAccessAuthorized: false } });
  assert.deepEqual(await state(b), committed);

  // A nonexistent random operation never triggers global selection or credits.
  // A rejected primary is not evidence of rollback: the executor keeps uncertainty.
  const missing = await handleNativeAccountingOperations(
    request(JSON.stringify({ action: "EXECUTE", operationId: randomBytes(32).toString("hex") })), ports(a));
  assert.equal(missing.status, 503);
  assert.deepEqual(await missing.json(), { result: { outcome: "uncertain",
    retryAuthorized: false, ownerAccessAuthorized: false } });
  assert.deepEqual(await state(b), committed);
  assert.equal(executeCalls, 4);
  console.log(JSON.stringify({ outcome: "passed", environment: "LOCAL_ISOLATED_ONLY",
    operations_boundary_proved: true, rejected_commands_execute_calls: 0,
    concurrent_requests: 2, accounting_credits: 2, attempts_charged: 0,
    deployed_http_proved: false, production_secret_proved: false }));
}
