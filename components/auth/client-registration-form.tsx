"use client";

import { useState, useTransition } from "react";
import { ArrowRight, BriefcaseBusiness, Building2, CheckCircle2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { companyIndustries, professionalIdentityTypes, professionalRoles } from "@/lib/terraqo/registration-options";

type AccountType = "client" | "professional";

export function ClientRegistrationForm({ embedded = false, onSignIn }: { embedded?: boolean; onSignIn?: () => void }) {
  const [accountType, setAccountType] = useState<AccountType>("client");
  const [identityType, setIdentityType] = useState("DNI");
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const email = String(formData.get("email") || "");
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountType, name: String(formData.get("name") || ""), email,
          password: String(formData.get("password") || ""), phone: String(formData.get("phone") || ""),
          company: String(formData.get("company") || ""), industry: String(formData.get("industry") || ""),
          identityType: accountType === "client" ? "RUC" : identityType,
          identityTypeOther: String(formData.get("identityTypeOther") || ""),
          document: String(formData.get("document") || ""),
          roleTitle: String(formData.get("roleTitle") || ""), specialty: String(formData.get("roleTitle") || ""), country: "PE"
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error?.message || payload?.error || "No se pudo crear la cuenta.");
        return;
      }
      setVerificationEmail(email);
    });
  }

  if (verificationEmail) {
    return (
      <div className={embedded ? "tq-embedded-auth-form tq-registration-success" : "rounded-lg border bg-card p-8"}>
        <span className="tq-success-mark"><MailCheck className="h-7 w-7" /></span>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Revisa tu correo</p>
        <h2 className="mt-2 font-display text-2xl font-bold">Confirma tu cuenta</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Enviamos un enlace de verificación a <strong className="text-foreground">{verificationEmail}</strong>. Ábrelo para activar tu acceso.</p>
        <div className="tq-next-step"><CheckCircle2 className="h-5 w-5" /><span>Después de verificar, inicia sesión y completa tu perfil.</span></div>
        {onSignIn ? <button type="button" onClick={onSignIn} className="tq-secondary-action">Volver a iniciar sesión <ArrowRight className="h-4 w-4" /></button> : null}
      </div>
    );
  }

  return (
    <form action={submit} className={embedded ? "tq-embedded-auth-form tq-register-form" : "relative rounded-lg border bg-card p-8"}>
      <div className="mb-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Únete a la red Terraqo</p>
        <h2 className="mt-1 font-display text-2xl font-bold">Crea tu cuenta</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Solo pedimos lo necesario. Completarás tu perfil después de verificar el correo.</p>
      </div>
      <div className="tq-account-type" aria-label="Tipo de cuenta">
        <button type="button" onClick={() => setAccountType("client")} className={accountType === "client" ? "is-active" : ""}><Building2 className="h-4 w-4" /><span><strong>Empresa</strong><small>Organización o negocio</small></span></button>
        <button type="button" onClick={() => setAccountType("professional")} className={accountType === "professional" ? "is-active" : ""}><BriefcaseBusiness className="h-4 w-4" /><span><strong>Profesional</strong><small>Especialista independiente</small></span></button>
      </div>
      <div className="grid gap-3.5">
        <Input name="name" required placeholder="Nombre y apellido" autoComplete="name" />
        <div className="grid gap-3.5 sm:grid-cols-2"><Input name="email" type="email" required placeholder="Correo" autoComplete="email" /><Input name="phone" placeholder="Teléfono / WhatsApp" autoComplete="tel" /></div>
        {accountType === "client" ? (
          <>
            <div className="grid gap-3.5 sm:grid-cols-2"><Input name="company" required placeholder="Empresa / razón social" autoComplete="organization" /><select name="industry" required defaultValue="" aria-label="Rubro de la empresa"><option value="" disabled>Selecciona el rubro</option>{companyIndustries.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
            <Input name="document" required inputMode="numeric" pattern="[0-9]{11}" maxLength={11} placeholder="RUC · 11 dígitos" autoComplete="off" />
          </>
        ) : (
          <>
            <div><Input name="roleTitle" list="terraqo-professions" required placeholder="Cargo, profesión o carrera" autoComplete="organization-title" /><datalist id="terraqo-professions">{professionalRoles.map((item) => <option key={item} value={item} />)}</datalist><p className="mt-1.5 text-xs text-muted-foreground">Busca por cargo o carrera. Si no aparece, escríbelo libremente.</p></div>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <select name="identityType" value={identityType} onChange={(event) => setIdentityType(event.target.value)} aria-label="Tipo de identificación">{professionalIdentityTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
              <Input name="document" required minLength={5} maxLength={24} placeholder="Número de documento" autoComplete="off" />
            </div>
            {identityType === "OTHER" ? <Input name="identityTypeOther" required placeholder="Especifica el tipo de identificación" /> : null}
          </>
        )}
        <Input name="password" type="password" required minLength={8} placeholder="Contraseña · mínimo 8 caracteres" autoComplete="new-password" />
        <Button type="submit" size="lg" disabled={isPending} className="w-full">{isPending ? "Creando cuenta..." : "Crear cuenta"}<ArrowRight className="h-4 w-4" /></Button>
        {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
      </div>
      {onSignIn ? <p className="tq-auth-switch">¿Ya tienes cuenta? <button type="button" onClick={onSignIn}>Iniciar sesión</button></p> : null}
    </form>
  );
}
