"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { terraqoDomains } from "@/lib/terraqo-domains";

function safeRelativeCallback(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

function destinationForRole(role: string | undefined, callbackUrl: string | null) {
  if (role === "SUPER_ADMIN") return `${terraqoDomains.admin}/admin/terraqo`;
  if (role === "ADMIN" || role === "COMMERCIAL_ADMIN" || role === "EDITOR") return `${terraqoDomains.admin}${callbackUrl?.startsWith("/admin") ? callbackUrl : "/admin"}`;
  if (callbackUrl?.startsWith("/portal")) return `${terraqoDomains.portal}${callbackUrl}`;
  return `${terraqoDomains.portal}/portal`;
}

export function SignInForm({
  title = "Bienvenido de vuelta",
  description = "Ingresa tus credenciales para continuar en el Portal Terraqo.",
  embedded = false,
  onRegister
}: {
  title?: string;
  description?: string;
  embedded?: boolean;
  onRegister?: () => void;
}) {
  const searchParams = useSearchParams();
  const explicitCallbackUrl = searchParams.get("callbackUrl");
  const callbackUrl = safeRelativeCallback(explicitCallbackUrl);
  const verification = searchParams.get("verification");
  const sessionReason = searchParams.get("reason");
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const response = await signIn("credentials", {
        email: String(formData.get("email") || ""),
        password: String(formData.get("password") || ""),
        redirect: false
      });

      if (response?.error) {
        setError(
          response.error === "CredentialsSignin"
            ? "Credenciales inválidas. Revisa el correo y la contraseña."
            : "El servicio de acceso no esta disponible temporalmente. Tus credenciales no han podido validarse; intenta nuevamente mas tarde."
        );
        return;
      }

      const session = await fetch("/api/auth/session").then((res) => res.json()).catch(() => null);
      const role = session?.user?.role;
      window.location.assign(destinationForRole(role, callbackUrl));
    });
  }

  async function resendVerification(formData: FormData) {
    setResendMessage(null);
    setError(null);
    const email = String(formData.get("email") || "");
    if (!email) {
      setError("Escribe tu correo para reenviar la verificación.");
      return;
    }
    const response = await fetch("/api/auth/resend-verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.error?.message || "No se pudo reenviar la verificación.");
      return;
    }
    setResendMessage(payload?.data?.delivered ? "Enlace reenviado. Revisa también spam o promociones." : "El servicio de correo aún no está configurado; no se envió ningún mensaje.");
  }

  return (
    <form action={submit} className={embedded ? "tq-embedded-auth-form" : "relative overflow-hidden rounded-lg border bg-card p-6 text-foreground shadow-2xl md:p-8"}>
      {!embedded ? <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-[#24C8EE] to-primary" /> : null}
      <div className="mb-6 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <LockKeyhole className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Acceso seguro</p>
          <h2 className="mt-1 font-display text-2xl font-bold">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>

      <div className="grid gap-4">
      {verification === "success" ? <p className="tq-verification-notice">Correo verificado. Inicia sesión para completar tu perfil.</p> : null}
      {verification === "invalid" ? <p className="text-sm font-medium text-destructive">El enlace de verificación es inválido o venció.</p> : null}
      {sessionReason === "inactive" ? <p className="tq-verification-notice">Cerramos tu sesión después de 30 minutos sin actividad para proteger tu cuenta.</p> : null}
      <div>
        <label className="text-sm font-semibold" htmlFor="email">Correo</label>
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="correo@empresa.com" className="mt-2 bg-muted/40 text-foreground" />
      </div>
      <div>
        <label className="text-sm font-semibold" htmlFor="password">Contraseña</label>
        <div className="tq-password-field mt-2">
          <Input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required placeholder="********" className="bg-muted/40 text-foreground" />
          <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={showPassword}>{showPassword ? <EyeOff /> : <Eye />}</button>
        </div>
      </div>
      <Button type="submit" size="lg" disabled={isPending} className="mt-2 w-full">
        {isPending ? "Validando acceso..." : "Ingresar"}
        <ArrowRight className="h-4 w-4" />
      </Button>
      {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
      {resendMessage ? <p className="text-sm text-[#bcebf1]">{resendMessage}</p> : null}
      <button type="submit" formAction={resendVerification} className="tq-resend-verification">Reenviar correo de verificación</button>
      </div>
      {onRegister ? <p className="tq-auth-switch">¿No tienes cuenta? <button type="button" onClick={onRegister}>Registrarme</button></p> : null}
    </form>
  );
}
