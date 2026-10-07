import { z } from "zod";

const version = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/).refine(value =>
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
const key = z.string().regex(/^[a-f0-9]{32}$/);
const username = z.string().regex(/^[a-z0-9][a-z0-9._-]{2,29}$/).nullable();
const currentSchema = z.object({ version, username, published: z.boolean(), url: z.string().nullable() }).strict();
const receiptSchema = z.object({ operationKey: key, action: z.enum(["PUBLISH", "WITHDRAW"]), version,
  published: z.boolean(), username, confirmedAt: version }).strict();
const pageSchema = z.object({ schemaVersion: z.literal(1), workspaceSlug: z.string(), current: currentSchema,
  receipt: receiptSchema.nullable() }).strict();
const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("PUBLISH"), version, operationKey: key, consent: z.literal(true) }).strict(),
  z.object({ action: z.literal("WITHDRAW"), version, operationKey: key }).strict(),
]);
export type WebCvCommand = Readonly<z.infer<typeof commandSchema>>;
export type WebCvPage = Readonly<{ schemaVersion: 1; workspaceSlug: string;
  current: Readonly<z.infer<typeof currentSchema>>; receipt: Readonly<z.infer<typeof receiptSchema>> | null }>;
export const freezeWebCvCommand = (value: unknown): WebCvCommand => Object.freeze(commandSchema.parse(value));

export function readWebCvPage(value: unknown, workspaceSlug: string, operationKey?: string): WebCvPage {
  const page = pageSchema.parse(value);
  if (page.workspaceSlug !== workspaceSlug) throw new Error("Invalid CV context.");
  const expectedUrl = page.current.published && page.current.username ? `https://terraqoglobal.com/cv/${page.current.username}` : null;
  if (page.current.url !== expectedUrl) throw new Error("Invalid CV URL.");
  if (page.receipt && (page.receipt.operationKey !== operationKey ||
      page.receipt.published !== (page.receipt.action === "PUBLISH") || page.receipt.version > page.current.version ||
      (page.receipt.action === "PUBLISH" && !page.receipt.username))) throw new Error("Invalid CV receipt.");
  return Object.freeze({ ...page, current: Object.freeze(page.current), receipt: page.receipt ? Object.freeze(page.receipt) : null });
}

export type WebCvFailure = "credentials" | "forbidden" | "conflict" | "validation" | "uncertain";
export class WebCvRequestError extends Error {
  constructor(readonly kind: WebCvFailure) { super("No pudimos comprobar la publicación del CV."); }
}

async function boundedResponse(response: Response) {
  if (response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new Error("Invalid CV response.");
  const length = response.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > 16384)) throw new Error("CV response too large.");
  const reader = response.body?.getReader(); if (!reader) throw new Error("Missing CV response.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength; if (size > 16384) throw new Error("CV response too large.");
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return z.object({ data: pageSchema }).strict().parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))).data;
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

/** Cookie stays in the browser's HttpOnly storage. One explicit invocation is
 * one request: no redirect following, retries or automatic writes on GET. */
export class WebCvPublicationApi {
  private readonly endpoint: string;
  constructor(private readonly workspaceSlug: string, private readonly ownerId: string, private readonly fetcher: typeof fetch = fetch,
    private readonly timeoutMs = 30000) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(workspaceSlug) || !/^[A-Za-z0-9_-]{1,128}$/.test(ownerId) ||
        !Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30000)
      throw new Error("Invalid CV transport configuration.");
    this.endpoint = `/api/terraqo/cv-publication?workspaceSlug=${workspaceSlug}`;
  }
  load() { return this.request(); }
  reconcile(operationKey: string) { return this.request(key.parse(operationKey)); }
  submit(input: WebCvCommand) { const command = freezeWebCvCommand(input); return this.request(command.operationKey, command); }

  private async request(operationKey?: string, command?: WebCvCommand): Promise<WebCvPage> {
    const abort = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    let response: Response | undefined;
    try {
      const work = async () => {
        // Host fetch must not receive this API instance as its receiver.
        // Native Chromium fetch rejects that call with Illegal invocation.
        const fetcher = this.fetcher;
        response = await fetcher(this.endpoint + (!command && operationKey ? `&operationKey=${operationKey}` : ""), {
          method: command ? "POST" : "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal: abort.signal,
          headers: { "x-terraqo-cv-owner": this.ownerId,
            ...(command ? { "content-type": "application/json", "x-terraqo-cv-command": "1" } : {}) },
          body: command ? JSON.stringify(command) : undefined,
        });
        if (response.redirected) throw new Error("Unexpected CV redirect.");
        if (!response.ok) throw new WebCvRequestError(response.status === 401 ? "credentials" :
          response.status === 403 || response.status === 404 ? "forbidden" : response.status === 409 ? "conflict" :
          response.status >= 400 && response.status < 500 ? "validation" : "uncertain");
        const page = readWebCvPage(await boundedResponse(response), this.workspaceSlug, operationKey);
        if (command && (!page.receipt || page.receipt.action !== command.action || page.receipt.version <= command.version))
          throw new Error("Unconfirmed CV operation.");
        return page;
      };
      return await Promise.race([work(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { abort.abort(); reject(new WebCvRequestError("uncertain")); }, this.timeoutMs);
      })]);
    } catch (error) {
      throw error instanceof WebCvRequestError ? error : new WebCvRequestError("uncertain");
    } finally {
      if (timer) clearTimeout(timer); abort.abort();
      if (response?.body && !response.body.locked) await response.body.cancel().catch(() => undefined);
    }
  }
}
