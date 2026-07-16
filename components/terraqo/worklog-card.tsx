import Link from "next/link";
import Image from "next/image";
import { BadgeCheck, Building2, CalendarDays, ExternalLink, FolderKanban, LockKeyhole } from "lucide-react";
import type { WorklogWithContext } from "@/lib/terraqo/worklog";
import { WorklogEngagement } from "@/components/terraqo/worklog-engagement";

const typeLabels: Record<string, string> = {
  FIELD_UPDATE: "Avance de trabajo",
  DELIVERABLE: "Entregable",
  PROBLEM_SOLVED: "Problema resuelto",
  LEARNING: "Aprendizaje tecnico",
  MILESTONE: "Hito alcanzado"
};

const evidenceLabels: Record<string, string> = {
  DECLARED: "Declarada por el profesional",
  LINKED: "Vinculada a proyecto",
  CONFIRMED: "Confirmada por la empresa",
  VERIFIED: "Verificada por Terraqo"
};

export function WorklogCard({ worklog, viewerId }: { worklog: WorklogWithContext; viewerId: string }) {
  const ownReaction = worklog.reactions.find((reaction) => reaction.userId === viewerId)?.type;
  return (
    <article className="rounded-lg border bg-white p-6 shadow-technical">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-[#063D63] font-display font-bold text-white">
            {(worklog.author.name || "T").slice(0, 1).toUpperCase()}
          </div>
          <div>
            <Link href={`/portal/profesionales/${worklog.professionalProfile.id}`} className="font-display text-lg font-bold hover:text-primary">{worklog.author.name || "Profesional Terraqo"}</Link>
            <p className="text-sm text-muted-foreground">{worklog.professionalProfile.headline || "Perfil profesional"}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1"><CalendarDays className="h-3.5 w-3.5" />{new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(worklog.occurredAt)}</span>
          <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1"><LockKeyhole className="h-3.5 w-3.5" />{worklog.visibility}</span>
        </div>
      </header>

      <div className="mt-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{typeLabels[worklog.type] || worklog.type}</p>
        <h2 className="mt-2 font-display text-2xl font-bold">{worklog.title}</h2>
        <p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-muted-foreground">{worklog.summary}</p>
        {worklog.outcome ? <div className="mt-4 border-l-2 border-primary bg-muted/35 px-4 py-3 text-sm"><strong>Resultado:</strong> {worklog.outcome}</div> : null}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {worklog.workspace ? <Link href={`/portal/empresas/${worklog.workspace.slug}`} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold hover:bg-muted"><Building2 className="h-3.5 w-3.5" />{worklog.workspace.brandName || worklog.workspace.name}</Link> : null}
        {worklog.project ? <span className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold"><FolderKanban className="h-3.5 w-3.5" />{worklog.project.title}</span> : null}
        <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary"><BadgeCheck className="h-3.5 w-3.5" />{evidenceLabels[worklog.evidenceStatus]}</span>
        {worklog.skills.map((skill) => <span key={skill} className="rounded-md bg-muted px-2.5 py-1 text-xs font-semibold">#{skill}</span>)}
      </div>

      {worklog.evidenceUrls.length ? <div className="mt-4 flex flex-wrap gap-2">{worklog.evidenceUrls.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><ExternalLink className="h-3.5 w-3.5" />Ver evidencia</a>)}</div> : null}

      {worklog.media.length ? <div className={`mt-5 grid gap-2 ${worklog.media.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
        {worklog.media.map((media, index) => <a key={media.id} href={`/api/terraqo/worklog/evidence/${media.id}`} target="_blank" rel="noreferrer" className={`relative overflow-hidden rounded-md border bg-muted ${worklog.media.length === 3 && index === 0 ? "col-span-2 aspect-[16/8]" : "aspect-[4/3]"}`}>
          <Image src={`/api/terraqo/worklog/evidence/${media.id}`} alt={`${worklog.title}, evidencia ${index + 1}`} fill sizes="(max-width: 768px) 100vw, 680px" className="object-cover transition duration-500 hover:scale-[1.02]" unoptimized />
        </a>)}
      </div> : null}

      {worklog.comments.length ? <div className="mt-5 space-y-2 border-t pt-4">{worklog.comments.slice().reverse().map((comment) => <div key={comment.id} className="rounded-md bg-muted/45 px-3 py-2 text-sm"><strong>{comment.author.name || "Profesional"}:</strong> {comment.body}</div>)}</div> : null}
      <div className="mt-5"><WorklogEngagement worklogId={worklog.id} currentReaction={ownReaction} reactionCount={worklog._count.reactions} commentCount={worklog._count.comments} /></div>
    </article>
  );
}
