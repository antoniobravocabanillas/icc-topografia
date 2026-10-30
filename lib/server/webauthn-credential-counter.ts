import type { Prisma } from "@prisma/client";

type WebAuthnCounterClient = Pick<
  Prisma.TransactionClient,
  "terraqoWebAuthnCredential"
>;

/** Advances an authenticator counter without allowing a delayed assertion to
 * overwrite newer state. Counterless authenticators remain at zero, but their
 * last-use timestamp is also compare-and-set so the update is still ordered. */
export async function advanceWebAuthnCredentialCounter(
  client: WebAuthnCounterClient,
  input: { credentialId: string; newCounter: bigint; usedAt: Date },
) {
  const advanced = await client.terraqoWebAuthnCredential.updateMany({
    where: {
      id: input.credentialId,
      ...(input.newCounter === 0n
        ? {
            counter: 0n,
            OR: [
              { lastUsedAt: null },
              { lastUsedAt: { lt: input.usedAt } },
            ],
          }
        : { counter: { lt: input.newCounter } }),
    },
    data: { counter: input.newCounter, lastUsedAt: input.usedAt },
  });
  return advanced.count === 1;
}
