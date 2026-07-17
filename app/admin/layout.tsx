import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { AdminNavigation } from "@/components/admin/admin-navigation";
import { AdminNotificationMonitor } from "@/components/admin/admin-notification-monitor";
import { brand } from "@/lib/brand";
import { allowedAdminRoles, getAdminNavigation } from "@/lib/admin-navigation";
import { getAdminWorkspaceOptions, getWorkspaceForUser, hasWorkspaceAdminAccess } from "@/lib/terraqo/workspace-access";
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
  const [workspaceOptions, modules] = await Promise.all([
    getAdminWorkspaceOptions(session.user.id, role),
    prisma.terraqoWorkspaceModule.findMany({ where: { workspaceId: activeWorkspace.id, active: true }, select: { code: true } })
  ]);
  const navItems = getAdminNavigation(role, modules.map((module) => module.code)).map(({ group, label, href, icon }) => ({ group, label, href, icon }));

  return (
    <div className="min-h-screen bg-[#f7f6f1]">
      <AdminNavigation
        items={navItems}
        workspaceName={role === "SUPER_ADMIN" ? "Terraqo Platform" : "Terraqo Workspace"}
        panelName={role === "SUPER_ADMIN" ? "Control global Terraqo" : `Panel ${activeWorkspace.name}`}
        brandName={role === "SUPER_ADMIN" ? activeWorkspace.name : brand.shortName}
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
