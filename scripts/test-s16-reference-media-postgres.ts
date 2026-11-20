import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import sharp from "sharp";
import { confirmedLocalDisposableDatabaseUrl } from "./lib/confirmed-local-disposable-database";

async function main() {
  const connection = confirmedLocalDisposableDatabaseUrl({ value: process.env.DATABASE_URL,
    expected: process.env.S16_TEST_DATABASE, valueVariable: "DATABASE_URL", expectedVariable: "S16_TEST_DATABASE" });
  assert.equal(new URL(connection).username, "s16_projection_test");
  assert.equal(process.env.S16_TEST_SYNTHETIC, "confirmed");
  const { prisma } = await import("../lib/prisma");
  const { saveClosureDraft, submitClosure, decideClosure } = await import("../lib/terraqo/closure");
  const { listCollaborations } = await import("../lib/terraqo/collaboration");
  const { getClosureReferenceDetail, closureReferenceSnapshotSchema } = await import("../lib/terraqo/closure-reference-access");
  const { publicationSourceSelect } = await import("../lib/terraqo/publication-review");
  const { buildPublicationSnapshot, publicationSnapshotHash } = await import("../lib/terraqo/publication-review-policy");
  const { preparePublicationProjection } = await import("../lib/terraqo/publication-projection");
  const { sanitizeWorklogEvidenceImage } = await import("../lib/server/worklog-media-security");
  const { MAX_CLOSURE_REFERENCE_IMAGE_BYTES } = await import("../lib/server/closure-reference-media");
  const owner = randomUUID(), professional = randomUUID(), outsider = randomUUID(), workspaceId = randomUUID();
  const original = await sharp({ create: { width: 32, height: 24, channels: 3, background: "#3a85b2" } }).webp().toBuffer();
  const bytes = Uint8Array.from(original).buffer;
  const expected = (await sanitizeWorklogEvidenceImage({ bytes, claimedContentType: "image/webp", fileName: "evidencia" })).bytes;
  let sessionUser = owner, authStatus = 200, loads = 0;
  let blob: ArrayBuffer | null = bytes;
  let pause: (() => Promise<void>) | undefined;
  const require = createRequire(__filename), replaced = new Map<string, NodeModule | undefined>();
  const replace = (specifier: string, exports: unknown) => {
    const id = require.resolve(specifier); replaced.set(id, require.cache[id]);
    require.cache[id] = { id, filename: id, loaded: true, exports } as NodeModule;
  };
  // Only session acquisition and blob transport are doubles. Route, actor/source
  // resolver, canonical publication policy, snapshots and writes use real local PG.
  replace("server-only", {});
  replace("../lib/server/authz", { requireUser: async () => authStatus === 401
    ? { response: new Response(null, { status: 401 }) } : { session: { user: { id: sessionUser } } } });
  replace("../lib/server/discovery-needs-auth", { requireDiscoveryWorkspaceActor: async () => {
    if (authStatus !== 200) {
      const { TerraqoMessagingError } = await import("../lib/terraqo/messaging");
      throw new TerraqoMessagingError("Denied", authStatus);
    }
    return { session: { user: { id: sessionUser } }, workspace: { id: workspaceId } };
  } });
  replace("../lib/server/media", { getWorklogEvidenceStore: () => ({ getWithMetadata: async () => {
    loads++; if (pause) await pause();
    return blob === null ? null : { data: blob, etag: "PRIVATE_STORAGE_KEY_ETAG", metadata: { gps: "PRIVATE_GPS" } };
  } }) });
  try {
    const route = await import("../app/api/v1/collaborations/[id]/closure-references/[revisionId]/media/[mediaId]/route");
    await prisma.user.createMany({ data: [owner, professional, outsider].map(id => ({ id, email: `${id}@s16-media.invalid` })) });
    await prisma.terraqoWorkspace.create({ data: { id: workspaceId, name: "Synthetic media", slug: workspaceId } });
    await prisma.terraqoWorkspaceMember.create({ data: { workspaceId, userId: owner, role: "OWNER", active: true } });
    const profile = await prisma.terraqoProfessionalProfile.create({ data: { userId: professional, liveCvEnabled: true, liveCvVisibility: "PUBLIC" } });
    const createSource = async (company: boolean) => {
      const worklog = await prisma.terraqoWorklogEntry.create({ data: { professionalProfileId: profile.id, authorId: professional,
        workspaceId: company ? workspaceId : null, title: "PRIVATE_TITLE", summary: "Allowed", visibility: "PUBLIC", lifecycle: "PUBLISHED" } });
      const revision = await prisma.terraqoWorklogRevision.create({ data: { worklogId: worklog.id, revisionNo: 1,
        title: "PRIVATE_TITLE", summary: "Allowed", contentHash: randomUUID(), createdById: professional } });
      await prisma.terraqoWorklogEntry.update({ where: { id: worklog.id }, data: { currentRevisionId: revision.id } });
      const media = await prisma.terraqoWorklogMedia.create({ data: { worklogId: worklog.id, storageKey: randomUUID(),
        contentType: "image/webp", size: bytes.byteLength, fileName: "PRIVATE_ORIGINAL_GPS.webp" } });
      return { worklog, revision, media };
    };
    const personal = await createSource(false), company = await createSource(true);
    const collection = await prisma.terraqoShareCollection.create({ data: { professionalProfileId: profile.id, title: "Allowed collection",
      createdById: professional, operationKey: randomUUID(), operationFingerprint: "fixture", items: { create: {
        revisionId: company.revision.id, allowedFields: ["summary"], includeMedia: true, mediaIds: [company.media.id],
      } } } });
    const publicationSource = await prisma.terraqoShareCollection.findUniqueOrThrow({ where: { id: collection.id }, select: publicationSourceSelect });
    const snapshot = buildPublicationSnapshot(publicationSource, workspaceId, undefined, { listOnCv: true });
    const approval = await prisma.terraqoPublicationReview.create({ data: { collectionId: collection.id, workspaceId, collectionVersion: 1,
      scopeHash: publicationSnapshotHash(snapshot), snapshot, requestedById: professional, decidedById: owner, decision: "APPROVED", decidedAt: new Date() } });
    const projection = await prisma.terraqoPublicProjection.create({ data: { collectionId: collection.id, slug: randomUUID(), policyVersion: "public-selection-v2",
      snapshot: await preparePublicationProjection(prisma, collection.id, 1, undefined, true) } });
    const createCollaboration = async () => {
      const conversation = await prisma.terraqoConversation.create({ data: { workspaceId, createdById: owner } });
      return prisma.terraqoCollaboration.create({ data: { workspaceId, conversationId: conversation.id, professionalUserId: professional,
        status: "ACCEPTED", acceptedRevisionNo: 1, acceptedAt: new Date(), proposals: { create: {
          revisionNo: 1, roleTitle: "Surveyor", scope: "Synthetic scope", status: "ACCEPTED", decidedAt: new Date(),
          createdById: owner, operationKey: randomUUID(), operationFingerprint: "fixture",
        } } } });
    };
    const collaboration = await createCollaboration(), other = await createCollaboration();
    const actor = { userId: owner, workspaceId, collaborationId: collaboration.id };
    const choice = { worklogRevisionId: company.revision.id, accessKind: "PUBLIC_SELECTION" as const, accessReferenceId: projection.id };
    const cv = { worklogRevisionId: personal.revision.id, accessKind: "PUBLIC_CV" as const, accessReferenceId: personal.worklog.id };
    const detail = (source: typeof choice | typeof cv) => getClosureReferenceDetail(prisma, { ...actor, revisionId: source.worklogRevisionId, source });
    const companyDto = await detail(choice), cvDto = await detail(cv);
    assert.equal(companyDto.fields.title, undefined);
    for (const dto of [companyDto, cvDto]) {
      assert.equal(dto.media.length, 1); assert.equal(dto.media[0].previewHref, dto.media[0].thumbnailHref);
      assert.deepEqual(Object.keys(dto.media[0]).sort(), ["contentType", "id", "previewHref", "thumbnailHref"]);
      assert.ok(!JSON.stringify(dto).includes("storageKey")); assert.ok(!JSON.stringify(dto).includes("PRIVATE_ORIGINAL"));
    }
    const send = (href: string, headers?: HeadersInit) => {
      const url = new URL(href, "https://s16.test"), parts = url.pathname.split("/");
      return route.GET(new Request(url, { headers }), { params: Promise.resolve({ id: parts[4], revisionId: parts[6], mediaId: parts[8] }) });
    };
    const check = (response: Response, status: number) => {
      assert.equal(response.status, status); assert.ok(response.headers.get("cache-control")?.includes("no-store"));
      assert.equal(response.headers.get("etag"), null); assert.equal(response.headers.get("location"), null);
    };
    const cvHref = cvDto.media[0].previewHref, companyHref = companyDto.media[0].previewHref;
    let response = await send(cvHref); check(response, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
    assert.equal(response.headers.get("content-disposition"), 'inline; filename="evidencia.webp"');
    assert.equal(response.headers.get("content-type"), "image/webp");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    response = await send(companyHref, { Range: "bytes=0-9" }); check(response, 206);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected.subarray(0, 10));
    check(await send(companyHref, { Range: "bytes=999999-" }), 416);
    check(await send(companyHref + "&storageKey=forged"), 422);
    const initialLoads = loads;
    sessionUser = outsider; check(await send(cvHref), 404); sessionUser = owner;
    authStatus = 401; check(await send(cvHref), 401); authStatus = 200;
    check(await send(companyHref.replace(company.media.id, personal.media.id)), 404);
    check(await send(companyHref.replace("PUBLIC_SELECTION", "PUBLIC_CV")), 404);
    assert.equal(loads, initialLoads, "Unauthorized reads must not call blob store");
    blob = new ArrayBuffer(MAX_CLOSURE_REFERENCE_IMAGE_BYTES + 1); check(await send(cvHref), 404);
    blob = Uint8Array.from([1, 2, 3]).buffer; check(await send(cvHref), 404);
    blob = null; check(await send(cvHref), 404); blob = bytes;
    console.log("PASS protected media HTTP: exact normalized bytes/range, generic metadata, no-store all statuses, pre-blob isolation and decoder bounds");

    const saved = await saveClosureDraft({ ...actor, operationKey: randomUUID(), payload: {
      contribution: "Synthetic contribution", deliverables: ["Plan"], result: "", referenceSources: [choice, cv], expectedVersion: null,
    } });
    const companyRef = saved.currentRevision!.references.find(ref => ref.source.accessKind === "PUBLIC_SELECTION")!;
    const cvRef = saved.currentRevision!.references.find(ref => ref.source.accessKind === "PUBLIC_CV")!;
    const stored = await prisma.terraqoClosureReference.findUniqueOrThrow({ where: { id: cvRef.id } });
    const ceiling = closureReferenceSnapshotSchema.parse(stored.accessSnapshot);
    assert.deepEqual(ceiling.mediaIds, [personal.media.id]);
    assert.equal(closureReferenceSnapshotSchema.safeParse({ ...ceiling, mediaIds: [personal.media.id, personal.media.id] }).success, false);
    const savedHref = cvRef.media[0].previewHref, selectionSavedHref = companyRef.media[0].previewHref;
    assert.ok(new URL(savedHref, "https://s16.test").searchParams.has("referenceId"));
    check(await send(savedHref), 200);
    check(await send(savedHref.replace(collaboration.id, other.id)), 404);
    check(await send(savedHref.replace(personal.revision.id, company.revision.id)), 404);
    sessionUser = professional; check(await send(savedHref.replace("view=workspace", "view=professional")), 404); sessionUser = owner;
    const later = await prisma.terraqoWorklogMedia.create({ data: { worklogId: personal.worklog.id, storageKey: randomUUID(),
      contentType: "image/webp", size: bytes.byteLength, fileName: "hidden.webp", sortOrder: 1 } });
    assert.equal((await detail(cv)).media.length, 2);
    const savedDetail = () => getClosureReferenceDetail(prisma, { ...actor, revisionId: personal.revision.id, referenceId: cvRef.id });
    assert.deepEqual((await savedDetail()).media.map(media => media.id), [personal.media.id]);
    check(await send(savedHref.replace(personal.media.id, later.id)), 404);
    await prisma.terraqoClosureReference.update({ where: { id: cvRef.id }, data: { accessSnapshot: { ...ceiling, mediaIds: [] } } });
    assert.deepEqual((await savedDetail()).media, []); check(await send(savedHref), 404);
    await prisma.terraqoClosureReference.update({ where: { id: cvRef.id }, data: { accessSnapshot: {
      kind: "PUBLIC_CV", revisionId: personal.revision.id, title: "HISTORY", contentHash: personal.revision.contentHash, capturedAt: new Date().toISOString(),
    } } });
    assert.deepEqual((await savedDetail()).media, []); check(await send(savedHref), 404);
    await prisma.terraqoClosureReference.update({ where: { id: cvRef.id }, data: { accessSnapshot: ceiling } });
    console.log("PASS frozen membership: new save IDs, future-media exclusion, legacy/empty ceilings, exact reference/revision/collaboration, unsent audience denial");

    // Barrier resolves only after the route has completed its first authorization.
    const duringFetch = async (name: string, href: string, change: () => Promise<unknown>, restore: () => Promise<unknown>) => {
      let entered!: () => void, release!: () => void;
      const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
      const released = new Promise<void>(resolve => { release = resolve; });
      pause = async () => { entered(); await released; };
      const pending = send(href);
      try {
        await Promise.race([enteredPromise, pending.then(() => { throw new Error(`${name}: loader was not reached`); })]);
        await change(); release(); const result = await pending; check(result, 404);
        assert.ok(!(await result.text()).includes("RIFF"), `${name}: no media bytes`);
      } finally { release(); pause = undefined; await restore(); }
    };
    await duringFetch("CV disabled", savedHref,
      () => prisma.terraqoProfessionalProfile.update({ where: { id: profile.id }, data: { liveCvEnabled: false } }),
      () => prisma.terraqoProfessionalProfile.update({ where: { id: profile.id }, data: { liveCvEnabled: true } }));
    await duringFetch("CV private", savedHref,
      () => prisma.terraqoProfessionalProfile.update({ where: { id: profile.id }, data: { liveCvVisibility: "PRIVATE" } }),
      () => prisma.terraqoProfessionalProfile.update({ where: { id: profile.id }, data: { liveCvVisibility: "PUBLIC" } }));
    await duringFetch("actor revoked", savedHref,
      () => prisma.terraqoWorkspaceMember.updateMany({ where: { workspaceId, userId: owner }, data: { active: false } }),
      () => prisma.terraqoWorkspaceMember.updateMany({ where: { workspaceId, userId: owner }, data: { active: true } }));
    await duringFetch("workspace disabled", savedHref,
      () => prisma.terraqoWorkspace.update({ where: { id: workspaceId }, data: { active: false } }),
      () => prisma.terraqoWorkspace.update({ where: { id: workspaceId }, data: { active: true } }));
    await duringFetch("key swapped", savedHref,
      () => prisma.terraqoWorklogMedia.update({ where: { id: personal.media.id }, data: { storageKey: randomUUID() } }),
      () => prisma.terraqoWorklogMedia.update({ where: { id: personal.media.id }, data: { storageKey: personal.media.storageKey } }));
    await duringFetch("MIME changed", savedHref,
      () => prisma.terraqoWorklogMedia.update({ where: { id: personal.media.id }, data: { contentType: "image/jpeg" } }),
      () => prisma.terraqoWorklogMedia.update({ where: { id: personal.media.id }, data: { contentType: "image/webp" } }));
    await duringFetch("frozen ceiling removed", savedHref,
      () => prisma.terraqoClosureReference.update({ where: { id: cvRef.id }, data: { accessSnapshot: { ...ceiling, mediaIds: [] } } }),
      () => prisma.terraqoClosureReference.update({ where: { id: cvRef.id }, data: { accessSnapshot: ceiling } }));
    await duringFetch("exact revision removed", savedHref,
      () => prisma.terraqoWorklogEntry.update({ where: { id: personal.worklog.id }, data: { currentRevisionId: null } }),
      () => prisma.terraqoWorklogEntry.update({ where: { id: personal.worklog.id }, data: { currentRevisionId: personal.revision.id } }));
    await duringFetch("approval revoked", selectionSavedHref,
      () => prisma.terraqoPublicationReview.update({ where: { id: approval.id }, data: { revokedAt: new Date() } }),
      () => prisma.terraqoPublicationReview.update({ where: { id: approval.id }, data: { revokedAt: null } }));
    await duringFetch("projection revoked", selectionSavedHref,
      () => prisma.terraqoPublicProjection.update({ where: { id: projection.id }, data: { revokedAt: new Date() } }),
      () => prisma.terraqoPublicProjection.update({ where: { id: projection.id }, data: { revokedAt: null } }));
    await duringFetch("selection media withdrawn", selectionSavedHref,
      () => prisma.terraqoShareCollectionItem.updateMany({ where: { collectionId: collection.id }, data: { includeMedia: false } }),
      () => prisma.terraqoShareCollectionItem.updateMany({ where: { collectionId: collection.id }, data: { includeMedia: true } }));
    await duringFetch("flag disabled", selectionSavedHref,
      async () => { process.env.TERRAQO_WORKSPACE_PUBLICATION_V1 = "false"; },
      async () => { process.env.TERRAQO_WORKSPACE_PUBLICATION_V1 = "true"; });
    console.log("PASS paused real-PG route: actor/workspace/CV/revision/approval/projection/media/flag withdrawal, saved ceiling and storage-key swaps rechecked after fetch");

    const persisted = () => prisma.terraqoCollaboration.findUniqueOrThrow({ where: { id: collaboration.id }, include: {
      closure: { include: { revisions: { include: { references: true } }, certificate: true } }, conversation: { include: { contexts: true } },
    } });
    const submit = { ...actor, operationKey: randomUUID(), payload: { expectedRevisionNo: 1 } };
    const withdraw = () => prisma.terraqoWorklogMedia.update({ where: { id: personal.media.id }, data: { contentType: "image/jpeg" } });
    const restore = () => prisma.terraqoWorklogMedia.update({ where: { id: personal.media.id }, data: { contentType: "image/webp" } });
    await withdraw(); let before = await persisted();
    await assert.rejects(submitClosure(submit), { status: 409 }); assert.deepEqual(await persisted(), before);
    await restore(); await submitClosure(submit);
    sessionUser = professional; check(await send(savedHref.replace("view=workspace", "view=professional")), 200); sessionUser = owner;
    await withdraw(); before = await persisted();
    const accept = { userId: professional, closureId: saved.id, operationKey: randomUUID(), payload: { action: "ACCEPT" as const, expectedRevisionNo: 1 } };
    await assert.rejects(decideClosure(accept), { status: 409 }); assert.deepEqual(await persisted(), before);
    await restore(); assert.ok((await decideClosure(accept)).certificate);
    await prisma.terraqoPublicationReview.update({ where: { id: approval.id }, data: { revokedAt: new Date() } });
    before = await persisted();
    for (const view of [{ userId: professional }, { userId: owner, workspaceId }]) {
      const rows = await listCollaborations({ ...view, collaborationId: collaboration.id });
      assert.equal(rows[0].closure!.currentRevision!.unavailableReferenceCount, 1);
      assert.equal(rows[0].closure!.currentRevision!.references.length, 1);
      assert.ok(!JSON.stringify(rows[0].closure).includes(companyRef.id));
    }
    const replay = await decideClosure(accept);
    assert.equal(replay.currentRevision!.unavailableReferenceCount, 1);
    assert.deepEqual(await persisted(), before, "Projection/replay must not rewrite stored history");
    assert.equal(await prisma.terraqoCollaborationCertificate.count({ where: { closureId: saved.id } }), 1);
    console.log("PASS frozen media submit/ACCEPT rollback, submitted professional bytes, withdrawal count and unchanged accepted history/replay");
  } finally {
    for (const [id, value] of replaced) { if (value) require.cache[id] = value; else delete require.cache[id]; }
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
