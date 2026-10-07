import { WebCvPublicationController } from "./cv-publication-controller";

/** Session messages are only invalidation signals. The owner is always read
 * from Auth.js, never accepted from BroadcastChannel or client storage. */
export class WebCvSessionBoundary {
  private epoch = 0;
  private closed = false;
  private phase: "checking" | "ready" | "invalid" = "checking";
  constructor(private readonly ownerId: string, readonly controller: WebCvPublicationController,
    private readonly readOwner: () => Promise<string | null>, private readonly changed: () => void) {}
  get ready() { return this.phase === "ready" && !this.closed; }
  get invalid() { return this.phase === "invalid"; }
  pause() { if (!this.closed && !this.invalid) { this.epoch++; this.phase = "checking"; this.changed(); } }
  async check() {
    if (this.closed || this.invalid) return;
    this.pause();
    const epoch = this.epoch;
    let owner: string | null = null;
    try { owner = await this.readOwner(); } catch {
      // A network failure is not proof of logout. Hide the surface and disable
      // actions, but retain the exact pending command and unload warning.
      if (!this.closed && epoch === this.epoch) this.changed();
      return;
    }
    if (this.closed || epoch !== this.epoch) return;
    if (owner !== this.ownerId) {
      this.phase = "invalid";
      this.controller.invalidate();
    } else this.phase = "ready";
    this.changed();
  }
  dispose() {
    this.closed = true; this.epoch++;
    this.phase = "invalid";
    this.controller.invalidate();
  }
}

/** Read only the current session owner, with no client JWT/storage or issuance.
 * A definitive empty session differs from an uncertain network response. */
export async function readCvSessionOwner(fetcher: typeof fetch = fetch): Promise<string | null> {
  const response = await fetcher("/api/auth/session", { credentials: "same-origin", cache: "no-store", redirect: "error",
    signal: AbortSignal.timeout(10000) });
  if (response.status === 401) { await response.body?.cancel(); return null; }
  if (!response.ok || response.redirected || response.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    await response.body?.cancel(); throw new Error("Session unavailable.");
  }
  const reader = response.body?.getReader(); if (!reader) throw new Error("Session unavailable.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.length; if (size > 16384) throw new Error("Session unavailable."); chunks.push(chunk.value); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (value === null) return null;
    if (!value || typeof value !== "object" || !("user" in value) || !value.user || typeof value.user !== "object" ||
        !("id" in value.user) || typeof value.user.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value.user.id))
      throw new Error("Session unavailable.");
    return value.user.id;
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

/** Full-document entry is required. A SPA entry stays disabled and offers
 * explicit native navigation to a fresh document before enabling controls.
 * This surface must stay outside the SPA shell and use native links only. */
export function isCvDocumentEntry(documentUrl: string | undefined, currentUrl: string) {
  if (!documentUrl) return false;
  try {
    const initial = new URL(documentUrl), current = new URL(currentUrl);
    return initial.origin === current.origin && initial.pathname === current.pathname && initial.search === current.search;
  } catch { return false; }
}

export function guardCvUnload(controller: WebCvPublicationController, event: BeforeUnloadEvent) {
  if (!controller.getSnapshot().pending) return;
  event.preventDefault(); event.returnValue = "";
}
