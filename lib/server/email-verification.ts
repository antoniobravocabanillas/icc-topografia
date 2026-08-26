import { randomBytes, randomInt } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { terraqoDomains } from "@/lib/terraqo-domains";

type VerificationTx = Pick<PrismaClient, "verificationToken">;

export function createEmailVerificationCode() {
  return String(randomInt(100000, 1000000));
}

export async function createEmailVerificationToken(tx: VerificationTx, email: string) {
  const normalizedEmail = email.toLowerCase();
  const code = createEmailVerificationCode();
  const expires = new Date(Date.now() + 15 * 60 * 1000);

  await tx.verificationToken.deleteMany({
    where: { identifier: `email:${normalizedEmail}` },
  });

  await tx.verificationToken.create({
    data: {
      identifier: `email:${normalizedEmail}`,
      token: code,
      expires,
    },
  });

  return { code, expires };
}

export async function createEmailVerificationLinkToken(tx: VerificationTx, email: string) {
  const normalizedEmail = email.toLowerCase();
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await tx.verificationToken.deleteMany({ where: { identifier: `email:${normalizedEmail}` } });
  await tx.verificationToken.create({ data: { identifier: `email:${normalizedEmail}`, token, expires } });
  return { code: token, expires };
}

export async function sendEmailVerificationLink(email: string, token: string, _requestUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.TERRAQO_EMAIL_FROM || process.env.EMAIL_FROM;
  if (!apiKey || !from) return { delivered: false, reason: "missing_provider" as const };
  const verificationUrl = `${terraqoDomains.portal}/api/auth/verify-email-link?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to: email, subject: "Verifica tu cuenta Terraqo",
      html: `<div style="font-family:Inter,Arial,sans-serif;color:#0e1a26;line-height:1.6;max-width:560px"><h2>Confirma tu correo</h2><p>Activa tu cuenta para continuar y completar tu perfil en Terraqo.</p><p style="margin:28px 0"><a href="${verificationUrl}" style="background:#4374ba;color:#fff;padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:700">Verificar mi cuenta</a></p><p>El enlace vence en 24 horas. Si no solicitaste esta cuenta, ignora este mensaje.</p></div>`
    })
  });
  if (!response.ok) throw new Error(`No se pudo enviar el correo de verificacion. ${await response.text().catch(() => "")}`);
  return { delivered: true as const };
}

export async function sendEmailVerificationCode(email: string, code: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.TERRAQO_EMAIL_FROM || process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[email-verification] Codigo para ${email}: ${code}`);
    }
    return { delivered: false, reason: "missing_provider" as const };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: "Codigo de verificacion Terraqo",
      html: `
        <div style="font-family:Inter,Arial,sans-serif;color:#0b1f2a;line-height:1.5">
          <p>Tu codigo de verificacion es:</p>
          <p style="font-size:32px;font-weight:800;letter-spacing:8px;margin:16px 0">${code}</p>
          <p>Este codigo vence en 15 minutos. Si no solicitaste esta cuenta, puedes ignorar este correo.</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`No se pudo enviar el correo de verificacion. ${detail}`);
  }

  return { delivered: true as const };
}
