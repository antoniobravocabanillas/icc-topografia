import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { canUseTerraqoCredentials } from "../lib/server/credential-login-policy";
import { issueAccountPasskeyLoginToken } from "../lib/server/account-passkey-login-token";
import {
  REGISTRATION_MAX_EMAIL_ATTEMPTS,
  REGISTRATION_MAX_NETWORK_ATTEMPTS,
  reserveRegistrationAttempt,
} from "../lib/server/registration-limit";

type Marker = { identifier: string; token: string; expires: Date };

async function testCredentialVerificationInvariant() {
  assert.equal(canUseTerraqoCredentials(null), false);
  assert.equal(canUseTerraqoCredentials(undefined), false);
  assert.equal(canUseTerraqoCredentials(new Date("2026-01-01T00:00:00Z")), true);
}

async function testAtomicPasskeyChallengeConsumption() {
  let claimed = false;
  let credentialUpdates = 0;
  const tokens: Marker[] = [];
  const tx = {
    terraqoWebAuthnChallenge: {
      updateMany: async (args: { where: { purpose: string; consumedAt: null; expiresAt: { gt: Date } } }) => {
        assert.equal(args.where.purpose, "LOGIN");
        assert.equal(args.where.consumedAt, null);
        assert.equal(args.where.expiresAt.gt.toISOString(), "2026-10-28T00:00:00.000Z");
        if (claimed) return { count: 0 };
        claimed = true;
        return { count: 1 };
      },
    },
    terraqoWebAuthnCredential: {
      update: async () => { credentialUpdates += 1; return {}; },
    },
    verificationToken: {
      deleteMany: async () => { tokens.length = 0; return { count: 0 }; },
      create: async (args: { data: Marker }) => { tokens.push(args.data); return args.data; },
    },
  };
  const now = new Date("2026-10-28T00:00:00Z");
  const input = {
    challengeId: "challenge-1",
    userId: "user-1",
    credentialId: "credential-1",
    newCounter: 2n,
    consumedAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
  };
  const results = await Promise.allSettled([
    issueAccountPasskeyLoginToken(tx as never, { ...input, token: "winner-a" }),
    issueAccountPasskeyLoginToken(tx as never, { ...input, token: "winner-b" }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(credentialUpdates, 1);
  assert.equal(tokens.length, 1);
}

async function testRegistrationBudgets() {
  const originalTransaction = prisma.$transaction;
  const originalSecret = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "test-only-registration-budget-secret";
  const rows: Marker[] = [];
  let tail = Promise.resolve();
  let locks = 0;
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, lock: bigint) => {
      assert.ok(strings.join("?").includes("pg_advisory_xact_lock(?::bigint)"));
      assert.equal(typeof lock, "bigint");
      locks += 1;
      return [{ locked: 1 }];
    },
    verificationToken: {
      deleteMany: async (args: { where: { identifier: string; expires: { lte: Date } } }) => {
        let count = 0;
        for (let index = rows.length - 1; index >= 0; index -= 1) {
          if (rows[index].identifier === args.where.identifier && rows[index].expires <= args.where.expires.lte) {
            rows.splice(index, 1);
            count += 1;
          }
        }
        return { count };
      },
      count: async (args: { where: { identifier: string; expires: { gt: Date } } }) =>
        rows.filter((row) => row.identifier === args.where.identifier && row.expires > args.where.expires.gt).length,
      create: async (args: { data: Marker }) => { rows.push(args.data); return args.data; },
    },
  };
  prisma.$transaction = ((operation: (client: typeof tx) => Promise<boolean>) => {
    const result = tail.then(() => operation(tx));
    tail = result.then(() => undefined);
    return result;
  }) as unknown as typeof originalTransaction;

  try {
    const request = (address: string) => new Request("https://portal.terraqo.test/api/auth/register", {
      headers: { "x-nf-client-connection-ip": address },
    });
    const sameEmail = await Promise.all(Array.from(
      { length: REGISTRATION_MAX_EMAIL_ATTEMPTS + 2 },
      () => reserveRegistrationAttempt(request("203.0.113.10"), "new.user@example.test"),
    ));
    assert.equal(sameEmail.filter(Boolean).length, REGISTRATION_MAX_EMAIL_ATTEMPTS);

    const sameNetwork = await Promise.all(Array.from(
      { length: REGISTRATION_MAX_NETWORK_ATTEMPTS + 2 },
      (_, index) => reserveRegistrationAttempt(request("203.0.113.20"), `user-${index}@example.test`),
    ));
    assert.equal(sameNetwork.filter(Boolean).length, REGISTRATION_MAX_NETWORK_ATTEMPTS);
    assert.ok(locks > 0);
    assert.ok(rows.every((row) => !row.identifier.includes("example.test") && !row.identifier.includes("203.0.113")));
    assert.ok(rows.every((row) => /^[a-f0-9]{64}$/.test(row.token)));
  } finally {
    prisma.$transaction = originalTransaction;
    if (originalSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalSecret;
  }
}

async function main() {
  await testCredentialVerificationInvariant();
  await testAtomicPasskeyChallengeConsumption();
  await testRegistrationBudgets();
  console.log("PASS auth security controls: verified-email invariant, atomic passkey claim and dual registration budgets.");
}

main()
  .catch((error: unknown) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
