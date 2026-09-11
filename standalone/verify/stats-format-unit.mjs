// stats-format-unit.mjs - the display-rounding seam (statistics
// hardening item 3). Pure unit: extracts formatP / formatAsterisks from
// the engine source and pins the threshold-straddling behavior, above
// all the one honest asymmetry: the DISPLAY may round a p of .0504 down
// to ".050", but every significance CLAIM (stars, gates, chips) keys on
// the RAW value. If a change ever couples claims to the rounded string,
// this goes red.
import fs from 'node:fs';
import path from 'node:path';
const src = fs.readFileSync(path.resolve(
  new URL('.', import.meta.url).pathname, '..', '..',
  'inst', 'widget', 'graphbuilder2.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) { pass++; console.log('  ok  ' + label); }
  else { fail++; console.log('  FAIL ' + label); }
};
function grab(name) {
  const i0 = src.indexOf(name + ': function');
  const open = src.indexOf('{', i0);
  let d = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}' && --d === 0)
      return 'function ' + src.slice(src.indexOf('(', i0), j + 1);
  }
}
const S = new Function('return {formatP: ' + grab('formatP') +
  ', formatAsterisks: ' + grab('formatAsterisks') + '};')();

console.log('formatP boundaries');
ok(S.formatP(0.0009999) === 'p < .001', 'just under .001 -> "p < .001"');
ok(S.formatP(0.001) === 'p = .001', 'exactly .001 -> "p = .001"');
ok(S.formatP(0.0504) === 'p = .050', '.0504 DISPLAYS as .050 (the seam this file exists for)');
ok(S.formatP(0.05) === 'p = .050', 'exactly .05 -> ".050"');
ok(S.formatP(NaN) === 'p = —', 'non-finite -> em-dash, never NaN');
ok(S.formatP(1) === 'p = 1.000', 'p = 1 prints as 1.000');
console.log('formatAsterisks: the ladder is fixed, the gate is raw');
ok(S.formatAsterisks(0.0499999) === '*', 'raw just under .05 earns *');
ok(S.formatAsterisks(0.05) === 'n.s.', 'raw exactly .05 is n.s.');
ok(S.formatAsterisks(0.0504) === 'n.s.',
  '.0504 is n.s. even though formatP shows ".050" - claims key on RAW p');
ok(S.formatAsterisks(0.0009999) === '***' && S.formatAsterisks(0.001) === '**'
  && S.formatAsterisks(0.01) === '*' && S.formatAsterisks(0.0099999) === '**',
  'ladder boundaries are strict <');
console.log('the alpha gate (t4-233): gates marks, never moves the ladder');
ok(S.formatAsterisks(0.03, { gate: 0.01 }) === 'n.s.',
  'alpha .01 gates a p of .03 to n.s.');
ok(S.formatAsterisks(0.008, { gate: 0.01 }) === '**',
  'below the gate the fixed ladder speaks (.008 -> **)');
ok(S.formatAsterisks(0.07, { gate: 0.10 }) === '†',
  'alpha .10 marginal band earns the dagger');
ok(S.formatAsterisks(0.04, { gate: 0.10 }) === '*',
  'alpha .10 with p .04 stays a ladder star');
console.log('monotonicity: a smaller p never earns a weaker mark');
const rank = m => ({ '***': 4, '**': 3, '*': 2, '†': 1, 'n.s.': 0 })[m];
let mono = true, prev = 5;
for (let p = 0.0001; p < 0.2; p += 0.0007) {
  const r = rank(S.formatAsterisks(p, { gate: 0.10 }));
  if (r > prev) { mono = false; break; }
  prev = r;
}
ok(mono, 'mark strength is monotone in p (gate .10 sweep)');
console.log((fail === 0 ? 'STATS FORMAT UNIT PASS' : 'STATS FORMAT UNIT FAIL') +
  ' (' + pass + ' ok, ' + fail + ' failing)');
process.exit(fail === 0 ? 0 : 1);
