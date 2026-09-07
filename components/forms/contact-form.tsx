"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ContactFormProps = {
  intent?: "contact" | "quote" | "service" | "product";
  context?: string;
  subject?: string;
};

export function ContactForm({ intent = "contact", context, subject }: ContactFormProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const submittedRef = useRef(false);

  async function submit(formData: FormData) {
    if (submittedRef.current || status === "loading" || status === "success") return;
    submittedRef.current = true;
    setStatus("loading");

    const endpoint = intent === "quote" || intent === "service" || intent === "product" ? "/api/quote" : "/api/contact";
    formData.set("intent", intent);
    if (context) formData.set("context", context);
    if (subject) formData.set("subject", subject);

    try {
      const response = await fetch(endpoint, { method: "POST", body: formData });
      setStatus(response.ok ? "success" : "error");
      if (!response.ok) submittedRef.current = false;
    } catch {
      setStatus("error");
      submittedRef.current = false;
    }
  }

  return (
    <form action={submit} className="grid gap-4 rounded-lg border bg-card p-5 shadow-technical">
      {subject ? (
        <div className="rounded-md border bg-muted px-3 py-2 text-sm">
          <span className="font-semibold">Solicitud sobre:</span> {subject}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Input required name="name" aria-label="Nombre y apellido" placeholder="Nombre y apellido" autoComplete="name" maxLength={120}/>
        <Input required name="email" aria-label="Correo electrónico" type="email" placeholder="Correo electrónico" autoComplete="email" maxLength={254}/>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input name="company" aria-label="Empresa (opcional)" placeholder="Empresa (opcional)" autoComplete="organization" maxLength={160}/>
        <Input name="phone" aria-label="Teléfono o WhatsApp" placeholder="Teléfono / WhatsApp" autoComplete="tel" maxLength={40}/>
      </div>
      <Textarea required name="message" aria-label="Describe tu solicitud" minLength={10} maxLength={5000} placeholder="Cuéntanos qué necesitas y el alcance de tu solicitud" />
      <Button disabled={status === "loading" || status === "success"} type="submit">
        {status === "loading" ? "Enviando..." : status === "success" ? "Solicitud enviada" : "Enviar solicitud"}
      </Button>
      {status === "success" ? <p role="status" className="text-sm font-medium text-accent">Solicitud registrada. El equipo de Terraqo la revisará.</p> : null}
      {status === "error" ? <p role="alert" className="text-sm font-medium text-destructive">No pudimos registrar la solicitud. Inténtalo nuevamente.</p> : null}
    </form>
  );
}
