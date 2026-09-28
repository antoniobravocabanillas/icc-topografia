import "server-only";

import { createHash } from "node:crypto";
import { Prisma, TerraqoCvImportItemType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getProfessionalDocumentStore } from "@/lib/server/media";
import { cvExtractionSchema, type CvExtraction } from "@/lib/terraqo/cv-import-schema";
import { monthsBetween, refreshProfessionalGeneratedSummary } from "@/lib/terraqo/profile-summary";

const PARSER_VERSION = "terraqo-cv-v1";
const DOCUMENT_AI_TIMEOUT_MS = Number(process.env.TERRAQO_DOCUMENT_AI_TIMEOUT_MS || 300_000);

export class CvImportError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
  }
}

function normalizedKey(...parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join("|").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9|]/g, "");
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const normalized = value.length === 4 ? `${value}-01-01` : value.length === 7 ? `${value}-01` : value;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function json(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function publicItem(item: {
  id: string; type: TerraqoCvImportItemType; position: number; normalizedData: Prisma.JsonValue;
  confidence: number; sourcePage: number | null; sourceText: string | null; decision: string; candidateMatchId: string | null;
}) {
  return {
    id: item.id,
    type: item.type,
    position: item.position,
    normalizedData: item.normalizedData,
    confidence: item.confidence,
    sourcePage: item.sourcePage,
    sourceText: item.sourceText,
    decision: item.decision,
    candidateMatchId: item.candidateMatchId,
  };
}

export function serializeCvImport(record: {
  id: string; documentId: string; status: string; extractor: string; consentForTraining: boolean;
  errorCode: string | null; errorMessage: string | null; createdAt: Date; completedAt: Date | null;
  items: Array<Parameters<typeof publicItem>[0]>;
}) {
  return {
    id: record.id,
    documentId: record.documentId,
    status: record.status,
    extractor: record.extractor,
    consentForTraining: record.consentForTraining,
    errorCode: record.errorCode,
    errorMessage: record.errorMessage,
    createdAt: record.createdAt.toISOString(),
    completedAt: record.completedAt?.toISOString() || null,
    items: record.items.map(publicItem),
  };
}

async function ownerProfile(userId: string) {
  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { userId },
    select: { id: true, country: true, professionalCategories: true, specialties: true, equipment: true, software: true, certifications: true },
  });
  if (!profile) throw new CvImportError("PROFILE_NOT_FOUND", "Perfil profesional no encontrado.", 404);
  return profile;
}

async function callDocumentIntelligence(input: { data: ArrayBuffer; fileName: string; contentType: string }) {
  const endpoint = process.env.TERRAQO_DOCUMENT_AI_URL?.trim();
  if (!endpoint) throw new CvImportError("DOCUMENT_AI_NOT_CONFIGURED", "La lectura local de CV todavía no está configurada.", 503);
  const url = new URL("/v1/cv/extract", endpoint.endsWith("/") ? endpoint : `${endpoint}/`);
  if (!['http:', 'https:'].includes(url.protocol)) throw new CvImportError("DOCUMENT_AI_INVALID_URL", "La dirección del servicio documental no es válida.", 503);

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
    if (!response.ok) throw new CvImportError("DOCUMENT_AI_UNAVAILABLE", payload?.detail || "El lector local no pudo procesar el CV.", response.status >= 500 ? 503 : 422);
    return cvExtractionSchema.parse(payload);
  } catch (error) {
    if (error instanceof CvImportError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new CvImportError("DOCUMENT_AI_TIMEOUT", "La lectura del CV superó el tiempo máximo.", 504);
    throw new CvImportError("DOCUMENT_AI_UNAVAILABLE", "No pudimos comunicarnos con el lector local de CV.", 503);
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

export async function startCvImport(userId: string, documentId: string, consentForTraining: boolean) {
  const profile = await ownerProfile(userId);
  const document = await prisma.terraqoProfessionalDocument.findFirst({ where: { id: documentId, professionalProfileId: profile.id, type: "CV" } });
  if (!document) throw new CvImportError("CV_NOT_FOUND", "El CV no existe o no pertenece a tu perfil.", 404);
  const stored = await getProfessionalDocumentStore().getWithMetadata(document.storageKey, { type: "arrayBuffer" });
  if (!stored) throw new CvImportError("CV_FILE_MISSING", "El archivo del CV ya no está disponible.", 404);
  const fileHash = createHash("sha256").update(Buffer.from(stored.data)).digest("hex");
  const existing = await prisma.terraqoCvImport.findUnique({
    where: { professionalProfileId_fileHash_parserVersion: { professionalProfileId: profile.id, fileHash, parserVersion: PARSER_VERSION } },
    include: { items: { orderBy: [{ type: "asc" }, { position: "asc" }] } },
  });
  if (existing && existing.status !== "FAILED") return serializeCvImport(existing);

  const cvImport = existing
    ? await prisma.terraqoCvImport.update({ where: { id: existing.id }, data: { status: "PROCESSING", consentForTraining, errorCode: null, errorMessage: null, startedAt: new Date(), completedAt: null } })
    : await prisma.terraqoCvImport.create({ data: { professionalProfileId: profile.id, documentId, fileHash, parserVersion: PARSER_VERSION, extractor: "docling+ollama", consentForTraining } });

  try {
    const extraction = await callDocumentIntelligence({ data: stored.data, fileName: document.fileName, contentType: document.contentType });
    const matches = await detectMatches(profile.id, extraction);
    const result = await prisma.terraqoCvImport.update({
      where: { id: cvImport.id },
      data: {
        status: "READY_FOR_REVIEW",
        completedAt: new Date(),
        items: { deleteMany: {}, create: extractedItems(extraction, matches) },
      },
      include: { items: { orderBy: [{ type: "asc" }, { position: "asc" }] } },
    });
    return serializeCvImport(result);
  } catch (error) {
    const safe = error instanceof CvImportError ? error : new CvImportError("EXTRACTION_FAILED", "No pudimos interpretar el CV.", 422);
    await prisma.terraqoCvImport.update({ where: { id: cvImport.id }, data: { status: "FAILED", errorCode: safe.code, errorMessage: safe.message, completedAt: new Date() } });
    throw safe;
  }
}

export async function getCvImport(userId: string, importId: string) {
  const profile = await ownerProfile(userId);
  const record = await prisma.terraqoCvImport.findFirst({ where: { id: importId, professionalProfileId: profile.id }, include: { items: { orderBy: [{ type: "asc" }, { position: "asc" }] } } });
  if (!record) throw new CvImportError("IMPORT_NOT_FOUND", "Importación no encontrada.", 404);
  return serializeCvImport(record);
}

export async function reviewCvImport(userId: string, importId: string, input: { consentForTraining?: boolean; items: Array<{ id: string; decision: "ACCEPTED" | "REJECTED"; normalizedData: Record<string, unknown> }> }) {
  const profile = await ownerProfile(userId);
  const record = await prisma.terraqoCvImport.findFirst({ where: { id: importId, professionalProfileId: profile.id, status: "READY_FOR_REVIEW" }, include: { items: true } });
  if (!record) throw new CvImportError("IMPORT_NOT_REVIEWABLE", "La importación ya no está disponible para revisión.", 409);
  const owned = new Map(record.items.map((item) => [item.id, item]));
  if (input.items.some((item) => !owned.has(item.id))) throw new CvImportError("ITEM_NOT_FOUND", "Uno de los elementos no pertenece a esta importación.", 403);

  await prisma.$transaction(async (tx) => {
    if (typeof input.consentForTraining === "boolean") {
      await tx.terraqoCvImport.update({ where: { id: record.id }, data: { consentForTraining: input.consentForTraining } });
      await tx.terraqoCvImportCorrection.updateMany({
        where: { cvImportItemId: { in: record.items.map((item) => item.id) } },
        data: { useForTraining: input.consentForTraining },
      });
    }
    for (const change of input.items) {
      const previous = owned.get(change.id)!;
      const before = previous.normalizedData as Record<string, unknown>;
      await tx.terraqoCvImportItem.update({ where: { id: change.id }, data: { decision: change.decision, normalizedData: json(change.normalizedData) } });
      const fields = new Set([...Object.keys(before), ...Object.keys(change.normalizedData)]);
      for (const field of fields) {
        if (JSON.stringify(before[field]) === JSON.stringify(change.normalizedData[field])) continue;
        await tx.terraqoCvImportCorrection.create({ data: { cvImportItemId: change.id, field, predictedValue: before[field] === undefined ? Prisma.JsonNull : json(before[field]), correctedValue: change.normalizedData[field] === undefined ? Prisma.JsonNull : json(change.normalizedData[field]), accepted: change.decision === "ACCEPTED", useForTraining: Boolean(input.consentForTraining ?? record.consentForTraining) } });
      }
    }
  });
  return getCvImport(userId, importId);
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [];
}

function cleanString(value: unknown, max = 2000) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

export async function applyCvImport(userId: string, importId: string) {
  const profile = await ownerProfile(userId);
  const claim = await prisma.terraqoCvImport.updateMany({
    where: { id: importId, professionalProfileId: profile.id, status: "READY_FOR_REVIEW" },
    data: { status: "APPLYING", errorCode: null, errorMessage: null },
  });
  if (claim.count !== 1) throw new CvImportError("IMPORT_NOT_APPLICABLE", "La importación ya fue aplicada o no está lista.", 409);
  const record = await prisma.terraqoCvImport.findFirst({ where: { id: importId, professionalProfileId: profile.id, status: "APPLYING" }, include: { items: { orderBy: [{ type: "asc" }, { position: "asc" }] } } });
  if (!record) throw new CvImportError("IMPORT_NOT_APPLICABLE", "La importación cambió de estado antes de aplicarse.", 409);
  const accepted = record.items.filter((item) => item.decision === "ACCEPTED");
  if (!accepted.length) {
    await prisma.terraqoCvImport.update({ where: { id: record.id }, data: { status: "READY_FOR_REVIEW" } });
    throw new CvImportError("NO_ACCEPTED_ITEMS", "Selecciona al menos un dato antes de importar.", 422);
  }
  let applied: { created: number; merged: number };
  try {
    applied = await prisma.$transaction(async (tx) => {
      let created = 0;
      let merged = 0;
      for (const item of accepted) {
        const data = item.normalizedData as Record<string, unknown>;
        if (item.candidateMatchId && ["EXPERIENCE", "EDUCATION"].includes(item.type)) {
          await tx.terraqoCvImportItem.update({ where: { id: item.id }, data: { decision: "MERGED", createdEntityId: item.candidateMatchId } });
          merged += 1;
          continue;
        }
        if (item.type === "PROFILE") {
          await tx.terraqoProfessionalProfile.update({
            where: { id: profile.id },
            data: {
              headline: cleanString(data.headline, 180) || undefined,
              bio: cleanString(data.bio) || undefined,
              city: cleanString(data.city, 120) || undefined,
              country: cleanString(data.country, 2)?.toUpperCase() || undefined,
              professionalCategories: { set: Array.from(new Set([...profile.professionalCategories, ...stringArray(data.professionalCategories)])) },
              specialties: { set: Array.from(new Set([...profile.specialties, ...stringArray(data.specialties)])) },
              equipment: { set: Array.from(new Set([...profile.equipment, ...stringArray(data.equipment)])) },
              software: { set: Array.from(new Set([...profile.software, ...stringArray(data.software)])) },
              certifications: { set: Array.from(new Set([...profile.certifications, ...stringArray(data.certifications)])) },
            },
          });
          await tx.terraqoCvImportItem.update({ where: { id: item.id }, data: { decision: "APPLIED", createdEntityId: profile.id } });
          created += 1;
        } else if (item.type === "EXPERIENCE") {
          const title = cleanString(data.title, 180);
          if (!title) continue;
          const currentlyWorking = Boolean(data.currentlyWorking);
          const entity = await tx.terraqoProfessionalExperience.create({ data: { professionalProfileId: profile.id, title, companyName: cleanString(data.companyName, 180), role: cleanString(data.role, 180), summary: cleanString(data.summary), highlights: stringArray(data.highlights).slice(0, 12), location: cleanString(data.location, 180), country: cleanString(data.country, 2)?.toUpperCase() || profile.country, locationCity: cleanString(data.locationCity, 120), startedAt: parseDate(cleanString(data.startedAt, 10)), endedAt: currentlyWorking ? null : parseDate(cleanString(data.endedAt, 10)), currentlyWorking, visibility: "PRIVATE", verificationStatus: "NOT_REQUESTED", verifiedByTerraqo: false } });
          await tx.terraqoCvImportItem.update({ where: { id: item.id }, data: { decision: "APPLIED", createdEntityId: entity.id } });
          created += 1;
        } else if (item.type === "EDUCATION") {
          const institution = cleanString(data.institution, 180);
          const degree = cleanString(data.degree, 180);
          if (!institution || !degree) continue;
          const currentlyStudying = Boolean(data.currentlyStudying);
          const entity = await tx.terraqoProfessionalEducation.create({ data: { professionalProfileId: profile.id, institution, degree, field: cleanString(data.field, 180), country: cleanString(data.country, 2)?.toUpperCase() || profile.country, locationCity: cleanString(data.locationCity, 120), startedAt: parseDate(cleanString(data.startedAt, 10)), endedAt: currentlyStudying ? null : parseDate(cleanString(data.endedAt, 10)), currentlyStudying, visibility: "PRIVATE", verificationStatus: "NOT_REQUESTED" } });
          await tx.terraqoCvImportItem.update({ where: { id: item.id }, data: { decision: "APPLIED", createdEntityId: entity.id } });
          created += 1;
        }
      }
      await tx.terraqoCvImport.update({ where: { id: record.id }, data: { status: created ? "COMPLETED" : "PARTIAL", completedAt: new Date() } });
      return { created, merged };
    });
  } catch (error) {
    await prisma.terraqoCvImport.update({ where: { id: record.id }, data: { status: "READY_FOR_REVIEW", errorCode: "APPLY_FAILED", errorMessage: "No pudimos aplicar los cambios. Ningún dato parcial fue publicado." } });
    throw error;
  }

  try {
    const allExperiences = await prisma.terraqoProfessionalExperience.findMany({
      where: { professionalProfileId: profile.id },
      select: { startedAt: true, endedAt: true, currentlyWorking: true },
    });
    const totalMonths = allExperiences.reduce((sum, item) => sum + monthsBetween(item.startedAt, item.currentlyWorking ? null : item.endedAt), 0);
    await prisma.terraqoProfessionalProfile.update({ where: { id: profile.id }, data: { yearsExperience: Math.floor(totalMonths / 12) } });
    await refreshProfessionalGeneratedSummary(profile.id);
    revalidatePath("/portal");
    revalidatePath("/portal/experiencias");
    revalidatePath("/portal/perfil");
  } catch (error) {
    console.error("CV import post-processing failed", { importId: record.id, error });
  }
  return applied;
}
