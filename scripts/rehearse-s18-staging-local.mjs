import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { lstat, mkdir, mkdtemp, open, readFile, realpath, rm, unlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

// OFFLINE ONLY. This is a disposable rehearsal, never a migration/promoter.
// Usage: node scripts/rehearse-s18-staging-local.mjs <fresh-backup-dir> --confirm=local-s18-only
// The coordinator creates the backup separately. No .env/provider/config loader is used here.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const execute = promisify(execFile);
const bin = 'C:/Program Files/PostgreSQL/18/bin';
const prefix = 'terraqo-s18-rehearsal-';
const proposalPath = path.join(root, 'docs/work-documented/proposals/s18-document-lifecycle.proposed.sql');
const prismaPath = path.join(root, 'prisma/schema.prisma');
const documentTable = 'TerraqoProfessionalDocument';
const attemptTable = 'TerraqoDocumentReplacementAttempt';
const guardNames = ['guard_document_replacement_attempt', 'guard_professional_document_lifecycle'];
const id = value => `"${value.replaceAll('"', '""')}"`;
const lit = value => `'${value.replaceAll("'", "''")}'`;
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function parseArguments(args) {
  assert.equal(args.length, 2, 'Expected backup-directory and --confirm=local-s18-only');
  assert.equal(args[1], '--confirm=local-s18-only');
  const input = args[0];
  assert.ok(typeof input === 'string' && input.trim() === input && input && !input.startsWith('-'));
  // Reject URLs (including file:), UNC/network paths and drive-relative paths before any I/O.
  assert.ok(!/[\x00-\x1f\x7f]/.test(input) && !/^[\\/]{2}/.test(input));
  assert.ok(!input.includes(':') || (/^[a-z]:[\\/]/i.test(input) && !input.slice(2).includes(':')));
  assert.ok(!input.includes('://'));
  return path.resolve(input);
}

export function childEnvironment(source = process.env) {
  const env = { PGCLIENTENCODING: 'UTF8', PGCONNECT_TIMEOUT: '5', PGSSLMODE: 'disable',
    CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1' };
  // Allow-list OS plumbing only: never PG*, DATABASE_URL, NODE_OPTIONS, provider credentials or proxy settings.
  for (const [key, value] of Object.entries(source)) {
    if (/^(path|systemroot|windir|temp|tmp|comspec|pathext)$/i.test(key)) env[key] = value;
  }
  return env;
}

export async function readBackup(directory) {
  assert.ok(!(await lstat(directory)).isSymbolicLink(), 'Backup directory cannot be a symlink');
  const resolved = await realpath(directory);
  assert.ok(!/^[\\/]{2}/.test(resolved), 'Network backup paths are not allowed');
  assert.ok((await lstat(resolved)).isDirectory());
  const readFresh = async name => {
    const file = path.join(resolved, name);
    const stat = await lstat(file);
    assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'Regular backup files required');
    const age = Date.now() - stat.mtimeMs;
    assert.ok(age >= -300_000 && age <= 6 * 60 * 60 * 1000, 'Backup freshness exceeds six hours');
    return readFile(file);
  };
  const manifestBytes = await readFresh('manifest.json');
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.projectRef, 'mghdpciewbsowjrjwmwk');
  assert.equal(manifest.siteId, '6b8c43fb-6083-450a-9b85-46a820fb6358');
  assert.equal(manifest.schema, 'icc');
  assert.equal(manifest.archiveReadable, true);
  assert.equal(manifest.remoteWrites, false);
  assert.match(manifest.sha256, /^[a-f0-9]{64}$/);
  assert.ok(Number.isSafeInteger(manifest.bytes) && manifest.bytes > 0);
  const bytes = await readFresh('icc.dump');
  assert.equal(bytes.length, manifest.bytes);
  assert.equal(sha256(bytes), manifest.sha256);
  return { directory: resolved, bytes, manifest, manifestSha256: sha256(manifestBytes) };
}

export function proposalBody(source) {
  // Strip only the outer transaction in memory; PL/pgSQL BEGIN/END is left intact.
  const match = /^(?:\s|--[^\r\n]*(?:\r?\n|$))*BEGIN;([\s\S]*?)\bROLLBACK;\s*$/i.exec(source);
  assert.ok(match, 'Proposal must retain its BEGIN/ROLLBACK wrapper');
  return match[1];
}

export function summarizeParity(sql) {
  const significant = sql.replace(/^--.*$/gm, '').trim();
  const operations = [];
  for (const line of significant.split(/\r?\n/)) {
    // Report only DDL verbs and quoted identifiers. Never persist defaults, SQL bodies or data literals.
    const match = /^\s*(DROP INDEX|CREATE (?:UNIQUE )?INDEX|ALTER TABLE|DROP TABLE|CREATE TABLE|ALTER TYPE|DROP TYPE|CREATE TYPE)\s+("(?:[^"]|"")*"(?:\."(?:[^"]|"")*")?)/.exec(line);
    if (!match) continue;
    const operation = { operation: match[1], target: match[2] };
    const column = /ALTER COLUMN\s+("(?:[^"]|"")*")\s+(DROP DEFAULT|SET DEFAULT|SET NOT NULL|DROP NOT NULL|TYPE)/.exec(line);
    if (column) { operation.column = column[1]; operation.change = column[2]; }
    operations.push(operation);
  }
  // Existing B1/B5 SQL-only generated column and GIN index are not represented
  // by this Prisma datamodel. Accept only these exact statements, and only when
  // the caller separately verifies their live catalog definitions are unchanged.
  const known = [
    'DROP INDEX "icc"."Worklog_search_vector_gin_idx";',
    'ALTER TABLE "icc"."TerraqoWorklogEntry" ALTER COLUMN "searchVector" DROP DEFAULT;',
  ];
  const lines = significant.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const knownFullTextOnly = lines.length === known.length && lines.every((line, index) => line === known[index]);
  return { matches: significant === '', knownFullTextOnly, sha256: sha256(sql), operations };
}

async function ownedCluster(work) {
  const tempRoot = await realpath(os.tmpdir());
  const directory = await mkdtemp(path.join(tempRoot, prefix));
  const owned = await realpath(directory);
  const data = path.join(owned, 'data');
  const pwFile = path.join(owned, 'password');
  let child, log, exited, startupError;
  const secret = randomBytes(32).toString('hex');
  const env = childEnvironment();
  const run = async (name, args) => (await execute(path.join(bin, `${name}.exe`), args,
    { cwd: owned, env, windowsHide: true, timeout: 120_000, maxBuffer: 32 * 1024 * 1024 })).stdout;
  const psql = ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', '-At'];
  const query = async sql => (await run('psql', [...psql, '-c', sql])).trim();
  const verifiedDirectory = async () => {
    assert.equal(await realpath(directory), owned);
    assert.equal(path.dirname(owned), tempRoot);
    assert.ok(path.basename(owned).startsWith(prefix));
    assert.ok(!(await lstat(directory)).isSymbolicLink());
    if (await lstat(data).catch(e => { if (e.code !== 'ENOENT') throw e; })) {
      assert.ok(!(await lstat(data)).isSymbolicLink());
      assert.equal(await realpath(data), data);
    }
  };
  try {
    await verifiedDirectory();
    const probe = net.createServer();
    await new Promise((resolve, reject) => probe.once('error', reject).listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise((resolve, reject) => probe.close(e => e ? reject(e) : resolve()));
    Object.assign(env, { PGHOST: '127.0.0.1', PGPORT: String(port), PGDATABASE: 'postgres',
      PGUSER: 's18_local_restore', PGPASSWORD: secret });
    await writeFile(pwFile, secret, { flag: 'wx', mode: 0o600 });
    await run('initdb', ['-D', data, '-U', env.PGUSER, '-A', 'scram-sha-256', '--pwfile', pwFile, '--encoding=UTF8']);
    await unlink(pwFile);
    log = await open(path.join(owned, 'postgres.log'), 'wx', 0o600);
    child = spawn(path.join(bin, 'postgres.exe'), ['-D', data, '-h', '127.0.0.1', '-p', String(port),
      '-c', 'unix_socket_directories='], { cwd: owned, env, windowsHide: true, stdio: ['ignore', log.fd, log.fd] });
    exited = new Promise(resolve => { child.once('exit', resolve); child.once('error', e => { startupError = e; resolve(); }); });
    let ready = false;
    for (let i = 0; i < 50; i++) {
      if (startupError) throw startupError;
      assert.ok(child.exitCode === null && child.signalCode === null, 'Owned server exited');
      try { await query('SELECT 1'); ready = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 200)); }
    }
    assert.ok(ready, 'Owned local cluster unavailable');
    const identity = JSON.parse(await query(`SELECT json_build_object('database',current_database(),'role',current_user,
      'host',host(inet_server_addr()),'port',inet_server_port(),'data',current_setting('data_directory'),
      'listeners',current_setting('listen_addresses'),'encoding',current_setting('server_encoding'),
      'major',current_setting('server_version_num')::int/10000)`));
    assert.deepEqual(identity, { database: 'postgres', role: env.PGUSER, host: '127.0.0.1', port,
      data: data.replaceAll('\\', '/'), listeners: '127.0.0.1', encoding: 'UTF8', major: 18 });
    assert.equal(Number((await readFile(path.join(data, 'postmaster.pid'), 'utf8')).split('\n')[0]), child.pid);

    // Stream canonical rows into a digest: no whole-table payload/PII goes to logs or receipts.
    const digestQuery = sql => new Promise((resolve, reject) => {
      const digest = createHash('sha256'); let count = 0;
      const reader = spawn(path.join(bin, 'psql.exe'), [...psql, '-c', sql],
        { cwd: owned, env, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
      const timer = setTimeout(() => { reader.kill(); reject(new Error('Snapshot timeout')); }, 120_000);
      reader.stdout.on('data', chunk => { digest.update(chunk); for (const byte of chunk) if (byte === 10) count++; });
      reader.once('error', e => { clearTimeout(timer); reject(e); });
      reader.once('close', code => {
        clearTimeout(timer);
        if (code !== 0) reject(new Error('Snapshot query failed'));
        else resolve({ count, sha256: digest.digest('hex') });
      });
    });
    return await work({ directory: owned, env, run, query, digestQuery, psql, engine: await query('SELECT version()'), port });
  } finally {
    // Check resolved ownership BEFORE any stop/removal. Never stop by port or global process name.
    await verifiedDirectory();
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      const pidFile = await readFile(path.join(data, 'postmaster.pid'), 'utf8').catch(e => {
        if (e.code !== 'ENOENT') throw e;
        return null;
      });
      if (pidFile !== null) {
        assert.equal(Number(pidFile.split('\n')[0]), child.pid, 'Refuse to stop an unowned server');
        await run('pg_ctl', ['-D', data, '-m', 'fast', '-w', '-t', '30', 'stop']);
      } else {
        // Startup failed before writing its pid file: signal only our tracked ChildProcess.
        child.kill();
      }
      let timer;
      try { await Promise.race([exited, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Owned server shutdown not confirmed; directory retained')), 30_000);
      })]); } finally { clearTimeout(timer); }
    }
    await assert.rejects(lstat(path.join(data, 'postmaster.pid')), { code: 'ENOENT' });
    await log?.close();
    await verifiedDirectory();
    await rm(owned, { recursive: true, force: false, maxRetries: 5, retryDelay: 200 });
    await assert.rejects(lstat(owned), { code: 'ENOENT' });
  }
}

// Local reconstruction of the two-grantor membership observed by the existing restore pattern.
// This does NOT assert that a --no-acl backup contains evidence of current hosted grants.
const membershipQuery = `SELECT jsonb_agg(jsonb_build_object('grantor',g.rolname,
  'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option) ORDER BY g.rolname)
  FROM pg_auth_members m JOIN pg_roles g ON g.oid=m.grantor
  WHERE m.roleid='terraqo_staging_migrator'::regrole AND m.member='postgres'::regrole`;
const expectedMembership = [
  { grantor: 'postgres', admin: false, inherit: true, set: false },
  { grantor: 'supabase_admin', admin: true, inherit: false, set: false },
];
const runtimeAcl = `
REVOKE ALL ON icc."${attemptTable}" FROM PUBLIC, anon, authenticated, service_role, terraqo_staging_runtime;
GRANT SELECT, INSERT, UPDATE ON icc."${attemptTable}" TO terraqo_staging_runtime;
${guardNames.map(name => `REVOKE ALL ON FUNCTION icc.${name}() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION icc.${name}() TO terraqo_staging_runtime;`).join('\n')}
`;

export async function main(args = process.argv.slice(2), releaseArtifact = null) {
  let phase = 'arguments';
  const checks = [];
  const pass = label => { checks.push(label); console.log(`PASS ${label}`); };
  try {
    const backupDirectory = parseArguments(args);
    phase = 'backup manifest/digest/freshness';
    const backup = await readBackup(backupDirectory);
    const source = await readFile(proposalPath);
    const schema = await readFile(prismaPath);
    const body = proposalBody(source.toString('utf8'));
    if (releaseArtifact) {
      assert.equal(sha256(releaseArtifact.sql), releaseArtifact.artifactSha256);
      assert.ok(releaseArtifact.sql.replaceAll('\r\n', '\n').includes(body.replaceAll('\r\n', '\n').trim()), 'Release artifact changed proposed DDL');
      assert.match(releaseArtifact.sql, /COMMIT;\s*$/);
    }
    pass('fresh staging manifest and archive SHA256 verified; no remote connection accepted');
    phase = 'owned PostgreSQL 18 startup/identity';
    const evidence = await ownedCluster(async ({ directory, env, run, query, digestQuery, psql, engine, port }) => {
      pass('owned PG18 process/data directory, UTF8, ephemeral port and loopback listener verified');
      phase = 'restore immutable backup copy';
      const dump = path.join(directory, 'verified.dump');
      await writeFile(dump, backup.bytes, { flag: 'wx', mode: 0o600 });
      assert.equal(sha256(await readFile(dump)), backup.manifest.sha256);
      const toc = await run('pg_restore', ['--list', dump]);
      assert.ok(toc.includes('_prisma_migrations'));
      await run('pg_restore', ['--exit-on-error', '--single-transaction', '--no-owner', '--no-acl', '--dbname=postgres', dump]);
      const tableNames = async () => JSON.parse(await query(`SELECT coalesce(json_agg(tablename ORDER BY tablename COLLATE "C"),'[]') FROM pg_tables WHERE schemaname='icc'`));
      const sourceTables = await tableNames();
      assert.ok(sourceTables.includes('_prisma_migrations') && sourceTables.includes(documentTable));
      assert.ok(!sourceTables.includes(attemptTable), 'S18 already present');
      assert.equal(await query(`SELECT count(*) FROM icc._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`), '50');
      assert.equal(await query(`SELECT count(*) FROM icc._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL`), '0');
      const originalColumns = {};
      for (const table of sourceTables) {
        originalColumns[table] = JSON.parse(await query(`SELECT json_agg(attname ORDER BY attnum) FROM pg_attribute
          WHERE attrelid=${lit(`icc.${id(table)}`)}::regclass AND attnum>0 AND NOT attisdropped`));
      }
      assert.ok(!originalColumns[documentTable].includes('lifecycleVersion'), 'S18 columns already present');
      let releaseApplied = false;
      const snapshots = async migrated => {
        assert.deepEqual(await tableNames(), migrated ? [...sourceTables, attemptTable].sort() : sourceTables);
        const result = {};
        for (const table of sourceTables) {
          // Only document rows gain columns. Other tables, including the complete migration ledger,
          // compare ALL columns; no filtering of old migration records/checksums is permitted.
          const columns = table === documentTable ? originalColumns[table].map(id).join(',') : '*';
          const filter = releaseApplied && table === '_prisma_migrations'
            ? ` WHERE migration_name <> '20261120000300_professional_document_lifecycle'` : '';
          result[table] = await digestQuery(`SELECT row_to_json(r)::text FROM
            (SELECT ${columns} FROM icc.${id(table)}${filter}) r ORDER BY to_jsonb(r)::text COLLATE "C"`);
        }
        return result;
      };
      const before = await snapshots(false);
      pass(`backup restored; ledger50/unfinished0; ${sourceTables.length} original table digests captured`);
      phase = 'reconstruct local role boundary';
      await query(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE ROLE postgres CREATEROLE; CREATE ROLE supabase_admin CREATEROLE;
        CREATE ROLE terraqo_staging_migrator; CREATE ROLE terraqo_staging_runtime;
        GRANT terraqo_staging_migrator TO supabase_admin WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;
        SET SESSION AUTHORIZATION supabase_admin;
        GRANT terraqo_staging_migrator TO postgres WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;
        RESET SESSION AUTHORIZATION;
        SET SESSION AUTHORIZATION postgres;
        GRANT terraqo_staging_migrator TO postgres WITH ADMIN FALSE, INHERIT TRUE, SET FALSE;
        RESET SESSION AUTHORIZATION;
        ALTER SCHEMA icc OWNER TO terraqo_staging_migrator;
        REVOKE ALL ON SCHEMA icc FROM PUBLIC, anon, authenticated, service_role, terraqo_staging_runtime;
        GRANT USAGE ON SCHEMA icc TO terraqo_staging_runtime;
        ${sourceTables.map(t => `ALTER TABLE icc.${id(t)} OWNER TO terraqo_staging_migrator;`).join('\n')}
        GRANT SELECT, INSERT, UPDATE, DELETE ON icc."${documentTable}" TO terraqo_staging_runtime;
        GRANT SELECT ON icc."TerraqoProfessionalProfile" TO terraqo_staging_runtime;`);
      const boundary = async () => {
        assert.deepEqual(JSON.parse(await query(membershipQuery)), expectedMembership);
        assert.equal(await query("SELECT pg_has_role('postgres','terraqo_staging_migrator','SET')"), 'f');
        assert.equal(await query("SELECT pg_has_role('postgres','terraqo_staging_migrator','USAGE')"), 't');
        assert.equal(await query(`SELECT count(*) FROM pg_roles WHERE rolname='terraqo_staging_runtime'
          AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolbypassrls AND NOT rolcanlogin`), '1');
        assert.equal(await query(`SELECT count(*) FROM pg_auth_members WHERE member='terraqo_staging_runtime'::regrole`), '0');
        for (const role of ['anon', 'authenticated', 'service_role']) {
          assert.equal(await query(`SELECT has_schema_privilege(${lit(role)},'icc','USAGE') OR has_schema_privilege(${lit(role)},'icc','CREATE')`), 'f');
        }
        assert.equal(await query("SELECT has_schema_privilege('terraqo_staging_runtime','icc','CREATE')"), 'f');
      };
      await boundary();
      const schemaDigest = async () => sha256((await run('pg_dump', ['--schema-only', '--schema=icc', '--no-owner', '--no-acl']))
        .replace(/^\\(?:un)?restrict .*\r?\n/gm, ''));
      const baselineSchema = await schemaDigest();
      const fullTextCatalog = async () => {
        // PostgreSQL itself canonicalizes both expressions; a names-only exception
        // would hide a broken generated expression or a different index method.
        const state = JSON.parse(await query(`CREATE TEMP TABLE s18_fts_reference (
          title text, summary text, outcome text, "searchVector" tsvector GENERATED ALWAYS AS (
            to_tsvector('spanish'::regconfig,coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(outcome,''))
          ) STORED);
          SELECT json_build_object(
            'generated',a.attgenerated,'type',format_type(a.atttypid,a.atttypmod),
            'expression',pg_get_expr(d.adbin,d.adrelid),
            'expectedExpression',(SELECT pg_get_expr(rd.adbin,rd.adrelid) FROM pg_attrdef rd
              JOIN pg_attribute ra ON ra.attrelid=rd.adrelid AND ra.attnum=rd.adnum
              WHERE rd.adrelid='s18_fts_reference'::regclass AND ra.attname='searchVector'),
            'method',am.amname,'valid',i.indisvalid,'ready',i.indisready,'unique',i.indisunique,
            'keys',i.indnkeyatts,'attributes',i.indnatts,'predicate',pg_get_expr(i.indpred,i.indrelid),
            'indexColumn',pg_get_indexdef(i.indexrelid,1,true))
          FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
          JOIN pg_index i ON i.indrelid=a.attrelid AND i.indexrelid=to_regclass('icc."Worklog_search_vector_gin_idx"')
          JOIN pg_class ci ON ci.oid=i.indexrelid JOIN pg_am am ON am.oid=ci.relam
          WHERE a.attrelid='icc."TerraqoWorklogEntry"'::regclass AND a.attname='searchVector';`));
        assert.equal(state.expression, state.expectedExpression);
        assert.deepEqual({ ...state, expression: undefined, expectedExpression: undefined }, {
          generated: 's', type: 'tsvector', expression: undefined, expectedExpression: undefined,
          method: 'gin', valid: true, ready: true, unique: false, keys: 1, attributes: 1,
          predicate: null, indexColumn: '"searchVector"',
        });
        return sha256(JSON.stringify(state));
      };
      const fullTextBefore = await fullTextCatalog();
      const baseline = async () => {
        assert.equal(await schemaDigest(), baselineSchema);
        assert.deepEqual(await snapshots(false), before);
        await boundary();
      };
      let sequence = 0;
      const apply = async (sql, actor = 'terraqo_staging_migrator') => {
        assert.ok(['terraqo_staging_migrator', 'postgres'].includes(actor));
        const file = path.join(directory, `local-only-${sequence++}.sql`);
        await writeFile(file, `SET SESSION AUTHORIZATION ${actor};\n${sql}`, { flag: 'wx', mode: 0o600 });
        return run('psql', [...psql, '-f', file]);
      };
      const reject = async (operation, sqlstate) => {
        await assert.rejects(operation, error => new RegExp(`\\b${sqlstate}\\b`).test(String(error.stderr)));
      };
      phase = 'original proposal rollback';
      await apply(source.toString('utf8'));
      await baseline();
      pass('unchanged BEGIN/ROLLBACK proposal leaves schema, all rows and complete ledger unchanged');
      phase = 'late-failure atomic rollback';
      await reject(() => apply(`BEGIN;\n${body}\n${runtimeAcl}\nSELECT 1/0;\nCOMMIT;`), '22012');
      await baseline();
      pass('late failure rolls back S18 DDL and ACL; prior schema, rows, ledger and role membership preserved');
      if (releaseArtifact) {
        phase = 'exact release artifact late-failure rollback';
        await reject(() => apply(releaseArtifact.sql.replace(/COMMIT;\s*$/, 'SELECT 1/0;\nCOMMIT;'), 'postgres'), '22012');
        await baseline();
        pass('release artifact late failure restores rows, schema, ledger and both membership grantors');
      }
      phase = 'local commit of exact release artifact or proposal';
      const localSql = releaseArtifact?.sql ?? `BEGIN;\n${body}\n${runtimeAcl}\nCOMMIT;`;
      await apply(localSql, releaseArtifact ? 'postgres' : 'terraqo_staging_migrator');
      releaseApplied = Boolean(releaseArtifact);
      await boundary();
      if (releaseApplied) {
        assert.equal(await query(`SELECT count(*) FROM icc._prisma_migrations`), '51');
        assert.equal(await query(`SELECT checksum FROM icc._prisma_migrations WHERE migration_name='20261120000300_professional_document_lifecycle' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND applied_steps_count=1`), releaseArtifact.checksum);
      }
      assert.deepEqual(await snapshots(true), before);
      assert.equal(await query(`SELECT count(*) FROM icc."${attemptTable}"`), '0');
      assert.equal(await query(`SELECT count(*) FROM icc."${documentTable}" WHERE "lifecycleVersion"<>1
        OR "withdrawnAt" IS NOT NULL OR "withdrawnByUserId" IS NOT NULL OR "withdrawOperationKey" IS NOT NULL
        OR "replacesDocumentId" IS NOT NULL OR "replacementOperationKey" IS NOT NULL OR "replacementFingerprint" IS NOT NULL`), '0');
      phase = 'trigger and runtime authorization checks';
      const structuralGuards = async () => {
        const guards = JSON.parse(await query(`SELECT json_agg(json_build_object('name',p.proname,'definer',p.prosecdef,'config',p.proconfig,
          'owner',pg_get_userbyid(p.proowner)) ORDER BY p.proname) FROM pg_proc p
          WHERE p.pronamespace='icc'::regnamespace AND p.proname IN (${guardNames.map(lit).join(',')})`));
        assert.deepEqual(guards, guardNames.map(name => ({ name, definer: false,
          config: ['search_path=pg_catalog, icc'], owner: 'terraqo_staging_migrator' })));
        const triggers = JSON.parse(await query(`SELECT json_agg(json_build_object('name',t.tgname,'table',c.relname,
          'function',p.proname,'enabled',t.tgenabled,'type',t.tgtype) ORDER BY t.tgname)
          FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid
          WHERE c.relnamespace='icc'::regnamespace AND NOT t.tgisinternal AND p.proname IN (${guardNames.map(lit).join(',')})`));
        assert.deepEqual(triggers, [
          { name: 'DocumentReplacementAttempt_guard', table: attemptTable, function: guardNames[0], enabled: 'O', type: 31 },
          { name: 'ProfessionalDocument_lifecycle_guard', table: documentTable, function: guardNames[1], enabled: 'O', type: 31 },
        ]);
        for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) {
          assert.equal(await query(`SELECT has_table_privilege('terraqo_staging_runtime',${lit(`icc.${id(attemptTable)}`)},${lit(privilege)})`),
            ['SELECT', 'INSERT', 'UPDATE'].includes(privilege) ? 't' : 'f');
        }
        for (const name of guardNames) {
          for (const role of ['anon', 'authenticated', 'service_role', 'terraqo_staging_runtime']) {
            assert.equal(await query(`SELECT has_function_privilege(${lit(role)},${lit(`icc.${name}()`)},'EXECUTE')`),
              role === 'terraqo_staging_runtime' ? 't' : 'f');
          }
        }
        await boundary();
      };
      await structuralGuards();
      const runtime = sql => query(`SET SESSION AUTHORIZATION terraqo_staging_runtime; ${sql}`);
      await runtime(`SELECT "lifecycleVersion" FROM icc."${documentTable}" LIMIT 0;
        SELECT id FROM icc."${attemptTable}" LIMIT 0;
        BEGIN; INSERT INTO icc."${attemptTable}" SELECT * FROM icc."${attemptTable}" WHERE false;
        UPDATE icc."${attemptTable}" SET state=state WHERE false; ROLLBACK;`);
      for (const sql of [
        'SET ROLE terraqo_staging_migrator', 'CREATE TABLE icc.forbidden_s18_probe(id int)',
        `DELETE FROM icc."${attemptTable}" WHERE false`, `TRUNCATE icc."${attemptTable}"`,
        'UPDATE icc._prisma_migrations SET checksum=checksum WHERE false',
      ]) await reject(() => runtime(sql), '42501');
      await reject(() => query(`SET SESSION AUTHORIZATION anon; SELECT id FROM icc."${attemptTable}" LIMIT 0`), '42501');
      // Actual runtime INSERT must reach the SECURITY INVOKER guard and reject an invalid owner.
      await reject(() => runtime(`BEGIN; INSERT INTO icc."${attemptTable}"
        (id,"professionalProfileId","documentId","actorId","operationKey",fingerprint,"expectedVersion",
        "storageKey","fileName","contentType","contentSha256",size,"reservedUnits") VALUES
        ('s18-negative-probe','s18-missing-profile','s18-missing-document','s18-missing-actor','s18-operation-probe',
        repeat('a',64),1,'s18-negative-probe','probe.pdf','application/pdf',repeat('b',64),1,1); ROLLBACK;`), '23514');
      pass('two enabled invoker guards with fixed search_path; minimal new runtime ACL; anonymous access and runtime DDL/elevation/ledger writes denied');
      phase = 'offline Prisma structural parity';
      // Copy the schema to the owned directory: Prisma cannot discover repository .env/config there.
      // No credential in argv. Prisma gets only a freshly generated loopback URL via its allow-listed env.
      const schemaFile = path.join(directory, 'schema.prisma');
      await writeFile(schemaFile, schema, { flag: 'wx', mode: 0o600 });
      assert.match(schema.toString('utf8'), /url\s*=\s*env\("DATABASE_URL"\)/);
      assert.ok(!/\b(?:directUrl|shadowDatabaseUrl)\s*=/.test(schema.toString('utf8')));
      const parity = (await execute(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff',
        '--from-schema-datasource', schemaFile, '--to-schema-datamodel', schemaFile, '--script'],
      { cwd: directory, env: { ...env, DATABASE_URL: `postgresql://${env.PGUSER}:${env.PGPASSWORD}@127.0.0.1:${port}/postgres` },
        windowsHide: true, timeout: 120_000, maxBuffer: 32 * 1024 * 1024 })).stdout;
      const structuralParity = summarizeParity(parity);
      assert.equal(await fullTextCatalog(), fullTextBefore, 'SQL-only full-text artifacts changed');
      const acceptedParity = structuralParity.matches || structuralParity.knownFullTextOnly;
      if (structuralParity.matches) pass('full Prisma structural parity');
      else if (structuralParity.knownFullTextOnly) pass('only established B1/B5 SQL-only full-text differences; generated Spanish expression and ready GIN catalog preserved exactly');
      else console.log('FAIL full Prisma structural parity; continuing preservation/duplicate checks before reporting the blocker');
      pass('added document defaults/nulls preserved without inferred history');
      phase = 'duplicate rejection and independent readback';
      const migratedSchema = await schemaDigest();
      await reject(() => apply(localSql, releaseArtifact ? 'postgres' : 'terraqo_staging_migrator'), releaseArtifact ? 'P0001' : '42701');
      assert.equal(await schemaDigest(), migratedSchema);
      assert.deepEqual(await snapshots(true), before);
      assert.equal(await query(`SELECT count(*) FROM icc."${attemptTable}"`), '0');
      await structuralGuards();
      await boundary();
      pass(`duplicate rejected atomically; every prior row and complete migration record unchanged; ledger ${releaseApplied ? 51 : 50}`);
      return { passed: acceptedParity, scope: 'offline-disposable-rehearsal-only', productionOperatorReady: false,
        remoteWrites: false, remoteConnections: false, engine, sourceSha256: sha256(source),
        backupSha256: backup.manifest.sha256, backupBytes: backup.manifest.bytes,
        manifestSha256: backup.manifestSha256, prismaSchemaSha256: sha256(schema), localSqlSha256: sha256(localSql),
        ledgerBefore: 50, ledgerAfter: releaseApplied ? 51 : 50, unfinished: 0, priorMigrationRecordsUnchanged: true,
        releaseArtifactVerified: releaseApplied, releaseArtifactSha256: releaseArtifact?.artifactSha256 ?? null,
        originalProposalRollbackVerified: true, lateFailureRollbackVerified: true, duplicateRejected: true,
        structuralPrismaParity: structuralParity.matches, structuralParity, knownFullTextCatalogPreserved: true,
        fullTextCatalogSha256: fullTextBefore, existingRowsPreserved: true, tableSnapshots: before,
        runtimeAttemptPrivileges: ['SELECT', 'INSERT', 'UPDATE'], expectedMembership,
        limitations: ['Roles and minimal ACL reconstructed locally; backup omits hosted ACL/owners.',
          releaseApplied ? 'Exact release SQL verified locally including ledger and membership; not applied remotely.' : 'Proposal contains no runtime grants; the ACL overlay is local rehearsal policy, not a promoted migration.',
          'PG18 local only; hosted engine, live authorization, provider behavior and production readiness remain unverified.'] };
    });
    phase = 'immutable inputs and receipt publication';
    assert.equal(sha256(await readFile(proposalPath)), sha256(source), 'Proposal changed concurrently');
    assert.equal(sha256(await readFile(prismaPath)), sha256(schema), 'Prisma schema changed concurrently');
    const rechecked = await readBackup(backup.directory);
    assert.equal(rechecked.manifestSha256, backup.manifestSha256);
    assert.equal(rechecked.manifest.sha256, backup.manifest.sha256);
    pass('source/backup unchanged; owned local process stopped and temporary data/password/logs removed');
    const output = path.join(root, 'output');
    await mkdir(output, { recursive: true });
    assert.ok(!(await lstat(output)).isSymbolicLink());
    assert.equal(await realpath(output), path.join(await realpath(root), 'output'));
    const receiptDir = await mkdtemp(path.join(output, 's18-local-rehearsal-'));
    const receipt = path.join(receiptDir, 'receipt.json');
    await writeFile(receipt, JSON.stringify({ ...evidence, verifiedAt: new Date().toISOString(),
      ownedClusterStoppedAndRemoved: true, checks }, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ passed: evidence.passed, remoteWrites: false, ledger: evidence.ledgerAfter, productionOperatorReady: false, receipt }));
    if (!evidence.passed) {
      phase = 'offline Prisma structural parity (see sanitized receipt; no schema exception accepted)';
      throw new Error('Structural drift blocks rehearsal acceptance');
    }
    return receipt;
  } catch (error) {
    // Assertions, subprocess argv/stderr and PostgreSQL DETAIL can contain actual rows or passwords.
    // Emit only an allow-listed phase; never serialize the original error or the backup path.
    throw new Error(`S18 local rehearsal failed during ${phase}; no database payload logged`, { cause: error });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
