import assert from "node:assert/strict";
import {
  buildPublicationSnapshot,
  publicationSnapshotHash,
  publicationDecisionSchema,
  type PublicationSource,
} from "../lib/terraqo/publication-review-policy";
import {
  requestPublicationReviews,
  decidePublicationReview,
  revokePublicationReview,
  PublicationReviewError,
} from "../lib/terraqo/publication-review";
import { prisma } from "../lib/prisma";

const source: PublicationSource = {
  id: "selection",
  version: 4,
  title: "Trabajo seleccionado",
  description: null,
  items: [
    {
      allowedFields: ["summary"],
      includeMedia: true,
      mediaIds: ["image"],
      revision: {
        id: "revision",
        revisionNo: 2,
        contentHash: "revision-hash",
        title: "No autorizado",
        summary: "Texto seleccionado",
        outcome: null,
        contributionRole: "No autorizado",
        responsibilities: ["Privado"],
        methods: [],
        tools: [],
        worklog: {
          id: "worklog",
          workspaceId: "company",
          deletedAt: null,
          occurredAt: new Date("2026-11-01T12:00:00Z"),
          locationLabel: "Lugar privado",
          media: [{ id: "image", contentType: "image/webp" }],
        },
      },
    },
  ],
};
const snapshot = buildPublicationSnapshot(source, "company");
assert.deepEqual(snapshot.items[0].fields, { summary: "Texto seleccionado" });
assert.equal(JSON.stringify(snapshot).includes("Lugar privado"), false);
assert.equal(JSON.stringify(snapshot).includes("No autorizado"), false);
assert.equal(
  publicationDecisionSchema.safeParse({
    decision: "APPROVED",
    scopeHash: publicationSnapshotHash(snapshot),
  }).success,
  false,
  "Approval requires explicit confirmation.",
);
assert.equal(
  publicationDecisionSchema.safeParse({
    decision: "DECLINED",
    scopeHash: publicationSnapshotHash(snapshot),
    comment: "",
  }).success,
  false,
);
const changed = structuredClone(source);
changed.items[0].revision.summary = "Cambio posterior";
assert.notEqual(
  publicationSnapshotHash(snapshot),
  publicationSnapshotHash(buildPublicationSnapshot(changed, "company")),
);
const other = structuredClone(source.items[0]);
other.revision.worklog.workspaceId = "other";
other.revision.summary = "Otra empresa";
assert.equal(
  buildPublicationSnapshot(
    { ...source, items: [...source.items, other] },
    "company",
  ).items.length,
  1,
);
const removed = structuredClone(source);
removed.items[0].revision.worklog.media = [];
assert.throws(() => buildPublicationSnapshot(removed, "company"), /adjunto/);
const deleted = structuredClone(source);
deleted.items[0].revision.worklog.deletedAt = new Date();
assert.throws(() => buildPublicationSnapshot(deleted, "company"), /retirado/);
const coordinates = structuredClone(source);
coordinates.items[0].allowedFields.push("latitude");
assert.throws(
  () => buildPublicationSnapshot(coordinates, "company"),
  /no publicables/,
);

async function run() {
  const originalFlag = process.env.TERRAQO_WORKSPACE_PUBLICATION_V1;
  const originalTransaction = prisma.$transaction;
  let review: Record<string, unknown> | null = null;
  let authority = true,
    owned = true,
    revokedProjection = 0,
    collectionVersion = source.version;
  const tx = {
    $queryRaw: async (sql: { strings: string[] }) =>
      sql.strings.join("").includes("WorkspaceMember")
        ? authority
          ? [{ id: "membership" }]
          : []
        : [{ id: source.id }],
    terraqoShareCollection: {
      findFirst: async (args: { where: { createdById?: string } }) =>
        args.where.createdById
          ? owned
            ? { id: source.id }
            : null
          : { ...source, version: collectionVersion },
      update: async () => {
        collectionVersion++;
        return { id: source.id };
      },
    },
    terraqoWorkspace: { findFirst: async () => ({ id: "company" }) },
    terraqoPublicationReview: {
      findUnique: async () => review,
      findUniqueOrThrow: async () => {
        assert.ok(review);
        return review;
      },
      create: async ({ data }: { data: Record<string, unknown> }) =>
        (review = {
          id: "review",
          decision: "PENDING",
          revokedAt: null,
          comment: null,
          ...data,
        }),
      update: async ({ data }: { data: Record<string, unknown> }) =>
        (review = { ...review, ...data }),
    },
    terraqoPublicProjection: {
      updateMany: async () => {
        revokedProjection++;
        return { count: 1 };
      },
    },
  };
  // No DB/network use: execute the actual service against a transaction double.
  prisma.$transaction = (async (fn: (client: typeof tx) => Promise<unknown>) =>
    fn(tx)) as unknown as typeof prisma.$transaction;
  try {
    delete process.env.TERRAQO_WORKSPACE_PUBLICATION_V1;
    await assert.rejects(
      requestPublicationReviews({
        userId: "owner",
        collectionId: source.id,
        expectedVersion: 4,
      }),
      (e: unknown) => e instanceof PublicationReviewError && e.status === 404,
    );
    process.env.TERRAQO_WORKSPACE_PUBLICATION_V1 = "true";
    owned = false;
    await assert.rejects(
      requestPublicationReviews({
        userId: "outsider",
        collectionId: source.id,
        expectedVersion: 4,
      }),
      /no disponible/,
    );
    owned = true;
    const request = {
      userId: "owner",
      collectionId: source.id,
      expectedVersion: 4,
    };
    const first = await requestPublicationReviews(request);
    assert.deepEqual(
      await requestPublicationReviews(request),
      first,
      "Request replay does not create duplicates.",
    );
    const decision = {
      userId: "admin",
      reviewId: "review",
      payload: {
        decision: "APPROVED" as const,
        confirmed: true as const,
        scopeHash: first[0].scopeHash,
      },
    };
    authority = false;
    await assert.rejects(decidePublicationReview(decision), /permiso/);
    authority = true;
    collectionVersion = 5;
    await assert.rejects(decidePublicationReview(decision), /contenido cambió/);
    collectionVersion = 4;
    const approved = await decidePublicationReview(decision);
    assert.equal(approved.decision, "APPROVED");
    assert.equal(
      revokedProjection,
      0,
      "Request and approval never publish or mutate public access.",
    );
    await decidePublicationReview(decision); // exact retry accepted
    await assert.rejects(
      decidePublicationReview({ ...decision, userId: "different-admin" }),
      /ya tiene/,
    );
    await revokePublicationReview({
      userId: "admin",
      reviewId: "review",
      reason: "Material retirado",
    });
    assert.equal(revokedProjection, 1);
    await revokePublicationReview({
      userId: "admin",
      reviewId: "review",
      reason: "Material retirado",
    });
    assert.equal(
      revokedProjection,
      1,
      "Repeated revocation does not mutate twice.",
    );
    await assert.rejects(decidePublicationReview(decision), /no está vigente/);
    console.log(
      "PASS publication scope isolation, explicit approval, stale scope/version, current authority, request/decision retries and revocation. Transaction double only; no real concurrency claim.",
    );
  } finally {
    prisma.$transaction = originalTransaction;
    if (originalFlag === undefined)
      delete process.env.TERRAQO_WORKSPACE_PUBLICATION_V1;
    else process.env.TERRAQO_WORKSPACE_PUBLICATION_V1 = originalFlag;
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
