"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ElementType, ReactNode } from "react";
import {
  Bell,
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  Compass,
  FileCheck2,
  Files,
  FileText,
  Headphones,
  LayoutDashboard,
  Menu,
  MessagesSquare,
  NotebookPen,
  FolderOpen,
  StickyNote,
  Settings,
  ShieldCheck,
  UserRound,
  UsersRound
} from "lucide-react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { UserAvatar } from "@/components/terraqo/user-avatar";

type PortalShellProps = {
  children: ReactNode;
  name?: string | null;
  image?: string | null;
  headline?: string | null;
  portalType?: "professional" | "client";
};

type PortalNavItem = {
  href: string;
  label: string;
  icon: ElementType;
};

const professionalItems: PortalNavItem[] = [
  { href: "/portal", label: "Resumen", icon: LayoutDashboard },
  { href: "/portal/perfil", label: "Mi perfil", icon: UserRound },
  { href: "/portal/experiencias", label: "Experiencias", icon: BriefcaseBusiness },
  { href: "/portal/postulaciones", label: "Postulaciones", icon: FileText },
  { href: "/portal/validaciones", label: "Validaciones", icon: ShieldCheck },
  { href: "/portal/documentos", label: "Documentos y datos", icon: Files },
  { href: "/portal/notas", label: "Notas", icon: StickyNote },
  { href: "/portal/archivos", label: "Archivos", icon: FolderOpen },
  { href: "/portal/oportunidades", label: "Oportunidades", icon: Compass },
  { href: "/portal/mensajes", label: "Mensajes", icon: MessagesSquare },
  { href: "/portal/bitacora", label: "Bitacora", icon: NotebookPen },
  { href: "/portal/commons", label: "Commons", icon: UsersRound },
  { href: "/portal/equipos", label: "Equipos", icon: Building2 },
  { href: "/portal/configuracion", label: "Configuracion", icon: Settings }
];

const clientItems: PortalNavItem[] = [
  { href: "/portal", label: "Resumen", icon: LayoutDashboard },
  { href: "/portal#cotizaciones", label: "Cotizaciones", icon: FileText },
  { href: "/portal#soporte", label: "Soporte", icon: Headphones },
  { href: "/portal#proyectos", label: "Proyectos", icon: BriefcaseBusiness },
  { href: "/portal#documentos", label: "Documentos", icon: FileCheck2 }
];

function isActive(pathname: string, href: string) {
  if (href.includes("#")) return false;
  const path = href.split("#")[0];
  if (path === "/portal") return pathname === "/portal";
  return pathname === path || pathname.startsWith(`${path}/`);
}

function PortalNavigation({ items, pathname }: { items: PortalNavItem[]; pathname: string }) {
  return (
    <nav className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-1" aria-label="Navegacion del portal">
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={`${item.href}-${item.label}`}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-lg px-3.5 text-sm font-semibold transition-colors ${
              active
                ? "bg-[#e8f6f5] text-[#008f87]"
                : "text-[#314b57] hover:bg-[#f1f6f5] hover:text-[#07323a]"
            }`}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function PortalShell({ children, name, image, headline, portalType = "professional" }: PortalShellProps) {
  const pathname = usePathname();
  const items = portalType === "professional" ? professionalItems : clientItems;
  const portalLabel = portalType === "professional" ? "Portal profesional" : "Portal del cliente";

  return (
    <div className="min-h-screen bg-[#f7faf9] text-[#0b202b]">
      <header className="sticky top-0 z-50 border-b border-[#dce7e5] bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-[1720px] items-center gap-4 px-4 sm:px-6 xl:px-8">
          <Link href="/portal" className="flex min-w-0 items-center gap-3" aria-label="Ir al resumen del portal">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#063b3f] font-mono text-sm font-bold text-[#65e3d8]">TQ</span>
            <span className="hidden min-w-0 sm:block">
              <b className="block truncate font-display text-base text-[#092b34]">Portal Terraqo</b>
              <small className="block truncate text-xs text-[#68808a]">{portalLabel}</small>
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <Link href="/portal/mensajes" className="relative grid h-10 w-10 place-items-center rounded-lg border border-[#dce7e5] text-[#38515c] transition hover:bg-[#edf7f6] hover:text-primary" aria-label="Abrir mensajes">
              <MessagesSquare className="h-[18px] w-[18px]" />
            </Link>
            <Link href="/portal#actividad" className="relative grid h-10 w-10 place-items-center rounded-lg border border-[#dce7e5] text-[#38515c] transition hover:bg-[#edf7f6] hover:text-primary" aria-label="Ver actividad reciente">
              <Bell className="h-[18px] w-[18px]" />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
            </Link>
            <div className="hidden h-9 w-px bg-[#dce7e5] sm:block" />
            <div className="flex min-w-0 items-center gap-2.5">
              <UserAvatar name={name} image={image} size="md" />
              <span className="hidden max-w-48 min-w-0 lg:block">
                <b className="block truncate text-sm">{name || "Cuenta Terraqo"}</b>
                <small className="block truncate text-xs text-[#6b818a]">{headline || portalLabel}</small>
              </span>
            </div>
            <SignOutButton className="hidden xl:inline-flex" />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1720px] px-4 sm:px-6 xl:px-8">
        <details className="group mt-4 rounded-lg border border-[#dce7e5] bg-white p-2 shadow-[0_10px_30px_rgba(15,59,67,0.05)] xl:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-md px-3 font-semibold text-[#183640]">
            <span className="flex items-center gap-2"><Menu className="h-4 w-4" />Navegacion</span>
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t px-1 pt-2">
            <PortalNavigation items={items} pathname={pathname} />
          </div>
        </details>

        <div className="grid min-h-[calc(100vh-76px)] gap-7 xl:grid-cols-[250px_minmax(0,1fr)] xl:gap-9">
          <aside className="hidden border-r border-[#dce7e5] pr-6 pt-8 xl:block">
            <div className="sticky top-[108px]">
              <p className="mb-4 px-3 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[#008f87]">Navegacion</p>
              <PortalNavigation items={items} pathname={pathname} />
              <div className="mt-7 border-t border-[#dce7e5] pt-6">
                <a href="mailto:proyectos@icctopografia.com" className="flex items-center gap-3 rounded-lg px-3.5 py-3 text-sm font-semibold text-[#38515c] hover:bg-white hover:text-primary">
                  <Headphones className="h-[18px] w-[18px]" /> Ayuda y soporte
                </a>
                <SignOutButton className="mt-2 w-full justify-start border-0 bg-transparent px-3.5 text-[#38515c] shadow-none hover:bg-white" />
              </div>
              <div className="mt-8 rounded-lg bg-[#eaf6f4] p-4 text-sm text-[#35525c]">
                <ShieldCheck className="h-5 w-5 text-[#008f87]" />
                <p className="mt-3 font-semibold">Tu informacion esta protegida por permisos de Terraqo.</p>
              </div>
            </div>
          </aside>

          <main className="min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
