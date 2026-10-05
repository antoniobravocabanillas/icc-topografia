import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { WorkspacePortalToken } from "./workspace-portal-session";

export class PortalProjectWriteError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
const schema = z.object({ title: z.string().trim().min(2).max(160), summary: z.string().trim().min(1).max(900),
  description: z.string().trim().max(8000).default(""), location: z.string().trim().max(240).default(""),
  category: z.string().trim().max(120).default(""), servicesApplied: z.string().max(4000).default("").transform(value =>
    [...new Set(value.split(/\r?\n/).map(item => item.trim()).filter(Boolean))]).refine(items => items.length <= 30 && items.every(item => item.length <= 120)),
  clientId: z.string().regex(/^(?:[a-zA-Z0-9_-]{1,100})?$/).optional(),
  status: z.enum(["PLANNING", "IN_PROGRESS", "FINISHED", "ARCHIVED"]) }).strict();
export const portalProjectSelect = { id: true, title: true, summary: true, description: true, location: true,
  category: true, servicesApplied: true, status: true, isPublic: true, updatedAt: true,
  clientId: true, clientName: true, companyId: true, opportunityId: true, saleId: true,
  client: { select: { id: true, name: true, company: true, terraqoWorkspaceId: true, deletedAt: true } } } as const;

export function canChangeProjectClient(project: { clientId: string | null; companyId: string | null;
  opportunityId: string | null; saleId: string | null; client: { terraqoWorkspaceId: string | null; deletedAt: Date | null } | null }, workspaceId: string) {
  return !project.companyId && !project.opportunityId && !project.saleId &&
    (!project.clientId || (!!project.client && project.client.terraqoWorkspaceId === workspaceId && !project.client.deletedAt));
}

/** Authorization and PROJECTS entitlement are enforced by the resource gateway.
 * Public visibility and all commercial/financial relations are server-owned. */
export async function writePortalProject(token: WorkspacePortalToken, input: unknown, key: string | null, id?: string, version?: string) {
  const { clientId, ...data } = schema.parse(input);
  if (id && (!version || !z.string().datetime().safeParse(version).success))
    throw new PortalProjectWriteError("Actualiza el proyecto antes de guardarlo.", 409);
  if (!id && (!key || !/^[a-f0-9]{32}$/.test(key)))
    throw new PortalProjectWriteError("La operación necesita una clave válida.", 422);
  const projectId = id ?? createHash("sha256").update(JSON.stringify([token.workspaceId, token.sub, "projects", key])).digest("hex").slice(0, 32);
  const where = { id: projectId, terraqoWorkspaceId: token.workspaceId, deletedAt: null };
  return prisma.$transaction(async tx => {
    // Serialize portal creations per tenant so idempotency and the quota hold
    // across server instances, and an inactive tenant cannot accept the write.
    const tenant = id
      ? await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "icc"."TerraqoWorkspace"
        WHERE id = ${token.workspaceId} AND active = true AND "deletedAt" IS NULL FOR SHARE`
      : await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "icc"."TerraqoWorkspace"
      WHERE id = ${token.workspaceId} AND active = true AND "deletedAt" IS NULL FOR UPDATE`;
    if (tenant.length !== 1) throw new PortalProjectWriteError("Empresa no disponible.", 403);
    const current = await tx.project.findFirst({ where, select: portalProjectSelect });
    const requestedClient = clientId === undefined && id ? current?.clientId ?? null : clientId || null;
    const clientChanged = requestedClient !== (current?.clientId ?? null);
    const relations: { clientId?: string | null; clientName?: string | null } = {};
    if ((id && clientChanged) || (!id && !current)) {
      if (current && !canChangeProjectClient(current, token.workspaceId))
        throw new PortalProjectWriteError("La vinculación de este proyecto requiere el flujo comercial.", 403);
      relations.clientId = requestedClient;
      relations.clientName = null;
      if (requestedClient) {
        // Hold the client row through commit: a concurrent deletion or tenant move
        // cannot turn this access grant into a cross-company relationship.
        const clients = await tx.$queryRaw<{ id: string; name: string; company: string | null }[]>`
          SELECT id, name, company FROM "icc"."Client" WHERE id = ${requestedClient}
          AND "terraqoWorkspaceId" = ${token.workspaceId} AND "deletedAt" IS NULL FOR SHARE`;
        if (clients.length !== 1) throw new PortalProjectWriteError("Cliente no disponible para esta empresa.", 422);
        relations.clientName = clients[0].company || clients[0].name;
      }
    }
    if (id) {
      if (!current) throw new PortalProjectWriteError("Proyecto no disponible.", 404);
      if (current.isPublic || current.status === "PUBLISHED")
        throw new PortalProjectWriteError("Este proyecto requiere el flujo de publicación para editarse.", 403);
      const changed = await tx.project.updateMany({ where: { ...where, isPublic: false, status: { not: "PUBLISHED" }, updatedAt: new Date(version!) }, data: { ...data, ...relations } });
      if (changed.count !== 1) throw new PortalProjectWriteError("El proyecto cambió. Recarga antes de editar.", 409);
    } else {
      if (current) {
        const equal = Object.entries(data).every(([field, value]) => {
          const stored = current[field as keyof typeof current];
          return Array.isArray(value) ? JSON.stringify(stored) === JSON.stringify(value) : String(stored ?? "") === value;
        });
        if (!equal || requestedClient !== current.clientId) throw new PortalProjectWriteError("La clave de operación ya fue utilizada con otros datos.", 409);
        return current;
      }
      if (await tx.project.count({ where: { terraqoWorkspaceId: token.workspaceId, deletedAt: null } }) >= 5000)
        throw new PortalProjectWriteError("La empresa alcanzó el límite de proyectos activos.", 409);
      await tx.project.create({ data: { id: projectId, terraqoWorkspaceId: token.workspaceId, slug: `portal-${projectId}`, ...data, ...relations, isPublic: false, isFeatured: false } });
    }
    // Operational data and its audit commit together; a failed audit rolls back.
    await tx.activityLog.create({ data: { actorId: token.sub, terraqoWorkspaceId: token.workspaceId,
      projectId, entityType: "Project", entityId: projectId, action: id ? "UPDATED" : "CREATED",
      title: id ? "Proyecto actualizado" : "Proyecto creado", metadata: { source: "portal", status: data.status } } });
    const saved = await tx.project.findFirst({ where, select: portalProjectSelect });
    if (!saved) throw new PortalProjectWriteError("Proyecto no disponible.", 404);
    return saved;
  }).catch(error => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new PortalProjectWriteError('La operación ya existe. Recarga antes de crear otro proyecto.', 409);
    throw error;
  });
}
