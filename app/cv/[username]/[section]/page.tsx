import { notFound } from "next/navigation";
import { PublicCVSectionPage, isPublicCvSection } from "@/components/terraqo/public-cv";
import { publicCvProfileInclude } from "@/lib/terraqo/public-cv";
import { prisma } from "@/lib/prisma";
import { createMetadata } from "@/lib/seo";

type PublicCvSectionPageProps = {
  params: Promise<{ username: string; section: string }>;
};

const SECTION_TITLE: Record<string, string> = {
  experiencias: "Experiencias",
  proyectos: "Proyectos",
  evidencias: "Evidencias",
  capacidades: "Capacidades",
  documentos: "Documentos"
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }: PublicCvSectionPageProps) {
  const { username, section } = await params;
  if (!isPublicCvSection(section)) {
    return createMetadata({
      title: "CV Vivo Terraqo",
      description: "Perfil profesional verificable en Terraqo.",
      path: `/cv/${username}`
    });
  }

  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { username },
    select: {
      headline: true,
      user: { select: { name: true } }
    }
  });

  return createMetadata({
    title: `${SECTION_TITLE[section]} de ${profile?.user.name || username} | CV Vivo Terraqo`,
    description: profile?.headline || "Sección pública extendida del CV vivo Terraqo.",
    path: `/cv/${username}/${section}`
  });
}

export default async function PublicCvSectionRoute({ params }: PublicCvSectionPageProps) {
  const { username, section } = await params;
  if (!isPublicCvSection(section)) notFound();

  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { username },
    include: publicCvProfileInclude
  });

  if (!profile) notFound();

  return <PublicCVSectionPage profile={profile} section={section} />;
}
