// stats-range-check.mjs - the widget's studentized-range probability
// (ptukey: Tukey HSD and Games-Howell adjusted p) against the references
// of stats-range.R, on the source and (--min) on the compiled bundle.
//
// The rendered fuzzer cannot hold this: its groups top out at 50 rows, so
// the error df never passes about 150, and a displayed "p < .001" hides
// any raw value. The fixed Simpson grid this replaced was 6e-5 off at
// df 1 and 0.18 off at df 1000 while every rendered check stayed green.
//
// Tolerances are absolute, on the upper tail the app displays:
//   exact  (k = 2, the two-sided t p):        1e-11
//   mix    (k = 3 to 6, R's chi mixture):     1e-9, that reference's accuracy
//   normal (k = 8 to 50 at df = Infinity):    1e-11
// Usage: node stats-range-check.mjs [refs.json] [--min]
import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
const argv = process.argv.slice(2);
const minified = argv.includes('--min');
const refs = JSON.parse(fs.readFileSync(argv.find(a => a !== '--min') || '/tmp/pandion-stats-range.json', 'utf8'));
let S;
if (!minified) {
    const src = fs.readFileSync('inst/widget/graphbuilder2.js', 'utf8');
    const start = src.indexOf('    var _gb2Stats = {'), end = src.indexOf('\n    };', start);
    assert(start >= 0 && end > start);
    S = new Function(src.slice(start, end + 7) + '\nreturn _gb2Stats;')();
} else {
    // The compiled artifact, found by its public method names (private
    // underscore names are mangled per build; ptukey is public).
    let acorn;
    for (const base of [process.env.GB2_PARSE_BASE, process.cwd(), '/private/tmp'].filter(Boolean)) {
        try { acorn = createRequire(path.join(base, 'x.js'))('acorn'); break; } catch {}
    }
    assert(acorn, 'acorn is required to verify the minified numerical core');
    const compiled = fs.readFileSync('inst/widget/graphbuilder2.min.js', 'utf8');
    const ast = acorn.parse(compiled, { ecmaVersion: 'latest' });
    function walk(node, visit) {
        if (!node || typeof node !== 'object') return;
        if (node.type) visit(node);
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(n => walk(n, visit));
            else if (value && typeof value === 'object') walk(value, visit);
        }
    }
    const key = property => property.key.name || property.key.value;
    const candidates = [];
    walk(ast, node => {
        if (node.type === 'ObjectExpression' && ['welchT', 'studentT', 'oneWayANOVA', 'ptukey'].every(
            name => node.properties.some(p => p.key && key(p) === name))) candidates.push(node);
    });
    assert.equal(candidates.length, 1, 'one compiled statistical core required');
    S = new Function('return (' + compiled.slice(candidates[0].start, candidates[0].end) + ');')();
}
assert.equal(typeof S.ptukey, 'function', 'ptukey required');
assert.equal(refs.schemaVersion, 1);
// Pin the full parameter grid, not only array lengths.
const DFS = [1, 1.3133734984249466, 1.5, 2, 3, 5, 10, 30, 100, 150, 200, 447,
    598, 999, 1000, 1001, 1197, 5000, 50000];
const QS = [.5, 1, 2, 3, 3.5, 4, 5.800019621705907, 8, 12, 25];
const exactGrid = [], mixGrid = [];
for (const df of DFS) for (const q of QS) exactGrid.push([q, df]);
for (const k of [3, 4, 5, 6]) for (const df of DFS) for (const q of QS) mixGrid.push([q, k, df]);
const normalGrid = [];
for (const k of [8, 10, 20, 50]) for (const w of [1, 2, 3, 4, 5, 6, 8]) normalGrid.push([w, k]);
assert.deepEqual(refs.exact.map(r => [r.q, r.df]), exactGrid);
assert.deepEqual(refs.mix.map(r => [r.q, r.k, r.df]), mixGrid);
assert.deepEqual(refs.normal.map(r => [r.q, r.k]), normalGrid);
let checks = 0, worst = 0;
const failures = [];
function near(got, expected, label, tolerance) {
    checks++;
    assert(Number.isFinite(expected) && expected >= 0 && expected <= 1, label + ': a probability reference is required');
    assert(Number.isFinite(got), label + ': finite result required');
    const err = Math.abs(got - expected);
    assert(err <= tolerance, `${label}: expected ${expected}, got ${got} (off by ${err.toExponential(2)})`);
    return err;
}
function check(fn) { try { worst = Math.max(worst, fn()); } catch (e) { failures.push(e.message); } }
for (const r of refs.exact)
    check(() => near(1 - S.ptukey(r.q, 2, r.df), r.p, `two groups q=${r.q} df=${r.df} (the t test p)`, 1e-11));
for (const r of refs.mix)
    check(() => near(1 - S.ptukey(r.q, r.k, r.df), r.p, `k=${r.k} q=${r.q} df=${r.df}`, 1e-9));
for (const r of refs.normal)
    check(() => near(1 - S.ptukey(r.q, r.k, Infinity), r.p, `k=${r.k} q=${r.q} df=Infinity`, 1e-11));
// The case that surfaced this (stats fuzz seed 20261110, a group of two
// against forty): the adjusted p must round the way the Welch p does.
check(() => {
    const p = 1 - S.ptukey(5.800019621705907, 2, 1.3133734984249466);
    checks++;
    assert.equal(p.toFixed(3), '0.105', 'seed 20261110 b_n2_vs_40 must display .105, got ' + p);
    return 0;
});
// Calibrate the checker itself: it must reject a missing reference, NaN,
// a reference that is not a probability, and an error just past each bar.
const guardStart = checks;
for (const [got, expected, tolerance] of [[.5, null, 1e-9], [NaN, .5, 1e-9], [.5, 1.5, 1e-9],
    [.5 + 2e-11, .5, 1e-11], [.5 + 2e-9, .5, 1e-9], [0, .2, 1e-9]])
    assert.throws(() => near(got, expected, 'negative control', tolerance));
near(.5 + 5e-12, .5, 'positive control', 1e-11);
assert.equal(checks - guardStart, 7);
console.log('RANGE CHECKER GUARDS: 7 passed');
for (const f of failures.slice(0, 12)) console.error('FAIL ' + f);
if (failures.length > 12) console.error('... and ' + (failures.length - 12) + ' more');
console.log(`RANGE CHECK (${minified ? 'minified' : 'source'}): ${checks} checks, ${failures.length} failures, worst passing error ${worst.toExponential(2)}`);
process.exitCode = failures.length ? 1 : 0;
