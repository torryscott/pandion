// Runs a list of probes several at a time.
//
// The feature probes are independent: each launches its own browser on its
// own copy of the page and shares no file, port or repository state with any
// other (checked Oct 2026: fixed temp paths are unique per probe, evidence
// files are named per suite, nothing rewrites the tree). Run one after
// another they take most of the suite's three hours, nearly all of it
// waiting. This runs them on a few workers instead.
//
// Three rules keep the verdict the same as the serial loop's:
//
//   1. Probes named in serial-probes.txt never share the machine. They hold
//      a millisecond ceiling or count animation frames, and a busy machine
//      fails them for no fault of the app. They run alone, after the pool.
//   2. A probe that fails in the pool is run again alone. If it passes alone
//      it is reported as "passed on serial rerun", by name, so load-induced
//      flakiness is visible and never silently forgiven. If it fails alone,
//      it failed.
//   3. Any failure that stands makes this exit 1, after every probe has run
//      and a summary names each one. Nothing is skipped and nothing is
//      swallowed: run-pool-selftest.mjs is the control for that.
//
// Usage (from the repository root, as run.sh does):
//   node standalone/verify/run-pool.mjs [--label "dist: "] probe-a probe-b ...
// Environment:
//   PS_JOBS            workers; a number, or "auto" (default): the machine's
//                      performance cores, at least 2 and at most 6.
//                      run.sh keeps its plain serial loop when this is 1.
//   PS_PROBE_TIMEOUT_S seconds before a probe is killed and failed (1800).
//   PS_POOL_NOTES      a file to append one line to when probes needed a
//                      serial rerun (run.sh prints it at the end).
//   PS_POOL_REPORT_DIR a directory for a JSON record of this run.
// Everything else (PS_PAGE, PS_A11Y_OUT, ...) passes through to the probes.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const argv = process.argv.slice(2);
let label = '', dir = 'standalone/verify', serialFile = path.join(here, 'serial-probes.txt');
const probes = [];
for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--label') label = argv[++i] || '';
    else if (argv[i] === '--dir') dir = argv[++i];
    else if (argv[i] === '--serial-file') serialFile = argv[++i];
    else probes.push(argv[i]);
}
if (!probes.length) { console.error('run-pool: no probes named'); process.exit(2); }

function autoJobs() {
    let n = 0;
    if (process.platform === 'darwin') {
        try { n = Number(execFileSync('sysctl', ['-n', 'hw.perflevel0.physicalcpu'], { encoding: 'utf8' }).trim()) || 0; }
        catch { n = 0; }
    }
    if (!n) n = Math.floor((os.cpus() || []).length / 2);
    return Math.max(2, Math.min(6, n || 2));
}
const wanted = String(process.env.PS_JOBS || 'auto');
const jobs = wanted === 'auto' ? autoJobs() : Math.max(1, Math.floor(Number(wanted)) || 1);
const timeoutMs = (Number(process.env.PS_PROBE_TIMEOUT_S) || 1800) * 1000;

// name -> reason. Lines are "name  # why it must run alone".
const serialWhy = new Map();
if (fs.existsSync(serialFile)) {
    for (const raw of fs.readFileSync(serialFile, 'utf8').split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const [name, ...why] = line.split('#');
        serialWhy.set(name.trim(), why.join('#').trim());
    }
}

const live = new Set();
function killAll() { for (const child of live) { try { child.kill('SIGKILL'); } catch { /* gone */ } } }
process.on('SIGINT', () => { killAll(); process.exit(130); });
process.on('SIGTERM', () => { killAll(); process.exit(143); });

function runOne(name) {
    return new Promise(resolve => {
        const started = Date.now();
        const chunks = [];
        const child = spawn(process.execPath, [path.join(dir, name + '.mjs')],
            { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
        live.add(child);
        child.stdout.on('data', d => chunks.push(d));
        child.stderr.on('data', d => chunks.push(d));
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; try { child.kill('SIGKILL'); } catch { /* gone */ } }, timeoutMs);
        const done = (code, signal) => {
            clearTimeout(timer);
            live.delete(child);
            resolve({ name, code: timedOut ? 124 : (code === null ? 1 : code), signal, timedOut,
                seconds: (Date.now() - started) / 1000, output: Buffer.concat(chunks).toString('utf8') });
        };
        child.on('error', err => { chunks.push(Buffer.from('run-pool: could not start: ' + err.message + '\n')); done(1, null); });
        child.on('close', done);
    });
}
// One probe's output is printed whole, when it finishes, so two probes never
// interleave. The header matches the serial loop's ("== name").
function show(result, note) {
    let text = '== ' + label + result.name + (note ? ' (' + note + ')' : '') + '\n' + result.output;
    if (!text.endsWith('\n')) text += '\n';
    if (result.code !== 0)
        text += 'PROBE FAILED: ' + result.name + ' (' +
            (result.timedOut ? 'killed after ' + Math.round(timeoutMs / 1000) + ' s' : 'exit ' + result.code) +
            ', ' + result.seconds.toFixed(0) + ' s)\n';
    process.stdout.write(text);
}

const t0 = Date.now();
const pooled = probes.filter(p => !serialWhy.has(p));
const alone = probes.filter(p => serialWhy.has(p));
const record = new Map();      // name -> { status, seconds, rerun }
console.log('== ' + label + 'probe pool: ' + probes.length + ' probes, ' + jobs + ' at a time, ' +
    alone.length + ' held to run alone');

// 1. The pool.
const failedInPool = [];
let next = 0;
async function worker() {
    while (next < pooled.length) {
        const name = pooled[next++];
        const result = await runOne(name);
        show(result);
        if (result.code === 0) record.set(name, { status: 'passed', seconds: result.seconds });
        else failedInPool.push(result);
    }
}
await Promise.all(Array.from({ length: Math.min(jobs, pooled.length) }, worker));
const poolSeconds = (Date.now() - t0) / 1000;

// 2. The probes that must have the machine to themselves.
const failed = [];
for (const name of alone) {
    const result = await runOne(name);
    show(result, 'alone');
    if (result.code === 0) record.set(name, { status: 'passed', seconds: result.seconds, alone: true });
    else { failed.push(result); record.set(name, { status: 'failed', seconds: result.seconds, alone: true, code: result.code }); }
}

// 3. Anything the pool failed gets one run alone before it counts.
const reran = [];
for (const first of failedInPool) {
    const result = await runOne(first.name);
    show(result, 'serial rerun');
    if (result.code === 0) {
        reran.push(first.name);
        record.set(first.name, { status: 'passed on serial rerun', seconds: result.seconds, firstCode: first.code });
    } else {
        failed.push(result);
        record.set(first.name, { status: 'failed', seconds: result.seconds, code: result.code });
    }
}

const wall = (Date.now() - t0) / 1000;
const clock = s => Math.floor(s / 60) + 'm ' + String(Math.round(s % 60)).padStart(2, '0') + 's';
const slowest = [...record.entries()].sort((a, b) => b[1].seconds - a[1].seconds).slice(0, 5)
    .map(([name, r]) => name + ' ' + r.seconds.toFixed(0) + 's').join(', ');
console.log('== ' + label + 'probe pool summary');
console.log('   ' + probes.length + ' probes in ' + clock(wall) + ' (' + jobs + ' at a time; the pool itself ' + clock(poolSeconds) + ')');
console.log('   passed ' + (probes.length - failed.length - reran.length) +
    ', passed on serial rerun ' + reran.length + ', failed ' + failed.length);
if (reran.length) console.log('   failed in the pool, passed alone: ' + reran.join(', '));
console.log('   slowest: ' + slowest);
if (reran.length && process.env.PS_POOL_NOTES) {
    try {
        fs.appendFileSync(process.env.PS_POOL_NOTES, (label || 'source: ') + reran.length +
            ' probe(s) failed in the pool and passed alone: ' + reran.join(', ') + '\n');
    } catch { /* a note, not a verdict */ }
}
if (process.env.PS_POOL_REPORT_DIR) {
    try {
        fs.mkdirSync(process.env.PS_POOL_REPORT_DIR, { recursive: true });
        const slug = (label || 'source').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'source';
        fs.writeFileSync(path.join(process.env.PS_POOL_REPORT_DIR, 'pool-' + slug + '.json'),
            JSON.stringify({ label, jobs, wallSeconds: wall, poolSeconds,
                results: Object.fromEntries(record) }, null, 2) + '\n');
    } catch { /* a record, not a verdict */ }
}
if (failed.length) {
    console.log('   FAILED: ' + failed.map(r => r.name).join(', '));
    process.exit(1);
}
