import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getDeployStore } from '@netlify/blobs';

// Operator-side read only. Personal API authority is never passed to a build.
async function main() {
  const [deployId, run, commit, ...extra] = process.argv.slice(2);
  assert.equal(extra.length, 0);
  assert.match(deployId || '', /^[a-f0-9]{24}$/);
  assert.match(run || '', /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.match(commit || '', /^[a-f0-9]{40}$/);
  assert.ok(!process.env.NETLIFY_BLOBS_CONTEXT && !process.env.NETLIFY, 'Run outside the build');
  const siteId = '6b8c43fb-6083-450a-9b85-46a820fb6358';
  const require = createRequire(new URL('../node_modules/netlify-cli/package.json', import.meta.url));
  const { getAPIToken } = await import(pathToFileURL(require.resolve('@netlify/dev-utils')).href);
  const { NetlifyAPI } = await import(pathToFileURL(require.resolve('@netlify/api')).href);
  const token = await getAPIToken();
  const api = new NetlifyAPI(token);
  const deploy = await api.getDeploy({ deploy_id: deployId });
  assert.equal(deploy.site_id, siteId);
  assert.equal(deploy.commit_ref, commit);
  assert.equal(deploy.branch, 'codex/s22-evaluator-local');
  const store = getDeployStore({ name: 's18-acceptance', deployID: deployId, siteID: siteId, token,
    fetch: (url, init) => {
      assert.ok(['GET', 'HEAD'].includes(init?.method || 'GET'));
      return fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(30000) });
    } });
  const manifest = await store.get(`${run}/manifest.json`, { type: 'json' });
  assert.ok(manifest, 'Missing manifest: export is incomplete');
  assert.equal(manifest.siteId, siteId); assert.equal(manifest.deployId, deployId);
  assert.equal(manifest.commit, commit); assert.equal(manifest.run, run);
  assert.ok(Array.isArray(manifest.files) && manifest.files.length >= 2 && manifest.files.length <= 20);
  const names = new Set(); let total = 0; const files = [];
  for (const file of manifest.files) {
    assert.match(file.name, /^(?:intent\.json|receipt\.json|(?:initial|replaced|withdrawn|access|plan)-(?:1440|375|320)\.png)$/);
    assert.ok(!names.has(file.name)); names.add(file.name);
    assert.ok(Number.isSafeInteger(file.size) && file.size >= 0 && file.size <= 10 * 1024 * 1024);
    total += file.size; assert.ok(total <= 30 * 1024 * 1024);
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    const content = await store.get(`${run}/${file.name}`, { type: 'arrayBuffer' });
    assert.ok(content); const bytes = Buffer.from(content);
    assert.equal(bytes.length, file.size);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
    files.push({ name: file.name, bytes });
  }
  assert.ok(names.has('receipt.json') && names.has('intent.json'));
  const directory = path.resolve('output/s18-hosted-download', run);
  await mkdir(path.dirname(directory), { recursive: true });
  await mkdir(directory); // Never overwrite evidence from another read.
  for (const file of files) await writeFile(path.join(directory, file.name), file.bytes, { flag: 'wx' });
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
  const receipt = JSON.parse(files.find(file => file.name === 'receipt.json').bytes.toString('utf8'));
  console.log(JSON.stringify({ directory, files: files.length, hashesVerified: true,
    passed: receipt.passed === true, phase: receipt.phase, deployId, commit, run }));
}
main().catch(error => { console.error('S18 evidence read failed', { code: error.code || 'READ_REJECTED' }); process.exitCode = 1; });
