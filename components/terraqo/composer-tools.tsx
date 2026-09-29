"use client";

import { useId, useRef, type RefObject } from "react";
import { Smile } from "lucide-react";
import { TerraqoWritingMark } from "@/components/terraqo/writing-mark";

export const composerToolClass =
  "grid h-11 w-11 shrink-0 place-items-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-40";

export function WritingAssistantTrigger({
  field,
  disabled,
}: {
  field: RefObject<HTMLTextAreaElement | null>;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label="Abrir Pulso de redacción"
      title="Pulso de redacción"
      className={composerToolClass}
      onClick={(event) => {
        if (!field.current) return;
        document.dispatchEvent(
          new CustomEvent("terraqo:open-writing-assistant", {
            detail: { field: field.current, anchor: event.currentTarget },
          }),
        );
      }}
    >
      <TerraqoWritingMark className="h-8 w-8" />
    </button>
  );
}

const emojiGroups = [
  {
    label: "Gestos",
    items: [
      ["😊", "Sonrisa"], ["😄", "Muy feliz"], ["😂", "Risa"], ["😉", "Guiño"],
      ["😍", "Encantado"], ["🤔", "Pensando"], ["😮", "Sorpresa"], ["😅", "Alivio"],
      ["👍", "De acuerdo"], ["👎", "En desacuerdo"], ["👌", "Perfecto"], ["🙏", "Gracias"],
      ["👏", "Aplausos"], ["🙌", "Celebración"], ["💪", "Fuerza"], ["🤝", "Acuerdo"],
    ],
  },
  {
    label: "Trabajo",
    items: [
      ["✅", "Completado"], ["⚠️", "Atención"], ["📍", "Ubicación"], ["📅", "Fecha"],
      ["⏱️", "Tiempo"], ["📌", "Fijar"], ["📎", "Adjunto"], ["📝", "Nota"],
      ["💡", "Idea"], ["🔎", "Revisar"], ["📐", "Medición"], ["🦺", "Seguridad"],
      ["🏗️", "Obra"], ["🗺️", "Mapa"], ["📷", "Fotografía"], ["🚧", "Trabajo en curso"],
    ],
  },
  {
    label: "Reconocimiento",
    items: [
      ["🎉", "Felicitaciones"], ["🏆", "Logro"], ["⭐", "Excelente"], ["✨", "Destacado"],
      ["🚀", "Avance"], ["❤️", "Corazón"], ["💙", "Corazón azul"], ["💚", "Corazón verde"],
    ],
  },
] as const;

export function ComposerEmojiPicker({
  onSelect,
  disabled,
}: {
  onSelect: (emoji: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        popoverTarget={id}
        aria-label="Insertar emoticono"
        title="Emoticonos"
        className={composerToolClass}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          if (panel.current) {
            const panelWidth = window.matchMedia("(min-width: 640px)").matches
              ? 320
              : 288;
            panel.current.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - panelWidth - 12))}px`;
            panel.current.style.top = `${Math.max(12, rect.top - Math.min(380, window.innerHeight - 24))}px`;
          }
        }}
      >
        <Smile className="h-5 w-5" />
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        aria-label="Emoticonos"
        className="fixed m-0 max-h-[min(380px,calc(100dvh-24px))] w-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 text-slate-900 shadow-xl sm:w-80"
      >
        <p className="mb-3 text-sm font-semibold">Emoticonos</p>
        <div className="space-y-3">
          {emojiGroups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">{group.label}</h3>
              <div className="grid grid-cols-6 gap-1 sm:grid-cols-8">
                {group.items.map(([emoji, label]) => (
                  <button
                    key={`${group.label}-${label}`}
                    type="button"
                    aria-label={label}
                    title={label}
                    className="h-10 rounded-lg text-xl transition-colors hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700"
                    onClick={() => {
                      onSelect(emoji);
                      panel.current?.hidePopover();
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
