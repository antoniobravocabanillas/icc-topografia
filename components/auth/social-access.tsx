"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export type SocialProviders = {
  google: boolean;
  apple: boolean;
  microsoft: boolean;
};

export function SocialAccess({
  providers,
  intent = "signin",
}: {
  providers: SocialProviders;
  intent?: "signin" | "register";
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [pendingProvider, setPendingProvider] = useState<string | null>(null);

  async function continueWith(
    provider: "google" | "apple" | "microsoft-entra-id",
    enabled: boolean,
  ) {
    setMessage(null);
    if (!enabled) {
      setMessage("Este acceso social aún requiere la configuración segura del proveedor.");
      return;
    }
    setPendingProvider(provider);
    try {
      await signIn(provider, { redirectTo: "/cuenta?social=complete" });
    } catch {
      setPendingProvider(null);
      setMessage("No pudimos abrir el proveedor de acceso. Intenta nuevamente.");
    }
  }

  const prefix = intent === "register" ? "Registrarte" : "Continuar";

  return (
    <>
      <div className="tq-social-divider">
        <span>{intent === "register" ? "o regístrate con" : "o continúa con"}</span>
      </div>
      <div className="tq-social-access" aria-label="Acceso con redes">
        <button
          type="button"
          disabled={pendingProvider !== null}
          onClick={() => continueWith("google", providers.google)}
          aria-label={`${prefix} con Google`}
          aria-busy={pendingProvider === "google"}
        >
          <GoogleMark />
        </button>
        <button
          type="button"
          disabled={pendingProvider !== null}
          onClick={() => continueWith("apple", providers.apple)}
          aria-label={`${prefix} con Apple`}
          aria-busy={pendingProvider === "apple"}
        >
          <AppleMark />
        </button>
        <button
          type="button"
          disabled={pendingProvider !== null}
          onClick={() => continueWith("microsoft-entra-id", providers.microsoft)}
          aria-label={`${prefix} con Microsoft`}
          aria-busy={pendingProvider === "microsoft-entra-id"}
        >
          <MicrosoftMark />
        </button>
      </div>
      {message ? <p className="tq-social-message" role="status">{message}</p> : null}
    </>
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
