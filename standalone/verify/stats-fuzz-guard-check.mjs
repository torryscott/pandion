// Verify the verifier: real rendered Holm cells are removed deliberately.
// The ordinary replay must fail specifically on the missing adjusted p.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const refs = JSON.parse(fs.readFileSync(process.argv[2] || '/tmp/gb2-stats-fuzz.json', 'utf8'));
const entry = Object.entries(refs.datasets).find(([, ds]) =>
  Object.values(ds.adjust?.holm || {}).filter(Number.isFinite).length > 1);
assert.ok(entry, 'R fixture must contain a multi-comparison Holm family');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pandion-stats-guard-'));
try {
  const fixture = path.join(dir, 'refs.json');
  fs.writeFileSync(fixture, JSON.stringify({ seed: refs.seed,
    datasets: { [entry[0]]: entry[1] }, corrs: {}, rmsets: {}, lksets: {} }));
  const replay = new URL('./stats-fuzz-check.mjs', import.meta.url);
  const r = spawnSync(process.execPath, [fileURLToPath(replay), fixture], {
    env: { ...process.env, PS_FUZZ_NEGATIVE_CONTROL: 'holm' },
    encoding: 'utf8', timeout: 90000
  });
  assert.equal(r.status, 1, 'missing rendered results must make replay fail: ' + r.stdout + r.stderr);
  const failures = r.stdout.split('\n').filter(line => /  FAIL /.test(line));
  assert.ok(failures.length > 0 && failures.every(line => /holm p\(adj\).*shown ""/.test(line)),
    'negative control must fail for missing Holm results, not an unrelated error: ' + failures.join('\n'));
  console.log('STATS FUZZ GUARD PASS (' + failures.length + ' missing results detected)');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
