import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { TerraqoMemberRole, TerraqoMessagePrivacy, TerraqoVisibility } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCountryName, getSubdivisionName } from "@/lib/locations";
import { monthsBetween, refreshProfessionalGeneratedSummary } from "@/lib/terraqo/profile-summary";

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,29}$/;
const RESERVED_USERNAMES = new Set([
  "admin",
  "api",
  "app",
  "cuenta",
  "cv",
  "portal",
  "soporte",
  "terraqo",
  "terraqoglobal",
  "www"
]);
const WORKSPACE_VALIDATOR_ROLES: TerraqoMemberRole[] = ["OWNER", "ADMIN", "MANAGER"];

export async function updateProfessionalUsernameAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user?.id) redirect("/cuenta");

  const rawUsername = String(formData.get("username") || "").trim().toLowerCase();
  const username = rawUsername.replace(/^@+/, "");
  if (!USERNAME_PATTERN.test(username) || RESERVED_USERNAMES.has(username)) {
    redirect("/portal?status=username-invalid");
  }

  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true }
  });
  if (!profile) redirect("/portal?status=profile-required");

  const taken = await prisma.terraqoProfessionalProfile.findFirst({
    where: { username, NOT: { id: profile.id } },
    select: { id: true }
  });
  if (taken) redirect("/portal?status=username-taken");

  await prisma.terraqoProfessionalProfile.update({
    where: { id: profile.id },
    data: { username, liveCvEnabled: true }
  });

  revalidatePath("/portal");
  revalidatePath(`/cv/${username}`);
  redirect("/portal?success=username");
}

function cleanText(formData: FormData, key: string, max = 180) {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function optionalDate(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function listFromText(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string") return [];
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function longText(formData: FormData, key: string, max = 4000) {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function normalizeLocation(formData: FormData, names = { country: "country", subdivision: "subdivision", city: "city" }) {
  const country = cleanText(formData, names.country, 8) || "PE";
  const subdivision = cleanText(formData, names.subdivision, 24);
  const city = cleanText(formData, names.city, 120);
  const label = [city, getSubdivisionName(country, subdivision), getCountryName(country)].filter(Boolean).join(", ");
  return { country, subdivision, city, label };
}

async function resolveValidator(formData: FormData, fallbackKey: string, workspaceIds: string[]) {
  const validatorUserId = cleanText(formData, "validatorUserId", 80);
  if (validatorUserId) {
    const validator = await prisma.user.findFirst({
      where: {
        id: validatorUserId,
        OR: [
          { role: "SUPER_ADMIN", email: { endsWith: "@terraqoglobal.com" } },
          ...(workspaceIds.length
            ? [
                {
                  terraqoMemberships: {
                    some: {
                      workspaceId: { in: workspaceIds },
                      active: true,
                      role: { in: WORKSPACE_VALIDATOR_ROLES }
                    }
                  }
                }
              ]
            : [])
        ]
      },
      select: { id: true, name: true, email: true }
    });
    if (validator) return { validatorUserId: validator.id, validatorName: validator.name, validatorEmail: validator.email };
  }

  const fallback = cleanText(formData, fallbackKey, 180);
  if (!fallback) return { validatorUserId: null, validatorName: null, validatorEmail: null };
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fallback);
  return { validatorUserId: null, validatorName: isEmail ? null : fallback, validatorEmail: isEmail ? fallback : null };
}

export async function createHistoricalExperienceAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user?.id) redirect("/cuenta");

  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      username: true,
      experiences: { select: { startedAt: true, endedAt: true, currentlyWorking: true } },
      user: { select: { terraqoMemberships: { where: { active: true }, select: { workspaceId: true } } } }
    }
  });
  if (!profile) redirect("/portal?status=profile-required");

  const title = cleanText(formData, "title", 140);
  const companyName = cleanText(formData, "companyName", 140);
  const role = cleanText(formData, "role", 120);
  const location = normalizeLocation(formData);
  const currentlyWorking = formData.get("currentlyWorking") === "on";
  const startedAt = optionalDate(formData, "startedAt");
  const endedAt = currentlyWorking ? null : optionalDate(formData, "endedAt");
  const workspaceIds = profile.user.terraqoMemberships.map((membership) => membership.workspaceId);
  const validator = await resolveValidator(formData, "validatorFallback", workspaceIds);
  const visibilityValues = new Set<TerraqoVisibility>(["PRIVATE", "WORKSPACE", "COMMUNITY", "PUBLIC"]);
  const visibilityInput = String(formData.get("visibility") || "PRIVATE") as TerraqoVisibility;
  if (!title || !companyName) redirect("/portal/experiencias?status=missing");

  const verificationRequested = Boolean(validator.validatorUserId || validator.validatorEmail || validator.validatorName);
  await prisma.terraqoProfessionalExperience.create({
    data: {
      professionalProfileId: profile.id,
      title,
      companyName,
      role,
      summary: longText(formData, "summary", 5000),
      highlights: listFromText(formData, "highlights").slice(0, 16),
      location: location.label || null,
      country: location.country,
      locationSubdivisionCode: location.subdivision,
      locationCity: location.city,
      startedAt,
      endedAt,
      currentlyWorking,
      visibility: visibilityValues.has(visibilityInput) ? visibilityInput : "PRIVATE",
      evidence: listFromText(formData, "evidence"),
      verificationStatus: verificationRequested ? "REQUESTED" : "NOT_REQUESTED",
      verificationRequestedAt: verificationRequested ? new Date() : null,
      validatorUserId: validator.validatorUserId,
      validatorName: validator.validatorName,
      validatorEmail: validator.validatorEmail,
      verificationNote: verificationRequested
        ? `Solicitud de verificacion enviada a ${validator.validatorName || validator.validatorEmail || "responsable seleccionado"}.`
        : "Experiencia historica cargada por el profesional. Pendiente de solicitar verificacion."
    }
  });

  const totalMonths = [...profile.experiences, { startedAt, endedAt, currentlyWorking }].reduce((sum, item) => sum + monthsBetween(item.startedAt, item.currentlyWorking ? null : item.endedAt), 0);
  await prisma.terraqoProfessionalProfile.update({
    where: { id: profile.id },
    data: { yearsExperience: Math.floor(totalMonths / 12) }
  });
  await refreshProfessionalGeneratedSummary(profile.id);

  revalidatePath("/portal");
  revalidatePath("/portal/experiencias");
  if (profile.username) revalidatePath(`/cv/${profile.username}`);
  redirect("/portal/experiencias?success=experience");
}

export async function createEducationAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user?.id) redirect("/cuenta");

  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      username: true,
      user: { select: { terraqoMemberships: { where: { active: true }, select: { workspaceId: true } } } }
    }
  });
  if (!profile) redirect("/portal?status=profile-required");

  const institution = cleanText(formData, "institution", 140);
  const degree = cleanText(formData, "degree", 140);
  if (!institution || !degree) redirect("/portal/experiencias?status=education-missing");

  const location = normalizeLocation(formData, { country: "educationCountry", subdivision: "educationSubdivision", city: "educationCity" });
  const currentlyStudying = formData.get("currentlyStudying") === "on";
  const workspaceIds = profile.user.terraqoMemberships.map((membership) => membership.workspaceId);
  const validator = await resolveValidator(formData, "educationValidatorFallback", workspaceIds);
  const verificationRequested = Boolean(validator.validatorUserId || validator.validatorEmail || validator.validatorName);
  const visibilityValues = new Set<TerraqoVisibility>(["PRIVATE", "WORKSPACE", "COMMUNITY", "PUBLIC"]);
  const visibilityInput = String(formData.get("visibility") || "PRIVATE") as TerraqoVisibility;

  await prisma.terraqoProfessionalEducation.create({
    data: {
      professionalProfileId: profile.id,
      institution,
      degree,
      field: cleanText(formData, "field", 140),
      country: location.country,
      locationSubdivisionCode: location.subdivision,
      locationCity: location.city,
      startedAt: optionalDate(formData, "educationStartedAt"),
      endedAt: currentlyStudying ? null : optionalDate(formData, "educationEndedAt"),
      currentlyStudying,
      visibility: visibilityValues.has(visibilityInput) ? visibilityInput : "PRIVATE",
      verificationStatus: verificationRequested ? "REQUESTED" : "NOT_REQUESTED",
      verificationRequestedAt: verificationRequested ? new Date() : null,
      validatorUserId: validator.validatorUserId,
      validatorName: validator.validatorName,
      validatorEmail: validator.validatorEmail,
      evidence: listFromText(formData, "educationEvidence")
    }
  });

  await refreshProfessionalGeneratedSummary(profile.id);
  revalidatePath("/portal");
  revalidatePath("/portal/experiencias");
  if (profile.username) revalidatePath(`/cv/${profile.username}`);
  redirect("/portal/experiencias?success=education");
}

export async function requestExperienceVerificationAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user?.id) redirect("/cuenta");

  const experienceId = cleanText(formData, "experienceId", 80);
  if (!experienceId) redirect("/portal/experiencias?status=verification-invalid");

  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, username: true }
  });
  if (!profile) redirect("/portal?status=profile-required");

  const experience = await prisma.terraqoProfessionalExperience.findFirst({
    where: { id: experienceId, professionalProfileId: profile.id },
    select: { id: true, verificationStatus: true, validatorUserId: true, validatorName: true, validatorEmail: true, evidence: true }
  });
  if (!experience) redirect("/portal/experiencias?status=verification-invalid");
  if (!["NOT_REQUESTED", "REJECTED"].includes(experience.verificationStatus)) {
    redirect("/portal/experiencias?status=verification-already-requested");
  }

  const hasReference = Boolean(experience.validatorUserId || experience.validatorName || experience.validatorEmail || experience.evidence.length);
  if (!hasReference) redirect("/portal/experiencias?status=verification-reference-required");

  await prisma.terraqoProfessionalExperience.update({
    where: { id: experience.id },
    data: {
      verificationStatus: "REQUESTED",
      verificationRequestedAt: new Date(),
      verificationNote: "Solicitud enviada a Terraqo. El equipo validara la referencia declarada antes de marcarla como verificada."
    }
  });

  revalidatePath("/portal/experiencias");
  revalidatePath("/admin/terraqo");
  revalidatePath("/admin/terraqo/validaciones");
  if (profile.username) revalidatePath(`/cv/${profile.username}`);
  redirect("/portal/experiencias?success=verification-requested");
}

export async function requestEducationVerificationAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user?.id) redirect("/cuenta");

  const educationId = cleanText(formData, "educationId", 80);
  if (!educationId) redirect("/portal/experiencias?status=verification-invalid");

  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, username: true }
  });
  if (!profile) redirect("/portal?status=profile-required");

  const education = await prisma.terraqoProfessionalEducation.findFirst({
    where: { id: educationId, professionalProfileId: profile.id },
    select: { id: true, verificationStatus: true, validatorUserId: true, validatorName: true, validatorEmail: true, evidence: true }
  });
  if (!education) redirect("/portal/experiencias?status=verification-invalid");
  if (!["NOT_REQUESTED", "REJECTED"].includes(education.verificationStatus)) {
    redirect("/portal/experiencias?status=verification-already-requested");
  }

  const hasReference = Boolean(education.validatorUserId || education.validatorName || education.validatorEmail || education.evidence.length);
  if (!hasReference) redirect("/portal/experiencias?status=verification-reference-required");

  await prisma.terraqoProfessionalEducation.update({
    where: { id: education.id },
    data: {
      verificationStatus: "REQUESTED",
      verificationRequestedAt: new Date()
    }
  });

  revalidatePath("/portal/experiencias");
  revalidatePath("/admin/terraqo");
  revalidatePath("/admin/terraqo/validaciones");
  if (profile.username) revalidatePath(`/cv/${profile.username}`);
  redirect("/portal/experiencias?success=verification-requested");
}

export async function updateExperienceReferenceAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user?.id) redirect("/cuenta");

  const experienceId = cleanText(formData, "experienceId", 80);
  if (!experienceId) redirect("/portal/experiencias?status=verification-invalid");

  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      username: true,
      user: { select: { terraqoMemberships: { where: { active: true }, select: { workspaceId: true } } } }
    }
  });
  if (!profile) redirect("/portal?status=profile-required");

  const experience = await prisma.terraqoProfessionalExperience.findFirst({
    where: { id: experienceId, professionalProfileId: profile.id },
    select: { id: true, evidence: true }
  });
  if (!experience) redirect("/portal/experiencias?status=verification-invalid");

  const workspaceIds = profile.user.terraqoMemberships.map((membership) => membership.workspaceId);
  const validator = await resolveValidator(formData, "validatorFallback", workspaceIds);
  const evidence = [...experience.evidence, ...listFromText(formData, "evidence")].filter(Boolean).slice(0, 12);
  const hasReference = Boolean(validator.validatorUserId || validator.validatorEmail || validator.validatorName || evidence.length);
  if (!hasReference) redirect("/portal/experiencias?status=verification-reference-required");

  await prisma.terraqoProfessionalExperience.update({
    where: { id: experience.id },
    data: {
      validatorUserId: validator.validatorUserId,
      validatorName: validator.validatorName,
      validatorEmail: validator.validatorEmail,
      evidence,
      verificationStatus: "REQUESTED",
      verificationRequestedAt: new Date(),
      verificationNote: "Solicitud enviada a Terraqo. El equipo validara la referencia declarada antes de marcarla como verificada."
    }
  });

  revalidatePath("/portal/experiencias");
  revalidatePath("/admin/terraqo");
  revalidatePath("/admin/terraqo/validaciones");
  if (profile.username) revalidatePath(`/cv/${profile.username}`);
  redirect("/portal/experiencias?success=verification-requested");
}

export async function updateExperiencePublicDetailsAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user?.id) redirect("/cuenta");

  const experienceId = cleanText(formData, "experienceId", 80);
  if (!experienceId) redirect("/portal/experiencias?status=verification-invalid");

  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, username: true }
  });
  if (!profile) redirect("/portal?status=profile-required");

  const experience = await prisma.terraqoProfessionalExperience.findFirst({
    where: { id: experienceId, professionalProfileId: profile.id },
    select: { id: true }
  });
  if (!experience) redirect("/portal/experiencias?status=verification-invalid");

  await prisma.terraqoProfessionalExperience.update({
    where: { id: experience.id },
    data: {
      summary: longText(formData, "summary", 5000),
      highlights: listFromText(formData, "highlights").slice(0, 16)
    }
  });

  await refreshProfessionalGeneratedSummary(profile.id);
  revalidatePath("/portal/experiencias");
  if (profile.username) {
    revalidatePath(`/cv/${profile.username}`);
    revalidatePath(`/cv/${profile.username}/experiencias`);
    revalidatePath(`/cv/${profile.username}/experiencias/${experience.id}`);
  }
  redirect("/portal/experiencias?success=experience-details");
}

export async function updateEducationReferenceAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user?.id) redirect("/cuenta");

  const educationId = cleanText(formData, "educationId", 80);
  if (!educationId) redirect("/portal/experiencias?status=verification-invalid");

  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      username: true,
      user: { select: { terraqoMemberships: { where: { active: true }, select: { workspaceId: true } } } }
    }
  });
  if (!profile) redirect("/portal?status=profile-required");

  const education = await prisma.terraqoProfessionalEducation.findFirst({
    where: { id: educationId, professionalProfileId: profile.id },
    select: { id: true, evidence: true }
  });
  if (!education) redirect("/portal/experiencias?status=verification-invalid");

  const workspaceIds = profile.user.terraqoMemberships.map((membership) => membership.workspaceId);
  const validator = await resolveValidator(formData, "educationValidatorFallback", workspaceIds);
  const evidence = [...education.evidence, ...listFromText(formData, "educationEvidence")].filter(Boolean).slice(0, 12);
  const hasReference = Boolean(validator.validatorUserId || validator.validatorEmail || validator.validatorName || evidence.length);
  if (!hasReference) redirect("/portal/experiencias?status=verification-reference-required");

  await prisma.terraqoProfessionalEducation.update({
    where: { id: education.id },
    data: {
      validatorUserId: validator.validatorUserId,
      validatorName: validator.validatorName,
      validatorEmail: validator.validatorEmail,
      evidence,
      verificationStatus: "REQUESTED",
      verificationRequestedAt: new Date()
    }
  });

  revalidatePath("/portal/experiencias");
  revalidatePath("/admin/terraqo");
  revalidatePath("/admin/terraqo/validaciones");
  if (profile.username) revalidatePath(`/cv/${profile.username}`);
  redirect("/portal/experiencias?success=verification-requested");
}

export async function updateProfessionalSettingsAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user?.id) redirect("/cuenta");

  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      username: true,
      experiences: {
        where: { currentlyWorking: true },
        select: { id: true, title: true, companyName: true, role: true },
        orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
        take: 20
      }
    }
  });
  if (!profile) redirect("/portal?status=profile-required");

  const allowedPrivacy = new Set<TerraqoMessagePrivacy>(["EVERYONE", "WORKSPACE", "FRIENDS", "NOBODY"]);
  const rawPrivacy = String(formData.get("messagePrivacy") || "WORKSPACE") as TerraqoMessagePrivacy;
  const messagePrivacy = allowedPrivacy.has(rawPrivacy) ? rawPrivacy : "WORKSPACE";

  const rawUsername = String(formData.get("username") || "").trim().toLowerCase().replace(/^@+/, "");
  let username: string | null | undefined = profile.username;
  if (rawUsername) {
    if (!USERNAME_PATTERN.test(rawUsername) || RESERVED_USERNAMES.has(rawUsername)) {
      redirect("/portal/configuracion?status=username-invalid");
    }
    const taken = await prisma.terraqoProfessionalProfile.findFirst({
      where: { username: rawUsername, NOT: { id: profile.id } },
      select: { id: true }
    });
    if (taken) redirect("/portal/configuracion?status=username-taken");
    username = rawUsername;
  }

  const selectedCurrentExperienceId = cleanText(formData, "featuredCurrentExperienceId", 80);
  const selectedCurrentExperience = selectedCurrentExperienceId
    ? profile.experiences.find((experience) => experience.id === selectedCurrentExperienceId)
    : null;
  const selectedHeadline = selectedCurrentExperience
    ? `${selectedCurrentExperience.role || selectedCurrentExperience.title}${selectedCurrentExperience.companyName ? ` - ${selectedCurrentExperience.companyName}` : ""} (actualmente)`
    : null;
  const manualHeadline = cleanText(formData, "headline", 140);

  await prisma.terraqoProfessionalProfile.update({
    where: { id: profile.id },
    data: {
      username,
      headline: selectedHeadline || manualHeadline,
      bio: cleanText(formData, "bio", 900),
      professionalCategories: listFromText(formData, "professionalCategories").slice(0, 10),
      specialties: listFromText(formData, "specialties").slice(0, 16),
      equipment: listFromText(formData, "equipment").slice(0, 16),
      software: listFromText(formData, "software").slice(0, 16),
      liveCvEnabled: Boolean(username),
      messagePrivacy,
      friendDiscoveryEnabled: formData.get("friendDiscoveryEnabled") === "on",
      bankAccountHolder: cleanText(formData, "bankAccountHolder", 120),
      bankName: cleanText(formData, "bankName", 80),
      bankAccountNumber: cleanText(formData, "bankAccountNumber", 80),
      bankCci: cleanText(formData, "bankCci", 80),
      yapePhone: cleanText(formData, "yapePhone", 40),
      plinPhone: cleanText(formData, "plinPhone", 40),
      paymentNotes: cleanText(formData, "paymentNotes", 320)
    }
  });

  revalidatePath("/portal");
  revalidatePath("/portal/perfil");
  revalidatePath("/portal/configuracion");
  if (username) revalidatePath(`/cv/${username}`);
  redirect("/portal/configuracion?success=settings");
}
