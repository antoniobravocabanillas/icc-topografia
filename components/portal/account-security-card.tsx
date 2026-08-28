"use client";

import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { BadgeCheck, Fingerprint, MailCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AccountSecurityCard({ email, emailVerified, passkeyCount }: { email: string; emailVerified: boolean; passkeyCount: number }) {
  const [newEmail, setNewEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"email" | "passkey" | "">("");
  const [devices, setDevices] = useState(passkeyCount);

  async function requestEmailChange() {
    setBusy("email"); setMessage("");
    try {
      const response = await fetch("/api/auth/change-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: newEmail }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No pudimos iniciar el cambio.");
      setMessage("Enviamos una confirmación al nuevo correo. El actual seguirá activo hasta que abras ese enlace.");
      setNewEmail("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "No pudimos iniciar el cambio."); }
    finally { setBusy(""); }
  }

  async function activatePasskey() {
    setBusy("passkey"); setMessage("");
    try {
      const optionsResponse = await fetch("/api/auth/passkey/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "options" }) });
      const optionsPayload = await optionsResponse.json();
      if (!optionsResponse.ok) throw new Error(optionsPayload.error || "No pudimos iniciar la activación.");
      const credential = await startRegistration(optionsPayload.data.options);
      const verifyResponse = await fetch("/api/auth/passkey/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify", challengeId: optionsPayload.data.challengeId, response: credential, deviceName: navigator.userAgent.includes("Mobile") ? "Teléfono personal" : "Equipo personal" }) });
      const verifyPayload = await verifyResponse.json();
      if (!verifyResponse.ok) throw new Error(verifyPayload.error || "No pudimos verificar el dispositivo.");
      setDevices((value) => value + 1);
      setMessage("Acceso seguro activado. En el próximo inicio podrás usar huella, rostro, PIN o patrón compatible.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "No pudimos activar el dispositivo."); }
    finally { setBusy(""); }
  }

  return (
    <section className="rounded-xl border bg-white shadow-sm">
      <div className="border-b p-5 sm:p-6">
        <div className="flex items-start gap-3">
          {emailVerified ? <MailCheck className="mt-0.5 h-6 w-6 text-emerald-600" /> : <ShieldAlert className="mt-0.5 h-6 w-6 text-amber-600" />}
          <div><p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-primary">Identidad y acceso</p><h2 className="mt-1 font-display text-xl font-bold">Seguridad de tu cuenta</h2></div>
        </div>
      </div>
      <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-[#f8fcfb] p-4">
          <div className="flex items-center justify-between gap-3"><p className="font-bold">Correo electrónico</p><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${emailVerified ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}><BadgeCheck className="h-3.5 w-3.5" />{emailVerified ? "Verificado" : "Pendiente"}</span></div>
          <p className="mt-2 break-all text-sm text-[#4a6570]">{email}</p>
          <div className="mt-4 grid gap-2"><Input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} placeholder="Nuevo correo" autoComplete="email" /><Button type="button" variant="outline" onClick={requestEmailChange} disabled={!newEmail || Boolean(busy)}>{busy === "email" ? "Enviando…" : "Cambiar correo con verificación"}</Button></div>
        </div>
        <div className="rounded-xl border bg-[#f8fcfb] p-4">
          <div className="flex items-center justify-between gap-3"><p className="font-bold">Acceso desde dispositivos</p><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{devices} activo{devices === 1 ? "" : "s"}</span></div>
          <p className="mt-2 text-sm leading-6 text-[#4a6570]">Usa la seguridad disponible en tu teléfono o computadora. Terraqo nunca recibe ni almacena tu huella, rostro, PIN o patrón.</p>
          <Button type="button" onClick={activatePasskey} disabled={Boolean(busy)} className="mt-4 w-full"><Fingerprint className="mr-2 h-4 w-4" />{busy === "passkey" ? "Activando…" : "Activar este dispositivo"}</Button>
        </div>
        {message ? <p role="status" className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm font-semibold text-[#315560] lg:col-span-2">{message}</p> : null}
      </div>
    </section>
  );
}
