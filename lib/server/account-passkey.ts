import { randomBytes } from "node:crypto";
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, AuthenticatorTransportFuture, RegistrationResponseJSON } from "@simplewebauthn/types";
import { prisma } from "@/lib/prisma";

const TTL = 5 * 60 * 1000;

function context(request: Request) {
  const url = new URL(request.url);
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
    userID: user.id,
    userName: user.email,
    userDisplayName: user.name || user.email,
    timeout: TTL,
    attestationType: "none",
    excludeCredentials: credentials.map((item) => ({ id: Buffer.from(item.credentialId, "base64url"), type: "public-key" as const, transports: item.transports as AuthenticatorTransportFuture[] })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" }
  });
  const challenge = await prisma.terraqoWebAuthnChallenge.create({ data: { userId, purpose: "REGISTRATION", challenge: options.challenge, rpId, expectedOrigin: origin, expiresAt: new Date(Date.now() + TTL) } });
  return { challengeId: challenge.id, options };
}

export async function verifyAccountPasskeyRegistration(userId: string, challengeId: string, response: RegistrationResponseJSON, deviceName?: string) {
  const challenge = await prisma.terraqoWebAuthnChallenge.findFirst({ where: { id: challengeId, userId, purpose: "REGISTRATION", consumedAt: null, expiresAt: { gt: new Date() } } });
  if (!challenge) throw new Error("La activación venció. Inténtalo nuevamente.");
  const result = await verifyRegistrationResponse({ response, expectedChallenge: challenge.challenge, expectedOrigin: challenge.expectedOrigin, expectedRPID: challenge.rpId, requireUserVerification: true });
  if (!result.verified || !result.registrationInfo) throw new Error("El dispositivo no pudo verificarse.");
  const info = result.registrationInfo;
  const credentialId = Buffer.from(info.credentialID).toString("base64url");
  await prisma.$transaction([
    prisma.terraqoWebAuthnCredential.upsert({
      where: { credentialId_rpId: { credentialId, rpId: challenge.rpId } },
      update: { userId, publicKey: Buffer.from(info.credentialPublicKey), counter: BigInt(info.counter), transports: response.response.transports || [], deviceName: deviceName || "Dispositivo personal", backedUp: info.credentialBackedUp },
      create: { userId, credentialId, publicKey: Buffer.from(info.credentialPublicKey), counter: BigInt(info.counter), transports: response.response.transports || [], rpId: challenge.rpId, deviceName: deviceName || "Dispositivo personal", backedUp: info.credentialBackedUp }
    }),
    prisma.terraqoWebAuthnChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } })
  ]);
  return { verified: true };
}

export async function accountPasskeyLoginOptions(email: string, request: Request) {
  const normalized = email.trim().toLowerCase();
  const { rpId, origin } = context(request);
  const user = await prisma.user.findUnique({ where: { email: normalized }, select: { id: true } });
  if (!user) return null;
  const credentials = await prisma.terraqoWebAuthnCredential.findMany({ where: { userId: user.id, rpId } });
  if (!credentials.length) return null;
  const options = await generateAuthenticationOptions({ rpID: rpId, timeout: TTL, userVerification: "required", allowCredentials: credentials.map((item) => ({ id: Buffer.from(item.credentialId, "base64url"), type: "public-key" as const, transports: item.transports as AuthenticatorTransportFuture[] })) });
  const challenge = await prisma.terraqoWebAuthnChallenge.create({ data: { userId: user.id, purpose: "LOGIN", challenge: options.challenge, rpId, expectedOrigin: origin, expiresAt: new Date(Date.now() + TTL) } });
  return { challengeId: challenge.id, options };
}

export async function verifyAccountPasskeyLogin(challengeId: string, response: AuthenticationResponseJSON) {
  const challenge = await prisma.terraqoWebAuthnChallenge.findFirst({ where: { id: challengeId, purpose: "LOGIN", consumedAt: null, expiresAt: { gt: new Date() } }, include: { user: { select: { email: true } } } });
  if (!challenge) throw new Error("La solicitud de acceso venció.");
  const credential = await prisma.terraqoWebAuthnCredential.findFirst({ where: { userId: challenge.userId, rpId: challenge.rpId, credentialId: response.id } });
  if (!credential) throw new Error("Este dispositivo no pertenece a la cuenta.");
  const result = await verifyAuthenticationResponse({ response, expectedChallenge: challenge.challenge, expectedOrigin: challenge.expectedOrigin, expectedRPID: challenge.rpId, requireUserVerification: true, authenticator: { credentialID: Buffer.from(credential.credentialId, "base64url"), credentialPublicKey: new Uint8Array(credential.publicKey), counter: Number(credential.counter), transports: credential.transports as AuthenticatorTransportFuture[] } });
  if (!result.verified || !result.authenticationInfo.userVerified) throw new Error("No pudimos confirmar tu identidad.");
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  await prisma.$transaction([
    prisma.terraqoWebAuthnCredential.update({ where: { id: credential.id }, data: { counter: BigInt(result.authenticationInfo.newCounter), lastUsedAt: now } }),
    prisma.terraqoWebAuthnChallenge.update({ where: { id: challenge.id }, data: { consumedAt: now } }),
    prisma.verificationToken.deleteMany({ where: { identifier: `passkey-login:${challenge.userId}` } }),
    prisma.verificationToken.create({ data: { identifier: `passkey-login:${challenge.userId}`, token, expires: new Date(Date.now() + 60 * 1000) } })
  ]);
  return { email: challenge.user.email, token };
}
