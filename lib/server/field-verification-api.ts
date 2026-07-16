import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/types";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  createAttendanceOptions,
  createPasskeyRegistrationOptions,
  createWorklogValidationOptions,
  getFieldVerificationStatus,
  requestWorklogValidation,
  resolveWebAuthnContext,
  verifyAttendance,
  verifyPasskeyRegistration,
  verifyWorklogValidation
} from "@/lib/terraqo/field-verification";
import { terraqoAttendanceOptionsSchema, terraqoWorklogValidationRequestSchema } from "@/lib/validations/terraqo";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status") }),
  z.object({ action: z.literal("passkey_registration_options") }),
  z.object({ action: z.literal("passkey_registration_verify"), challengeId: z.string().cuid(), response: z.record(z.unknown()), deviceName: z.string().trim().max(120).optional() }),
  z.object({ action: z.literal("attendance_options"), data: terraqoAttendanceOptionsSchema }),
  z.object({ action: z.literal("attendance_verify"), challengeId: z.string().cuid(), response: z.record(z.unknown()) }),
  z.object({ action: z.literal("request_worklog_validation"), worklogId: z.string().cuid(), data: terraqoWorklogValidationRequestSchema }),
  z.object({ action: z.literal("validation_options"), validationId: z.string().cuid() }),
  z.object({ action: z.literal("validation_verify"), challengeId: z.string().cuid(), response: z.record(z.unknown()) })
]);

export async function runFieldVerificationAction(input: {
  request: Request;
  userId: string;
  workspaceId: string;
  portalOrigin?: string | null;
}) {
  const body = requestSchema.parse(await input.request.json());
  const workspace = await prisma.terraqoWorkspace.findFirst({
    where: { id: input.workspaceId, active: true, deletedAt: null },
    select: { id: true, name: true, brandName: true, domain: true }
  });
  if (!workspace) throw new Error("Workspace no encontrado.");
  const context = resolveWebAuthnContext({ request: input.request, workspace, portalOrigin: input.portalOrigin });

  switch (body.action) {
    case "status":
      return getFieldVerificationStatus(input.userId, input.workspaceId, context.rpId);
    case "passkey_registration_options":
      return createPasskeyRegistrationOptions({ userId: input.userId, workspaceId: input.workspaceId, context });
    case "passkey_registration_verify":
      return verifyPasskeyRegistration({
        userId: input.userId,
        challengeId: body.challengeId,
        response: body.response as unknown as RegistrationResponseJSON,
        deviceName: body.deviceName
      });
    case "attendance_options":
      return createAttendanceOptions({ userId: input.userId, workspaceId: input.workspaceId, context, location: body.data });
    case "attendance_verify":
      return verifyAttendance({ userId: input.userId, challengeId: body.challengeId, response: body.response as unknown as AuthenticationResponseJSON });
    case "request_worklog_validation":
      return requestWorklogValidation({
        userId: input.userId,
        workspaceId: input.workspaceId,
        worklogId: body.worklogId,
        validatorUserId: body.data.validatorUserId,
        note: body.data.note
      });
    case "validation_options":
      return createWorklogValidationOptions({ userId: input.userId, workspaceId: input.workspaceId, validationId: body.validationId, context });
    case "validation_verify":
      return verifyWorklogValidation({ userId: input.userId, challengeId: body.challengeId, response: body.response as unknown as AuthenticationResponseJSON });
  }
}
