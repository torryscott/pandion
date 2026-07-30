// Unit test for _gb2CatLabelStride, the crowded-category label thinning
// decision (Jul 2026, Torry). Extract-and-eval of a PURE function, the
// _gb2ApaHtml idiom: it takes four numbers and returns a stride, so it can
// be checked exhaustively without a browser, at edge values no rendered
// fixture can reach (zero pitch, the two-name floor, a missing angle).
//
// The end-to-end behaviour - which labels actually draw, that every tick
// survives, and that the Check-graph note quotes the same number - lives in
// pedagogy-check.mjs's axisThin cases and runs against both bundles.
//
// Reads the SOURCE bundle on purpose: the minifier mangles local function
// names, so name-based extraction only works pre-minify. The math is
// identical in both by construction.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..', '..');
const src = fs.readFileSync(
    path.join(ROOT, 'inst', 'widget', 'graphbuilder2.js'), 'utf8');

const START = '            function _gb2CatLabelStride(';
const i = src.indexOf(START);
if (i < 0) {
    console.error('_gb2CatLabelStride not found in the bundle source - was it ' +
        'renamed? Update this probe or the render, but do not delete the test.');
    process.exit(1);
}
const END = '\n            }\n';
const j = src.indexOf(END, i);
if (j < 0) { console.error('could not find the end of _gb2CatLabelStride'); process.exit(1); }
const fnSrc = src.slice(i, j + END.length);
// eslint-disable-next-line no-eval
const _gb2CatLabelStride = eval('(' + fnSrc.trim().replace(/^function /, 'function ') + ')');

let failures = 0;
function ok(cond, msg) {
    if (cond) console.log('  ok   ' + msg);
    else { console.log('  FAIL ' + msg); failures++; }
}

// [nCats, pitchPx, fontPx, angleDeg, expected, note]
const CASES = [
    [3, 200, 14, -45, 1, 'a few categories, rotated: everything fits'],
    [40, 15, 14, -45, 2, '40 names at 15px pitch: rotated need is ~22.8px'],
    [137, 4.4, 14, -45, 6, "Torry's ID accident: 137 names in ~600px"],
    [30, 20, 14, -45, 2, '30 names at 20px pitch'],
    [30, 25, 14, -45, 1, '25px pitch clears the 22.8px need: no thinning'],
    [30, 20, 22, -45, 2, 'a bigger face needs more room at the same pitch'],
    [40, 9.6, 14, 0, 2, 'horizontal mode stacks: one 16.1px line vs 9.6px pitch'],
    [40, 20, 14, 0, 1, 'horizontal mode at 20px pitch clears one line'],
    [40, 15, 14, undefined, 1, 'no angle given: refuse (it is a width question)'],
    [40, 15, 14, 0.3, 1, 'a hair of rotation: refuse for the same reason'],
    [4, 1, 14, -45, 2, 'the floor: 4 categories can thin no harder than every 2nd'],
    [2, 1, 14, -45, 1, 'two categories are never thinned'],
    [40, 0, 14, -45, 1, 'zero pitch: no crash, no thinning'],
    [40, 15, NaN, -45, 2, 'a bad font size falls back to 14'],
];
console.log('case 1: the stride decision at known geometry');
for (const [n, p, f, a, want, note] of CASES) {
    const got = _gb2CatLabelStride(n, p, f, a);
    ok(got === want, `k=${got} (want ${want}): ${note}`);
}

console.log('case 2: invariants across the whole plausible space');
let range = 0, floor2 = 0, sweep = 0;
for (let n = 3; n <= 400; n += 7) {
    for (let p = 0.25; p < 60; p += 0.75) {
        for (const a of [-45, 0, -90, -30]) {
            for (const f of [8, 14, 22, 36]) {
                const k = _gb2CatLabelStride(n, p, f, a);
                sweep++;
                if (!(Number.isInteger(k) && k >= 1 && k <= n)) range++;
                if (Math.ceil(n / k) < 2) floor2++;
            }
        }
    }
}
ok(range === 0, `the stride is always a whole number in [1, nCats] (${sweep} points)`);
ok(floor2 === 0, 'and never thins an axis below two printed names');

console.log('case 3: thinning is monotone in crowding');
// Squeezing the pitch can only ever ask for the same stride or a bigger one.
let mono = 0;
for (let n = 12; n <= 200; n += 11) {
    let prev = 1;
    for (let p = 40; p >= 1; p -= 0.5) {
        const k = _gb2CatLabelStride(n, p, 14, -45);
        if (k < prev) mono++;
        prev = k;
    }
}
ok(mono === 0, 'a tighter axis never asks for FEWER names to be dropped');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nCAT STRIDE UNIT PASS');
process.exit(failures ? 1 : 0);
