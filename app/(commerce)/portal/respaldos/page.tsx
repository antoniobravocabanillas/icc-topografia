import { notFound } from "next/navigation";
import { EndorsementConsole } from "@/components/terraqo/endorsement-console";
import { PortalPageHeading } from "@/components/terraqo/portal-page-heading";
import { prisma } from "@/lib/prisma";
import { listEndorsementRequests } from "@/lib/terraqo/scoped-endorsement";
import { requireProfessionalPortal } from "@/lib/terraqo/professional-portal";

export const dynamic = "force-dynamic";

export default async function EndorsementsPage() {
  if (process.env.TERRAQO_SCOPED_ENDORSEMENTS_V1 !== "true") notFound();
  const { session, profile } = await requireProfessionalPortal();
  const [revisions, requests] = await Promise.all([
    prisma.terraqoWorklogRevision.findMany({
      where: { worklog: { professionalProfileId: profile.id, authorId: session.user.id, deletedAt: null } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 80,
      select: { id: true, title: true, summary: true, revisionNo: true, contentHash: true, worklog: { select: { occurredAt: true } } },
    }),
    listEndorsementRequests(session.user.id, profile.user.email),
  ]);
  return <div className="space-y-8"><PortalPageHeading eyebrow="Confianza verificable" title="Respaldos profesionales" description="Solicita confirmaciones sobre aspectos concretos de una versión. El revisor no puede ampliar el alcance ni modificar tu evidencia." /><EndorsementConsole currentUserId={session.user.id} revisions={revisions.map((revision) => ({ id: revision.id, title: revision.title, summary: revision.summary, revisionNo: revision.revisionNo, contentHash: revision.contentHash, occurredAt: revision.worklog.occurredAt.toISOString() }))} requests={requests.map((request) => ({ ...request, expiresAt: request.expiresAt.toISOString(), sentAt: request.sentAt?.toISOString() || null, createdAt: request.createdAt.toISOString(), updatedAt: request.updatedAt.toISOString(), revision: { ...request.revision, createdAt: request.revision.createdAt.toISOString(), worklog: { ...request.revision.worklog, occurredAt: request.revision.worklog.occurredAt?.toISOString() } }, decisions: request.decisions.map((decision) => ({ ...decision, decidedAt: decision.decidedAt.toISOString() })) }))} /></div>;
}
