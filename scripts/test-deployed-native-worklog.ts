import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

let prisma: (typeof import("../lib/prisma"))["prisma"];

let stage = "configuration";
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
  assert.equal(process.env.TEST_PORTAL_URL, "https://api.terraqoglobal.com");
  assert.ok(process.env.AUTH_SECRET);
  const [prismaModule, sessionModule] = await Promise.all([
    import("../lib/prisma"),
    import("../lib/server/workspace-portal-session"),
  ]);
  prisma = prismaModule.prisma;
  const { createRevocablePortalToken, createWorkspacePortalToken } = sessionModule;
  const workspace = await prisma.terraqoWorkspace.findFirstOrThrow({ where: { slug: "icc-topografia", active: true, deletedAt: null,
    companies: { some: { document: "20616116313", deletedAt: null } } }, select: { id: true } });
  const actors: string[] = [], bearers: string[] = [], identities: { sub: string; workspaceId: string; workspaceSlug: string; role: "PROFESSIONAL" }[] = [];
  const endpoint = `${process.env.TEST_PORTAL_URL}/api/public/workspaces/icc-topografia/portal/native-worklogs`;
  const key = randomUUID().replaceAll("-", "");
  const payload = { operationKey: key, title: "Bitácora privada de validación propia",
    summary: "Registro temporal exclusivo para comprobar la frontera HTTPS de bitácoras nativas.",
    outcome: "", type: "FIELD_UPDATE", projectId: "", projectVersion: "" };
  async function call(method: string, owner = 0, body = payload, query = "", bearer = bearers[owner]) {
    return fetch(endpoint + query, { method, redirect: "error", signal: AbortSignal.timeout(55000),
      headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
      ...(method === "POST" ? { body: JSON.stringify(body) } : {}) });
  }
  try {
    stage = "own-fixtures";
    for (let index = 0; index < 2; index++) {
      const actor = await prisma.user.create({ data: { name: "OWN native HTTPS validation", role: "CUSTOMER",
        email: `own-native-https-${randomUUID()}@example.invalid`,
        terraqoProfessionalProfile: { create: { visibility: "PRIVATE", liveCvEnabled: false } },
        terraqoMemberships: { create: { workspaceId: workspace.id, role: "PROFESSIONAL", active: true } } }, select: { id: true } });
      actors.push(actor.id);
      const identity = { sub: actor.id, workspaceId: workspace.id, workspaceSlug: "icc-topografia", role: "PROFESSIONAL" as const };
      identities.push(identity); bearers.push((await createRevocablePortalToken(identity, prisma)).token);
    }
    stage = "legacy-and-null";
    assert.equal((await call("POST", 0, payload, "", createWorkspacePortalToken(identities[0]).token)).status, 401);
    const absent = await call("GET", 0, payload, `?operationKey=${key}`);
    assert.equal(absent.status, 200); assert.deepEqual((await absent.json()).data, { receipt: null, current: null });
    assert.equal(await prisma.terraqoNativeWorklogOperation.count({ where: { actorId: { in: actors } } }), 0);
    stage = "concurrent-create";
    const replies = await Promise.all([call("POST"), call("POST")]);
    console.log(JSON.stringify({ stage, http_statuses: replies.map(reply => reply.status),
      own_receipts: await prisma.terraqoNativeWorklogOperation.count({ where: { actorId: actors[0] } }),
      own_audits: await prisma.activityLog.count({ where: { actorId: actors[0], entityType: "NativeWorklog" } }),
      cache_controls: replies.map(reply => reply.headers.get("cache-control")),
      nosniff: replies.map(reply => reply.headers.get("x-content-type-options")) }));
    stage = "response-headers";
    for (const reply of replies) {
      assert.equal(reply.status, 200, `Own HTTPS status ${reply.status}`);
      const cache = (reply.headers.get("cache-control") ?? "").split(",").map(value => value.trim().toLowerCase());
      assert.ok(cache.includes("private") && cache.includes("no-store"));
      assert.equal(reply.headers.get("x-content-type-options"), "nosniff");
    }
    stage = "concurrent-receipts";
    const first = await replies[0].json(); assert.deepEqual(await replies[1].json(), first);
    assert.equal(first.data.receipt.outcome, "CREATED");
    assert.equal(first.data.receipt.operationKey, key);
    stage = "history-isolation-conflict";
    assert.deepEqual(await (await call("GET", 0, payload, `?operationKey=${key}`)).json(), first);
    assert.deepEqual((await (await call("GET", 1, payload, `?operationKey=${key}`)).json()).data, { receipt: null, current: null });
    assert.equal((await call("POST", 0, { ...payload, summary: "Contenido temporal diferente con la misma clave estable de operación." })).status, 409);
    assert.equal(await prisma.terraqoNativeWorklogOperation.count({ where: { actorId: { in: actors } } }), 1);
    assert.equal(await prisma.activityLog.count({ where: { actorId: actors[0], entityType: "NativeWorklog" } }), 1);
    assert.equal(await prisma.terraqoNativeWorklogAccounting.count({ where: { operation: { actorId: actors[0] }, state: "PENDING" } }), 1);
    assert.equal(await prisma.terraqoWorklogEntry.count({ where: { authorId: actors[0], visibility: "PRIVATE" } }), 1);
    assert.equal(await prisma.terraqoBuilderAccount.count({ where: { userId: { in: actors } } }), 0);
    assert.equal(await prisma.terraqoBuilderLedger.count({ where: { account: { userId: { in: actors } } } }), 0);
    stage = "demotion-revocation";
    await prisma.terraqoWorkspaceMember.updateMany({ where: { workspaceId: workspace.id, userId: actors[0] }, data: { role: "CLIENT" } });
    assert.equal((await call("GET", 0, payload, `?operationKey=${key}`)).status, 401);
    await prisma.terraqoWorkspaceMember.updateMany({ where: { workspaceId: workspace.id, userId: actors[0] }, data: { role: "PROFESSIONAL" } });
    await prisma.verificationToken.deleteMany({ where: { identifier: `portal-session:${workspace.id}:${actors[0]}` } });
    assert.equal((await call("GET", 0, payload, `?operationKey=${key}`)).status, 401);
    assert.equal((await call("POST", 0, { ...payload, operationKey: randomUUID().replaceAll("-", "") })).status, 401);
    console.log(JSON.stringify({ outcome: "passed", deployed_https: true, concurrent_requests: 2,
      own_receipts: 1, own_audits: 1, accounting_credits: 0, cross_owner_isolation: true,
      legacy_rejected: true, revocation_checked: true, network_cut_proved: false }));
  } finally {
    // Revocation takes the grant lock before fixture deletion, ordering any still
    // running own write ahead of cleanup. No global runner or client data removal.
    await prisma.verificationToken.deleteMany({ where: { identifier: { in: actors.map(id => `portal-session:${workspace.id}:${id}`) } } });
    for (const actorId of actors) {
      await prisma.terraqoNativeWorklogFirstDecision.deleteMany({ where: { actorId } });
      await prisma.terraqoNativeWorklogAuthority.deleteMany({ where: { actorId } });
      await prisma.terraqoNativeWorklogDecision.deleteMany({ where: { operation: { actorId } } });
      await prisma.terraqoNativeWorklogAccounting.deleteMany({ where: { operation: { actorId } } });
      await prisma.terraqoNativeWorklogOperation.deleteMany({ where: { actorId } });
      await prisma.terraqoBuilderContribution.deleteMany({ where: { userId: actorId } });
      await prisma.activityLog.deleteMany({ where: { actorId, entityType: "NativeWorklog" } });
      await prisma.user.delete({ where: { id: actorId } });
    }
    assert.equal(await prisma.user.count({ where: { id: { in: actors } } }), 0);
    assert.equal(await prisma.terraqoNativeWorklogOperation.count({ where: { actorId: { in: actors } } }), 0);
    console.log(JSON.stringify({ own_fixtures_absent: true }));
  }
}
main().catch((error: unknown) => {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "unknown";
  console.error(JSON.stringify({ outcome: "failed", stage, category: /^(?:P[0-9]{4}|ERR_ASSERTION)$/.test(code) ? code : "unknown" }));
  process.exitCode = 1;
}).finally(() => prisma?.$disconnect());
