import { randomBytes } from "node:crypto";
// Isolate v13 from Auth.js's unused, optional v9-only WebAuthn provider.
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from "@terraqo/webauthn-server";
import type { AuthenticationResponseJSON, AuthenticatorTransportFuture, RegistrationResponseJSON } from "@terraqo/webauthn-server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { publicRequestOrigin } from "@/lib/server/request-origin";
import { compatibleWebAuthnRpIds, selectCompatibleWebAuthnRpId } from "@/lib/terraqo/webauthn-context";
import { issueAccountPasskeyLoginToken } from "@/lib/server/account-passkey-login-token";
import { persistWebAuthnRegistration } from "@/lib/server/webauthn-credential-registration";

const TTL = 5 * 60 * 1000;

function context(request: Request) {
  const url = new URL(publicRequestOrigin(request));
  return { rpId: url.hostname, origin: url.origin };
}

export async function accountPasskeyRegistrationOptions(userId: string, request: Request) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } });
  if (!user) throw new Error("Usuario no encontrado.");
  const { rpId, origin } = context(request);
  const credentials = await prisma.terraqoWebAuthnCredential.findMany({ where: { userId, rpId } });
  const options = await generateRegistrationOptions({
    rpName: "Terraqo",
    rpID: rpId,
    userID: new TextEncoder().encode(user.id),
    userName: user.email,
    userDisplayName: user.name || user.email,
    timeout: TTL,
    attestationType: "none",
    excludeCredentials: credentials.map((item) => ({ id: item.credentialId, type: "public-key" as const, transports: item.transports as AuthenticatorTransportFuture[] })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" }
  });
  // Browser v9 UTF-8 encodes user.id itself; v13's base64url wire encoding
  // would change existing resident user handles if passed through unchanged.
  options.user.id = user.id;
  const challenge = await prisma.terraqoWebAuthnChallenge.create({ data: { userId, purpose: "REGISTRATION", challenge: options.challenge, rpId, expectedOrigin: origin, expiresAt: new Date(Date.now() + TTL) } });
  return { challengeId: challenge.id, options };
}

export async function verifyAccountPasskeyRegistration(userId: string, challengeId: string, response: RegistrationResponseJSON, deviceName?: string) {
  const challenge = await prisma.terraqoWebAuthnChallenge.findFirst({ where: { id: challengeId, userId, purpose: "REGISTRATION", consumedAt: null, expiresAt: { gt: new Date() } } });
  if (!challenge) throw new Error("La activación venció. Inténtalo nuevamente.");
  const result = await verifyRegistrationResponse({ response, expectedChallenge: challenge.challenge, expectedOrigin: challenge.expectedOrigin, expectedRPID: challenge.rpId, requireUserVerification: true });
  if (!result.verified || !result.registrationInfo) throw new Error("El dispositivo no pudo verificarse.");
  const info = result.registrationInfo;
  const credentialId = info.credential.id;
  await prisma.$transaction(async (tx) => {
    const registration = await persistWebAuthnRegistration(tx, {
      challengeId: challenge.id,
      registeredAt: new Date(),
      credential: { userId, credentialId, publicKey: Buffer.from(info.credential.publicKey), counter: BigInt(info.credential.counter), transports: response.response.transports || [], rpId: challenge.rpId, deviceName: deviceName || "Dispositivo personal", backedUp: info.credentialBackedUp },
    });
    if (registration !== "REGISTERED") throw new Error(registration === "CHALLENGE_CONSUMED" ? "La solicitud de registro ya fue utilizada." : "La credencial ya está vinculada con otros datos.");
  });
  return { verified: true };
}

export async function accountPasskeyLoginOptions(email: string, request: Request) {
  const normalized = email.trim().toLowerCase();
  const { rpId, origin } = context(request);
  const user = await prisma.user.findUnique({ where: { email: normalized }, select: { id: true } });
  if (!user) return null;
  const compatibleCredentials = await prisma.terraqoWebAuthnCredential.findMany({ where: { userId: user.id, rpId: { in: compatibleWebAuthnRpIds(rpId) } } });
  const effectiveRpId = selectCompatibleWebAuthnRpId(rpId, compatibleCredentials.map((item) => item.rpId));
  if (!effectiveRpId) return null;
  const credentials = compatibleCredentials.filter((item) => item.rpId === effectiveRpId);
  if (!credentials.length) return null;
  const options = await generateAuthenticationOptions({ rpID: effectiveRpId, timeout: TTL, userVerification: "required", allowCredentials: credentials.map((item) => ({ id: item.credentialId, type: "public-key" as const, transports: item.transports as AuthenticatorTransportFuture[] })) });
  const challenge = await prisma.terraqoWebAuthnChallenge.create({ data: { userId: user.id, purpose: "LOGIN", challenge: options.challenge, rpId: effectiveRpId, expectedOrigin: origin, expiresAt: new Date(Date.now() + TTL) } });
  return { challengeId: challenge.id, options };
}

export async function verifyAccountPasskeyLogin(challengeId: string, response: AuthenticationResponseJSON) {
  const challenge = await prisma.terraqoWebAuthnChallenge.findFirst({ where: { id: challengeId, purpose: "LOGIN", consumedAt: null, expiresAt: { gt: new Date() } }, include: { user: { select: { email: true } } } });
  if (!challenge) throw new Error("La solicitud de acceso venció.");
  const credential = await prisma.terraqoWebAuthnCredential.findFirst({ where: { userId: challenge.userId, rpId: challenge.rpId, credentialId: response.id } });
  if (!credential) throw new Error("Este dispositivo no pertenece a la cuenta.");
  const result = await verifyAuthenticationResponse({ response, expectedChallenge: challenge.challenge, expectedOrigin: challenge.expectedOrigin, expectedRPID: challenge.rpId, requireUserVerification: true, credential: { id: credential.credentialId, publicKey: new Uint8Array(credential.publicKey), counter: Number(credential.counter), transports: credential.transports as AuthenticatorTransportFuture[] } });
  if (!result.verified || !result.authenticationInfo.userVerified) throw new Error("No pudimos confirmar tu identidad.");
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await issueAccountPasskeyLoginToken(tx, {
      challengeId: challenge.id,
      userId: challenge.userId,
      credentialId: credential.id,
      newCounter: BigInt(result.authenticationInfo.newCounter),
      token,
      consumedAt: now,
      expiresAt: new Date(now.getTime() + 60 * 1000),
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { email: challenge.user.email, token };
}
