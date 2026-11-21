import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const siteId = '6b8c43fb-6083-450a-9b85-46a820fb6358';
const origin = 'https://terraqo-platform-staging.netlify.app';
const branch = 'codex/s22-evaluator-local';
async function main() {
  const [mode, candidate] = process.argv.slice(2);
  assert.ok(['inspect', 'configure', 'trigger'].includes(mode));
  const require = createRequire(new URL('../node_modules/netlify-cli/package.json', import.meta.url));
  const { getAPIToken } = await import(pathToFileURL(require.resolve('@netlify/dev-utils')).href);
  const { NetlifyAPI } = await import(pathToFileURL(require.resolve('@netlify/api')).href);
  // Token belongs only to this management process; no build/CLI/package resolution child is spawned.
  const api = new NetlifyAPI(await getAPIToken());
  const site = await api.getSite({ site_id: siteId });
  assert.equal(site.name, 'terraqo-platform-staging'); assert.equal(site.ssl_url, origin);
  assert.equal(site.build_settings.repo_path, 'antoniobravocabanillas/icc-topografia');
  assert.equal(site.build_settings.repo_branch, branch);
  const args = { accountId: site.account_slug, siteId };
  let entries = await api.getEnvVars(args);
  const values = () => Object.fromEntries(entries.map(entry => [entry.key, entry.values?.find(value => value.context === 'production')?.value ?? entry.values?.find(value => value.context === 'all')?.value]));
  const env = values();
  assert.equal(env.PLATFORM_STAGING_SUPABASE_PROJECT_REF, 'mghdpciewbsowjrjwmwk');
  assert.equal(env.PLATFORM_STAGING_DATABASE_ROLE, 'terraqo_staging_runtime');
  assert.equal(env.PLATFORM_STAGING_ALLOW_REMOTE, 'true');
  for (const key of ['AUTH_URL', 'NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_PORTAL_URL', 'NEXT_PUBLIC_ADMIN_URL', 'NEXT_PUBLIC_API_URL']) assert.equal(env[key], origin);
  if (mode === 'inspect') {
    console.log(JSON.stringify({ siteId, branch, servedDeploy: site.published_deploy?.id, servedCommit: site.published_deploy?.commit_ref,
      settings: Object.fromEntries(['S18_STAGING_GATE','TERRAQO_DOCUMENT_LIFECYCLE_V1','CULQI_MODE','TERRAQO_TRANSACTIONAL_EMAIL_ENABLED'].map(key => [key, env[key] ?? null])),
      credentialsPresent: Object.fromEntries(['DATABASE_URL','B5_GATE_DATABASE_URL','AUTH_SECRET','RESEND_API_KEY','CULQI_PUBLIC_KEY','CULQI_SECRET_KEY'].map(key => [key, Boolean(env[key])])) }));
    return;
  }
  assert.match(candidate || '', /^[a-f0-9]{40}$/);
  const git = args => execFileSync('git', args, { encoding: 'utf8', windowsHide: true }).trim();
  assert.equal(git(['rev-parse', 'HEAD']), candidate);
  assert.equal(git(['branch', '--show-current']), branch);
  assert.equal(git(['status', '--porcelain']), '');
  const expected = { S18_STAGING_GATE: 'preflight', S18_STAGING_RETENTION: 'off',
    S22_STAGING_CANDIDATE_SHA: candidate, PLATFORM_STAGING_CLOUD_PHASE: 'workspace-administration',
    TERRAQO_DOCUMENT_LIFECYCLE_V1: 'true', TERRAQO_SCOPED_SHARING_V1: 'true', TERRAQO_WORKSPACE_EVALUATORS_V1: 'true',
    TERRAQO_TRANSACTIONAL_EMAIL_ENABLED: 'false', TERRAQO_STAGING_INVITATION_PROBE: 'false', CULQI_MODE: 'test',
    S24_STAGING_DIAGNOSTIC_TARGET: 'off', S24_STAGING_RECOVER_INTERRUPTED: 'off',
    ...Object.fromEntries(entries.filter(entry => /^S(?:0[6-9]|1[0-6])_.*GATE$/.test(entry.key)).map(entry => [entry.key, 'off'])) };
  await mkdir('output/s18-deploy', { recursive: true });
  if (mode === 'configure') {
    await writeFile(`output/s18-deploy/before-${Date.now()}.json`, JSON.stringify({ siteId, candidate,
      previousDeploy: site.published_deploy?.id, values: Object.fromEntries(Object.keys(expected).map(key => [key, env[key] ?? null])) }, null, 2), { flag: 'wx' });
    expected.S18_STAGING_RUN_ID = randomUUID();
    for (const [key, value] of Object.entries(expected)) {
      if (entries.some(entry => entry.key === key)) await api.setEnvVarValue({ ...args, key, body: { context: 'production', value } });
      else await api.createEnvVars({ ...args, body: [{ key, scopes: ['builds', 'functions', 'post_processing', 'runtime'], values: [{ context: 'production', value }] }] });
    }
    entries = await api.getEnvVars(args);
  }
  for (const [key, value] of Object.entries(expected)) assert.equal(values()[key], value);
  if (mode === 'trigger') {
    assert.equal(git(['ls-remote', 'origin', `refs/heads/${branch}`]).split(/\s+/)[0], candidate);
    const build = await api.createSiteBuild({ site_id: siteId, body: { clear_cache: true } });
    const receipt = { siteId, candidate, buildId: build.id, deployId: build.deploy_id };
    await writeFile('output/s18-deploy/build.json', JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify(receipt));
  } else console.log(JSON.stringify({ configured: true, siteId, candidate, acceptancePending: true }));
}
main().catch(error => { console.error('S18 staging deploy stopped', { code: typeof error.code === 'string' ? error.code : undefined, status: error.status }); process.exitCode = 1; });
