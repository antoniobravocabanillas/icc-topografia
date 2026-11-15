import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { s24BlobFixtures } from "./s24-blob-fixtures.mjs";

export async function seedSharing(db: PrismaClient) {
  const run = randomUUID();
  const owner = "s06-owner-" + run, recipient = "s06-reader-" + run, reviewer = "s06-admin-" + run;
  const workspace = "s06-space-" + run;
  const password = randomBytes(24).toString("base64url");
  const username = "s06-" + run.replaceAll("-", "").slice(0, 24);
  const verified = new Date();
  const passwordHash = await bcrypt.hash(password, 10);
  const [personalPhoto, companyPhoto] = s24BlobFixtures(process.env.PLATFORM_STAGING_S24_BLOB_RUN!).map(pair => pair[0]);
  console.log("S06_FIXTURE_RUN", run);
  const records = await db.$transaction(async tx => {
    for (const id of [owner, recipient, reviewer]) {
      await tx.user.create({ data: { id, email: id + "@example.invalid", emailVerified: verified, passwordHash,
        role: id === reviewer ? "ADMIN" : "CUSTOMER" } });
    }
    const profile = await tx.terraqoProfessionalProfile.create({ data: { userId: owner, username,
      visibility: "PUBLIC", liveCvEnabled: true, liveCvVisibility: "PUBLIC" } });
    await tx.terraqoWorkspace.create({ data: { id: workspace, slug: workspace, name: "S06 empresa de prueba", ownerUserId: reviewer,
      members: { create: [{ userId: owner, role: "MEMBER", active: true }, { userId: reviewer, role: "ADMIN", active: true }] } } });
    const records = [];
    for (const [name, photo] of [["personal", personalPhoto], ["control", null], ["empresa", companyPhoto]] as const) {
      const title = "Fuente reservada " + name + " " + run;
      const summary = "Descripción autorizada " + name + " " + run;
      const entry = await tx.terraqoWorklogEntry.create({ data: { id: "s06-" + name + "-" + run, authorId: owner,
        professionalProfileId: profile.id, workspaceId: name === "empresa" ? workspace : null,
        title, summary, lifecycle: "PUBLISHED", visibility: "PRIVATE" } });
      const revision = await tx.terraqoWorklogRevision.create({ data: { worklogId: entry.id, title, summary,
        outcome: "Resultado reservado " + run, revisionNo: 1, createdById: owner,
        contentHash: createHash("sha256").update(entry.id).digest("hex") } });
      await tx.terraqoWorklogEntry.update({ where: { id: entry.id }, data: { currentRevisionId: revision.id } });
      // Only reference the operator's preseeded S24 object. Never write or delete blob storage.
      const media = photo ? await tx.terraqoWorklogMedia.create({ data: { worklogId: entry.id,
        fileName: "plano.webp", storageKey: photo.key, sha256: photo.sha256, size: photo.bytes.length, contentType: "image/webp" } }) : null;
      records.push({ title, summary, id: entry.id, revision: revision.id, photo: media && photo ? { id: media.id, bytes: photo.bytes } : null });
    }
    return records;
  }, { timeout: 45_000 });
  return { run, owner, recipient, reviewer, workspace, username, password, verified, records };
}
export type SharingFixture = Awaited<ReturnType<typeof seedSharing>>;
export type SharingRecord = SharingFixture["records"][number];

export async function cleanSharing(db: PrismaClient, fixture: SharingFixture) {
  const { owner, recipient, reviewer, workspace, records } = fixture;
  const users = { in: [owner, recipient, reviewer] };
  const entries = { in: records.map(r => r.id) };
  const tokens = { in: users.in.map(id => "web-cv-session:" + id) };
  const collection = { createdById: owner, professionalProfile: { userId: owner } };
  const ids = { in: (await db.terraqoShareCollection.findMany({ where: collection, select: { id: true } })).map(c => c.id) };
  await db.$transaction([
    db.terraqoPublicationReview.deleteMany({ where: { workspaceId: workspace, requestedById: owner, collectionId: ids } }),
    db.terraqoShareCollection.deleteMany({ where: { ...collection, id: ids } }),
    db.terraqoWorklogEntry.deleteMany({ where: { id: entries, authorId: owner } }),
    db.terraqoWorkspace.deleteMany({ where: { id: workspace, ownerUserId: reviewer } }),
    db.verificationToken.deleteMany({ where: { identifier: tokens } }),
    db.user.deleteMany({ where: { id: users, email: { in: users.in.map(id => id + "@example.invalid") } } }),
  ]);
  const remaining = await db.$transaction([
    db.user.count({ where: { id: users } }), db.terraqoWorkspace.count({ where: { id: workspace } }),
    db.terraqoProfessionalProfile.count({ where: { userId: users } }), db.terraqoWorkspaceMember.count({ where: { workspaceId: workspace } }),
    db.terraqoShareCollection.count({ where: { createdById: owner } }), db.terraqoShareCollectionItem.count({ where: { collectionId: ids } }),
    db.terraqoPublicProjection.count({ where: { collectionId: ids } }), db.terraqoAccessGrant.count({ where: { issuedById: owner } }),
    db.terraqoPublicationReview.count({ where: { requestedById: owner } }), db.verificationToken.count({ where: { identifier: tokens } }),
    db.terraqoWorklogEntry.count({ where: { id: entries } }), db.terraqoWorklogRevision.count({ where: { worklogId: entries } }),
    db.terraqoWorklogMedia.count({ where: { worklogId: entries } }),
  ]);
  assert.ok(remaining.every(count => count === 0), "S06 fixture readback found residual rows");
}
