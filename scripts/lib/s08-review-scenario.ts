import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { Browser } from "playwright";
import type { SharingFixture } from "./s06-sharing-fixtures";
import { sharingSession } from "./s06-sharing-browser";
import { asSession, fixedSession } from "./s06-sharing-reads";
import { list, mutation, pulse } from "./s07-endorsement-access";
import { inbox, requestCard, requests } from "./s07-endorsement-browser";
import { assertHidden, exerciseAuthority, postDecision, savedRequest } from "./s08-review-authority";
import { clickNotice, completePersonalReview, pinned, reviewForm, reviewPath, type ReviewTarget } from "./s08-review-browser";

export async function exerciseReview(db: PrismaClient, browser: Browser, fixture: SharingFixture, origin: string,
  phase: (name: string) => void) {
  const { owner, recipient, reviewer, password, records: [personal] } = fixture;
  await db.terraqoProfessionalProfile.createMany({ data: [recipient, reviewer].map(userId => ({ userId, visibility: "PRIVATE" })) });
  phase("sessions");
  const writer = await sharingSession(browser, origin, owner, password);
  const reader = await sharingSession(browser, origin, recipient, password);
  const outsider = await sharingSession(browser, origin, reviewer, password);
  const read = await fixedSession(reader, origin);
  const page = await reader.newPage();
  const original = await db.terraqoWorklogRevision.findFirstOrThrow({ where: { id: personal.revision, worklogId: personal.id } });
  const create = async (requestedScope: string[], relationshipLabel: string): Promise<ReviewTarget> => {
    const res = await writer.request.post(requests, { ...mutation(origin), headers: { Origin: origin, "Idempotency-Key": randomUUID() },
      data: { reviewerEmail: recipient + "@example.invalid", revisionId: original.id, requestedScope, relationshipLabel,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(), sendNow: true } });
    assert.equal(res.status(), 201);
    const { data } = await res.json();
    assert.match(data.id, /^c[a-z0-9]+$/);
    assert.equal(data.revisionId, original.id);
    assert.equal(data.revisionHash, original.contentHash);
    assert.equal(data.status, "PENDING");
    assert.equal(data.version, 1);
    return { id: data.id, revisionId: original.id, revisionHash: original.contentHash, version: data.version };
  };
  phase("notice");
  const baseline = (await pulse(read)).unreadNotifications;
  const originalPlace = "Punto de control original " + fixture.run;
  const originalDate = new Date("2025-03-14T15:00:00.000Z");
  assert.equal((await db.terraqoWorklogEntry.updateMany({
    where: { id: personal.id, authorId: owner, currentRevisionId: original.id },
    data: { locationLabel: originalPlace, occurredAt: originalDate },
  })).count, 1);
  const historical = await create(["occurredAt", "locationLabel"], "Contexto histórico " + fixture.run);
  const target = await create(["title", "summary", "outcome"], "Supervisor personal " + fixture.run);
  const competing = { userId: recipient, terraqoWorkspaceId: fixture.workspace, title: "Aviso de control " + fixture.run };
  try {
    const sent = await savedRequest(db, fixture, target.id);
    const later = new Date(sent.updatedAt.getTime() + 1000);
    const latest = await db.notification.create({ data: { ...competing, createdAt: later, readAt: later } });
    const notice = await read("/api/terraqo/activity-pulse");
    assert.equal(notice.status, 200);
    const { data } = await notice.json();
    assert.equal(data.latestEvent?.id, "notification:" + latest.id);
    assert.equal(data.pendingEndorsementHref, reviewPath(target.id));
    assert.equal(data.unreadNotifications, baseline + 2);
    assert.equal((await page.goto(inbox))?.status(), 200);
    await clickNotice(page, origin, target);
  } finally {
    await db.notification.deleteMany({ where: competing });
    assert.equal(await db.notification.count({ where: competing }), 0);
  }
  await expect(requestCard(page, historical.id)).toHaveCount(0);
  const selected = await read(reviewPath(target.id));
  assert.equal(selected.status, 200);
  assert.ok(!(await selected.text()).includes(historical.id));
  const before = (await list(read)).find(row => row.id === target.id);
  assert.deepEqual(before?.revision.worklog, { id: personal.id });
  await assertHidden(asSession(outsider), target, personal.summary);

  phase("original-revision");
  const newerSummary = "Descripción posterior " + fixture.run;
  const location = "Lugar posterior " + fixture.run;
  const laterDate = new Date("2025-06-19T17:45:00.000Z");
  const newer = await db.$transaction(async tx => {
    const row = await tx.terraqoWorklogRevision.create({ data: { worklogId: personal.id, createdById: owner, revisionNo: 2,
      title: "Título posterior " + fixture.run, summary: newerSummary, contentHash: createHash("sha256").update(newerSummary).digest("hex") } });
    assert.equal((await tx.terraqoWorklogEntry.updateMany({ where: { id: personal.id, authorId: owner, currentRevisionId: original.id },
      data: { currentRevisionId: row.id, title: row.title, summary: row.summary, occurredAt: laterDate, locationLabel: location } })).count, 1);
    return row;
  });
  const rows = await list(read);
  const scoped = rows.find(row => row.id === target.id);
  assert.ok(scoped);
  assert.equal(scoped.revisionId, original.id);
  assert.equal(scoped.revisionHash, original.contentHash);
  assert.deepEqual(scoped.revision, { id: original.id, contentHash: original.contentHash, revisionNo: 1,
    createdAt: original.createdAt.toISOString(), title: original.title, summary: original.summary, outcome: original.outcome,
    worklog: { id: personal.id, newerRevisionAvailable: true } });
  const preserved = rows.find(row => row.id === historical.id);
  assert.deepEqual(preserved?.revision.worklog, { id: personal.id, newerRevisionAvailable: true,
    occurredAt: originalDate.toISOString(), locationLabel: originalPlace });
  await page.goto(reviewPath(historical.id));
  const evidence = page.getByTestId("s08-evidence");
  await expect(evidence).toContainText(originalPlace);
  await expect(evidence).not.toContainText(location);
  await expect(page.getByTestId("s08-historical-unavailable")).toHaveCount(0);
  // Reconstruct a legacy request whose original work context was never captured.
  assert.equal((await db.terraqoWorklogRevision.updateMany({
    where: { id: original.id, createdById: owner, worklogId: personal.id, contentHash: original.contentHash,
      revisionNo: 1, worklog: { currentRevisionId: newer.id } },
    data: { sourceMetadata: Prisma.DbNull },
  })).count, 1);
  const past = (await list(read)).find(row => row.id === historical.id);
  assert.deepEqual(past?.revision.worklog, { id: personal.id, newerRevisionAvailable: true, historicalContextUnavailable: true });
  await page.goto(reviewPath(historical.id));
  const blocked = page.getByTestId("s08-review");
  await expect(blocked.getByTestId("s08-historical-unavailable")).toBeVisible();
  await expect(blocked).not.toContainText(location);
  const blockedHtml = await (await read(reviewPath(historical.id))).text();
  assert.ok(!blockedHtml.includes(location) && !blockedHtml.includes(laterDate.toISOString()));
  await expect(blocked.getByTestId("s08-submit")).toBeDisabled();
  const staleContext = { ...pinned(historical), responses: [
    { field: "occurredAt", decision: "CONFIRMED" }, { field: "locationLabel", decision: "CONFIRMED" }] };
  assert.equal((await postDecision(reader, origin, historical.id, staleContext)).status(), 409);
  const unchanged = await savedRequest(db, fixture, historical.id);
  assert.equal(unchanged.version, 1);
  assert.equal(unchanged.status, "PENDING");
  assert.deepEqual(unchanged.decisions, []);

  await page.goto(reviewPath(target.id));
  const form = reviewForm(page);
  await expect(form).toContainText("Revisas a título personal");
  await expect(page.getByTestId("s08-newer-revision")).toBeVisible();
  await page.getByText("Ver versión solicitada", { exact: true }).click();
  await expect(page.getByTestId("s08-evidence")).toContainText(original.contentHash);
  await expect(form).toContainText(original.summary);
  await expect(form).not.toContainText(newerSummary);
  phase("decision-validation");
  const valid = { ...pinned(target), responses: ["title", "summary", "outcome"].map(field => ({ field, decision: "CONFIRMED" })) };
  for (const patch of [{ expectedRevisionId: newer.id }, { expectedRevisionHash: newer.contentHash }, { expectedVersion: 2 }]) {
    assert.equal((await postDecision(reader, origin, target.id, { ...valid, ...patch })).status(), 409);
  }
  for (const responses of [valid.responses.slice(0, 2), [...valid.responses.slice(0, 2), valid.responses[0]],
    [...valid.responses.slice(0, 2), { field: "methods", decision: "CONFIRMED" }],
    [...valid.responses.slice(0, 2), { field: "outcome", decision: "CHANGES_REQUESTED", comment: "   " }],
    [...valid.responses.slice(0, 2), { field: "outcome", decision: "CONFIRMED", comment: "a".repeat(1201) }]]) {
    assert.equal((await postDecision(reader, origin, target.id, { ...valid, responses })).status(), 422);
  }
  assert.equal((await postDecision(outsider, origin, target.id, valid)).status(), 404);
  const pending = await savedRequest(db, fixture, target.id);
  assert.equal(pending.version, target.version);
  assert.equal(pending.status, "PENDING");
  assert.deepEqual(pending.decisions, []);

  phase("personal-review-replay");
  const { key, decisionId, payload } = await completePersonalReview(page, target, fixture.run);
  assert.equal((await postDecision(reader, origin, target.id, { ...payload, summaryComment: "Otro comentario" }, key)).status(), 409);
  assert.equal((await postDecision(reader, origin, target.id, payload)).status(), 409);
  const saved = await savedRequest(db, fixture, target.id);
  assert.equal(saved.status, "CHANGES_REQUESTED");
  assert.equal(saved.version, target.version + 1);
  assert.equal(saved.revisionId, original.id);
  assert.equal(saved.decisions.length, 1);
  const [decision] = saved.decisions;
  assert.equal(decision.id, decisionId);
  assert.equal(decision.operationKey, key);
  assert.equal(decision.reviewerId, recipient);
  assert.equal(decision.revisionHash, original.contentHash);
  assert.deepEqual(decision.responses, payload.responses);
  assert.equal(decision.summaryComment, payload.summaryComment);
  assert.deepEqual(decision.authoritySnapshot, { kind: "PERSONAL" });
  assert.equal((await pulse(read)).unreadNotifications, baseline + 1);
  phase("organization-review-and-withdrawal");
  await exerciseAuthority(db, fixture, page, origin);
  assert.ok((await list(read)).some(row => row.id === target.id));
}
