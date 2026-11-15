import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser } from "playwright";
import { assertWorkspaceAdministrationTestTarget, workspaceAdministrationStagingOrigin as staging,
  workspaceAdministrationStagingSite as siteId } from "./lib/workspace-administration-test-target";
import { cleanSharing, seedSharing, type SharingFixture } from "./lib/s06-sharing-fixtures";
import { compose, readPage, sharingSession } from "./lib/s06-sharing-browser";
import { asSession, checkCv, checkSelection, denied, fixedSession } from "./lib/s06-sharing-reads";
import { verifyCompany } from "./lib/s06-company-sharing";

async function confirmCandidate(origin: string) {
  const commit = process.env.S22_STAGING_CANDIDATE_SHA;
  const deployId = process.env.DEPLOY_ID;
  assert.match(commit ?? "", /^[a-f0-9]{40}$/);
  assert.match(deployId ?? "", /^[a-f0-9]{24}$/);
  const response = await fetch(origin + "/__terraqo_s22_candidate.json?deploy=" + deployId,
    { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { kind: "workspace-administration", siteId, commit, deployId });
}

// Call from the S22 verify phase after the S24 operator has staged the exact blob manifest.
export async function verifyS06Sharing(origin = staging) {
  assert.equal(assertWorkspaceAdministrationTestTarget(process.env, origin), "staging");
  assert.equal(process.env.TERRAQO_SCOPED_SHARING_V1, "true");
  assert.equal(process.env.TERRAQO_WORKSPACE_PUBLICATION_V1, "true");
  await confirmCandidate(origin);
  const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  let browser: Browser | undefined, fixture: SharingFixture | undefined;
  let phase = "database-identity";
  try {
    const identity = await db.$queryRaw<{ role: string; database: string }[]>`SELECT current_user AS role, current_database() AS database`;
    assert.deepEqual(identity, [{ role: "terraqo_staging_runtime", database: "postgres" }]);
    phase = "seed";
    fixture = await seedSharing(db);
    const { owner, recipient, reviewer, username, records, run } = fixture;
    const [personal, control] = records;
    phase = "sessions";
    browser = await chromium.launch();
    const writer = await sharingSession(browser, origin, owner, fixture.password);
    const reader = await sharingSession(browser, origin, recipient, fixture.password);
    const admin = await sharingSession(browser, origin, reviewer, fixture.password);
    const anonymous = await sharingSession(browser, origin);
    const fixed = await fixedSession(reader, origin);
    const outsider = asSession(admin), visitor = asSession(anonymous);
    const page = await writer.newPage();
    const options = { headers: { Origin: origin }, maxRedirects: 0 };
    phase = "private";
    const privateSelection = await compose(page, origin, fixture, "Privada " + run, "private", [personal]);
    const privateRoot = "/api/v1/shared-selections/" + privateSelection.id;
    await denied(fixed, privateRoot, personal);
    await denied(outsider, privateRoot, personal);
    await denied(visitor, privateRoot, personal, 401);
    assert.equal(await db.terraqoAccessGrant.count({ where: { collectionId: privateSelection.id } }), 0);
    assert.equal(await db.terraqoPublicProjection.count({ where: { collectionId: privateSelection.id } }), 0);

    phase = "historical-link";
    // A legacy caller omits listOnCv. Its working public link is the negative CV control.
    const legacy = await writer.request.post("/api/v1/share-collections/" + privateSelection.id + "/projection",
      { ...options, data: { expectedVersion: 1 } });
    assert.equal(legacy.status(), 200);
    const legacySlug: string = (await legacy.json()).data.slug;
    await checkSelection(visitor, "/api/v1/public/selections/" + legacySlug, [personal], false);
    await checkCv(anonymous, origin, username, [], [legacySlug]);

    phase = "invited";
    const invited = await compose(page, origin, fixture, "Invitada " + run, "invited", [personal, control]);
    const invitedRoot = "/api/v1/shared-selections/" + invited.id;
    const grants = await db.terraqoAccessGrant.findMany({ where: { collectionId: invited.id } });
    assert.equal(grants.length, 1);
    assert.equal(grants[0].subjectUserId, null);
    assert.equal(grants[0].inviteEmail, recipient + "@example.invalid");
    assert.equal(await db.terraqoPublicProjection.count({ where: { collectionId: invited.id } }), 0);
    await checkSelection(fixed, invitedRoot, [personal, control]);
    await readPage(reader, "/portal/selecciones/" + invited.id, personal);
    await denied(outsider, invitedRoot, personal);
    await denied(visitor, invitedRoot, personal, 401);

    phase = "same-jwt-email-verification";
    const account = { id: recipient, email: recipient + "@example.invalid" };
    assert.equal((await db.user.updateMany({ where: { ...account, emailVerified: fixture.verified }, data: { emailVerified: null } })).count, 1);
    try {
      const session = await fixed("/api/auth/session");
      assert.equal(session.status, 200);
      assert.equal((await session.json()).user.id, recipient);
      await denied(fixed, invitedRoot, personal);
    } finally {
      assert.equal((await db.user.updateMany({ where: { ...account, emailVerified: null }, data: { emailVerified: fixture.verified } })).count, 1);
    }
    await checkSelection(fixed, invitedRoot, [personal, control]);

    phase = "deleted-record";
    const deletedAt = new Date();
    const entry = { id: personal.id, authorId: owner };
    assert.equal((await db.terraqoWorklogEntry.updateMany({ where: { ...entry, deletedAt: null }, data: { deletedAt } })).count, 1);
    try {
      await checkSelection(fixed, invitedRoot, [control]);
      assert.equal((await fixed(invitedRoot + "/media/" + personal.photo!.id)).status, 404);
    } finally {
      assert.equal((await db.terraqoWorklogEntry.updateMany({ where: { ...entry, deletedAt }, data: { deletedAt: null } })).count, 1);
    }
    await checkSelection(fixed, invitedRoot, [personal, control]);
    phase = "grant-revocation";
    const revoke = await writer.request.delete("/api/v1/share-collections/" + invited.id + "/grants",
      { ...options, data: { expectedVersion: 2, grantId: grants[0].id } });
    assert.equal(revoke.status(), 200);
    await denied(fixed, invitedRoot, personal);

    phase = "public-cv";
    const published = await compose(page, origin, fixture, "Pública " + run, "public", [personal]);
    const projection = await db.terraqoPublicProjection.findUniqueOrThrow({ where: { collectionId: published.id } });
    const root = "/api/v1/public/selections/" + projection.slug;
    await checkSelection(visitor, root, [personal]);
    await readPage(anonymous, "/selecciones/" + projection.slug, personal);
    await checkCv(anonymous, origin, username, [projection.slug], [legacySlug]);
    assert.equal((await writer.request.delete("/api/v1/share-collections/" + published.id + "/projection",
      { ...options, data: { expectedVersion: 2 } })).status(), 200);
    await denied(visitor, root, personal);
    await checkCv(anonymous, origin, username, [], [projection.slug, legacySlug]);
    for (const destination of ["public", "invited"] as const) {
      phase = "company-" + destination;
      await verifyCompany({ db, origin, page, fixture, reviewer: admin, anonymous, recipient: reader, fixedReader: fixed, legacySlug }, destination);
    }
    await checkSelection(visitor, "/api/v1/public/selections/" + legacySlug, [personal], false);
    phase = "final-candidate";
    await confirmCandidate(origin);
  } catch (error) {
    // Never print Playwright logs, cookies, invitation tokens, DB URLs or raw API bodies.
    const location = error instanceof Error ? error.stack?.match(/(?:verify-s06-sharing|s06-[a-z-]+)\.ts:\d+:\d+/)?.[0] : undefined;
    const diagnostic = error as { actual?: unknown; expected?: unknown };
    console.error(JSON.stringify({ gate: "s06", phase, run: fixture?.run, location,
      actual: typeof diagnostic?.actual === "number" ? diagnostic.actual : undefined,
      expected: typeof diagnostic?.expected === "number" ? diagnostic.expected : undefined }));
    throw new Error("S06 failed during " + phase);
  } finally {
    try {
      // Stop all browser work before deleting the fixtures, even on a UI assertion failure.
      try { await browser?.close(); }
      finally { if (fixture) await cleanSharing(db, fixture); }
    } finally { await db.$disconnect(); }
  }
  const receipt = { gate: "s06", passed: true, run: fixture.run, commit: process.env.S22_STAGING_CANDIDATE_SHA,
    deployId: process.env.DEPLOY_ID, databaseCleanup: "verified", blobs: "borrowed-s24", realSessions: 3,
    sameJwtVerification: true, deletedRecordFiltered: true, cvListingRevoked: true,
    companyPublicAndInvitedRevoked: true, persistedApprovalAfterReload: true };
  console.log(JSON.stringify(receipt));
  return receipt;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  verifyS06Sharing().catch(error => {
    console.error("S06 rejected", error instanceof Error ? error.stack?.match(/(?:verify-s06-sharing|s06-[a-z-]+|workspace-administration-test-target)\.ts:\d+:\d+/)?.[0] : undefined);
    process.exitCode = 1;
  });
}
