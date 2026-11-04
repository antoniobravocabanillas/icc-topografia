"use server";
import { revalidatePath } from "next/cache";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { getSessionTerraqoWorkspaceId, requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";
import { saveAttentionSettings } from "@/lib/server/customer-attention-settings";
import { prisma } from "@/lib/prisma";
import { attentionConfigSchema, type AttentionConfigState } from "@/lib/terraqo/customer-attention-config";
export async function saveSettingsAction(form: FormData): Promise<{ state?: AttentionConfigState; error?: string }> {
 const session = await requireAdminPage(["ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN", "EDITOR"]);
 const workspaceId = await getSessionTerraqoWorkspaceId();
 await requireWorkspaceModule("CUSTOMER_CHAT", workspaceId);
 const action = String(form.get("intent"));
 const raw = String(form.get("config") || "");
 if (raw.length > 12000 || !["draft", "publish", "rollback"].includes(action)) return { error: "Revisa la configuración." };
 try {
  const config = action === "draft" ? attentionConfigSchema.parse(JSON.parse(raw)) : undefined;
  const state = await saveAttentionSettings(prisma, workspaceId, session.user.id, Number(form.get("revision")), action as "draft" | "publish" | "rollback", config);
  revalidatePath("/admin/chat/configuracion");
  return { state };
 } catch (error) {
  return { error: error instanceof Error && error.message.startsWith("La configuración cambió") ? error.message : "No se pudo guardar. Revisa los campos, el horario y tus permisos de administración." };
 }
}
