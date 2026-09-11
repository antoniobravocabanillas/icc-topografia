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

const emojis = [
  ["😊", "Sonrisa"],
  ["👍", "De acuerdo"],
  ["🙌", "Celebración"],
  ["👏", "Aplausos"],
  ["🤝", "Acuerdo"],
  ["✅", "Completado"],
  ["📍", "Ubicación"],
  ["📅", "Fecha"],
  ["💡", "Idea"],
  ["🎉", "Felicitaciones"],
  ["❤️", "Corazón"],
  ["🙏", "Gracias"],
];

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
            panel.current.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - 276))}px`;
            panel.current.style.top = `${Math.max(12, rect.top - 224)}px`;
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
        className="fixed m-0 w-64 rounded-2xl border border-slate-200 bg-white p-3 text-slate-900 shadow-xl"
      >
        <p className="mb-2 text-sm font-semibold">Emoticonos</p>
        <div className="grid grid-cols-4 gap-1">
          {emojis.map(([emoji, label]) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              className="h-11 rounded-lg text-2xl hover:bg-teal-50 focus-visible:outline-teal-700"
              onClick={() => {
                onSelect(emoji);
                panel.current?.hidePopover();
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
