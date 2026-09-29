import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Banknote,
  BriefcaseBusiness,
  Building2,
  CircleAlert,
  FileCheck2,
  Network,
  ReceiptText,
  ShieldCheck,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/server/admin-page-auth";

export const dynamic = "force-dynamic";

const dateTime = new Intl.DateTimeFormat("es-PE", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Lima",
});

const planOrder = ["FREE", "BASIC", "PROFESSIONAL", "PREMIUM", "ENTERPRISE"] as const;

function money(amountMinor: number) {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 }).format(amountMinor / 100);
}

function metricTone(tone: "blue" | "teal" | "violet" | "amber") {
  return {
    blue: "bg-[#eaf2ff] text-[#245da7]",
    teal: "bg-[#e9f8f5] text-[#087b70]",
    violet: "bg-[#f1eefb] text-[#6552a8]",
    amber: "bg-[#fff5e3] text-[#a8670d]",
  }[tone];
}

export default async function TerraqoGlobalControlPage() {
  await requireAdminPage(["SUPER_ADMIN"]);
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const dayStart = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(now) + "T05:00:00.000Z");

  const [
    workspaces,
    totalUsers,
    newUsers,
    onlineUsers,
    totalProfessionals,
    worklogsMonth,
    attendanceToday,
    activeRelationships,
    pendingDocuments,
    pendingIdentities,
    pendingExperiences,
    openComplaints,
    overdueComplaints,
    activeBillingAccounts,
    pastDueBillingAccounts,
    failedBillingAttempts,
    paymentTotals,
    recentUsers,
  ] = await Promise.all([
    prisma.terraqoWorkspace.findMany({
      where: { deletedAt: null },
      include: {
        subscriptions: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { members: true, projects: true, worklogs: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.user.count({ where: { onlineUntil: { gte: now } } }),
    prisma.terraqoProfessionalProfile.count(),
    prisma.terraqoWorklogEntry.count({ where: { deletedAt: null, createdAt: { gte: thirtyDaysAgo } } }),
    prisma.terraqoAttendanceEvent.count({ where: { status: "ACCEPTED", capturedAt: { gte: dayStart } } }),
    prisma.terraqoWorkRelationship.count({ where: { status: "ACTIVE" } }),
    prisma.terraqoProfessionalDocument.count({ where: { reviewStatus: "SUBMITTED" } }),
    prisma.terraqoProfessionalProfile.count({ where: { identityVerificationStatus: "UNDER_REVIEW" } }),
    prisma.terraqoProfessionalExperience.count({ where: { verificationStatus: "REQUESTED" } }),
    prisma.terraqoComplaint.count({ where: { respondedAt: null } }),
    prisma.terraqoComplaint.count({ where: { respondedAt: null, dueAt: { lt: now } } }),
    prisma.terraqoBillingAccount.count({ where: { mode: "live", status: "ACTIVE" } }),
    prisma.terraqoBillingAccount.count({ where: { mode: "live", status: "PAST_DUE" } }),
    prisma.terraqoBillingAttempt.count({ where: { status: "FAILED", updatedAt: { gte: thirtyDaysAgo } } }),
    prisma.terraqoBillingPayment.aggregate({ where: { paidAt: { gte: thirtyDaysAgo } }, _sum: { amountMinor: true, refundedMinor: true } }),
    prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);

  const activeWorkspaces = workspaces.filter((workspace) => workspace.active).length;
  const suspendedWorkspaces = workspaces.length - activeWorkspaces;
  const payingSubscriptions = workspaces.filter((workspace) => ["ACTIVE", "TRIALING"].includes(workspace.subscriptions[0]?.status || "")).length;
  const netCollected = Number(paymentTotals._sum.amountMinor || 0) - Number(paymentTotals._sum.refundedMinor || 0);
  const validationQueue = pendingDocuments + pendingIdentities + pendingExperiences;
  const attentionTotal = validationQueue + openComplaints + pastDueBillingAccounts + failedBillingAttempts + suspendedWorkspaces;
  const planDistribution = planOrder.map((tier) => ({
    tier,
    value: workspaces.filter((workspace) => (workspace.subscriptions[0]?.tier || "FREE") === tier).length,
  }));
  const maxPlanCount = Math.max(...planDistribution.map((item) => item.value), 1);
  const activeWorkspaceRanking = [...workspaces]
    .sort((left, right) => (right._count.worklogs + right._count.projects * 3 + right._count.members) - (left._count.worklogs + left._count.projects * 3 + left._count.members))
    .slice(0, 6);

  const metrics = [
    { label: "Workspaces activos", value: activeWorkspaces, detail: `${workspaces.length} registrados`, icon: Building2, tone: "blue" as const },
    { label: "Usuarios Terraqo", value: totalUsers, detail: `+${newUsers} en 30 días`, icon: UsersRound, tone: "teal" as const },
    { label: "Profesionales", value: totalProfessionals, detail: `${activeRelationships} relaciones activas`, icon: UserRoundCheck, tone: "violet" as const },
    { label: "Cobrado en 30 días", value: money(netCollected), detail: `${activeBillingAccounts} cuentas live activas`, icon: Banknote, tone: "amber" as const },
  ];

  const attention = [
    { label: "Validaciones pendientes", value: validationQueue, detail: `${pendingDocuments} documentos · ${pendingIdentities} identidades · ${pendingExperiences} experiencias`, href: "/admin/terraqo/validaciones", icon: FileCheck2, critical: false },
    { label: "Facturación por revisar", value: pastDueBillingAccounts + failedBillingAttempts, detail: `${pastDueBillingAccounts} vencidas · ${failedBillingAttempts} intentos fallidos`, href: "/admin/terraqo/facturacion", icon: ReceiptText, critical: pastDueBillingAccounts > 0 },
    { label: "Reclamaciones abiertas", value: openComplaints, detail: overdueComplaints ? `${overdueComplaints} fuera de plazo` : "Todas dentro de plazo", href: "/admin/terraqo/reclamaciones", icon: CircleAlert, critical: overdueComplaints > 0 },
    { label: "Workspaces suspendidos", value: suspendedWorkspaces, detail: "Revisar operación y suscripción", href: "/admin/terraqo/workspaces", icon: ShieldCheck, critical: suspendedWorkspaces > 0 },
  ];

  return (
    <section className="space-y-6 sm:space-y-8">
      <header className="relative overflow-hidden rounded-3xl bg-[linear-gradient(120deg,#071d2a_0%,#0b3442_58%,#176b75_100%)] px-5 py-6 text-white shadow-[0_28px_70px_-48px_rgba(7,29,42,0.95)] sm:px-7 sm:py-8 lg:px-9">
        <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full border border-white/10" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-8 top-8 h-48 w-48 rounded-full border border-[#7cd8d0]/20" aria-hidden="true" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="max-w-3xl font-display text-3xl font-bold tracking-[-0.035em] sm:text-4xl lg:text-5xl">Centro de control Terraqo</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/68 sm:text-base">Supervisa crecimiento, confianza, facturación y riesgo operativo de toda la plataforma sin mezclar datos de los workspaces.</p>
            <span className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-full border border-[#7cd8d0]/25 bg-[#7cd8d0]/10 px-3 text-xs font-bold text-[#9ce6df]"><Activity className="h-4 w-4" aria-hidden="true" /> Datos globales en vivo</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[460px]">
            <div className="rounded-xl border border-white/12 bg-white/8 p-3"><span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">En línea ahora</span><strong className="mt-1 block text-xl">{onlineUsers}</strong></div>
            <div className="rounded-xl border border-white/12 bg-white/8 p-3"><span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">Bitácoras 30 días</span><strong className="mt-1 block text-xl">{worklogsMonth}</strong></div>
            <div className="rounded-xl border border-white/12 bg-white/8 p-3"><span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">Marcas hoy</span><strong className="mt-1 block text-xl">{attendanceToday}</strong></div>
          </div>
        </div>
      </header>

      <section aria-labelledby="global-metrics"><div className="flex items-center justify-between gap-3"><h2 id="global-metrics" className="font-display text-2xl font-bold">La operación en una lectura</h2><span className="hidden text-xs font-semibold text-[#607083] sm:block">Datos reales · actualización al cargar</span></div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ label, value, detail, icon: Icon, tone }) => <article key={label} className="rounded-2xl border border-[#d8e0ec] bg-white p-5 shadow-[0_18px_45px_-38px_rgba(14,26,38,0.55)]"><div className={`grid h-10 w-10 place-items-center rounded-xl ${metricTone(tone)}`}><Icon className="h-5 w-5" aria-hidden="true" /></div><strong className="mt-5 block font-display text-3xl tracking-[-0.03em]">{value}</strong><span className="mt-1 block text-sm font-bold">{label}</span><span className="mt-1 block text-xs text-[#607083]">{detail}</span></article>)}</div></section>

      <section className="rounded-2xl border border-[#d8e0ec] bg-white p-5 sm:p-6" aria-labelledby="attention-heading"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="attention-heading" className="font-display text-2xl font-bold">Requiere atención <span className="ml-1 text-[#a8670d]">{attentionTotal}</span></h2><p className="text-xs text-[#607083]">Solo estados accionables, sin métricas decorativas.</p></div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{attention.map(({ label, value, detail, href, icon: Icon, critical }) => <Link key={label} href={href} className={`group rounded-xl border p-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4374ba] ${critical ? "border-[#efc6bd] bg-[#fff6f3] hover:bg-[#fff0eb]" : "border-[#dfe6ec] bg-[#f8fafb] hover:bg-[#eef3f6]"}`}><div className="flex items-start justify-between gap-3"><span className={`grid h-9 w-9 place-items-center rounded-lg ${critical ? "bg-[#fde2dc] text-[#b94631]" : "bg-white text-[#4374ba]"}`}><Icon className="h-5 w-5" aria-hidden="true" /></span><strong className="font-display text-2xl">{value}</strong></div><span className="mt-4 block text-sm font-bold">{label}</span><span className="mt-1 block min-h-9 text-xs leading-5 text-[#607083]">{detail}</span><span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#245da7]">Resolver <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span></Link>)}</div></section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.7fr)]">
        <section className="rounded-2xl border border-[#d8e0ec] bg-white p-5 sm:p-6" aria-labelledby="workspace-pulse"><div className="flex items-center justify-between gap-3"><h2 id="workspace-pulse" className="font-display text-2xl font-bold">Workspaces con mayor actividad</h2><Link href="/admin/terraqo/workspaces" className="inline-flex min-h-11 items-center gap-1 text-xs font-bold text-[#245da7]">Gestionar todos <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></div><div className="mt-4 divide-y divide-[#e4eaef]">{activeWorkspaceRanking.map((workspace) => { const subscription = workspace.subscriptions[0]; const operationalVolume = workspace._count.worklogs + workspace._count.projects * 3 + workspace._count.members; return <Link key={workspace.id} href={`/admin/terraqo/workspaces#workspace-${workspace.id}`} className="grid gap-2 py-4 transition-colors hover:bg-[#f8fafb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4374ba] sm:grid-cols-[minmax(0,1fr)_100px_100px_110px_auto] sm:items-center"><div className="min-w-0"><strong className="block truncate text-sm">{workspace.brandName || workspace.name}</strong><span className="mt-1 block truncate text-xs text-[#607083]">{workspace.slug} · {workspace.country}</span></div><span className="text-xs"><strong className="block text-sm">{workspace._count.members}</strong> miembros</span><span className="text-xs"><strong className="block text-sm">{workspace._count.projects}</strong> proyectos</span><span className="text-xs"><strong className="block text-sm">{workspace._count.worklogs}</strong> bitácoras</span><span className={`w-fit rounded-full px-2 py-1 text-[10px] font-bold ${workspace.active ? "bg-[#e9f8f5] text-[#087b70]" : "bg-[#fde2dc] text-[#b94631]"}`}>{subscription?.tier || "FREE"} · {workspace.active ? "Activo" : "Suspendido"}</span><span className="sr-only">Volumen operativo {operationalVolume}</span></Link>; })}{!activeWorkspaceRanking.length ? <p className="py-8 text-center text-sm text-[#607083]">Todavía no existen workspaces registrados.</p> : null}</div></section>

        <section className="rounded-2xl border border-[#d8e0ec] bg-white p-5 sm:p-6" aria-labelledby="plans-heading"><h2 id="plans-heading" className="font-display text-2xl font-bold">Distribución de planes</h2><p className="mt-2 text-sm text-[#607083]">{payingSubscriptions} suscripciones activas o en prueba.</p><div className="mt-5 space-y-4">{planDistribution.map(({ tier, value }) => <div key={tier}><div className="mb-1.5 flex items-center justify-between text-xs"><span className="font-bold">{tier}</span><span className="text-[#607083]">{value} workspace{value === 1 ? "" : "s"}</span></div><div className="h-2 overflow-hidden rounded-full bg-[#edf1f4]"><div className="h-full rounded-full bg-[linear-gradient(90deg,#4374ba,#28a6a1)]" style={{ width: `${(value / maxPlanCount) * 100}%` }} /></div></div>)}</div><Link href="/admin/terraqo/facturacion" className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#245da7]">Abrir facturación <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-[#d8e0ec] bg-white p-5 sm:p-6" aria-labelledby="recent-users"><div className="flex items-center justify-between"><h2 id="recent-users" className="font-display text-2xl font-bold">Nuevos usuarios</h2><Link href="/admin/terraqo/usuarios" className="text-xs font-bold text-[#245da7]">Ver usuarios</Link></div><div className="mt-4 divide-y divide-[#e4eaef]">{recentUsers.map((user) => <div key={user.id} className="flex items-center justify-between gap-4 py-3"><div className="min-w-0"><strong className="block truncate text-sm">{user.name || user.email}</strong><span className="mt-0.5 block truncate text-xs text-[#607083]">{user.email}</span></div><div className="shrink-0 text-right"><span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-[#4374ba]">{user.role.replaceAll("_", " ")}</span><span className="mt-1 block text-[10px] text-[#748596]">{dateTime.format(user.createdAt)}</span></div></div>)}</div></section>

        <section className="overflow-hidden rounded-2xl border border-[#d8e0ec] bg-[#071d2a] p-5 text-white sm:p-6" aria-labelledby="global-actions"><h2 id="global-actions" className="font-display text-2xl font-bold">Acciones globales</h2><p className="mt-2 max-w-xl text-sm leading-6 text-white/62">Administra la plataforma sin entrar en la operación privada de cada cliente.</p><div className="mt-5 grid gap-2 sm:grid-cols-2">{[
          ["Aprovisionar workspace", "/admin/terraqo/workspaces", Building2],
          ["Gestionar accesos", "/admin/terraqo/usuarios", UsersRound],
          ["Revisar confianza", "/admin/terraqo/validaciones", BadgeCheck],
          ["Supervisar la red", "/admin/terraqo/red", Network],
          ["Abrir facturación", "/admin/terraqo/facturacion", ReceiptText],
          ["Terraqo Builders", "/admin/terraqo/builders", BriefcaseBusiness],
        ].map(([label, href, Icon]) => <Link key={String(href)} href={String(href)} className="group flex min-h-14 items-center justify-between gap-3 rounded-xl border border-white/12 bg-white/6 px-4 text-sm font-bold transition-colors hover:bg-white/11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7cd8d0]"><span className="flex items-center gap-3"><Icon className="h-5 w-5 text-[#7cd8d0]" aria-hidden="true" />{String(label)}</span><ArrowRight className="h-4 w-4 text-white/45 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></Link>)}</div></section>
      </div>
    </section>
  );
}
