"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

export class ClientFeatureBoundary extends Component<{ children: ReactNode; feature: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Terraqo client feature failed: ${this.props.feature}`, error, info.componentStack);
    void fetch("/api/telemetry/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ source: this.props.feature, message: error.message, stack: `${error.stack || ""}\n${info.componentStack || ""}`, path: window.location.pathname })
    }).catch(() => undefined);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
