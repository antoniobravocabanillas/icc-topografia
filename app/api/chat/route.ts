import { issueCustomerChatAccess, requireCustomerChatAccess } from "@/lib/server/customer-chat-access";
import { postCustomerChat, PublicChatError } from "@/lib/server/public-customer-chat";
import { readBoundedRequestBytes, BoundedRequestBodyError } from "@/lib/server/bounded-request-body";
import { assertMultipartPartLimits } from "@/lib/server/bounded-multipart";
import { NextResponse } from "next/server";
import { customerChatHistory } from "@/lib/server/customer-chat-history";
import { prisma } from "@/lib/prisma";
import { fail, handleApiError } from "@/lib/server/api";
import { resolveAttentionRequest } from "@/lib/server/resolve-attention-request";

export async function POST(request: Request) {
  try {
    const { workspaceId: terraqoWorkspaceId } = await resolveAttentionRequest(request);
    const bytes = await readBoundedRequestBytes(request, 40000);
    const contentType = request.headers.get("content-type") || "";
    try { assertMultipartPartLimits(bytes, contentType, 8); } catch { return fail("Formulario no válido", 400); }
    const form = await new Response(Buffer.from(bytes), { headers: { "content-type": contentType } }).formData();
    const input: Record<string, string> = {};
    for (const [key, value] of form.entries()) {
      if (typeof value !== "string" || key in input) return fail("Formulario no válido", 400);
      input[key] = value;
    }
    const secureVisitor = request.headers.get("x-chat-protocol") === "2";
    if (input.conversationId) requireCustomerChatAccess(request, terraqoWorkspaceId, input.conversationId);
    // Check signing configuration before committing a new conversation.
    if (!input.conversationId && secureVisitor) issueCustomerChatAccess(terraqoWorkspaceId, "preflight");
    const result = await postCustomerChat(prisma, terraqoWorkspaceId, input, secureVisitor);
    return NextResponse.json({ ...result, ...(!input.conversationId && secureVisitor ? { accessToken: issueCustomerChatAccess(terraqoWorkspaceId, result.conversationId) } : {}) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PublicChatError) return fail(error.message, error.status);
    if (error instanceof BoundedRequestBodyError) return fail("El mensaje supera el tamaño permitido o no se pudo leer.", error.status);
    return handleApiError(error);
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { workspaceId: terraqoWorkspaceId } = await resolveAttentionRequest(request);

    const id = searchParams.get("conversationId");
    if (!id || id.length > 160) return fail("conversationId requerido", 422);
    requireCustomerChatAccess(request, terraqoWorkspaceId, id);

    const conversation = await customerChatHistory(prisma, terraqoWorkspaceId, id, searchParams.get("before"));
    return NextResponse.json({ conversation }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PublicChatError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}
