"use client";

import Link from "next/link";
import { ArrowUpRight, LogIn, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { TerraqoLogo } from "@/components/terraqo/terraqo-logo";
import { terraqoDomains } from "@/lib/terraqo-domains";

const navItems = [
  { label: "Plataforma", href: "/plataforma" },
  { label: "Producto", href: "/producto" },
  { label: "Red operativa", href: "/red" },
  { label: "Automatización", href: "/automatizacion" },
  { label: "Membresías", href: "/membresias" }
];

export function TerraqoPublicHeader({ tone = "light" }: { tone?: "light" | "dark" }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isHome = pathname === "/";
  const resolvedTone = tone === "dark" || isHome ? "dark" : "light";
  const visibleNavItems = isHome
    ? navItems.filter((item) => ["/plataforma", "/red", "/membresias"].includes(item.href))
    : navItems;

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <header className={`tq-public-header${resolvedTone === "dark" ? " tq-public-header--dark" : ""}${isHome ? " tq-public-header--home" : ""}${open ? " tq-public-header--menu-open" : ""}`}>
      <div className="tq-public-wrap tq-header-inner">
        <Link href={terraqoDomains.public} className="tq-wordmark" aria-label="Terraqo inicio">
          <TerraqoLogo tone={resolvedTone} variant="horizontal" alt="Terraqo" className="h-9 w-[145px] sm:h-10 sm:w-[170px]" />
        </Link>

        <nav className="tq-desktop-nav" aria-label="Navegación principal de Terraqo">
          {visibleNavItems.map((item) => <Link key={item.href} href={`${terraqoDomains.public}${item.href}`} aria-current={pathname === item.href ? "page" : undefined}>{isHome && item.href === "/red" ? "Red profesional" : item.label}</Link>)}
        </nav>

        <div className="tq-header-actions">
          <Link href={`${terraqoDomains.portal}/cuenta`} prefetch={false} className="tq-login-link"><LogIn aria-hidden="true" /> Entrar</Link>
          <Link href={isHome ? `${terraqoDomains.portal}/registro` : `${terraqoDomains.public}/contacto?asunto=demo-terraqo`} className="tq-header-cta">{isHome ? "Crear mi identidad" : "Solicitar acceso"} <ArrowUpRight aria-hidden="true" /></Link>
          <button type="button" className="tq-menu-button" aria-label={open ? "Cerrar menú" : "Abrir menú"} aria-expanded={open} aria-controls="terraqo-mobile-navigation" onClick={() => setOpen((value) => !value)}>
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {open ? (
        <nav id="terraqo-mobile-navigation" className="tq-mobile-nav" aria-label="Navegación móvil de Terraqo">
          <div className="tq-public-wrap">
            {visibleNavItems.map((item) => <Link key={item.href} href={`${terraqoDomains.public}${item.href}`} onClick={() => setOpen(false)}>{isHome && item.href === "/red" ? "Red profesional" : item.label}<ArrowUpRight /></Link>)}
            <Link href={`${terraqoDomains.portal}/cuenta`} prefetch={false} onClick={() => setOpen(false)}>Entrar a Terraqo <LogIn /></Link>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
