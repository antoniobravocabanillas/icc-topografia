import { publicRequestOrigin } from "./request-origin";
import { prisma } from "@/lib/prisma";
import { getDefaultTerraqoWorkspaceId, hasWorkspaceModule } from "@/lib/terraqo/workspace-scope";
import { attentionOriginAllowed, loadPublicAttentionContext } from "./public-attention-context";
import { PublicChatError } from "./public-customer-chat";

export async function resolveAttentionRequest(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get("workspace");
  const context = await loadPublicAttentionContext(prisma, slug, slug === null ? await getDefaultTerraqoWorkspaceId() : undefined);
  if (!(await hasWorkspaceModule("CUSTOMER_CHAT", context.workspaceId))) throw new PublicChatError("Atención no disponible", 403);
  if (!attentionOriginAllowed(request.headers.get("origin"), publicRequestOrigin(request, url.origin), context.published ? context.config.domains : [])) throw new PublicChatError("Sitio no autorizado para esta atención", 403);
  return context;
}
