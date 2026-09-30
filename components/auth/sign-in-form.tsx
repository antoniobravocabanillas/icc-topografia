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
import { SocialAccess, type SocialProviders } from "@/components/auth/social-access";

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

      <SocialAccess providers={socialProviders} />
      {onRegister ? <p className="tq-auth-switch">¿No tienes una cuenta? <button type="button" onClick={onRegister}>Regístrate <ArrowRight aria-hidden="true" /></button></p> : null}
    </form>
  );
}
