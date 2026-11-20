import Link from "next/link";

export function PrivacyNavigation({ active }: { active: "documents" | "plan" }) {
  return <nav aria-label="Privacidad y cuenta" className="flex flex-wrap gap-x-6 gap-y-2 border-b border-slate-300 pb-3 text-sm font-semibold">
    {process.env.TERRAQO_SCOPED_SHARING_V1 === "true" && <Link className="inline-flex min-h-11 items-center text-primary" href="/portal/accesos">Accesos compartidos</Link>}
    <Link aria-current={active === "documents" ? "page" : undefined} className="inline-flex min-h-11 items-center text-primary aria-[current=page]:text-slate-950" href="/portal/documentos">Documentos privados</Link>
    <Link aria-current={active === "plan" ? "page" : undefined} className="inline-flex min-h-11 items-center text-primary aria-[current=page]:text-slate-950" href="/portal/membresia">Mi plan y uso</Link>
  </nav>;
}
