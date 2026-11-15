import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";
import type { Browser } from "playwright";
import { cleanSharing, type SharingFixture } from "./s06-sharing-fixtures";
import { sharingSession } from "./s06-sharing-browser";
import { asSession, fixedSession } from "./s06-sharing-reads";
import { createRequest, openInbox, readRecipient, requestCard, requests, sendDraft } from "./s07-endorsement-browser";
import { checkLiveIdentity, decision, expectPulse, list, mutation, projection, pulse, verifyResend } from "./s07-endorsement-access";

export async function cleanEndorsements(db: PrismaClient, fixture: SharingFixture) {
  const where = { requesterId: fixture.owner, revisionId: { in: fixture.records.map(r => r.revision) } };
  // Discover committed rows even when the UI never received a response or returned the wrong ID.
  await db.$transaction(async tx => {
    const ids = { in: (await tx.terraqoEndorsementRequest.findMany({ where, select: { id: true } })).map(row => row.id) };
    await tx.terraqoEndorsementDecision.deleteMany({ where: { requestId: ids } });
    await tx.terraqoEndorsementRequest.deleteMany({ where });
    assert.equal(await tx.terraqoEndorsementDecision.count({ where: { requestId: ids } }), 0);
  });
  assert.equal(await db.terraqoEndorsementRequest.count({ where: { requesterId: fixture.owner } }), 0);
  await cleanSharing(db, fixture);
}

export async function exerciseEndorsement(db: PrismaClient, browser: Browser, fixture: SharingFixture, origin: string,
  phase: (name: string) => void) {
  const { recipient, owner, reviewer, password, records: [personal, control] } = fixture;
  const email = recipient + "@example.invalid";
  // S06 seeds the owner's professional profile. The recipient needs a private profile to open the portal.
  await db.terraqoProfessionalProfile.create({ data: { userId: recipient, visibility: "PRIVATE" } });
  phase("sessions");
  const writer = await sharingSession(browser, origin, owner, password);
  const reader = await sharingSession(browser, origin, recipient, password);
  const outsider = await sharingSession(browser, origin, reviewer, password);
  const visitor = await sharingSession(browser, origin);
  const fixed = await fixedSession(reader, origin);
  const thirdParty = asSession(outsider);
  const writerPage = await writer.newPage(), readerPage = await reader.newPage();
  const options = mutation(origin);
  assert.equal((await asSession(visitor)(requests)).status, 401);
  const baseline = (await pulse(fixed)).unreadNotifications;
  const outsiderBaseline = (await pulse(thirdParty)).unreadNotifications;
  const patch = (id: string, action: "send" | "resend", version: number) =>
    writer.request.patch(requests + "/" + id, { ...options, data: { action, expectedVersion: version } });

  phase("draft");
  const draft = await createRequest(writerPage, fixture, personal, false);
  const owned = { requesterId: owner };
  const draftRow = await db.terraqoEndorsementRequest.findFirstOrThrow({ where: { ...owned, id: draft.id }, include: { revision: true } });
  assert.equal(draftRow.sentAt, null);
  assert.equal(draftRow.status, "DRAFT");
  assert.equal(draftRow.revisionHash, draftRow.revision.contentHash);
  assert.deepEqual(draftRow.requestedScope, ["summary"]);
  assert.ok(!(await list(fixed)).some(row => row.id === draft.id));
  await openInbox(readerPage);
  assert.equal(await requestCard(readerPage, draft.id).count(), 0);
  await expectPulse(fixed, baseline);
  assert.equal((await decision(reader, origin, draft.id, 1)).status(), 404);
  assert.equal((await patch(draft.id, "resend", 1)).status(), 409);

  phase("draft-send");
  await sendDraft(writerPage, draft);
  assert.equal((await patch(draft.id, "send", 1)).status(), 409);
  const active = await projection(fixed, draft.id, email, personal, draftRow.revisionHash, true);
  assert.equal(active.version, 2);
  assert.equal(active.status, "PENDING");
  await readRecipient(readerPage, draft.id, personal, true);
  await expectPulse(fixed, baseline, draft.id, active.version);
  assert.ok(!(await list(thirdParty)).some(row => row.id === draft.id));
  await expectPulse(thirdParty, outsiderBaseline);
  assert.equal((await decision(outsider, origin, draft.id, active.version)).status(), 404);
  assert.equal((await outsider.request.patch(requests + "/" + draft.id, {
    ...options, data: { action: "resend", expectedVersion: active.version },
  })).status(), 404);

  phase("live-identity");
  await checkLiveIdentity(db, fixture, fixed, reader, origin, draft.id, active.version, baseline);

  phase("pending-resend");
  const version = await verifyResend(db, fixture, writerPage, origin, draft.id, fixed, baseline, active.version, "PENDING");
  phase("expiry");
  assert.equal((await db.terraqoEndorsementRequest.updateMany({
    where: { ...owned, id: draft.id, version, status: "PENDING" }, data: { expiresAt: new Date(Date.now() - 60_000) },
  })).count, 1);
  assert.equal((await patch(draft.id, "resend", version)).status(), 410);
  assert.equal((await decision(reader, origin, draft.id, version)).status(), 410);
  assert.equal((await projection(fixed, draft.id, email, personal, draftRow.revisionHash, false)).status, "EXPIRED");
  await readRecipient(readerPage, draft.id, personal, false);
  await expectPulse(fixed, baseline);

  phase("create-and-send");
  const sent = await createRequest(writerPage, fixture, control, true);
  const created = await db.terraqoEndorsementRequest.findFirstOrThrow({ where: { ...owned, id: sent.id }, include: { revision: true } });
  assert.ok(created.sentAt);
  assert.equal(created.revisionId, control.revision);
  assert.equal(created.revisionHash, created.revision.contentHash);
  phase("creation-replay");
  const replay = (payload: typeof sent.payload) => writer.request.post(requests, {
    ...options, headers: { Origin: origin, "Idempotency-Key": sent.key }, data: payload,
  });
  const repeated = await replay(sent.payload);
  assert.equal(repeated.status(), 201);
  assert.equal((await repeated.json()).data.id, sent.id);
  assert.equal((await replay({ ...sent.payload, relationshipLabel: "Otra relación" })).status(), 409);
  assert.equal(await db.terraqoEndorsementRequest.count({ where: owned }), 2);
  await expectPulse(fixed, baseline, sent.id, 1);
  await expectPulse(thirdParty, outsiderBaseline);
  assert.ok(!(await list(thirdParty)).some(row => row.id === sent.id));
  await projection(fixed, sent.id, email, control, created.revisionHash, true);
  await readRecipient(readerPage, sent.id, control, true);

  phase("in-review-resend");
  assert.equal((await db.terraqoEndorsementRequest.updateMany({ where: { ...owned, id: sent.id, version: 1, status: "PENDING" },
    data: { status: "IN_REVIEW" } })).count, 1);
  const reviewedVersion = await verifyResend(db, fixture, writerPage, origin, sent.id, fixed, baseline, 1, "IN_REVIEW");
  phase("decision-trace");
  const comment = "Constancia de revisión " + fixture.run;
  const decided = await decision(reader, origin, sent.id, reviewedVersion, comment);
  assert.equal(decided.status(), 200);
  const confirmed = (await decided.json()).data;
  assert.equal(confirmed.status, "CONFIRMED");
  assert.equal(confirmed.version, reviewedVersion + 1);
  assert.equal((await patch(sent.id, "resend", confirmed.version)).status(), 409);
  const decisions = () => db.terraqoEndorsementDecision.findMany({ where: { requestId: sent.id } });
  const before = await decisions();
  assert.equal(before.length, 1);
  assert.equal(before[0].reviewerId, recipient);
  assert.equal(before[0].revisionHash, created.revisionHash);
  assert.equal(before[0].summaryComment, comment);
  assert.deepEqual(before[0].responses, [{ field: "summary", decision: "CONFIRMED" }]);
  phase("revocation");
  await openInbox(writerPage);
  const ownerCard = requestCard(writerPage, sent.id);
  await expect(ownerCard).toContainText(comment);
  await ownerCard.getByRole("button", { name: "Revocar solicitud", exact: true }).click();
  const [revoke] = await Promise.all([
    writerPage.waitForResponse(r => r.url() === origin + requests + "/" + sent.id + "/decisions" && r.request().method() === "DELETE"),
    ownerCard.getByRole("button", { name: "Confirmar revocación", exact: true }).click(),
  ]);
  assert.equal(revoke.status(), 200);
  assert.deepEqual(revoke.request().postDataJSON(), { expectedVersion: confirmed.version });
  await openInbox(writerPage);
  await expect(ownerCard.getByTestId("endorsement-status")).toHaveText("Revocado");
  await expect(ownerCard).toContainText(comment);
  assert.deepEqual(await decisions(), before);
  const revoked = await projection(fixed, sent.id, email, control, created.revisionHash, false);
  assert.equal(revoked.status, "REVOKED");
  assert.equal((await decision(reader, origin, sent.id, revoked.version)).status(), 409);
  assert.equal((await patch(sent.id, "resend", revoked.version)).status(), 409);
  await readRecipient(readerPage, sent.id, control, false);
  await expect(requestCard(readerPage, sent.id)).not.toContainText(comment);
  await expectPulse(fixed, baseline);
  assert.equal(await db.terraqoEndorsementDecision.count({ where: { request: owned } }), 1);
}
