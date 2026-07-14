import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { AdminNavigation } from "@/components/admin/admin-navigation";
import { AdminNotificationMonitor } from "@/components/admin/admin-notification-monitor";
import { brand } from "@/lib/brand";
import { allowedAdminRoles, getAdminNavigation } from "@/lib/admin-navigation";
import { hasWorkspaceAdminAccess } from "@/lib/terraqo/workspace-access";
import { workspace } from "@/lib/workspace";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) redirect("/cuenta?callbackUrl=/admin");
  const role = session.user.role as Role | undefined;
  if (!role || !allowedAdminRoles.has(role)) redirect("/");
  if (!(await hasWorkspaceAdminAccess(session.user.id, role))) {
    redirect("/cuenta?error=workspace-access");
  }
  const navItems = getAdminNavigation(role).map(({ group, label, href, icon }) => ({ group, label, href, icon }));

  return (
    <div className="min-h-screen bg-[#f7f6f1]">
      <AdminNavigation
        items={navItems}
        workspaceName={workspace.name}
        panelName={workspace.currentPanel}
        brandName={brand.shortName}
        email={session.user.email ?? "Usuario Terraqo"}
        role={role}
      />
      <main className="mx-auto w-full max-w-[1680px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8 lg:py-10">
        {children}
      </main>
      <AdminNotificationMonitor />
    </div>
  );
}
