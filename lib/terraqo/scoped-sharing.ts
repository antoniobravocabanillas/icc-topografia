import { buildPublicationSnapshot, companyGrantId, publicationSnapshotHash, publicationSnapshotSchema, type InviteTarget, type WorkCaseTarget } from "./publication-review-policy";
import { publicationReviewEnabled, PublicationReviewError, publicationSourceSelect } from "./publication-review";
import { preparePublicationProjection, loadPublicationProjections, publicSelectionPolicyWhere, PUBLICATION_PROJECTION_POLICY } from "./publication-projection";
import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  terraqoAccessGrantCreateSchema,
  terraqoShareCollectionCreateSchema,
} from "@/lib/validations/terraqo";

export class ScopedSharingError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "ScopedSharingError";
  }
}

const collectionInclude = {
  items: {
    orderBy: { sortOrder: "asc" },
    include: {
      revision: {
        select: {
          id: true,
          revisionNo: true,
          title: true,
          summary: true,
          contentHash: true,
          createdAt: true,
          worklog: {
            select: {
              id: true,
              workspaceId: true,
              occurredAt: true,
              locationLabel: true,
              media: { select: { id: true, contentType: true }, orderBy: { sortOrder: "asc" } },
            },
          },
        },
      },
    },
  },
  grants: {
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      subjectUserId: true,
      inviteEmail: true,
      scopes: true,
      lifecycle: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  },
  publicProjection: {
    select: { id: true, slug: true, policyVersion: true, publishedAt: true, revokedAt: true },
  },
} satisfies Prisma.TerraqoShareCollectionInclude;

async function ownedProfile(userId: string) {
  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!profile) throw new ScopedSharingError("Completa tu perfil profesional.", 409);
  return profile;
}

export async function listShareCollections(userId: string) {
  const profile = await ownedProfile(userId);
  return prisma.terraqoShareCollection.findMany({
    where: { professionalProfileId: profile.id, lifecycle: { not: "ARCHIVED" } },
    include: collectionInclude,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
}

export async function createShareCollection(input: {
  userId: string;
  operationKey: string;
  payload: z.infer<typeof terraqoShareCollectionCreateSchema>;
}) {
  const profile = await ownedProfile(input.userId);
  const revisionIds = input.payload.items.map((item) => item.revisionId);
  if (new Set(revisionIds).size !== revisionIds.length)
    throw new ScopedSharingError("Cada revisión puede seleccionarse una sola vez.", 422);
  const operationFingerprint = createHash("sha256")
    .update(JSON.stringify(input.payload))
    .digest("hex");

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoProfessionalProfile" WHERE id=${profile.id} FOR UPDATE`);
    const existing = await tx.terraqoShareCollection.findUnique({
      where: { createdById_operationKey: { createdById: input.userId, operationKey: input.operationKey } },
      include: collectionInclude,
    });
    if (existing) {
      if (existing.operationFingerprint !== operationFingerprint)
        throw new ScopedSharingError("La clave de reintento ya fue usada con otra selección.", 409);
      return existing;
    }
    const revisions = await tx.terraqoWorklogRevision.findMany({
      where: {
        id: { in: revisionIds },
        worklog: {
          professionalProfileId: profile.id,
          authorId: input.userId,
          deletedAt: null,
        },
      },
      select: {
        id: true,
        worklog: { select: { media: { select: { id: true, contentType: true }, orderBy: { sortOrder: "asc" } } } },
      },
    });
    if (revisions.length !== revisionIds.length)
      throw new ScopedSharingError("Alguna revisión no existe o no pertenece a tu trayectoria.", 404);

    const byId = new Map(revisions.map((revision) => [revision.id, revision]));
    for (const item of input.payload.items) {
      if (
        item.includeMedia &&
        byId.get(item.revisionId)?.worklog.media.some((media) => media.contentType !== "image/webp")
      ) {
        throw new ScopedSharingError(
          "Esta evidencia contiene archivos históricos aún no normalizados. Compártela sin adjuntos o solicita su reprocesamiento.",
          422,
        );
      }
    }

    return tx.terraqoShareCollection.create({
      data: {
        professionalProfileId: profile.id,
        title: input.payload.title,
        description: input.payload.description,
        createdById: input.userId,
        operationKey: input.operationKey,
        operationFingerprint,
        items: {
          create: input.payload.items.map((item, sortOrder) => ({
            revisionId: item.revisionId,
            allowedFields: item.allowedFields,
            includeMedia: item.includeMedia,
            mediaIds: item.includeMedia
              ? byId.get(item.revisionId)?.worklog.media.map((media) => media.id) ?? []
              : [],
            sortOrder,
          })),
        },
      },
      include: collectionInclude,
    });
  }, { isolationLevel: "Serializable" });
}

// A company approval is tied to this recipient, expiry, version, fields and media.
async function approvedCompanyGrants(tx: Prisma.TransactionClient, collectionId: string, requested?: { version: number; target: InviteTarget }) {
  const hasCompany = await tx.terraqoShareCollectionItem.findFirst({
    where: { collectionId, revision: { worklog: { workspaceId: { not: null } } } }, select: { id: true },
  });
  if (!hasCompany) return null;
  if (!publicationReviewEnabled()) return [];
  const collection = await tx.terraqoShareCollection.findUnique({ where: { id: collectionId }, select: publicationSourceSelect });
  if (!collection) return [];
  const companies = new Set(collection.items.flatMap(i => i.revision.worklog.workspaceId ? [i.revision.worklog.workspaceId] : []));
  const reviews = await tx.terraqoPublicationReview.findMany({ where: {
    collectionId, collectionVersion: requested?.version, decision: "APPROVED", revokedAt: null,
    workspace: { active: true, deletedAt: null }, snapshot: { path: ["destination"], equals: "INVITED_SELECTION" },
  }, select: { workspaceId: true, collectionVersion: true, snapshot: true, scopeHash: true } });
  const approved = new Map<number, Set<string>>();
  for (const review of reviews) {
    const parsed = publicationSnapshotSchema.safeParse(review.snapshot);
    if (!parsed.success || !parsed.data.inviteTarget || !companies.has(review.workspaceId)) continue;
    const target = requested?.target ?? parsed.data.inviteTarget;
    try {
      const current = buildPublicationSnapshot({ ...collection, version: review.collectionVersion }, review.workspaceId, undefined, { inviteTarget: target });
      if (publicationSnapshotHash(current) !== review.scopeHash || publicationSnapshotHash(parsed.data) !== review.scopeHash) continue;
    } catch { continue; } // A removed source no longer authorizes disclosure.
    const group = approved.get(review.collectionVersion) ?? new Set<string>();
    group.add(review.workspaceId);
    approved.set(review.collectionVersion, group);
  }
  return [...approved].filter(([, group]) => group.size === companies.size).map(([version]) => companyGrantId(collectionId, version));
}

export async function createCollectionGrant(input: {
  userId: string;
  collectionId: string;
  operationKey: string;
  payload: z.infer<typeof terraqoAccessGrantCreateSchema>;
}) {
  const expiresAt = new Date(input.payload.expiresAt);
  const now = new Date();
  if (expiresAt.getTime() <= now.getTime() + 5 * 60_000)
    throw new ScopedSharingError("La vigencia debe terminar en el futuro.", 422);
  if (expiresAt.getTime() > now.getTime() + 90 * 86_400_000)
    throw new ScopedSharingError("La vigencia máxima inicial es de 90 días.", 422);

  const rawToken = input.payload.inviteEmail ? randomBytes(32).toString("base64url") : null;
  const tokenHash = rawToken
    ? createHash("sha256").update(rawToken).digest("hex")
    : null;
  const operationFingerprint = createHash("sha256")
    .update(JSON.stringify({ collectionId: input.collectionId, ...input.payload }))
    .digest("hex");

  const grant = await prisma.$transaction(async (tx) => {
    const collection = await tx.terraqoShareCollection.findFirst({
      where: {
        id: input.collectionId,
        createdById: input.userId,
        lifecycle: { not: "ARCHIVED" },
      },
      select: { id: true, version: true, items: { select: { includeMedia: true, mediaIds: true } } },
    });
    if (!collection) throw new ScopedSharingError("Selección no disponible.", 404);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoShareCollection" WHERE id=${collection.id} FOR UPDATE`);
    const existing = await tx.terraqoAccessGrant.findUnique({
      where: { issuedById_operationKey: { issuedById: input.userId, operationKey: input.operationKey } },
      select: {
        id: true,
        subjectUserId: true,
        inviteEmail: true,
        scopes: true,
        lifecycle: true,
        expiresAt: true,
        createdAt: true,
        operationFingerprint: true,
      },
    });
    if (existing) {
      if (existing.operationFingerprint !== operationFingerprint)
        throw new ScopedSharingError("La clave de reintento ya fue usada con otro acceso.", 409);
      return { ...existing, replayed: true };
    }
    const locked = await tx.terraqoShareCollection.findUnique({
      where: { id: collection.id },
      select: { version: true },
    });
    if (!locked || locked.version !== input.payload.expectedVersion)
      throw new ScopedSharingError("La selección cambió en otra sesión. Recarga antes de compartir.", 409);
    if (
      input.payload.scopes.includes("DOWNLOAD_MEDIA") &&
      !collection.items.some((item) => item.includeMedia && item.mediaIds.length > 0)
    )
      throw new ScopedSharingError("La selección no contiene archivos autorizados para descarga.", 422);

    if (input.payload.subjectUserId) {
      const subject = await tx.user.findUnique({ where: { id: input.payload.subjectUserId }, select: { id: true } });
      if (!subject) throw new ScopedSharingError("Destinatario no disponible.", 404);
      if (subject.id === input.userId)
        throw new ScopedSharingError("No necesitas concederte acceso a tu propia selección.", 422);
    }

    let reviewGrantId: string | undefined;
    const companyReview = await approvedCompanyGrants(tx, collection.id, {
      version: locked.version, target: { email: input.payload.inviteEmail ?? "", expiresAt: expiresAt.toISOString(), download: input.payload.scopes.includes("DOWNLOAD_MEDIA") },
    });
    if (companyReview !== null) {
      if (!companyReview.length || !input.payload.inviteEmail) throw new ScopedSharingError("La empresa debe autorizar el destinatario, los campos y la vigencia antes de conceder acceso.", 409);
      reviewGrantId = companyReview[0];
    }
    const created = await tx.terraqoAccessGrant.create({
      data: {
        collectionId: collection.id,
        subjectUserId: input.payload.subjectUserId,
        inviteEmail: input.payload.inviteEmail,
        id: reviewGrantId,
        tokenHash,
        scopes: input.payload.scopes,
        expiresAt,
        issuedById: input.userId,
        operationKey: input.operationKey,
        operationFingerprint,
      },
      select: {
        id: true,
        subjectUserId: true,
        inviteEmail: true,
        scopes: true,
        lifecycle: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    await tx.terraqoShareCollection.update({
      where: { id: collection.id },
      data: { version: { increment: 1 }, lifecycle: "ACTIVE" },
    });
    return { ...created, replayed: false };
  }, { isolationLevel: "Serializable" });

  return {
    grant: {
      id: grant.id,
      subjectUserId: grant.subjectUserId,
      inviteEmail: grant.inviteEmail,
      scopes: grant.scopes,
      lifecycle: grant.lifecycle,
      expiresAt: grant.expiresAt,
      createdAt: grant.createdAt,
    },
    invitationToken: grant.replayed ? null : rawToken,
    replayed: grant.replayed,
  };
}

export async function revokeCollectionGrant(input: {
  userId: string;
  collectionId: string;
  grantId: string;
  expectedVersion: number;
  reason?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const collection = await tx.terraqoShareCollection.findFirst({
      where: { id: input.collectionId, createdById: input.userId, lifecycle: { not: "ARCHIVED" } },
      select: { id: true },
    });
    if (!collection) throw new ScopedSharingError("Selección no disponible.", 404);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoShareCollection" WHERE id=${collection.id} FOR UPDATE`);
    const locked = await tx.terraqoShareCollection.findUnique({ where: { id: collection.id }, select: { version: true } });
    if (!locked || locked.version !== input.expectedVersion)
      throw new ScopedSharingError("La selección cambió en otra sesión. Recarga antes de revocar.", 409);
    const changed = await tx.terraqoAccessGrant.updateMany({
      where: { id: input.grantId, collectionId: collection.id, lifecycle: "ACTIVE" },
      data: { lifecycle: "REVOKED", revokedAt: new Date(), revokedReason: input.reason },
    });
    if (!changed.count) throw new ScopedSharingError("El acceso ya no está activo.", 409);
    return tx.terraqoShareCollection.update({
      where: { id: collection.id },
      data: { version: { increment: 1 } },
      include: collectionInclude,
    });
  }, { isolationLevel: "Serializable" });
}

export async function publishCollectionProjection(input: {
  listOnCv?: boolean;
  workCase?: WorkCaseTarget;
  userId: string;
  collectionId: string;
  expectedVersion: number;
}) {
  return prisma.$transaction(async (tx) => {
    const collection = await tx.terraqoShareCollection.findFirst({
      where: { id: input.collectionId, createdById: input.userId, lifecycle: { not: "ARCHIVED" } },
      select: {
        id: true,
        version: true,
        items: {
          select: {
            revision: { select: { worklog: { select: { workspaceId: true } } } },
          },
        },
      },
    });
    if (!collection) throw new ScopedSharingError("Selección no disponible.", 404);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoShareCollection" WHERE id=${collection.id} FOR UPDATE`);
    const locked = await tx.terraqoShareCollection.findUnique({ where: { id: collection.id }, select: { version: true } });
    if (!locked || locked.version !== input.expectedVersion)
      throw new ScopedSharingError("La selección cambió en otra sesión. Recarga antes de publicar.", 409);
    if (!publicationReviewEnabled() && collection.items.some((item) => item.revision.worklog.workspaceId))
      throw new ScopedSharingError(
        "El material vinculado a una empresa necesita autorización S24 antes de publicarse.",
        422,
      );

    if (input.listOnCv && !publicationReviewEnabled()) throw new ScopedSharingError("La publicación en el CV no está disponible.", 409);
    if (input.workCase && (!publicationReviewEnabled() || process.env.TERRAQO_WORK_CASES_V1 !== "true"))
      throw new ScopedSharingError("La publicación de trabajos agrupados no está disponible.", 409);
    let snapshot;
    if (publicationReviewEnabled()) {
      try { snapshot = await preparePublicationProjection(tx, collection.id, input.expectedVersion, input.workCase, input.listOnCv); }
      catch (error) { if (error instanceof PublicationReviewError) throw new ScopedSharingError(error.message, error.status); throw error; }
    }
    const policyVersion = snapshot ? PUBLICATION_PROJECTION_POLICY : "public-selection-v1";
    const projection = await tx.terraqoPublicProjection.upsert({
      where: { collectionId: collection.id },
      create: {
        collectionId: collection.id,
        slug: randomBytes(18).toString("base64url"),
        policyVersion,
        ...(snapshot ? { snapshot } : {}),
      },
      update: { revokedAt: null, publishedAt: new Date(), policyVersion, ...(snapshot ? { snapshot, id: `c${randomBytes(12).toString("hex")}`, slug: randomBytes(18).toString("base64url") } : {}) },
      select: { id: true, slug: true, policyVersion: true, publishedAt: true, revokedAt: true },
    });
    await tx.terraqoShareCollection.update({
      where: { id: collection.id },
      data: { version: { increment: 1 }, lifecycle: "ACTIVE" },
    });
    return projection;
  }, { isolationLevel: "Serializable" });
}

export async function revokeCollectionProjection(input: {
  userId: string;
  collectionId: string;
  expectedVersion: number;
}) {
  return prisma.$transaction(async (tx) => {
    const collection = await tx.terraqoShareCollection.findFirst({
      where: { id: input.collectionId, createdById: input.userId, lifecycle: { not: "ARCHIVED" } },
      select: { id: true },
    });
    if (!collection) throw new ScopedSharingError("Selección no disponible.", 404);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoShareCollection" WHERE id=${collection.id} FOR UPDATE`);
    const locked = await tx.terraqoShareCollection.findUnique({ where: { id: collection.id }, select: { version: true } });
    if (!locked || locked.version !== input.expectedVersion)
      throw new ScopedSharingError("La selección cambió en otra sesión. Recarga antes de revocar.", 409);
    const changed = await tx.terraqoPublicProjection.updateMany({
      where: { collectionId: collection.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!changed.count) throw new ScopedSharingError("La proyección ya no está publicada.", 409);
    await tx.terraqoShareCollection.update({ where: { id: collection.id }, data: { version: { increment: 1 } } });
    return { revoked: true };
  }, { isolationLevel: "Serializable" });
}

export async function getPublicCollectionProjection(slug: string) {
  const projection = await prisma.terraqoPublicProjection.findFirst({
    where: { slug, ...publicSelectionPolicyWhere() },
    select: {
      id: true,
      policyVersion: true,
      publishedAt: true,
      collection: {
        select: {
          title: true,
          description: true,
          items: {
            orderBy: { sortOrder: "asc" },
            select: {
              allowedFields: true,
              includeMedia: true,
              mediaIds: true,
              revision: {
                select: {
                  title: true,
                  summary: true,
                  outcome: true,
                  contributionRole: true,
                  responsibilities: true,
                  methods: true,
                  tools: true,
                  worklog: {
                    select: {
                      id: true,
                      occurredAt: true,
                      locationLabel: true,
                      media: { where: { contentType: "image/webp" }, select: { id: true }, orderBy: { sortOrder: "asc" } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!projection) throw new ScopedSharingError("Selección no disponible.", 404);
  if (publicationReviewEnabled()) {
    const pinned = (await loadPublicationProjections(prisma, [projection.id])).get(projection.id);
    if (!pinned) throw new ScopedSharingError("Selección no disponible.", 404);
    return { policyVersion: projection.policyVersion, publishedAt: projection.publishedAt,
      title: pinned.title, description: pinned.description,
      items: pinned.items.map(item => ({ worklogId: item.worklogId, ...item.fields,
        ...(item.fields.occurredAt ? { occurredAt: new Date(item.fields.occurredAt) } : {}),
        media: item.mediaIds.map(id => ({ id, href: `/api/v1/public/selections/${encodeURIComponent(slug)}/media/${encodeURIComponent(id)}` })) })) };
  }


  return {
    policyVersion: projection.policyVersion,
    publishedAt: projection.publishedAt,
    title: projection.collection.title,
    description: projection.collection.description,
    items: projection.collection.items.map((item) => {
      const allowed = new Set(item.allowedFields);
      const revision = item.revision;
      return {
        worklogId: revision.worklog.id,
        ...(allowed.has("title") ? { title: revision.title } : {}),
        ...(allowed.has("summary") ? { summary: revision.summary } : {}),
        ...(allowed.has("outcome") ? { outcome: revision.outcome } : {}),
        ...(allowed.has("contributionRole") ? { contributionRole: revision.contributionRole } : {}),
        ...(allowed.has("responsibilities") ? { responsibilities: revision.responsibilities } : {}),
        ...(allowed.has("methods") ? { methods: revision.methods } : {}),
        ...(allowed.has("tools") ? { tools: revision.tools } : {}),
        ...(allowed.has("occurredAt") ? { occurredAt: revision.worklog.occurredAt } : {}),
        ...(allowed.has("locationLabel") ? { locationLabel: revision.worklog.locationLabel } : {}),
        media: item.includeMedia
          ? revision.worklog.media.filter((media) => item.mediaIds.includes(media.id)).map((media) => ({
              id: media.id,
              href: `/api/v1/public/selections/${encodeURIComponent(slug)}/media/${encodeURIComponent(media.id)}`,
            }))
          : [],
      };
    }),
  };
}

// Invitations follow the verified mailbox currently attached to the authenticated account.
export async function selectionGrantForUser(userId: string, collectionId: string, download = false): Promise<Prisma.TerraqoAccessGrantWhereInput> {
  const account = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true } });
  const companyGrantIds = await approvedCompanyGrants(prisma, collectionId);
  return {
    ...(companyGrantIds === null ? {} : { id: { in: companyGrantIds } }),
    lifecycle: "ACTIVE", revokedAt: null, expiresAt: { gt: new Date() },
    scopes: { has: download ? "DOWNLOAD_MEDIA" : "VIEW_COLLECTION" },
    OR: [
      { subjectUserId: userId },
      ...(account?.emailVerified ? [{ subjectUserId: null, inviteEmail: account.email.toLowerCase() }] : []),
    ],
  };
}

export async function getGrantedCollection(input: {
  userId: string;
  collectionId: string;
}) {
  const activeGrant = await selectionGrantForUser(input.userId, input.collectionId);
  const collection = await prisma.terraqoShareCollection.findFirst({
    where: {
      id: input.collectionId,
      lifecycle: { not: "ARCHIVED" },
      grants: { some: activeGrant },
    },
    select: {
      title: true,
      description: true,
      grants: {
        where: activeGrant,
        select: { scopes: true, expiresAt: true },
        orderBy: { expiresAt: "asc" },
      },
      items: {
        where: { revision: { worklog: { deletedAt: null } } },
        orderBy: { sortOrder: "asc" },
        select: {
          allowedFields: true,
          includeMedia: true,
          mediaIds: true,
          revision: {
            select: {
              title: true,
              summary: true,
              outcome: true,
              contributionRole: true,
              responsibilities: true,
              methods: true,
              tools: true,
              worklog: {
                select: {
                  id: true,
                  occurredAt: true,
                  locationLabel: true,
                  media: { where: { contentType: "image/webp" }, select: { id: true }, orderBy: { sortOrder: "asc" } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!collection || !collection.grants[0])
    throw new ScopedSharingError("Selección no disponible.", 404);
  const grant = collection.grants[0];
  const canDownload = collection.grants.some(active => active.scopes.includes("DOWNLOAD_MEDIA"));
  return {
    title: collection.title,
    description: collection.description,
    expiresAt: grant.expiresAt,
    capabilities: { downloadMedia: canDownload },
    items: collection.items.map((item) => {
      const allowed = new Set(item.allowedFields);
      const revision = item.revision;
      return {
        worklogId: revision.worklog.id,
        ...(allowed.has("title") ? { title: revision.title } : {}),
        ...(allowed.has("summary") ? { summary: revision.summary } : {}),
        ...(allowed.has("outcome") ? { outcome: revision.outcome } : {}),
        ...(allowed.has("contributionRole") ? { contributionRole: revision.contributionRole } : {}),
        ...(allowed.has("responsibilities") ? { responsibilities: revision.responsibilities } : {}),
        ...(allowed.has("methods") ? { methods: revision.methods } : {}),
        ...(allowed.has("tools") ? { tools: revision.tools } : {}),
        ...(allowed.has("occurredAt") ? { occurredAt: revision.worklog.occurredAt } : {}),
        ...(allowed.has("locationLabel") ? { locationLabel: revision.worklog.locationLabel } : {}),
        media: item.includeMedia
          ? revision.worklog.media.filter((media) => item.mediaIds.includes(media.id)).map((media) => ({
              id: media.id,
              href: `/api/v1/shared-selections/${encodeURIComponent(input.collectionId)}/media/${encodeURIComponent(media.id)}`,
              downloadHref: canDownload
                ? `/api/v1/shared-selections/${encodeURIComponent(input.collectionId)}/media/${encodeURIComponent(media.id)}?download=1`
                : null,
            }))
          : [],
      };
    }),
  };
}
