"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Sparkles } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Purpose = "experience" | "highlights" | "worklog" | "post" | "profile" | "general";

type AiWritingTextareaProps = ComponentProps<typeof Textarea> & {
  purpose?: Purpose;
};

export function AiWritingTextarea({ purpose = "general", className, defaultValue, ...props }: AiWritingTextareaProps) {
  const initialValue = String(defaultValue || "");
  const [value, setValue] = useState(initialValue);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const form = textareaRef.current?.closest("form");
    if (!form) return;
    const reset = () => { setValue(initialValue); setMessage(""); };
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
    try {
      const response = await fetch("/api/terraqo/writing-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value, purpose })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "No pudimos mejorar el texto.");
      setValue(payload.data.text);
      setMessage("Texto corregido. Revísalo antes de guardar.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos mejorar el texto.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="grid gap-2">
      <Textarea ref={textareaRef} {...props} data-ai-writing="off" value={value} onChange={(event) => setValue(event.target.value)} className={className} />
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <span aria-live="polite" className={cn("text-xs", message.startsWith("Texto corregido") ? "text-emerald-700" : "text-muted-foreground")}>{message}</span>
        <button type="button" onClick={improve} disabled={working} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-4 text-sm font-bold text-primary transition active:scale-[0.99] hover:bg-primary hover:text-white disabled:cursor-wait disabled:opacity-60 sm:min-h-9 sm:w-auto sm:rounded-md sm:px-3 sm:text-xs">
          <Sparkles className="h-3.5 w-3.5" /> {working ? "Corrigiendo..." : "Mejorar redacción"}
        </button>
      </div>
    </div>
  );
}
