// Punch list t3-44: Repeated Measures could never be paneled.
//
// buildRM was the only builder with no facet block, so the engine's RM pivot
// chips were dark and its mixed three-way ANOVA, its across-panels compare
// scope and its per-panel simple-effect brackets were all unreachable. The
// approved brief lists facetVar on Repeated Measures (planning/STANDALONE-BRIEF.md:93);
// the omission was an implementation cut, twice.
//
// The claim under test is precise: a panel variable on RM is BETWEEN subjects,
// so each panel is an independent repeated-measures analysis and
// Cousineau-Morey normalises within panel x group. rm-panels-render.R computes
// the expectation by running R's OWN rmplotbuilder on each panel's subset. If
// the shell pooled panels into one cell instead, the dispersion would be
// measured over another panel's subjects as well as this one's, and both n and
// se would move. Both error-bar methods run, because the within one carries
// the Morey factor and the between one does not.
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

const EXPECTED = '/tmp/ps-rm-panels/expected.json';
const CSV = '/tmp/ps-rm-panels/rmpanels.csv';
if (!fs.existsSync(EXPECTED) || !fs.existsSync(CSV)) {
    console.error('run standalone/verify/rm-panels-render.R first (needs jmvcore)');
    process.exit(2);
}
const expected = JSON.parse(fs.readFileSync(EXPECTED, 'utf8'));
const csv = fs.readFileSync(CSV, 'utf8');
const SEP = ' ¦ ';

const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(800);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1200);
}

// Load the same rows R used, through the app's own CSV path.
await page.evaluate(async (text) => {
    const t = window.PS_SHELL.parseCSV(text);
    window.PS_SHELL.loadTable('rmpanels', t.header, t.rows);
    await new Promise(r => setTimeout(r, 400));
}, csv);
await page.waitForTimeout(700);

console.log('case 1: Repeated Measures offers a Panels role at all');
const roles = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setModule('rmplotbuilder');
    await sleep(500);
    // An empty OPTIONAL role renders as a collapsed add-row (flattened
    // rail, Aug 2026), so its label lives in .ps-role-add-label.
    return Array.from(document.querySelectorAll('#ps-slots .ps-role-card'))
        .map(c => ({ key: c.getAttribute('data-role-key'),
                     label: (c.querySelector(
                         '.ps-slot-label, .ps-role-add-label') || {})
                         .textContent || '' }));
});
const panels = roles.find(r => r.key === 'facetVar');
ok(!!panels, `it does (${JSON.stringify(roles.map(r => r.key))})`);
ok(/Panels/.test(panels.label),
   `named the same as every other module's (${JSON.stringify(panels.label)})`);

async function build(between, method) {
    return page.evaluate(async (cfg) => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const rr = { measures: ['t1', 't2', 't3'], facetVar: 'site' };
        if (cfg.between) rr.betweenVar = cfg.between;
        window.PS_SHELL.setRoles('rmplotbuilder', rr);
        window.setOption('errorBarMethod', cfg.method);
        await sleep(700);
        const p = window.PS_SHELL.buildPayload();
        return p && { bars: p.bars, xCategories: p.xCategories,
                      facetLevels: p.facetLevels,
                      facetSeparator: p.facetSeparator };
    }, { between, method });
}

// R prints at 10 significant digits (the payload's own precision), so the
// comparison is at that precision rather than at an invented tolerance.
function near(a, b) {
    if (!isFinite(a) || !isFinite(b)) return a === b;
    const scale = Math.max(1e-12, Math.abs(a), Math.abs(b));
    return Math.abs(a - b) / scale < 1e-9;
}

let compared = 0;
for (const caseName of Object.keys(expected)) {
    const exp = expected[caseName];
    console.log(`case 2.${caseName}: every panel matches R run on that panel alone`);
    const got = await build(exp.between === null ? null : exp.between, exp.method);
    ok(got && got.bars && got.bars.length > 0,
       `${caseName}: the shell builds a faceted payload (${
           got ? got.bars.length : 0} cells)`);
    ok(got.facetSeparator === SEP,
       `and declares the separator the engine splits on (${
           JSON.stringify(got.facetSeparator)})`);

    const panelNames = Object.keys(exp.panels);
    // SET, not order. R takes the declared factor levels; a CSV carries no
    // level declaration, so the shell infers first-seen order - punch list
    // t4-18, a known divergence parked for a decision, and not this item's
    // business. Ordering within the shell's own rule is checked below, so an
    // ordering REGRESSION still fails here even while t4-18 is open.
    ok(panelNames.length === got.facetLevels.length &&
       panelNames.every(p => got.facetLevels.indexOf(p) !== -1),
       `the same panels are drawn (${JSON.stringify(got.facetLevels)} vs R's ` +
       `declared order ${JSON.stringify(panelNames)}: see t4-18)`);
    ok(JSON.stringify(got.xCategories) ===
       JSON.stringify(got.facetLevels.flatMap(
           lv => ['t1', 't2', 't3'].map(m => lv + SEP + m))),
       'and the occasions axis is built panel by panel, in that order');

    for (const lv of panelNames) {
        for (const want of exp.panels[lv]) {
            const wantX = lv + SEP + want.x;
            const wantG = want.group === null ? null : want.group;
            const hit = got.bars.find(b => b.x === wantX &&
                (b.group == null ? null : String(b.group)) === wantG);
            if (!hit)
                throw new Error(`${caseName}: no cell for ${wantX}` +
                    (wantG ? ` / ${wantG}` : '') +
                    `. Got ${JSON.stringify(got.bars.map(b => b.x + '|' + b.group))}`);
            if (hit.n !== want.n)
                throw new Error(`${caseName} ${wantX}${wantG ? '/' + wantG : ''}` +
                    `: n ${hit.n} vs R ${want.n}`);
            if (!near(hit.mean, want.mean))
                throw new Error(`${caseName} ${wantX}${wantG ? '/' + wantG : ''}` +
                    `: mean ${hit.mean} vs R ${want.mean}`);
            if (!near(hit.se, want.se))
                throw new Error(`${caseName} ${wantX}${wantG ? '/' + wantG : ''}` +
                    `: se ${hit.se} vs R ${want.se}` +
                    ` (a cell pooled across panels lands here, and on n above)`);
            compared += 3;
        }
    }
    const cells = panelNames.reduce((a, lv) => a + exp.panels[lv].length, 0);
    ok(got.bars.length === cells,
       `all ${cells} cells present and no extras (${got.bars.length})`);
    ok(true, `mean, se and n match R in every panel`);
}
console.log(`  ..  ${compared} values compared against R`);

console.log('case 3: the panel really is between subjects, not another occasion');
// The distinguishing property: no subject appears in two panels. If a panel
// level had been folded into the occasions axis instead, subject ids would
// repeat across panels at the same measure.
const overlap = await page.evaluate(() => {
    const p = window.PS_SHELL.buildPayload();
    const byPanel = {};
    for (const b of p.bars) {
        const panel = b.x.split(' ¦ ')[0];
        byPanel[panel] = byPanel[panel] || new Set();
        (b.rowIds || []).forEach(id => byPanel[panel].add(id));
    }
    const names = Object.keys(byPanel);
    let shared = 0;
    for (let i = 0; i < names.length; i++)
        for (let j = i + 1; j < names.length; j++)
            byPanel[names[i]].forEach(id => {
                if (byPanel[names[j]].has(id)) shared++;
            });
    return { panels: names.length, shared };
});
ok(overlap.panels === 3 && overlap.shared === 0,
   `no case appears in two panels (${overlap.panels} panels, ` +
   `${overlap.shared} shared cases)`);

console.log('case 4: unfaceted Repeated Measures is byte-unchanged');
const plain = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setRoles('rmplotbuilder',
        { measures: ['t1', 't2', 't3'] });
    await sleep(700);
    const p = window.PS_SHELL.buildPayload();
    return { xCategories: p.xCategories, sep: p.facetSeparator,
             levels: p.facetLevels, label: p.facetLabel,
             anyEncoded: p.bars.some(b => b.x.indexOf(' ¦ ') !== -1),
             anyFacet: p.bars.some(b => b.facet != null) };
});
ok(JSON.stringify(plain.xCategories) === JSON.stringify(['t1', 't2', 't3']),
   `the occasions axis is untouched (${JSON.stringify(plain.xCategories)})`);
ok(plain.sep === '' && (!plain.levels || plain.levels.length === 0),
   'no separator and no levels are declared');
ok(!plain.anyEncoded && !plain.anyFacet,
   'and nothing is encoded into a cell that was not paneled');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('RM PANELS CHECK PASS');
await browser.close();
