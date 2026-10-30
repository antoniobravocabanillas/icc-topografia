"use client";

import { useId, useState, useTransition } from "react";
import { ArrowRight, BriefcaseBusiness, Building2, CheckCircle2, Eye, EyeOff, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { companyIndustries, professionalIdentityTypes, professionalRoles } from "@/lib/terraqo/registration-options";
import { SocialAccess, type SocialProviders } from "@/components/auth/social-access";

type AccountType = "client" | "professional";

export function ClientRegistrationForm({ embedded = false, onSignIn, initialType = "professional", socialProviders = { google: false, apple: false, microsoft: false } }: { embedded?: boolean; onSignIn?: () => void; initialType?: AccountType; socialProviders?: SocialProviders }) {
  const fieldId = useId();
  const [accountType, setAccountType] = useState<AccountType>(initialType);
  const [identityType, setIdentityType] = useState("DNI");
  const [showPassword, setShowPassword] = useState(false);
  const [emailDelivered, setEmailDelivered] = useState(true);
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
      setEmailDelivered(payload?.data?.emailDelivery === "sent");
      setVerificationEmail(email);
    });
  }

  if (verificationEmail) {
    return (
      <div className={embedded ? "tq-embedded-auth-form tq-registration-success" : "rounded-lg border bg-card p-8"}>
        <span className="tq-success-mark"><MailCheck className="h-7 w-7" /></span>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Revisa tu correo</p>
        <h2 data-access-heading tabIndex={-1} className="mt-2 font-display text-2xl font-bold">Confirma tu cuenta</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{emailDelivered ? <>Enviamos un enlace de verificación a <strong className="text-foreground">{verificationEmail}</strong>. Ábrelo para activar tu acceso.</> : <>La cuenta fue creada, pero el servicio de correo todavía no está disponible. No se envió ningún mensaje a <strong className="text-foreground">{verificationEmail}</strong>.</>}</p>
        <div className="tq-next-step"><CheckCircle2 className="h-5 w-5" /><span>Después de verificar, inicia sesión y completa tu perfil.</span></div>
        {onSignIn ? <button type="button" onClick={onSignIn} className="tq-secondary-action">Volver a iniciar sesión <ArrowRight className="h-4 w-4" /></button> : null}
      </div>
    );
  }

  return (
    <form action={submit} className={embedded ? "tq-embedded-auth-form tq-register-form" : "relative rounded-lg border bg-card p-8"}>
      <div className="tq-auth-heading">
        <p>Únete a Terraqo</p>
        <h2 data-access-heading tabIndex={-1}>Crea tu cuenta</h2>
        <span>Empieza con lo esencial. Completarás tu perfil después de verificar el correo.</span>
      </div>
      <div className="tq-account-type" role="group" aria-label="Tipo de cuenta">
        <button type="button" aria-pressed={accountType === "professional"} onClick={() => setAccountType("professional")} className={accountType === "professional" ? "is-active" : ""}><BriefcaseBusiness aria-hidden="true" className="h-4 w-4" /><span><strong>Profesional</strong><small>Especialista independiente</small></span></button>
        <button type="button" aria-pressed={accountType === "client"} onClick={() => setAccountType("client")} className={accountType === "client" ? "is-active" : ""}><Building2 aria-hidden="true" className="h-4 w-4" /><span><strong>Empresa</strong><small>Organización o negocio</small></span></button>
      </div>
      {accountType === "professional" ? <SocialAccess providers={socialProviders} intent="register" /> : null}
      <div className="grid gap-3.5">
        <label className="tq-registration-field">Nombre y apellido<Input name="name" required placeholder="Tal como aparece en tu documento" autoComplete="name" /></label>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <label className="tq-registration-field">Correo electrónico<Input name="email" type="email" required placeholder="tu@correo.com" autoComplete="email" /></label>
          <label className="tq-registration-field">Teléfono (opcional)<Input name="phone" type="tel" placeholder="Teléfono / WhatsApp" autoComplete="tel" /></label>
        </div>
        {accountType === "client" ? (
          <>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <label className="tq-registration-field">Empresa / razón social<Input name="company" required placeholder="Nombre de la empresa" autoComplete="organization" /></label>
              <div className="tq-registration-field"><label htmlFor={`${fieldId}-industry`}>Rubro de la empresa</label><select id={`${fieldId}-industry`} name="industry" required defaultValue=""><option value="" disabled>Selecciona el rubro</option>{companyIndustries.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
            </div>
            <label className="tq-registration-field">RUC<Input name="document" required inputMode="numeric" pattern="[0-9]{11}" maxLength={11} placeholder="11 dígitos" autoComplete="off" /></label>
          </>
        ) : (
          <>
            <div><label className="tq-registration-field">Cargo, profesión o carrera<Input name="roleTitle" list={`${fieldId}-professions`} aria-describedby={`${fieldId}-role-help`} required placeholder="Escribe o selecciona tu especialidad" autoComplete="organization-title" /></label><datalist id={`${fieldId}-professions`}>{professionalRoles.map((item) => <option key={item} value={item} />)}</datalist><p id={`${fieldId}-role-help`} className="mt-1.5 text-xs text-muted-foreground">Busca por cargo o carrera. Si no aparece, escríbelo libremente.</p></div>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <div className="tq-registration-field"><label htmlFor={`${fieldId}-identity`}>Tipo de identificación</label><select id={`${fieldId}-identity`} name="identityType" value={identityType} onChange={(event) => setIdentityType(event.target.value)}>{professionalIdentityTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
              <label className="tq-registration-field">Número de documento<Input name="document" required minLength={5} maxLength={24} placeholder="Ingresa tu documento" autoComplete="off" /></label>
            </div>
            {identityType === "OTHER" ? <label className="tq-registration-field">Otro tipo de identificación<Input name="identityTypeOther" required placeholder="Especifica el tipo de identificación" /></label> : null}
          </>
        )}
        <div className="tq-registration-field">
          <label htmlFor={`${fieldId}-password`}>Contraseña · mínimo 8 caracteres</label>
          <div className="tq-password-field">
            <Input id={`${fieldId}-password`} name="password" type={showPassword ? "text" : "password"} required minLength={8} placeholder="Crea una contraseña segura" autoComplete="new-password" />
            <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={showPassword}>{showPassword ? <EyeOff /> : <Eye />}</button>
          </div>
        </div>
        <Button type="submit" size="lg" disabled={isPending} className="w-full">{isPending ? "Creando cuenta..." : "Crear cuenta"}<ArrowRight className="h-4 w-4" /></Button>
        {error ? <p role="alert" className="tq-auth-feedback is-error">{error}</p> : null}
      </div>
      {onSignIn ? <p className="tq-auth-switch">¿Ya tienes cuenta? <button type="button" onClick={onSignIn}>Iniciar sesión</button></p> : null}
    </form>
  );
}
