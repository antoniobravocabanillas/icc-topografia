import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { readNativeWorklogCompleteCatalog } from "../lib/server/native-worklog-complete-catalog";

// Fixed immutable files only. No request path, arbitrary DDL, repair or ledger marking.
const migrations = [
  ["20261008051000_native_worklog_operations", "793ef74992f0d91e311cd692402884dc6db13777427c57298ed1829e9961d9c9"],
  ["20261008161000_native_worklog_decision", "48443fa878589145aa5f19bb5ac680acebbee12a3cd9248179b65fd4bb708686"],
  ["20261008162500_native_worklog_content_key", "53a30a11ef03631c9827ed303f409dae5ee51e8331fe6f9a822f68dd239adbb4"], // gitleaks:allow -- SHA256 of immutable SQL migration, not a credential.
  ["20261008232500_native_worklog_authority_snapshot", "56390cab35263715b382b1e7f5c180abba043dfe4c0f371711ab167d05a33ace"],
  ["20261009035000_native_worklog_first_decision", "734d3af1c5e165cdb0f573375e273b730e09523e0a2ac116f60644ad0e236a0c"],
] as const;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Schema definitions and migration ledgers, never application row contents.
 * The one authorized external index is excluded from both sides of comparison.
 */
export async function nativeBootstrapBaseline(tx: Prisma.TransactionClient) {
  const columns = await tx.$queryRaw`SELECT table_schema,table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default
    FROM information_schema.columns WHERE table_schema IN ('icc','public') AND table_name NOT LIKE 'TerraqoNativeWorklog%'
    ORDER BY table_schema,table_name,ordinal_position`;
  const constraints = await tx.$queryRaw`SELECT n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid) AS definition
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('icc','public') AND c.relname NOT LIKE 'TerraqoNativeWorklog%'
    ORDER BY n.nspname,c.relname,k.conname`;
  const indexes = await tx.$queryRaw`SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes
    WHERE schemaname IN ('icc','public') AND tablename NOT LIKE 'TerraqoNativeWorklog%'
    AND indexname<>'NativeWorklogFirst_contribution_actor_key' ORDER BY schemaname,tablename,indexname`;
  const extensions = await tx.$queryRaw`SELECT extname,extversion,extnamespace::regnamespace::text AS namespace FROM pg_extension ORDER BY extname`;
  const identity = await tx.$queryRaw`SELECT current_database() AS database,current_user AS actor`;
  const ledgers: unknown[] = [];
  for (const schema of ["icc", "public"]) {
    const name = `${schema}."_prisma_migrations"`;
    const [found] = await tx.$queryRaw<{ present: string | null }[]>(Prisma.sql`SELECT to_regclass(${name})::text AS present`);
    ledgers.push({ schema, rows: found.present
      ? await tx.$queryRawUnsafe(`SELECT to_jsonb(m) AS row FROM ${name} m ORDER BY id`) : null });
  }
  return digest({ columns, constraints, indexes, extensions, identity, ledgers });
}

/** Offline maintenance tool, not a runtime caller or a production CLI.
 * Caller owns ONE transaction and MUST roll back any exception. Run with all
 * schema migrations and native creation/accounting paused; advisory lock only
 * serializes cooperating bootstrap callers. No permission to deploy is implied.
 */
export async function bootstrapNativeWorklogInTransaction(tx: Prisma.TransactionClient) {
  const files: string[] = [];
  for (const [name, expected] of migrations) {
    const bytes = await readFile(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url));
    if (createHash("sha256").update(bytes).digest("hex") !== expected) throw new Error("Native bootstrap file mismatch");
    files.push(bytes.toString("utf8"));
  }
  await tx.$executeRaw`SET LOCAL lock_timeout='5s'`;
  await tx.$executeRaw`SET LOCAL statement_timeout='10s'`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(78261009, 35000)::text`;
  await readNativeWorklogCompleteCatalog(tx); // Reject partial/different BEFORE DDL.
  await tx.$executeRaw`LOCK TABLE icc."User",icc."TerraqoWorkspace",icc."TerraqoProfessionalProfile",
    icc."TerraqoWorklogEntry",icc."TerraqoBuilderContribution" IN SHARE ROW EXCLUSIVE MODE`;
  const initial = await readNativeWorklogCompleteCatalog(tx);
  const baseline = await nativeBootstrapBaseline(tx);
  if (initial.state === "absent") {
    for (const file of files) {
      // These pinned files contain ordinary DDL with no procedural/string semicolons.
      for (const statement of file.split(";").map(value => value.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
    }
  }
  const final = await readNativeWorklogCompleteCatalog(tx);
  if (final.state !== "exact" || await nativeBootstrapBaseline(tx) !== baseline) throw new Error("Native bootstrap preservation failed");
  return Object.freeze({ outcome: initial.state === "absent" ? "created" as const : "existing" as const,
    fingerprint: final.fingerprint, constraints: final.constraints, indexes: final.indexes, baseline });
}
