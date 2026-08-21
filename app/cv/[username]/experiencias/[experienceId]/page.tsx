import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  CircleDashed,
  Clock3,
  ExternalLink,
  FileCheck2,
  FileText,
  FolderKanban,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Target,
  UserRoundCheck,
  type LucideIcon
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { createMetadata } from "@/lib/seo";
import { formatExperienceDuration, monthsBetween, normalizeSpanishCopy } from "@/lib/terraqo/profile-summary";
import { publicCvPath } from "@/components/terraqo/public-cv";
import { TerraqoAvatar } from "@/components/terraqo/terraqo-avatar";
import { TerraqoPublicHeader } from "@/components/terraqo/terraqo-public-header";

type ExperienceDetailPageProps = {
  params: Promise<{ username: string; experienceId: string }>;
};

type VerificationTone = "approved" | "requested" | "rejected" | "declared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatDate(date?: Date | null, options: Intl.DateTimeFormatOptions = { year: "numeric" }) {
  if (!date) return "Actualidad";
  return new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", ...options }).format(date).replace(".", "");
}

function formatPeriod(start?: Date | null, end?: Date | null, currentlyWorking?: boolean) {
  const startLabel = start ? formatDate(start) : "Fecha no publicada";
  const endLabel = currentlyWorking ? "Actualidad" : end ? formatDate(end) : "Fecha no publicada";
  return `${startLabel} — ${endLabel}`;
}

function safeText(value?: string | null, fallback = "") {
  return normalizeSpanishCopy(value || "") || value?.trim() || fallback;
}

function isExternalReference(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

function verificationPresentation(status: string, verifiedByTerraqo: boolean) {
  if (verifiedByTerraqo || status === "APPROVED") {
    return {
      tone: "approved" as VerificationTone,
      label: "Validada por Terraqo",
      title: "Experiencia validada",
      description: "La referencia y la información presentada fueron revisadas dentro del proceso de validación de Terraqo."
    };
  }
  if (status === "REQUESTED") {
    return {
      tone: "requested" as VerificationTone,
      label: "Validación solicitada",
      title: "En proceso de validación",
      description: "La solicitud fue recibida y está pendiente de revisión por el responsable asignado."
    };
  }
  if (status === "REJECTED") {
    return {
      tone: "rejected" as VerificationTone,
      label: "Revisión observada",
      title: "Validación con observaciones",
      description: "La revisión requiere información adicional antes de poder acreditarse públicamente."
    };
  }
  return {
    tone: "declared" as VerificationTone,
    label: "Experiencia declarada",
    title: "Pendiente de validación",
    description: "Esta experiencia fue publicada por el profesional y todavía no cuenta con una validación externa."
  };
}

const verificationClasses: Record<VerificationTone, string> = {
  approved: "border-[#25c0d5]/30 bg-[#25c0d5]/10 text-[#52e0cf]",
  requested: "border-[#488ac9]/40 bg-[#4374ba]/20 text-[#9fc4ff]",
  rejected: "border-[#e57979]/30 bg-[#e57979]/10 text-[#ffaaa5]",
  declared: "border-[#d99a28]/30 bg-[#d99a28]/10 text-[#f2bd5d]"
};

function DetailMetric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string | number }) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-5 py-4 sm:px-6">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#488ac9]/30 bg-[#4374ba]/10 text-[#76a9f3]">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate font-display text-xl font-black text-white">{value}</p>
        <p className="mt-0.5 text-xs font-semibold text-white/50">{label}</p>
      </div>
    </div>
  );
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
      ? `${safeText(experience.title)} en ${safeText(experience.companyName, "experiencia profesional")} | ${experience.professionalProfile.user.name || username}`
      : "Experiencia profesional | CV Vivo Terraqo",
    description: safeText(experience?.summary, "Detalle público de experiencia profesional en CV Vivo Terraqo."),
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
          summary: true,
          isPublic: true,
          images: { select: { url: true, alt: true }, orderBy: { position: "asc" }, take: 1 }
        }
      }
    }
  });

  if (!experience) notFound();

  const duration = formatExperienceDuration(monthsBetween(experience.startedAt, experience.currentlyWorking ? null : experience.endedAt));
  const company = safeText(experience.companyName || experience.project?.clientName, "Empresa no publicada");
  const location = safeText(experience.locationCity || experience.location || experience.project?.location, "Ubicación no publicada");
  const title = safeText(experience.title);
  const role = safeText(experience.role, "Rol profesional");
  const summary = safeText(experience.summary);
  const paragraphs = summary.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const highlights = experience.highlights.map((item) => safeText(item)).filter(Boolean);
  const evidence = experience.evidence.map((item) => item.trim()).filter(Boolean);
  const verification = verificationPresentation(experience.verificationStatus, experience.verifiedByTerraqo);
  const reviewer = safeText(experience.validatorName || experience.validatorEmail);
  const projectImage = experience.project?.images[0];
  const completedFields = [experience.summary, experience.role, experience.locationCity || experience.location, experience.startedAt, experience.highlights.length, experience.evidence.length, experience.projectId].filter(Boolean).length;
  const completeness = Math.round((completedFields / 7) * 100);
  const contactPath = `/cuenta?callbackUrl=${encodeURIComponent(publicCvPath(username, `experiencias/${experience.id}`))}`;

  return (
    <div className="terraqo-brand-surface tq-cv-v3 min-h-screen bg-[#07111f] text-white">
      <TerraqoPublicHeader tone="dark" />
      <main className="relative isolate overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_8%_8%,rgba(67,116,186,0.22),transparent_28%),radial-gradient(circle_at_92%_72%,rgba(37,192,213,0.1),transparent_24%),linear-gradient(180deg,#07111f_0%,#040b15_100%)]" />
        <div className="pointer-events-none absolute right-[-12rem] top-28 -z-10 h-[34rem] w-[34rem] rounded-full border border-[#488ac9]/10 shadow-[0_0_120px_rgba(67,116,186,0.13)]" />

        <div className="mx-auto w-[min(100%-24px,1480px)] py-7 sm:w-[min(100%-40px,1480px)] sm:py-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link href={publicCvPath(username, "experiencias")} className="inline-flex items-center gap-2 text-sm font-black text-[#9fc4ff] transition hover:text-[#25c0d5]">
              <ArrowLeft className="h-4 w-4" />Volver a experiencias
            </Link>
            <Link href={publicCvPath(username)} className="inline-flex items-center gap-2 text-sm font-black text-white/50 transition hover:text-white">
              Ver CV completo<ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <section className="relative mt-7 overflow-hidden rounded-[28px] border border-[#488ac9]/30 bg-[#091727]/90 shadow-[0_30px_100px_rgba(0,0,0,0.32)]">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(67,116,186,0.13),transparent_43%),radial-gradient(circle_at_84%_10%,rgba(37,192,213,0.12),transparent_24%)]" />
            <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_350px] lg:p-10 xl:grid-cols-[minmax(0,1fr)_390px] xl:gap-12">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#488ac9]/30 bg-[#4374ba]/10 px-3 py-1.5 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[#9fc4ff]"><BriefcaseBusiness className="h-3.5 w-3.5" />Experiencia profesional</span>
                  {experience.currentlyWorking ? <span className="inline-flex items-center gap-2 rounded-full border border-[#25c0d5]/30 bg-[#25c0d5]/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-[#52e0cf]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#25c0d5]" />Cargo actual</span> : null}
                </div>

                <h1 className="mt-6 max-w-5xl font-display text-[clamp(2.6rem,5.6vw,5.8rem)] font-black leading-[0.93] tracking-[-0.05em] text-white">{title}</h1>
                <p className="mt-4 font-display text-xl font-black text-[#76a9f3] sm:text-2xl">{company}</p>
                <p className="mt-2 text-base font-bold text-white/70">{role}</p>

                <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-white/60">
                  <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[#488ac9]" />{formatPeriod(experience.startedAt, experience.endedAt, experience.currentlyWorking)}</span>
                  <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4 text-[#488ac9]" />{duration}</span>
                  <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-[#25c0d5]" />{location}</span>
                </div>

                <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-white/10 pt-6">
                  <TerraqoAvatar src={profile.user.image} name={profile.user.name || username} className="h-11 w-11 rounded-full border-2 border-white/20 text-sm" textClassName="text-[#9fc4ff]" />
                  <div className="min-w-0"><p className="truncate text-sm font-black text-white">{profile.user.name || username}</p><p className="truncate text-xs font-semibold text-white/50">{safeText(profile.headline, "Perfil profesional Terraqo")}</p></div>
                </div>
              </div>

              <aside className="self-start rounded-[22px] border border-white/10 bg-[#07111f]/70 p-5 backdrop-blur-md sm:p-6">
                <div className="flex items-center justify-between gap-4">
                  <div><p className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-white/50">Confianza y validación</p><h2 className="mt-3 font-display text-xl font-black text-white">{verification.title}</h2></div>
                  <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border ${verificationClasses[verification.tone]}`}>{verification.tone === "approved" ? <BadgeCheck className="h-6 w-6" /> : verification.tone === "requested" ? <Clock3 className="h-6 w-6" /> : <CircleDashed className="h-6 w-6" />}</span>
                </div>
                <span className={`mt-5 inline-flex rounded-full border px-3 py-1.5 text-[11px] font-black ${verificationClasses[verification.tone]}`}>{verification.label}</span>
                <p className="mt-4 text-sm leading-6 text-white/60">{verification.description}</p>
                <div className="mt-6 space-y-3 border-t border-white/10 pt-5 text-sm">
                  <div className="flex items-start justify-between gap-4"><span className="text-white/50">Responsable</span><strong className="max-w-[62%] text-right text-white/80">{reviewer || "Sin responsable público"}</strong></div>
                  <div className="flex items-start justify-between gap-4"><span className="text-white/50">Evidencias</span><strong className="text-white/80">{evidence.length}</strong></div>
                  <div className="flex items-start justify-between gap-4"><span className="text-white/50">Ficha completa</span><strong className="text-[#25c0d5]">{completeness}%</strong></div>
                </div>
                <Link href={publicCvPath(username, "documentos")} className="mt-6 inline-flex w-full items-center justify-between border-t border-white/10 pt-5 text-sm font-black text-[#9fc4ff] transition hover:text-[#25c0d5]">Ver estado de validaciones<ArrowRight className="h-4 w-4" /></Link>
              </aside>
            </div>

            <div className="relative grid border-t border-white/10 sm:grid-cols-2 xl:grid-cols-4 xl:divide-x xl:divide-white/10">
              <DetailMetric icon={Clock3} value={duration} label="Duración registrada" />
              <DetailMetric icon={Target} value={highlights.length} label="Logros o responsabilidades" />
              <DetailMetric icon={FileCheck2} value={evidence.length} label="Referencias o evidencias" />
              <DetailMetric icon={FolderKanban} value={experience.project ? 1 : 0} label="Proyecto vinculado" />
            </div>
          </section>

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.55fr)]">
            <div className="space-y-6">
              <section className="rounded-[24px] border border-white/10 bg-[#0e1a26]/60 p-6 sm:p-8">
                <div className="flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[#25c0d5]/20 bg-[#25c0d5]/10 text-[#25c0d5]"><FileText className="h-6 w-6" /></span><div><p className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[#25c0d5]">Contexto profesional</p><h2 className="mt-2 font-display text-2xl font-black tracking-[-0.02em] text-white sm:text-3xl">Alcance y contribución</h2></div></div>
                {paragraphs.length ? <div className="mt-7 max-w-4xl space-y-5 text-[15px] leading-8 text-white/70 sm:text-base">{paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div> : <div className="mt-7 rounded-[16px] border border-dashed border-white/10 px-5 py-6 text-sm leading-6 text-white/50">El profesional aún no publicó una descripción ampliada de esta experiencia.</div>}
              </section>

              <section className="rounded-[24px] border border-white/10 bg-[#0e1a26]/60 p-6 sm:p-8">
                <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[#25c0d5]">Resultados del rol</p><h2 className="mt-2 font-display text-2xl font-black tracking-[-0.02em] text-white sm:text-3xl">Logros y responsabilidades</h2></div><span className="text-sm font-black text-white/50">{highlights.length} registros públicos</span></div>
                {highlights.length ? (
                  <ol className="mt-7 grid gap-3 lg:grid-cols-2">
                    {highlights.map((highlight, index) => <li key={`${index}-${highlight}`} className="group flex gap-4 rounded-[16px] border border-white/10 bg-[#07111f]/60 p-5 transition hover:border-[#488ac9]/40"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[#488ac9]/30 bg-[#4374ba]/10 font-mono text-[10px] font-black text-[#9fc4ff]">{String(index + 1).padStart(2, "0")}</span><p className="text-sm font-semibold leading-6 text-white/70">{highlight}</p></li>)}
                  </ol>
                ) : <div className="mt-7 rounded-[16px] border border-dashed border-white/10 px-5 py-6 text-sm leading-6 text-white/50">Esta experiencia todavía no incluye logros o responsabilidades destacados.</div>}
              </section>

              {experience.project ? (
                <section className="overflow-hidden rounded-[24px] border border-[#488ac9]/30 bg-[#0e1a26]/70">
                  <div className="grid lg:grid-cols-[0.82fr_1.18fr]">
                    <div className="relative min-h-[250px] overflow-hidden bg-[radial-gradient(circle_at_30%_20%,rgba(72,138,201,0.32),transparent_42%),#07111f]">
                      {projectImage?.url ? <Image src={projectImage.url} alt={projectImage.alt || experience.project.title} fill unoptimized sizes="(max-width:1024px) 100vw, 38vw" className="object-cover opacity-72" /> : null}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#07111f] via-transparent to-transparent" />
                      <span className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-[#07111f]/70 px-3 py-1.5 font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[#9fc4ff] backdrop-blur-md"><FolderKanban className="h-3.5 w-3.5" />Proyecto vinculado</span>
                    </div>
                    <div className="p-6 sm:p-8">
                      <p className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[#25c0d5]">Contexto de proyecto</p>
                      <h2 className="mt-3 font-display text-2xl font-black text-white sm:text-3xl">{safeText(experience.project.title)}</h2>
                      <p className="mt-3 text-sm font-black text-[#76a9f3]">{safeText(experience.project.clientName, company)}</p>
                      {experience.project.summary ? <p className="mt-5 line-clamp-4 text-sm leading-7 text-white/60">{safeText(experience.project.summary)}</p> : null}
                      <div className="mt-6 flex flex-wrap gap-2 text-xs font-bold text-white/60">{experience.project.category ? <span className="rounded-full border border-white/10 px-3 py-1.5">{safeText(experience.project.category)}</span> : null}{experience.project.location ? <span className="rounded-full border border-white/10 px-3 py-1.5">{safeText(experience.project.location)}</span> : null}</div>
                      {experience.project.isPublic && experience.project.slug ? <Link href={`/proyectos/${experience.project.slug}`} className="mt-7 inline-flex items-center gap-2 text-sm font-black text-[#9fc4ff] transition hover:text-[#25c0d5]">Ver proyecto público<ExternalLink className="h-4 w-4" /></Link> : null}
                    </div>
                  </div>
                </section>
              ) : null}
            </div>

            <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
              <section className="rounded-[24px] border border-white/10 bg-[#0e1a26]/70 p-6 sm:p-7">
                <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-full border border-[#488ac9]/30 bg-[#4374ba]/10 text-[#76a9f3]"><ShieldCheck className="h-5 w-5" /></span><div><p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-white/50">Trazabilidad</p><h2 className="mt-1 font-display text-xl font-black text-white">Detalle de la revisión</h2></div></div>
                <div className="mt-6 space-y-4 text-sm">
                  <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4"><span className="text-white/50">Estado</span><strong className={`text-right ${verification.tone === "approved" ? "text-[#52e0cf]" : verification.tone === "rejected" ? "text-[#ffaaa5]" : "text-[#9fc4ff]"}`}>{verification.label}</strong></div>
                  <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4"><span className="text-white/50">Solicitada</span><strong className="text-right text-white/80">{experience.verificationRequestedAt ? formatDate(experience.verificationRequestedAt, { day: "2-digit", month: "short", year: "numeric" }) : "No solicitada"}</strong></div>
                  <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4"><span className="text-white/50">Última actualización</span><strong className="text-right text-white/80">{formatDate(experience.updatedAt, { day: "2-digit", month: "short", year: "numeric" })}</strong></div>
                  {reviewer ? <div className="flex items-start justify-between gap-4"><span className="text-white/50">Responsable</span><strong className="max-w-[62%] text-right text-white/80">{reviewer}</strong></div> : null}
                </div>
                {experience.verificationNote ? <div className="mt-6 rounded-[14px] border border-white/10 bg-[#07111f]/60 p-4"><p className="text-xs font-black uppercase tracking-[0.1em] text-[#9fc4ff]">Nota de validación</p><p className="mt-2 text-sm leading-6 text-white/60">{safeText(experience.verificationNote)}</p></div> : null}
              </section>

              <section className="rounded-[24px] border border-white/10 bg-[#0e1a26]/70 p-6 sm:p-7">
                <div className="flex items-center justify-between gap-4"><div><p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-white/50">Soportes publicados</p><h2 className="mt-1 font-display text-xl font-black text-white">Referencias y evidencias</h2></div><span className="grid h-10 min-w-10 place-items-center rounded-full border border-[#25c0d5]/20 bg-[#25c0d5]/10 px-3 text-sm font-black text-[#25c0d5]">{evidence.length}</span></div>
                {evidence.length ? (
                  <ul className="mt-6 space-y-3">
                    {evidence.map((item, index) => <li key={`${index}-${item}`}>{isExternalReference(item) ? <a href={item} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-[13px] border border-white/10 bg-[#07111f]/60 px-4 py-3 text-sm font-bold text-[#9fc4ff] transition hover:border-[#25c0d5]/40 hover:text-[#25c0d5]"><span className="truncate">Abrir evidencia {index + 1}</span><ExternalLink className="h-4 w-4 shrink-0" /></a> : <div className="flex gap-3 rounded-[13px] border border-white/10 bg-[#07111f]/60 px-4 py-3"><FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-[#25c0d5]" /><p className="text-sm leading-6 text-white/60">{safeText(item)}</p></div>}</li>)}
                  </ul>
                ) : <p className="mt-5 text-sm leading-6 text-white/50">No hay referencias o evidencias visibles en esta ficha.</p>}
              </section>

              <section className="relative overflow-hidden rounded-[24px] border border-[#488ac9]/30 bg-[linear-gradient(145deg,#102944,#0e1a26_58%,#07111f)] p-6 sm:p-7">
                <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full border border-[#25c0d5]/10" />
                <MessageSquare className="h-7 w-7 text-[#25c0d5]" />
                <h2 className="mt-5 font-display text-2xl font-black text-white">Conversar sobre esta experiencia</h2>
                <p className="mt-3 text-sm leading-6 text-white/60">Contacta al profesional desde Terraqo conservando el contexto de esta ficha.</p>
                <Link href={contactPath} prefetch={false} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#4374ba] px-5 py-3.5 text-sm font-black text-white shadow-[0_16px_34px_rgba(67,116,186,0.22)] transition hover:bg-[#488ac9]">Contactar perfil<ArrowRight className="h-4 w-4" /></Link>
              </section>
            </aside>
          </div>

          <section className="mt-6 flex flex-col gap-5 rounded-[22px] border border-[#488ac9]/20 bg-[#0e1a26]/60 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
            <div className="flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[#488ac9]/30 bg-[#4374ba]/10 text-[#9fc4ff]"><UserRoundCheck className="h-6 w-6" /></span><div><h2 className="font-display text-xl font-black text-white">Trayectoria con contexto verificable.</h2><p className="mt-1 text-sm leading-6 text-white/50">Consulta las demás experiencias públicas o regresa al resumen del CV Vivo.</p></div></div>
            <div className="flex flex-col gap-3 sm:flex-row"><Link href={publicCvPath(username, "experiencias")} className="inline-flex items-center justify-center gap-2 rounded-[9px] border border-[#488ac9]/40 px-5 py-3 text-sm font-black text-[#9fc4ff] transition hover:border-[#25c0d5] hover:text-[#25c0d5]">Ver trayectoria<BriefcaseBusiness className="h-4 w-4" /></Link><Link href={publicCvPath(username)} className="inline-flex items-center justify-center gap-2 rounded-[9px] bg-[#4374ba] px-5 py-3 text-sm font-black text-white transition hover:bg-[#488ac9]">Volver al CV<ArrowRight className="h-4 w-4" /></Link></div>
          </section>
        </div>
      </main>
    </div>
  );
}
