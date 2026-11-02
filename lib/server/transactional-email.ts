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

export async function sendTransactionalEmail(input: TransactionalEmailInput) {
  if (!transactionalEmailEnabled()) {
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
