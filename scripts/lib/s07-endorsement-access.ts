import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { BrowserContext, Page } from "playwright";
import { expect } from "@playwright/test";
import type { SharingFixture, SharingRecord } from "./s06-sharing-fixtures";
import type { Read } from "./s06-sharing-reads";
import { inbox, openInbox, requestCard, requests } from "./s07-endorsement-browser";

type Listed = {
  id: string; revisionId: string; revisionHash: string; requestedScope: string[]; version: number;
  status: string; reviewerEmail: string | null; decisions: unknown[]; revision: Record<string, unknown> & { worklog?: Record<string, unknown> };
};

export async function list(read: Read): Promise<Listed[]> {
  const result = await read(requests);
  assert.equal(result.status, 200);
  const { data } = await result.json();
  assert.ok(Array.isArray(data));
  return data;
}

export async function projection(read: Read, id: string, email: string, record: SharingRecord, hash: string, available: boolean) {
  const rows = (await list(read)).filter(row => row.id === id);
  assert.equal(rows.length, 1);
  const [row] = rows;
  assert.equal(row.revisionId, record.revision);
  assert.equal(row.revisionHash, hash);
  assert.equal(row.reviewerEmail, email);
  const text = JSON.stringify(row);
  assert.ok(!text.includes(record.title));
  assert.ok(!text.includes("Resultado reservado"));
  if (record.photo) assert.ok(!text.includes(record.photo.id));
  // Validate the projection itself, including empty optional fields and workspace metadata.
  const allowed = ["id", "revisionNo", "contentHash", "createdAt", "worklog", ...(available ? ["summary"] : [])];
  assert.ok(Object.keys(row.revision ?? {}).every(key => allowed.includes(key)));
  assert.ok(Object.keys(row.revision?.worklog ?? {}).every(key => key === "id"));
  if (available) {
    assert.deepEqual(row.requestedScope, ["summary"]);
    assert.equal(row.revision.id, record.revision);
    assert.equal(row.revision.contentHash, hash);
    assert.equal(row.revision.summary, record.summary);
    assert.deepEqual(row.revision.worklog, { id: record.id });
  } else {
    assert.ok(!text.includes(record.summary));
    assert.deepEqual(row.decisions, []);
  }
  return row;
}

export async function pulse(read: Read) {
  const result = await read("/api/terraqo/activity-pulse");
  assert.equal(result.status, 200);
  const { data } = await result.json();
  assert.ok(Number.isSafeInteger(data.unreadNotifications));
  return data as { unreadNotifications: number; latestEvent: { id: string; href: string; channel: string } | null };
}

export async function expectPulse(read: Read, baseline: number, id?: string, version?: number) {
  const { unreadNotifications, latestEvent } = await pulse(read);
  assert.equal(unreadNotifications, baseline + (id ? 1 : 0));
  if (id) {
    assert.equal(latestEvent?.id, "endorsement:" + id + ":" + version);
    assert.equal(latestEvent.href, inbox);
    assert.equal(latestEvent.channel, "notification");
  } else {
    assert.ok(!latestEvent?.id.startsWith("endorsement:"));
  }
}

export function mutation(origin: string) {
  return { headers: { Origin: origin }, maxRedirects: 0, timeout: 45_000 };
}

export function decision(ctx: BrowserContext, origin: string, id: string, version: number, summaryComment?: string) {
  return ctx.request.post(requests + "/" + id + "/decisions", {
    ...mutation(origin), headers: { Origin: origin, "Idempotency-Key": randomUUID() },
    data: { expectedVersion: version, responses: [{ field: "summary", decision: "CONFIRMED" }], summaryComment },
  });
}

export async function checkLiveIdentity(db: PrismaClient, fixture: SharingFixture, fixed: Read, ctx: BrowserContext,
  origin: string, id: string, version: number, baseline: number) {
  const { recipient, verified } = fixture;
  const email = recipient + "@example.invalid";
  const account = { id: recipient, email, emailVerified: verified };
  // Replay exactly the original signed cookie as the live DB verification and email are changed independently.
  for (const change of [{ emailVerified: null }, { email: "different-" + email }] as const) {
    assert.equal((await db.user.updateMany({ where: account, data: change })).count, 1);
    try {
      const session = await fixed("/api/auth/session");
      assert.equal(session.status, 200);
      assert.equal((await session.json()).user.id, recipient);
      if ("email" in change) {
        // requireUser rejects the stale session email before the request reaches endorsement authorization.
        assert.equal((await fixed(requests)).status, 401);
        assert.equal((await fixed("/api/terraqo/activity-pulse")).status, 401);
        assert.equal((await decision(ctx, origin, id, version)).status(), 401);
      } else {
        assert.ok(!(await list(fixed)).some(row => row.id === id));
        await expectPulse(fixed, baseline);
        assert.equal((await decision(ctx, origin, id, version)).status(), 404);
      }
    } finally {
      assert.equal((await db.user.updateMany({ where: { ...account, ...change }, data: { email, emailVerified: verified } })).count, 1);
    }
    await expectPulse(fixed, baseline, id, version);
  }
}

export async function verifyResend(db: PrismaClient, fixture: SharingFixture, page: Page,
  origin: string, id: string, fixed: Read, baseline: number, version: number, status: "PENDING" | "IN_REVIEW") {
  const path = requests + "/" + id;
  const where = { id, requesterId: fixture.owner, reviewerEmail: fixture.recipient + "@example.invalid", version, status };
  const initial = await db.terraqoEndorsementRequest.findFirstOrThrow({ where });
  assert.ok(initial.sentAt);
  const resend = (expectedVersion: number) => page.request.patch(path, { ...mutation(origin), data: { action: "resend", expectedVersion } });
  const button = requestCard(page, id).getByRole("button", { name: "Reenviar solicitud" });
  // Only age this run's synthetic cooldown timestamp. sentAt remains the original delivery time.
  for (const hours of [23, 25]) {
    assert.equal((await db.terraqoEndorsementRequest.updateMany({
      where, data: { updatedAt: new Date(Date.now() - hours * 3_600_000) },
    })).count, 1);
    await openInbox(page);
    if (hours === 23) {
      await expect(button).toBeDisabled();
      assert.equal((await resend(version)).status(), 429);
      await expectPulse(fixed, baseline, id, version);
    }
  }
  const [result] = await Promise.all([
    page.waitForResponse(r => r.url() === origin + path && r.request().method() === "PATCH"),
    button.click(),
  ]);
  assert.deepEqual(result.request().postDataJSON(), { action: "resend", expectedVersion: version });
  assert.equal(result.status(), 200);
  const next = (await result.json()).data;
  assert.equal(next.id, id);
  assert.equal(next.version, version + 1);
  assert.equal(next.sentAt, initial.sentAt.toISOString());
  assert.equal((await resend(version)).status(), 409);
  assert.equal((await resend(version + 1)).status(), 429);
  const saved = await db.terraqoEndorsementRequest.findUniqueOrThrow({ where: { id } });
  assert.equal(saved.version, version + 1);
  assert.equal(saved.sentAt?.getTime(), initial.sentAt.getTime());
  assert.equal(saved.status, status);
  assert.equal(saved.expiresAt.getTime(), initial.expiresAt.getTime());
  assert.equal(saved.reviewerEmail, initial.reviewerEmail);
  assert.equal(saved.revisionHash, initial.revisionHash);
  assert.deepEqual(saved.requestedScope, initial.requestedScope);
  await expectPulse(fixed, baseline, id, saved.version);
  return saved.version;
}
