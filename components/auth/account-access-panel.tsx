"use client";

import { useState } from "react";
import { ClientRegistrationForm } from "@/components/auth/client-registration-form";
import { SignInForm } from "@/components/auth/sign-in-form";

type AccessMode = "login" | "register";

type AccountAccessPanelProps = {
  loginTitle?: string;
  loginDescription?: string;
};

export function AccountAccessPanel({ loginTitle, loginDescription }: AccountAccessPanelProps) {
  const [mode, setMode] = useState<AccessMode>("login");

  return (
    <section className="tq-access-panel" aria-label="Acceso a Terraqo">
      <div className="tq-access-tabs" role="tablist" aria-label="Acceso o registro">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "login"}
          aria-controls="terraqo-login-panel"
          onClick={() => setMode("login")}
          className={mode === "login" ? "is-active" : ""}
        >
          Iniciar sesión
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "register"}
          aria-controls="terraqo-register-panel"
          onClick={() => setMode("register")}
          className={mode === "register" ? "is-active" : ""}
        >
          Registrarme
        </button>
        <span className={mode === "register" ? "tq-access-tab-indicator is-register" : "tq-access-tab-indicator"} aria-hidden="true" />
      </div>

      <div className="tq-access-stage">
        {mode === "login" ? (
          <div key="login" id="terraqo-login-panel" role="tabpanel" className="tq-access-card-content">
            <SignInForm title={loginTitle} description={loginDescription} embedded onRegister={() => setMode("register")} />
          </div>
        ) : (
          <div key="register" id="terraqo-register-panel" role="tabpanel" className="tq-access-card-content">
            <ClientRegistrationForm embedded onSignIn={() => setMode("login")} />
          </div>
        )}
      </div>
    </section>
  );
}
