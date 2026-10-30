"use client";

import { useEffect, useRef, useState } from "react";
import { ClientRegistrationForm } from "@/components/auth/client-registration-form";
import { SignInForm } from "@/components/auth/sign-in-form";

type AccessMode = "login" | "register";

type AccountAccessPanelProps = {
  loginTitle?: string;
  loginDescription?: string;
  socialProviders?: {
    google: boolean;
    apple: boolean;
    microsoft: boolean;
  };
};

export function AccountAccessPanel({ loginTitle, loginDescription, socialProviders }: AccountAccessPanelProps) {
  const [mode, setMode] = useState<AccessMode>("login");
  const panelRef = useRef<HTMLElement>(null);
  const previousMode = useRef(mode);
  const registering = mode === "register";

  useEffect(() => {
    // Move focus only after the new face is no longer inert. Initial render
    // must leave focus and the browser's scroll position under user control.
    if (previousMode.current === mode) return;
    previousMode.current = mode;
    const frame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      panel.querySelector<HTMLElement>('.tq-access-card-face[aria-hidden="false"] [data-access-heading]')?.focus({ preventScroll: true });
      const bounds = panel.getBoundingClientRect();
      if (bounds.top >= 88 && bounds.bottom <= window.innerHeight) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      panel.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mode]);

  return (
    <section ref={panelRef} className="tq-access-panel" aria-label="Acceso a Terraqo" data-mode={mode}>
      <div className="tq-access-stage">
        <div className={`tq-access-rotor${registering ? " is-register" : ""}`}>
          <div
            id="terraqo-login-panel"
            role="region"
            aria-label="Iniciar sesión"
            className="tq-access-card-face tq-access-card-face--login"
            aria-hidden={registering}
            inert={registering}
          >
            <SignInForm title={loginTitle} description={loginDescription} embedded onRegister={() => setMode("register")} socialProviders={socialProviders} />
          </div>
          <div
            id="terraqo-register-panel"
            role="region"
            aria-label="Crear cuenta"
            className="tq-access-card-face tq-access-card-face--register"
            aria-hidden={!registering}
            inert={!registering}
          >
            <ClientRegistrationForm embedded onSignIn={() => setMode("login")} socialProviders={socialProviders} />
          </div>
        </div>
      </div>
    </section>
  );
}
