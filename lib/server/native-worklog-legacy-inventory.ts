import "server-only";
import { Prisma } from "@prisma/client";
import { NativeWorklogOperationError } from "./native-worklog-http";

function fail(): never { throw new NativeWorklogOperationError(503); }
const integer = (n: number) => Number.isSafeInteger(n) && n >= 0 && n <= 2147483647;

/** Directed diagnostic only, inside the caller's transaction. No repairs, selection for
 * payment, worker authorization, or completion decision. Counts never expose identities.
 * Even an empty inventory cannot authorize APPLIED: account floors/auth/FIRST remain separate.
 */
export async function inspectNativeLegacyWorklogInventoryInTransaction(tx: Prisma.TransactionClient, operationId: string) {
  if (!/^[a-f0-9]{64}$/.test(operationId)) fail();
  const identity = await tx.terraqoNativeWorklogOperation.findUnique({ where: { id: operationId } });
  if (!identity) fail();
  const [owner] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM icc."TerraqoProfessionalProfile"
    WHERE id=${identity.professionalProfileId} AND "userId"=${identity.actorId} FOR UPDATE`);
  if (!owner) fail();
  await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoNativeWorklogOperation" WHERE id=${operationId} FOR SHARE`);
  const receipt = await tx.terraqoNativeWorklogOperation.findUniqueOrThrow({ where: { id: operationId } });
  if (receipt.actorId !== identity.actorId || receipt.professionalProfileId !== owner.id) fail();
  const [outbox] = await tx.$queryRaw<{ state: string }[]>(Prisma.sql`SELECT state FROM icc."TerraqoNativeWorklogAccounting"
    WHERE "operationId"=${operationId} FOR SHARE`);
  if (!outbox) fail();
  const native = await tx.terraqoNativeWorklogOperation.findMany({ where: { actorId: receipt.actorId },
    take: 201, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { targetWorklogId: true, createdAt: true } });
  if (!native.length || native.length > 200) fail();
  const where = { userId: receipt.actorId, OR: [{ sourceKey: { startsWith: "worklog:" } },
    { sourceKey: { startsWith: "worklog-validation:" } }, { type: "FIRST_WORKLOG" as const }] };
  const ids = await tx.terraqoBuilderContribution.findMany({ where, take: 201, orderBy: { id: "asc" }, select: { id: true } });
  if (ids.length > 200) fail();
  if (ids.length) await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoBuilderContribution"
    WHERE "userId"=${receipt.actorId} AND id IN (${Prisma.join(ids.map(row => row.id))}) ORDER BY id FOR SHARE`);
  const contributions = ids.length ? await tx.terraqoBuilderContribution.findMany({ where: { ...where, id: { in: ids.map(row => row.id) } },
    take: 201, orderBy: { id: "asc" }, select: { id: true, sourceKey: true, type: true, status: true,
      createdAt: true, availableAt: true, releasedAt: true, approvedPoints: true } }) : [];
  if (contributions.length !== ids.length) fail();
  const entryIds = contributions.flatMap(row => row.sourceKey?.startsWith("worklog:") ? [row.sourceKey.slice(8)] : []);
  if (entryIds.some(id => !/^[a-z0-9]{25}$/.test(id))) fail();
  if (entryIds.length) await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoWorklogEntry"
    WHERE "authorId"=${receipt.actorId} AND "professionalProfileId"=${owner.id}
    AND id IN (${Prisma.join(entryIds)}) ORDER BY id FOR SHARE`);
  const entries = entryIds.length ? await tx.terraqoWorklogEntry.findMany({ where: { id: { in: entryIds },
    authorId: receipt.actorId, professionalProfileId: owner.id }, take: 201,
    select: { id: true, createdAt: true, tqPointsAwarded: true } }) : [];
  await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoBuilderAccount" WHERE "userId"=${receipt.actorId} FOR SHARE`);
  const account = await tx.terraqoBuilderAccount.findUnique({ where: { userId: receipt.actorId },
    select: { id: true, rewardsFrozenUntil: true } });
  // One global ledger cap, not 200 nested rows per contribution. Large history requires investigation.
  const ledger = ids.length ? await tx.terraqoBuilderLedger.findMany({ where: { contributionId: { in: ids.map(row => row.id) } },
    take: 201, orderBy: { id: "asc" }, select: { contributionId: true, accountId: true, redemptionId: true,
      type: true, pointsDelta: true, scoreDelta: true } }) : [];
  if (ledger.length > 200) fail();
  const targets = new Set(native.map(row => row.targetWorklogId)), firstNative = native[0].createdAt;
  const byEntry = new Map(entries.map(row => [row.id, row]));
  const now = new Date();
  const counts = { inspected: contributions.length, native: 0, unsupported: 0, missingReference: 0,
    ambiguous: 0, historical: 0, rejected: 0, unfunded: 0, frozen: 0, future: 0, due: 0 };
  for (const c of contributions) {
    if (!c.sourceKey?.startsWith("worklog:") || c.type !== "BETA_PARTICIPATION") { counts.unsupported++; continue; }
    const entryId = c.sourceKey.slice(8);
    if (targets.has(entryId)) { counts.native++; continue; }
    const e = byEntry.get(entryId);
    if (!e) { counts.missingReference++; continue; }
    const rows = ledger.filter(row => row.contributionId === c.id);
    const credited = rows.reduce((sum, row) => sum + row.pointsDelta, 0);
    if (c.createdAt > firstNative || e.createdAt > firstNative || !integer(c.approvedPoints) ||
        !integer(credited) || credited > c.approvedPoints || e.tqPointsAwarded !== c.approvedPoints ||
        rows.some(row => !account || row.accountId !== account.id || row.redemptionId !== null ||
          row.type !== "CREDIT" || !integer(row.pointsDelta) || row.pointsDelta === 0 || row.scoreDelta !== row.pointsDelta) ||
        (c.releasedAt && credited !== c.approvedPoints)) { counts.ambiguous++; continue; }
    if (c.releasedAt) { counts.historical++; continue; }
    if (c.status === "REJECTED") { counts.rejected++; continue; }
    if (!c.availableAt) { counts.unfunded++; continue; }
    if (!account) { counts.ambiguous++; continue; }
    if (account.rewardsFrozenUntil && account.rewardsFrozenUntil > now) { counts.frozen++; continue; }
    if (c.availableAt > now) { counts.future++; continue; }
    counts.due++;
  }
  return Object.freeze({ completionAuthorized: false as const, outboxState: outbox.state, ...counts });
}
