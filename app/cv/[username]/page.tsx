import { notFound } from "next/navigation";
import { PublicCVPage } from "@/components/terraqo/public-cv";
import { publicCvProfileInclude } from "@/lib/terraqo/public-cv";
import { prisma } from "@/lib/prisma";
import { createMetadata } from "@/lib/seo";

type PublicCvPageProps = {
  params: Promise<{ username: string }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }: PublicCvPageProps) {
  const { username } = await params;
  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { username },
    select: {
      headline: true,
      bio: true,
      user: { select: { name: true } }
    }
  });

  if (!profile) {
    return createMetadata({
      title: "CV Vivo Terraqo",
      description: "Perfil profesional verificable en Terraqo.",
      path: `/cv/${username}`
    });
  }

  return createMetadata({
    title: `${profile.user.name || username} | CV Vivo Terraqo`,
    description: profile.bio || profile.headline || "Perfil profesional verificable con evidencia, documentos y experiencia viva.",
    path: `/cv/${username}`
  });
}

export default async function PublicCvRoute({ params }: PublicCvPageProps) {
  const { username } = await params;
  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { username },
    include: publicCvProfileInclude
  });

  if (!profile) notFound();

  return <PublicCVPage profile={profile} />;
}
