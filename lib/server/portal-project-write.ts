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
  status: z.enum(["PLANNING", "IN_PROGRESS", "FINISHED", "ARCHIVED"]) }).strict();
export const portalProjectSelect = { id: true, title: true, summary: true, description: true, location: true,
  category: true, servicesApplied: true, status: true, isPublic: true, updatedAt: true } as const;

/** Authorization and PROJECTS entitlement are enforced by the resource gateway.
 * Public visibility and all commercial/financial relations are server-owned. */
export async function writePortalProject(token: WorkspacePortalToken, input: unknown, key: string | null, id?: string, version?: string) {
  const data = schema.parse(input);
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
    if (id) {
      if (!current) throw new PortalProjectWriteError("Proyecto no disponible.", 404);
      if (current.isPublic || current.status === "PUBLISHED")
        throw new PortalProjectWriteError("Este proyecto requiere el flujo de publicación para editarse.", 403);
      const changed = await tx.project.updateMany({ where: { ...where, isPublic: false, status: { not: "PUBLISHED" }, updatedAt: new Date(version!) }, data });
      if (changed.count !== 1) throw new PortalProjectWriteError("El proyecto cambió. Recarga antes de editar.", 409);
    } else {
      if (current) {
        const equal = Object.entries(data).every(([field, value]) => {
          const stored = current[field as keyof typeof current];
          return Array.isArray(value) ? JSON.stringify(stored) === JSON.stringify(value) : String(stored ?? "") === value;
        });
        if (!equal) throw new PortalProjectWriteError("La clave de operación ya fue utilizada con otros datos.", 409);
        return current;
      }
      if (await tx.project.count({ where: { terraqoWorkspaceId: token.workspaceId, deletedAt: null } }) >= 5000)
        throw new PortalProjectWriteError("La empresa alcanzó el límite de proyectos activos.", 409);
      await tx.project.create({ data: { id: projectId, terraqoWorkspaceId: token.workspaceId, slug: `portal-${projectId}`, ...data, isPublic: false, isFeatured: false } });
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
