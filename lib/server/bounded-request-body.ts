export class BoundedRequestBodyError extends Error {
  constructor(
    readonly code: "BODY_TOO_LARGE" | "INVALID_BODY" | "BODY_TIMEOUT",
    readonly status: 400 | 408 | 413,
  ) {
    super(code);
    this.name = "BoundedRequestBodyError";
  }
}

export async function readBoundedRequestBytes(request: Request, maxBytes: number, timeoutMs = 10_000) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new TypeError("maxBytes must be a positive safe integer");
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    if (!/^\d+$/.test(declared)) throw new BoundedRequestBodyError("INVALID_BODY", 400);
    if (Number(declared) > maxBytes) throw new BoundedRequestBodyError("BODY_TOO_LARGE", 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new BoundedRequestBodyError("INVALID_BODY", 400);
  const chunks: Uint8Array[] = [];
  let total = 0;
  const deadline = Date.now() + timeoutMs;
  let complete = false;
  try {
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new BoundedRequestBodyError("BODY_TIMEOUT", 408);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new BoundedRequestBodyError("BODY_TIMEOUT", 408)), remaining);
        }),
      ]).finally(() => { if (timer) clearTimeout(timer); });
      if (chunk.done) {
        complete = true;
        break;
      }
      total += chunk.value.byteLength;
      if (total > maxBytes) throw new BoundedRequestBodyError("BODY_TOO_LARGE", 413);
      chunks.push(chunk.value);
    }
  } finally {
    if (!complete) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readBoundedJson(request: Request, maxBytes: number) {
  const bytes = await readBoundedRequestBytes(request, maxBytes);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new BoundedRequestBodyError("INVALID_BODY", 400);
  }
}
