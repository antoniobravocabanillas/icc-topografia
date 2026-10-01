import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Award, Banknote, BriefcaseBusiness, Clock3, Filter, Search, ShieldAlert, TimerReset, UsersRound } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { formatMinutes } from "@/lib/terraqo/jornada";
import { calculateWorkforceMetric, estimateApprovedOvertimeAmount, type WorkforceAttendanceEvent } from "@/lib/terraqo/workforce-analytics";
import { getSessionTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";

export const dynamic = "force-dynamic";

type Params = { q?: string; area?: string; status?: string; attendance?: string; sort?: string; month?: string };

function monthRange(value?: string) {
  const now = new Date();
  const fallback = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit" }).format(now);
  const periodKey = /^\d{4}-\d{2}$/.test(value || "") ? value! : fallback;
  const [year, month] = periodKey.split("-").map(Number);
  return { periodKey, start: new Date(Date.UTC(year, month - 1, 1, 5)), end: new Date(Date.UTC(year, month, 1, 5)) };
}

function currency(value: number | null, code = "PEN") {
  if (value === null) return "Pendiente";
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: code, maximumFractionDigits: 2 }).format(value);
}

export default async function CompanyPeoplePage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireAdminPage(["ADMIN", "SUPER_ADMIN"]);
  const workspaceId = await getSessionTerraqoWorkspaceId();
  const params = await searchParams;
  const range = monthRange(params.month);

  const [members, events, adjustments] = await Promise.all([
    prisma.terraqoWorkspaceMember.findMany({
      where: { workspaceId, active: true, role: "PROFESSIONAL" },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            terraqoProfessionalProfile: {
              select: {
                username: true,
                headline: true,
                identityVerificationStatus: true,
                worklogs: {
                  where: { workspaceId, occurredAt: { gte: range.start, lt: range.end }, evidenceStatus: "VERIFIED", deletedAt: null },
                  select: { id: true },
                },
              },
            },
          },
        },
        workRelationship: {
          include: {
            schedules: { where: { effectiveTo: null }, orderBy: { effectiveFrom: "desc" }, take: 1 },
            compensationPolicies: { where: { source: "COMPANY", effectiveTo: null }, orderBy: { effectiveFrom: "desc" }, take: 1 },
            attendancePeriods: { where: { periodKey: range.periodKey }, take: 1 },
          },
        },
      },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.terraqoAttendanceEvent.findMany({
      where: { workspaceId, status: "ACCEPTED", capturedAt: { gte: range.start, lt: range.end } },
      select: { id: true, userId: true, type: true, capturedAt: true, projectId: true, context: true },
      orderBy: { capturedAt: "asc" },
    }),
    prisma.terraqoAttendanceAdjustment.findMany({
      where: { workRelationship: { workspaceId }, createdAt: { gte: range.start, lt: range.end }, status: { in: ["REQUESTED", "APPROVED"] } },
      select: { workRelationshipId: true },
    }),
  ]);

  const eventIds = events.map((event) => event.id);
  const approvals = eventIds.length ? await prisma.terraqoAttendanceApproval.findMany({
    where: { workRelationship: { workspaceId }, checkInEventId: { in: eventIds } },
    select: { workRelationshipId: true, checkInEventId: true, regularMinutes: true, additionalDetectedMinutes: true, additionalApprovedMinutes: true, status: true },
  }) : [];

  const records = members.map((member) => {
    const relation = member.workRelationship;
    const memberEvents = events.filter((event) => event.userId === member.userId) as WorkforceAttendanceEvent[];
    const memberApprovals = approvals.filter((approval) => approval.workRelationshipId === relation?.id);
    const incidentCount = adjustments.filter((adjustment) => adjustment.workRelationshipId === relation?.id).length;
    const metric = calculateWorkforceMetric({
      events: memberEvents,
      schedule: relation?.schedules[0] || null,
      approvals: memberApprovals,
      verifiedEvidenceCount: member.user.terraqoProfessionalProfile?.worklogs.length || 0,
      incidentCount,
    });
    const policy = relation?.compensationPolicies[0];
    const overtimeEstimate = estimateApprovedOvertimeAmount(metric.additionalApprovedMinutes, policy?.hourlyReferenceAmount ? Number(policy.hourlyReferenceAmount) : null);
    return { member, relation, policy, metric, incidentCount, overtimeEstimate };
  });

  const areas = Array.from(new Set(records.map((record) => record.relation?.area).filter((area): area is string => Boolean(area)))).sort();
  const query = (params.q || "").trim().toLocaleLowerCase("es");
  const filtered = records.filter((record) => {
    const haystack = `${record.member.user.name || ""} ${record.member.user.email} ${record.member.title || ""} ${record.relation?.area || ""}`.toLocaleLowerCase("es");
    if (query && !haystack.includes(query)) return false;
    if (params.area && params.area !== "all" && record.relation?.area !== params.area) return false;
    if (params.status === "configured" && record.relation?.status !== "ACTIVE") return false;
    if (params.status === "pending" && record.relation?.status === "ACTIVE") return false;
    if (params.attendance === "late" && record.metric.lateCount === 0) return false;
    if (params.attendance === "on_time" && (record.metric.scheduledJourneyCount === 0 || record.metric.lateCount > 0)) return false;
    if (params.attendance === "no_activity" && record.metric.journeyCount > 0) return false;
    return true;
  }).sort((left, right) => {
    if (params.sort === "overtime") return right.metric.additionalApprovedMinutes - left.metric.additionalApprovedMinutes;
    if (params.sort === "late") return right.metric.lateMinutes - left.metric.lateMinutes;
    if (params.sort === "punctuality") return (right.metric.punctualityRate ?? -1) - (left.metric.punctualityRate ?? -1);
    return (left.member.user.name || left.member.user.email).localeCompare(right.member.user.name || right.member.user.email, "es");
  });

  const activeCount = records.filter((record) => record.relation?.status === "ACTIVE").length;
  const lateCount = records.reduce((total, record) => total + record.metric.lateCount, 0);
  const pendingApprovals = records.reduce((total, record) => total + record.metric.pendingApprovalCount, 0);
  const approvedOvertime = records.reduce((total, record) => total + record.metric.additionalApprovedMinutes, 0);
  const configuredForPayroll = records.filter((record) => record.relation?.status === "ACTIVE" && record.policy).length;
  const recognition = records.filter((record) => record.metric.recognitionScore !== null).sort((a, b) => (b.metric.recognitionScore || 0) - (a.metric.recognitionScore || 0))[0];

  return (
    <main className="space-y-6">
      <header className="overflow-hidden rounded-2xl bg-[linear-gradient(120deg,#0b2235_0%,#0d5260_58%,#187f82_100%)] px-5 py-6 text-white shadow-[0_24px_70px_-44px_rgba(4,44,55,0.8)] sm:px-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-200">Inteligencia de personas</p><h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Equipo, asistencia y compensación</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-white/72">Una vista empresarial privada para decidir con evidencia. Los resultados comparan el período seleccionado y nunca exponen remuneraciones fuera de este workspace.</p></div>
          <div className="flex flex-wrap gap-2"><Link href="/admin/jornadas" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 text-sm font-bold hover:bg-white/15">Revisar jornadas <ArrowRight className="h-4 w-4" /></Link><Link href="/admin/nomina" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-4 text-sm font-bold text-[#0b5260]">Preparar pagos <Banknote className="h-4 w-4" /></Link></div>
        </div>
        <div className="mt-6 grid gap-px overflow-hidden rounded-xl border border-white/12 bg-white/12 sm:grid-cols-2 xl:grid-cols-5">
          {([
            { label: "Profesionales activos", value: activeCount, Icon: UsersRound },
            { label: "Tardanzas", value: lateCount, Icon: TimerReset },
            { label: "Revisiones pendientes", value: pendingApprovals, Icon: ShieldAlert },
            { label: "Horas extra aprobadas", value: formatMinutes(approvedOvertime), Icon: Clock3 },
            { label: "Listos para nómina", value: `${configuredForPayroll}/${records.length}`, Icon: Banknote },
          ]).map(({ label, value, Icon }) => <div key={label} className="bg-[#0c3444]/86 p-4"><Icon className="h-4 w-4 text-cyan-200" /><strong className="mt-3 block text-2xl tabular-nums">{String(value)}</strong><span className="text-xs text-white/64">{label}</span></div>)}
        </div>
      </header>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="rounded-2xl border border-[#d8e0ec] bg-white p-5 shadow-[0_18px_50px_-42px_rgba(14,26,38,0.45)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#4374ba]">Explorar equipo</p><h2 className="mt-1 font-display text-2xl font-bold">Todos los profesionales</h2></div><span className="text-xs font-semibold text-[#607083]">{filtered.length} de {records.length} resultados</span></div>
          <form className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(210px,1.35fr)_1fr_1fr_1fr_1fr_150px_auto]">
            <label className="relative"><span className="sr-only">Buscar</span><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[#607083]" /><input name="q" defaultValue={params.q} placeholder="Nombre, cargo o correo" className="h-11 w-full rounded-lg border border-[#ccd8e5] pl-10 pr-3 text-sm" /></label>
            <select name="area" defaultValue={params.area || "all"} className="h-11 rounded-lg border border-[#ccd8e5] px-3 text-sm"><option value="all">Todas las áreas</option>{areas.map((area) => <option key={area}>{area}</option>)}</select>
            <select name="status" defaultValue={params.status || "all"} className="h-11 rounded-lg border border-[#ccd8e5] px-3 text-sm"><option value="all">Toda configuración</option><option value="configured">Configurados</option><option value="pending">Pendientes</option></select>
            <select name="attendance" defaultValue={params.attendance || "all"} className="h-11 rounded-lg border border-[#ccd8e5] px-3 text-sm"><option value="all">Toda asistencia</option><option value="on_time">Sin tardanzas</option><option value="late">Con tardanzas</option><option value="no_activity">Sin actividad</option></select>
            <select name="sort" defaultValue={params.sort || "name"} className="h-11 rounded-lg border border-[#ccd8e5] px-3 text-sm"><option value="name">Ordenar por nombre</option><option value="punctuality">Mayor puntualidad</option><option value="late">Más tardanzas</option><option value="overtime">Más horas adicionales</option></select>
            <input name="month" type="month" defaultValue={range.periodKey} className="h-11 rounded-lg border border-[#ccd8e5] px-3 text-sm" />
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#0d5260] px-4 text-sm font-bold text-white"><Filter className="h-4 w-4" />Aplicar</button>
          </form>
          <div className="mt-5 overflow-x-auto rounded-xl border border-[#d8e0ec]">
            <table className="min-w-[980px] w-full text-left text-sm">
              <thead className="bg-[#f1f5f8] text-[11px] uppercase tracking-[0.08em] text-[#52677a]"><tr><th className="px-4 py-3">Profesional</th><th className="px-4 py-3">Relación</th><th className="px-4 py-3">Jornadas</th><th className="px-4 py-3">Puntualidad</th><th className="px-4 py-3">Tardanzas</th><th className="px-4 py-3">Horas adicionales</th><th className="px-4 py-3">Pago adicional</th><th className="px-4 py-3"><span className="sr-only">Acciones</span></th></tr></thead>
              <tbody className="divide-y divide-[#e5ebf1]">{filtered.map(({ member, relation, policy, metric, overtimeEstimate }) => <tr key={member.id} className="align-middle transition-colors hover:bg-[#f8fafc]"><td className="px-4 py-3"><div className="flex items-center gap-3">{member.user.image ? <Image src={member.user.image} alt="" width={40} height={40} unoptimized className="h-10 w-10 rounded-full object-cover" /> : <span className="grid h-10 w-10 place-items-center rounded-full bg-[#e7eff8] font-bold text-[#245da7]">{(member.user.name || member.user.email).slice(0,2).toUpperCase()}</span>}<span><strong className="block max-w-56 truncate">{member.user.name || member.user.email}</strong><span className="block max-w-56 truncate text-xs text-[#607083]">{member.title || member.user.terraqoProfessionalProfile?.headline || "Profesional"}</span></span></div></td><td className="px-4 py-3"><strong className="block text-xs">{relation?.area || "Sin área"}</strong><span className={`mt-1 inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${relation?.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{relation?.status === "ACTIVE" ? "Activa" : "Por configurar"}</span></td><td className="px-4 py-3 tabular-nums"><strong>{metric.completedJourneyCount}</strong><span className="block text-xs text-[#607083]">{metric.openJourneyCount ? `${metric.openJourneyCount} en curso` : "completadas"}</span></td><td className="px-4 py-3"><strong className="tabular-nums">{metric.punctualityRate === null ? "—" : `${metric.punctualityRate}%`}</strong><div className="mt-2 h-1.5 w-24 overflow-hidden rounded-full bg-[#e7edf3]"><div className="h-full rounded-full bg-[#149b8b]" style={{ width: `${metric.punctualityRate || 0}%` }} /></div></td><td className="px-4 py-3"><strong className={metric.lateCount ? "text-rose-700" : "text-emerald-700"}>{metric.lateCount}</strong><span className="block text-xs text-[#607083]">{formatMinutes(metric.lateMinutes)}</span></td><td className="px-4 py-3"><strong>{formatMinutes(metric.additionalApprovedMinutes)}</strong><span className="block text-xs text-[#607083]">{metric.pendingApprovalCount} por revisar</span></td><td className="px-4 py-3"><strong>{currency(overtimeEstimate, policy?.currency)}</strong><span className="block text-xs text-[#607083]">estimado</span></td><td className="px-4 py-3"><Link href={`/admin/jornadas?member=${member.id}`} className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#ccd8e5] px-3 text-xs font-bold text-[#245da7]">Gestionar <ArrowRight className="h-3.5 w-3.5" /></Link></td></tr>)}{!filtered.length ? <tr><td colSpan={8} className="px-5 py-12 text-center text-[#607083]">No hay profesionales que coincidan con estos filtros.</td></tr> : null}</tbody>
            </table>
          </div>
        </div>

        <aside className="space-y-5">
          <article className="rounded-2xl border border-[#d8e0ec] bg-white p-5"><div className="flex items-center gap-2"><Award className="h-5 w-5 text-amber-600" /><h2 className="font-display text-xl font-bold">Reconocimiento del mes</h2></div>{recognition ? <><div className="mt-5 flex items-center gap-3">{recognition.member.user.image ? <Image src={recognition.member.user.image} alt="" width={52} height={52} unoptimized className="h-13 w-13 rounded-full object-cover" /> : <span className="grid h-13 w-13 place-items-center rounded-full bg-amber-50 font-bold text-amber-700">{(recognition.member.user.name || "P").slice(0,2).toUpperCase()}</span>}<div><strong>{recognition.member.user.name}</strong><p className="text-xs text-[#607083]">{recognition.member.title || "Profesional"}</p></div></div><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-[#f2f7fb] p-3"><strong className="text-2xl">{recognition.metric.recognitionScore}</strong><span className="block text-xs text-[#607083]">índice transparente</span></div><div className="rounded-xl bg-emerald-50 p-3"><strong className="text-2xl text-emerald-800">{recognition.metric.punctualityRate}%</strong><span className="block text-xs text-emerald-700">puntualidad</span></div></div><p className="mt-4 text-xs leading-5 text-[#607083]">Se exige un mínimo de 3 jornadas. La fórmula considera puntualidad, asistencia, evidencia verificada e incidencias. Las horas extra no aumentan el reconocimiento.</p></> : <p className="mt-4 rounded-xl bg-[#f7f9fb] p-4 text-sm text-[#607083]">Aún no hay una muestra mínima suficiente para emitir un reconocimiento confiable.</p>}</article>
          <article className="rounded-2xl bg-[#102c3a] p-5 text-white"><BriefcaseBusiness className="h-5 w-5 text-cyan-300" /><h2 className="mt-3 font-display text-xl font-bold">Privacidad por diseño</h2><p className="mt-2 text-sm leading-6 text-white/68">Los datos laborales, de ubicación y compensación permanecen dentro del workspace. Terraqo muestra indicadores necesarios para la gestión y evita rankings públicos.</p><Link href="/admin/jornadas" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-cyan-200">Configurar relaciones <ArrowRight className="h-4 w-4" /></Link></article>
        </aside>
      </section>
    </main>
  );
}
