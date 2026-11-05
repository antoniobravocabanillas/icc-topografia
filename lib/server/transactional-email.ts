type TransactionalEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  tags?: Array<{ name: string; value: string }>;
  replyTo?: string;
  idempotencyKey?: string;
};

export class TransactionalEmailError extends Error {
  constructor(public readonly providerStatus: number, public readonly providerCode: string) {
    super("El proveedor no aceptó el correo transaccional.");
    this.name = "TransactionalEmailError";
  }
}

function senderAddress() {
  const configured = process.env.TERRAQO_EMAIL_FROM || process.env.EMAIL_FROM;
  if (!configured) return null;
  return configured.includes("<") ? configured : `Terraqo <${configured}>`;
}

export function transactionalEmailEnabled() {
  return process.env.TERRAQO_TRANSACTIONAL_EMAIL_ENABLED?.trim().toLowerCase() !== "false";
}

export function canSendTransactionalEmail(input: Pick<TransactionalEmailInput, "to" | "tags">) {
  // Exercise the deployed invitation transport against Resend's simulator
  // while all real-recipient transactional sends remain disabled in staging.
  const origin = "https://terraqo-platform-staging.netlify.app";
  const project = process.env.PLATFORM_STAGING_SUPABASE_PROJECT_REF;
  if (!project && process.env.AUTH_URL !== origin && process.env.NEXT_PUBLIC_PORTAL_URL !== origin && !process.env.TERRAQO_STAGING_INVITATION_PROBE) return transactionalEmailEnabled();
  return !transactionalEmailEnabled() && process.env.TERRAQO_STAGING_INVITATION_PROBE === "true" &&
    project === "mghdpciewbsowjrjwmwk" &&
    process.env.AUTH_URL === origin && process.env.NEXT_PUBLIC_PORTAL_URL === origin &&
    /^delivered\+s22-[a-f0-9]{24}@resend\.dev$/.test(input.to) &&
    input.tags?.some(t => t.name === "category" && t.value === "workspace_invitation") === true;
}

export async function sendTransactionalEmail(input: TransactionalEmailInput) {
  if (!canSendTransactionalEmail(input)) {
    return { delivered: false as const, reason: "disabled" as const };
  }
  const apiKey = process.env.RESEND_API_KEY;
  const from = senderAddress();
  if (!apiKey || !from) return { delivered: false as const, reason: "missing_provider" as const };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(input.idempotencyKey?{"Idempotency-Key":input.idempotencyKey}:{}) },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      reply_to: input.replyTo || process.env.TERRAQO_EMAIL_REPLY_TO || undefined,
      tags: input.tags
    })
  });

  const payload = await response.json().catch(() => null) as { id?: string; name?: string } | null;
  if (!response.ok || !payload?.id) {
    // Provider bodies may contain recipient details. Log only a bounded code,
    // never credentials, verification links, message bodies or addresses.
    const code = payload?.name && /^[a-z_]{1,60}$/.test(payload.name) ? payload.name : "invalid_provider_response";
    console.error("Transactional email rejected", { providerStatus: response.status, providerCode: code });
    throw new TransactionalEmailError(response.status, code);
  }
  return { delivered: true as const, id: payload?.id || null };
}
