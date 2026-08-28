type TransactionalEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  tags?: Array<{ name: string; value: string }>;
};

function senderAddress() {
  const configured = process.env.TERRAQO_EMAIL_FROM || process.env.EMAIL_FROM;
  if (!configured) return null;
  return configured.includes("<") ? configured : `Terraqo <${configured}>`;
}

export async function sendTransactionalEmail(input: TransactionalEmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = senderAddress();
  if (!apiKey || !from) return { delivered: false as const, reason: "missing_provider" as const };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      reply_to: process.env.TERRAQO_EMAIL_REPLY_TO || undefined,
      tags: input.tags
    })
  });

  const payload = await response.json().catch(() => null) as { id?: string; message?: string } | null;
  if (!response.ok) throw new Error(`No se pudo enviar el correo transaccional. ${payload?.message || response.statusText}`);
  return { delivered: true as const, id: payload?.id || null };
}
