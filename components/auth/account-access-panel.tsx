"use client";

import { useState } from "react";
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

  return (
    <section className="tq-access-panel" aria-label="Acceso a Terraqo">
      <div className="tq-access-stage">
        {mode === "login" ? (
          <div key="login" id="terraqo-login-panel" role="tabpanel" className="tq-access-card-content">
            <SignInForm title={loginTitle} description={loginDescription} embedded onRegister={() => setMode("register")} socialProviders={socialProviders} />
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
