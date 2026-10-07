import { freezeWebCvCommand, type WebCvCommand, type WebCvFailure, type WebCvPage, WebCvRequestError } from "./cv-publication-client";

export interface WebCvPublicationPort {
  load(): Promise<WebCvPage>;
  reconcile(operationKey: string): Promise<WebCvPage>;
  submit(command: WebCvCommand): Promise<WebCvPage>;
}
type Phase = "idle" | "loading" | "review" | "sending" | "uncertain" | "checking" | "invalid";
export type WebCvSnapshot = Readonly<{ phase: Phase; page: WebCvPage | null; review: WebCvCommand | null;
  pending: WebCvCommand | null; failure: WebCvFailure | null }>;
const operationKey = () => [...crypto.getRandomValues(new Uint8Array(16))].map(value => value.toString(16).padStart(2, "0")).join("");

/** The pending command is memory-only. UI must guard navigation/unload while
 * it exists, and invalidate this instance on logout or owner/workspace change. */
export class WebCvPublicationController {
  private state: WebCvSnapshot = Object.freeze({ phase: "idle", page: null, review: null, pending: null, failure: null });
  private epoch = 0;
  private listeners = new Set<() => void>();
  constructor(private readonly api: WebCvPublicationPort, private readonly nextKey = operationKey) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<WebCvSnapshot>) {
    this.state = Object.freeze({ ...this.state, ...patch });
    for (const listener of this.listeners) listener();
  }
  private get busy() { return ["loading", "sending", "checking"].includes(this.state.phase); }
  invalidate(failure: WebCvFailure = "credentials") {
    this.epoch++;
    this.update({ phase: "invalid", page: null, pending: null, review: null, failure });
  }
  private failure(error: unknown, operation: boolean) {
    const kind = error instanceof WebCvRequestError ? error.kind : "uncertain";
    if (kind === "credentials" || kind === "forbidden") this.invalidate(kind);
    else if (operation && kind === "uncertain") this.update({ phase: "uncertain", failure: kind });
    else this.update({ phase: "idle", page: null, review: null, pending: null, failure: kind });
  }
  async load() {
    if (this.state.phase !== "idle" || this.state.pending || this.busy) return;
    const epoch = this.epoch;
    this.update({ phase: "loading", failure: null });
    try {
      const page = await this.api.load(); if (epoch !== this.epoch) return;
      this.update({ page, phase: "idle" });
    } catch (error) { if (epoch === this.epoch) this.failure(error, false); }
  }
  prepare(action: "PUBLISH" | "WITHDRAW", consent = false) {
    const current = this.state.page?.current;
    if (this.state.phase !== "idle" || !current || this.state.pending ||
        (action === "PUBLISH" ? !consent || current.published || !current.username : !current.published)) return false;
    const command = freezeWebCvCommand({ action, version: current.version, operationKey: this.nextKey(),
      ...(action === "PUBLISH" ? { consent: true } : {}) });
    this.update({ review: command, phase: "review", failure: null }); return true;
  }
  cancelReview() { if (this.state.phase === "review") this.update({ review: null, phase: "idle" }); }
  async confirm() {
    if (this.state.phase !== "review" || !this.state.review) return;
    const pending = this.state.review;
    this.update({ pending, review: null }); await this.send(pending);
  }
  async resend() {
    if (this.state.phase !== "uncertain" || !this.state.pending) return;
    await this.send(this.state.pending);
  }
  private confirmed(page: WebCvPage, command: WebCvCommand) {
    return page.receipt?.operationKey === command.operationKey && page.receipt.action === command.action &&
      page.receipt.version > command.version;
  }
  private async send(command: WebCvCommand) {
    const epoch = this.epoch;
    this.update({ phase: "sending", failure: null });
    try {
      const page = await this.api.submit(command); if (epoch !== this.epoch) return;
      if (!this.confirmed(page, command)) throw new WebCvRequestError("uncertain");
      this.update({ page, phase: "idle", pending: null });
    } catch (error) { if (epoch === this.epoch) this.failure(error, true); }
  }
  async reconcile() {
    if (this.state.phase !== "uncertain" || !this.state.pending || this.busy) return;
    const command = this.state.pending, epoch = this.epoch;
    this.update({ phase: "checking", failure: null });
    try {
      const page = await this.api.reconcile(command.operationKey); if (epoch !== this.epoch) return;
      if (page.receipt && !this.confirmed(page, command)) throw new WebCvRequestError("uncertain");
      // Absence is not a verdict: a request can still commit after this GET.
      this.update({ page, phase: page.receipt ? "idle" : "uncertain", pending: page.receipt ? null : command });
    } catch (error) {
      if (epoch !== this.epoch) return;
      const kind = error instanceof WebCvRequestError ? error.kind : "uncertain";
      if (kind === "credentials" || kind === "forbidden") this.invalidate(kind);
      else this.update({ phase: "uncertain", failure: kind });
    }
  }
}
