import type { PrismaClient } from "@prisma/client";
import { attentionState, attentionAvailability, type AttentionConfig } from "../terraqo/customer-attention-config";
import { PublicChatError } from "./public-customer-chat";

/** Domain policy is installation control, never authorization to a conversation. */
export function attentionOriginAllowed(origin: string | null, requestOrigin: string, domains: string[]) {
  if (!origin) return true; // Same-origin GET/server integrations do not always send Origin.
  try {
    const source = new URL(origin);
    return source.origin === requestOrigin || (source.protocol === "https:" && domains.includes(source.hostname.toLowerCase()));
  } catch { return false; }
}

export async function loadPublicAttentionContext(db: PrismaClient, slug: string | null, defaultWorkspaceId?: string) {
  if (slug !== null && !/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)) throw new PublicChatError("Empresa no disponible", 404);
  if (slug === null && !defaultWorkspaceId) throw new PublicChatError("Empresa requerida", 422);
  const workspace = await db.terraqoWorkspace.findFirst({
    where: { ...(slug !== null ? { slug } : { id: defaultWorkspaceId }), active: true, deletedAt: null },
    select: { id: true, name: true, slug: true, logoUrl: true, settings: true },
  });
  if (!workspace) throw new PublicChatError("Empresa no disponible", 404);
  const state = attentionState(workspace.settings, workspace.name);
  // An explicit embed cannot expose a draft. The old default installation remains compatible.
  if (slug !== null && !state.published) throw new PublicChatError("La empresa todavía no ha habilitado su atención pública", 404);
  return { workspaceId: workspace.id, slug: workspace.slug, logoUrl: workspace.logoUrl, published: Boolean(state.published), config: state.published || state.draft };
}

export function publicAttentionPresentation(context: Awaited<ReturnType<typeof loadPublicAttentionContext>>) {
  const { installation, displayName, greeting, topics, timezone, workingDays, opensAt, closesAt, accent, offlineMessage, privacyNotice } = context.config;
  // Draft edits must not change the legacy widget before the first publication.
  if (!context.published) return null;
  return { installation, slug: context.slug, logoUrl: context.logoUrl, displayName, greeting, topics, timezone, workingDays, opensAt, closesAt, accent, offlineMessage, privacyNotice, withinHours: attentionAvailability(context.config) } satisfies Omit<AttentionConfig, "domains" | "routing"> & { slug: string; logoUrl: string | null; withinHours: boolean };
}
