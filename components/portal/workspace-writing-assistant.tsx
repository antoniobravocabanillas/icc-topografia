"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Check, LoaderCircle, RotateCcw, X } from "lucide-react";
import { TerraqoWritingMark } from "@/components/terraqo/writing-mark";

type EditableField = HTMLTextAreaElement | HTMLInputElement;
type Suggestions = { corrected: string; improved: string; language: string };
type Placement = {
  left: number;
  top: number;
  width: number;
  launcherLeft: number;
  launcherTop: number;
  above: boolean;
};

const excludedNames =
  /(email|correo|password|clave|phone|telefono|whatsapp|url|link|evidence|evidencia|slug|code|codigo|document|documento|dni|ruc|date|fecha|search|buscar|query|country|pais|city|ciudad|district|distrito|address|direccion|company|empresa|client|cliente|project|proyecto)/i;
const proseNames =
  /(title|titulo|headline|summary|resumen|description|descripcion|detail|detalle|body|content|contenido|message|mensaje|note|nota|bio|about|acerca|role|cargo|position|puesto|achievement|logro|responsibil|motivation|presentacion|cover|availability|disponibilidad|reply|respuesta|comment|comentario)/i;

function isEditableProseField(node: EventTarget | null): node is EditableField {
  if (
    !(node instanceof HTMLTextAreaElement) &&
    !(node instanceof HTMLInputElement)
  )
    return false;
  if (
    node.disabled ||
    node.readOnly ||
    node.dataset.aiWriting === "off" ||
    node.closest('[data-writing-assistant="off"]')
  )
    return false;
  const identity = `${node.name} ${node.id}`;
  if (
    excludedNames.test(identity) ||
    /https?:\/\/|enlaces? o referencias?|uno por linea/i.test(
      node.placeholder || "",
    )
  )
    return false;
  if (node instanceof HTMLTextAreaElement) return true;
  return (
    (node.type === "text" || node.type === "") &&
    (node.dataset.aiWriting === "on" || proseNames.test(identity))
  );
}

function inferPurpose(field: EditableField) {
  const context =
    `${window.location.pathname} ${field.name} ${field.id}`.toLowerCase();
  if (context.includes("experien")) return "experience";
  if (context.includes("bitacora") || context.includes("worklog"))
    return "worklog";
  if (context.includes("perfil") || context.includes("profile"))
    return "profile";
  if (context.includes("highlight") || context.includes("logro"))
    return "highlights";
  if (
    context.includes("commons") ||
    context.includes("post") ||
    context.includes("reply")
  )
    return "post";
  return "general";
}

function updateField(field: EditableField, value: string) {
  const prototype =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
  field.focus({ preventScroll: true });
}

export function WorkspaceWritingAssistant() {
  const fieldRef = useRef<EditableField | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [placement, setPlacement] = useState<Placement>({
    left: 16,
    top: 80,
    width: 640,
    launcherLeft: 16,
    launcherTop: 80,
    above: false,
  });

  const reposition = useCallback(() => {
    const field = fieldRef.current;
    if (!field || !document.contains(field)) return setVisible(false);
    const rect = field.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const mobile = viewportWidth < 768;
    const width = mobile
      ? viewportWidth - 24
      : Math.min(680, viewportWidth - 32);
    const panelHeight = Math.min(
      panelRef.current?.offsetHeight || 430,
      viewportHeight - 32,
    );
    const roomBelow = viewportHeight - rect.bottom;
    const above =
      !mobile &&
      roomBelow < Math.min(panelHeight + 18, 470) &&
      rect.top > roomBelow;
    const left = mobile
      ? 12
      : Math.max(16, Math.min(rect.left, viewportWidth - width - 16));
    const top = mobile
      ? viewportHeight - Math.min(panelHeight, viewportHeight - 24) - 12
      : above
        ? Math.max(16, rect.top - panelHeight - 12)
        : Math.min(rect.bottom + 12, viewportHeight - panelHeight - 16);
    setPlacement({
      left,
      top,
      width,
      launcherLeft: Math.max(
        12,
        Math.min(rect.right - 94, viewportWidth - 104),
      ),
      launcherTop: Math.max(
        10,
        Math.min(rect.bottom - 38, viewportHeight - 48),
      ),
      above,
    });
  }, []);

  useEffect(() => {
    const focus = (event: FocusEvent) => {
      if (!isEditableProseField(event.target)) return;
      fieldRef.current = event.target;
      setMessage("");
      setSuggestions(null);
      setExpanded(false);
      setVisible(true);
      requestAnimationFrame(reposition);
    };
    const move = () => requestAnimationFrame(reposition);
    document.addEventListener("focusin", focus);
    window.addEventListener("resize", move);
    window.addEventListener("scroll", move, true);
    return () => {
      document.removeEventListener("focusin", focus);
      window.removeEventListener("resize", move);
      window.removeEventListener("scroll", move, true);
    };
  }, [reposition]);

  useEffect(() => {
    if (!expanded) return;
    requestAnimationFrame(reposition);
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        panelRef.current?.contains(target) ||
        fieldRef.current?.contains(target)
      )
        return;
      setExpanded(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [expanded, reposition, suggestions]);

  async function improve() {
    const field = fieldRef.current;
    const text = field?.value.trim() || "";
    if (!field || !document.contains(field)) return setVisible(false);
    setExpanded(true);
    if (text.length < 3)
      return setMessage("Escribe una idea breve y vuelve a intentarlo.");
    setWorking(true);
    setMessage("");
    setSuggestions(null);
    try {
      const response = await fetch("/api/terraqo/writing-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, purpose: inferPurpose(field) }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload?.error || "No pudimos revisar el texto.");
      setSuggestions(payload.data);
      setMessage(
        `${payload.data.language} detectado · elige el acabado que prefieras`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No pudimos revisar el texto.",
      );
    } finally {
      setWorking(false);
      requestAnimationFrame(reposition);
    }
  }

  function applySuggestion(text: string) {
    const field = fieldRef.current;
    if (!field || !document.contains(field)) return setVisible(false);
    updateField(field, text);
    setSuggestions(null);
    setExpanded(false);
  }

  if (!visible) return null;
  const launcherStyle = {
    left: placement.launcherLeft,
    top: placement.launcherTop,
  } as CSSProperties;
  const panelStyle = {
    left: placement.left,
    top: placement.top,
    width: placement.width,
  } as CSSProperties;

  return (
    <>
      {!expanded ? (
        <button
          type="button"
          style={launcherStyle}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            setExpanded(true);
            requestAnimationFrame(reposition);
          }}
          className="fixed z-[82] flex h-9 items-center gap-2 rounded-full border border-[#85a9d8]/60 bg-[#10253d]/95 px-2.5 text-[11px] font-bold text-white shadow-[0_10px_28px_rgba(16,37,61,.28)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-[#183b63]"
          aria-label="Abrir Pulso de redacción"
        >
          <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-[#5d8fd1] to-[#43bed0]">
            <TerraqoWritingMark className="h-4 w-4" />
          </span>
          Pulir
        </button>
      ) : null}
      {expanded ? (
        <aside
          ref={panelRef}
          style={panelStyle}
          className="fixed z-[90] max-h-[calc(100dvh-24px)] overflow-y-auto rounded-[22px] border border-[#c7d6e5] bg-white/97 p-3 shadow-[0_24px_80px_rgba(9,28,49,.25)] backdrop-blur-2xl"
          aria-label="Pulso de redacción Terraqo"
        >
          <header className="flex items-start gap-3 border-b border-slate-100 pb-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#10253d] text-white">
              <TerraqoWritingMark className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-sm text-[#0e1a26]">Pulso de redacción</b>
              <small className="text-xs text-[#607083]">
                Cuida tu voz. Mejora la forma.
              </small>
            </span>
            <button
              type="button"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => setExpanded(false)}
              className="grid h-9 w-9 place-items-center rounded-xl text-[#607083] hover:bg-slate-100"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </header>
          {!suggestions ? (
            <div className="py-4">
              <p className="text-sm leading-6 text-[#43566a]">
                Analizo el idioma y preparo dos acabados: uno fiel a tu idea y
                otro más profesional, sin inventar información.
              </p>
              {message ? (
                <p
                  aria-live="polite"
                  className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800"
                >
                  {message}
                </p>
              ) : null}
              <button
                type="button"
                onPointerDown={(event) => event.preventDefault()}
                onClick={improve}
                disabled={working}
                className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#315f9f] via-[#4374ba] to-[#21a9c3] px-4 text-sm font-bold text-white transition hover:brightness-105 disabled:cursor-wait disabled:opacity-70"
              >
                {working ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <TerraqoWritingMark className="h-4 w-4" />
                )}
                {working
                  ? "Leyendo intención y contexto…"
                  : "Preparar dos versiones"}
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 py-3">
                <p className="text-xs font-medium text-emerald-700">
                  {message}
                </p>
                <button
                  type="button"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={improve}
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-[#4374ba]"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Rehacer
                </button>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <AssistantSuggestion
                  eyebrow="Precisión"
                  title="Corrección fiel"
                  description="Ortografía, gramática y sintaxis; conserva tu forma de expresarte."
                  text={suggestions.corrected}
                  onApply={() => applySuggestion(suggestions.corrected)}
                />
                <AssistantSuggestion
                  eyebrow="Proyección"
                  title="Versión profesional"
                  description="Más clara y sólida; mantiene hechos y esencia."
                  text={suggestions.improved}
                  onApply={() => applySuggestion(suggestions.improved)}
                />
              </div>
            </>
          )}
          <span
            className={`absolute h-2.5 w-2.5 rotate-45 border-[#c7d6e5] bg-white max-md:hidden ${placement.above ? "-bottom-1 border-b border-r" : "-top-1 border-l border-t"}`}
            style={{
              left: Math.max(
                24,
                Math.min(
                  placement.launcherLeft - placement.left + 38,
                  placement.width - 32,
                ),
              ),
            }}
          />
        </aside>
      ) : null}
    </>
  );
}

function AssistantSuggestion({
  eyebrow,
  title,
  description,
  text,
  onApply,
}: {
  eyebrow: string;
  title: string;
  description: string;
  text: string;
  onApply: () => void;
}) {
  return (
    <article className="flex min-h-0 flex-col rounded-2xl border border-[#d8e2e8] bg-[#f7fafc] p-3">
      <span className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#4374ba]">
        {eyebrow}
      </span>
      <p className="mt-1 text-sm font-bold text-[#0e1a26]">{title}</p>
      <p className="mt-1 text-xs leading-5 text-[#607083]">{description}</p>
      <p className="mt-3 max-h-40 flex-1 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-[#35485b]">
        {text}
      </p>
      <button
        type="button"
        onPointerDown={(event) => event.preventDefault()}
        onClick={onApply}
        className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-[#4374ba]/25 bg-white px-3 text-xs font-bold text-[#315f9f] transition hover:bg-[#315f9f] hover:text-white"
      >
        <Check className="h-3.5 w-3.5" /> Usar esta versión
      </button>
    </article>
  );
}
