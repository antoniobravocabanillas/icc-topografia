import { NextResponse } from "next/server";
import { resolveAttentionRequest } from "@/lib/server/resolve-attention-request";
import { publicAttentionPresentation } from "@/lib/server/public-attention-context";
import { PublicChatError } from "@/lib/server/public-customer-chat";
import { fail, handleApiError } from "@/lib/server/api";

export async function GET(request: Request) {
  try {
    const context = await resolveAttentionRequest(request);
    const headers: Record<string, string> = { "Cache-Control": "no-store", Vary: "Origin" };
    // Resolve and authorize the exact origin before exposing public installation data.
    // Never enable credentials or CORS on private chat-history endpoints.
    const origin = request.headers.get("origin");
    if (context.published && origin) headers["Access-Control-Allow-Origin"] = origin;
    return NextResponse.json({ config: publicAttentionPresentation(context) }, { headers });
  } catch (error) {
    if (error instanceof PublicChatError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}
