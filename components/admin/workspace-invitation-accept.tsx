"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "./workspace-members.module.css";

export function WorkspaceInvitationAccept({ signedIn, email, evaluatorsEnabled = false }: { signedIn: boolean; email: string | null; evaluatorsEnabled?: boolean }) {
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [evaluator, setEvaluator] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const captured = useRef(false);
  useEffect(() => {
    if (captured.current) return;
    captured.current = true;
    // Fragments never reach the server. Remove the credential from browser history.
    setToken(window.location.hash.slice(1));
    window.history.replaceState(null, "", window.location.pathname);
    setReady(true);
  }, []);
  const [returnedEmail, setReturnedEmail] = useState<string | null>(null);
  useEffect(() => {
    if (signedIn || !ready || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
    let request: AbortController | undefined;
    async function checkSession() {
      if (document.visibilityState !== "visible") return;
      request?.abort();
      const controller = new AbortController();
      request = controller;
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store", signal: controller.signal });
        const session = response.ok ? await response.json() : null;
        if (!controller.signal.aborted) setReturnedEmail(session?.user?.email || null);
      } catch { /* The invitation remains available when the connection returns. */ }
    }
    window.addEventListener("focus", checkSession);
    window.addEventListener("online", checkSession);
    document.addEventListener("visibilitychange", checkSession);
    return () => {
      request?.abort();
      window.removeEventListener("focus", checkSession);
      window.removeEventListener("online", checkSession);
      document.removeEventListener("visibilitychange", checkSession);
    };
  }, [ready, signedIn, token]);
  async function accept() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/terraqo/workspace-invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "accept", token }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo aceptar. Vuelve a intentarlo.");
      setEvaluator(evaluatorsEnabled && result.access === "EVALUATOR"); setDone(true); setToken("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo conectar. Vuelve a intentarlo."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div className={styles.invitationBackdrop}><section className={`${styles.surface} ${styles.invitationCard}`}>
    <header className={styles.header}><h1>{done ? "Invitación aceptada" : "Invitación a tu empresa"}</h1></header>
    {done ? <div role="status"><p>Tu acceso quedó registrado. Si ya eras miembro, conservas tu rol anterior.</p><div className={styles.actions}><Link prefetch={false} className={styles.primary} href="/cuenta">Continuar a mi cuenta</Link>{evaluator && <Link prefetch={false} href="/portal/evaluaciones">Ver evaluaciones autorizadas</Link>}</div>{evaluator && <p>Aquí encontrarás los expedientes que el administrador te asigne.</p>}</div> : ready && !/^[A-Za-z0-9_-]{43}$/.test(token) ? <p role="alert" className={styles.notice}>Este enlace está incompleto. Abre el enlace original que compartió el administrador.</p> : !signedIn && !returnedEmail ? <>
      <p>Entra con el correo que recibió la invitación. El acceso se abre en otra pestaña. Al volver aquí podrás aceptar.</p>
      <div className={styles.actions}>
        <a className={styles.primary} href="/cuenta" target="_blank" rel="noopener noreferrer">Iniciar sesión</a>
        <a href="/registro" target="_blank" rel="noopener noreferrer">Crear cuenta</a>
      </div>
    </> : <><p>Sesión actual: <strong>{returnedEmail || email}</strong>. Solo puedes aceptar una invitación dirigida a este correo verificado.</p>
      <button className={styles.primary} disabled={!ready || busy} onClick={() => void accept()}>{busy ? "Aceptando…" : "Aceptar invitación"}</button>
      {error && <p role="alert" className={`${styles.notice} ${styles.error}`}>{error}</p>}</>}
  </section></div>;
}

