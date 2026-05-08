"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { ArrowRight, Building2, ChevronDown, Mail, Phone, UserRound } from "lucide-react";

export function ServiceEvaluationForm({ serviceTitle, sectorOptions = [] }: { serviceTitle: string; sectorOptions?: string[] }) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const submittedRef = useRef(false);

  async function submit(formData: FormData) {
    if (submittedRef.current || status === "loading" || status === "success") return;
    submittedRef.current = true;
    setStatus("loading");
    formData.set("intent", "service");
    formData.set("context", serviceTitle);
    formData.set("subject", `Evaluacion tecnica: ${serviceTitle}`);

    const response = await fetch("/api/quote", { method: "POST", body: formData });
    setStatus(response.ok ? "success" : "error");
    if (!response.ok) submittedRef.current = false;
  }

  return (
    <form action={submit} className="rounded-sm border border-[#24C8EE]/28 bg-[#061827]/88 p-6 text-white shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-xl">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#7DE4FF]">Solicita una evaluacion tecnica</p>
      <p className="mt-3 text-sm leading-6 text-white/72">Cuentanos sobre tu proyecto y nuestro equipo te brindara la mejor solucion geomatica.</p>
      <div className="mt-6 grid gap-3">
        <Field icon={UserRound}><input required name="name" placeholder="Nombre y apellidos" autoComplete="name" /></Field>
        <Field icon={Building2}><input name="company" placeholder="Empresa" autoComplete="organization" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field icon={Phone}><input name="phone" placeholder="Telefono / WhatsApp" autoComplete="tel" /></Field>
          <Field icon={Mail}><input required name="email" type="email" placeholder="Correo corporativo" autoComplete="email" /></Field>
        </div>
        <div className="relative">
          <select name="projectType" className="h-12 w-full appearance-none rounded-sm border border-white/12 bg-[#0B2030] px-4 pr-11 text-sm text-white outline-none transition focus:border-[#24C8EE]/60">
            <option value="">Tipo de proyecto</option>
            {sectorOptions.map((sector) => <option key={sector} value={sector}>{sector}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white" />
        </div>
        <textarea required name="message" placeholder="Cuentanos los detalles de tu proyecto o requerimiento tecnico" className="min-h-24 rounded-sm border border-white/12 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none placeholder:text-white/42" />
      </div>
      <button disabled={status === "loading" || status === "success"} type="submit" className="mt-4 inline-flex w-full items-center justify-center gap-3 rounded-sm bg-[#1496D4] px-5 py-4 text-sm font-bold text-white transition hover:bg-[#24C8EE] disabled:opacity-70">
        {status === "loading" ? "Enviando..." : status === "success" ? "Solicitud enviada" : "Solicitar evaluacion tecnica"}
        <ArrowRight className="h-4 w-4" />
      </button>
      <p className="mt-3 text-center text-xs font-medium text-[#7DE4FF]">{status === "error" ? "No pudimos registrar la solicitud. Intentalo nuevamente." : "Respuesta en menos de 24 horas"}</p>
    </form>
  );
}

function Field({ icon: Icon, children }: { icon: typeof UserRound; children: ReactNode }) {
  return (
    <label className="flex h-12 items-center gap-3 rounded-sm border border-white/12 bg-white/[0.06] px-4 text-white">
      <Icon className="h-4 w-4 shrink-0 text-[#24C8EE]" />
      <span className="min-w-0 flex-1 [&_input]:w-full [&_input]:bg-transparent [&_input]:text-sm [&_input]:text-white [&_input]:outline-none [&_input::placeholder]:text-white/42">
        {children}
      </span>
    </label>
  );
}
