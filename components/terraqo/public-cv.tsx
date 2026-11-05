import Link from "next/link";
import { PublicCvWorkShowcase } from "@/components/terraqo/public-cv-work-showcase";
import Image from "next/image";
import {
  ArrowRight,
  Award,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Crown,
  Download,
  FileCheck2,
  FileText,
  FolderKanban,
  Gauge,
  GraduationCap,
  Grid2X2,
  IdCard,
  LockKeyhole,
  MapPin,
  MessageSquare,
  Plus,
  ShieldCheck,
  Target,
  UserRoundCheck,
  type LucideIcon
} from "lucide-react";
import type { PublicCvProfile } from "@/lib/terraqo/public-cv";
import { formatExperienceDuration, monthsBetween, normalizeSpanishCopy } from "@/lib/terraqo/profile-summary";
import { TerraqoLogo } from "@/components/terraqo/terraqo-logo";
import { TerraqoAvatar } from "@/components/terraqo/terraqo-avatar";
import { TerraqoPublicHeader } from "@/components/terraqo/terraqo-public-header";
import { PublicCvActivityExplorer, type PublicCvActivityRecord } from "@/components/terraqo/public-cv-activity-explorer";
import { PublicCvProjectExplorer } from "@/components/terraqo/public-cv-project-explorer";
import { publicCvEvidenceHref } from "@/lib/terraqo/public-cv-permalink";
import {
  encodeWorklogArchiveCursor,
  parseWorklogArchiveFilters,
} from "@/lib/terraqo/worklog-archive-contract";

import type { PublicWorkCaseCard } from "@/lib/terraqo/public-work-case";

type PublicCVPageProps = {
  cases?: PublicWorkCaseCard[];
  profile: PublicCvProfile;
};

export type PublicCvSection = "experiencias" | "educacion" | "proyectos" | "evidencias" | "capacidades" | "documentos";

export type ProjectSnapshot = {
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

function verifiedDocumentCount(profile: PublicCvProfile) {
  return profile.documents.filter((document) => document.reviewStatus === "VERIFIED").length;
}

function publicEvidenceCount(profile: PublicCvProfile) {
  return profile.worklogs.reduce((total, worklog) => total + 1 + worklog.evidenceUrls.length + worklog.media.length, 0);
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

export function PublicCVPage({ profile, cases = [] }: PublicCVPageProps) {
  const name = profile.user.name || profile.username || "Profesional Terraqo";
  const username = profile.username || "perfil";
  const isPublicCv = profile.liveCvEnabled && profile.liveCvVisibility === "PUBLIC";
  const projects = uniqueProjects(profile, null);
  const specialties = profileCapabilities(profile, 12);
  const evidence = profile.worklogs.slice(0, 3);
  const lastActivity = latestActivity(profile);
  const verifiedDocs = verifiedDocumentCount(profile);
  const totalExperienceMonths = profile.experiences.reduce((sum, experience) => sum + monthsBetween(experience.startedAt, experience.currentlyWorking ? null : experience.endedAt), 0);

  return (
    <div className="terraqo-brand-surface tq-cv-v3 min-h-screen bg-[#07111f] text-white">
      <TerraqoPublicHeader tone="dark" />
      <main>
        <section className="mx-auto w-[min(100%-32px,1440px)] py-8 text-white sm:w-[min(100%-80px,1440px)] sm:py-10">
          <ProfileHero profile={profile} name={name} username={username} specialties={specialties} isPublicCv={isPublicCv} />
          <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,2.2fr)_minmax(280px,1fr)]">
            <LiveCvPulse cases={cases} profile={profile} username={username} />
            <aside className="rounded-xl border border-[#294259] bg-[#0a1927] p-6 lg:mt-16">
              <h2 className="text-xl font-semibold text-white">Antes de colaborar</h2>
              <p className="mt-2 text-[13px] text-slate-400">Perfil actualizado el {formatDate(profile.updatedAt)}</p>
              <dl className="mt-5 divide-y divide-white/10 border-y border-white/10 text-sm text-white">
                <div className="grid gap-2 py-5"><dt className="flex items-center gap-2 text-slate-400"><CalendarDays className="h-5 w-5 text-sky-400" />Disponibilidad</dt><dd>{STATUS_COPY[profile.status] || "Por confirmar"}</dd></div>
                <div className="grid gap-2 py-5"><dt className="flex items-center gap-2 text-slate-400"><MapPin className="h-5 w-5 text-sky-400" />Ubicación declarada</dt><dd>{profile.city || "No indicada"}</dd></div>
              </dl>
              <Link href={publicCvCallback(username)} prefetch={false} className="mt-5 flex min-h-11 items-center justify-center gap-3 rounded-lg bg-[#2869c7] px-4 text-sm font-semibold text-white">Contactar<ArrowRight className="h-4 w-4" /></Link>
              <a href={`/api/terraqo/cv/${encodeURIComponent(username)}/pdf`} className="mt-3 flex min-h-11 items-center justify-center gap-3 rounded-lg border border-[#294259] px-4 text-sm text-white">Descargar CV<Download className="h-4 w-4" /></a>
            </aside>
          </div>
        </section>
        <section id="respaldo" aria-label="Trayectoria y respaldo" className="mx-auto grid w-[min(100%-32px,1440px)] scroll-mt-24 gap-5 pb-10">
          <h2 className="text-2xl font-semibold text-white">Trayectoria y respaldo</h2>
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <MetricStrip experienceLabel={formatExperienceDuration(totalExperienceMonths)} projects={projects.length} validation={profile.experiences.filter(item => item.verifiedByTerraqo).length} evidence={publicEvidenceCount(profile)} lastActivity={lastActivity} />
            <VerificationPanel profile={profile} verifiedDocs={verifiedDocs} username={username} />
          </div>
          <ExperienceTimeline profile={profile} username={username} />
          <EducationTimeline profile={profile} username={username} />
          <FeaturedProjects projects={projects} profile={profile} username={username} />
          <PublicEvidence worklogs={evidence} username={username} />
          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <SkillsAndTools profile={profile} username={username} />
            <DocumentsPanel profile={profile} username={username} />
          </div>
          <PublicCVCTA username={username} isPublicCv={isPublicCv} />
        </section>
      </main>
      <PublicCVFooter updatedAt={profile.updatedAt} />
    </div>
  );
}

export function PublicCVSectionPage({
  profile,
  section,
  initialRecordId,
}: {
  profile: PublicCvProfile;
  section: PublicCvSection;
  initialRecordId?: string;
}) {
  const username = profile.username || "perfil";
  const copy = PUBLIC_CV_SECTIONS[section];
  const projects = uniqueProjects(profile, null);
  const orderedWorklogs = [...profile.worklogs].sort(
    (left, right) =>
      right.occurredAt.getTime() - left.occurredAt.getTime() ||
      right.id.localeCompare(left.id),
  );
  const initialArchiveWorklogs = orderedWorklogs.slice(0, 20);
  const requestedWorklog = initialRecordId
    ? orderedWorklogs.find((worklog) => worklog.id === initialRecordId)
    : undefined;
  const evidence =
    requestedWorklog &&
    !initialArchiveWorklogs.some((worklog) => worklog.id === requestedWorklog.id)
      ? [requestedWorklog, ...initialArchiveWorklogs]
      : initialArchiveWorklogs;

  if (section === "evidencias") {
    const worklogRecords: PublicCvActivityRecord[] = evidence.map((worklog) => ({
      id: worklog.id,
      title: normalizeSpanishCopy(worklog.title) || worklog.title,
      summary: normalizeSpanishCopy(worklog.summary) || worklog.summary,
      outcome: worklog.outcome ? normalizeSpanishCopy(worklog.outcome) : null,
      type: worklog.type,
      evidenceStatus: worklog.evidenceStatus,
      occurredAt: worklog.occurredAt.toISOString(),
      createdAt: worklog.createdAt.toISOString(),
      locationLabel: worklog.locationLabel
        ? normalizeSpanishCopy(worklog.locationLabel) || worklog.locationLabel
        : null,
      skills: worklog.skills.map((skill) => normalizeSpanishCopy(skill) || skill),
      evidenceUrls: worklog.evidenceUrls,
      project: worklog.project ? {
        title: normalizeSpanishCopy(worklog.project.title) || worklog.project.title,
        clientName: worklog.project.clientName ? normalizeSpanishCopy(worklog.project.clientName) || worklog.project.clientName : null,
        location: worklog.project.location ? normalizeSpanishCopy(worklog.project.location) || worklog.project.location : null,
        category: worklog.project.category ? normalizeSpanishCopy(worklog.project.category) || worklog.project.category : null,
        image: worklog.project.images[0]?.url || null
      } : null,
      workspace: worklog.workspace ? normalizeSpanishCopy(worklog.workspace.brandName || worklog.workspace.name) || worklog.workspace.brandName || worklog.workspace.name : null,
      media: worklog.media.map((media) => ({
        id: media.id,
        fileName: media.fileName,
        contentType: media.contentType,
        href: `/api/public/cv/${encodeURIComponent(username)}/worklogs/${encodeURIComponent(media.id)}`,
        downloadHref: `/api/public/cv/${encodeURIComponent(username)}/worklogs/${encodeURIComponent(media.id)}?download=1`
      })),
      validations: worklog.validations.map((validation) => ({
        id: validation.id,
        responseNote: validation.responseNote ? normalizeSpanishCopy(validation.responseNote) : null,
        resolvedAt: validation.resolvedAt?.toISOString() || null,
        createdAt: validation.createdAt.toISOString(),
        validatorName: validation.validator.name ? normalizeSpanishCopy(validation.validator.name) || validation.validator.name : null,
        validatorImage: validation.validator.image
      }))
    }));

    const experienceRecords: PublicCvActivityRecord[] = profile.experiences.map((experience) => {
      const validated = experience.verifiedByTerraqo || experience.verificationStatus === "APPROVED";
      const occurredAt = experience.updatedAt.toISOString();
      const company = normalizeSpanishCopy(experience.companyName || "") || experience.companyName || null;
      const role = normalizeSpanishCopy(experience.role || "") || experience.role || null;
      const title = normalizeSpanishCopy(experience.title) || experience.title;
      const location = normalizeSpanishCopy(experience.location || experience.locationCity || "") || experience.location || experience.locationCity || null;

      return {
        id: `experience-${experience.id}`,
        title: `${validated ? "Experiencia validada" : "Experiencia incorporada"}: ${title}`,
        summary: normalizeSpanishCopy(experience.summary || "") || [role, company].filter(Boolean).join(" en ") || "Experiencia profesional declarada por el titular.",
        outcome: experience.verificationNote
          ? normalizeSpanishCopy(experience.verificationNote) || experience.verificationNote
          : experience.highlights.length
            ? experience.highlights.map((item) => normalizeSpanishCopy(item) || item).join(" · ")
            : null,
        type: validated ? "EXPERIENCE_VALIDATION" : "EXPERIENCE_UPDATE",
        evidenceStatus: validated ? "VERIFIED" : "DECLARED",
        occurredAt,
        createdAt: experience.createdAt.toISOString(),
        locationLabel: location,
        skills: [role, experience.project?.category].filter((item): item is string => Boolean(item)),
        evidenceUrls: experience.evidence.filter((item) => /^(https?:\/\/|\/)/i.test(item)),
        project: experience.project ? {
          title: normalizeSpanishCopy(experience.project.title) || experience.project.title,
          clientName: experience.project.clientName ? normalizeSpanishCopy(experience.project.clientName) || experience.project.clientName : company,
          location: experience.project.location ? normalizeSpanishCopy(experience.project.location) || experience.project.location : location,
          category: experience.project.category ? normalizeSpanishCopy(experience.project.category) || experience.project.category : null,
          image: experience.project.images[0]?.url || null
        } : null,
        workspace: company,
        media: [],
        validations: validated ? [{
          id: `experience-validation-${experience.id}`,
          responseNote: experience.verificationNote ? normalizeSpanishCopy(experience.verificationNote) || experience.verificationNote : null,
          resolvedAt: occurredAt,
          createdAt: (experience.verificationRequestedAt || experience.updatedAt).toISOString(),
          validatorName: experience.validatorName ? normalizeSpanishCopy(experience.validatorName) || experience.validatorName : "Equipo de validaciones Terraqo",
          validatorImage: null
        }] : []
      };
    });

    const educationRecords: PublicCvActivityRecord[] = profile.education.map((education) => {
      const validated = education.verificationStatus === "APPROVED";
      const occurredAt = education.updatedAt.toISOString();
      const degree = normalizeSpanishCopy(education.degree) || education.degree;
      const institution = normalizeSpanishCopy(education.institution) || education.institution;
      const field = education.field ? normalizeSpanishCopy(education.field) || education.field : null;

      return {
        id: `education-${education.id}`,
        title: `${validated ? "Formación validada" : "Formación incorporada"}: ${degree}`,
        summary: `${institution}${field ? ` · ${field}` : ""}`,
        outcome: validated ? "La formación fue revisada como parte del proceso de confianza de Terraqo." : null,
        type: validated ? "EDUCATION_VALIDATION" : "EDUCATION_UPDATE",
        evidenceStatus: validated ? "VERIFIED" : "DECLARED",
        occurredAt,
        createdAt: education.createdAt.toISOString(),
        locationLabel: education.locationCity
          ? normalizeSpanishCopy(education.locationCity) || education.locationCity
          : null,
        skills: field ? [field] : [],
        evidenceUrls: education.evidence.filter((item) => /^(https?:\/\/|\/)/i.test(item)),
        project: null,
        workspace: institution,
        media: [],
        validations: validated ? [{
          id: `education-validation-${education.id}`,
          responseNote: null,
          resolvedAt: occurredAt,
          createdAt: (education.verificationRequestedAt || education.updatedAt).toISOString(),
          validatorName: education.validatorName ? normalizeSpanishCopy(education.validatorName) || education.validatorName : "Equipo de validaciones Terraqo",
          validatorImage: null
        }] : []
      };
    });

    const documentRecords: PublicCvActivityRecord[] = profile.documents
      .filter((document) => document.reviewStatus === "VERIFIED")
      .map((document) => {
        const reviewedAt = (document.reviewedAt || document.uploadedAt).toISOString();
        const label = DOCUMENT_COPY[document.type]?.label || DOCUMENT_COPY.OTHER.label;
        return {
          id: `document-${document.id}`,
          title: `Documento revisado: ${label}`,
          summary: "Terraqo registró la revisión del documento. El archivo y sus datos permanecen privados.",
          outcome: "Estado de revisión confirmado sin exponer el contenido del documento.",
          type: "DOCUMENT_VALIDATION",
          evidenceStatus: "VERIFIED",
          occurredAt: reviewedAt,
          createdAt: document.uploadedAt.toISOString(),
          locationLabel: null,
          skills: [],
          evidenceUrls: [],
          project: null,
          workspace: "Terraqo",
          media: [],
          validations: [{
            id: `document-validation-${document.id}`,
            responseNote: "Documento revisado. El archivo original conserva acceso restringido.",
            resolvedAt: reviewedAt,
            createdAt: reviewedAt,
            validatorName: "Equipo de validaciones Terraqo",
            validatorImage: null
          }]
        };
      });

    const projectRecords = Array.from(new Map(
      profile.experiences
        .filter((experience) => experience.project)
        .map((experience) => [experience.project!.id, experience] as const)
    ).values()).map<PublicCvActivityRecord>((experience) => {
      const project = experience.project!;
      const occurredAt = experience.updatedAt.toISOString();
      return {
        id: `project-${project.id}`,
        title: `Proyecto vinculado: ${normalizeSpanishCopy(project.title) || project.title}`,
        summary: [project.clientName, project.category, project.location].filter(Boolean).map((item) => normalizeSpanishCopy(item || "") || item).join(" · ") || "Proyecto asociado a la trayectoria pública del profesional.",
        outcome: null,
        type: "PROJECT_ACTIVITY",
        evidenceStatus: experience.verifiedByTerraqo || experience.verificationStatus === "APPROVED" ? "VERIFIED" : "LINKED",
        occurredAt,
        createdAt: experience.createdAt.toISOString(),
        locationLabel: project.location
          ? normalizeSpanishCopy(project.location) || project.location
          : null,
        skills: project.category ? [normalizeSpanishCopy(project.category) || project.category] : [],
        evidenceUrls: [],
        project: {
          title: normalizeSpanishCopy(project.title) || project.title,
          clientName: project.clientName ? normalizeSpanishCopy(project.clientName) || project.clientName : null,
          location: project.location ? normalizeSpanishCopy(project.location) || project.location : null,
          category: project.category ? normalizeSpanishCopy(project.category) || project.category : null,
          image: project.images[0]?.url || null
        },
        workspace: experience.companyName ? normalizeSpanishCopy(experience.companyName) || experience.companyName : null,
        media: [],
        validations: []
      };
    });

    const activityRecords = [...worklogRecords, ...experienceRecords, ...educationRecords, ...documentRecords, ...projectRecords]
      .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime());
    const lastInitialWorklog = initialArchiveWorklogs.at(-1);
    const initialNextCursor =
      orderedWorklogs.length > initialArchiveWorklogs.length && lastInitialWorklog
        ? encodeWorklogArchiveCursor(
            lastInitialWorklog.occurredAt,
            lastInitialWorklog.id,
            parseWorklogArchiveFilters({ alcance: "all", limite: "20" }),
          )
        : null;

    return (
      <div className="terraqo-brand-surface tq-cv-v3 min-h-screen bg-[#07111f]">
        <TerraqoPublicHeader tone="dark" />
        <PublicCvActivityExplorer
          username={username}
          profileName={profile.user.name || username}
          records={activityRecords}
          initialRecordId={initialRecordId}
          profileId={profile.id}
          initialNextCursor={initialNextCursor}
        />
      </div>
    );
  }

  if (section === "experiencias") {
    return <PublicCvExperiencePage profile={profile} username={username} />;
  }

  if (section === "educacion") {
    return <PublicCvEducationPage profile={profile} username={username} />;
  }

  if (section === "proyectos") {
    return <PublicCvProjectsPage profile={profile} username={username} projects={projects} />;
  }

  return (
    <div className="terraqo-brand-surface tq-cv-v3 min-h-screen bg-[#07111f] text-white">
      <TerraqoPublicHeader tone="dark" />
      <main className="relative isolate overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_82%_12%,rgba(67,116,186,0.2),transparent_28%),linear-gradient(180deg,#07111f_0%,#040b15_100%)]" />
        <section>
          <div className="mx-auto grid w-[min(100%-24px,1480px)] gap-8 py-9 sm:w-[min(100%-40px,1480px)] sm:py-12 lg:grid-cols-[1fr_360px] lg:items-end">
            <div>
              <Link href={publicCvPath(username)} className="inline-flex items-center gap-2 text-sm font-black text-[#9fc4ff] transition hover:text-[#25c0d5]">
                <ArrowRight className="h-4 w-4 rotate-180" />
                Volver al CV vivo
              </Link>
              <p className="mt-8 font-mono text-xs font-black uppercase tracking-[0.28em] text-[#488ac9]">{copy.eyebrow}</p>
              <h1 className="mt-4 max-w-4xl font-display text-[clamp(2.6rem,5vw,5rem)] font-black leading-[0.95] tracking-[-0.045em] text-white">{copy.title}</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/60 sm:text-lg">{copy.description}</p>
            </div>
            <div className="rounded-[18px] border border-[#488ac9]/28 bg-[#0e1a26]/70 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.24)]">
              <span className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[#9fc4ff]">Perfil público</span>
              <div className="mt-3 flex items-center gap-4">
                <TerraqoAvatar src={profile.user.image} name={profile.user.name || username} className="h-14 w-14 rounded-full text-xl" />
                <div className="min-w-0"><h2 className="truncate font-display text-xl font-black">{profile.user.name || username}</h2><p className="mt-1 text-sm font-bold text-[#488ac9]">@{username}</p></div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto grid w-[min(100%-24px,1480px)] gap-5 pb-10 sm:w-[min(100%-40px,1480px)]">
          {section === "capacidades" ? <SkillsAndTools profile={profile} username={username} extended /> : null}
          {section === "documentos" ? <DocumentsPanel profile={profile} username={username} extended /> : null}
          <PublicCVCTA username={username} isPublicCv={profile.liveCvEnabled && profile.liveCvVisibility === "PUBLIC"} />
        </section>
      </main>
      <PublicCVFooter updatedAt={profile.updatedAt} />
    </div>
  );
}

function ProfileHero({ profile, name, username, isPublicCv }: { profile: PublicCvProfile; name: string; username: string; specialties: string[]; isPublicCv: boolean }) {
  return (
    <div id="cv-vivo" className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
      <TerraqoAvatar src={profile.user.image} name={name} className="h-24 w-24 shrink-0 rounded-full border border-[#294259] text-3xl sm:h-32 sm:w-32 sm:text-4xl" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold leading-tight text-white sm:text-4xl lg:text-5xl">{name}</h1>
          <span className="rounded-full border border-[#294259] px-3 py-1 text-xs text-slate-300">{isPublicCv ? "Perfil público" : "CV vivo"}</span>
          {profile.identityVerificationStatus === "VERIFIED" ? <BadgeCheck aria-label="Identidad verificada" className="h-6 w-6 text-sky-400" /> : null}
        </div>
        <p className="mt-3 text-lg text-slate-200 sm:text-xl">{currentHeadline(profile)}</p>
        <p className="mt-2 max-w-3xl line-clamp-2 text-sm leading-6 text-slate-400">{profile.bio ? profileSummary(profile) : "Trabajo que puedes conocer con contexto."}</p>
        <span className="sr-only">@{username}</span>
        {profile.socialLinks.length ? <div className="mt-3 flex flex-wrap gap-3">{profile.socialLinks.slice(0, 6).map(link => <a key={link.id} href={link.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm text-sky-300 underline-offset-4 hover:underline">{link.label || socialMeta(link.platform).label}</a>)}</div> : null}
      </div>
    </div>
  );
}

function PublicCvExperiencePage({ profile, username }: { profile: PublicCvProfile; username: string }) {
  const experiences = profile.experiences;
  const totalMonths = experiences.reduce(
    (sum, experience) => sum + monthsBetween(experience.startedAt, experience.currentlyWorking ? null : experience.endedAt),
    0
  );
  const verifiedExperiences = experiences.filter((experience) => experience.verifiedByTerraqo || experience.verificationStatus === "APPROVED");
  const companies = new Set(experiences.map((experience) => experience.companyName || experience.project?.clientName).filter(Boolean));
  const leadershipMonths = experiences.reduce((sum, experience) => {
    const leadershipCopy = `${experience.title} ${experience.role || ""}`;
    return /gerente|director|jefe|lider|líder|lead|ceo|fundador/i.test(leadershipCopy)
      ? sum + monthsBetween(experience.startedAt, experience.currentlyWorking ? null : experience.endedAt)
      : sum;
  }, 0);
  const verifiedPercent = experiences.length ? Math.round((verifiedExperiences.length / experiences.length) * 100) : 0;

  return (
    <div className="terraqo-brand-surface tq-cv-v3 min-h-screen bg-[#07111f] text-white">
      <TerraqoPublicHeader tone="dark" />
      <main className="relative isolate overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_78%_10%,rgba(67,116,186,0.18),transparent_30%),linear-gradient(180deg,#07111f_0%,#040b15_100%)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[420px] opacity-45 [background-image:radial-gradient(circle_at_10%_100%,rgba(37,192,213,0.22),transparent_18%),radial-gradient(circle_at_90%_100%,rgba(67,116,186,0.3),transparent_20%)]" />
        <div className="mx-auto w-[min(100%-24px,1480px)] py-8 sm:w-[min(100%-40px,1480px)] sm:py-12">
          <Link href={publicCvPath(username)} className="inline-flex items-center gap-2 text-sm font-black text-[#9fc4ff] transition hover:text-[#25c0d5]">
            <ArrowRight className="h-4 w-4 rotate-180" />
            Volver al CV vivo
          </Link>

          <section className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
            <div>
              <p className="font-mono text-xs font-black uppercase tracking-[0.3em] text-[#488ac9]">Experiencia profesional</p>
              <h1 className="mt-4 max-w-4xl font-display text-[clamp(2.6rem,5vw,5rem)] font-black leading-[0.95] tracking-[-0.045em] text-white">
                Trayectoria que genera <span className="text-[#488ac9]">confianza y resultados.</span>
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/60 sm:text-lg">
                Roles, responsabilidades y resultados documentados para presentar la experiencia con contexto, continuidad y respaldo verificable.
              </p>
            </div>
            <div className="relative overflow-hidden rounded-[22px] border border-[#488ac9]/28 bg-[#0e1a26]/74 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
              <div className="absolute right-0 top-0 h-full w-1 bg-gradient-to-b from-[#4374ba] via-[#25c0d5] to-transparent" />
              <div className="flex items-center gap-5">
                <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full border border-[#488ac9]/30 bg-[#4374ba]/15 text-[#9fc4ff]"><BriefcaseBusiness className="h-7 w-7" /></span>
                <div>
                  <small className="text-sm font-semibold text-white/50">Experiencia acumulada</small>
                  <strong className="mt-1 block font-display text-3xl font-black text-white">{formatExperienceDuration(totalMonths)}</strong>
                  <p className="mt-1 text-sm text-white/40">Calculada a partir de los periodos públicos registrados.</p>
                </div>
              </div>
            </div>
          </section>

          <div className="mt-8 grid overflow-hidden rounded-[18px] border border-white/10 bg-[#0e1a26]/58 sm:grid-cols-2 xl:grid-cols-4">
            <SectionMetric icon={Building2} value={companies.size} label="Organizaciones" />
            <SectionMetric icon={Target} value={new Set(experiences.map((item) => item.project?.id).filter(Boolean)).size} label="Proyectos vinculados" />
            <SectionMetric icon={Crown} value={formatExperienceDuration(leadershipMonths)} label="Experiencia en liderazgo" />
            <SectionMetric icon={ShieldCheck} value={`${verifiedPercent}%`} label="Experiencia verificada" />
          </div>

          <div className="mt-8">
            <ExperienceTimeline profile={profile} username={username} extended />
          </div>
        </div>
      </main>
      <PublicCVFooter updatedAt={profile.updatedAt} />
    </div>
  );
}

function SectionMetric({ icon: Icon, value, label }: { icon: LucideIcon; value: string | number; label: string }) {
  return (
    <div className="flex min-h-[100px] items-center gap-4 border-b border-white/10 px-5 py-4 last:border-b-0 sm:border-r sm:[&:nth-child(2)]:border-r-0 xl:border-b-0 xl:[&:nth-child(2)]:border-r xl:last:border-r-0">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-[#488ac9]/24 bg-[#4374ba]/12 text-[#9fc4ff]"><Icon className="h-5 w-5" /></span>
      <span><strong className="block font-display text-2xl font-black text-white">{value}</strong><small className="font-semibold text-white/50">{label}</small></span>
    </div>
  );
}

function PublicCvEducationPage({ profile, username }: { profile: PublicCvProfile; username: string }) {
  const education = profile.education;
  const institutions = new Set(education.map((item) => item.institution.trim()).filter(Boolean));
  const verified = education.filter((item) => item.verificationStatus === "APPROVED");
  const publicPercent = education.length ? 100 : 0;

  return (
    <div className="terraqo-brand-surface tq-cv-v3 min-h-screen bg-[#07111f] text-white">
      <TerraqoPublicHeader tone="dark" />
      <main className="relative isolate overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_88%_58%,rgba(74,51,173,0.2),transparent_30%),radial-gradient(circle_at_8%_92%,rgba(37,192,213,0.12),transparent_22%),linear-gradient(180deg,#07111f_0%,#040b15_100%)]" />
        <div className="mx-auto w-[min(100%-24px,1480px)] py-8 sm:w-[min(100%-40px,1480px)] sm:py-12">
          <Link href={publicCvPath(username)} className="inline-flex items-center gap-2 text-sm font-black text-[#9fc4ff] transition hover:text-[#25c0d5]">
            <ArrowRight className="h-4 w-4 rotate-180" />
            Volver al CV vivo
          </Link>

          <section className="mt-8 grid gap-7 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="font-mono text-xs font-black uppercase tracking-[0.28em] text-[#9fc4ff]">Formación académica</p>
              <h1 className="mt-4 font-display text-[clamp(2.6rem,5vw,5rem)] font-black leading-[0.95] tracking-[-0.045em] text-white">Educación y <span className="text-[#25c0d5]">certificaciones.</span></h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/60 sm:text-lg">Formación pública declarada por el profesional, organizada por institución, periodo, especialidad y estado de validación.</p>
            </div>
            <div className="grid overflow-hidden rounded-[22px] border border-white/10 bg-[#0e1a26]/64 sm:grid-cols-3">
              <SectionMetric icon={GraduationCap} value={education.length} label="Formaciones públicas" />
              <SectionMetric icon={Building2} value={institutions.size} label="Instituciones" />
              <SectionMetric icon={ShieldCheck} value={education.length ? `${Math.round((verified.length / education.length) * 100)}%` : `${publicPercent}%`} label="Formación verificada" />
            </div>
          </section>

          <div className="mt-9">
            <EducationTimeline profile={profile} username={username} extended />
          </div>

          <section className="mt-5 flex flex-col gap-4 rounded-[18px] border border-white/10 bg-[#0e1a26]/64 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex items-center gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[#25c0d5]/25 bg-[#25c0d5]/10 text-[#25c0d5]"><Award className="h-6 w-6" /></span>
              <div><h2 className="font-display text-lg font-black text-white">Formación presentada con trazabilidad.</h2><p className="mt-1 text-sm text-white/40">Los estados de revisión se muestran sin publicar archivos ni datos sensibles.</p></div>
            </div>
            <Link href={publicCvPath(username, "documentos")} className="inline-flex items-center justify-center gap-2 rounded-[9px] border border-[#488ac9]/40 px-5 py-3 text-sm font-black text-[#9fc4ff] transition hover:border-[#25c0d5] hover:text-[#25c0d5]">Cómo validamos la formación <ArrowRight className="h-4 w-4" /></Link>
          </section>
        </div>
      </main>
      <PublicCVFooter updatedAt={profile.updatedAt} />
    </div>
  );
}

function PublicCvProjectsPage({ profile, username, projects }: { profile: PublicCvProfile; username: string; projects: ProjectSnapshot[] }) {
  const categories = new Set(projects.map((project) => project.category).filter(Boolean));
  const completed = projects.filter((project) => project.status === "FINISHED" || project.status === "PUBLISHED").length;
  const locations = new Set(projects.map((project) => project.location).filter(Boolean));

  return (
    <div className="terraqo-brand-surface tq-cv-v3 min-h-screen bg-[#07111f] text-white">
      <TerraqoPublicHeader tone="dark" />
      <main className="relative isolate overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_14%_12%,rgba(67,116,186,0.2),transparent_28%),radial-gradient(circle_at_92%_82%,rgba(37,192,213,0.12),transparent_22%),linear-gradient(180deg,#07111f_0%,#040b15_100%)]" />
        <div className="mx-auto w-[min(100%-24px,1480px)] py-8 sm:w-[min(100%-40px,1480px)] sm:py-12">
          <Link href={publicCvPath(username)} className="inline-flex items-center gap-2 text-sm font-black text-[#9fc4ff] transition hover:text-[#25c0d5]">
            <ArrowRight className="h-4 w-4 rotate-180" />
            Volver al CV vivo
          </Link>

          <section className="mt-8 grid gap-8 xl:grid-cols-[0.92fr_1.08fr] xl:items-center">
            <div>
              <p className="font-mono text-xs font-black uppercase tracking-[0.28em] text-[#25c0d5]">Proyectos destacados</p>
              <h1 className="mt-4 max-w-3xl font-display text-[clamp(2.7rem,5vw,5rem)] font-black leading-[0.95] tracking-[-0.045em] text-white">Impacto real, <span className="text-[#25c0d5]">resultados medibles.</span></h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/60 sm:text-lg">Proyectos públicos vinculados a la trayectoria y la actividad documentada del profesional.</p>
            </div>
            <div className="grid overflow-hidden rounded-[22px] border border-white/10 bg-[#0e1a26]/62 sm:grid-cols-4">
              <SectionMetric icon={FolderKanban} value={projects.length} label="Proyectos públicos" />
              <SectionMetric icon={CheckCircle2} value={completed} label="Completados" />
              <SectionMetric icon={Grid2X2} value={categories.size} label="Sectores" />
              <SectionMetric icon={MapPin} value={locations.size} label="Ubicaciones" />
            </div>
          </section>

          <section className="mt-10">
            <PublicCvProjectExplorer projects={projects} username={username} />
          </section>

          <section className="mt-5 flex flex-col gap-4 rounded-[18px] border border-white/10 bg-[#0e1a26]/64 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex items-center gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[#488ac9]/25 bg-[#4374ba]/12 text-[#9fc4ff]"><Target className="h-6 w-6" /></span><div><h2 className="font-display text-lg font-black text-white">El impacto se presenta con contexto.</h2><p className="mt-1 text-sm text-white/40">Cada proyecto visible mantiene su relación con experiencias y evidencias públicas.</p></div></div>
            <Link href={publicCvPath(username, "evidencias")} className="inline-flex items-center justify-center gap-2 rounded-[9px] border border-[#488ac9]/40 px-5 py-3 text-sm font-black text-[#9fc4ff] transition hover:border-[#25c0d5] hover:text-[#25c0d5]">Ver toda la actividad <ArrowRight className="h-4 w-4" /></Link>
          </section>
        </div>
      </main>
      <PublicCVFooter updatedAt={profile.updatedAt} />
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
  return (
    <aside className="rounded-[18px] border border-[#488ac9]/35 bg-[#07111f]/82 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_45px_rgba(0,0,0,0.22)]">
      <h2 className="flex items-center gap-3 font-mono text-[11px] font-black uppercase tracking-[0.12em] text-white/80"><ShieldCheck className="h-5 w-5 text-[#488ac9]" />Confianza y verificación</h2>
      <div className="mt-5 space-y-2 border-t border-white/10 pt-4">
        {items.map((item) => (
          <div key={item.label} className="grid grid-cols-[22px_1fr_20px] items-center gap-2.5 rounded-lg px-1 py-1.5" title={item.detail}>
            <span className={item.done ? "text-[#25c0d5]" : "text-[#d99a2b]"}><item.icon className="h-4 w-4" /></span>
            <div><strong className="text-sm font-semibold text-white/80">{item.label}</strong><p className="mt-1 text-xs text-slate-400">{item.detail}</p></div>
            <span className={item.done ? "text-[#25c0d5]" : "text-[#d99a2b]"} title={item.done ? "Validado" : "Pendiente"}>
              {item.done ? <CheckCircle2 className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
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
    { label: "Proyectos vinculados", value: projects, icon: FolderKanban },
    { label: "Experiencias validadas", value: validation, icon: Grid2X2 },
    { label: "Evidencias públicas", value: evidence, icon: ClipboardCheck }
  ];
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-[16px] border border-white/10 bg-[#07111f]/72 xl:grid-cols-[repeat(4,minmax(0,1fr))]">
      {metrics.map((metric) => (
        <div key={metric.label} className="flex min-h-[92px] items-center gap-3 border-b border-r border-white/10 px-4 even:border-r-0 md:border-b-0 md:border-r md:px-5 md:even:border-r">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] border border-[#488ac9]/20 bg-[#4374ba]/10 text-[#488ac9]"><metric.icon className="h-5 w-5" /></span>
          <span><strong className="block font-display text-2xl font-black text-white sm:text-[1.7rem]">{metric.value}</strong><small className="font-semibold text-white/50">{metric.label}</small></span>
        </div>
      ))}
      <div className="col-span-2 flex min-h-[92px] items-center gap-3 px-4 md:col-span-1 md:px-5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#25c0d5] shadow-[0_0_14px_rgba(37,192,213,0.72)]" />
        <span><small className="block text-xs text-white/40">Última actualización</small><strong className="text-sm text-white/80">{formatDate(lastActivity, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</strong></span>
      </div>
    </div>
  );
}

function ExperienceTimeline({ profile, username, extended = false }: { profile: PublicCvProfile; username: string; extended?: boolean }) {
  const experiences = extended ? profile.experiences : profile.experiences.slice(0, 3);
  return (
    <section id="experiencia" className="rounded-[22px] border border-white/10 bg-[#0e1a26]/62 p-4 shadow-[0_22px_70px_rgba(0,0,0,0.24)] sm:p-6">
      <SectionHeader title="Experiencia profesional" description="Trayectoria pública seleccionada y presentada con el contexto necesario para evaluarla." action={extended ? undefined : "Ver todas las experiencias"} href={extended ? undefined : publicCvPath(username, "experiencias")} />
      <div className="mt-6 space-y-4 border-l border-[#488ac9]/35 pl-4 sm:pl-6">
        {experiences.length ? experiences.map((experience) => <ExperienceCard key={experience.id} experience={experience} username={username} />) : <EmptyState title="Sin experiencias públicas" description="Cuando el profesional publique experiencias, aparecerán aquí con su rol, periodo y nivel de revisión." />}
      </div>
    </section>
  );
}

function EducationTimeline({ profile, username, extended = false }: { profile: PublicCvProfile; username: string; extended?: boolean }) {
  const educationItems = extended ? profile.education : profile.education.slice(0, 3);
  return (
    <section className="rounded-[22px] border border-white/10 bg-[#0e1a26]/58 p-4 shadow-[0_22px_70px_rgba(0,0,0,0.22)] sm:p-6">
      <SectionHeader title="Educación y certificaciones" description="Formación pública declarada por el profesional." action={extended ? undefined : "Ver toda la formación"} href={extended ? undefined : publicCvPath(username, "educacion")} />
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {educationItems.map((education) => (
          <article key={education.id} className="group rounded-[16px] border border-white/10 bg-[#07111f]/74 p-4 transition hover:border-[#488ac9]/45 sm:p-5">
            <div className="grid gap-5 sm:grid-cols-[96px_1fr]">
              <div className="grid h-24 w-24 place-items-center rounded-[15px] border border-[#488ac9]/28 bg-[radial-gradient(circle_at_35%_20%,rgba(72,138,201,0.3),transparent_55%),#0e1a26] text-center text-[#9fc4ff]">
                <GraduationCap className="h-9 w-9" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className="inline-flex rounded-full border border-[#488ac9]/20 bg-[#4374ba]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#9fc4ff]">{educationKind(education.degree)}</span>
                    <p className="mt-3 font-display text-xl font-black text-white">{normalizeSpanishCopy(education.degree) || education.degree}</p>
                    <p className="mt-1 text-sm font-black text-[#488ac9]">{normalizeSpanishCopy(education.institution) || education.institution}</p>
                  </div>
                  <span className={education.verificationStatus === "APPROVED" ? "inline-flex items-center gap-1.5 rounded-full border border-[#25c0d5]/20 bg-[#25c0d5]/10 px-2.5 py-1 text-[11px] font-black text-[#25c0d5]" : "inline-flex items-center gap-1.5 rounded-full border border-[#d99a28]/20 bg-[#d99a28]/10 px-2.5 py-1 text-[11px] font-black text-[#f0b84b]"}>{education.verificationStatus === "APPROVED" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}{education.verificationStatus === "APPROVED" ? "Verificada" : "En revisión"}</span>
                </div>
                {education.field ? <p className="mt-3 text-sm text-white/60">{normalizeSpanishCopy(education.field) || education.field}</p> : null}
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-white/50">
                  <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[#488ac9]" />{formatPeriod(education.startedAt, education.currentlyStudying ? null : education.endedAt)}</span>
                  {education.locationCity ? <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-[#488ac9]" />{education.locationCity}</span> : null}
                </div>
              </div>
            </div>
            {extended && (education.evidence.length || education.validatorName) ? (
              <details className="mt-5 border-t border-white/10 pt-4 text-sm text-white/60">
                <summary className="cursor-pointer list-none font-black text-[#9fc4ff] marker:hidden">Ver detalles de formación</summary>
                <div className="mt-4 grid gap-2 leading-6">
                  {education.validatorName ? <p><strong className="text-white">Responsable de validación:</strong> {education.validatorName}</p> : null}
                  <p><strong className="text-white">Evidencias registradas:</strong> {education.evidence.length}</p>
                </div>
              </details>
            ) : null}
          </article>
        ))}
        {!educationItems.length ? <EmptyState title="Sin formación pública" description="La educación y las certificaciones aparecerán cuando el titular active su visibilidad pública." /> : null}
      </div>
    </section>
  );
}

function educationKind(degree: string) {
  if (/ingenier|licenci|maestr|doctor|universit/i.test(degree)) return "Título universitario";
  if (/certif|diplom|curso|programa|especial/i.test(degree)) return "Programa académico";
  return "Formación profesional";
}

function ExperienceCard({ experience, username }: { experience: PublicCvProfile["experiences"][number]; username: string }) {
  const checks = (experience.verifiedByTerraqo ? 1 : 0) + (experience.project ? 1 : 0);
  return (
    <article className="group relative grid gap-5 rounded-[16px] border border-white/10 bg-[#07111f]/76 p-4 transition duration-200 hover:border-[#488ac9]/45 hover:bg-[#081829] md:grid-cols-[126px_130px_minmax(0,1fr)_205px] md:p-5">
      <span className="absolute -left-[23px] top-8 grid h-4 w-4 place-items-center rounded-full border-[4px] border-[#0e1a26] bg-[#488ac9] shadow-[0_0_18px_rgba(72,138,201,0.75)] sm:-left-[31px]" />
      <div className="font-mono text-xs font-black uppercase tracking-[0.08em] text-[#9fc4ff]">
        <span className="block">{formatPeriod(experience.startedAt, experience.currentlyWorking ? null : experience.endedAt)}</span>
        <small className="mt-2 block text-white/40">{experience.locationCity || experience.location || experience.project?.location || "Ubicación no pública"}</small>
        <small className="mt-2 block text-[#25c0d5]">{formatExperienceDuration(monthsBetween(experience.startedAt, experience.currentlyWorking ? null : experience.endedAt))}</small>
      </div>
      <CompanyTile label={experience.companyName || experience.project?.clientName || "Empresa"} />
      <div>
        <div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-xl font-black text-white">{experience.title}</h3>{experience.currentlyWorking ? <span className="rounded-full border border-[#25c0d5]/25 bg-[#25c0d5]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#25c0d5]">Cargo actual</span> : null}</div>
        <p className="mt-1 text-sm font-black text-[#488ac9]">{experience.companyName || experience.project?.clientName || "Empresa no pública"}</p>
        <p className="mt-3 text-sm leading-6 text-white/60">{experience.role || "Experiencia profesional declarada por el profesional."}</p>
        {experience.summary ? <p className="mt-3 line-clamp-3 text-sm leading-6 text-white/50">{normalizeSpanishCopy(experience.summary) || experience.summary}</p> : null}
        {experience.highlights.length ? <div className="mt-4 flex flex-wrap gap-2">{experience.highlights.slice(0, 3).map((highlight) => <span key={highlight} className="rounded-full border border-[#488ac9]/20 bg-[#4374ba]/10 px-2.5 py-1 text-[11px] font-bold text-[#9fc4ff]">{normalizeSpanishCopy(highlight) || highlight}</span>)}</div> : null}
      </div>
      <div className="flex flex-col items-start justify-between gap-4 md:items-end">
        <ValidationBadge checks={checks} verified={experience.verifiedByTerraqo} />
        <div className="flex gap-2 text-[#25c0d5]">
          {Array.from({ length: Math.max(1, checks) }).map((_, index) => <CheckCircle2 key={index} className="h-5 w-5" />)}
        </div>
        <Link href={publicCvPath(username, `experiencias/${experience.id}`)} className="inline-flex items-center gap-2 rounded-[9px] border border-[#488ac9]/35 px-4 py-2.5 text-sm font-black text-white transition hover:border-[#25c0d5] hover:text-[#25c0d5]">Ver detalles <ArrowRight className="h-4 w-4" /></Link>
      </div>
    </article>
  );
}

function FeaturedProjects({ projects, profile, username }: { projects: ProjectSnapshot[]; profile: PublicCvProfile; username: string }) {
  return <ProjectsSection projects={projects} profile={profile} username={username} />;
}

function LiveCvPulse({ profile, username, cases }: { cases: PublicWorkCaseCard[]; profile: PublicCvProfile; username: string }) {
  return <PublicCvWorkShowcase cases={cases} username={username} records={profile.worklogs.slice(0, 2).map(worklog => ({
    id: worklog.id,
    title: normalizeSpanishCopy(worklog.title) || worklog.title,
    summary: worklog.summary,
    date: new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(worklog.occurredAt),
    location: worklog.locationLabel,
    image: worklog.media.find(media => media.contentType.startsWith("image/"))
      ? `/api/public/cv/${encodeURIComponent(username)}/worklogs/${encodeURIComponent(worklog.media.find(media => media.contentType.startsWith("image/"))!.id)}`
      : null,
    skills: worklog.skills,
    status: worklog.evidenceStatus === "VERIFIED" ? "Evidencia verificada" : worklog.evidenceStatus === "CONFIRMED" ? "Participación confirmada" : worklog.evidenceStatus === "LINKED" ? "Participación vinculada" : "Participación declarada",
  }))} />;
}

function ProjectsSection({ projects, profile, username, extended = false }: { projects: ProjectSnapshot[]; profile: PublicCvProfile; username?: string; extended?: boolean }) {
  const fallback = profile.worklogs.filter((worklog) => !worklog.project).slice(0, extended ? 24 : 4);
  return (
    <section id="proyectos" className="rounded-[22px] border border-white/10 bg-[#0e1a26]/58 p-5 shadow-[0_22px_70px_rgba(0,0,0,0.22)]">
      <SectionHeader title="Proyectos destacados" description="Proyectos en los que ha participado y generado impacto." action={extended ? undefined : "Ver todos los proyectos"} href={extended ? undefined : publicCvPath(username || profile.username || "perfil", "proyectos")} />
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
    "group block overflow-hidden rounded-[14px] border border-white/10 bg-[#07111f]/74 text-white transition duration-200 hover:-translate-y-1 hover:border-[#488ac9]/50 hover:shadow-[0_18px_42px_rgba(0,0,0,0.25)]";
  const content = (
    <>
      <VisualFrame src={project.image} label={project.title} />
      <div className="p-4">
        <span className="inline-flex rounded-[7px] border border-[#488ac9]/20 bg-[#4374ba]/10 px-2 py-1 text-xs font-black text-[#9fc4ff]">{PROJECT_STATUS_COPY[project.status] || "Proyecto"}</span>
        <h3 className="mt-3 min-h-[48px] font-display text-base font-black leading-tight">{project.title}</h3>
        <p className="mt-2 text-xs font-semibold text-white/50">{project.clientName || project.location || project.category || "Proyecto Terraqo"}</p>
        <span className="mt-4 inline-flex items-center gap-2 text-xs font-black text-[#9fc4ff] transition group-hover:translate-x-1 group-hover:text-[#25c0d5]">
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
    <section id="evidencias" className="rounded-[22px] border border-white/10 bg-[#0e1a26]/58 p-5 shadow-[0_22px_70px_rgba(0,0,0,0.22)] sm:p-6">
      <SectionHeader title="Evidencias públicas" description="Muestra del trabajo real documentado en campo." action={extended ? "Volver al CV vivo" : "Ver todas las evidencias"} href={extended && username ? publicCvPath(username) : publicCvPath(username || "perfil", "evidencias")} />
      <div className={extended ? "mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" : "mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-6"}>
        {worklogs.length ? worklogs.map((worklog) => <EvidenceCard key={worklog.id} worklog={worklog} username={username} />) : <EmptyState title="Sin evidencias públicas" description="Las evidencias públicas seleccionadas aparecerán en esta sección." />}
      </div>
    </section>
  );
}

function EvidenceCard({ worklog, username }: { worklog: PublicCvProfile["worklogs"][number]; username?: string }) {
  const uploadedPhoto = username && worklog.media[0]
    ? `/api/public/cv/${encodeURIComponent(username)}/worklogs/${encodeURIComponent(worklog.media[0].id)}`
    : undefined;
  const src = uploadedPhoto || worklog.evidenceUrls.find((url) => url.startsWith("http") || url.startsWith("/")) || projectImage(worklog.project);
  const content = (
    <article id={worklog.id} className="group scroll-mt-24 overflow-hidden rounded-[14px] border border-white/10 bg-[#07111f]/74 transition hover:border-[#488ac9]/45">
      <VisualFrame src={src} label={worklog.title} compact />
      <div className="p-3">
        <h3 className="line-clamp-2 min-h-[36px] text-sm font-black text-white">{normalizeSpanishCopy(worklog.title) || worklog.title}</h3>
        {worklog.locationLabel ? <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-[#9fc4ff]"><MapPin className="h-3.5 w-3.5" />{worklog.locationLabel}</p> : null}
        <p className="mt-2 font-mono text-xs text-white/40">{formatDate(worklog.occurredAt, { year: "numeric" })}</p>
      </div>
    </article>
  );
  return username ? <Link href={publicCvEvidenceHref(username, worklog.id)} aria-label={`Ver actividad: ${worklog.title}`}>{content}</Link> : content;
}

function SkillsAndTools({ profile, username, extended = false }: { profile: PublicCvProfile; username?: string; extended?: boolean }) {
  const bars = (extended ? profile.specialties : profile.specialties.slice(0, 3));
  const tools = (extended ? [...profile.equipment, ...profile.software] : [...profile.equipment, ...profile.software].slice(0, 8));
  const categories = extended ? profile.professionalCategories : profile.professionalCategories.slice(0, 3);
  return (
    <section className="rounded-[22px] border border-white/10 bg-[#0e1a26]/58 p-5 shadow-[0_22px_70px_rgba(0,0,0,0.22)] sm:p-6">
      <SectionHeader title="Capacidades técnicas" description="Habilidades, equipos y software declarados por el profesional." action={extended ? "Volver al CV vivo" : "Ver todas las capacidades"} href={extended && username ? publicCvPath(username) : username ? publicCvPath(username, "capacidades") : undefined} />
      <div className="mt-5 grid gap-6 md:grid-cols-[0.9fr_1fr]">
        <div className="space-y-4">
          {bars.length ? bars.map((skill) => <SkillBar key={skill} label={skill} />) : <EmptyState title="Habilidades por completar" description="El profesional aún no publicó sus habilidades principales." />}
        </div>
        <div className="flex flex-wrap content-start gap-2">
          {[...categories, ...tools].length ? [...categories, ...tools].map((tool) => <ToolChip key={tool} label={tool} tone="dark" />) : <ToolChip label="Herramientas por completar" tone="dark" />}
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
  const docs = ["DNI_FRONT", "SCTR", "CERTIFICATE", "CRIMINAL_RECORD", "CV", "OTHER"].map((type) => grouped.get(type) || { id: type, type, reviewStatus: "NOT_PROVIDED" as const, uploadedAt: null, reviewedAt: null });
  return (
    <section id="documentos" className="rounded-[22px] border border-white/10 bg-[#0e1a26]/58 p-5 shadow-[0_22px_70px_rgba(0,0,0,0.22)] sm:p-6">
      <h2 className="font-display text-xl font-black text-white">Confianza y documentos</h2>
      <p className="mt-1 text-sm leading-6 text-white/50">Estado público de documentos revisados. Los archivos privados no se exponen.</p>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {docs.map((document) => <DocumentStatusCard key={`${document.type}-${document.id}`} document={document} />)}
      </div>
      <Link href={extended ? publicCvCallback(username, "documentos") : publicCvPath(username, "documentos")} prefetch={!extended} className="mt-5 inline-flex items-center gap-2 text-sm font-black text-[#9fc4ff] transition hover:text-[#25c0d5]">{extended ? "Solicitar acceso al detalle" : "Ver todos los documentos"} <ArrowRight className="h-4 w-4" /></Link>
    </section>
  );
}

function PublicCVCTA({ username, isPublicCv }: { username: string; isPublicCv: boolean }) {
  return (
    <section className="relative isolate grid gap-5 overflow-hidden rounded-[22px] border border-[#488ac9]/32 bg-[#0e1a26]/82 p-6 shadow-[0_22px_70px_rgba(0,0,0,0.25)] md:grid-cols-[1fr_auto] md:items-center">
      <div className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-1/2 bg-[radial-gradient(circle_at_100%_50%,rgba(37,192,213,0.16),transparent_55%)]" />
      <div className="flex items-center gap-5">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full border border-[#488ac9]/30 bg-[#4374ba]/12 text-[#9fc4ff]"><LockKeyhole className="h-7 w-7" /></span>
        <div>
          <h2 className="font-display text-xl font-black text-white">¿Quieres conocer más sobre mi experiencia?</h2>
          <p className="mt-1 text-sm leading-6 text-white/50">{isPublicCv ? "Solicita acceso a mi CV completo para ver información detallada, documentos y evidencia adicional." : "Este CV muestra únicamente la información que el profesional ha compartido."}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/red" className="inline-flex items-center justify-center gap-2 rounded-[8px] border border-[#25c0d5]/45 bg-[#25c0d5]/10 px-5 py-3 text-sm font-black text-[#8debf5] transition hover:bg-[#25c0d5]/20">Buscar más perfiles <ArrowRight className="h-4 w-4" /></Link>
        <Link href={publicCvCallback(username)} prefetch={false} className="inline-flex items-center justify-center gap-2 rounded-[8px] border border-[#488ac9]/45 bg-transparent px-5 py-3 text-sm font-black text-white transition hover:border-[#25c0d5] hover:text-[#25c0d5]"><MessageSquare className="h-4 w-4" />Contactar</Link>
        <Link href={publicCvCallback(username)} prefetch={false} className="inline-flex items-center justify-center gap-2 rounded-[8px] bg-[#4374ba] px-5 py-3 text-sm font-black text-white"><LockKeyhole className="h-4 w-4" />Solicitar acceso al CV completo</Link>
        <Link href={`/api/terraqo/cv/${username}/pdf`} target="_blank" className="inline-flex items-center justify-center gap-2 rounded-[8px] border border-white/15 bg-white/[0.04] px-5 py-3 text-sm font-black text-white"><Download className="h-4 w-4" />Descargar PDF</Link>
      </div>
    </section>
  );
}

function PublicCVFooter({ updatedAt }: { updatedAt: Date }) {
  return (
    <footer className="border-t border-white/10 bg-[#040b15]">
      <div className="mx-auto flex w-[min(100%-24px,1480px)] flex-col gap-3 py-7 text-xs font-semibold text-white/40 sm:w-[min(100%-40px,1480px)] md:flex-row md:items-center md:justify-between">
        <Link href="/" className="inline-flex items-center gap-3" aria-label="Terraqo, inicio">
          <TerraqoLogo tone="dark" variant="horizontal" alt="Terraqo" className="h-8 w-[125px]" />
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
        <h2 className="font-display text-xl font-black text-white">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-white/50">{description}</p>
      </div>
      {href && action ? <Link href={href} className="inline-flex items-center gap-2 text-sm font-black text-[#9fc4ff] transition hover:text-[#25c0d5]">{action} <ArrowRight className="h-4 w-4" /></Link> : null}
    </header>
  );
}

function CompanyTile({ label }: { label: string }) {
  return (
    <div className="grid min-h-[88px] place-items-center rounded-[11px] border border-[#488ac9]/22 bg-[#4374ba]/8 p-3 text-center">
      <span className="font-display text-sm font-black uppercase tracking-[0.02em] text-[#9fc4ff]">{label}</span>
    </div>
  );
}

function ValidationBadge({ checks, verified }: { checks: number; verified: boolean }) {
  if (verified) {
    return <span className="inline-flex items-center gap-2 rounded-[8px] border border-[#25c0d5]/20 bg-[#25c0d5]/10 px-3 py-2 text-xs font-black text-[#25c0d5]"><ShieldCheck className="h-4 w-4" />Experiencia validada</span>;
  }
  return <span className="inline-flex items-center gap-2 rounded-[8px] border border-[#d99a28]/20 bg-[#d99a28]/10 px-3 py-2 text-xs font-black text-[#f0b84b]"><Clock3 className="h-4 w-4" />{checks ? "Parcialmente validada" : "Pendiente de validación"}</span>;
}

function ToolChip({ label, tone = "light" }: { label: string; tone?: "light" | "dark" }) {
  return tone === "dark"
    ? <span className="rounded-full border border-[#488ac9]/25 bg-[#4374ba]/10 px-3 py-1.5 text-xs font-black text-[#9fc4ff]">{label}</span>
    : <span className="rounded-full border border-[#d8e0ec] bg-[#eef4f4] px-3 py-1.5 text-xs font-black text-[#425865]">{label}</span>;
}

function SkillBar({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[12px] border border-white/10 bg-[#07111f]/62 px-4 py-3">
      <span className="text-sm font-black text-white">{label}</span>
      <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-[#25c0d5]"><CheckCircle2 className="h-3.5 w-3.5" />Declarada</span>
    </div>
  );
}

function DocumentStatusCard({ document }: { document: { type: string; reviewStatus: string; uploadedAt: Date | null; reviewedAt: Date | null } }) {
  const item = DOCUMENT_COPY[document.type] || DOCUMENT_COPY.OTHER;
  const isVerified = document.reviewStatus === "VERIFIED";
  const Icon = item.icon;
  return (
    <div className="relative min-h-[112px] rounded-[12px] border border-white/10 bg-[#07111f]/66 p-3 text-center">
      <Icon className="mx-auto h-6 w-6 text-[#9fc4ff]" />
      <strong className="mt-2 block text-xs font-black text-white">{item.label}</strong>
      <span className={isVerified ? "mt-1 inline-flex text-[11px] font-black text-[#25c0d5]" : document.reviewStatus === "NOT_PROVIDED" ? "mt-1 inline-flex text-[11px] font-black text-white/30" : "mt-1 inline-flex text-[11px] font-black text-[#f0b84b]"}>
        {isVerified ? "Verificado" : document.reviewStatus === "NOT_PROVIDED" ? "No presentado" : "En revisión"}
      </span>
      <span className={isVerified ? "absolute bottom-2 right-2 text-[#25c0d5]" : document.reviewStatus === "NOT_PROVIDED" ? "absolute bottom-2 right-2 text-white/20" : "absolute bottom-2 right-2 text-[#f0b84b]"}>
        {isVerified ? <CheckCircle2 className="h-4 w-4" /> : document.reviewStatus === "NOT_PROVIDED" ? <Plus className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
      </span>
    </div>
  );
}

function VisualFrame({ src, label, compact = false }: { src?: string; label: string; compact?: boolean }) {
  return (
    <div className={compact ? "relative h-28 overflow-hidden bg-[#0e1a26]" : "relative h-36 overflow-hidden bg-[#0e1a26]"}>
      {src ? (
        <Image
          src={src}
          alt={label}
          fill
          sizes={compact ? "(max-width: 768px) 100vw, 280px" : "(max-width: 768px) 100vw, 420px"}
          unoptimized
          className="object-cover transition duration-500 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_45%_35%,rgba(72,138,201,0.24),transparent_35%),linear-gradient(135deg,#0e1a26,#07111f)]">
          <Gauge className="h-8 w-8 text-[#488ac9]" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#07111f]/75 via-[#07111f]/5 to-transparent" />
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[14px] border border-dashed border-[#488ac9]/30 bg-[#07111f]/60 p-6 text-sm text-white">
      <strong className="block font-display text-base font-black">{title}</strong>
      <p className="mt-2 leading-6 text-white/50">{description}</p>
    </div>
  );
}

