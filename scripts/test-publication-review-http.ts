import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { publicationReviewHandlers } from "../lib/server/publication-review-http";

async function run() {
  let enabled = true,
    authenticated = true,
    conflict = false;
  const calls: Array<{ userId: string }> = [];
  const handle = publicationReviewHandlers({
    enabled: () => enabled,
    authenticate: async () =>
      authenticated ? { userId: "session-user" } : null,
    list: async () => [],
    request: async (input) => {
      calls.push(input);
      return [];
    },
    decide: async (input) => {
      if (conflict)
        throw new Prisma.PrismaClientKnownRequestError(
          "serialization conflict",
          { code: "P2034", clientVersion: "test" },
        );
      calls.push(input);
      return {
        id: input.reviewId,
        decision: "APPROVED",
        decidedAt: new Date(),
      };
    },
    revoke: async (input) => {
      calls.push(input);
      return { revoked: true };
    },
  });
  const make = (
    body: unknown,
    method = "POST",
    headers: Record<string, string> = {},
  ) =>
    new Request("https://portal.terraqoglobal.com/api/v1/publication-reviews", {
      method,
      headers: {
        host: "portal.terraqoglobal.com",
        origin: "https://portal.terraqoglobal.com",
        "content-type": "application/json",
        ...headers,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  const payload = { collectionId: "collection-1", expectedVersion: 2 };
  enabled = false;
  let req = make(payload);
  assert.equal((await handle(req)).status, 404);
  assert.equal(req.bodyUsed, false);
  enabled = true;
  authenticated = false;
  req = make(payload);
  assert.equal((await handle(req)).status, 401);
  assert.equal(req.bodyUsed, false);
  authenticated = true;
  req = make(payload, "POST", { origin: "https://evil.example" });
  assert.equal((await handle(req)).status, 403);
  assert.equal(req.bodyUsed, false);
  req = make(payload, "POST", { "content-type": "text/plain" });
  assert.equal((await handle(req)).status, 415);
  assert.equal(req.bodyUsed, false);
  assert.equal(
    (await handle(make(" ".repeat(17_000), "POST", { "content-length": "1" })))
      .status,
    413,
    "Actual byte limit wins over client length.",
  );
  assert.equal((await handle(make("{"))).status, 400);
  assert.equal(
    (await handle(make({ ...payload, userId: "spoofed" }))).status,
    422,
  );
  assert.equal(calls.length, 0);
  assert.equal((await handle(make(payload))).status, 200);
  assert.equal(calls[0].userId, "session-user");
  const approve = {
    reviewId: "review-1",
    payload: { decision: "APPROVED", scopeHash: "a".repeat(64) },
  };
  assert.equal((await handle(make(approve, "PATCH"))).status, 422);
  const approved = {
    ...approve,
    payload: { ...approve.payload, confirmed: true },
  };
  assert.equal((await handle(make(approved, "PATCH"))).status, 200);
  conflict = true;
  const response = await handle(make(approved, "PATCH"));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.retryable, true);
  assert.equal(
    (
      await handle(
        make({ reviewId: "review-1", reason: "Retiro solicitado" }, "DELETE"),
      )
    ).status,
    200,
  );
  const listed = await handle(
    new Request(
      "https://portal.terraqoglobal.com/api/v1/publication-reviews?workspaceId=company",
    ),
  );
  assert.equal(listed.status, 200);
  assert.equal(listed.headers.get("cache-control"), "private, no-store");
  console.log(
    "PASS publication HTTP gate, session identity, same-origin, actual byte limit, schemas, explicit decisions, retryable conflicts and private response caching.",
  );
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
