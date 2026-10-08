import { timingSafeEqual } from "node:crypto";

const api = "https://api.terraqoglobal.com/api/internal/education-evidence-cleanup";
const worker = "https://api.terraqoglobal.com/.netlify/functions/education-evidence-cleanup-background";
type Command = { action: "DISPATCH" } | { action: "RECOVER"; attemptId: string };
type Ports = { fetch: typeof fetch; secret: string | undefined; report(value: Record<string, unknown>): void };
const results = ["completed", "retained", "retry", "quarantined", "skipped", "pending"] as const;
const healthFields = ["pending", "overdue", "quarantined", "watchesDue", "orphaned"] as const;
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

async function boundedBody(stream: ReadableStream<Uint8Array> | null, limit: number, duration: number) {
  if (!stream) throw Error("JOB_BODY_MISSING");
  const reader = stream.getReader(); let timer!: ReturnType<typeof setTimeout>, complete = false;
  try {
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("JOB_BODY_DEADLINE")), duration); });
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) { complete = true; break; }
      size += value.byteLength; if (size > limit) throw Error("JOB_BODY_LIMIT");
      chunks.push(Uint8Array.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } finally {
    clearTimeout(timer);
    if (!complete) void reader.cancel().catch(() => undefined);
    try { reader.releaseLock(); } catch { /* Cancellation is best effort. */ }
  }
}

async function send(ports: Ports, url: string, command: Command | undefined, duration: number) {
  const abort = new AbortController(); let timer!: ReturnType<typeof setTimeout>, expired = false;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => {
    expired = true; abort.abort(); reject(Error("JOB_TRANSPORT_DEADLINE"));
  }, duration); });
  const fetcher = ports.fetch;
  const pending = Promise.resolve().then(() => fetcher(url, { method: command ? "POST" : "GET", redirect: "error",
    signal: abort.signal, headers: { authorization: `Bearer ${ports.secret}`, ...(command ? { "content-type": "application/json" } : {}) },
    ...(command ? { body: JSON.stringify(command) } : {}) })).then(response => {
      if (expired && response.body) void response.body.cancel().catch(() => undefined);
      return response;
    });
  try { return await Promise.race([pending, deadline]); } finally { clearTimeout(timer); }
}

/** Scheduled entry only queues work. 202 is an invocation receipt, never a
 * claim of cleanup completion; a lost reply is reconciled by durable fences. */
export async function queueEducationCleanup(ports: Ports) {
  if (!ports.secret || ports.secret.length < 32) throw Error("JOB_NOT_CONFIGURED");
  const response = await send(ports, worker, { action: "DISPATCH" }, 10000);
  if (response.body) void response.body.cancel().catch(() => undefined);
  if (response.status !== 202) throw Error("JOB_QUEUE_REJECTED");
  ports.report({ queued: 1 });
}

/** Public background invocation still requires the existing operational secret
 * before body parsing or any downstream call. No identity or key in logs. */
export async function runEducationCleanupWorker(request: Request, ports: Ports) {
  const expected = Buffer.from(`Bearer ${ports.secret ?? ""}`), supplied = Buffer.from(request.headers.get("authorization") ?? "");
  if (request.method !== "POST" || !ports.secret || ports.secret.length < 32 || supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)) return;
  if (new URL(request.url).search || request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return;
  let value: unknown;
  try { value = await boundedBody(request.body, 1024, 5000); } catch { return; }
  if (!object(value)) return;
  let command: Command;
  if (value.action === "DISPATCH" && Object.keys(value).length === 1) command = { action: "DISPATCH" };
  else if (value.action === "RECOVER" && Object.keys(value).length === 2 && typeof value.attemptId === "string" &&
    /^[A-Za-z0-9_-]{1,100}$/.test(value.attemptId)) command = { action: "RECOVER", attemptId: value.attemptId };
  else return;
  const response = await send(ports, api, command, 55000);
  if (!response.ok) { if (response.body) void response.body.cancel().catch(() => undefined); throw Error("JOB_RECOVERY_FAILED"); }
  const data = await boundedBody(response.body, 2048, 5000);
  let outcome: Record<string, unknown>;
  if (!object(data)) throw Error("JOB_RESULT_INVALID");
  if (command.action === "RECOVER") {
    if (!results.includes(data.result as typeof results[number])) throw Error("JOB_RESULT_INVALID");
    outcome = { mode: "targeted", result: data.result };
  } else {
    if (!integer(data.selected) || data.selected > 5 || !integer(data.processed) || !integer(data.deferred) ||
      data.processed + data.deferred !== data.selected || !object(data.counts)) throw Error("JOB_RESULT_INVALID");
    const counts = Object.fromEntries(results.map(field => [field, data.counts && (data.counts as Record<string, unknown>)[field]]));
    let total = 0;
    for (const count of Object.values(counts)) { if (!integer(count)) throw Error("JOB_RESULT_INVALID"); total += count; }
    if (total !== data.processed) throw Error("JOB_RESULT_INVALID");
    outcome = { mode: "batch", selected: data.selected, processed: data.processed, deferred: data.deferred, counts };
  }
  const read = await send(ports, api, undefined, 15000);
  if (!read.ok) { if (read.body) void read.body.cancel().catch(() => undefined); throw Error("JOB_HEALTH_FAILED"); }
  const state = await boundedBody(read.body, 2048, 5000);
  if (!object(state) || !object(state.backlog)) throw Error("JOB_HEALTH_INVALID");
  const backlog = Object.fromEntries(healthFields.map(field => [field, (state.backlog as Record<string, unknown>)[field]]));
  if (!Object.values(backlog).every(integer)) throw Error("JOB_HEALTH_INVALID");
  ports.report({ ...outcome, backlog, requiresInvestigation: Boolean(backlog.quarantined || backlog.orphaned || backlog.overdue) });
}
