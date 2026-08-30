import { revalidatePath } from "next/cache";
import { BadgeCheck, Clock3, Coins, Gift, Trophy, UsersRound } from "lucide-react";
import type { TerraqoBuilderContributionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { reviewBuilderContribution } from "@/lib/terraqo/builders";
import { requireAdminPage } from "@/lib/server/admin-page-auth";

export const dynamic = "force-dynamic";

async function reviewAction(formData: FormData) {
  "use server";
  const session = await requireAdminPage(["SUPER_ADMIN"]);
  await reviewBuilderContribution({ contributionId: String(formData.get("contributionId") || ""), reviewerId: session.user.id, status: String(formData.get("status") || "IN_REVIEW") as TerraqoBuilderContributionStatus, points: Number(formData.get("points") || 0), note: String(formData.get("note") || "") });
  revalidatePath("/admin/terraqo/builders");
  revalidatePath("/portal/recompensas");
}

async function foundingBuilderAction(formData: FormData) {
  "use server";
  await requireAdminPage(["SUPER_ADMIN"]);
  const accountId = String(formData.get("accountId") || "");
  const enabled = String(formData.get("enabled") || "false") === "true";
  if (!accountId) throw new Error("Cuenta Builder no encontrada.");
  await prisma.terraqoBuilderAccount.update({ where: { id: accountId }, data: { foundingBuilder: enabled } });
  revalidatePath("/admin/terraqo/builders");
  revalidatePath("/portal/red");
}

export default async function BuildersAdminPage() {
  await requireAdminPage(["SUPER_ADMIN"]);
  const [contributions, accounts, rewards, redeemed, leadingBuilders] = await Promise.all([
    prisma.terraqoBuilderContribution.findMany({ include: { user: { select: { name: true, email: true } } }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100 }),
    prisma.terraqoBuilderAccount.count(), prisma.terraqoBuilderReward.count({ where: { active: true } }),
    prisma.terraqoBuilderRedemption.aggregate({ where: { status: "FULFILLED" }, _sum: { pointsCost: true }, _count: true }),
    prisma.terraqoBuilderAccount.findMany({
      include: { user: { select: { name: true, email: true } } },
      orderBy: [{ foundingBuilder: "desc" }, { contributionScore: "desc" }],
      take: 24
    })
  ]);
  const pending = contributions.filter((item) => ["RECEIVED", "IN_REVIEW"].includes(item.status)).length;
  return <section className="space-y-7"><header><p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-primary">Plataforma Terraqo</p><h1 className="mt-2 font-display text-3xl font-black">Terraqo Builders</h1><p className="mt-2 text-sm text-muted-foreground">Revisa aportes, acredita TQ y controla el programa sin asignaciones automáticas por reportes enviados.</p></header>
    <div className="grid gap-4 md:grid-cols-4"><Metric icon={<Clock3 />} label="Pendientes" value={pending} /><Metric icon={<UsersRound />} label="Builders" value={accounts} /><Metric icon={<Gift />} label="Recompensas activas" value={rewards} /><Metric icon={<Coins />} label="TQ canjeados" value={redeemed._sum.pointsCost || 0} /></div>
    <div className="overflow-hidden rounded-xl border bg-white"><div className="border-b p-5"><h2 className="font-display text-xl font-black">Bandeja de aportes</h2><p className="mt-1 text-sm text-muted-foreground">Los puntos aprobados son el total acumulado del aporte. Al pasar de validado a implementado solo se acredita la diferencia.</p></div><div className="divide-y">{contributions.map((item) => <article key={item.id} className="grid gap-5 p-5 xl:grid-cols-[minmax(260px,1fr)_minmax(420px,1.4fr)]"><div><div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${item.status === "VALIDATED" || item.status === "IMPLEMENTED" ? "bg-emerald-100 text-emerald-800" : item.status === "REJECTED" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>{item.status}</span><span className="text-xs font-semibold text-muted-foreground">{item.type}</span></div><h3 className="mt-3 font-display text-lg font-black">{item.title}</h3><p className="mt-2 text-xs font-semibold text-muted-foreground">{item.user.name || "Usuario Terraqo"} · {item.user.email}</p><p className="mt-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">{item.detail}</p></div><form action={reviewAction} className="grid gap-3 rounded-xl border bg-muted/25 p-4 sm:grid-cols-2"><input type="hidden" name="contributionId" value={item.id} /><label className="grid gap-1 text-xs font-bold">Estado<select name="status" defaultValue={item.status} className="h-10 rounded-md border bg-white px-3 text-sm"><option value="IN_REVIEW">En revisión</option><option value="VALIDATED">Validado</option><option value="IMPLEMENTED">Implementado</option><option value="REJECTED">Rechazado</option></select></label><label className="grid gap-1 text-xs font-bold">TQ total aprobado<input name="points" type="number" min="0" max="1000" defaultValue={item.approvedPoints || item.requestedPoints} className="h-10 rounded-md border bg-white px-3 text-sm" /></label><label className="grid gap-1 text-xs font-bold sm:col-span-2">Nota de revisión<textarea name="note" rows={3} defaultValue={item.reviewNote || ""} className="rounded-md border bg-white p-3 text-sm" /></label><button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-white sm:col-span-2 sm:justify-self-end"><BadgeCheck className="h-4 w-4" />Guardar revisión</button></form></article>)}{!contributions.length ? <p className="p-10 text-center text-sm text-muted-foreground">No hay aportes registrados todavía.</p> : null}</div></div>
    <div className="rounded-xl border bg-white p-5"><div className="flex gap-3"><Trophy className="h-5 w-5 shrink-0 text-amber-600" /><div><h2 className="font-display text-xl font-black">Founding Builders</h2><p className="mt-1 text-sm text-muted-foreground">Insignia manual reservada para aportes sostenidos y de alto impacto. No depende únicamente del puntaje acumulado.</p></div></div><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{leadingBuilders.map((account) => <article key={account.id} className="flex items-center justify-between gap-3 rounded-lg border p-4"><div className="min-w-0"><strong className="block truncate text-sm">{account.user.name || account.user.email}</strong><span className="text-xs text-muted-foreground">{account.contributionScore.toLocaleString("es-PE")} de contribución</span></div><form action={foundingBuilderAction}><input type="hidden" name="accountId" value={account.id} /><input type="hidden" name="enabled" value={account.foundingBuilder ? "false" : "true"} /><button className={`rounded-md px-3 py-2 text-xs font-bold ${account.foundingBuilder ? "bg-amber-100 text-amber-900" : "border bg-white text-foreground"}`}>{account.foundingBuilder ? "Retirar insignia" : "Nombrar Founding"}</button></form></article>)}{!leadingBuilders.length ? <p className="text-sm text-muted-foreground">Aún no hay cuentas Builders.</p> : null}</div></div></section>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) { return <div className="rounded-xl border bg-white p-5"><span className="text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}</span><strong className="mt-4 block font-display text-3xl">{value.toLocaleString("es-PE")}</strong><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>; }
