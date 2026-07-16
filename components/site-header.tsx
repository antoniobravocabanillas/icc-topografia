"use client";

import Link from "next/link";
import { LayoutDashboard, Menu, PhoneCall, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { BrandLogo } from "@/components/brand-logo";
import { CartNavButton } from "@/components/cart/cart-nav-button";
import { Button } from "@/components/ui/button";
import { brand } from "@/lib/brand";

const navItems = [
  ["Nosotros", "/nosotros"],
  ["Servicios", "/servicios"],
  ["Proyectos", "/proyectos"],
  ["Sectores", "/sectores"],
  ["Tienda", "/tienda"],
  ["Blog", "/blog"],
  ["Contacto", "/contacto"]
];

export function SiteHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const mobileMenu = menuOpen ? (
    <div className="fixed inset-x-0 bottom-0 top-16 z-[999] overflow-y-auto border-t bg-background shadow-2xl lg:hidden">
      <nav
        id="site-navigation-menu"
        aria-label="Menu principal"
        className="min-h-full bg-background"
      >
        <div className="border-b bg-[#03111D] px-6 py-5 text-white">
          <p className="text-sm font-semibold uppercase text-[#7DE4FF]">ICC Topografia</p>
          <p className="mt-1 text-sm text-white/70">Accesos comerciales, cuenta y panel operativo.</p>
        </div>
        <div className="grid p-4">
          {navItems.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              className="border-b px-2 py-4 text-base font-semibold text-muted-foreground transition last:border-b-0 hover:text-foreground"
            >
              {label}
            </Link>
          ))}
        </div>
        <div className="grid gap-2 border-t p-4 sm:grid-cols-3">
          <Button asChild>
            <Link href="/registro" onClick={() => setMenuOpen(false)}>
              <UserRound className="h-4 w-4" />
              Cuenta / registro
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin" onClick={() => setMenuOpen(false)}>
              <LayoutDashboard className="h-4 w-4" />
              Panel admin
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/cotizacion" onClick={() => setMenuOpen(false)}>
              <PhoneCall className="h-4 w-4" />
              Solicitar cotizacion
            </Link>
          </Button>
        </div>
      </nav>
    </div>
  ) : null;

  return (
    <>
    <header className="sticky top-0 z-[1000] border-b bg-background/94 backdrop-blur">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3 font-bold" aria-label={`${brand.name} inicio`}>
          <BrandLogo variant="mark" className="h-11 w-11" priority />
          <span className="leading-tight">
            {/* <span className="font-display">{brand.shortName}</span>
            <span className="block text-xs font-medium text-muted-foreground">{brand.tagline}</span> */}
          </span>
        </Link>
        <nav className="hidden items-center gap-5 text-sm font-medium lg:flex">
          {navItems.map(([label, href]) => (
            <Link key={href} href={href} className="text-muted-foreground hover:text-foreground">
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <CartNavButton />
          <Link
            href="/registro"
            className="hidden items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-muted/70 hover:text-foreground lg:inline-flex"
          >
            <UserRound className="h-4 w-4" />
            Acceso / registro
          </Link>
          <Button asChild className="hidden sm:inline-flex">
            <Link href="/cotizacion">
              <PhoneCall className="h-4 w-4" />
              Cotizar
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={menuOpen ? "Cerrar menu" : "Abrir menu"}
            aria-expanded={menuOpen}
            aria-controls="site-navigation-menu"
            className="lg:hidden"
            onPointerDown={(event) => {
              event.preventDefault();
              setMenuOpen((value) => !value);
            }}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>
    </header>
    {mounted ? createPortal(mobileMenu, document.body) : null}
    </>
  );
}
