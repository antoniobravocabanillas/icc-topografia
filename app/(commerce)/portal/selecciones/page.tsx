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
        worklog: { select: { occurredAt: true, locationLabel: true, media: { select: { id: true } } } },
      },
    }),
    listShareCollections(session.user.id),
  ]);

  return (
    <div className="space-y-8">
      <PortalPageHeading eyebrow="Privacidad y alcance" title="Selecciones compartidas" description="Construye una vista precisa de tu trayectoria, decide campo por campo y revoca el acceso cuando quieras. Una selección nace privada." />
      <ScopedSharingConsole
        candidates={revisions.map((revision) => ({ revisionId: revision.id, title: revision.title, summary: revision.summary, occurredAt: revision.worklog.occurredAt.toISOString(), locationLabel: revision.worklog.locationLabel, mediaCount: revision.worklog.media.length }))}
        collections={collections.map((collection) => ({
          id: collection.id,
          title: collection.title,
          description: collection.description,
          version: collection.version,
          items: collection.items.map((item) => ({ id: item.id, allowedFields: item.allowedFields, includeMedia: item.includeMedia, revision: { title: item.revision.title, worklog: { media: item.revision.worklog.media } } })),
          grants: collection.grants.map((grant) => ({ ...grant, expiresAt: grant.expiresAt.toISOString(), createdAt: grant.createdAt.toISOString(), revokedAt: grant.revokedAt?.toISOString() || null })),
          publicProjection: collection.publicProjection ? { ...collection.publicProjection, publishedAt: collection.publicProjection.publishedAt.toISOString(), revokedAt: collection.publicProjection.revokedAt?.toISOString() || null } : null,
        }))}
      />
    </div>
  );
}
