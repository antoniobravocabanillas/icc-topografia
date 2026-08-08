import { randomInt } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

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

export async function sendEmailVerificationCode(email: string, code: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.TERRAQO_EMAIL_FROM || process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[email-verification] Codigo para ${email}: ${code}`);
      return { delivered: false, reason: "missing_provider" as const };
    }
    throw new Error("Servicio de correo no configurado. Define RESEND_API_KEY y TERRAQO_EMAIL_FROM.");
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
