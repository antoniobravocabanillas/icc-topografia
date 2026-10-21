"use client";

import { Component, createRef, type ErrorInfo, type ReactNode } from "react";

function clientErrorCategory(message: string) {
  if (/chunk|dynamically imported module/i.test(message)) return "ASSET_VERSION";
  if (/network|fetch|load failed/i.test(message)) return "NETWORK";
  if (/hydration/i.test(message)) return "HYDRATION";
  return "CLIENT_EXCEPTION";
}

async function fingerprint(value: string) {
  if (!value || !globalThis.crypto?.subtle) return null;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

async function reportClientError(feature: string, error: Error, componentStack?: string | null) {
  const stack = `${error.stack || ""}\n${componentStack || ""}`;
  const [messageFingerprint, stackFingerprint] = await Promise.all([
    fingerprint(error.message),
    fingerprint(stack),
  ]);
  await fetch("/api/telemetry/client-error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      source: feature,
      category: clientErrorCategory(error.message),
      messageFingerprint,
      stackFingerprint,
      path: window.location.pathname,
    }),
  });
}

export class ClientFeatureBoundary extends Component<{ children: ReactNode; feature: string }, { failed: boolean }> {
  state = { failed: false };
  private readonly recoveryHeading = createRef<HTMLHeadingElement>();

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Terraqo client feature failed: ${this.props.feature}`, error, info.componentStack);
    void reportClientError(this.props.feature, error, info.componentStack).catch(() => undefined);
  }

  componentDidUpdate(_: Readonly<{ children: ReactNode; feature: string }>, previousState: Readonly<{ failed: boolean }>) {
    if (!previousState.failed && this.state.failed) this.recoveryHeading.current?.focus();
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-sm">
        <h2 ref={this.recoveryHeading} tabIndex={-1} className="text-base font-bold outline-none focus-visible:ring-2 focus-visible:ring-amber-700">
          Esta función no pudo cargar
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6">El resto de tu información permanece disponible. Puedes reintentar sin perder los datos ya guardados.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => this.setState({ failed: false })} className="inline-flex min-h-11 items-center rounded-lg bg-amber-950 px-4 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2">
            Reintentar
          </button>
          <button type="button" onClick={() => window.location.reload()} className="inline-flex min-h-11 items-center rounded-lg border border-amber-300 bg-white px-4 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2">
            Actualizar página
          </button>
        </div>
      </section>
    );
  }
}
