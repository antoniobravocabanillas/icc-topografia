import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rm, unlink, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { types } from 'pg';

// LOCAL restore verification only. No provider SDK, dotenv, migration, or caller-supplied endpoint.
const execute = promisify(execFile);
const bin = 'C:/Program Files/PostgreSQL/18/bin';
const privateRoot = path.resolve('C:/Users/Binv/.terraqo-private');
const sourceDirectory = path.join(privateRoot, 'platform51-oxB6Kq');
const prefix = 'restore-platform51-';
const confirmation = '--confirm=local-application-restore-only';
export const archivePin = '071a86f4fb37a846fb74467bfc933399fbdafff369882e13192ebb59b47646ef';
const catalogPin = 'a2b423c65960d4b153d575d47f153ffa992f51af1bb362849c8a8fcc99b29f4d';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const id = value => '"' + value.replaceAll('"', '""') + '"';
const ordered = values => [...values].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
const check = (value, category) => { if (!value) throw Object.assign(new Error(category), { category }); };

export function localPath(value) {
  check(typeof value === 'string' && value.trim() === value && /^[a-z]:[\\/]/i.test(value)
    && !/[\x00-\x1f\x7f]/.test(value) && !value.slice(2).includes(':')
    && !value.includes('://') && !value.split(/[\\/]/).some(p => p === '..' || /[. ]$/.test(p)), 'INVALID_LOCAL_PATH');
  return path.resolve(value);
}

export function parseArguments(args) {
  check(args.length === 2 && args[1] === confirmation, 'INVALID_ARGUMENTS');
  const directory = localPath(args[0]);
  check(directory === sourceDirectory, 'UNAUTHORIZED_BACKUP_PATH');
  return directory;
}

// Check every existing ancestor, not just the leaf: junctions must not redirect reads or deletion.
export async function verifiedPath(target) {
  const absolute = localPath(target);
  let cursor = path.parse(absolute).root;
  for (const component of absolute.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, component);
    check(!(await lstat(cursor)).isSymbolicLink(), 'REPARSE_PATH_REJECTED');
    check((await realpath(cursor)).toLowerCase() === cursor.toLowerCase(), 'RESOLVED_PATH_MISMATCH');
  }
  return absolute;
}

export function verifyBundle(manifestBytes, catalogBytes, archive, now = Date.now()) {
  const manifest = JSON.parse(manifestBytes), captured = JSON.parse(catalogBytes);
  check(manifest.sha256 === sha256(archive) && manifest.bytes === archive.length, 'ARCHIVE_HASH_MISMATCH');
  check(manifest.sha256 === archivePin, 'UNAPPROVED_ARCHIVE');
  check(manifest.catalogSha256 === sha256(catalogBytes) && manifest.catalogSha256 === catalogPin, 'CATALOG_HASH_MISMATCH');
  check(manifest.siteId === '2d38524a-44f9-4473-8a1f-9270e03bc2bf'
    && manifest.sourceCommit === '285b20ad45f79e80e0410967f399f561f0a64781'
    && manifest.databaseVersion === '17.2' && captured.identity.version === '17.2'
    && manifest.readOnly === true && manifest.snapshotBound === true && manifest.fullDatabase === true
    && manifest.ownerAclRetained === true && manifest.applied === 44 && manifest.historical === 45,
  'BACKUP_CONTRACT_MISMATCH');
  const age = now - Date.parse(manifest.capturedAt);
  check(Number.isFinite(age) && age >= -300_000 && age <= 6 * 3600_000, 'STALE_BACKUP');
  check(captured.ledger.length === 45 && captured.ledger.filter(r => r.finished_at && !r.rolled_back_at).length === 44
    && !captured.ledger.some(r => !r.finished_at && !r.rolled_back_at), 'LEDGER_BASELINE_MISMATCH');
  return { manifest, captured, archive, manifestSha256: sha256(manifestBytes) };
}

export async function readBackup(directory) {
  await verifiedPath(directory);
  const buffers = [];
  for (const name of ['manifest.json', 'catalog.json', 'database.dump']) {
    const file = path.join(directory, name);
    await verifiedPath(file);
    const stat = await lstat(file);
    check(stat.isFile(), 'BACKUP_NOT_REGULAR_FILE');
    const age = Date.now() - stat.mtimeMs;
    check(age >= -300_000 && age <= 6 * 3600_000, 'STALE_BACKUP_FILE');
    buffers.push(await readFile(file));
  }
  return verifyBundle(...buffers);
}

export function childEnvironment(work, source = process.env) {
  // No inherited PATH, PG*, HOME, NODE_OPTIONS, provider secrets, proxy, or dotenv discovery.
  const systemRoot = localPath(source.SystemRoot || source.SYSTEMROOT || 'C:/Windows');
  return { SystemRoot: systemRoot, WINDIR: systemRoot, PATH: `${bin};${systemRoot}/System32`,
    TEMP: work, TMP: work, HOME: work, USERPROFILE: work, APPDATA: work,
    PGCLIENTENCODING: 'UTF8', PGCONNECT_TIMEOUT: '3', PGSSLMODE: 'disable',
    PGSERVICEFILE: path.join(work, 'absent-services'), PGPASSFILE: path.join(work, 'absent-passfile') };
}

const queries = {
  roles: 'SELECT oid,rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit,rolvaliduntil,rolconfig FROM pg_roles',
  memberships: 'SELECT * FROM pg_auth_members',
  schemas: "SELECT oid,nspname,nspowner,nspacl::text FROM pg_namespace WHERE nspname='icc'",
  relations: "SELECT c.oid,n.nspname,c.relname,c.relkind,c.relowner,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='icc'",
  columnAcl: "SELECT a.attrelid,a.attnum,a.attname,a.attacl::text FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='icc' AND a.attacl IS NOT NULL",
  functions: "SELECT p.oid,n.nspname,p.proname,p.proowner,p.proacl::text,p.prosecdef,p.proconfig,pg_get_function_identity_arguments(p.oid) AS arguments FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='icc'",
  types: "SELECT t.oid,n.nspname,t.typname,t.typowner,t.typacl::text FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='icc'",
  defaults: "SELECT d.oid,defaclrole,defaclnamespace,defaclobjtype,defaclacl::text FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE n.nspname='icc'",
  policies: "SELECT * FROM pg_policies WHERE schemaname='icc'",
  triggers: "SELECT t.oid,t.tgrelid,t.tgname,t.tgenabled,t.tgisinternal,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='icc'",
};

const aclItems = value => value === null ? null : types.getTypeParser(1009)(value).sort();
const aclRole = value => value.startsWith('"') ? value.slice(1, -1).replaceAll('""', '"') : value;
export function requiredRoles(catalog) {
  const byOid = new Map(catalog.roles.map(r => [r.oid, r.rolname]));
  const names = new Set();
  for (const rows of [catalog.schemas, catalog.relations, catalog.functions, catalog.types]) {
    for (const row of rows.filter(r => r.nspname === 'icc')) {
      for (const key of ['nspowner', 'relowner', 'proowner', 'typowner']) if (key in row) names.add(byOid.get(row[key]));
      for (const key of ['nspacl', 'relacl', 'proacl', 'typacl']) if (row[key]) {
        for (const entry of aclItems(row[key])) {
          const match = /^("(?:[^"]|"")*"|[^=]*)=[A-Za-z*]*\/("(?:[^"]|"")*"|[^/]+)$/.exec(entry);
          check(match, 'UNSUPPORTED_ACL');
          if (match[1]) names.add(aclRole(match[1]));
          names.add(aclRole(match[2]));
        }
      }
    }
  }
  // Capture the runtime actor as well as owners even when it uses pg_read/write_all_data.
  for (const r of catalog.roles) if (!r.rolname.startsWith('pg_') && r.rolname !== 'postgres') names.add(r.rolname);
  let size;
  do {
    size = names.size;
    for (const m of catalog.memberships) if (names.has(byOid.get(m.member))) {
      names.add(byOid.get(m.roleid)); names.add(byOid.get(m.grantor));
    }
  } while (size !== names.size);
  check([...names].every(name => typeof name === 'string'), 'UNRESOLVED_ROLE_OID');
  return [...names].sort();
}

export function normalizeCatalog(catalog) {
  const roles = new Map(catalog.roles.map(r => [r.oid, r.rolname]));
  const schemas = new Map(catalog.schemas.map(r => [r.oid, r.nspname]));
  const relations = new Map(catalog.relations.map(r => [r.oid, `${r.nspname}.${r.relname}`]));
  const resolve = (map, value) => { check(map.has(value), 'UNRESOLVED_CATALOG_OID'); return map.get(value); };
  const output = {};
  for (const key of ['schemas', 'relations', 'columnAcl', 'functions', 'types', 'defaults', 'policies', 'triggers']) {
    const rows = catalog[key].filter(r => r.nspname ? r.nspname === 'icc'
      : r.schemaname ? r.schemaname === 'icc'
        : key === 'defaults' ? schemas.get(r.defaclnamespace) === 'icc' : true);
    output[key] = ordered(rows.map(original => {
      const row = { ...original }; delete row.oid;
      for (const field of ['nspowner', 'relowner', 'proowner', 'typowner', 'defaclrole'])
        if (field in row) row[field] = resolve(roles, row[field]);
      for (const field of ['attrelid', 'tgrelid']) if (field in row) row[field] = resolve(relations, row[field]);
      if ('defaclnamespace' in row) row.defaclnamespace = resolve(schemas, row.defaclnamespace);
      for (const field of ['nspacl', 'relacl', 'attacl', 'proacl', 'typacl', 'defaclacl'])
        if (field in row) row[field] = aclItems(row[field]);
      // PostgreSQL generates FK trigger names from fresh OIDs; keep all other trigger semantics exact.
      if (row.tgisinternal && /^RI_ConstraintTrigger_[ac]_\d+$/.test(row.tgname)) {
        const name = row.tgname.replace(/\d+$/, '<oid>');
        row.definition = row.definition.replace(`TRIGGER ${id(row.tgname)} `, `TRIGGER ${id(name)} `);
        row.tgname = name;
      }
      return row;
    }));
  }
  return output;
}

export function normalizeLedger(rows) {
  return ordered(rows.map(source => {
    const row = { ...source };
    // The source pg driver serialized timestamptz as JS Date (millisecond precision).
    for (const key of ['started_at', 'finished_at', 'rolled_back_at']) if (row[key] !== null) row[key] = new Date(row[key]).toISOString();
    return row;
  }));
}

export function selectApplicationToc(toc) {
  const entries = toc.split(/\r?\n/).filter(line => line && !line.startsWith(';'));
  const allowed = /^(?:\d+); \d+ \d+ (?:(?:SCHEMA|ACL|COMMENT) - SCHEMA icc\b|SCHEMA - icc\b|(?:TABLE DATA|TABLE|SEQUENCE SET|SEQUENCE OWNED BY|SEQUENCE|TYPE|FUNCTION|PROCEDURE|AGGREGATE|VIEW|MATERIALIZED VIEW DATA|MATERIALIZED VIEW|INDEX|CONSTRAINT|FK CONSTRAINT|TRIGGER|RULE|POLICY|ROW SECURITY|DEFAULT|DEFAULT ACL|ACL|COMMENT|STATISTICS|CHECK CONSTRAINT|DOMAIN|DOMAIN CONSTRAINT) icc )/;
  check(entries.length > 0 && entries.every(line => allowed.test(line)), 'UNEXPECTED_TOC_SELECTION');
  check(entries.some(line => / SCHEMA - icc /.test(line)) && entries.some(line => / TABLE DATA icc _prisma_migrations /.test(line)), 'INCOMPLETE_TOC_SELECTION');
  return entries.join('\n') + '\n';
}

export function errorCategory(error) {
  if (typeof error.category === 'string' && /^[A-Z_]+$/.test(error.category)) return error.category;
  const diagnostic = String(error.stderr ?? '');
  if (/extension .* is not available|could not (?:open|access) (?:extension control file|file).*prisma_postgres/i.test(diagnostic)) return 'PROVIDER_EXTENSION_UNAVAILABLE';
  if (/schema "ppg" does not exist|function ppg\.|prisma_postgres/i.test(diagnostic)) return 'PROVIDER_DEPENDENCY_UNSUPPORTED';
  if (/permission denied|must be (?:owner|superuser)/i.test(diagnostic)) return 'RESTORE_PERMISSION_DENIED';
  if (/does not exist/i.test(diagnostic)) return 'RESTORE_MISSING_DEPENDENCY';
  const sqlstate = /ERROR:\s+([A-Z0-9]{5})\s*(?:\r?\n|$)/.exec(diagnostic);
  if (sqlstate) return `POSTGRES_SQLSTATE_${sqlstate[1]}`;
  if (error.code === 'ERR_ASSERTION') return 'VERIFICATION_MISMATCH';
  return 'LOCAL_VERIFICATION_FAILED';
}

export async function verifyOwnedTree(work, receiptDirectory) {
  check(path.dirname(receiptDirectory) === privateRoot && path.basename(receiptDirectory).startsWith(prefix)
    && work === path.join(receiptDirectory, 'work'), 'UNOWNED_CLEANUP_PATH');
  await verifiedPath(work);
  const walk = async directory => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      check(!entry.isSymbolicLink() && !(await lstat(target)).isSymbolicLink(), 'CLEANUP_REPARSE_POINT');
      check((await realpath(target)).toLowerCase() === target.toLowerCase(), 'CLEANUP_PATH_ESCAPE');
      if (entry.isDirectory()) await walk(target);
    }
  };
  await walk(work);
}

export async function main(args = process.argv.slice(2)) {
  let phase = 'input-preflight', receiptDirectory, work, child, childExited, log, startupError, run, query;
  const receipt = { passed: false, scope: 'partial-icc-schema-only', productionReady: false,
    remoteConnections: false, remoteWrites: false, migrationsApplied: false,
    sourceVersion: '17.2', localMajor: 18, archiveSha256: archivePin,
    ownedClusterStopped: false, ownedDataRemoved: false,
    limitations: ['Only icc selected; provider extensions, ppg/public objects and database ACL/settings are not restored.',
      'PG17.2 source restored on PG18; same-version and hosted/provider behavior remain unverified.',
      'Source roles become NOLOGIN without passwords. PG18 bootstrap postgres retains required superuser status; application roles have no elevated attributes. Relevant memberships retained.',
      'Full ledger matches captured fields; source pg Date timestamps have millisecond precision.',
      'Catalog captures ownership/ACL/RLS, function security metadata and trigger definitions, not full column/constraint/function-body definitions.',
      'Row hashes are local restored baseline only; no source row hashes were captured by the backup.'] };
  let backup, failure;
  const ps = async command => (await execute('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', command],
    { env: childEnvironment(work || privateRoot), windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024 })).stdout.trim();
  try {
    check(process.platform === 'win32', 'WINDOWS_ONLY');
    const directory = parseArguments(args);
    backup = await readBackup(directory); // All input/path/hash checks precede initdb or server startup.
    const expected = normalizeCatalog(backup.captured.catalog);
    const roleNames = requiredRoles(backup.captured.catalog);
    check(backup.captured.catalog.defaults.every(d => d.defaclnamespace !== 0), 'GLOBAL_DEFAULT_ACL_UNSUPPORTED');
    await verifiedPath(privateRoot);
    receiptDirectory = await mkdtemp(path.join(privateRoot, prefix));
    phase = 'private-directory-acl';
    const sid = await ps('[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value');
    check(/^S-1-5-21-(?:\d+-){2}\d+-\d+$/.test(sid), 'INVALID_LOCAL_SID');
    await execute('C:/Windows/System32/icacls.exe', [receiptDirectory, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F'],
      { env: childEnvironment(privateRoot), windowsHide: true, timeout: 30_000 });
    const acl = JSON.parse(await ps(`$a=Get-Acl -LiteralPath '${receiptDirectory.replaceAll("'", "''")}'; @{protected=$a.AreAccessRulesProtected;rules=@($a.Access | ForEach-Object { @{sid=$_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value;type=$_.AccessControlType.ToString();rights=[int]$_.FileSystemRights} })} | ConvertTo-Json -Depth 4 -Compress`));
    check(acl.protected && acl.rules.length === 2 && acl.rules.every(r => [sid, 'S-1-5-18'].includes(r.sid)
      && r.type === 'Allow' && r.rights === 2032127), 'PRIVATE_ACL_NOT_RESTRICTIVE');
    receipt.privateAclVerified = true;
    work = path.join(receiptDirectory, 'work'); await mkdir(work);
    const data = path.join(work, 'data'), env = childEnvironment(work);
    run = async (name, argv) => {
      const result = await execute(path.join(bin, `${name}.exe`), argv,
        { cwd: work, env, windowsHide: true, timeout: 120_000, maxBuffer: 32 * 1024 * 1024 });
      check(!result.stderr.trim(), 'UNEXPECTED_TOOL_DIAGNOSTIC');
      return result.stdout;
    };
    phase = 'archive-selection-before-start';
    check(/^pg_restore \(PostgreSQL\) 18\./.test(await run('pg_restore', ['--version'])), 'WRONG_LOCAL_ENGINE');
    const dump = path.join(work, 'verified.dump');
    await writeFile(dump, backup.archive, { flag: 'wx', mode: 0o600 });
    check(sha256(await readFile(dump)) === archivePin, 'COPIED_ARCHIVE_HASH_MISMATCH');
    // pg_restore --schema=icc omits the SCHEMA entry itself. Build the explicit
    // list from the full TOC so CREATE SCHEMA and its original owner/ACL survive.
    const fullToc = await run('pg_restore', ['--list', dump]);
    const selection = selectApplicationToc(fullToc.split(/\r?\n/)
      .filter(line => /^\d+; \d+ \d+ (?:[A-Z ]+ icc |(?:SCHEMA|ACL|COMMENT) - (?:SCHEMA )?icc )/.test(line)).join('\n'));
    const selectionFile = path.join(work, 'icc.list');
    await writeFile(selectionFile, selection, { flag: 'wx' });
    receipt.selectionSha256 = sha256(selection); receipt.selectedEntries = selection.trim().split('\n').length;
    const probe = net.createServer();
    await new Promise((resolve, reject) => probe.once('error', reject).listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise((resolve, reject) => probe.close(e => e ? reject(e) : resolve()));
    Object.assign(env, { PGHOST: '127.0.0.1', PGPORT: String(port), PGDATABASE: 'postgres',
      PGUSER: `restore_${randomBytes(8).toString('hex')}`, PGPASSWORD: randomBytes(32).toString('hex'),
      PGOPTIONS: '-c timezone=UTC -c datestyle=ISO,YMD -c statement_timeout=60000' });
    const passwordFile = path.join(work, 'password');
    await writeFile(passwordFile, env.PGPASSWORD, { flag: 'wx', mode: 0o600 });
    phase = 'owned-cluster-start';
    await run('initdb', ['-D', data, '-U', 'postgres', '-A', 'scram-sha-256', '--pwfile', passwordFile, '--encoding=UTF8', '--locale=C']);
    await unlink(passwordFile);
    // TCP only, exact loopback address, SCRAM only. No source roles can authenticate.
    await writeFile(path.join(data, 'pg_hba.conf'), 'host all all 127.0.0.1/32 scram-sha-256\n');
    log = await open(path.join(work, 'postgres.log'), 'wx', 0o600);
    // Source membership grantor postgres must be the bootstrap role. In single-user
    // mode (no listener), erase its password/LOGIN and create our fresh local admin.
    // Secrets travel on stdin, never argv, receipts or stdout. PG18 requires the
    // bootstrap role to remain superuser; it cannot log in or retain a password.
    child = spawn(path.join(bin, 'postgres.exe'), ['--single', '-D', data, 'postgres'],
      { cwd: work, env, windowsHide: true, stdio: ['pipe', log.fd, log.fd] });
    childExited = new Promise(resolve => { child.once('exit', resolve); child.once('error', error => { startupError = error; resolve(); }); });
    child.stdin.on('error', () => {});
    child.stdin.end(`BEGIN; CREATE ROLE ${id(env.PGUSER)} LOGIN SUPERUSER PASSWORD '${env.PGPASSWORD}'; ALTER ROLE postgres NOLOGIN PASSWORD NULL; COMMIT;\n`);
    let singleTimer;
    try {
      await Promise.race([childExited, new Promise((_, reject) => { singleTimer = setTimeout(() => reject(new Error('SINGLE_USER_TIMEOUT')), 30_000); })]);
    } finally { clearTimeout(singleTimer); }
    check(!startupError && child.exitCode === 0, 'SINGLE_USER_BOOTSTRAP_FAILED');
    child = spawn(path.join(bin, 'postgres.exe'), ['-D', data, '-h', '127.0.0.1', '-p', String(port),
      '-c', 'unix_socket_directories=', '-c', 'log_statement=none', '-c', 'log_min_error_statement=panic',
      '-c', 'log_error_verbosity=terse', '-c', 'shared_preload_libraries=', '-c', 'max_connections=10'],
    { cwd: work, env, windowsHide: true, stdio: ['ignore', log.fd, log.fd] });
    childExited = new Promise(resolve => { child.once('exit', resolve); child.once('error', error => { startupError = error; resolve(); }); });
    const psql = ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', '-At'];
    query = async sql => (await run('psql', [...psql, '-c', sql])).trim();
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (startupError) throw startupError;
      check(child.exitCode === null && child.signalCode === null, 'OWNED_SERVER_EXITED');
      try { await query('SELECT 1'); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 200)); }
    }
    check(ready, 'OWNED_SERVER_UNAVAILABLE');
    const identity = JSON.parse(await query(`SELECT json_build_object('host',host(inet_server_addr()),'port',inet_server_port(),
      'data',current_setting('data_directory'),'listeners',current_setting('listen_addresses'),'major',current_setting('server_version_num')::int/10000,
      'actor',current_user,'database',current_database())`));
    assert.deepEqual(identity, { host: '127.0.0.1', port, data: data.replaceAll('\\', '/'), listeners: '127.0.0.1', major: 18, actor: env.PGUSER, database: 'postgres' });
    check(Number((await readFile(path.join(data, 'postmaster.pid'), 'utf8')).split('\n')[0]) === child.pid, 'OWNED_PID_MISMATCH');
    receipt.localVersion = await query('SHOW server_version'); receipt.loopbackIdentityVerified = true;
    const jsonQuery = async sql => JSON.parse(await query(`SELECT coalesce(json_agg(q),'[]') FROM (${sql}) q`));
    phase = 'local-role-reconstruction';
    const sourceRoles = backup.captured.catalog.roles;
    for (const name of roleNames.filter(name => !name.startsWith('pg_') && name !== 'postgres')) {
      const sourceRole = sourceRoles.find(r => r.rolname === name);
      check(sourceRole, 'UNKNOWN_SOURCE_ROLE');
      await query(`CREATE ROLE ${id(name)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS ${sourceRole.rolinherit ? 'INHERIT' : 'NOINHERIT'} PASSWORD NULL`);
      for (const config of sourceRole.rolconfig ?? []) {
        const setting = /^(idle_session_timeout|idle_in_transaction_session_timeout|statement_timeout|lock_timeout)=(\d+(?:ms|s|min|h|d)?)$/.exec(config);
        check(setting, 'ROLE_CONFIG_UNSUPPORTED');
        await query(`ALTER ROLE ${id(name)} SET ${setting[1]} TO '${setting[2]}'`);
      }
    }
    const rolesByOid = new Map(sourceRoles.map(r => [r.oid, r.rolname]));
    const memberships = backup.captured.catalog.memberships.filter(m => roleNames.includes(rolesByOid.get(m.member)));
    phase = 'local-membership-reconstruction';
    // PostgreSQL records superuser membership grants as the bootstrap role. Preserve
    // its source name without adding synthetic ADMIN OPTION membership edges.
    check(memberships.every(m => rolesByOid.get(m.grantor) === 'postgres'), 'MEMBERSHIP_GRANTOR_UNSUPPORTED');
    if (memberships.length) await query(`BEGIN;
      ${memberships.map(m => `GRANT ${id(rolesByOid.get(m.roleid))} TO ${id(rolesByOid.get(m.member))} WITH ADMIN ${m.admin_option}, INHERIT ${m.inherit_option}, SET ${m.set_option};`).join('\n')}
      COMMIT;`);
    receipt.roleAttributeParity = false;
    phase = 'application-schema-restore';
    await run('pg_restore', ['--exit-on-error', '--single-transaction', '--use-list', selectionFile, '--dbname=postgres', dump]);
    phase = 'full-ledger-and-catalog';
    const ledger = await jsonQuery('SELECT * FROM icc._prisma_migrations');
    assert.deepEqual(normalizeLedger(ledger), normalizeLedger(backup.captured.ledger));
    receipt.ledger = { active: ledger.filter(r => r.finished_at && !r.rolled_back_at).length, historical: ledger.length,
      allCapturedFieldsEqual: true, sha256: sha256(JSON.stringify(normalizeLedger(ledger))) };
    const localCatalog = {};
    for (const [key, sql] of Object.entries(queries)) localCatalog[key] = await jsonQuery(sql);
    const actual = normalizeCatalog(localCatalog);
    receipt.catalog = {};
    for (const key of Object.keys(expected)) {
      check(JSON.stringify(actual[key]) === JSON.stringify(expected[key]), `CATALOG_${key.toUpperCase()}_MISMATCH`);
      receipt.catalog[key] = { count: actual[key].length, sha256: sha256(JSON.stringify(actual[key])), equal: true };
    }
    const localRoles = new Map(localCatalog.roles.map(r => [r.oid, r.rolname]));
    const membershipView = (rows, roles) => ordered(rows.map(m => ({ role: roles.get(m.roleid), member: roles.get(m.member), grantor: roles.get(m.grantor), admin: m.admin_option, inherit: m.inherit_option, set: m.set_option })));
    const selectedMemberships = localCatalog.memberships.filter(m => memberships.some(s => rolesByOid.get(s.member) === localRoles.get(m.member)));
    assert.deepEqual(membershipView(selectedMemberships, localRoles), membershipView(memberships, rolesByOid));
    for (const r of localCatalog.roles.filter(r => roleNames.includes(r.rolname) && !r.rolname.startsWith('pg_'))) {
      check(!r.rolcanlogin && (r.rolname === 'postgres' || (!r.rolsuper && !r.rolcreatedb && !r.rolcreaterole && !r.rolreplication && !r.rolbypassrls)), 'UNSAFE_LOCAL_SOURCE_ROLE');
      assert.deepEqual(r.rolconfig, sourceRoles.find(s => s.rolname === r.rolname).rolconfig);
    }
    check(await query(`SELECT count(*) FROM pg_authid WHERE rolname<>current_user AND rolpassword IS NOT NULL`) === '0', 'SOURCE_ROLE_PASSWORD_RETAINED');
    receipt.membershipsEqualForApplicationActors = true;
    receipt.localRoles = roleNames;
    receipt.providerExtensionsInstalled = await jsonQuery("SELECT extname,extversion FROM pg_extension ORDER BY extname");
    check(!receipt.providerExtensionsInstalled.some(e => e.extname === 'prisma_postgres'), 'UNEXPECTED_PROVIDER_EXTENSION');
    phase = 'canonical-row-snapshots';
    receipt.tableSnapshots = {};
    const digestQuery = sql => new Promise((resolve, reject) => {
      const digest = createHash('sha256'); let count = 0;
      const reader = spawn(path.join(bin, 'psql.exe'), [...psql, '-c', sql], { cwd: work, env, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
      const timer = setTimeout(() => { reader.kill(); }, 120_000);
      reader.stdout.on('data', chunk => { digest.update(chunk); for (const byte of chunk) if (byte === 10) count++; });
      reader.once('error', error => { clearTimeout(timer); reject(error); });
      reader.once('close', code => { clearTimeout(timer); if (code !== 0) reject(new Error('SNAPSHOT_FAILED')); else resolve({ count, sha256: digest.digest('hex') }); });
    });
    for (const table of actual.relations.filter(r => r.relkind === 'r').map(r => r.relname).sort()) {
      // JSONB text escapes embedded newlines; C collation fixes ordering. Duplicate rows remain duplicated.
      receipt.tableSnapshots[table] = await digestQuery(`COPY (SELECT payload FROM (SELECT to_jsonb(r)::text AS payload FROM icc.${id(table)} r) s ORDER BY payload COLLATE "C") TO STDOUT`);
    }
    receipt.snapshotFormat = 'sha256 of psql COPY text bytes: sorted to_jsonb(row)::text COLLATE C; LF row delimiter; COPY escaping; UTC; includes duplicates';
    receipt.sequences = await jsonQuery("SELECT schemaname,sequencename,sequenceowner,data_type,start_value,min_value,max_value,increment_by,cycle,cache_size,last_value FROM pg_sequences WHERE schemaname='icc'");
    phase = 'immutable-input-recheck';
    const after = await readBackup(directory);
    check(after.manifestSha256 === backup.manifestSha256, 'INPUT_CHANGED_DURING_RESTORE');
    receipt.catalogSha256 = catalogPin; receipt.manifestSha256 = backup.manifestSha256;
    receipt.passed = true;
  } catch (error) {
    failure = error; receipt.failedPhase = phase; receipt.errorCategory = errorCategory(error);
  } finally {
    if (work) {
      try {
        await verifyOwnedTree(work, receiptDirectory);
        const data = path.join(work, 'data');
        if (child?.pid && child.exitCode === null && child.signalCode === null) {
          const pid = await readFile(path.join(data, 'postmaster.pid'), 'utf8').catch(e => { if (e.code !== 'ENOENT') throw e; return null; });
          if (pid !== null) {
            const lines = pid.split('\n');
            check(Number(lines[0]) === child.pid && path.resolve(lines[1]) === data, 'UNOWNED_SERVER_STOP_REJECTED');
            const processIdentity = JSON.parse(await ps(`Get-CimInstance Win32_Process -Filter 'ProcessId = ${child.pid}' | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress`));
            check(processIdentity.ProcessId === child.pid && path.resolve(processIdentity.ExecutablePath) === path.resolve(bin, 'postgres.exe')
              && processIdentity.CommandLine.includes(data), 'UNOWNED_PROCESS_STOP_REJECTED');
            await run('pg_ctl', ['-D', data, '-m', 'fast', '-w', '-t', '30', 'stop']);
          } else child.kill(); // Only the tracked child, never a port/name lookup.
          let timer;
          try { await Promise.race([childExited, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('STOP_TIMEOUT')), 30_000); })]); }
          finally { clearTimeout(timer); }
        }
        check(!child?.pid || child.exitCode !== null || child.signalCode !== null, 'SERVER_EXIT_UNCONFIRMED');
        await assert.rejects(lstat(path.join(data, 'postmaster.pid')), { code: 'ENOENT' });
        receipt.ownedClusterStopped = true;
        await log?.close();
        await verifyOwnedTree(work, receiptDirectory);
        await rm(work, { recursive: true, force: false, maxRetries: 5, retryDelay: 200 });
        await assert.rejects(lstat(work), { code: 'ENOENT' });
        receipt.ownedDataRemoved = true;
      } catch (error) {
        receipt.passed = false; receipt.cleanupErrorCategory = errorCategory(error); failure ||= error;
      }
    }
    if (receiptDirectory) {
      await verifiedPath(receiptDirectory);
      await writeFile(path.join(receiptDirectory, 'receipt.json'), JSON.stringify({ ...receipt, verifiedAt: new Date().toISOString() }, null, 2), { flag: 'wx', mode: 0o600 });
    }
  }
  // Never serialize subprocess errors, SQL, assertion diffs, stderr, rows, or passwords.
  const result = { passed: receipt.passed, phase: receipt.failedPhase ?? 'complete', errorCategory: receipt.errorCategory,
    cleanupErrorCategory: receipt.cleanupErrorCategory, ownedClusterStopped: receipt.ownedClusterStopped,
    ownedDataRemoved: receipt.ownedDataRemoved, productionReady: false,
    receipt: receiptDirectory ? path.join(receiptDirectory, 'receipt.json') : null };
  console.log(JSON.stringify(result));
  if (failure) process.exitCode = 1;
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('LOCAL_RESTORE_RECEIPT_OR_CLEANUP_FAILED'); process.exitCode = 1; });
}
