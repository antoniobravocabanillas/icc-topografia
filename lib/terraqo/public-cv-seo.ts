import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeDb } from "@/lib/server/safe-db";
import { formatExperienceDuration, monthsBetween, normalizeSpanishCopy } from "@/lib/terraqo/profile-summary";

const publicCvSeoProfileSelect = {
  username: true,
  headline: true,
  bio: true,
  city: true,
  country: true,
  locationCity: true,
  status: true,
  liveCvEnabled: true,
  liveCvVisibility: true,
  identityVerificationStatus: true,
  professionalCategories: true,
  specialties: true,
  software: true,
  updatedAt: true,
  user: { select: { name: true, image: true } },
  experiences: {
    where: { visibility: "PUBLIC" },
    select: {
      title: true,
      role: true,
      companyName: true,
      startedAt: true,
      endedAt: true,
      currentlyWorking: true,
      verifiedByTerraqo: true,
      verificationStatus: true,
      projectId: true
    },
    orderBy: [{ currentlyWorking: "desc" }, { startedAt: "desc" }],
    take: 50
  },
  education: {
    where: { visibility: "PUBLIC" },
    select: { institution: true, degree: true },
    orderBy: [{ currentlyStudying: "desc" }, { startedAt: "desc" }],
    take: 12
  },
  socialLinks: {
    where: { visibility: "PUBLIC" },
    select: { url: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    take: 12
  },
  documents: {
    select: { reviewStatus: true }
  },
  worklogs: {
    where: { visibility: "PUBLIC", deletedAt: null },
    select: {
      projectId: true,
      evidenceStatus: true,
      validations: {
        where: { status: "APPROVED" },
        select: { id: true },
        take: 1
      }
    },
    take: 80
  }
} satisfies Prisma.TerraqoProfessionalProfileSelect;

export type PublicCvSeoProfile = Prisma.TerraqoProfessionalProfileGetPayload<{
  select: typeof publicCvSeoProfileSelect;
}>;

export const getPublicCvSeoProfile = cache(async (username: string) =>
  safeDb(
    `public-cv-seo:${username}`,
    prisma.terraqoProfessionalProfile.findUnique({
      where: { username },
      select: publicCvSeoProfileSelect
    }),
    null
  )
);

const STATUS_COPY: Record<string, string> = {
  AVAILABLE: "Disponible ahora",
  WORKING: "Trabajando",
  OPEN_TO_PROJECTS: "Disponible para proyectos",
  NOT_AVAILABLE: "No disponible"
};

function countryName(country?: string | null) {
  const value = country?.trim();
  if (!value) return null;
  if (value.length !== 2) return normalizeSpanishCopy(value) || value;
  try {
    return new Intl.DisplayNames(["es"], { type: "region" }).of(value.toUpperCase()) || value.toUpperCase();
  } catch {
    return value.toUpperCase();
  }
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => normalizeSpanishCopy(value)?.trim()).filter((value): value is string => Boolean(value))));
}

function trimAtWord(text: string, limit: number) {
  if (text.length <= limit) return text;
  const clipped = text.slice(0, limit + 1);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, Math.max(lastSpace, Math.floor(limit * 0.72))).trim()}…`;
}

export function publicCvSeoFacts(profile: PublicCvSeoProfile, fallbackUsername: string) {
  const name = normalizeSpanishCopy(profile.user.name) || fallbackUsername;
  const currentExperience = profile.experiences.find((experience) => experience.currentlyWorking) || profile.experiences[0];
  const inferredHeadline = currentExperience
    ? `${normalizeSpanishCopy(currentExperience.role || currentExperience.title) || "Profesional"}${currentExperience.companyName ? ` - ${normalizeSpanishCopy(currentExperience.companyName) || currentExperience.companyName}` : ""}`
    : "Profesional Terraqo";
  const headline = normalizeSpanishCopy(profile.headline) || inferredHeadline;
  const totalMonths = profile.experiences.reduce(
    (total, experience) => total + monthsBetween(experience.startedAt, experience.currentlyWorking ? null : experience.endedAt),
    0
  );
  const verifiedExperiences = profile.experiences.filter(
    (experience) => experience.verifiedByTerraqo || experience.verificationStatus === "APPROVED"
  ).length;
  const verifiedPercent = profile.experiences.length
    ? Math.round((verifiedExperiences / profile.experiences.length) * 100)
    : 0;
  const verifiedDocuments = profile.documents.filter((document) => document.reviewStatus === "VERIFIED").length;
  const verifiedActivity = profile.worklogs.filter(
    (worklog) => worklog.evidenceStatus === "VERIFIED" || worklog.validations.length > 0
  ).length;
  const completedTrustAreas = [
    profile.identityVerificationStatus === "VERIFIED",
    verifiedDocuments > 0,
    verifiedExperiences > 0,
    verifiedActivity > 0
  ].filter(Boolean).length;
  const trustScore = Math.round((completedTrustAreas / 4) * 100);
  const projects = new Set(
    [...profile.experiences.map((experience) => experience.projectId), ...profile.worklogs.map((worklog) => worklog.projectId)].filter(Boolean)
  ).size;
  const location = unique([profile.locationCity || profile.city, countryName(profile.country)]).join(", ");
  const skills = unique([...profile.specialties, ...profile.professionalCategories, ...profile.software]).slice(0, 6);
  const summary = trimAtWord(
    normalizeSpanishCopy(profile.bio) || `${headline} con trayectoria profesional documentada en Terraqo.`,
    230
  );
  const duration = totalMonths ? formatExperienceDuration(totalMonths) : "Trayectoria en construcción";
  const description = trimAtWord(
    `CV Vivo de ${name}: ${headline}. ${duration} de experiencia${verifiedExperiences ? ` y ${verifiedExperiences} ${verifiedExperiences === 1 ? "experiencia validada" : "experiencias validadas"}` : ""} en Terraqo.`,
    158
  );
  // `liveCvEnabled` is the publication switch used by the current public route.
  // Visibility scopes the amount of detail exposed inside the CV, but must not
  // suppress the discoverability of a CV that its owner explicitly published.
  const isPublic = profile.liveCvEnabled;

  return {
    name,
    headline,
    summary,
    description,
    duration,
    totalMonths,
    verifiedExperiences,
    verifiedPercent,
    verifiedDocuments,
    trustScore,
    completedTrustAreas,
    projects,
    location,
    skills,
    status: STATUS_COPY[profile.status] || "Perfil activo",
    isPublic
  };
}

export function publicCvJsonLd(profile: PublicCvSeoProfile, username: string, canonicalUrl: string) {
  const facts = publicCvSeoFacts(profile, username);
  const personId = `${canonicalUrl}#person`;
  const currentExperience = profile.experiences.find((experience) => experience.currentlyWorking) || profile.experiences[0];
  const image = profile.user.image
    ? new URL(profile.user.image, canonicalUrl).toString()
    : undefined;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ProfilePage",
        "@id": canonicalUrl,
        url: canonicalUrl,
        name: `${facts.name} | CV Vivo Terraqo`,
        description: facts.description,
        dateModified: profile.updatedAt.toISOString(),
        mainEntity: { "@id": personId },
        isPartOf: { "@type": "WebSite", name: "Terraqo", url: new URL("/", canonicalUrl).toString() }
      },
      {
        "@type": "Person",
        "@id": personId,
        name: facts.name,
        url: canonicalUrl,
        ...(image ? { image } : {}),
        jobTitle: facts.headline,
        description: facts.summary,
        ...(facts.location ? { homeLocation: { "@type": "Place", name: facts.location } } : {}),
        ...(facts.skills.length ? { knowsAbout: facts.skills } : {}),
        ...(profile.socialLinks.length ? { sameAs: profile.socialLinks.map((link) => link.url) } : {}),
        ...(profile.education.length
          ? { alumniOf: profile.education.map((education) => ({ "@type": "EducationalOrganization", name: education.institution })) }
          : {}),
        ...(currentExperience?.companyName
          ? { worksFor: { "@type": "Organization", name: currentExperience.companyName } }
          : {})
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Terraqo", item: new URL("/", canonicalUrl).toString() },
          { "@type": "ListItem", position: 2, name: "CV Vivo", item: new URL("/cv", canonicalUrl).toString() },
          { "@type": "ListItem", position: 3, name: facts.name, item: canonicalUrl }
        ]
      }
    ]
  };
}
