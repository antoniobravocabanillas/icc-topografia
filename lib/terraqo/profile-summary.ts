import { prisma } from "@/lib/prisma";

type SummaryExperience = {
  title: string;
  companyName: string | null;
  role: string | null;
  locationCity: string | null;
  location: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  currentlyWorking: boolean;
  verifiedByTerraqo: boolean;
};

type SummaryEducation = {
  institution: string;
  degree: string;
  field: string | null;
  locationCity: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  currentlyStudying: boolean;
};

export function monthsBetween(start?: Date | null, end?: Date | null) {
  if (!start) return 0;
  const finish = end ?? new Date();
  const months = (finish.getUTCFullYear() - start.getUTCFullYear()) * 12 + (finish.getUTCMonth() - start.getUTCMonth());
  return Math.max(1, months + 1);
}

export function formatExperienceDuration(months: number) {
  if (months <= 0) return "0 meses";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (!years) return `${months} ${months === 1 ? "mes" : "meses"}`;
  if (!rest) return `${years} ${years === 1 ? "ano" : "anos"}`;
  return `${years} ${years === 1 ? "ano" : "anos"} y ${rest} ${rest === 1 ? "mes" : "meses"}`;
}

function deterministicSummary(input: {
  headline?: string | null;
  categories: string[];
  specialties: string[];
  experiences: SummaryExperience[];
  education: SummaryEducation[];
}) {
  const totalMonths = input.experiences.reduce((sum, item) => sum + monthsBetween(item.startedAt, item.currentlyWorking ? null : item.endedAt), 0);
  const latest = input.experiences[0];
  const education = input.education[0];
  const focus = [...input.categories, ...input.specialties].filter(Boolean).slice(0, 4).join(", ");
  const parts = [
    input.headline || latest?.role || "Profesional operativo",
    totalMonths ? `con ${formatExperienceDuration(totalMonths)} de experiencia declarada` : "con experiencia en construccion de perfil",
    focus ? `en ${focus}` : null,
    latest ? `Ha trabajado en ${latest.title}${latest.companyName ? ` para ${latest.companyName}` : ""}${latest.locationCity || latest.location ? ` en ${latest.locationCity || latest.location}` : ""}.` : null,
    education ? `Formacion: ${education.degree} en ${education.institution}.` : null
  ].filter(Boolean);
  return parts.join(" ").slice(0, 720);
}

async function aiSummary(input: Parameters<typeof deterministicSummary>[0]) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_PROFILE_SUMMARY_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: "Redacta un extracto profesional sobrio, verificable y comercial para un CV vivo. No inventes datos. Maximo 75 palabras. Espanol neutro."
        },
        {
          role: "user",
          content: JSON.stringify(input)
        }
      ]
    })
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  const text = payload?.output_text || payload?.output?.flatMap?.((item: { content?: Array<{ text?: string }> }) => item.content || []).map((item: { text?: string }) => item.text).filter(Boolean).join(" ");
  return typeof text === "string" && text.trim() ? text.trim().slice(0, 720) : null;
}

export async function refreshProfessionalGeneratedSummary(professionalProfileId: string) {
  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { id: professionalProfileId },
    select: {
      headline: true,
      professionalCategories: true,
      specialties: true,
      experiences: {
        select: { title: true, companyName: true, role: true, locationCity: true, location: true, startedAt: true, endedAt: true, currentlyWorking: true, verifiedByTerraqo: true },
        orderBy: [{ currentlyWorking: "desc" }, { startedAt: "desc" }, { createdAt: "desc" }],
        take: 8
      },
      education: {
        select: { institution: true, degree: true, field: true, locationCity: true, startedAt: true, endedAt: true, currentlyStudying: true },
        orderBy: [{ currentlyStudying: "desc" }, { startedAt: "desc" }, { createdAt: "desc" }],
        take: 6
      }
    }
  });
  if (!profile) return;

  const input = {
    headline: profile.headline,
    categories: profile.professionalCategories,
    specialties: profile.specialties,
    experiences: profile.experiences,
    education: profile.education
  };
  const generatedSummary = (await aiSummary(input)) || deterministicSummary(input);
  await prisma.terraqoProfessionalProfile.update({
    where: { id: professionalProfileId },
    data: { generatedSummary, generatedSummaryUpdatedAt: new Date() }
  });
}
