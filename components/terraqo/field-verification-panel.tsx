"use client";

import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, BadgeCheck, CalendarClock, CheckCircle2, Fingerprint, LocateFixed, LogIn, LogOut, MapPin, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export type VerificationStatus = {
  hasPasskey: boolean;
  workspace: { id: string; name: string };
  membership: { role: string; title: string | null; currentProjectId: string | null };
  projects: Array<{ id: string; title: string; location: string | null; latitude: number | null; longitude: number | null; geofenceRadiusMeters: number; geofencePolicy: "FIXED_RADIUS" | "LOCATION_ONLY"; imageUrl: string | null }>;
  latestAttendance: { id: string; type: "CHECK_IN" | "CHECK_OUT"; context: "PROJECT" | "PERSONAL_FIELD"; capturedAt: string; projectId: string | null; project: { title: string } | null } | null;
  recentAttendance: Array<{
    id: string;
    type: "CHECK_IN" | "CHECK_OUT";
    capturedAt: string;
    context: "PROJECT" | "PERSONAL_FIELD";
    projectId: string | null;
    credentialId: string | null;
    accuracyMeters: number;
    distanceMeters: number | null;
    project: { title: string; location: string | null } | null;
  }>;
  pendingValidations: Array<{
    id: string;
    requestedAt: string;
    worklog: { id: string; title: string; occurredAt: string; author: { name: string | null; image: string | null }; project: { title: string } | null };
  }>;
};

type ApiEnvelope<T> = { data?: T; error?: { message?: string; details?: { code?: string; distanceMeters?: number; radiusMeters?: number } } };

export async function requestFieldVerification<T>(endpoint: string, body: object) {
  const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({})) as ApiEnvelope<T>;
  if (!response.ok) {
    const error = new Error(payload.error?.message || "No pudimos completar la operacion.") as Error & {
      details?: { code?: string; distanceMeters?: number; radiusMeters?: number };
    };
    error.details = payload.error?.details;
    throw error;
  }
  return payload.data as T;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function formatElapsed(from: string, until = Date.now()) {
  const totalMinutes = Math.max(0, Math.floor((until - new Date(from).getTime()) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours} h ${minutes.toString().padStart(2, "0")} min` : `${minutes} min`;
}

function isTodayInLima(value: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" });
  return formatter.format(new Date(value)) === formatter.format(new Date());
}

export function FieldVerificationPanel({ endpoint, compact = false }: { endpoint: string; compact?: boolean }) {
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [projectId, setProjectId] = useState("");
  const [attendanceContext, setAttendanceContext] = useState<"PROJECT" | "PERSONAL_FIELD">("PROJECT");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [changingProject, setChangingProject] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      setLoadError("");
      const next = await requestFieldVerification<VerificationStatus>(endpoint, { action: "status" });
      setStatus(next);
      const active = next.latestAttendance?.type === "CHECK_IN" ? next.latestAttendance : null;
      setAttendanceContext(active?.context || (next.projects.length ? "PROJECT" : "PERSONAL_FIELD"));
      setProjectId((current) => active?.projectId || current || next.membership.currentProjectId || next.projects[0]?.id || "");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "No pudimos cargar asistencia y validaciones.");
    }
  }, [endpoint]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const reload = () => void load();
    window.addEventListener("terraqo:attendance-updated", reload);
    return () => window.removeEventListener("terraqo:attendance-updated", reload);
  }, [load]);

  useEffect(() => {
    if (status?.latestAttendance?.type !== "CHECK_IN") return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [status?.latestAttendance?.id, status?.latestAttendance?.type]);

  const nextAttendanceType = useMemo(() => {
    return status?.latestAttendance?.type === "CHECK_IN" ? "CHECK_OUT" as const : "CHECK_IN" as const;
  }, [status?.latestAttendance]);

  async function activatePasskey() {
    setBusy("passkey");
    setMessage("");
    try {
      const options = await requestFieldVerification<{ challengeId: string; options: Parameters<typeof startRegistration>[0] }>(endpoint, { action: "passkey_registration_options" });
      const response = await startRegistration(options.options);
      await requestFieldVerification(endpoint, { action: "passkey_registration_verify", challengeId: options.challengeId, response, deviceName: "Dispositivo personal" });
      setMessage("Dispositivo seguro activado. Ya puedes firmar asistencia y validaciones.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos activar el dispositivo.");
    } finally {
      setBusy("");
    }
  }

  function getCurrentPosition() {
    return new Promise<GeolocationPosition>((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("Este dispositivo no permite obtener ubicacion."));
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    });
  }

  async function registerAttendance() {
    const active = status?.latestAttendance?.type === "CHECK_IN" ? status.latestAttendance : null;
    const context = active?.context || attendanceContext;
    const attendanceProjectId = active?.projectId || (context === "PROJECT" ? projectId : undefined);
    if (context === "PROJECT" && !attendanceProjectId) {
      setMessage("Selecciona un proyecto o usa Trabajo de campo.");
      return;
    }
    setBusy("attendance");
    setMessage("Obteniendo tu ubicacion exacta...");
    try {
      const position = await getCurrentPosition();
      const options = await requestFieldVerification<{ challengeId: string; options: Parameters<typeof startAuthentication>[0] }>(endpoint, {
        action: "attendance_options",
        data: {
          context,
          ...(attendanceProjectId ? { projectId: attendanceProjectId } : {}),
          type: nextAttendanceType,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy
        }
      });
      setMessage("Confirma tu identidad en el dispositivo.");
      const response = await startAuthentication(options.options);
      const result = await requestFieldVerification<{ type: "CHECK_IN" | "CHECK_OUT"; capturedAt: string; project: { title: string } | null }>(endpoint, {
        action: "attendance_verify",
        challengeId: options.challengeId,
        response
      });
      setMessage(`${result.type === "CHECK_IN" ? "Entrada" : "Salida"} registrada en ${result.project?.title || "trabajo de campo"} a las ${formatDateTime(result.capturedAt)}.`);
      await load();
      window.dispatchEvent(new CustomEvent("terraqo:attendance-updated"));
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && typeof error.code === "number") {
        setMessage(error.code === 1 ? "Necesitamos permiso de ubicacion para confirmar que estas en tu trabajo." : "No pudimos obtener una ubicacion precisa. Intenta en un espacio con mejor senal.");
      } else {
        setMessage(error instanceof Error ? error.message : "No pudimos registrar tu asistencia.");
      }
    } finally {
      setBusy("");
    }
  }

  async function approveValidation(validationId: string) {
    setBusy(validationId);
    setMessage("");
    try {
      const options = await requestFieldVerification<{ challengeId: string; options: Parameters<typeof startAuthentication>[0] }>(endpoint, { action: "validation_options", validationId });
      const response = await startAuthentication(options.options);
      await requestFieldVerification(endpoint, { action: "validation_verify", challengeId: options.challengeId, response });
      setMessage("Bitacora validada con la identidad del responsable y hora del servidor.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos validar la bitacora.");
    } finally {
      setBusy("");
    }
  }

  if (!status && loadError) return (
    <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="font-semibold text-amber-950">Control de campo no disponible</p><p className="mt-1 text-sm text-amber-900/75">{loadError}</p></div>
      <Button type="button" variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" /> Reintentar</Button>
    </div>
  );
  if (!status) return <div className="rounded-lg border bg-white p-5 text-sm text-muted-foreground" role="status">Cargando control de campo...</div>;

  if (compact) {
    const activeAttendance = status.latestAttendance?.type === "CHECK_IN" ? status.latestAttendance : null;
    const currentContext = activeAttendance?.context || attendanceContext;
    const selectedProject = status.projects.find((project) => project.id === (activeAttendance?.projectId || projectId));
    const completedToday = status.latestAttendance?.type === "CHECK_OUT" && isTodayInLima(status.latestAttendance.capturedAt);
    const latestEntry = status.recentAttendance.find((event) => event.type === "CHECK_IN" && event.context === status.latestAttendance?.context && event.projectId === status.latestAttendance?.projectId);

    return (
      <section id="jornada-de-hoy" className="overflow-hidden rounded-2xl border border-[#dce5ed] bg-white p-4 shadow-[0_12px_34px_rgba(14,26,38,0.05)] sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-bold tracking-[-0.02em] text-[#0e1a26]">Jornada de hoy</h2>
          <span className={`inline-flex min-h-8 items-center gap-2 rounded-full px-3 text-xs font-bold ${status.hasPasskey ? "bg-[#e8f7f1] text-[#087b70]" : "bg-[#fff4df] text-[#8a5a00]"}`}>
            {status.hasPasskey ? <ShieldCheck className="h-4 w-4" aria-hidden="true" /> : <Fingerprint className="h-4 w-4" aria-hidden="true" />}
            {status.hasPasskey ? "Dispositivo verificado" : "Dispositivo pendiente"}
          </span>
        </div>

        {!status.hasPasskey ? (
          <div className="mt-4 flex flex-col gap-4 rounded-xl bg-[#fffaf0] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-bold text-[#0e1a26]">Activa este dispositivo una sola vez</p><p className="mt-1 text-sm leading-5 text-[#6b5b39]">Usaremos su método seguro para firmar entradas y salidas. Terraqo no recibe datos biométricos.</p></div>
            <Button type="button" onClick={activatePasskey} disabled={Boolean(busy)} className="min-h-11 shrink-0"><Fingerprint className="mr-2 h-4 w-4" />{busy === "passkey" ? "Activando…" : "Activar dispositivo"}</Button>
          </div>
        ) : (
          <div className="mt-4">
            {!activeAttendance ? <div className="mb-4 inline-flex w-full rounded-xl border border-[#dce5ed] bg-[#f6f9fb] p-1 sm:w-auto" role="group" aria-label="Tipo de jornada">
              <button type="button" onClick={() => setAttendanceContext("PROJECT")} disabled={!status.projects.length} className={`min-h-11 flex-1 rounded-lg px-4 text-sm font-bold transition sm:flex-none ${currentContext === "PROJECT" ? "bg-white text-[#1768b0] shadow-sm" : "text-[#607083] hover:text-[#0e1a26]"} disabled:cursor-not-allowed disabled:opacity-45`}>Por proyecto</button>
              <button type="button" onClick={() => setAttendanceContext("PERSONAL_FIELD")} className={`min-h-11 flex-1 rounded-lg px-4 text-sm font-bold transition sm:flex-none ${currentContext === "PERSONAL_FIELD" ? "bg-white text-[#087b70] shadow-sm" : "text-[#607083] hover:text-[#0e1a26]"}`}>Trabajo de campo</button>
            </div> : null}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)] lg:items-center">
            <div className="flex min-w-0 items-center gap-4">
              <div className="relative hidden h-24 w-28 shrink-0 overflow-hidden rounded-xl bg-[#eaf1f5] sm:block">
                {currentContext === "PROJECT" && selectedProject?.imageUrl ? <Image src={selectedProject.imageUrl} alt="" fill sizes="112px" className="object-cover" unoptimized /> : <span className="absolute inset-0 grid place-items-center text-[#1768b0]">{currentContext === "PERSONAL_FIELD" ? <LocateFixed className="h-8 w-8" aria-hidden="true" /> : <CalendarClock className="h-8 w-8" aria-hidden="true" />}</span>}
              </div>
              <div className="min-w-0">
                <p className="truncate font-display text-lg font-bold text-[#0e1a26]">{currentContext === "PERSONAL_FIELD" ? "Jornada personal de campo" : selectedProject?.title || "Selecciona un proyecto"}</p>
                <p className="truncate text-sm font-semibold text-[#52677a]">{status.workspace.name}</p>
                <p className="mt-0.5 text-xs leading-5 text-[#748596]">{currentContext === "PERSONAL_FIELD" ? "Sin proyecto fijo · se capturará la ubicación en cada entrada y salida" : `${status.membership.title || "Profesional asignado"}${selectedProject?.location ? ` · ${selectedProject.location}` : ""}${selectedProject?.geofencePolicy === "LOCATION_ONLY" ? " · cobertura móvil" : ""}`}</p>
                {!activeAttendance && currentContext === "PROJECT" && status.projects.length > 1 ? <button type="button" onClick={() => setChangingProject((value) => !value)} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#dce5ed] px-3 text-xs font-bold text-[#1768b0] transition hover:bg-[#edf5ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1768b0]"><RefreshCw className="h-3.5 w-3.5" />Cambiar proyecto</button> : null}
              </div>
            </div>

            <div className="min-w-0 border-[#e3eaf0] lg:border-l lg:pl-6">
              {changingProject && !activeAttendance && currentContext === "PROJECT" ? <label className="mb-4 grid gap-2 text-sm font-bold text-[#0e1a26]">Proyecto<select value={projectId} onChange={(event) => { setProjectId(event.target.value); setChangingProject(false); }} className="min-h-11 rounded-lg border border-[#cbd7e2] bg-white px-3 text-sm font-medium">{status.projects.map((project) => <option key={project.id} value={project.id}>{project.title}{project.location ? ` · ${project.location}` : ""}</option>)}</select></label> : null}
              {activeAttendance ? (
                <div>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <div><span className="text-xs text-[#748596]">Entrada</span><strong className="mt-1 block tabular-nums text-[#0e1a26]">{formatTime(activeAttendance.capturedAt)}</strong></div>
                    <div><span className="text-xs text-[#748596]">Tiempo transcurrido</span><strong className="mt-1 block tabular-nums text-[#087b70]">{formatElapsed(activeAttendance.capturedAt, now)}</strong></div>
                    <div className="col-span-2 sm:col-span-1"><span className="text-xs text-[#748596]">Estado</span><strong className="mt-1 flex items-center gap-2 text-[#0e1a26]"><span className="h-2.5 w-2.5 rounded-full bg-[#0da785]" />En jornada</strong></div>
                  </div>
                </div>
              ) : completedToday ? (
                <div className="flex items-center gap-3 rounded-xl bg-[#f1faf7] p-4"><CheckCircle2 className="h-6 w-6 shrink-0 text-[#087b70]" /><div><p className="font-bold text-[#0e1a26]">Jornada completada</p><p className="mt-0.5 text-sm text-[#52677a]">Salida registrada a las {formatTime(status.latestAttendance!.capturedAt)}{latestEntry ? ` · ${formatElapsed(latestEntry.capturedAt, new Date(status.latestAttendance!.capturedAt).getTime())}` : ""}</p></div></div>
              ) : (
                <div><p className="font-bold text-[#0e1a26]">Sin entrada registrada</p><p className="mt-1 text-sm text-[#607083]">Terraqo capturará hora, ubicación y dispositivo al iniciar.</p></div>
              )}
              <div className={`mt-4 grid gap-2 ${completedToday ? "" : "sm:grid-cols-2"}`}>
                {!completedToday ? <Button type="button" onClick={registerAttendance} disabled={(currentContext === "PROJECT" && !projectId) || Boolean(busy)} className="min-h-11 order-1 sm:order-2">{activeAttendance ? <LogOut className="mr-2 h-4 w-4" /> : <LogIn className="mr-2 h-4 w-4" />}{busy === "attendance" ? "Verificando…" : activeAttendance ? "Marcar salida" : "Marcar entrada"}</Button> : null}
                <Button asChild variant="outline" className="min-h-11 order-2 sm:order-1"><Link href={activeAttendance ? `/portal/jornadas/${activeAttendance.id}` : "/portal/jornadas"}>{activeAttendance ? "Ver detalle" : "Ver historial"} <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
              </div>
            </div>
          </div>
          </div>
        )}
        {message ? <p role="status" aria-live="polite" className="mt-4 rounded-xl bg-[#f3f7fa] px-4 py-3 text-sm font-semibold text-[#29434d]"><LocateFixed className="mr-2 inline h-4 w-4" />{message}</p> : null}
      </section>
    );
  }

  return (
    <section className={`overflow-hidden rounded-lg border bg-white shadow-[0_16px_44px_rgba(1,45,56,0.08)] ${compact ? "p-4" : "p-6"}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Control de campo</p>
          <h2 className="mt-1 font-display text-xl font-bold">Entrada, salida y firmas verificables</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">La hora la registra Terraqo. Puedes trabajar por proyecto o registrar una jornada móvil solo con ubicación.</p>
        </div>
        <span className={`inline-flex w-fit items-center gap-2 rounded-md px-3 py-2 text-xs font-bold ${status.hasPasskey ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
          {status.hasPasskey ? <ShieldCheck className="h-4 w-4" /> : <Fingerprint className="h-4 w-4" />}
          {status.hasPasskey ? "Dispositivo seguro activo" : "Activacion pendiente"}
        </span>
      </div>

      {!status.hasPasskey ? <div className="mt-5 flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50/60 p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-amber-950">Activa la huella, Face ID o PIN disponible en este equipo. Terraqo nunca recibe tus datos biometricos.</p><Button type="button" onClick={activatePasskey} disabled={Boolean(busy)}><Fingerprint className="mr-2 h-4 w-4" />{busy === "passkey" ? "Activando..." : "Activar dispositivo"}</Button></div> : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_auto] lg:items-end">
        <label className="grid gap-2 text-sm font-semibold">Tipo de jornada<select value={status.latestAttendance?.type === "CHECK_IN" ? status.latestAttendance.context : attendanceContext} onChange={(event) => setAttendanceContext(event.target.value as "PROJECT" | "PERSONAL_FIELD")} disabled={status.latestAttendance?.type === "CHECK_IN"} className="h-11 rounded-md border bg-background px-3"><option value="PERSONAL_FIELD">Trabajo de campo</option><option value="PROJECT" disabled={!status.projects.length}>Por proyecto</option></select></label>
        <label className="grid gap-2 text-sm font-semibold">Proyecto <span className="sr-only">opcional para trabajo de campo</span>
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="h-11 rounded-md border bg-background px-3" disabled={attendanceContext === "PERSONAL_FIELD" || !status.projects.length || status.latestAttendance?.type === "CHECK_IN"}>
            {!status.projects.length ? <option value="">No hay proyectos asignados</option> : null}
            {status.projects.map((project) => <option key={project.id} value={project.id}>{project.title}{project.location ? ` | ${project.location}` : ""}</option>)}
          </select>
        </label>
        <Button type="button" onClick={registerAttendance} disabled={!status.hasPasskey || (attendanceContext === "PROJECT" && !projectId) || Boolean(busy)} className="h-11 min-w-48">
          {nextAttendanceType === "CHECK_IN" ? <LogIn className="mr-2 h-4 w-4" /> : <LogOut className="mr-2 h-4 w-4" />}
          {busy === "attendance" ? "Verificando..." : nextAttendanceType === "CHECK_IN" ? "Marcar entrada" : "Marcar salida"}
        </Button>
      </div>

      {status.latestAttendance ? <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-4 text-sm text-[#35485b]"><span className="inline-flex items-center gap-2 font-semibold"><CalendarClock className="h-4 w-4 text-primary" />Ultimo registro: {formatDateTime(status.latestAttendance.capturedAt)}</span><span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" />{status.latestAttendance.project?.title || "Trabajo de campo · ubicación capturada"}</span></div> : null}

      {status.pendingValidations.length ? <div className="mt-6 border-t pt-5"><div className="flex items-center justify-between gap-3"><div><p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Pendientes para ti</p><h3 className="mt-1 font-display text-lg font-bold">Bitacoras por supervisar</h3></div><span className="rounded-md bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{status.pendingValidations.length}</span></div><div className="mt-4 grid gap-3">{status.pendingValidations.map((validation) => <article key={validation.id} className="flex flex-col gap-4 rounded-md border bg-[#f3f3f3] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{validation.worklog.title}</p><p className="mt-1 text-sm text-muted-foreground">{validation.worklog.author.name || "Profesional"}{validation.worklog.project ? ` | ${validation.worklog.project.title}` : ""}</p><small className="mt-1 block text-muted-foreground">Registrada: {formatDateTime(validation.worklog.occurredAt)}</small></div><Button type="button" variant="outline" onClick={() => approveValidation(validation.id)} disabled={!status.hasPasskey || Boolean(busy)}><BadgeCheck className="mr-2 h-4 w-4" />{busy === validation.id ? "Validando..." : "Validar con mi dispositivo"}</Button></article>)}</div></div> : null}

      {message ? <p role="status" className={`mt-4 rounded-md border px-4 py-3 text-sm font-semibold ${message === "No estas en tu trabajo." ? "border-red-200 bg-red-50 text-red-800" : "bg-muted/35 text-[#29434d]"}`}><LocateFixed className="mr-2 inline h-4 w-4" />{message}</p> : null}
    </section>
  );
}
