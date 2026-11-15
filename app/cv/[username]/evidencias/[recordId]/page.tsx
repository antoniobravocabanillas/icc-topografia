import { PublicWorkCaseView } from "@/components/terraqo/public-cv-work-cases";
import { publicWorkCase } from "@/lib/terraqo/public-work-case";
import { cache } from "react";
import { notFound } from "next/navigation";
import { PublicCVSectionPage } from "@/components/terraqo/public-cv";
import {
  publicCvArchiveProfileSelect as publicCvProfileSelect,
  redactPrivateProjects, publishedCvProfileWhere,
} from "@/lib/terraqo/public-cv";
import { prisma } from "@/lib/prisma";
import { createMetadata } from "@/lib/seo";
type PublicEvidencePermalinkProps = {
  searchParams: Promise<{ trabajo?: string | string[]; revision?: string | string[] }>;
  params: Promise<{ username: string; recordId: string }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Metadata and HTML share the same authorized read for this request.
const loadPublicEvidence = cache(async (username: string, recordId: string) => {
  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: publishedCvProfileWhere(username),
    select: {
      ...publicCvProfileSelect,
      worklogs: {
        ...publicCvProfileSelect.worklogs,
        where: { ...publicCvProfileSelect.worklogs.where, id: recordId },
        take: 1,
      },
    },
  });
  const record = profile?.worklogs[0];
  return profile && record ? { profile, record } : null;
});

export async function generateMetadata({ params, searchParams }: PublicEvidencePermalinkProps) {
  const { username, recordId } = await params;
  const context = await searchParams;
  // A scoped link must never generate metadata from the unrestricted record.
  if (context.trabajo !== undefined || context.revision !== undefined)
    return { title: "Bitácora compartida", robots: { index: false } };
  const result = await loadPublicEvidence(username, recordId);
  if (!result) {
    return createMetadata({
      title: "Evidencia no disponible",
      description: "El registro solicitado no esta disponible publicamente.",
      path: `/cv/${username}/evidencias`,
    });
  }

  return createMetadata({
    title: `${result.record.title} | Trabajo documentado`,
    description: result.record.summary,
    path: `/cv/${username}/evidencias/${recordId}`,
  });
}

export default async function PublicEvidencePermalink({
  params, searchParams,
}: PublicEvidencePermalinkProps) {
  const { username, recordId } = await params;
  const { trabajo, revision } = await searchParams;
  if (trabajo !== undefined || revision !== undefined) {
    if (typeof trabajo !== "string" || !trabajo || typeof revision !== "string" || !revision) notFound();
    const work = await publicWorkCase(username, trabajo);
    const item = work?.items.find(row => row.worklogId === recordId && row.revisionId === revision);
    if (!work || !item) notFound();
    return <PublicWorkCaseView username={username} work={work} selected={item} />;
  }
  const result = await loadPublicEvidence(username, recordId);
  if (!result) notFound();

  return (
    <PublicCVSectionPage
      profile={redactPrivateProjects(result.profile)}
      section="evidencias"
      initialRecordId={recordId}
    />
  );
}
