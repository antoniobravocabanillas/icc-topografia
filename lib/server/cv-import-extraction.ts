import { randomUUID } from "node:crypto";
import { Prisma, TerraqoCvImportItemType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getProfessionalDocumentStore } from "@/lib/server/media";
import { cvExtractionSchema, type CvExtraction } from "@/lib/terraqo/cv-import-schema";

const DOCUMENT_AI_TIMEOUT_MS = Number(process.env.TERRAQO_DOCUMENT_AI_TIMEOUT_MS || 12 * 60_000);
const STALE_JOB_MS = 20 * 60_000;

export class CvImportError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
  }
}

function normalizedKey(...parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join("|").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9|]/g, "");
}

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

async function callDocumentIntelligence(input: { data: ArrayBuffer; fileName: string; contentType: string }) {
  const endpoint = process.env.TERRAQO_DOCUMENT_AI_URL?.trim();
  if (!endpoint) throw new CvImportError("DOCUMENT_AI_NOT_CONFIGURED", "La lectura privada de CV todavía no está configurada.", 503);
  const url = new URL("/v1/cv/extract", endpoint.endsWith("/") ? endpoint : `${endpoint}/`);
  if (url.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new CvImportError("DOCUMENT_AI_INSECURE_URL", "El lector documental debe usar HTTPS en producción.", 503);
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new CvImportError("DOCUMENT_AI_INVALID_URL", "La dirección del servicio documental no es válida.", 503);

  const form = new FormData();
  form.set("file", new File([input.data], input.fileName, { type: input.contentType }));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOCUMENT_AI_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: process.env.TERRAQO_DOCUMENT_AI_TOKEN ? { authorization: `Bearer ${process.env.TERRAQO_DOCUMENT_AI_TOKEN}` } : undefined,
      body: form,
      signal: controller.signal,
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new CvImportError("DOCUMENT_AI_UNAVAILABLE", payload?.detail || "El lector privado no pudo procesar el CV.", response.status >= 500 ? 503 : 422);
    return cvExtractionSchema.parse(payload);
  } catch (error) {
    if (error instanceof CvImportError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new CvImportError("DOCUMENT_AI_TIMEOUT", "La lectura del CV superó el tiempo máximo.", 504);
    throw new CvImportError("DOCUMENT_AI_UNAVAILABLE", "No pudimos comunicarnos con el lector privado de CV.", 503);
  } finally {
    clearTimeout(timer);
  }
}

async function detectMatches(profileId: string, extraction: CvExtraction) {
  const [experiences, education] = await Promise.all([
    prisma.terraqoProfessionalExperience.findMany({ where: { professionalProfileId: profileId }, select: { id: true, title: true, companyName: true, role: true, startedAt: true } }),
    prisma.terraqoProfessionalEducation.findMany({ where: { professionalProfileId: profileId }, select: { id: true, institution: true, degree: true, field: true, startedAt: true } }),
  ]);
  const experienceKeys = new Map(experiences.map((item) => [normalizedKey(item.companyName, item.title, item.role, item.startedAt?.toISOString().slice(0, 7)), item.id]));
  const educationKeys = new Map(education.map((item) => [normalizedKey(item.institution, item.degree, item.field, item.startedAt?.toISOString().slice(0, 7)), item.id]));
  return {
    experiences: extraction.experiences.map((item) => experienceKeys.get(normalizedKey(item.companyName, item.title, item.role, item.startedAt?.slice(0, 7))) || null),
    education: extraction.education.map((item) => educationKeys.get(normalizedKey(item.institution, item.degree, item.field, item.startedAt?.slice(0, 7))) || null),
  };
}

function extractedItems(extraction: CvExtraction, matches: Awaited<ReturnType<typeof detectMatches>>) {
  const items: Array<{ type: TerraqoCvImportItemType; position: number; rawData: Prisma.InputJsonValue; normalizedData: Prisma.InputJsonValue; confidence: number; sourcePage?: number | null; sourceText?: string | null; candidateMatchId?: string | null }> = [];
  const profileHasData = Object.values(extraction.profile).some((value) => Array.isArray(value) ? value.length > 0 : Boolean(value));
  if (profileHasData) items.push({ type: "PROFILE", position: 0, rawData: json(extraction.profile), normalizedData: json(extraction.profile), confidence: 1 });
  extraction.experiences.forEach((item, index) => items.push({ type: "EXPERIENCE", position: index, rawData: json(item), normalizedData: json(item), confidence: item.confidence, sourcePage: item.sourcePage, sourceText: item.sourceText, candidateMatchId: matches.experiences[index] }));
  extraction.education.forEach((item, index) => items.push({ type: "EDUCATION", position: index, rawData: json(item), normalizedData: json(item), confidence: item.confidence, sourcePage: item.sourcePage, sourceText: item.sourceText, candidateMatchId: matches.education[index] }));
  return items;
}

/** Claims and processes one queued import. The token makes duplicate background invocations harmless. */
export async function processCvImportJob(importId: string) {
  const token = randomUUID();
  const staleBefore = new Date(Date.now() - STALE_JOB_MS);
  const claim = await prisma.terraqoCvImport.updateMany({
    where: { id: importId, status: "PROCESSING", OR: [{ processingToken: null }, { heartbeatAt: { lt: staleBefore } }] },
    data: { processingToken: token, heartbeatAt: new Date(), processingAttempts: { increment: 1 }, errorCode: null, errorMessage: null },
  });
  if (claim.count !== 1) return { claimed: false as const };

  try {
    const record = await prisma.terraqoCvImport.findFirst({ where: { id: importId, processingToken: token, status: "PROCESSING" }, include: { document: true } });
    if (!record) return { claimed: false as const };
    const stored = await getProfessionalDocumentStore().getWithMetadata(record.document.storageKey, { type: "arrayBuffer" });
    if (!stored) throw new CvImportError("CV_FILE_MISSING", "El archivo del CV ya no está disponible.", 404);

    const extraction = await callDocumentIntelligence({ data: stored.data, fileName: record.document.fileName, contentType: record.document.contentType });
    const matches = await detectMatches(record.professionalProfileId, extraction);
    await prisma.$transaction(async (tx) => {
      const completed = await tx.terraqoCvImport.updateMany({
        where: { id: record.id, processingToken: token, status: "PROCESSING" },
        data: { status: "READY_FOR_REVIEW", completedAt: new Date(), heartbeatAt: new Date(), processingToken: null },
      });
      if (completed.count !== 1) throw new CvImportError("JOB_CLAIM_LOST", "La tarea fue retomada por otro proceso.", 409);
      await tx.terraqoCvImportItem.deleteMany({ where: { cvImportId: record.id } });
      await tx.terraqoCvImportItem.createMany({ data: extractedItems(extraction, matches).map((item) => ({ ...item, cvImportId: record.id })) });
    });
    return { claimed: true as const, completed: true as const };
  } catch (error) {
    const safe = error instanceof CvImportError ? error : new CvImportError("EXTRACTION_FAILED", "No pudimos interpretar el CV.", 422);
    await prisma.terraqoCvImport.updateMany({
      where: { id: importId, processingToken: token, status: "PROCESSING" },
      data: { status: "FAILED", errorCode: safe.code, errorMessage: safe.message, completedAt: new Date(), heartbeatAt: new Date(), processingToken: null },
    });
    throw safe;
  }
}
