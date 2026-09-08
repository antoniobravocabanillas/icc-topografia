import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePlatformBillingAdmin } from "@/lib/terraqo/billing/authorization";
import { billingMode, BillingError } from "@/lib/terraqo/billing/provider";
import { reconcileAccount } from "@/lib/terraqo/billing/service";
import { BILLING_PLANS, money } from "@/lib/terraqo/billing/catalog";
import { provisionConfiguredPlans } from "@/lib/terraqo/billing/plan-provisioning";
export const dynamic="force-dynamic";
export const metadata={title:"Facturación de la plataforma | Terraqo",robots:{index:false,follow:false}};
async function initializePlans(){
  "use server";
  const actor=await requirePlatformBillingAdmin();let result="updated";
  try{await provisionConfiguredPlans(actor.id);}catch{result="provider-review";}
  redirect(`/admin/terraqo/facturacion?result=${result}`);
}

async function reconcile(form:FormData){
  "use server";
  const actor=await requirePlatformBillingAdmin();
  const accountId=String(form.get("accountId")||"");
  const account=await prisma.terraqoBillingAccount.findFirst({where:{id:accountId,mode:billingMode()}});
  if(!account)redirect("/admin/terraqo/facturacion?result=not-found");
  let result="updated";
  try{await reconcileAccount(account.id);await prisma.terraqoBillingAudit.create({data:{actorId:actor.id,accountId:account.id,action:"ADMIN_RECONCILIATION_REQUESTED"}});}catch(error){result=error instanceof BillingError?error.code:"unavailable";}
  redirect(`/admin/terraqo/facturacion?result=${encodeURIComponent(result)}`);
}
async function availability(form:FormData){
  "use server";
  const actor=await requirePlatformBillingAdmin();
  const id=String(form.get("planId")||"");
  const enabled=form.get("enabled")==="true";
  await prisma.$transaction(async tx=>{
    const updated=await tx.terraqoBillingPlan.updateMany({where:{id,mode:billingMode()},data:{enabled}});
    if(updated.count)await tx.terraqoBillingAudit.create({data:{actorId:actor.id,action:"PLAN_SALES_CHANGED",detail:{planId:id,enabled}}});
  });
  redirect("/admin/terraqo/facturacion?result=updated");
}
export default async function PlatformBillingPage({searchParams}:{searchParams:Promise<{page?:string;result?:string}>}){
  await requirePlatformBillingAdmin();
  const query=await searchParams;const page=Math.min(10000,Math.max(1,Number(query.page)||1));const mode=billingMode();
  const [accounts,total,plans,amounts,events]=await Promise.all([
    prisma.terraqoBillingAccount.findMany({where:{mode},orderBy:{updatedAt:"desc"},take:25,skip:(page-1)*25,include:{user:{select:{name:true}},workspace:{select:{name:true}}}}),
    prisma.terraqoBillingAccount.count({where:{mode}}),
    prisma.terraqoBillingPlan.findMany({where:{mode},orderBy:[{code:"asc"},{cycle:"asc"}]}),
    prisma.terraqoBillingPayment.aggregate({where:{account:{mode},paidAt:{gte:new Date(Date.UTC(new Date().getUTCFullYear(),new Date().getUTCMonth(),1))}},_sum:{amountMinor:true,refundedMinor:true}}),
    prisma.terraqoBillingAudit.findMany({orderBy:{createdAt:"desc"},take:30,select:{id:true,action:true,createdAt:true,accountId:true}}),
  ]);
  const button="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600";
  return <main className="mx-auto max-w-7xl space-y-8 p-4 text-slate-900 md:p-8"><Link href="/admin/terraqo">← Plataforma Terraqo</Link><header><p className="text-sm font-semibold text-blue-700">Administración de la plataforma · {mode==="test"?"Sandbox":"Producción"}</p><h1 className="mt-2 text-3xl font-bold">Suscripciones y facturación</h1><p className="mt-3 text-slate-600">Este panel pertenece a Terraqo, no al workspace de una empresa. Los estados se verifican con Culqi; no se pueden marcar pagos manualmente como aprobados.</p></header>
    {query.result&&<p role="status" className="rounded-lg bg-blue-50 p-4">{query.result==="updated"?"Operación registrada. Revisa el estado actualizado.":"No se completó la conciliación. La cuenta permanece protegida frente a cobros duplicados."}</p>}
    <section className="grid gap-4 sm:grid-cols-2"><article className="rounded-xl border bg-white p-6"><h2>{mode==="test"?"Volumen simulado del mes (no es ingreso)":"Cobros netos de devoluciones del mes"}</h2><p className="mt-3 text-3xl font-semibold">{money((amounts._sum.amountMinor||0)-(amounts._sum.refundedMinor||0))}</p><p className="mt-2 text-sm text-slate-600">No equivale a utilidad, saldo liquidado ni ingreso contable devengado. Descontar impuestos, comisiones y costos.</p></article><article className="rounded-xl border bg-white p-6"><h2>Cuentas de facturación</h2><p className="mt-3 text-3xl font-semibold">{total}</p><p className="mt-2 text-sm text-slate-600">Las cuentas gratuitas sin operaciones no necesitan registro de pago.</p></article></section>
    <section><h2 className="mb-4 text-xl font-semibold">Operaciones y activación</h2><div className="grid gap-4">{accounts.map(account=><article key={account.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-white p-5"><div className="min-w-0"><h3 className="font-semibold">{account.workspace?.name||account.user.name||"Cuenta personal"}</h3><p className="break-all text-sm text-slate-600">{account.planCode} · {account.cycle} · {account.status}</p><p className="text-sm">{account.paidThrough?`Pagado hasta ${account.paidThrough.toLocaleDateString("es-PE")}`:"Sin pago verificado"}{account.cancelAtPeriodEnd?" · Renovación cancelada":""}</p></div><form action={reconcile}><input type="hidden" name="accountId" value={account.id}/><button className={button}>Conciliar con Culqi</button></form></article>)}{!accounts.length&&<p>Aún no hay operaciones en este entorno.</p>}</div><nav className="mt-4 flex gap-6" aria-label="Paginación">{page>1&&<Link href={`?page=${page-1}`}>Anterior</Link>}{page*25<total&&<Link href={`?page=${page+1}`}>Siguiente</Link>}</nav></section>
    <section><h2 className="mb-4 text-xl font-semibold">Planes habilitados para nuevas compras</h2><p className="mb-4 text-sm text-slate-600">Pausar ventas no cancela suscripciones existentes. Los precios de contratos anteriores no se modifican retroactivamente.</p><div className="grid gap-4 md:grid-cols-2">{plans.map(plan=><article className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-white p-5" key={plan.id}><div><h3 className="font-semibold">{BILLING_PLANS.find(p=>p.code===plan.code)?.name||plan.code}</h3><p>{money(plan.amountMinor)} · {plan.cycle==="ANNUAL"?"Anual":"Mensual"}</p><p className="text-sm">{plan.enabled?"Disponible":"Ventas pausadas"}</p></div><form action={availability}><input type="hidden" name="planId" value={plan.id}/><input type="hidden" name="enabled" value={String(!plan.enabled)}/><button className={button}>{plan.enabled?"Pausar ventas":"Reabrir ventas"}</button></form></article>)}</div></section>
    <section><h2 className="mb-4 text-xl font-semibold">Configuración del catálogo</h2><p className="mb-4 text-sm text-slate-600">Sincroniza los precios versionados con Culqi en el entorno indicado arriba. No crea suscripciones ni cobra a usuarios. Los importes superiores al límite de la pasarela quedan sin habilitar.</p><form action={initializePlans}><button className={button}>Sincronizar planes con Culqi</button></form></section>
    <section><h2 className="mb-4 text-xl font-semibold">Trazabilidad reciente</h2><ul className="space-y-2 text-sm">{events.map(event=><li className="break-words" key={event.id}><time>{event.createdAt.toLocaleString("es-PE")}</time> · {event.action}</li>)}</ul></section>
  </main>;
}
