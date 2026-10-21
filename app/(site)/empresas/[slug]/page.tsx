import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fontClassName, resolveWorkspaceVisualIdentity } from "@/lib/terraqo/workspace-visual-identity";
import { cn } from "@/lib/utils";
import { TerraqoLogo } from "@/components/terraqo/terraqo-logo";
import { CompanyProfileRail } from "@/components/terraqo/company-profile-rail";
import { getPublicCompanySeo } from "@/lib/terraqo/public-company-seo";
import { createMetadata } from "@/lib/seo";
import { absoluteUrl } from "@/lib/utils";
import type { Metadata } from "next";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({params}:PageProps):Promise<Metadata>{
 const {slug}=await params;const company=await getPublicCompanySeo(slug);
 if(!company)return {title:"Perfil empresarial | Terraqo",robots:{index:false,follow:false}};
 const path=`/empresas/${company.publicSlug||company.slug}`;
 const name=company.brandName||company.name;
 const description=(company.description||`Conoce los servicios, proyectos y actividad pública de ${name} en Terraqo.`).slice(0,180);
 const metadata=createMetadata({title:name,description,path});
 const image=absoluteUrl(`${path}/opengraph-image?v=${company.updatedAt.getTime()}`);
 return {...metadata,robots:{index:true,follow:true},openGraph:{...metadata.openGraph,images:[{url:image,width:1200,height:630,alt:name}]},twitter:{card:"summary_large_image",title:name,description,images:[image]}};
}

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

export const dynamic = "force-dynamic";
export const revalidate = 0;

function companyProfile(settings: Prisma.JsonValue | null | undefined): CompanyLiveProfile {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return {};
  const raw = (settings as Prisma.JsonObject).companyLiveProfile;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as CompanyLiveProfile;
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
        select: {
          id: true, slug: true, title: true, isPublic: true, status: true, updatedAt: true,
          location: true, category: true, summary: true,
          images: { select: { url: true, alt: true }, orderBy: { position: "asc" }, take: 1 }
        },
        orderBy: { updatedAt: "desc" },
        take: 18
      },
      jobPosts: {
        where: { deletedAt: null, status: "OPEN" },
        select: { id: true, slug: true, title: true, summary: true, location: true },
        orderBy: { updatedAt: "desc" },
        take: 3
      },
      clientLogos: {
        where: { active: true },
        select: { id: true, name: true, logoUrl: true, website: true },
        orderBy: [{ position: "asc" }, { createdAt: "desc" }],
        take: 8
      },
      services: {
        where: { isPublished: true, status: "ACTIVE" },
        select: { id: true, slug: true, title: true, summary: true, category: true, cover: true, icon: true },
        orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }],
        take: 12
      },
      _count: {
        select: {
          projects: true,
          jobPosts: true,
          professionalAffiliations: { where: { verificationStatus: "VERIFIED", current: true } },
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
  const domainHref = workspace.domain ? `https://${workspace.domain.replace(/^https?:\/\//i, "")}` : null;
  const coverage = profile.coverage || [workspace.locationCity, workspace.region, workspace.country].filter(Boolean).join(", ") || "Cobertura por confirmar";
  const publicProjects = workspace.projects.filter((project) => project.isPublic).length;
  const primaryStyle = { "--workspace-primary": visualIdentity.primaryColor, "--workspace-accent": visualIdentity.accentColor } as CSSProperties;

  return (
    <main className={cn("min-h-screen overflow-x-hidden bg-[#f7f8f7] text-[#102b28]", fontClassName(visualIdentity.fontFamily))} style={primaryStyle}>
      <div className="mx-auto w-full max-w-[1680px] px-4 py-7 sm:px-7 lg:px-10">
        {profile.publicEnabled===true&&<script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({"@context":"https://schema.org","@type":"Organization",name,url:absoluteUrl(`/empresas/${workspace.publicSlug||workspace.slug}`),description:headline,address:{"@type":"PostalAddress",addressLocality:workspace.locationCity||undefined,addressCountry:workspace.country}}).replace(/</g,"\\u003c")}}/>}
        <Link href="/red" className="inline-flex items-center gap-2 text-sm font-bold" style={{ color: visualIdentity.primaryColor }}>← Volver a la red operativa</Link>

        <section className="mt-6 grid overflow-hidden rounded-[24px] border border-[#dfe5e3] bg-white shadow-[0_24px_80px_-60px_rgba(16,43,40,.28)] lg:grid-cols-[minmax(430px,.82fr)_minmax(620px,1.18fr)]">
          <div className="flex flex-col justify-center p-7 sm:p-10 xl:p-12">
            <div className="flex items-center gap-5">
              <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-[18px] border border-white/20 p-3 shadow-[0_15px_40px_-26px_rgba(16,43,40,.35)]" style={{ background: `linear-gradient(145deg, ${visualIdentity.primaryColor}, #102b28)` }}>
                <TerraqoLogo src={workspace.logoUrl} variant="mark" alt={name} className="h-full w-full" imageClassName="object-contain" />
              </div>
              <div>
                <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[.08em]">
                  <span className="rounded-md px-2.5 py-1.5" style={{ backgroundColor: `${visualIdentity.primaryColor}12`, color: visualIdentity.primaryColor }}>Empresa verificada por Terraqo</span>
                  <span className="rounded-md bg-[#f0f2f1] px-2.5 py-1.5 text-[#536460]">Perfil público</span>
                </div>
                <h1 className="mt-4 font-display text-3xl font-black tracking-[-.035em] sm:text-4xl">{name}</h1>
              </div>
            </div>

            <p className="mt-5 text-lg font-semibold leading-7 text-[#48615c]">{headline}</p>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-xs font-bold text-[#506761]">
              <span>{coverage}</span><span>{publicProjects ? "Proyectos públicos y privados" : "Workspace operativo"}</span><span>{workspace.country === "PE" ? "Empresa registrada en Perú" : `Empresa registrada en ${workspace.country}`}</span>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <Link href="/cuenta" className="inline-flex h-12 items-center justify-center rounded-md px-4 text-sm font-black text-white" style={{ backgroundColor: visualIdentity.primaryColor }}>Contactar empresa</Link>
              <Link href={`/cuenta?intent=quote&company=${encodeURIComponent(slug)}`} className="inline-flex h-12 items-center justify-center rounded-md border bg-white px-4 text-sm font-black" style={{ borderColor: `${visualIdentity.primaryColor}80`, color: visualIdentity.primaryColor }}>Solicitar cotización</Link>
              {domainHref ? <Link href={domainHref} target="_blank" className="inline-flex h-12 items-center justify-center rounded-md border border-[#d6dfdc] bg-white px-4 text-sm font-black text-[#304b45]">Visitar sitio web</Link> : null}
            </div>
          </div>

          <div className="relative min-h-[430px] overflow-hidden bg-[#d9dfdc] lg:min-h-[470px]">
            {profile.heroImageUrl ? <Image src={profile.heroImageUrl} alt={`Actividad de ${name}`} fill priority sizes="(min-width:1024px) 60vw,100vw" className="object-cover" unoptimized /> : null}
            <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 grid gap-px overflow-hidden rounded-[16px] border backdrop-blur-2xl sm:grid-cols-4 lg:right-[245px]" style={{ background: `linear-gradient(135deg, ${visualIdentity.primaryColor}d9, ${visualIdentity.primaryColor}9c)`, borderColor: `${visualIdentity.accentColor}66`, boxShadow: `0 18px 50px ${visualIdentity.primaryColor}40` }}>
              <CompanyMetric value={workspace._count.projects} label="Proyectos registrados" />
              <CompanyMetric value={workspace._count.professionalAffiliations} label="Profesionales vinculados" />
              <CompanyMetric value="5+" label="Años de experiencia" />
              <CompanyMetric value="100%" label="Perfil verificado" />
            </div>
            <Link href={`/empresas/${slug}/verificacion`} className="absolute right-4 top-4 block w-[190px] rounded-[18px] border p-5 text-white shadow-2xl backdrop-blur-2xl transition hover:-translate-y-1 sm:w-[215px] sm:p-6" style={{ background: `linear-gradient(145deg, ${visualIdentity.primaryColor}e8, ${visualIdentity.primaryColor}a8)`, borderColor: `${visualIdentity.accentColor}66` }}>
              <p className="text-[10px] font-black uppercase tracking-[.14em]" style={{ color: visualIdentity.accentColor }}>Terraqo verified</p>
              <h2 className="mt-7 font-display text-xl font-black">Empresa verificada</h2>
              <p className="mt-3 text-sm leading-6 text-white/70">Perfil revisado para respaldar identidad, operación y cumplimiento declarado.</p>
              <span className="mt-6 block text-xs font-black underline underline-offset-4">Ver perfil de verificación →</span>
            </Link>
          </div>
        </section>

        <section className="mt-5 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,.86fr)_minmax(0,1.14fr)]">
          <CompanySection title="Servicios principales" action="Ver todos los servicios" actionHref="/servicios">
            <CompanyProfileRail label="servicios">
              {(workspace.services.length ? workspace.services : services.map((value, index) => { const part = serviceParts(value); return { id: `profile-${index}`, slug: "", title: part.title, summary: part.description, category: workspace.industry, cover: null, icon: null }; })).map((service) => <ServicePreview key={service.id} service={service} color={visualIdentity.primaryColor} />)}
            </CompanyProfileRail>
          </CompanySection>

          <CompanySection title="Proyectos destacados" action="Ver todos los proyectos" actionHref="/proyectos">
            <CompanyProfileRail label="proyectos">
              {workspace.projects.filter((project) => project.isPublic).map((project) => <ProjectPreview key={project.id} project={project} color={visualIdentity.primaryColor} />)}
            </CompanyProfileRail>
          </CompanySection>
        </section>

        <section className="mt-5 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,.62fr)_minmax(0,.72fr)]">
          <CompanySection title="Oportunidades abiertas" subtitle="Conexiones vinculadas a la operación real de la empresa.">
            <div className="grid gap-3 md:grid-cols-3">
              {(workspace.jobPosts.length ? workspace.jobPosts : [
                { id: "partners", slug: "", title: "Alianzas estratégicas", summary: `Colaboración especializada para proyectos de ${workspace.industry || "la empresa"}.`, location: coverage },
                { id: "suppliers", slug: "", title: "Proveedores certificados", summary: "Equipos, insumos y servicios que cumplan los estándares del proyecto.", location: coverage },
                { id: "talent", slug: "", title: "Talento profesional", summary: `Especialistas con experiencia en ${workspace.industry || "el sector"}.`, location: coverage }
              ]).map((opportunity) => <article key={opportunity.id} className="rounded-xl border border-[#e0e6e4] p-4"><h3 className="font-black">{opportunity.title}</h3><p className="mt-2 text-xs leading-5 text-[#647570] line-clamp-2">{opportunity.summary}</p><Link href={opportunity.slug ? `/oportunidades/${opportunity.slug}` : "/cuenta"} className="mt-4 inline-block text-xs font-black" style={{ color: visualIdentity.primaryColor }}>Ver más →</Link></article>)}
            </div>
          </CompanySection>

          <section className="rounded-[20px] p-7 text-white" style={{ backgroundColor: visualIdentity.primaryColor }}>
            <h2 className="font-display text-2xl font-black">¿Quieres trabajar con {name}?</h2><p className="mt-3 text-sm leading-6 text-white/74">Presenta tu empresa, servicio o perfil profesional.</p><Link href="/cuenta" className="mt-7 inline-flex h-11 items-center rounded-md bg-white px-5 text-sm font-black" style={{ color: visualIdentity.primaryColor }}>Enviar interés →</Link>
          </section>

          <CompanySection title="Respaldos y diferenciales">
            <div className="divide-y divide-[#e3e9e7]">{differentiators.slice(0, 3).map((item) => { const part=serviceParts(item); return <div key={item} className="py-3 first:pt-0"><h3 className="text-sm font-black">{part.title}</h3>{part.description ? <p className="mt-1 text-xs text-[#687a75]">{part.description}</p> : null}</div>; })}</div>
          </CompanySection>
        </section>

        {workspace.clientLogos.length ? <section className="mt-5 flex flex-col gap-5 rounded-[20px] border border-[#dfe5e3] bg-white p-6 lg:flex-row lg:items-center"><h2 className="shrink-0 text-sm font-black">Confían en nosotros</h2><div className="flex flex-1 flex-wrap items-center gap-x-10 gap-y-5">{workspace.clientLogos.map((client) => <div key={client.id} className="relative h-9 w-28 grayscale opacity-60"><Image src={client.logoUrl} alt={client.name} fill sizes="112px" className="object-contain" unoptimized /></div>)}</div><div className="flex gap-8 border-t pt-5 text-xs font-bold text-[#526863] lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0"><span>{coverage}</span><span>Respuesta profesional</span><span>Calidad documentada</span></div></section> : null}
      </div>
    </main>
  );
}

function CompanyMetric({ value, label }: { value: string | number; label: string }) {
  return <div className="border-r border-white/12 bg-white/5 px-4 py-4 text-white last:border-r-0"><strong className="font-display text-2xl font-black">{value}</strong><span className="mt-1 block text-[11px] font-semibold leading-4 text-white/76">{label}</span></div>;
}

function CompanySection({ title, subtitle, action, actionHref, children }: { title: string; subtitle?: string; action?: string; actionHref?: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-[20px] border border-[#dfe5e3] bg-white p-6">
      <div className="mb-5 flex items-start justify-between gap-5"><div><h2 className="font-display text-xl font-black">{title}</h2>{subtitle ? <p className="mt-1 text-xs text-[#657772]">{subtitle}</p> : null}</div>{action && actionHref ? <Link href={actionHref} className="shrink-0 text-xs font-black text-[#315d55] hover:underline">{action} →</Link> : null}</div>
      {children}
    </section>
  );
}

type PublicServicePreview = { id: string; slug: string; title: string; summary: string; category: string | null; cover: string | null; icon: string | null };

function ServicePreview({ service, color }: { service: PublicServicePreview; color: string }) {
  const href = service.slug ? `/servicios/${service.slug}` : "/servicios";
  return (
    <Link href={href} className="group min-w-[210px] max-w-[240px] flex-1 snap-start overflow-hidden rounded-xl border border-[#dfe5e3] bg-white transition hover:-translate-y-1 hover:shadow-lg">
      <div className="relative h-28 overflow-hidden" style={{ backgroundColor: `${color}0c` }}>{service.cover ? <Image src={service.cover} alt={service.title} fill sizes="240px" className="object-cover transition duration-500 group-hover:scale-105" unoptimized /> : <div className="absolute inset-0 flex items-end p-4"><span className="text-[10px] font-black uppercase tracking-[.1em]" style={{ color }}>{service.category || "Servicio especializado"}</span></div>}</div>
      <div className="p-4"><h3 className="line-clamp-2 text-sm font-black leading-5">{service.title}</h3><p className="mt-2 line-clamp-2 text-xs leading-5 text-[#667773]">{service.summary || "Conoce el alcance, entregables y aplicación de este servicio."}</p><span className="mt-4 inline-block text-xs font-black" style={{ color }}>Ver servicio →</span></div>
    </Link>
  );
}

type PublicProjectPreview = {
  id: string;
  slug: string;
  title: string;
  status: string;
  location: string | null;
  category: string | null;
  summary: string;
  images: Array<{ url: string; alt: string | null }>;
};

function ProjectPreview({ project, color }: { project: PublicProjectPreview; color: string }) {
  const image = project.images[0];
  const status = project.status === "COMPLETED" ? "Completado" : project.status === "IN_PROGRESS" ? "En ejecución" : "Registrado";
  return (
    <Link href={`/proyectos/${project.slug}`} className="group min-w-[235px] max-w-[285px] flex-1 snap-start overflow-hidden rounded-xl border border-[#dfe5e3] bg-white transition hover:-translate-y-1 hover:shadow-lg">
      <div className="relative h-28 bg-[#e8ecea]">{image ? <Image src={image.url} alt={image.alt || project.title} fill sizes="260px" className="object-cover" unoptimized /> : null}{project.category ? <span className="absolute left-3 top-3 rounded-full bg-[#082f2a]/78 px-2.5 py-1 text-[9px] font-black text-white backdrop-blur">{project.category}</span> : null}</div>
      <div className="p-4"><h3 className="line-clamp-1 text-sm font-black">{project.title}</h3><p className="mt-2 text-[11px] text-[#6b7b77]">{project.location || "Ubicación por confirmar"}</p><span className="mt-3 inline-block text-[10px] font-black" style={{ color }}>{status}</span></div>
    </Link>
  );
}
