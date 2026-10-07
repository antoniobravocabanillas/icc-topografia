import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { JWT } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export const WEB_CV_SESSION_SECONDS = 12 * 60 * 60;
const sessionIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const webCvGrantIdentifier = (userId: string) => `web-cv-session:${userId}`;
export const webCvGrantHash = (sessionId: string) => createHash("sha256").update(sessionId).digest("hex");

export type WebCvSessionClaims = { userId: string; sessionId: string; expires: number };

/** These claims must come from a verified Auth.js cookie, never a request body.
 * They identify a revocable permission; the transaction must still lock and
 * validate its SQL grant, current ownership, membership and module. */
export function webCvSessionClaims(token: JWT | null): WebCvSessionClaims | null {
  const now = Math.floor(Date.now() / 1000);
  if (!token || typeof token.sub !== "string" || !token.sub || token.sub.length > 128 ||
      typeof token.cvSessionId !== "string" || !sessionIdPattern.test(token.cvSessionId) ||
      !Number.isSafeInteger(token.cvSessionExpires) || !Number.isSafeInteger(token.exp) ||
      token.cvSessionExpires! <= now || token.exp! <= now || token.cvSessionExpires! > token.exp!) return null;
  return { userId: token.sub, sessionId: token.cvSessionId, expires: token.cvSessionExpires! };
}

export async function createWebCvSessionGrant(userId: string) {
  const profile = await prisma.terraqoProfessionalProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return null;
  const sessionId = randomUUID();
  const expires = Math.floor(Date.now() / 1000) + WEB_CV_SESSION_SECONDS;
  await prisma.verificationToken.create({ data: {
    identifier: webCvGrantIdentifier(userId), token: webCvGrantHash(sessionId), expires: new Date(expires * 1000),
  } });
  return { sessionId, expires };
}

export async function revokeWebCvSessionGrant(token: JWT | null) {
  // Logout must also revoke an expired permission. Do not use the expiry-
  // filtering claims reader here, or an old cookie could leave its grant behind.
  if (!token || typeof token.sub !== "string" || !token.sub || typeof token.cvSessionId !== "string" ||
      !sessionIdPattern.test(token.cvSessionId)) return;
  await prisma.verificationToken.deleteMany({ where: {
    identifier: webCvGrantIdentifier(token.sub), token: webCvGrantHash(token.cvSessionId),
  } });
}
