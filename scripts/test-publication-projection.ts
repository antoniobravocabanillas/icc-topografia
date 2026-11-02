import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import {
  buildPublicationSnapshot,
  publicationSnapshotHash,
  type PublicationSource,
} from "../lib/terraqo/publication-review-policy";
import {
  preparePublicationProjection,
  loadPublicationProjections,
  publicSelectionPolicyWhere,
} from "../lib/terraqo/publication-projection";
import { publishCollectionProjection } from "../lib/terraqo/scoped-sharing";
import { prisma } from "../lib/prisma";

const collection: PublicationSource = {
  id: "selection",
  version: 4,
  title: "Material autorizado",
  description: null,
  items: [
    {
      allowedFields: ["summary", "occurredAt", "locationLabel"],
      includeMedia: true,
      mediaIds: ["image"],
      revision: {
        id: "revision",
        revisionNo: 1,
        contentHash: "immutable",
        title: "Título excluido",
        summary: "Resumen aprobado",
        outcome: null,
        contributionRole: null,
        responsibilities: [],
        methods: [],
        tools: [],
        worklog: {
          id: "worklog",
          workspaceId: "company",
          deletedAt: null,
          occurredAt: new Date("2026-11-01T12:00:00Z"),
          locationLabel: "Lugar autorizado",
          media: [{ id: "image", contentType: "image/webp" }],
        },
      },
    },
  ],
};

async function run() {
  const originalFlag = process.env.TERRAQO_WORKSPACE_PUBLICATION_V1;
  const originalTransaction = prisma.$transaction;
  const approved = buildPublicationSnapshot(collection, "company");
  const review = {
    id: "review",
    workspaceId: "company",
    collectionId: collection.id,
    collectionVersion: 4,
    scopeHash: publicationSnapshotHash(approved),
    snapshot: approved,
  };
  let approvals = [review];
  let reads = 0;
  let root:
    | {
        id: string;
        policyVersion: string;
        snapshot: unknown;
        collection: PublicationSource;
      }
    | undefined;
  let written:
    | { create: Record<string, unknown>; update: Record<string, unknown> }
    | undefined;
  const double = {
    $queryRaw: async () => [{ id: collection.id }],
    terraqoShareCollection: {
      findFirst: async () => collection,
      findUnique: async () => ({ version: collection.version }),
      update: async () => ({ id: collection.id }),
    },
    terraqoPublicationReview: { findMany: async () => approvals },
    terraqoPublicProjection: {
      findMany: async () => {
        reads++;
        return root ? [root] : [];
      },
      upsert: async (data: typeof written) => {
        written = data;
        return {
          id: "new-root",
          slug: "new-slug",
          policyVersion: "public-selection-v2",
          publishedAt: new Date(),
          revokedAt: null,
        };
      },
    },
  };
  const tx = double as unknown as Prisma.TransactionClient;
  prisma.$transaction = (async (
    fn: (client: Prisma.TransactionClient) => Promise<unknown>,
  ) => fn(tx)) as unknown as typeof prisma.$transaction;
  try {
    delete process.env.TERRAQO_WORKSPACE_PUBLICATION_V1;
    assert.deepEqual(publicSelectionPolicyWhere().policyVersion.in, [
      "public-selection-v1",
    ]);
    assert.equal((await loadPublicationProjections(tx, ["root"])).size, 0);
    assert.equal(reads, 0, "Disabled rollout must not read the new schema.");
    await assert.rejects(
      publishCollectionProjection({
        userId: "owner",
        collectionId: collection.id,
        expectedVersion: 4,
      }),
      /autorización S24/,
    );
    process.env.TERRAQO_WORKSPACE_PUBLICATION_V1 = "true";
    approvals = [];
    await assert.rejects(
      preparePublicationProjection(tx, collection.id, 4),
      /Falta una autorización/,
    );
    approvals = [review];
    const snapshot = await preparePublicationProjection(tx, collection.id, 4);
    assert.equal("title" in snapshot.items[0].fields, false);
    await publishCollectionProjection({
      userId: "owner",
      collectionId: collection.id,
      expectedVersion: 4,
    });
    assert.ok(written?.create.snapshot);
    assert.ok(written?.update.snapshot);
    assert.equal(typeof written?.update.id, "string");
    assert.equal(
      typeof written?.update.slug,
      "string",
      "Republishing replaces old access root and URL.",
    );
    root = {
      id: "root",
      policyVersion: "public-selection-v2",
      snapshot,
      collection,
    };
    collection.items[0].revision.worklog.locationLabel =
      "Lugar posterior no autorizado";
    collection.items[0].revision.worklog.occurredAt = new Date(
      "2026-11-02T12:00:00Z",
    );
    const pinned = (await loadPublicationProjections(tx, ["root"])).get(
      "root",
    )!;
    assert.equal(pinned.items[0].fields.locationLabel, "Lugar autorizado");
    assert.equal(pinned.items[0].fields.occurredAt, "2026-11-01T12:00:00.000Z");
    await assert.rejects(
      preparePublicationProjection(tx, collection.id, 4),
      /Falta una autorización/,
      "A new publication cannot reuse changed content approval.",
    );
    approvals = [];
    assert.equal(
      (await loadPublicationProjections(tx, ["root"])).size,
      0,
      "Revoked approval or inactive company removes future access.",
    );
    approvals = [review];
    collection.items[0].revision.worklog.media = [];
    assert.equal((await loadPublicationProjections(tx, ["root"])).size, 0);
    collection.items[0].revision.worklog.media = [
      { id: "image", contentType: "image/webp" },
    ];
    collection.items[0].allowedFields = ["summary"];
    assert.equal(
      (await loadPublicationProjections(tx, ["root"])).size,
      0,
      "Live narrowing must never be bypassed by an old snapshot.",
    );
    collection.items[0].allowedFields = [
      "summary",
      "occurredAt",
      "locationLabel",
    ];
    collection.items[0].revision.worklog.deletedAt = new Date();
    assert.equal((await loadPublicationProjections(tx, ["root"])).size, 0);
    collection.items[0].revision.worklog.deletedAt = null;
    root.snapshot = { ...snapshot, approvals: [] };
    assert.equal(
      (await loadPublicationProjections(tx, ["root"])).size,
      0,
      "An enterprise item requires a matching company approval.",
    );
    root.snapshot = {
      ...snapshot,
      items: [
        {
          ...snapshot.items[0],
          fields: { ...snapshot.items[0].fields, title: "Inyectado" },
        },
      ],
    };
    assert.equal(
      (await loadPublicationProjections(tx, ["root"])).size,
      0,
      "Stored scope mismatch fails closed.",
    );
    console.log(
      "PASS approved publication, frozen mutable fields, missing/revoked scopes, media deletion, live narrowing, disabled schema gate and rotated publication identity. Transaction doubles only.",
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
