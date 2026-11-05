import { SelectionAccessInbox } from "@/components/terraqo/selection-access-inbox";
import { listSelectionAccessRequests, selectionAccessRequestsEnabled } from "@/lib/terraqo/selection-access-request";
import { PublicationReviewConsole } from "@/components/terraqo/publication-review-console";
import { listPublicationReviews, publicationReviewEnabled } from "@/lib/terraqo/publication-review";
import { notFound } from "next/navigation";
import { PortalPageHeading } from "@/components/terraqo/portal-page-heading";
import { ScopedSharingConsole } from "@/components/terraqo/scoped-sharing-console";
import { prisma } from "@/lib/prisma";
import { requireProfessionalPortal } from "@/lib/terraqo/professional-portal";
import { listShareCollections } from "@/lib/terraqo/scoped-sharing";

export const dynamic = "force-dynamic";

export default async function SelectionsPage() {
  if (process.env.TERRAQO_SCOPED_SHARING_V1 !== "true") notFound();
  const { session, profile } = await requireProfessionalPortal();
  const [revisions, collections] = await Promise.all([
    prisma.terraqoWorklogRevision.findMany({
      where: { worklog: { professionalProfileId: profile.id, authorId: session.user.id, deletedAt: null } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 80,
      select: {
        id: true,
        title: true,
        summary: true,
        outcome: true,
        contributionRole: true,
        responsibilities: true,
        methods: true,
        tools: true,
        worklog: { select: { occurredAt: true, locationLabel: true, media: { select: { id: true } } } },
      },
    }),
    listShareCollections(session.user.id),
  ]);

  const selectedIds = [...new Set(collections.flatMap(collection => collection.items.map(item => item.revision.worklog.id)))];
  const links = publicationReviewEnabled() && process.env.TERRAQO_WORK_CASES_V1 === "true" && selectedIds.length
    ? await prisma.terraqoWorkCaseRecord.findMany({
      where: { worklogId: { in: selectedIds }, relationshipStatus: "CONFIRMED",
        worklog: { deletedAt: null, lifecycle: "PUBLISHED", professionalProfileId: profile.id },
        workCase: { professionalProfileId: profile.id, lifecycle: "ACTIVE", archivedAt: null } },
      select: { worklogId: true, workCase: { select: { id: true, version: true, title: true } } },
    }) : [];
  const groupByRecord = new Map(links.map(link => [link.worklogId, link.workCase]));
  function caseOffer(recordIds: string[]) {
    const group = groupByRecord.get(recordIds[0]);
    return group && new Set(recordIds).size >= 2 && recordIds.every(id => groupByRecord.get(id)?.id === group.id)
      ? group : undefined;
  }

  const accessRequests = selectionAccessRequestsEnabled() ? await listSelectionAccessRequests(session.user.id) : [];
  const reviews = publicationReviewEnabled() ? (await listPublicationReviews(session.user.id)).filter(review => review.requestedByMe) : [];
  return (
    <div className="space-y-8">
      <PortalPageHeading eyebrow="Privacidad y alcance" title="Selecciones compartidas" description="Construye una vista precisa de tu trayectoria, decide campo por campo y revoca el acceso cuando quieras. Una selección nace privada." />
      {selectionAccessRequestsEnabled() ? <SelectionAccessInbox requests={accessRequests} /> : null}
      <ScopedSharingConsole
        publicationReviewEnabled={publicationReviewEnabled()}
        candidates={revisions.map((revision) => ({ revisionId: revision.id, title: revision.title, summary: revision.summary, outcome: revision.outcome, contributionRole: revision.contributionRole, responsibilities: revision.responsibilities, methods: revision.methods, tools: revision.tools, occurredAt: revision.worklog.occurredAt.toISOString(), locationLabel: revision.worklog.locationLabel, mediaCount: revision.worklog.media.length }))}
        collections={collections.map((collection) => ({
          id: collection.id,
          title: collection.title,
          caseOffer: caseOffer(collection.items.map(item => item.revision.worklog.id)),
          description: collection.description,
          version: collection.version,
          items: collection.items.map((item) => ({ id: item.id, allowedFields: item.allowedFields, includeMedia: item.includeMedia, revision: { title: item.revision.title, worklog: { workspaceId: item.revision.worklog.workspaceId, media: item.revision.worklog.media } } })),
          grants: collection.grants.map((grant) => ({ ...grant, expiresAt: grant.expiresAt.toISOString(), createdAt: grant.createdAt.toISOString(), revokedAt: grant.revokedAt?.toISOString() || null })),
          publicProjection: collection.publicProjection ? { ...collection.publicProjection, publishedAt: collection.publicProjection.publishedAt.toISOString(), revokedAt: collection.publicProjection.revokedAt?.toISOString() || null } : null,
        }))}
      />
      {publicationReviewEnabled() ? <PublicationReviewConsole reviews={reviews.map(review => ({ ...review, revokedAt: review.revokedAt?.toISOString() || null }))} /> : null}
    </div>
  );
}
