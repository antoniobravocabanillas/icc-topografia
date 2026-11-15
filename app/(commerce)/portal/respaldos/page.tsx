import { notFound } from "next/navigation";
import { EndorsementConsole } from "@/components/terraqo/endorsement-console";
import { prisma } from "@/lib/prisma";
import { listEndorsementRequests } from "@/lib/terraqo/scoped-endorsement";
import { requireProfessionalPortal } from "@/lib/terraqo/professional-portal";

export const dynamic = "force-dynamic";

export default async function EndorsementsPage({
  searchParams,
}: {
  searchParams: Promise<{ registro?: string }>;
}) {
  if (process.env.TERRAQO_SCOPED_ENDORSEMENTS_V1 !== "true") notFound();
  const { session, profile } = await requireProfessionalPortal();
  const { registro } = await searchParams;
  const [revisions, requests] = await Promise.all([
    prisma.terraqoWorklogRevision.findMany({
      where: {
        ...(typeof registro === "string" ? { worklogId: registro } : {}),
        worklog: {
          professionalProfileId: profile.id,
          authorId: session.user.id,
          deletedAt: null,
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 80,
      select: {
        id: true,
        title: true,
        summary: true,
        revisionNo: true,
        contentHash: true,
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
            currentRevisionId: true,
            media: {
              where: { contentType: "image/webp" },
              orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
              take: 1,
              select: { id: true },
            },
          },
        },
      },
    }),
    listEndorsementRequests(session.user.id),
  ]);
  return (
    <EndorsementConsole
      initialRevisionId={registro ? revisions[0]?.id : undefined}
      currentUserId={session.user.id}
      revisions={revisions.map((revision) => ({
        ...revision,
        thumbnailMediaId:
          revision.id === revision.worklog.currentRevisionId
            ? revision.worklog.media[0]?.id
            : undefined,
        worklog: {
          id: revision.worklog.id,
          locationLabel: revision.worklog.locationLabel,
          occurredAt: revision.worklog.occurredAt.toISOString(),
        },
      }))}
      requests={requests.map((request) => ({
        ...request,
        expiresAt: request.expiresAt.toISOString(),
        sentAt: request.sentAt?.toISOString() || null,
        createdAt: request.createdAt.toISOString(),
        updatedAt: request.updatedAt.toISOString(),
        revision: {
          ...request.revision,
          createdAt: request.revision.createdAt.toISOString(),
          worklog: {
            ...request.revision.worklog,
            occurredAt: request.revision.worklog.occurredAt?.toISOString(),
          },
        },
        decisions: request.decisions.map((decision) => ({
          ...decision,
          decidedAt: decision.decidedAt.toISOString(),
        })),
      }))}
    />
  );
}
