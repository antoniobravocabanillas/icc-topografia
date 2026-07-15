import Link from "next/link";
import { BriefcaseBusiness, Compass, LayoutDashboard, NotebookPen } from "lucide-react";

const items = [
  { href: "/portal", label: "Resumen", icon: LayoutDashboard },
  { href: "/portal/bitacora", label: "Bitacora", icon: NotebookPen },
  { href: "/portal/commons", label: "Commons", icon: Compass },
  { href: "/portal/oportunidades", label: "Oportunidades", icon: BriefcaseBusiness }
];

export function ProfessionalPortalNav({ current }: { current: string }) {
  return (
    <nav aria-label="Portal profesional Terraqo" className="grid gap-2 rounded-lg border bg-white p-2 shadow-technical sm:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        const active = current === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition ${active ? "bg-[#063D63] text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
