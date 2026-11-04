import { createHmac, timingSafeEqual } from "node:crypto";
import { PublicChatError } from "./public-customer-chat";
const lifetimeSeconds = 90 * 24 * 60 * 60;
function accessSecret() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) throw new PublicChatError("La atención segura no está configurada", 503);
  return secret;
}
function signature(body: string, secret: string) {
  return createHmac("sha256", secret).update(`customer-chat:v1:${body}`).digest();
}
export function issueCustomerChatAccess(workspaceId: string, conversationId: string, now = Date.now(), secret = accessSecret()) {
  const body = Buffer.from(JSON.stringify({ v: 1, w: workspaceId, c: conversationId, exp: Math.floor(now / 1000) + lifetimeSeconds })).toString("base64url");
  return `${body}.${signature(body, secret).toString("base64url")}`;
}
export function verifyCustomerChatAccess(token: string | null, workspaceId: string, conversationId: string, now = Date.now(), secret = accessSecret()) {
  if (!token || token.length > 1600) return false;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts.every(p => /^[A-Za-z0-9_-]+$/.test(p))) return false;
  const expected = signature(parts[0], secret);
  const actual = Buffer.from(parts[1], "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    return payload.v === 1 && payload.w === workspaceId && payload.c === conversationId && Number.isSafeInteger(payload.exp) && payload.exp > Math.floor(now / 1000) && payload.exp <= Math.floor(now / 1000) + lifetimeSeconds;
  } catch { return false; }
}
export function requireCustomerChatAccess(request: Request, workspaceId: string, conversationId: string) {
  // Legacy random IDs retain compatibility; all new visitor2 records require an additional signed capability.
  if ((conversationId.startsWith("visitor2_") || conversationId.startsWith("bot2_")) && !verifyCustomerChatAccess(request.headers.get("x-chat-access"), workspaceId, conversationId)) throw new PublicChatError("Necesitas el acceso privado de esta conversación", 401);
}
