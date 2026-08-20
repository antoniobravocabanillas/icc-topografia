import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  ChevronRight,
  Factory,
  FolderKanban,
  Globe2,
  Layers3,
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  ShieldCheck,
  Sparkles,
  Target,
  UsersRound
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { fontClassName, resolveWorkspaceVisualIdentity } from "@/lib/terraqo/workspace-visual-identity";
import { cn } from "@/lib/utils";
import { TerraqoLogo } from "@/components/terraqo/terraqo-logo";

type PageProps = { params: Promise<{ slug: string }> };

type CompanyLiveProfile = {
  headline?: string;
  summary?: string;
  heroImageUrl?: string;
  services?: string[];
  differentiators?: string[];
  sectors?: string[];
  coverage?: string;
  contactEmail?: string;
  contactPhone?: string;
  publicEnabled?: boolean;
};

type VisualIdentity = ReturnType<typeof resolveWorkspaceVisualIdentity>;

export const dynamic = "force-dynamic";
export const revalidate = 0;

function companyProfile(settings: Prisma.JsonValue | null | undefined): CompanyLiveProfile {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return {};
  const raw = (settings as Prisma.JsonObject).companyLiveProfile;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as CompanyLiveProfile;
}

function patternStyle(pattern: string, primary: string, accent: string): CSSProperties {
  if (pattern === "clean") return {};
  if (pattern === "dark-panel") {
    return {
      backgroundImage: `radial-gradient(circle at 18% 20%, ${accent}25, transparent 34%), linear-gradient(135deg, ${primary}, #0e1a26)`
    };
  }
  if (pattern === "topographic") {
    return {
      backgroundImage: `radial-gradient(circle at 0 0, ${accent}22 0 2px, transparent 2px), repeating-radial-gradient(circle at 12% 18%, ${primary}1f 0 1px, transparent 1px 24px)`
    };
  }
  return {
    backgroundImage: `linear-gradient(${primary}10 1px, transparent 1px), linear-gradient(90deg, ${primary}10 1px, transparent 1px)`,
    backgroundSize: "64px 64px"
  };
}

function serviceParts(value: string) {
  const [title, ...rest] = value.split(":");
  return {
    title: title.trim(),
    description: rest.join(":").trim()
  };
}

function normalizeList(items: string[] | undefined, fallback: string[]) {
  return items?.length ? items : fallback;
}

export default async function PublicCompanyProfilePage({ params }: PageProps) {
  const { slug } = await params;
  const workspace = await prisma.terraqoWorkspace.findFirst({
    where: {
      active: true,
      deletedAt: null,
      OR: [{ publicSlug: slug }, { slug }]
    },
    select: {
      id: true,
      slug: true,
      publicSlug: true,
      name: true,
      brandName: true,
      logoUrl: true,
      description: true,
      industry: true,
      domain: true,
      country: true,
      locationCity: true,
      region: true,
      settings: true,
      projects: {
        where: { deletedAt: null },
        select: { id: true, title: true, isPublic: true, status: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 18
      },
      _count: {
        select: {
          projects: true,
          jobPosts: true,
          professionalAffiliations: true,
          worklogs: true
        }
      }
    }
  });
  if (!workspace) notFound();
  const profile = companyProfile(workspace.settings);
  if (profile.publicEnabled === false) notFound();

  const visualIdentity = resolveWorkspaceVisualIdentity(workspace.settings);
  const name = workspace.brandName || workspace.name;
  const headline = profile.headline || workspace.description || `Servicios especializados conectados a Terraqo`;
  const summary = profile.summary || workspace.description || "Perfil empresarial conectado a Terraqo para centralizar operaciones, oportunidades, proyectos, equipo y evidencia comercial.";
  const services = normalizeList(profile.services, [
    "Operación comercial: compras, cotizaciones y seguimiento del cliente en un solo workspace.",
    "Gestión de proyectos: planificación, ejecución, documentos y responsables conectados.",
    "Equipo y talento: profesionales vinculados, roles, evidencias y participación trazable.",
    "Soporte técnico: tickets, comunicación operativa y acompañamiento comercial."
  ]);
  const differentiators = normalizeList(profile.differentiators, [
    "Workspace conectado con historial comercial y operativo.",
    "Información protegida por permisos y contexto de empresa.",
    "Red de profesionales y equipo interno vinculados a operaciones reales.",
    "Evidencia viva para proyectos, servicios y solicitudes."
  ]);
  const sectors = normalizeList(profile.sectors, [
    "Infraestructura",
    "Construcción",
    "Industria",
    "Servicios técnicos",
    "Operaciones B2B"
  ]);
  const domainHref = workspace.domain ? `https://${workspace.domain.replace(/^https?:\/\//i, "")}` : null;
  const coverage = profile.coverage || [workspace.locationCity, workspace.region, workspace.country].filter(Boolean).join(", ") || "Cobertura por confirmar";
  const publicProjects = workspace.projects.filter((project) => project.isPublic).length;
  const latestActivity = workspace.projects[0]?.updatedAt;
  const primaryStyle = { "--workspace-primary": visualIdentity.primaryColor, "--workspace-accent": visualIdentity.accentColor } as CSSProperties;

  return (
    <main className={cn("terraqo-brand-surface terraqo-company-v3 min-h-screen text-[#0e1a26]", fontClassName(visualIdentity.fontFamily))} style={{ backgroundColor: visualIdentity.backgroundColor, ...primaryStyle }}>
      <Header name={name} logoUrl={workspace.logoUrl} visualIdentity={visualIdentity} />

      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] lg:py-16">
        <div className="space-y-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center">
            <BrandMark name={name} logoUrl={workspace.logoUrl} visualIdentity={visualIdentity} />
            <div>
              <span className="inline-flex items-center gap-2 rounded-md border border-[#d8e0ec] bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#304b54]">
                <BriefcaseBusiness className="h-3.5 w-3.5" /> {visualIdentity.badgeLabel}
              </span>
              <h1 className="mt-5 flex flex-wrap items-center gap-3 font-display text-5xl font-black leading-none tracking-[-0.045em] md:text-6xl">
                {name}
                <BadgeCheck className="h-7 w-7" style={{ color: visualIdentity.primaryColor }} />
              </h1>
              <p className="mt-4 max-w-3xl text-2xl font-semibold leading-8 text-[#26434d]">{headline}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-5 text-sm font-semibold text-[#506b73]">
            <InlineTrust icon={MapPin} label={coverage} color={visualIdentity.primaryColor} />
            <InlineTrust icon={Globe2} label={publicProjects ? "Proyectos publicados" : "Workspace activo"} color={visualIdentity.primaryColor} />
            <InlineTrust icon={ShieldCheck} label="Perfil verificado por Terraqo" color={visualIdentity.primaryColor} />
          </div>

          <article className="rounded-[26px] border border-[#d8e0ec] bg-white/86 p-7 shadow-[0_28px_90px_-60px_rgba(3,52,59,0.45)] md:p-8">
            <p className="max-w-4xl text-base leading-8 text-[#314f58]">{summary}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              {domainHref ? <Link href={domainHref} target="_blank" className="inline-flex h-12 items-center gap-2 rounded-md px-5 text-sm font-black text-white shadow-[0_20px_45px_-24px_rgba(0,0,0,0.5)]" style={{ backgroundColor: visualIdentity.primaryColor }}>Visitar sitio web <ArrowRight className="h-4 w-4" /></Link> : null}
              <Link href="/cuenta" className="inline-flex h-12 items-center gap-2 rounded-md border bg-white px-5 text-sm font-black" style={{ borderColor: `${visualIdentity.primaryColor}50`, color: visualIdentity.primaryColor }}>
                <MessageSquareText className="h-4 w-4" /> Contactar empresa
              </Link>
            </div>
          </article>
        </div>

        <VisualOperationCard
          name={name}
          heroImageUrl={profile.heroImageUrl}
          visualIdentity={visualIdentity}
          projects={workspace._count.projects}
          jobs={workspace._count.jobPosts}
          professionals={workspace._count.professionalAffiliations}
        />
      </section>

      <section className="mx-auto grid max-w-7xl overflow-hidden rounded-[22px] border border-[#d8e0ec] bg-white/90 px-5 shadow-[0_22px_70px_-55px_rgba(3,52,59,0.5)] md:grid-cols-5 md:px-0">
        <MetricStrip icon={CalendarDays} value="5+ años" label="Experiencia acumulada" color={visualIdentity.primaryColor} />
        <MetricStrip icon={Layers3} value={workspace._count.projects} label="Proyectos registrados" color={visualIdentity.primaryColor} />
        <MetricStrip icon={ShieldCheck} value="100%" label="Perfil operativo activo" color={visualIdentity.primaryColor} />
        <MetricStrip icon={FolderKanban} value={workspace._count.worklogs} label="Evidencias internas" color={visualIdentity.primaryColor} />
        <div className="flex items-center gap-3 px-6 py-5 text-sm text-[#4c6870] md:border-l md:border-[#d8e0ec]">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: visualIdentity.primaryColor }} />
          <div>
            <p>Última actividad</p>
            <strong className="block text-[#0e1a26]">{latestActivity ? latestActivity.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }) : "Pendiente"}</strong>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-7 px-5 py-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)]">
        <ServicesPanel items={services} color={visualIdentity.primaryColor} />
        <div className="space-y-7">
          <DifferentiatorsPanel items={differentiators} color={visualIdentity.primaryColor} />
          <SectorsPanel items={sectors} color={visualIdentity.primaryColor} />
          <ContactPanel coverage={coverage} email={profile.contactEmail} phone={profile.contactPhone} domain={workspace.domain} domainHref={domainHref} color={visualIdentity.primaryColor} />
        </div>
      </section>

      <Footer visualIdentity={visualIdentity} />
    </main>
  );
}

function Header({ name, logoUrl, visualIdentity }: { name: string; logoUrl?: string | null; visualIdentity: VisualIdentity }) {
  return (
    <header className="border-b border-[#d6e0eb] bg-[#f3f3f3]/92 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-5 py-5">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-lg bg-white p-1" style={{ border: `1px solid ${visualIdentity.primaryColor}55` }}>
            <TerraqoLogo src={logoUrl} variant="mark" alt={logoUrl ? name : "Terraqo"} className="h-full w-full" />
          </span>
          <strong className="font-display text-xl font-black">{name}</strong>
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-bold text-[#0e1a26] md:flex">
          <a href="#servicios">Servicios</a>
          <a href="#sectores">Sectores</a>
          <a href="#diferenciales">Diferenciales</a>
          <a href="#contacto">Contacto</a>
        </nav>
        <Link href="/cuenta" className="hidden h-10 items-center rounded-md px-4 text-sm font-black text-white md:inline-flex" style={{ backgroundColor: visualIdentity.primaryColor }}>Solicitar acceso</Link>
      </div>
    </header>
  );
}

function BrandMark({ name, logoUrl, visualIdentity }: { name: string; logoUrl?: string | null; visualIdentity: VisualIdentity }) {
  return (
    <div className="grid h-28 w-28 shrink-0 place-items-center rounded-[22px] p-4 shadow-[0_30px_80px_-45px_rgba(14,26,38,0.65)]" style={{ background: `linear-gradient(135deg, ${visualIdentity.primaryColor}, #0e1a26)` }}>
      <TerraqoLogo src={logoUrl} variant="mark" alt={logoUrl ? name : "Terraqo"} className="h-full w-full" imageClassName="rounded-[14px]" />
    </div>
  );
}

function InlineTrust({ icon: Icon, label, color }: { icon: typeof MapPin; label: string; color: string }) {
  return <span className="inline-flex items-center gap-2"><Icon className="h-4 w-4" style={{ color }} /> {label}</span>;
}

function VisualOperationCard({ name, heroImageUrl, visualIdentity, projects, jobs, professionals }: { name: string; heroImageUrl?: string; visualIdentity: VisualIdentity; projects: number; jobs: number; professionals: number }) {
  return (
    <aside className="overflow-hidden rounded-[26px] border border-[#d8e0ec] bg-[#0e1a26] shadow-[0_32px_90px_-52px_rgba(3,52,59,0.7)]">
      <div className="relative h-64 overflow-hidden bg-[#e8eef5]" style={patternStyle(visualIdentity.heroPattern, visualIdentity.primaryColor, visualIdentity.accentColor)}>
        {heroImageUrl ? (
          <>
            <Image src={heroImageUrl} alt={`Operación de ${name}`} fill sizes="(min-width: 1024px) 420px, 100vw" className="object-cover" unoptimized />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,23,34,0.04),rgba(6,23,34,0.22)_46%,rgba(6,23,34,0.9))]" />
          </>
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_25%,rgba(255,255,255,0.9),transparent_0_18%,rgba(255,255,255,0)_34%),linear-gradient(135deg,rgba(255,255,255,0.75),rgba(255,255,255,0.08))]" />
        )}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0e1a26] to-transparent" />
      </div>
      <div className="p-6 text-white">
        <p className="text-xs font-black uppercase tracking-[0.16em]" style={{ color: visualIdentity.accentColor }}>Operación viva ·</p>
        <div className="mt-5 grid gap-3">
          <DarkMetric icon={FolderKanban} value={projects} label="Proyectos registrados" visualIdentity={visualIdentity} />
          <DarkMetric icon={Target} value={jobs} label="Oportunidades abiertas" visualIdentity={visualIdentity} />
          <DarkMetric icon={UsersRound} value={professionals} label="Profesionales vinculados" visualIdentity={visualIdentity} />
        </div>
      </div>
    </aside>
  );
}

function DarkMetric({ icon: Icon, value, label, visualIdentity }: { icon: typeof FolderKanban; value: number; label: string; visualIdentity: VisualIdentity }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-white/8 bg-white/8 p-4">
      <span className="grid h-12 w-12 place-items-center rounded-xl" style={{ backgroundColor: `${visualIdentity.primaryColor}55`, color: visualIdentity.accentColor }}><Icon className="h-5 w-5" /></span>
      <div><strong className="block font-display text-3xl">{value}</strong><span className="text-sm text-white/62">{label}</span></div>
    </div>
  );
}

function MetricStrip({ icon: Icon, value, label, color }: { icon: typeof CalendarDays; value: string | number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-4 px-6 py-5 md:border-r md:border-[#d8e0ec]">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#eff8f6]" style={{ color }}><Icon className="h-5 w-5" /></span>
      <div><strong className="block font-display text-2xl font-black">{value}</strong><span className="text-sm text-[#516b72]">{label}</span></div>
    </div>
  );
}

function ServicesPanel({ items, color }: { items: string[]; color: string }) {
  return (
    <section id="servicios" className="rounded-[24px] border border-[#d8e0ec] bg-white p-7 shadow-[0_28px_90px_-60px_rgba(3,52,59,0.45)]">
      <h2 className="font-display text-3xl font-black">Servicios principales</h2>
      <div className="mt-7 space-y-1">
        {items.map((item, index) => {
          const service = serviceParts(item);
          return (
            <article key={`${item}-${index}`} className="group grid grid-cols-[44px_minmax(0,1fr)_24px] gap-4 border-b border-[#e1ece9] py-4 last:border-b-0">
              <span className="grid h-8 w-8 place-items-center rounded-md text-xs font-black text-white" style={{ backgroundColor: color }}>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3 className="font-black text-[#112d36]">{service.title}</h3>
                {service.description ? <p className="mt-1 text-sm leading-6 text-[#4d6871]">{service.description}</p> : null}
              </div>
              <ChevronRight className="mt-1 h-4 w-4 text-[#7c9298] transition-transform group-hover:translate-x-1" />
            </article>
          );
        })}
      </div>
    </section>
  );
}

function DifferentiatorsPanel({ items, color }: { items: string[]; color: string }) {
  const icons = [ShieldCheck, Target, UsersRound, BadgeCheck, Layers3, Sparkles];
  return (
    <section id="diferenciales" className="rounded-[24px] border border-[#d8e0ec] bg-white p-7 shadow-[0_28px_90px_-60px_rgba(3,52,59,0.45)]">
      <h2 className="font-display text-3xl font-black">Diferenciales</h2>
      <div className="mt-6 grid gap-3">
        {items.map((item, index) => {
          const Icon = icons[index % icons.length];
          const parts = serviceParts(item);
          return (
            <article key={`${item}-${index}`} className="flex gap-4 rounded-2xl bg-[#f3f8f7] p-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white shadow-sm" style={{ color }}><Icon className="h-5 w-5" /></span>
              <div>
                <h3 className="font-black text-[#17343d]">{parts.title}</h3>
                {parts.description ? <p className="mt-1 text-sm leading-6 text-[#536d75]">{parts.description}</p> : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SectorsPanel({ items, color }: { items: string[]; color: string }) {
  return (
    <section id="sectores" className="rounded-[24px] border border-[#d8e0ec] bg-white p-7 shadow-[0_28px_90px_-60px_rgba(3,52,59,0.45)]">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-3xl font-black">Sectores</h2>
        <Factory className="h-5 w-5" style={{ color }} />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {items.map((item) => <span key={item} className="rounded-full border px-3 py-2 text-sm font-bold text-[#294852]" style={{ borderColor: `${color}35`, backgroundColor: `${color}0f` }}>{item}</span>)}
      </div>
    </section>
  );
}

function ContactPanel({ coverage, email, phone, domain, domainHref, color }: { coverage: string; email?: string; phone?: string; domain?: string | null; domainHref?: string | null; color: string }) {
  return (
    <section id="contacto" className="rounded-[24px] border border-[#d8e0ec] bg-white p-7 shadow-[0_28px_90px_-60px_rgba(3,52,59,0.45)]">
      <h2 className="font-display text-3xl font-black">Contacto</h2>
      <div className="mt-6 space-y-4 text-sm font-semibold text-[#4b6870]">
        <ContactRow icon={MapPin} color={color}>{coverage}</ContactRow>
        {email ? <ContactRow icon={Mail} color={color}>{email}</ContactRow> : null}
        {phone ? <ContactRow icon={Phone} color={color}>{phone}</ContactRow> : null}
        {domainHref ? <ContactRow icon={Globe2} color={color}><Link href={domainHref} target="_blank">{domain}</Link></ContactRow> : null}
      </div>
    </section>
  );
}

function ContactRow({ icon: Icon, color, children }: { icon: typeof Mail; color: string; children: React.ReactNode }) {
  return <p className="flex items-start gap-3"><Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color }} /><span>{children}</span></p>;
}

function Footer({ visualIdentity }: { visualIdentity: VisualIdentity }) {
  return (
    <footer className="mt-8 bg-[#0e1a26] text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 md:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
        <div>
          <TerraqoLogo variant="horizontal" tone="dark" alt="Terraqo" className="h-10 w-[155px]" />
          <p className="mt-5 max-w-sm text-sm leading-7 text-white/62">Software modular, red profesional y evidencia de trabajo en un solo ecosistema.</p>
        </div>
        <FooterGroup title="Plataforma" items={["Cómo funciona", "Membresías", "Seguridad"]} />
        <FooterGroup title="Red profesional" items={["Profesionales", "Empresas", "Worklog"]} />
        <FooterGroup title="Legal" items={["Términos", "Privacidad", "Cookies"]} />
      </div>
      <div className="mx-auto flex max-w-7xl flex-col gap-3 border-t border-white/10 px-5 py-6 text-xs text-white/45 md:flex-row md:items-center md:justify-between">
        <span>© 2026 Terraqo. Todos los derechos reservados.</span>
        <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4" style={{ color: visualIdentity.accentColor }} /> Perfil verificado por Terraqo</span>
      </div>
    </footer>
  );
}

function FooterGroup({ title, items }: { title: string; items: string[] }) {
  return <div><h3 className="font-black">{title}</h3><div className="mt-4 grid gap-3 text-sm text-white/58">{items.map((item) => <span key={item}>{item}</span>)}</div></div>;
}
