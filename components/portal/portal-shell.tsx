"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ElementType, type ReactNode } from "react";
import {
  Award,
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
  UsersRound,
  ChevronDown,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { WorkspaceWritingAssistant } from "@/components/portal/workspace-writing-assistant";
import { ClientFeatureBoundary } from "@/components/errors/client-feature-boundary";
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
  writingAssistantEnabled?: boolean;
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
  { href: "/portal/recompensas", label: "Terraqo Builders", icon: Award },
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
  variant = "stack",
  collapsed = false
}: {
  items: PortalNavItem[];
  pathname: string;
  primaryColor: string;
  accentColor: string;
  variant?: "stack" | "mobile";
  collapsed?: boolean;
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
            title={collapsed ? item.label : undefined}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 items-center rounded-lg text-sm font-semibold transition-colors ${collapsed ? "justify-center px-2" : "gap-3 px-3.5"} ${
              active
                ? "text-[#4374ba]"
                : "text-[#2f4154] hover:bg-[#e8eef7] hover:text-[#0e1a26]"
            } ${variant === "mobile" ? "shrink-0 border border-[#d8e0ec] bg-white/82 shadow-[0_10px_25px_rgba(15,59,67,0.04)]" : ""}`}
            style={active ? { backgroundColor: withAlpha(accentColor, "22"), color: primaryColor } : undefined}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            <span className={collapsed ? "sr-only" : undefined}>{item.label}</span>
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

export function PortalShell({ children, name, image, headline, portalType = "professional", workspaceBrand, workspaceLogoUrl, planTier, writingAssistantEnabled = false, visualIdentity }: PortalShellProps) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const items = portalType === "professional" ? professionalItems : clientItems;
  const portalLabel = portalType === "professional" ? "Workspace personal" : "Workspace de empresa";
  const brandName = portalType === "professional" ? "Portal Terraqo" : workspaceBrand || "Portal Terraqo";
  const brandLogo = portalType === "professional" ? null : workspaceLogoUrl;
  const planLabel = planLabels[planTier || "FREE"] || planTier || "Free";
  const primaryColor = visualIdentity.primaryColor;
  const accentColor = visualIdentity.accentColor;
  const mobilePrimaryItems = portalType === "professional"
    ? professionalItems.filter((item) => ["/portal", "/portal/experiencias", "/portal/bitacora", "/portal/red"].includes(item.href))
    : clientItems.slice(0, 4);
  const mobileMoreItems = items.filter((item) => !mobilePrimaryItems.some((primary) => primary.href === item.href));

  useEffect(() => {
    setSidebarCollapsed(window.localStorage.getItem("terraqo:portal-sidebar") === "collapsed");
  }, []);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      document.querySelectorAll<HTMLDetailsElement>("details[data-portal-popover][open]").forEach((popover) => {
        if (!popover.contains(event.target as Node)) popover.open = false;
      });
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  function closePopover(event: React.MouseEvent<HTMLElement>) {
    const interactive = (event.target as HTMLElement).closest("a,button");
    if (interactive) event.currentTarget.closest("details")?.removeAttribute("open");
  }

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("terraqo:portal-sidebar", next ? "collapsed" : "expanded");
      return next;
    });
  }

  return (
    <div className="min-h-screen overflow-x-hidden text-[#0e1a26]" style={{ backgroundColor: visualIdentity.backgroundColor }}>
      <header className="sticky top-0 z-50 border-b border-[#d8e0ec] bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1720px] items-center gap-4 px-4 sm:h-[76px] sm:px-6 xl:px-8">
          <Link href="/portal" className="flex min-w-0 items-center gap-3" aria-label="Ir al resumen del portal">
            <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border bg-white p-1.5" style={{ borderColor: withAlpha(accentColor, "55") }}>
              <TerraqoLogo src={brandLogo} variant="mark" alt={brandName} className="h-full w-full" />
            </span>
            <span className="hidden min-w-0 sm:block">
              <b className="block truncate font-display text-base" style={{ color: primaryColor }}>{brandName}</b>
              <small className="block truncate text-xs text-[#607083]">{portalLabel} · Plan {planLabel}</small>
            </span>
          </Link>

          {portalType === "professional" ? (
            <form action="/portal/red" method="get" role="search" className="mx-auto hidden min-w-0 max-w-2xl flex-1 md:block">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#607083]" />
                <input name="q" type="search" placeholder="Buscar profesionales, empresas, equipos o habilidades..." className="h-11 w-full rounded-full border border-[#d8e0ec] bg-[#f6f8fa] pl-11 pr-4 text-sm font-medium text-[#2f4154] outline-none transition focus:border-primary/45 focus:bg-white focus:ring-4 focus:ring-primary/10" />
              </label>
            </form>
          ) : null}

          <div className="ml-auto flex items-center gap-2 sm:gap-3 md:ml-0">
            <Link href="/portal/mensajes" className="relative grid h-10 w-10 place-items-center rounded-lg border border-[#d8e0ec] text-[#35485b] transition hover:bg-[#e8eef7] hover:text-primary" aria-label="Abrir mensajes">
              <MessagesSquare className="h-[18px] w-[18px]" />
            </Link>
            <Link href="/portal#actividad" className="relative grid h-10 w-10 place-items-center rounded-lg border border-[#d8e0ec] text-[#35485b] transition hover:bg-[#e8eef7] hover:text-primary" aria-label="Ver actividad reciente">
              <Bell className="h-[18px] w-[18px]" />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accentColor }} />
            </Link>
            <div className="hidden h-9 w-px bg-[#d8e0ec] sm:block" />
            <details data-portal-popover className="group relative">
              <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-lg px-1.5 py-1 transition hover:bg-[#eef3f7] [&::-webkit-details-marker]:hidden">
                <UserAvatar name={name} image={image} size="md" />
                <span className="hidden max-w-48 min-w-0 lg:block">
                  <b className="block truncate text-sm">{name || "Cuenta Terraqo"}</b>
                  <small className="block truncate text-xs text-[#607083]">{headline || portalLabel}</small>
                </span>
                <ChevronDown className="hidden h-4 w-4 text-[#607083] transition group-open:rotate-180 sm:block" />
              </summary>
              <div onClick={closePopover} className="fixed inset-x-3 top-[72px] z-50 rounded-2xl border border-[#d8e0ec] bg-white p-3 shadow-[0_24px_65px_rgba(14,26,38,0.22)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+10px)] sm:w-72 sm:rounded-xl sm:p-2">
                <div className="border-b border-[#e7ecf2] px-3 py-2.5">
                  <p className="truncate text-sm font-bold">{name || "Cuenta Terraqo"}</p>
                  <p className="mt-0.5 truncate text-xs text-[#607083]">{headline || `${portalLabel} · Plan ${planLabel}`}</p>
                </div>
                {portalType === "professional" ? <Link href="/portal/perfil" className="mt-1 flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-[#35485b] hover:bg-[#eef3f7]"><UserRound className="h-4 w-4" /> Mi perfil</Link> : null}
                <Link href="/portal/configuracion" className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-[#35485b] hover:bg-[#eef3f7]"><Settings className="h-4 w-4" /> Configuración</Link>
                <SignOutButton className="mt-1 w-full justify-start border-0 bg-transparent px-3 text-[#b42318] shadow-none hover:bg-[#fff1f0] hover:text-[#b42318]" />
              </div>
            </details>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1720px] px-4 sm:px-6 xl:px-8">
        <div className="sticky top-[76px] z-40 -mx-4 hidden border-b border-[#d8e0ec] bg-white/88 px-4 py-3 shadow-[0_14px_28px_rgba(15,59,67,0.06)] backdrop-blur-xl sm:-mx-6 sm:px-6 md:block xl:hidden">
          <div className="mb-2 flex items-center justify-between gap-4">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[#4374ba]">Navegación</p>
            <span className="truncate text-xs font-semibold text-[#607083]">{portalLabel}</span>
          </div>
          <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden">
            <PortalNavigation items={items} pathname={pathname} primaryColor={primaryColor} accentColor={accentColor} variant="mobile" />
          </div>
        </div>

        <div className={`grid min-h-[calc(100vh-64px)] gap-5 pb-24 transition-[grid-template-columns,gap] duration-300 sm:min-h-[calc(100vh-76px)] sm:gap-7 sm:pb-0 xl:gap-7 ${sidebarCollapsed ? "xl:grid-cols-[76px_minmax(0,1fr)]" : "xl:grid-cols-[250px_minmax(0,1fr)] xl:gap-9"}`}>
          <aside className={`hidden border-r border-[#d8e0ec] pt-6 transition-[padding] duration-300 xl:block ${sidebarCollapsed ? "pr-3" : "pr-6"}`}>
            <div className="sticky top-[108px]">
              <div className={`mb-4 flex items-center ${sidebarCollapsed ? "justify-center" : "justify-between gap-3 px-3"}`}>
                <p className={sidebarCollapsed ? "sr-only" : "font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[#4374ba]"}>Navegación</p>
                <button type="button" onClick={toggleSidebar} title={sidebarCollapsed ? "Expandir navegación" : "Contraer navegación"} aria-label={sidebarCollapsed ? "Expandir navegación" : "Contraer navegación"} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#d8e0ec] bg-white text-[#35485b] shadow-sm transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary">
                  {sidebarCollapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
                </button>
              </div>
              <PortalNavigation items={items} pathname={pathname} primaryColor={primaryColor} accentColor={accentColor} collapsed={sidebarCollapsed} />
              <div className="mt-7 border-t border-[#d8e0ec] pt-6">
                <a href="mailto:proyectos@icctopografia.com" title={sidebarCollapsed ? "Ayuda y soporte" : undefined} className={`flex min-h-11 items-center rounded-lg text-sm font-semibold text-[#35485b] hover:bg-white hover:text-primary ${sidebarCollapsed ? "justify-center px-2" : "gap-3 px-3.5 py-3"}`}>
                  <Headphones className="h-[18px] w-[18px]" /> <span className={sidebarCollapsed ? "sr-only" : undefined}>Ayuda y soporte</span>
                </a>
                <SignOutButton iconOnly={sidebarCollapsed} className={`mt-2 w-full border-0 bg-transparent text-[#35485b] shadow-none hover:bg-white ${sidebarCollapsed ? "justify-center px-2" : "justify-start px-3.5"}`} />
              </div>
              <div className={`mt-8 rounded-lg bg-[#eaf6f4] text-sm text-[#35485b] ${sidebarCollapsed ? "grid place-items-center p-3" : "p-4"}`} title={sidebarCollapsed ? "Tu información está protegida por permisos de Terraqo." : undefined}>
                <ShieldCheck className="h-5 w-5" style={{ color: primaryColor }} />
                <p className={sidebarCollapsed ? "sr-only" : "mt-3 font-semibold"}>Tu información está protegida por permisos de Terraqo.</p>
              </div>
            </div>
          </aside>

          <main className="min-w-0">{children}</main>
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[#d8e0ec] bg-white/95 px-[max(0.5rem,env(safe-area-inset-left))] pb-[max(0.45rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-12px_35px_rgba(14,26,38,0.12)] backdrop-blur-xl md:hidden" aria-label="Navegación móvil del portal">
        <div className="mx-auto grid max-w-lg grid-cols-5 gap-1">
          {mobilePrimaryItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-bold" style={active ? { backgroundColor: withAlpha(accentColor, "18"), color: primaryColor } : { color: "#607083" }}><Icon className="h-5 w-5" /><span className="max-w-full truncate">{item.label === "Experiencias" ? "Experiencia" : item.label}</span></Link>;
          })}
          <details data-portal-popover className="group relative">
            <summary className="flex min-h-14 cursor-pointer list-none flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-bold text-[#607083] [&::-webkit-details-marker]:hidden"><MoreHorizontal className="h-5 w-5" /><span>Más</span></summary>
            <div onClick={closePopover} className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] grid max-h-[calc(100dvh-7rem)] grid-cols-2 gap-2 overflow-y-auto rounded-2xl border border-[#d8e0ec] bg-white p-3 shadow-[0_24px_70px_rgba(14,26,38,0.24)]">
              {mobileMoreItems.map((item) => { const Icon = item.icon; const active = isActive(pathname, item.href); return <Link key={item.href} href={item.href} className="flex min-h-12 items-center gap-2 rounded-xl px-3 text-xs font-semibold" style={active ? { backgroundColor: withAlpha(accentColor, "18"), color: primaryColor } : { color: "#35485b" }}><Icon className="h-4 w-4 shrink-0" />{item.label}</Link>; })}
              <SignOutButton className="col-span-2 mt-1 w-full justify-start border-0 bg-[#fff1f0] px-3 text-[#b42318] shadow-none" />
            </div>
          </details>
        </div>
      </nav>
      {writingAssistantEnabled ? <ClientFeatureBoundary feature="writing-assistant"><WorkspaceWritingAssistant /></ClientFeatureBoundary> : null}
    </div>
  );
}
