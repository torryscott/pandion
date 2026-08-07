// Unit runner for the computed-variable FORMULA engine (ps-formula.js),
// the catstride-unit.mjs idiom. The engine is a self-contained IIFE that
// assigns window.PSFormula, so it evaluates in a bare shim with no
// browser at all, and every case below is a direct call into compile().
//
// Why a unit runner and not only a browser probe. The engine has three
// behaviours that a rendered fixture can barely reach. Missing is a
// single null sentinel, so the interesting inputs are absences; the
// error strings are the only thing a stuck user reads, and they are
// cheapest to pin as strings; and the app TRIMS every value on the way
// into a typed column, so a column can never carry padded text. The
// unit fixture feeds the engine values the grid could not produce,
// which is exactly where a regression would hide.
//
// The end-to-end behaviour (a real column saved through the dialog,
// with real values in the table) lives in formula-vocab-check.mjs.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..', '..');
const SRC = path.join(ROOT, 'standalone', 'js', 'ps-formula.js');
const src = fs.readFileSync(SRC, 'utf8');
if (src.indexOf('window.PSFormula') === -1) {
    console.error('ps-formula.js no longer assigns window.PSFormula. Update ' +
        'this runner or the engine, but do not delete the test.');
    process.exit(1);
}
const shim = {};
// eslint-disable-next-line no-new-func
new Function('window', src)(shim);
const PSFormula = shim.PSFormula;

let failures = 0;
function ok(cond, msg) {
    if (cond) console.log('  ok   ' + msg);
    else { console.log('  FAIL ' + msg); failures++; }
}

// The fixture. Missing is null, the single sentinel, exactly as
// retypeColumns writes it. "group" carries the dirty-label problem this
// vocabulary exists for. "label" carries an internal double space, which
// is the ONE kind of stray whitespace that survives the app's own trim.
const COLUMNS = {
    score:  [10, null, 30, 40, null],
    backup: [1, 2, null, 4, null],
    third:  [7, 8, 9, null, 99],
    group:  ['Control', 'control', 'CONTROL ish', null, 'Treatment'],
    label:  ['Control  A', 'Control A', null, 'Treat A', 'Treat  B'],
    LEN:    [5, 6, 7, 8, 9]
};
const NAMES = Object.keys(COLUMNS);
const N = 5;

function run(formula) {
    const c = PSFormula.compile(formula, NAMES);
    if (!c.ok) return { error: c.error };
    return { values: c.run(COLUMNS, N) };
}
function vals(formula) {
    const r = run(formula);
    if (r.error) return 'ERROR ' + r.error;
    return r.values.map(v => v == null ? '-' : String(v)).join(',');
}
function err(formula) {
    const r = run(formula);
    return r.error || 'NO ERROR (values ' + r.values.join(',') + ')';
}

console.log('case 1: ISMISSING is the only way to ask whether a value is there');
ok(vals('ISMISSING(score)') === '0,1,0,0,1',
   'ISMISSING(score) reports 0,1,0,0,1 and never propagates the absence');
ok(vals('IF(ISMISSING(score), 0, score)') === '10,0,30,40,0',
   'IF(ISMISSING(score), 0, score) substitutes zero, the whole point');
ok(vals('ISMISSING(group)') === '0,0,0,1,0',
   'ISMISSING works on a text column too');
ok(vals('ISMISSING(score) + ISMISSING(backup)') === '0,1,1,0,2',
   'its result is an ordinary number, so it adds up across columns');
ok(vals('ISMISSING(ISMISSING(score))') === '0,0,0,0,0',
   'ISMISSING of a present value is present, so nesting terminates');

console.log('case 2: COALESCE takes the first value that is there');
ok(vals('COALESCE(score, backup)') === '10,2,30,40,-',
   'COALESCE(score, backup) fills the gaps the second column can fill');
ok(vals('COALESCE(score, backup, third)') === '10,2,30,40,99',
   'COALESCE is variadic, so a third fallback fills the last row');
ok(vals('COALESCE(backup, 0)') === '1,2,0,4,0',
   'a literal makes a final fallback that can never itself be missing');
ok(vals('COALESCE(score, 0)') === '10,0,30,40,0',
   'two arguments is the common shape and reads plainly');
{
    const c = PSFormula.compile('COALESCE(score, third)', NAMES);
    ok(c.ok && String(c.run(COLUMNS, N)[3]) === '40',
       'row 4 has score 40 and a missing third, and COALESCE never looks past score');
}
ok(vals('COALESCE(third, backup)') === '7,8,9,4,99' &&
   vals('COALESCE(score, backup)').split(',')[4] === '-',
   'when every argument is missing the answer is missing, never zero');
ok(err('COALESCE(score)').indexOf('NO ERROR') === 0,
   'one argument is redundant but computes, so it is not refused');

console.log('case 3: the string functions, for dirty category labels');
ok(vals('LOWER(group)') === 'control,control,control ish,-,treatment',
   'LOWER folds the case so "Control" and "control" can finally meet');
ok(vals('UPPER(group)') === 'CONTROL,CONTROL,CONTROL ISH,-,TREATMENT',
   'UPPER folds the other way');
ok(vals('LOWER(group) == "control"') === '1,1,0,-,0',
   'and equality on the folded value is the recode a user could not write');
ok(vals('IF(LOWER(group) == "control", "Control", group)') ===
   'Control,Control,CONTROL ish,-,Treatment',
   'the whole recode runs end to end');
ok(vals('TRIM(label)') === 'Control A,Control A,-,Treat A,Treat B',
   'TRIM collapses the internal run, the spreadsheet meaning of the name');
ok(vals('TRIM(label) == "Control A"') === '1,1,-,0,0',
   'so two spellings of one label compare equal after TRIM');
ok(vals('LEN(group)') === '7,7,11,-,9',
   'LEN counts characters');
ok(vals('LEN(score)') === '2,-,2,2,-',
   'LEN reads a number as the text the grid shows');
ok(vals('CONTAINS(group, "ontrol")') === '1,1,0,-,0',
   'CONTAINS is case sensitive, so it pairs with LOWER rather than guessing');
ok(vals('CONTAINS(LOWER(group), "control")') === '1,1,1,-,0',
   'CONTAINS(LOWER(x), "...") catches every spelling of the label');
ok(vals('CONTAINS(label, "Treat")') === '0,0,-,1,1',
   'CONTAINS on a present value never goes missing');

console.log('case 4: missing still propagates everywhere it should');
ok(vals('LOWER(score) == "10"') === '1,-,0,0,-',
   'a missing input to LOWER stays missing');
ok(vals('LEN(group) + 1') === '8,8,12,-,10', 'and to LEN');
ok(vals('TRIM(label)').split(',')[2] === '-', 'and to TRIM');
ok(vals('CONTAINS(group, "x")').split(',')[3] === '-', 'and to CONTAINS');
ok(vals('score + backup') === '11,-,-,44,-',
   'ordinary arithmetic is untouched: any missing input is missing');

console.log('case 5: the vocabulary that already worked still works');
ok(vals('score * 2') === '20,-,60,80,-', 'arithmetic');
ok(vals('(score - MEAN(score)) / SD(score)').split(',')[0].slice(0, 6) ===
   '-1.091', 'the z-score aggregate, to four places');
ok(vals('MEAN(score)') === '26.666666666666668,26.666666666666668,' +
   '26.666666666666668,26.666666666666668,26.666666666666668',
   'MEAN is computed once over the column');
ok(vals('N(score)') === '3,3,3,3,3', 'N counts the values that are there');
ok(vals('IF(score >= 30, "high", "low")') === 'low,-,high,high,-',
   'IF over a comparison');
ok(vals('BIN(score, 2)') === 'bin 1,-,bin 2,bin 2,-', 'BIN');
ok(vals('ROUND(score / 3, 1)') === '3.3,-,10,13.3,-', 'ROUND with digits');
ok(vals('LOG10(score)') === '1,-,1.4771212547196624,1.6020599913279623,-',
   'LOG10');
ok(vals('NOT(score > 20)') === '1,-,0,0,-', 'NOT');
ok(vals('score > 5 AND backup > 1') === '0,-,-,1,-', 'AND');
ok(vals('LEN') === '5,6,7,8,9',
   'a column literally named LEN still reads as a column, not a function');
ok(vals('LEN + LEN(group)') === '12,13,18,-,18',
   'the same name as a column and as a call in one formula');

console.log('case 6: the error messages name the fix');
{
    const e = err('=score-backup');
    ok(/remove the leading "="/i.test(e) && /score-backup/.test(e),
       'a leading = says to remove it and shows the expression: ' + e);
}
{
    const e = err('LOG(score)');
    ok(/unknown function LOG\(\)/.test(e) && /LOG10/.test(e) && /\bLN\b/.test(e),
       'LOG names both real logs rather than leaving the user to guess: ' + e);
}
{
    const e = err('AVERAGE(score, backup)');
    ok(/unknown function AVERAGE\(\)/.test(e) && /MEAN/.test(e),
       'AVERAGE points at MEAN: ' + e);
}
{
    const e = err('Score');
    ok(/unknown variable "Score"/.test(e) && /score/.test(e) &&
       /case sensitive/i.test(e),
       'a case slip on a variable name says so: ' + e);
}
{
    const e = err('MAEN(score)');
    ok(/MEAN/.test(e), 'a plain typo in a function name finds its target: ' + e);
}
{
    const e = err('scoer');
    ok(/Did you mean score/.test(e),
       'a plain typo in a variable name finds its target: ' + e);
}
{
    const e = err('ISBLANK(score)');
    ok(/ISMISSING/.test(e),
       'the spreadsheet name for the missing test points at ours: ' + e);
}
{
    const e = err('STDEV(score)');
    ok(/\bSD\b/.test(e), 'STDEV points at SD: ' + e);
}
{
    // The honesty control. There is no near name for this, so the engine
    // must NOT invent one.
    const e = err('QQQZZZ(score)');
    ok(/unknown function QQQZZZ\(\)/.test(e) && !/[Dd]id you mean/.test(e),
       'a name with no near match gets no invented suggestion: ' + e);
}
{
    const e = err('qqqzzz');
    ok(/unknown variable "qqqzzz"/.test(e) && !/[Dd]id you mean/.test(e),
       'and neither does an unrecognisable variable: ' + e);
}
{
    const e = err('score +');
    ok(/unexpected end of formula/.test(e),
       'the plain parse errors are unchanged: ' + e);
}
{
    const e = err('LOG10(score');
    ok(/expected "\)"/.test(e), 'and so is the missing bracket: ' + e);
}

console.log('case 7: arity is still enforced, variadic included');
ok(/ISMISSING\(\) takes 1 argument/.test(err('ISMISSING(score, backup)')),
   'ISMISSING takes exactly one');
ok(/CONTAINS\(\) takes 2 arguments/.test(err('CONTAINS(group)')),
   'CONTAINS takes exactly two');
{
    const e = err('COALESCE()');
    ok(/COALESCE\(\) takes 1 or more arguments/.test(e),
       'and the variadic arity reads as a range, not as Infinity: ' + e);
}
ok(/takes one column name/.test(err('MEAN(score, backup)')),
   'the aggregates still take exactly one plain column');

console.log('case 8: renameRef still rewrites only real references');
ok(PSFormula.renameRef('COALESCE(score, backup)', 'score', 'points') ===
   'COALESCE(points, backup)', 'a renamed column follows into COALESCE');
ok(PSFormula.renameRef('LEN(group) + LEN', 'LEN', 'width') ===
   'LEN(group) + width',
   'and the call is left alone when the column shares a function name');
ok(PSFormula.renameRef('CONTAINS(g, "score")', 'score', 'points') ===
   'CONTAINS(g, "score")', 'a string literal is never rewritten');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nFORMULA UNIT CHECK PASS');
process.exit(failures ? 1 : 0);
