import Link from "next/link";
import { BriefcaseBusiness, Compass, LayoutDashboard, MessagesSquare, NotebookPen, UsersRound } from "lucide-react";

const items = [
  { href: "/portal", label: "Resumen", icon: LayoutDashboard },
  { href: "/portal/bitacora", label: "Bitacora", icon: NotebookPen },
  { href: "/portal/commons", label: "Commons", icon: Compass },
  { href: "/portal/equipos", label: "Equipos", icon: UsersRound },
  { href: "/portal/oportunidades", label: "Oportunidades", icon: BriefcaseBusiness },
  { href: "/portal/mensajes", label: "Mensajes", icon: MessagesSquare }
];

export function ProfessionalPortalNav({ current }: { current: string }) {
  return (
    <nav aria-label="Portal profesional Terraqo" className="grid grid-cols-6 gap-2 rounded-lg border bg-white p-2 shadow-technical xl:grid-cols-6">
      {items.map((item) => {
        const Icon = item.icon;
        const active = current === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`col-span-2 flex min-h-11 items-center justify-center gap-1.5 rounded-md px-2 text-center text-xs font-semibold transition sm:text-sm xl:col-span-1 xl:min-h-12 xl:px-4 ${active ? "bg-[#063D63] text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
