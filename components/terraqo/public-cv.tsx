import Link from "next/link";
import {
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
  MoreVertical,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  type LucideIcon
} from "lucide-react";
import type { PublicCvProfile } from "@/lib/terraqo/public-cv";

type PublicCVPageProps = {
  profile: PublicCvProfile;
};

export type PublicCvSection = "experiencias" | "proyectos" | "evidencias" | "documentos";

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
    description: "Cada experiencia publica muestra empresa, rol, periodo, proyecto asociado y nivel de validacion para que el trabajo pueda revisarse con criterio."
  },
  proyectos: {
    eyebrow: "Proyectos",
    title: "Proyectos donde este perfil genero impacto medible.",
    description: "Una vista extendida de obras, encargos y trabajos vinculados al CV vivo. La informacion publica conserva el contexto sin exponer archivos privados."
  },
  evidencias: {
    eyebrow: "Evidencias publicas",
    title: "Bitacoras y registros que alimentan el CV en vivo.",
    description: "El CV no se queda en una declaracion: se alimenta con actividad documentada, fechas, proyectos y validaciones autorizadas."
  },
  documentos: {
    eyebrow: "Confianza y documentos",
    title: "Estado publico de validaciones y documentos revisados.",
    description: "Los documentos sensibles no se publican. Esta seccion muestra solo el estado de revision y permite solicitar acceso cuando corresponde."
  }
};

export function isPublicCvSection(value: string): value is PublicCvSection {
  return value === "experiencias" || value === "proyectos" || value === "evidencias" || value === "documentos";
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

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function projectImage(project?: { images?: { url: string }[] } | null) {
  return project?.images?.[0]?.url;
}

function publicCvPath(username: string, section?: PublicCvSection) {
  return section ? `/cv/${username}/${section}` : `/cv/${username}`;
}

function publicCvCallback(username: string, section?: PublicCvSection) {
  const path = publicCvPath(username, section);
  return `/cuenta?callbackUrl=${encodeURIComponent(path)}`;
}

function uniqueProjects(profile: PublicCvProfile, limit: number | null = 4): ProjectSnapshot[] {
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

export function PublicCVPage({ profile }: PublicCVPageProps) {
  const name = profile.user.name || profile.username || "Profesional Terraqo";
  const username = profile.username || "perfil";
  const isPublicCv = profile.liveCvEnabled && profile.liveCvVisibility === "PUBLIC";
  const completeness = computeCompleteness(profile);
  const projects = uniqueProjects(profile);
  const specialties = [...profile.specialties, ...profile.professionalCategories].filter(Boolean).slice(0, 6);
  const evidence = profile.worklogs.slice(0, 6);
  const lastActivity = latestActivity(profile);
  const verifiedDocs = verifiedDocumentCount(profile);

  return (
    <div className="min-h-screen bg-[#f7fbfa] text-[#0b1f2a]">
      <PublicCVHeader username={username} />
      <main>
        <section className="relative overflow-hidden border-b border-[#dceaec]">
          <div className="absolute left-[-14%] top-[150px] h-[420px] w-[420px] rounded-full bg-[#e7f8f5]" />
          <div className="mx-auto grid w-[min(100%-32px,1240px)] gap-7 py-9 lg:grid-cols-[1fr_330px] lg:py-10">
            <ProfileHero profile={profile} name={name} username={username} specialties={specialties} isPublicCv={isPublicCv} />
            <VerificationPanel profile={profile} verifiedDocs={verifiedDocs} username={username} />
          </div>
        </section>

        <section className="mx-auto w-[min(100%-32px,1240px)] -translate-y-5">
          <MetricStrip
            years={profile.yearsExperience ?? 0}
            projects={projects.length || profile.experiences.length}
            validation={validationScore(profile)}
            evidence={publicEvidenceCount(profile)}
            lastActivity={lastActivity}
          />
        </section>

        <section className="mx-auto grid w-[min(100%-32px,1240px)] gap-5 pb-10">
          <ExperienceTimeline profile={profile} username={username} />
          <FeaturedProjects projects={projects} profile={profile} username={username} />
          <PublicEvidence worklogs={evidence} username={username} />
          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <SkillsAndTools profile={profile} />
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
    <div className="min-h-screen bg-[#f7fbfa] text-[#0b1f2a]">
      <PublicCVHeader username={username} />
      <main>
        <section className="border-b border-[#dceaec] bg-[radial-gradient(circle_at_12%_8%,#e7f8f5,transparent_34%),linear-gradient(135deg,#ffffff,#f7fbfa)]">
          <div className="mx-auto grid w-[min(100%-32px,1240px)] gap-6 py-10 md:grid-cols-[0.9fr_1.1fr] md:items-end">
            <div>
              <Link href={publicCvPath(username)} className="inline-flex items-center gap-2 text-sm font-black text-[#006c66]">
                <ArrowRight className="h-4 w-4 rotate-180" />
                Volver al CV vivo
              </Link>
              <p className="mt-8 font-mono text-xs font-black uppercase tracking-[0.28em] text-[#008c83]">{copy.eyebrow}</p>
              <h1 className="mt-4 max-w-3xl font-display text-4xl font-black leading-[0.98] md:text-6xl">{copy.title}</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-[#425865]">{copy.description}</p>
            </div>
            <div className="rounded-[18px] border border-[#b9e2dd] bg-white/82 p-6 shadow-[0_24px_60px_rgba(12,43,49,0.08)]">
              <span className="font-mono text-xs font-black uppercase tracking-[0.16em] text-[#008c83]">Perfil</span>
              <div className="mt-3 flex items-center gap-4">
                <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-[#e7f8f5] font-display text-xl font-black text-[#008c83]">
                  {profile.user.image ? <img src={profile.user.image} alt={profile.user.name || username} className="h-full w-full object-cover" /> : initials(profile.user.name || username)}
                </div>
                <div>
                  <h2 className="font-display text-2xl font-black">{profile.user.name || username}</h2>
                  <p className="mt-1 text-sm font-bold text-[#008c83]">@{username}</p>
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
          {section === "proyectos" ? <ProjectsSection projects={projects} profile={profile} username={username} extended /> : null}
          {section === "evidencias" ? <EvidenceSection worklogs={evidence} username={username} extended /> : null}
          {section === "documentos" ? <DocumentsPanel profile={profile} username={username} extended /> : null}
          <PublicCVCTA username={username} isPublicCv={profile.liveCvEnabled && profile.liveCvVisibility === "PUBLIC"} completeness={computeCompleteness(profile)} />
        </section>
      </main>
      <PublicCVFooter updatedAt={profile.updatedAt} />
    </div>
  );
}

function PublicCVHeader({ username }: { username: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#dceaec] bg-white/92 backdrop-blur-xl">
      <div className="mx-auto flex min-h-[76px] w-[min(100%-32px,1240px)] items-center justify-between gap-5">
        <Link href="/" className="flex items-center gap-3" aria-label="Terraqo CV Vivo">
          <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-[#008c83] font-mono text-sm font-black text-white">TQ</span>
          <span className="leading-none">
            <strong className="block font-display text-lg font-black">TERRAQO</strong>
            <small className="font-mono text-[10px] font-black uppercase tracking-[0.12em] text-[#008c83]">CV Vivo</small>
          </span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-bold text-[#344955] lg:flex" aria-label="Navegacion del CV Vivo">
          <Link className="border-b-2 border-[#008c83] pb-2 text-[#0b1f2a]" href={publicCvPath(username)}>CV Vivo</Link>
          <Link href="/">Sobre Terraqo</Link>
          <Link href="/cuenta">Para empresas</Link>
          <Link href="/portal/commons">Comunidad</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href={publicCvCallback(username)} className="hidden rounded-[8px] bg-[#008c83] px-5 py-3 text-sm font-black text-white shadow-[0_14px_30px_rgba(0,140,131,0.18)] transition hover:bg-[#006c66] sm:inline-flex">
            Contactar
          </Link>
          <button className="grid h-10 w-10 place-items-center rounded-[8px] border border-[#dceaec] text-[#0b1f2a]" type="button" aria-label="Mas opciones">
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}

function ProfileHero({ profile, name, username, specialties, isPublicCv }: { profile: PublicCvProfile; name: string; username: string; specialties: string[]; isPublicCv: boolean }) {
  return (
    <div id="cv-vivo" className="grid gap-7 rounded-[18px] bg-white/40 p-1 lg:grid-cols-[170px_1fr]">
      <div className="relative mx-auto h-[170px] w-[170px] overflow-hidden rounded-full border-[6px] border-white bg-[#e7f8f5] shadow-[0_18px_45px_rgba(11,31,42,0.12)] lg:mx-0">
        {profile.user.image ? (
          <img src={profile.user.image} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full w-full place-items-center font-display text-5xl font-black text-[#008c83]">{initials(name)}</span>
        )}
        <span className="absolute bottom-3 right-3 grid h-6 w-6 place-items-center rounded-full border-4 border-white bg-[#1dbf96]" />
      </div>

      <div className="flex flex-col justify-center">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <TrustBadge icon={Sparkles} label={isPublicCv ? "CV vivo activo" : "Visibilidad limitada"} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="max-w-[760px] font-display text-4xl font-black leading-[0.98] md:text-5xl">{name}</h1>
          {profile.identityVerificationStatus === "VERIFIED" ? (
            <span title="Identidad verificada por Terraqo" className="text-[#2087e8]"><BadgeCheck className="h-7 w-7 fill-[#2087e8] text-white" /></span>
          ) : null}
        </div>
        <p className="mt-3 font-display text-xl font-black text-[#008c83]">{profile.headline || "Profesional Terraqo"}</p>
        <div className="mt-4 flex flex-wrap gap-5 text-sm font-semibold text-[#435a66]">
          <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-[#008c83]" />{profile.city || "Ubicacion por completar"}</span>
          <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#1dbf96]" />{STATUS_COPY[profile.status] || "Estado profesional activo"}</span>
          <span className="font-mono text-xs uppercase tracking-[0.12em] text-[#5f7280]">@{username}</span>
        </div>
        <p className="mt-5 max-w-3xl text-[15px] leading-7 text-[#425865]">{profile.bio || "Perfil en construccion. La experiencia publica se actualiza con proyectos, bitacoras y validaciones autorizadas."}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          {specialties.length ? specialties.map((item) => <ToolChip key={item} label={item} />) : <ToolChip label="Perfil en actualizacion" />}
        </div>
      </div>
    </div>
  );
}

function VerificationPanel({ profile, verifiedDocs, username }: { profile: PublicCvProfile; verifiedDocs: number; username: string }) {
  const verifiedExperiences = profile.experiences.filter((experience) => experience.verifiedByTerraqo).length;
  const approvedWorklogs = profile.worklogs.filter((worklog) => worklog.validations.length > 0 || worklog.evidenceStatus === "VERIFIED").length;
  const items = [
    { label: "Identidad verificada", detail: profile.identityVerificationStatus === "VERIFIED" ? "DNI validado" : "Pendiente de validacion", done: profile.identityVerificationStatus === "VERIFIED", icon: IdCard },
    { label: "Documentos revisados", detail: `${verifiedDocs} de ${profile.documents.length || 0} documentos`, done: verifiedDocs > 0, icon: FileCheck2 },
    { label: "Experiencia validada", detail: `${verifiedExperiences} experiencias`, done: verifiedExperiences > 0, icon: BriefcaseBusiness },
    { label: "Actividad comprobada", detail: `${approvedWorklogs} bitacoras y evidencias`, done: approvedWorklogs > 0, icon: ClipboardCheck }
  ];

  return (
    <aside className="rounded-[16px] border border-[#dceaec] bg-white p-5 shadow-[0_18px_50px_rgba(12,43,49,0.07)]">
      <h2 className="flex items-center gap-3 font-display text-lg font-black"><ShieldCheck className="h-6 w-6 text-[#008c83]" />Confianza y verificacion</h2>
      <div className="mt-5 space-y-4">
        {items.map((item) => (
          <div key={item.label} className="grid grid-cols-[34px_1fr_24px] items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-[8px] bg-[#f4f9f8] text-[#31505b]"><item.icon className="h-4 w-4" /></span>
            <span>
              <strong className="block text-sm font-black">{item.label}</strong>
              <small className="text-xs font-semibold text-[#5f7280]">{item.detail}</small>
            </span>
            <span className={item.done ? "text-[#1dbf96]" : "text-[#d99a2b]"} title={item.done ? "Validado" : "Pendiente"}>
              <CheckCircle2 className="h-5 w-5" />
            </span>
          </div>
        ))}
      </div>
      <Link href={publicCvPath(username, "documentos")} className="mt-5 inline-flex items-center gap-2 text-sm font-black text-[#006c66]">Ver detalle de validaciones <ArrowRight className="h-4 w-4" /></Link>
    </aside>
  );
}

function MetricStrip({ years, projects, validation, evidence, lastActivity }: { years: number; projects: number; validation: number; evidence: number; lastActivity: Date }) {
  const metrics = [
    { label: "Anos de experiencia", value: `${years}+`, icon: UserRoundCheck },
    { label: "Proyectos completados", value: projects, icon: FolderKanban },
    { label: "Experiencias validadas", value: `${validation}%`, icon: Grid2X2 },
    { label: "Evidencias publicas", value: evidence, icon: ClipboardCheck }
  ];
  return (
    <div className="grid overflow-hidden rounded-[12px] border border-[#dceaec] bg-white shadow-[0_20px_55px_rgba(12,43,49,0.08)] md:grid-cols-[repeat(4,1fr)_190px]">
      {metrics.map((metric) => (
        <div key={metric.label} className="flex min-h-[78px] items-center gap-4 border-b border-[#dceaec] px-6 md:border-b-0 md:border-r">
          <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-[#e7f8f5] text-[#008c83]"><metric.icon className="h-5 w-5" /></span>
          <span><strong className="block font-display text-3xl font-black">{metric.value}</strong><small className="font-semibold text-[#5f7280]">{metric.label}</small></span>
        </div>
      ))}
      <div className="flex min-h-[78px] items-center gap-3 px-6">
        <span className="h-2 w-2 rounded-full bg-[#1dbf96]" />
        <span><small className="block text-xs text-[#5f7280]">Ultima actividad</small><strong className="text-sm">{formatDate(lastActivity, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</strong></span>
      </div>
    </div>
  );
}

function ExperienceTimeline({ profile, username, extended = false }: { profile: PublicCvProfile; username: string; extended?: boolean }) {
  return (
    <section id="experiencia" className="rounded-[16px] border border-[#dceaec] bg-white p-5 shadow-[0_18px_50px_rgba(12,43,49,0.06)]">
      <SectionHeader title="Experiencia verificable" description="Historial laboral validado con evidencia y responsables." action={extended ? "Volver al CV vivo" : "Ver todas las experiencias"} href={extended ? publicCvPath(username) : publicCvPath(username, "experiencias")} />
      <div className="mt-6 space-y-4 border-l border-[#cce4e1] pl-5">
        {profile.experiences.length ? profile.experiences.map((experience) => <ExperienceCard key={experience.id} experience={experience} />) : <EmptyState title="Sin experiencias publicas" description="Cuando el profesional autorice experiencias, apareceran aqui con su nivel de verificacion." />}
      </div>
    </section>
  );
}

function ExperienceCard({ experience }: { experience: PublicCvProfile["experiences"][number] }) {
  const checks = (experience.verifiedByTerraqo ? 1 : 0) + (experience.project ? 1 : 0);
  return (
    <article className="relative grid gap-5 rounded-[14px] border border-[#dceaec] bg-white p-4 md:grid-cols-[120px_130px_1fr_210px]">
      <span className="absolute -left-[27px] top-8 grid h-4 w-4 place-items-center rounded-full bg-[#008c83] ring-4 ring-white" />
      <div className="font-mono text-xs font-black uppercase tracking-[0.08em] text-[#435a66]">
        <span className="block">{formatPeriod(experience.startedAt, experience.endedAt)}</span>
        <small className="mt-1 block text-[#7a8d96]">{experience.location || experience.project?.location || "Ubicacion no publica"}</small>
      </div>
      <CompanyTile label={experience.companyName || experience.project?.clientName || "Empresa"} />
      <div>
        <h3 className="font-display text-xl font-black">{experience.title}</h3>
        <p className="mt-1 text-sm font-black text-[#008c83]">{experience.companyName || experience.project?.clientName || "Empresa no publica"}</p>
        <p className="mt-3 text-sm leading-6 text-[#435a66]">{experience.verificationNote || experience.role || "Experiencia profesional declarada para validacion."}</p>
      </div>
      <div className="flex flex-col items-start justify-between gap-4 md:items-end">
        <ValidationBadge checks={checks} verified={experience.verifiedByTerraqo} />
        <div className="flex gap-2 text-[#008c83]">
          {Array.from({ length: Math.max(1, checks) }).map((_, index) => <CheckCircle2 key={index} className="h-5 w-5" />)}
        </div>
        <button className="rounded-[8px] border border-[#dceaec] px-4 py-2 text-sm font-black text-[#0b1f2a]" type="button">Ver detalles</button>
      </div>
    </article>
  );
}

function FeaturedProjects({ projects, profile, username }: { projects: ProjectSnapshot[]; profile: PublicCvProfile; username: string }) {
  return <ProjectsSection projects={projects} profile={profile} username={username} />;
}

function ProjectsSection({ projects, profile, username, extended = false }: { projects: ProjectSnapshot[]; profile: PublicCvProfile; username?: string; extended?: boolean }) {
  const fallback = profile.worklogs.filter((worklog) => !worklog.project).slice(0, extended ? 24 : 4);
  return (
    <section id="proyectos" className="rounded-[16px] border border-[#dceaec] bg-white p-5 shadow-[0_18px_50px_rgba(12,43,49,0.06)]">
      <SectionHeader title="Proyectos destacados" description="Proyectos en los que ha participado y generado impacto." action={extended ? "Volver al CV vivo" : "Ver todos los proyectos"} href={extended && username ? publicCvPath(username) : publicCvPath(username || profile.username || "perfil", "proyectos")} />
      <div className={extended ? "mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" : "mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"}>
        {projects.map((project) => <ProjectCard key={project.id} project={project} />)}
        {!projects.length && fallback.map((worklog) => <ProjectCard key={worklog.id} project={{ id: worklog.id, title: worklog.title, slug: "#", clientName: worklog.workspace?.brandName || worklog.workspace?.name || "Terraqo", location: null, category: worklog.type, status: "PUBLISHED" }} />)}
        {!projects.length && !fallback.length ? <EmptyState title="Sin proyectos publicos" description="Los proyectos autorizados se mostraran cuando el profesional active su visibilidad." /> : null}
      </div>
    </section>
  );
}

function ProjectCard({ project }: { project: ProjectSnapshot }) {
  return (
    <article className="overflow-hidden rounded-[12px] border border-[#dceaec] bg-white transition duration-200 hover:-translate-y-1 hover:shadow-[0_18px_42px_rgba(12,43,49,0.11)]">
      <VisualFrame src={project.image} label={project.title} />
      <div className="p-4">
        <span className="inline-flex rounded-[7px] bg-[#e7f8f5] px-2 py-1 text-xs font-black text-[#006c66]">{PROJECT_STATUS_COPY[project.status] || "Proyecto"}</span>
        <h3 className="mt-3 min-h-[48px] font-display text-base font-black leading-tight">{project.title}</h3>
        <p className="mt-2 text-xs font-semibold text-[#008c83]">{project.clientName || project.location || project.category || "Proyecto Terraqo"}</p>
      </div>
    </article>
  );
}

function PublicEvidence({ worklogs, username }: { worklogs: PublicCvProfile["worklogs"]; username: string }) {
  return <EvidenceSection worklogs={worklogs} username={username} />;
}

function EvidenceSection({ worklogs, username, extended = false }: { worklogs: PublicCvProfile["worklogs"]; username?: string; extended?: boolean }) {
  return (
    <section id="evidencias" className="rounded-[16px] border border-[#dceaec] bg-white p-5 shadow-[0_18px_50px_rgba(12,43,49,0.06)]">
      <SectionHeader title="Evidencias publicas" description="Muestra del trabajo real documentado en campo." action={extended ? "Volver al CV vivo" : "Ver todas las evidencias"} href={extended && username ? publicCvPath(username) : publicCvPath(username || "perfil", "evidencias")} />
      <div className={extended ? "mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" : "mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-6"}>
        {worklogs.length ? worklogs.map((worklog) => <EvidenceCard key={worklog.id} worklog={worklog} />) : <EmptyState title="Sin evidencias publicas" description="Las bitacoras publicas autorizadas apareceran en esta seccion." />}
      </div>
    </section>
  );
}

function EvidenceCard({ worklog }: { worklog: PublicCvProfile["worklogs"][number] }) {
  const src = worklog.evidenceUrls.find((url) => url.startsWith("http") || url.startsWith("/")) || projectImage(worklog.project);
  return (
    <article className="overflow-hidden rounded-[12px] border border-[#dceaec] bg-white">
      <VisualFrame src={src} label={worklog.title} compact />
      <div className="p-3">
        <h3 className="line-clamp-2 min-h-[36px] text-sm font-black">{worklog.title}</h3>
        <p className="mt-2 font-mono text-xs text-[#5f7280]">{formatDate(worklog.occurredAt, { year: "numeric" })}</p>
      </div>
    </article>
  );
}

function SkillsAndTools({ profile }: { profile: PublicCvProfile }) {
  const bars = profile.specialties.slice(0, 4);
  const tools = [...profile.equipment, ...profile.software].slice(0, 12);
  return (
    <section className="rounded-[16px] border border-[#dceaec] bg-white p-5 shadow-[0_18px_50px_rgba(12,43,49,0.06)]">
      <h2 className="font-display text-xl font-black">Habilidades y herramientas</h2>
      <p className="mt-1 text-sm text-[#5f7280]">Competencias tecnicas y software que domina.</p>
      <div className="mt-5 grid gap-6 md:grid-cols-[0.9fr_1fr]">
        <div className="space-y-4">
          {bars.length ? bars.map((skill, index) => <SkillBar key={skill} label={skill} value={95 - index * 9} />) : <EmptyState title="Habilidades en revision" description="El profesional aun no publico sus habilidades principales." />}
        </div>
        <div className="flex flex-wrap content-start gap-2">
          {tools.length ? tools.map((tool) => <ToolChip key={tool} label={tool} />) : <ToolChip label="Herramientas por completar" />}
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
    <section id="documentos" className="rounded-[16px] border border-[#dceaec] bg-white p-5 shadow-[0_18px_50px_rgba(12,43,49,0.06)]">
      <h2 className="font-display text-xl font-black">Confianza y documentos</h2>
      <p className="mt-1 text-sm text-[#5f7280]">Estado publico de documentos verificados. Los archivos privados no se exponen.</p>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {docs.map((document) => <DocumentStatusCard key={`${document.type}-${document.id}`} document={document} />)}
      </div>
      <Link href={extended ? publicCvCallback(username, "documentos") : publicCvPath(username, "documentos")} className="mt-5 inline-flex items-center gap-2 text-sm font-black text-[#006c66]">{extended ? "Solicitar acceso al detalle" : "Ver todos los documentos"} <ArrowRight className="h-4 w-4" /></Link>
    </section>
  );
}

function PublicCVCTA({ username, isPublicCv, completeness }: { username: string; isPublicCv: boolean; completeness: number }) {
  return (
    <section className="grid gap-5 rounded-[16px] border border-[#b9e2dd] bg-gradient-to-r from-[#f3fbfa] to-white p-6 shadow-[0_18px_50px_rgba(12,43,49,0.05)] md:grid-cols-[1fr_auto] md:items-center">
      <div className="flex items-center gap-5">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-[#e7f8f5] text-[#008c83]"><LockKeyhole className="h-7 w-7" /></span>
        <div>
          <h2 className="font-display text-xl font-black">Quieres conocer mas sobre mi experiencia?</h2>
          <p className="mt-1 text-sm text-[#5f7280]">{isPublicCv ? "Solicita acceso a mi CV completo para ver informacion detallada, documentos y evidencia adicional." : `Este CV muestra una vista publica limitada. Perfil completo al ${completeness}%.`}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href={publicCvCallback(username)} className="inline-flex items-center justify-center gap-2 rounded-[8px] border border-[#9ed8d2] bg-white px-5 py-3 text-sm font-black text-[#006c66]"><MessageSquare className="h-4 w-4" />Contactar</Link>
        <Link href={publicCvCallback(username)} className="inline-flex items-center justify-center gap-2 rounded-[8px] bg-[#008c83] px-5 py-3 text-sm font-black text-white"><LockKeyhole className="h-4 w-4" />Solicitar acceso al CV completo</Link>
        <Link href={`/api/terraqo/cv/${username}/pdf`} target="_blank" className="inline-flex items-center justify-center gap-2 rounded-[8px] border border-[#dceaec] bg-white px-5 py-3 text-sm font-black text-[#0b1f2a]"><Download className="h-4 w-4" />Descargar PDF</Link>
      </div>
    </section>
  );
}

function PublicCVFooter({ updatedAt }: { updatedAt: Date }) {
  return (
    <footer className="border-t border-[#dceaec] bg-[#f7fbfa]">
      <div className="mx-auto flex w-[min(100%-32px,1240px)] flex-col gap-3 py-7 text-xs font-semibold text-[#5f7280] md:flex-row md:items-center md:justify-between">
        <Link href="/" className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#008c83]" />Perfil publico creado con Terraqo CV Vivo</Link>
        <span>Ultima actualizacion: {formatDate(updatedAt, { day: "2-digit", month: "long", year: "numeric" })}</span>
      </div>
    </footer>
  );
}

function SectionHeader({ title, description, action, href }: { title: string; description: string; action: string; href: string }) {
  return (
    <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
      <div>
        <h2 className="font-display text-xl font-black">{title}</h2>
        <p className="mt-1 text-sm text-[#5f7280]">{description}</p>
      </div>
      <Link href={href} className="inline-flex items-center gap-2 text-sm font-black text-[#006c66]">{action} <ArrowRight className="h-4 w-4" /></Link>
    </header>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[10px] border border-[#dceaec] bg-[#fbfdfc] p-3">
      <strong className="block font-display text-2xl font-black">{value}</strong>
      <span className="text-xs font-bold text-[#5f7280]">{label}</span>
    </div>
  );
}

function CompanyTile({ label }: { label: string }) {
  return (
    <div className="grid min-h-[88px] place-items-center rounded-[10px] border border-[#dceaec] bg-[#fbfdfc] p-3 text-center">
      <span className="font-display text-sm font-black uppercase tracking-[0.02em] text-[#31505b]">{label}</span>
    </div>
  );
}

function ValidationBadge({ checks, verified }: { checks: number; verified: boolean }) {
  if (verified) {
    return <span className="inline-flex items-center gap-2 rounded-[8px] bg-[#e7f8f5] px-3 py-2 text-xs font-black text-[#006c66]"><ShieldCheck className="h-4 w-4" />Experiencia validada</span>;
  }
  return <span className="inline-flex items-center gap-2 rounded-[8px] bg-[#fff4d8] px-3 py-2 text-xs font-black text-[#9b6b07]"><Clock3 className="h-4 w-4" />{checks ? "Parcialmente validada" : "Pendiente de validacion"}</span>;
}

function TrustBadge({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return <span className="inline-flex items-center gap-2 rounded-[7px] bg-[#e7f8f5] px-3 py-1.5 font-mono text-[11px] font-black uppercase tracking-[0.08em] text-[#006c66]"><Icon className="h-3.5 w-3.5" />{label}</span>;
}

function ToolChip({ label }: { label: string }) {
  return <span className="rounded-[7px] bg-[#eef4f4] px-3 py-1.5 text-xs font-black text-[#425865]">{label}</span>;
}

function SkillBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between gap-4 text-sm font-black"><span>{label}</span><span className="text-[#008c83]">{value}%</span></div>
      <div className="mt-2 h-2 rounded-full bg-[#e7f8f5]"><span className="block h-full rounded-full bg-[#008c83]" style={{ width: `${value}%` }} /></div>
    </div>
  );
}

function DocumentStatusCard({ document }: { document: { type: string; reviewStatus: string; uploadedAt: Date | null; reviewedAt: Date | null } }) {
  const item = DOCUMENT_COPY[document.type] || DOCUMENT_COPY.OTHER;
  const isVerified = document.reviewStatus === "VERIFIED";
  const Icon = item.icon;
  return (
    <div className="relative min-h-[104px] rounded-[10px] border border-[#dceaec] bg-[#fbfdfc] p-3 text-center">
      <Icon className="mx-auto h-6 w-6 text-[#008c83]" />
      <strong className="mt-2 block text-xs font-black">{item.label}</strong>
      <span className={isVerified ? "mt-1 inline-flex text-[11px] font-black text-[#008c83]" : "mt-1 inline-flex text-[11px] font-black text-[#d58a16]"}>
        {isVerified ? "Verificado" : "En revision"}
      </span>
      <span className={isVerified ? "absolute bottom-2 right-2 text-[#1dbf96]" : "absolute bottom-2 right-2 text-[#d58a16]"}>
        {isVerified ? <CheckCircle2 className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
      </span>
    </div>
  );
}

function VisualFrame({ src, label, compact = false }: { src?: string; label: string; compact?: boolean }) {
  return (
    <div className={compact ? "relative h-28 overflow-hidden bg-[#e7f8f5]" : "relative h-36 overflow-hidden bg-[#e7f8f5]"}>
      {src ? (
        <img src={src} alt={label} className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center bg-[linear-gradient(135deg,#e7f8f5,#ffffff_45%,#dcefed)]">
          <Gauge className="h-8 w-8 text-[#008c83]" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0b1f2a]/35 to-transparent" />
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[12px] border border-dashed border-[#bdd9d6] bg-[#fbfdfc] p-6 text-sm">
      <strong className="block font-display text-base font-black">{title}</strong>
      <p className="mt-2 leading-6 text-[#5f7280]">{description}</p>
    </div>
  );
}
