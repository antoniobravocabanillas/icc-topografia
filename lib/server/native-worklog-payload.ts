import { createHash } from "node:crypto";

export const NATIVE_WORKLOG_BODY_LIMIT = 16 * 1024;
const deadlineMs = 5000;
const fields = ["operationKey", "title", "summary", "outcome", "type", "projectId", "projectVersion"] as const;
const types = ["FIELD_UPDATE", "DELIVERABLE", "PROBLEM_SOLVED", "LEARNING", "MILESTONE"] as const;
export class NativeWorklogPayloadError extends Error {
  constructor(readonly status = 422) { super("Solicitud de bitácora no válida."); }
}
export type NativeWorklogPayload = Readonly<{
  operationKey: string; title: string; summary: string; outcome: string;
  type: typeof types[number]; projectId: string; projectVersion: string;
}>;
const invalid = (status = 422): never => { throw new NativeWorklogPayloadError(status); };

/** Flat string-only protocol: decoded duplicate names cannot be hidden by JSON.parse. */
function decodeMembers(text: string): Record<string, string> {
  let offset = 0;
  const whitespace = () => { while (/[\x20\t\r\n]/.test(text[offset] ?? "") && offset < text.length) offset++; };
  const punctuation = (expected: string) => { whitespace(); if (text[offset++] !== expected) invalid(); };
  const token = /"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/y;
  const string = (): string => {
    whitespace(); token.lastIndex = offset; const match = token.exec(text); if (!match) return invalid();
    offset = token.lastIndex; return JSON.parse(match[0]) as string;
  };
  const values = Object.create(null) as Record<string, string>;
  punctuation("{");
  for (let count = 0; count < fields.length; count++) {
    const name = string();
    if (!fields.includes(name as typeof fields[number]) || Object.hasOwn(values, name)) invalid();
    punctuation(":"); values[name] = string();
    punctuation(count === fields.length - 1 ? "}" : ",");
  }
  whitespace(); if (offset !== text.length || fields.some(name => !Object.hasOwn(values, name))) invalid();
  return values;
}

function validText(value: string, min: number, max: number, multiline: boolean) {
  // Preserve exact accepted strings. No lossy trim/normalization before replay hashing.
  if (value.length < min || value.length > max || value.trim() !== value || !value.isWellFormed()) return false;
  return !(multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value);
}
function canonicalVersion(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

/** Internal payload digest; owner/workspace must come from live session and scope the durable receipt. */
export function nativeWorklogFingerprint(payload: NativeWorklogPayload) {
  return createHash("sha256").update(JSON.stringify([
    "native-worklog-create-v1", payload.title, payload.summary, payload.outcome,
    payload.type, payload.projectId, payload.projectVersion,
  ])).digest("hex");
}

/** Caller MUST authorize an obligatory live grant before accessing this request body. No DB/store/points I/O here. */
export async function parseNativeWorklogPayload(request: Request) {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") invalid(415);
  const length = request.headers.get("content-length");
  if (length !== null && !/^\d+$/.test(length)) invalid();
  if (length !== null && Number(length) > NATIVE_WORKLOG_BODY_LIMIT) invalid(413);
  if (request.signal.aborted) invalid(408);
  const reader = request.body?.getReader(); if (!reader) return invalid();
  let completed = false, timer: ReturnType<typeof setTimeout> | undefined;
  let abort!: () => void;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new NativeWorklogPayloadError(408)), deadlineMs);
    abort = () => reject(new NativeWorklogPayloadError(408));
    request.signal.addEventListener("abort", abort, { once: true }); if (request.signal.aborted) abort();
  });
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) { completed = true; break; }
      size += value.byteLength; if (size > NATIVE_WORKLOG_BODY_LIMIT) invalid(413);
      chunks.push(Uint8Array.from(value));
    }
  } catch (error) {
    if (error instanceof NativeWorklogPayloadError) throw error;
    return invalid(408);
  } finally {
    clearTimeout(timer); request.signal.removeEventListener("abort", abort);
    // Best effort only: a source that never resolves cancel must not extend the deadline.
    if (!completed) void reader.cancel().catch(() => undefined);
    try { reader.releaseLock(); } catch { /* Pending read may outlive cancellation. */ }
  }
  let values: Record<string, string>;
  try { values = decodeMembers(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { return invalid(); }
  if (!/^[a-f0-9]{32}$/.test(values.operationKey) || !validText(values.title, 4, 180, false) ||
      !validText(values.summary, 20, 2400, true) || !validText(values.outcome, 0, 800, true) ||
      !types.includes(values.type as typeof types[number])) invalid();
  if (values.projectId === "") { if (values.projectVersion !== "") invalid(); }
  else if (!/^c[a-z0-9]{24}$/.test(values.projectId) || !canonicalVersion(values.projectVersion)) invalid();
  const payload: NativeWorklogPayload = Object.freeze({
    operationKey: values.operationKey, title: values.title, summary: values.summary, outcome: values.outcome,
    type: values.type as typeof types[number], projectId: values.projectId, projectVersion: values.projectVersion,
  });
  return Object.freeze({ payload, fingerprint: nativeWorklogFingerprint(payload) });
}
