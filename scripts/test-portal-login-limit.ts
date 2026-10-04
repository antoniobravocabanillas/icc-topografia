import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { reservePortalLoginAttempt, PORTAL_LOGIN_MAX_ATTEMPTS } from "../lib/server/portal-login-limit";

async function main() {
  const original = prisma.$transaction;
  const rows: { identifier: string; token: string; expires: Date }[] = [];
  let tail = Promise.resolve(); let locks = 0;
  const tx = { $queryRaw: async (strings: TemplateStringsArray, lock: bigint) => {
    assert.ok(strings.join("?").includes("pg_advisory_xact_lock(?::bigint)")); assert.equal(typeof lock, "bigint"); locks++; return [{ locked: 1 }];
  }, verificationToken: {
    deleteMany: async (args: { where: { identifier: string; expires: { lte: Date } } }) => {
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].identifier === args.where.identifier && rows[i].expires <= args.where.expires.lte) rows.splice(i, 1);
      return { count: 0 };
    }, count: async (args: { where: { identifier: string; expires: { gt: Date } } }) => rows.filter(row => row.identifier === args.where.identifier && row.expires > args.where.expires.gt).length,
    create: async (args: { data: { identifier: string; token: string; expires: Date } }) => {
      assert.match(args.data.identifier, /^portal-login-attempt:/); assert.match(args.data.token, /^[a-f0-9]{64}$/); rows.push(args.data); return args.data;
    },
  } };
  prisma.$transaction = ((operation: (client: typeof tx) => Promise<boolean>) => {
    const result = tail.then(() => operation(tx)); tail = result.then(() => undefined); return result;
  }) as unknown as typeof original;
  try {
    const results = await Promise.all(Array.from({ length: 12 }, () => reservePortalLoginAttempt("workspace", "user")));
    assert.equal(results.filter(Boolean).length, PORTAL_LOGIN_MAX_ATTEMPTS);
    assert.equal(rows.length, PORTAL_LOGIN_MAX_ATTEMPTS); assert.equal(locks, 12);
    assert.equal(await reservePortalLoginAttempt("other-workspace", "user"), true);
    assert.equal(await reservePortalLoginAttempt("workspace", "other-user"), true);
    for (const row of rows) if (row.identifier === "portal-login-attempt:workspace:user") row.expires = new Date(0);
    assert.equal(await reservePortalLoginAttempt("workspace", "user"), true);
    assert.equal(rows.filter(row => row.identifier === "portal-login-attempt:workspace:user").length, 1);
    console.log("PASS login limit: bound advisory lock, atomic attempt budget, workspace/user isolation and expired-marker cleanup.");
  } finally { prisma.$transaction = original; await prisma.$disconnect(); }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
