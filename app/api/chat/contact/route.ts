import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, handleApiError } from "@/lib/server/api";
import { BoundedRequestBodyError, readBoundedJson } from "@/lib/server/bounded-request-body";
import { verifyCustomerChatAccess } from "@/lib/server/customer-chat-access";
import { updateCustomerChatContact } from "@/lib/server/customer-chat-contact";
import { resolveAttentionRequest } from "@/lib/server/resolve-attention-request";
import { PublicChatError } from "@/lib/server/public-customer-chat";

export async function POST(request: Request) {
  try {
    const { workspaceId } = await resolveAttentionRequest(request);
    const id = new URL(request.url).searchParams.get("conversationId");
    if (!id || id.length > 160) return fail("Conversación requerida", 422);
    if (!verifyCustomerChatAccess(request.headers.get("x-chat-access"), workspaceId, id)) return fail("Necesitas el acceso privado de esta conversación", 401);
    const result = await updateCustomerChatContact(prisma, workspaceId, id, await readBoundedJson(request, 2048));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PublicChatError) return fail(error.message, error.status);
    if (error instanceof BoundedRequestBodyError) return fail("No se pudieron leer los datos de contacto.", error.status);
    return handleApiError(error);
  }
}
