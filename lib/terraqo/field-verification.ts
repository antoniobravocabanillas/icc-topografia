import { randomUUID } from "node:crypto";
import type { AuthenticationResponseJSON, AuthenticatorTransportFuture, RegistrationResponseJSON } from "@simplewebauthn/types";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from "@simplewebauthn/server";
import type { Prisma, TerraqoAttendanceType, TerraqoMemberRole, TerraqoWebAuthnPurpose } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { awardAutomatedBuilderContribution, consumeBuilderValidationCredit } from "@/lib/terraqo/builders";

const SUPERVISOR_ROLES: TerraqoMemberRole[] = ["OWNER", "ADMIN", "MANAGER"];
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_LOCATION_ACCURACY_METERS = 150;

export class FieldVerificationError extends Error {
  constructor(message: string, public readonly status = 400, public readonly details?: unknown) {
    super(message);
    this.name = "FieldVerificationError";
  }
}

type WebAuthnContext = {
  rpId: string;
  expectedOrigin: string;
  rpName: string;
};

type LocationPayload = {
  projectId: string;
  type: TerraqoAttendanceType;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
};

function normalizeDomain(domain: string) {
  return domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function resolveWebAuthnContext(input: {
  request: Request;
  workspace?: { domain: string | null; brandName: string | null; name: string } | null;
  portalOrigin?: string | null;
}) {
  const requestUrl = new URL(input.request.url);
  let expectedOrigin = requestUrl.origin;

  if (input.portalOrigin) {
    const portalUrl = new URL(input.portalOrigin);
    const workspaceDomain = input.workspace?.domain ? normalizeDomain(input.workspace.domain) : "";
    const portalDomain = normalizeDomain(portalUrl.hostname);
    const localDevelopment = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(portalUrl.hostname);
    const domainMatches = workspaceDomain && (portalDomain === workspaceDomain || portalDomain === `www.${workspaceDomain}` || `www.${portalDomain}` === workspaceDomain);
    if (!domainMatches && !localDevelopment) {
      throw new FieldVerificationError("El dominio del portal no esta autorizado para validar identidad.", 403);
    }
    expectedOrigin = portalUrl.origin;
  }

  const originUrl = new URL(expectedOrigin);
  return {
    expectedOrigin,
    rpId: originUrl.hostname,
    rpName: input.workspace?.brandName || input.workspace?.name || "Portal Terraqo"
  } satisfies WebAuthnContext;
}

async function requireMembership(userId: string, workspaceId: string) {
  const membership = await prisma.terraqoWorkspaceMember.findFirst({
    where: { userId, workspaceId, active: true, workspace: { active: true, deletedAt: null } },
    include: { workspace: { select: { id: true, name: true, brandName: true, domain: true } } }
  });
  if (!membership) throw new FieldVerificationError("No perteneces al workspace seleccionado.", 403);
  return membership;
}

async function createChallenge(input: {
  userId: string;
  workspaceId?: string | null;
  purpose: TerraqoWebAuthnPurpose;
  challenge: string;
  context: WebAuthnContext;
  payload?: Prisma.InputJsonValue;
}) {
  await prisma.terraqoWebAuthnChallenge.deleteMany({
    where: { userId: input.userId, purpose: input.purpose, consumedAt: null, expiresAt: { lt: new Date() } }
  });
  return prisma.terraqoWebAuthnChallenge.create({
    data: {
      userId: input.userId,
      workspaceId: input.workspaceId || null,
      purpose: input.purpose,
      challenge: input.challenge,
      rpId: input.context.rpId,
      expectedOrigin: input.context.expectedOrigin,
      payload: input.payload,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS)
    },
    select: { id: true }
  });
}

async function getChallenge(userId: string, challengeId: string, purpose: TerraqoWebAuthnPurpose) {
  const challenge = await prisma.terraqoWebAuthnChallenge.findFirst({
    where: { id: challengeId, userId, purpose, consumedAt: null, expiresAt: { gt: new Date() } }
  });
  if (!challenge) throw new FieldVerificationError("La verificacion vencio. Inicia el proceso nuevamente.", 410);
  return challenge;
}

export async function getFieldVerificationStatus(userId: string, workspaceId: string, rpId: string) {
  const membership = await requireMembership(userId, workspaceId);
  const profile = await prisma.terraqoProfessionalProfile.findUnique({ where: { userId }, select: { id: true } });

  const [projects, latestAttendance, passkeyCount, supervisors, pendingValidations] = await Promise.all([
    profile ? prisma.project.findMany({
      where: {
        terraqoWorkspaceId: workspaceId,
        deletedAt: null,
        OR: [
          { terraqoExperiences: { some: { professionalProfileId: profile.id } } },
          { terraqoJobPosts: { some: { applications: { some: { professionalProfileId: profile.id, status: "ACCEPTED" } } } } }
        ]
      },
      select: { id: true, title: true, location: true, latitude: true, longitude: true, geofenceRadiusMeters: true },
      orderBy: { updatedAt: "desc" }
    }) : Promise.resolve([]),
    prisma.terraqoAttendanceEvent.findFirst({
      where: { userId, workspaceId, status: "ACCEPTED" },
      orderBy: { capturedAt: "desc" },
      select: { id: true, type: true, capturedAt: true, projectId: true, project: { select: { title: true } } }
    }),
    prisma.terraqoWebAuthnCredential.count({ where: { userId, rpId } }),
    prisma.terraqoWorkspaceMember.findMany({
      where: { workspaceId, active: true, role: { in: SUPERVISOR_ROLES }, userId: { not: userId } },
      select: { userId: true, title: true, user: { select: { name: true, image: true, email: true } } },
      orderBy: { createdAt: "asc" }
    }),
    prisma.terraqoWorklogValidation.findMany({
      where: { workspaceId, validatorUserId: userId, status: "REQUESTED" },
      include: {
        worklog: { select: { id: true, title: true, occurredAt: true, author: { select: { name: true, image: true } }, project: { select: { title: true } } } },
        requestedBy: { select: { name: true, image: true } }
      },
      orderBy: { requestedAt: "asc" },
      take: 30
    })
  ]);

  return {
    membership: { role: membership.role, title: membership.title },
    hasPasskey: passkeyCount > 0,
    projects,
    latestAttendance,
    supervisors: supervisors.map((item) => ({
      userId: item.userId,
      name: item.user.name || item.user.email,
      image: item.user.image,
      title: item.title || "Responsable de supervision"
    })),
    pendingValidations
  };
}

export async function createPasskeyRegistrationOptions(input: {
  userId: string;
  workspaceId: string;
  context: WebAuthnContext;
}) {
  const membership = await requireMembership(input.userId, input.workspaceId);
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true, email: true, name: true } });
  if (!user) throw new FieldVerificationError("Usuario no encontrado.", 404);
  const existing = await prisma.terraqoWebAuthnCredential.findMany({ where: { userId: input.userId, rpId: input.context.rpId } });
  const options = await generateRegistrationOptions({
    rpName: membership.workspace.brandName || membership.workspace.name,
    rpID: input.context.rpId,
    userID: user.id,
    userName: user.email,
    userDisplayName: user.name || user.email,
    timeout: CHALLENGE_TTL_MS,
    attestationType: "none",
    excludeCredentials: existing.map((credential) => ({
      id: Buffer.from(credential.credentialId, "base64url"),
      type: "public-key" as const,
      transports: credential.transports as AuthenticatorTransportFuture[]
    })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" }
  });
  const stored = await createChallenge({
    userId: input.userId,
    workspaceId: input.workspaceId,
    purpose: "REGISTRATION",
    challenge: options.challenge,
    context: input.context
  });
  return { challengeId: stored.id, options };
}

export async function verifyPasskeyRegistration(input: {
  userId: string;
  challengeId: string;
  response: RegistrationResponseJSON;
  deviceName?: string;
}) {
  const challenge = await getChallenge(input.userId, input.challengeId, "REGISTRATION");
  const verification = await verifyRegistrationResponse({
    response: input.response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: challenge.expectedOrigin,
    expectedRPID: challenge.rpId,
    requireUserVerification: true
  });
  if (!verification.verified || !verification.registrationInfo) {
    throw new FieldVerificationError("No pudimos verificar el metodo seguro del dispositivo.", 422);
  }
  const info = verification.registrationInfo;
  const credentialId = Buffer.from(info.credentialID).toString("base64url");
  await prisma.$transaction([
    prisma.terraqoWebAuthnCredential.upsert({
      where: { credentialId_rpId: { credentialId, rpId: challenge.rpId } },
      update: {
        userId: input.userId,
        publicKey: Buffer.from(info.credentialPublicKey),
        counter: BigInt(info.counter),
        transports: input.response.response.transports || [],
        deviceName: input.deviceName || "Dispositivo seguro",
        backedUp: info.credentialBackedUp
      },
      create: {
        userId: input.userId,
        credentialId,
        publicKey: Buffer.from(info.credentialPublicKey),
        counter: BigInt(info.counter),
        transports: input.response.response.transports || [],
        rpId: challenge.rpId,
        deviceName: input.deviceName || "Dispositivo seguro",
        backedUp: info.credentialBackedUp
      }
    }),
    prisma.terraqoWebAuthnChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } })
  ]);
  return { verified: true, credentialId };
}

async function createAuthenticationChallenge(input: {
  userId: string;
  workspaceId: string;
  purpose: Exclude<TerraqoWebAuthnPurpose, "REGISTRATION">;
  context: WebAuthnContext;
  payload: Prisma.InputJsonValue;
}) {
  const credentials = await prisma.terraqoWebAuthnCredential.findMany({ where: { userId: input.userId, rpId: input.context.rpId } });
  if (!credentials.length) throw new FieldVerificationError("Activa primero la validacion segura de este dispositivo.", 409, { code: "PASSKEY_REQUIRED" });
  const options = await generateAuthenticationOptions({
    rpID: input.context.rpId,
    timeout: CHALLENGE_TTL_MS,
    userVerification: "required",
    allowCredentials: credentials.map((credential) => ({
      id: Buffer.from(credential.credentialId, "base64url"),
      type: "public-key" as const,
      transports: credential.transports as AuthenticatorTransportFuture[]
    }))
  });
  const stored = await createChallenge({
    userId: input.userId,
    workspaceId: input.workspaceId,
    purpose: input.purpose,
    challenge: options.challenge,
    context: input.context,
    payload: input.payload
  });
  return { challengeId: stored.id, options };
}

async function verifyAuthentication(input: {
  userId: string;
  challengeId: string;
  purpose: Exclude<TerraqoWebAuthnPurpose, "REGISTRATION">;
  response: AuthenticationResponseJSON;
}) {
  const challenge = await getChallenge(input.userId, input.challengeId, input.purpose);
  const credential = await prisma.terraqoWebAuthnCredential.findFirst({
    where: { userId: input.userId, rpId: challenge.rpId, credentialId: input.response.id }
  });
  if (!credential) throw new FieldVerificationError("El dispositivo usado no esta registrado en esta cuenta.", 403);
  const verification = await verifyAuthenticationResponse({
    response: input.response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: challenge.expectedOrigin,
    expectedRPID: challenge.rpId,
    requireUserVerification: true,
    authenticator: {
      credentialID: Buffer.from(credential.credentialId, "base64url"),
      credentialPublicKey: new Uint8Array(credential.publicKey),
      counter: Number(credential.counter),
      transports: credential.transports as AuthenticatorTransportFuture[]
    }
  });
  if (!verification.verified || !verification.authenticationInfo.userVerified) {
    throw new FieldVerificationError("La identidad del usuario no pudo verificarse.", 403);
  }
  await prisma.terraqoWebAuthnCredential.update({
    where: { id: credential.id },
    data: { counter: BigInt(verification.authenticationInfo.newCounter), lastUsedAt: new Date() }
  });
  return { challenge, credential };
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadius = 6371000;
  const radians = (value: number) => (value * Math.PI) / 180;
  const deltaLat = radians(lat2 - lat1);
  const deltaLon = radians(lon2 - lon1);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function requireAssignedProject(userId: string, workspaceId: string, projectId: string) {
  const profile = await prisma.terraqoProfessionalProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) throw new FieldVerificationError("Perfil profesional no encontrado.", 404);
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      terraqoWorkspaceId: workspaceId,
      deletedAt: null,
      OR: [
        { terraqoExperiences: { some: { professionalProfileId: profile.id } } },
        { terraqoJobPosts: { some: { applications: { some: { professionalProfileId: profile.id, status: "ACCEPTED" } } } } }
      ]
    },
    select: { id: true, title: true, latitude: true, longitude: true, geofenceRadiusMeters: true }
  });
  if (!project) throw new FieldVerificationError("El proyecto no esta asignado a tu perfil.", 403);
  return { project, profile };
}

export async function createAttendanceOptions(input: {
  userId: string;
  workspaceId: string;
  context: WebAuthnContext;
  location: LocationPayload;
}) {
  await requireMembership(input.userId, input.workspaceId);
  const { project, profile } = await requireAssignedProject(input.userId, input.workspaceId, input.location.projectId);
  if (project.latitude === null || project.longitude === null) {
    throw new FieldVerificationError("La ubicacion de este proyecto aun no fue configurada por la empresa.", 409, { code: "GEOFENCE_NOT_CONFIGURED" });
  }
  const distanceMeters = haversineMeters(input.location.latitude, input.location.longitude, project.latitude, project.longitude);
  const eventBase = {
    userId: input.userId,
    professionalProfileId: profile.id,
    workspaceId: input.workspaceId,
    projectId: project.id,
    type: input.location.type,
    latitude: input.location.latitude,
    longitude: input.location.longitude,
    accuracyMeters: input.location.accuracyMeters,
    distanceMeters,
    geofenceRadiusMeters: project.geofenceRadiusMeters
  };
  if (input.location.accuracyMeters > MAX_LOCATION_ACCURACY_METERS) {
    await prisma.terraqoAttendanceEvent.create({ data: { ...eventBase, status: "LOCATION_UNAVAILABLE" } });
    throw new FieldVerificationError("No pudimos obtener una ubicacion suficientemente precisa. Activa la ubicacion exacta e intenta nuevamente.", 422, { code: "LOCATION_ACCURACY", accuracyMeters: input.location.accuracyMeters });
  }
  if (distanceMeters > project.geofenceRadiusMeters + input.location.accuracyMeters) {
    await prisma.terraqoAttendanceEvent.create({ data: { ...eventBase, status: "OUTSIDE_GEOFENCE" } });
    throw new FieldVerificationError("No estas en tu trabajo.", 422, { code: "OUTSIDE_GEOFENCE", distanceMeters: Math.round(distanceMeters), radiusMeters: project.geofenceRadiusMeters });
  }
  const latest = await prisma.terraqoAttendanceEvent.findFirst({
    where: { userId: input.userId, workspaceId: input.workspaceId, projectId: project.id, status: "ACCEPTED" },
    orderBy: { capturedAt: "desc" },
    select: { type: true }
  });
  const expectedType: TerraqoAttendanceType = latest?.type === "CHECK_IN" ? "CHECK_OUT" : "CHECK_IN";
  if (input.location.type !== expectedType) {
    throw new FieldVerificationError(expectedType === "CHECK_IN" ? "Primero debes registrar tu entrada." : "Ya registraste tu entrada. Corresponde registrar la salida.", 409);
  }
  return createAuthenticationChallenge({
    userId: input.userId,
    workspaceId: input.workspaceId,
    purpose: "ATTENDANCE",
    context: input.context,
    payload: { ...input.location, distanceMeters, geofenceRadiusMeters: project.geofenceRadiusMeters }
  });
}

export async function verifyAttendance(input: { userId: string; challengeId: string; response: AuthenticationResponseJSON }) {
  const { challenge, credential } = await verifyAuthentication({ ...input, purpose: "ATTENDANCE" });
  const payload = challenge.payload as unknown as LocationPayload & { distanceMeters: number; geofenceRadiusMeters: number };
  if (!challenge.workspaceId || !payload?.projectId) throw new FieldVerificationError("La solicitud de asistencia esta incompleta.", 422);
  const { profile } = await requireAssignedProject(input.userId, challenge.workspaceId, payload.projectId);
  const capturedAt = new Date();
  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.terraqoAttendanceEvent.create({
      data: {
        userId: input.userId,
        professionalProfileId: profile.id,
        workspaceId: challenge.workspaceId!,
        projectId: payload.projectId,
        type: payload.type,
        status: "ACCEPTED",
        latitude: payload.latitude,
        longitude: payload.longitude,
        accuracyMeters: payload.accuracyMeters,
        distanceMeters: payload.distanceMeters,
        geofenceRadiusMeters: payload.geofenceRadiusMeters,
        credentialId: credential.credentialId,
        capturedAt
      },
      include: { project: { select: { title: true } } }
    });
    await tx.terraqoWebAuthnChallenge.update({ where: { id: challenge.id }, data: { consumedAt: capturedAt } });
    return created;
  });
  return { id: event.id, type: event.type, capturedAt: event.capturedAt, project: event.project };
}

export async function requestWorklogValidation(input: {
  userId: string;
  workspaceId: string;
  worklogId: string;
  validatorUserId: string;
  note?: string;
}) {
  await requireMembership(input.userId, input.workspaceId);
  const worklog = await prisma.terraqoWorklogEntry.findFirst({
    where: { id: input.worklogId, authorId: input.userId, workspaceId: input.workspaceId, deletedAt: null },
    select: { id: true, projectId: true, evidenceStatus: true }
  });
  if (!worklog) throw new FieldVerificationError("Bitacora no encontrada en este workspace.", 404);
  if (worklog.evidenceStatus === "VERIFIED") throw new FieldVerificationError("Esta bitacora ya fue verificada por Terraqo.", 409);
  const supervisor = await prisma.terraqoWorkspaceMember.findFirst({
    where: { workspaceId: input.workspaceId, userId: input.validatorUserId, active: true, role: { in: SUPERVISOR_ROLES } },
    select: { userId: true }
  });
  if (!supervisor || supervisor.userId === input.userId) throw new FieldVerificationError("Selecciona un responsable autorizado del workspace.", 403);
  const pending = await prisma.terraqoWorklogValidation.findFirst({
    where: { worklogId: worklog.id, status: "REQUESTED" },
    select: { id: true }
  });
  if (pending) throw new FieldVerificationError("Esta bitacora ya tiene una validacion pendiente.", 409);
  const validation = await prisma.terraqoWorklogValidation.create({
    data: {
      worklogId: worklog.id,
      workspaceId: input.workspaceId,
      projectId: worklog.projectId,
      requestedByUserId: input.userId,
      validatorUserId: input.validatorUserId,
      requestNote: input.note
    },
    include: { validator: { select: { id: true, name: true, image: true } } }
  });
  try {
    await consumeBuilderValidationCredit(input.userId, validation.id);
  } catch (error) {
    console.warn("No se pudo aplicar el crédito Terraqo Builders a la validación.", error);
  }
  return validation;
}

export async function createWorklogValidationOptions(input: {
  userId: string;
  workspaceId: string;
  validationId: string;
  context: WebAuthnContext;
}) {
  const membership = await requireMembership(input.userId, input.workspaceId);
  if (!SUPERVISOR_ROLES.includes(membership.role)) throw new FieldVerificationError("Tu rol no permite validar bitacoras.", 403);
  const validation = await prisma.terraqoWorklogValidation.findFirst({
    where: { id: input.validationId, workspaceId: input.workspaceId, validatorUserId: input.userId, status: "REQUESTED" },
    select: { id: true }
  });
  if (!validation) throw new FieldVerificationError("La solicitud de validacion no esta disponible.", 404);
  return createAuthenticationChallenge({
    userId: input.userId,
    workspaceId: input.workspaceId,
    purpose: "WORKLOG_VALIDATION",
    context: input.context,
    payload: { validationId: validation.id, nonce: randomUUID() }
  });
}

export async function verifyWorklogValidation(input: { userId: string; challengeId: string; response: AuthenticationResponseJSON }) {
  const { challenge, credential } = await verifyAuthentication({ ...input, purpose: "WORKLOG_VALIDATION" });
  const payload = challenge.payload as { validationId?: string } | null;
  if (!challenge.workspaceId || !payload?.validationId) throw new FieldVerificationError("La solicitud de validacion esta incompleta.", 422);
  const validation = await prisma.terraqoWorklogValidation.findFirst({
    where: { id: payload.validationId, workspaceId: challenge.workspaceId, validatorUserId: input.userId, status: "REQUESTED" },
    select: { id: true, worklogId: true }
  });
  if (!validation) throw new FieldVerificationError("La solicitud ya fue resuelta o no te pertenece.", 409);
  const resolvedAt = new Date();
  await prisma.$transaction([
    prisma.terraqoWorklogValidation.update({
      where: { id: validation.id },
      data: { status: "APPROVED", resolvedAt, credentialId: credential.credentialId }
    }),
    prisma.terraqoWorklogEntry.update({
      where: { id: validation.worklogId },
      data: { evidenceStatus: "CONFIRMED" }
    }),
    prisma.terraqoWebAuthnChallenge.update({ where: { id: challenge.id }, data: { consumedAt: resolvedAt } })
  ]);
  try {
    await awardAutomatedBuilderContribution({ userId: input.userId, type: "EXPERIENCE_VALIDATION", sourceKey: `worklog-validation:${validation.id}`, title: "Validación profesional aprobada", detail: "Validaste con identidad digital la evidencia de otro profesional." });
  } catch (error) {
    console.warn("No se pudo acreditar la validación en Terraqo Builders.", error);
  }
  return { verified: true, resolvedAt };
}
