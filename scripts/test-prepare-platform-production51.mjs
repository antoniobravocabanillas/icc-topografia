import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { assembleSources, pending, pins, prepareProduction51, readLocalInputs, root, sha256,
  sqlStatements, unwrapMigration } from './prepare-platform-production51.mjs';

const inputs = await readLocalInputs();
const copy = () => ({ ...inputs, sources: new Map(inputs.sources) });
const mutateJson = (bytes, fn) => {
  const value = JSON.parse(bytes); fn(value); return Buffer.from(JSON.stringify(value));
};

test('deterministic exact seven-source assembly pins all 51 sources and baseline history', () => {
  const a = prepareProduction51(inputs); const b = prepareProduction51(copy());
  assert.deepEqual(a, b);
  assert.equal(a.reviewSqlSha256, sha256(a.reviewSql));
  assert.equal(sha256(JSON.stringify(a.sourceManifest)), pins.sourceManifest);
  assert.equal(a.sourceManifest.length, 51);
  assert.deepEqual(a.migrations.map(m => m.name), pending.map(m => m.name));
  assert.equal(a.migrations.filter(m => m.wrapped).length, 4);
  const assembly = assembleSources(inputs);
  const rollback = assembly.audit.ledger.filter(r => r.rolled_back);
  assert.equal(rollback.length, 1);
  assert.ok(a.reviewSql.includes(rollback[0].checksum));
  for (const migration of assembly.migrations) {
    const source = inputs.sources.get(migration.name).toString('utf8');
    const expected = migration.wrapped ? source.replace(/^BEGIN;\r?$/m, '').replace(/^COMMIT;\r?$/m, '') : source;
    // Preserve CRLF bytes around tokens; the normalised comparison below is only
    // an assertion about removed boundaries, never a checksum acceptance policy.
    assert.equal(migration.body.replaceAll('\r\n', '\n'), expected.replaceAll('\r\n', '\n'));
    assert.equal(migration.bodySha256, sha256(migration.body));
    assert.ok(a.reviewSql.includes(migration.body));
  }
  assert.doesNotMatch(a.reviewSql, /-- SOURCE .*customer_attention_followup/);
});

test('every pending source, an applied source and line-ending-only drift fail closed', () => {
  for (const name of [...pending.map(m => m.name), '20261104000200_customer_attention_followup']) {
    const altered = copy(); altered.sources.set(name, Buffer.concat([altered.sources.get(name), Buffer.from('\n-- tamper')]));
    assert.throws(() => prepareProduction51(altered), /inventory drift/);
  }
  const altered = copy(); const name = pending[0].name;
  const source = altered.sources.get(name).toString('utf8');
  altered.sources.set(name, Buffer.from(source.includes('\r\n') ? source.replaceAll('\r\n', '\n') : source.replaceAll('\n', '\r\n')));
  assert.throws(() => prepareProduction51(altered), /inventory drift/);
});

test('missing/extra sources and replacement of pending with already-applied followup are rejected', () => {
  const missing = copy(); missing.sources.delete(pending[0].name);
  assert.throws(() => prepareProduction51(missing), /51-source inventory/);
  const extra = copy(); extra.sources.set('20990101000000_unreviewed', Buffer.from('SELECT 1;'));
  assert.throws(() => prepareProduction51(extra), /51-source inventory/);
  const substituted = copy(); substituted.sources.set(pending[0].name, substituted.sources.get('20261104000200_customer_attention_followup'));
  assert.throws(() => prepareProduction51(substituted), /inventory drift/);
});

test('baseline, rollback history, delta, schema and even readback formatting are pinned', () => {
  for (const mutate of [
    a => a.ledger.pop(),
    a => { a.ledger = a.ledger.filter(r => !r.rolled_back); },
    a => { a.ledger.find(r => r.rolled_back).checksum = '0'.repeat(64); },
    a => { a.ledger[0].finished = false; a.unfinished = 1; },
    a => { a.identity.actor = 'invented_runtime'; },
    a => { a.ledger.push(a.ledger[0]); },
  ]) assert.throws(() => prepareProduction51({ ...inputs, ledgerBytes: mutateJson(inputs.ledgerBytes, mutate) }), /ledger: pinned bytes changed/);
  for (const mutate of [
    d => d.pending.reverse(), d => d.pending.pop(), d => d.pending.push(d.pending[0]),
    d => { d.pending[0] = '20261104000200_customer_attention_followup'; },
    d => { d.applied = 51; }, d => { d.checksumMismatches.push('tamper'); },
  ]) assert.throws(() => prepareProduction51({ ...inputs, deltaBytes: mutateJson(inputs.deltaBytes, mutate) }), /delta: pinned bytes changed/);
  for (const key of ['schemaBytes', 'ledgerBytes', 'deltaBytes']) {
    assert.throws(() => prepareProduction51({ ...inputs, [key]: Buffer.concat([inputs[key], Buffer.from('\n')]) }), /pinned bytes changed/);
    assert.throws(() => prepareProduction51({ ...inputs, [key]: inputs[key].toString('utf8') }), /raw Buffer required/);
  }
});

test('splitter preserves PL/pgSQL, quotes, dollar tags and nested comments', () => {
  const body = `\n/* outer /* COMMIT; */ BEGIN; */\nCREATE FUNCTION icc.example() RETURNS void LANGUAGE plpgsql AS $guard$
BEGIN
  RAISE NOTICE 'COMMIT; it''s a string';
END;
$guard$;\nCREATE TABLE "END;" ("BEGIN;" text DEFAULT 'ROLLBACK;');\n`;
  assert.equal(unwrapMigration(`BEGIN;${body}COMMIT; -- trailing comment\n`, true), `${body} -- trailing comment\n`);
  assert.equal(sqlStatements(body).length, 2);
  assert.equal(unwrapMigration(body, false), body);
  assert.equal(unwrapMigration('/* preface */\r\nBEGIN;\r\nCREATE TABLE x(id int);\r\nCOMMIT;\r\n', true),
    '/* preface */\r\n\r\nCREATE TABLE x(id int);\r\n\r\n');
});

test('unexpected top-level boundaries cannot escape one transaction', () => {
  for (const control of ['COMMIT', 'cOmMiT WORK', 'END', 'ABORT', 'ROLLBACK', 'ROLLBACK TO SAVEPOINT x',
    'START TRANSACTION', 'BEGIN', 'PREPARE TRANSACTION \'x\'', 'SAVEPOINT x', 'RELEASE SAVEPOINT x',
    'SET TRANSACTION READ ONLY', 'SET SESSION AUTHORIZATION owner', 'VACUUM', 'CALL x()', '\\i x.sql']) {
    assert.throws(() => unwrapMigration(`BEGIN; CREATE TABLE x(id int); /* hidden */ ${control}; COMMIT;`, true));
    assert.throws(() => unwrapMigration(`CREATE TABLE x(id int); ${control};`, false));
  }
  for (const text of ['CREATE TABLE x(id int);', 'BEGIN; CREATE TABLE x(id int);',
    'BEGIN; CREATE TABLE x(id int); COMMIT; SELECT 1;', 'BEGIN; COMMIT; COMMIT;']) {
    assert.throws(() => unwrapMigration(text, true));
  }
  for (const text of ["CREATE TABLE x(a text DEFAULT 'oops);", '/* unterminated',
    'CREATE FUNCTION x() AS $tag$ BEGIN; $$;', 'CREATE TABLE x(id int)', ';', '\ufeffBEGIN;',
    "CREATE TABLE x(a text DEFAULT E'a\\b');"]) assert.throws(() => sqlStatements(text));
});

test('proposal has early blocking, bounded locks, atomic preservation/ledger order and rollback only', () => {
  const { reviewSql: sql, budgets } = prepareProduction51(inputs);
  const statements = sqlStatements(sql);
  assert.equal(statements[0].code, 'BEGIN');
  assert.equal(statements.filter(s => s.code === 'BEGIN').length, 1);
  assert.equal(statements.at(-1).code, 'ROLLBACK');
  assert.equal(statements.filter(s => /^(?:COMMIT|END|ROLLBACK|ABORT)(?: |$)/.test(s.code)).length, 1);
  const pos = text => { const index = sql.indexOf(text); assert.ok(index >= 0, text); return index; };
  assert.ok(pos('$p51_blocked$') < pos('LOCK TABLE icc._prisma_migrations'));
  assert.ok(pos('LOCK TABLE icc._prisma_migrations') < pos('$p51_baseline$'));
  assert.ok(pos('$p51_baseline$') < pos('$p51_snapshot$'));
  assert.ok(pos('$p51_snapshot$') < pos('-- SOURCE 1/7'));
  for (let i = 1; i < 7; i++) assert.ok(pos(`after-source-${i}`) < pos(`-- SOURCE ${i + 1}/7`));
  assert.ok(pos('after-source-7') < pos('$p51_preserve$'));
  assert.ok(pos('$p51_preserve$') < pos('$p51_acl_missing$'));
  assert.ok(pos('$p51_acl_missing$') < pos('INSERT INTO icc._prisma_migrations'));
  assert.ok(pos('after-ledger') < pos('$p51_final_ledger$'));
  assert.ok(pos('$p51_final_ledger$') < pos('$p51_history$'));
  assert.equal(statements.filter(s => /^INSERT INTO ICC\._PRISMA_MIGRATIONS /.test(s.code)).length, 7);
  assert.match(sql, /SHARE ROW EXCLUSIVE MODE/);
  assert.match(sql, /EXCEPT ALL SELECT %s/); assert.match(sql, /EXCEPT ALL SELECT payload/);
  assert.match(sql, /EXCEPT ALL SELECT to_jsonb\(m\)/);
  assert.match(sql, /jsonb_array_elements\(/);
  assert.match(sql, /WHERE e.key=ANY\(%L::text\[\]\)/);
  assert.match(sql, /"lifecycleVersion" IS DISTINCT FROM 1/);
  assert.equal(budgets.statementMs, 30000); assert.equal(budgets.lockMs, 5000);
  assert.equal(budgets.transactionMs, 300000); assert.equal(budgets.measured, false);
  assert.equal((sql.match(/SET LOCAL statement_timeout = '30s';/g) || []).length, 2);
  assert.match(sql, /SET LOCAL transaction_timeout = '5min'/);
  assert.match(sql, /SET LOCAL idle_in_transaction_session_timeout = '30s'/);
  assert.doesNotMatch(sql, /SET LOCAL ROLE|CREATE ROLE|GRANT .* TO|DISABLE TRIGGER|ON CONFLICT|TRUNCATE TABLE|DROP TABLE/);
});

test('no executable result or caller-provided security/approval bypass exists', () => {
  const artifact = prepareProduction51(inputs);
  assert.equal(artifact.status, 'blocked'); assert.equal(artifact.executableSql, null);
  assert.equal(artifact.securityCatalogVerified, false); assert.equal(artifact.productionReady, false);
  assert.equal(artifact.applied, false); assert.equal(artifact.blockers.length, 6);
  assert.deepEqual(artifact.baseline, { active: 44, historical: 45, rolledBack: 1, unfinished: 0 });
  assert.deepEqual(artifact.target, { active: 51, historical: 52, rolledBack: 1, unfinished: 0 });
  for (const extra of [{ approved: true }, { securityCatalog: { verified: true } }, { executable: true },
    { pins: {} }, { sql: 'COMMIT;' }, { runtimeRole: 'postgres' }]) {
    assert.throws(() => prepareProduction51({ ...inputs, ...extra }));
  }
});

test('CLI emits only deterministic blocked JSON; apply and output-path arguments are rejected', () => {
  const script = path.join(root, 'scripts/prepare-platform-production51.mjs');
  const run = args => spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 10000 });
  const result = run(['--review-json']);
  assert.equal(result.status, 0, result.stderr); assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), prepareProduction51(inputs));
  for (const args of [[], ['--apply'], ['--review-json', '--approve'], ['--review-json', 'output.sql']]) {
    const rejected = run(args); assert.equal(rejected.status, 1); assert.equal(rejected.stdout, '');
    assert.match(rejected.stderr, /No execution attempted/);
  }
});

test('generator dependency surface is local built-ins with no executor or credential loading', async () => {
  const source = await readFile(path.join(root, 'scripts/prepare-platform-production51.mjs'), 'utf8');
  const imports = [...source.matchAll(/from '([^']+)'/g)].map(m => m[1]);
  assert.deepEqual(imports, ['node:assert/strict', 'node:crypto', 'node:fs/promises', 'node:path', 'node:url']);
  assert.doesNotMatch(source, /process\.env|fetch\(|execFile|spawn\(|writeFile|dotenv|new Client|\.connect\(/);
});
