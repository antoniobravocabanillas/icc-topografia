import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { getSessionTerraqoWorkspaceId, requireWorkspaceModule } from "@/lib/terraqo/workspace-scope";
import { prisma } from "@/lib/prisma";
import { attentionState } from "@/lib/terraqo/customer-attention-config";
import { AttentionSettings } from "@/components/admin/chat/attention-settings";
import { saveSettingsAction } from "./actions";
export const dynamic = "force-dynamic";
export default async function Page() {
 await requireAdminPage(["ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN", "EDITOR"]);
 const id = await getSessionTerraqoWorkspaceId();
 await requireWorkspaceModule("CUSTOMER_CHAT", id);
 const workspace = await prisma.terraqoWorkspace.findUniqueOrThrow({ where: { id }, select: { slug: true, settings: true, name: true, brandName: true, logoUrl: true } });
 return <section className="space-y-6"><Link href="/admin/chat" className="inline-flex min-h-11 items-center gap-2 text-sm"><ArrowLeft className="h-4 w-4" />Atención</Link><div><h1 className="font-display text-3xl font-semibold">Tu atención, a tu manera</h1><p className="mt-2 text-muted-foreground">Prepara la experiencia, revisa el resultado y publica cuando esté lista.</p></div><AttentionSettings publicUrl={new URL(`/atencion/${encodeURIComponent(workspace.slug)}`, process.env.NEXT_PUBLIC_SITE_URL || "https://terraqoglobal.com").toString()} initial={attentionState(workspace.settings, workspace.brandName || workspace.name)} saveAction={saveSettingsAction} /></section>;
}
