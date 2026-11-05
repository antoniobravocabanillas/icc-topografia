import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, writeFile, unlink, readdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { checkReviewMedia, checkReviewSnapshot, checkPublicSelection, checkGrantBoundary, createS24Selection, type ReadAs } from "./lib/s24-acceptance";
import { s24BlobFixtures } from "./lib/s24-blob-fixtures.mjs";
import { s24Baseline, cleanupS24, type S24Ids } from "./lib/s24-cleanup";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(process.env.TERRAQO_LOCAL_S24_TEST, "synthetic-only");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.username, "terraqo_s24_runtime");
  const directory = path.resolve(process.env.S24_BLOB_DIRECTORY!);
  assert.equal(path.dirname(path.dirname(directory)), path.resolve(os.tmpdir()));
  assert.match(path.basename(path.dirname(directory)), /^terraqo-s24-local-/);
  assert.equal(path.basename(directory), "s24-blobs");
  const file = (key: string) => path.join(directory, path.basename(key));
  const store = {
    async put(key: string, bytes: Buffer) { await writeFile(file(key), bytes, { flag: "wx" }); },
    async remove(key: string) { await unlink(file(key)); },
  };
  let afterBlobRead: (() => Promise<void>) | undefined;
  let session: { user: { id: string } } | null = null;
  const require = createRequire(import.meta.url);
  function stub(module: string, exports: object) {
    const id = require.resolve(module);
    require.cache[id] = { id, filename: id, loaded: true, exports } as NodeModule;
  }
  // Substitute the session and byte transport only. Production route handlers,
  // authorization queries and all reader services use the disposable PostgreSQL.
  stub("server-only", {});
  stub("../auth", { auth: async () => session });
  stub("../lib/server/media", { getWorklogEvidenceStore: () => ({
    async getWithMetadata(key: string) {
      const bytes = await readFile(file(key));
      await afterBlobRead?.();
      return { data: Uint8Array.from(bytes).buffer };
    },
  }) });
  const { prisma: db } = await import("../lib/prisma");
  const [role] = await db.$queryRaw<{ name: string; canCreate: boolean }[]>`SELECT current_user AS name,
    has_schema_privilege(current_user, 'icc', 'CREATE') AS "canCreate"`;
  assert.deepEqual(role, { name: "terraqo_s24_runtime", canCreate: false });
  const reviewMedia = await import("../app/api/v1/publication-reviews/[reviewId]/media/[mediaId]/route");
  const publicMedia = await import("../app/api/v1/public/selections/[slug]/media/[mediaId]/route");
  const publicJson = await import("../app/api/v1/public/selections/[slug]/route");
  const privateMedia = await import("../app/api/v1/shared-selections/[id]/media/[mediaId]/route");
  const privateJson = await import("../app/api/v1/shared-selections/[id]/route");
  const review = await import("../lib/terraqo/publication-review");
  const sharing = await import("../lib/terraqo/scoped-sharing");
  const { checkActiveReaders } = await import("./lib/s24-readers");
  const ids: S24Ids = { userIds: [], workspaceIds: [], worklogIds: [] };
  const keys: string[] = [];
  try {
    // Retain one unrelated invitation throughout both success and failure cleanup.
    const retained = await db.terraqoWorkspace.create({ data: { name: "Retained baseline", slug: "retained-baseline",
      invitations: { create: { email: "retained@s24.invalid", createdById: "migration-sentinel", role: "VIEWER",
        expiresAt: new Date(Date.now() + 86400000), operationKey: randomUUID(), operationFingerprint: "retained", tokenHash: randomUUID() } } } });
    const baseline = await s24Baseline(db);
    assert.equal(baseline.invitations, 1);
    try {
      for (const role of ["owner", "reviewer", "stranger"] as const) {
        ids.userIds.push((await db.user.create({ data: { email: `${role}-expanded@s24.invalid` } })).id);
      }
      const [owner, reviewer, stranger] = ids.userIds;
      const profile = await db.terraqoProfessionalProfile.create({ data: { userId: owner, liveCvEnabled: true } });
      for (const [slug, userId] of [["s24-source", reviewer], ["s24-unrelated", stranger]]) {
        ids.workspaceIds.push((await db.terraqoWorkspace.create({ data: { name: slug, slug,
          members: { create: { userId, role: "ADMIN" } } } })).id);
      }
      // Emulate the local operator phase before the harness inserts any media rows.
      const runId = randomUUID();
      for (const { key, bytes } of s24BlobFixtures(runId).flat()) {
        keys.push(key);
        await store.put(key, bytes);
      }
      const selection = await createS24Selection(db, { runId, ownerId: owner, workspaceId: ids.workspaceIds[0],
        profileId: profile.id, worklogIds: ids.worklogIds });
      const { collection } = selection;
      const read: ReadAs = async (actor, pathname) => {
        session = actor === "anonymous" ? null : { user: { id: { owner, reviewer, stranger }[actor] } };
        const req = new Request(new URL(pathname, "http://127.0.0.1"));
        const segments = new URL(req.url).pathname.split("/");
        if (segments[3] === "publication-reviews")
          return reviewMedia.GET(req, { params: Promise.resolve({ reviewId: segments[4], mediaId: segments[6] }) });
        if (segments[3] === "public") {
          const params = Promise.resolve({ slug: segments[5], mediaId: segments[7] });
          return segments[6] ? publicMedia.GET(req, { params }) : publicJson.GET(req, { params });
        }
        assert.equal(segments[3], "shared-selections");
        const params = Promise.resolve({ id: segments[4], mediaId: segments[6] });
        return segments[5] ? privateMedia.GET(req, { params }) : privateJson.GET(req, { params });
      };
      const request = (expectedVersion: number) => review.requestPublicationReviews({ userId: owner, collectionId: collection.id, expectedVersion });
      const publish = (expectedVersion: number) => sharing.publishCollectionProjection({ userId: owner, collectionId: collection.id, expectedVersion });
      const approve = (row: { id: string; scopeHash: string }, userId = reviewer) => review.decidePublicationReview({
        userId, reviewId: row.id, payload: { decision: "APPROVED", scopeHash: row.scopeHash, confirmed: true },
      });
      const [old] = await request(1);
      await db.terraqoShareCollection.update({ where: { id: collection.id }, data: { version: { increment: 1 } } });
      await assert.rejects(request(1), { status: 409 });
      await assert.rejects(approve(old), { status: 409 });
      await assert.rejects(publish(1), { status: 409 });
      assert.equal((await db.terraqoPublicationReview.findUniqueOrThrow({ where: { id: old.id } })).decision, "PENDING");
      for (const { selected } of selection.records) {
        const stalePreview = await read("reviewer", `/api/v1/publication-reviews/${old.id}/media/${selected.id}`);
        assert.equal(stalePreview.status, 404, "A stale pending review cannot serve private attachment bytes");
      }
      const [fresh] = await request(2);
      await assert.rejects(approve(fresh, stranger), { status: 403 });
      await assert.rejects(publish(2), { status: 409 });
      const queue = await review.listPublicationReviews(reviewer, ids.workspaceIds[0]);
      checkReviewSnapshot(queue.find(row => row.id === fresh.id)!.snapshot, selection);
      await checkReviewMedia(read, fresh.id, selection);
      await approve(fresh);
      assert.equal(await db.terraqoPublicProjection.count({ where: { collectionId: collection.id } }), 0);
      const root = await publish(2);
      await db.terraqoWorklogEntry.update({ where: { id: ids.worklogIds[0] }, data: { locationLabel: "Cambio posterior" } });
      await checkPublicSelection(read, root.slug, selection);
      await checkReviewMedia(read, fresh.id, selection);
      await checkGrantBoundary(db, read, selection, owner, reviewer, ids.workspaceIds[0]);
      const grant = await db.terraqoAccessGrant.findFirstOrThrow({ where: { collectionId: collection.id } });
      await db.terraqoAccessGrant.update({ where: { id: grant.id }, data: { expiresAt: new Date(Date.now() + 3600000) } });
      afterBlobRead = async () => { await db.terraqoAccessGrant.update({ where: { id: grant.id }, data: { expiresAt: new Date(0) } }); };
      const interrupted = await read("reviewer", `/api/v1/shared-selections/${collection.id}/media/${selection.records[0].selected.id}`);
      afterBlobRead = undefined;
      assert.equal(interrupted.status, 404, "A grant expiring during storage I/O must deny the bytes");
      const afterRevocation = await checkActiveReaders({ userId: reviewer, ownerId: owner, profileId: profile.id,
        workspaceId: ids.workspaceIds[0], selection, projectionId: root.id });
      await review.revokePublicationReview({ userId: reviewer, reviewId: fresh.id, reason: "Prueba de retiro" });
      await checkPublicSelection(read, root.slug, selection, true);
      await checkReviewMedia(read, fresh.id, selection, true);
      await afterRevocation();
    } finally {
      await cleanupS24(db, ids);
      assert.deepEqual((await readdir(directory)).sort(), keys.map(key => path.basename(key)).sort(),
        "Hosted DB cleanup must leave the operator-owned bytes intact");
      await Promise.all(keys.map(key => store.remove(key)));
      assert.deepEqual(await readdir(directory), []);
      assert.deepEqual(await s24Baseline(db), baseline);
    }
    // Force a failure after the first actual blob write. Use the same ID-scoped
    // teardown as the hosted runner, and verify the complete retained baseline again.
    const partial: S24Ids = { userIds: [], workspaceIds: [], worklogIds: [] };
    const partialKeys: string[] = [];
    try {
      const owner = await db.user.create({ data: { email: "partial@s24.invalid" } });
      partial.userIds.push(owner.id);
      const workspace = await db.terraqoWorkspace.create({ data: { name: "Partial", slug: "s24-partial" } });
      partial.workspaceIds.push(workspace.id);
      const profile = await db.terraqoProfessionalProfile.create({ data: { userId: owner.id } });
      await assert.rejects(createS24Selection(db, { runId: randomUUID(), ownerId: owner.id, workspaceId: workspace.id,
        profileId: profile.id, worklogIds: partial.worklogIds }, async (key, bytes) => {
        partialKeys.push(key);
        await store.put(key, bytes);
        throw new Error("injected lost upload reply");
      }),
      /injected lost upload reply/);
      assert.equal(partialKeys.length, 1);
    } finally {
      await cleanupS24(db, partial);
      await Promise.all(partialKeys.map(key => store.remove(key)));
      assert.deepEqual(await readdir(directory), []);
      assert.deepEqual(await s24Baseline(db), baseline);
    }
    console.log(JSON.stringify({ passed: true, localOnly: true, records: 2, selectedBytesChecked: 2, deniedAttachments: 2,
      staleVersion: true, expiredDuringBlobRead: true, partialFailureCleanup: true, downstreamReaders: 4, baseline, cleanup: "matched" }));
    await db.terraqoWorkspace.delete({ where: { id: retained.id } });
  } finally { await db.$disconnect(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
