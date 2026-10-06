export function StaffPolicyFeedback({status}: {status?: string}) {
  const messages: Record<string, string> = {
    saved: "Política guardada correctamente.",
    review: "Revisa los importes: hasta dos decimales, porcentaje entre 0 y 100 y moneda explícita para una comisión fija positiva.",
    conflict: "El perfil cambió o la versión no es válida. Recarga y revisa los valores antes de guardar."
  };
  if (!status || !Object.hasOwn(messages, status)) return null;
  return <p role={status === "saved" ? "status" : "alert"} className={`rounded-lg border p-4 text-sm ${status === "saved" ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"}`}>{messages[status]}</p>;
}
