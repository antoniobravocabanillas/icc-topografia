"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";

export type CompanyPriority = { label: string; count: number; href: string; category: "Atención" | "Comercial" | "Operación"; action: string };
export function CompanyPriorities({ items }: { items: CompanyPriority[] }) {
  const [filter, setFilter] = useState("Todas");
  const visible = items.filter(item => item.count > 0 && (filter === "Todas" || filter === item.category));
  return <section className="rounded-xl border bg-white p-5 sm:p-6">
    <h2 className="text-xl font-semibold tracking-tight">Lo que necesita atención</h2>
    <div aria-label="Filtrar pendientes" className="my-4 flex flex-wrap gap-2">{["Todas", "Atención", "Comercial", "Operación"].map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-11 rounded-full border px-4 text-sm font-medium ${filter === value ? "border-primary/20 bg-primary/10 text-primary" : "border-transparent text-muted-foreground hover:bg-muted"}`}>{value}</button>)}</div>
    <div className="divide-y">{visible.map(item => <Link key={item.label} href={item.href} className="group flex min-h-20 items-center gap-4 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><span className="min-w-10 text-center text-xl font-semibold tabular-nums">{item.count}</span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.label}</span><span className="text-xs text-muted-foreground">{item.category}</span></span><span className="inline-flex items-center gap-1 text-sm font-medium text-primary">{item.action}<ArrowUpRight className="h-4 w-4" /></span></Link>)}</div>
    {!visible.length && <div className="flex min-h-32 items-center gap-3 text-sm text-muted-foreground"><CheckCircle2 className="h-5 w-5 text-emerald-700" />No hay pendientes en esta categoría.</div>}
  </section>;
}
