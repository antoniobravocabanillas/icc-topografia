import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { access, lstat, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

// Bootstrap pattern reused from test-s17-provenance-local.mjs; that script auto-runs
// and cannot be imported as a library. Do not edit or execute the parent's suite here.
// No .env loading, application imports, client generation, migrations or external URL input.
const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselineRef = 'f0b34c58c54bd92a9af09d66dc9e199cf43354af';
const prefix = 'terraqo-s17-races-';
const sha = value => createHash('sha256').update(value).digest('hex');
let phase = 'arguments';
let checks = 0;
const pass = label => { checks++; console.log(`PASS ${label}`); };
const ident = value => { assert.match(value, /^[A-Za-z_][A-Za-z0-9_]*$/); return `"${value}"`; };

async function main() {
  const args = process.argv.slice(2);
  assert.ok(args.includes('--confirm=local-s17-races-only'), 'Explicit disposable-loopback confirmation required');
  assert.ok(args.every(a => a === '--confirm=local-s17-races-only' || a.startsWith('--dependencies=') || a.startsWith('--pg-bin=')));
  const option = key => args.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3);
  const dependencies = path.resolve(option('dependencies') || path.join(root, '../icc-topografia-s22-evaluator'));
  const require = createRequire(path.join(dependencies, 'package.json'));
  const { Client } = require('pg');
  const pgVersion = require('pg/package.json').version;
  const prismaVersion = require('prisma/package.json').version;
  assert.equal(prismaVersion, '6.19.3', 'Review baseline CLI flags before changing installed version');
  const bin = path.resolve(option('pg-bin') || 'C:/Program Files/PostgreSQL/18/bin');
  // Child processes receive OS essentials only; PG*, app secrets and provider flags are discarded.
  const env = { NODE_ENV: 'test', PGCLIENTENCODING: 'UTF8', CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1' };
  for (const [key, value] of Object.entries(process.env)) {
    if (/^(path|systemroot|windir|temp|tmp|home|userprofile|appdata|localappdata|comspec|pathext|programfiles.*|programdata)$/i.test(key)) env[key] = value;
  }
  // pg also reads process.env. Clear inherited PG options before constructing any client.
  for (const key of Object.keys(process.env)) if (/^PG/i.test(key)) delete process.env[key];
  phase = 'read baseline and draft';
  const baseline = (await exec('git', ['show', `${baselineRef}:prisma/schema.prisma`], { cwd: root, env, encoding: 'utf8' })).stdout;
  assert.ok(!baseline.includes('acceptedProposalId'));
  const proposalPath = path.join(root, 'docs/work-documented/proposals/s17-accepted-proposal-provenance.proposed.sql');
  const proposal = await readFile(proposalPath, 'utf8');
  const sql = proposal.replace(/^--.*$/gm, '').trim();
  assert.ok(sql.startsWith('BEGIN;') && sql.endsWith('ROLLBACK;'));
  const ddl = sql.slice('BEGIN;'.length, -'ROLLBACK;'.length);
  assert.ok(!/\b(COMMIT|ROLLBACK|START\s+TRANSACTION|PREPARE\s+TRANSACTION)\b/i.test(ddl));
  console.log(`INPUT baseline=${baselineRef} schema_sha256=${sha(baseline)} proposal_sha256=${sha(proposal)} pg=${pgVersion} prisma=${prismaVersion}`);

  const tempRoot = await realpath(os.tmpdir());
  const local = await mkdtemp(path.join(tempRoot, prefix));
  const data = path.join(local, 'pg');
  const secret = randomBytes(32).toString('hex');
  const database = 's17_races_test';
  let started = false;
  let client;
  const sessions = new Set();
  const pg = (name, argv) => exec(path.join(bin, name), argv, {
    cwd: local, env: { ...env, PGPASSWORD: secret }, encoding: 'utf8', windowsHide: true, timeout: 60_000, maxBuffer: 8 * 1024 * 1024,
  });
  try {
    phase = 'offline baseline DDL';
    const schemaFile = path.join(local, 'baseline.prisma');
    await writeFile(schemaFile, baseline, 'utf8');
    // Run outside all checkouts to prevent Prisma auto-loading repository config or .env files.
    const baselineDDL = (await exec(process.execPath, [path.join(dependencies, 'node_modules/prisma/build/index.js'),
      'migrate', 'diff', '--from-empty', '--to-schema-datamodel', schemaFile, '--script'], {
      cwd: local, env, encoding: 'utf8', windowsHide: true, timeout: 60_000, maxBuffer: 8 * 1024 * 1024,
    })).stdout;
    assert.ok(baselineDDL.includes('CREATE TABLE "icc"."TerraqoClosureRevision"'));
    assert.ok(!baselineDDL.includes('acceptedProposalId'));
    const probe = createServer();
    await new Promise((resolve, reject) => probe.on('error', reject).listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
    phase = 'initialize fresh UTF8 cluster';
    const pw = path.join(local, 'pw');
    await writeFile(pw, secret, { encoding: 'utf8', mode: 0o600 });
    await pg('initdb', ['-D', data, '-U', database, '-A', 'scram-sha-256', '--pwfile', pw, '--encoding=UTF8', '--no-sync']);
    await rm(pw);
    const boot = spawnSync(path.join(bin, 'pg_ctl'), ['-D', data, '-l', path.join(local, 'pg.log'),
      '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start'], {
      cwd: local, env, stdio: 'ignore', windowsHide: true, timeout: 60_000,
    });
    started = boot.status === 0 || await access(path.join(data, 'postmaster.pid')).then(() => true, () => false);
    if (boot.status !== 0) console.error((await readFile(path.join(local, 'pg.log'), 'utf8').catch(() => 'No server log')).replaceAll(secret, '[redacted]'));
    assert.equal(boot.status, 0, 'Disposable server startup failed');
    await pg('createdb', ['-h', '127.0.0.1', '-p', String(port), '-U', database, database]);
    const config = { host: '127.0.0.1', port, user: database, database, password: secret, ssl: false,
      client_encoding: 'UTF8', connectionTimeoutMillis: 5000, statement_timeout: 15000,
      lock_timeout: 8000, application_name: 's17-disposable-races', options: '-c client_encoding=UTF8' };
    const connect = async () => {
      const c = new Client(config);
      try {
        await c.connect();
        const { rows: [actual] } = await c.query(`SELECT current_database() AS db, current_user AS role,
          host(inet_server_addr()) AS host, inet_server_port() AS port,
          current_setting('data_directory') AS data, current_setting('listen_addresses') AS listeners,
          current_setting('server_encoding') AS encoding, current_setting('client_encoding') AS client_encoding`);
        assert.deepEqual(actual, { db: database, role: database, host: '127.0.0.1', port,
          data: data.replaceAll('\\', '/'), listeners: '127.0.0.1', encoding: 'UTF8', client_encoding: 'UTF8' });
        sessions.add(c);
        return c;
      } catch (error) { await c.end(); throw error; }
    };
    client = await connect();
    console.log(`SERVER ${(await client.query('SELECT version() AS v')).rows[0].v}`);
    phase = 'install baseline only';
    await client.query(baselineDDL);
    // Only the freshly initialized, identity-verified owned cluster may commit draft DDL.
    await client.query('BEGIN');
    try { await client.query(ddl); await client.query('COMMIT'); }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    const tables = (await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='icc' ORDER BY tablename`)).rows.map(r => r.tablename);
    const empty = async c => {
      const counts = await c.query(tables.map(t => `SELECT '${t}' AS name, count(*)::int AS count FROM icc.${ident(t)}`).join(' UNION ALL '));
      assert.deepEqual(counts.rows.filter(r => r.count !== 0), []);
    };
    const close = async c => { await c.end(); sessions.delete(c); };
    const independent = async label => {
      const c = await connect();
      try {
        await empty(c);
        assert.equal((await c.query(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname LIKE 's17_%' AND NOT tgisinternal`)).rows[0].n, 6);
      } finally { await close(c); }
      pass(`${label}: independent zero readback across ${tables.length} tables; committed guards remain installed`);
    };
    await independent('committed local DDL');
    const now = new Date('2026-01-02T03:04:05Z');
    const run = `s17-race-${randomUUID()}-`;
    let seq = 0;
    const id = label => `${run}${label}-${++seq}`;
    const owned = new Map();
    const insert = async (c, table, values) => {
      const names = Object.keys(values);
      await c.query(`INSERT INTO icc.${ident(table)} (${names.map(ident)}) VALUES (${names.map((_, i) => '$' + (i + 1))})`, Object.values(values));
      return values.id;
    };
    const seedInsert = async (table, values) => {
      if (!owned.has(table)) owned.set(table, new Set());
      owned.get(table).add(values.id);
      return insert(client, table, values);
    };
    const begin = async c => {
      await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const { rows: [s] } = await c.query(`SELECT current_setting('transaction_isolation') AS isolation, pg_current_snapshot()::text AS snapshot`);
      assert.equal(s.isolation, 'serializable');
      return s.snapshot;
    };
    const seed = async () => {
      owned.clear();
      await begin(client);
      try {
        const f = {};
        for (const label of ['owner', 'professional', 'outsider']) {
          f[label] = id(label);
          await seedInsert('User', { id: f[label], email: `${f[label]}@s17.invalid`, updatedAt: now });
        }
        f.workspace = await seedInsert('TerraqoWorkspace', { id: id('workspace'), slug: id('slug'), name: 'Synthetic S17', ownerUserId: f.owner, updatedAt: now });
        for (const label of ['collaboration', 'otherCollaboration']) {
          const conversation = await seedInsert('TerraqoConversation', { id: id('conversation'), workspaceId: f.workspace, createdById: f.owner, updatedAt: now });
          f[label] = await seedInsert('TerraqoCollaboration', { id: id(label), workspaceId: f.workspace, conversationId: conversation,
            professionalUserId: f.professional, status: 'ACCEPTED', updatedAt: now });
        }
        // The target collaboration deliberately has no closure: avoid a unique-key
        // violation masking the reparent race we actually intend to exercise.
        f.closure = await seedInsert('TerraqoCollaborationClosure', { id: id('closure'), collaborationId: f.collaboration, updatedAt: now });
        f.proposal = await seedInsert('TerraqoCollaborationProposal', { id: id('proposal'), collaborationId: f.collaboration,
          revisionNo: 1, scope: 'Original synthetic scope', roleTitle: 'Synthetic surveyor', status: 'ACCEPTED',
          createdById: f.owner, decidedById: f.professional, decidedAt: now, operationKey: id('proposal-key'), operationFingerprint: 'synthetic' });
        for (const [party, actorId] of [['WORKSPACE', f.owner], ['PROFESSIONAL', f.professional]]) {
          const acceptance = await seedInsert('TerraqoCollaborationAcceptance', { id: id('acceptance'), proposalId: f.proposal, party, actorId });
          if (party === 'PROFESSIONAL') f.acceptance = acceptance;
        }
        f.revision = { id: id('revision'), closureId: f.closure, acceptedProposalId: f.proposal, revisionNo: 1,
          contribution: 'Synthetic contribution', deliverables: ['Synthetic plan'], result: 'Synthetic result', createdById: f.owner,
          operationKey: id('binding-key'), operationFingerprint: 'synthetic-binding' };
        owned.set('TerraqoClosureRevision', new Set([f.revision.id]));
        await client.query('COMMIT');
        return f;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    };
    const mutations = {
      'proposal-payload': (c, f) => c.query('UPDATE icc."TerraqoCollaborationProposal" SET scope=$2 WHERE id=$1', [f.proposal, 'Edited synthetic scope']),
      'acceptance-mutation': (c, f) => c.query('UPDATE icc."TerraqoCollaborationAcceptance" SET "actorId"=$2 WHERE id=$1', [f.acceptance, f.outsider]),
      'acceptance-deletion': (c, f) => c.query('DELETE FROM icc."TerraqoCollaborationAcceptance" WHERE id=$1', [f.acceptance]),
      'closure-reparent': (c, f) => c.query('UPDATE icc."TerraqoCollaborationClosure" SET "collaborationId"=$2 WHERE id=$1', [f.closure, f.otherCollaboration]),
      'party-reparent': (c, f) => c.query('UPDATE icc."TerraqoCollaboration" SET "professionalUserId"=$2 WHERE id=$1', [f.collaboration, f.outsider]),
    };
    // All expected failures become values immediately: never leave an unhandled
    // rejection while another session is blocked. Unexpected SQLSTATEs still fail.
    const outcome = promise => promise.then(result => ({ ok: true, result }), error => ({ ok: false, code: error.code }));
    const finish = async (c, statement) => {
      if (!statement.ok) { await c.query('ROLLBACK'); return { committed: false, code: statement.code }; }
      const result = await outcome(c.query('COMMIT'));
      if (!result.ok) await c.query('ROLLBACK');
      else assert.equal(result.result.command, 'COMMIT', 'An aborted transaction must not masquerade as a commit');
      return { committed: result.ok, code: result.code || null };
    };
    const predicateLocks = async pid => (await client.query(`SELECT count(*)::int AS n FROM pg_locks WHERE pid=$1 AND mode='SIReadLock'`, [pid])).rows[0].n;
    const barrier = async (pending, waiter, blocker, label, mustBlock = false) => {
      let settled = false;
      void pending.then(() => { settled = true; });
      const deadline = Date.now() + 4000;
      // Poll actual server state, not elapsed sleeps. Each query yields to I/O.
      // The 4s observation deadline precedes the 8s lock / 15s statement timeouts.
      while (Date.now() < deadline) {
        const { rows: [s] } = await client.query(`SELECT a.wait_event_type, a.wait_event,
          pg_blocking_pids(a.pid) AS blockers,
          EXISTS(SELECT 1 FROM pg_locks l WHERE l.pid=a.pid AND NOT l.granted) AS ungranted
          FROM pg_stat_activity a WHERE a.pid=$1`, [waiter.processID]);
        assert.ok(s, `${label}: waiter session disappeared`);
        if (s.wait_event_type === 'Lock' && s.blockers.includes(blocker.processID) && s.ungranted) {
          console.log(`BARRIER ${label} waiter=${waiter.processID} blocker=${blocker.processID} event=${s.wait_event} ungranted=true`);
          return 'lock';
        }
        if (settled) {
          assert.equal(mustBlock, false, `${label}: expected a real FK lock wait`);
          console.log(`BARRIER ${label} second statement settled; first transaction still open`);
          return 'settled';
        }
      }
      assert.fail(`${label}: no completion or attributable lock within 4s`);
    };
    const verifyState = async (f, kind, bound, edited) => {
      // Separate fresh connection: assertions must inspect committed state, never
      // a race participant's old snapshot or its own uncommitted writes.
      const c = await connect();
      try {
        const { rows: [s] } = await c.query(`SELECT p.scope, cl."collaborationId" AS closure_parent,
          co."professionalUserId" AS professional,
          (SELECT count(*)::int FROM icc."TerraqoClosureRevision" r WHERE r."acceptedProposalId"=p.id) AS bindings,
          (SELECT a."actorId" FROM icc."TerraqoCollaborationAcceptance" a WHERE a.id=$4) AS acceptance_actor
          FROM icc."TerraqoCollaborationProposal" p, icc."TerraqoCollaborationClosure" cl, icc."TerraqoCollaboration" co
          WHERE p.id=$1 AND cl.id=$2 AND co.id=$3`, [f.proposal, f.closure, f.collaboration, f.acceptance]);
        assert.deepEqual(s, {
          scope: edited && kind === 'proposal-payload' ? 'Edited synthetic scope' : 'Original synthetic scope',
          closure_parent: edited && kind === 'closure-reparent' ? f.otherCollaboration : f.collaboration,
          professional: edited && kind === 'party-reparent' ? f.outsider : f.professional,
          bindings: bound ? 1 : 0,
          acceptance_actor: edited && kind === 'acceptance-deletion' ? null : edited && kind === 'acceptance-mutation' ? f.outsider : f.professional,
        });
        const invalid = await c.query(`SELECT r.id FROM icc."TerraqoClosureRevision" r
          LEFT JOIN icc."TerraqoCollaborationProposal" p ON p.id=r."acceptedProposalId"
          LEFT JOIN icc."TerraqoCollaborationClosure" cl ON cl.id=r."closureId"
          LEFT JOIN icc."TerraqoCollaboration" co ON co.id=cl."collaborationId"
          LEFT JOIN icc."TerraqoCollaborationAcceptance" wa ON wa."proposalId"=p.id AND wa.party='WORKSPACE'
          LEFT JOIN icc."TerraqoCollaborationAcceptance" pa ON pa."proposalId"=p.id AND pa.party='PROFESSIONAL'
          WHERE r."acceptedProposalId" IS NOT NULL AND (p.id IS NULL OR p."collaborationId" IS DISTINCT FROM co.id
            OR p.status <> 'ACCEPTED' OR wa."actorId" IS DISTINCT FROM p."createdById"
            OR pa."actorId" IS DISTINCT FROM co."professionalUserId" OR p."decidedById" IS DISTINCT FROM pa."actorId")`);
        assert.deepEqual(invalid.rows, []);
        const { rows } = await c.query('SELECT id, "operationKey", "operationFingerprint" FROM icc."TerraqoClosureRevision" WHERE "closureId"=$1', [f.closure]);
        assert.deepEqual(rows, bound ? [{ id: f.revision.id, operationKey: f.revision.operationKey, operationFingerprint: f.revision.operationFingerprint }] : []);
      } finally { await close(c); }
    };
    const cleanup = async label => {
      phase = `${label} ordered committed cleanup`;
      await begin(client);
      try {
        for (const key of owned.get('TerraqoCollaborationCertificate') || []) await client.query('DELETE FROM icc."TerraqoCollaborationCertificate" WHERE id=$1', [key]);
        for (const key of owned.get('TerraqoCollaborationClosure') || []) await client.query('UPDATE icc."TerraqoCollaborationClosure" SET "currentRevisionId"=NULL WHERE id=$1', [key]);
        for (const table of ['TerraqoClosureReference', 'TerraqoClosureRevision', 'TerraqoCollaborationClosure', 'TerraqoCollaborationAcceptance',
          'TerraqoCollaborationProposal', 'TerraqoCollaboration', 'TerraqoConversation', 'TerraqoWorklogRevision', 'TerraqoWorklogEntry', 'TerraqoProfessionalProfile', 'TerraqoWorkspace', 'User']) {
          for (const key of owned.get(table) || []) {
            assert.ok(key.startsWith(run));
            await client.query(`DELETE FROM icc.${ident(table)} WHERE id=$1`, [key]);
          }
        }
        await empty(client);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      await independent(label);
    };
    for (const [kind, mutate] of Object.entries(mutations)) {
      for (const firstName of ['binding', 'mutation']) {
        const label = `${kind}/${firstName}-first`;
        phase = label;
        const f = await seed();
        const binding = await connect(), mutation = await connect();
        try {
          const snapshotA = await begin(binding), snapshotB = await begin(mutation);
          assert.equal(snapshotA, snapshotB, 'Both snapshots precede either racing write');
          const first = firstName === 'binding' ? binding : mutation;
          const second = firstName === 'binding' ? mutation : binding;
          const act = c => c === binding ? insert(c, 'TerraqoClosureRevision', f.revision) : mutate(c, f);
          const firstStatement = await outcome(act(first));
          assert.equal(firstStatement.ok, true, `${label}: first statement ${firstStatement.code}`);
          const siread = await predicateLocks(first.processID);
          assert.ok(siread > 0, `${label}: real predicate locks required`);
          const pending = outcome(act(second));
          const boundary = await barrier(pending, second, first, label);
          const firstResult = await finish(first, firstStatement);
          const secondStatement = await pending;
          const secondResult = await finish(second, secondStatement);
          assert.equal(Number(firstResult.committed) + Number(secondResult.committed), 1, `${label}: exactly one transaction commits`);
          const loser = firstResult.committed ? secondResult : firstResult;
          assert.equal(loser.code, '40001', `${label}: require SSI abort, not timeout/deadlock/constraint masking`);
          const bindingWon = first === binding ? firstResult.committed : secondResult.committed;
          console.log(`RACE ${label} snapshot=${snapshotA} SIReadLock=${siread} barrier=${boundary} first=${firstResult.committed ? 'COMMIT' : firstResult.code} second=${secondResult.committed ? 'COMMIT' : secondResult.code}`);
          await verifyState(f, kind, bindingWon, !bindingWon);
          pass(`${label}: one COMMIT / one 40001; independent valid state and exact surviving payload`);

          // Retry the losing SQL transaction from BEGIN with a fresh snapshot and
          // unchanged IDs/key/fingerprint. This is not a service replay contract.
          const retry = bindingWon ? mutation : binding;
          await begin(retry);
          const retryStatement = await outcome(act(retry));
          const retryResult = await finish(retry, retryStatement);
          const permitsFreshBinding = !bindingWon && kind === 'proposal-payload';
          assert.equal(retryResult.committed, permitsFreshBinding, `${label}: fresh retry outcome`);
          if (!permitsFreshBinding) assert.equal(retryResult.code, '23514');
          await verifyState(f, kind, bindingWon || permitsFreshBinding, !bindingWon);
          pass(`${label}: whole SQL retry with stable key ${permitsFreshBinding ? 'COMMIT using edited proposal' : '23514'}; no duplicate binding`);
        } finally {
          // pg Client.end destroys an active-query socket; run both ends together
          // so a failed barrier cannot strand the other open transaction.
          await Promise.all([close(binding), close(mutation)]);
        }
        await cleanup(label);
      }
    }

    // FK-specific race: exercise real reference children, without mistaking a
    // structural RESTRICT failure for a provenance SSI failure.
    phase = 'reference FK lock rehearsal';
    const f = await seed();
    await begin(client);
    await insert(client, 'TerraqoClosureRevision', f.revision);
    const profile = await seedInsert('TerraqoProfessionalProfile', { id: id('profile'), userId: f.professional, updatedAt: now });
    const worklog = await seedInsert('TerraqoWorklogEntry', { id: id('worklog'), professionalProfileId: profile, authorId: f.professional,
      title: 'Synthetic', summary: 'Synthetic', updatedAt: now });
    const source = await seedInsert('TerraqoWorklogRevision', { id: id('source'), worklogId: worklog, revisionNo: 1,
      title: 'Synthetic', summary: 'Synthetic', contentHash: 'synthetic', createdById: f.professional });
    await client.query('COMMIT');
    const reference = { id: id('reference'), closureRevisionId: f.revision.id, worklogRevisionId: source, accessSnapshot: '{}' };
    owned.set('TerraqoClosureReference', new Set([reference.id]));
    const holder = await connect(), deleter = await connect();
    try {
      await begin(holder);
      await insert(holder, 'TerraqoClosureReference', reference);
      await begin(deleter);
      const pending = outcome(deleter.query('DELETE FROM icc."TerraqoWorklogRevision" WHERE id=$1', [source]));
      await barrier(pending, deleter, holder, 'reference-insert/source-delete', true);
      await holder.query('COMMIT');
      const result = await finish(deleter, await pending);
      assert.equal(result.committed, false);
      // A new referencing row outside the deleter's snapshot yields SSI 40001;
      // a fresh SERIALIZABLE attempt below must observe the actual RESTRICT FK.
      assert.ok(['40001', '23001'].includes(result.code), `reference race: ${result.code}`);
      console.log(`FK reference-insert/source-delete=${result.code}`);
      await begin(deleter);
      const restricted = await finish(deleter, await outcome(deleter.query('DELETE FROM icc."TerraqoWorklogRevision" WHERE id=$1', [source])));
      assert.deepEqual(restricted, { committed: false, code: '23001' });
      const verifier = await connect();
      try {
        assert.equal((await verifier.query('SELECT count(*)::int AS n FROM icc."TerraqoClosureReference" WHERE id=$1', [reference.id])).rows[0].n, 1);
        assert.equal((await verifier.query('SELECT count(*)::int AS n FROM icc."TerraqoWorklogRevision" WHERE id=$1', [source])).rows[0].n, 1);
      } finally { await close(verifier); }
      pass('reference FK: observed lock; source survives concurrent delete; fresh delete rejected 23001');
    } finally {
      await Promise.all([close(holder), close(deleter)]);
    }
    await cleanup('reference child before source');
    console.log('PENDING service authorization/idempotency/replay and full service retries, writer/client compatibility, retained-data operational rollback; SQL concurrency only');
  } finally {
    // Only connections verified against this owned cluster enter sessions.
    try {
      await Promise.allSettled([...sessions].map(c => c.end()));
    } finally { if (started) await pg('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']); }
    assert.equal(await access(path.join(data, 'postmaster.pid')).then(() => true, () => false), false);
    assert.equal((await lstat(local)).isSymbolicLink(), false);
    const resolved = await realpath(local);
    assert.equal(path.dirname(resolved), tempRoot);
    assert.equal(path.resolve(local), resolved);
    assert.ok(path.basename(resolved).startsWith(prefix));
    await rm(resolved, { recursive: true, force: false, maxRetries: 5, retryDelay: 200 });
    await assert.rejects(access(resolved), { code: 'ENOENT' });
    pass('own cluster stopped; postmaster absent; guarded resolved directory removed');
  }
  console.log(`RESULT ${checks} checks passed; 10 SSI orders; draft DDL/fixtures committed ONLY in removed owned loopback cluster`);
}

main().catch(error => {
  console.error('FAIL S17 races rehearsal', { phase, code: error?.code, name: error?.name, table: error?.table, column: error?.column });
  if (error?.name === 'AssertionError') console.error(error.message);
  process.exitCode = 1;
});
