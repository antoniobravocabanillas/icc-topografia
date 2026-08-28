import { randomBytes, randomInt } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { renderVerificationCodeEmail, renderVerificationLinkEmail } from "@/emails/terraqo-transactional";
import { sendTransactionalEmail } from "@/lib/server/transactional-email";
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

export async function sendEmailVerificationLink(email: string, token: string, recipientName?: string | null) {
  const verificationUrl = `${terraqoDomains.portal}/api/auth/verify-email-link?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
  const content = await renderVerificationLinkEmail({ recipientName, verificationUrl });
  return sendTransactionalEmail({
    to: email,
    subject: "Confirma tu cuenta Terraqo",
    ...content,
    tags: [{ name: "category", value: "email-verification" }]
  });
}

export async function sendEmailVerificationCode(email: string, code: string, recipientName?: string | null) {
  const content = await renderVerificationCodeEmail({ recipientName, code });
  return sendTransactionalEmail({
    to: email,
    subject: "Tu código de verificación Terraqo",
    ...content,
    tags: [{ name: "category", value: "email-verification-code" }]
  });
}
