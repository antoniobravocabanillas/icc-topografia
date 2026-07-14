import Link from "next/link";
import {
  BookOpenText,
  BriefcaseBusiness,
  Building2,
  CircleHelp,
  GalleryHorizontalEnd,
  LayoutTemplate,
  Megaphone,
  MessageSquareQuote
} from "lucide-react";
import { cn } from "@/lib/utils";

export type CmsSectionId = "services" | "sectors" | "blog" | "faq" | "clients" | "testimonials" | "banners" | "pages";

type CmsWorkspaceNavProps = {
  activeSection: CmsSectionId;
  counts: Record<CmsSectionId, number>;
};

const sections = [
  { id: "services", label: "Servicios", description: "Catalogo y fichas", icon: BriefcaseBusiness },
  { id: "sectors", label: "Sectores", description: "Aplicaciones por industria", icon: Building2 },
  { id: "blog", label: "Blog", description: "Articulos y novedades", icon: BookOpenText },
  { id: "faq", label: "Preguntas frecuentes", description: "Respuestas publicas", icon: CircleHelp },
  { id: "clients", label: "Clientes", description: "Logos y referencias", icon: GalleryHorizontalEnd },
  { id: "testimonials", label: "Testimonios", description: "Confianza y experiencia", icon: MessageSquareQuote },
  { id: "banners", label: "Banners", description: "Campanas y avisos", icon: Megaphone },
  { id: "pages", label: "Paginas", description: "Contenido institucional", icon: LayoutTemplate }
] satisfies Array<{ id: CmsSectionId; label: string; description: string; icon: typeof BriefcaseBusiness }>;

export function CmsWorkspaceNav({ activeSection, counts }: CmsWorkspaceNavProps) {
  return (
    <aside className="lg:sticky lg:top-40 lg:self-start">
      <div className="rounded-md border border-[#c9dcda] bg-white p-3 shadow-technical">
        <div className="border-b border-[#dbe8e6] px-3 pb-4 pt-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Contenido publico</p>
          <h2 className="mt-1 font-display text-xl font-bold">Biblioteca del sitio</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Selecciona una seccion para crear, ordenar o editar su contenido.</p>
        </div>

        <nav className="mt-3 grid grid-cols-2 gap-1.5 lg:grid-cols-1" aria-label="Secciones del CMS">
          {sections.map((section) => {
            const Icon = section.icon;
            const active = activeSection === section.id;
            return (
              <Link
                key={section.id}
                href={`/admin/contenidos?section=${section.id}`}
                className={cn(
                  "group flex min-h-16 items-center gap-2 rounded-md border border-transparent px-2.5 py-2.5 transition-colors sm:gap-3 sm:px-3",
                  active
                    ? "border-[#a9d7d2] bg-[#e7f6f4] text-[#006e70]"
                    : "text-[#284a52] hover:border-[#d0e3e0] hover:bg-[#f2f9f8]"
                )}
                aria-current={active ? "page" : undefined}
              >
                <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-md border bg-white", active ? "border-[#a9d7d2] text-[#008d88]" : "border-[#d7e6e4] text-[#648087] group-hover:text-[#008d88]")}>
                  <Icon className="h-4 w-4" strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block line-clamp-2 text-xs font-bold leading-4 sm:text-sm">{section.label}</span>
                  <span className="mt-0.5 hidden truncate text-[11px] text-muted-foreground sm:block">{section.description}</span>
                </span>
                <span className={cn("grid h-7 min-w-7 place-items-center rounded-md px-1.5 font-mono text-[11px] font-semibold", active ? "bg-[#007f7d] text-white" : "bg-[#edf3f2] text-[#5c7479]")}>
                  {counts[section.id]}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
