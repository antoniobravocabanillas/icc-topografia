import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

export const NATIVE_WORKLOG_COMBINED_PIN = "55bb6318b6ff7379a6dc12bf801e42e25fb49c26a6ae8760a2eccadf30ac6279";
const tables = ["TerraqoNativeWorklogOperation", "TerraqoNativeWorklogAccounting", "TerraqoNativeWorklogDecision", "TerraqoNativeWorklogAuthority"];
export class NativeWorklogCatalogError extends Error {
  constructor() { super("Native worklog catalog mismatch"); }
}
/** Read only. No repair, DDL, migration-ledger write or accounting authorization. */
export async function readNativeWorklogCombinedCatalog(tx: Prisma.TransactionClient) {
  const objects = await tx.$queryRaw<{ relname: string; relkind: string }[]>(Prisma.sql`
    SELECT c.relname,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='icc' AND (c.relname IN (${Prisma.join(tables)})
      OR c.relname LIKE 'NativeWorklogOperation%'
      OR c.relname LIKE 'NativeWorklogAuthority%' OR c.relname LIKE 'NativeWorklogAccounting%' OR c.relname LIKE 'NativeWorklogDecision%'
      OR c.relname IN ('TerraqoNativeWorklogOperation_pkey','TerraqoNativeWorklogAccounting_pkey','TerraqoNativeWorklogDecision_pkey','TerraqoNativeWorklogAuthority_pkey'))`);
  if (!objects.length) return { state: "absent" as const };
  if (tables.some(table => !objects.some(row => row.relname === table && row.relkind === "r"))) throw new NativeWorklogCatalogError();
  const columns = await tx.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
    SELECT table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default
    FROM information_schema.columns WHERE table_schema='icc' AND table_name IN (${Prisma.join(tables)}) ORDER BY table_name,ordinal_position`);
  const constraints = await tx.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
    SELECT cl.relname AS table_name,c.contype,pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace
    WHERE n.nspname='icc' AND cl.relname IN (${Prisma.join(tables)}) ORDER BY cl.relname,c.conname`);
  const indexes = await tx.$queryRaw<{ tablename: string; indexname: string; indexdef: string }[]>(Prisma.sql`
    SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='icc' AND tablename IN (${Prisma.join(tables)}) ORDER BY tablename,indexname`);
  const [invalid] = await tx.$queryRaw<{ count: bigint }[]>(Prisma.sql`
    SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='icc' AND c.relname IN (${Prisma.join(tables)}) AND (NOT i.indisvalid OR NOT i.indisready)`);
  const fingerprint = createHash("sha256").update(JSON.stringify({ columns, constraints, indexes })).digest("hex");
  if (fingerprint !== NATIVE_WORKLOG_COMBINED_PIN || constraints.length !== 30 || indexes.length !== 14 || Number(invalid.count) !== 0 ||
      objects.some(row => !tables.includes(row.relname) && !indexes.some(index => index.indexname === row.relname))) throw new NativeWorklogCatalogError();
  return { state: "exact" as const, fingerprint, constraints: 30, indexes: 14 };
}
