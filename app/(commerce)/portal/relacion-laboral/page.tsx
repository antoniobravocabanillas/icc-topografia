import { BadgeCheck, BriefcaseBusiness, Building2, CalendarDays, Clock3, Coins, Info, MapPin, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { savePersonalCompensationAction } from "@/lib/server/jornada-actions";
import { activeCompensation, getWorkRelationshipForUser } from "@/lib/terraqo/jornada";
import { requireProfessionalPortal } from "@/lib/terraqo/professional-portal";

export const dynamic = "force-dynamic";

function dateLabel(value?: Date | null) {
  return value ? new Intl.DateTimeFormat("es-PE", { dateStyle: "long", timeZone: "America/Lima" }).format(value) : "Por confirmar";
}

function money(value: unknown) {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(Number(value || 0));
}

export default async function WorkRelationshipPage({ searchParams }: { searchParams: Promise<{ success?: string }> }) {
  const params = await searchParams;
  const { session, memberships } = await requireProfessionalPortal();
  const membership = memberships.find((item) => item.role === "PROFESSIONAL") || memberships[0];
  const relationship = membership ? await getWorkRelationshipForUser(session.user.id, membership.workspaceId) : null;
  const schedule = relationship?.schedules[0] || null;
  const companyPolicy = relationship?.compensationPolicies.find((item) => item.source === "COMPANY") || null;
  const personalPolicy = relationship?.compensationPolicies.find((item) => item.source === "PERSONAL") || null;
  const compensation = relationship ? activeCompensation(relationship.compensationPolicies) : null;

  if (!membership) return <div className="py-12"><h1 className="font-display text-3xl font-bold">Relación laboral</h1><p className="mt-3 text-[#607083]">Aún no tienes una relación activa con una empresa en Terraqo.</p></div>;

  return (
    <main className="min-w-0 space-y-5 py-5 sm:py-8">
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#087b70]">Privado para ti y tu empresa</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-[-0.035em] text-[#0e1a26] sm:text-4xl">Relación laboral</h1>
        <p className="mt-2 text-sm text-[#607083] sm:text-base">Condiciones de trabajo que permiten interpretar tus jornadas sin exponer información salarial en tu perfil público.</p>
      </header>

      {params.success ? <div role="status" className="rounded-xl border border-[#bde4d8] bg-[#effaf7] px-4 py-3 text-sm font-semibold text-[#087b70]">Tu referencia privada fue guardada.</div> : null}

      <section className="rounded-2xl border border-[#dce5ed] bg-white p-5 shadow-[0_12px_36px_rgba(14,26,38,0.05)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#eaf3ff] text-[#1768b0]"><Building2 className="h-7 w-7" aria-hidden="true" /></span>
            <div className="min-w-0"><h2 className="truncate font-display text-xl font-bold text-[#0e1a26]">{membership.workspace.brandName || membership.workspace.name}</h2><p className="mt-1 text-sm text-[#607083]">{membership.workspace.industry || "Empresa Terraqo"}</p></div>
          </div>
          <span className={`inline-flex min-h-9 w-fit items-center gap-2 rounded-full px-3 text-xs font-bold ${relationship?.status === "ACTIVE" ? "bg-[#e8f7f1] text-[#087b70]" : "bg-[#fff4df] text-[#8a5a00]"}`}><span className={`h-2.5 w-2.5 rounded-full ${relationship?.status === "ACTIVE" ? "bg-[#0da785]" : "bg-[#e59a22]"}`} />{relationship?.status === "ACTIVE" ? "Confirmada por la empresa" : "Configuración pendiente"}</span>
        </div>

        <div className="mt-6 grid gap-4 border-t border-[#e6edf2] pt-5 sm:grid-cols-2 xl:grid-cols-4">
          <div><span className="text-xs text-[#748596]">Cargo</span><strong className="mt-1 flex items-center gap-2 text-sm text-[#0e1a26]"><BriefcaseBusiness className="h-4 w-4 text-[#1768b0]" />{relationship?.member.title || membership.title || "Por confirmar"}</strong></div>
          <div><span className="text-xs text-[#748596]">Área</span><strong className="mt-1 block text-sm text-[#0e1a26]">{relationship?.area || "Por confirmar"}</strong></div>
          <div><span className="text-xs text-[#748596]">Fecha de inicio</span><strong className="mt-1 flex items-center gap-2 text-sm text-[#0e1a26]"><CalendarDays className="h-4 w-4 text-[#1768b0]" />{dateLabel(relationship?.startDate)}</strong></div>
          <div><span className="text-xs text-[#748596]">Modalidad</span><strong className="mt-1 block text-sm text-[#0e1a26]">{relationship?.modality || "Por confirmar"}</strong></div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-[#dce5ed] bg-white p-5">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-[#0e1a26]"><BriefcaseBusiness className="h-5 w-5 text-[#1768b0]" />Información del cargo</h2>
          <dl className="mt-4 divide-y divide-[#e6edf2] text-sm">
            <div className="grid grid-cols-2 gap-3 py-2"><dt className="text-[#607083]">Tipo de contrato</dt><dd className="font-semibold text-[#0e1a26]">{relationship?.contractType || "Por confirmar"}</dd></div>
            <div className="grid grid-cols-2 gap-3 py-2"><dt className="text-[#607083]">Sede</dt><dd className="flex items-center gap-1.5 font-semibold text-[#0e1a26]"><MapPin className="h-4 w-4 text-[#1768b0]" />{relationship?.workSite || membership.workspace.name}</dd></div>
            <div className="grid grid-cols-2 gap-3 py-2"><dt className="text-[#607083]">Estado</dt><dd className="font-semibold text-[#087b70]">{relationship?.status === "ACTIVE" ? "Activo" : "Pendiente"}</dd></div>
          </dl>
        </article>

        <article className="rounded-2xl border border-[#dce5ed] bg-white p-5">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-[#0e1a26]"><Clock3 className="h-5 w-5 text-[#1768b0]" />Horario de trabajo</h2>
          {schedule ? <dl className="mt-4 divide-y divide-[#e6edf2] text-sm"><div className="grid grid-cols-2 gap-3 py-2"><dt className="text-[#607083]">Horario base</dt><dd className="font-semibold text-[#0e1a26]">{schedule.startTime} – {schedule.endTime}</dd></div><div className="grid grid-cols-2 gap-3 py-2"><dt className="text-[#607083]">Refrigerio</dt><dd className="font-semibold text-[#0e1a26]">{schedule.breakMinutes} minutos</dd></div><div className="grid grid-cols-2 gap-3 py-2"><dt className="text-[#607083]">Tolerancia de ingreso</dt><dd className="font-semibold text-[#0e1a26]">{schedule.toleranceMinutes} minutos</dd></div></dl> : <p className="mt-4 text-sm text-[#607083]">La empresa todavía no configuró un horario esperado.</p>}
        </article>
      </section>

      <section className="rounded-2xl border border-[#dce5ed] bg-white p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="flex items-center gap-2 font-display text-lg font-bold text-[#0e1a26]"><Coins className="h-5 w-5 text-[#087b70]" />Jornada y compensación</h2><p className="mt-1 text-sm text-[#607083]">Información privada usada únicamente para estimaciones referenciales.</p></div>{companyPolicy ? <span className="inline-flex items-center gap-2 rounded-full bg-[#e8f7f1] px-3 py-2 text-xs font-bold text-[#087b70]"><BadgeCheck className="h-4 w-4" />Confirmada por empresa</span> : personalPolicy ? <span className="rounded-full bg-[#eef4ff] px-3 py-2 text-xs font-bold text-[#1768b0]">Configurada por ti</span> : null}</div>
        {compensation ? <div className="mt-5 grid gap-4 rounded-xl bg-[#f7f9fb] p-4 sm:grid-cols-3"><div><span className="text-xs text-[#748596]">Referencia base</span><strong className="mt-1 block font-display text-2xl text-[#0e1a26]">{money(compensation.baseAmount)}</strong></div><div><span className="text-xs text-[#748596]">Frecuencia</span><strong className="mt-1 block text-sm text-[#0e1a26]">{compensation.frequency === "MONTHLY" ? "Mensual" : compensation.frequency === "DAILY" ? "Diaria" : "Por hora"}</strong></div><div><span className="text-xs text-[#748596]">Hora adicional referencial</span><strong className="mt-1 block text-sm text-[#0e1a26]">{compensation.hourlyReferenceAmount ? money(compensation.hourlyReferenceAmount) : "No configurada"}</strong></div></div> : null}
        {!companyPolicy ? <form action={savePersonalCompensationAction} className="mt-5 grid gap-4 rounded-xl border border-dashed border-[#bfd0df] p-4 sm:grid-cols-2"><input type="hidden" name="relationshipId" value={relationship?.id || ""} /><input type="hidden" name="memberId" value={relationship?.member.id || membership.id} />
          <div className="sm:col-span-2"><p className="font-bold text-[#0e1a26]">Mi referencia privada</p><p className="mt-1 text-sm text-[#607083]">Úsala si tu empresa no registra compensaciones en Terraqo. No se comparte en tu perfil.</p></div>
          <label className="grid gap-1.5 text-sm font-semibold">Monto mensual<Input name="baseAmount" type="number" min="1" step="0.01" defaultValue={personalPolicy ? Number(personalPolicy.baseAmount) : undefined} required /></label>
          <label className="grid gap-1.5 text-sm font-semibold">Valor referencial por hora adicional<Input name="hourlyReferenceAmount" type="number" min="0.01" step="0.01" defaultValue={personalPolicy?.hourlyReferenceAmount ? Number(personalPolicy.hourlyReferenceAmount) : undefined} required /></label>
          <Button type="submit" className="min-h-11 sm:col-span-2 sm:w-fit">Guardar referencia privada</Button>
        </form> : null}
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-[#eef6fb] px-4 py-3 text-xs leading-5 text-[#426079]"><Info className="mt-0.5 h-4 w-4 shrink-0 text-[#1768b0]" /><p>Las cifras son estimaciones informativas. No constituyen boleta de pago, liquidación ni determinación legal. Las horas adicionales requieren la política y aprobación de la empresa.</p></div>
      </section>

      <section className="flex items-start gap-3 rounded-2xl border border-[#cfe4df] bg-[#f2faf8] p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#087b70]" /><div><h2 className="font-bold text-[#0e1a26]">Trazabilidad sin exposición pública</h2><p className="mt-1 text-sm leading-6 text-[#52677a]">Terraqo conserva quién configuró cada condición y desde cuándo está vigente. Los cambios generan una nueva versión; no reescriben el historial anterior.</p></div></section>
    </main>
  );
}
