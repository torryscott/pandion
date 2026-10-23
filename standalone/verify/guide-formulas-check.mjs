// The user guide's computed-variable recipes are VERIFIED DOCS (Torry,
// Aug 2 2026): every <code data-guide-formula> in docs/user-guide.html is
// extracted and run against the real formula engine, with spot-checked
// values, so the guide cannot drift into examples that no longer run.
// Also pins the guide's channel switch (jamovi vs app): defaults, the
// ?channel= override, filtering, and nav filtering.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

function loadPlaywright() {
    for (const base of [process.cwd(), new URL('.', import.meta.url).pathname,
                        '/private/tmp', '/tmp']) {
        try { return createRequire(path.join(base, 'x.js'))('playwright'); }
        catch { /* try the next shared dependency location */ }
    }
    console.error('playwright not found');
    process.exit(2);
}
function ok(cond, msg) {
    if (!cond) throw new Error(msg);
    console.log('  ok  ' + msg);
}
const { chromium } = loadPlaywright();
const root = path.resolve(new URL('.', import.meta.url).pathname, '..', '..');
const guidePath = path.join(root, 'docs', 'user-guide.html');

console.log('case 1: every documented formula runs, with true values');
const guide = fs.readFileSync(guidePath, 'utf8');
const unesc = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
const formulas = [...guide.matchAll(
    /<code data-guide-formula(?:\s[^>]*)?>([^]*?)<\/code>/g)]
    .map(m => unesc(m[1]));
ok(formulas.length >= 10,
   `the guide documents ${formulas.length} formulas (extraction is live)`);
// The Formula reference (Oct 2026) states the RESULT of every example:
// the expectation rides data-guide-expect (one value per fixture row,
// blank = missing, or a single value for a constant), and the prose
// beside the code must print exactly those values. Both are checked.
const examples = [...guide.matchAll(
    /<code data-guide-formula data-guide-expect="([^"]*)">([^]*?)<\/code> gives <span class="fxres">([^<]*)<\/span>/g)]
    .map(m => ({ expect: unesc(m[1]), formula: unesc(m[2]), shown: unesc(m[3]) }));
ok(examples.length >= 60,
   `the Formula reference carries ${examples.length} examples with stated results`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto('file://' + path.join(root, 'standalone', 'index.html'));
await page.waitForTimeout(600);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1400);
}
const run = await page.evaluate(fl => {
    window.PS_SHELL.loadTable('guidecheck',
        ['paced', 'clear', 'useful', 'supported', 'score', 'pre', 'post',
         'rt', 'first quiz', 'arm', 'late', 'note', 'code'],
        [['3', '4', '5', '4', '61', '10', '14', '420', '7', 'Control', '', 'Yes really', '10'],
         ['4', '5', '5', '5', '75', '12', '11', '380', '8', 'control', '3', 'no', '9'],
         ['2', '3', '4', '3', '58', '9', '16', '1250', '5', 'CONTROL', '', '', '8'],
         ['4', '4', '4', '4', '90', '11', '15', '510', '9', 'Treatment', '5', 'Maybe', '11']],
        { paced: 'continuous', clear: 'continuous', useful: 'continuous',
          supported: 'continuous', score: 'continuous', pre: 'continuous',
          post: 'continuous', rt: 'continuous',
          'first quiz': 'continuous', arm: 'nominal', late: 'continuous',
          note: 'nominal', code: 'nominal' });
    const out = [];
    for (let i = 0; i < fl.length; i++) {
        const r = window.PS_SHELL.saveComputedColumn('gf' + i, fl[i]);
        const t = window.PS_SHELL.project.table;
        out.push({ formula: fl[i],
                   error: r && r.error ? r.error : null,
                   type: t.types['gf' + i] || null,
                   values: t.raw['gf' + i] ? t.raw['gf' + i].slice(0, 4)
                                           : null });
    }
    return out;
}, formulas);
const broken = run.filter(r => r.error || !r.values);
ok(broken.length === 0,
   'all documented formulas compile and fill their column' +
   (broken.length ? ' - broken: ' + JSON.stringify(broken) : ''));
// Spot-check true arithmetic on the known rows (score 61/75/58/90:
// mean 71, Bessel SD ~14.674).
function vals(f) {
    const hit = run.find(r => r.formula === f);
    return hit ? hit.values : null;
}
ok(String(vals('6 - supported')) === '2,1,3,2',
   'reverse-scoring is exact (6 - supported -> 2,1,3,2)');
ok(String(vals('MEAN(paced, clear, useful, supported)')) ===
   '4,4.75,3,4',
   'the scale mean is exact and row-wise (4, 4.75, 3, 4)');
const z = (vals('(score - VMEAN(score)) / VSD(score)') || [])
    .map(Number);
ok(Math.abs(z[0] - (61 - 71) / 14.674404) < 1e-4 &&
   Math.abs(z[3] - (90 - 71) / 14.674404) < 1e-4,
   `z-scores use the Bessel SD (${z[0].toFixed(4)}, ${z[3].toFixed(4)})`);
ok(String(vals('IF(score >= VMEAN(score), "high", "low")')) ===
   'low,high,low,high',
   'the mean split labels the right rows (low,high,low,high)');
ok(String(vals('`first quiz` * 2')) === '14,16,10,18',
   'backtick-quoted names work exactly as documented');
ok(String(vals(
       'IF(CONTAINS(LOWER(TRIM(arm)), "control"), "Control", "Treatment")')) ===
   'Control,Control,Control,Treatment',
   'the label-tidying recipe folds three spellings into one level');
ok(String(vals('ISMISSING(post)')) === '0,0,0,0',
   'ISMISSING reports 0 across a column with nothing missing in it');

console.log('case 1b: every Formula reference example gives the result it states');
// A number is right to the precision the guide prints (half a unit of
// its last decimal); text and missing must match exactly.
function valueMatches(actual, token) {
    if (token === '') return actual === '';
    if (actual === '') return false;
    const a = Number(actual), e = Number(token);
    if (isFinite(a) && isFinite(e) && /^-?\d+(\.\d+)?$/.test(token)) {
        const dec = (token.split('.')[1] || '').length;
        const tol = dec ? 0.5 * Math.pow(10, -dec) + 1e-12 : 1e-9;
        return Math.abs(a - e) <= tol;
    }
    return String(actual) === token;
}
const wrong = [], prose = [];
for (const e of examples) {
    const got = vals(e.formula);
    const toks = e.expect.split(',');
    const want = toks.length === 1 ? [toks[0], toks[0], toks[0], toks[0]] : toks;
    if (!got || want.length !== 4 || !want.every((t, i) => valueMatches(String(got[i]), t)))
        wrong.push({ formula: e.formula, expect: e.expect, got });
    const printed = toks.map(t => t === '' ? 'missing' : t).join(', ') +
        (toks.length === 1 ? ' on every row' : '');
    if (e.shown !== printed) prose.push({ formula: e.formula, shown: e.shown, printed });
}
ok(wrong.length === 0, 'every stated result is what the engine gives' +
   (wrong.length ? ' - wrong: ' + JSON.stringify(wrong) : ''));
ok(prose.length === 0, 'the printed result beside each example is its expectation' +
   (prose.length ? ' - drift: ' + JSON.stringify(prose) : ''));
function typeOf(f) { const hit = run.find(r => r.formula === f); return hit ? hit.type : null; }
ok(typeOf('post - pre') === 'continuous' && typeOf('score > 70') === 'continuous',
   'numeric results, a comparison included, type the column Continuous');
ok(typeOf('IF(score >= 70, "pass", "fail")') === 'nominal' &&
   typeOf('IF(ISMISSING(late), "none", late)') === 'nominal',
   'any text in the results types the column Nominal');

console.log('case 1c: every function has a reference entry, and the dialog links to it');
const FN_IDS = ['zscore', 'center', 'difference', 'pctchange', 'revscore', 'recode',
    'mean', 'sum', 'min', 'max', 'vmean', 'vsd', 'vmedian', 'vmin', 'vmax', 'vsum', 'n',
    'log10', 'ln', 'sqrt', 'abs', 'exp', 'round', 'floor', 'ceiling', 'bin',
    'if', 'and-or-not', 'comparisons', 'upper', 'lower', 'trim', 'len', 'contains',
    'ismissing', 'coalesce'];
const missingIds = FN_IDS.filter(id => !guide.includes(`<tr id="fn-${id}">`));
ok(missingIds.length === 0 && guide.includes('<h3 id="formula-reference">'),
   'the reference has its anchor and one entry per function and recipe' +
   (missingIds.length ? ' - missing: ' + missingIds.join(', ') : ''));
await page.evaluate(() => window.PS_SHELL.runCommand('data-compute'));
await page.waitForTimeout(200);
const refLink = await page.evaluate(() => {
    const a = document.getElementById('ps-fn-ref');
    const box = a ? a.getBoundingClientRect() : null;
    return a ? { href: a.getAttribute('href'), target: a.target, rel: a.rel,
                 text: a.textContent, h: box.height, visible: box.width > 0 } : null;
});
ok(refLink && /#formula-reference$/.test(refLink.href) && refLink.target === '_blank' &&
   /noopener/.test(refLink.rel) && refLink.visible,
   `the Functions bar links to the reference (${refLink && refLink.href})`);
ok(refLink && refLink.h >= 24, `the link is a 24px target (${refLink && refLink.h.toFixed(1)}px)`);
const resolved = refLink && refLink.href.startsWith('../')
    ? path.resolve(path.join(root, 'standalone'), refLink.href.replace(/#.*$/, ''))
    : null;
ok(resolved ? resolved === guidePath : /^https:\/\/pandionplots\.com\/docs\/#/.test(refLink.href),
   'the link resolves to this guide (local copy on the dev page, the site otherwise)');
await page.keyboard.press('Escape');

console.log('case 2: the channel switch filters the guide honestly');
const gpage = await browser.newPage();
await gpage.goto('file://' + guidePath);
await gpage.waitForTimeout(700);
const chDefault = await gpage.evaluate(() => ({
    channel: document.body.getAttribute('data-channel'),
    appSecVisible: (() => {
        const h = document.getElementById('computed');
        return !!h && h.getBoundingClientRect().height > 0;
    })(),
    jamExportHidden: (() => {
        const h = document.getElementById('export-panel');
        return !!h && h.getBoundingClientRect().height === 0;
    })(),
    navAppShown: (() => {
        const a = document.querySelector('#navlinks a[href="#computed"]');
        return !!a && a.getBoundingClientRect().height > 0;
    })(),
}));
ok(chDefault.channel === 'app',
   'opened outside jamovi, the guide defaults to the app channel');
ok(chDefault.appSecVisible && chDefault.jamExportHidden,
   'app sections show; the jamovi export panel is filtered out');
ok(chDefault.navAppShown,
   'the nav lists the app sections (Computed variables reachable)');
await gpage.evaluate(() => {
    document.querySelector('.chswitch button[data-ch="jamovi"]').click();
});
await gpage.waitForTimeout(200);
const chJam = await gpage.evaluate(() => ({
    channel: document.body.getAttribute('data-channel'),
    computedHidden: document.getElementById('computed')
        .getBoundingClientRect().height === 0,
    exportShown: document.getElementById('export-panel')
        .getBoundingClientRect().height > 0,
    navAppHidden: document.querySelector('#navlinks a[href="#computed"]')
        .getBoundingClientRect().height === 0,
}));
ok(chJam.channel === 'jamovi' && chJam.computedHidden &&
   chJam.exportShown && chJam.navAppHidden,
   'the jamovi tab swaps content AND the nav, both directions');
await gpage.reload();
await gpage.waitForTimeout(700);
ok(await gpage.evaluate(() =>
       document.body.getAttribute('data-channel')) === 'jamovi',
   'the clicked choice sticks across a reload');
await gpage.goto('file://' + guidePath + '?channel=app');
await gpage.waitForTimeout(700);
ok(await gpage.evaluate(() =>
       document.body.getAttribute('data-channel')) === 'app',
   '?channel= overrides the stored choice (the deep-link contract)');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('GUIDE FORMULAS CHECK PASS');
await browser.close();
