import type { Prisma, PrismaClient } from "@prisma/client";
import { attentionConfigSchema, attentionState, type AttentionConfig } from "@/lib/terraqo/customer-attention-config";
import { workspaceAdminMemberRoles } from "@/lib/terraqo/workspace-roles";
export async function saveAttentionSettings(db: PrismaClient, workspaceId: string, actorId: string, expectedRevision: number, action: "draft" | "publish" | "rollback", input?: AttentionConfig) {
 if (!["draft", "publish", "rollback"].includes(action) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error("Operación no válida.");
 const config = action === "draft" ? attentionConfigSchema.parse(input) : null;
 return db.$transaction(async tx => {
  const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM icc."TerraqoWorkspace" WHERE id = ${workspaceId} AND active = true AND "deletedAt" IS NULL FOR UPDATE`;
  if (!locked.length) throw new Error("Empresa no disponible.");
  const member = await tx.terraqoWorkspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: actorId } } });
  if (!member?.active || !workspaceAdminMemberRoles.includes(member.role)) throw new Error("Solo un administrador de esta empresa puede cambiar la atención.");
  const workspace = await tx.terraqoWorkspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { settings: true, name: true, brandName: true } });
  const previous = attentionState(workspace.settings, workspace.brandName || workspace.name);
  if (previous.revision !== expectedRevision) throw new Error("La configuración cambió. Actualiza antes de guardar.");
  if (action === "rollback" && !previous.previous) throw new Error("Todavía no hay una publicación anterior.");
  const next = { ...previous, revision: previous.revision + 1,
    ...(action === "draft" ? { draft: config! } : action === "publish" ? { published: previous.draft, previous: previous.published, publishedAt: new Date().toISOString() } : { published: previous.previous!, previous: previous.published, draft: previous.previous!, publishedAt: new Date().toISOString() }),
  };
  const settings = workspace.settings && typeof workspace.settings === "object" && !Array.isArray(workspace.settings) ? workspace.settings : {};
  await tx.terraqoWorkspace.update({ where: { id: workspaceId }, data: { settings: { ...settings, customerAttention: next } as Prisma.InputJsonValue } });
  await tx.activityLog.create({ data: { terraqoWorkspaceId: workspaceId, actorId, entityType: "CustomerAttentionSettings", entityId: workspaceId, action: "UPDATED", title: action === "draft" ? "Borrador de atención guardado" : action === "publish" ? "Configuración de atención publicada" : "Configuración de atención restaurada", metadata: { revision: next.revision, operation: action } } });
  return next;
 }, { isolationLevel: "ReadCommitted" });
}
