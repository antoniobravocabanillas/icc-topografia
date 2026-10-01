import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  BriefcaseBusiness,
  Clock3,
  FileText,
  Fingerprint,
  MapPin,
  ShieldAlert,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { AttendanceRouteMap } from "@/components/terraqo/attendance-route-map";
import { Input } from "@/components/ui/input";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { reviewAttendanceAction } from "@/lib/server/jornada-actions";
import { calculateJornada, formatMinutes } from "@/lib/terraqo/jornada";
import { getSessionTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";

export const dynamic = "force-dynamic";

const dateLabel = new Intl.DateTimeFormat("es-PE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Lima",
});
const timeLabel = new Intl.DateTimeFormat("es-PE", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Lima",
});

export default async function CompanyAttendanceDetailPage({
  params,
}: {
  params: Promise<{ attendanceId: string }>;
}) {
  await requireAdminPage(["ADMIN", "SUPER_ADMIN"]);
  const workspaceId = await getSessionTerraqoWorkspaceId();
  const { attendanceId } = await params;

  const entry = await prisma.terraqoAttendanceEvent.findFirst({
    where: {
      id: attendanceId,
      workspaceId,
      type: "CHECK_IN",
      status: "ACCEPTED",
      workRelationship: { workspaceId },
    },
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      project: { select: { id: true, title: true, location: true } },
      locationSamples: { orderBy: { capturedAt: "asc" }, take: 1500 },
      workRelationship: {
        include: {
          member: { select: { id: true, title: true } },
          schedules: { where: { effectiveTo: null }, orderBy: { effectiveFrom: "desc" }, take: 1 },
          approvals: { where: { checkInEventId: attendanceId }, take: 1 },
          adjustments: { orderBy: { createdAt: "desc" } },
        },
      },
    },
  });
  if (!entry?.workRelationship) notFound();

  const approval = entry.workRelationship.approvals[0] || null;
  const exit = approval?.checkOutEventId
    ? await prisma.terraqoAttendanceEvent.findFirst({ where: { id: approval.checkOutEventId, workspaceId } })
    : await prisma.terraqoAttendanceEvent.findFirst({
        where: { userId: entry.userId, workspaceId, context: entry.context, projectId: entry.projectId, type: "CHECK_OUT", status: "ACCEPTED", capturedAt: { gt: entry.capturedAt } },
        orderBy: { capturedAt: "asc" },
      });
  const correction = entry.workRelationship.adjustments.find(
    (adjustment) => adjustment.status === "APPROVED" && adjustment.requestedCheckOutAt,
  );
  const effectiveExitAt = exit?.capturedAt || correction?.requestedCheckOutAt || null;
  const schedule = entry.workRelationship.schedules[0] || null;
  const calculation = calculateJornada({
    entryAt: entry.capturedAt,
    exitAt: effectiveExitAt,
    schedule,
    compensation: null,
    approval,
  });
  const worklogs = await prisma.terraqoWorklogEntry.findMany({
    where: {
      workspaceId,
      authorId: entry.userId,
      deletedAt: null,
      occurredAt: { gte: entry.capturedAt, lte: effectiveExitAt || new Date() },
    },
    select: { id: true, title: true, type: true, occurredAt: true, evidenceStatus: true, evidenceUrls: true },
    orderBy: { occurredAt: "asc" },
  });
  const pendingAdjustment = entry.workRelationship.adjustments.find((adjustment) => adjustment.status === "REQUESTED");
  const statusLabel = !effectiveExitAt
    ? "En curso"
    : approval?.status === "APPROVED"
      ? "Aprobada"
      : approval?.status === "PARTIALLY_APPROVED"
        ? "Aprobación parcial"
        : approval?.status === "REJECTED"
          ? "Observada"
          : "Pendiente de aprobación";

  return (
    <main className="space-y-5">
      <header>
        <Link href={`/admin/jornadas?member=${entry.workRelationship.member.id}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#245da7]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver a jornadas
        </Link>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#4374ba]">Registro del workspace</p>
            <h1 className="mt-1 font-display text-3xl font-bold capitalize tracking-[-0.03em]">{dateLabel.format(entry.capturedAt)}</h1>
          </div>
          <span className="inline-flex min-h-10 w-fit items-center gap-2 rounded-full bg-[#eef8f5] px-3 text-xs font-bold text-[#087b70]">
            <BadgeCheck className="h-4 w-4" aria-hidden="true" /> {statusLabel}
          </span>
        </div>
      </header>

      <section className="rounded-2xl border border-[#d8e0ec] bg-white p-5 sm:p-6">
        <div className="grid gap-4 border-b border-[#e6edf2] pb-5 md:grid-cols-3">
          <div className="flex items-center gap-3"><UserRound className="h-5 w-5 text-[#4374ba]" aria-hidden="true" /><span><strong className="block text-sm">{entry.user.name || entry.user.email}</strong><small className="text-[#607083]">{entry.workRelationship.member.title || "Profesional"}</small></span></div>
          <div className="flex items-center gap-3"><BriefcaseBusiness className="h-5 w-5 text-[#4374ba]" aria-hidden="true" /><span><strong className="block text-sm">{entry.project?.title || "Jornada personal de campo"}</strong><small className="text-[#607083]">{entry.project ? "Proyecto vinculado" : "Sin proyecto fijo"}</small></span></div>
          <div className="flex items-center gap-3"><MapPin className="h-5 w-5 text-[#4374ba]" aria-hidden="true" /><span><strong className="block text-sm">{entry.context === "PERSONAL_FIELD" ? "Ubicación capturada" : entry.project?.location || "Ubicación verificada"}</strong><small className="text-[#607083]">Precisión de entrada: {Math.round(entry.accuracyMeters)} m</small></span></div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
          <article className="rounded-xl bg-[#effaf7] p-4"><span className="text-xs font-bold text-[#087b70]">Entrada</span><strong className="mt-2 block font-display text-3xl">{timeLabel.format(entry.capturedAt)}</strong><p className="mt-2 flex items-center gap-2 text-xs text-[#607083]"><Fingerprint className="h-4 w-4" aria-hidden="true" />Identidad y ubicación verificadas</p></article>
          <div className="text-center"><span className="text-xs text-[#607083]">Tiempo efectivo</span><strong className="mt-1 block font-display text-xl">{effectiveExitAt ? formatMinutes(Math.floor((effectiveExitAt.getTime() - entry.capturedAt.getTime()) / 60_000)) : "En curso"}</strong></div>
          <article className="rounded-xl bg-[#eef6fb] p-4"><span className="text-xs font-bold text-[#1768b0]">{correction && !exit ? "Salida corregida" : "Salida"}</span><strong className="mt-2 block font-display text-3xl">{effectiveExitAt ? timeLabel.format(effectiveExitAt) : "—"}</strong><p className="mt-2 text-xs text-[#607083]">{exit ? "Marca verificada" : correction ? "Corrección aprobada" : "Sin marca de salida"}</p></article>
        </div>
      </section>

      <AttendanceRouteMap
        entry={{ latitude: entry.latitude, longitude: entry.longitude, accuracyMeters: entry.accuracyMeters, capturedAt: entry.capturedAt }}
        exit={exit ? { latitude: exit.latitude, longitude: exit.longitude, accuracyMeters: exit.accuracyMeters, capturedAt: exit.capturedAt } : null}
        samples={entry.locationSamples}
      />

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-2xl bg-[#eef6fb] p-5"><Clock3 className="h-5 w-5 text-[#1768b0]" aria-hidden="true" /><p className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-[#52677a]">Horario esperado</p><strong className="mt-2 block text-lg">{schedule ? `${schedule.startTime} – ${schedule.endTime}` : "No configurado"}</strong><p className="mt-2 text-sm text-[#607083]">{schedule ? `Refrigerio: ${schedule.breakMinutes} minutos` : "Configura la relación laboral para calcular el período."}</p></article>
        <article className="rounded-2xl bg-[#effaf7] p-5"><BadgeCheck className="h-5 w-5 text-[#087b70]" aria-hidden="true" /><p className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-[#52677a]">Cálculo referencial</p><strong className="mt-2 block text-lg">{formatMinutes(calculation.regularMinutes)} regulares</strong><p className="mt-2 text-sm font-semibold text-[#087b70]">+ {formatMinutes(calculation.additionalDetectedMinutes)} detectadas</p></article>
        <article className="rounded-2xl bg-[#fff8ea] p-5"><ShieldAlert className="h-5 w-5 text-[#a8670d]" aria-hidden="true" /><p className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-[#52677a]">Revisión empresarial</p><strong className="mt-2 block text-lg">{statusLabel}</strong><p className="mt-2 text-sm text-[#6d5b42]">{pendingAdjustment ? "Existe una incidencia esperando revisión." : "Sin incidencias nuevas para esta jornada."}</p></article>
      </section>

      {approval?.status === "PENDING" ? <form action={reviewAttendanceAction} className="rounded-2xl border border-[#e8c997] bg-[#fffaf2] p-5"><input type="hidden" name="approvalId" value={approval.id} /><h2 className="font-display text-xl font-bold">Resolver horas adicionales</h2><p className="mt-1 text-sm text-[#6d5b42]">Terraqo detectó {formatMinutes(approval.additionalDetectedMinutes)}. Registra únicamente el tiempo reconocido por la empresa.</p><div className="mt-4 grid gap-3 sm:grid-cols-[190px_1fr_auto]"><label className="grid gap-1.5 text-sm font-semibold">Minutos aprobados<Input name="additionalApprovedMinutes" type="number" min="0" max={approval.additionalDetectedMinutes} defaultValue={approval.additionalDetectedMinutes} /></label><label className="grid gap-1.5 text-sm font-semibold">Observación<Input name="reviewNote" maxLength={500} /></label><Button type="submit" className="min-h-11 self-end">Guardar revisión</Button></div></form> : null}

      <section className="rounded-2xl border border-[#d8e0ec] bg-white p-5 sm:p-6"><div className="flex items-center justify-between gap-4"><div><h2 className="font-display text-xl font-bold">Actividad empresarial vinculada</h2><p className="mt-1 text-sm text-[#607083]">Bitácoras y evidencias del profesional registradas para este workspace durante la jornada, con o sin proyecto fijo.</p></div><FileText className="h-5 w-5 text-[#4374ba]" aria-hidden="true" /></div>{worklogs.length ? <div className="mt-4 divide-y divide-[#e6edf2]">{worklogs.map((worklog) => <div key={worklog.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"><div><span className="text-xs font-bold text-[#4374ba]">{timeLabel.format(worklog.occurredAt)} · {worklog.type.replaceAll("_", " ")}</span><strong className="mt-1 block text-sm">{worklog.title}</strong></div><span className="text-xs font-semibold text-[#607083]">{worklog.evidenceStatus === "VERIFIED" ? "Verificada" : worklog.evidenceUrls.length ? `${worklog.evidenceUrls.length} evidencia(s)` : "Bitácora"}</span></div>)}</div> : <p className="mt-4 rounded-xl bg-[#f7f9fb] p-5 text-sm text-[#607083]">No hay bitácoras empresariales dentro de este intervalo.</p>}</section>
    </main>
  );
}
