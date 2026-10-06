// The control for run-pool.mjs: a runner that hides a failure is worse than
// a slow one, so this drives the pool with small fake probes whose behavior
// is known and checks what it reports.
//
//   - probes really do overlap (otherwise nothing here tests anything)
//   - a probe that always fails makes the pool exit 1 and is named
//   - a probe that fails only when the machine is shared is rerun alone,
//     passes, and is NAMED as having needed that, never quietly forgiven
//   - a probe in the serial list runs with nothing else alive
//   - one probe's output is never interleaved with another's
//   - a probe that hangs is killed and failed
// No browser, about five seconds.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const pool = path.join(here, 'run-pool.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-pool-selftest-'));
const active = path.join(tmp, 'active');
fs.mkdirSync(active);
let failures = 0;
function ok(cond, msg) {
    if (!cond) { failures++; console.log('  FAIL  ' + msg); return; }
    console.log('  ok  ' + msg);
}

// Every fake probe checks in and out of a shared directory, so each can see
// who else is alive.
const preamble = `
import fs from 'node:fs';
import path from 'node:path';
const active = ${JSON.stringify(active)};
const me = path.basename(process.argv[1], '.mjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const others = () => fs.readdirSync(active).filter(n => n !== me);
fs.writeFileSync(path.join(active, me), '');
process.on('exit', () => { try { fs.unlinkSync(path.join(active, me)); } catch {} });
`;
const fake = {
    'steady-a': `for (let i = 1; i <= 3; i++) { console.log(me + ' line ' + i); await sleep(200); }
        if (others().length) fs.writeFileSync(path.join(${JSON.stringify(tmp)}, 'overlap-seen'), '');`,
    'steady-b': `for (let i = 1; i <= 3; i++) { console.log(me + ' line ' + i); await sleep(200); }`,
    'steady-c': `for (let i = 1; i <= 3; i++) { console.error(me + ' line ' + i); await sleep(200); }`,
    'steady-d': `for (let i = 1; i <= 3; i++) { console.log(me + ' line ' + i); await sleep(120); }`,
    // Passes only when it has the machine to itself.
    'shy': `await sleep(150); const o = others();
        if (o.length) { console.log('shy: not alone (' + o.join(',') + ')'); process.exit(1); }
        console.log('shy: alone, fine');`,
    'broken': `console.log('broken: this one always fails'); process.exit(3);`,
    // In the serial list: must never see anyone else.
    'needs-quiet': `await sleep(150); const o = others();
        if (o.length) { console.log('needs-quiet: NOT alone (' + o.join(',') + ')'); process.exit(1); }
        console.log('needs-quiet: alone');`,
    'hangs': `await sleep(60000);`
};
for (const [name, body] of Object.entries(fake))
    fs.writeFileSync(path.join(tmp, name + '.mjs'), preamble + body + '\n');
fs.writeFileSync(path.join(tmp, 'serial.txt'), '# test list\nneeds-quiet   # must be alone\n');

function run(names, env) {
    // A killed probe cannot check itself out; start every run with nobody in.
    for (const stale of fs.readdirSync(active)) fs.unlinkSync(path.join(active, stale));
    const res = spawnSync(process.execPath,
        [pool, '--dir', tmp, '--serial-file', path.join(tmp, 'serial.txt'), '--label', 'test: ', ...names],
        { encoding: 'utf8', env: { ...process.env, PS_JOBS: '3',
            // Never inherit the real suite's notes file or report directory:
            // the fake probes' reruns would be written into the suite's own
            // end-of-run summary (they were, Oct 5 2026).
            PS_POOL_NOTES: '', PS_POOL_REPORT_DIR: '', ...env } });
    return { code: res.status, out: (res.stdout || '') + (res.stderr || '') };
}
// The lines printed under one probe's header, up to the next header.
function block(out, header) {
    const lines = out.split('\n');
    const at = lines.indexOf(header);
    if (at < 0) return null;
    const rest = lines.slice(at + 1);
    const end = rest.findIndex(l => l.startsWith('== '));
    return rest.slice(0, end < 0 ? rest.length : end);
}

console.log('case 1: a standing failure fails the run, and everything else still reports');
const notes = path.join(tmp, 'notes.txt');
let r = run(['shy', 'steady-a', 'steady-b', 'steady-c', 'broken', 'needs-quiet', 'steady-d'],
            { PS_POOL_NOTES: notes, PS_POOL_REPORT_DIR: path.join(tmp, 'report') });
ok(r.code === 1, 'the pool exits 1 (' + r.code + ')');
ok(/FAILED: broken\b/.test(r.out), 'and names the probe that failed');
ok(/PROBE FAILED: broken \(exit 3/.test(r.out), 'with its exit code');
ok(block(r.out, '== test: broken (serial rerun)') !== null, 'after giving it a run alone');
ok(fs.existsSync(path.join(tmp, 'overlap-seen')), 'probes really ran at the same time');
ok(/passed on serial rerun 1, failed 1/.test(r.out), 'the summary counts one rerun and one failure');
ok(/failed in the pool, passed alone: shy\b/.test(r.out), 'the probe that needed a quiet machine is named');
ok(/PROBE FAILED: shy/.test(r.out) && /shy: alone, fine/.test(r.out), 'with both its failed and its passing run shown');
ok(/needs-quiet: alone\n/.test(r.out) && !/needs-quiet: NOT alone/.test(r.out),
   'the probe in the serial list ran with nothing else alive');
const order = r.out.split('\n').filter(l => l.startsWith('== test: ')).map(l => l.slice(9));
ok(order.indexOf('needs-quiet (alone)') > order.indexOf('steady-d'),
   'and after the pool had emptied');
let whole = true;
for (const name of ['steady-a', 'steady-b', 'steady-c', 'steady-d']) {
    const b = block(r.out, '== test: ' + name) || [];
    const mine = b.filter(l => l.trim());
    if (mine.length !== 3 || !mine.every((l, i) => l === name + ' line ' + (i + 1))) whole = false;
}
ok(whole, 'each probe\'s output is whole and in order, stdout and stderr alike');
ok(fs.existsSync(notes) && /shy/.test(fs.readFileSync(notes, 'utf8')), 'the rerun is written to the notes file');
const report = JSON.parse(fs.readFileSync(path.join(tmp, 'report', 'pool-test.json'), 'utf8'));
ok(report.results.broken.status === 'failed' && report.results.shy.status === 'passed on serial rerun' &&
   report.results['steady-a'].status === 'passed', 'and the JSON record carries each verdict');

console.log('case 2: without the broken probe the run is green, and still says what it reran');
r = run(['shy', 'steady-a', 'steady-b', 'steady-c', 'needs-quiet']);
ok(r.code === 0, 'the pool exits 0 (' + r.code + ')');
ok(/passed 4, passed on serial rerun 1, failed 0/.test(r.out), 'four passed outright, one on a rerun');
ok(!/^ +FAILED:/m.test(r.out), 'and no failure is listed');

console.log('case 3: a probe that hangs is killed and failed');
r = run(['steady-d', 'hangs'], { PS_PROBE_TIMEOUT_S: '1' });
ok(r.code === 1 && /PROBE FAILED: hangs \(killed after 1 s/.test(r.out), 'killed at the limit and reported (' + r.code + ')');
ok(/FAILED: hangs\b/.test(r.out), 'and it fails the run');

console.log('case 4: one worker is still a correct run');
r = run(['steady-a', 'shy', 'needs-quiet'], { PS_JOBS: '1' });
ok(r.code === 0 && /passed 3, passed on serial rerun 0, failed 0/.test(r.out),
   'with one worker nothing overlaps, so nothing needs a rerun');

fs.rmSync(tmp, { recursive: true, force: true });
if (failures) { console.log('\nrun-pool-selftest: ' + failures + ' FAILED'); process.exit(1); }
console.log('\nrun-pool-selftest: all cases passed');
