import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { WorkspacePortalToken } from "./workspace-portal-session";

export class PortalTaskCreateError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
const schema = z.object({ projectId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  title: z.string().trim().min(1).max(160), description: z.string().trim().max(8000).default(""),
  status: z.enum(["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"]) }).strict();
const select = { id: true, projectId: true, title: true, description: true, status: true,
  dueDate: true, completedAt: true, updatedAt: true } as const;

/** Caller enforces the active ADMIN membership and PROJECTS entitlement. */
export async function createPortalTask(token: WorkspacePortalToken, input: unknown, key: string | null) {
  const data = schema.parse(input);
  if (!key || !/^[a-f0-9]{32}$/.test(key)) throw new PortalTaskCreateError("La operación necesita una clave válida.", 422);
  const id = createHash("sha256").update(JSON.stringify([token.workspaceId, token.sub, "tasks", key])).digest("hex").slice(0, 32);
  try {
    return await prisma.$transaction(async tx => {
      // The project lock serializes creations across instances and protects the
      // quota/parent check. The SQL parameters are bound, never interpolated SQL.
      const parent = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "icc"."Project"
        WHERE id = ${data.projectId} AND "terraqoWorkspaceId" = ${token.workspaceId}
          AND "deletedAt" IS NULL FOR UPDATE`;
      if (parent.length !== 1) throw new PortalTaskCreateError("Proyecto no disponible.", 404);
      const existing = await tx.task.findFirst({ where: { id, deletedAt: null,
        project: { terraqoWorkspaceId: token.workspaceId, deletedAt: null } }, select });
      if (existing) {
        if (!Object.entries(data).every(([field, value]) => String(existing[field as keyof typeof existing] ?? "") === value))
          throw new PortalTaskCreateError("La clave de operación ya fue utilizada con otros datos.", 409);
        return existing;
      }
      if (await tx.task.count({ where: { projectId: data.projectId, deletedAt: null } }) >= 5000)
        throw new PortalTaskCreateError("Este proyecto alcanzó el límite de tareas activas.", 409);
      const saved = await tx.task.create({ data: { id, ...data, completedAt: data.status === "DONE" ? new Date() : null }, select });
      // Creation and audit must either both commit or both roll back.
      await tx.activityLog.create({ data: { actorId: token.sub, terraqoWorkspaceId: token.workspaceId,
        projectId: data.projectId, taskId: id, entityType: "Task", entityId: id,
        action: "CREATED", title: "Tarea creada", metadata: { source: "portal", status: data.status } } });
      return saved;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new PortalTaskCreateError("La operación ya existe. Recarga antes de crear otra tarea.", 409);
    throw error;
  }
}
