import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdminNotificationMonitor } from "@/components/admin/admin-notification-monitor";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { brand } from "@/lib/brand";
import { workspace } from "@/lib/workspace";

const adminNav = [
  { group: "Workspace", label: "Inicio", href: "/admin", roles: ["TECHNICIAN", "SALES", "EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN", "SURVEYOR", "ENGINEER", "ARCHITECT", "SUPPORT"] },
  { group: "Comercial", label: "Leads", href: "/admin/leads", roles: ["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"] },
  { group: "Comercial", label: "Oportunidades", href: "/admin/oportunidades", roles: ["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"] },
  { group: "Comercial", label: "Cotizaciones", href: "/admin/cotizaciones", roles: ["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"] },
  { group: "Comercial", label: "Clientes 360", href: "/admin/clientes", roles: ["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN", "SUPPORT"] },
  { group: "Comercial", label: "Ventas", href: "/admin/ventas", roles: ["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"] },
  { group: "Operacion", label: "Proyectos", href: "/admin/proyectos", roles: ["EDITOR", "ADMIN", "SUPER_ADMIN", "SURVEYOR", "ENGINEER", "ARCHITECT"] },
  { group: "Operacion", label: "Tecnicos", href: "/admin/tecnicos", roles: ["ADMIN", "SUPER_ADMIN", "ENGINEER", "SURVEYOR", "ARCHITECT", "SUPPORT"] },
  { group: "Soporte", label: "Tickets", href: "/admin/tickets", roles: ["SUPPORT", "TECHNICIAN", "SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"] },
  { group: "Catalogo", label: "Productos", href: "/admin/productos", roles: ["EDITOR", "ADMIN", "SUPER_ADMIN"] },
  { group: "Catalogo", label: "Pedidos", href: "/admin/pedidos", roles: ["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"] },
  { group: "Catalogo", label: "Contenidos", href: "/admin/contenidos", roles: ["EDITOR", "ADMIN", "SUPER_ADMIN"] },
  { group: "Comunicacion", label: "Chat", href: "/admin/chat", roles: ["TECHNICIAN", "SALES", "EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN", "SUPPORT"] },
  { group: "Comunicacion", label: "Chat interno", href: "/admin/chat-interno", roles: ["TECHNICIAN", "SALES", "EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN", "SURVEYOR", "ENGINEER", "ARCHITECT", "SUPPORT"] },
  { group: "Comunicacion", label: "Chatbot", href: "/admin/chatbot", roles: ["EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"] },
  { group: "Gestion", label: "Reportes", href: "/admin/reportes", roles: ["SALES", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN"] },
  { group: "Gestion", label: "Notificaciones", href: "/admin/notificaciones", roles: ["TECHNICIAN", "SALES", "EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN", "SURVEYOR", "ENGINEER", "ARCHITECT", "SUPPORT"] },
  { group: "Gestion", label: "Equipo", href: "/admin/equipo", roles: ["ADMIN", "SUPER_ADMIN"] },
  { group: "Terraqo", label: "Workspaces", href: "/admin/terraqo", roles: ["ADMIN", "SUPER_ADMIN"] },
  { group: "Terraqo", label: "Red profesional", href: "/admin/terraqo/red", roles: ["ADMIN", "SUPER_ADMIN"] },
  { group: "Terraqo", label: "Comunidad", href: "/admin/terraqo/comunidad", roles: ["ADMIN", "SUPER_ADMIN"] }
];

const allowedRoles = new Set(["TECHNICIAN", "SALES", "EDITOR", "ADMIN", "SUPER_ADMIN", "COMMERCIAL_ADMIN", "SURVEYOR", "ENGINEER", "ARCHITECT", "SUPPORT"]);

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) redirect("/cuenta?callbackUrl=/admin");
  if (!allowedRoles.has(session.user.role || "")) redirect("/");
  const navItems = adminNav.filter((item) => item.roles.includes(session.user.role || ""));
  const navGroups = Array.from(new Set(navItems.map((item) => item.group)));

  return (
    <div className="min-h-screen bg-[#f7f6f1]">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-[#063D63] p-5 text-white lg:block">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/45">{workspace.name}</p>
          <div className="mt-1 font-bold">{workspace.currentPanel}</div>
          <p className="mt-2 text-xs leading-5 text-white/60">{brand.shortName} | {session.user.email}</p>
        </div>
        <nav className="mt-6 max-h-[calc(100vh-9rem)] space-y-5 overflow-y-auto pr-1">
          {navGroups.map((group) => (
            <div key={group}>
              <p className="px-3 text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">{group}</p>
              <div className="mt-2 space-y-1">
                {navItems.filter((item) => item.group === group).map((item) => (
                  <Link key={item.href} href={item.href} className="block rounded-md px-3 py-2 text-sm text-white/72 hover:bg-white/10 hover:text-white">{item.label}</Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="absolute bottom-5 left-5 right-5">
          <SignOutButton className="w-full border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white" />
        </div>
      </aside>
      <main className="lg:pl-64">
        <div className="border-b bg-white lg:hidden">
          <div className="container py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">{workspace.name}</p>
            <p className="font-display text-xl font-bold">{workspace.currentPanel}</p>
          </div>
        </div>
        <div className="container py-10">{children}</div>
      </main>
      <AdminNotificationMonitor />
    </div>
  );
}
