import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { selectionAccessRequestHandlers } from "../lib/server/selection-access-request-http";
import { ACCESS_REQUEST_RECEIPT, validateAccessExpiry } from "../lib/terraqo/selection-access-request-policy";

async function main() {
  let enabled = true;
  let actor: { userId: string; verified: boolean } | null = { userId: "actor", verified: true };
  const calls: unknown[] = [];
  let decisionError: Error | null = null;
  const handler = selectionAccessRequestHandlers({ enabled: () => enabled, authenticate: async () => actor,
    list: async id => { calls.push(id); return []; },
    resolve: async (id, target) => { calls.push({ id, target }); return { available: false }; },
    request: async (id, payload) => { calls.push({ id, payload }); return ACCESS_REQUEST_RECEIPT; },
    decide: async (id, payload) => { if (decisionError) throw decisionError; calls.push({ id, payload }); return { status: payload.decision, replayed: false }; },
  });
  const send = (body: unknown, headers: Record<string, string> = {}, method = "POST") => handler(new Request("https://portal.terraqoglobal.com/api/v1/selection-access-requests", {
    method, headers: { host: "portal.terraqoglobal.com", origin: "https://portal.terraqoglobal.com", "content-type": "application/json", ...headers }, body: method === "GET" ? undefined : JSON.stringify(body),
  }));
  const valid = { targetType: "collection", target: "collection-123", message: "Revisar" };
  enabled = false; assert.equal((await send(valid)).status, 404);
  enabled = true; actor = null; assert.equal((await send(valid)).status, 401);
  actor = { userId: "actor", verified: false }; assert.equal((await send(valid)).status, 403);
  actor.verified = true;
  assert.equal((await send(valid, { origin: "https://evil.example" })).status, 403);
  assert.equal((await send(valid, { "content-type": "text/plain" })).status, 415);
  assert.equal((await send({ ...valid, userId: "another" })).status, 422);
  assert.equal((await send({ ...valid, message: "a".repeat(501) })).status, 422);
  assert.equal((await send({ ...valid, message: "a".repeat(5000) }, { "content-length": "1" })).status, 413);
  assert.equal(calls.length, 0, "Rejected requests cannot reach the service");
  const result = await send(valid);
  assert.equal(result.status, 202);
  assert.equal(result.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.deepEqual(await result.json(), { data: ACCESS_REQUEST_RECEIPT });
  assert.deepEqual(calls[0], { id: "actor", payload: valid });
  const decision = { requestId: "cm000000000000000000000001", expectedVersion: 1, decision: "APPROVED", expectedCollectionVersion: 1, scopeChangeConfirmed: false, expiresAt: "2030-01-01T12:00:00Z", allowDownload: false };
  assert.equal((await send(decision, {}, "PATCH")).status, 422);
  assert.equal((await send({ ...decision, confirmed: true }, {}, "PATCH")).status, 200);
  for (const sqlstate of ["40001", "40P01"]) {
    decisionError = new Prisma.PrismaClientKnownRequestError("Lock conflict", { code: "P2010", clientVersion: "test", meta: { code: sqlstate } });
    assert.equal((await send({ ...decision, confirmed: true }, {}, "PATCH")).status, 409);
  }
  decisionError = null;
  assert.equal((await send({}, {}, "GET")).status, 200);
  assert.equal(calls.at(-1), "actor");
  const lookup = (query: string) => handler(new Request(`https://portal.terraqoglobal.com/api/v1/selection-access-requests?${query}`));
  assert.deepEqual(await (await lookup("targetType=public-link&target=revoked-link")).json(), { data: { available: false } });
  assert.deepEqual(calls.at(-1), { id: "actor", target: { targetType: "public-link", target: "revoked-link" } });
  for (const query of ["targetType=collection&target=collection-123&userId=other", "targetType=collection&target=collection-123&target=another", "targetType=collection", "targetType=bad&target=collection-123"]) assert.equal((await lookup(query)).status, 422);
  const now = new Date("2030-01-01T00:00:00Z");
  for (const expiry of ["invalid", "2030-01-01T00:05:00Z", "2031-01-01T00:00:00Z"]) assert.throws(() => validateAccessExpiry(expiry, now));
  assert.equal(validateAccessExpiry("2030-01-02T00:00:00Z", now).toISOString(), "2030-01-02T00:00:00.000Z");
  console.log("PASS: feature/auth/origin/body/schema gates, neutral receipt, session identity, explicit approval, expiry bounds. Service mocked; no DB acceptance implied.");
}
void main();
