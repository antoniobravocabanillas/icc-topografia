import type { ReactNode } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { FormSubmitButton } from "@/components/admin/form-submit-button";

export function CreatePanel({ label, description, children, defaultOpen = false }: { label: string; description: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="group rounded-md border border-[#bfd9d6] bg-[#f4faf9]" open={defaultOpen}>
      <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
            <Plus className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-foreground">{label}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-[#d5e6e3] p-4 sm:p-5">{children}</div>
    </details>
  );
}

export function EditablePanel({ title, subtitle, updateAction, deleteAction, children }: { title: string; subtitle: string; updateAction: (formData: FormData) => Promise<void>; deleteAction: () => Promise<void>; children: ReactNode }) {
  return (
    <details className="group rounded-md border border-[#d2e0de] bg-white transition-shadow open:shadow-technical">
      <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-foreground">{title}</span>
          <span className="mt-1 block line-clamp-1 text-xs text-muted-foreground">{subtitle}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#607083]">
          Editar
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="border-t border-[#e0e9e7] p-4 sm:p-5">
        <form action={updateAction} className="grid gap-3 md:grid-cols-2">
          {children}
          <FormSubmitButton idleLabel="Guardar cambios" pendingLabel="Guardando..." />
        </form>
        <div className="mt-5 border-t border-[#e5eceb] pt-4">
          <form action={deleteAction}>
            <FormSubmitButton idleLabel="Eliminar" pendingLabel="Eliminando..." variant="destructive" />
          </form>
        </div>
      </div>
    </details>
  );
}

export function CmsSectionHeading({ eyebrow, title, description, count }: { eyebrow: string; title: string; description: string; count: number }) {
  return (
    <div className="flex flex-col gap-4 border-b border-[#d6e3e1] pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
        <h2 className="mt-2 font-display text-2xl font-bold sm:text-3xl">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <div className="flex h-12 items-center gap-3 rounded-md border border-[#c9dcda] bg-white px-4">
        <span className="font-mono text-xl font-bold text-primary">{count}</span>
        <span className="text-xs font-semibold text-muted-foreground">registros</span>
      </div>
    </div>
  );
}
