export type AttendanceLocationOwnership = "LEGACY" | "OWNED" | "FOREIGN";

/**
 * La huella de entrada es autoritativa cuando existe. Una solicitud no puede
 * degradar la comprobación omitiendo User-Agent o la configuración de firma.
 */
export function attendanceLocationOwnership(
  entryUserAgentFingerprint: string | null,
  requestUserAgentFingerprint: string | null,
): AttendanceLocationOwnership {
  if (!entryUserAgentFingerprint) return "LEGACY";
  return requestUserAgentFingerprint === entryUserAgentFingerprint ? "OWNED" : "FOREIGN";
}
