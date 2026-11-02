import { notFound } from "next/navigation";
import { PublicCVSectionPage } from "@/components/terraqo/public-cv";
import {
  publicCvArchiveProfileInclude as publicCvProfileInclude,
  publishedCvProfileWhere,
} from "@/lib/terraqo/public-cv";
import { prisma } from "@/lib/prisma";
import { createMetadata } from "@/lib/seo";
import {
  resolveEvidenceReadScope,
  scopeEvidenceWhere,
} from "@/lib/terraqo/evidence-policy";

type PublicEvidencePermalinkProps = {
  params: Promise<{ username: string; recordId: string }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadPublicEvidence(username: string, recordId: string) {
  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: publishedCvProfileWhere(username),
    include: publicCvProfileInclude,
  });
  if (!profile) return null;

  const included = profile.worklogs.find((worklog) => worklog.id === recordId);
  if (included) return { profile, record: included };

  const scope = await resolveEvidenceReadScope({
    professionalProfileId: profile.id,
  });
  if (!scope) return null;
  const record = await prisma.terraqoWorklogEntry.findFirst({
    where: scopeEvidenceWhere(scope, { id: recordId }),
    include: publicCvProfileInclude.worklogs.include,
  });
  if (!record) return null;

  return {
    profile: { ...profile, worklogs: [record, ...profile.worklogs] },
    record,
  };
}

export async function generateMetadata({ params }: PublicEvidencePermalinkProps) {
  const { username, recordId } = await params;
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
  params,
}: PublicEvidencePermalinkProps) {
  const { username, recordId } = await params;
  const result = await loadPublicEvidence(username, recordId);
  if (!result) notFound();

  return (
    <PublicCVSectionPage
      profile={result.profile}
      section="evidencias"
      initialRecordId={recordId}
    />
  );
}
