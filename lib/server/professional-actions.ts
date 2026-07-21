import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { TerraqoMessagePrivacy } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

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

export async function createHistoricalExperienceAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user?.id) redirect("/cuenta");

  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, username: true }
  });
  if (!profile) redirect("/portal?status=profile-required");

  const title = cleanText(formData, "title", 140);
  const companyName = cleanText(formData, "companyName", 140);
  const role = cleanText(formData, "role", 120);
  const location = cleanText(formData, "location", 120);
  const supervisor = cleanText(formData, "supervisor", 180);
  if (!title || !companyName) redirect("/portal/experiencias?status=missing");

  await prisma.terraqoProfessionalExperience.create({
    data: {
      professionalProfileId: profile.id,
      title,
      companyName,
      role,
      location,
      startedAt: optionalDate(formData, "startedAt"),
      endedAt: optionalDate(formData, "endedAt"),
      visibility: "PRIVATE",
      evidence: listFromText(formData, "evidence"),
      verificationNote: supervisor
        ? `Solicitud de verificacion historica pendiente para ${supervisor}.`
        : "Experiencia historica cargada por el profesional. Pendiente de verificacion por responsable."
    }
  });

  revalidatePath("/portal");
  revalidatePath("/portal/experiencias");
  if (profile.username) revalidatePath(`/cv/${profile.username}`);
  redirect("/portal/experiencias?success=experience");
}

export async function updateProfessionalSettingsAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user?.id) redirect("/cuenta");

  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, username: true }
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

  await prisma.terraqoProfessionalProfile.update({
    where: { id: profile.id },
    data: {
      username,
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
  revalidatePath("/portal/configuracion");
  if (username) revalidatePath(`/cv/${username}`);
  redirect("/portal/configuracion?success=settings");
}
