import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { workspaceInvitationHandlers } from "../lib/server/workspace-invitation-http";

type Insert = {
  workspaceId: string; operationKey: string; operationFingerprint: string; createdById: string;
  email: string; role: string; tokenHash: string; expiresAt: Date;
};
type Row = Insert & { id: string; resendCount: number; lastIssuedAt: Date; status: string };
type ProviderCall = { to: string; html: string; text: string; key: string | null };

async function main() {
  const origin = "https://request.invalid";
  const portal = "https://configured.invalid";
  const recipient = "recipient@example.invalid";
  let rows: Row[] = [];
  let rejectCommit = false;
  let actor = "owner";
  const db = {
    async $transaction<T>(work: (tx: unknown) => Promise<T>) {
      const pending = structuredClone(rows);
      const result = await work({
        $queryRaw: async () => [{ id: "workspace" }],
        terraqoWorkspace: { findUnique: () => ({ active: true, deletedAt: null }) },
        terraqoWorkspaceMember: { findUnique: () => ({ active: true, role: actor === "owner" ? "OWNER" : "VIEWER" }) },
        terraqoWorkspaceInvitation: {
          findUnique: ({ where }: { where: { workspaceId_operationKey: Pick<Row, "workspaceId" | "operationKey"> } }) =>
            pending.find(row => row.workspaceId === where.workspaceId_operationKey.workspaceId && row.operationKey === where.workspaceId_operationKey.operationKey),
          findFirst: ({ where }: { where: { workspaceId: string; id?: string; email?: string } }) => pending.find(row =>
            row.workspaceId === where.workspaceId && (where.id ? row.id === where.id : row.email === where.email && row.status === "PENDING")),
          count: () => pending.length,
          create: ({ data }: { data: Insert }) => {
            const row = { ...data, id: randomUUID(), status: "PENDING", resendCount: 0, lastIssuedAt: new Date() };
            pending.push(row);
            return row;
          },
          update: ({ where, data }: { where: { id: string }; data: { status?: string; tokenHash?: string; resendCount?: { increment: number }; lastIssuedAt?: Date } }) => {
            const row = pending.find(row => row.id === where.id)!;
            const { resendCount, ...rest } = data;
            Object.assign(row, rest);
            row.resendCount += resendCount?.increment ?? 0;
            return row;
          },
        },
      });
      if (rejectCommit) throw new Error("synthetic commit failure");
      rows = pending;
      return result;
    },
  } as unknown as PrismaClient;

  const env = { ...process.env };
  const originalFetch = globalThis.fetch;
  const calls: ProviderCall[] = [];
  let timeout = false;
  try {
    Object.assign(process.env, { NEXT_PUBLIC_PORTAL_URL: portal, RESEND_API_KEY: "fake-provider", TERRAQO_EMAIL_FROM: "test@example.invalid", TERRAQO_TRANSACTIONAL_EMAIL_ENABLED: "true" });
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://api.resend.com/emails");
      const message = JSON.parse(String(options?.body)) as ProviderCall;
      calls.push({ ...message, key: new Headers(options?.headers).get("Idempotency-Key") });
      const link = message.text.match(/https:\/\/configured\.invalid\/invitacion-workspace#([A-Za-z0-9_-]{43})/);
      assert.ok(link && rows.some(row => row.email === message.to && row.tokenHash === createHash("sha256").update(link[1]).digest("hex")), "only send a committed issuance");
      if (timeout) throw new Error("synthetic provider timeout");
      return Response.json({ id: "fake-accepted" });
    };
    const { sendWorkspaceInvitationEmail } = await import("../lib/server/workspace-invitation-email");
    const handlers = workspaceInvitationHandlers({ db, enabled: () => true, actor: async () => actor, deliver: sendWorkspaceInvitationEmail });
    const post = async (payload: unknown, status: number) => {
      const response = await handlers.POST(new Request(origin + "/api/terraqo/workspace-invitations", {
        method: "POST", headers: { origin, "x-forwarded-host": "forwarded.invalid", "content-type": "application/json" }, body: JSON.stringify(payload),
      }));
      assert.equal(response.status, status);
      return response.json();
    };
    const create = { action: "create", workspaceId: "workspace", email: recipient.toUpperCase(), operationKey: randomUUID() };
    actor = "viewer";
    await post(create, 403);
    actor = "owner";
    rejectCommit = true;
    await post(create, 500);
    assert.equal(rows.length, 0);
    assert.equal(calls.length, 0);
    rejectCommit = false;
    const created = await post(create, 201);
    assert.deepEqual(Object.keys(created).sort(), ["delivery", "id", "replayed", "token"]);
    assert.equal(created.delivery, "accepted");
    const rotate = { action: "rotate", workspaceId: create.workspaceId, invitationId: created.id };
    assert.deepEqual(await post(create, 200), { id: created.id, replayed: true, token: null, delivery: "skipped" });
    await post({ ...create, email: "other@example.invalid" }, 409);
    await post({ ...rotate, email: "other@example.invalid" }, 422);
    await post({ ...rotate, workspaceId: "other" }, 404);
    await post(rotate, 429);
    actor = "viewer";
    await post(rotate, 403);
    actor = "owner";
    assert.equal(calls.length, 1);

    rows[0].lastIssuedAt = new Date(0);
    const rotated = await post(rotate, 200);
    assert.deepEqual(Object.keys(rotated).sort(), ["delivery", "token"]);
    assert.equal(rotated.delivery, "accepted");
    assert.notEqual(rotated.token, created.token);
    rows[0].lastIssuedAt = new Date(0);
    await post(rotate, 409);
    assert.equal(calls.length, 2);
    for (const [version, token] of [created.token, rotated.token].entries()) {
      const call = calls[version];
      assert.equal(call.key, `workspace-invitation/${created.id}/${version}`);
      assert.equal(call.to, recipient);
      const url = portal + "/invitacion-workspace#" + token;
      assert.ok(call.html.includes(`href="${url}"`) && call.text.includes(url));
      assert.doesNotMatch(call.html + call.text, /request\.invalid|forwarded\.invalid|\?token=/);
    }
    assert.deepEqual(await post({ ...rotate, action: "cancel" }, 200), { token: null });
    await post(rotate, 404);
    process.env.TERRAQO_TRANSACTIONAL_EMAIL_ENABLED = "false";
    const disabled = await post({ ...create, operationKey: randomUUID() }, 201);
    assert.equal(disabled.delivery, "disabled");
    assert.match(disabled.token, /^[\w-]{43}$/);
    process.env.TERRAQO_TRANSACTIONAL_EMAIL_ENABLED = "true";
    delete process.env.RESEND_API_KEY;
    rows[1].lastIssuedAt = new Date(0);
    const unavailable = await post({ ...rotate, invitationId: disabled.id }, 200);
    assert.equal(unavailable.delivery, "unavailable");
    assert.match(unavailable.token, /^[\w-]{43}$/);
    assert.equal(calls.length, 2);

    process.env.RESEND_API_KEY = "fake-provider";
    timeout = true;
    rows[1].lastIssuedAt = new Date(0);
    const retryRotate = { ...rotate, invitationId: disabled.id, expectedResendCount: 1 };
    const uncertain = await post(retryRotate, 200);
    assert.equal(uncertain.delivery, "unconfirmed");
    assert.match(uncertain.token, /^[\w-]{43}$/);
    rows[1].lastIssuedAt = new Date(0);
    await post(retryRotate, 409);
    const failedCreate = { ...create, email: "timeout@example.invalid", operationKey: randomUUID() };
    const failed = await post(failedCreate, 201);
    assert.equal(failed.delivery, "unconfirmed");
    assert.match(failed.token, /^[\w-]{43}$/);
    assert.deepEqual(await post(failedCreate, 200), { id: failed.id, token: null, replayed: true, delivery: "skipped" });
    assert.equal(calls.length, 4);
    console.log("PASS S22 invitation mail: authorized committed recipient, create/rotate, HTML/text fragment, versioned provider keys, rollback, replay, conflicts, disabled, missing provider and timeout fallback. In-memory DB and fake HTTP transport.");
  } finally {
    process.env = env;
    globalThis.fetch = originalFetch;
  }
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
