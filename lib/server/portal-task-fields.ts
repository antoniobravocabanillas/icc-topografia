import { z } from "zod";
import type { Prisma } from "@prisma/client";

export const dueDateSchema = z.string().refine(value => {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || +value.slice(0, 4) < 1900 || +value.slice(0, 4) > 2100) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Fecha límite no válida; utiliza AAAA-MM-DD.");
export const taskFieldsSchema = z.object({ title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(8000).default(""), status: z.enum(["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"]),
  assignedProfileId: z.string().regex(/^(?:[a-zA-Z0-9_-]{1,100})?$/).optional(),
  milestoneId: z.string().regex(/^(?:[a-zA-Z0-9_-]{1,100})?$/).optional(), dueDate: dueDateSchema.optional() }).strict();
export const taskSelect = { id: true, title: true, description: true, status: true, dueDate: true, completedAt: true, updatedAt: true,
  projectId: true, milestoneId: true,
  milestone: { select: { title: true, projectId: true, deletedAt: true, project: { select: { terraqoWorkspaceId: true, deletedAt: true } } } },
  assignedProfileId: true, assignedProfile: { select: { displayName: true, terraqoWorkspaceId: true } } } as const;
export function taskMutation(data: z.infer<typeof taskFieldsSchema>) {
  return { title: data.title, description: data.description, status: data.status,
    ...(data.assignedProfileId === undefined ? {} : { assignedProfileId: data.assignedProfileId || null }),
    ...(data.milestoneId === undefined ? {} : { milestoneId: data.milestoneId || null }),
    ...(data.dueDate === undefined ? {} : { dueDate: data.dueDate ? new Date(`${data.dueDate}T00:00:00.000Z`) : null }) };
}
export async function lockTaskMilestone(tx: Prisma.TransactionClient, workspaceId: string, projectId: string, milestoneId: string) {
  // Caller holds the parent project lock. The milestone row stays in this
  // project and cannot be retired while the task relationship commits.
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT m.id FROM "icc"."Milestone" m
    JOIN "icc"."Project" p ON p.id=m."projectId"
    WHERE m.id=${milestoneId} AND m."projectId"=${projectId} AND m."deletedAt" IS NULL
      AND p."terraqoWorkspaceId"=${workspaceId} AND p."deletedAt" IS NULL FOR SHARE OF m`;
  return rows.length === 1;
}
export async function lockTaskAssignee(tx: Prisma.TransactionClient, workspaceId: string, profileId: string) {
  // Holding a shared row lock keeps the active tenant/profile check valid until
  // the task write commits, including concurrent staff deactivation or movement.
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "icc"."StaffProfile"
    WHERE id = ${profileId} AND "terraqoWorkspaceId" = ${workspaceId} AND active = true FOR SHARE`;
  return rows.length === 1;
}
