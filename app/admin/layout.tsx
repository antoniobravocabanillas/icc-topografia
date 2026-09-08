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

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) redirect("/cuenta?callbackUrl=/admin");
  const role = session.user.role as Role | undefined;
  if (!role || !allowedAdminRoles.has(role)) redirect("/");
  if((await headers()).get("x-terraqo-pathname")?.startsWith("/admin/terraqo")){
    const actor=await prisma.user.findUnique({where:{id:session.user.id},select:{role:true}});
    if(actor?.role!=="SUPER_ADMIN")redirect("/admin");
    return <div className="min-h-screen bg-slate-50 text-slate-900"><SessionPresence/><header className="flex flex-wrap items-center justify-between gap-4 border-b bg-white px-6 py-5"><Link href="/admin/terraqo" className="text-xl font-bold">Terraqo <span className="text-sm font-normal text-slate-500">Administración de la plataforma</span></Link><nav className="flex flex-wrap items-center gap-5 text-sm font-semibold" aria-label="Administración de Terraqo"><Link href="/admin/terraqo">Workspaces</Link><Link href="/admin/terraqo/usuarios">Usuarios</Link><Link href="/admin/terraqo/facturacion">Facturación</Link><Link href="/admin">Entrar a un workspace</Link><SignOutButton/></nav></header>{children}</div>;
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
