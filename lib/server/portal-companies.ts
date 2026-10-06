import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCountryOptions } from "@/lib/locations";
import type { WorkspacePortalToken } from "./workspace-portal-session";

export class PortalCompanyError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
const countryCodes = new Set(getCountryOptions().map(country => country.value));
const text = (maximum: number) => z.string().trim().max(maximum).default("");
const companyFields = z.object({
  legalName: z.string().trim().min(2).max(160), tradeName: text(160),
  document: text(40).transform(value => value.toUpperCase()),
  country: z.string().trim().toUpperCase().refine(value => countryCodes.has(value)),
  email: z.union([z.literal(""), z.string().trim().email().max(254)]).default("").transform(value => value.toLowerCase()),
  phone: text(40), address: text(240), city: text(120), region: text(120), industry: text(160),
}).strict().superRefine((value, context) => {
  if (value.country === "PE" && value.document && !/^\d{11}$/.test(value.document))
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["document"], message: "El RUC debe tener once dígitos." });
});
const select = { id: true, legalName: true, tradeName: true, document: true, country: true,
  email: true, phone: true, address: true, city: true, region: true, industry: true,
  status: true, updatedAt: true, publicSlug: true,
  _count: { select: { terraqoWorkspaces: true, quotes: true, sales: true, documents: true } } } as const;
type Company = Prisma.CompanyGetPayload<{select: typeof select}>;
function editable(row: Company) {
  return !row.publicSlug && Object.values(row._count).every(count => count === 0);
}
function record(row: Company) {
  const fields: Record<string, string> = {};
  for (const name of ["legalName", "tradeName", "document", "country", "email", "phone", "address", "city", "region", "industry"] as const)
    fields[name] = row[name] ?? "";
  return { id: row.id, title: row.tradeName || row.legalName, subtitle: row.legalName,
    status: row.status, updatedAt: row.updatedAt.toISOString(), fields, editable: editable(row), canDelete: false };
}
const scope = (workspaceId: string) => ({terraqoWorkspaceId: workspaceId, deletedAt: null});
export async function listPortalCompanies(token: WorkspacePortalToken, cursor?: string) {
  const rows = await prisma.company.findMany({where: {...scope(token.workspaceId), ...(cursor ? {id: {gt: cursor}} : {})},
    orderBy: {id: "asc"}, take: 31, select});
  return {schemaVersion: 1, workspaceSlug: token.workspaceSlug, resource: "companies",
    records: rows.slice(0, 30).map(record), nextCursor: rows.length > 30 ? rows[29].id : null, canCreate: true};
}
export async function savePortalCompany(token: WorkspacePortalToken, input: unknown, key: string | null, id?: string, version?: string) {
  if (!key || !/^[a-f0-9]{32}$/.test(key)) throw new PortalCompanyError("Identificador de operación no válido.", 422);
  const parsed = companyFields.parse(input);
  if (id && (!version || !Number.isFinite(Date.parse(version)))) throw new PortalCompanyError("Recarga antes de editar.", 422);
  const entityId = id ?? createHash("sha256").update(JSON.stringify([token.workspaceId, token.sub, "companies", key])).digest("hex").slice(0, 32);
  const data = {...parsed, tradeName: parsed.tradeName || null, document: parsed.document || null,
    email: parsed.email || null, phone: parsed.phone || null, address: parsed.address || null,
    city: parsed.city || null, region: parsed.region || null, industry: parsed.industry || null};
  return prisma.$transaction(async tx => {
    // Serializes native company writes per tenant, including document uniqueness
    // and quotas. Other tenants remain independent; no process-local mutex.
    const workspace = await tx.$queryRaw<{id: string}[]>`SELECT id FROM "icc"."TerraqoWorkspace" WHERE id=${token.workspaceId} AND active=true AND "deletedAt" IS NULL FOR UPDATE`;
    if (workspace.length !== 1) throw new PortalCompanyError("Empresa no disponible.", 403);
    if (id) await tx.$queryRaw`SELECT id FROM "icc"."Company" WHERE id=${id} AND "terraqoWorkspaceId"=${token.workspaceId} AND "deletedAt" IS NULL FOR UPDATE`;
    const existing = await tx.company.findFirst({where: {id: entityId, ...scope(token.workspaceId)}, select});
    if (!id && existing) {
      if (Object.entries(data).every(([name, value]) => existing[name as keyof Company] === value)) return record(existing);
      throw new PortalCompanyError("La operación ya se utilizó con otros datos.", 409);
    }
    if (id) {
      if (!existing) throw new PortalCompanyError("Empresa comercial no disponible.", 404);
      if (!editable(existing)) throw new PortalCompanyError("Esta empresa tiene identidad pública o documentos vinculados. Su modificación requiere el flujo administrativo correspondiente.", 409);
      if (existing.updatedAt.toISOString() !== version) throw new PortalCompanyError("La empresa cambió. Recarga antes de editar.", 409);
    }
    if (data.document && await tx.company.findFirst({where: {...scope(token.workspaceId), id: {not: entityId}, country: data.country,
      document: {equals: data.document, mode: "insensitive"}}, select: {id: true}}))
      throw new PortalCompanyError("Ya existe una empresa con ese documento en este país.", 409);
    let saved: Company;
    if (existing) {
      const changed = await tx.company.updateMany({where: {id: entityId, ...scope(token.workspaceId), updatedAt: existing.updatedAt},
        data: {...data, updatedAt: new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1)),
          ...(existing.country !== data.country || existing.city !== data.city || existing.region !== data.region ? {locationSubdivisionCode: null, locationCity: null} : {})}});
      if (changed.count !== 1) throw new PortalCompanyError("La empresa cambió. Recarga antes de editar.", 409);
      saved = await tx.company.findFirstOrThrow({where: {id: entityId, ...scope(token.workspaceId)}, select});
    } else {
      if (await tx.company.count({where: scope(token.workspaceId)}) >= 5000) throw new PortalCompanyError("Se alcanzó el límite de empresas comerciales.", 422);
      saved = await tx.company.create({data: {id: entityId, terraqoWorkspaceId: token.workspaceId, ...data}, select});
    }
    await tx.activityLog.create({data: {actorId: token.sub, terraqoWorkspaceId: token.workspaceId, companyId: saved.id,
      action: id ? "UPDATED" : "CREATED", entityType: "companies", entityId: saved.id,
      title: id ? "Empresa comercial actualizada" : "Empresa comercial creada", metadata: {source: "portal-mobile"}}});
    return record(saved);
  });
}
