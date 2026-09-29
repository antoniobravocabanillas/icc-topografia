import Link from "next/link";
import { ArrowLeft, BadgeCheck, BriefcaseBusiness, Clock3, FileText, Fingerprint, Info, MapPin, ShieldCheck, TriangleAlert } from "lucide-react";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";
import { requestAttendanceAdjustmentAction } from "@/lib/server/jornada-actions";
import { activeCompensation, calculateJornada, formatMinutes } from "@/lib/terraqo/jornada";
import { requireProfessionalPortal } from "@/lib/terraqo/professional-portal";

export const dynamic = "force-dynamic";

const time = new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });
const fullDate = new Intl.DateTimeFormat("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/Lima" });

export default async function AttendanceDetailPage({ params, searchParams }: { params: Promise<{ attendanceId: string }>; searchParams: Promise<{ success?: string }> }) {
  const [{ attendanceId }, query] = await Promise.all([params, searchParams]);
  const { session, profile } = await requireProfessionalPortal();
  const entry = await prisma.terraqoAttendanceEvent.findFirst({
    where: { id: attendanceId, userId: session.user.id, professionalProfileId: profile.id, type: "CHECK_IN", status: "ACCEPTED" },
    include: {
      project: { select: { id: true, title: true, location: true } },
      workspace: { select: { name: true, brandName: true } },
      workRelationship: {
        include: {
          member: { select: { title: true } },
          schedules: { where: { effectiveTo: null }, orderBy: { effectiveFrom: "desc" }, take: 1 },
          compensationPolicies: { where: { effectiveTo: null }, orderBy: [{ source: "asc" }, { effectiveFrom: "desc" }] },
          approvals: { where: { checkInEventId: attendanceId }, take: 1 },
          adjustments: { orderBy: { createdAt: "desc" } },
        },
      },
    },
  });
  if (!entry) notFound();

  const approval = entry.workRelationship?.approvals[0] || null;
  const exit = approval?.checkOutEventId ? await prisma.terraqoAttendanceEvent.findFirst({ where: { id: approval.checkOutEventId, userId: session.user.id } }) : await prisma.terraqoAttendanceEvent.findFirst({ where: { userId: session.user.id, workspaceId: entry.workspaceId, projectId: entry.projectId, type: "CHECK_OUT", status: "ACCEPTED", capturedAt: { gt: entry.capturedAt } }, orderBy: { capturedAt: "asc" } });
  const approvedCorrection = entry.workRelationship?.adjustments.find((adjustment) => adjustment.status === "APPROVED" && adjustment.requestedCheckOutAt) || null;
  const effectiveExitAt = exit?.capturedAt || approvedCorrection?.requestedCheckOutAt || null;
  const schedule = entry.workRelationship?.schedules[0] || null;
  const compensation = activeCompensation(entry.workRelationship?.compensationPolicies || []);
  const calculation = calculateJornada({ entryAt: entry.capturedAt, exitAt: effectiveExitAt, schedule, compensation, approval });
  const endAt = effectiveExitAt || new Date();
  const worklogs = await prisma.terraqoWorklogEntry.findMany({
    where: { authorId: session.user.id, professionalProfileId: profile.id, projectId: entry.projectId, deletedAt: null, occurredAt: { gte: entry.capturedAt, lte: endAt } },
    select: { id: true, title: true, type: true, evidenceStatus: true, occurredAt: true, evidenceUrls: true },
    orderBy: { occurredAt: "asc" },
  });
  const workspaceName = entry.workspace.brandName || entry.workspace.name;
  const statusLabel = !effectiveExitAt ? "En curso" : approval?.status === "APPROVED" ? "Aprobada" : approval?.status === "PARTIALLY_APPROVED" ? "Aprobación parcial" : approval?.status === "REJECTED" ? "Observada" : "Pendiente de aprobación";

  return (
    <main className="min-w-0 space-y-5 py-5 sm:py-8">
      <div><Link href="/portal/jornadas" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#1768b0]"><ArrowLeft className="h-4 w-4" />Mis jornadas</Link><div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h1 className="font-display text-3xl font-bold capitalize tracking-[-0.035em] text-[#0e1a26]">{fullDate.format(entry.capturedAt)}</h1><span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#eef8f5] px-3 py-2 text-xs font-bold text-[#087b70]"><BadgeCheck className="h-4 w-4" />{statusLabel}</span></div></div>
      {query.success ? <div role="status" className="rounded-xl border border-[#bde4d8] bg-[#effaf7] px-4 py-3 text-sm font-semibold text-[#087b70]">Incidencia enviada. El registro original permanece intacto hasta que la empresa la revise.</div> : null}
      {approvedCorrection ? <div role="status" className="rounded-xl border border-[#b8d8ef] bg-[#eef6fb] px-4 py-3 text-sm text-[#294f70]"><strong>Corrección aprobada:</strong> salida reconocida a las {time.format(approvedCorrection.requestedCheckOutAt!)}. La marca original se conserva en el historial de auditoría.</div> : null}

      <section className="rounded-2xl border border-[#dce5ed] bg-white p-5 shadow-[0_12px_36px_rgba(14,26,38,0.05)]">
        <div className="flex flex-wrap gap-x-8 gap-y-3 border-b border-[#e6edf2] pb-5"><span className="inline-flex items-center gap-2 text-sm font-bold"><BriefcaseBusiness className="h-4 w-4 text-[#1768b0]" />{entry.project.title}</span><span className="text-sm text-[#607083]">{workspaceName}</span><span className="text-sm text-[#607083]">{entry.workRelationship?.member.title || "Profesional"}</span><span className="inline-flex items-center gap-2 text-sm text-[#607083]"><MapPin className="h-4 w-4 text-[#1768b0]" />{entry.project.location || "Ubicación del proyecto"}</span></div>
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
          <div className="rounded-xl bg-[#f2faf8] p-4"><span className="inline-flex items-center gap-2 text-sm font-bold text-[#087b70]"><span className="h-2.5 w-2.5 rounded-full bg-[#0da785]" />Entrada</span><strong className="mt-2 block font-display text-3xl text-[#0e1a26]">{time.format(entry.capturedAt)}</strong><p className="mt-2 flex items-center gap-2 text-xs text-[#607083]"><Fingerprint className="h-4 w-4" />Dispositivo e identidad verificados</p></div>
          <div className="text-center"><span className="text-xs text-[#748596]">Tiempo registrado</span><strong className="mt-1 block font-display text-2xl text-[#0e1a26]">{effectiveExitAt ? formatMinutes(Math.floor((effectiveExitAt.getTime() - entry.capturedAt.getTime()) / 60_000)) : "En curso"}</strong></div>
          <div className="rounded-xl bg-[#eef5fb] p-4"><span className="inline-flex items-center gap-2 text-sm font-bold text-[#1768b0]"><span className="h-2.5 w-2.5 rounded-full bg-[#2b82d9]" />{approvedCorrection && !exit ? "Salida corregida" : "Salida"}</span><strong className="mt-2 block font-display text-3xl text-[#0e1a26]">{effectiveExitAt ? time.format(effectiveExitAt) : "—"}</strong><p className="mt-2 flex items-center gap-2 text-xs text-[#607083]"><Fingerprint className="h-4 w-4" />{exit ? "Dispositivo e identidad verificados" : approvedCorrection ? "Corrección revisada por la empresa" : "Aún no registrada"}</p></div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-2xl border border-[#dce5ed] bg-[#f4f8ff] p-5"><Clock3 className="h-5 w-5 text-[#1768b0]" /><p className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-[#52677a]">Horario esperado</p><strong className="mt-2 block text-lg text-[#0e1a26]">{schedule ? `${schedule.startTime} – ${schedule.endTime}` : "No configurado"}</strong><p className="mt-2 text-sm text-[#607083]">{schedule ? `Refrigerio: ${schedule.breakMinutes} minutos` : "La empresa aún no definió reglas de jornada."}</p></article>
        <article className="rounded-2xl border border-[#dce5ed] bg-[#f2faf8] p-5"><ShieldCheck className="h-5 w-5 text-[#087b70]" /><p className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-[#52677a]">Cálculo referencial</p><strong className="mt-2 block text-lg text-[#0e1a26]">{formatMinutes(calculation.regularMinutes)} regulares</strong><p className="mt-2 text-sm font-semibold text-[#087b70]">+ {formatMinutes(calculation.additionalDetectedMinutes)} adicionales detectadas</p></article>
        <article className="rounded-2xl border border-[#dce5ed] bg-white p-5"><BadgeCheck className="h-5 w-5 text-[#087b70]" /><p className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-[#52677a]">Estado empresarial</p><strong className="mt-2 block text-lg text-[#0e1a26]">{statusLabel}</strong><p className="mt-2 text-sm text-[#607083]">{approval?.reviewedAt ? `Revisada el ${fullDate.format(approval.reviewedAt)}` : "La empresa debe revisar las horas adicionales."}</p></article>
      </section>

      <section className="rounded-2xl border border-[#dce5ed] bg-white p-5">
        <div className="flex items-center justify-between gap-4"><div><h2 className="font-display text-xl font-bold text-[#0e1a26]">Actividad durante la jornada</h2><p className="mt-1 text-sm text-[#607083]">Trabajo documentado dentro del intervalo de entrada y salida.</p></div><FileText className="h-5 w-5 text-[#1768b0]" /></div>
        {worklogs.length ? <ol className="mt-5 divide-y divide-[#edf1f4]">{worklogs.map((worklog) => <li key={worklog.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#1768b0]" aria-hidden="true" /><div><span className="text-xs font-bold text-[#1768b0]">{time.format(worklog.occurredAt)} · {worklog.type.replaceAll("_", " ")}</span><h3 className="mt-1 font-bold text-[#0e1a26]">{worklog.title}</h3></div></div><span className="text-xs font-semibold text-[#607083]">{worklog.evidenceStatus === "VERIFIED" ? "Verificada" : worklog.evidenceUrls.length ? `${worklog.evidenceUrls.length} evidencia(s)` : "Bitácora"}</span></li>)}</ol> : <p className="mt-5 rounded-xl bg-[#f7f9fb] p-5 text-sm text-[#607083]">No se registraron bitácoras durante este intervalo.</p>}
      </section>

      {entry.workRelationship ? <details className="rounded-2xl border border-[#ead7bd] bg-[#fffaf2] p-5"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 font-bold text-[#7a4d10]"><TriangleAlert className="h-5 w-5" />Reportar una incidencia</summary><form action={requestAttendanceAdjustmentAction} className="mt-4 grid gap-4"><input type="hidden" name="relationshipId" value={entry.workRelationship.id} /><input type="hidden" name="attendanceEventId" value={entry.id} /><input type="hidden" name="type" value={exit ? "WRONG_TIME" : "MISSING_CHECK_OUT"} />{!exit ? <label className="grid gap-1.5 text-sm font-semibold">Hora de salida aproximada<Input name="requestedCheckOutAt" type="datetime-local" required /></label> : null}<label className="grid gap-1.5 text-sm font-semibold">Describe lo ocurrido<Textarea name="reason" minLength={10} maxLength={1000} required placeholder="Ejemplo: olvidé registrar la salida; terminé aproximadamente a las 18:15." /></label><div className="flex items-start gap-2 text-xs leading-5 text-[#6b5b39]"><Info className="mt-0.5 h-4 w-4 shrink-0" />La solicitud no cambia el registro original. Un responsable de la empresa debe revisarla.</div><Button type="submit" className="min-h-11 w-full sm:w-fit">Enviar incidencia</Button></form></details> : null}
    </main>
  );
}
