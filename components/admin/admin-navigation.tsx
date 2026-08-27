"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bell,
  Bot,
  BriefcaseBusiness,
  Building2,
  ChartNoAxesCombined,
  ChevronDown,
  ClipboardList,
  Files,
  Headphones,
  Home,
  LayoutGrid,
  Menu,
  MessageSquareText,
  Package,
  ReceiptText,
  Search,
  ShoppingBag,
  Sparkles,
  Store,
  TicketCheck,
  UsersRound,
  Wrench,
  X
} from "lucide-react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { TerraqoLogo } from "@/components/terraqo/terraqo-logo";
import type { AdminNavIcon, AdminNavItem } from "@/lib/admin-navigation";
import { selectAdminWorkspace } from "@/lib/server/admin-workspace-actions";
import type { WorkspaceVisualIdentity } from "@/lib/terraqo/workspace-visual-identity";
import { cn } from "@/lib/utils";

type AdminNavigationProps = {
  items: Array<Omit<AdminNavItem, "roles">>;
  workspaceName: string;
  panelName: string;
  brandName: string;
  logoUrl?: string | null;
  planTier: string;
  visualIdentity: WorkspaceVisualIdentity;
  email: string;
  role: string;
  activeWorkspaceId: string;
  workspaceOptions: Array<{ id: string; name: string; slug: string }>;
};

const icons = {
  activity: Activity,
  bell: Bell,
  bot: Bot,
  briefcase: BriefcaseBusiness,
  building: Building2,
  chart: ChartNoAxesCombined,
  clipboard: ClipboardList,
  community: UsersRound,
  files: Files,
  headphones: Headphones,
  home: Home,
  messages: MessageSquareText,
  package: Package,
  receipt: ReceiptText,
  shopping: ShoppingBag,
  sparkles: Sparkles,
  store: Store,
  ticket: TicketCheck,
  users: UsersRound,
  workspace: LayoutGrid,
  wrench: Wrench
} satisfies Record<AdminNavIcon, typeof Home>;

function isRouteActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavIcon({ name, className }: { name: AdminNavIcon; className?: string }) {
  const Icon = icons[name];
  return <Icon className={className} strokeWidth={1.8} />;
}

function withAlpha(hex: string, opacity: string) {
  return `${hex}${opacity}`;
}

export function AdminNavigation({ items, workspaceName, panelName, brandName, logoUrl, planTier, visualIdentity, email, role, activeWorkspaceId, workspaceOptions }: AdminNavigationProps) {
  const pathname = usePathname();
  const shellRef = useRef<HTMLElement>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    return Array.from(new Set(items.map((item) => item.group))).map((group) => ({
      label: group,
      items: items.filter((item) => item.group === group)
    }));
  }, [items]);

  const currentItem = [...items]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => isRouteActive(pathname, item.href));

  const visibleMobileGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es");
    if (!normalizedQuery) return groups;
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.label.toLocaleLowerCase("es").includes(normalizedQuery))
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, query]);

  useEffect(() => {
    setOpenGroup(null);
    setMobileOpen(false);
    setQuery("");
  }, [pathname]);

  useEffect(() => {
    function closeMenus(event: MouseEvent) {
      if (!shellRef.current?.contains(event.target as Node)) setOpenGroup(null);
    }

    function closeWithEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpenGroup(null);
      setMobileOpen(false);
    }

    document.addEventListener("mousedown", closeMenus);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenus);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const primaryColor = visualIdentity.primaryColor;
  const accentColor = visualIdentity.accentColor;
  return (
    <header ref={shellRef} className="sticky top-0 z-40 border-b border-[#0d4d58]/12 bg-[#f7f6f1]/95 shadow-[0_16px_45px_-36px_rgba(3,38,45,0.65)] backdrop-blur-xl">
      <div className="bg-[linear-gradient(135deg,#0e1a26_0%,#0e1a26_46%,#4374ba_100%)] text-white">
        <div className="mx-auto flex min-h-[72px] max-w-[1680px] items-center justify-between gap-5 px-4 sm:px-6 lg:px-8">
          <Link href="/admin" className="group flex min-w-0 items-center gap-3" aria-label={`Ir al inicio de ${panelName}`}>
            <span
              className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-md border bg-white/95 text-xs font-black tracking-[0.08em] shadow-[0_16px_34px_-24px_rgba(0,0,0,0.75)] transition-colors"
              style={{ borderColor: withAlpha(accentColor, "66"), color: primaryColor }}
            >
              <TerraqoLogo src={logoUrl} variant="mark" alt={`Logo de ${brandName}`} className="h-full w-full" imageClassName="rounded-[5px]" />
            </span>
            <span className="min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: withAlpha(accentColor, "cc") }}>{workspaceName}</span>
              <span className="mt-0.5 block truncate font-display text-base font-bold sm:text-lg">{panelName}</span>
            </span>
          </Link>

          <div className="hidden min-w-0 items-center gap-5 md:flex">
            {role === "SUPER_ADMIN" ? (
              <form action={selectAdminWorkspace} className="flex items-center gap-2">
                <input type="hidden" name="returnTo" value={pathname} />
                <label className="sr-only" htmlFor="admin-workspace">Workspace activo</label>
                <select id="admin-workspace" name="workspaceId" defaultValue={activeWorkspaceId} className="h-10 max-w-64 rounded-md border px-3 text-sm font-semibold text-white outline-none" style={{ borderColor: withAlpha(accentColor, "40"), backgroundColor: withAlpha(primaryColor, "dd") }}>
                  {workspaceOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                </select>
                <button type="submit" className="h-10 rounded-md border px-3 text-xs font-bold transition-colors hover:bg-white/10" style={{ borderColor: withAlpha(accentColor, "55"), color: accentColor }}>Cambiar</button>
              </form>
            ) : null}
            <div className="min-w-0 text-right">
              <p className="truncate text-sm font-semibold text-white/88">{email}</p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/42">{brandName} · Plan {planTier} · {role.replaceAll("_", " ")}</p>
            </div>
            {items.some((item) => item.href === "/admin/notificaciones") ? (
              <Link href="/admin/notificaciones" className={cn("grid h-10 w-10 place-items-center rounded-md border border-white/15 text-white/70 transition-colors hover:bg-white/8", isRouteActive(pathname, "/admin/notificaciones") && "text-white")} style={isRouteActive(pathname, "/admin/notificaciones") ? { borderColor: withAlpha(accentColor, "66"), backgroundColor: withAlpha(primaryColor, "aa"), color: accentColor } : undefined} aria-label="Ver notificaciones">
                <Bell className="h-4 w-4" />
              </Link>
            ) : null}
            <SignOutButton className="border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white" />
          </div>

          <button type="button" className="grid h-11 w-11 place-items-center rounded-md border border-white/18 text-white xl:hidden" aria-expanded={mobileOpen} aria-controls="admin-mobile-navigation" aria-label={mobileOpen ? "Cerrar navegacion" : "Abrir navegacion"} onClick={() => setMobileOpen((current) => !current)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div className="hidden bg-white/92 xl:block">
        <div className="mx-auto flex min-h-[60px] max-w-[1680px] items-center justify-between gap-6 px-8">
          <nav className="flex items-center gap-1" aria-label="Modulos del panel">
            {groups.map((group) => {
              const groupIsActive = group.items.some((item) => isRouteActive(pathname, item.href));
              const singleItem = group.items.length === 1 ? group.items[0] : null;
              if (singleItem) {
                return (
                  <Link key={group.label} href={singleItem.href} className={cn("flex h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold text-[#2f4154] transition-colors hover:bg-[#e8eef7] hover:text-[#4374ba]", groupIsActive && "bg-[#e8eef7] text-[#4374ba]")}>
                    <NavIcon name={singleItem.icon} className="h-4 w-4" />
                    {singleItem.label}
                  </Link>
                );
              }

              return (
                <div key={group.label} className="relative">
                  <button type="button" className={cn("flex h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold text-[#2f4154] transition-colors hover:bg-[#e8eef7] hover:text-[#4374ba]", groupIsActive && "bg-[#e8eef7] text-[#4374ba]")} aria-expanded={openGroup === group.label} onClick={() => setOpenGroup((current) => current === group.label ? null : group.label)}>
                    {group.label}
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", openGroup === group.label && "rotate-180")} />
                  </button>
                  {openGroup === group.label ? (
                    <div className="absolute left-0 top-[calc(100%+0.45rem)] w-72 rounded-md border border-[#d8e0ec] bg-white p-2 shadow-[0_24px_70px_-32px_rgba(3,52,59,0.5)]">
                      <p className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#607083]">Modulo {group.label}</p>
                      {group.items.map((item) => (
                        <Link key={item.href} href={item.href} className={cn("flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold text-[#2f4154] transition-colors hover:bg-[#e8eef7] hover:text-[#4374ba]", isRouteActive(pathname, item.href) && "bg-[#e8eef7] text-[#4374ba]")}>
                          <span className="grid h-8 w-8 place-items-center rounded-md border border-[#d8e0ec] bg-white text-[#4374ba]">
                            <NavIcon name={item.icon} className="h-4 w-4" />
                          </span>
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </nav>
          <div className="flex shrink-0 items-center gap-3 border-l border-[#d8e0ec] pl-5">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#607083]">Vista actual</span>
            <span className="max-w-56 truncate text-sm font-bold text-[#0e1a26]">{currentItem?.label ?? "Panel"}</span>
          </div>
        </div>
      </div>

      {mobileOpen ? (
        <div id="admin-mobile-navigation" className="absolute inset-x-0 top-full z-50 h-[calc(100dvh-72px)] overflow-y-auto border-t border-white/10 bg-[#f7f6f1] xl:hidden">
          <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#607083]" />
              <span className="sr-only">Buscar una seccion</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar una seccion del panel" className="h-12 w-full rounded-md border border-[#d8e0ec] bg-white pl-10 pr-4 text-sm outline-none transition-shadow focus:ring-2 focus:ring-[#4374ba]/25" autoFocus />
            </label>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleMobileGroups.map((group) => (
                <section key={group.label} className="rounded-md border border-[#d8e0ec] bg-white p-3">
                  <h2 className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#607083]">{group.label}</h2>
                  <div className="grid gap-1">
                    {group.items.map((item) => (
                      <Link key={item.href} href={item.href} className={cn("flex min-h-12 items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold text-[#2f4154] hover:bg-[#e8eef7]", isRouteActive(pathname, item.href) && "bg-[#e8eef7] text-[#4374ba]")}>
                        <span className="grid h-8 w-8 place-items-center rounded-md border border-[#d8e0ec] text-[#4374ba]">
                          <NavIcon name={item.icon} className="h-4 w-4" />
                        </span>
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            {visibleMobileGroups.length === 0 ? (
              <div className="mt-5 rounded-md border border-dashed border-[#d8e0ec] bg-white p-8 text-center text-sm text-[#607083]">No encontramos una seccion con ese nombre.</div>
            ) : null}

            <div className="mt-5 flex flex-col gap-3 border-t border-[#d8e0ec] pt-5 md:hidden">
              {role === "SUPER_ADMIN" ? (
                <form action={selectAdminWorkspace} className="grid gap-2 rounded-md border border-[#d8e0ec] bg-white p-3">
                  <input type="hidden" name="returnTo" value={pathname} />
                  <label htmlFor="admin-workspace-mobile" className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#607083]">Workspace activo</label>
                  <select id="admin-workspace-mobile" name="workspaceId" defaultValue={activeWorkspaceId} className="h-11 rounded-md border border-[#d8e0ec] bg-white px-3 text-sm font-semibold">
                    {workspaceOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                  </select>
                  <button type="submit" className="h-11 rounded-md bg-[#4374ba] px-4 text-sm font-bold text-white">Cambiar workspace</button>
                </form>
              ) : null}
              <p className="truncate text-sm font-semibold text-[#2f4154]">{email}</p>
              <SignOutButton className="h-11 w-full border-[#d8e0ec] bg-white text-[#0e1a26] hover:bg-[#e8eef7]" />
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
