import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { prepareArtifact } from './prepare-s18-lifecycle-staging-migration.mjs';
import { main } from './rehearse-s18-staging-local.mjs';

// Constructs the reviewed SQL offline and executes it only in the owned loopback cluster.
try {
  assert.equal(process.argv.length, 6);
  const [, , backup, auditPath, candidate, confirmation] = process.argv;
  assert.equal(confirmation, '--confirm=local-s18-only');
  const artifact = await prepareArtifact(JSON.parse(await readFile(path.resolve(auditPath), 'utf8')), candidate);
  await main([backup, confirmation], artifact);
} catch (error) {
  if (/^S18 local rehearsal failed during [a-zA-Z0-9 /()\-]+; no database payload logged$/.test(error.message)) console.error(error.message);
  console.error('S18 release rehearsal failed; inspect sanitized phase output. No remote execution supported.');
  process.exitCode = 1;
}
