"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Textarea } from "@/components/ui/textarea";
import { TerraqoWritingMark } from "@/components/terraqo/writing-mark";
import { cn } from "@/lib/utils";

type Purpose =
  "experience" | "highlights" | "worklog" | "post" | "profile" | "general";

type AiWritingTextareaProps = ComponentProps<typeof Textarea> & {
  purpose?: Purpose;
};

export function AiWritingTextarea({
  purpose = "general",
  className,
  defaultValue,
  ...props
}: AiWritingTextareaProps) {
  const initialValue = String(defaultValue || "");
  const [value, setValue] = useState(initialValue);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [suggestions, setSuggestions] = useState<{
    corrected: string;
    improved: string;
    language: string;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const form = textareaRef.current?.closest("form");
    if (!form) return;
    const reset = () => {
      setValue(initialValue);
      setMessage("");
      setSuggestions(null);
    };
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [initialValue]);

  async function improve() {
    if (value.trim().length < 3) {
      setMessage("Escribe primero tu idea.");
      return;
    }
    setWorking(true);
    setMessage("");
    setSuggestions(null);
    try {
      const response = await fetch("/api/terraqo/writing-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value, purpose }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload?.error || "No pudimos mejorar el texto.");
      setSuggestions(payload.data);
      setMessage(
        `Idioma detectado: ${payload.data.language}. Elige la versión que prefieras.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No pudimos mejorar el texto.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="grid gap-2">
      <Textarea
        ref={textareaRef}
        {...props}
        data-ai-writing="off"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className={className}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <span
          aria-live="polite"
          className={cn(
            "text-xs",
            suggestions ? "text-emerald-700" : "text-muted-foreground",
          )}
        >
          {message}
        </span>
        <button
          type="button"
          onClick={improve}
          disabled={working}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-4 text-sm font-bold text-primary transition active:scale-[0.99] hover:bg-primary hover:text-white disabled:cursor-wait disabled:opacity-60 sm:min-h-9 sm:w-auto sm:rounded-md sm:px-3 sm:text-xs"
        >
          <TerraqoWritingMark className="h-4 w-4" />{" "}
          {working ? "Leyendo contexto..." : "Pulir texto"}
        </button>
      </div>
      {suggestions ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Suggestion
            title="Corrección fiel"
            description="Ortografía, gramática y sintaxis, sin cambiar la esencia."
            text={suggestions.corrected}
            onApply={() => {
              setValue(suggestions.corrected);
              setSuggestions(null);
              setMessage(
                "Versión corregida aplicada. Revísala antes de guardar.",
              );
            }}
          />
          <Suggestion
            title="Versión profesional"
            description="Más clara y sólida, sin inventar ni exagerar."
            text={suggestions.improved}
            onApply={() => {
              setValue(suggestions.improved);
              setSuggestions(null);
              setMessage(
                "Versión profesional aplicada. Revísala antes de guardar.",
              );
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function Suggestion({
  title,
  description,
  text,
  onApply,
}: {
  title: string;
  description: string;
  text: string;
  onApply: () => void;
}) {
  return (
    <article className="rounded-xl border border-primary/20 bg-primary/[0.035] p-3">
      <p className="text-sm font-bold text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      <p className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-foreground/85">
        {text}
      </p>
      <button
        type="button"
        onClick={onApply}
        className="mt-3 min-h-9 rounded-md bg-primary px-3 text-xs font-bold text-white"
      >
        Usar esta versión
      </button>
    </article>
  );
}
