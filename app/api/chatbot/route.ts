import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { answerWithLocalKnowledge } from "@/lib/server/chatbot";
import { fail, handleApiError } from "@/lib/server/api";
import { resolveAttentionRequest } from "@/lib/server/resolve-attention-request";
import { PublicChatError } from "@/lib/server/public-customer-chat";
import { readBoundedJson, BoundedRequestBodyError } from "@/lib/server/bounded-request-body";
import { issueCustomerChatAccess, requireCustomerChatAccess } from "@/lib/server/customer-chat-access";
import { customerBotInputSchema, postCustomerBot } from "@/lib/server/customer-chatbot";
export async function POST(request: Request) {
  try {
    const { workspaceId } = await resolveAttentionRequest(request);
    const payload = customerBotInputSchema.parse(await readBoundedJson(request, 12000));
    const secure = request.headers.get("x-chat-protocol") === "2" || Boolean(payload.conversationId?.startsWith("bot2_"));
    if (payload.conversationId) requireCustomerChatAccess(request, workspaceId, payload.conversationId);
    if (secure) issueCustomerChatAccess(workspaceId, "preflight");
    const result = await postCustomerBot(prisma, workspaceId, payload, secure, (question, tx) => answerWithLocalKnowledge(question, workspaceId, tx));
    return NextResponse.json({ ...result, ...(secure ? { botAccessToken: issueCustomerChatAccess(workspaceId, result.conversationId), ...(result.escalatedChatId ? { accessToken: issueCustomerChatAccess(workspaceId, result.escalatedChatId) } : {}) } : {}) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PublicChatError) return fail(error.message, error.status);
    if (error instanceof BoundedRequestBodyError) return fail("La consulta no pudo leerse o supera el tamaño permitido.", error.status);
    return handleApiError(error);
  }
}
