import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { terraqoClosureReferenceSourceSchema } from "../validations/terraqo";
import { loadPublicationProjections, publicSelectionPolicyWhere } from "./publication-projection";
import type { PublicSelectionItem } from "./publication-projection";
import { standalonePublicWorklogWhere } from "./public-cv";
import { workspaceAdminMemberRoles } from "./workspace-roles";
import { TerraqoMessagingError } from "./messaging";

// Legacy disclosure remains standalone title only. Versioned references freeze fields and media IDs.
export const closureReferenceSourceSelect = {
  id: true,
  worklogId: true,
  title: true,
  revisionNo: true, summary: true, outcome: true, contributionRole: true,
  responsibilities: true, methods: true, tools: true,
  contentHash: true,
  currentFor: {
    select: {
      id: true,
      currentRevisionId: true,
      visibility: true,
      lifecycle: true,
      deletedAt: true,
      workspaceId: true,
      projectId: true,
      project: { select: { isPublic: true, deletedAt: true } },
      media: { where: { contentType: "image/webp" }, select: { id: true },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }], take: 6 },
      professionalProfile: {
        select: { id: true, userId: true, liveCvEnabled: true, liveCvVisibility: true },
      },
    },
  },
} satisfies Prisma.TerraqoWorklogRevisionSelect;

type ReferenceSource = Prisma.TerraqoWorklogRevisionGetPayload<{
  select: typeof closureReferenceSourceSelect;
}>;

// Do not interpret unknown/new policies as legacy grants. Historical title is
// deliberately never read for disclosure; the hash binds the exact saved revision.
const legacySnapshotSchema = z.object({
  kind: z.literal("PUBLIC_CV"),
  revisionId: z.string().min(1),
  title: z.string(),
  contentHash: z.string().min(1),
  capturedAt: z.iso.datetime(),
}).strict();

export function isAuthorizedClosureReferenceSource(source: ReferenceSource, professionalUserId: string) {
  const current = source.currentFor;
  // Mirrors standalonePublicWorklogWhere plus the live CV and exact owner/root
  // checks. Used by save, submit, ACCEPT and every read; no owner/member fallback.
  return Boolean(current && current.id === source.worklogId &&
    current.currentRevisionId === source.id && current.workspaceId === null &&
    current.visibility === "PUBLIC" && current.lifecycle === "PUBLISHED" &&
    current.deletedAt === null &&
    (current.projectId === null || (current.project?.isPublic === true && current.project.deletedAt === null)) &&
    current.professionalProfile.userId === professionalUserId &&
    current.professionalProfile.liveCvEnabled === true &&
    current.professionalProfile.liveCvVisibility === "PUBLIC");
}

export async function loadAuthorizedClosureReferenceSources(
  tx: Prisma.TransactionClient,
  revisionIds: string[],
  professionalUserId: string,
) {
  if (!revisionIds.length) return [];
  const sources = await tx.terraqoWorklogRevision.findMany({
    where: { id: { in: revisionIds } },
    select: closureReferenceSourceSelect,
  });
  return sources.filter(source => isAuthorizedClosureReferenceSource(source, professionalUserId));
}

export const closureReferenceInclude = {
  worklogRevision: { select: closureReferenceSourceSelect },
} satisfies Prisma.TerraqoClosureReferenceInclude;

export type StoredClosureReference = Prisma.TerraqoClosureReferenceGetPayload<{ include: typeof closureReferenceInclude }>;
export type ClosureReferenceSource = z.infer<typeof terraqoClosureReferenceSourceSchema>;
const fieldNames = ["title", "summary", "outcome", "contributionRole", "responsibilities", "methods", "tools"] as const;
type Field = typeof fieldNames[number];
type Fields = Pick<PublicSelectionItem["fields"], Field>;
const unique = <T,>(items: T[]) => new Set(items).size === items.length;
export const closureReferenceSnapshotSchema = z.object({
  policy: z.literal("closure-reference-v1"),
  accessKind: z.enum(["PUBLIC_CV", "PUBLIC_SELECTION"]),
  accessReferenceId: z.string().cuid(), revisionId: z.string().cuid(),
  contentHash: z.string().min(1),
  allowedFields: z.array(z.enum(fieldNames)).max(7).refine(unique),
  // IDs bind disclosure membership, not historical bytes. Existing empty ceilings stay empty.
  mediaIds: z.array(z.string().cuid()).max(6).refine(unique),
  capturedAt: z.iso.datetime(),
}).strict();
type Snapshot = z.infer<typeof closureReferenceSnapshotSchema>;
export type ClosureReferenceDto = {
  source: ClosureReferenceSource; revisionNo: number; label: "Referencia autorizada";
  fields: Fields; media: ClosureReferenceMediaDto[];
};
export type ClosureReferenceMediaDto = {
  id: string; contentType: "image/webp"; previewHref: string; thumbnailHref: string;
};
type PreviewContext = { collaborationId: string; view: "workspace" | "professional" };
function mediaDto(ids: string[], context: PreviewContext, source: ClosureReferenceSource, referenceId?: string) {
  const query = new URLSearchParams({ view: context.view, ...(referenceId ? { referenceId } : {
    accessKind: source.accessKind, accessReferenceId: source.accessReferenceId,
  }) });
  return ids.map(id => {
    const previewHref = `/api/v1/collaborations/${encodeURIComponent(context.collaborationId)}/closure-references/${encodeURIComponent(source.worklogRevisionId)}/media/${encodeURIComponent(id)}?${query}`;
    return { id, contentType: "image/webp" as const, previewHref, thumbnailHref: previewHref };
  });
}
export type AuthorizedClosureReference = ClosureReferenceDto & {
  id: string; closureRevisionId: string; worklogRevisionId: string; createdAt: Date;
  worklogRevision: { id: string; title?: string };
};
type Resolution = { dto: ClosureReferenceDto; snapshot: Snapshot };
const selectionEnabled = () => process.env.TERRAQO_WORKSPACE_PUBLICATION_V1 === "true" &&
  process.env.TERRAQO_SCOPED_SHARING_V1 === "true";
const unavailable = () => new TerraqoMessagingError("Referencia no disponible.", 404);

export type ClosureReferenceActor = { userId: string; workspaceId?: string };
export async function assertClosureReferenceWorkspaceActor(tx: Prisma.TransactionClient, actor: ClosureReferenceActor) {
  if (!actor.workspaceId) throw unavailable();
  const workspace = await tx.terraqoWorkspace.findFirst({ where: { id: actor.workspaceId, active: true, deletedAt: null }, select: { id: true } });
  const user = await tx.user.findUnique({ where: { id: actor.userId }, select: { role: true } });
  const member = await tx.terraqoWorkspaceMember.findFirst({ where: {
    workspaceId: actor.workspaceId, userId: actor.userId, active: true, role: { in: workspaceAdminMemberRoles },
  }, select: { id: true } });
  if (!workspace || !user || (user.role !== "SUPER_ADMIN" && !member)) throw unavailable();
}
export async function resolveClosureReferenceActor(tx: Prisma.TransactionClient, collaborationId: string, actor: ClosureReferenceActor, draft = false) {
  if (actor.workspaceId) await assertClosureReferenceWorkspaceActor(tx, actor);
  const collaboration = await tx.terraqoCollaboration.findFirst({ where: {
    id: collaborationId, ...(actor.workspaceId ? { workspaceId: actor.workspaceId } : { professionalUserId: actor.userId }),
  }, include: { closure: { select: { currentRevision: { select: { status: true } } } } } });
  if (!collaboration) throw unavailable();
  if (draft && (!actor.workspaceId || !collaboration.acceptedRevisionNo ||
      !["ACCEPTED", "IN_PROGRESS", "CHANGES_REQUESTED"].includes(collaboration.status) ||
      collaboration.closure?.currentRevision?.status === "SUBMITTED")) throw unavailable();
  return collaboration;
}

/** Internal public-policy reader. Caller must first resolve the collaboration actor.
 * Batched roots and exact revisions; no owner/member or enterprise PUBLIC fallback. */
export async function resolveClosureReferenceSources(tx: Prisma.TransactionClient, choices: ClosureReferenceSource[], professionalUserId: string, requireListed = false) {
  const result = new Map<string, Resolution>();
  if (!choices.length) return result;
  const revisions = await tx.terraqoWorklogRevision.findMany({ where: { id: { in: choices.map(item => item.worklogRevisionId) } }, select: closureReferenceSourceSelect });
  const rootIds = selectionEnabled() ? choices.filter(item => item.accessKind === "PUBLIC_SELECTION").map(item => item.accessReferenceId) : [];
  const roots = rootIds.length ? await tx.terraqoPublicProjection.findMany({ where: {
    id: { in: rootIds }, collection: { professionalProfile: { userId: professionalUserId } },
    ...(requireListed ? { snapshot: { path: ["listOnCv"], equals: true } } : {}),
  }, select: { id: true } }) : [];
  const projections = await loadPublicationProjections(tx, roots.map(root => root.id));
  for (const source of choices) {
    const revision = revisions.find(item => item.id === source.worklogRevisionId);
    const current = revision?.currentFor;
    if (!revision || !current || current.id !== revision.worklogId || current.currentRevisionId !== revision.id ||
        current.deletedAt || current.lifecycle !== "PUBLISHED" || current.professionalProfile.userId !== professionalUserId ||
        !current.professionalProfile.liveCvEnabled) continue;
    let fields: Fields;
    let mediaIds: string[];
    if (source.accessKind === "PUBLIC_CV") {
      if (source.accessReferenceId !== revision.worklogId || !isAuthorizedClosureReferenceSource(revision, professionalUserId)) continue;
      fields = Object.fromEntries(fieldNames.map(field => [field, revision[field]]));
      mediaIds = current.media.map(media => media.id);
    } else {
      const projection = projections.get(source.accessReferenceId);
      if (requireListed && !projection?.listOnCv) continue;
      const item = projection?.items.find(item => item.revisionId === revision.id && item.contentHash === revision.contentHash && item.worklogId === revision.worklogId);
      if (!item) continue;
      fields = Object.fromEntries(fieldNames.filter(field => Object.hasOwn(item.fields, field)).map(field => [field, item.fields[field]]));
      mediaIds = [...item.mediaIds];
    }
    const snapshot = closureReferenceSnapshotSchema.parse({ policy: "closure-reference-v1", accessKind: source.accessKind,
      accessReferenceId: source.accessReferenceId, revisionId: revision.id, contentHash: revision.contentHash,
      allowedFields: fieldNames.filter(field => Object.hasOwn(fields, field)), mediaIds, capturedAt: new Date().toISOString() });
    result.set(source.worklogRevisionId, { dto: { source, revisionNo: revision.revisionNo, label: "Referencia autorizada", fields, media: [] }, snapshot });
  }
  return result;
}

function wrapReference(reference: StoredClosureReference, dto: ClosureReferenceDto): AuthorizedClosureReference {
  return { id: reference.id, closureRevisionId: reference.closureRevisionId, worklogRevisionId: reference.worklogRevisionId,
    createdAt: reference.createdAt, ...dto, worklogRevision: { id: reference.worklogRevisionId,
      ...(dto.fields.title !== undefined ? { title: dto.fields.title } : {}) } };
}

// Synchronous fallback intentionally authorizes only historical personal title.
// New snapshots always require the tx-aware canonical resolver, including on replay.
export function readAuthorizedClosureReference(reference: StoredClosureReference, professionalUserId: string,
  authorized?: Map<string, AuthorizedClosureReference>) {
  if (authorized) return authorized.get(reference.id) ?? null;
  const source = reference.worklogRevision;
  const snapshot = legacySnapshotSchema.safeParse(reference.accessSnapshot);
  if (!snapshot.success || snapshot.data.revisionId !== reference.worklogRevisionId || source.id !== reference.worklogRevisionId ||
      snapshot.data.contentHash !== source.contentHash || !isAuthorizedClosureReferenceSource(source, professionalUserId)) return null;
  return wrapReference(reference, { source: { worklogRevisionId: source.id, accessKind: "PUBLIC_CV", accessReferenceId: source.worklogId },
    revisionNo: source.revisionNo, label: "Referencia autorizada", fields: { title: source.title }, media: [] });
}

export async function loadAuthorizedClosureReferences(tx: Prisma.TransactionClient, references: StoredClosureReference[], professionalUserId: string, requireFull = false, context?: PreviewContext) {
  const result = new Map<string, AuthorizedClosureReference>();
  // Process a bounded batch, allowing different historical roots for the same revision.
  for (let offset = 0; offset < references.length; offset += 30) {
    const batch = references.slice(offset, offset + 30);
    // Group by exact root: one saved revision can have different ceilings in history.
    const groups = new Map<string, StoredClosureReference[]>();
    for (const reference of batch) {
      const parsed = closureReferenceSnapshotSchema.safeParse(reference.accessSnapshot);
      if (!parsed.success) {
        const legacy = readAuthorizedClosureReference(reference, professionalUserId);
        if (legacy) result.set(reference.id, legacy);
        continue;
      }
      const saved = parsed.data;
      if (saved.revisionId !== reference.worklogRevisionId || saved.contentHash !== reference.worklogRevision.contentHash) continue;
      const key = saved.accessKind + ":" + saved.accessReferenceId;
      groups.set(key, [...(groups.get(key) ?? []), reference]);
    }
    for (const group of groups.values()) {
      const choices = group.map(reference => {
        const saved = closureReferenceSnapshotSchema.parse(reference.accessSnapshot);
        return { worklogRevisionId: saved.revisionId, accessKind: saved.accessKind, accessReferenceId: saved.accessReferenceId };
      });
      const live = await resolveClosureReferenceSources(tx, choices, professionalUserId);
      for (const reference of group) {
        const saved = closureReferenceSnapshotSchema.parse(reference.accessSnapshot);
        const resolved = live.get(reference.worklogRevisionId);
        if (!resolved || resolved.snapshot.contentHash !== saved.contentHash || (requireFull && (
          saved.allowedFields.some(field => !Object.hasOwn(resolved.dto.fields, field)) ||
          saved.mediaIds.some(id => !resolved.snapshot.mediaIds.includes(id))))) continue;
        const fields: Fields = Object.fromEntries(saved.allowedFields.filter(field => Object.hasOwn(resolved.dto.fields, field)).map(field => [field, resolved.dto.fields[field]]));
        const ids = saved.mediaIds.filter(id => resolved.snapshot.mediaIds.includes(id));
        let preview = context;
        if (ids.length && !preview) {
          const revision = await tx.terraqoClosureRevision.findUnique({ where: { id: reference.closureRevisionId },
            select: { closure: { select: { collaborationId: true } } } });
          if (!revision) continue;
          preview = { collaborationId: revision.closure.collaborationId, view: "professional" };
        }
        result.set(reference.id, wrapReference(reference, { ...resolved.dto, fields,
          media: preview ? mediaDto(ids, preview, resolved.dto.source, reference.id) : [] }));
      }
    }
  }
  return result;
}

const cursorSchema = z.object({ collaborationId: z.string(), professionalUserId: z.string(),
  phase: z.enum(["cv", "selection"]), after: z.string().max(128), revision: z.string().max(128) }).strict();

/** Bounded keyset pages: at most 31 personal revisions or one root/50 items.
 * An empty page may have a cursor when that root has been withdrawn. No totals. */
export async function listClosureReferenceCandidates(tx: Prisma.TransactionClient, input: ClosureReferenceActor & { collaborationId: string; limit?: number; cursor?: string }) {
  const collaboration = await resolveClosureReferenceActor(tx, input.collaborationId, input, true);
  const limit = z.number().int().min(1).max(30).parse(input.limit ?? 20);
  let cursor: z.infer<typeof cursorSchema> = { collaborationId: collaboration.id, professionalUserId: collaboration.professionalUserId, phase: "cv", after: "", revision: "" };
  if (input.cursor) {
    try {
      if (input.cursor.length > 1200) throw unavailable();
      cursor = cursorSchema.parse(JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")));
      if (cursor.collaborationId !== collaboration.id || cursor.professionalUserId !== collaboration.professionalUserId) throw unavailable();
    } catch { throw new TerraqoMessagingError("Cursor inválido.", 400); }
  }
  const encode = (next: typeof cursor) => Buffer.from(JSON.stringify(next)).toString("base64url");
  if (cursor.phase === "cv") {
    const revisions = await tx.terraqoWorklogRevision.findMany({ where: { id: { gt: cursor.after }, currentFor: {
      ...standalonePublicWorklogWhere, professionalProfile: { userId: collaboration.professionalUserId, liveCvEnabled: true, liveCvVisibility: "PUBLIC" },
    } }, select: { id: true, worklogId: true }, orderBy: { id: "asc" }, take: limit + 1 });
    const page = revisions.slice(0, limit);
    const authorized = await resolveClosureReferenceSources(tx, page.map(item => ({ worklogRevisionId: item.id, accessKind: "PUBLIC_CV", accessReferenceId: item.worklogId })), collaboration.professionalUserId);
    return { items: [...authorized.values()].map(item => ({ ...item.dto, media: mediaDto(item.snapshot.mediaIds,
      { collaborationId: collaboration.id, view: "workspace" }, item.dto.source) })), nextCursor: revisions.length > limit
      ? encode({ ...cursor, after: page.at(-1)!.id }) : selectionEnabled() ? encode({ ...cursor, phase: "selection", after: "", revision: "" }) : null };
  }
  if (!selectionEnabled()) return { items: [], nextCursor: null };
  const roots = await tx.terraqoPublicProjection.findMany({ where: {
    id: cursor.revision ? { gte: cursor.after } : { gt: cursor.after }, ...publicSelectionPolicyWhere(),
    snapshot: { path: ["listOnCv"], equals: true }, collection: { lifecycle: { not: "ARCHIVED" }, professionalProfile: { userId: collaboration.professionalUserId, liveCvEnabled: true } },
  }, select: { id: true }, orderBy: { id: "asc" }, take: 2 });
  const root = roots[0];
  if (!root) return { items: [], nextCursor: null };
  const projection = (await loadPublicationProjections(tx, [root.id])).get(root.id);
  const items = (projection?.listOnCv ? projection.items : []).filter(item => root.id !== cursor.after || item.revisionId > cursor.revision).sort((a,b) => a.revisionId.localeCompare(b.revisionId));
  const page = items.slice(0, limit);
  const authorized = await resolveClosureReferenceSources(tx, page.map(item => ({ worklogRevisionId: item.revisionId, accessKind: "PUBLIC_SELECTION", accessReferenceId: root.id })), collaboration.professionalUserId, true);
  return { items: [...authorized.values()].map(item => ({ ...item.dto, media: mediaDto(item.snapshot.mediaIds,
    { collaborationId: collaboration.id, view: "workspace" }, item.dto.source) })), nextCursor: items.length > limit ? encode({ ...cursor, after: root.id, revision: page.at(-1)!.revisionId })
    : roots.length > 1 ? encode({ ...cursor, after: root.id, revision: "" }) : null };
}

export type ClosureReferenceDetailInput = ClosureReferenceActor & {
  collaborationId: string; revisionId: string; referenceId?: string; source?: ClosureReferenceSource;
};
export async function getClosureReferenceDetail(tx: Prisma.TransactionClient, input: ClosureReferenceDetailInput) {
  const collaboration = await resolveClosureReferenceActor(tx, input.collaborationId, input, !input.referenceId);
  const context: PreviewContext = { collaborationId: collaboration.id, view: input.workspaceId ? "workspace" : "professional" };
  if (input.referenceId) {
    if (input.source) throw unavailable();
    const reference = await tx.terraqoClosureReference.findFirst({ where: {
      id: input.referenceId, worklogRevisionId: input.revisionId,
      closureRevision: { closure: { collaborationId: collaboration.id },
        ...(!input.workspaceId ? { submittedAt: { not: null }, status: { not: "DRAFT" } } : {}) },
    }, include: closureReferenceInclude });
    if (!reference) throw unavailable();
    const dto = (await loadAuthorizedClosureReferences(tx, [reference], collaboration.professionalUserId, false, context)).get(reference.id);
    if (!dto) throw unavailable();
    return dto;
  }
  const source = terraqoClosureReferenceSourceSchema.parse(input.source);
  if (source.worklogRevisionId !== input.revisionId) throw unavailable();
  const result = (await resolveClosureReferenceSources(tx, [source], collaboration.professionalUserId, true)).get(input.revisionId);
  if (!result) throw unavailable();
  return { ...result.dto, media: mediaDto(result.snapshot.mediaIds, context, source) };
}

/** Fresh reads only: never hold a repeatable-read transaction across blob IO.
 * Saved references bind the exact closure revision through referenceId, not a client grant. */
export async function resolveClosureReferenceMedia(tx: Prisma.TransactionClient, input: ClosureReferenceDetailInput & { mediaId: string }) {
  const dto = await getClosureReferenceDetail(tx, input);
  if (!dto.media.some(media => media.id === input.mediaId)) throw unavailable();
  const media = await tx.terraqoWorklogMedia.findFirst({ where: {
    id: input.mediaId, contentType: "image/webp",
    worklog: { currentRevisionId: input.revisionId, revisions: { some: { id: input.revisionId } } },
  }, select: { id: true, storageKey: true, contentType: true, size: true } });
  if (!media) throw unavailable();
  return { ...media, source: dto.source,
    closureRevisionId: "closureRevisionId" in dto ? dto.closureRevisionId : null };
}
