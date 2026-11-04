import { notFound } from "next/navigation";
import { ChatWidget } from "@/components/chat/chat-widget";
import { prisma } from "@/lib/prisma";
import { loadPublicAttentionContext, publicAttentionPresentation } from "@/lib/server/public-attention-context";
import { hasWorkspaceModule } from "@/lib/terraqo/workspace-scope";
import { PublicChatError } from "@/lib/server/public-customer-chat";
export const dynamic = "force-dynamic";
export const metadata = { title: "Atención al cliente", robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const context = await loadPublicAttentionContext(prisma, workspaceSlug).catch(error => { if (error instanceof PublicChatError && error.status === 404) notFound(); throw error; });
  if (!(await hasWorkspaceModule("CUSTOMER_CHAT", context.workspaceId))) notFound();
  const presentation = publicAttentionPresentation(context);
  if (!presentation) notFound();
  return <main className="mx-auto min-h-dvh max-w-2xl px-4 py-6 sm:py-12"><h1 className="mb-5 font-display text-2xl font-semibold">Habla con {presentation.displayName}</h1><ChatWidget workspaceSlug={workspaceSlug} inline initialPresentation={presentation} /><p className="mt-5 text-center text-xs text-muted-foreground">Atención de {presentation.displayName} · Tecnología Terraqo</p></main>;
}
