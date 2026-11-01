import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getStore, listStores } from '@netlify/blobs';
import { Client } from 'pg';

// Read-only inventory: no object bodies, metadata, credentials or raw keys
// leave this process. A list fingerprint is not a restorable file backup.
const siteID = '2d38524a-44f9-4473-8a1f-9270e03bc2bf';
const digest = value => createHash('sha256').update(value).digest('hex');
const sdkRequire = createRequire(new URL('../node_modules/netlify-cli/package.json', import.meta.url));
const { getAPIToken } = await import(pathToFileURL(sdkRequire.resolve('@netlify/dev-utils')).href);
const { NetlifyAPI } = await import(pathToFileURL(sdkRequire.resolve('@netlify/api')).href);
const known = [...readFileSync('lib/server/media.ts', 'utf8').matchAll(/export const \w+_STORE = "([^"]+)"/g)].map(m => m[1]);
const readOnlyFetch = async (input, init) => {
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  assert.ok(['GET', 'HEAD'].includes(method), 'Inventory transport forbids writes');
  return fetch(input, { ...init, signal: AbortSignal.timeout(30000) });
};
try {
  const token = await getAPIToken(); assert.ok(token);
  const site = await new NetlifyAPI(token).getSite({ site_id: siteID });
  assert.equal(site.name, 'iridescent-fenglisu-d6595c');
  const options = { siteID, token, consistency: 'strong', fetch: readOnlyFetch };
  const names = new Set(); let pages = 0;
  for await (const page of listStores({ ...options, paginate: true })) {
    assert.ok(++pages <= 100, 'Store pagination budget exceeded');
    for (const name of page.stores) names.add(name);
  }
  const stores = []; const objectKeys = new Map();
  for (const name of [...names].sort()) {
    const entries = new Map(); let countPages = 0;
    for await (const page of getStore({ ...options, name }).list({ paginate: true })) {
      assert.ok(++countPages <= 1000, 'Object pagination budget exceeded');
      for (const blob of page.blobs) {
        assert.ok(!entries.has(blob.key), 'Repeated object during enumeration');
        entries.set(blob.key, blob.etag);
      }
      assert.ok(entries.size <= 100000, 'Object budget exceeded');
    }
    objectKeys.set(name, new Set(entries.keys()));
    stores.push({ store: known.includes(name) ? name : `unmapped-${digest(name).slice(0, 16)}`, mapped: known.includes(name), objects: entries.size,
      fingerprint: digest(JSON.stringify([...entries].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))) });
  }
  const report = { at: new Date().toISOString(), siteID, deploy: site.published_deploy.id, readOnly: true, bodiesDownloaded: false,
    consistentSnapshot: false, stores, configuredStoresNotListed: known.filter(n => !names.has(n)), totalObjects: stores.reduce((n, s) => n + s.objects, 0),
    limits: ['Live listing is not an atomic snapshot', 'No database-reference reconciliation or orphan classification', 'No blob backup or recovery test'] };
  if (process.argv.includes('--references')) {
    const api = new NetlifyAPI(token);
    const variables = await api.getEnvVars({ accountId: site.account_slug, siteId: siteID });
    const url = new URL(variables.find(v => v.key === 'DATABASE_URL').values.find(v => v.context === 'production').value);
    assert.equal(url.hostname, 'db.prisma.io'); assert.equal(url.searchParams.get('schema'), 'icc');
    url.searchParams.set('sslmode', 'verify-full');
    const db = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 10000, statement_timeout: 15000 });
    const sources = [
      ['TerraqoMessageAttachment', 'terraqo-message-attachments'],
      ['TerraqoProfessionalDocument', 'terraqo-professional-documents'],
      ['TerraqoWorkspaceFile', 'terraqo-workspace-files'],
      ['TerraqoExperienceEvidence', 'terraqo-worklog-evidence'],
      ['TerraqoEducationEvidence', 'terraqo-worklog-evidence'],
      ['TerraqoWorklogMedia', 'terraqo-worklog-evidence'],
    ];
    const referenced = new Map(); const checks = [];
    const inspect = (source, store, rows, requiresObject) => {
      const keys = objectKeys.get(store) || new Set(); let present = 0;
      for (const row of rows) {
        if (!row.storageKey) continue;
        if (!referenced.has(store)) referenced.set(store, new Set());
        referenced.get(store).add(row.storageKey);
        if (keys.has(row.storageKey)) present++;
      }
      checks.push({ source, store, references: rows.length, present, notListed: rows.length - present, requiresObject });
    };
    try {
      await db.connect(); await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      for (const [table, store] of sources) {
        const rows = (await db.query(`SELECT "storageKey" FROM icc."${table}" LIMIT 100001`)).rows;
        assert.ok(rows.length <= 100000, 'Reference budget exceeded'); inspect(table, store, rows, true);
        const missing = rows.filter(r => !(objectKeys.get(store) || new Set()).has(r.storageKey));
        assert.ok(missing.length <= 100, 'Individual verification budget exceeded');
        let absent = 0;
        for (const row of missing) {
          // Existence-only read: discard returned metadata immediately.
          if (await getStore({ ...options, name: store }).getMetadata(row.storageKey) === null) absent++;
        }
        checks.at(-1).individuallyAbsent = absent;
        if (table === 'TerraqoProfessionalDocument' && process.argv.includes('--diagnose-documents')) {
          const missingKeys = missing.map(row => row.storageKey);
          const documentSummary = (await db.query(`SELECT count(*)::int AS count,
            min("uploadedAt") AS earliest, max("uploadedAt") AS latest,
            count(DISTINCT "professionalProfileId")::int AS profiles,
            count(*) FILTER (WHERE "fileName" ~* '(fixture|synthetic|test|prueba)')::int AS testNamed
            FROM icc."TerraqoProfessionalDocument" WHERE "storageKey"=ANY($1::text[])`, [missingKeys])).rows[0];
          const audits = (await db.query(`SELECT a.action::text AS action,
            CASE WHEN a.metadata->>'storageCleanupState' IN ('PENDING','COMPLETE','BLOCKED')
              THEN a.metadata->>'storageCleanupState' ELSE 'OTHER_OR_NONE' END AS cleanup,
            count(*)::int AS count
            FROM icc."ActivityLog" a WHERE
              (a."entityType"='ProfessionalDocument' AND a."entityId" IN
                (SELECT id FROM icc."TerraqoProfessionalDocument" WHERE "storageKey"=ANY($1::text[])))
              OR a.metadata->>'storageCleanupKey'=ANY($1::text[])
            GROUP BY 1,2 ORDER BY 1,2`, [missingKeys])).rows;
          const fingerprint = (await db.query(`SELECT count(*)::text AS rows,
            encode(sha256(convert_to(coalesce(string_agg(h,',' ORDER BY h),''),'UTF8')),'hex') AS digest
            FROM (SELECT encode(sha256(convert_to(row_to_json(t)::text,'UTF8')),'hex') h
              FROM icc."TerraqoProfessionalDocument" t) hashes`)).rows[0];
          const backup = JSON.parse(readFileSync('C:/Users/Binv/.terraqo-private/migration-20261030T194418Z/source-checksums.json', 'utf8')).TerraqoProfessionalDocument;
          const localRoot = path.resolve('.next/local-media', store);
          const localCandidates = missingKeys.filter(key => {
            const candidate = path.resolve(localRoot, key);
            return candidate.startsWith(localRoot + path.sep) && existsSync(candidate);
          }).length;
          const otherStoreCandidates = missingKeys.filter(key => [...objectKeys].some(([name, keys]) => name !== store && keys.has(key))).length;
          report.documentDiagnostic = { documentSummary, audits, localCandidates, otherStoreCandidates,
            tableMatchesPrelaunchBackup: fingerprint.rows === backup.rows && fingerprint.digest === backup.digest,
            backupDate: '2026-10-30T19:44:18Z',
            interpretation: 'Matching database rows establish prelaunch references, not prelaunch blob absence. No content recovery or cause inferred.' };
        }
      }
      const attempts = (await db.query('SELECT a."storageKey",a.state, w.id IS NOT NULL AS withdrawn FROM icc."TerraqoEducationEvidenceAttempt" a LEFT JOIN icc."TerraqoEducationEvidenceWithdrawal" w ON w."attemptId"=a.id LIMIT 100001')).rows;
      assert.ok(attempts.length <= 100000);
      for (const withdrawn of [false, true]) inspect(withdrawn ? 'education-withdrawn-attempts' : 'education-attempts', 'terraqo-worklog-evidence', attempts.filter(a => a.withdrawn === withdrawn), false);
      const pending = (await db.query("SELECT token, expires < now() AS expired FROM icc.\"VerificationToken\" WHERE identifier LIKE 'experience-evidence-upload:%' LIMIT 100001")).rows;
      assert.ok(pending.length <= 100000); let malformed = 0; let uncertainWrites = 0;
      const pendingKeys = [];
      for (const row of pending) {
        try {
          assert.ok(row.token.length <= 32768); const value = JSON.parse(Buffer.from(row.token, 'base64url').toString('utf8'));
          assert.equal(value.v, 1); assert.equal(typeof value.uploadId, 'string');
          if (value.finalWrite || value.activeWrites?.length) uncertainWrites++;
          if (typeof value.storageKey === 'string') pendingKeys.push({ storageKey: value.storageKey });
        } catch { malformed++; }
      }
      inspect('experience-pending-final-keys', 'terraqo-worklog-evidence', pendingKeys, false);
      await db.query('ROLLBACK');
      report.limits[1] = 'Partial typed-reference reconciliation; no orphan classification';
      report.references = { checks, pendingReservations: pending.length, expiredReservations: pending.filter(r => r.expired).length, uncertainWrites, malformed,
        objectsOutsideCoveredReferences: [...referenced].map(([store, keys]) => ({ store, count: [...(objectKeys.get(store) || [])].filter(k => !keys.has(k)).length })),
        scope: 'Typed storageKey references, education withdrawal attempts and experience upload reservations. URL/JSON legacy references and cleanup audit records are not covered. No orphan or deletion determination.' };
    } finally { await db.end(); }
  }
  writeFileSync(process.argv.includes('--references') ? 'output/production-blob-reference-check.json' : 'output/production-blob-inventory.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  console.error(JSON.stringify({ inventoryFailed: true, name: error.name, status: error.status }));
  process.exitCode = 1;
}
