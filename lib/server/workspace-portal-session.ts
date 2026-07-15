import { createHmac, timingSafeEqual } from "node:crypto";

export type WorkspacePortalRole = "CLIENT" | "PROFESSIONAL" | "ADMIN";

export type WorkspacePortalToken = {
  sub: string;
  workspaceId: string;
  workspaceSlug: string;
  role: WorkspacePortalRole;
  iat: number;
  exp: number;
};

const TOKEN_TTL_SECONDS = 60 * 60 * 8;

function getSecret() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET no esta configurado para Portal Terraqo.");
  return secret;
}

function encode(value: object) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(value: string) {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

export function createWorkspacePortalToken(
  payload: Omit<WorkspacePortalToken, "iat" | "exp">,
) {
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: "HS256", typ: "JWT" });
  const body = encode({ ...payload, iat: now, exp: now + TOKEN_TTL_SECONDS });
  const unsignedToken = `${header}.${body}`;

  return {
    token: `${unsignedToken}.${sign(unsignedToken)}`,
    expiresIn: TOKEN_TTL_SECONDS,
  };
}

export function verifyWorkspacePortalToken(token: string, workspaceSlug: string) {
  const [header, body, signature] = token.split(".");
  if (!header || !body || !signature) return null;

  const expected = sign(`${header}.${body}`);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as WorkspacePortalToken;
    const now = Math.floor(Date.now() / 1000);
    if (!payload.sub || !payload.workspaceId || payload.workspaceSlug !== workspaceSlug || payload.exp <= now) return null;
    if (!["CLIENT", "PROFESSIONAL", "ADMIN"].includes(payload.role)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getWorkspacePortalToken(request: Request, workspaceSlug: string) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  return verifyWorkspacePortalToken(authorization.slice(7), workspaceSlug);
}

