export const projectStatusOptions = [
  { value: "PLANNING", label: "Levantamiento por programar" },
  { value: "IN_PROGRESS", label: "Trabajo de campo en ejecucion" },
  { value: "FINISHED", label: "Gabinete y entregables en revision" },
  { value: "PUBLISHED", label: "Entregado al cliente" },
  { value: "ARCHIVED", label: "Cerrado / archivado" }
] as const;

export const projectStatusLabels = Object.fromEntries(
  projectStatusOptions.map((status) => [status.value, status.label])
) as Record<string, string>;

export const projectStatusDescriptions: Record<string, string> = {
  PLANNING: "Coordinacion de alcance, puntos de control, cuadrilla y ventana de ingreso a campo.",
  IN_PROGRESS: "Cuadrilla en campo ejecutando levantamiento, replanteo, nivelacion o control topografico.",
  FINISHED: "Informacion levantada en procesamiento, control de calidad y preparacion de planos o reportes.",
  PUBLISHED: "Entregables tecnicos validados y enviados al cliente.",
  ARCHIVED: "Proyecto cerrado y disponible como antecedente tecnico."
};

export const projectStatusStyles: Record<string, string> = {
  PLANNING: "border-amber-300 bg-amber-50 text-amber-900",
  IN_PROGRESS: "border-sky-300 bg-sky-50 text-sky-900",
  FINISHED: "border-violet-300 bg-violet-50 text-violet-900",
  PUBLISHED: "border-emerald-300 bg-emerald-50 text-emerald-900",
  ARCHIVED: "border-slate-300 bg-slate-50 text-slate-700"
};

export function projectStatusLabel(status: string) {
  return projectStatusLabels[status] || status;
}
