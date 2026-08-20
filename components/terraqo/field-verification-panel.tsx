"use client";

import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, CalendarClock, Fingerprint, LocateFixed, LogIn, LogOut, MapPin, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

type VerificationStatus = {
  hasPasskey: boolean;
  projects: Array<{ id: string; title: string; location: string | null; latitude: number | null; longitude: number | null; geofenceRadiusMeters: number }>;
  latestAttendance: { id: string; type: "CHECK_IN" | "CHECK_OUT"; capturedAt: string; projectId: string; project: { title: string } } | null;
  pendingValidations: Array<{
    id: string;
    requestedAt: string;
    worklog: { id: string; title: string; occurredAt: string; author: { name: string | null; image: string | null }; project: { title: string } | null };
  }>;
};

type ApiEnvelope<T> = { data?: T; error?: { message?: string; details?: { code?: string; distanceMeters?: number; radiusMeters?: number } } };

async function requestApi<T>(endpoint: string, body: object) {
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

export function FieldVerificationPanel({ endpoint, compact = false }: { endpoint: string; compact?: boolean }) {
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const next = await requestApi<VerificationStatus>(endpoint, { action: "status" });
      setStatus(next);
      setProjectId((current) => current || next.projects[0]?.id || "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos cargar asistencia y validaciones.");
    }
  }, [endpoint]);

  useEffect(() => { void load(); }, [load]);

  const nextAttendanceType = useMemo(() => {
    if (!status?.latestAttendance || status.latestAttendance.projectId !== projectId || status.latestAttendance.type === "CHECK_OUT") return "CHECK_IN" as const;
    return "CHECK_OUT" as const;
  }, [projectId, status?.latestAttendance]);

  async function activatePasskey() {
    setBusy("passkey");
    setMessage("");
    try {
      const options = await requestApi<{ challengeId: string; options: Parameters<typeof startRegistration>[0] }>(endpoint, { action: "passkey_registration_options" });
      const response = await startRegistration(options.options);
      await requestApi(endpoint, { action: "passkey_registration_verify", challengeId: options.challengeId, response, deviceName: "Dispositivo personal" });
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
    if (!projectId) return;
    setBusy("attendance");
    setMessage("Obteniendo tu ubicacion exacta...");
    try {
      const position = await getCurrentPosition();
      const options = await requestApi<{ challengeId: string; options: Parameters<typeof startAuthentication>[0] }>(endpoint, {
        action: "attendance_options",
        data: {
          projectId,
          type: nextAttendanceType,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy
        }
      });
      setMessage("Confirma tu identidad en el dispositivo.");
      const response = await startAuthentication(options.options);
      const result = await requestApi<{ type: "CHECK_IN" | "CHECK_OUT"; capturedAt: string; project: { title: string } }>(endpoint, {
        action: "attendance_verify",
        challengeId: options.challengeId,
        response
      });
      setMessage(`${result.type === "CHECK_IN" ? "Entrada" : "Salida"} registrada en ${result.project.title} a las ${formatDateTime(result.capturedAt)}.`);
      await load();
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
      const options = await requestApi<{ challengeId: string; options: Parameters<typeof startAuthentication>[0] }>(endpoint, { action: "validation_options", validationId });
      const response = await startAuthentication(options.options);
      await requestApi(endpoint, { action: "validation_verify", challengeId: options.challengeId, response });
      setMessage("Bitacora validada con la identidad del responsable y hora del servidor.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos validar la bitacora.");
    } finally {
      setBusy("");
    }
  }

  if (!status) return <div className="rounded-lg border bg-white p-5 text-sm text-muted-foreground">Cargando control de campo...</div>;

  return (
    <section className={`overflow-hidden rounded-lg border bg-white shadow-[0_16px_44px_rgba(1,45,56,0.08)] ${compact ? "p-4" : "p-6"}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Control de campo</p>
          <h2 className="mt-1 font-display text-xl font-bold">Entrada, salida y firmas verificables</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">La hora la registra Terraqo. La ubicacion confirma el proyecto y el dispositivo valida tu identidad.</p>
        </div>
        <span className={`inline-flex w-fit items-center gap-2 rounded-md px-3 py-2 text-xs font-bold ${status.hasPasskey ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
          {status.hasPasskey ? <ShieldCheck className="h-4 w-4" /> : <Fingerprint className="h-4 w-4" />}
          {status.hasPasskey ? "Dispositivo seguro activo" : "Activacion pendiente"}
        </span>
      </div>

      {!status.hasPasskey ? <div className="mt-5 flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50/60 p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-amber-950">Activa la huella, Face ID o PIN disponible en este equipo. Terraqo nunca recibe tus datos biometricos.</p><Button type="button" onClick={activatePasskey} disabled={Boolean(busy)}><Fingerprint className="mr-2 h-4 w-4" />{busy === "passkey" ? "Activando..." : "Activar dispositivo"}</Button></div> : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <label className="grid gap-2 text-sm font-semibold">Puesto de trabajo
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="h-11 rounded-md border bg-background px-3" disabled={!status.projects.length}>
            {!status.projects.length ? <option value="">Sin proyecto asignado</option> : null}
            {status.projects.map((project) => <option key={project.id} value={project.id}>{project.title}{project.location ? ` | ${project.location}` : ""}</option>)}
          </select>
        </label>
        <Button type="button" onClick={registerAttendance} disabled={!status.hasPasskey || !projectId || Boolean(busy)} className="h-11 min-w-48">
          {nextAttendanceType === "CHECK_IN" ? <LogIn className="mr-2 h-4 w-4" /> : <LogOut className="mr-2 h-4 w-4" />}
          {busy === "attendance" ? "Verificando..." : nextAttendanceType === "CHECK_IN" ? "Registrar entrada" : "Registrar salida"}
        </Button>
      </div>

      {status.latestAttendance ? <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-4 text-sm text-[#35485b]"><span className="inline-flex items-center gap-2 font-semibold"><CalendarClock className="h-4 w-4 text-primary" />Ultimo registro: {formatDateTime(status.latestAttendance.capturedAt)}</span><span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" />{status.latestAttendance.project.title}</span></div> : null}

      {status.pendingValidations.length ? <div className="mt-6 border-t pt-5"><div className="flex items-center justify-between gap-3"><div><p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Pendientes para ti</p><h3 className="mt-1 font-display text-lg font-bold">Bitacoras por supervisar</h3></div><span className="rounded-md bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{status.pendingValidations.length}</span></div><div className="mt-4 grid gap-3">{status.pendingValidations.map((validation) => <article key={validation.id} className="flex flex-col gap-4 rounded-md border bg-[#f3f3f3] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{validation.worklog.title}</p><p className="mt-1 text-sm text-muted-foreground">{validation.worklog.author.name || "Profesional"}{validation.worklog.project ? ` | ${validation.worklog.project.title}` : ""}</p><small className="mt-1 block text-muted-foreground">Registrada: {formatDateTime(validation.worklog.occurredAt)}</small></div><Button type="button" variant="outline" onClick={() => approveValidation(validation.id)} disabled={!status.hasPasskey || Boolean(busy)}><BadgeCheck className="mr-2 h-4 w-4" />{busy === validation.id ? "Validando..." : "Validar con mi dispositivo"}</Button></article>)}</div></div> : null}

      {message ? <p role="status" className={`mt-4 rounded-md border px-4 py-3 text-sm font-semibold ${message === "No estas en tu trabajo." ? "border-red-200 bg-red-50 text-red-800" : "bg-muted/35 text-[#29434d]"}`}><LocateFixed className="mr-2 inline h-4 w-4" />{message}</p> : null}
    </section>
  );
}
