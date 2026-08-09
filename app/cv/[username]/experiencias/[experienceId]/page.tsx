import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BadgeCheck, BriefcaseBusiness, CheckCircle2, Clock3, MapPin, ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { createMetadata } from "@/lib/seo";
import { formatExperienceDuration, monthsBetween } from "@/lib/terraqo/profile-summary";
import { publicCvPath } from "@/components/terraqo/public-cv";

type ExperienceDetailPageProps = {
  params: Promise<{ username: string; experienceId: string }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatDate(date?: Date | null, options: Intl.DateTimeFormatOptions = { year: "numeric" }) {
  if (!date) return "Actualidad";
  return new Intl.DateTimeFormat("es-PE", options).format(date).replace(".", "");
}

function formatPeriod(start?: Date | null, end?: Date | null, currentlyWorking?: boolean) {
  const startLabel = start ? formatDate(start) : "Sin fecha";
  const endLabel = currentlyWorking ? "Actualidad" : end ? formatDate(end) : "Actualidad";
  return `${startLabel} - ${endLabel}`;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export async function generateMetadata({ params }: ExperienceDetailPageProps) {
  const { username, experienceId } = await params;
  const experience = await prisma.terraqoProfessionalExperience.findFirst({
    where: {
      id: experienceId,
      visibility: "PUBLIC",
      professionalProfile: { username }
    },
    select: {
      title: true,
      companyName: true,
      summary: true,
      professionalProfile: { select: { user: { select: { name: true } } } }
    }
  });

  return createMetadata({
    title: experience
      ? `${experience.title} en ${experience.companyName || "experiencia profesional"} | ${experience.professionalProfile.user.name || username}`
      : "Experiencia profesional | CV Vivo Terraqo",
    description: experience?.summary || "Detalle publico de experiencia profesional en CV Vivo Terraqo.",
    path: `/cv/${username}/experiencias/${experienceId}`
  });
}

export default async function ExperienceDetailPage({ params }: ExperienceDetailPageProps) {
  const { username, experienceId } = await params;
  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      headline: true,
      user: { select: { name: true, image: true } }
    }
  });

  if (!profile) notFound();

  const experience = await prisma.terraqoProfessionalExperience.findFirst({
    where: {
      id: experienceId,
      professionalProfileId: profile.id,
      visibility: "PUBLIC"
    },
    include: {
      project: {
        select: {
          title: true,
          slug: true,
          clientName: true,
          location: true,
          category: true,
          status: true
        }
      }
    }
  });

  if (!experience) notFound();

  const duration = formatExperienceDuration(monthsBetween(experience.startedAt, experience.currentlyWorking ? null : experience.endedAt));
  const company = experience.companyName || experience.project?.clientName || "Empresa no publica";
  const location = experience.locationCity || experience.location || experience.project?.location || "Ubicacion no publica";
  const paragraphs = (experience.summary || "El profesional aun no agrego un detalle publico extendido para esta experiencia.")
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
  const highlights = experience.highlights.length
    ? experience.highlights
    : [
        "Responsabilidades y alcance declarados por el profesional.",
        "Contexto disponible para que empresas evalúen pertinencia técnica.",
        "Puede solicitarse validación referencial a Terraqo cuando exista evidencia o responsable cargado."
      ];

  return (
    <div className="min-h-screen bg-[#f7fbfa] text-[#0b1f2a]">
      <header className="border-b border-[#dceaec] bg-white/94 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[76px] w-[min(100%-32px,1180px)] items-center justify-between gap-4">
          <Link href={publicCvPath(username)} className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-[#008c83] font-mono text-sm font-black text-white">TQ</span>
            <span className="leading-none">
              <strong className="block font-display text-lg font-black">TERRAQO</strong>
              <small className="font-mono text-[10px] font-black uppercase tracking-[0.12em] text-[#008c83]">CV Vivo</small>
            </span>
          </Link>
          <Link href={publicCvPath(username, "experiencias")} className="inline-flex items-center gap-2 rounded-[8px] border border-[#dceaec] px-4 py-2 text-sm font-black text-[#0b1f2a] transition hover:border-[#9bdad4] hover:text-[#008c83]">
            Volver a experiencias
            <ArrowRight className="h-4 w-4 rotate-180" />
          </Link>
        </div>
      </header>

      <main className="mx-auto grid w-[min(100%-32px,1180px)] gap-6 py-8 lg:grid-cols-[1fr_360px]">
        <section className="overflow-hidden rounded-[24px] border border-[#dceaec] bg-white shadow-[0_24px_70px_rgba(12,43,49,0.08)]">
          <div className="bg-[radial-gradient(circle_at_18%_0%,#dff6f2,transparent_34%),linear-gradient(135deg,#ffffff,#f8fcfb)] p-6 md:p-8">
            <Link href={publicCvPath(username)} className="inline-flex items-center gap-2 text-sm font-black text-[#006c66]">
              <ArrowRight className="h-4 w-4 rotate-180" />
              {profile.user.name || username}
            </Link>
            <p className="mt-8 font-mono text-xs font-black uppercase tracking-[0.28em] text-[#008c83]">Detalle de experiencia</p>
            <h1 className="mt-4 max-w-4xl font-display text-4xl font-black leading-[0.98] md:text-6xl">{experience.title}</h1>
            <p className="mt-3 text-xl font-black text-[#008c83]">{company}</p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm font-bold text-[#435a66]">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#cfe5e2] bg-white px-3 py-2"><BriefcaseBusiness className="h-4 w-4 text-[#008c83]" />{experience.role || "Rol declarado"}</span>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#cfe5e2] bg-white px-3 py-2"><MapPin className="h-4 w-4 text-[#008c83]" />{location}</span>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#cfe5e2] bg-white px-3 py-2"><Clock3 className="h-4 w-4 text-[#008c83]" />{formatPeriod(experience.startedAt, experience.endedAt, experience.currentlyWorking)} · {duration}</span>
            </div>
          </div>

          <div className="grid gap-8 p-6 md:p-8">
            <article>
              <h2 className="font-display text-2xl font-black">Lo más destacado</h2>
              <div className="mt-4 space-y-4 text-base leading-8 text-[#435a66]">
                {paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </div>
            </article>

            <article className="rounded-[18px] border border-[#dceaec] bg-[#f8fcfb] p-5">
              <h2 className="font-display text-2xl font-black">Capacidades aplicadas en esta experiencia</h2>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {highlights.map((highlight) => (
                  <div key={highlight} className="flex gap-3 rounded-[14px] border border-[#dceaec] bg-white p-4">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#008c83]" />
                    <p className="text-sm font-semibold leading-6 text-[#344955]">{highlight}</p>
                  </div>
                ))}
              </div>
            </article>

            {experience.project ? (
              <article className="rounded-[18px] border border-[#dceaec] bg-white p-5">
                <p className="font-mono text-xs font-black uppercase tracking-[0.18em] text-[#008c83]">Proyecto vinculado</p>
                <h2 className="mt-3 font-display text-2xl font-black">{experience.project.title}</h2>
                <p className="mt-2 text-sm font-semibold text-[#435a66]">{experience.project.clientName || experience.project.location || experience.project.category || "Proyecto Terraqo"}</p>
              </article>
            ) : null}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-[22px] border border-[#dceaec] bg-white p-6 shadow-[0_24px_70px_rgba(12,43,49,0.08)]">
            <div className="flex items-center gap-4">
              <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-[#e7f8f5] font-display text-xl font-black text-[#008c83]">
                {profile.user.image ? <img src={profile.user.image} alt={profile.user.name || username} className="h-full w-full object-cover" /> : initials(profile.user.name || username)}
              </div>
              <div>
                <p className="font-display text-xl font-black">{profile.user.name || username}</p>
                <p className="text-sm font-bold text-[#008c83]">{profile.headline || "Perfil profesional"}</p>
              </div>
            </div>
            <div className="mt-6 rounded-[16px] border border-[#dceaec] bg-[#f8fcfb] p-4">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-[#008c83]" />
                <p className="font-black">{experience.verifiedByTerraqo ? "Validado por Terraqo" : "Pendiente de validacion"}</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-[#5f7280]">
                {experience.verifiedByTerraqo
                  ? "Esta experiencia cuenta con validacion referencial interna."
                  : "El estado indica que la experiencia fue declarada por el profesional y puede solicitar validacion referencial."}
              </p>
            </div>
            <Link href={`/cuenta?callbackUrl=${encodeURIComponent(publicCvPath(username))}`} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#008c83] px-5 py-3 text-sm font-black text-white shadow-[0_18px_38px_rgba(0,140,131,0.18)] transition hover:bg-[#006c66]">
              Contactar perfil
              <ArrowRight className="h-4 w-4" />
            </Link>
          </section>

          <section className="rounded-[22px] border border-[#dceaec] bg-[#071821] p-6 text-white shadow-[0_24px_70px_rgba(12,43,49,0.12)]">
            <BadgeCheck className="h-7 w-7 text-[#35d0c4]" />
            <h2 className="mt-4 font-display text-2xl font-black">CV vivo, no estático</h2>
            <p className="mt-3 text-sm leading-6 text-white/76">Cada experiencia puede ampliarse con alcance, evidencias, responsables y validaciones. La lectura pública se mantiene limpia; el detalle queda disponible cuando importa.</p>
          </section>
        </aside>
      </main>
    </div>
  );
}
