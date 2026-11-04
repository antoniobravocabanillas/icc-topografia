import { NextResponse } from "next/server";
import { resolveAttentionRequest } from "@/lib/server/resolve-attention-request";
import { publicAttentionPresentation } from "@/lib/server/public-attention-context";
import { PublicChatError } from "@/lib/server/public-customer-chat";
import { fail, handleApiError } from "@/lib/server/api";

export async function GET(request: Request) {
  try {
    return NextResponse.json({ config: publicAttentionPresentation(await resolveAttentionRequest(request)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PublicChatError) return fail(error.message, error.status);
    return handleApiError(error);
  }
}
