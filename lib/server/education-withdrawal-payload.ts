import { EducationEvidenceReservationError } from "./education-evidence-reservation";

const invalid = (message = "Solicitud de retirada no válida.", status = 422) => new EducationEvidenceReservationError(message, status);
export async function parseEducationWithdrawal(request: Request) {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json" || !request.body) throw invalid();
  const declared = request.headers.get("content-length");
  if (declared !== null && !/^\d+$/.test(declared)) throw invalid();
  if (declared !== null && Number(declared) > 1024) throw invalid("La solicitud supera el límite.", 413);
  if (request.signal.aborted) throw invalid("La solicitud fue interrumpida.", 408);
  const reader = request.body.getReader(); let completed = false, timer: ReturnType<typeof setTimeout> | undefined;
  let abort!: () => void;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(invalid("La solicitud agotó su tiempo.", 408)), 5000);
    abort = () => reject(invalid("La solicitud fue interrumpida.", 408));
    request.signal.addEventListener("abort", abort, { once: true }); if (request.signal.aborted) abort();
  });
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) { completed = true; break; }
      size += value.byteLength; if (size > 1024) throw invalid("La solicitud supera el límite.", 413);
      chunks.push(Uint8Array.from(value));
    }
  } finally {
    clearTimeout(timer); request.signal.removeEventListener("abort", abort);
    if (!completed) void reader.cancel().catch(() => undefined);
    try { reader.releaseLock(); } catch { /* Cancel is best effort, never awaited. */ }
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    // Exactly two JSON string members. Decoding the keys separately detects
    // duplicate names, including escaped aliases that JSON.parse would hide.
    const members = /^\s*\{\s*("(?:[^"\\\u0000-\u001f]|\\.)*")\s*:\s*("(?:[^"\\\u0000-\u001f]|\\.)*")\s*,\s*("(?:[^"\\\u0000-\u001f]|\\.)*")\s*:\s*("(?:[^"\\\u0000-\u001f]|\\.)*")\s*\}\s*$/.exec(text);
    if (!members) throw invalid();
    const names = [JSON.parse(members[1]), JSON.parse(members[3])];
    if (new Set(names).size !== 2 || !names.includes("version") || !names.includes("operationKey")) throw invalid();
    const payload = JSON.parse(text) as { version: string; operationKey: string };
    if (!/^[a-f0-9]{32}$/.test(payload.operationKey)) throw invalid();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(payload.version) ||
      Number.isNaN(Date.parse(payload.version)) || new Date(payload.version).toISOString() !== payload.version) throw invalid("Recarga la formación.", 409);
    return payload;
  } catch (error) {
    if (error instanceof EducationEvidenceReservationError) throw error;
    throw invalid();
  }
}
