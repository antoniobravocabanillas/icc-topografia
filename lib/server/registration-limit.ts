import { createHash, createHmac, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const REGISTRATION_WINDOW_SECONDS = 15 * 60;
export const REGISTRATION_MAX_NETWORK_ATTEMPTS = 8;
export const REGISTRATION_MAX_EMAIL_ATTEMPTS = 3;

function registrationLimitSecret() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("Registration abuse protection is not configured.");
  return secret;
}

function digestScope(namespace: string, value: string) {
  return createHmac("sha256", registrationLimitSecret())
    .update(`${namespace}:${value}`)
    .digest("hex");
}

function registrationClientAddress(request: Request) {
  const netlifyAddress = request.headers.get("x-nf-client-connection-ip")?.trim();
  if (netlifyAddress) return netlifyAddress;
  // Netlify is the production edge and supplies the header above. Do not trust
  // a client-controlled forwarding chain when that trusted edge signal is absent.
  if (process.env.NODE_ENV === "production") return "unknown";
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function advisoryLock(identifier: string) {
  return BigInt.asIntN(
    64,
    BigInt(`0x${createHash("sha256").update(identifier).digest("hex").slice(0, 16)}`),
  );
}

/** Reserves both abuse budgets before bcrypt, tenant provisioning or email
 * delivery. Identifiers contain only keyed digests; raw addresses and emails
 * are never persisted. Sorted advisory locks prevent cross-scope deadlocks. */
export async function reserveRegistrationAttempt(request: Request, email: string) {
  const budgets = [
    {
      identifier: `registration-network:${digestScope("network", registrationClientAddress(request))}`,
      maximum: REGISTRATION_MAX_NETWORK_ATTEMPTS,
    },
    {
      identifier: `registration-email:${digestScope("email", email.trim().toLowerCase())}`,
      maximum: REGISTRATION_MAX_EMAIL_ATTEMPTS,
    },
  ].sort((left, right) => left.identifier.localeCompare(right.identifier));

  return prisma.$transaction(async (tx) => {
    for (const budget of budgets) {
      const lock = advisoryLock(budget.identifier);
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(${lock}::bigint)`;
    }

    const now = new Date();
    for (const budget of budgets) {
      await tx.verificationToken.deleteMany({
        where: { identifier: budget.identifier, expires: { lte: now } },
      });
      const attempts = await tx.verificationToken.count({
        where: { identifier: budget.identifier, expires: { gt: now } },
      });
      if (attempts >= budget.maximum) return false;
    }

    const expires = new Date(now.getTime() + REGISTRATION_WINDOW_SECONDS * 1000);
    for (const budget of budgets) {
      await tx.verificationToken.create({
        data: {
          identifier: budget.identifier,
          token: createHash("sha256").update(randomUUID()).digest("hex"),
          expires,
        },
      });
    }
    return true;
  });
}
