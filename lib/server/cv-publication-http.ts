import "server-only";
import { CvPublicationError } from "./portal-cv-publication";

export function privateResponse(response: Response) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
export async function boundedJson(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    throw new CvPublicationError("Se requiere JSON.", 415);
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > 4096)) throw new CvPublicationError("Solicitud demasiado grande.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new CvPublicationError("Solicitud no válida.", 422);
  let total = 0;
  const chunks: Uint8Array[] = [];
  const deadline = Date.now() + 10000;
  try {
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new CvPublicationError("La solicitud tardó demasiado.", 408);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const chunk = await Promise.race([reader.read(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new CvPublicationError("La solicitud tardó demasiado.", 408)), remaining);
      })]).finally(() => { if (timer) clearTimeout(timer); });
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > 4096) throw new CvPublicationError("Solicitud demasiado grande.", 413);
      chunks.push(chunk.value);
    }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
    catch { throw new CvPublicationError("JSON no válido.", 422); }
  } finally { await reader.cancel().catch(() => undefined); }
}
