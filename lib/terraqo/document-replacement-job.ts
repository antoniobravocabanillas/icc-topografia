import { timingSafeEqual } from "node:crypto";

export function documentReplacementJobAuthorized(request: Request, secret: string | undefined) {
  if (request.method !== "POST" || !secret || secret.length < 32) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = Buffer.from(request.headers.get("authorization") || "");
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

type Ports = { secret: string | undefined; fetch: typeof fetch };
async function post(ports: Ports, target: string, timeout: number) {
  if (!ports.secret || ports.secret.length < 32) throw Error("JOB_NOT_CONFIGURED");
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expired = false;
  try {
    // A deadline bounds even an adapter that ignores AbortSignal. Late responses
    // are discarded; only the durable SQL ledger decides cleanup outcomes.
    const pending = ports.fetch(target, { method: "POST", redirect: "error", signal: abort.signal,
      headers: { authorization: `Bearer ${ports.secret}` } }).then(response => {
      if (expired) void response.body?.cancel().catch(() => undefined);
      return response;
    });
    return await Promise.race([pending, new Promise<never>((_, reject) => {
      timer = setTimeout(() => { expired = true; abort.abort(); reject(Error("JOB_TIMEOUT")); }, timeout);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

export async function queueDocumentReplacementCleanup(ports: Ports & { worker: string }) {
  const response = await post(ports, ports.worker, 8000);
  void response.body?.cancel().catch(() => undefined);
  if (response.status !== 202) throw Error("JOB_NOT_QUEUED");
}

export async function runDocumentReplacementCleanupWorker(request: Request, ports: Ports & { api: string }) {
  if (!documentReplacementJobAuthorized(request, ports.secret)) return false;
  const response = await post(ports, ports.api, 55000);
  void response.body?.cancel().catch(() => undefined);
  if (response.status !== 200) throw Error("JOB_CLEANUP_RETRY");
  return true;
}
