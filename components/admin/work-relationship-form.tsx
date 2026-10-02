"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, LoaderCircle, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { WorkRelationshipFormState } from "@/lib/server/jornada-actions";

const initialState: WorkRelationshipFormState = {
  status: "idle",
  message: "",
  submissionId: 0,
};

type WorkRelationshipFormProps = {
  action: (
    previousState: WorkRelationshipFormState,
    formData: FormData,
  ) => Promise<WorkRelationshipFormState>;
  children: ReactNode;
};

export function WorkRelationshipForm({ action, children }: WorkRelationshipFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [dirty, setDirty] = useState(false);
  const [changeMessage, setChangeMessage] = useState("");

  useEffect(() => {
    if (state.status === "success") {
      setDirty(false);
      setChangeMessage("");
    }
  }, [state.status, state.submissionId]);

  const feedback = pending
    ? "Guardando y versionando la configuración laboral…"
    : state.status === "error"
      ? state.message
      : dirty
      ? changeMessage || "Hay cambios sin guardar. Confírmalos para aplicar la nueva configuración."
      : state.message || "El guardado cierra la vigencia anterior y crea una nueva versión. Las estimaciones no sustituyen una boleta de pago.";

  const feedbackTone = pending
    ? "border-blue-200 bg-blue-50 text-blue-900"
    : state.status === "error"
      ? "border-rose-200 bg-rose-50 text-rose-900"
      : dirty
      ? "border-amber-200 bg-amber-50 text-amber-950"
      : state.status === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
        : "border-blue-200 bg-blue-50 text-blue-900";

  const buttonLabel = pending
    ? "Guardando…"
    : state.status === "success" && !dirty
      ? "Guardado"
      : dirty
        ? "Guardar cambios"
        : "Guardar y confirmar";

  return (
    <form
      action={formAction}
      className="rounded-lg border bg-white p-5"
      onChange={(event) => {
        const fieldName = event.target instanceof HTMLElement ? event.target.getAttribute("name") : null;
        setDirty(true);
        setChangeMessage(
          fieldName === "additionalHoursPolicy"
            ? "Cambiaste el tratamiento de horas extra. Guarda para aplicar esta política a las próximas jornadas."
            : "Hay cambios sin guardar. Confírmalos para aplicar la nueva configuración.",
        );
      }}
    >
      {children}

      <div className={`mt-6 flex flex-col gap-3 rounded-md border p-4 text-xs leading-5 sm:flex-row sm:items-center sm:justify-between ${feedbackTone}`}>
        <p
          role={state.status === "error" ? "alert" : "status"}
          aria-live={state.status === "error" ? "assertive" : "polite"}
          aria-atomic="true"
          className="font-medium"
        >
          {feedback}
        </p>
        <Button type="submit" className="min-h-11 shrink-0" disabled={pending} aria-disabled={pending}>
          {pending ? (
            <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : state.status === "success" && !dirty ? (
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Save className="h-4 w-4" aria-hidden="true" />
          )}
          {buttonLabel}
        </Button>
      </div>
    </form>
  );
}
