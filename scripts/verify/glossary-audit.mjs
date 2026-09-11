// Static contract for the student-facing glossary and linked Sigma popovers.
// This cannot prove statistical truth, but it prevents the specific
// high-risk misconceptions corrected in the launch accuracy audit.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const source = fs.readFileSync(path.join(ROOT, 'inst/widget/graphbuilder2.js'), 'utf8');
let failures = 0;

function fail(message) { console.log('  FAIL ' + message); failures++; }
function ok(message) { console.log('  ok   ' + message); }
function check(message, condition) { condition ? ok(message) : fail(message); }

function literalAfter(marker, open, close) {
    const at = source.indexOf(marker);
    if (at < 0) throw new Error('marker missing: ' + marker);
    const start = source.indexOf(open, at + marker.length - 1);
    let depth = 0, quote = '', escaped = false;
    for (let i = start; i < source.length; i++) {
        const ch = source[i];
        if (quote) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === quote) quote = '';
            continue;
        }
        if (ch === '"' || ch === "'") { quote = ch; continue; }
        if (ch === open) depth++;
        else if (ch === close && --depth === 0)
            return source.slice(start, i + 1);
    }
    throw new Error('unterminated literal after: ' + marker);
}

const glossary = Function('return ' +
    literalAfter('var _GB_GLOSSARY = [', '[', ']'))();
const terms = Function('return ' +
    literalAfter('var _GB_STAT_TERMS = {', '{', '}'))();

check('glossary inventory remains 132 entries', glossary.length === 132);
check('linked Sigma inventory remains 104 terms', Object.keys(terms).length === 104);
check('glossary names are unique', new Set(glossary.map(e => e.n)).size === glossary.length);

const modules = new Set(['Compare', 'RM', 'Freq', 'Dist', 'Corr', 'Likert', 'Scatter']);
for (const e of glossary) {
    if (!(Number.isInteger(e.g) && e.g >= 0 && e.g <= 13)) fail('bad group for ' + e.n);
    if (!(typeof e.n === 'string' && e.n.trim())) fail('missing name');
    if (!(typeof e.b === 'string' && e.b.trim())) fail('missing definition: ' + e.n);
    if (!(typeof e.r === 'string' && e.r.trim())) fail('missing reading guidance: ' + e.n);
    if (!Array.isArray(e.m) || e.m.some(m => !modules.has(m))) fail('bad module tag: ' + e.n);
    if (!Array.isArray(e.s)) fail('bad synonyms: ' + e.n);
}
if (!failures) ok('every glossary entry is structurally complete');

function gloss(name) {
    const e = glossary.find(x => x.n === name);
    if (!e) { fail('missing glossary entry: ' + name); return ''; }
    return [e.b, e.r, e.w].join(' ');
}
function hasAll(name, fragments) {
    const text = gloss(name).toLowerCase();
    check(name + ' retains accuracy caveats', fragments.every(x => text.includes(x.toLowerCase())));
}

hasAll('p value', ['null hypothesis', 'not the probability']);
hasAll('p adjusted', ['may differ from a separate raw-test p', 'family']);
hasAll('Mann-Whitney U', ['not automatically a test of medians', 'similar shapes']);
hasAll('Wilcoxon signed-rank', ['symmetric around zero', 'pseudomedian']);
hasAll('Cousineau-Morey within-subject error correction',
    ["Morey's correction", 'not error bars for a particular pairwise difference']);
hasAll("Cronbach's alpha", ['items contribute equally', 'does not by itself show that a scale is one-dimensional']);
hasAll('Data ellipse', ['model-based summary', 'not a confidence region']);
hasAll('Standardized residual (regression)', ['not a leverage-adjusted', 'straight-line fit']);
hasAll('Colorblind-safe / CVD-safe', ['guarantee', 'screening result']);
hasAll('Cumulative %', ['changes only the displayed row order', 'not the calculation']);
hasAll('Top-box (favorable percentage)', ['single highest category', 'full agree-side percentage']);
hasAll('Skewness', ['does not by itself prove symmetry']);
hasAll('Diagonal (correlation matrix)', ['displays 1', 'no variation', 'undefined', 'display convention']);
hasAll('Density contours', ['changing more quickly', 'does not by itself mean']);

const allTeachingCopy = [
    ...glossary.flatMap(e => [e.b, e.r, e.w]),
    ...Object.values(terms).flatMap(e => [e.body, e.read])
].join('\n');
const forbidden = [
    /more sure the true value is inside/i,
    /rank tests fit medians/i,
    /red-green guarantee/i,
    /closeness-to-normal score/i,
    /how reliable is the change/i,
    /confidence ellipse is an oval drawn to enclose a chosen percentage/i,
    /adjusted p[^\n]*generally larger than the raw/i
];
for (const pattern of forbidden)
    check('misconception absent: ' + pattern, !pattern.test(allTeachingCopy));

const linked = [
    ['p value', 'p', ['null hypothesis']],
    ['p adjusted', 'pAdj', ['comparison models']],
    ['Mann-Whitney U', 'mannWhitney', ['not automatically a test of medians']],
    ['Wilcoxon signed-rank', 'wilcoxonSR', ['symmetric around zero']],
    ["Cronbach's alpha", 'cronbachAlpha', ['items contribute equally']],
    ['Data ellipse', 'confEllipse', ['model-based summary']],
    ['Cumulative %', 'cumulativePct', ['sorting a histogram table']],
    ['Colorblind-safe / CVD-safe', 'cvdSafe', ['cannot guarantee']],
    ['Top-box (favorable percentage)', 'topBox', ['single highest category']],
    ['Cousineau-Morey within-subject error correction', 'cmCorrection',
        ['square-root(k/(k - 1))', 'not the SE or CI of a difference']],
    ['Center / split-middle boundary', 'centerSplit',
        ['not an observed response value', 'does not necessarily represent a neutral response']]
];
for (const [name, key, fragments] of linked) {
    const entry = terms[key];
    check('linked popover exists: ' + key, !!entry);
    if (entry) {
        const text = ((entry.body || '') + ' ' + (entry.read || '')).toLowerCase();
        check('glossary/popover accuracy aligned: ' + name,
            fragments.every(x => text.includes(x.toLowerCase())));
    }
}

if (failures) {
    console.log(`\nGLOSSARY AUDIT: ${failures} FAILURE(S)`);
    process.exit(1);
}
console.log('\nGLOSSARY AUDIT PASSED');
