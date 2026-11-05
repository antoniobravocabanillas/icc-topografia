import { createHash } from "node:crypto";
import { z } from "zod";

export const PUBLICATION_POLICY = "enterprise-publication-v1";
export const publicationFields = [
  "title",
  "summary",
  "outcome",
  "contributionRole",
  "responsibilities",
  "methods",
  "tools",
  "occurredAt",
  "locationLabel",
] as const;
export type PublicationField = (typeof publicationFields)[number];
const fieldsSchema = z
  .object({
    title: z.string().optional(),
    summary: z.string().optional(),
    outcome: z.string().nullable().optional(),
    contributionRole: z.string().nullable().optional(),
    responsibilities: z.array(z.string()).optional(),
    methods: z.array(z.string()).optional(),
    tools: z.array(z.string()).optional(),
    occurredAt: z.string().datetime().optional(),
    locationLabel: z.string().nullable().optional(),
  })
  .strict();
export const workCaseTargetSchema = z
  .object({
    id: z.string().min(1).max(160),
    version: z.number().int().positive(),
  })
  .strict();
export type WorkCaseTarget = z.infer<typeof workCaseTargetSchema>;
export const workCaseScopeSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const publicationSnapshotSchema = z
  .object({
    policy: z.literal(PUBLICATION_POLICY),
    destination: z.literal("PUBLIC_SELECTION"),
    workCaseScope: workCaseScopeSchema.optional(),
    collectionId: z.string(),
    collectionVersion: z.number().int().positive(),
    workspaceId: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    items: z
      .array(
        z
          .object({
            revisionId: z.string(),
            revisionNo: z.number().int().positive(),
            contentHash: z.string(),
            worklogId: z.string(),
            fields: fieldsSchema,
            mediaIds: z.array(z.string()).max(6),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();
export type PublicationSnapshot = z.infer<typeof publicationSnapshotSchema>;

export type PublicationSource = {
  id: string;
  version: number;
  title: string;
  description: string | null;
  items: Array<{
    allowedFields: string[];
    includeMedia: boolean;
    mediaIds: string[];
    revision: {
      id: string;
      revisionNo: number;
      contentHash: string;
      title: string;
      summary: string;
      outcome: string | null;
      contributionRole: string | null;
      responsibilities: string[];
      methods: string[];
      tools: string[];
      worklog: {
        id: string;
        workspaceId: string | null;
        deletedAt: Date | null;
        occurredAt: Date;
        locationLabel: string | null;
        media: Array<{ id: string; contentType: string }>;
      };
    };
  }>;
};

/** Only the requested workspace and explicit fields/media cross the review boundary.
 * GPS coordinates, storage keys, unrelated workspaces and unrestricted revisions never do. */
export function buildPublicationSnapshot(
  collection: PublicationSource,
  workspaceId: string,
  workCaseScope?: string,
): PublicationSnapshot {
  return publicationSnapshotSchema.parse({
    policy: PUBLICATION_POLICY,
    destination: "PUBLIC_SELECTION",
    ...(workCaseScope ? { workCaseScope } : {}),
    collectionId: collection.id,
    collectionVersion: collection.version,
    workspaceId,
    title: collection.title,
    description: collection.description,
    items: collection.items
      .filter((item) => item.revision.worklog.workspaceId === workspaceId)
      .map((item) => {
        const { revision } = item;
        if (revision.worklog.deletedAt)
          throw new Error("La selección contiene material retirado.");
        const allowed = new Set(item.allowedFields);
        if (
          item.allowedFields.some(
            (field) => !publicationFields.includes(field as PublicationField),
          )
        )
          throw new Error("El alcance contiene campos no publicables.");
        const values = {
          ...revision,
          occurredAt: revision.worklog.occurredAt.toISOString(),
          locationLabel: revision.worklog.locationLabel,
        };
        const fields = Object.fromEntries(
          publicationFields
            .filter((field) => allowed.has(field))
            .map((field) => [field, values[field]]),
        );
        const mediaIds = item.includeMedia
          ? [...new Set(item.mediaIds)].sort()
          : [];
        if (
          mediaIds.some(
            (id) =>
              !revision.worklog.media.some(
                (media) =>
                  media.id === id && media.contentType === "image/webp",
              ),
          )
        )
          throw new Error(
            "Un adjunto seleccionado ya no está disponible para publicar.",
          );
        return {
          revisionId: revision.id,
          revisionNo: revision.revisionNo,
          contentHash: revision.contentHash,
          worklogId: revision.worklog.id,
          fields,
          mediaIds,
        };
      }),
  });
}

export function publicationSnapshotHash(snapshot: PublicationSnapshot) {
  // Schema fixes key order and rejects additions before hashing the exact disclosure.
  return createHash("sha256")
    .update(JSON.stringify(publicationSnapshotSchema.parse(snapshot)))
    .digest("hex");
}

export const publicationDecisionSchema = z.discriminatedUnion("decision", [
  z
    .object({
      decision: z.literal("APPROVED"),
      scopeHash: z.string().regex(/^[a-f0-9]{64}$/),
      confirmed: z.literal(true),
      comment: z.string().trim().max(2000).optional(),
    })
    .strict(),
  z
    .object({
      decision: z.enum(["CHANGES_REQUESTED", "DECLINED"]),
      scopeHash: z.string().regex(/^[a-f0-9]{64}$/),
      comment: z.string().trim().min(3).max(2000),
    })
    .strict(),
]);
