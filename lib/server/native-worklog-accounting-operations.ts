import "server-only";
import { timingSafeEqual } from "node:crypto";
import { NativeWorklogBudget } from "./native-worklog-budget";
import type { executeNativeAccounting } from "./native-worklog-accounting-executor";

type Result = Awaited<ReturnType<typeof executeNativeAccounting>>;
type Operations = Readonly<{
  secret: string | undefined;
  execute(operationId: string, budget: NativeWorklogBudget): Promise<Result>;
}>;
class CommandError extends Error {
  constructor(readonly status = 422) { super("INVALID_COMMAND"); }
}
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const response = (value: unknown, status = 200, extra = {}) => Response.json(value, { status, headers: { ...headers, ...extra } });
const outcomes = new Set(["applied", "applied-history", "quarantined", "pending", "not-due", "budget-deferred", "uncertain"]);

async function command(request: Request) {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") throw new CommandError(415);
  const declared = request.headers.get("content-length");
  if (declared !== null && !/^\d+$/.test(declared)) throw new CommandError();
  if (declared !== null && Number(declared) > 1024) throw new CommandError(413);
  if (request.signal.aborted) throw new CommandError(408);
  const reader = request.body?.getReader(); if (!reader) throw new CommandError();
  let complete = false, timer: ReturnType<typeof setTimeout> | undefined;
  let abort!: () => void;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new CommandError(408)), 5000);
    abort = () => reject(new CommandError(408));
    request.signal.addEventListener("abort", abort, { once: true }); if (request.signal.aborted) abort();
  });
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) { complete = true; break; }
      size += value.byteLength; if (size > 1024) throw new CommandError(413);
      chunks.push(Uint8Array.from(value));
    }
  } catch (error) {
    if (error instanceof CommandError) throw error;
    throw new CommandError(408);
  } finally {
    clearTimeout(timer); request.signal.removeEventListener("abort", abort);
    // Cancellation is best effort. Never wait for an uncooperative source.
    if (!complete) void reader.cancel().catch(() => undefined);
    try { reader.releaseLock(); } catch { /* A pending read can outlive cancellation. */ }
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    const match = /^[ \t\r\n]*\{[ \t\r\n]*("(?:[^"\\\u0000-\u001f]|\\.)*")[ \t\r\n]*:[ \t\r\n]*("(?:[^"\\\u0000-\u001f]|\\.)*")[ \t\r\n]*,[ \t\r\n]*("(?:[^"\\\u0000-\u001f]|\\.)*")[ \t\r\n]*:[ \t\r\n]*("(?:[^"\\\u0000-\u001f]|\\.)*")[ \t\r\n]*\}[ \t\r\n]*$/.exec(text);
    if (!match) throw new CommandError();
    const names = [JSON.parse(match[1]), JSON.parse(match[3])];
    if (new Set(names).size !== 2 || !names.includes("action") || !names.includes("operationId")) throw new CommandError();
    const decoded = JSON.parse(text) as { action: string; operationId: string };
    if (decoded.action !== "EXECUTE" || !/^[a-f0-9]{64}$/.test(decoded.operationId)) throw new CommandError();
    return decoded.operationId;
  } catch { throw new CommandError(); }
}

/** Preparatory internal service boundary, deliberately disconnected from routes/jobs.
 * A trusted caller supplies the existing cleanup service secret and fixed executor.
 * Historical authority inside the executor never grants current owner access.
 * No global dispatch, client budget, phase replay or automatic transient retry.
 */
export async function handleNativeAccountingOperations(request: Request, operations: Operations) {
  const budget = new NativeWorklogBudget(); // Start before authentication and body I/O.
  const expected = Buffer.from(`Bearer ${operations.secret ?? ""}`);
  const presented = Buffer.from(request.headers.get("authorization") ?? "");
  if (!operations.secret || operations.secret.length < 32 || presented.length !== expected.length || !timingSafeEqual(presented, expected))
    return response({ error: "UNAUTHORIZED" }, 401);
  if (request.method !== "POST") return response({ error: "METHOD_NOT_ALLOWED" }, 405, { Allow: "POST" });
  if (new URL(request.url).search) return response({ error: "INVALID_COMMAND" }, 422);
  try {
    const operationId = await command(request);
    if (request.signal.aborted) throw new CommandError(408);
    budget.require(16000);
    const result = await operations.execute(operationId, budget);
    if (!result || !outcomes.has(result.outcome) || result.retryAuthorized !== false || result.ownerAccessAuthorized !== false)
      return response({ error: "ACCOUNTING_UNAVAILABLE" }, 503);
    // Reconstruct the allowlist. Identifiers, balances, markers and raw errors never leave this boundary.
    return response({ result: { outcome: result.outcome, retryAuthorized: false, ownerAccessAuthorized: false } },
      result.outcome === "uncertain" || result.outcome === "budget-deferred" ? 503 : 200);
  } catch (error) {
    return response({ error: error instanceof CommandError ? "INVALID_COMMAND" : "ACCOUNTING_UNAVAILABLE" },
      error instanceof CommandError ? error.status : 503);
  }
}
