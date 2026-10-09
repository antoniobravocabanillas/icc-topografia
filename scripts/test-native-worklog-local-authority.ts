import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { blockedNativePair } from "./native-worklog-local-barrier";
import { createNativeWorklog, readNativeWorklog } from "../lib/server/native-worklog-operation";
import { parseNativeWorklogPayload } from "../lib/server/native-worklog-payload";
import { NativeWorklogBudget } from "../lib/server/native-worklog-budget";
import { NativeWorklogOperationError } from "../lib/server/native-worklog-http";
import type { WorkspacePortalToken } from "../lib/server/workspace-portal-session";

/** Only the guarded empty local schema. Real SQL grants/membership, typed tokens:
 * JWT/HTTP authentication and cross-owner validation-inventory deadlocks are not proved.
 */
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.pathname, "/terraqo_own_native_schema");
  assert.equal(url.username, "terraqo_own_schema");
  assert.match(process.env.TERRAQO_LOCAL_SCHEMA_MARKER ?? "", /^[a-f0-9]{32}$/);
  const a = new PrismaClient({ log: [], datasourceUrl: url.toString() }), b = new PrismaClient({ log: [], datasourceUrl: url.toString() });
  const actors: string[] = [], identifiers: string[] = [];
  let workspaceId: string | undefined, companyId: string | undefined;
  try {
    const [own] = await a.$queryRaw<{ marker: string }[]>`SELECT marker FROM public.terraqo_owned_schema_test`;
    assert.equal(own.marker, process.env.TERRAQO_LOCAL_SCHEMA_MARKER);
    const [settings] = await a.$queryRaw<{ timezone: string }[]>`SELECT current_setting('TimeZone') AS timezone`;
    assert.equal(settings.timezone, "UTC"); assert.equal(await a.user.count(), 0); assert.equal(await a.terraqoWorkspace.count(), 0);
    const workspace = await a.terraqoWorkspace.create({ data: { slug: "icc-topografia", name: "ICC own LOCAL authority" } });
    workspaceId = workspace.id;
    companyId = (await a.company.create({ data: { legalName: "ICC Topografia OWN LOCAL fixture", document: "20616116313", terraqoWorkspaceId: workspace.id } })).id;
    await a.terraqoWorkspaceModule.createMany({ data: ["LIVE_CV", "PROFESSIONAL_NETWORK"].map(code => ({
      workspaceId: workspace.id, active: true, code: code as "LIVE_CV" | "PROFESSIONAL_NETWORK",
    })) });
    const tokens: WorkspacePortalToken[] = [];
    for (let index = 0; index < 2; index++) {
      const user = await a.user.create({ data: { name: "ICC own LOCAL authority", role: "CUSTOMER",
        email: `local-authority-${randomUUID()}@example.invalid` } });
      actors.push(user.id);
      await a.terraqoProfessionalProfile.create({ data: { userId: user.id, visibility: "PRIVATE", liveCvEnabled: false } });
      await a.terraqoWorkspaceMember.create({ data: { userId: user.id, workspaceId: workspace.id, role: "PROFESSIONAL", active: true } });
      const token: WorkspacePortalToken = { sub: user.id, workspaceId: workspace.id, workspaceSlug: workspace.slug,
        role: "PROFESSIONAL", jti: randomUUID(), iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 };
      tokens.push(token); identifiers.push(`portal-session:${workspace.id}:${user.id}`);
    }
    async function ownGrant(index: number) {
      await a.verificationToken.create({ data: { identifier: identifiers[index],
        token: createHash("sha256").update(tokens[index].jti!).digest("hex"), expires: new Date(Date.now() + 3500000) } });
    }
    await ownGrant(0); await ownGrant(1);
    const parse = (key: string, title: string) => parseNativeWorklogPayload(new Request("https://example.invalid", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ operationKey: key, title,
        summary: "Own local concurrency proof with live SQL grants and membership.", outcome: "", type: "FIELD_UPDATE", projectId: "", projectVersion: "" }) }));
    const same = await parse("a".repeat(32), "ICC same key separate owners");
    let arriving = 0, release!: () => void;
    const ready = new Promise<void>(resolve => { release = resolve; });
    const pids: number[] = [];
    function simultaneous(client: PrismaClient): Pick<PrismaClient, "$transaction"> {
      return new Proxy(client, { get(target, field) {
        if (field !== "$transaction") return Reflect.get(target, field);
        return (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options: { maxWait: number; timeout: number }) =>
          target.$transaction(async tx => {
            const [pid] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid,txid_current() AS xid`;
            pids.push(pid.pid); if (++arriving === 2) release();
            await ready; return callback(tx);
          }, options);
      } });
    }
    const results = await Promise.all([createNativeWorklog(simultaneous(a), tokens[0], same, new NativeWorklogBudget()),
      createNativeWorklog(simultaneous(b), tokens[1], same, new NativeWorklogBudget())]);
    assert.equal(new Set(pids).size, 2);
    assert.notEqual(results[0].receipt?.worklogId, results[1].receipt?.worklogId);
    for (let index = 0; index < 2; index++) {
      assert.deepEqual(await readNativeWorklog(a, tokens[index], same.payload.operationKey, new NativeWorklogBudget()), results[index]);
      assert.equal(await a.terraqoNativeWorklogOperation.count({ where: { actorId: actors[index] } }), 1);
      assert.equal(await a.terraqoNativeWorklogFirstDecision.count({ where: { actorId: actors[index], disposition: "RESERVED" } }), 1);
    }
    const unavailable = await parse("b".repeat(32), "ICC revoked before creation");
    const reject = (status: number) => (error: unknown) => error instanceof NativeWorklogOperationError && error.status === status;
    await assert.rejects(() => blockedNativePair<unknown>(a, b, (db, index) => index === 0 ?
      db.$transaction(tx => tx.verificationToken.deleteMany({ where: { identifier: identifiers[0] } }), { maxWait: 1000, timeout: 7000 }) :
      createNativeWorklog(db, tokens[0], unavailable, new NativeWorklogBudget())), reject(401));
    assert.equal(await a.terraqoNativeWorklogOperation.count(), 2);
    assert.equal(await a.verificationToken.count({ where: { identifier: identifiers[0] } }), 0);
    await ownGrant(0);
    await assert.rejects(() => blockedNativePair<unknown>(a, b, (db, index) => index === 0 ?
      db.$transaction(tx => tx.terraqoWorkspaceMember.updateMany({ where: { workspaceId: workspace.id, userId: actors[0] },
        data: { role: "CLIENT" } }), { maxWait: 1000, timeout: 7000 }) :
      createNativeWorklog(db, tokens[0], unavailable, new NativeWorklogBudget())), reject(403));
    assert.equal(await a.terraqoNativeWorklogOperation.count(), 2);
    await a.terraqoWorkspaceMember.updateMany({ where: { workspaceId: workspace.id, userId: actors[0] }, data: { role: "PROFESSIONAL" } });
    // Revoke AFTER authorization: the SQL share lock orders the deletion after the commit.
    await blockedNativePair<unknown>(a, b, (db, index) => index === 0 ?
      createNativeWorklog(db, tokens[0], unavailable, new NativeWorklogBudget()) :
      db.$transaction(tx => tx.verificationToken.deleteMany({ where: { identifier: identifiers[0] } }), { maxWait: 1000, timeout: 7000 }));
    assert.equal(await a.terraqoNativeWorklogOperation.count(), 3);
    await assert.rejects(() => readNativeWorklog(a, tokens[0], unavailable.payload.operationKey, new NativeWorklogBudget()), reject(401));
    assert.equal(await a.verificationToken.count({ where: { identifier: identifiers[0] } }), 0);
    await ownGrant(0);
    const last = await parse("c".repeat(32), "ICC demotion after authorization");
    await blockedNativePair<unknown>(a, b, (db, index) => index === 0 ?
      createNativeWorklog(db, tokens[0], last, new NativeWorklogBudget()) :
      db.$transaction(tx => tx.terraqoWorkspaceMember.updateMany({ where: { workspaceId: workspace.id, userId: actors[0] },
        data: { role: "CLIENT" } }), { maxWait: 1000, timeout: 7000 }));
    await assert.rejects(() => readNativeWorklog(a, tokens[0], last.payload.operationKey, new NativeWorklogBudget()), reject(403));
    assert.equal(await a.terraqoNativeWorklogOperation.count(), 4);
    assert.equal(await a.activityLog.count(), 4);
    assert.equal(await a.terraqoBuilderAccount.count(), 0); assert.equal(await a.terraqoBuilderLedger.count(), 0);
    assert.equal(await a.terraqoNativeWorklogAuthority.count(), 4);
    assert.equal(await a.terraqoNativeWorklogAccounting.count({ where: { state: "PENDING" } }), 4);
    assert.equal(await a.terraqoWorklogEntry.count({ where: { visibility: "PRIVATE" } }), 4);
    console.log(JSON.stringify({ outcome: "passed", environment: "LOCAL_PG18_ONLY", blocked_pairs: 4,
      owner_key_isolation: true, grant_revoked_before_create: 401, role_demoted_before_create: 403,
      revoke_after_commit_denies_read: true, demote_after_commit_denies_read: true,
      new_grants_from_read: 0, accounting_credits: 0, jwt_http_proved: false, validation_cross_owner_proved: false }));
  } finally {
    try {
      for (const userId of actors) {
        await a.terraqoNativeWorklogFirstDecision.deleteMany({ where: { actorId: userId } });
        await a.terraqoBuilderContribution.deleteMany({ where: { userId } });
        await a.terraqoNativeWorklogAuthority.deleteMany({ where: { actorId: userId } });
        await a.terraqoNativeWorklogDecision.deleteMany({ where: { operation: { actorId: userId } } });
        await a.terraqoNativeWorklogAccounting.deleteMany({ where: { operation: { actorId: userId } } });
        await a.terraqoNativeWorklogOperation.deleteMany({ where: { actorId: userId } });
        await a.activityLog.deleteMany({ where: { actorId: userId } });
        await a.user.delete({ where: { id: userId } });
      }
      await a.verificationToken.deleteMany({ where: { identifier: { in: identifiers } } });
      if (companyId) await a.company.delete({ where: { id: companyId } });
      if (workspaceId) await a.terraqoWorkspace.delete({ where: { id: workspaceId } });
      for (const count of await Promise.all([a.user.count(), a.company.count(), a.terraqoWorkspace.count(),
        a.verificationToken.count(), a.activityLog.count(), a.terraqoWorklogEntry.count(), a.terraqoBuilderContribution.count(),
        a.terraqoNativeWorklogOperation.count(), a.terraqoNativeWorklogFirstDecision.count(), a.terraqoNativeWorklogAuthority.count(),
        a.terraqoNativeWorklogDecision.count(), a.terraqoNativeWorklogAccounting.count()])) assert.equal(count, 0);
      console.log(JSON.stringify({ own_local_fixtures_absent: true }));
    } finally { await Promise.all([a.$disconnect(), b.$disconnect()]); }
  }
}
main().catch((error: unknown) => {
  const category = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : error instanceof assert.AssertionError ? "assertion" : "unknown";
  const location = error instanceof Error ? error.stack?.match(/(?:test-native-worklog-local-authority|native-worklog-local-barrier)\.ts:\d+:\d+/)?.[0] : undefined;
  console.error(JSON.stringify({ outcome: "failed", category, location })); process.exitCode = 1;
});
