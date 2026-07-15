"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { sendMessage, startConversation } from "@/lib/terraqo/messaging";

const allowedPaths = new Set(["/portal/mensajes", "/admin/terraqo/mensajes"]);

function safePath(path: string) {
  return allowedPaths.has(path) ? path : "/portal/mensajes";
}

export async function startConversationAction(basePath: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/cuenta");
  const conversation = await startConversation({
    actorUserId: session.user.id,
    recipientUserId: String(formData.get("recipientUserId") || ""),
    workspaceId: String(formData.get("workspaceId") || "") || undefined,
    projectId: String(formData.get("projectId") || "") || undefined
  });
  redirect(`${safePath(basePath)}?conversation=${conversation.id}`);
}

export async function sendMessageAction(basePath: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/cuenta");
  const conversationId = String(formData.get("conversationId") || "");
  await sendMessage({ userId: session.user.id, conversationId, body: String(formData.get("body") || "") });
  revalidatePath(safePath(basePath));
  redirect(`${safePath(basePath)}?conversation=${conversationId}`);
}
