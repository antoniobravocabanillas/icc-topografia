import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { WorkspacePortalToken } from "./workspace-portal-session";
import { taskFieldsSchema, taskMutation, taskSelect, lockTaskAssignee, lockTaskMilestone } from "./portal-task-fields";

export class PortalTaskCreateError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
const schema = taskFieldsSchema.extend({ projectId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/) }).strict();
const select = { ...taskSelect, projectId: true } as const;

/** Caller enforces the active ADMIN membership and PROJECTS entitlement. */
export async function createPortalTask(token: WorkspacePortalToken, input: unknown, key: string | null) {
  const parsed = schema.parse(input);
  const data = { ...taskMutation(parsed), assignedProfileId: parsed.assignedProfileId || null,
    milestoneId: parsed.milestoneId || null,
    dueDate: parsed.dueDate ? new Date(`${parsed.dueDate}T00:00:00.000Z`) : null, projectId: parsed.projectId };
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
        if (!Object.entries(data).every(([field, value]) => {
          const current = existing[field as keyof typeof existing];
          return (current instanceof Date ? current.toISOString() : String(current ?? "")) ===
            (value instanceof Date ? value.toISOString() : String(value ?? ""));
        }))
          throw new PortalTaskCreateError("La clave de operación ya fue utilizada con otros datos.", 409);
        return existing;
      }
      if (data.assignedProfileId && !await lockTaskAssignee(tx, token.workspaceId, data.assignedProfileId))
        throw new PortalTaskCreateError("Responsable no disponible para esta empresa.", 422);
      if (data.milestoneId && !await lockTaskMilestone(tx, token.workspaceId, data.projectId, data.milestoneId))
        throw new PortalTaskCreateError("Hito no disponible para este proyecto.", 422);
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
