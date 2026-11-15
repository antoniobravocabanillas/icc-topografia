import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { chromium } from "playwright";
import type { PrismaClient } from "@prisma/client";
import { seedSharing, cleanSharing } from "./s06-sharing-fixtures";
import { sharingSession } from "./s06-sharing-browser";
import { asSession, checkSelection, denied, fixedSession } from "./s06-sharing-reads";
import { s24BlobFixtures } from "./s24-blob-fixtures.mjs";
import { visitorJourney, emptyContact } from "./s09-visitor-browser";
import { anonymousSession, publicSurface } from "./s09-visitor-reads";
import { scopedCase } from "./s09-visitor-case";
import { recordAvailabilityDeclaration } from "../../lib/terraqo/professional-availability";

// The staging and local entry points validate their target and open their own database client.
export async function exerciseVisitor(db: PrismaClient, origin: string, phase: (name: string) => void) {
  phase("seed");
  const fixture = await seedSharing(db);
  const { owner, recipient, reviewer, username, run, workspace } = fixture;
  const [personal, control, company] = fixture.records;
  const projectId = "s09-project-" + run, docId = "s09-document-" + run;
  const clientName = "Cliente reservado " + run, fileName = "dni-" + run + ".pdf";
  const hidden = [clientName, fileName, docId, "private-s09/" + run];
  const blobs = s24BlobFixtures(process.env.PLATFORM_STAGING_S24_BLOB_RUN!);
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let profileId: string | undefined;
  try {
    const profile = await db.terraqoProfessionalProfile.findUniqueOrThrow({ where: { userId: owner } });
    profileId = profile.id;
    const where = (id: string) => ({ id, authorId: owner, professionalProfileId: profile.id });
    phase("synthetic-controls");
    const excludedMedia = await db.$transaction(async tx => {
      await tx.project.create({ data: { id: projectId, terraqoWorkspaceId: workspace, title: "Nivelación S09",
        slug: projectId, isPublic: true, clientName, summary: "Levantamiento", description: "Control sintético", servicesApplied: [] } });
      await tx.terraqoProfessionalDocument.create({ data: { id: docId, professionalProfileId: profile.id, type: "DNI_FRONT",
        fileName, storageKey: hidden[3], size: 16, contentType: "application/pdf" } });
      await tx.terraqoWorklogEntry.update({ where: where(personal.id), data: { projectId, latitude: -12.01234, longitude: -77.01234 } });
      await tx.terraqoWorklogEntry.update({ where: where(company.id), data: { visibility: "PUBLIC" } });
      const [controlBlob, excluded] = blobs.map(pair => pair[1]);
      const add = (id: string, blob: typeof excluded) => tx.terraqoWorklogMedia.create({ data: { worklogId: id,
        fileName: "control.webp", storageKey: blob.key, size: blob.bytes.length, sha256: blob.sha256, contentType: "image/webp" } });
      const controlPhoto = await add(control.id, controlBlob);
      control.photo = { id: controlPhoto.id, bytes: controlBlob.bytes };
      return (await add(company.id, excluded)).id;
    });
    phase("sessions");
    browser = await chromium.launch();
    const visitor = await sharingSession(browser, origin);
    const writer = await sharingSession(browser, origin, owner, fixture.password);
    const reader = await sharingSession(browser, origin, recipient, fixture.password);
    const admin = await sharingSession(browser, origin, reviewer, fixture.password);
    const read = asSession(visitor);
    const page = await visitor.newPage();
    await anonymousSession(visitor);
    phase("limited-grant");
    const created = await writer.request.post("/api/v1/share-collections", { maxRedirects: 0,
      headers: { Origin: origin, "Idempotency-Key": randomUUID() }, data: { title: "Lectura S09 " + run,
        items: [{ revisionId: personal.revision, allowedFields: ["summary"], includeMedia: true }] } });
    assert.equal(created.status(), 201);
    const collection = (await created.json()).data;
    assert.equal(collection.version, 1);
    assert.deepEqual(collection.grants, []);
    const issued = await writer.request.post("/api/v1/share-collections/" + collection.id + "/grants", {
      maxRedirects: 0, headers: { Origin: origin, "Idempotency-Key": randomUUID() }, data: { expectedVersion: collection.version,
        inviteEmail: recipient + "@example.invalid", scopes: ["VIEW_COLLECTION"], expiresAt: new Date(Date.now() + 3600000).toISOString() } });
    assert.equal(issued.status(), 201);
    const root = "/api/v1/shared-selections/" + collection.id;
    const fixed = await fixedSession(reader, origin);
    await checkSelection(fixed, root, [personal]);
    assert.equal((await fixed(root + "/media/" + control.photo!.id)).status, 404);
    await denied(read, root, personal, 401);
    await denied(asSession(admin), root, personal);
    await publicSurface(read, username, profileId, [], fixture.records, hidden);
    const grant = await db.terraqoAccessGrant.findFirstOrThrow({ where: { collectionId: collection.id, issuedById: owner } });
    assert.deepEqual(grant.scopes, ["VIEW_COLLECTION"]);
    assert.equal((await writer.request.delete("/api/v1/share-collections/" + collection.id + "/grants",
      { maxRedirects: 0, headers: { Origin: origin }, data: { expectedVersion: 2, grantId: grant.id } })).status(), 200);
    await denied(fixed, root, personal);

    phase("publication");
    await db.terraqoWorklogEntry.update({ where: where(personal.id), data: { visibility: "PUBLIC" } });
    await publicSurface(read, username, profileId, [personal], [control, company], hidden);
    phase("anonymous-navigation");
    await visitorJourney(page, origin, username, personal, hidden);
    const availability = page.getByTestId("s09-availability");
    await expect(availability).toContainText("Sin declaración fechada");
    await expect(availability.locator("time")).toHaveCount(0);
    const declared = await db.$transaction(async tx => {
      const saved = await tx.terraqoProfessionalProfile.update({ where: { id: profile.id, userId: owner }, data: { status: "WORKING" } });
      await recordAvailabilityDeclaration(tx, saved);
      return saved.updatedAt.toISOString();
    });
    await page.reload();
    await expect(availability).toContainText("Trabajando");
    await expect(availability.locator("time")).toHaveAttribute("datetime", declared);

    phase("per-record-withdrawal");
    await db.terraqoWorklogEntry.update({ where: where(control.id), data: { visibility: "PUBLIC" } });
    for (const change of [{ lifecycle: "DRAFT" }, { lifecycle: "READY" }, { lifecycle: "ARCHIVED" },
      { lifecycle: "PUBLISHED", deletedAt: new Date() }, { visibility: "PRIVATE", deletedAt: null }] as const) {
      await db.terraqoWorklogEntry.update({ where: where(personal.id), data: change });
      await publicSurface(read, username, profileId, [control], [personal, company], hidden);
    }

    phase("scoped-company-case");
    await scopedCase(db, fixture, profileId, origin, writer, admin, page, [control, company], excludedMedia);
    phase("empty-profile");
    await publicSurface(read, username, profileId, [], fixture.records, hidden);
    await emptyContact(page, origin, username, [...hidden, ...fixture.records.map(row => row.title)]);
    // The public visitor remains anonymous. A separate reader signs in through the same continuation.
    phase("contact-continuation");
    const contactContext = await sharingSession(browser, origin);
    const contact = await contactContext.newPage();
    const destination = origin + "/cv/" + username + "/contacto";
    await contact.goto(destination);
    const login = contact.locator("form").filter({ has: contact.getByRole("button", { name: "Iniciar sesión", exact: true }) });
    await login.locator('input[name="email"]').fill(recipient + "@example.invalid");
    await login.locator('input[name="password"]').fill(fixture.password);
    await login.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
    await contact.waitForURL(destination);
    await expect(contact.getByRole("heading", { name: "Contactar a " + username, exact: true })).toBeVisible();
    const session = await contactContext.request.get("/api/auth/session", { maxRedirects: 0 });
    assert.equal((await session.json()).user.id, recipient);
    await anonymousSession(visitor);
    phase("profile-withdrawal");
    await db.terraqoProfessionalProfile.update({ where: { id: profileId, userId: owner }, data: { liveCvEnabled: false } });
    for (const path of ["/cv/" + username, "/cv/" + username + "/contacto", "/api/terraqo/cv/" + username + "/pdf"])
      assert.equal((await read(path)).status, 404);
    return run;
  } finally {
    try {
      try { await browser?.close(); }
      finally {
        await db.project.deleteMany({ where: { id: projectId, terraqoWorkspaceId: workspace } });
        await cleanSharing(db, fixture);
        assert.equal(await db.project.count({ where: { id: projectId } }), 0);
        assert.equal(await db.terraqoProfessionalDocument.count({ where: { id: docId } }), 0);
        if (profileId) assert.equal(await db.terraqoCvPublicationOperation.count({ where: { professionalProfileId: profileId } }), 0);
      }
    } catch {
      phase("cleanup-" + run);
      throw new Error("S09 fixture cleanup failed");
    }
  }
}
