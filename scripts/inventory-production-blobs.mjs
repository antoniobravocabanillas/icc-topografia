import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { getStore, listStores } from '@netlify/blobs';

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
  const stores = [];
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
    stores.push({ store: known.includes(name) ? name : `unmapped-${digest(name).slice(0, 16)}`, mapped: known.includes(name), objects: entries.size,
      fingerprint: digest(JSON.stringify([...entries].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))) });
  }
  const report = { at: new Date().toISOString(), siteID, deploy: site.published_deploy.id, readOnly: true, bodiesDownloaded: false,
    consistentSnapshot: false, stores, configuredStoresNotListed: known.filter(n => !names.has(n)), totalObjects: stores.reduce((n, s) => n + s.objects, 0),
    limits: ['Live listing is not an atomic snapshot', 'No database-reference reconciliation or orphan classification', 'No blob backup or recovery test'] };
  writeFileSync('output/production-blob-inventory.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  console.error(JSON.stringify({ inventoryFailed: true, name: error.name, status: error.status }));
  process.exitCode = 1;
}
