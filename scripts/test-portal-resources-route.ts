import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { prisma } from "../lib/prisma";
import { createWorkspacePortalToken } from "../lib/server/workspace-portal-session";
import { GET, POST } from "../app/api/public/workspaces/[workspaceSlug]/portal/resources/[resource]/route";

async function main() {
  process.env.AUTH_SECRET = randomBytes(32).toString("hex");
  const original = { member: prisma.terraqoWorkspaceMember.findFirst, notes: prisma.terraqoPrivateNote.findMany };
  let active = true, reads = 0;
  prisma.terraqoWorkspaceMember.findFirst = (async () => active ? { role: "MEMBER" } : null) as unknown as typeof original.member;
  prisma.terraqoPrivateNote.findMany = (async (args: { where: unknown }) => {
    assert.deepEqual(args.where, { workspaceId: "workspace", userId: "user", kind: "SIMPLE" }); reads++; return [];
  }) as unknown as typeof original.notes;
  const { token } = createWorkspacePortalToken({ sub: "user", workspaceId: "workspace", workspaceSlug: "fixture", role: "MEMBER" });
  const call = (resource = "notes", body?: string, contentType = "application/json", anonymous = false, query = "") => {
    const headers = new Headers();
    if (!anonymous) headers.set("authorization", `Bearer ${token}`);
    if (body !== undefined) headers.set("content-type", contentType);
    const request = new Request(`https://example.test/resources${query}`, { method: body === undefined ? "GET" : "POST", headers, body });
    return (body === undefined ? GET : POST)(request, { params: Promise.resolve({ workspaceSlug: "fixture", resource }) });
  };
  try {
    const good = await call(); assert.equal(good.status, 200);
    assert.equal(good.headers.get("cache-control"), "private, no-store");
    assert.equal((await good.json()).data.resource, "notes");
    assert.equal((await call("notes", undefined, "application/json", true)).status, 401);
    assert.equal((await call("clients")).status, 403);
    assert.equal((await call("unknown")).status, 404);
    assert.equal((await call("notes", undefined, "application/json", false, "?cursor=../private")).status, 422);
    assert.equal((await call("notes", "{}", "text/plain")).status, 415);
    assert.equal((await call("notes", "{" )).status, 422);
    assert.equal((await call("notes", "x".repeat(100001))).status, 413);
    assert.equal((await call("notes", JSON.stringify({ fields: { title: "Fixture", body: "Text" }, workspaceId: "foreign" }))).status, 422);
    assert.equal((await call("notes", JSON.stringify({ fields: { title: "Fixture", body: "Text" } }))).status, 422, "Creation requires an operation key.");
    active = false; assert.equal((await call()).status, 401);
    assert.equal(reads, 1, "Rejected input must not reach private reads.");
    console.log("PASS resource HTTP route: authorization, tenant scope, private cache policy, unknown routes, cursor validation, JSON validation and bounded bodies.");
  } finally {
    prisma.terraqoWorkspaceMember.findFirst = original.member;
    prisma.terraqoPrivateNote.findMany = original.notes;
    await prisma.$disconnect();
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
