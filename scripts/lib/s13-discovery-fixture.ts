import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { s24BlobFixtures, type S24Blob } from "./s24-blob-fixtures.mjs";

export function pilotWorkspace(commit: string) {
  assert.match(commit, /^[a-f0-9]{40}$/);
  return "s13-need-" + commit.slice(0, 16);
}

export function imageRow(worklogId: string, blob: S24Blob, sortOrder = 0) {
  return { worklogId, storageKey: blob.key, fileName: "plano.webp", contentType: "image/webp",
    size: blob.bytes.length, sha256: blob.sha256, sortOrder };
}

export async function seedDiscovery(db: PrismaClient, commit: string, blobRun: string) {
  const [[plan, excluded], additionalPhotos] = s24BlobFixtures(blobRun);
  const run = randomUUID(), key = run.replaceAll("-", "").slice(0, 16);
  const owner = "s13-company-" + run, author = "s13-public-" + run, publisher = "s13-scoped-" + run;
  const workspace = pilotWorkspace(commit), slug = "s13-empresa-" + run;
  const password = randomBytes(24).toString("base64url"), passwordHash = await bcrypt.hash(password, 10);
  const term = "nivel" + key, missing = "calibracion" + key, hidden = "reservado" + key;
  const username = "s13-" + key;
  console.log("S13_FIXTURE_RUN", run, workspace);
  // A concurrent retry with the same pilot ID rolls back here, before any cleanup is armed.
  return db.$transaction(async tx => {
    for (const [id, name] of [[owner, "Responsable S13"], [author, "Profesional S13"], [publisher, hidden]]) {
      await tx.user.create({ data: { id, email: id + "@example.invalid", name, emailVerified: new Date(), passwordHash,
        role: id === owner ? "ADMIN" : "CUSTOMER" } });
    }
    await tx.terraqoWorkspace.create({ data: { id: workspace, slug, type: "CLIENT_COMPANY", name: "Empresa S13",
      ownerUserId: owner, members: { create: { userId: owner, role: "OWNER" } } } });
    const profile = await tx.terraqoProfessionalProfile.create({ data: { userId: author, username, status: "AVAILABLE",
      visibility: "PUBLIC", liveCvVisibility: "PUBLIC", liveCvEnabled: true } });
    const scopedProfile = await tx.terraqoProfessionalProfile.create({ data: { userId: publisher, username: hidden,
      headline: hidden, status: "WORKING", visibility: "PRIVATE", liveCvVisibility: "PRIVATE", liveCvEnabled: true } });
    const need = await tx.terraqoWorkNeed.create({ data: { workspaceId: workspace, createdById: owner,
      operationKey: run, operationFingerprint: run } });
    const revisionData = { needId: need.id, createdById: owner, title: term, activities: [term],
      problem: term, contentHash: key, operationFingerprint: run };
    const revision = await tx.terraqoWorkNeedRevision.create({ data: { ...revisionData, operationKey: run, revisionNo: 1,
      requirements: { create: { label: missing, priority: "REQUIRED" } } } });
    await tx.terraqoWorkNeed.update({ where: { id: need.id }, data: { currentRevisionId: revision.id } });

    const workCase = await tx.terraqoWorkCase.create({ data: { createdById: author, professionalProfileId: profile.id,
      lifecycle: "ACTIVE", title: "Control geométrico S13" } });
    async function record(title: string, summary: string, date: string, isPublic: boolean, scoped = false) {
      const authorId = scoped ? publisher : author, professionalProfileId = scoped ? scopedProfile.id : profile.id;
      const entry = await tx.terraqoWorklogEntry.create({ data: { authorId, professionalProfileId, title, summary,
        locationLabel: summary, occurredAt: new Date(date), visibility: isPublic ? "PUBLIC" : "PRIVATE", lifecycle: "PUBLISHED" } });
      const contentHash = createHash("sha256").update(entry.id).digest("hex");
      const rev = await tx.terraqoWorklogRevision.create({ data: { worklogId: entry.id, createdById: authorId,
        title, summary, methods: [title], revisionNo: 1, contentHash } });
      await tx.terraqoWorklogEntry.update({ where: { id: entry.id }, data: { currentRevisionId: rev.id } });
      return { id: entry.id, revision: rev.id, contentHash, title, summary };
    }
    const first = await record(term + " Replanteo", "Viaducto", "2026-02-12T04:59:59Z", true);
    const second = await record(term + " Nivelación", "Cantera", "2026-02-12T05:00:00Z", true);
    const solo = await record(term + " Inspección", "Muelle", "2026-02-15T12:00:00Z", true);
    const limited = await record(term + " Deslinde", hidden, "2026-02-16T12:00:00Z", false, true);
    const privateRecord = await record(term + " " + hidden, hidden, "2026-02-16T12:00:00Z", false);
    // Reference operator-owned S24 objects. The scoped publication explicitly omits the underlying photo.
    const photo = await tx.terraqoWorklogMedia.create({ data: imageRow(solo.id, plan) });
    await tx.terraqoWorklogMedia.create({ data: imageRow(limited.id, excluded) });
    await tx.terraqoWorkCaseRecord.createMany({ data: [first, second].map(item => ({ workCaseId: workCase.id,
      worklogId: item.id, relationshipStatus: "CONFIRMED", confirmedById: author, confirmedAt: new Date() })) });
    const collection = await tx.terraqoShareCollection.create({ data: { professionalProfileId: scopedProfile.id,
      createdById: publisher, title: "Selección S13", lifecycle: "ACTIVE", operationKey: run, operationFingerprint: run,
      items: { create: { revisionId: limited.revision, allowedFields: ["title"] } },
      publicProjection: { create: { slug: "s13-" + key, policyVersion: "public-selection-v1" } } },
      include: { publicProjection: true } });
    // The reader independently holds a wider grant. Saving the selected publication must still pin title only.
    const alternate = await tx.terraqoShareCollection.create({ data: { professionalProfileId: scopedProfile.id,
      createdById: publisher, title: "Acceso directo S13", lifecycle: "ACTIVE", operationKey: randomUUID(), operationFingerprint: run,
      items: { create: { revisionId: limited.revision, allowedFields: ["title", "summary"] } },
      grants: { create: { subjectUserId: owner, issuedById: publisher, scopes: ["VIEW_COLLECTION"],
        expiresAt: new Date(Date.now() + 86_400_000), operationKey: run, operationFingerprint: run } } } });
    assert.ok(collection.publicProjection);
    return { run, plan, photoId: photo.id, additionalPhotos, owner, author, publisher, workspace, slug, password, term, missing, hidden, username,
      need: need.id, revision: revision.id, profile: profile.id, scopedProfile: scopedProfile.id, workCase: workCase.id,
      first, second, solo, limited, privateRecord, alternate: alternate.id, collection: collection.id, projection: collection.publicProjection.id };
  }, { timeout: 45_000 });
}
export type DiscoveryFixture = Awaited<ReturnType<typeof seedDiscovery>>;

export async function cleanDiscovery(db: PrismaClient, f: DiscoveryFixture) {
  const users = [f.owner, f.author, f.publisher];
  await db.$transaction(async tx => {
    await tx.terraqoEvaluationDossier.deleteMany({ where: { createdById: f.owner, workspaceId: f.workspace } });
    await tx.terraqoWorkNeed.delete({ where: { id: f.need, createdById: f.owner } });
    await tx.terraqoShareCollection.deleteMany({ where: { id: { in: [f.collection, f.alternate] }, createdById: f.publisher } });
    await tx.terraqoWorkCase.delete({ where: { id: f.workCase, createdById: f.author } });
    await tx.terraqoWorklogEntry.deleteMany({ where: { authorId: { in: [f.author, f.publisher] } } });
    await tx.terraqoWorkspace.delete({ where: { id: f.workspace, slug: f.slug, ownerUserId: f.owner } });
    await tx.verificationToken.deleteMany({ where: { identifier: { in: users.map(id => "web-cv-session:" + id) } } });
    await tx.activityLog.deleteMany({ where: { actorId: { in: users } } });
    await tx.user.deleteMany({ where: { id: { in: users }, email: { in: users.map(id => id + "@example.invalid") } } });
  }, { timeout: 45_000 });
}

export async function verifyDiscoveryRemoved(db: PrismaClient, f: DiscoveryFixture, revisions: string[]) {
  const users = { in: [f.owner, f.author, f.publisher] };
  const records = { in: [f.first, f.second, f.solo, f.limited, f.privateRecord].map(r => r.id) };
  const counts = await db.$transaction([
    db.user.count({ where: { id: users } }), db.terraqoWorkspace.count({ where: { slug: f.slug } }),
    db.terraqoWorkspaceMember.count({ where: { userId: users } }), db.terraqoProfessionalProfile.count({ where: { userId: users } }),
    db.activityLog.count({ where: { actorId: users } }),
    db.verificationToken.count({ where: { identifier: { in: users.in.map(id => "web-cv-session:" + id) } } }),
    db.terraqoWorkNeed.count({ where: { id: f.need } }), db.terraqoWorkNeedRevision.count({ where: { needId: f.need } }),
    db.terraqoNeedRequirement.count({ where: { revisionId: { in: [f.revision, ...revisions] } } }),
    db.terraqoWorkCase.count({ where: { id: f.workCase } }), db.terraqoWorkCaseRecord.count({ where: { workCaseId: f.workCase } }),
    db.terraqoWorklogEntry.count({ where: { id: records } }), db.terraqoWorklogRevision.count({ where: { worklogId: records } }),
    db.terraqoWorklogMedia.count({ where: { worklogId: records } }),
    db.terraqoShareCollection.count({ where: { createdById: f.publisher } }),
    db.terraqoShareCollectionItem.count({ where: { collectionId: { in: [f.collection, f.alternate] } } }),
    db.terraqoAccessGrant.count({ where: { issuedById: f.publisher } }),
    db.terraqoPublicProjection.count({ where: { id: f.projection } }),
    db.terraqoEvaluationDossier.count({ where: { createdById: f.owner } }), db.terraqoEvaluationSource.count({ where: { addedById: f.owner } }),
  ]);
  assert.ok(counts.every(count => count === 0), "S13 fixture data survived cleanup");
}
