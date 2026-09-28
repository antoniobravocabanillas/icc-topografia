import Image from "next/image";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import type { ElementType } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  FileCheck2,
  FileText,
  FolderKanban,
  MapPin,
  MessageSquareText,
  NotebookPen,
  ShieldCheck,
  Sparkles,
  UserRoundPlus,
} from "lucide-react";

import { FieldVerificationPanel } from "@/components/terraqo/field-verification-panel";
import { Button } from "@/components/ui/button";
import { terraqoDomains } from "@/lib/terraqo-domains";
import { worklogInclude } from "@/lib/terraqo/worklog";

export type ProfessionalDashboardProfile =
  Prisma.TerraqoProfessionalProfileGetPayload<{
    include: {
      user: { select: { name: true; email: true; image: true } };
      experiences: {
        include: {
          project: {
            select: {
              title: true;
              slug: true;
              location: true;
              images: { select: { url: true } };
            };
          };
        };
      };
      affiliations: true;
      applications: {
        include: {
          workspace: { select: { name: true } };
          jobPost: { select: { title: true } };
        };
      };
      documents: {
        select: {
          id: true;
          type: true;
          fileName: true;
          contentType: true;
          size: true;
          reviewStatus: true;
          reviewNote: true;
          uploadedAt: true;
        };
      };
      worklogs: { include: typeof worklogInclude };
    };
  }>;

export type ProfessionalDashboardData = {
  unreadMessages: number;
  pendingTeamInvitations: number;
  pendingExperienceValidations: number;
  weekWorklogs: number;
  weekValidatedWorklogs: number;
  weekTrust: number;
  newConnections: number;
  totalWorklogs: number;
  verifiedExperiences: number;
  validationBackings: number;
  opportunities: Array<{
    id: string;
    title: string;
    company: string;
    location: string | null;
    modality: string | null;
    relatedTags: string[];
  }>;
  networkUpdates: Array<{
    id: string;
    kind: "evidence" | "opportunity" | "validation" | "conversation";
    actor: string;
    action: string;
    title: string;
    context: string | null;
    date: Date;
    href: string;
  }>;
};

const statusCopy = {
  AVAILABLE: "Disponible",
  WORKING: "Trabajando actualmente",
  OPEN_TO_PROJECTS: "Disponible para proyectos",
  NOT_AVAILABLE: "No disponible",
} as const;

const planCopy = {
  FREE: "Free",
  BASIC: "Básico",
  PROFESSIONAL: "Profesional",
  PREMIUM: "Premium",
  ENTERPRISE: "Enterprise",
} as const;

const updateIcon = {
  evidence: NotebookPen,
  opportunity: BriefcaseBusiness,
  validation: BadgeCheck,
  conversation: MessageSquareText,
} as const;

function completion(profile: ProfessionalDashboardProfile) {
  const values = [
    profile.user.name,
    profile.user.image,
    profile.headline,
    profile.bio,
    profile.city || profile.locationCity,
    profile.yearsExperience !== null,
    profile.professionalCategories.length,
    profile.specialties.length,
    profile.equipment.length || profile.software.length,
    profile.documents.some((document) => document.type === "CV"),
    profile.identityVerificationStatus === "VERIFIED",
  ];
  return Math.round((values.filter(Boolean).length / values.length) * 100);
}

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hour12: false,
      timeZone: "America/Lima",
    }).format(new Date()),
  );
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

function relativeDate(date: Date) {
  const elapsed = date.getTime() - Date.now();
  const hours = Math.round(elapsed / 3_600_000);
  if (Math.abs(hours) < 24) {
    return new Intl.RelativeTimeFormat("es", { numeric: "auto" }).format(
      hours,
      "hour",
    );
  }
  const days = Math.round(elapsed / 86_400_000);
  return new Intl.RelativeTimeFormat("es", { numeric: "auto" }).format(
    days,
    "day",
  );
}

function SectionHeading({
  title,
  href,
  action,
}: {
  title: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="font-display text-xl font-bold tracking-[-0.02em] text-[#0e1a26] sm:text-[1.35rem]">
        {title}
      </h2>
      {href && action ? (
        <Link
          href={href}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-bold text-[#1768b0] transition hover:bg-[#edf5ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1768b0] focus-visible:ring-offset-2"
        >
          {action} <ArrowRight className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}

function AttentionCard({
  icon: Icon,
  value,
  label,
  href,
  tone,
}: {
  icon: ElementType;
  value: number;
  label: string;
  href: string;
  tone: "red" | "blue" | "teal" | "amber";
}) {
  const tones = {
    red: "border-[#f6d4d2] bg-[#fff7f6] text-[#b42318]",
    blue: "border-[#dbe9fb] bg-[#f5f9ff] text-[#1768b0]",
    teal: "border-[#d6eee9] bg-[#f2fbf8] text-[#087b70]",
    amber: "border-[#f3e5bd] bg-[#fffbef] text-[#9a6700]",
  };
  return (
    <Link
      href={href}
      className={`group flex min-h-[92px] items-center gap-3 rounded-xl border p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(14,26,38,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1768b0] focus-visible:ring-offset-2 ${tones[tone]}`}
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/85 shadow-sm">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block font-display text-2xl leading-none text-[#0e1a26]">
          {value}
        </strong>
        <span className="mt-1 block text-xs font-semibold leading-4 text-[#52677a]">
          {label}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function WeeklyMetric({
  icon: Icon,
  value,
  label,
}: {
  icon: ElementType;
  value: string | number;
  label: string;
}) {
  return (
    <div className="flex min-h-[78px] items-center gap-3 rounded-xl border border-[#e1e8ef] bg-[#fbfcfd] px-4 py-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e9f4ff] text-[#1768b0]">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span>
        <strong className="block font-display text-xl leading-none text-[#0e1a26]">
          {value}
        </strong>
        <span className="mt-1 block text-xs font-medium text-[#607083]">
          {label}
        </span>
      </span>
    </div>
  );
}

function WorklogPreview({
  worklog,
}: {
  worklog: ProfessionalDashboardProfile["worklogs"][number];
}) {
  const media = worklog.media[0];
  const validated =
    worklog.evidenceStatus === "VERIFIED" ||
    worklog.validations.some((validation) => validation.status === "APPROVED");
  return (
    <Link
      href="/portal/bitacora"
      className="group grid min-h-[138px] overflow-hidden rounded-xl border border-[#dfe7ef] bg-white transition duration-200 hover:-translate-y-0.5 hover:border-[#b9d4ee] hover:shadow-[0_16px_34px_rgba(14,26,38,0.09)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1768b0] focus-visible:ring-offset-2 sm:grid-cols-[132px_minmax(0,1fr)]"
    >
      <div className="relative min-h-36 overflow-hidden bg-[linear-gradient(145deg,#dce7ef,#edf3f6)] sm:min-h-0">
        {media ? (
          <Image
            src={`/api/terraqo/worklog/evidence/${media.id}`}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, 132px"
            className="object-cover transition duration-500 group-hover:scale-[1.03]"
            unoptimized
          />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-[#6b8497]">
            <NotebookPen className="h-7 w-7" aria-hidden="true" />
          </span>
        )}
      </div>
      <div className="min-w-0 p-4">
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#1768b0]">
          <span>Bitácora</span>
          <span className="text-[#8392a1]">· {relativeDate(worklog.occurredAt)}</span>
          {validated ? (
            <span className="rounded-full bg-[#e8f7f1] px-2 py-1 text-[#087b70]">
              Validada
            </span>
          ) : null}
        </div>
        <h3 className="mt-2 line-clamp-2 font-display text-base font-bold leading-5 text-[#0e1a26]">
          {worklog.title}
        </h3>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#607083]">
          {worklog.locationLabel ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              {worklog.locationLabel}
            </span>
          ) : null}
          {worklog.workspace ? <span>{worklog.workspace.brandName || worklog.workspace.name}</span> : null}
        </div>
      </div>
    </Link>
  );
}

export function ProfessionalDashboard({
  profile,
  workspaceId,
  dashboard,
}: {
  profile: ProfessionalDashboardProfile;
  workspaceId?: string | null;
  dashboard: ProfessionalDashboardData;
}) {
  const displayName = profile.user.name || profile.user.email;
  const firstName = displayName.trim().split(/\s+/)[0] || "profesional";
  const percent = completion(profile);
  const hasCv = profile.documents.some((document) => document.type === "CV");
  const identityComplete = profile.identityVerificationStatus === "VERIFIED";
  const publicCvHref = profile.username
    ? `${terraqoDomains.public}/cv/${profile.username}`
    : null;
  const pendingDocuments = Number(!hasCv) + Number(!identityComplete);
  const attentionTotal =
    dashboard.pendingExperienceValidations +
    dashboard.unreadMessages +
    dashboard.pendingTeamInvitations +
    pendingDocuments;

  const draftApplication = profile.applications.find(
    (application) => application.status === "DRAFT",
  );
  const continuation = [
    draftApplication
      ? {
          icon: BriefcaseBusiness,
          title: "Postulación sin enviar",
          detail: draftApplication.jobPost?.title || "Oportunidad profesional",
          href: "/portal/postulaciones",
          tone: "bg-[#fff3ef] text-[#b54708]",
        }
      : null,
    dashboard.pendingExperienceValidations
      ? {
          icon: ShieldCheck,
          title: "Experiencia pendiente",
          detail: "Revisa el estado de tu solicitud de validación",
          href: "/portal/experiencias",
          tone: "bg-[#eef5ff] text-[#1768b0]",
        }
      : null,
    pendingDocuments
      ? {
          icon: FileCheck2,
          title: "Documentación por completar",
          detail: !hasCv
            ? "Falta incorporar tu CV profesional"
            : "Falta completar la verificación de identidad",
          href: "/portal/documentos",
          tone: "bg-[#eefaf7] text-[#087b70]",
        }
      : null,
    percent < 100
      ? {
          icon: CircleUserRound,
          title: "Perfil por completar",
          detail: `Tu identidad profesional está al ${percent}%`,
          href: "/portal/perfil",
          tone: "bg-[#f3f0ff] text-[#6f4bb7]",
        }
      : null,
  ].filter(Boolean).slice(0, 2) as Array<{
    icon: ElementType;
    title: string;
    detail: string;
    href: string;
    tone: string;
  }>;

  return (
    <div className="min-w-0 space-y-5 py-5 lg:py-7">
      <section className="relative overflow-hidden rounded-2xl border border-[#163b54] bg-[radial-gradient(circle_at_82%_10%,rgba(37,192,213,0.16),transparent_30%),linear-gradient(125deg,#081b2b_0%,#0c3143_62%,#103b45_100%)] px-5 py-6 text-white shadow-[0_20px_48px_rgba(8,27,43,0.16)] sm:px-7 lg:px-8">
        <div className="absolute inset-y-0 right-0 hidden w-[44%] opacity-35 lg:block [background-image:repeating-radial-gradient(ellipse_at_100%_50%,transparent_0,transparent_18px,rgba(102,220,224,0.18)_19px,transparent_20px)]" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#67dce1]">Tu Terraqo</p>
            <h1 className="mt-2 font-display text-[clamp(1.7rem,4vw,2.35rem)] font-bold tracking-[-0.035em]">{greeting()}, {firstName}.</h1>
            <p className="mt-1 text-sm font-medium text-white/68">Workspace personal · {planCopy[profile.planTier] || profile.planTier}</p>
          </div>

          <div className="grid flex-1 grid-cols-2 gap-3 xl:max-w-[760px] xl:grid-cols-4">
            <div className="flex items-center gap-3 border-white/12 xl:border-l xl:pl-5"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[#55d6df]/45 bg-[#55d6df]/10 font-display text-sm font-bold text-[#7de7e7]">{percent}%</span><span className="text-xs leading-4 text-white/72"><strong className="block text-sm text-white">Perfil</strong>completo</span></div>
            <div className="flex items-center gap-3 border-white/12 xl:border-l xl:pl-5"><BriefcaseBusiness className="h-5 w-5 shrink-0 text-[#62b8ff]" aria-hidden="true" /><span className="text-xs leading-4 text-white/72"><strong className="block text-sm text-white">{dashboard.verifiedExperiences}</strong>experiencias verificadas</span></div>
            <div className="flex items-center gap-3 border-white/12 xl:border-l xl:pl-5"><NotebookPen className="h-5 w-5 shrink-0 text-[#62b8ff]" aria-hidden="true" /><span className="text-xs leading-4 text-white/72"><strong className="block text-sm text-white">{dashboard.totalWorklogs}</strong>evidencias registradas</span></div>
            <div className="flex items-center gap-3 border-white/12 xl:border-l xl:pl-5"><CheckCircle2 className="h-5 w-5 shrink-0 text-[#65d8b1]" aria-hidden="true" /><span className="text-xs leading-4 text-white/72"><strong className="block text-sm text-white">{statusCopy[profile.status]}</strong>estado profesional</span></div>
          </div>

          <Button asChild variant="outline" className="min-h-11 shrink-0 border-white/35 bg-white/[0.08] text-white hover:bg-white hover:text-[#0e1a26]"><Link href="/portal/perfil">Completar perfil <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
        </div>
      </section>

      <section className="rounded-2xl border border-[#dce5ed] bg-white p-4 shadow-[0_12px_34px_rgba(14,26,38,0.05)] sm:p-5">
        <div className="mb-4 flex items-center gap-2"><h2 className="font-display text-xl font-bold tracking-[-0.02em] text-[#0e1a26]">Requiere tu atención</h2>{attentionTotal ? <span className="grid h-6 min-w-6 place-items-center rounded-full bg-[#d92d20] px-1.5 text-xs font-bold text-white" aria-label={`${attentionTotal} pendientes`}>{attentionTotal}</span> : null}</div>
        {attentionTotal ? (
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            {dashboard.pendingExperienceValidations ? <AttentionCard icon={FileCheck2} value={dashboard.pendingExperienceValidations} label="Experiencia esperando validación" href="/portal/experiencias" tone="red" /> : null}
            {dashboard.unreadMessages ? <AttentionCard icon={MessageSquareText} value={dashboard.unreadMessages} label="Mensajes nuevos" href="/portal/mensajes" tone="blue" /> : null}
            {dashboard.pendingTeamInvitations ? <AttentionCard icon={FolderKanban} value={dashboard.pendingTeamInvitations} label="Invitaciones a equipo o proyecto" href="/portal/equipos" tone="teal" /> : null}
            {pendingDocuments ? <AttentionCard icon={FileText} value={pendingDocuments} label="Documentos pendientes" href="/portal/documentos" tone="amber" /> : null}
          </div>
        ) : <div className="flex min-h-[86px] items-center gap-3 rounded-xl border border-[#d7eee6] bg-[#f4fbf8] px-4 py-3 text-sm text-[#315d52]"><CheckCircle2 className="h-5 w-5 text-[#087b70]" aria-hidden="true" />No tienes acciones urgentes. Tu espacio está al día.</div>}
      </section>

      <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_350px]">
        <div className="min-w-0 space-y-5">
          {workspaceId ? <FieldVerificationPanel endpoint={`/api/terraqo/field-verification?workspaceId=${workspaceId}`} compact /> : <section className="flex flex-col gap-3 rounded-2xl border border-[#dce5ed] bg-white p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-[#0e1a26]">Control de campo por activar</p><p className="mt-1 text-sm text-[#607083]">La jornada y la geolocalización se habilitan cuando una empresa te asigna un proyecto.</p></div><Button asChild variant="outline"><Link href="/portal/perfil">Vincular empresa</Link></Button></section>}

          <section className="rounded-2xl border border-[#dce5ed] bg-white p-4 shadow-[0_12px_34px_rgba(14,26,38,0.05)] sm:p-5">
            <SectionHeading title="Tu actividad esta semana" href="/portal/bitacora" action="Ver historial" />
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <WeeklyMetric icon={NotebookPen} value={dashboard.weekWorklogs} label="Bitácoras registradas" />
              <WeeklyMetric icon={ShieldCheck} value={dashboard.weekValidatedWorklogs} label="Evidencias validadas" />
              <WeeklyMetric icon={Sparkles} value={`+${dashboard.weekTrust}`} label="Confianza aportada" />
              <WeeklyMetric icon={UserRoundPlus} value={dashboard.newConnections} label="Nuevas conexiones" />
            </div>
            {profile.worklogs.length ? <div className="mt-4 grid gap-3 lg:grid-cols-2">{profile.worklogs.slice(0, 2).map((worklog) => <WorklogPreview key={worklog.id} worklog={worklog} />)}</div> : <div className="mt-4 flex min-h-28 flex-col items-start justify-center rounded-xl border border-dashed border-[#cbd7e2] bg-[#fbfcfd] p-5"><p className="font-semibold text-[#0e1a26]">Tu trabajo todavía no tiene registros.</p><Link href="/portal/bitacora" className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-bold text-[#1768b0]">Registrar primera bitácora <ArrowRight className="h-4 w-4" /></Link></div>}
          </section>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="rounded-2xl border border-[#dce5ed] bg-white p-4 shadow-[0_12px_34px_rgba(14,26,38,0.05)] sm:p-5">
              <SectionHeading title="Ahora en tu red" href="/portal/red" action="Explorar la red" />
              <div className="mt-3 divide-y divide-[#e7edf2]">
                {dashboard.networkUpdates.map((update) => {
                  const Icon = updateIcon[update.kind];
                  return <Link key={`${update.kind}-${update.id}`} href={update.href} className="group flex min-h-[72px] items-start gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1768b0] focus-visible:ring-offset-2"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#edf5ff] text-[#1768b0]"><Icon className="h-4 w-4" aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="block text-sm leading-5 text-[#52677a]"><strong className="text-[#0e1a26]">{update.actor}</strong> {update.action}</span><span className="mt-0.5 block truncate text-xs font-semibold text-[#1768b0]">{update.title}{update.context ? ` · ${update.context}` : ""}</span></span><span className="shrink-0 text-[11px] text-[#8392a1]">{relativeDate(update.date)}</span></Link>;
                })}
                {!dashboard.networkUpdates.length ? <p className="py-8 text-sm leading-6 text-[#607083]">Conecta con profesionales y empresas para ver actividad relevante en este espacio.</p> : null}
              </div>
            </section>

            <section className="rounded-2xl border border-[#dce5ed] bg-white p-4 shadow-[0_12px_34px_rgba(14,26,38,0.05)] sm:p-5">
              <SectionHeading title="Oportunidades para ti" href="/portal/oportunidades" action="Ver todas" />
              <div className="mt-3 divide-y divide-[#e7edf2]">
                {dashboard.opportunities.map((opportunity) => <Link key={opportunity.id} href="/portal/oportunidades" className="group flex min-h-[86px] items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1768b0] focus-visible:ring-offset-2"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#dce5ed] bg-white text-[#1768b0]"><Building2 className="h-5 w-5" aria-hidden="true" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-[#0e1a26]">{opportunity.title}</strong><span className="mt-0.5 block truncate text-xs text-[#607083]">{opportunity.company}{opportunity.location ? ` · ${opportunity.location}` : ""}</span><span className="mt-2 flex flex-wrap gap-1.5">{opportunity.relatedTags.slice(0, 2).map((tag) => <span key={tag} className="rounded-full bg-[#edf5ff] px-2 py-0.5 text-[10px] font-bold text-[#1768b0]">{tag}</span>)}{opportunity.modality ? <span className="rounded-full bg-[#eef8f5] px-2 py-0.5 text-[10px] font-bold text-[#087b70]">{opportunity.modality}</span> : null}</span></span><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f3f7fb] text-[#1768b0] transition group-hover:bg-[#1768b0] group-hover:text-white"><ArrowRight className="h-4 w-4" /></span></Link>)}
                {!dashboard.opportunities.length ? <p className="py-8 text-sm leading-6 text-[#607083]">No hay oportunidades abiertas relacionadas con tu perfil en este momento.</p> : null}
              </div>
            </section>
          </div>
        </div>

        <aside className="grid gap-5 md:grid-cols-2 2xl:grid-cols-1">
          <section className="rounded-2xl border border-[#dce5ed] bg-white p-5 shadow-[0_12px_34px_rgba(14,26,38,0.05)]">
            <SectionHeading title="Tu identidad Terraqo" href="/portal/perfil" action="Ver perfil" />
            <div className="mt-4 grid items-center gap-5 sm:grid-cols-[1fr_116px] md:grid-cols-1 2xl:grid-cols-[1fr_116px]">
              <div className="space-y-3">
                {[
                  [BadgeCheck, "Identidad", identityComplete ? "Perfil verificado" : "Pendiente de verificar"],
                  [BriefcaseBusiness, "Experiencia", `${dashboard.verifiedExperiences} verificadas`],
                  [NotebookPen, "Evidencias", `${dashboard.totalWorklogs} registradas`],
                  [Building2, "Respaldos", `${dashboard.validationBackings} validaciones`],
                ].map(([Icon, label, value]) => { const ItemIcon = Icon as ElementType; return <div key={String(label)} className="flex items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#eef8f5] text-[#087b70]"><ItemIcon className="h-4 w-4" aria-hidden="true" /></span><span className="text-xs text-[#607083]"><strong className="block text-sm text-[#0e1a26]">{String(label)}</strong>{String(value)}</span></div>; })}
              </div>
              <div className="justify-self-center text-center"><div className="grid h-24 w-24 place-items-center rounded-full" style={{ background: `conic-gradient(#087b70 ${percent * 3.6}deg, #dfe7ef 0deg)` }}><div className="grid h-[72px] w-[72px] place-items-center rounded-full bg-white font-display text-xl font-bold text-[#0e1a26]">{percent}%</div></div><p className="mt-2 text-xs font-semibold text-[#52677a]">Nivel de avance</p></div>
            </div>
          </section>

          <section className="rounded-2xl border border-[#dce5ed] bg-white p-5 shadow-[0_12px_34px_rgba(14,26,38,0.05)]">
            <SectionHeading title="Continuar donde lo dejaste" />
            <div className="mt-3 space-y-2">
              {continuation.map((item) => { const Icon = item.icon; return <Link key={item.title} href={item.href} className="group flex min-h-[70px] items-center gap-3 rounded-xl border border-[#e2e9ef] p-3 transition hover:border-[#bfd5e8] hover:bg-[#fbfdff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1768b0] focus-visible:ring-offset-2"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${item.tone}`}><Icon className="h-5 w-5" aria-hidden="true" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-[#0e1a26]">{item.title}</strong><span className="mt-0.5 block line-clamp-2 text-xs leading-4 text-[#607083]">{item.detail}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-[#1768b0] transition-transform group-hover:translate-x-0.5" /></Link>; })}
              {!continuation.length ? <div className="flex min-h-[76px] items-center gap-3 rounded-xl bg-[#f4fbf8] p-4 text-sm text-[#315d52]"><CheckCircle2 className="h-5 w-5 text-[#087b70]" />No tienes tareas interrumpidas.</div> : null}
            </div>
          </section>

          <section className="relative overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_85%_15%,rgba(75,183,229,0.32),transparent_28%),linear-gradient(145deg,#071827,#0c3440)] p-6 text-white shadow-[0_20px_48px_rgba(8,27,43,0.18)] md:col-span-2 2xl:col-span-1">
            <div className="absolute -bottom-10 -right-10 h-40 w-40 rounded-full border border-white/10" /><div className="absolute -bottom-4 -right-4 h-28 w-28 rounded-full border border-white/10" />
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#67dce1]">Siguiente nivel</p><h2 className="mt-3 max-w-xs font-display text-2xl font-bold leading-[1.08] tracking-[-0.03em]">Más proyectos. Más validaciones. Mayor impacto.</h2><p className="mt-3 max-w-sm text-sm leading-6 text-white/70">Conecta tu evidencia con empresas y oportunidades que necesitan capacidades como las tuyas.</p>
            <Button asChild className="relative mt-5 min-h-11 bg-white text-[#0e1a26] hover:bg-[#eaf5f7]"><Link href="/portal/oportunidades">Explorar oportunidades <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
            {publicCvHref ? <Link href={publicCvHref} target="_blank" className="relative mt-3 flex min-h-11 items-center gap-2 text-sm font-semibold text-[#88e7e8]">Ver mi CV público <ArrowRight className="h-4 w-4" /></Link> : null}
          </section>
        </aside>
      </div>
    </div>
  );
}
