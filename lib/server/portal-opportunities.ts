import {createHash} from "node:crypto";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {prisma} from "@/lib/prisma";
import type {WorkspacePortalToken} from "./workspace-portal-session";
export class PortalOpportunityError extends Error {
  constructor(message: string, readonly status: number) {super(message);}
}
const date = z.string().default("").refine(value => !value || /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  value >= "1900-01-01" && value <= "2100-12-31" && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) &&
  new Date(`${value}T00:00:00.000Z`).toISOString().slice(0,10) === value);
const fields = z.object({title: z.string().trim().min(2).max(160), interest: z.string().trim().max(2000).default(""),
  status: z.enum(["OPEN", "DISCOVERY", "PROPOSAL", "NEGOTIATION", "LOST", "ARCHIVED"]),
  probability: z.string().regex(/^(?:100|[1-9]?\d)$/).transform(Number),
  nextStep: z.string().trim().max(2000).default(""), nextFollowUpAt: date, notes: z.string().trim().max(8000).default("")}).strict();
const creation = fields.extend({companyId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/)});
const select = {id: true, code: true, title: true, interest: true, status: true, probability: true, nextStep: true,
  nextFollowUpAt: true, notes: true, companyId: true, updatedAt: true, company: {select: {legalName: true, tradeName: true}},
  _count: {select: {quotes: true, sales: true}}} as const;
type Opportunity = Prisma.OpportunityGetPayload<{select: typeof select}>;
function editable(row: Opportunity) {return row.status !== "WON" && !row._count.quotes && !row._count.sales;}
function record(row: Opportunity): {id: string; title: string; subtitle: string; status: string; updatedAt: string; editable: boolean; canDelete: boolean; fields: Record<string,string>} {
  return {id: row.id, title: row.title, subtitle: row.company.tradeName || row.company.legalName, status: row.status,
    updatedAt: row.updatedAt.toISOString(), editable: editable(row), canDelete: false,
    fields: {title: row.title, interest: row.interest || "", status: row.status, probability: String(row.probability),
      nextStep: row.nextStep || "", nextFollowUpAt: row.nextFollowUpAt?.toISOString().slice(0,10) || "", notes: row.notes || "",
      companyId: row.companyId, companyName: row.company.tradeName || row.company.legalName, code: row.code}};
}
const scope = (workspaceId: string) => ({terraqoWorkspaceId: workspaceId, deletedAt: null,
  company: {terraqoWorkspaceId: workspaceId, deletedAt: null}});
export async function listPortalOpportunities(token: WorkspacePortalToken, cursor?: string) {
  const rows = await prisma.opportunity.findMany({where: {...scope(token.workspaceId), ...(cursor ? {id: {gt: cursor}} : {})},
    orderBy: {id: "asc"}, take: 31, select});
  return {schemaVersion: 1, workspaceSlug: token.workspaceSlug, resource: "opportunities", records: rows.slice(0,30).map(record),
    nextCursor: rows.length > 30 ? rows[29].id : null, canCreate: true};
}
export async function savePortalOpportunity(token: WorkspacePortalToken, input: unknown, key: string | null, id?: string, version?: string) {
  if (!key || !/^[a-f0-9]{32}$/.test(key)) throw new PortalOpportunityError("Identificador de operación no válido.",422);
  const parsed = id ? fields.parse(input) : creation.parse(input);
  if (id && (!version || !Number.isFinite(Date.parse(version)))) throw new PortalOpportunityError("Recarga antes de editar.",422);
  const entityId = id ?? createHash("sha256").update(JSON.stringify([token.workspaceId, token.sub, "opportunities", key])).digest("hex").slice(0,32);
  const data = {title: parsed.title, interest: parsed.interest || null, status: parsed.status, probability: parsed.probability,
    nextStep: parsed.nextStep || null, nextFollowUpAt: parsed.nextFollowUpAt ? new Date(`${parsed.nextFollowUpAt}T00:00:00.000Z`) : null, notes: parsed.notes || null};
  return prisma.$transaction(async tx => {
    const workspace = await tx.$queryRaw<{id:string}[]>`SELECT id FROM "icc"."TerraqoWorkspace" WHERE id=${token.workspaceId} AND active=true AND "deletedAt" IS NULL FOR SHARE`;
    if (workspace.length !== 1) throw new PortalOpportunityError("Empresa no disponible.",403);
    const before = id ? await tx.opportunity.findFirst({where: {id,...scope(token.workspaceId)}, select: {companyId:true}}) : null;
    if (id && !before) throw new PortalOpportunityError("Oportunidad no disponible.",404);
    const companyId = before?.companyId ?? ("companyId" in parsed ? String(parsed.companyId) : "");
    // Parent lock coordinates quota/idempotency with company edits and deletion.
    const company = await tx.$queryRaw<{id:string}[]>`SELECT id FROM "icc"."Company" WHERE id=${companyId} AND "terraqoWorkspaceId"=${token.workspaceId} AND "deletedAt" IS NULL FOR UPDATE`;
    if (company.length !== 1) throw new PortalOpportunityError("Selecciona una empresa disponible.",422);
    if (id) await tx.$queryRaw`SELECT id FROM "icc"."Opportunity" WHERE id=${id} AND "terraqoWorkspaceId"=${token.workspaceId} AND "deletedAt" IS NULL FOR UPDATE`;
    const existing = await tx.opportunity.findFirst({where: {id: entityId,...scope(token.workspaceId)},select});
    if (!id && existing) {
      if (existing.companyId === companyId && Object.entries(data).every(([name,value]) => {
        const actual = existing[name as keyof Opportunity]; return value instanceof Date ? actual instanceof Date && value.getTime() === actual.getTime() : actual === value;
      })) return record(existing);
      throw new PortalOpportunityError("La operación ya se utilizó con otros datos.",409);
    }
    let saved: Opportunity;
    if (id) {
      if (!existing) throw new PortalOpportunityError("Oportunidad no disponible.",404);
      if (!editable(existing)) throw new PortalOpportunityError("La oportunidad tiene un cierre o documentos comerciales vinculados. Requiere el flujo comercial correspondiente.",409);
      if (existing.updatedAt.toISOString() !== version) throw new PortalOpportunityError("La oportunidad cambió. Recarga antes de editar.",409);
      const changed = await tx.opportunity.updateMany({where: {id,...scope(token.workspaceId),updatedAt: existing.updatedAt},
        data: {...data,updatedAt: new Date(Math.max(Date.now(),existing.updatedAt.getTime()+1))}});
      if (changed.count !== 1) throw new PortalOpportunityError("La oportunidad cambió. Recarga antes de editar.",409);
      saved = await tx.opportunity.findFirstOrThrow({where:{id,...scope(token.workspaceId)},select});
    } else {
      if (await tx.opportunity.count({where:{companyId,terraqoWorkspaceId:token.workspaceId,deletedAt:null}}) >= 500)
        throw new PortalOpportunityError("Se alcanzó el límite de oportunidades de esta empresa.",422);
      saved = await tx.opportunity.create({data:{id:entityId,code:`OP-${entityId.toUpperCase()}`,companyId,terraqoWorkspaceId:token.workspaceId,source:"portal-mobile",...data},select});
    }
    // This command never writes estimated amounts, payment/quote/sale links,
    // seller assignments, or financial completion. Those need their own commands.
    await tx.activityLog.create({data:{actorId:token.sub,terraqoWorkspaceId:token.workspaceId,companyId,opportunityId:saved.id,
      action:id?"UPDATED":"CREATED",entityType:"opportunities",entityId:saved.id,title:id?"Oportunidad actualizada":"Oportunidad creada",metadata:{source:"portal-mobile"}}});
    return record(saved);
  });
}
