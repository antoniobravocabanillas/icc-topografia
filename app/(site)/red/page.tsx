import type { Metadata } from "next";
import { PublicNetworkDirectory } from "@/components/terraqo/public-network-directory";
import { prisma } from "@/lib/prisma";
import { safeDb } from "@/lib/server/safe-db";
import { createMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = createMetadata({
  title: "Red operativa",
  description: "Encuentra profesionales con perfiles públicos, experiencia y capacidades visibles en Terraqo.",
  path: "/red"
});

export default async function PublicNetworkPage() {
  const profiles = await safeDb(
    "public operational network",
    prisma.terraqoProfessionalProfile.findMany({
      where: {
        username: { not: null },
        liveCvEnabled: true,
        friendDiscoveryEnabled: true
      },
      select: {
        id: true,
        username: true,
        headline: true,
        bio: true,
        city: true,
        locationCity: true,
        country: true,
        status: true,
        yearsExperience: true,
        professionalCategories: true,
        specialties: true,
        identityVerificationStatus: true,
        updatedAt: true,
        user: { select: { name: true, image: true, lastSeenAt: true, onlineUntil: true } },
        experiences: {
          where: { OR: [{ verifiedByTerraqo: true }, { visibility: "PUBLIC" }] },
          select: { id: true, verifiedByTerraqo: true },
          take: 20
        },
        affiliations: {
          where: { visibility: "PUBLIC", verificationStatus: "VERIFIED", current: true },
          select: { companyName: true, roleTitle: true },
          orderBy: { updatedAt: "desc" },
          take: 1
        }
      },
      orderBy: [{ identityVerificationStatus: "asc" }, { updatedAt: "desc" }],
      take: 180
    }),
    []
  );

  return (
    <PublicNetworkDirectory
      profiles={profiles.map((profile) => ({
        id: profile.id,
        username: profile.username as string,
        name: profile.user.name || profile.username || "Profesional Terraqo",
        image: profile.user.image,
        headline: profile.headline,
        bio: profile.bio,
        location: profile.locationCity || profile.city,
        country: profile.country,
        status: profile.status,
        yearsExperience: profile.yearsExperience,
        categories: profile.professionalCategories,
        specialties: profile.specialties,
        verified: profile.identityVerificationStatus === "VERIFIED",
        visibleExperiences: profile.experiences.length,
        verifiedExperiences: profile.experiences.filter((experience) => experience.verifiedByTerraqo).length,
        companyName: profile.affiliations[0]?.companyName || null,
        roleTitle: profile.affiliations[0]?.roleTitle || null,
        lastSeenAt: profile.user.lastSeenAt?.toISOString() || null,
        onlineUntil: profile.user.onlineUntil?.toISOString() || null,
        updatedAt: profile.updatedAt.toISOString()
      }))}
    />
  );
}
