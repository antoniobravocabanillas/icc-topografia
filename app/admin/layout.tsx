import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { SignOutButton } from "@/components/auth/sign-out-button";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { SessionPresence } from "@/components/auth/session-presence";
import { AdminNavigation } from "@/components/admin/admin-navigation";
import { AdminNotificationMonitor } from "@/components/admin/admin-notification-monitor";
import { WorkspaceWritingAssistant } from "@/components/portal/workspace-writing-assistant";
import { ClientFeatureBoundary } from "@/components/errors/client-feature-boundary";
import { allowedAdminRoles, getAdminNavigation } from "@/lib/admin-navigation";
import { getAdminWorkspaceOptions, getWorkspaceForUser, hasWorkspaceAdminAccess } from "@/lib/terraqo/workspace-access";
import { resolveWorkspaceVisualIdentity } from "@/lib/terraqo/workspace-visual-identity";
import { prisma } from "@/lib/prisma";
import { TerraqoLogo } from "@/components/terraqo/terraqo-logo";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [session, requestHeaders] = await Promise.all([auth(), headers()]);
  const requestedPath = requestHeaders.get("x-terraqo-pathname");
  const adminCallbackUrl = requestedPath?.startsWith("/admin") ? requestedPath : "/admin";

  if (!session?.user) redirect(`/cuenta?callbackUrl=${encodeURIComponent(adminCallbackUrl)}`);
  const role = session.user.role as Role | undefined;
  if (!role || !allowedAdminRoles.has(role)) redirect("/");
  if(requestedPath?.startsWith("/admin/terraqo")){
    const actor=await prisma.user.findUnique({where:{id:session.user.id},select:{role:true}});
    if(actor?.role!=="SUPER_ADMIN")redirect("/admin");
    const globalNavigation = [
      ["Centro de control", "/admin/terraqo"],
      ["Workspaces", "/admin/terraqo/workspaces"],
      ["Usuarios", "/admin/terraqo/usuarios"],
      ["Facturación", "/admin/terraqo/facturacion"],
      ["Validaciones", "/admin/terraqo/validaciones"],
      ["Reclamaciones", "/admin/terraqo/reclamaciones"]
    ] as const;
    return <div className="min-h-screen bg-[#f3f6f8] text-[#0e1a26]"><SessionPresence/><header className="sticky top-0 z-40 border-b border-white/10 bg-[#071d2a]/95 text-white shadow-[0_18px_50px_-34px_rgba(7,29,42,0.9)] backdrop-blur-xl"><div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8"><Link href="/admin/terraqo" className="flex min-h-11 items-center gap-3" aria-label="Ir al centro de control global de Terraqo"><span className="grid h-10 w-10 place-items-center rounded-xl border border-white/15 bg-white text-[#0e1a26]"><TerraqoLogo variant="mark" className="h-full w-full" /></span><span><strong className="block font-display text-lg leading-none">Terraqo</strong><small className="mt-1 block text-[10px] font-bold uppercase tracking-[0.16em] text-[#7cd8d0]">Control global</small></span></Link><div className="flex items-center gap-2"><Link href="/admin?view=workspace" className="inline-flex min-h-11 items-center rounded-lg border border-white/18 px-3 text-xs font-bold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7cd8d0]">Entrar a un workspace</Link><SignOutButton className="min-h-11 border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white" /></div></div><nav className="mx-auto flex max-w-[1680px] gap-1 overflow-x-auto px-4 pb-3 sm:px-6 lg:px-8" aria-label="Administración global de Terraqo">{globalNavigation.map(([label, href]) => {
      const isActive = requestedPath === href || (href !== "/admin/terraqo" && requestedPath?.startsWith(`${href}/`));
      return <Link key={href} href={href} aria-current={isActive ? "page" : undefined} className={`inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7cd8d0] ${isActive ? "bg-white text-[#071d2a]" : "text-white/72 hover:bg-white/8 hover:text-white"}`}>{label}</Link>;
    })}</nav></header><main className="mx-auto w-full max-w-[1680px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">{children}</main></div>;
  }
  if (!(await hasWorkspaceAdminAccess(session.user.id, role))) {
    redirect("/cuenta?error=workspace-access");
  }
  const activeWorkspace = await getWorkspaceForUser(session.user.id, role);
  if (!activeWorkspace) redirect("/cuenta?error=workspace-access");
  const [workspaceOptions, modules, workspaceBranding] = await Promise.all([
    getAdminWorkspaceOptions(session.user.id, role),
    prisma.terraqoWorkspaceModule.findMany({ where: { workspaceId: activeWorkspace.id, active: true }, select: { code: true } }),
    prisma.terraqoWorkspace.findUnique({
      where: { id: activeWorkspace.id },
      select: {
        name: true,
        brandName: true,
        logoUrl: true,
        settings: true,
        subscriptions: {
          where: { status: { in: ["TRIALING", "ACTIVE"] } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { tier: true }
        }
      }
    })
  ]);
  const navItems = getAdminNavigation(role, modules.map((module) => module.code)).map(({ group, label, href, icon }) => ({ group, label, href, icon }));
  const workspaceDisplayName = workspaceBranding?.brandName?.trim() || workspaceBranding?.name || activeWorkspace.name;
  const visualIdentity = resolveWorkspaceVisualIdentity(workspaceBranding?.settings);

  return (
    <><SessionPresence />
    <div className="min-h-screen" style={{ backgroundColor: visualIdentity.backgroundColor }}>
      <AdminNavigation
        items={navItems}
        workspaceName="Terraqo Workspace"
        panelName={`Panel ${workspaceDisplayName}`}
        brandName={workspaceDisplayName}
        logoUrl={workspaceBranding?.logoUrl}
        planTier={workspaceBranding?.subscriptions[0]?.tier || "FREE"}
        visualIdentity={visualIdentity}
        email={session.user.email ?? "Usuario Terraqo"}
        role={role}
        activeWorkspaceId={activeWorkspace.id}
        workspaceOptions={workspaceOptions}
      />
      <main className="mx-auto w-full max-w-[1680px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8 lg:py-10">
        {children}
      </main>
      <AdminNotificationMonitor />
      {modules.some((module) => module.code === "AI_WRITING_ASSISTANT") ? <ClientFeatureBoundary feature="writing-assistant"><WorkspaceWritingAssistant /></ClientFeatureBoundary> : null}
    </div>
    </>
  );
}
