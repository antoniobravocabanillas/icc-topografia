import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { s24BlobFixtures } from "./s24-blob-fixtures.mjs";

export function recordFixture(blobRun: string) {
  const run = randomUUID();
  const id = (kind: string) => `s11-${kind}-${run}`;
  const username = "s11-" + run.replaceAll("-", "").slice(0, 24);
  const archive = "/cv/" + username + "/evidencias";
  const record = id("record");
  const pairs = s24BlobFixtures(blobRun);
  const locked = { ...pairs[0][1], id: id("locked"), fileName: id("field-book") + ".bin" };
  const photos = pairs.map(([blob], i) => ({
    ...blob, id: id("plan-" + i), fileName: id("original-" + i) + ".webp",
  }));
  return { run, owner: id("owner"), reviewer: id("reviewer"), profile: id("profile"), workspace: id("space"),
    username, archive, record, canonical: archive + "/" + record, revision: id("revision"), approved: id("approved"),
    pending: id("pending"), request: id("request"), decision: id("decision"), document: id("document"),
    documentFile: id("expediente") + ".pdf", documentKey: id("locked-key"), photos, locked, avatar: id("private-avatar"),
    author: "Elena Rivera " + run.slice(0, 8), validator: "Inés Valdez " + run.slice(0, 8),
    title: "Nivelación de control " + run.slice(0, 8), summary: "Comprobación del eje de replanteo.",
    outcome: "Cierre altimétrico del tramo norte.", place: "Punto -12.345679, -77.765431",
    occurred: new Date("2026-10-29T04:15:00Z"), created: new Date("2026-10-31T04:20:00Z"),
    resolved: new Date("2026-11-03T04:25:00Z"), lat: -12.345679, lon: -77.765431,
    rawUrl: "https://example.invalid/" + id("interno"), requestNote: id("request-note"),
    responseNote: id("response-note"), privateRelation: id("relationship"), privateDecision: id("decision-note"),
    privateRevision: id("version-privada"), hash: createHash("sha256").update(run).digest("hex"),
  };
}
export type RecordFixture = ReturnType<typeof recordFixture>;

export function recordSecrets(f: RecordFixture) {
  return [f.locked.id, f.locked.fileName, f.locked.key, f.avatar, f.request, f.decision, f.pending, f.document, f.documentFile, f.documentKey, f.rawUrl.split("/").pop()!, f.requestNote, f.responseNote,
    f.privateRelation, f.privateDecision, f.privateRevision, f.hash, String(f.lat), String(f.lon),
    ...f.photos.flatMap(p => [p.fileName, p.key, p.sha256])];
}

export async function seedRecord(db: PrismaClient, f: RecordFixture) {
  // Only reference preseeded S24 keys. A conflicting registration rolls back the entire seed.
  await db.$transaction(async tx => {
    await tx.user.createMany({ data: [[f.owner, f.author], [f.reviewer, f.validator]].map(([id, name]) => ({
      id, name, image: id === f.reviewer ? "https://example.invalid/" + f.avatar : null, role: "CUSTOMER", email: id + "@example.invalid",
    })) });
    await tx.terraqoProfessionalProfile.create({ data: { id: f.profile, userId: f.owner, username: f.username,
      visibility: "PUBLIC", liveCvEnabled: true, liveCvVisibility: "PUBLIC" } });
    await tx.terraqoWorkspace.create({ data: { id: f.workspace, slug: f.workspace, ownerUserId: f.reviewer, name: "Control S11" } });
    await tx.terraqoProfessionalDocument.create({ data: { id: f.document, professionalProfileId: f.profile, type: "DNI_FRONT",
      fileName: f.documentFile, storageKey: f.documentKey, size: 32, contentType: "application/pdf" } });
    await tx.terraqoWorklogEntry.create({ data: { id: f.record, professionalProfileId: f.profile, authorId: f.owner,
      title: f.title, summary: f.summary, outcome: f.outcome, locationLabel: f.place, type: "DELIVERABLE",
      evidenceStatus: "CONFIRMED", lifecycle: "PUBLISHED", visibility: "PUBLIC", occurredAt: f.occurred,
      createdAt: f.created, latitude: f.lat, longitude: f.lon, evidenceUrls: [f.rawUrl],
      media: { create: [...f.photos, f.locked].map((p, sortOrder) => ({ id: p.id, fileName: p.fileName, storageKey: p.key,
        sha256: p.sha256, size: p.bytes.length, contentType: p.id === f.locked.id ? "application/octet-stream" : "image/webp", sortOrder })) },
    } });
    const validation = { worklogId: f.record, workspaceId: f.workspace, requestedByUserId: f.owner,
      validatorUserId: f.reviewer, requestNote: f.requestNote, requestedAt: f.created, createdAt: f.created };
    await tx.terraqoWorklogValidation.createMany({ data: [
      { ...validation, id: f.approved, status: "APPROVED", resolvedAt: f.resolved, responseNote: f.responseNote },
      { ...validation, id: f.pending, status: "REQUESTED" },
    ] });
    // A real confirmed scoped decision exists; its scope and comments have no public release.
    await tx.terraqoWorklogRevision.create({ data: { id: f.revision, worklogId: f.record, revisionNo: 1,
      title: f.title, summary: f.summary, contributionRole: f.privateRevision, createdById: f.owner, contentHash: f.hash } });
    await tx.terraqoWorklogEntry.update({ where: { id: f.record }, data: { currentRevisionId: f.revision } });
    await tx.terraqoEndorsementRequest.create({ data: { id: f.request, requesterId: f.owner, reviewerUserId: f.reviewer,
      professionalProfileId: f.profile, revisionId: f.revision, requestedScope: ["summary"], relationshipLabel: f.privateRelation,
      revisionHash: f.hash, status: "CONFIRMED", sentAt: f.created, expiresAt: new Date("2026-12-01"),
      operationKey: randomUUID(), operationFingerprint: f.hash, decisions: { create: { id: f.decision, reviewerId: f.reviewer,
        responses: [{ field: "summary", decision: "CONFIRMED" }], summaryComment: f.privateDecision,
        revisionHash: f.hash, operationKey: randomUUID(), operationFingerprint: f.hash, decidedAt: f.resolved } } } });
  }, { timeout: 45_000 });
}

export async function cleanRecord(db: PrismaClient, f: RecordFixture) {
  await db.$transaction([
    db.terraqoEndorsementDecision.deleteMany({ where: { id: f.decision, requestId: f.request, reviewerId: f.reviewer } }),
    db.terraqoEndorsementRequest.deleteMany({ where: { id: f.request, revisionId: f.revision, requesterId: f.owner } }),
    db.terraqoWorklogEntry.deleteMany({ where: { id: f.record, authorId: f.owner, professionalProfileId: f.profile } }),
    db.terraqoProfessionalProfile.deleteMany({ where: { id: f.profile, userId: f.owner, username: f.username } }),
    db.terraqoWorkspace.deleteMany({ where: { id: f.workspace, slug: f.workspace, ownerUserId: f.reviewer } }),
    ...[f.owner, f.reviewer].map(id => db.user.deleteMany({ where: { id, email: id + "@example.invalid" } })),
  ]);
}

export async function assertRecordRemoved(db: PrismaClient, f: RecordFixture) {
  const counts = await db.$transaction([
    db.user.count({ where: { id: { in: [f.owner, f.reviewer] } } }),
    db.terraqoProfessionalProfile.count({ where: { id: f.profile } }),
    db.terraqoWorkspace.count({ where: { id: f.workspace } }),
    db.terraqoProfessionalDocument.count({ where: { id: f.document } }),
    db.terraqoWorklogEntry.count({ where: { id: f.record } }),
    db.terraqoWorklogMedia.count({ where: { id: { in: [...f.photos.map(p => p.id), f.locked.id] } } }),
    db.terraqoWorklogValidation.count({ where: { id: { in: [f.approved, f.pending] } } }),
    db.terraqoWorklogRevision.count({ where: { id: f.revision } }),
    db.terraqoEndorsementRequest.count({ where: { id: f.request } }),
    db.terraqoEndorsementDecision.count({ where: { id: f.decision } }),
  ]);
  assert.ok(counts.every(n => n === 0), "S11 fixture rows survived cleanup");
}
