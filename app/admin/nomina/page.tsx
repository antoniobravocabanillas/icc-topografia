import Link from "next/link";
import { AlertTriangle, ArrowRight, BadgeCheck, Banknote, Building2, Calculator, LockKeyhole, ShieldCheck } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/server/admin-page-auth";
import { estimateApprovedOvertimeAmount } from "@/lib/terraqo/workforce-analytics";
import { getSessionTerraqoWorkspace } from "@/lib/terraqo/workspace-scope";

export const dynamic = "force-dynamic";

function currentPeriod() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit" }).format(new Date());
}

function money(value: number, currency = "PEN") {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

export default async function PayrollPreparationPage() {
  await requireAdminPage(["ADMIN", "SUPER_ADMIN"]);
  const workspace = await getSessionTerraqoWorkspace();
  const periodKey = currentPeriod();
  const relationships = await prisma.terraqoWorkRelationship.findMany({
    where: { workspaceId: workspace.id, member: { active: true, role: "PROFESSIONAL" } },
    include: {
      member: { include: { user: { select: { name: true, email: true } } } },
      schedules: { where: { effectiveTo: null }, orderBy: { effectiveFrom: "desc" }, take: 1 },
      compensationPolicies: { where: { source: "COMPANY", effectiveTo: null }, orderBy: { effectiveFrom: "desc" }, take: 1 },
      attendancePeriods: { where: { periodKey }, take: 1 },
    },
    orderBy: { member: { user: { name: "asc" } } },
  });

  const lines = relationships.map((relationship) => {
    const policy = relationship.compensationPolicies[0];
    const period = relationship.attendancePeriods[0];
    const base = policy ? Number(policy.baseAmount) : 0;
    const additional = estimateApprovedOvertimeAmount(period?.additionalApprovedMinutes || 0, policy?.hourlyReferenceAmount ? Number(policy.hourlyReferenceAmount) : null) || 0;
    const blockers = [
      relationship.status !== "ACTIVE" ? "Relación sin confirmar" : null,
      !relationship.schedules[0] ? "Horario pendiente" : null,
      !policy ? "Compensación pendiente" : null,
      !period || period.status !== "APPROVED" ? "Período sin aprobar" : null,
    ].filter((value): value is string => Boolean(value));
    return { relationship, policy, period, base, additional, total: base + additional, blockers };
  });

  const ready = lines.filter((line) => line.blockers.length === 0);
  const totalBase = ready.reduce((sum, line) => sum + line.base, 0);
  const totalAdditional = ready.reduce((sum, line) => sum + line.additional, 0);

  return (
    <main className="space-y-6">
      <header className="rounded-2xl border border-[#d6e3e9] bg-[linear-gradient(135deg,#f8fbfc_0%,#eaf6f5_100%)] p-6 sm:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#087b70]">Control financiero laboral</p><h1 className="mt-2 font-display text-3xl font-bold text-[#0e1a26] sm:text-4xl">Preparación de nómina</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[#52677a]">Consolida asistencia, aprobaciones y compensación antes de generar una orden de pago. Este módulo no mueve ni custodia fondos.</p></div><span className="inline-flex w-fit items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold text-[#0d5260] shadow-sm"><LockKeyhole className="h-4 w-4" />Período {periodKey}</span></div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><article className="rounded-xl bg-white p-4"><Building2 className="h-5 w-5 text-[#4374ba]" /><strong className="mt-3 block text-2xl">{relationships.length}</strong><span className="text-xs text-[#607083]">relaciones laborales</span></article><article className="rounded-xl bg-white p-4"><BadgeCheck className="h-5 w-5 text-emerald-600" /><strong className="mt-3 block text-2xl">{ready.length}</strong><span className="text-xs text-[#607083]">listas para liquidar</span></article><article className="rounded-xl bg-white p-4"><Calculator className="h-5 w-5 text-amber-600" /><strong className="mt-3 block text-2xl">{money(totalBase)}</strong><span className="text-xs text-[#607083]">base configurada lista</span></article><article className="rounded-xl bg-white p-4"><Banknote className="h-5 w-5 text-[#087b70]" /><strong className="mt-3 block text-2xl">{money(totalAdditional)}</strong><span className="text-xs text-[#607083]">adicional estimado</span></article></div>
      </header>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <article className="rounded-2xl border border-[#d8e0ec] bg-white p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="font-display text-2xl font-bold">Estado por profesional</h2><p className="mt-1 text-sm text-[#607083]">Solo las líneas sin bloqueos podrán entrar a una futura orden de pago.</p></div><Link href="/admin/personal" className="text-sm font-bold text-[#245da7]">Ver personas</Link></div><div className="mt-5 overflow-x-auto rounded-xl border border-[#d8e0ec]"><table className="min-w-[820px] w-full text-left text-sm"><thead className="bg-[#f1f5f8] text-xs text-[#52677a]"><tr><th className="px-4 py-3">Profesional</th><th className="px-4 py-3">Base</th><th className="px-4 py-3">Adicional</th><th className="px-4 py-3">Total referencial</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3"></th></tr></thead><tbody className="divide-y divide-[#e5ebf1]">{lines.map((line) => <tr key={line.relationship.id}><td className="px-4 py-4"><strong>{line.relationship.member.user.name || line.relationship.member.user.email}</strong><span className="block text-xs text-[#607083]">{line.relationship.area || "Sin área"}</span></td><td className="px-4 py-4">{line.policy ? money(line.base, line.policy.currency) : "—"}</td><td className="px-4 py-4">{line.policy ? money(line.additional, line.policy.currency) : "—"}</td><td className="px-4 py-4 font-bold">{line.policy ? money(line.total, line.policy.currency) : "—"}</td><td className="px-4 py-4">{line.blockers.length ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800"><AlertTriangle className="h-3.5 w-3.5" />{line.blockers[0]}</span> : <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700"><BadgeCheck className="h-3.5 w-3.5" />Lista</span>}</td><td className="px-4 py-4"><Link href={`/admin/jornadas?member=${line.relationship.memberId}`} className="inline-flex items-center gap-1 text-xs font-bold text-[#245da7]">Revisar <ArrowRight className="h-3.5 w-3.5" /></Link></td></tr>)}</tbody></table></div></article>
        <aside className="space-y-5"><article className="rounded-2xl bg-[#0e2735] p-5 text-white"><ShieldCheck className="h-6 w-6 text-cyan-300" /><h2 className="mt-4 font-display text-xl font-bold">Arquitectura segura de pagos</h2><ol className="mt-4 space-y-4 text-sm text-white/72"><li><strong className="block text-white">1. Cálculo trazable</strong>Asistencia, aprobaciones y reglas versionadas.</li><li><strong className="block text-white">2. Doble aprobación</strong>Responsable laboral y responsable financiero.</li><li><strong className="block text-white">3. Orden idempotente</strong>Una clave única impide pagos duplicados.</li><li><strong className="block text-white">4. Proveedor autorizado</strong>El dinero viaja por banco o entidad habilitada; Terraqo concilia el resultado.</li></ol></article><article className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-display text-lg font-bold text-amber-950">No es una boleta de pago</h2><p className="mt-2 text-sm leading-6 text-amber-900/76">Los montos son referenciales. Antes de activar desembolsos se requiere motor de conceptos, descuentos, impuestos, exportación PLAME, aprobaciones y convenio con proveedor de pagos.</p></article></aside>
      </section>
    </main>
  );
}
