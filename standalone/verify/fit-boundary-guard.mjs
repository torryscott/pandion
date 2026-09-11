// The verifier must reject incomplete evidence and wrong/undefined bands.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const input = process.argv[2] || '/tmp/pandion-fit-boundary';
const baseline = JSON.parse(fs.readFileSync(path.join(input, 'expected.json'), 'utf8'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pandion-fit-guard-'));
const cases = [
    ['valid baseline', () => {}, 0],
    ['missing case', v => { delete v.cases.ols1_level95; }, 1],
    ['missing fitted reference', v => { delete v.cases.ols1_level95.reference.ys; }, 1],
    ['empty band reference', v => { v.cases['loess_regular_0.75_0.95'].reference.lwrs = []; }, 1],
    ['nonfinite reference', v => { v.cases.ols2_level95.reference.ys[0] = null; }, 1],
    ['wrong band', v => { v.cases['loess_regular_0.75_0.95'].hostFits[0].points.lwrs[0] += .1; }, 1],
    ['invented zero-df band', v => { v.cases.ols3_zero_df.hostFits[0].points.lwrs = v.cases.ols3_zero_df.reference.ys; }, 1],
    ['suppressed availability', v => { v.cases['loess_regular_0.75_0.95'].available = false; v.cases['loess_regular_0.75_0.95'].hostFits = []; }, 1]
];
try {
    for (const [name, edit, expected] of cases) {
        const value = structuredClone(baseline); edit(value);
        fs.writeFileSync(path.join(dir, 'expected.json'), JSON.stringify(value));
        const result = spawnSync(process.execPath, ['standalone/verify/fit-boundary-check.mjs', dir, '--unit'], { encoding: 'utf8' });
        assert.equal(result.status, expected, name + '\n' + result.stdout + result.stderr);
    }
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
console.log(`FIT CHECKER GUARDS: ${cases.length} passed`);
