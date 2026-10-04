import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { monthsBetween } from "@/lib/terraqo/profile-summary";
import type { WorkspacePortalToken } from "./workspace-portal-session";

export type CvResource = "experiences" | "education";
export class PortalCvError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && value >= "1900-01-01" && parsed <= new Date();
}, "Fecha no válida.");
const dates = { startedAt: date, endedAt: z.union([date, z.literal("")]), };
const yesNo = z.enum(["false", "true"]).transform(value => value === "true");
const experienceSchema = z.object({ title: z.string().trim().min(1).max(140), companyName: z.string().trim().min(1).max(140),
  role: z.string().trim().max(120), summary: z.string().trim().max(5000), ...dates, currentlyWorking: yesNo }).strict();
const educationSchema = z.object({ institution: z.string().trim().min(1).max(140), degree: z.string().trim().min(1).max(140),
  field: z.string().trim().max(140), ...dates, currentlyStudying: yesNo }).strict();
type ExperienceData = Omit<z.infer<typeof experienceSchema>, "startedAt" | "endedAt"> & { startedAt: Date; endedAt: Date | null };
type EducationData = Omit<z.infer<typeof educationSchema>, "startedAt" | "endedAt"> & { startedAt: Date; endedAt: Date | null };
const sharedSelect = { id: true, startedAt: true, endedAt: true, visibility: true, verificationStatus: true, updatedAt: true } as const;
const experienceSelect = { ...sharedSelect, title: true, companyName: true, role: true, summary: true, currentlyWorking: true,
  verifiedByTerraqo: true, projectId: true, workspaceId: true } as const;
const educationSelect = { ...sharedSelect, institution: true, degree: true, field: true, currentlyStudying: true } as const;
type Row = { id: string; updatedAt: Date; verificationStatus: string; [key: string]: unknown };
function editable(row: Row) {
  return ["NOT_REQUESTED", "REJECTED"].includes(row.verificationStatus) && !row.verifiedByTerraqo && !row.projectId && !row.workspaceId;
}
function record(row: Row) {
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) if (!["id", "updatedAt", "projectId", "workspaceId", "verifiedByTerraqo"].includes(key))
    fields[key] = value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "");
  return { id: row.id, title: String(row.title ?? row.degree), subtitle: String(row.companyName ?? row.institution ?? ""),
    status: row.verificationStatus, updatedAt: row.updatedAt.toISOString(), fields, editable: editable(row), canDelete: false };
}
export async function listCvEntries(token: WorkspacePortalToken, resource: CvResource, cursor?: string) {
  const profile = await prisma.terraqoProfessionalProfile.findUnique({ where: { userId: token.sub }, select: { id: true } });
  const window = { take: 31, orderBy: { id: "asc" as const }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) };
  const rows: Row[] = !profile ? [] : resource === "experiences"
    ? await prisma.terraqoProfessionalExperience.findMany({ ...window, where: { professionalProfileId: profile.id }, select: experienceSelect })
    : await prisma.terraqoProfessionalEducation.findMany({ ...window, where: { professionalProfileId: profile.id }, select: educationSelect });
  return { schemaVersion: 1, workspaceSlug: token.workspaceSlug, resource, records: rows.slice(0, 30).map(row => record(row)),
    nextCursor: rows.length > 30 ? rows[29].id : null, canCreate: Boolean(profile) };
}
export async function saveCvEntry(token: WorkspacePortalToken, resource: CvResource, input: unknown, key: string | null, id?: string, version?: string) {
  if (id && (!version || !z.string().datetime().safeParse(version).success)) throw new PortalCvError("Recarga la entrada antes de editar.", 409);
  if (!id && (!key || !/^[a-f0-9]{32}$/.test(key))) throw new PortalCvError("La operación necesita una clave válida.", 422);
  const parsed = resource === "experiences" ? experienceSchema.parse(input) : educationSchema.parse(input);
  const ongoing = "currentlyWorking" in parsed ? parsed.currentlyWorking : parsed.currentlyStudying;
  if ((ongoing && parsed.endedAt) || (!ongoing && !parsed.endedAt) || (parsed.endedAt && parsed.endedAt < parsed.startedAt))
    throw new PortalCvError("Revisa las fechas y si esta actividad continúa actualmente.", 422);
  const data = { ...parsed, startedAt: new Date(`${parsed.startedAt}T00:00:00.000Z`), endedAt: parsed.endedAt ? new Date(`${parsed.endedAt}T00:00:00.000Z`) : null };
  return prisma.$transaction(async tx => {
    const profile = await tx.terraqoProfessionalProfile.findUnique({ where: { userId: token.sub }, select: { id: true } });
    if (!profile) throw new PortalCvError("Completa tu registro profesional antes de añadir tu historial.", 404);
    // Serialize changes to this personal CV across workspaces and instances.
    // This protects creation limits, idempotency and the derived experience total.
    await tx.$queryRaw`SELECT id FROM "icc"."TerraqoProfessionalProfile" WHERE id = ${profile.id} FOR UPDATE`;
    const entryId = id ?? createHash("sha256").update(JSON.stringify([profile.id, token.sub, resource, key])).digest("hex").slice(0, 32);
    const where = { id: entryId, professionalProfileId: profile.id };
    const existing: Row | null = resource === "experiences" ? await tx.terraqoProfessionalExperience.findFirst({ where, select: experienceSelect })
      : await tx.terraqoProfessionalEducation.findFirst({ where, select: educationSelect });
    if (!id && existing) {
      const fields = record(existing).fields;
      if (!Object.entries(parsed).every(([field, value]) => fields[field] === String(value)))
        throw new PortalCvError("La clave ya fue utilizada con otros datos. Recarga la lista.", 409);
      return record(existing);
    }
    if (id && !existing) throw new PortalCvError("Entrada no disponible.", 404);
    if (existing && !editable(existing)) throw new PortalCvError("Esta entrada está verificada, en revisión o vinculada a una empresa. Requiere una revisión específica.", 403);
    if (!id) {
      const count = resource === "experiences" ? await tx.terraqoProfessionalExperience.count({ where: { professionalProfileId: profile.id } })
        : await tx.terraqoProfessionalEducation.count({ where: { professionalProfileId: profile.id } });
      if (count >= 200) throw new PortalCvError("Tu historial alcanzó el límite de 200 entradas en esta sección.", 422);
    }
    const reset = { verificationStatus: "NOT_REQUESTED" as const, verificationRequestedAt: null };
    if (id) {
      // Restrict the same fields in the write predicate as in the read check;
      // a concurrent verification must win rather than being overwritten.
      const guarded = { ...where, updatedAt: new Date(version!), verificationStatus: { in: ["NOT_REQUESTED", "REJECTED"] as ("NOT_REQUESTED" | "REJECTED")[] } };
      const changed = resource === "experiences" ? await tx.terraqoProfessionalExperience.updateMany({ where: { ...guarded, verifiedByTerraqo: false, projectId: null, workspaceId: null },
        data: { ...data as ExperienceData, ...reset } })
        : await tx.terraqoProfessionalEducation.updateMany({ where: guarded, data: { ...data as EducationData, ...reset } });
      if (changed.count !== 1) throw new PortalCvError("La entrada cambió. Recarga antes de editar.", 409);
    } else if (resource === "experiences") {
      await tx.terraqoProfessionalExperience.create({ data: { id: entryId, professionalProfileId: profile.id,
        ...data as ExperienceData, visibility: "PRIVATE", verifiedByTerraqo: false, ...reset } });
    } else await tx.terraqoProfessionalEducation.create({ data: { id: entryId, professionalProfileId: profile.id,
      ...data as EducationData, visibility: "PRIVATE", ...reset } });
    // Clear a cached summary rather than publishing text based on the old CV.
    // Do not invoke paid text-generation providers as part of a mobile write.
    if (resource === "experiences") {
      const durations = await tx.terraqoProfessionalExperience.findMany({ where: { professionalProfileId: profile.id },
        select: { startedAt: true, endedAt: true, currentlyWorking: true }, take: 501 });
      if (durations.length > 500) throw new PortalCvError("Tu historial requiere una revisión antes de recalcular la experiencia.", 422);
      const yearsExperience = Math.floor(durations.reduce((sum, row) => sum + monthsBetween(row.startedAt, row.currentlyWorking ? null : row.endedAt), 0) / 12);
      await tx.terraqoProfessionalProfile.update({ where: { id: profile.id }, data: { yearsExperience, generatedSummary: null, generatedSummaryUpdatedAt: null } });
    } else await tx.terraqoProfessionalProfile.update({ where: { id: profile.id }, data: { generatedSummary: null, generatedSummaryUpdatedAt: null } });
    await tx.activityLog.create({ data: { actorId: token.sub, terraqoWorkspaceId: token.workspaceId, entityType: "ProfessionalCv", entityId: entryId,
      action: id ? "UPDATED" : "CREATED", title: resource === "experiences" ? "Experiencia profesional guardada" : "Formación profesional guardada", metadata: { resource } } });
    const saved: Row = resource === "experiences" ? await tx.terraqoProfessionalExperience.findFirstOrThrow({ where, select: experienceSelect })
      : await tx.terraqoProfessionalEducation.findFirstOrThrow({ where, select: educationSelect });
    return record(saved);
  });
}
