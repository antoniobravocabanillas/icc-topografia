import assert from "node:assert/strict";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/types";
import { prisma } from "../lib/prisma";
import { FieldVerificationError, verifyPasskeyRegistration, verifyWorklogValidation } from "../lib/terraqo/field-verification";

async function main() {
  const originalMembership = prisma.terraqoWorkspaceMember.findFirst;
  const originalChallenge = prisma.terraqoWebAuthnChallenge.findFirst;
  let role: string | null = "OWNER";
  let challengeCalls = 0;
  prisma.terraqoWorkspaceMember.findFirst = (async (args: { where: Record<string, unknown> }) => {
    assert.equal(args.where.userId, "fixture-user");
    assert.equal(args.where.workspaceId, "workspace-a");
    assert.equal(args.where.active, true);
    assert.deepEqual(args.where.workspace, { active: true, deletedAt: null });
    return role ? { role } : null;
  }) as unknown as typeof originalMembership;
  prisma.terraqoWebAuthnChallenge.findFirst = (async (args: { where: Record<string, unknown> }) => {
    challengeCalls++;
    assert.equal(args.where.workspaceId, "workspace-a", "A challenge cannot cross the request's tenant boundary.");
    assert.equal(args.where.userId, "fixture-user");
    assert.equal(args.where.consumedAt, null);
    // The challenge belongs to workspace-b, so a correctly scoped query finds nothing.
    return null;
  }) as unknown as typeof originalChallenge;
  const input = { userId: "fixture-user", workspaceId: "workspace-a", challengeId: "workspace-b-challenge" };
  const status = (expected: number) => (error: unknown) => error instanceof FieldVerificationError && error.status === expected;
  try {
    await assert.rejects(verifyPasskeyRegistration({ ...input, response: {} as RegistrationResponseJSON }), status(410));
    role = null;
    const previousCalls = challengeCalls;
    await assert.rejects(verifyPasskeyRegistration({ ...input, response: {} as RegistrationResponseJSON }), status(403));
    assert.equal(challengeCalls, previousCalls, "Revocation must be checked before accessing a challenge.");
    for (const demotedRole of ["MEMBER", "VIEWER", "CLIENT", "PROFESSIONAL"]) {
      role = demotedRole;
      await assert.rejects(verifyWorklogValidation({ ...input, response: {} as AuthenticationResponseJSON }), status(403));
    }
    assert.equal(challengeCalls, previousCalls, "A demoted supervisor cannot complete validation.");
    for (const supervisorRole of ["OWNER", "ADMIN", "MANAGER"]) {
      role = supervisorRole;
      await assert.rejects(verifyWorklogValidation({ ...input, response: {} as AuthenticationResponseJSON }), status(410));
    }
    console.log("PASS: field completion rejects cross-workspace challenges, revoked membership and supervisor demotion before WebAuthn execution.");
  } finally {
    prisma.terraqoWorkspaceMember.findFirst = originalMembership;
    prisma.terraqoWebAuthnChallenge.findFirst = originalChallenge;
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
