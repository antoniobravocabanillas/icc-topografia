import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  Clock3,
  FileText,
  Fingerprint,
  MapPin,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { requireProfessionalPortal } from "@/lib/terraqo/professional-portal";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Mis jornadas | Portal Terraqo",
  description: "Historial verificable de entradas, salidas y actividad profesional asociada.",
};

type PageProps = {
  searchParams: Promise<{
    periodo?: string;
    proyecto?: string;
    empresa?: string;
  }>;
};

type AttendanceEvent = {
  id: string;
  projectId: string;
  workspaceId: string;
  type: "CHECK_IN" | "CHECK_OUT";
  capturedAt: Date;
  credentialId: string | null;
  accuracyMeters: number;
  distanceMeters: number;
  project: { title: string; location: string | null };
  workspace: { name: string; brandName: string | null };
};

type Session = {
  id: string;
  projectId: string;
  workspaceId: string;
  entry: AttendanceEvent;
  exit: AttendanceEvent | null;
};

const dateFormatter = new Intl.DateTimeFormat("es-PE", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "America/Lima",
});

const timeFormatter = new Intl.DateTimeFormat("es-PE", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Lima",
});

function durationLabel(entry: Date, exit: Date | null) {
  if (!exit) return "En curso";
  const totalMinutes = Math.max(0, Math.floor((exit.getTime() - entry.getTime()) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours} h ${minutes.toString().padStart(2, "0")} min` : `${minutes} min`;
}

function groupSessions(events: AttendanceEvent[]) {
  const openByProject = new Map<string, AttendanceEvent>();
  const sessions: Session[] = [];

  for (const event of events) {
    const key = `${event.workspaceId}:${event.projectId}`;
    if (event.type === "CHECK_IN") {
      const previous = openByProject.get(key);
      if (previous) {
        sessions.push({ id: previous.id, projectId: previous.projectId, workspaceId: previous.workspaceId, entry: previous, exit: null });
      }
      openByProject.set(key, event);
      continue;
    }

    const entry = openByProject.get(key);
    if (entry) {
      sessions.push({ id: entry.id, projectId: entry.projectId, workspaceId: entry.workspaceId, entry, exit: event });
      openByProject.delete(key);
    }
  }

  for (const entry of openByProject.values()) {
    sessions.push({ id: entry.id, projectId: entry.projectId, workspaceId: entry.workspaceId, entry, exit: null });
  }

  return sessions.sort((a, b) => b.entry.capturedAt.getTime() - a.entry.capturedAt.getTime());
}

export default async function AttendanceHistoryPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const { session, profile, memberships } = await requireProfessionalPortal();
  const workspaceIds = memberships.map((membership) => membership.workspaceId);
  const period = ["semana", "mes", "todo"].includes(params.periodo || "") ? params.periodo! : "mes";
  const from = period === "todo" ? undefined : new Date(Date.now() - (period === "semana" ? 7 : 31) * 86_400_000);
  const workspaceId = workspaceIds.includes(params.empresa || "") ? params.empresa : undefined;

  const assignedProjects = workspaceIds.length
    ? await prisma.project.findMany({
        where: {
          terraqoWorkspaceId: { in: workspaceIds },
          deletedAt: null,
          attendanceEvents: { some: { userId: session.user.id } },
        },
        select: { id: true, title: true, terraqoWorkspaceId: true },
        orderBy: { title: "asc" },
      })
    : [];
  const projectId = assignedProjects.some((project) => project.id === params.proyecto) ? params.proyecto : undefined;

  const events = workspaceIds.length
    ? await prisma.terraqoAttendanceEvent.findMany({
        where: {
          userId: session.user.id,
          professionalProfileId: profile.id,
          workspaceId: workspaceId || { in: workspaceIds },
          projectId,
          status: "ACCEPTED",
          capturedAt: from ? { gte: from } : undefined,
        },
        select: {
          id: true,
          projectId: true,
          workspaceId: true,
          type: true,
          capturedAt: true,
          credentialId: true,
          accuracyMeters: true,
          distanceMeters: true,
          project: { select: { title: true, location: true } },
          workspace: { select: { name: true, brandName: true } },
        },
        orderBy: { capturedAt: "asc" },
        take: 500,
      })
    : [];

  const sessions = groupSessions(events as AttendanceEvent[]);
  const firstEntry = sessions.at(-1)?.entry.capturedAt;
  const worklogs = sessions.length
    ? await prisma.terraqoWorklogEntry.findMany({
        where: {
          authorId: session.user.id,
          professionalProfileId: profile.id,
          deletedAt: null,
          projectId: { in: Array.from(new Set(sessions.map((item) => item.projectId))) },
          occurredAt: firstEntry ? { gte: firstEntry } : undefined,
        },
        select: { id: true, title: true, occurredAt: true, projectId: true, evidenceStatus: true },
        orderBy: { occurredAt: "desc" },
      })
    : [];

  const completed = sessions.filter((item) => item.exit);
  const totalMinutes = completed.reduce(
    (sum, item) => sum + Math.max(0, Math.floor((item.exit!.capturedAt.getTime() - item.entry.capturedAt.getTime()) / 60_000)),
    0,
  );

  return (
    <main className="min-w-0 space-y-6 py-5 sm:py-8">
      <div>
        <Link href="/portal#jornada-de-hoy" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#1768b0] transition hover:text-[#0d4f8b]"><ArrowLeft className="h-4 w-4" />Volver a Inicio</Link>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#087b70]">Actividad de campo verificable</p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-[-0.035em] text-[#0e1a26] sm:text-4xl">Tus jornadas, con contexto.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#607083] sm:text-base">Entradas, salidas y trabajo documentado reunidos en una misma línea de tiempo profesional.</p>
          </div>
          <Button asChild className="min-h-11 w-full sm:w-auto"><Link href="/portal/bitacora">Registrar bitácora <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Resumen del periodo">
        <article className="rounded-2xl border border-[#dce5ed] bg-white p-4"><CalendarDays className="h-5 w-5 text-[#1768b0]" /><strong className="mt-3 block font-display text-2xl text-[#0e1a26]">{sessions.length}</strong><span className="text-sm text-[#607083]">jornadas registradas</span></article>
        <article className="rounded-2xl border border-[#dce5ed] bg-white p-4"><Clock3 className="h-5 w-5 text-[#087b70]" /><strong className="mt-3 block font-display text-2xl text-[#0e1a26]">{Math.floor(totalMinutes / 60)} h {totalMinutes % 60} min</strong><span className="text-sm text-[#607083]">tiempo completado</span></article>
        <article className="rounded-2xl border border-[#dce5ed] bg-white p-4"><BadgeCheck className="h-5 w-5 text-[#087b70]" /><strong className="mt-3 block font-display text-2xl text-[#0e1a26]">{events.filter((event) => event.credentialId).length}</strong><span className="text-sm text-[#607083]">marcas con identidad</span></article>
      </section>

      <form method="get" className="grid gap-3 rounded-2xl border border-[#dce5ed] bg-white p-4 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
        <label className="grid gap-1.5 text-xs font-bold text-[#52677a]">Periodo<select name="periodo" defaultValue={period} className="min-h-11 rounded-xl border border-[#cbd7e2] bg-white px-3 text-sm text-[#0e1a26]"><option value="semana">Últimos 7 días</option><option value="mes">Últimos 31 días</option><option value="todo">Todo el historial</option></select></label>
        <label className="grid gap-1.5 text-xs font-bold text-[#52677a]">Empresa<select name="empresa" defaultValue={workspaceId || ""} className="min-h-11 rounded-xl border border-[#cbd7e2] bg-white px-3 text-sm text-[#0e1a26]"><option value="">Todas</option>{memberships.map((membership) => <option key={membership.workspaceId} value={membership.workspaceId}>{membership.workspace.brandName || membership.workspace.name}</option>)}</select></label>
        <label className="grid gap-1.5 text-xs font-bold text-[#52677a]">Proyecto<select name="proyecto" defaultValue={projectId || ""} className="min-h-11 rounded-xl border border-[#cbd7e2] bg-white px-3 text-sm text-[#0e1a26]"><option value="">Todos</option>{assignedProjects.filter((project) => !workspaceId || project.terraqoWorkspaceId === workspaceId).map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
        <Button type="submit" variant="outline" className="min-h-11">Aplicar filtros</Button>
      </form>

      <section className="space-y-3" aria-label="Historial de jornadas">
        {sessions.length ? sessions.map((item) => {
          const relatedWorklogs = worklogs.filter((worklog) => worklog.projectId === item.projectId && worklog.occurredAt >= item.entry.capturedAt && (!item.exit || worklog.occurredAt <= item.exit.capturedAt));
          const workspaceName = item.entry.workspace.brandName || item.entry.workspace.name;
          return (
            <article key={item.id} className="overflow-hidden rounded-2xl border border-[#dce5ed] bg-white shadow-[0_10px_34px_rgba(14,26,38,0.04)]">
              <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-bold ${item.exit ? "bg-[#e8f7f1] text-[#087b70]" : "bg-[#eaf3ff] text-[#1768b0]"}`}><span className={`h-2 w-2 rounded-full ${item.exit ? "bg-[#0da785]" : "bg-[#2b82d9]"}`} />{item.exit ? "Completada" : "En curso"}</span><span className="text-xs font-semibold capitalize text-[#748596]">{dateFormatter.format(item.entry.capturedAt)}</span></div>
                  <h2 className="mt-3 font-display text-xl font-bold text-[#0e1a26]">{item.entry.project.title}</h2>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#607083]"><span className="inline-flex items-center gap-1.5"><BriefcaseBusiness className="h-4 w-4" />{workspaceName}</span><span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{item.entry.project.location || "Ubicación del proyecto"}</span></p>
                </div>
                <dl className="grid grid-cols-3 gap-2 text-center sm:min-w-[360px]">
                  <div className="rounded-xl bg-[#f5f8fa] p-3"><dt className="text-[11px] text-[#748596]">Entrada</dt><dd className="mt-1 font-bold tabular-nums text-[#0e1a26]">{timeFormatter.format(item.entry.capturedAt)}</dd></div>
                  <div className="rounded-xl bg-[#f5f8fa] p-3"><dt className="text-[11px] text-[#748596]">Salida</dt><dd className="mt-1 font-bold tabular-nums text-[#0e1a26]">{item.exit ? timeFormatter.format(item.exit.capturedAt) : "—"}</dd></div>
                  <div className="rounded-xl bg-[#effaf7] p-3"><dt className="text-[11px] text-[#4f786f]">Total</dt><dd className="mt-1 font-bold tabular-nums text-[#087b70]">{durationLabel(item.entry.capturedAt, item.exit?.capturedAt || null)}</dd></div>
                </dl>
              </div>

              <div className="border-t border-[#e6edf2] bg-[#fbfcfd] px-5 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="inline-flex items-center gap-2 text-xs font-semibold text-[#52677a]"><Fingerprint className="h-4 w-4 text-[#087b70]" />Identidad y hora del servidor verificadas · precisión {Math.round(item.entry.accuracyMeters)} m</p>
                  <Link href={`/portal/bitacora?fecha=${item.entry.capturedAt.toISOString().slice(0, 10)}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#1768b0]">Ver actividad del día <ArrowRight className="h-4 w-4" /></Link>
                </div>
                {relatedWorklogs.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{relatedWorklogs.slice(0, 4).map((worklog) => <Link key={worklog.id} href={`/portal/bitacora?fecha=${worklog.occurredAt.toISOString().slice(0, 10)}`} className="flex min-h-12 items-center gap-3 rounded-xl border border-[#dce5ed] bg-white px-3 py-2 transition hover:border-[#9abbd8]"><FileText className="h-4 w-4 shrink-0 text-[#1768b0]" /><span className="min-w-0"><strong className="block truncate text-sm text-[#0e1a26]">{worklog.title}</strong><span className="text-xs text-[#748596]">{timeFormatter.format(worklog.occurredAt)} · {worklog.evidenceStatus === "VERIFIED" ? "Verificada" : "Bitácora"}</span></span></Link>)}</div> : <p className="mt-2 text-xs text-[#748596]">Sin bitácoras asociadas durante esta jornada.</p>}
              </div>
            </article>
          );
        }) : (
          <div className="rounded-2xl border border-dashed border-[#cbd7e2] bg-white px-6 py-14 text-center"><Clock3 className="mx-auto h-8 w-8 text-[#87a0b5]" /><h2 className="mt-4 font-display text-xl font-bold text-[#0e1a26]">Aún no hay jornadas en este periodo</h2><p className="mx-auto mt-2 max-w-md text-sm text-[#607083]">Cuando registres tu entrada desde Inicio, Terraqo conservará aquí el contexto verificable de tu actividad.</p><Button asChild variant="outline" className="mt-5 min-h-11"><Link href="/portal#jornada-de-hoy">Ir a Jornada de hoy</Link></Button></div>
        )}
      </section>
    </main>
  );
}
