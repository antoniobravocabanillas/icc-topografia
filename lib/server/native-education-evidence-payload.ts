import { createHash } from "node:crypto";
import { validatePrivateProfessionalFile } from "./professional-file-validation";

export const NATIVE_EDUCATION_FILE_LIMIT = 4 * 1024 * 1024;
const bodyLimit = NATIVE_EDUCATION_FILE_LIMIT + 65536;
const deadlineMs = 10000;
const types = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
export class EducationPayloadError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** No client-supplied digest, owner, storage key or quota units are accepted. */
export async function parseNativeEducationEvidence(request: Request) {
  const invalid = (message: string, status = 422) => new EducationPayloadError(message, status);
  const length = request.headers.get("content-length");
  if (length !== null && !/^\d+$/.test(length)) throw invalid("Tamaño de solicitud no válido.");
  if (length !== null && Number(length) > bodyLimit) throw invalid("El archivo supera 4 MiB.", 413);
  if (!/^multipart\/form-data\s*;/i.test(request.headers.get("content-type") ?? ""))
    throw invalid("Formato de carga no válido.", 415);
  if (request.signal.aborted) throw invalid("La carga fue interrumpida.", 408);
  const reader = request.body?.getReader();
  if (!reader) throw invalid("Selecciona un archivo.");
  let timer: ReturnType<typeof setTimeout> | undefined, completed = false;
  let abort!: () => void;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(invalid("La carga agotó su tiempo. Consulta antes de reenviar.", 408)), deadlineMs);
    abort = () => reject(invalid("La carga fue interrumpida.", 408));
    request.signal.addEventListener("abort", abort, { once: true });
    if (request.signal.aborted) abort();
  });
  const chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      if (request.signal.aborted) throw invalid("La carga fue interrumpida.", 408);
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) { completed = true; break; }
      total += value.byteLength;
      if (total > bodyLimit) throw invalid("El archivo supera 4 MiB.", 413);
      chunks.push(value);
    }
  } finally {
    clearTimeout(timer); request.signal.removeEventListener("abort", abort);
    // Cancellation is best effort. An uncooperative source's cancel promise
    // must not keep this bounded reader alive after its deadline/size limit.
    if (!completed) void reader.cancel().catch(() => undefined);
    try { reader.releaseLock(); } catch { /* Pending reads settle after cancel. */ }
  }
  const body = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  let form: FormData;
  try { form = await new Request(request.url, { method: "POST", headers: request.headers, body: body.buffer }).formData(); }
  catch { throw invalid("Carga de archivo no válida."); }
  const names = ["file", "version", "operationKey"];
  if ([...form.keys()].some(key => !names.includes(key)) || names.some(key => form.getAll(key).length !== 1))
    throw invalid("Selecciona un archivo y una operación únicos.");
  const file = form.get("file"), version = form.get("version"), operationKey = form.get("operationKey");
  if (typeof version !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(version) ||
    Number.isNaN(Date.parse(version)) || new Date(version).toISOString() !== version)
    throw invalid("Recarga la formación antes de adjuntar.", 409);
  if (typeof operationKey !== "string" || !/^[a-f0-9]{32}$/.test(operationKey)) throw invalid("Clave de operación no válida.");
  if (!(file instanceof File) || !file.size || !types.has(file.type) || file.name.length > 180)
    throw invalid("Selecciona un PDF, JPG, PNG o WEBP válido.");
  if (file.size > NATIVE_EDUCATION_FILE_LIMIT) throw invalid("El archivo supera 4 MiB.", 413);
  const problem = await validatePrivateProfessionalFile(file); if (problem) throw invalid(problem);
  const bytes = await file.arrayBuffer();
  const digest = createHash("sha256").update(new Uint8Array(bytes)).digest("hex");
  const fingerprint = createHash("sha256").update(JSON.stringify([
    "education-evidence-v1", digest, file.name, file.type, file.size, version,
  ])).digest("hex");
  return { bytes, version, operationKey, file: { fileName: file.name, contentType: file.type, size: file.size, fingerprint } };
}
