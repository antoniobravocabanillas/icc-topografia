import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { BrowserContext, Page } from "playwright";
import { expect } from "@playwright/test";
import type { SharingFixture } from "./s06-sharing-fixtures";
import { fixedSession, type Read } from "./s06-sharing-reads";
import { list, mutation, pulse } from "./s07-endorsement-access";
import { decisionPath, pinned, reviewForm, reviewPath, type ReviewTarget } from "./s08-review-browser";

export function postDecision(ctx: BrowserContext, origin: string, id: string, data: object, key: string = randomUUID()) {
  return ctx.request.post(decisionPath(id), { ...mutation(origin), headers: { Origin: origin, "Idempotency-Key": key }, data });
}

export async function savedRequest(db: PrismaClient, fixture: SharingFixture, id: string) {
  return db.terraqoEndorsementRequest.findFirstOrThrow({ where: { id, requesterId: fixture.owner },
    include: { decisions: true } });
}

export async function assertHidden(read: Read, target: ReviewTarget, privateText: string) {
  assert.ok(!(await list(read)).some(row => row.id === target.id));
  const response = await read(reviewPath(target.id));
  assert.ok([200, 404].includes(response.status));
  const html = await response.text();
  assert.ok(!html.includes('data-testid="endorsement-request-' + target.id + '"'));
  assert.ok(!html.includes(privateText));
  assert.ok(!html.includes(target.revisionHash));
}

export async function exerciseAuthority(db: PrismaClient, fixture: SharingFixture, page: Page, origin: string) {
  const ctx = page.context(), read = await fixedSession(ctx, origin);
  const { owner, recipient, workspace, records: [, , company] } = fixture;
  const baseline = (await pulse(read)).unreadNotifications;
  const membership = await db.terraqoWorkspaceMember.create({
    data: { workspaceId: workspace, userId: recipient, role: "MANAGER", active: true, title: "Responsable S08" },
  });
  // S07 uses UUID-prefixed synthetic user/workspace IDs, outside the creation DTO's CUID format.
  // Seed assigned requests only. All review reads, writes and replays cross the real session boundary.
  const profile = await db.terraqoProfessionalProfile.findUniqueOrThrow({ where: { userId: owner } });
  const revision = await db.terraqoWorklogRevision.findFirstOrThrow({ where: { id: company.revision, worklogId: company.id } });
  const seed = () => db.terraqoEndorsementRequest.create({ data: {
    requesterId: owner, professionalProfileId: profile.id, reviewerUserId: recipient, organizationId: workspace,
    revisionId: revision.id, revisionHash: revision.contentHash, relationshipLabel: "Revisor empresarial",
    requestedScope: ["summary"], status: "PENDING", sentAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000),
    operationKey: randomUUID(), operationFingerprint: revision.contentHash,
  } });
  const decided = await seed();
  await page.goto(reviewPath(decided.id));
  const form = reviewForm(page);
  const choice = form.getByRole("radio", { name: "Confirmar", exact: true });
  await expect(form).toContainText(company.summary);
  const organization = await db.terraqoWorkspace.findUniqueOrThrow({ where: { id: workspace }, select: { name: true } });
  await expect(form).toContainText(organization.name);
  await expect(form).not.toContainText("Revisas a título personal");
  await choice.check();
  const [reply] = await Promise.all([
    page.waitForResponse(r => r.url() === origin + decisionPath(decided.id) && r.request().method() === "POST"),
    form.getByRole("button", { name: /Registrar revisión/ }).click(),
  ]);
  const payload = { ...pinned(decided), responses: [{ field: "summary", decision: "CONFIRMED" }] };
  assert.deepEqual(reply.request().postDataJSON(), payload);
  const key = await reply.request().headerValue("Idempotency-Key");
  assert.ok(key);
  assert.equal(reply.status(), 200);
  const saved = await savedRequest(db, fixture, decided.id);
  assert.equal(saved.status, "CONFIRMED");
  assert.equal(saved.version, decided.version + 1);
  assert.equal(saved.decisions.length, 1);
  const [decision] = saved.decisions;
  assert.equal(decision.operationKey, key);
  assert.equal(decision.reviewerId, recipient);
  assert.equal(decision.revisionHash, revision.contentHash);
  assert.deepEqual(decision.responses, payload.responses);
  const snapshot = decision.authoritySnapshot;
  assert.ok(snapshot && typeof snapshot === "object" && !Array.isArray(snapshot));
  assert.equal(snapshot.kind, "ORGANIZATION");
  assert.equal(snapshot.workspaceId, workspace);
  assert.equal(snapshot.role, membership.role);
  assert.equal(snapshot.title, membership.title);
  assert.equal(snapshot.membershipUpdatedAt, membership.updatedAt.toISOString());
  assert.ok(typeof snapshot.observedAt === "string" && Number.isFinite(Date.parse(snapshot.observedAt)));

  const pending = await seed();
  await page.goto(reviewPath(pending.id));
  const stale = reviewForm(page);
  await stale.getByRole("radio", { name: "Confirmar", exact: true }).check();
  assert.equal((await pulse(read)).unreadNotifications, baseline + 1);
  assert.equal((await db.terraqoWorkspaceMember.updateMany({ where: { id: membership.id, workspaceId: workspace,
    userId: recipient, active: true, role: membership.role }, data: { active: false } })).count, 1);
  // Keep the open form and signed session. A fresh login could mask stale authorization.
  const [denied] = await Promise.all([
    page.waitForResponse(r => r.url() === origin + decisionPath(pending.id) && r.request().method() === "POST"),
    stale.getByRole("button", { name: /Registrar revisión/ }).click(),
  ]);
  assert.equal(denied.status(), 404);
  await expect(page.getByTestId("s08-evidence")).toHaveCount(0);
  await expect(stale).toHaveCount(0);
  assert.equal((await postDecision(ctx, origin, decided.id, payload, key)).status(), 404);
  await assertHidden(read, pending, company.summary);
  await assertHidden(read, decided, company.summary);
  const after = await pulse(read);
  assert.equal(after.unreadNotifications, baseline);
  assert.ok(!after.latestEvent?.id.startsWith("endorsement:" + pending.id + ":"));
  const untouched = await savedRequest(db, fixture, pending.id);
  assert.equal(untouched.status, "PENDING");
  assert.equal(untouched.version, pending.version);
  assert.deepEqual(untouched.decisions, []);
  assert.deepEqual(await savedRequest(db, fixture, decided.id), saved);
  await page.goto(reviewPath(pending.id));
  await expect(page.getByTestId("s08-evidence")).toHaveCount(0);
}
