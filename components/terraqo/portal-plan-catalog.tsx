"use client";
import { useState } from "react";
import { BILLING_PLANS, money, planAmount, supportsBillingCycle, type BillingCycle } from "@/lib/terraqo/billing/catalog";

export function PortalPlanCatalog({cycle,onCycle,onSelect,busy}:{cycle:BillingCycle;onCycle:(cycle:BillingCycle)=>void;onSelect:(code:string)=>void;busy:boolean}){
  const [audience,setAudience]=useState("PERSONAL");
  return <section id="planes" aria-labelledby="planes-title" className="scroll-mt-24 py-6">
    <h2 id="planes-title" className="text-2xl font-semibold text-slate-900">Más capacidad para tu siguiente etapa</h2>
    <p className="mt-2 text-slate-600">Compara las membresías sin salir del panel. Revisa el total antes de autorizar cualquier pago.</p>
    <div className="my-6 flex flex-wrap gap-4">
      <div className="flex flex-wrap gap-2" aria-label="Tipo de cuenta">{[["PERSONAL","Profesional"],["WORKSPACE","Empresa"]].map(([value,label])=><button key={value} disabled={busy} aria-pressed={audience===value} onClick={()=>setAudience(value)} className={`rounded-lg border px-4 py-2 focus-visible:outline focus-visible:outline-2 ${audience===value?"bg-blue-700 text-white":"bg-white text-slate-700"}`}>{label}</button>)}</div>
      <div className="flex flex-wrap gap-2" aria-label="Periodicidad">{(["MONTHLY","ANNUAL"] as const).map(value=><button key={value} disabled={busy} aria-pressed={cycle===value} onClick={()=>onCycle(value)} className={`rounded-lg border px-4 py-2 focus-visible:outline focus-visible:outline-2 ${cycle===value?"bg-blue-700 text-white":"bg-white text-slate-700"}`}>{value==="MONTHLY"?"Mensual":"Anual · ahorra 2 meses"}</button>)}</div>
    </div>
    <div className="grid min-w-0 gap-5 md:grid-cols-2 xl:grid-cols-3">{BILLING_PLANS.filter(p=>p.audience===audience).map(p=><article key={p.code} className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-6 text-slate-900">
      <h3 className="text-xl font-semibold">{p.name}</h3><p className="mt-3 text-sm leading-6 text-slate-600">{p.description}</p>
      <p className="my-5 text-2xl font-semibold">{money(planAmount(p,cycle))}<span className="text-sm font-normal text-slate-600"> / {cycle==="MONTHLY"?"mes":"año"}</span></p>
      <ul className="mb-6 space-y-2 text-sm text-slate-600"><li>{p.storageMb<1000?`${p.storageMb} MB`:`${p.storageMb/1000} GB`} de almacenamiento</li><li>{p.aiActions} asistencias de redacción al mes</li><li>{p.seats} usuario(s)</li></ul>
      {p.monthlyMinor===0?<p className="mt-auto text-sm">Disponible sin tarjeta. Tu cuenta gratuita no caduca.</p>:<button disabled={busy} className="mt-auto rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 focus-visible:outline focus-visible:outline-2" onClick={()=>{if(!supportsBillingCycle(p,cycle))onCycle("MONTHLY");onSelect(p.code);document.getElementById("facturacion")?.scrollIntoView({block:"start"});}}>{supportsBillingCycle(p,cycle)?`Elegir ${p.name}`:"Elegir con pago mensual"}</button>}
    </article>)}</div>
    <p className="mt-4 text-sm text-slate-600">Precios en soles, IGV incluido cuando corresponde. El período anual se paga por adelantado. No hay cargos automáticos por excedentes.</p>
  </section>;
}
