export const EXPERIENCE_EVIDENCE_SOURCE_LIMIT = 8 * 1024 * 1024;
export const EXPERIENCE_EVIDENCE_FILE_LIMIT = 6;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "application/pdf"]);

type UploadInit = { uploadId: string; chunkSize: number; chunks: number; token: string };
type UploadFinish = { receipt: string; fileName: string; contentType: string; size: number };

async function api<T>(url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, credentials: "same-origin" });
  const payload = await response.json().catch(() => null) as ({ data?: T; error?: string | { message?: string } } | null);
  const errorMessage = typeof payload?.error === "string" ? payload.error : payload?.error?.message;
  if (!response.ok || !payload?.data) throw new Error(errorMessage || (response.status === 413 ? "El archivo supera el límite de transferencia." : "No se pudo cargar la evidencia."));
  return payload.data;
}

export function validateExperienceEvidenceSelection(files: File[]) {
  if (files.length > EXPERIENCE_EVIDENCE_FILE_LIMIT) return `Puedes adjuntar hasta ${EXPERIENCE_EVIDENCE_FILE_LIMIT} archivos.`;
  for (const file of files) {
    if (!allowedTypes.has(file.type)) return "Solo se admiten fotos JPG, PNG, WEBP, AVIF o documentos PDF.";
    if (!file.size || file.size > EXPERIENCE_EVIDENCE_SOURCE_LIMIT) return "Cada evidencia debe pesar como máximo 8 MB.";
  }
  return null;
}

export async function uploadExperienceEvidenceFiles(files: File[], onProgress?: (message: string) => void) {
  const validation = validateExperienceEvidenceSelection(files);
  if (validation) throw new Error(validation);
  const receipts: string[] = [];
  for (const [fileIndex, file] of files.entries()) {
    onProgress?.(`Preparando ${fileIndex + 1} de ${files.length}: ${file.name}`);
    const upload = await api<UploadInit>("/api/terraqo/experience-evidence/uploads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "init", fileName: file.name, contentType: file.type, size: file.size }) });
    for (let index = 0; index < upload.chunks; index += 1) {
      onProgress?.(`Subiendo ${fileIndex + 1} de ${files.length} · parte ${index + 1} de ${upload.chunks}`);
      const chunk = file.slice(index * upload.chunkSize, Math.min(file.size, (index + 1) * upload.chunkSize));
      await api(`/api/terraqo/experience-evidence/uploads/${encodeURIComponent(upload.uploadId)}/chunks/${index}`, { method: "PUT", headers: { "content-type": "application/octet-stream", "x-terraqo-upload-token": upload.token }, body: chunk });
    }
    onProgress?.(`Verificando ${fileIndex + 1} de ${files.length}`);
    const finished = await api<UploadFinish>("/api/terraqo/experience-evidence/uploads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "finalize", token: upload.token }) });
    receipts.push(finished.receipt);
  }
  return receipts;
}
