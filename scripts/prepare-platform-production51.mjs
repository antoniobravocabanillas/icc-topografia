import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// OFFLINE ONLY. No credentials, provider clients, child processes or execution path.
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const pins = Object.freeze({
  candidate: '1db7bf2e70363ae82b15bf8ad4f1b103af4ac135',
  ledger: 'f57e96022fb7bc0deddb0597b02a27c98081b10b6a7a44a564b0e1cee6a788e0',
  delta: '2a1d3715ec5ec468ca6cf7de243224c44705a97b6e2c0a2081fb0176f43377f7',
  schema: '5180acbb4f490dbdbc1f3e4d002b60f3580d6b10481cfbc6eb70b738713582d2',
  sourceManifest: '098b125c5e625365281a57f1d702d487b3a4eb779e1c8f5c5d4f6dc3e2a9d76f',
});
export const pending = Object.freeze([
  ['20261101000100_enterprise_publication_review', '1cbf0517579579375084bf54c3eb79c448b3f64d4c1687e52d5805b1698d5c46', false],
  ['20261102000100_selection_access_requests', '78be174a7b140054e3c4b5813e67d07e5880a4c322292b298337a9ff0e534e69', false],
  ['20261104000100_workspace_invitations', '70cd9c0d47b27d8760e82fbaf59d9c8abf5ffe4b1045005bcd5f1eb54f996d08', false],
  ['20261104000300_workspace_evaluators', '350d4fe98d49ef406b6b218e6e5a5607c6676c43da8802e3f18c1a47a48ff668', true],
  ['20261120000100_closure_accepted_proposal_provenance', '56427a907bb22ec6b4637eccaa43c8eb629b5274d95b79cf102cd4eec73197f9', true],
  ['20261120000200_certificate_disclosure_consent', '90670355b1b93f2ec850ac28e55d4a346f9c0ce160df43aaefe6a90cbc1aed3d', true],
  ['20261120000300_professional_document_lifecycle', 'e7c49905ddf187a30fb1f3794c8e3c6476f1238cc4e6077cd884cec88ff22b6c', true],
].map(([name, checksum, wrapped]) => Object.freeze({ name, checksum, wrapped })));

export const securityRequirements = Object.freeze([
  'Fresh provider database identity bound to site/deploy, TLS endpoint, database/schema and capture freshness policy; hostname alone is insufficient.',
  'Verified session/migration/runtime identities, role attributes, memberships including grantors and SET/INHERIT options; provider-supported separation from owner/superuser.',
  'Complete object/column/function/type/schema ownership, effective ACLs, PUBLIC/inherited/default ACLs, RLS policies and trigger settings; invoker dependencies and retention policy.',
  'Reviewed production ACL overlay and before/after assertions, runtime denial of DDL/ledger writes and audit-history deletion; exact restoration of security catalog.',
  'Full historical ledger records and catalog baseline including pending-object absence, engine/extensions/collation/sequences/dependencies; current readback has only name/checksum/status projections.',
  'Exact backup restore, serving/candidate compatibility, late-failure rollback, concurrent locks, duplicate/lost-ack readback, measured time/temp/WAL/disk and recovery receipts bound to all hashes.',
]);

// A small lexical splitter, NOT a general SQL parser/security validator. Hash pins are
// the authority. Quoted bodies/comments must never be mistaken for transaction ends.
export function sqlStatements(sql) {
  assert.equal(typeof sql, 'string');
  assert.ok(!sql.includes('\0') && !sql.includes('\ufeff'), 'Unsupported SQL encoding');
  const result = [];
  let start = 0; let code = ''; let i = 0;
  while (i < sql.length) {
    if (sql.startsWith('--', i)) {
      const end = sql.indexOf('\n', i + 2); i = end < 0 ? sql.length : end + 1; code += ' '; continue;
    }
    if (sql.startsWith('/*', i)) {
      let depth = 1; i += 2;
      while (i < sql.length && depth) {
        if (sql.startsWith('/*', i)) { depth++; i += 2; }
        else if (sql.startsWith('*/', i)) { depth--; i += 2; }
        else i++;
      }
      assert.equal(depth, 0, 'Unterminated SQL comment'); code += ' '; continue;
    }
    const dollar = sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)?.[0];
    if (dollar) {
      const end = sql.indexOf(dollar, i + dollar.length);
      assert.ok(end >= 0, 'Unterminated dollar body'); i = end + dollar.length; code += ' BODY '; continue;
    }
    if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i++]; let closed = false;
      while (i < sql.length) {
        // Pinned sources use standard strings only. Fail closed on escape ambiguity.
        assert.notEqual(sql[i], '\\', 'Backslash quoting is unsupported');
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) { i += 2; continue; }
          i++; closed = true; break;
        }
        i++;
      }
      assert.ok(closed, 'Unterminated SQL quote'); code += ' QUOTED '; continue;
    }
    if (sql[i] === ';') {
      assert.ok(code.trim(), 'Empty SQL statement');
      result.push({ start, end: i + 1, code: code.trim().replace(/\s+/g, ' ').toUpperCase() });
      start = ++i; code = ''; continue;
    }
    code += sql[i++];
  }
  assert.equal(code.trim(), '', 'Unterminated SQL statement');
  return result;
}

export function unwrapMigration(sql, wrapped) {
  assert.equal(typeof wrapped, 'boolean');
  const statements = sqlStatements(sql);
  assert.ok(statements.length > 0, 'Empty migration');
  let body = sql;
  if (wrapped) {
    assert.equal(statements[0].code, 'BEGIN', 'Expected one leading BEGIN');
    assert.equal(statements.at(-1).code, 'COMMIT', 'Expected one trailing COMMIT');
    // Retain every byte other than the two boundary tokens (including comments).
    const first = statements[0]; const last = statements.at(-1);
    const opening = sql.slice(first.start, first.end);
    const closing = sql.slice(last.start, last.end);
    assert.match(opening, /\bBEGIN\s*;$/i);
    assert.match(closing, /\bCOMMIT\s*;$/i);
    body = opening.replace(/\bBEGIN\s*;$/i, '') + sql.slice(first.end, last.start)
      + closing.replace(/\bCOMMIT\s*;$/i, '') + sql.slice(last.end);
  }
  for (const statement of sqlStatements(body)) {
    assert.ok(/^(CREATE (?:TYPE|TABLE|(?:UNIQUE )?INDEX|FUNCTION|TRIGGER) |ALTER TABLE |REVOKE |SET LOCAL (?:LOCK_TIMEOUT|STATEMENT_TIMEOUT|SEARCH_PATH) = )/.test(statement.code),
      `Unsupported top-level statement: ${statement.code.slice(0, 60)}`);
  }
  return body;
}

function pinnedBytes(value, expected, label) {
  assert.ok(Buffer.isBuffer(value), `${label}: raw Buffer required`);
  assert.equal(sha256(value), expected, `${label}: pinned bytes changed; independent review required`);
}
const literal = value => "'" + value.replaceAll("'", "''") + "'";
const jsonLiteral = value => literal(JSON.stringify(value)) + '::jsonb';

// Pure source assembly: no I/O and no caller-supplied pins/roles/SQL/approval flag.
export function assembleSources(input) {
  assert.deepEqual(Object.keys(input).sort(), ['deltaBytes', 'ledgerBytes', 'schemaBytes', 'sources']);
  const { ledgerBytes, deltaBytes, schemaBytes, sources } = input;
  pinnedBytes(ledgerBytes, pins.ledger, 'ledger'); pinnedBytes(deltaBytes, pins.delta, 'delta');
  pinnedBytes(schemaBytes, pins.schema, 'schema');
  const audit = JSON.parse(ledgerBytes); const delta = JSON.parse(deltaBytes);
  assert.equal(audit.readOnly, true); assert.equal(audit.applied, 44); assert.equal(audit.unfinished, 0);
  assert.equal(audit.ledger.length, 45);
  assert.equal(audit.ledger.filter(r => r.finished && !r.rolled_back).length, 44);
  assert.equal(audit.ledger.filter(r => r.rolled_back).length, 1);
  assert.equal(new Set(audit.ledger.filter(r => r.finished && !r.rolled_back).map(r => r.migration_name)).size, 44);
  assert.deepEqual(delta, { readOnly: true, applied: 44, checksumMismatches: [], pending: pending.map(m => m.name), unfinished: 0 });
  assert.ok(sources instanceof Map);
  const expectedNames = [...new Set([...audit.ledger.map(r => r.migration_name), ...pending.map(m => m.name)])].sort();
  assert.deepEqual([...sources.keys()].sort(), expectedNames, 'Exact 51-source inventory required');
  const sourceManifest = expectedNames.map(name => {
    assert.ok(Buffer.isBuffer(sources.get(name)), 'Source bytes required');
    return { name, sha256: sha256(sources.get(name)) };
  });
  assert.equal(sha256(JSON.stringify(sourceManifest)), pins.sourceManifest, 'Migration source inventory drift');
  const migrations = pending.map(m => {
    pinnedBytes(sources.get(m.name), m.checksum, m.name);
    const body = unwrapMigration(sources.get(m.name).toString('utf8'), m.wrapped);
    return { ...m, body, bodySha256: sha256(body) };
  });
  return { audit, sourceManifest, migrations };
}

const newTables = Object.freeze(['TerraqoPublicationReview', 'TerraqoSelectionAccessRequest', 'TerraqoWorkspaceInvitation',
  'TerraqoWorkspaceEvaluator', 'TerraqoWorkspaceEvaluatorAssignment', 'TerraqoCertificateDisclosure',
  'TerraqoCertificateDisclosureEvent', 'TerraqoDocumentReplacementAttempt']);
const lifecycleColumns = ['withdrawnAt', 'withdrawnByUserId', 'withdrawOperationKey', 'replacesDocumentId',
  'replacementOperationKey', 'replacementFingerprint'];

function proposalSql(assembly) {
  const expected = assembly.audit.ledger;
  const expectedFinal = [...expected, ...pending.map(m => ({ migration_name: m.name, checksum: m.checksum, finished: true, rolled_back: false }))];
  const ledgerProjection = `jsonb_build_object('migration_name',migration_name,'checksum',checksum,
    'finished',finished_at IS NOT NULL,'rolled_back',rolled_back_at IS NOT NULL)`;
  const checkLedger = (rows, tag) => `DO $${tag}$ BEGIN
  IF EXISTS (
    (SELECT value FROM jsonb_array_elements(${jsonLiteral(rows)}) EXCEPT ALL SELECT ${ledgerProjection} FROM icc._prisma_migrations)
    UNION ALL
    (SELECT ${ledgerProjection} FROM icc._prisma_migrations EXCEPT ALL SELECT value FROM jsonb_array_elements(${jsonLiteral(rows)}))
  ) THEN RAISE EXCEPTION 'Exact historical ledger drift or replay'; END IF;
END $${tag}$;`;
  return `-- BLOCKED REVIEW PROPOSAL ONLY. NOT A PRODUCTION RELEASE ARTIFACT.
-- Source candidate ${pins.candidate}; ledger ${pins.ledger}; schema ${pins.schema}.
-- Security/catalog/backup/compatibility gates are missing. No roles are inferred.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL transaction_timeout = '5min';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SET LOCAL standard_conforming_strings = on;
SET LOCAL search_path = pg_catalog, icc;
DO $p51_blocked$ BEGIN
  RAISE EXCEPTION 'BLOCKED: verified production security catalog and rehearsal required';
END $p51_blocked$;
-- Everything below is unreachable review material, including the ledger writes.
-- PostgreSQL 17 transaction_timeout is a proposed total cap, not measured capacity.
LOCK TABLE icc._prisma_migrations IN EXCLUSIVE MODE;
${checkLedger(expected, 'p51_baseline')}
-- A separate schema-change fence is required: table locks do not prevent new tables.
-- Acquire every writer lock before capturing rows; keep locks until transaction end.
CREATE TEMP TABLE p51_tables (table_name text PRIMARY KEY, columns text[] NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE p51_rows (table_name text NOT NULL, payload jsonb NOT NULL) ON COMMIT DROP;
DO $p51_snapshot$ DECLARE t record; BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='icc' AND c.relkind IN ('p','f')) THEN
    RAISE EXCEPTION 'Partitioned/foreign tables require a separate preservation plan'; END IF;
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='icc' AND c.relkind='r' ORDER BY c.relname LOOP
    EXECUTE format('LOCK TABLE icc.%I IN SHARE ROW EXCLUSIVE MODE',t.relname);
    INSERT INTO pg_temp.p51_tables SELECT t.relname,array_agg(a.attname::text ORDER BY a.attnum)
      FROM pg_attribute a WHERE a.attrelid=format('icc.%I',t.relname)::regclass AND a.attnum>0 AND NOT a.attisdropped;
  END LOOP;
  FOR t IN SELECT table_name FROM pg_temp.p51_tables ORDER BY table_name LOOP
    EXECUTE format('INSERT INTO pg_temp.p51_rows SELECT %L,to_jsonb(r) FROM icc.%I r',t.table_name,t.table_name);
  END LOOP;
END $p51_snapshot$;
${assembly.migrations.map((m, index) => `-- SOURCE ${index + 1}/7 ${m.name}; raw SHA256 ${m.checksum}
${m.body}
-- FAILURE-INJECTION CHECKPOINT after-source-${index + 1}`).join('\n')}
-- Restore a catalog-first path after the unchanged disclosure SET LOCAL.
SET LOCAL search_path = pg_catalog, icc;
DO $p51_preserve$ DECLARE t record; changed boolean; projection text; BEGIN
  FOR t IN SELECT table_name,columns FROM pg_temp.p51_tables ORDER BY table_name LOOP
    projection := format('(SELECT jsonb_object_agg(e.key,e.value) FROM jsonb_each(to_jsonb(r)) e WHERE e.key=ANY(%L::text[]))',t.columns);
    EXECUTE format('SELECT EXISTS ((SELECT payload FROM pg_temp.p51_rows WHERE table_name=%L EXCEPT ALL SELECT %s FROM icc.%I r)
      UNION ALL (SELECT %s FROM icc.%I r EXCEPT ALL SELECT payload FROM pg_temp.p51_rows WHERE table_name=%L))',
      t.table_name,projection,t.table_name,projection,t.table_name,t.table_name) INTO changed;
    IF changed THEN RAISE EXCEPTION 'Existing row multiset changed: %',t.table_name; END IF;
  END LOOP;
END $p51_preserve$;
DO $p51_defaults$ DECLARE name text; populated boolean; BEGIN
  FOREACH name IN ARRAY ARRAY[${newTables.map(literal).join(',')}] LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM icc.%I)',name) INTO populated;
    IF populated THEN RAISE EXCEPTION 'Unexpected new-table data: %',name; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM icc."TerraqoPublicProjection" WHERE snapshot IS NOT NULL)
    OR EXISTS (SELECT 1 FROM icc."TerraqoClosureRevision" WHERE "acceptedProposalId" IS NOT NULL)
    OR EXISTS (SELECT 1 FROM icc."TerraqoProfessionalDocument" WHERE "lifecycleVersion" IS DISTINCT FROM 1
      OR ${lifecycleColumns.map(c => `"${c}" IS NOT NULL`).join(' OR ')}) THEN
    RAISE EXCEPTION 'Unexpected backfill or lifecycle defaults'; END IF;
END $p51_defaults$;
-- REQUIRED VERIFIED SECURITY CATALOG / ACL OVERLAY / EXACT CATALOG ASSERTIONS:
-- Deliberately absent, not synthesized from staging or a superuser readback.
DO $p51_acl_missing$ BEGIN RAISE EXCEPTION 'BLOCKED: production ACL overlay absent'; END $p51_acl_missing$;
-- FAILURE-INJECTION CHECKPOINT after-acl (requires future verified implementation)
${assembly.migrations.map(m => {
    const h = m.checksum;
    const id = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
    return `INSERT INTO icc._prisma_migrations (id,checksum,finished_at,migration_name,started_at,applied_steps_count)
VALUES (${literal(id)},${literal(h)},now(),${literal(m.name)},now(),1);`;
  }).join('\n')}
-- FAILURE-INJECTION CHECKPOINT after-ledger
${checkLedger(expectedFinal, 'p51_final_ledger')}
-- Preserve every old ledger field, including IDs, timestamps, logs and rollback rows.
DO $p51_history$ BEGIN
  IF EXISTS (SELECT payload FROM pg_temp.p51_rows WHERE table_name='_prisma_migrations'
    EXCEPT ALL SELECT to_jsonb(m) FROM icc._prisma_migrations m) THEN
    RAISE EXCEPTION 'Historical ledger record changed'; END IF;
END $p51_history$;
-- No COMMIT is emitted. Removing a gate is not an authorization mechanism.
ROLLBACK;
`;
}

export function prepareProduction51(input) {
  const assembly = assembleSources(input);
  const sql = proposalSql(assembly);
  return {
    format: 'production51-offline-review-v1', status: 'blocked', executableSql: null,
    applied: false, productionReady: false, pins,
    baseline: { active: 44, historical: 45, rolledBack: 1, unfinished: 0 },
    target: { active: 51, historical: 52, rolledBack: 1, unfinished: 0 },
    budgets: { lockMs: 5000, statementMs: 30000, transactionMs: 300000, idleTransactionMs: 30000, measured: false },
    securityCatalogVerified: false, blockers: securityRequirements,
    sourceManifest: assembly.sourceManifest,
    migrations: assembly.migrations.map(({ body, ...metadata }) => metadata),
    reviewSqlSha256: sha256(sql), reviewSql: sql,
  };
}

export async function readLocalInputs(directory = root) {
  const base = path.join(directory, 'prisma/migrations');
  const names = (await readdir(base, { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name).sort();
  const [ledgerBytes, deltaBytes, schemaBytes, entries] = await Promise.all([
    readFile(path.join(directory, 'output/release-readback/production-ledger.json')),
    readFile(path.join(directory, 'output/release-readback/production-migration-delta.json')),
    readFile(path.join(directory, 'prisma/schema.prisma')),
    Promise.all(names.map(async name => [name, await readFile(path.join(base, name, 'migration.sql'))])),
  ]);
  return { ledgerBytes, deltaBytes, schemaBytes, sources: new Map(entries) };
}

async function main() {
  assert.deepEqual(process.argv.slice(2), ['--review-json'], 'Usage: node scripts/prepare-platform-production51.mjs --review-json');
  // stdout only: no output file overwrite, no SQL-only mode, no --apply/--approve.
  console.log(JSON.stringify(prepareProduction51(await readLocalInputs()), null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('Production51 preparation rejected: arguments, missing inputs or pinned-source drift. No execution attempted.'); process.exitCode = 1; });
}
