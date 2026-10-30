import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { canUseTerraqoCredentials } from "../lib/server/credential-login-policy";
import { issueAccountPasskeyLoginToken } from "../lib/server/account-passkey-login-token";
import { persistWebAuthnRegistration } from "../lib/server/webauthn-credential-registration";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
      updateMany: async () => { credentialUpdates += 1; return { count: 1 }; },
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

async function testMonotonicPasskeyCounter() {
  const challenges = new Set<string>();
  const tokens: Marker[] = [];
  let counter = 1n;
  let lastUsedAt: Date | null = null;
  const tx = {
    terraqoWebAuthnChallenge: {
      updateMany: async (args: { where: { id: string } }) => {
        if (challenges.has(args.where.id)) return { count: 0 };
        challenges.add(args.where.id);
        return { count: 1 };
      },
    },
    terraqoWebAuthnCredential: {
      updateMany: async (args: {
        where: { counter: bigint | { lt: bigint }; OR?: unknown[] };
        data: { counter: bigint; lastUsedAt: Date };
      }) => {
        const matches = typeof args.where.counter === "bigint"
          ? counter === args.where.counter && (!lastUsedAt || lastUsedAt <= args.data.lastUsedAt)
          : counter < args.where.counter.lt;
        if (!matches) return { count: 0 };
        counter = args.data.counter;
        lastUsedAt = args.data.lastUsedAt;
        return { count: 1 };
      },
    },
    verificationToken: {
      deleteMany: async () => { tokens.length = 0; return { count: 0 }; },
      create: async (args: { data: Marker }) => { tokens.push(args.data); return args.data; },
    },
  };
  const base = {
    userId: "user-1",
    credentialId: "credential-1",
    consumedAt: new Date("2026-10-28T00:00:00Z"),
    expiresAt: new Date("2026-10-28T00:01:00Z"),
  };
  await issueAccountPasskeyLoginToken(tx as never, { ...base, challengeId: "counter-high", newCounter: 3n, token: "high" });
  await assert.rejects(
    issueAccountPasskeyLoginToken(tx as never, { ...base, challengeId: "counter-stale", newCounter: 2n, token: "stale" }),
    /más reciente/i,
  );
  assert.equal(counter, 3n, "Una assertion obsoleta no puede reducir el contador persistido.");
  assert.deepEqual(tokens.map((item) => item.token), ["high"]);

  counter = 0n;
  lastUsedAt = null;
  await issueAccountPasskeyLoginToken(tx as never, { ...base, challengeId: "counterless-a", newCounter: 0n, token: "zero-a" });
  await issueAccountPasskeyLoginToken(tx as never, {
    ...base,
    challengeId: "counterless-b",
    newCounter: 0n,
    token: "zero-b",
    consumedAt: new Date(base.consumedAt.getTime() + 1),
  });
  assert.equal(counter, 0n, "Los authenticators sin contador conservan el flujo 0 → 0.");
  assert.deepEqual(tokens.map((item) => item.token), ["zero-b"]);
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

async function testRegistrationPreservesCredentialState() {
  const consumed = new Set<string>();
  let saved: { userId: string; publicKey: Uint8Array; counter: bigint } | null = null;
  const tx = {
    terraqoWebAuthnChallenge: {
      updateMany: async ({ where }: { where: { id: string; consumedAt: null; purpose: string } }) => {
        assert.equal(where.consumedAt, null);
        assert.equal(where.purpose, "REGISTRATION");
        if (consumed.has(where.id)) return { count: 0 };
        consumed.add(where.id);
        return { count: 1 };
      },
    },
    terraqoWebAuthnCredential: {
      upsert: async ({ create, update }: { create: { userId: string; publicKey: Uint8Array; counter: bigint }; update: object }) => {
        assert.deepEqual(update, {}, "Re-registering must not overwrite the stored credential.");
        saved ||= create;
        return saved;
      },
    },
  };
  const input = {
    challengeId: "registration-first",
    registeredAt: new Date("2026-10-30T00:00:00Z"),
    credential: { userId: "owner", credentialId: "credential", rpId: "terraqo.test", publicKey: Buffer.from("original-key"), counter: 0n, transports: [], deviceName: "Device", backedUp: false },
  };
  assert.equal(await persistWebAuthnRegistration(tx as never, input), "REGISTERED");
  assert.equal(await persistWebAuthnRegistration(tx as never, input), "CHALLENGE_CONSUMED");
  assert.ok(saved);
  (saved as { counter: bigint }).counter = 9n;
  assert.equal(await persistWebAuthnRegistration(tx as never, { ...input, challengeId: "registration-delayed" }), "REGISTERED");
  assert.equal((saved as { counter: bigint }).counter, 9n, "A delayed registration cannot reset an assertion counter.");
  assert.equal(await persistWebAuthnRegistration(tx as never, { ...input, challengeId: "registration-foreign", credential: { ...input.credential, userId: "other" } }), "CREDENTIAL_CONFLICT");
  assert.equal(await persistWebAuthnRegistration(tx as never, { ...input, challengeId: "registration-new-key", credential: { ...input.credential, publicKey: Buffer.from("replacement-key") } }), "CREDENTIAL_CONFLICT");
  assert.equal((saved as { userId: string }).userId, "owner");
  assert.equal(Buffer.from((saved as { publicKey: Uint8Array }).publicKey).toString(), "original-key");
}

async function main() {
  await testCredentialVerificationInvariant();
  await testAtomicPasskeyChallengeConsumption();
  await testMonotonicPasskeyCounter();
  await testRegistrationPreservesCredentialState();
  const fieldVerification = readFileSync(resolve(process.cwd(), "lib/terraqo/field-verification.ts"), "utf8");
  assert.doesNotMatch(fieldVerification, /terraqoWebAuthnCredential\.update\s*\(/);
  assert.match(fieldVerification, /advanceWebAuthnCredentialCounter\(tx/);
  assert.match(fieldVerification, /purpose:\s*"WORKLOG_VALIDATION"[\s\S]*?consumedAt:\s*null/);
  assert.match(fieldVerification, /persistWebAuthnRegistration\(tx/);
  const accountPasskey = readFileSync(resolve(process.cwd(), "lib/server/account-passkey.ts"), "utf8");
  assert.match(accountPasskey, /persistWebAuthnRegistration\(tx/);
  await testRegistrationBudgets();
  console.log("PASS auth security controls: verified-email invariant, atomic passkey claim and dual registration budgets.");
}

main()
  .catch((error: unknown) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
