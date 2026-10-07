import { createHash } from "node:crypto";
import { prisma } from "../lib/prisma";

// Read-only catalog inspection. Never emit credentials, account IDs or rows.
let phase = "transaction";
async function main() {
  await prisma.$transaction(async (tx) => {
    phase = "read-only";
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    phase = "timeout";
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '30s'");
    await tx.$executeRawUnsafe("SET LOCAL search_path = icc, pg_catalog");
    phase = "metadata";
    const metadata = await tx.$queryRaw<Array<Record<string, unknown>>>`
      SELECT current_setting('server_version') AS version,
        pg_database_size(current_database())::text AS bytes,
        has_schema_privilege(current_user, 'icc', 'USAGE') AS schema_usage,
        (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass_rls`;
    phase = "schema";
    const schema = await tx.$queryRaw<Array<Record<string, unknown>>>`
      SELECT table_name, column_name, ordinal_position, data_type, udt_name,
        is_nullable, column_default
      FROM information_schema.columns WHERE table_schema = 'icc'
      ORDER BY table_name, ordinal_position`;
    phase = "identity";
    const identity = await tx.$queryRaw<Array<{ fingerprint: string; count: string }>>`
      SELECT md5(coalesce(string_agg(id::text, ',' ORDER BY id::text), '')) AS fingerprint,
        count(*)::text AS count FROM icc."TerraqoWorkspace"`;
    phase = "tables";
    const tables = await tx.$queryRaw<Array<Record<string, unknown>>>`
      SELECT c.relname AS name, c.relkind AS kind, c.reltuples::bigint::text AS estimated_rows,
        c.relrowsecurity AS rls, pg_total_relation_size(c.oid)::text AS bytes,
        pg_get_userbyid(c.relowner) = current_user AS owned_by_connection
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'icc' AND c.relkind IN ('r','p','v','m','S') ORDER BY c.relname`;
    phase = "extensions";
    const extensions = await tx.$queryRaw<Array<Record<string, unknown>>>`
      SELECT extname, extversion FROM pg_extension ORDER BY extname`;
    phase = "objects";
    const objects = await tx.$queryRaw<Array<Record<string, unknown>>>`
      SELECT (SELECT count(*)::text FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='icc') AS constraints,
        (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='icc') AS functions,
        (SELECT count(*)::text FROM pg_indexes WHERE schemaname='icc') AS indexes`;
    const invalidIndexes = await tx.$queryRaw<Array<Record<string, unknown>>>`
      SELECT c.relname AS name, i.indisvalid AS valid, i.indisready AS ready
      FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='icc' AND (NOT i.indisvalid OR NOT i.indisready) ORDER BY c.relname`;
    const canonicalSchema = schema.map((column) => Object.fromEntries(Object.entries(column).sort(([a], [b]) => a.localeCompare(b))));
    console.log(JSON.stringify({ metadata, schema: canonicalSchema, schemaFingerprint: createHash('sha256').update(JSON.stringify(canonicalSchema)).digest('hex'), columns: schema.length, identity, tables, extensions, objects, invalidIndexes }, null, 2));
  }, { timeout: 15000 });
}

main().catch((error: unknown) => { console.error(JSON.stringify({ failed: true, phase, code: typeof error === "object" && error !== null && "code" in error ? String(error.code).slice(0, 12) : "unknown" })); process.exitCode = 1; }).finally(() => prisma.$disconnect());
