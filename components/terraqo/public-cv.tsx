import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Download,
  FileCheck2,
  FileText,
  FolderKanban,
  Gauge,
  Grid2X2,
  IdCard,
  LockKeyhole,
  MapPin,
  MessageSquare,
  Plus,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  type LucideIcon
} from "lucide-react";
import type { PublicCvProfile } from "@/lib/terraqo/public-cv";
import { formatExperienceDuration, monthsBetween, normalizeSpanishCopy } from "@/lib/terraqo/profile-summary";
import { TerraqoLogo } from "@/components/terraqo/terraqo-logo";
import { TerraqoAvatar } from "@/components/terraqo/terraqo-avatar";

type PublicCVPageProps = {
  profile: PublicCvProfile;
};

export type PublicCvSection = "experiencias" | "educacion" | "proyectos" | "evidencias" | "capacidades" | "documentos";

type ProjectSnapshot = {
  id: string;
  title: string;
  slug: string;
  clientName: string | null;
  location: string | null;
  category: string | null;
  status: string;
  image?: string;
};

const STATUS_COPY: Record<string, string> = {
  AVAILABLE: "Disponible ahora",
  WORKING: "Trabajando",
  OPEN_TO_PROJECTS: "Disponible para proyectos",
  NOT_AVAILABLE: "No disponible"
};

const PROJECT_STATUS_COPY: Record<string, string> = {
  PLANNING: "Planificado",
  IN_PROGRESS: "En ejecucion",
  FINISHED: "Completado",
  PUBLISHED: "Publicado",
  ARCHIVED: "Archivado"
};

const DOCUMENT_COPY: Record<string, { label: string; icon: LucideIcon }> = {
  CV: { label: "CV", icon: FileText },
  DNI_FRONT: { label: "DNI", icon: IdCard },
  DNI_BACK: { label: "DNI reverso", icon: IdCard },
  SCTR: { label: "SCTR", icon: ShieldCheck },
  CERTIFICATE: { label: "Certiadulto", icon: FileCheck2 },
  PROFESSIONAL_LICENSE: { label: "Licencia", icon: FileCheck2 },
  CRIMINAL_RECORD: { label: "Antecedentes", icon: ShieldCheck },
  MEDICAL_EXAM: { label: "Examen medico", icon: ClipboardCheck },
  BANK_CERTIFICATE: { label: "Cuenta bancaria", icon: FileCheck2 },
  OTHER: { label: "Otros docs", icon: FileText }
};

const PUBLIC_CV_SECTIONS: Record<PublicCvSection, { eyebrow: string; title: string; description: string }> = {
  experiencias: {
    eyebrow: "Experiencia verificable",
    title: "Trayectoria documentada con responsables y evidencia.",
    description: "Cada experiencia pública muestra empresa, rol, periodo, proyecto asociado y nivel de validación para que el trabajo pueda revisarse con criterio."
  },
  educacion: {
    eyebrow: "Educación y certificaciones",
    title: "Formación académica, certificaciones y programas relevantes.",
    description: "Una vista extendida de estudios, programas y credenciales públicas declaradas por el profesional."
  },
  proyectos: {
    eyebrow: "Proyectos",
    title: "Proyectos donde este perfil genero impacto medible.",
    description: "Una vista extendida de obras, encargos y trabajos vinculados al CV vivo. La información pública conserva el contexto sin exponer archivos privados."
  },
  evidencias: {
    eyebrow: "Evidencias públicas",
    title: "Bitácoras y registros que alimentan el CV en vivo.",
    description: "El CV no se queda en una declaración: se alimenta con actividad documentada, fechas, proyectos y revisiones profesionales."
  },
  capacidades: {
    eyebrow: "Capacidades",
    title: "Habilidades, equipos y herramientas dominadas.",
    description: "Una lectura ordenada de capacidades técnicas, software, equipos y áreas de especialidad declaradas por el profesional."
  },
  documentos: {
    eyebrow: "Confianza y documentos",
    title: "Estado público de validaciones y documentos revisados.",
    description: "Los documentos sensibles no se publican. Esta sección muestra solo el estado de revisión y permite solicitar acceso cuando corresponde."
  }
};

export function isPublicCvSection(value: string): value is PublicCvSection {
  return value === "experiencias" || value === "educacion" || value === "proyectos" || value === "evidencias" || value === "capacidades" || value === "documentos";
}

function formatDate(date?: Date | null, options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" }) {
  if (!date) return "Fecha por confirmar";
  return new Intl.DateTimeFormat("es-PE", options).format(date).replace(".", "");
}

function formatPeriod(start?: Date | null, end?: Date | null) {
  const startLabel = start ? formatDate(start, { year: "numeric" }) : "Sin fecha";
  const endLabel = end ? formatDate(end, { year: "numeric" }) : "Actualidad";
  return `${startLabel} - ${endLabel}`;
}

function projectImage(project?: { images?: { url: string }[] } | null) {
  return project?.images?.[0]?.url;
}

export function publicCvPath(username: string, section?: PublicCvSection | string) {
  return section ? `/cv/${username}/${section}` : `/cv/${username}`;
}

function publicCvCallback(username: string, section?: PublicCvSection) {
  const path = publicCvPath(username, section);
  return `/cuenta?callbackUrl=${encodeURIComponent(path)}`;
}

function projectHref(project: ProjectSnapshot) {
  const slug = project.slug?.trim();
  if (!slug || slug === "#") return null;
  if (/^https?:\/\//i.test(slug)) return slug;
  if (slug.startsWith("/")) return slug;
  return `/proyectos/${slug}`;
}

function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href);
}

function uniqueProjects(profile: PublicCvProfile, limit: number | null = 3): ProjectSnapshot[] {
  const map = new Map<string, ProjectSnapshot>();
  for (const experience of profile.experiences) {
    if (!experience.project) continue;
    map.set(experience.project.id, {
      id: experience.project.id,
      title: experience.project.title,
      slug: experience.project.slug,
      clientName: experience.project.clientName,
      location: experience.project.location,
      category: experience.project.category,
      status: experience.project.status,
      image: projectImage(experience.project)
    });
  }
  for (const worklog of profile.worklogs) {
    if (!worklog.project) continue;
    map.set(worklog.project.id, {
      id: worklog.project.id,
      title: worklog.project.title,
      slug: worklog.project.slug,
      clientName: worklog.project.clientName,
      location: worklog.project.location,
      category: worklog.project.category,
      status: worklog.project.status,
      image: projectImage(worklog.project)
    });
  }
  const projects = Array.from(map.values());
  return typeof limit === "number" ? projects.slice(0, limit) : projects;
}

function computeCompleteness(profile: PublicCvProfile) {
  const checks = [
    Boolean(profile.user.name),
    Boolean(profile.user.image),
    Boolean(profile.headline),
    Boolean(profile.bio),
    Boolean(profile.city),
    profile.specialties.length > 0,
    profile.software.length > 0,
    profile.equipment.length > 0,
    profile.experiences.length > 0,
    profile.documents.length > 0,
    profile.worklogs.length > 0
  ];
  return Math.max(18, Math.round((checks.filter(Boolean).length / checks.length) * 100));
}

function verifiedDocumentCount(profile: PublicCvProfile) {
  return profile.documents.filter((document) => document.reviewStatus === "VERIFIED").length;
}

function publicEvidenceCount(profile: PublicCvProfile) {
  return profile.worklogs.reduce((total, worklog) => total + 1 + worklog.evidenceUrls.length + worklog.media.length, 0);
}

function validationScore(profile: PublicCvProfile) {
  const total = Math.max(1, profile.experiences.length + profile.worklogs.length);
  const validated = profile.experiences.filter((item) => item.verifiedByTerraqo).length + profile.worklogs.filter((item) => item.validations.length > 0 || item.evidenceStatus === "VERIFIED").length;
  return Math.round((validated / total) * 100);
}

function latestActivity(profile: PublicCvProfile) {
  const latestWorklog = profile.worklogs[0]?.occurredAt;
  return latestWorklog || profile.updatedAt;
}

function currentHeadline(profile: PublicCvProfile) {
  if (profile.headline?.trim()) return profile.headline.trim();
  const current = profile.experiences.find((experience) => experience.currentlyWorking);
  if (current) {
    return `${current.role || current.title}${current.companyName ? ` - ${current.companyName}` : ""} (actualmente)`;
  }
  const latest = profile.experiences[0];
  if (latest) return latest.role || latest.title;
  return "Profesional Terraqo";
}

function profileSummary(profile: PublicCvProfile) {
  return normalizeSpanishCopy(profile.bio) || "Perfil profesional en actualización. El profesional aún no publicó su resumen principal.";
}

const SOCIAL_STYLE: Record<string, { label: string; mark: string; className: string }> = {
  WEB: { label: "Web", mark: "WEB", className: "bg-[#edf1f7] text-[#4374ba]" },
  LINKEDIN: { label: "LinkedIn", mark: "IN", className: "bg-[#e8f1ff] text-[#0a66c2]" },
  GITHUB: { label: "GitHub", mark: "GH", className: "bg-[#eef2f5] text-[#1f2937]" },
  INSTAGRAM: { label: "Instagram", mark: "IG", className: "bg-[#fff0f5] text-[#c13584]" },
  FACEBOOK: { label: "Facebook", mark: "FB", className: "bg-[#edf4ff] text-[#1877f2]" },
  YOUTUBE: { label: "YouTube", mark: "YT", className: "bg-[#fff0f0] text-[#ff0000]" },
  TIKTOK: { label: "TikTok", mark: "TK", className: "bg-[#f2f2f2] text-[#111111]" },
  X: { label: "X", mark: "X", className: "bg-[#eef2f5] text-[#111111]" },
  BEHANCE: { label: "Behance", mark: "BE", className: "bg-[#edf4ff] text-[#1769ff]" },
  DRIBBBLE: { label: "Dribbble", mark: "DR", className: "bg-[#fff0f6] text-[#ea4c89]" },
  WHATSAPP: { label: "WhatsApp", mark: "WA", className: "bg-[#e9fbef] text-[#128c7e]" },
  OTHER: { label: "Enlace", mark: "URL", className: "bg-[#eef2f5] text-[#344955]" }
};

function socialMeta(platform: string) {
  return SOCIAL_STYLE[platform] || SOCIAL_STYLE.OTHER;
}

function profileCapabilities(profile: PublicCvProfile, limit = 6) {
  const values = [
    ...profile.specialties,
    ...profile.professionalCategories,
    ...profile.equipment,
    ...profile.software
  ]
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(values)).slice(0, limit);
}

export function PublicCVPage({ profile }: PublicCVPageProps) {
  const name = profile.user.name || profile.username || "Profesional Terraqo";
  const username = profile.username || "perfil";
  const isPublicCv = profile.liveCvEnabled && profile.liveCvVisibility === "PUBLIC";
  const completeness = computeCompleteness(profile);
  const projects = uniqueProjects(profile);
  const specialties = profileCapabilities(profile, 12);
  const evidence = profile.worklogs.slice(0, 3);
  const lastActivity = latestActivity(profile);
  const verifiedDocs = verifiedDocumentCount(profile);
  const totalExperienceMonths = profile.experiences.reduce((sum, experience) => sum + monthsBetween(experience.startedAt, experience.currentlyWorking ? null : experience.endedAt), 0);

  return (
    <div className="terraqo-brand-surface tq-cv-v3 min-h-screen text-[#0e1a26]">
      <PublicCVHeader username={username} />
      <main>
        <section className="relative isolate overflow-hidden border-b border-white/10 bg-[#07111f] text-white">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_10%,rgba(67,116,186,0.28),transparent_30%),radial-gradient(circle_at_86%_28%,rgba(37,192,213,0.13),transparent_28%),linear-gradient(180deg,#07111f_0%,#040b15_100%)]" />
          <div className="pointer-events-none absolute inset-0 -z-10 opacity-[0.08] [background-image:linear-gradient(rgba(72,138,201,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(72,138,201,0.5)_1px,transparent_1px)] [background-size:72px_72px]" />
          <div className="mx-auto grid w-[min(100%-24px,1240px)] gap-6 py-6 sm:w-[min(100%-32px,1240px)] sm:py-9 lg:py-10">
            <div className="overflow-hidden rounded-[24px] border border-[#488ac9]/35 bg-[#0e1a26]/88 p-5 shadow-[0_32px_100px_rgba(0,0,0,0.38)] backdrop-blur-xl sm:p-7 lg:p-8">
              <div className="grid gap-7 lg:grid-cols-[1fr_290px] lg:gap-9">
                <ProfileHero profile={profile} name={name} username={username} specialties={specialties} isPublicCv={isPublicCv} />
                <VerificationPanel profile={profile} verifiedDocs={verifiedDocs} username={username} />
              </div>
              <div className="mt-7 border-t border-white/10 pt-7">
                <MetricStrip
                  experienceLabel={formatExperienceDuration(totalExperienceMonths)}
                  projects={projects.length || profile.experiences.length}
                  validation={validationScore(profile)}
                  evidence={publicEvidenceCount(profile)}
                  lastActivity={lastActivity}
                />
              </div>
            </div>
            <LiveCvPulse profile={profile} username={username} />
          </div>
        </section>

        <section className="mx-auto grid w-[min(100%-32px,1240px)] gap-5 py-8 sm:py-10">
          <ExperienceTimeline profile={profile} username={username} />
          <EducationTimeline profile={profile} username={username} />
          <FeaturedProjects projects={projects} profile={profile} username={username} />
          <PublicEvidence worklogs={evidence} username={username} />
          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <SkillsAndTools profile={profile} username={username} />
            <DocumentsPanel profile={profile} username={username} />
          </div>
          <PublicCVCTA username={username} isPublicCv={isPublicCv} completeness={completeness} />
        </section>
      </main>
      <PublicCVFooter updatedAt={profile.updatedAt} />
    </div>
  );
}

export function PublicCVSectionPage({ profile, section }: { profile: PublicCvProfile; section: PublicCvSection }) {
  const username = profile.username || "perfil";
  const copy = PUBLIC_CV_SECTIONS[section];
  const projects = uniqueProjects(profile, null);
  const evidence = profile.worklogs;

  return (
    <div className="terraqo-brand-surface tq-cv-v3 min-h-screen text-[#0e1a26]">
      <PublicCVHeader username={username} />
      <main>
        <section className="border-b border-[#d8e0ec] bg-[radial-gradient(circle_at_12%_8%,#edf1f7,transparent_34%),linear-gradient(135deg,#ffffff,#f7fbfa)]">
          <div className="mx-auto grid w-[min(100%-32px,1240px)] gap-6 py-10 md:grid-cols-[0.9fr_1.1fr] md:items-end">
            <div>
              <Link href={publicCvPath(username)} className="inline-flex items-center gap-2 text-sm font-black text-[#4374ba]">
                <ArrowRight className="h-4 w-4 rotate-180" />
                Volver al CV vivo
              </Link>
              <p className="mt-8 font-mono text-xs font-black uppercase tracking-[0.28em] text-[#4374ba]">{copy.eyebrow}</p>
              <h1 className="mt-4 max-w-3xl font-display text-4xl font-black leading-[0.98] md:text-6xl">{copy.title}</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-[#425865]">{copy.description}</p>
            </div>
            <div className="rounded-[18px] border border-[#d6e0eb] bg-white/82 p-6 shadow-[0_24px_60px_rgba(14,26,38,0.08)]">
              <span className="font-mono text-xs font-black uppercase tracking-[0.16em] text-[#4374ba]">Perfil</span>
              <div className="mt-3 flex items-center gap-4">
                <TerraqoAvatar src={profile.user.image} name={profile.user.name || username} className="h-16 w-16 rounded-full text-xl" />
                <div>
                  <h2 className="font-display text-2xl font-black">{profile.user.name || username}</h2>
                  <p className="mt-1 text-sm font-bold text-[#4374ba]">@{username}</p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                <MiniStat label="Experiencias" value={profile.experiences.length} />
                <MiniStat label="Proyectos" value={projects.length} />
                <MiniStat label="Evidencias" value={publicEvidenceCount(profile)} />
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto grid w-[min(100%-32px,1240px)] gap-5 py-8">
          {section === "experiencias" ? <ExperienceTimeline profile={profile} username={username} extended /> : null}
          {section === "educacion" ? <EducationTimeline profile={profile} username={username} extended /> : null}
          {section === "proyectos" ? <ProjectsSection projects={projects} profile={profile} username={username} extended /> : null}
          {section === "evidencias" ? <EvidenceSection worklogs={evidence} username={username} extended /> : null}
          {section === "capacidades" ? <SkillsAndTools profile={profile} username={username} extended /> : null}
          {section === "documentos" ? <DocumentsPanel profile={profile} username={username} extended /> : null}
          <PublicCVCTA username={username} isPublicCv={profile.liveCvEnabled && profile.liveCvVisibility === "PUBLIC"} completeness={computeCompleteness(profile)} />
        </section>
      </main>
      <PublicCVFooter updatedAt={profile.updatedAt} />
    </div>
  );
}

function PublicCVHeader({ username }: { username: string }) {
  const mobileLinks = [
    { label: "CV Vivo", href: publicCvPath(username) },
    { label: "Experiencias", href: publicCvPath(username, "experiencias") },
    { label: "Educación", href: publicCvPath(username, "educacion") },
    { label: "Proyectos", href: publicCvPath(username, "proyectos") },
    { label: "Evidencias", href: publicCvPath(username, "evidencias") },
    { label: "Capacidades", href: publicCvPath(username, "capacidades") },
    { label: "Documentos", href: publicCvPath(username, "documentos") }
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-[#d8e0ec] bg-white/92 backdrop-blur-xl">
      <div className="mx-auto flex min-h-[68px] w-[min(100%-28px,1240px)] items-center justify-between gap-3 sm:min-h-[76px] sm:w-[min(100%-32px,1240px)]">
        <Link href="/" className="flex items-center gap-3" aria-label="Terraqo CV Vivo">
          <TerraqoLogo variant="horizontal" alt="Terraqo" className="h-10 w-[150px] sm:h-11 sm:w-[170px]" />
          <span className="leading-none">
            <small className="font-mono text-[10px] font-black uppercase tracking-[0.12em] text-[#4374ba]">CV Vivo</small>
          </span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-bold text-[#344955] lg:flex" aria-label="Navegacion del CV Vivo">
          <Link className="border-b-2 border-[#4374ba] pb-2 text-[#0e1a26]" href={publicCvPath(username)}>CV Vivo</Link>
          <Link href="/">Sobre Terraqo</Link>
          <Link href="/cuenta" prefetch={false}>Para empresas</Link>
          <Link href="/portal/commons" prefetch={false}>Comunidad</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href={publicCvCallback(username)} className="hidden rounded-[8px] bg-[#4374ba] px-5 py-3 text-sm font-black text-white shadow-[0_14px_30px_rgba(0,140,131,0.18)] transition hover:bg-[#4374ba] sm:inline-flex">
            Contactar
          </Link>
          <Link href={publicCvCallback(username)} className="grid h-10 w-10 place-items-center rounded-[8px] border border-[#d8e0ec] text-[#0e1a26] transition hover:border-[#9bdad4] hover:text-[#4374ba] sm:hidden" aria-label="Contactar este perfil">
            <MessageSquare className="h-5 w-5" />
          </Link>
        </div>
      </div>
      <nav className="border-t border-[#edf3f2] lg:hidden" aria-label="Secciones del CV Vivo">
        <div className="mx-auto flex w-[min(100%-28px,1240px)] gap-2 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {mobileLinks.map((item) => (
            <Link key={item.href} href={item.href} className="shrink-0 rounded-[8px] border border-[#d8e0ec] bg-white px-3.5 py-2 text-xs font-black text-[#344955] transition hover:border-[#9bdad4] hover:text-[#4374ba]">
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}

function ProfileHero({ profile, name, username, specialties, isPublicCv }: { profile: PublicCvProfile; name: string; username: string; specialties: string[]; isPublicCv: boolean }) {
  const visibleSpecialties = specialties.slice(0, 5);
  const remainingSpecialties = Math.max(0, specialties.length - visibleSpecialties.length);

  return (
    <div id="cv-vivo" className="relative grid gap-6 text-center text-white sm:grid-cols-[150px_1fr] sm:text-left lg:grid-cols-[164px_1fr] lg:gap-7">
      <div className="relative mx-auto h-[142px] w-[142px] sm:mx-0 sm:h-[150px] sm:w-[150px] lg:h-[164px] lg:w-[164px]">
        <span className="absolute -inset-2 rounded-full bg-[conic-gradient(from_180deg,#25c0d5,#4374ba,#488ac9,#25c0d5)] opacity-90 blur-[1px]" />
        <span className="absolute -inset-5 rounded-full bg-[#4374ba]/20 blur-2xl" />
        <TerraqoAvatar src={profile.user.image} name={name} className="relative h-full w-full rounded-full border-[5px] border-[#07111f] text-5xl shadow-[0_0_0_2px_rgba(72,138,201,0.9),0_18px_45px_rgba(0,0,0,0.42)]" textClassName="text-[#488ac9]" />
        <span className="absolute bottom-2 right-2 grid h-7 w-7 place-items-center rounded-full border-[4px] border-[#0e1a26] bg-[#25c0d5] shadow-[0_0_18px_rgba(37,192,213,0.7)]" />
      </div>

      <div className="flex min-w-0 flex-col justify-center">
        <div className="mb-4 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
          <TrustBadge icon={Sparkles} label={isPublicCv ? "Vista pública" : "Perfil público"} />
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-start">
          <h1 className="max-w-[760px] font-display text-[2.05rem] font-black leading-[0.98] tracking-[-0.035em] sm:text-4xl lg:text-[2.75rem]">{name}</h1>
          {profile.identityVerificationStatus === "VERIFIED" ? (
            <span title="Identidad verificada por Terraqo" className="text-[#25c0d5]"><BadgeCheck className="h-7 w-7 fill-[#25c0d5] text-[#07111f]" /></span>
          ) : null}
        </div>
        <p className="mt-3 font-display text-lg font-black text-[#488ac9] sm:text-xl">{currentHeadline(profile)}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs font-semibold text-white/70 sm:justify-start sm:text-sm">
          <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-[#25c0d5]" />{profile.city || "Ubicación por completar"}</span>
          <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#25c0d5] shadow-[0_0_10px_rgba(37,192,213,0.65)]" />{STATUS_COPY[profile.status] || "Estado profesional activo"}</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/55">@{username}</span>
        </div>
        {profile.socialLinks.length ? (
          <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
            {profile.socialLinks.slice(0, 6).map((link) => {
              const meta = socialMeta(link.platform);
              return (
                <a key={link.id} href={link.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-3 py-2 text-xs font-black text-white transition hover:-translate-y-0.5 hover:border-[#25c0d5]/55 hover:bg-[#25c0d5]/10">
                  <span className={`grid h-6 min-w-6 place-items-center rounded-full px-1.5 font-mono text-[10px] font-black ${meta.className}`}>{meta.mark}</span>
                  {link.label || meta.label}
                </a>
              );
            })}
          </div>
        ) : null}
        <p className="mt-5 line-clamp-5 max-w-3xl text-sm leading-7 text-white/72 sm:line-clamp-6 sm:text-[15px]">{profileSummary(profile)}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2 sm:justify-start">
          {visibleSpecialties.length ? visibleSpecialties.map((item) => <ToolChip key={item} label={item} tone="dark" />) : <ToolChip label="Perfil en actualización" tone="dark" />}
          {remainingSpecialties ? <span className="inline-flex items-center gap-1 rounded-full border border-[#488ac9]/25 bg-[#4374ba]/10 px-3 py-1.5 text-xs font-black text-[#9fc4ff]"><Plus className="h-3.5 w-3.5" />{remainingSpecialties}</span> : null}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2 sm:hidden">
          <Link href={publicCvCallback(username)} className="rounded-xl bg-[#4374ba] px-4 py-3 text-sm font-black text-white shadow-[0_18px_40px_rgba(67,116,186,0.28)]">
            Contactar
          </Link>
          <Link href={publicCvPath(username, "experiencias")} className="rounded-xl border border-white/14 bg-white/8 px-4 py-3 text-sm font-black text-white">
            Ver experiencia
          </Link>
        </div>
      </div>
    </div>
  );
}

function VerificationPanel({ profile, verifiedDocs, username }: { profile: PublicCvProfile; verifiedDocs: number; username: string }) {
  const verifiedExperiences = profile.experiences.filter((experience) => experience.verifiedByTerraqo).length;
  const approvedWorklogs = profile.worklogs.filter((worklog) => worklog.validations.length > 0 || worklog.evidenceStatus === "VERIFIED").length;
  const items = [
    { label: "Identidad verificada", detail: profile.identityVerificationStatus === "VERIFIED" ? "DNI validado" : "Pendiente de validación", done: profile.identityVerificationStatus === "VERIFIED", icon: IdCard },
    { label: "Documentos revisados", detail: `${verifiedDocs} de ${profile.documents.length || 0} documentos`, done: verifiedDocs > 0, icon: FileCheck2 },
    { label: "Experiencia validada", detail: `${verifiedExperiences} experiencias`, done: verifiedExperiences > 0, icon: BriefcaseBusiness },
    { label: "Actividad comprobada", detail: `${approvedWorklogs} registros y evidencias`, done: approvedWorklogs > 0, icon: ClipboardCheck }
  ];
  const completed = items.filter((item) => item.done).length;
  const trustScore = Math.round((completed / items.length) * 100);
  const trustLevel = trustScore === 100 ? "Verificado" : trustScore >= 75 ? "Avanzado" : trustScore >= 50 ? "En desarrollo" : "Inicial";

  return (
    <aside className="rounded-[18px] border border-[#488ac9]/35 bg-[#07111f]/82 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_45px_rgba(0,0,0,0.22)]">
      <h2 className="flex items-center gap-3 font-mono text-[11px] font-black uppercase tracking-[0.12em] text-white/78"><ShieldCheck className="h-5 w-5 text-[#488ac9]" />Confianza y verificación</h2>
      <div className="mt-5 text-center">
        <p className="text-xs font-semibold text-white/48">Tu nivel de confianza</p>
        <p className="mt-1 font-display text-sm font-black uppercase tracking-[0.12em] text-[#25c0d5]">{trustLevel}</p>
        <div className="relative mx-auto mt-4 grid h-28 w-28 place-items-center rounded-full" role="img" aria-label={`${trustScore}% de nivel de confianza`} style={{ background: `conic-gradient(#25c0d5 ${trustScore * 3.6}deg, rgba(72,138,201,0.18) 0deg)` }}>
          <span className="absolute inset-[9px] rounded-full border border-white/[0.06] bg-[#07111f]" />
          <strong className="relative font-display text-3xl font-black text-white">{trustScore}%</strong>
        </div>
        <p className="mt-3 text-xs font-semibold text-white/58">{completed} de {items.length} áreas completadas</p>
      </div>
      <div className="mt-5 space-y-2 border-t border-white/10 pt-4">
        {items.map((item) => (
          <div key={item.label} className="grid grid-cols-[22px_1fr_20px] items-center gap-2.5 rounded-lg px-1 py-1.5" title={item.detail}>
            <span className={item.done ? "text-[#25c0d5]" : "text-[#d99a2b]"}><item.icon className="h-4 w-4" /></span>
            <strong className="text-xs font-bold text-white/75">{item.label}</strong>
            <span className={item.done ? "text-[#25c0d5]" : "text-[#d99a2b]"} title={item.done ? "Validado" : "Pendiente"}>
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
        ))}
      </div>
      <Link href={publicCvPath(username, "documentos")} className="mt-5 flex items-center justify-between border-t border-white/10 pt-4 text-xs font-black text-[#9fc4ff] transition hover:text-[#25c0d5]">Ver validaciones <ArrowRight className="h-4 w-4" /></Link>
    </aside>
  );
}

function MetricStrip({ experienceLabel, projects, validation, evidence, lastActivity }: { experienceLabel: string; projects: number; validation: number; evidence: number; lastActivity: Date }) {
  const metrics = [
    { label: "Experiencia acumulada", value: experienceLabel, icon: UserRoundCheck },
    { label: "Proyectos completados", value: projects, icon: FolderKanban },
    { label: "Experiencias validadas", value: `${validation}%`, icon: Grid2X2 },
    { label: "Evidencias públicas", value: evidence, icon: ClipboardCheck }
  ];
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-[16px] border border-white/10 bg-[#07111f]/72 md:grid-cols-[repeat(4,1fr)_190px]">
      {metrics.map((metric) => (
        <div key={metric.label} className="flex min-h-[92px] items-center gap-3 border-b border-r border-white/10 px-4 even:border-r-0 md:border-b-0 md:border-r md:px-5 md:even:border-r">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] border border-[#488ac9]/20 bg-[#4374ba]/10 text-[#488ac9]"><metric.icon className="h-5 w-5" /></span>
          <span><strong className="block font-display text-2xl font-black text-white sm:text-[1.7rem]">{metric.value}</strong><small className="font-semibold text-white/48">{metric.label}</small></span>
        </div>
      ))}
      <div className="col-span-2 flex min-h-[92px] items-center gap-3 px-4 md:col-span-1 md:px-5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#25c0d5] shadow-[0_0_14px_rgba(37,192,213,0.72)]" />
        <span><small className="block text-xs text-white/42">Última actualización</small><strong className="text-sm text-white/82">{formatDate(lastActivity, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</strong></span>
      </div>
    </div>
  );
}

function ExperienceTimeline({ profile, username, extended = false }: { profile: PublicCvProfile; username: string; extended?: boolean }) {
  const experiences = extended ? profile.experiences : profile.experiences.slice(0, 3);
  return (
    <section id="experiencia" className="rounded-[16px] border border-[#d8e0ec] bg-white p-5 shadow-[0_18px_50px_rgba(12,43,49,0.06)]">
      <SectionHeader title="Experiencia profesional" description="Trayectoria pública seleccionada por el profesional." action={extended ? "Volver al CV vivo" : "Ver todas las experiencias"} href={extended ? publicCvPath(username) : publicCvPath(username, "experiencias")} />
      <div className="mt-6 space-y-4 border-l border-[#cce4e1] pl-5">
        {experiences.length ? experiences.map((experience) => <ExperienceCard key={experience.id} experience={experience} username={username} />) : <EmptyState title="Sin experiencias públicas" description="Cuando el profesional publique experiencias, aparecerán aquí con su rol, periodo y nivel de revisión." />}
      </div>
    </section>
  );
}

function EducationTimeline({ profile, username, extended = false }: { profile: PublicCvProfile; username: string; extended?: boolean }) {
  if (!profile.education.length) return null;
  const educationItems = extended ? profile.education : profile.education.slice(0, 3);
  return (
    <section className="rounded-[16px] border border-[#d8e0ec] bg-white p-5 shadow-[0_18px_50px_rgba(12,43,49,0.06)]">
      <SectionHeader title="Educación y certificaciones" description="Formación pública declarada por el profesional." action={extended ? "Volver al CV vivo" : "Ver más"} href={extended ? publicCvPath(username) : publicCvPath(username, "educacion")} />
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {educationItems.map((education) => (
          <article key={education.id} className="rounded-[14px] border border-[#d8e0ec] bg-[#f8fcfb] p-4">
            <p className="font-display text-lg font-black">{education.degree}</p>
            <p className="mt-1 text-sm font-black text-[#4374ba]">{education.institution}</p>
            {education.field ? <p className="mt-2 text-sm text-[#435a66]">{education.field}</p> : null}
            <p className="mt-3 text-xs font-bold uppercase tracking-[0.08em] text-[#607083]">{formatPeriod(education.startedAt, education.currentlyStudying ? null : education.endedAt)}{education.locationCity ? ` · ${education.locationCity}` : ""}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ExperienceCard({ experience, username }: { experience: PublicCvProfile["experiences"][number]; username: string }) {
  const checks = (experience.verifiedByTerraqo ? 1 : 0) + (experience.project ? 1 : 0);
  return (
    <article className="relative grid gap-5 rounded-[14px] border border-[#d8e0ec] bg-white p-4 md:grid-cols-[120px_130px_1fr_210px]">
      <span className="absolute -left-[27px] top-8 grid h-4 w-4 place-items-center rounded-full bg-[#4374ba] ring-4 ring-white" />
      <div className="font-mono text-xs font-black uppercase tracking-[0.08em] text-[#435a66]">
        <span className="block">{formatPeriod(experience.startedAt, experience.currentlyWorking ? null : experience.endedAt)}</span>
        <small className="mt-1 block text-[#7a8d96]">{experience.locationCity || experience.location || experience.project?.location || "Ubicación no pública"}</small>
        <small className="mt-1 block text-[#4374ba]">{formatExperienceDuration(monthsBetween(experience.startedAt, experience.currentlyWorking ? null : experience.endedAt))}</small>
      </div>
      <CompanyTile label={experience.companyName || experience.project?.clientName || "Empresa"} />
      <div>
        <h3 className="font-display text-xl font-black">{experience.title}</h3>
        <p className="mt-1 text-sm font-black text-[#4374ba]">{experience.companyName || experience.project?.clientName || "Empresa no pública"}</p>
        <p className="mt-3 text-sm leading-6 text-[#435a66]">{experience.role || "Experiencia profesional declarada por el profesional."}</p>
        {experience.summary ? <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#435a66]">{experience.summary}</p> : null}
      </div>
      <div className="flex flex-col items-start justify-between gap-4 md:items-end">
        <ValidationBadge checks={checks} verified={experience.verifiedByTerraqo} />
        <div className="flex gap-2 text-[#4374ba]">
          {Array.from({ length: Math.max(1, checks) }).map((_, index) => <CheckCircle2 key={index} className="h-5 w-5" />)}
        </div>
        <Link href={publicCvPath(username, `experiencias/${experience.id}`)} className="rounded-[8px] border border-[#d8e0ec] px-4 py-2 text-sm font-black text-[#0e1a26] transition hover:border-[#9bdad4] hover:text-[#4374ba]">Ver detalles</Link>
      </div>
    </article>
  );
}

function FeaturedProjects({ projects, profile, username }: { projects: ProjectSnapshot[]; profile: PublicCvProfile; username: string }) {
  return <ProjectsSection projects={projects} profile={profile} username={username} />;
}

function LiveCvPulse({ profile, username }: { profile: PublicCvProfile; username: string }) {
  const updates = profile.worklogs.slice(0, 3);
  const last = latestActivity(profile);
  return (
    <section className="relative isolate overflow-hidden rounded-[22px] border border-[#488ac9]/30 bg-[#0e1a26]/82 text-white shadow-[0_24px_70px_rgba(0,0,0,0.24)]">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_84%_50%,rgba(67,116,186,0.18),transparent_34%)]" />
      <div className="grid min-h-[240px] gap-5 p-6 sm:p-7 lg:grid-cols-[0.78fr_1.22fr] lg:items-center lg:p-8">
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#25c0d5]/30 bg-[#25c0d5]/[0.08] px-3 py-1.5 text-xs font-black text-[#25c0d5]">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#25c0d5] opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#25c0d5]" />
            </span>
            En vivo
          </div>
          <h2 className="mt-4 font-display text-2xl font-black uppercase tracking-[-0.02em] sm:text-3xl">Actividad profesional reciente</h2>
          <p className="mt-3 max-w-lg text-sm leading-7 text-white/62">Este CV evoluciona con experiencias, evidencias, documentos y actividad vinculada al trabajo real.</p>
          <p className="mt-4 font-mono text-[11px] font-black uppercase tracking-[0.14em] text-white/42">Última actualización · {formatDate(last, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
          <Link href={publicCvPath(username, "evidencias")} className="mt-6 inline-flex items-center gap-2 text-sm font-black text-[#9fc4ff] transition hover:text-[#25c0d5]">Ver toda la actividad <ArrowRight className="h-4 w-4" /></Link>
        </div>
        <div className="relative min-h-[190px] overflow-hidden rounded-[18px] border border-white/[0.06] bg-[#07111f]/50">
          <LiveNetworkGraphic />
          {updates[0] ? (
            <article className="absolute bottom-4 left-4 right-4 z-10 rounded-[12px] border border-[#488ac9]/25 bg-[#07111f]/80 p-3 backdrop-blur-md sm:left-auto sm:max-w-[310px]">
              <div className="flex items-start gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#4374ba]/15 text-[#25c0d5]"><Activity className="h-4 w-4" /></span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-black text-white/88">{updates[0].title}</p>
                  <p className="mt-1 truncate text-[11px] font-semibold text-white/42">{updates[0].project?.title || updates[0].workspace?.brandName || updates[0].workspace?.name || "Registro profesional"}</p>
                </div>
              </div>
            </article>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function LiveNetworkGraphic() {
  return (
    <svg aria-hidden="true" viewBox="0 0 620 250" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="cv-network-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#25c0d5" stopOpacity="0.9" />
          <stop offset="42%" stopColor="#4374ba" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#0e1a26" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="cv-network-line" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4374ba" stopOpacity="0.08" />
          <stop offset="52%" stopColor="#488ac9" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#25c0d5" stopOpacity="0.12" />
        </linearGradient>
        <filter id="cv-node-blur"><feGaussianBlur stdDeviation="12" /></filter>
      </defs>
      <ellipse cx="410" cy="132" rx="220" ry="112" fill="url(#cv-network-glow)" opacity="0.22" />
      <g fill="none" stroke="url(#cv-network-line)" strokeWidth="1.2">
        <path d="M90 168C178 32 388 14 558 102" />
        <path d="M84 198C230 118 412 94 586 143" />
        <path d="M166 230C236 78 420 28 544 190" />
        <path d="M250 236C292 112 394 70 500 42" />
        <path d="M192 78C322 170 438 192 594 126" />
        <path d="M130 130L280 82L390 146L508 78L570 164" />
        <path d="M182 206L280 82L342 214L390 146L492 220L508 78" />
      </g>
      <g fill="#4374ba" opacity="0.35" filter="url(#cv-node-blur)">
        <circle cx="280" cy="82" r="22" /><circle cx="390" cy="146" r="28" /><circle cx="508" cy="78" r="20" />
      </g>
      <g stroke="#9fc4ff" strokeWidth="1.2">
        <circle cx="130" cy="130" r="5" fill="#4374ba" />
        <circle cx="182" cy="206" r="4" fill="#25c0d5" />
        <circle cx="280" cy="82" r="8" fill="#488ac9" />
        <circle cx="342" cy="214" r="5" fill="#4374ba" />
        <circle cx="390" cy="146" r="10" fill="#25c0d5" />
        <circle cx="492" cy="220" r="4" fill="#488ac9" />
        <circle cx="508" cy="78" r="7" fill="#4374ba" />
        <circle cx="570" cy="164" r="5" fill="#25c0d5" />
      </g>
      <g fill="#ffffff">
        <circle cx="390" cy="146" r="2.4" /><circle cx="280" cy="82" r="1.8" /><circle cx="508" cy="78" r="1.8" />
      </g>
    </svg>
  );
}

function ProjectsSection({ projects, profile, username, extended = false }: { projects: ProjectSnapshot[]; profile: PublicCvProfile; username?: string; extended?: boolean }) {
  const fallback = profile.worklogs.filter((worklog) => !worklog.project).slice(0, extended ? 24 : 4);
  return (
    <section id="proyectos" className="rounded-[16px] border border-[#d8e0ec] bg-white p-5 shadow-[0_18px_50px_rgba(12,43,49,0.06)]">
      <SectionHeader title="Proyectos destacados" description="Proyectos en los que ha participado y generado impacto." action={extended ? "Volver al CV vivo" : "Ver todos los proyectos"} href={extended && username ? publicCvPath(username) : publicCvPath(username || profile.username || "perfil", "proyectos")} />
      <div className={extended ? "mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" : "mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"}>
        {projects.map((project) => <ProjectCard key={project.id} project={project} />)}
        {!projects.length && fallback.map((worklog) => <ProjectCard key={worklog.id} project={{ id: worklog.id, title: worklog.title, slug: "#", clientName: worklog.workspace?.brandName || worklog.workspace?.name || "Terraqo", location: null, category: worklog.type, status: "PUBLISHED" }} />)}
        {!projects.length && !fallback.length ? <EmptyState title="Sin proyectos públicos" description="Los proyectos seleccionados aparecerán cuando el profesional active su visibilidad pública." /> : null}
      </div>
    </section>
  );
}

function ProjectCard({ project }: { project: ProjectSnapshot }) {
  const href = projectHref(project);
  const className =
    "group block overflow-hidden rounded-[12px] border border-[#d8e0ec] bg-white transition duration-200 hover:-translate-y-1 hover:border-[#9bdad4] hover:shadow-[0_18px_42px_rgba(12,43,49,0.11)]";
  const content = (
    <>
      <VisualFrame src={project.image} label={project.title} />
      <div className="p-4">
        <span className="inline-flex rounded-[7px] bg-[#edf1f7] px-2 py-1 text-xs font-black text-[#4374ba]">{PROJECT_STATUS_COPY[project.status] || "Proyecto"}</span>
        <h3 className="mt-3 min-h-[48px] font-display text-base font-black leading-tight">{project.title}</h3>
        <p className="mt-2 text-xs font-semibold text-[#4374ba]">{project.clientName || project.location || project.category || "Proyecto Terraqo"}</p>
        <span className="mt-4 inline-flex items-center gap-2 text-xs font-black text-[#4374ba] transition group-hover:translate-x-1">
          {href ? "Ver proyecto" : "Detalle no público"}
          {href ? <ArrowRight className="h-3.5 w-3.5" /> : null}
        </span>
      </div>
    </>
  );

  if (!href) {
    return <article className={className}>{content}</article>;
  }

  if (isExternalHref(href)) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className} aria-label={`Ver proyecto ${project.title}`}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className={className} aria-label={`Ver proyecto ${project.title}`}>
      {content}
    </Link>
  );
}

function PublicEvidence({ worklogs, username }: { worklogs: PublicCvProfile["worklogs"]; username: string }) {
  return <EvidenceSection worklogs={worklogs} username={username} />;
}

function EvidenceSection({ worklogs, username, extended = false }: { worklogs: PublicCvProfile["worklogs"]; username?: string; extended?: boolean }) {
  return (
    <section id="evidencias" className="rounded-[16px] border border-[#d8e0ec] bg-white p-5 shadow-[0_18px_50px_rgba(12,43,49,0.06)]">
      <SectionHeader title="Evidencias públicas" description="Muestra del trabajo real documentado en campo." action={extended ? "Volver al CV vivo" : "Ver todas las evidencias"} href={extended && username ? publicCvPath(username) : publicCvPath(username || "perfil", "evidencias")} />
      <div className={extended ? "mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" : "mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-6"}>
        {worklogs.length ? worklogs.map((worklog) => <EvidenceCard key={worklog.id} worklog={worklog} />) : <EmptyState title="Sin evidencias públicas" description="Las evidencias públicas seleccionadas aparecerán en esta sección." />}
      </div>
    </section>
  );
}

function EvidenceCard({ worklog }: { worklog: PublicCvProfile["worklogs"][number] }) {
  const src = worklog.evidenceUrls.find((url) => url.startsWith("http") || url.startsWith("/")) || projectImage(worklog.project);
  return (
    <article className="overflow-hidden rounded-[12px] border border-[#d8e0ec] bg-white">
      <VisualFrame src={src} label={worklog.title} compact />
      <div className="p-3">
        <h3 className="line-clamp-2 min-h-[36px] text-sm font-black">{worklog.title}</h3>
        <p className="mt-2 font-mono text-xs text-[#607083]">{formatDate(worklog.occurredAt, { year: "numeric" })}</p>
      </div>
    </article>
  );
}

function SkillsAndTools({ profile, username, extended = false }: { profile: PublicCvProfile; username?: string; extended?: boolean }) {
  const bars = (extended ? profile.specialties : profile.specialties.slice(0, 3));
  const tools = (extended ? [...profile.equipment, ...profile.software] : [...profile.equipment, ...profile.software].slice(0, 8));
  const categories = extended ? profile.professionalCategories : profile.professionalCategories.slice(0, 3);
  return (
    <section className="rounded-[16px] border border-[#d8e0ec] bg-white p-5 shadow-[0_18px_50px_rgba(12,43,49,0.06)]">
      <SectionHeader title="Capacidades técnicas" description="Habilidades, equipos y software declarados por el profesional." action={extended ? "Volver al CV vivo" : "Ver todas las capacidades"} href={extended && username ? publicCvPath(username) : username ? publicCvPath(username, "capacidades") : undefined} />
      <div className="mt-5 grid gap-6 md:grid-cols-[0.9fr_1fr]">
        <div className="space-y-4">
          {bars.length ? bars.map((skill, index) => <SkillBar key={skill} label={skill} value={95 - index * 9} />) : <EmptyState title="Habilidades por completar" description="El profesional aún no publicó sus habilidades principales." />}
        </div>
        <div className="flex flex-wrap content-start gap-2">
          {[...categories, ...tools].length ? [...categories, ...tools].map((tool) => <ToolChip key={tool} label={tool} />) : <ToolChip label="Herramientas por completar" />}
        </div>
      </div>
    </section>
  );
}

function DocumentsPanel({ profile, username, extended = false }: { profile: PublicCvProfile; username: string; extended?: boolean }) {
  const grouped = new Map<string, PublicCvProfile["documents"][number]>();
  for (const document of profile.documents) {
    if (!grouped.has(document.type) || document.reviewStatus === "VERIFIED") grouped.set(document.type, document);
  }
  const docs = ["DNI_FRONT", "SCTR", "CERTIFICATE", "CRIMINAL_RECORD", "CV", "OTHER"].map((type) => grouped.get(type) || { id: type, type, reviewStatus: "SUBMITTED" as const, uploadedAt: null, reviewedAt: null });
  return (
    <section id="documentos" className="rounded-[16px] border border-[#d8e0ec] bg-white p-5 shadow-[0_18px_50px_rgba(12,43,49,0.06)]">
      <h2 className="font-display text-xl font-black">Confianza y documentos</h2>
      <p className="mt-1 text-sm text-[#607083]">Estado público de documentos revisados. Los archivos privados no se exponen.</p>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {docs.map((document) => <DocumentStatusCard key={`${document.type}-${document.id}`} document={document} />)}
      </div>
      <Link href={extended ? publicCvCallback(username, "documentos") : publicCvPath(username, "documentos")} className="mt-5 inline-flex items-center gap-2 text-sm font-black text-[#4374ba]">{extended ? "Solicitar acceso al detalle" : "Ver todos los documentos"} <ArrowRight className="h-4 w-4" /></Link>
    </section>
  );
}

function PublicCVCTA({ username, isPublicCv, completeness }: { username: string; isPublicCv: boolean; completeness: number }) {
  return (
    <section className="grid gap-5 rounded-[16px] border border-[#d6e0eb] bg-gradient-to-r from-[#f3f3f3] to-white p-6 shadow-[0_18px_50px_rgba(14,26,38,0.05)] md:grid-cols-[1fr_auto] md:items-center">
      <div className="flex items-center gap-5">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-[#edf1f7] text-[#4374ba]"><LockKeyhole className="h-7 w-7" /></span>
        <div>
          <h2 className="font-display text-xl font-black">¿Quieres conocer más sobre mi experiencia?</h2>
          <p className="mt-1 text-sm text-[#607083]">{isPublicCv ? "Solicita acceso a mi CV completo para ver información detallada, documentos y evidencia adicional." : `Este CV muestra una vista pública resumida. Perfil completo al ${completeness}%.`}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href={publicCvCallback(username)} className="inline-flex items-center justify-center gap-2 rounded-[8px] border border-[#9ed8d2] bg-white px-5 py-3 text-sm font-black text-[#4374ba]"><MessageSquare className="h-4 w-4" />Contactar</Link>
        <Link href={publicCvCallback(username)} className="inline-flex items-center justify-center gap-2 rounded-[8px] bg-[#4374ba] px-5 py-3 text-sm font-black text-white"><LockKeyhole className="h-4 w-4" />Solicitar acceso al CV completo</Link>
        <Link href={`/api/terraqo/cv/${username}/pdf`} target="_blank" className="inline-flex items-center justify-center gap-2 rounded-[8px] border border-[#d8e0ec] bg-white px-5 py-3 text-sm font-black text-[#0e1a26]"><Download className="h-4 w-4" />Descargar PDF</Link>
      </div>
    </section>
  );
}

function PublicCVFooter({ updatedAt }: { updatedAt: Date }) {
  return (
    <footer className="border-t border-[#d8e0ec] bg-[#f3f3f3]">
      <div className="mx-auto flex w-[min(100%-32px,1240px)] flex-col gap-3 py-7 text-xs font-semibold text-[#607083] md:flex-row md:items-center md:justify-between">
        <Link href="/" className="inline-flex items-center gap-3" aria-label="Terraqo, inicio">
          <TerraqoLogo variant="horizontal" alt="Terraqo" className="h-8 w-[125px]" />
          <span>CV Vivo</span>
        </Link>
        <span>Última actualización: {formatDate(updatedAt, { day: "2-digit", month: "long", year: "numeric" })}</span>
      </div>
    </footer>
  );
}

function SectionHeader({ title, description, action, href }: { title: string; description: string; action?: string; href?: string }) {
  return (
    <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
      <div>
        <h2 className="font-display text-xl font-black">{title}</h2>
        <p className="mt-1 text-sm text-[#607083]">{description}</p>
      </div>
      {href && action ? <Link href={href} className="inline-flex items-center gap-2 text-sm font-black text-[#4374ba]">{action} <ArrowRight className="h-4 w-4" /></Link> : null}
    </header>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[10px] border border-[#d8e0ec] bg-[#f3f3f3] p-3">
      <strong className="block font-display text-2xl font-black">{value}</strong>
      <span className="text-xs font-bold text-[#607083]">{label}</span>
    </div>
  );
}

function CompanyTile({ label }: { label: string }) {
  return (
    <div className="grid min-h-[88px] place-items-center rounded-[10px] border border-[#d8e0ec] bg-[#f3f3f3] p-3 text-center">
      <span className="font-display text-sm font-black uppercase tracking-[0.02em] text-[#31505b]">{label}</span>
    </div>
  );
}

function ValidationBadge({ checks, verified }: { checks: number; verified: boolean }) {
  if (verified) {
    return <span className="inline-flex items-center gap-2 rounded-[8px] bg-[#edf1f7] px-3 py-2 text-xs font-black text-[#4374ba]"><ShieldCheck className="h-4 w-4" />Experiencia validada</span>;
  }
  return <span className="inline-flex items-center gap-2 rounded-[8px] bg-[#fff4d8] px-3 py-2 text-xs font-black text-[#9b6b07]"><Clock3 className="h-4 w-4" />{checks ? "Parcialmente validada" : "Pendiente de validación"}</span>;
}

function TrustBadge({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return <span className="inline-flex items-center gap-2 rounded-full border border-[#25c0d5]/25 bg-[#25c0d5]/[0.08] px-3 py-1.5 font-mono text-[11px] font-black uppercase tracking-[0.08em] text-[#25c0d5]"><Icon className="h-3.5 w-3.5" />{label}</span>;
}

function ToolChip({ label, tone = "light" }: { label: string; tone?: "light" | "dark" }) {
  return tone === "dark"
    ? <span className="rounded-full border border-[#488ac9]/25 bg-[#4374ba]/10 px-3 py-1.5 text-xs font-black text-[#9fc4ff]">{label}</span>
    : <span className="rounded-full border border-[#d8e0ec] bg-[#eef4f4] px-3 py-1.5 text-xs font-black text-[#425865]">{label}</span>;
}

function SkillBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between gap-4 text-sm font-black"><span>{label}</span><span className="text-[#4374ba]">{value}%</span></div>
      <div className="mt-2 h-2 rounded-full bg-[#edf1f7]"><span className="block h-full rounded-full bg-[#4374ba]" style={{ width: `${value}%` }} /></div>
    </div>
  );
}

function DocumentStatusCard({ document }: { document: { type: string; reviewStatus: string; uploadedAt: Date | null; reviewedAt: Date | null } }) {
  const item = DOCUMENT_COPY[document.type] || DOCUMENT_COPY.OTHER;
  const isVerified = document.reviewStatus === "VERIFIED";
  const Icon = item.icon;
  return (
    <div className="relative min-h-[104px] rounded-[10px] border border-[#d8e0ec] bg-[#f3f3f3] p-3 text-center">
      <Icon className="mx-auto h-6 w-6 text-[#4374ba]" />
      <strong className="mt-2 block text-xs font-black">{item.label}</strong>
      <span className={isVerified ? "mt-1 inline-flex text-[11px] font-black text-[#4374ba]" : "mt-1 inline-flex text-[11px] font-black text-[#d58a16]"}>
        {isVerified ? "Verificado" : "En revisión"}
      </span>
      <span className={isVerified ? "absolute bottom-2 right-2 text-[#25c0d5]" : "absolute bottom-2 right-2 text-[#d58a16]"}>
        {isVerified ? <CheckCircle2 className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
      </span>
    </div>
  );
}

function VisualFrame({ src, label, compact = false }: { src?: string; label: string; compact?: boolean }) {
  return (
    <div className={compact ? "relative h-28 overflow-hidden bg-[#edf1f7]" : "relative h-36 overflow-hidden bg-[#edf1f7]"}>
      {src ? (
        <img src={src} alt={label} className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center bg-[linear-gradient(135deg,#edf1f7,#ffffff_45%,#dcefed)]">
          <Gauge className="h-8 w-8 text-[#4374ba]" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0e1a26]/35 to-transparent" />
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[12px] border border-dashed border-[#bdd9d6] bg-[#f3f3f3] p-6 text-sm">
      <strong className="block font-display text-base font-black">{title}</strong>
      <p className="mt-2 leading-6 text-[#607083]">{description}</p>
    </div>
  );
}

