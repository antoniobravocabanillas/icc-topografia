import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { prisma } from "../lib/prisma";
import { createRevocablePortalToken, getWorkspacePortalToken, revokePortalToken, verifyWorkspacePortalToken } from "../lib/server/workspace-portal-session";

async function main() {
  process.env.AUTH_SECRET = randomBytes(32).toString("hex");
  const original = { member: prisma.terraqoWorkspaceMember.findFirst, create: prisma.verificationToken.create,
    find: prisma.verificationToken.findFirst, delete: prisma.verificationToken.deleteMany };
  const grants = new Map<string, { identifier: string; token: string; expires: Date }>();
  prisma.terraqoWorkspaceMember.findFirst = (async () => ({ role: "OWNER" })) as unknown as typeof original.member;
  prisma.verificationToken.create = (async (args: { data: { identifier: string; token: string; expires: Date } }) => {
    assert.match(args.data.token, /^[a-f0-9]{64}$/); grants.set(args.data.token, args.data); return args.data;
  }) as unknown as typeof original.create;
  prisma.verificationToken.findFirst = (async (args: { where: { identifier: string; token: string; expires: { gt: Date } } }) => {
    const grant = grants.get(args.where.token);
    return grant?.identifier === args.where.identifier && grant.expires > args.where.expires.gt ? grant : null;
  }) as unknown as typeof original.find;
  prisma.verificationToken.deleteMany = (async (args: { where: { identifier: string; token: string } }) => {
    const grant = grants.get(args.where.token);
    if (grant?.identifier !== args.where.identifier) return { count: 0 };
    grants.delete(args.where.token); return { count: 1 };
  }) as unknown as typeof original.delete;
  try {
    const payload = { sub: "user", workspaceId: "workspace", workspaceSlug: "fixture", role: "ADMIN" as const };
    const first = await createRevocablePortalToken(payload), second = await createRevocablePortalToken(payload);
    assert.notEqual(first.token, second.token);
    const request = (token: string) => new Request("https://example.test", { headers: { authorization: `Bearer ${token}` } });
    const session = await getWorkspacePortalToken(request(first.token), "fixture");
    assert.ok(session?.jti);
    assert.ok(await revokePortalToken(session));
    assert.equal(await getWorkspacePortalToken(request(first.token), "fixture"), null);
    assert.ok(await getWorkspacePortalToken(request(second.token), "fixture"));
    assert.ok(verifyWorkspacePortalToken(first.token, "fixture"), "Signature validity is insufficient after revocation.");
    for (const grant of grants.values()) grant.expires = new Date(0);
    assert.equal(await getWorkspacePortalToken(request(second.token), "fixture"), null);
    console.log("PASS revocable portal sessions: token hash only, independent devices, revoked replay rejection and expiry.");
  } finally {
    prisma.terraqoWorkspaceMember.findFirst = original.member;
    prisma.verificationToken.create = original.create; prisma.verificationToken.findFirst = original.find; prisma.verificationToken.deleteMany = original.delete;
    await prisma.$disconnect();
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
