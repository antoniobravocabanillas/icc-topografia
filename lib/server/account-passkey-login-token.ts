import type { Prisma } from "@prisma/client";

type PasskeyLoginTransaction = Pick<
  Prisma.TransactionClient,
  "terraqoWebAuthnChallenge" | "terraqoWebAuthnCredential" | "verificationToken"
>;

export type AccountPasskeyLoginTokenInput = {
  challengeId: string;
  userId: string;
  credentialId: string;
  newCounter: bigint;
  token: string;
  consumedAt: Date;
  expiresAt: Date;
};

/** Compare-and-set challenge consumption and token issuance must commit as one
 * unit. A replay loses the atomic claim and cannot mutate the authenticator or
 * mint a second login token. */
export async function issueAccountPasskeyLoginToken(
  tx: PasskeyLoginTransaction,
  input: AccountPasskeyLoginTokenInput,
) {
  const consumed = await tx.terraqoWebAuthnChallenge.updateMany({
    where: {
      id: input.challengeId,
      purpose: "LOGIN",
      consumedAt: null,
      expiresAt: { gt: input.consumedAt },
    },
    data: { consumedAt: input.consumedAt },
  });
  if (consumed.count !== 1) {
    throw new Error("La solicitud de acceso ya fue utilizada.");
  }

  await tx.terraqoWebAuthnCredential.update({
    where: { id: input.credentialId },
    data: { counter: input.newCounter, lastUsedAt: input.consumedAt },
  });
  await tx.verificationToken.deleteMany({
    where: { identifier: `passkey-login:${input.userId}` },
  });
  await tx.verificationToken.create({
    data: {
      identifier: `passkey-login:${input.userId}`,
      token: input.token,
      expires: input.expiresAt,
    },
  });
}
