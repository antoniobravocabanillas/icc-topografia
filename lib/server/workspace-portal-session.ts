import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { toWorkspacePortalRole, type WorkspacePortalRole } from "./workspace-portal-policy";

export type { WorkspacePortalRole } from "./workspace-portal-policy";

export type WorkspacePortalToken = {
  sub: string;
  workspaceId: string;
  workspaceSlug: string;
  role: WorkspacePortalRole;
  iat: number;
  exp: number;
  jti?: string;
};

const TOKEN_TTL_SECONDS = 60 * 60 * 8;

function getSecret() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET no esta configurado para Portal Terraqo.");
  return secret;
}

function grantIdentifier(token: Pick<WorkspacePortalToken, "sub" | "workspaceId">) {
  return `portal-session:${token.workspaceId}:${token.sub}`;
}
function grantHash(jti: string) { return createHash("sha256").update(jti).digest("hex"); }

/** Store only a session identifier hash. A stolen bearer token can be revoked
 * without changing the account password or invalidating other devices. */
export async function createRevocablePortalToken(payload: Omit<WorkspacePortalToken, "iat" | "exp" | "jti">) {
  const jti = randomUUID();
  const session = createWorkspacePortalToken({ ...payload, jti });
  await prisma.verificationToken.create({ data: { identifier: grantIdentifier(payload),
    token: grantHash(jti), expires: new Date(Date.now() + session.expiresIn * 1000) } });
  return session;
}

export async function revokePortalToken(token: WorkspacePortalToken) {
  if (!token.jti) return false;
  await prisma.verificationToken.deleteMany({ where: {
    identifier: grantIdentifier(token), token: grantHash(token.jti),
  } });
  return true;
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
  if (token.length > 8192 || token.split(".").length !== 3) return null;
  const [header, body, signature] = token.split(".");
  if (!header || !body || !signature) return null;

  const expected = sign(`${header}.${body}`);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as WorkspacePortalToken;
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.sub !== "string" || !payload.sub || typeof payload.workspaceId !== "string" || !payload.workspaceId || payload.workspaceSlug !== workspaceSlug) return null;
    if (!Number.isSafeInteger(payload.exp) || !Number.isSafeInteger(payload.iat) || payload.exp <= now || payload.iat > now || payload.exp <= payload.iat || payload.exp - payload.iat > TOKEN_TTL_SECONDS) return null;
    if (!["CLIENT", "PROFESSIONAL", "ADMIN", "MEMBER", "VIEWER"].includes(payload.role)) return null;
    if (payload.jti !== undefined && (typeof payload.jti !== "string" || !/^[a-f0-9-]{36}$/.test(payload.jti))) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function getWorkspacePortalToken(request: Request, workspaceSlug: string) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = verifyWorkspacePortalToken(authorization.slice(7), workspaceSlug);
  if (!token) return null;
  // A signed token is identity evidence, not durable authorization. Every caller
  // must await this shared guard so removals, demotions and workspace suspension
  // take effect before any reads, downloads or mutations are reached.
  const membership = await prisma.terraqoWorkspaceMember.findFirst({
    where: { userId: token.sub, workspaceId: token.workspaceId, active: true,
      workspace: { slug: workspaceSlug, active: true, deletedAt: null } },
    select: { role: true },
  });
  if (!membership || toWorkspacePortalRole(membership.role) !== token.role) return null;
  if (token.jti) {
    const grant = await prisma.verificationToken.findFirst({ where: {
      identifier: grantIdentifier(token), token: grantHash(token.jti), expires: { gt: new Date() },
    }, select: { token: true } });
    if (!grant) return null;
  }
  return token;
}
