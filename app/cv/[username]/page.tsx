import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicCVPage } from "@/components/terraqo/public-cv";
import { publicCvProfileInclude } from "@/lib/terraqo/public-cv";
import { getPublicCvSeoProfile, publicCvJsonLd, publicCvSeoFacts } from "@/lib/terraqo/public-cv-seo";
import { prisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/utils";

type PublicCvPageProps = {
  params: Promise<{ username: string }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }: PublicCvPageProps): Promise<Metadata> {
  const { username } = await params;
  const profile = await getPublicCvSeoProfile(username);
  const canonical = absoluteUrl(`/cv/${username}`);

  if (!profile) {
    return {
      title: { absolute: "CV Vivo | Terraqo" },
      description: "Perfil profesional verificable en Terraqo.",
      alternates: { canonical },
      robots: { index: false, follow: false }
    };
  }

  const facts = publicCvSeoFacts(profile, username);
  const socialImage = absoluteUrl(`/cv/${username}/opengraph-image?v=${profile.updatedAt.getTime()}`);
  const title = `${facts.name} — ${facts.headline} | Terraqo`;
  const nameParts = facts.name.split(/\s+/).filter(Boolean);

  return {
    title: { absolute: title },
    description: facts.description,
    applicationName: "Terraqo CV Vivo",
    authors: [{ name: facts.name, url: canonical }],
    creator: facts.name,
    publisher: "Terraqo",
    category: "Perfil profesional verificable",
    keywords: [
      facts.name,
      facts.headline,
      "CV Vivo",
      "CV profesional verificable",
      "perfil profesional",
      "Terraqo",
      facts.location,
      ...facts.skills
    ].filter((keyword): keyword is string => Boolean(keyword)),
    alternates: { canonical },
    robots: facts.isPublic
      ? { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } }
      : { index: false, follow: false },
    openGraph: {
      type: "profile",
      url: canonical,
      siteName: "Terraqo",
      locale: "es_PE",
      title: `El trabajo de ${facts.name}, demostrado.`,
      description: facts.description,
      firstName: nameParts[0],
      lastName: nameParts.slice(1).join(" ") || undefined,
      username,
      images: [{ url: socialImage, width: 1200, height: 630, type: "image/png", alt: `CV Vivo de ${facts.name}: ${facts.headline}` }]
    },
    twitter: {
      card: "summary_large_image",
      title: `${facts.name} | CV Vivo Terraqo`,
      description: facts.description,
      images: [{ url: socialImage, width: 1200, height: 630, alt: `CV Vivo de ${facts.name}` }]
    },
    other: {
      "profile:username": username,
      "terraqo:profile_status": facts.status,
      "terraqo:verified_experiences": String(facts.verifiedExperiences)
    }
  };
}

export default async function PublicCvRoute({ params }: PublicCvPageProps) {
  const { username } = await params;
  const [profile, seoProfile] = await Promise.all([
    prisma.terraqoProfessionalProfile.findUnique({
      where: { username },
      include: publicCvProfileInclude
    }),
    getPublicCvSeoProfile(username)
  ]);

  if (!profile) notFound();

  const canonical = absoluteUrl(`/cv/${username}`);
  const jsonLd = seoProfile ? publicCvJsonLd(seoProfile, username, canonical) : null;

  return (
    <>
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />
      ) : null}
      <PublicCVPage profile={profile} />
    </>
  );
}
