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
  if (!rest) return `${years} ${years === 1 ? "año" : "años"}`;
  return `${years} ${years === 1 ? "año" : "años"} y ${rest} ${rest === 1 ? "mes" : "meses"}`;
}

const SUMMARY_TIMEOUT_MS = Number(process.env.AI_PROFILE_SUMMARY_TIMEOUT_MS || 12_000);

export function normalizeSpanishCopy(text?: string | null) {
  if (!text) return null;
  const cleaned = text
    .replace(/\bEspanol\b/gi, "Español")
    .replace(/\banos\b/gi, "años")
    .replace(/\bano\b/gi, "año")
    .replace(/\bconstruccion\b/gi, "construcción")
    .replace(/\bpublica\b/gi, "pública")
    .replace(/\bpublicas\b/gi, "públicas")
    .replace(/\bbitacora\b/gi, "bitácora")
    .replace(/\bbitacoras\b/gi, "bitácoras")
    .replace(/\bvalidacion\b/gi, "validación")
    .replace(/\bverificacion\b/gi, "verificación")
    .replace(/\binformacion\b/gi, "información")
    .replace(/\bubicacion\b/gi, "ubicación")
    .replace(/\bhistorica\b/gi, "histórica")
    .replace(/\bhistorico\b/gi, "histórico")
    .replace(/\bFormacion\b/g, "Formación")
    .replace(/\bformacion\b/g, "formación")
    .trim();
  return cleaned ? cleaned.slice(0, 720) : null;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = SUMMARY_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
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
    totalMonths ? `con ${formatExperienceDuration(totalMonths)} de experiencia declarada` : "con experiencia en construcción de perfil",
    focus ? `en ${focus}` : null,
    latest ? `Ha trabajado en ${latest.title}${latest.companyName ? ` para ${latest.companyName}` : ""}${latest.locationCity || latest.location ? ` en ${latest.locationCity || latest.location}` : ""}.` : null,
    education ? `Formación: ${education.degree} en ${education.institution}.` : null
  ].filter(Boolean);
  return normalizeSpanishCopy(parts.join(" ")) || "";
}

function configuredSummaryProvider() {
  const explicit = process.env.AI_PROFILE_SUMMARY_PROVIDER || process.env.AI_PROVIDER;
  if (explicit) return explicit.trim().toLowerCase();
  if (process.env.OLLAMA_BASE_URL) return "ollama";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "none";
}

async function openAiSummary(input: Parameters<typeof deterministicSummary>[0]) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const response = await fetchWithTimeout("https://api.openai.com/v1/responses", {
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
          content: "Redacta un extracto profesional sobrio, verificable y comercial para un CV vivo. No inventes datos. Máximo 75 palabras. Español neutro. Usa correctamente tildes y la letra ñ."
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
  return typeof text === "string" ? normalizeSpanishCopy(text) : null;
}

async function ollamaSummary(input: Parameters<typeof deterministicSummary>[0]) {
  const baseUrl = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
  const model = process.env.OLLAMA_PROFILE_SUMMARY_MODEL || process.env.OLLAMA_MODEL || "llama3.1:8b";

  const response = await fetchWithTimeout(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      options: {
        temperature: 0.2,
        num_predict: 180
      },
      messages: [
        {
          role: "system",
          content: "Eres un redactor técnico de Terraqo. Redacta un extracto profesional sobrio, verificable y comercial para un CV vivo. No inventes datos. Máximo 75 palabras. Español neutro. Usa correctamente tildes y la letra ñ. Devuelve solo el extracto."
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
  const text = payload?.message?.content || payload?.response;
  return typeof text === "string" ? normalizeSpanishCopy(text) : null;
}

async function aiSummary(input: Parameters<typeof deterministicSummary>[0]) {
  const provider = configuredSummaryProvider();
  try {
    if (provider === "ollama" || provider === "local") return await ollamaSummary(input);
    if (provider === "openai") return await openAiSummary(input);
    if (provider === "none" || provider === "off" || provider === "false") return null;
  } catch {
    return null;
  }

  const ollamaResult = await ollamaSummary(input).catch(() => null);
  if (ollamaResult) return ollamaResult;
  return openAiSummary(input).catch(() => null);
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
  const generatedSummary = normalizeSpanishCopy((await aiSummary(input)) || deterministicSummary(input)) || deterministicSummary(input);
  await prisma.terraqoProfessionalProfile.update({
    where: { id: professionalProfileId },
    data: { generatedSummary, generatedSummaryUpdatedAt: new Date() }
  });
}
