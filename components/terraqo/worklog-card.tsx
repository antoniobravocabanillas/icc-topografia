import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarDays,
  ExternalLink,
  FolderKanban,
  LockKeyhole,
  MapPin,
} from "lucide-react";
import type { WorklogWithContext } from "@/lib/terraqo/worklog";
import { WorklogEngagement } from "@/components/terraqo/worklog-engagement";
import { WorklogValidationControl } from "@/components/terraqo/worklog-validation-control";
import { UserAvatar } from "@/components/terraqo/user-avatar";
import {
  WorklogContinuityControl,
  type WorklogContinuityOption,
} from "@/components/terraqo/worklog-continuity-control";

const typeLabels: Record<string, string> = {
  FIELD_UPDATE: "Avance de trabajo",
  DELIVERABLE: "Entregable",
  PROBLEM_SOLVED: "Problema resuelto",
  LEARNING: "Aprendizaje tecnico",
  MILESTONE: "Hito alcanzado",
};

const evidenceLabels: Record<string, string> = {
  DECLARED: "Declarada por el profesional",
  LINKED: "Vinculada a proyecto",
  CONFIRMED: "Confirmada por la empresa",
  VERIFIED: "Verificada por Terraqo",
};

const visibilityLabels: Record<string, string> = {
  PRIVATE: "Privada",
  WORKSPACE: "Workspace",
  COMMUNITY: "Comunidad",
  PUBLIC: "Publica",
};

const moderationLabels: Record<string, string> = {
  DECLARED: "Declarada",
  COMPLETE: "Completa con evidencia",
  VALIDATED: "Validada",
  STRONG_VERIFIED: "Validada con evidencia fuerte",
  PRIVATE_VALIDATED: "Privada validada",
  DUPLICATE: "En revisión por duplicado",
  REJECTED: "Rechazada",
  OBSERVED: "Observada",
};

export function WorklogCard({
  worklog,
  viewerId,
  continuityOptions = [],
}: {
  worklog: WorklogWithContext;
  viewerId: string;
  continuityOptions?: WorklogContinuityOption[];
}) {
  const ownReaction = worklog.reactions.find(
    (reaction) => reaction.userId === viewerId,
  )?.type;
  return (
    <article
      id={`worklog-${worklog.id}`}
      className="min-w-0 scroll-mt-28 rounded-2xl border bg-white p-4 shadow-technical sm:rounded-lg sm:p-6"
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <UserAvatar
            name={worklog.author.name || "Profesional Terraqo"}
            image={worklog.author.image}
            size="md"
            className="h-11 w-11 border-[#4374ba]/30"
          />
          <div>
            <Link
              href={`/portal/profesionales/${worklog.professionalProfile.id}`}
              className="font-display text-lg font-bold hover:text-primary"
            >
              {worklog.author.name || "Profesional Terraqo"}
            </Link>
            <p className="text-sm text-muted-foreground">
              {worklog.professionalProfile.headline || "Perfil profesional"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1">
            <CalendarDays className="h-3.5 w-3.5" />
            {new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(
              worklog.occurredAt,
            )}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1">
            <LockKeyhole className="h-3.5 w-3.5" />
            {visibilityLabels[worklog.visibility] || "Privada"}
          </span>
        </div>
      </header>

      <div className="mt-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
          {typeLabels[worklog.type] || worklog.type}
        </p>
        <h2 className="mt-2 break-words font-display text-xl font-bold sm:text-2xl">
          {worklog.title}
        </h2>
        <p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-muted-foreground">
          {worklog.summary}
        </p>
        {worklog.outcome ? (
          <div className="mt-4 border-l-2 border-primary bg-muted/35 px-4 py-3 text-sm">
            <strong>Resultado:</strong> {worklog.outcome}
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {worklog.workspace ? (
          <Link
            href={`/portal/empresas/${worklog.workspace.slug}`}
            className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold hover:bg-muted"
          >
            <Building2 className="h-3.5 w-3.5" />
            {worklog.workspace.brandName || worklog.workspace.name}
          </Link>
        ) : null}
        {worklog.project ? (
          <span className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold">
            <FolderKanban className="h-3.5 w-3.5" />
            {worklog.project.title}
          </span>
        ) : null}
        {worklog.locationLabel || worklog.locationCapturedAt ? (
          <span className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold">
            <MapPin className="h-3.5 w-3.5" />
            {worklog.locationLabel || "Ubicación registrada"}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
          <BadgeCheck className="h-3.5 w-3.5" />
          {evidenceLabels[worklog.evidenceStatus]}
        </span>
        <span className="inline-flex items-center gap-1 rounded-md bg-[#edf4fd] px-2.5 py-1 text-xs font-bold text-[#4374ba]">
          {moderationLabels[worklog.moderationStatus] ||
            worklog.moderationStatus}
        </span>
        {worklog.skills.map((skill) => (
          <span
            key={skill}
            className="rounded-md bg-muted px-2.5 py-1 text-xs font-semibold"
          >
            #{skill}
          </span>
        ))}
      </div>

      {worklog.previousWorklog || worklog.nextWorklog ? (
        <nav
          aria-label="Continuidad del trabajo"
          className="mt-5 flex flex-col gap-2 border-y py-3 text-xs font-semibold sm:flex-row sm:items-center sm:justify-between"
        >
          {worklog.previousWorklog ? (
            <a
              href={`/portal/bitacora?fecha=${worklog.previousWorklog.occurredAt.toISOString().slice(0, 10)}#worklog-${worklog.previousWorklog.id}`}
              className="inline-flex items-center gap-2 text-primary hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Anterior:{" "}
              {worklog.previousWorklog.title}
            </a>
          ) : (
            <span />
          )}
          {worklog.nextWorklog ? (
            <a
              href={`/portal/bitacora?fecha=${worklog.nextWorklog.occurredAt.toISOString().slice(0, 10)}#worklog-${worklog.nextWorklog.id}`}
              className="inline-flex items-center gap-2 text-primary hover:underline sm:justify-end"
            >
              Siguiente: {worklog.nextWorklog.title}{" "}
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </nav>
      ) : null}

      {worklog.evidenceUrls.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {worklog.evidenceUrls.map((url) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Ver evidencia
            </a>
          ))}
        </div>
      ) : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <TrustMetric label="Calidad" value={`${worklog.qualityScore}%`} />
        <TrustMetric
          label="Confianza aportada"
          value={`+${worklog.trustScoreAwarded}`}
        />
        <TrustMetric
          label="TQ en espera"
          value={`+${worklog.tqPointsAwarded}`}
        />
      </div>

      {worklog.media.length ? (
        <div
          className={`mt-5 grid gap-2 ${worklog.media.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}
        >
          {worklog.media.map((media, index) => (
            <a
              key={media.id}
              href={`/api/terraqo/worklog/evidence/${media.id}`}
              target="_blank"
              rel="noreferrer"
              className={`relative overflow-hidden rounded-md border bg-muted ${worklog.media.length === 3 && index === 0 ? "col-span-2 aspect-[16/8]" : "aspect-[4/3]"}`}
            >
              <Image
                src={`/api/terraqo/worklog/evidence/${media.id}`}
                alt={`${worklog.title}, evidencia ${index + 1}`}
                fill
                sizes="(max-width: 768px) 100vw, 680px"
                className="object-cover transition duration-500 hover:scale-[1.02]"
                unoptimized
              />
            </a>
          ))}
        </div>
      ) : null}

      {worklog.comments.length ? (
        <div className="mt-5 space-y-2 border-t pt-4">
          {worklog.comments
            .slice()
            .reverse()
            .map((comment) => (
              <div
                key={comment.id}
                className="rounded-md bg-muted/45 px-3 py-2 text-sm"
              >
                <strong>{comment.author.name || "Profesional"}:</strong>{" "}
                {comment.body}
              </div>
            ))}
        </div>
      ) : null}
      {worklog.authorId === viewerId && worklog.workspaceId ? (
        <div className="mt-5 border-t pt-4">
          <WorklogValidationControl
            worklogId={worklog.id}
            endpoint={`/api/terraqo/field-verification?workspaceId=${worklog.workspaceId}`}
            validations={worklog.validations}
          />
        </div>
      ) : null}
      {worklog.authorId === viewerId ? (
        <WorklogContinuityControl
          worklogId={worklog.id}
          occurredAt={worklog.occurredAt.toISOString()}
          previousWorklogId={worklog.previousWorklog?.id || null}
          nextWorklogId={worklog.nextWorklog?.id || null}
          options={continuityOptions}
        />
      ) : null}
      <div className="mt-5">
        <WorklogEngagement
          worklogId={worklog.id}
          currentReaction={ownReaction}
          reactionCount={worklog._count.reactions}
          commentCount={worklog._count.comments}
        />
      </div>
    </article>
  );
}

function TrustMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-2">
      <span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </span>
      <strong className="mt-1 block text-sm text-primary">{value}</strong>
    </div>
  );
}
