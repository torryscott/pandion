import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
const refs = JSON.parse(fs.readFileSync(process.argv[2] || '/tmp/pandion-stats-tail.json', 'utf8'));
const src = fs.readFileSync('inst/widget/graphbuilder2.js', 'utf8');
const start = src.indexOf('    var _gb2Stats = {'), end = src.indexOf('\n    };', start);
assert(start >= 0 && end > start);
let S = new Function(src.slice(start, end + 7) + '\nreturn _gb2Stats;')();
const minified = process.argv.includes('--min');
if (minified) {
    // Parse the compiled artifact, without depending on minified variable or
    // private-property names. This verifies raw probabilities that the UI's
    // "p < .001" formatting cannot distinguish from an erroneous zero.
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
    const candidates = [];
    const key = property => property.key.name || property.key.value;
    walk(ast, node => {
        if (node.type === 'ObjectExpression' && ['welchT','studentT','pairedT','oneWayANOVA','fSurvival'].every(
            name => node.properties.some(p => p.key && key(p) === name))) candidates.push(node);
    });
    assert.equal(candidates.length, 1, 'one compiled statistical core required');
    const object = candidates[0];
    const welch = object.properties.find(p => key(p) === 'welchT');
    const calls = [];
    walk(welch.value, node => {
        if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' &&
            node.callee.object.type === 'ThisExpression' && node.arguments.length === 3 &&
            node.arguments[2].type === 'LogicalExpression' && node.arguments[2].right.value === 'two') calls.push(node);
    });
    assert.equal(calls.length, 1, 'compiled Welch test must call its three-argument tail function');
    S = new Function('return (' + compiled.slice(object.start, object.end) + ');')();
    const tailName = calls[0].callee.property.name || calls[0].callee.property.value;
    assert.equal(typeof S[tailName], 'function', 'compiled tail function required');
    S._tTailP = S[tailName];
}
assert.equal(refs.schemaVersion, 1);
assert.equal(refs.ts.length, 63); assert.equal(refs.fs.length, 120); assert.equal(refs.tests.length, 90);
// Pin the full parameter grid, not only array lengths (duplicating a case
// must not stand in for missing boundary coverage).
const tGrid = [], fGrid = [], testGrid = [];
for (const df of [.5, 1, 2, 5, 30, 100, 1000]) for (const t of [-100,-12,-8,-2,0,2,8,12,100]) tGrid.push([df,t]);
for (const d1 of [1,2,5,10]) for (const d2 of [.5,1,10,100,1000]) for (const f of [0,.01,1,10,100,1e6]) fGrid.push([d1,d2,f]);
for (const n of [3,20,60]) for (const shift of [.2,5,30]) {
    for (const method of ['welch','student','paired']) for (const tail of ['two','greater','less']) testGrid.push([n,shift,method,tail]);
    testGrid.push([n,shift,'anova',undefined]);
}
assert.deepEqual(refs.ts.map(r => [r.df,r.t]), tGrid);
assert.deepEqual(refs.fs.map(r => [r.df1,r.df2,r.f]), fGrid);
assert.deepEqual(refs.tests.map(r => [r.n,r.shift,r.method,r.tail]), testGrid);
let checks = 0, failures = [];
function near(got, expected, label, relative = 2e-8) {
    checks++;
    assert(Number.isFinite(expected), label + ': finite reference required');
    assert(Number.isFinite(got), label + ': finite result required');
    // The subnormal floor permits at most eight representable steps, not a
    // macroscopic epsilon that would erase small but representable p values.
    assert(Math.abs(got - expected) <= relative * Math.abs(expected) + 8 * Number.MIN_VALUE,
        `${label}: expected ${expected}, got ${got}`);
}
function check(fn) { try { fn(); } catch (e) { failures.push(e.message); } }
for (const r of refs.ts) for (const tail of ['two','greater','less'])
    check(() => near(S._tTailP(r.t,r.df,tail), r[tail], `t(${r.t},${r.df})/${tail}`));
for (const r of refs.fs)
    check(() => near(S.fSurvival ? S.fSurvival(r.f,r.df1,r.df2) : 1-S.fCDF(r.f,r.df1,r.df2), r.p, `F(${r.f},${r.df1},${r.df2})`));
for (const r of refs.tests) check(() => {
    const label = `${r.method}/n${r.n}/shift${r.shift}/${r.tail || ''}`;
    if (r.method === 'anova') {
        const got = S.oneWayANOVA([r.x,r.y]); assert(got, label + ': result required');
        near(got.F,r.f,label + '/F'); near(got.df1,r.df1,label + '/df1'); near(got.df2,r.df2,label + '/df2'); near(got.p,r.p,label + '/p');
    } else {
        const got = S[{welch:'welchT',student:'studentT',paired:'pairedT'}[r.method]](r.x,r.y,r.tail);
        assert(got, label + ': result required');
        near(got.t,r.t,label + '/t'); near(got.df,r.df,label + '/df'); near(got.p,r.p,label + '/p');
    }
});
// Calibrate the checker itself: reject missing references, NaN, incorrect
// zeros and bad relative errors even far below the old absolute tolerance.
const guardStart = checks;
for (const [got, expected] of [[0,1e-200], [1e-40,2e-40], [null,.5], [.5,null], [NaN,.5], [.5,Infinity]])
    assert.throws(() => near(got, expected, 'negative control'));
near(1e-200, 1e-200, 'positive tiny-tail control');
assert.equal(checks - guardStart, 7);
console.log('TAIL CHECKER GUARDS: 7 passed');
for (const f of failures) console.error('FAIL ' + f);
console.log(`TAIL CHECK (${minified ? 'minified' : 'source'}): ${checks} checks, ${failures.length} failures`);
process.exitCode = failures.length ? 1 : 0;
