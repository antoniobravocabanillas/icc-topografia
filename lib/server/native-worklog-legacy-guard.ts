import "server-only";
import { Prisma } from "@prisma/client";

type Database = Pick<Prisma.TransactionClient, "$queryRaw">;
export class NativeWorklogLegacyGuardError extends Error {
  constructor(readonly status: 409 | 503 = 409) { super("Esta bitácora requiere su flujo nativo de gestión."); }
}
async function schemaAvailable(db: Database) {
  const [row] = await db.$queryRaw<{ receipt: string | null; accounting: string | null }[]>(Prisma.sql`
    SELECT to_regclass('icc."TerraqoNativeWorklogOperation"')::text AS receipt,
      to_regclass('icc."TerraqoNativeWorklogAccounting"')::text AS accounting`);
  if (!row || Boolean(row.receipt) !== Boolean(row.accounting)) throw new NativeWorklogLegacyGuardError(503);
  // Explicit pre-bootstrap catalog state only. SQL errors never become legacy authorization.
  return Boolean(row.receipt);
}
export async function assertLegacyWorklogs(db: Database, worklogIds: readonly string[]) {
  if (!worklogIds.length) return;
  if (worklogIds.some(id => !/^[A-Za-z0-9_-]{1,100}$/.test(id))) throw new NativeWorklogLegacyGuardError(503);
  if (!await schemaAvailable(db)) return;
  const found = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM icc."TerraqoNativeWorklogOperation" WHERE "targetWorklogId" IN (${Prisma.join(worklogIds)}) LIMIT 1`);
  if (found.length) throw new NativeWorklogLegacyGuardError();
}
export async function assertLegacyFirstWorklog(db: Database, userId: string) {
  // Call inside the awarding transaction: same owner lock as native creation.
  await db.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoProfessionalProfile" WHERE "userId"=${userId} FOR UPDATE`);
  if (!await schemaAvailable(db)) return;
  const found = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM icc."TerraqoNativeWorklogOperation" WHERE "actorId"=${userId} LIMIT 1`);
  if (found.length) throw new NativeWorklogLegacyGuardError();
}
export async function assertLegacyValidation(db: Database, validationId: string) {
  const [validation] = await db.$queryRaw<{ worklogId: string }[]>(Prisma.sql`
    SELECT "worklogId" FROM icc."TerraqoWorklogValidation" WHERE id=${validationId}`);
  if (!validation) throw new NativeWorklogLegacyGuardError(503);
  await assertLegacyWorklogs(db, [validation.worklogId]);
}
export async function assertLegacyBuilderSource(db: Database, input: { userId: string; type: string; sourceKey: string | null }) {
  if (input.type === "FIRST_WORKLOG") await assertLegacyFirstWorklog(db, input.userId);
  if (input.sourceKey?.startsWith("worklog:")) await assertLegacyWorklogs(db, [input.sourceKey.slice(8)]);
  if (input.sourceKey?.startsWith("worklog-validation:")) await assertLegacyValidation(db, input.sourceKey.slice(19));
}
