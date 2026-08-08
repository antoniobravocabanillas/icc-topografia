import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { ArrowRight, BriefcaseBusiness, CheckCircle2, FolderKanban, Globe2, Mail, MapPin, Phone, UsersRound } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { fontClassName, resolveWorkspaceVisualIdentity } from "@/lib/terraqo/workspace-visual-identity";
import { cn } from "@/lib/utils";

type PageProps = { params: Promise<{ slug: string }> };

type CompanyLiveProfile = {
  headline?: string;
  summary?: string;
  services?: string[];
  differentiators?: string[];
  coverage?: string;
  contactEmail?: string;
  contactPhone?: string;
  publicEnabled?: boolean;
};

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
      backgroundImage: `radial-gradient(circle at 18% 20%, ${accent}22, transparent 32%), linear-gradient(135deg, ${primary}, #061722)`
    };
  }
  if (pattern === "topographic") {
    return {
      backgroundImage: `radial-gradient(circle at 0 0, ${accent}22 0 2px, transparent 2px), repeating-radial-gradient(circle at 12% 18%, ${primary}20 0 1px, transparent 1px 22px)`
    };
  }
  return {
    backgroundImage: `linear-gradient(${primary}10 1px, transparent 1px), linear-gradient(90deg, ${primary}10 1px, transparent 1px)`,
    backgroundSize: "64px 64px"
  };
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
      _count: {
        select: {
          projects: true,
          jobPosts: true,
          professionalAffiliations: true
        }
      }
    }
  });
  if (!workspace) notFound();
  const profile = companyProfile(workspace.settings);
  if (profile.publicEnabled === false) notFound();

  const visualIdentity = resolveWorkspaceVisualIdentity(workspace.settings);
  const name = workspace.brandName || workspace.name;
  const headline = profile.headline || workspace.description || `${name} en Terraqo`;
  const summary = profile.summary || workspace.description || "Perfil empresarial conectado a Terraqo para centralizar operaciones, oportunidades, proyectos, equipo y evidencia comercial.";
  const services = profile.services?.length ? profile.services : ["Operaciones comerciales", "Gestión de proyectos", "Equipo y talento", "Seguimiento técnico"];
  const differentiators = profile.differentiators?.length ? profile.differentiators : ["Workspace conectado", "Trazabilidad operativa", "Información protegida por permisos"];
  const domainHref = workspace.domain ? `https://${workspace.domain.replace(/^https?:\/\//i, "")}` : null;
  const primaryStyle = { "--workspace-primary": visualIdentity.primaryColor, "--workspace-accent": visualIdentity.accentColor } as CSSProperties;

  return (
    <main className={cn("min-h-screen text-[#082230]", fontClassName(visualIdentity.fontFamily))} style={{ backgroundColor: visualIdentity.backgroundColor, ...primaryStyle }}>
      <header className="border-b border-[#dbe8e5] bg-white/92 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-5 py-5">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl p-2 text-xs font-black text-white" style={{ backgroundColor: visualIdentity.primaryColor }}>
              {workspace.logoUrl ? <Image src={workspace.logoUrl} alt={name} width={72} height={72} className="max-h-8 w-auto object-contain" unoptimized /> : "TQ"}
            </span>
            <span>
              <strong className="block font-display text-lg">{name}</strong>
              <small className="block text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: visualIdentity.primaryColor }}>{visualIdentity.badgeLabel}</small>
            </span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-bold text-[#31515a] md:flex">
            <a href="#servicios">Servicios</a>
            <a href="#diferenciales">Diferenciales</a>
            <a href="#contacto">Contacto</a>
          </nav>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-12 lg:grid-cols-[minmax(0,1fr)_380px] lg:py-16">
        <div className="overflow-hidden rounded-[28px] border border-[#dbe8e5] bg-white shadow-[0_28px_90px_-48px_rgba(3,52,59,0.45)]">
          <div className="p-8 md:p-12" style={patternStyle(visualIdentity.heroPattern, visualIdentity.primaryColor, visualIdentity.accentColor)}>
            <p className="text-xs font-black uppercase tracking-[0.22em]" style={{ color: visualIdentity.primaryColor }}>{workspace.industry || "Empresa Terraqo"}</p>
            <h1 className="mt-5 max-w-4xl font-display text-5xl font-black leading-[0.96] tracking-[-0.04em] md:text-7xl">{name}</h1>
            <p className="mt-6 max-w-3xl text-xl font-semibold leading-8 text-[#2c4b54]">{headline}</p>
            <p className="mt-5 max-w-3xl text-base leading-8 text-[#58707a]">{summary}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              {domainHref ? <Link href={domainHref} target="_blank" className="inline-flex h-11 items-center gap-2 rounded-md px-5 text-sm font-black text-white" style={{ backgroundColor: visualIdentity.primaryColor }}>Visitar sitio <ArrowRight className="h-4 w-4" /></Link> : null}
              <Link href="/cuenta" className="inline-flex h-11 items-center gap-2 rounded-md border bg-white px-5 text-sm font-black" style={{ borderColor: `${visualIdentity.primaryColor}55`, color: visualIdentity.primaryColor }}>Entrar al portal</Link>
            </div>
          </div>
        </div>

        <aside className="space-y-5">
          <div className="rounded-[24px] border border-[#dbe8e5] p-6 text-white shadow-[0_28px_90px_-48px_rgba(3,52,59,0.55)]" style={{ background: `linear-gradient(135deg, ${visualIdentity.primaryColor}, #061722)` }}>
            <p className="text-xs font-black uppercase tracking-[0.18em]" style={{ color: visualIdentity.accentColor }}>Operación viva</p>
            <div className="mt-6 grid gap-3">
              <Metric icon={FolderKanban} value={workspace._count.projects} label="Proyectos registrados" accent={visualIdentity.accentColor} />
              <Metric icon={BriefcaseBusiness} value={workspace._count.jobPosts} label="Oportunidades" accent={visualIdentity.accentColor} />
              <Metric icon={UsersRound} value={workspace._count.professionalAffiliations} label="Profesionales vinculados" accent={visualIdentity.accentColor} />
            </div>
          </div>
          <div id="contacto" className="rounded-[24px] border border-[#dbe8e5] bg-white p-6">
            <h2 className="font-display text-2xl font-black">Contacto</h2>
            <div className="mt-5 space-y-3 text-sm text-[#425e67]">
              {profile.coverage || workspace.locationCity || workspace.region ? <Info icon={MapPin} color={visualIdentity.primaryColor}>{profile.coverage || [workspace.locationCity, workspace.region, workspace.country].filter(Boolean).join(", ")}</Info> : null}
              {profile.contactEmail ? <Info icon={Mail} color={visualIdentity.primaryColor}>{profile.contactEmail}</Info> : null}
              {profile.contactPhone ? <Info icon={Phone} color={visualIdentity.primaryColor}>{profile.contactPhone}</Info> : null}
              {domainHref ? <Info icon={Globe2} color={visualIdentity.primaryColor}>{workspace.domain}</Info> : null}
            </div>
          </div>
        </aside>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-5 pb-16 lg:grid-cols-2">
        <Block id="servicios" title="Servicios principales" items={services} color={visualIdentity.primaryColor} />
        <Block id="diferenciales" title="Diferenciales" items={differentiators} color={visualIdentity.primaryColor} />
      </section>
    </main>
  );
}

function Metric({ icon: Icon, value, label, accent }: { icon: typeof FolderKanban; value: number; label: string; accent: string }) {
  return <div className="rounded-2xl border border-white/12 bg-white/8 p-4"><Icon className="h-5 w-5" style={{ color: accent }} /><strong className="mt-3 block font-display text-3xl">{value}</strong><span className="text-sm text-white/62">{label}</span></div>;
}

function Info({ icon: Icon, color, children }: { icon: typeof Mail; color: string; children: React.ReactNode }) {
  return <p className="flex items-start gap-3"><Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color }} /><span>{children}</span></p>;
}

function Block({ id, title, items, color }: { id: string; title: string; items: string[]; color: string }) {
  return (
    <section id={id} className="rounded-[24px] border border-[#dbe8e5] bg-white p-7 shadow-[0_28px_90px_-60px_rgba(3,52,59,0.4)]">
      <h2 className="font-display text-3xl font-black">{title}</h2>
      <div className="mt-6 grid gap-3">
        {items.map((item) => (
          <div key={item} className="flex items-start gap-3 rounded-2xl bg-[#f3f8f7] p-4 text-sm font-semibold text-[#244852]">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" style={{ color }} />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
