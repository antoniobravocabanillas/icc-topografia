"use client";

import { useState, useTransition } from "react";
import { ArrowRight, BriefcaseBusiness, Building2, CheckCircle2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocationSelect } from "@/components/location/location-select";

type AccountType = "client" | "professional";

const accountOptions: Array<{
  value: AccountType;
  title: string;
  description: string;
  icon: typeof Building2;
}> = [
  {
    value: "client",
    title: "Empresas",
    description: "Empresas que solicitan servicios, cotizaciones o seguimiento de proyectos.",
    icon: Building2
  },
  {
    value: "professional",
    title: "Profesionales",
    description: "Técnicos, especialistas y profesionales que quieren participar en proyectos.",
    icon: BriefcaseBusiness
  }
];

export function ClientRegistrationForm() {
  const [accountType, setAccountType] = useState<AccountType>("client");
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountType,
          name: String(formData.get("name") || ""),
          email: String(formData.get("email") || ""),
          password: String(formData.get("password") || ""),
          company: String(formData.get("company") || ""),
          document: String(formData.get("document") || ""),
          phone: String(formData.get("phone") || ""),
          roleTitle: String(formData.get("roleTitle") || ""),
          specialty: String(formData.get("specialty") || ""),
          country: String(formData.get("country") || "PE"),
          subdivision: String(formData.get("subdivision") || ""),
          city: String(formData.get("city") || ""),
          yearsExperience: String(formData.get("yearsExperience") || ""),
          equipment: String(formData.get("equipment") || ""),
          software: String(formData.get("software") || ""),
          portfolioUrl: String(formData.get("portfolioUrl") || "")
        })
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error?.message || payload?.error || "No se pudo registrar la solicitud.");
        return;
      }

      setVerificationEmail(String(formData.get("email") || ""));
      setMessage(
        payload?.data?.emailDelivery === "sent"
          ? "Cuenta creada. Te enviamos un codigo al correo para validar el acceso."
          : "Cuenta creada. Falta configurar el proveedor de correo para enviar codigos automaticamente."
      );
    });
  }

  function verify(formData: FormData) {
    if (!verificationEmail) return;
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: verificationEmail,
          code: String(formData.get("code") || "")
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error?.message || "No se pudo validar el correo.");
        return;
      }
      setMessage("Correo validado. Ya puedes ingresar al Portal Terraqo.");
      setVerificationEmail(null);
    });
  }

  const activeCopy =
    accountType === "professional"
      ? {
          eyebrow: "Red profesional",
          title: "Crear cuenta profesional",
          text: "Tu perfil puede alimentar el CV vivo, postulaciones y participación privada en proyectos.",
          icon: UserRound
        }
      : {
          eyebrow: "Portal cliente",
          title: "Crear cuenta de cliente",
          text: "El acceso queda pendiente hasta validar empresa, contacto y relacion comercial.",
          icon: Building2
        };
  const ActiveIcon = activeCopy.icon;

  if (verificationEmail) {
    return (
      <form action={verify} className="relative overflow-hidden rounded-lg border bg-card p-6 text-foreground shadow-2xl md:p-8">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-[#24C8EE] to-primary" />
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Validacion de correo</p>
        <h2 className="mt-2 font-display text-2xl font-bold">Ingresa el codigo enviado</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Enviamos un codigo de 6 digitos a <span className="font-semibold text-foreground">{verificationEmail}</span>. La cuenta queda protegida hasta confirmar el correo.
        </p>
        <div className="mt-6 grid gap-4">
          <Input name="code" required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="Codigo de 6 digitos" autoComplete="one-time-code" />
          <Button type="submit" size="lg" disabled={isPending} className="w-full">
            {isPending ? "Validando..." : "Validar correo"}
            <ArrowRight className="h-4 w-4" />
          </Button>
          {message ? <p className="flex items-center gap-2 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" /> {message}</p> : null}
          {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
        </div>
      </form>
    );
  }

  return (
    <form action={submit} className="relative overflow-hidden rounded-lg border bg-card p-6 text-foreground shadow-2xl md:p-8">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-[#24C8EE] to-primary" />
      <div className="mb-6 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <ActiveIcon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{activeCopy.eyebrow}</p>
          <h2 className="mt-1 font-display text-2xl font-bold">{activeCopy.title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{activeCopy.text}</p>
        </div>
      </div>

      <div className="mb-5 grid gap-2 sm:grid-cols-2">
        {accountOptions.map((option) => {
          const Icon = option.icon;
          const active = option.value === accountType;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setAccountType(option.value)}
              className={`rounded-md border p-3 text-left transition ${
                active ? "border-primary bg-primary/10 text-primary" : "bg-muted/30 hover:bg-muted"
              }`}
            >
              <Icon className="h-4 w-4" />
              <p className="mt-2 text-sm font-bold">{option.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4">
        <Input name="name" required placeholder="Nombre y apellido" autoComplete="name" />
        <Input name="phone" placeholder="Teléfono / WhatsApp" autoComplete="tel" />
        <Input name="email" type="email" required placeholder="Correo" autoComplete="email" />

        {accountType === "client" ? (
          <>
            <Input name="company" required placeholder="Empresa / razón social" autoComplete="organization" />
            <Input name="document" placeholder="RUC / documento" />
            <LocationSelect required />
          </>
        ) : (
          <>
            <Input name="roleTitle" placeholder="Cargo o perfil profesional" />
            <Input name="specialty" placeholder="Especialidad tecnica" />
            <LocationSelect required />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input name="yearsExperience" type="number" min={0} placeholder="Anios de experiencia" />
            </div>
            <Input name="equipment" placeholder="Equipos que maneja, separados por coma" />
            <Input name="software" placeholder="Software que utiliza, separado por coma" />
            <Input name="portfolioUrl" type="url" placeholder="CV, portafolio o LinkedIn" />
          </>
        )}

        <Input name="password" type="password" required minLength={8} placeholder="Contraseña" autoComplete="new-password" />
        <Button type="submit" size="lg" disabled={isPending} className="w-full">
          {isPending ? "Creando cuenta..." : accountType === "professional" ? "Crear cuenta profesional" : "Crear cuenta de cliente"}
          <ArrowRight className="h-4 w-4" />
        </Button>
        {message ? <p className="flex items-center gap-2 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" /> {message}</p> : null}
        {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
      </div>
    </form>
  );
}
