import { createHash } from "node:crypto";
import { z } from "zod";
import { validatePrivateProfessionalFile } from "./professional-file-validation";

export const NATIVE_EXPERIENCE_FILE_LIMIT = 4 * 1024 * 1024;
const bodyLimit = NATIVE_EXPERIENCE_FILE_LIMIT + 65536;
const types = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
export class ExperiencePayloadError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
export type NativeExperienceEvidencePayload = {
  file: File;
  version: string;
  operationKey: string;
  sha256: string;
};
export async function parseNativeExperienceEvidence(request: Request): Promise<NativeExperienceEvidencePayload> {
  const oversized = () => new ExperiencePayloadError("El archivo supera el límite de 4 MiB.", 413);
  if (Number(request.headers.get("content-length") || 0) > bodyLimit) throw oversized();
  // Bound the actual stream: Content-Length and multipart fields are untrusted.
  const reader = request.body?.getReader();
  if (!reader) throw new ExperiencePayloadError("Selecciona un archivo.", 422);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > bodyLimit) { await reader.cancel().catch(() => undefined); throw oversized(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let form: FormData;
  try { form = await new Request(request.url, { method: "POST", headers: request.headers, body: bytes.buffer }).formData(); }
  catch { throw new ExperiencePayloadError("Carga de archivo no válida.", 422); }
  const fields = ["file", "version", "operationKey"];
  if ([...form.keys()].some(key => !fields.includes(key)) || fields.some(key => form.getAll(key).length !== 1))
    throw new ExperiencePayloadError("La carga requiere un archivo, una versión y una operación únicas.", 422);
  const file = form.get("file"), version = form.get("version"), operationKey = form.get("operationKey");
  if (typeof version !== "string" || !z.string().datetime().safeParse(version).success)
    throw new ExperiencePayloadError("Recarga la experiencia antes de adjuntar evidencias.", 409);
  if (typeof operationKey !== "string" || !/^[a-f0-9]{32}$/.test(operationKey))
    throw new ExperiencePayloadError("La operación necesita una clave válida.", 422);
  if (!(file instanceof File) || !file.size || !types.has(file.type))
    throw new ExperiencePayloadError("Selecciona un archivo PDF, JPG, PNG o WEBP.", 422);
  if (file.size > NATIVE_EXPERIENCE_FILE_LIMIT) throw oversized();
  const invalid = await validatePrivateProfessionalFile(file);
  if (invalid) throw new ExperiencePayloadError(invalid, 422);
  return { file, version, operationKey, sha256: createHash("sha256").update(new Uint8Array(await file.arrayBuffer())).digest("hex") };
}
