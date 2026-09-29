"use client";

import { useEffect, useState, useTransition } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, BriefcaseBusiness, Building2, CheckCircle2, Eye, EyeOff, Fingerprint, LockKeyhole, Mail, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { billingContinuation } from "@/lib/terraqo/billing/continuation";
import { terraqoDomains } from "@/lib/terraqo-domains";

type SocialProviders = { google: boolean; apple: boolean; microsoft: boolean };

function safeRelativeCallback(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

function destinationForRole(role: string | undefined, callbackUrl: string | null) {
  let billing = billingContinuation(callbackUrl);
  try {
    const saved = JSON.parse(sessionStorage.getItem("terraqo-membership-continuation") || "null");
    if (!billing && saved?.expires > Date.now()) billing = billingContinuation(saved.path);
    if (billing) sessionStorage.removeItem("terraqo-membership-continuation");
  } catch {}
  if (billing) return `${terraqoDomains.portal}${billing}`;
  if (role === "SUPER_ADMIN") return `${terraqoDomains.admin}/admin/terraqo`;
  if (role === "ADMIN" || role === "COMMERCIAL_ADMIN" || role === "EDITOR") return `${terraqoDomains.admin}${callbackUrl?.startsWith("/admin") ? callbackUrl : "/admin"}`;
  if (callbackUrl?.startsWith("/portal")) return `${terraqoDomains.portal}${callbackUrl}`;
  return `${terraqoDomains.portal}/portal`;
}

export function SignInForm({
  title = "Bienvenido de vuelta",
  description = "Ingresa tus credenciales para continuar en el Portal Terraqo.",
  embedded = false,
  onRegister,
  socialProviders = { google: false, apple: false, microsoft: false },
}: {
  title?: string;
  description?: string;
  embedded?: boolean;
  onRegister?: () => void;
  socialProviders?: SocialProviders;
}) {
  const searchParams = useSearchParams();
  const callbackUrl = safeRelativeCallback(searchParams.get("callbackUrl"));
  const verification = searchParams.get("verification");
  const sessionReason = searchParams.get("reason");
  const audience = searchParams.get("audience");
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(false);
  const [emailNeedsVerification, setEmailNeedsVerification] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [socialMessage, setSocialMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const path = billingContinuation(callbackUrl);
    if (path) {
      try { sessionStorage.setItem("terraqo-membership-continuation", JSON.stringify({ path, expires: Date.now() + 3_600_000 })); } catch {}
    }
    try {
      const savedEmail = window.localStorage.getItem("terraqo-remembered-email");
      if (savedEmail) { setEmail(savedEmail); setRememberEmail(true); }
    } catch {}
  }, [callbackUrl]);

  function submit(formData: FormData) {
    setError(null);
    setResendMessage(null);
    setEmailNeedsVerification(false);
    startTransition(async () => {
      const response = await signIn("credentials", {
        email: String(formData.get("email") || ""),
        password: String(formData.get("password") || ""),
        redirect: false,
      });
      if (response?.code === "email_not_verified") {
        setEmailNeedsVerification(true);
        setError("Tu correo todavía no está verificado. Reenvía el enlace para activar tu cuenta.");
        return;
      }
      if (response?.error) {
        setError(response.error === "CredentialsSignin" ? "Credenciales inválidas. Revisa el correo y la contraseña." : "El servicio de acceso no está disponible temporalmente. Intenta nuevamente más tarde.");
        return;
      }
      try {
        if (rememberEmail) window.localStorage.setItem("terraqo-remembered-email", email.trim());
        else window.localStorage.removeItem("terraqo-remembered-email");
      } catch {}
      const session = await fetch("/api/auth/session").then((res) => res.json()).catch(() => null);
      window.location.assign(destinationForRole(session?.user?.role, callbackUrl));
    });
  }

  async function resendVerification(formData: FormData) {
    setResendMessage(null);
    setError(null);
    const requestedEmail = String(formData.get("email") || "");
    const password = String(formData.get("password") || "");
    if (!requestedEmail || !password) return setError("Escribe tu correo y contraseña para reenviar la verificación.");
    const response = await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: requestedEmail, password }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return setError(payload?.error?.message || "No se pudo reenviar la verificación.");
    if (payload?.data?.status === "already_verified") {
      setEmailNeedsVerification(false);
      setResendMessage("Tu correo ya está verificado. Puedes iniciar sesión.");
      return;
    }
    setResendMessage(payload?.data?.delivered ? "Enlace reenviado. Revisa también spam o promociones." : "El servicio de correo aún no está configurado; no se envió ningún mensaje.");
  }

  async function signInWithPasskey() {
    setError(null);
    if (!email.trim()) return setError("Escribe tu correo para usar el acceso seguro.");
    setPasskeyBusy(true);
    try {
      const optionsResponse = await fetch("/api/auth/passkey/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "options", email }) });
      const optionsPayload = await optionsResponse.json();
      if (!optionsResponse.ok) throw new Error(optionsPayload.error || "El acceso seguro no está disponible.");
      const assertion = await startAuthentication(optionsPayload.data.options);
      const verifyResponse = await fetch("/api/auth/passkey/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify", challengeId: optionsPayload.data.challengeId, response: assertion }) });
      const verifyPayload = await verifyResponse.json();
      if (!verifyResponse.ok) throw new Error(verifyPayload.error || "No pudimos validar tu dispositivo.");
      const result = await signIn("credentials", { email: verifyPayload.data.email, passkeyToken: verifyPayload.data.token, redirect: false });
      if (result?.error) throw new Error("El acceso seguro venció. Inténtalo nuevamente.");
      const session = await fetch("/api/auth/session").then((res) => res.json());
      window.location.assign(destinationForRole(session?.user?.role, callbackUrl));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos usar el acceso seguro.");
    } finally { setPasskeyBusy(false); }
  }

  async function signInWithSocial(provider: "google" | "apple" | "microsoft-entra-id", enabled: boolean) {
    setSocialMessage(null);
    if (!enabled) return setSocialMessage("Este acceso social aún requiere la configuración segura del proveedor.");
    await signIn(provider, { redirectTo: "/cuenta?social=complete" });
  }

  return (
    <form action={submit} className={embedded ? "tq-embedded-auth-form" : "relative overflow-hidden rounded-lg border bg-card p-6 text-foreground shadow-2xl md:p-8"}>
      <div className="tq-auth-heading">
        <p>Bienvenido a Terraqo</p>
        <h1>{title === "Bienvenido de vuelta" ? "Inicia sesión" : title}</h1>
        <span>{description === "Ingresa tus credenciales para continuar en el Portal Terraqo." ? "Accede a tu cuenta para continuar." : description}</span>
      </div>

      <div className="tq-account-type tq-login-destinations" aria-label="Tipo de acceso">
        <a href={`${terraqoDomains.portal}/cuenta?audience=professional&callbackUrl=${encodeURIComponent("/portal")}`} className={audience !== "company" ? "is-active" : ""}><BriefcaseBusiness aria-hidden="true" /><span><strong>Profesional</strong></span></a>
        <a href={`${terraqoDomains.admin}/cuenta?audience=company&callbackUrl=${encodeURIComponent("/admin")}`} className={audience === "company" ? "is-active" : ""}><Building2 aria-hidden="true" /><span><strong>Empresa</strong></span></a>
      </div>

      <div className="grid gap-4">
        {verification === "success" ? <p className="tq-auth-feedback is-success"><CheckCircle2 aria-hidden="true" />Correo verificado. Inicia sesión para completar tu perfil.</p> : null}
        {verification === "already" ? <p className="tq-auth-feedback is-success"><CheckCircle2 aria-hidden="true" />Tu correo ya estaba verificado. Puedes iniciar sesión.</p> : null}
        {verification === "invalid" ? <p className="tq-auth-feedback is-error"><ShieldAlert aria-hidden="true" />El enlace de verificación es inválido o venció.</p> : null}
        {sessionReason === "inactive" ? <p className="tq-auth-feedback is-success"><CheckCircle2 aria-hidden="true" />Cerramos tu sesión después de 30 minutos sin actividad para proteger tu cuenta.</p> : null}
        <div>
          <label className="text-sm font-semibold" htmlFor="email">Correo electrónico</label>
          <div className="tq-auth-input mt-2"><Mail aria-hidden="true" /><Input id="email" name="email" type="email" autoComplete="email webauthn" required value={email} onChange={(event) => { setEmail(event.target.value); setEmailNeedsVerification(false); setResendMessage(null); }} placeholder="tu@correo.com" /></div>
        </div>
        <div>
          <label className="text-sm font-semibold" htmlFor="password">Contraseña</label>
          <div className="tq-password-field tq-auth-input mt-2"><LockKeyhole aria-hidden="true" /><Input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required placeholder="Ingresa tu contraseña" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={showPassword}>{showPassword ? <EyeOff /> : <Eye />}</button></div>
        </div>
        <label className="tq-remember-email"><input type="checkbox" checked={rememberEmail} onChange={(event) => setRememberEmail(event.target.checked)} /><span>Recordar mi correo</span></label>
        <Button type="submit" size="lg" disabled={isPending} className="mt-1 w-full">{isPending ? "Validando acceso..." : "Iniciar sesión"}<ArrowRight aria-hidden="true" /></Button>
        <Button type="button" variant="outline" size="lg" disabled={passkeyBusy || isPending} onClick={signInWithPasskey} className="tq-passkey-button w-full"><Fingerprint aria-hidden="true" /> {passkeyBusy ? "Verificando dispositivo…" : "Entrar con huella, rostro o PIN"}</Button>
        {error ? <p className="tq-auth-feedback is-error"><ShieldAlert aria-hidden="true" />{error}</p> : null}
        {resendMessage ? <p className="tq-auth-feedback is-success"><CheckCircle2 aria-hidden="true" />{resendMessage}</p> : null}
        {emailNeedsVerification ? <button type="submit" formAction={resendVerification} className="tq-resend-verification">Reenviar correo de verificación</button> : null}
      </div>

      <div className="tq-social-divider"><span>o continúa con</span></div>
      <div className="tq-social-access" aria-label="Acceso con redes">
        <button type="button" onClick={() => signInWithSocial("google", socialProviders.google)} aria-label="Continuar con Google"><GoogleMark /></button>
        <button type="button" onClick={() => signInWithSocial("apple", socialProviders.apple)} aria-label="Continuar con Apple"><AppleMark /></button>
        <button type="button" onClick={() => signInWithSocial("microsoft-entra-id", socialProviders.microsoft)} aria-label="Continuar con Microsoft"><MicrosoftMark /></button>
      </div>
      {socialMessage ? <p className="tq-social-message" role="status">{socialMessage}</p> : null}
      {onRegister ? <p className="tq-auth-switch">¿No tienes una cuenta? <button type="button" onClick={onRegister}>Regístrate <ArrowRight aria-hidden="true" /></button></p> : null}
    </form>
  );
}

function GoogleMark() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.91h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.4Z"/><path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.37l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.92A6.02 6.02 0 0 1 6.08 12c0-.67.11-1.32.31-1.92V7.46H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.54l3.35-2.62Z"/><path fill="#EA4335" d="M12 5.95c1.47 0 2.79.5 3.82 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.46l3.35 2.62C7.18 7.71 9.39 5.95 12 5.95Z"/></svg>;
}

function AppleMark() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.05 12.54c-.02-2.2 1.8-3.27 1.88-3.32a4.04 4.04 0 0 0-3.18-1.72c-1.34-.14-2.64.8-3.32.8-.7 0-1.76-.79-2.9-.77a4.2 4.2 0 0 0-3.54 2.16c-1.53 2.64-.39 6.51 1.08 8.65.74 1.05 1.6 2.23 2.74 2.19 1.11-.05 1.53-.7 2.87-.7 1.33 0 1.72.7 2.88.67 1.2-.02 1.95-1.05 2.66-2.11a8.6 8.6 0 0 0 1.22-2.48 3.8 3.8 0 0 1-2.39-3.37Zm-2.18-6.46a3.86 3.86 0 0 0 .9-2.78 3.94 3.94 0 0 0-2.55 1.32 3.7 3.7 0 0 0-.92 2.67 3.25 3.25 0 0 0 2.57-1.21Z"/></svg>;
}

function MicrosoftMark() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#F25022" d="M2 2h9.5v9.5H2z"/><path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z"/><path fill="#00A4EF" d="M2 12.5h9.5V22H2z"/><path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z"/></svg>;
}
