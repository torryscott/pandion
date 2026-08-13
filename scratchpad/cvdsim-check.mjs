// Punch list t4-145: the CVD simulator follows the published reference
// transforms exactly. The engine's _simulateCvd is extracted and swept
// against an INDEPENDENT translation of libDaltonLens.c (public domain:
// Vienot 1999 protan/deutan, Brettel 1997 two-plane tritan) - every
// color of a 17^3 cube must round-trip to the identical hex. Also pins
// the tritan plane switch, achromatopsia's equal-luminance gray, and a
// pair of ground-truth verdicts the old improvised matrices got wrong.
import fs from 'node:fs';

function ok(cond, msg) {
    if (!cond) throw new Error(msg);
    console.log('  ok  ' + msg);
}

const src = fs.readFileSync(new URL('../inst/widget/graphbuilder2.js',
    import.meta.url), 'utf8');
const grab = (name) => {
    const i = src.indexOf('function ' + name);
    if (i < 0) throw new Error('missing fn ' + name);
    let d = 0, j = i;
    do { const c = src[j]; if (c === '{') d++; else if (c === '}') d--; j++; }
    while (j < src.length && (d > 0 || src[j - 1] !== '}'));
    return src.slice(i, j);
};
// The engine's sim + the two constant tables it closes over.
for (const v of ['_CVD_MATRICES', '_CVD_TRITAN']) {
    const i = src.indexOf('var ' + v);
    if (i < 0) throw new Error('missing ' + v +
        ' (control run? the reference tables are gone)');
    const e = src.indexOf('};', i) + 2;
    (0, eval)(src.slice(i, e).replace('var ' + v, 'globalThis.' + v));
}
for (const f of ['_clampByte', 'hexToRgb', 'rgbToHex', '_srgbToLin',
                 '_linToSrgb', '_okS2L', '_okRgb2Lab', '_okHex2Lab',
                 '_okDist', '_simulateCvd'])
    (0, eval)(grab(f) + ';globalThis.' + f + '=' + f);

// ---- Independent reference (translated from libDaltonLens.c). ----
const V = {
    protanopia: [0.11238, 0.88762, 0.00000,
                 0.11238, 0.88762, -0.00000,
                 0.00401, -0.00401, 1.00000],
    deuteranopia: [0.29275, 0.70725, 0.00000,
                   0.29275, 0.70725, -0.00000,
                   -0.02234, 0.02234, 1.00000],
};
const T = {
    p1: [1.01277, 0.13548, -0.14826,
         -0.01243, 0.86812, 0.14431,
         0.07589, 0.80500, 0.11911],
    p2: [0.93678, 0.18979, -0.12657,
         0.06154, 0.81526, 0.12320,
         -0.37562, 1.12767, 0.24796],
    n: [0.03901, -0.02788, -0.01113],
};
function refSim(hex, mode) {
    const c = hexToRgb(hex);
    const rgb = [_srgbToLin(c.r), _srgbToLin(c.g), _srgbToLin(c.b)];
    let m;
    if (mode === 'tritanopia') {
        const dot = rgb[0] * T.n[0] + rgb[1] * T.n[1] + rgb[2] * T.n[2];
        m = dot >= 0 ? T.p1 : T.p2;
    } else m = V[mode];
    return rgbToHex(
        _linToSrgb(m[0] * rgb[0] + m[1] * rgb[1] + m[2] * rgb[2]),
        _linToSrgb(m[3] * rgb[0] + m[4] * rgb[1] + m[5] * rgb[2]),
        _linToSrgb(m[6] * rgb[0] + m[7] * rgb[1] + m[8] * rgb[2]));
}

console.log('case 1: the engine matches the reference across the color cube');
let mismatches = 0, checked = 0, example = '';
for (const mode of ['protanopia', 'deuteranopia', 'tritanopia']) {
    for (let r = 0; r <= 255; r += 16) for (let g = 0; g <= 255; g += 16)
    for (let b = 0; b <= 255; b += 16) {
        const hex = rgbToHex(r, g, b);
        checked++;
        const ours = _simulateCvd(hex, mode), ref = refSim(hex, mode);
        if (ours !== ref && !example) example = `${hex} ${mode}: ${ours} vs ${ref}`;
        if (ours !== ref) mismatches++;
    }
}
ok(mismatches === 0,
   `all ${checked} sweep colors x 3 deficiencies identical to the ` +
   `reference implementation${example ? ' (first miss: ' + example + ')' : ''}`);

console.log('case 2: the tritan projection genuinely uses both half-planes');
// Colors on either side of the separation plane must route to different
// matrices, or the two-plane method has silently collapsed to one.
const sides = new Set();
for (let r = 0; r <= 255; r += 32) for (let g = 0; g <= 255; g += 32)
for (let b = 0; b <= 255; b += 32) {
    const rgb = [_srgbToLin(r), _srgbToLin(g), _srgbToLin(b)];
    sides.add(rgb[0] * T.n[0] + rgb[1] * T.n[1] + rgb[2] * T.n[2] >= 0);
}
ok(sides.size === 2, 'the sweep exercises both sides of the separation plane');
ok(_simulateCvd('#0000ff', 'tritanopia') === refSim('#0000ff', 'tritanopia') &&
   _simulateCvd('#ffff00', 'tritanopia') === refSim('#ffff00', 'tritanopia'),
   'and blue and yellow (opposite sides) both match the reference');

console.log('case 3: ground truths the improvised matrices got wrong');
// Tableau red/green under deuteranopia is a REAL merge (0.003 dOK,
// essentially the same color to a deuteranope); the old sim reported
// 0.262 and the tiles called the pair safe.
const dMerge = _okDist(_simulateCvd('#e15759', 'deuteranopia'),
                       _simulateCvd('#59a14f', 'deuteranopia'));
ok(dMerge < 0.08,
   `Tableau red/green truly merges under deuteranopia now ` +
   `(${dMerge.toFixed(3)} < 0.08; the old sim said 0.262 and MISSED it)`);
const dSafe = _okDist(_simulateCvd('#f28e2b', 'deuteranopia'),
                      _simulateCvd('#e15759', 'deuteranopia'));
ok(dSafe >= 0.08,
   `while orange/red is genuinely separable (${dSafe.toFixed(3)}), ` +
   `where the old sim raised a false alarm at 0.067`);
ok(_simulateCvd('#ff0000', 'protanopia') === refSim('#ff0000', 'protanopia') &&
   refSim('#ff0000', 'protanopia') === '#5e5e0d',
   'pure red under protanopia is the dark olive the papers predict ' +
   '(#5e5e0d), not the old bright #c6c500');

console.log('case 4: achromatopsia stays equal-luminance gray');
const g1 = _simulateCvd('#4478ad', 'achromatopsia');
ok(/^#(..)\1\1$/.test(g1.replace('#', '#')) ||
   (g1[1] === g1[3] && g1[2] === g1[4] && g1[1] === g1[5] && g1[2] === g1[6]),
   `a color maps to a neutral gray (${g1})`);
const y = 0.2126 * _srgbToLin(0x44) + 0.7152 * _srgbToLin(0x78) +
          0.0722 * _srgbToLin(0xad);
ok(_linToSrgb(y) === hexToRgb(g1).r,
   'at exactly the Rec. 709 relative luminance of the source color');

console.log('CVD SIM CHECK PASS');
