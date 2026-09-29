"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import { ArrowRight, BriefcaseBusiness, Clock3, LocateFixed, LogOut, MapPin, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  formatElapsed,
  formatTime,
  requestFieldVerification,
  type VerificationStatus,
} from "@/components/terraqo/field-verification-panel";

function currentPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Este dispositivo no permite obtener ubicación."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 0,
    });
  });
}

export function AttendanceStatusControl({ endpoint }: { endpoint: string }) {
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const next = await requestFieldVerification<VerificationStatus>(endpoint, {
        action: "status",
      });
      setStatus(next);
    } catch {
      setStatus(null);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
    const reload = () => void load();
    window.addEventListener("terraqo:attendance-updated", reload);
    return () => window.removeEventListener("terraqo:attendance-updated", reload);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);

  useEffect(() => {
    if (status?.latestAttendance?.type !== "CHECK_IN") return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [status?.latestAttendance?.id, status?.latestAttendance?.type]);

  const active = status?.latestAttendance?.type === "CHECK_IN" ? status.latestAttendance : null;
  const project = useMemo(
    () => status?.projects.find((item) => item.id === active?.projectId),
    [active?.projectId, status?.projects],
  );

  async function registerExit() {
    if (!active) return;
    setBusy(true);
    setMessage("Confirmando tu ubicación…");
    try {
      const position = await currentPosition();
      const options = await requestFieldVerification<{
        challengeId: string;
        options: Parameters<typeof startAuthentication>[0];
      }>(endpoint, {
        action: "attendance_options",
        data: {
          projectId: active.projectId,
          type: "CHECK_OUT",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        },
      });
      setMessage("Confirma tu identidad en el dispositivo.");
      const response = await startAuthentication(options.options);
      await requestFieldVerification(endpoint, {
        action: "attendance_verify",
        challengeId: options.challengeId,
        response,
      });
      setMessage("Salida registrada correctamente.");
      await load();
      window.dispatchEvent(new CustomEvent("terraqo:attendance-updated"));
      window.setTimeout(() => setOpen(false), 650);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error) {
        setMessage("Necesitamos una ubicación precisa para registrar la salida.");
      } else {
        setMessage(error instanceof Error ? error.message : "No pudimos registrar la salida.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!active || !status) return null;

  const elapsed = formatElapsed(active.capturedAt, now);
  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="group flex min-h-11 items-center gap-3 rounded-xl border border-[#cfe8e2] bg-[#effaf7] px-3 text-left text-[#0e1a26] shadow-[0_8px_24px_rgba(4,117,105,0.08)] transition hover:-translate-y-0.5 hover:border-[#8acdc1] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087b70]"
      aria-haspopup="dialog"
      aria-expanded={open}
    >
      <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-[#087b70] shadow-sm">
        <span className="absolute inset-0 animate-ping rounded-full bg-[#0da785]/15 motion-reduce:animate-none" />
        <Clock3 className="relative h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <strong className="block whitespace-nowrap text-xs tabular-nums">Jornada · {elapsed}</strong>
        <span className="block max-w-32 truncate text-[10px] font-medium text-[#607083]">{project?.title || active.project.title}</span>
      </span>
    </button>
  );

  return (
    <>
      <div className="hidden lg:block">{trigger}</div>
      <div className="fixed inset-x-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-40 md:hidden">
        <div className="mx-auto w-fit">{trigger}</div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-[80]" role="presentation">
          <button
            type="button"
            aria-label="Cerrar detalle de jornada"
            className="absolute inset-0 bg-[#071925]/35 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="active-attendance-title"
            className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-3xl border border-[#d7e4e9] bg-white p-5 shadow-[0_-24px_70px_rgba(7,25,37,0.22)] sm:inset-x-auto sm:bottom-auto sm:right-6 sm:top-20 sm:w-[390px] sm:rounded-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#087b70]">Registro verificable</p>
                <h2 id="active-attendance-title" className="mt-1 font-display text-xl font-bold tracking-[-0.02em] text-[#0e1a26]">Jornada en curso</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#dce5ed] text-[#52677a] transition hover:bg-[#f1f5f7]" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 rounded-2xl bg-[#f3f8f8] p-4">
              <div className="flex items-center justify-between gap-4">
                <span className="inline-flex items-center gap-2 text-sm font-bold text-[#087b70]"><span className="h-2.5 w-2.5 rounded-full bg-[#0da785]" />En jornada</span>
                <strong className="font-display text-2xl tabular-nums text-[#0e1a26]">{elapsed}</strong>
              </div>
              <div className="mt-4 border-t border-[#d9e9e6] pt-4">
                <p className="font-display text-base font-bold text-[#0e1a26]">{project?.title || active.project.title}</p>
                <p className="mt-1 text-sm font-semibold text-[#52677a]">{status.workspace.name}</p>
                <p className="mt-0.5 text-xs text-[#748596]">{status.membership.title || "Profesional asignado"}</p>
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-[#dce5ed] p-3"><dt className="text-xs text-[#748596]">Entrada</dt><dd className="mt-1 font-bold tabular-nums text-[#0e1a26]">{formatTime(active.capturedAt)}</dd></div>
              <div className="rounded-xl border border-[#dce5ed] p-3"><dt className="text-xs text-[#748596]">Ubicación</dt><dd className="mt-1 flex items-center gap-1.5 font-bold text-[#0e1a26]"><MapPin className="h-4 w-4 text-[#1768b0]" />{project?.location || "Proyecto verificado"}</dd></div>
            </dl>

            <div className="mt-5 grid gap-2">
              <Button type="button" onClick={registerExit} disabled={busy} className="min-h-12 bg-[#087b70] text-white hover:bg-[#06675f]">
                <LogOut className="mr-2 h-4 w-4" />{busy ? "Verificando…" : "Registrar salida"}
              </Button>
              <Button asChild variant="outline" className="min-h-12"><Link href="/portal/jornadas" onClick={() => setOpen(false)}><BriefcaseBusiness className="mr-2 h-4 w-4" />Ver historial <ArrowRight className="ml-auto h-4 w-4" /></Link></Button>
            </div>
            {message ? <p className="mt-4 flex items-start gap-2 rounded-xl bg-[#eef5fa] px-3 py-2.5 text-sm font-semibold text-[#29434d]" role="status" aria-live="polite"><LocateFixed className="mt-0.5 h-4 w-4 shrink-0 text-[#1768b0]" />{message}</p> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
