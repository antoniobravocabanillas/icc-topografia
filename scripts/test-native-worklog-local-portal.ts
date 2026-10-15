import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { PrismaClient } from "@prisma/client";

/** Loopback HTTP, signed grants and real SQL on the guarded empty local cluster.
 * No source rows, real accounts, reputation execution or remote HTTP writes.
 */
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.pathname, "/terraqo_own_native_schema");
  assert.equal(url.username, "terraqo_own_schema");
  assert.match(process.env.TERRAQO_LOCAL_SCHEMA_MARKER ?? "", /^[a-f0-9]{32}$/);
  const db = new PrismaClient({ log: [], datasourceUrl: url.toString() });
  const [marker] = await db.$queryRaw<{ marker: string }[]>`SELECT marker FROM public.terraqo_owned_schema_test`;
  assert.equal(marker.marker, process.env.TERRAQO_LOCAL_SCHEMA_MARKER);
  assert.equal(await db.user.count(), 0);
  assert.equal(await db.terraqoWorkspace.count(), 0);
  process.env.AUTH_SECRET = randomBytes(48).toString("hex");
  const { createRevocablePortalToken, createWorkspacePortalToken } = await import("../lib/server/workspace-portal-session");
  const { GET, POST } = await import("../app/api/public/workspaces/[workspaceSlug]/portal/native-worklogs/route");
  const { prisma } = await import("../lib/prisma");
  let actorId: string | undefined, workspaceId: string | undefined;
  const server = createServer(async (incoming, outgoing) => {
    try {
      const controller = new AbortController();
      incoming.once("aborted", () => controller.abort());
      const init: RequestInit & { duplex?: "half" } = {
        method: incoming.method, headers: new Headers(incoming.headers as Record<string, string>),
        signal: controller.signal,
      };
      if (!["GET", "HEAD"].includes(incoming.method ?? "GET")) {
        init.body = Readable.toWeb(incoming) as ReadableStream<Uint8Array>; init.duplex = "half";
      }
      const request = new Request(`http://127.0.0.1${incoming.url}`, init);
      const handler = incoming.method === "POST" ? POST : GET;
      const response = await handler(request, { params: Promise.resolve({ workspaceSlug: "icc-topografia" }) });
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      outgoing.writeHead(503, { "Cache-Control": "private, no-store" }); outgoing.end();
    }
  });
  try {
    workspaceId = (await db.terraqoWorkspace.create({ data: { slug: "icc-topografia", name: "ICC OWN local portal" } })).id;
    await db.company.create({ data: { legalName: "ICC OWN local fixture", document: "20616116313", terraqoWorkspaceId: workspaceId } });
    await db.terraqoWorkspaceModule.createMany({ data: (["LIVE_CV", "PROFESSIONAL_NETWORK"] as const)
      .map(code => ({ workspaceId: workspaceId!, code, active: true })) });
    actorId = (await db.user.create({ data: { name: "OWN local portal", email: `local-portal-${randomUUID()}@example.invalid`, role: "CUSTOMER" } })).id;
    await db.terraqoProfessionalProfile.create({ data: { userId: actorId, visibility: "PRIVATE", liveCvEnabled: false } });
    const member = await db.terraqoWorkspaceMember.create({ data: { userId: actorId, workspaceId, role: "PROFESSIONAL", active: true } });
    const identity = { sub: actorId, workspaceId, workspaceSlug: "icc-topografia", role: "PROFESSIONAL" as const };
    const session = await createRevocablePortalToken(identity, db);
    const legacy = createWorkspacePortalToken(identity);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const endpoint = `http://127.0.0.1:${address.port}/api/public/workspaces/icc-topografia/portal/native-worklogs`;
    const key = "a".repeat(32);
    const payload = { operationKey: key, title: "Bitácora privada de prueba propia",
      summary: "Resumen técnico exclusivo del ensayo local del endpoint profesional.", outcome: "",
      type: "FIELD_UPDATE", projectId: "", projectVersion: "" };
    async function request(method: string, query = "", body = payload, bearer = session.token) {
      return fetch(endpoint + query, { method, headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
        ...(method === "POST" ? { body: JSON.stringify(body) } : {}) });
    }
    assert.equal((await request("POST", "", payload, legacy.token)).status, 401);
    const absent = await request("GET", `?operationKey=${key}`);
    assert.deepEqual((await absent.json()).data, { receipt: null, current: null });
    assert.equal(await db.terraqoNativeWorklogOperation.count(), 0);
    const concurrent = await Promise.all([request("POST"), request("POST")]);
    for (const response of concurrent) { assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store"); }
    const first = await concurrent[0].json(); assert.deepEqual(await concurrent[1].json(), first);
    assert.equal(first.data.receipt.outcome, "CREATED");
    assert.equal((await request("POST", "", { ...payload, summary: "Contenido diferente que conserva la misma clave de operación." })).status, 409);
    assert.deepEqual(await (await request("GET", `?operationKey=${key}`)).json(), first);
    assert.equal(await db.terraqoNativeWorklogOperation.count(), 1);
    assert.equal(await db.terraqoNativeWorklogAccounting.count({ where: { state: "PENDING" } }), 1);
    assert.equal(await db.activityLog.count(), 1);
    assert.equal(await db.terraqoWorklogEntry.count({ where: { visibility: "PRIVATE" } }), 1);
    assert.equal(await db.terraqoBuilderAccount.count(), 0); assert.equal(await db.terraqoBuilderLedger.count(), 0);
    // Fixed local-only DDL. A real incompatible catalog must reject before writes.
    await db.$executeRaw`ALTER TABLE icc."TerraqoNativeWorklogAccounting" ALTER COLUMN attempts SET DEFAULT 1`;
    try {
      assert.equal((await request("POST", "", { ...payload, operationKey: "b".repeat(32) })).status, 503);
      assert.equal((await request("GET", `?operationKey=${key}`)).status, 503);
      assert.equal(await db.terraqoNativeWorklogOperation.count(), 1);
    } finally { await db.$executeRaw`ALTER TABLE icc."TerraqoNativeWorklogAccounting" ALTER COLUMN attempts SET DEFAULT 0`; }
    assert.deepEqual(await (await request("GET", `?operationKey=${key}`)).json(), first);
    await db.terraqoWorkspaceMember.update({ where: { id: member.id }, data: { role: "CLIENT" } });
    assert.equal((await request("GET", `?operationKey=${key}`)).status, 401);
    await db.terraqoWorkspaceMember.update({ where: { id: member.id }, data: { role: "PROFESSIONAL" } });
    await db.verificationToken.deleteMany({ where: { identifier: `portal-session:${workspaceId}:${actorId}` } });
    assert.equal((await request("GET", `?operationKey=${key}`)).status, 401);
    assert.equal((await request("POST", "", { ...payload, operationKey: "b".repeat(32) })).status, 401);
    assert.equal(await db.terraqoNativeWorklogOperation.count(), 1);
    console.log(JSON.stringify({ outcome: "passed", environment: "LOCAL_ISOLATED_ONLY", jwt_http_proved: true,
      concurrent_requests: 2, same_key_receipts: 1, accounting_credits: 0, deployed_http_proved: false, network_cut_proved: false }));
  } finally {
    server.closeAllConnections();
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    try {
      if (actorId) {
        await db.terraqoNativeWorklogFirstDecision.deleteMany({ where: { actorId } });
        await db.terraqoNativeWorklogAuthority.deleteMany({ where: { actorId } });
        await db.terraqoNativeWorklogDecision.deleteMany({ where: { operation: { actorId } } });
        await db.terraqoNativeWorklogAccounting.deleteMany({ where: { operation: { actorId } } });
        await db.terraqoNativeWorklogOperation.deleteMany({ where: { actorId } });
        await db.activityLog.deleteMany({ where: { actorId } });
        if (workspaceId) await db.verificationToken.deleteMany({ where: { identifier: `portal-session:${workspaceId}:${actorId}` } });
        await db.user.delete({ where: { id: actorId } });
      }
      if (workspaceId) {
        await db.company.deleteMany({ where: { terraqoWorkspaceId: workspaceId } });
        await db.terraqoWorkspace.delete({ where: { id: workspaceId } });
      }
      assert.equal(await db.user.count(), 0); assert.equal(await db.terraqoWorkspace.count(), 0);
      assert.equal(await db.terraqoNativeWorklogOperation.count(), 0); assert.equal(await db.terraqoWorklogEntry.count(), 0);
      console.log(JSON.stringify({ own_local_fixtures_absent: true }));
    } finally { await Promise.all([db.$disconnect(), prisma.$disconnect()]); }
  }
}
main().catch((error: unknown) => {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "unknown";
  const location = error instanceof Error ? error.stack?.match(/test-native-worklog-local-portal\.ts:\d+:\d+/)?.[0] : undefined;
  console.error(JSON.stringify({ outcome: "failed", category: /^(?:P[0-9]{4}|ERR_ASSERTION)$/.test(code) ? code : "unknown", location }));
  process.exitCode = 1;
});
