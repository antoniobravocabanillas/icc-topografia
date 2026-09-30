"use client";

import { useRef, useState } from "react";
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
  const registering = mode === "register";

  function changeMode(nextMode: AccessMode) {
    setMode(nextMode);
    window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const bounds = panel.getBoundingClientRect();
      if (bounds.top >= 88 && bounds.bottom <= window.innerHeight) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      panel.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    });
  }

  return (
    <section ref={panelRef} className="tq-access-panel" aria-label="Acceso a Terraqo" data-mode={mode}>
      <div className="tq-access-stage" aria-live="polite">
        <div className={`tq-access-rotor${registering ? " is-register" : ""}`}>
          <div
            id="terraqo-login-panel"
            role="tabpanel"
            className="tq-access-card-face tq-access-card-face--login"
            aria-hidden={registering}
            inert={registering}
          >
            <SignInForm title={loginTitle} description={loginDescription} embedded onRegister={() => changeMode("register")} socialProviders={socialProviders} />
          </div>
          <div
            id="terraqo-register-panel"
            role="tabpanel"
            className="tq-access-card-face tq-access-card-face--register"
            aria-hidden={!registering}
            inert={!registering}
          >
            <ClientRegistrationForm embedded onSignIn={() => changeMode("login")} socialProviders={socialProviders} />
          </div>
        </div>
      </div>
    </section>
  );
}
