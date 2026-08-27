"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ElementType, ReactNode } from "react";
import {
  Bell,
  BriefcaseBusiness,
  Building2,
  Compass,
  FileCheck2,
  Files,
  FileText,
  Headphones,
  LayoutDashboard,
  MessagesSquare,
  NotebookPen,
  ReceiptText,
  FolderOpen,
  Search,
  StickyNote,
  Settings,
  ShieldCheck,
  UserRound,
  UsersRound
} from "lucide-react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { UserAvatar } from "@/components/terraqo/user-avatar";
import { TerraqoLogo } from "@/components/terraqo/terraqo-logo";
import type { WorkspaceVisualIdentity } from "@/lib/terraqo/workspace-visual-identity";

type PortalShellProps = {
  children: ReactNode;
  name?: string | null;
  image?: string | null;
  headline?: string | null;
  portalType?: "professional" | "client";
  workspaceBrand?: string | null;
  workspaceLogoUrl?: string | null;
  planTier?: string | null;
  visualIdentity: WorkspaceVisualIdentity;
};

type PortalNavItem = {
  href: string;
  label: string;
  icon: ElementType;
};

const professionalItems: PortalNavItem[] = [
  { href: "/portal", label: "Resumen", icon: LayoutDashboard },
  { href: "/portal/perfil", label: "Mi perfil", icon: UserRound },
  { href: "/portal/red", label: "Red profesional", icon: Search },
  { href: "/portal/operaciones", label: "Operaciones comerciales", icon: ReceiptText },
  { href: "/portal/experiencias", label: "Experiencias", icon: BriefcaseBusiness },
  { href: "/portal/postulaciones", label: "Postulaciones", icon: FileText },
  { href: "/portal/validaciones", label: "Validaciones", icon: ShieldCheck },
  { href: "/portal/documentos", label: "Documentos y datos", icon: Files },
  { href: "/portal/notas", label: "Notas", icon: StickyNote },
  { href: "/portal/archivos", label: "Archivos", icon: FolderOpen },
  { href: "/portal/oportunidades", label: "Oportunidades", icon: Compass },
  { href: "/portal/mensajes", label: "Mensajes", icon: MessagesSquare },
  { href: "/portal/bitacora", label: "Bitácora", icon: NotebookPen },
  { href: "/portal/commons", label: "Commons", icon: UsersRound },
  { href: "/portal/equipos", label: "Equipos", icon: Building2 },
  { href: "/portal/configuracion", label: "Configuración", icon: Settings }
];

const clientItems: PortalNavItem[] = [
  { href: "/portal", label: "Resumen", icon: LayoutDashboard },
  { href: "/portal/operaciones", label: "Operaciones comerciales", icon: ReceiptText },
  { href: "/portal#cotizaciones", label: "Cotizaciones", icon: FileText },
  { href: "/portal#soporte", label: "Soporte", icon: Headphones },
  { href: "/portal#proyectos", label: "Proyectos", icon: BriefcaseBusiness },
  { href: "/portal#documentos", label: "Documentos", icon: FileCheck2 }
];

function isActive(pathname: string, href: string) {
  if (href.includes("#")) return false;
  const navPath = normalizePortalPath(href);
  const currentPath = normalizePortalPath(pathname);
  if (navPath === "/") return currentPath === "/";
  return currentPath === navPath || currentPath.startsWith(`${navPath}/`);
}

function normalizePortalPath(path: string) {
  const clean = path.split("#")[0] || "/";
  if (clean === "/portal") return "/";
  if (clean.startsWith("/portal/")) return clean.slice("/portal".length) || "/";
  return clean;
}

function PortalNavigation({
  items,
  pathname,
  primaryColor,
  accentColor,
  variant = "stack"
}: {
  items: PortalNavItem[];
  pathname: string;
  primaryColor: string;
  accentColor: string;
  variant?: "stack" | "mobile";
}) {
  const navClass =
    variant === "mobile"
      ? "flex w-max min-w-full gap-2"
      : "grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-1";

  return (
    <nav className={navClass} aria-label="Navegación del portal">
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
                ? "text-[#4374ba]"
                : "text-[#2f4154] hover:bg-[#e8eef7] hover:text-[#0e1a26]"
            } ${variant === "mobile" ? "shrink-0 border border-[#d8e0ec] bg-white/82 shadow-[0_10px_25px_rgba(15,59,67,0.04)]" : ""}`}
            style={active ? { backgroundColor: withAlpha(accentColor, "22"), color: primaryColor } : undefined}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function withAlpha(hex: string, opacity: string) {
  return `${hex}${opacity}`;
}

const planLabels: Record<string, string> = {
  FREE: "Free",
  BASIC: "Basic",
  PROFESSIONAL: "Professional",
  PREMIUM: "Premium",
  ENTERPRISE: "Enterprise"
};

export function PortalShell({ children, name, image, headline, portalType = "professional", workspaceBrand, workspaceLogoUrl, planTier, visualIdentity }: PortalShellProps) {
  const pathname = usePathname();
  const items = portalType === "professional" ? professionalItems : clientItems;
  const portalLabel = portalType === "professional" ? "Workspace personal" : "Workspace de empresa";
  const brandName = portalType === "professional" ? "Portal Terraqo" : workspaceBrand || "Portal Terraqo";
  const brandLogo = portalType === "professional" ? null : workspaceLogoUrl;
  const planLabel = planLabels[planTier || "FREE"] || planTier || "Free";
  const primaryColor = visualIdentity.primaryColor;
  const accentColor = visualIdentity.accentColor;

  return (
    <div className="min-h-screen overflow-x-hidden text-[#0e1a26]" style={{ backgroundColor: visualIdentity.backgroundColor }}>
      <header className="sticky top-0 z-50 border-b border-[#d8e0ec] bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-[1720px] items-center gap-4 px-4 sm:px-6 xl:px-8">
          <Link href="/portal" className="flex min-w-0 items-center gap-3" aria-label="Ir al resumen del portal">
            <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border bg-white p-1.5" style={{ borderColor: withAlpha(accentColor, "55") }}>
              <TerraqoLogo src={brandLogo} variant="mark" alt={brandName} className="h-full w-full" />
            </span>
            <span className="hidden min-w-0 sm:block">
              <b className="block truncate font-display text-base" style={{ color: primaryColor }}>{brandName}</b>
              <small className="block truncate text-xs text-[#607083]">{portalLabel} · Plan {planLabel}</small>
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <Link href="/portal/mensajes" className="relative grid h-10 w-10 place-items-center rounded-lg border border-[#d8e0ec] text-[#35485b] transition hover:bg-[#e8eef7] hover:text-primary" aria-label="Abrir mensajes">
              <MessagesSquare className="h-[18px] w-[18px]" />
            </Link>
            <Link href="/portal#actividad" className="relative grid h-10 w-10 place-items-center rounded-lg border border-[#d8e0ec] text-[#35485b] transition hover:bg-[#e8eef7] hover:text-primary" aria-label="Ver actividad reciente">
              <Bell className="h-[18px] w-[18px]" />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accentColor }} />
            </Link>
            <div className="hidden h-9 w-px bg-[#d8e0ec] sm:block" />
            <div className="flex min-w-0 items-center gap-2.5">
              <UserAvatar name={name} image={image} size="md" />
              <span className="hidden max-w-48 min-w-0 lg:block">
                <b className="block truncate text-sm">{name || "Cuenta Terraqo"}</b>
                <small className="block truncate text-xs text-[#607083]">{headline || portalLabel}</small>
              </span>
            </div>
            <SignOutButton className="hidden xl:inline-flex" />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1720px] px-4 sm:px-6 xl:px-8">
        <div className="sticky top-[76px] z-40 -mx-4 border-b border-[#d8e0ec] bg-white/88 px-4 py-3 shadow-[0_14px_28px_rgba(15,59,67,0.06)] backdrop-blur-xl sm:-mx-6 sm:px-6 xl:hidden">
          <div className="mb-2 flex items-center justify-between gap-4">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[#4374ba]">Navegación</p>
            <span className="truncate text-xs font-semibold text-[#607083]">{portalLabel}</span>
          </div>
          <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden">
            <PortalNavigation items={items} pathname={pathname} primaryColor={primaryColor} accentColor={accentColor} variant="mobile" />
          </div>
        </div>

        <div className="grid min-h-[calc(100vh-76px)] gap-7 xl:grid-cols-[250px_minmax(0,1fr)] xl:gap-9">
          <aside className="hidden border-r border-[#d8e0ec] pr-6 pt-8 xl:block">
            <div className="sticky top-[108px]">
              <p className="mb-4 px-3 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[#4374ba]">Navegación</p>
              <PortalNavigation items={items} pathname={pathname} primaryColor={primaryColor} accentColor={accentColor} />
              <div className="mt-7 border-t border-[#d8e0ec] pt-6">
                <a href="mailto:proyectos@icctopografia.com" className="flex items-center gap-3 rounded-lg px-3.5 py-3 text-sm font-semibold text-[#35485b] hover:bg-white hover:text-primary">
                  <Headphones className="h-[18px] w-[18px]" /> Ayuda y soporte
                </a>
                <SignOutButton className="mt-2 w-full justify-start border-0 bg-transparent px-3.5 text-[#35485b] shadow-none hover:bg-white" />
              </div>
              <div className="mt-8 rounded-lg bg-[#eaf6f4] p-4 text-sm text-[#35485b]">
                <ShieldCheck className="h-5 w-5" style={{ color: primaryColor }} />
                <p className="mt-3 font-semibold">Tu información está protegida por permisos de Terraqo.</p>
              </div>
            </div>
          </aside>

          <main className="min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
