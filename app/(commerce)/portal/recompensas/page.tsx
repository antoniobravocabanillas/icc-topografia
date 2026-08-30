import { randomUUID } from "crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Award, BadgeCheck, Bug, CheckCircle2, Clock3, Gift, Lightbulb, LockKeyhole, Medal, Rocket, ShieldCheck, Sparkles, Star, Trophy, Zap } from "lucide-react";
import type { TerraqoBuilderContributionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { builderLevel, ensureBuilders, redeemBuilderReward, submitBuilderContribution } from "@/lib/terraqo/builders";
import { requireProfessionalPortal } from "@/lib/terraqo/professional-portal";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const categoryLabels: Record<string, string> = { PREMIUM: "Premium", VALIDATION: "Validaciones", VISIBILITY: "Visibilidad", EARLY_ACCESS: "Acceso anticipado", BADGE: "Insignias" };
const statusLabels: Record<string, string> = { RECEIVED: "Recibido", IN_REVIEW: "En revisión", VALIDATED: "Validado", IMPLEMENTED: "Implementado", REJECTED: "No aprobado" };
const contributionLabels: Record<string, string> = { BUG_REPORT: "Reporte de error", SUGGESTION: "Sugerencia", RESEARCH: "Encuesta o investigación", REFERRAL: "Invitación activada", COMPANY_REFERRAL: "Empresa activada", FIRST_WORKLOG: "Primera bitácora", EXPERIENCE_VALIDATION: "Experiencia validada", BETA_PARTICIPATION: "Participación Beta" };

async function submitContributionAction(formData: FormData) {
  "use server";
  const { session, memberships } = await requireProfessionalPortal();
  try {
    await submitBuilderContribution({
      userId: session.user.id,
      workspaceId: memberships[0]?.workspaceId,
      type: String(formData.get("type")) as TerraqoBuilderContributionType,
      title: String(formData.get("title") || ""),
      detail: String(formData.get("detail") || "")
    });
  } catch (error) {
    redirect(`/portal/recompensas?error=${encodeURIComponent(error instanceof Error ? error.message : "No se pudo registrar el aporte.")}#aportes`);
  }
  revalidatePath("/portal/recompensas");
  redirect("/portal/recompensas?sent=1#aportes");
}

async function redeemRewardAction(formData: FormData) {
  "use server";
  const { session } = await requireProfessionalPortal();
  try {
    await redeemBuilderReward({ userId: session.user.id, rewardId: String(formData.get("rewardId") || ""), idempotencyKey: String(formData.get("idempotencyKey") || "") });
  } catch (error) {
    redirect(`/portal/recompensas?error=${encodeURIComponent(error instanceof Error ? error.message : "No se pudo completar el canje.")}#catalogo`);
  }
  revalidatePath("/portal/recompensas");
  redirect("/portal/recompensas?redeemed=1#catalogo");
}

export default async function BuildersPage({ searchParams }: { searchParams: Promise<{ category?: string; sent?: string; redeemed?: string; error?: string }> }) {
  const { session } = await requireProfessionalPortal();
  const params = await searchParams;
  await ensureBuilders(session.user.id);
  const account = await prisma.terraqoBuilderAccount.findUniqueOrThrow({
    where: { userId: session.user.id },
    include: {
      user: { select: { name: true, image: true, terraqoProfessionalProfile: { select: { headline: true } } } },
      redemptions: { include: { reward: true }, orderBy: { redeemedAt: "desc" }, take: 30 },
      ledger: { orderBy: { createdAt: "desc" }, take: 40 }
    }
  });
  const contributions = await prisma.terraqoBuilderContribution.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "desc" }, take: 40 });
  const rewards = await prisma.terraqoBuilderReward.findMany({ where: { active: true, ...(params.category && params.category !== "ALL" ? { category: params.category as never } : {}) }, orderBy: [{ category: "asc" }, { pointsCost: "asc" }] });
  const level = builderLevel(account.contributionScore, account.foundingBuilder);
  const progress = level.next ? Math.min(100, Math.round(((account.contributionScore - level.min) / (level.next - level.min)) * 100)) : 100;
  const activeBenefits = [
    account.premiumUntil && account.premiumUntil > new Date() ? `Premium hasta ${formatDate(account.premiumUntil)}` : null,
    account.profileBoostUntil && account.profileBoostUntil > new Date() ? `Perfil destacado hasta ${formatDate(account.profileBoostUntil)}` : null,
    account.earlyAccessUntil && account.earlyAccessUntil > new Date() ? `Acceso anticipado hasta ${formatDate(account.earlyAccessUntil)}` : null,
    account.validationCredits ? `${account.validationCredits} crédito(s) de validación` : null
  ].filter(Boolean) as string[];

  return <div className="min-w-0 pb-16 pt-6 lg:pt-9">
    <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="font-mono text-[11px] font-black uppercase tracking-[0.18em] text-[#4374ba]">Programa de contribución</p><h1 className="mt-2 font-display text-3xl font-black tracking-[-0.025em] text-[#0e1a26] sm:text-4xl">Terraqo Builders</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#607083]">Tu aporte impulsa a toda la comunidad. Construye reputación histórica, gana TQ y accede a beneficios dentro de Terraqo.</p></div><Link href="#como-funciona" className="inline-flex h-11 items-center justify-center rounded-xl border border-[#cbd7e6] bg-white px-4 text-sm font-bold text-[#315c96]">¿Cómo funciona?</Link></header>

    {(params.sent || params.redeemed || params.error) ? <div className={`mt-6 rounded-xl border px-4 py-3 text-sm font-semibold ${params.error ? "border-red-200 bg-red-50 text-red-700" : "border-[#9fc4ff]/55 bg-[#edf4fd] text-[#315c96]"}`}>{params.error || (params.redeemed ? "Canje completado. El beneficio ya está activo en tu cuenta." : "Aporte recibido. Terraqo lo revisará antes de acreditar puntos.")}</div> : null}

    <nav className="mt-6 flex gap-1 overflow-x-auto rounded-xl border border-[#d8e0ec] bg-white p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"><BuilderTab href="#resumen" label="Resumen" /><BuilderTab href="#aportes" label="Mis aportes" /><BuilderTab href="#catalogo" label="Recompensas" /><BuilderTab href="#historial" label="Historial" /></nav>

    <section id="resumen" className="mt-6 overflow-hidden rounded-[24px] border border-[#cbd7e6] bg-[linear-gradient(118deg,#fff_0%,#f4f8fd_58%,#edf8fb_100%)] shadow-[0_18px_50px_rgba(14,26,38,0.08)]">
      <div className="grid lg:grid-cols-[1.35fr_0.8fr]">
        <div className="p-6 sm:p-8"><div className="flex items-start gap-4"><span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-[linear-gradient(145deg,#4374ba,#25c0d5)] p-[2px]"><span className="grid h-full w-full place-items-center rounded-full bg-white font-display text-lg font-black text-[#4374ba]">{(account.user.name || "T").slice(0, 1)}</span></span><div><h2 className="font-display text-xl font-black text-[#0e1a26]">{account.user.name || "Builder Terraqo"}</h2><p className="mt-1 text-xs font-semibold text-[#607083]">{account.user.terraqoProfessionalProfile?.headline || "Miembro de Terraqo Builders"}</p></div></div>
          <div className="mt-8 grid gap-6 sm:grid-cols-2"><div><p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#607083]">Nivel actual</p><div className="mt-2 flex items-end gap-3"><strong className="font-display text-3xl font-black text-[#0e1a26]">{level.name}</strong><span className="mb-1 text-xs font-bold text-[#4374ba]">Nivel {level.level}</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-[#dfe7f1]"><div className="h-full rounded-full bg-[linear-gradient(90deg,#4374ba,#25c0d5)]" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-xs text-[#607083]">{level.next ? `${level.next - account.contributionScore} TQ de Contribution Score para ${builderLevel(level.next).name}` : "Máximo nivel histórico alcanzado"}</p></div><div className="grid grid-cols-2 gap-3"><Metric label="TQ disponibles" value={account.availablePoints.toLocaleString("es-PE")} /><Metric label="Contribution Score" value={account.contributionScore.toLocaleString("es-PE")} /></div></div>
        </div>
        <div className="relative grid min-h-[230px] place-items-center overflow-hidden border-t border-[#cbd7e6] bg-[#07111f] p-7 text-white lg:border-l lg:border-t-0"><div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(37,192,213,0.25),transparent_34%),linear-gradient(145deg,#07111f,#102a45)]" /><span className="relative grid h-32 w-32 place-items-center rounded-[34px] border border-[#25c0d5]/35 bg-[#4374ba]/15 shadow-[0_0_70px_rgba(37,192,213,0.2)]"><Medal className="h-16 w-16 text-[#80e8f4]" /></span><p className="relative mt-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[#9fc4ff]">{account.foundingBuilder ? "Founding Builder · Terraqo 2026" : `${level.name} · Terraqo Builders`}</p></div>
      </div>
    </section>

    {activeBenefits.length ? <section className="mt-5 rounded-2xl border border-[#cbd7e6] bg-white p-5"><h2 className="font-display text-lg font-black">Beneficios activos</h2><div className="mt-4 flex flex-wrap gap-2">{activeBenefits.map((benefit) => <span key={benefit} className="inline-flex items-center gap-2 rounded-full bg-[#edf4fd] px-3 py-2 text-xs font-bold text-[#315c96]"><CheckCircle2 className="h-4 w-4" />{benefit}</span>)}</div></section> : null}

    <section id="aportes" className="mt-8"><SectionTitle eyebrow="Construye Terraqo" title="Acciones que generan puntos" subtitle="Enviar no acredita puntos automáticamente. Solo los aportes validados suman TQ y reputación." /><div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4"><ActionCard icon={<Bug />} title="Reportar un error" points="Hasta +250 TQ" copy="Incluye pasos, resultado esperado y evidencia." /><ActionCard icon={<Lightbulb />} title="Enviar sugerencia" points="Hasta +300 TQ" copy="Explica el problema y el impacto de la mejora." /><ActionCard icon={<BadgeCheck />} title="Validar evidencia" points="+20 TQ" copy="Se acredita al validar con identidad digital el trabajo de otro profesional." /><ActionCard icon={<Zap />} title="Crear evidencia útil" points="+25 TQ" copy="Tu primera bitácora se acredita automáticamente." /></div>
      <details className="group mt-5 rounded-2xl border border-[#cbd7e6] bg-white open:shadow-[0_16px_45px_rgba(14,26,38,0.08)]"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 font-display text-lg font-black [&::-webkit-details-marker]:hidden">Enviar un aporte para revisión<span className="rounded-full bg-[#edf4fd] px-3 py-1 text-xs text-[#4374ba]">Abrir formulario</span></summary><form action={submitContributionAction} className="grid gap-4 border-t border-[#e2e8f0] p-5 sm:p-6"><label className="grid gap-1.5 text-xs font-bold text-[#52657a]">Tipo<select name="type" required className="h-11 rounded-xl border border-[#cbd7e6] bg-white px-3 text-sm"><option value="BUG_REPORT">Reportar error</option><option value="SUGGESTION">Compartir sugerencia</option><option value="RESEARCH">Encuesta o investigación</option></select></label><label className="grid gap-1.5 text-xs font-bold text-[#52657a]">Título<input name="title" required minLength={5} maxLength={140} className="h-11 rounded-xl border border-[#cbd7e6] px-3 text-sm" placeholder="Resume el aporte con claridad" /></label><label className="grid gap-1.5 text-xs font-bold text-[#52657a]">Detalle<textarea name="detail" required minLength={20} maxLength={4000} rows={6} className="rounded-xl border border-[#cbd7e6] p-3 text-sm leading-6" placeholder="Qué ocurrió, cómo reproducirlo, qué propones y qué impacto tendría." /></label><button className="h-11 rounded-xl bg-[linear-gradient(135deg,#4374ba,#25c0d5)] px-5 text-sm font-black text-white sm:justify-self-start">Enviar para revisión</button></form></details>
      {contributions.length ? <div className="mt-5 grid gap-3">{contributions.slice(0, 8).map((item) => <article key={item.id} className="flex flex-col gap-3 rounded-xl border border-[#d8e0ec] bg-white p-4 sm:flex-row sm:items-center"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${item.status === "VALIDATED" || item.status === "IMPLEMENTED" ? "bg-emerald-50 text-emerald-700" : item.status === "REJECTED" ? "bg-red-50 text-red-600" : "bg-[#edf4fd] text-[#4374ba]"}`}>{item.status === "VALIDATED" || item.status === "IMPLEMENTED" ? <BadgeCheck className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}</span><div className="min-w-0 flex-1"><p className="font-bold text-[#0e1a26]">{item.title}</p><p className="mt-1 text-xs text-[#607083]">{contributionLabels[item.type]} · {statusLabels[item.status]} · {formatDate(item.createdAt)}</p></div><strong className="text-sm text-[#4374ba]">{item.approvedPoints ? `+${item.approvedPoints} TQ` : `Hasta +${item.requestedPoints} TQ`}</strong></article>)}</div> : null}
    </section>

    <section id="catalogo" className="mt-10"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><SectionTitle eyebrow="Beneficios internos" title="Catálogo de recompensas" subtitle="Canjea TQ por beneficios reales dentro del ecosistema Terraqo." /><div className="rounded-xl border border-[#cbd7e6] bg-white px-4 py-3 text-right"><p className="text-xs text-[#607083]">Saldo disponible</p><strong className="font-display text-xl text-[#4374ba]">{account.availablePoints.toLocaleString("es-PE")} TQ</strong></div></div><div className="mt-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"><CategoryLink value="ALL" current={params.category} label="Todos" />{Object.entries(categoryLabels).map(([value, label]) => <CategoryLink key={value} value={value} current={params.category} label={label} />)}</div><div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{rewards.map((reward) => <article key={reward.id} className="flex min-h-[280px] flex-col rounded-[20px] border border-[#d8e0ec] bg-white p-5 shadow-[0_10px_35px_rgba(14,26,38,0.05)]"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#edf4fd] text-[#4374ba]">{reward.category === "PREMIUM" ? <Star /> : reward.category === "VALIDATION" ? <ShieldCheck /> : reward.category === "VISIBILITY" ? <Sparkles /> : <Rocket />}</span><p className="mt-5 text-[10px] font-black uppercase tracking-[0.14em] text-[#4374ba]">{categoryLabels[reward.category]}</p><h3 className="mt-2 font-display text-xl font-black text-[#0e1a26]">{reward.title}</h3><p className="mt-2 flex-1 text-sm leading-6 text-[#607083]">{reward.description}</p><p className="mt-4 font-display text-lg font-black text-[#315c96]">{reward.pointsCost.toLocaleString("es-PE")} TQ</p><form action={redeemRewardAction} className="mt-4"><input type="hidden" name="rewardId" value={reward.id} /><input type="hidden" name="idempotencyKey" value={randomUUID()} /><button disabled={account.availablePoints < reward.pointsCost || reward.inventory === 0} className="h-11 w-full rounded-xl bg-[linear-gradient(135deg,#4374ba,#25c0d5)] text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-none disabled:bg-[#d8e0ec] disabled:text-[#7b8998]">{reward.inventory === 0 ? "Agotado" : account.availablePoints < reward.pointsCost ? "TQ insuficientes" : "Canjear ahora"}</button></form></article>)}</div></section>

    <section id="historial" className="mt-10"><SectionTitle eyebrow="Trazabilidad" title="Historial de puntos y canjes" subtitle="Cada movimiento conserva su saldo resultante y nunca reduce tu Contribution Score al canjear." /><div className="mt-5 overflow-hidden rounded-2xl border border-[#d8e0ec] bg-white">{account.ledger.length ? account.ledger.map((entry) => <div key={entry.id} className="flex items-center gap-4 border-b border-[#e7ecf2] px-4 py-4 last:border-0 sm:px-5"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${entry.pointsDelta >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{entry.pointsDelta >= 0 ? <Award className="h-5 w-5" /> : <Gift className="h-5 w-5" />}</span><div className="min-w-0 flex-1"><p className="font-bold text-[#0e1a26]">{entry.description}</p><p className="mt-1 text-xs text-[#607083]">{formatDateTime(entry.createdAt)} · Saldo: {entry.balanceAfter.toLocaleString("es-PE")} TQ</p></div><strong className={entry.pointsDelta >= 0 ? "text-emerald-700" : "text-amber-700"}>{entry.pointsDelta > 0 ? "+" : ""}{entry.pointsDelta} TQ</strong></div>) : <p className="p-8 text-center text-sm text-[#607083]">Tu historial aparecerá cuando Terraqo valide un aporte o realices un canje.</p>}</div></section>

    <section id="como-funciona" className="mt-10 rounded-[24px] bg-[#07111f] p-6 text-white sm:p-8"><div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr]"><div><p className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-[#80e8f4]">Reglas claras</p><h2 className="mt-3 font-display text-3xl font-black">El aporte vale cuando genera impacto.</h2></div><div className="grid gap-4 sm:grid-cols-3"><DarkRule icon={<LockKeyhole />} title="Sin spam" copy="Enviar un reporte no genera puntos automáticamente." /><DarkRule icon={<BadgeCheck />} title="Revisión humana" copy="Terraqo valida calidad, evidencia e impacto antes de acreditar." /><DarkRule icon={<Trophy />} title="Reputación permanente" copy="Canjear TQ no reduce tu Contribution Score ni tu nivel histórico." /></div></div></section>
  </div>;
}

function formatDate(date: Date) { return new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(date); }
function formatDateTime(date: Date) { return new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(date); }
function BuilderTab({ href, label }: { href: string; label: string }) { return <Link href={href} className="shrink-0 rounded-lg px-4 py-2 text-xs font-bold text-[#52657a] transition hover:bg-[#edf4fd] hover:text-[#4374ba]">{label}</Link>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-[#d8e0ec] bg-white/80 p-4"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#607083]">{label}</p><strong className="mt-2 block font-display text-2xl font-black text-[#4374ba]">{value}</strong></div>; }
function SectionTitle({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) { return <div><p className="font-mono text-[10px] font-black uppercase tracking-[0.17em] text-[#4374ba]">{eyebrow}</p><h2 className="mt-2 font-display text-2xl font-black tracking-[-0.02em] text-[#0e1a26] sm:text-3xl">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#607083]">{subtitle}</p></div>; }
function ActionCard({ icon, title, points, copy }: { icon: React.ReactNode; title: string; points: string; copy: string }) { return <article className="rounded-2xl border border-[#d8e0ec] bg-white p-5"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#edf4fd] text-[#4374ba] [&>svg]:h-5 [&>svg]:w-5">{icon}</span><h3 className="mt-4 font-display text-lg font-black text-[#0e1a26]">{title}</h3><p className="mt-1 text-xs font-black text-[#4374ba]">{points}</p><p className="mt-3 text-xs leading-5 text-[#607083]">{copy}</p></article>; }
function CategoryLink({ value, current, label }: { value: string; current?: string; label: string }) { const active = (current || "ALL") === value; return <Link href={value === "ALL" ? "/portal/recompensas#catalogo" : `/portal/recompensas?category=${value}#catalogo`} className={`shrink-0 rounded-xl border px-4 py-2 text-xs font-bold ${active ? "border-[#4374ba] bg-[#4374ba] text-white" : "border-[#d8e0ec] bg-white text-[#52657a]"}`}>{label}</Link>; }
function DarkRule({ icon, title, copy }: { icon: React.ReactNode; title: string; copy: string }) { return <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"><span className="text-[#80e8f4] [&>svg]:h-5 [&>svg]:w-5">{icon}</span><h3 className="mt-4 font-bold">{title}</h3><p className="mt-2 text-xs leading-5 text-white/60">{copy}</p></div>; }
