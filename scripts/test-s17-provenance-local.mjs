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

// No .env loading, application imports, client generation, migrations or external URL input.
const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselineRef = 'f0b34c58c54bd92a9af09d66dc9e199cf43354af';
const prefix = 'terraqo-s17-provenance-';
const sha = value => createHash('sha256').update(value).digest('hex');
let phase = 'arguments';
let checks = 0;
const pass = label => { checks++; console.log(`PASS ${label}`); };
const ident = value => { assert.match(value, /^[A-Za-z_][A-Za-z0-9_]*$/); return `"${value}"`; };

async function main() {
  const args = process.argv.slice(2);
  assert.ok(args.includes('--confirm=local-s17-only'), 'Explicit disposable-loopback confirmation required');
  assert.ok(args.every(a => a === '--confirm=local-s17-only' || a.startsWith('--dependencies=') || a.startsWith('--pg-bin=')));
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
  const database = 's17_provenance_test';
  let started = false;
  let client;
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
      client_encoding: 'UTF8', connectionTimeoutMillis: 5000, statement_timeout: 30000,
      lock_timeout: 5000, application_name: 's17-disposable-rehearsal', options: '-c client_encoding=UTF8' };
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
        return c;
      } catch (error) { await c.end(); throw error; }
    };
    client = await connect();
    console.log(`SERVER ${(await client.query('SELECT version() AS v')).rows[0].v}`);
    phase = 'install baseline only';
    await client.query(baselineDDL);
    const catalog = async c => (await c.query(`SELECT 'column' AS kind, table_name AS parent, column_name AS name,
        data_type || ':' || is_nullable || ':' || COALESCE(column_default, '') AS definition
      FROM information_schema.columns WHERE table_schema = 'icc'
      UNION ALL SELECT 'constraint', conrelid::regclass::text, conname, pg_get_constraintdef(oid)
        FROM pg_constraint WHERE connamespace = 'icc'::regnamespace
      UNION ALL SELECT 'function', '', proname, pg_get_functiondef(oid)
        FROM pg_proc WHERE pronamespace = 'icc'::regnamespace
      UNION ALL SELECT 'trigger', tgrelid::regclass::text, tgname, pg_get_triggerdef(oid)
        FROM pg_trigger WHERE tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'icc'::regnamespace)
      UNION ALL SELECT 'index', tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'icc'
      ORDER BY 1, 2, 3, 4`)).rows;
    const originalCatalog = await catalog(client);
    assert.ok(!JSON.stringify(originalCatalog).includes('acceptedProposalId'));
    const tables = (await client.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'icc' ORDER BY tablename`)).rows.map(r => r.tablename);
    const empty = async c => {
      const counts = await c.query(tables.map(t => `SELECT '${t}' AS name, count(*)::int AS count FROM icc.${ident(t)}`).join(' UNION ALL '));
      assert.deepEqual(counts.rows.filter(r => r.count !== 0), []);
    };
    await empty(client);
    pass(`baseline lacks provenance; ${tables.length} tables empty; loopback/data-directory/UTF8 verified`);
    const independent = async label => {
      const other = await connect();
      try { await empty(other); assert.deepEqual(await catalog(other), originalCatalog); }
      finally { await other.end(); }
      pass(`${label}: independent connection confirms zero rows and baseline catalog restored`);
    };
    const q = (text, values) => client.query(text, values);
    const run = `s17-${randomUUID()}-`;
    let sequence = 0;
    const id = label => `${run}${label}-${++sequence}`;
    const owned = new Map();
    const insert = async (table, values) => {
      const names = Object.keys(values);
      await q(`INSERT INTO icc.${ident(table)} (${names.map(ident)}) VALUES (${names.map((_, i) => '$' + (i + 1))})`, Object.values(values));
      if (!owned.has(table)) owned.set(table, new Set());
      owned.get(table).add(values.id);
      return values.id;
    };
    const update = (table, key, values) => q(`UPDATE icc.${ident(table)} SET ${Object.keys(values).map((k, i) => `${ident(k)}=$${i + 2}`).join(',')} WHERE id=$1`, [key, ...Object.values(values)]);
    const remove = (table, key) => q(`DELETE FROM icc.${ident(table)} WHERE id=$1`, [key]);
    const row = async (table, key) => (await q(`SELECT * FROM icc.${ident(table)} WHERE id=$1`, [key])).rows[0];
    const denied = async (label, action, code = '23514', message = /^S17 /) => {
      phase = label;
      await q('SAVEPOINT expected_denial');
      let error;
      try { await action(); } catch (caught) { error = caught; }
      await q('ROLLBACK TO SAVEPOINT expected_denial');
      await q('RELEASE SAVEPOINT expected_denial');
      assert.ok(error, `${label}: unexpectedly permitted`);
      assert.ok((Array.isArray(code) ? code : [code]).includes(error.code), `${label}: expected ${code}, received ${error.code}`);
      assert.match(error.message, message, label);
      pass(`${label} [${error.code}]`);
    };
    const now = new Date('2026-01-02T03:04:05Z');
    let owner, professional, outsider, workspace, otherWorkspace, conversation, otherConversation, collaboration, otherCollaboration, closure, otherClosure;
    const proposalValues = (overrides = {}) => ({ id: id('proposal'), collaborationId: collaboration, revisionNo: ++sequence,
      scope: 'Alcance sintético — medición', roleTitle: 'Topógrafo sintético', status: 'ACCEPTED',
      createdById: owner, decidedById: professional, decidedAt: now, operationKey: id('proposal-key'), operationFingerprint: 'synthetic', ...overrides });
    const acceptance = (proposalId, party, actorId) => insert('TerraqoCollaborationAcceptance', { id: id('acceptance'), proposalId, party, actorId });
    const proposalWithParties = async (overrides = {}) => {
      const p = await insert('TerraqoCollaborationProposal', proposalValues(overrides));
      await acceptance(p, 'WORKSPACE', owner); await acceptance(p, 'PROFESSIONAL', professional);
      return p;
    };
    const revisionValues = (overrides = {}) => ({ id: id('revision'), closureId: closure, revisionNo: ++sequence,
      contribution: 'Contribución sintética', deliverables: ['Plano sintético'], result: 'Resultado sintético',
      authorizedExcerpt: 'Extracto sintético', createdById: owner, operationKey: id('revision-key'), operationFingerprint: 'synthetic', ...overrides });
    const certificateValues = async revisionId => {
      const r = await row('TerraqoClosureRevision', revisionId);
      const p = r.acceptedProposalId ? await row('TerraqoCollaborationProposal', r.acceptedProposalId) : null;
      return { id: id('certificate'), closureId: r.closureId, closureRevisionId: r.id,
        workspaceName: 'Synthetic workspace', professionalName: 'Synthetic professional',
        roleTitle: p?.roleTitle || 'Legacy', scope: p?.scope || 'Legacy', proposalRevisionNo: p?.revisionNo || 1,
        closureRevisionNo: r.revisionNo, contribution: r.contribution, deliverables: r.deliverables,
        result: r.result, authorizedExcerpt: r.authorizedExcerpt, privateByDefault: true, issuedById: professional };
    };
    const seed = async () => {
      owned.clear();
      for (const label of ['owner', 'professional', 'outsider']) {
        const key = id(label); await insert('User', { id: key, email: `${key}@s17.invalid`, updatedAt: now });
        if (label === 'owner') owner = key; else if (label === 'professional') professional = key; else outsider = key;
      }
      workspace = id('workspace'); otherWorkspace = id('other-workspace');
      for (const key of [workspace, otherWorkspace]) await insert('TerraqoWorkspace', { id: key, slug: key, name: 'Sintético S17', ownerUserId: owner, updatedAt: now });
      conversation = id('conversation'); otherConversation = id('other-conversation');
      for (const key of [conversation, otherConversation]) await insert('TerraqoConversation', { id: key, workspaceId: workspace, createdById: owner, updatedAt: now });
      collaboration = id('collaboration'); otherCollaboration = id('other-collaboration');
      for (const [key, conv] of [[collaboration, conversation], [otherCollaboration, otherConversation]]) {
        await insert('TerraqoCollaboration', { id: key, workspaceId: workspace, conversationId: conv, professionalUserId: professional, status: 'ACCEPTED', updatedAt: now });
      }
      closure = id('closure'); otherClosure = id('other-closure');
      for (const [key, collab] of [[closure, collaboration], [otherClosure, otherCollaboration]]) {
        await insert('TerraqoCollaborationClosure', { id: key, collaborationId: collab, updatedAt: now });
      }
    };
    const begin = async isolation => {
      await q(`SET SESSION CHARACTERISTICS AS TRANSACTION ISOLATION LEVEL ${isolation}`);
      // The proposal's BEGIN and ROLLBACK are retained; fixtures/tests are interposed, never COMMIT.
      await q('BEGIN');
      await seed();
    };

    phase = 'serializable behavior';
    await begin('SERIALIZABLE');
    try {
      const legacy = await insert('TerraqoClosureRevision', revisionValues());
      const legacyBefore = await row('TerraqoClosureRevision', legacy);
      await q(ddl);
      assert.deepEqual(await row('TerraqoClosureRevision', legacy), { ...legacyBefore, acceptedProposalId: null });
      assert.equal((await q(`SELECT count(*)::int AS n FROM pg_proc WHERE pronamespace='icc'::regnamespace AND proname LIKE 's17_%'`)).rows[0].n, 7);
      assert.equal((await q(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname LIKE 's17_%' AND NOT tgisinternal`)).rows[0].n, 6);
      pass('all 7 functions / 6 triggers installed; pre-DDL legacy NULL preserved');
      await denied('one-shot DDL rejects repeat without drift masking', () => q(ddl), '42701', /acceptedProposalId/);
      const p = await proposalWithParties();
      const pOther = await proposalWithParties({ collaborationId: otherCollaboration });
      const pMissing = await insert('TerraqoCollaborationProposal', proposalValues());
      await acceptance(pMissing, 'WORKSPACE', owner);
      const pWrongWorkspace = await insert('TerraqoCollaborationProposal', proposalValues());
      await acceptance(pWrongWorkspace, 'WORKSPACE', outsider); await acceptance(pWrongWorkspace, 'PROFESSIONAL', professional);
      const pWrongProfessional = await insert('TerraqoCollaborationProposal', proposalValues());
      await acceptance(pWrongProfessional, 'WORKSPACE', owner); await acceptance(pWrongProfessional, 'PROFESSIONAL', outsider);
      const pWrongDecision = await proposalWithParties({ decidedById: outsider });
      const pPending = await proposalWithParties({ status: 'PENDING' });
      for (const [label, proposalId] of [['cross-collaboration', pOther], ['missing-party', pMissing], ['wrong-workspace-actor', pWrongWorkspace],
        ['wrong-professional-actor', pWrongProfessional], ['wrong-decision-actor', pWrongDecision], ['not-accepted', pPending], ['missing-proposal', id('absent')]]) {
        await denied(`binding rejects ${label}`, () => insert('TerraqoClosureRevision', revisionValues({ acceptedProposalId: proposalId })));
      }
      const r = await insert('TerraqoClosureRevision', revisionValues({ acceptedProposalId: p }));
      const r2 = await insert('TerraqoClosureRevision', revisionValues({ acceptedProposalId: p }));
      assert.equal((await row('TerraqoClosureRevision', r)).acceptedProposalId, p);
      pass('same-collaboration both-party binding; two revisions share one proposal');
      await denied('legacy NULL cannot be rebound', () => update('TerraqoClosureRevision', legacy, { acceptedProposalId: p }));
      await denied('bound ID cannot become NULL', () => update('TerraqoClosureRevision', r, { acceptedProposalId: null }));
      await denied('bound ID cannot be rebound', () => update('TerraqoClosureRevision', r, { acceptedProposalId: pOther }));
      for (const values of [{ contribution: 'tampered' }, { deliverables: ['tampered'] }, { result: 'tampered' }, { authorizedExcerpt: null },
        { closureId: otherClosure }, { revisionNo: 999 }, { createdById: outsider }, { createdAt: new Date('2020-01-01Z') },
        { operationKey: id('tampered') }, { operationFingerprint: 'tampered' }, { id: id('tampered') }]) {
        await denied(`pinned revision ${Object.keys(values)[0]}`, () => update('TerraqoClosureRevision', r, values));
      }
      await update('TerraqoClosureRevision', r, { contribution: (await row('TerraqoClosureRevision', r)).contribution });
      for (const status of ['SUBMITTED', 'CHANGES_REQUESTED', 'DRAFT', 'SUBMITTED', 'DECLINED', 'SUPERSEDED', 'ACCEPTED']) {
        await update('TerraqoClosureRevision', r, { status, submitOperationKey: 'synthetic-submit', submitFingerprint: 'synthetic-submit',
          submittedAt: now, decidedById: professional, decisionComment: 'synthetic', decisionOperationKey: 'synthetic-decision', decisionFingerprint: 'synthetic-decision', decidedAt: now });
        assert.equal((await row('TerraqoClosureRevision', r)).status, status);
      }
      await update('TerraqoClosureRevision', r2, { status: 'SUPERSEDED' });
      pass('bound revision no-op and lifecycle/submit/decision fields allowed (SQL allowlist, not domain state machine)');
      for (const values of [{ scope: 'tampered' }, { roleTitle: 'tampered' }, { revisionNo: 999 }, { deliverables: ['tampered'] },
        { collaborationId: otherCollaboration }, { createdById: outsider }, { decidedById: outsider }, { decidedAt: null },
        { decisionComment: 'tampered' }, { decisionOperationKey: 'tampered' }, { decisionFingerprint: 'tampered' },
        { startsOn: now }, { endsOn: now }, { conditions: 'tampered' }, { submittedAt: new Date('2020-01-01Z') },
        { operationKey: 'tampered' }, { operationFingerprint: 'tampered' }, { createdAt: new Date('2020-01-01Z') }, { id: id('tampered') }]) {
        await denied(`pinned proposal ${Object.keys(values)[0]}`, () => update('TerraqoCollaborationProposal', p, values));
      }
      await update('TerraqoCollaborationProposal', p, { status: 'SUPERSEDED' });
      await update('TerraqoCollaborationProposal', p, { status: 'ACCEPTED' });
      pass('bound proposal status-only transitions allowed');
      const wa = (await q('SELECT * FROM icc."TerraqoCollaborationAcceptance" WHERE "proposalId"=$1 AND party=\'WORKSPACE\'', [p])).rows[0];
      for (const values of [{ actorId: outsider }, { acceptedAt: new Date('2020-01-01Z') }, { party: 'PROFESSIONAL' }, { proposalId: pMissing }, { id: id('tampered') }]) {
        await denied(`pinned acceptance ${Object.keys(values)[0]}`, () => update('TerraqoCollaborationAcceptance', wa.id, values));
      }
      const missingAcceptance = (await q('SELECT id FROM icc."TerraqoCollaborationAcceptance" WHERE "proposalId"=$1', [pMissing])).rows[0].id;
      await denied('acceptance cannot move into pinned proposal', () => update('TerraqoCollaborationAcceptance', missingAcceptance, { proposalId: p }));
      await denied('pinned acceptance delete', () => remove('TerraqoCollaborationAcceptance', wa.id));
      await update('TerraqoCollaborationAcceptance', wa.id, { actorId: owner });
      await denied('duplicate party blocked by unique key', () => acceptance(p, 'WORKSPACE', owner), '23505', /unique constraint/);
      // The RESTRICT FK must reject deletion while a revision still refers to the proposal.
      // Either RESTRICT or the acceptance cascade guard may reject first; both forbid the delete.
      await denied('pinned proposal deletion rejected', () => remove('TerraqoCollaborationProposal', p), ['23503', '23514'], /foreign key constraint|S17 acceptance evidence/);
      for (const values of [{ collaborationId: otherCollaboration }, { id: id('tampered') }]) {
        await denied(`closure reparent/key ${Object.keys(values)[0]}`, () => update('TerraqoCollaborationClosure', closure, values));
      }
      for (const values of [{ professionalUserId: outsider }, { workspaceId: otherWorkspace }, { conversationId: otherConversation }, { id: id('tampered') }]) {
        await denied(`collaboration context ${Object.keys(values)[0]}`, () => update('TerraqoCollaboration', collaboration, values));
      }
      await update('TerraqoCollaborationClosure', closure, { currentRevisionId: r, version: 2, updatedAt: now });
      await update('TerraqoCollaboration', collaboration, { status: 'CLOSED', version: 2, acceptedRevisionNo: 999, acceptedAt: now, updatedAt: now });
      pass('current revision/version/current accepted scope/collaboration lifecycle remain mutable');
      const cert = await certificateValues(r);
      await denied('certificate rejects nonaccepted revision', async () => {
        await update('TerraqoClosureRevision', r, { status: 'SUBMITTED' }); await insert('TerraqoCollaborationCertificate', cert);
      });
      for (const values of [{ closureId: otherClosure }, { proposalRevisionNo: 999 }, { roleTitle: 'tampered' }, { scope: 'tampered' },
        { closureRevisionNo: 999 }, { contribution: 'tampered' }, { deliverables: ['tampered'] }, { result: 'tampered' },
        { authorizedExcerpt: null }, { issuedById: outsider }, { privateByDefault: false }]) {
        await denied(`certificate rejects mismatched ${Object.keys(values)[0]}`, () => insert('TerraqoCollaborationCertificate', { ...cert, ...values }));
      }
      await denied('certificate missing revision', () => insert('TerraqoCollaborationCertificate', { ...cert, closureRevisionId: id('absent') }), '23503');
      await insert('TerraqoCollaborationCertificate', cert);
      const certRead = await row('TerraqoCollaborationCertificate', cert.id);
      for (const [key, value] of Object.entries(cert)) assert.deepEqual(certRead[key], value);
      pass('matching bound certificate copies UTF8 payload and stays private');
      for (const values of [{ scope: 'tampered' }, { privateByDefault: false }, { closureRevisionId: legacy }, { closureId: otherClosure },
        { issuedById: outsider }, { issuedAt: now }, { workspaceName: 'tampered' }, { professionalName: 'tampered' }]) {
        await denied(`bound certificate immutable ${Object.keys(values)[0]}`, () => update('TerraqoCollaborationCertificate', cert.id, values));
      }
      await update('TerraqoCollaborationCertificate', cert.id, { scope: cert.scope });
      await denied('duplicate certificate rejected', () => insert('TerraqoCollaborationCertificate', { ...cert, id: id('duplicate') }), '23505', /unique constraint/);
      // PostgreSQL reports RESTRICT as restrict_violation (23001), not the
      // foreign_key_violation used for a missing referenced row on INSERT.
      await denied('revision with certificate cannot be deleted', () => remove('TerraqoClosureRevision', r), '23001', /foreign key constraint/);
      await denied('closure with certificate cannot be deleted', () => remove('TerraqoCollaborationClosure', closure), '23001', /foreign key constraint/);
      const legacy2 = await insert('TerraqoClosureRevision', revisionValues({ closureId: otherClosure }));
      await update('TerraqoClosureRevision', legacy2, { contribution: 'Legacy edited', status: 'SUBMITTED' });
      await update('TerraqoClosureRevision', legacy2, { status: 'ACCEPTED' });
      const legacyCert = await certificateValues(legacy2);
      await insert('TerraqoCollaborationCertificate', legacyCert);
      await update('TerraqoCollaborationCertificate', legacyCert.id, { scope: 'Legacy edited' });
      await denied('legacy certificate cannot move onto bound revision', () => update('TerraqoCollaborationCertificate', legacyCert.id, { closureRevisionId: r }));
      pass('old-style NULL insert/edit/submit/accept/certificate without provenance remains supported at SQL level');
      const profile = await insert('TerraqoProfessionalProfile', { id: id('profile'), userId: professional, updatedAt: now });
      const worklog = await insert('TerraqoWorklogEntry', { id: id('worklog'), professionalProfileId: profile, authorId: professional,
        title: 'Synthetic', summary: 'Synthetic', updatedAt: now });
      const source = await insert('TerraqoWorklogRevision', { id: id('source'), worklogId: worklog, revisionNo: 1,
        title: 'Synthetic', summary: 'Synthetic', contentHash: 'synthetic', createdById: professional });
      await insert('TerraqoClosureReference', { id: id('reference'), closureRevisionId: r, worklogRevisionId: source, accessSnapshot: '{}' });
      phase = 'ordered synthetic cleanup';
      for (const key of owned.get('TerraqoCollaborationCertificate')) await remove('TerraqoCollaborationCertificate', key);
      await update('TerraqoCollaborationClosure', closure, { currentRevisionId: null });
      for (const key of owned.get('TerraqoClosureReference')) await remove('TerraqoClosureReference', key);
      await remove('TerraqoClosureRevision', r);
      await denied('remaining revision keeps acceptance pinned', () => remove('TerraqoCollaborationAcceptance', wa.id));
      await denied('remaining revision keeps proposal pinned', () => update('TerraqoCollaborationProposal', p, { scope: 'tampered' }));
      await remove('TerraqoClosureRevision', r2);
      await update('TerraqoCollaborationProposal', p, { scope: 'Released after last binding removed' });
      await remove('TerraqoCollaborationAcceptance', wa.id);
      for (const table of ['TerraqoClosureRevision', 'TerraqoCollaborationClosure', 'TerraqoCollaborationAcceptance', 'TerraqoCollaborationProposal',
        'TerraqoCollaboration', 'TerraqoConversation', 'TerraqoWorklogRevision', 'TerraqoWorklogEntry', 'TerraqoProfessionalProfile', 'TerraqoWorkspace', 'User']) {
        for (const key of owned.get(table) || []) await remove(table, key);
      }
      await empty(client);
      pass('ordered ID-scoped cleanup succeeds with real reference child; zero rows in transaction');
    } finally { await q('ROLLBACK'); }
    await independent('behavior + ordered cleanup rollback');

    phase = 'wrong-isolation guard';
    await begin('READ COMMITTED');
    try {
      await q(ddl);
      const p = await proposalWithParties();
      const a = (await q('SELECT id FROM icc."TerraqoCollaborationAcceptance" WHERE "proposalId"=$1 LIMIT 1', [p])).rows[0].id;
      const wrong = (label, action) => denied(`READ COMMITTED ${label}`, action, '25001', /S17 provenance predicate writes require SERIALIZABLE/);
      await wrong('direct guard', () => q('SELECT icc.s17_require_serializable()'));
      await wrong('bound insert before any binding', () => insert('TerraqoClosureRevision', revisionValues({ acceptedProposalId: p })));
      await wrong('unbound proposal payload', () => update('TerraqoCollaborationProposal', p, { scope: 'Changed' }));
      await wrong('unbound acceptance update', () => update('TerraqoCollaborationAcceptance', a, { acceptedAt: now }));
      await wrong('unbound acceptance delete', () => remove('TerraqoCollaborationAcceptance', a));
      await wrong('unbound closure reparent', () => update('TerraqoCollaborationClosure', closure, { collaborationId: otherCollaboration }));
      await wrong('unbound collaboration party', () => update('TerraqoCollaboration', collaboration, { professionalUserId: outsider }));
      await update('TerraqoCollaborationAcceptance', a, { proposalId: p });
      await update('TerraqoCollaborationProposal', p, { status: 'SUPERSEDED' });
      const legacy = await insert('TerraqoClosureRevision', revisionValues());
      await update('TerraqoClosureRevision', legacy, { status: 'ACCEPTED' });
      await insert('TerraqoCollaborationCertificate', await certificateValues(legacy));
      pass('READ COMMITTED no-op/status/legacy NULL behavior allowed');
    } finally { await q('ROLLBACK'); }
    await independent('wrong-isolation rollback');

    phase = 'injected transaction failure';
    await begin('SERIALIZABLE');
    try {
      await q(ddl);
      const p = await proposalWithParties();
      const r = await insert('TerraqoClosureRevision', revisionValues({ acceptedProposalId: p, status: 'ACCEPTED' }));
      await insert('TerraqoCollaborationCertificate', await certificateValues(r));
      await assert.rejects(q(`DO $$ BEGIN RAISE EXCEPTION 'S17 synthetic failure after certificate' USING ERRCODE='P0001'; END $$`), { code: 'P0001' });
      await assert.rejects(q('SELECT 1'), { code: '25P02' });
      pass('injected failure after bound revision/certificate aborts entire transaction');
    } finally { await q('ROLLBACK'); }
    await independent('injected-failure rollback');
    console.log('PENDING cross-session SSI/race orders/full transaction retry, application authorization/replay, client rollout, retained-data operational rollback; no such coverage claimed');
  } finally {
    try { if (client) await client.end(); }
    finally { if (started) await pg('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']); }
    assert.equal(await access(path.join(data, 'postmaster.pid')).then(() => true, () => false), false);
    // Realpath + direct-parent + unique-prefix + symlink checks precede recursive deletion.
    assert.equal((await lstat(local)).isSymbolicLink(), false);
    const resolved = await realpath(local);
    assert.equal(path.dirname(resolved), tempRoot);
    assert.equal(path.resolve(local), resolved);
    assert.ok(path.basename(resolved).startsWith(prefix));
    await rm(resolved, { recursive: true, force: false, maxRetries: 5, retryDelay: 200 });
    await assert.rejects(access(resolved), { code: 'ENOENT' });
    pass('own cluster stopped; postmaster absent; guarded resolved directory removed');
  }
  console.log(`RESULT ${checks} checks passed; no proposed DDL or fixtures committed`);
}

main().catch(error => {
  // Never print child command/env/connection strings or arbitrary error objects containing secrets.
  console.error('FAIL S17 local rehearsal', { phase, code: error?.code, name: error?.name, table: error?.table, column: error?.column });
  if (error?.name === 'AssertionError') console.error(error.message);
  process.exitCode = 1;
});
