import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import type { WorkspacePortalToken } from "../lib/server/workspace-portal-session";
import { toWorkspacePortalRole } from "../lib/server/workspace-portal-policy";

// Read-only checks against the actual runtime. Supply secrets through the
// process environment; tokens, credentials and customer records are never logged.
async function main() {
  const origin = new URL(process.env.TEST_PORTAL_URL || "https://api.terraqoglobal.com");
  assert.ok(origin.protocol === "https:" && (origin.hostname === "api.terraqoglobal.com" ||
    origin.hostname.endsWith("--iridescent-fenglisu-d6595c.netlify.app")));
  assert.ok(process.env.AUTH_SECRET && process.env.DATABASE_URL, "Server configuration is required.");
  const issue = (payload: Omit<WorkspacePortalToken, "iat" | "exp">) => {
    // The workstation clock runs a few seconds ahead of the server. Backdate
    // synthetic test tokens instead of weakening the server's time validation.
    const now = Math.floor(Date.now() / 1000) - 30;
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(JSON.stringify({ ...payload, iat: now, exp: now + 28800 })).toString("base64url");
    const unsigned = `${header}.${body}`;
    return `${unsigned}.${createHmac("sha256", process.env.AUTH_SECRET!).update(unsigned).digest("base64url")}`;
  };
  const roles = ["OWNER", "ADMIN", "MANAGER", "MEMBER", "VIEWER", "CLIENT", "PROFESSIONAL"] as const;
  let tested = 0;
  const request = async (slug: string, token?: string) => {
    const response = await fetch(new URL(`/api/public/workspaces/${encodeURIComponent(slug)}/portal/session`, origin), {
      headers: token ? { Authorization: `Bearer ${token}` } : {}, redirect: "error", signal: AbortSignal.timeout(60000),
    });
    return response;
  };
  for (const role of roles) {
    const membership = await prisma.terraqoWorkspaceMember.findFirst({
      where: { role, active: true, workspace: { active: true, deletedAt: null } },
      select: { userId: true, workspaceId: true, workspace: { select: { slug: true } } },
    });
    if (!membership) { console.log(`SKIP ${role}: no active membership available.`); continue; }
    const expected = toWorkspacePortalRole(role)!;
    const payload = { sub: membership.userId, workspaceId: membership.workspaceId,
      workspaceSlug: membership.workspace.slug, role: expected };
    const token = issue(payload);
    const response = await request(payload.workspaceSlug, token);
    assert.equal(response.status, 200, `Legitimate ${role} session was rejected.`);
    const cacheDirectives = response.headers.get("cache-control")?.split(",").map((value) => value.trim());
    assert.ok(cacheDirectives?.includes("private") && cacheDirectives.includes("no-store"));
    const { data } = await response.json();
    assert.equal(data.user.role, expected.toLowerCase());
    if (expected === "ADMIN") {
      assert.equal(data.enterprise.schemaVersion, 1);
      for (const list of [data.enterprise.members, data.enterprise.projects, data.enterprise.clients]) {
        assert.ok(Array.isArray(list) && list.length <= 20);
      }
    } else assert.equal(data.enterprise, null, "Limited roles cannot receive enterprise records.");
    const incompatible = issue({ ...payload, role: expected === "ADMIN" ? "VIEWER" : "ADMIN" });
    assert.equal((await request(payload.workspaceSlug, incompatible)).status, 401, "Token role must match current membership.");
    const removed = issue({ ...payload, sub: randomUUID() });
    assert.equal((await request(payload.workspaceSlug, removed)).status, 401, "A token without membership cannot authorize access.");
    assert.equal((await request(payload.workspaceSlug)).status, 401);
    assert.equal((await request(payload.workspaceSlug, `${token}tampered`)).status, 401);
    const otherWorkspace = await prisma.terraqoWorkspace.findFirst({
      where: { id: { not: payload.workspaceId }, active: true, deletedAt: null }, select: { slug: true },
    });
    if (otherWorkspace) {
      const foreign = issue({ ...payload, workspaceSlug: otherWorkspace.slug });
      assert.equal((await request(otherWorkspace.slug, foreign)).status, 401, "Workspace identity and slug must agree.");
    }
    tested++;
    console.log(`PASS ${role}: legitimate session, role mismatch, removed membership, anonymous and tampered token checks.`);
  }
  assert.ok(tested > 0, "No real membership was available for runtime verification.");
  const rejectedLogin = await fetch(new URL("/api/public/workspaces/icc-topografia/portal/login", origin), {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `${randomUUID()}@example.test`, password: randomBytes(24).toString("hex") }),
    redirect: "error", signal: AbortSignal.timeout(60000),
  });
  assert.equal(rejectedLogin.status, 401, "Invalid credentials must fail normally instead of causing a runtime error.");
  console.log(`PASS deployed portal: ${tested} real membership roles checked; no database mutations.`);
}
main().catch((error: unknown) => {
  console.error(error instanceof assert.AssertionError ? error.message : "Runtime verification failed; sensitive diagnostics suppressed.");
  process.exitCode = 1;
}).finally(async () => { await prisma.$disconnect(); });
