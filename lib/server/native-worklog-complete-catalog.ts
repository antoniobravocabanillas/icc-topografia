import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NativeWorklogCatalogError, readNativeWorklogCombinedCatalog } from "./native-worklog-combined-catalog";

export const NATIVE_WORKLOG_COMPLETE_PIN = "25a238b070233aee9d5014c03790e73edb8c4daa6d2c4f357c62b37eb6d38880";
const FIRST_PIN = "ae4b4d571842674bf07bd1b6391aaa6c39e6f5d37b8d9bea088ae8a29271cd8f";
const tables = ["TerraqoNativeWorklogOperation", "TerraqoNativeWorklogAccounting",
  "TerraqoNativeWorklogDecision", "TerraqoNativeWorklogAuthority", "TerraqoNativeWorklogFirstDecision"];
const externalIndex = "NativeWorklogFirst_contribution_actor_key";

/** Read-only five-table manifest. The existing four-table pin remains immutable.
 * FIRST's pin includes its external allocation-owner index, which must also be ready/valid.
 * Exact catalog does not authorize bootstrap, accounting, or any user access.
 */
export async function readNativeWorklogCompleteCatalog(tx: Prisma.TransactionClient) {
  const objects = await tx.$queryRaw<{ relname: string; relkind: string }[]>(Prisma.sql`
    SELECT c.relname,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='icc' AND (c.relname LIKE 'TerraqoNativeWorklog%' OR c.relname LIKE 'NativeWorklog%')`);
  if (!objects.length) return { state: "absent" as const };
  if (tables.some(table => !objects.some(row => row.relname === table && row.relkind === "r"))) throw new NativeWorklogCatalogError();
  const four = await readNativeWorklogCombinedCatalog(tx);
  if (four.state !== "exact") throw new NativeWorklogCatalogError();
  const columns = await tx.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
    SELECT table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default
    FROM information_schema.columns WHERE table_schema='icc' AND table_name='TerraqoNativeWorklogFirstDecision' ORDER BY ordinal_position`);
  const constraints = await tx.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
    SELECT c.contype,pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace
    WHERE n.nspname='icc' AND cl.relname='TerraqoNativeWorklogFirstDecision' ORDER BY c.conname`);
  const indexes = await tx.$queryRaw<{ tablename: string; indexname: string; indexdef: string }[]>(Prisma.sql`
    SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='icc'
    AND (tablename='TerraqoNativeWorklogFirstDecision' OR indexname=${externalIndex}) ORDER BY tablename,indexname`);
  const first = createHash("sha256").update(JSON.stringify({ columns, constraints, indexes })).digest("hex");
  const [invalid] = await tx.$queryRaw<{ count: bigint }[]>(Prisma.sql`
    SELECT count(*) FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid
    JOIN pg_class idx ON idx.oid=i.indexrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='icc' AND (t.relname IN (${Prisma.join(tables)}) OR idx.relname=${externalIndex})
    AND (NOT i.indisvalid OR NOT i.indisready)`);
  const allIndexes = await tx.$queryRaw<{ indexname: string }[]>(Prisma.sql`
    SELECT indexname FROM pg_indexes WHERE schemaname='icc'
    AND (tablename IN (${Prisma.join(tables)}) OR indexname=${externalIndex})`);
  if (first !== FIRST_PIN || constraints.length !== 6 || indexes.length !== 2 || Number(invalid.count) !== 0 ||
      objects.some(row => !tables.includes(row.relname) && !allIndexes.some(index => index.indexname === row.relname))) throw new NativeWorklogCatalogError();
  // Composition is explicit; this is not a new hash of the old four-table catalog.
  const fingerprint = createHash("sha256").update(JSON.stringify({
    catalogVersion: "native-worklog-five-v1", four: four.fingerprint, first,
  })).digest("hex");
  if (fingerprint !== NATIVE_WORKLOG_COMPLETE_PIN) throw new NativeWorklogCatalogError();
  return { state: "exact" as const, fingerprint, constraints: 36, indexes: 16 };
}
