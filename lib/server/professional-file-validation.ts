const extensions: Record<string, string[]> = {
  "application/pdf": ["pdf"], "image/png": ["png"], "image/jpeg": ["jpg", "jpeg"], "image/webp": ["webp"],
};
// This detects a declared-type mismatch; it is not a malware scanner.
export async function validatePrivateProfessionalFile(file: File) {
  if (!file.name || file.name.length > 200 || /[\x00-\x1f\x7f/\\]/.test(file.name)) return "Nombre de archivo no válido.";
  const suffix = file.name.split(".").pop()?.toLowerCase() || "";
  if (!extensions[file.type]?.includes(suffix)) return "El nombre y formato del archivo no coinciden.";
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const prefix = (...values: number[]) => values.every((value, i) => bytes[i] === value);
  const valid = file.type === "application/pdf" ? prefix(37, 80, 68, 70, 45)
    : file.type === "image/png" ? prefix(137, 80, 78, 71, 13, 10, 26, 10)
    : file.type === "image/jpeg" ? prefix(255, 216, 255)
    : prefix(82, 73, 70, 70) && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80;
  return valid ? null : "El contenido no coincide con el formato del documento.";
}
