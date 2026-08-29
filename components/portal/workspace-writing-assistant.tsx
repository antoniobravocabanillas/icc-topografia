"use client";

import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, Sparkles, X } from "lucide-react";

type EditableField = HTMLTextAreaElement | HTMLInputElement;

const excludedNames = /(email|correo|password|clave|phone|telefono|whatsapp|url|link|evidence|evidencia|slug|code|codigo|document|documento|dni|ruc|date|fecha|search|buscar|query|country|pais|city|ciudad|district|distrito|address|direccion|company|empresa|client|cliente|project|proyecto)/i;
const proseNames = /(title|titulo|headline|summary|resumen|description|descripcion|detail|detalle|body|content|contenido|message|mensaje|note|nota|bio|about|acerca|role|cargo|position|puesto|achievement|logro|responsibil|motivation|presentacion|cover|availability|disponibilidad|reply|respuesta|comment|comentario)/i;

function isEditableProseField(node: EventTarget | null): node is EditableField {
  if (!(node instanceof HTMLTextAreaElement) && !(node instanceof HTMLInputElement)) return false;
  if (node.disabled || node.readOnly || node.dataset.aiWriting === "off") return false;
  if (node.closest('[data-writing-assistant="off"]')) return false;

  const identity = `${node.name} ${node.id}`;
  if (excludedNames.test(identity) || /https?:\/\/|enlaces? o referencias?|uno por linea/i.test(node.placeholder || "")) return false;
  if (node instanceof HTMLTextAreaElement) return true;
  return (node.type === "text" || node.type === "") && (node.dataset.aiWriting === "on" || proseNames.test(identity));
}

function inferPurpose(field: EditableField) {
  const context = `${window.location.pathname} ${field.name} ${field.id}`.toLowerCase();
  if (context.includes("experien")) return "experience";
  if (context.includes("bitacora") || context.includes("worklog")) return "worklog";
  if (context.includes("perfil") || context.includes("profile")) return "profile";
  if (context.includes("highlight") || context.includes("logro")) return "highlights";
  if (context.includes("commons") || context.includes("post") || context.includes("reply")) return "post";
  return "general";
}

function updateField(field: EditableField, value: string) {
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
  field.focus({ preventScroll: true });
}

export function WorkspaceWritingAssistant() {
  const activeField = useRef<EditableField | null>(null);
  const [visible, setVisible] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [suggestions, setSuggestions] = useState<{ corrected: string; improved: string; language: string } | null>(null);

  useEffect(() => {
    const handleFocus = (event: FocusEvent) => {
      try {
        if (!isEditableProseField(event.target)) return;
        activeField.current = event.target;
        setMessage("");
        setSuccess(false);
        setSuggestions(null);
        setVisible(true);
      } catch (error) {
        console.error("Terraqo writing assistant focus detection failed", error);
      }
    };
    document.addEventListener("focusin", handleFocus);
    return () => document.removeEventListener("focusin", handleFocus);
  }, []);

  async function improve() {
    const field = activeField.current;
    const text = field?.value.trim() || "";
    if (!field || !document.contains(field)) {
      setVisible(false);
      return;
    }
    if (text.length < 3) {
      setSuccess(false);
      setMessage("Escribe primero una idea breve.");
      return;
    }

    setWorking(true);
    setMessage("");
    setSuggestions(null);
    try {
      const response = await fetch("/api/terraqo/writing-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, purpose: inferPurpose(field) })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "No pudimos corregir el texto.");
      setSuccess(true);
      setSuggestions(payload.data);
      setMessage(`Idioma detectado: ${payload.data.language}`);
    } catch (error) {
      setSuccess(false);
      setMessage(error instanceof Error ? error.message : "No pudimos corregir el texto.");
    } finally {
      setWorking(false);
    }
  }

  if (!visible) return null;

  function applySuggestion(text: string) {
    const field = activeField.current;
    if (!field || !document.contains(field)) return setVisible(false);
    updateField(field, text);
    setSuggestions(null);
    setMessage("Versión aplicada. Revísala antes de guardar.");
  }

  return (
    <aside className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[70] mx-auto grid max-h-[min(78dvh,680px)] max-w-2xl gap-2 overflow-y-auto rounded-2xl border border-[#b9d6df] bg-white/95 p-2.5 shadow-[0_18px_55px_rgba(14,26,38,0.2)] backdrop-blur-xl md:inset-x-auto md:bottom-6 md:right-6 md:mx-0 md:w-[min(680px,calc(100vw-3rem))]" aria-label="Asistente de redacción">
      <div className="flex items-center gap-2">
      <button type="button" onPointerDown={(event) => event.preventDefault()} onClick={improve} disabled={working} className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#4374ba] to-[#20b8ce] px-4 text-sm font-bold text-white transition hover:brightness-105 disabled:cursor-wait disabled:opacity-70">
        {working ? <LoaderCircle className="h-4 w-4 animate-spin" /> : success ? <Check className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
        {working ? "Analizando…" : suggestions ? "Generar nuevamente" : "Revisar con IA"}
      </button>
      {message ? <p aria-live="polite" className={`max-w-48 text-xs font-medium ${success ? "text-emerald-700" : "text-[#607083]"}`}>{message}</p> : null}
      <button type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => setVisible(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[#607083] hover:bg-[#eef3f7]" aria-label="Ocultar asistente"><X className="h-4 w-4" /></button>
      </div>
      {suggestions ? <div className="grid gap-2 md:grid-cols-2">
        <AssistantSuggestion title="Corrección fiel" description="Corrige idioma y sintaxis sin reformular la esencia." text={suggestions.corrected} onApply={() => applySuggestion(suggestions.corrected)} />
        <AssistantSuggestion title="Versión profesional" description="Mejora claridad y profundidad sin exagerar." text={suggestions.improved} onApply={() => applySuggestion(suggestions.improved)} />
      </div> : null}
    </aside>
  );
}

function AssistantSuggestion({ title, description, text, onApply }: { title: string; description: string; text: string; onApply: () => void }) {
  return <article className="rounded-xl border border-[#d8e2e8] bg-[#f7fafc] p-3"><p className="text-sm font-bold text-[#0e1a26]">{title}</p><p className="mt-1 text-xs text-[#607083]">{description}</p><p className="mt-3 max-h-44 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-[#35485b]">{text}</p><button type="button" onPointerDown={(event) => event.preventDefault()} onClick={onApply} className="mt-3 min-h-10 w-full rounded-lg border border-[#4374ba]/25 bg-white px-3 text-xs font-bold text-[#4374ba] hover:bg-[#4374ba] hover:text-white">Usar esta versión</button></article>;
}
