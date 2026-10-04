import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const PORTAL_LOGIN_WINDOW_SECONDS = 600;
export const PORTAL_LOGIN_MAX_ATTEMPTS = 8;

/** The existing expiring-token table stores only scoped attempt markers, never
 * emails, passwords or IP addresses. Unknown/non-member accounts do not allocate
 * markers. Advisory transaction locks make counting atomic across instances. */
export async function reservePortalLoginAttempt(workspaceId: string, userId: string) {
  const identifier = `portal-login-attempt:${workspaceId}:${userId}`;
  const lock = BigInt.asIntN(64, BigInt(`0x${createHash("sha256").update(identifier).digest("hex").slice(0, 16)}`));
  return prisma.$transaction(async tx => {
    // Parameters remain bound; user-controlled text never enters SQL syntax.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(${lock}::bigint)`;
    const now = new Date();
    await tx.verificationToken.deleteMany({ where: { identifier, expires: { lte: now } } });
    const attempts = await tx.verificationToken.count({ where: { identifier, expires: { gt: now } } });
    if (attempts >= PORTAL_LOGIN_MAX_ATTEMPTS) return false;
    await tx.verificationToken.create({ data: { identifier, token: createHash("sha256").update(randomUUID()).digest("hex"),
      expires: new Date(now.getTime() + PORTAL_LOGIN_WINDOW_SECONDS * 1000) } });
    return true;
  });
}
