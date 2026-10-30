import type { Prisma } from "@prisma/client";

type RegistrationClient = Pick<Prisma.TransactionClient, "terraqoWebAuthnCredential" | "terraqoWebAuthnChallenge">;
type CredentialRegistration = Pick<
  Prisma.TerraqoWebAuthnCredentialUncheckedCreateInput,
  "userId" | "credentialId" | "publicKey" | "counter" | "transports" | "rpId" | "deviceName" | "backedUp"
>;

/** Caller must throw on a non-REGISTERED result inside the transaction, so
 * claiming the challenge and registering the credential commit together. */
export async function persistWebAuthnRegistration(
  tx: RegistrationClient,
  input: { challengeId: string; workspaceId?: string; registeredAt: Date; credential: CredentialRegistration },
) {
  const consumed = await tx.terraqoWebAuthnChallenge.updateMany({
    where: {
      id: input.challengeId,
      userId: input.credential.userId,
      rpId: input.credential.rpId,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      purpose: "REGISTRATION",
      consumedAt: null,
      expiresAt: { gt: input.registeredAt },
    },
    data: { consumedAt: input.registeredAt },
  });
  if (consumed.count !== 1) return "CHALLENGE_CONSUMED" as const;
  const credential = await tx.terraqoWebAuthnCredential.upsert({
    where: { credentialId_rpId: { credentialId: input.credential.credentialId, rpId: input.credential.rpId } },
    // A duplicate attestation must never reset an assertion counter, replace a
    // public key or transfer an existing credential to another account.
    update: {},
    create: input.credential,
    select: { userId: true, publicKey: true },
  });
  if (credential.userId !== input.credential.userId || !Buffer.from(credential.publicKey).equals(Buffer.from(input.credential.publicKey)))
    return "CREDENTIAL_CONFLICT" as const;
  return "REGISTERED" as const;
}
