import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { s24BlobFixtures, type S24Blob } from "./s24-blob-fixtures.mjs";
import type { PrismaClient } from "@prisma/client";

export async function createS24Selection(db: PrismaClient, input: {
  runId: string; ownerId: string; workspaceId: string; profileId: string; worklogIds: string[];
}, localWrite?: (key: string, bytes: Buffer) => Promise<void>) {
  const records = [];
  for (const [index, pair] of s24BlobFixtures(input.runId).entries()) {
    const title = `Título reservado S24 ${index}`;
    const summary = `Nivelación de control ${index}`;
    const locationLabel = `Ubicacion sintetica S24 ${index}`;
    const worklogId = randomUUID();
    input.worklogIds.push(worklogId);
    const worklog = await db.terraqoWorklogEntry.create({ data: {
      id: worklogId, professionalProfileId: input.profileId, authorId: input.ownerId, workspaceId: input.workspaceId,
      title, summary, locationLabel, visibility: "PRIVATE", lifecycle: "PUBLISHED",
    } });
    const revision = await db.terraqoWorklogRevision.create({ data: {
      worklogId: worklog.id, title, summary, outcome: "Resultado reservado", revisionNo: 1,
      contentHash: createHash("sha256").update(worklog.id).digest("hex"), createdById: input.ownerId,
    } });
    await db.terraqoWorklogEntry.update({ where: { id: worklog.id }, data: { currentRevisionId: revision.id } });
    async function attachment({ key, bytes, sha256 }: S24Blob) {
      // Hosted runs only register the preseeded site key. The loopback test writes its own files.
      await localWrite?.(key, bytes);
      const media = await db.terraqoWorklogMedia.create({ data: { worklogId: worklog.id,
        fileName: "evidence.webp", contentType: "image/webp", size: bytes.length, sha256, storageKey: key } });
      return { id: media.id, bytes };
    }
    const selected = await attachment(pair[0]);
    const excluded = await attachment(pair[1]);
    const fields = index === 0 ? { summary, locationLabel } : { summary };
    records.push({ worklogId: worklog.id, revisionId: revision.id, selected, excluded, fields });
  }
  const collection = await db.terraqoShareCollection.create({ data: {
    professionalProfileId: input.profileId, createdById: input.ownerId, title: "Selección de prueba S24",
    operationKey: randomUUID(), operationFingerprint: randomUUID(),
    items: { create: records.map((record, sortOrder) => ({ revisionId: record.revisionId, sortOrder,
      allowedFields: Object.keys(record.fields), includeMedia: true, mediaIds: [record.selected.id] })) },
  } });
  return { collection, records };
}
export type S24Selection = Awaited<ReturnType<typeof createS24Selection>>;
export type ReadAs = (actor: "anonymous" | "reviewer" | "stranger" | "owner", path: string) => Promise<Response>;

async function expectImage(response: Response, bytes: Buffer) {
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/webp");
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
}

export function checkReviewSnapshot(snapshot: { items: unknown[] }, selection: S24Selection) {
  assert.deepEqual(snapshot.items, selection.records.map(({ revisionId, worklogId, fields, selected }) => ({
    revisionId, revisionNo: 1, worklogId, contentHash: createHash("sha256").update(worklogId).digest("hex"),
    fields, mediaIds: [selected.id],
  })));
}

export async function checkReviewMedia(read: ReadAs, reviewId: string, selection: S24Selection, revoked = false) {
  const path = (id: string) => `/api/v1/publication-reviews/${reviewId}/media/${id}`;
  for (const { selected, excluded } of selection.records) {
    for (const actor of ["owner", "reviewer"] as const) {
      const response = await read(actor, path(selected.id));
      if (revoked) assert.equal(response.status, 404);
      else await expectImage(response, selected.bytes);
    }
    assert.equal((await read("reviewer", path(excluded.id))).status, 404);
    assert.equal((await read("stranger", path(selected.id))).status, 404);
    assert.equal((await read("anonymous", path(selected.id))).status, 401);
  }
}

export async function checkPublicSelection(read: ReadAs, slug: string, selection: S24Selection, revoked = false) {
  const path = `/api/v1/public/selections/${slug}`;
  const response = await read("anonymous", path);
  assert.equal(response.status, revoked ? 404 : 200);
  if (!revoked) {
    const { data } = await response.json();
    assert.deepEqual(data.items, selection.records.map(({ worklogId, fields, selected }) => ({
      worklogId, ...fields, media: [{ id: selected.id, href: `${path}/media/${selected.id}` }],
    })));
  }
  for (const { selected, excluded } of selection.records) {
    const image = await read("anonymous", `${path}/media/${selected.id}`);
    if (revoked) assert.equal(image.status, 404);
    else await expectImage(image, selected.bytes);
    assert.equal((await read("anonymous", `${path}/media/${excluded.id}`)).status, 404);
  }
}

export async function checkGrantBoundary(db: PrismaClient, read: ReadAs, selection: S24Selection, issuer: string, recipient: string, workspaceId: string) {
  const grant = await db.terraqoAccessGrant.create({ data: {
    collectionId: selection.collection.id, subjectUserId: recipient, issuedById: issuer, scopes: ["VIEW_COLLECTION"],
    expiresAt: new Date(Date.now() + 3600000), operationKey: randomUUID(), operationFingerprint: randomUUID(),
  } });
  const root = `/api/v1/shared-selections/${selection.collection.id}`;
  for (const { selected, excluded } of selection.records) {
    const path = `${root}/media/${selected.id}`;
    await expectImage(await read("reviewer", path), selected.bytes);
    assert.equal((await read("stranger", path)).status, 404);
    assert.equal((await read("reviewer", `${path}?download=1`)).status, 404);
    assert.equal((await read("reviewer", `${root}/media/${excluded.id}`)).status, 404);
  }
  assert.equal((await read("reviewer", root)).status, 200);
  const { checkGrantDossier } = await import("./s24-readers");
  const checkExpiredDossier = await checkGrantDossier({ userId: recipient, workspaceId }, selection, grant.id);
  await db.terraqoAccessGrant.update({ where: { id: grant.id }, data: { expiresAt: new Date(Date.now() - 60000) } });
  assert.equal((await read("reviewer", root)).status, 404);
  await checkExpiredDossier();
  for (const { selected } of selection.records)
    assert.equal((await read("reviewer", `${root}/media/${selected.id}`)).status, 404);
}
