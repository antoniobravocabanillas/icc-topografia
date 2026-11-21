import assert from 'node:assert/strict';
import test from 'node:test';
import { targetConfiguration, pinnedDatabaseCa } from './apply-s18-staging-migration.mjs';

const target = 'postgresql://postgres.mghdpciewbsowjrjwmwk:synthetic@aws-1-sa-east-1.pooler.supabase.com:5432/postgres';
test('operator trusts only the pinned, unexpired official Supabase root', async () => {
  assert.match(await pinnedDatabaseCa(), /BEGIN CERTIFICATE/);
});
test('staging operator fixes identity and verified TLS; never forwards URL options', () => {
  const configuration = targetConfiguration(target + '?sslmode=require&schema=icc');
  assert.equal(configuration.user, 'postgres.mghdpciewbsowjrjwmwk');
  assert.deepEqual(configuration.ssl, { rejectUnauthorized: true });
  assert.equal(configuration.database, 'postgres');
  assert.equal(configuration.options, '-c client_encoding=UTF8');
  assert.equal(configuration.connectionString, undefined);
});
test('staging operator rejects another project, role, endpoint, transaction pooler and SQL options', () => {
  for (const invalid of [
    target.replace('mghdpciewbsowjrjwmwk', 'anotherproject'), target.replace('postgres.', 'terraqo_staging_runtime.'),
    target.replace(':5432', ':6543'), target.replace('/postgres', '/production'),
    target.replace('aws-1-sa-east-1.pooler.supabase.com', 'example.invalid'),
    target + '?options=-c%20role%3Dsuperuser', target + '?sslmode=disable', target + '#fragment',
  ]) assert.throws(() => targetConfiguration(invalid));
});
