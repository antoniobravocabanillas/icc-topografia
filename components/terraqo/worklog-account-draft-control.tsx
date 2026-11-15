"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { sameDraft, type AccountDraft } from "@/lib/terraqo/worklog-account-draft";
import type { WorklogDraftFields } from "@/lib/terraqo/worklog-local-draft";

const endpoint = "/api/terraqo/worklog/draft";
const labels: Record<keyof WorklogDraftFields, string> = {
  title: "Título",
  summary: "Descripción",
  outcome: "Resultado",
  workDate: "Fecha de trabajo",
  workspaceId: "Espacio",
  projectId: "Proyecto",
  previousWorklogId: "Trabajo anterior",
  contributionRole: "Rol",
  responsibilities: "Responsabilidades",
  methods: "Métodos",
  tools: "Herramientas",
  type: "Tipo",
  visibility: "Visibilidad",
  skills: "Habilidades",
  evidenceUrls: "Enlaces",
  locationLabel: "Lugar",
  includeAutomaticLocation: "Ubicación automática",
};

export function WorklogAccountDraftControl({
  profileId,
  disabled,
  readFields,
  applyFields,
  isPristine,
  lock,
}: {
  profileId: string;
  disabled: boolean;
  readFields: () => WorklogDraftFields | null;
  applyFields: (fields: WorklogDraftFields) => void;
  isPristine: () => boolean;
  lock: (locked: boolean) => void;
}) {
  const [remote, setRemote] = useState<AccountDraft | null>(null);
  const [local, setLocal] = useState<WorklogDraftFields | null>(null);
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const base = useRef<string | null>(null);
  const initial = useRef<WorklogDraftFields | null>(null);
  useEffect(() => {
    initial.current ??= readFields();
  }, [readFields]);

  async function request(
    action: "read" | "save" | "keep-local" | "open" | "remove-copy" | "discard",
    index = 0,
  ) {
    const fields = readFields();
    if (disabled || busy.current || !fields) return;
    busy.current = true;
    setPending(true);
    lock(true);
    let comparing = Boolean(local);
    try {
      const revision = action === "save" ? base.current : remote?.revision;
      const command =
        action === "discard"
          ? { action, base: revision }
          : action === "remove-copy"
            ? { action, base: revision, index }
            : { action, base: revision, fields, ...(action === "open" ? { index } : {}) };
      const response = await fetch(endpoint, {
        method: action === "read" ? "GET" : "PUT",
        cache: "no-store",
        headers: { "X-Draft-Profile": profileId, "Content-Type": "application/json" },
        body: action === "read" ? undefined : JSON.stringify(command),
      });
      const result = (await response.json()) as {
        draft: AccountDraft | null;
        revision: string | null;
        error?: string;
      };
      if (!response.ok && response.status !== 409)
        throw new Error(result.error || "No se pudo acceder a tu borrador.");
      const draft = result.draft;
      const latest = readFields() ?? fields;
      const pristine = isPristine() && initial.current && sameDraft(latest, initial.current);
      setRemote(draft);
      if (!draft) {
        base.current = result.revision;
        setLocal(null);
        comparing = false;
        setStatus(
          result.revision
            ? "El borrador de la cuenta se descartó. Tu versión sigue en el formulario."
            : "Tu cuenta todavía no tiene un borrador.",
        );
      } else if (
        response.status === 409 ||
        !sameDraft(latest, fields) ||
        (action === "read" && !sameDraft(latest, draft.fields) && !pristine)
      ) {
        comparing = true;
        setLocal(latest);
        setStatus("Hay dos versiones. Elige con cuál continuar. La otra quedará como copia privada.");
      } else {
        if (action !== "remove-copy" || base.current === revision) base.current = draft.revision;
        if (action === "read" || action === "open") applyFields(draft.fields);
        if (action !== "remove-copy") {
          comparing = false;
          setLocal(null);
        }
        setStatus(
          action === "remove-copy"
            ? "Copia eliminada."
            : action === "read"
              ? "Borrador de la cuenta abierto."
              : action === "save"
                ? "Borrador guardado en tu cuenta."
                : "Versiones conservadas en tu cuenta.",
        );
      }
    } catch (error) {
      setStatus(
        error instanceof TypeError
          ? "Sin conexión. Tu formulario sigue en este dispositivo."
          : error instanceof Error
            ? error.message
            : "No se pudo confirmar el guardado.",
      );
    } finally {
      busy.current = false;
      setPending(false);
      lock(comparing);
    }
  }

  return (
    <section aria-label="Borrador privado de la cuenta" className="mt-4 rounded-xl border bg-white p-4">
      <h3 className="font-semibold">Borrador privado de la cuenta</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Continúa desde otro dispositivo con el texto y los enlaces. Los archivos permanecen en este equipo.
      </p>
      <fieldset disabled={disabled || pending} className="mt-3 min-w-0 space-y-3">
        {local && remote ? (
          <>
            <div className="rounded-lg border bg-slate-50 p-3 text-sm">
              {(Object.keys(labels) as (keyof WorklogDraftFields)[])
                .filter((key) => (local[key] ?? "") !== (remote.fields[key] ?? ""))
                .map((key) => (
                  <div key={key} className="mb-2 break-words">
                    <strong>{labels[key]}</strong>
                    <p>Dispositivo · {String(local[key] ?? "") || "Vacío"}</p>
                    <p>Cuenta · {String(remote.fields[key] ?? "") || "Vacío"}</p>
                  </div>
                ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void request("keep-local")}>
                Usar mi versión
              </Button>
              <Button type="button" variant="outline" onClick={() => void request("open")}>
                Usar versión de la cuenta
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setLocal(null);
                  lock(false);
                  setStatus("Continúas con la versión de este dispositivo.");
                }}
              >
                Seguir editando
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void request("save")}>
              Guardar en mi cuenta
            </Button>
            <Button type="button" variant="outline" onClick={() => void request("read")}>
              Abrir borrador de mi cuenta
            </Button>
          </div>
        )}
        {remote?.copies.map((copy, i) => (
          <details key={remote.revision + i} className="rounded-lg border p-3 text-sm">
            <summary className="cursor-pointer break-words">
              Copia {i + 1} · {copy.title || "Sin título"}
            </summary>
            <p className="my-2 whitespace-pre-wrap break-words">{copy.summary}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => void request("open", i + 1)}>
                Continuar con esta copia
              </Button>
              <Button type="button" variant="ghost" onClick={() => void request("remove-copy", i + 1)}>
                Eliminar esta copia
              </Button>
            </div>
          </details>
        ))}
        {remote && !local && (
          <details className="text-sm">
            <summary className="cursor-pointer">Descartar borrador de la cuenta</summary>
            <p className="my-2">
              Se eliminarán el texto guardado y todas sus copias. El formulario de este dispositivo seguirá
              disponible.
            </p>
            <Button type="button" variant="outline" onClick={() => void request("discard")}>
              Confirmar descarte
            </Button>
          </details>
        )}
      </fieldset>
      <p className="mt-2 text-sm" role="status">
        {pending ? "Consultando tu cuenta…" : status}
      </p>
    </section>
  );
}
