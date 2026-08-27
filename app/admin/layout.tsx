import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { AdminNavigation } from "@/components/admin/admin-navigation";
import { AdminNotificationMonitor } from "@/components/admin/admin-notification-monitor";
import { allowedAdminRoles, getAdminNavigation } from "@/lib/admin-navigation";
import { getAdminWorkspaceOptions, getWorkspaceForUser, hasWorkspaceAdminAccess } from "@/lib/terraqo/workspace-access";
import { resolveWorkspaceVisualIdentity } from "@/lib/terraqo/workspace-visual-identity";
import { prisma } from "@/lib/prisma";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) redirect("/cuenta?callbackUrl=/admin");
  const role = session.user.role as Role | undefined;
  if (!role || !allowedAdminRoles.has(role)) redirect("/");
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
    </div>
  );
}
