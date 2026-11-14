// A value excluded in Data is excluded everywhere.
//
// THE BUG (found by a first-use walkthrough, Nov 2026). A student excluded a
// mistyped reaction time (5223 for 522). The bar and the tests dropped it,
// but the chart's Descriptives still reported N 12 and a mean of 874 beside
// a bar drawn at 479, the Data workspace's own summary said 516, turning on
// data points stretched the axis to 6000 to keep the excluded value in view,
// and the status bar still counted it as a case. She gave up and deleted the
// number from her dataset.
//
// The ruling: "if you exclude the data, it should be excluded in other
// places, including the descriptives." The engine treats a hidden point as
// an exclusion only for a host that says so (the pointMenuVerb seam the
// standalone already sets); jamovi's "Hide this point" keeps its meaning.
//
// The contracts, with one value excluded in Data:
//   1. Compare Groups Descriptives leave it out, and say so,
//   2. the axis does not stretch for it, it draws no marker beyond the
//      axis, and the pill calls it excluded,
//   3. an excluded value inside the axis keeps its crossed-out marker,
//   4. the chart's status bar counts the cases the chart uses,
//   5. outlier fences are computed from what remains,
//   6. Distribution: the Descriptives and the normality test leave it out.
// Guard: without the host's key the engine keeps the full-data behaviour.
//
// CONTROL: PS_EXPECT_BROKEN=1 with PS_PAGE aimed at a page built before the
// change must find every numbered case red, or the probe proves nothing.
import { createRequire } from 'node:module';
import path from 'node:path';

function loadPlaywright() {
    for (const base of [process.env.GB2_NODE_BASE, process.cwd(),
                        new URL('.', import.meta.url).pathname,
                        '/private/tmp', '/tmp'].filter(Boolean)) {
        try { return createRequire(path.join(base, 'x.js'))('playwright'); }
        catch { /* try the next shared dependency location */ }
    }
    console.error('playwright not found');
    process.exit(2);
}

const EXPECT_BROKEN = process.env.PS_EXPECT_BROKEN === '1';
let failed = 0;
let currentCase = '';
const caseRed = {};
function ok(cond, msg) {
    if (cond) { console.log('  ok  ' + msg); return; }
    failed++;
    console.log('  FAIL ' + msg);
}
function key(cond, msg) {
    if (!EXPECT_BROKEN) { ok(cond, msg); return; }
    if (!cond) caseRed[currentCase] = true;
    console.log('  ' + (cond ? 'held' : 'red ') + ' ' + msg);
}
function startCase(name, title, guard) {
    currentCase = name;
    if (!guard) caseRed[name] = false;
    console.log(name + ': ' + title);
}

const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.addInitScript(() => {
    try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); } catch (e) {}
});
await page.goto(pageUrl);
await page.waitForTimeout(Number(process.env.PS_BOOT || 1300));
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1900);
}
const w = ms => page.waitForTimeout(ms);

// Two groups of seven. Group a holds a mistyped 5223 (row 6) and a 560 that
// is an outlier among its neighbours only once the typo is out of the way.
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const a = [500, 505, 510, 515, 520, 560, 5223], b = [450, 460, 470, 480, 490, 500, 510];
    const rows = a.map(v => ['a', String(v)]).concat(b.map(v => ['b', String(v)]));
    window.PS_SHELL.loadTable('excl', ['cond', 'rt'], rows, { cond: 'nominal', rt: 'continuous' }, null);
    await s(700);
    window.PS_SHELL.setModule('plotbuilder'); await s(300);
    window.PS_SHELL.setRoles('plotbuilder', { xvar: 'cond', yvar: 'rt' }); await s(1500);
});
const rerender = (mod, real, spec) => page.evaluate(async ({ mod, real, spec }) => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const c = window.PS_SHELL.chart();
    const o = c.options[mod] || (c.options[mod] = {});
    Object.assign(o, real || {});
    if (spec) {
        let cur = {};
        try { cur = JSON.parse(o.chartSpec || '{}'); } catch (e) {}
        o.chartSpec = JSON.stringify(Object.assign(cur, spec));
    }
    window.PS_SHELL.setRoles(mod, c.roles[mod]); await s(1600);
}, { mod, real: real || null, spec: spec || null });
const exclude = (row, on) => page.evaluate(async ({ row, on }) => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setExcluded('rt', row, on); await s(1600);
}, { row, on });

const chartSvg = () => page.evaluate(() => {
    const host = document.querySelector('.graphbuilder2-host');
    let best = null, area = 0;
    for (const s of (host ? host.querySelectorAll('svg') : [])) {
        const a = s.clientWidth * s.clientHeight;
        if (a > area) { area = a; best = s; }
    }
    if (!best) return null;
    const nums = Array.from(best.querySelectorAll('text')).map(t => t.textContent.trim())
        .filter(t => /^-?\d+(\.\d+)?$/.test(t)).map(Number);
    return { maxTick: nums.length ? Math.max(...nums) : NaN,
             ghosts: best.querySelectorAll('[data-role="data-point-hidden"]').length,
             points: best.querySelectorAll('[data-role="data-point"]').length,
             outlierRings: best.querySelectorAll('[data-role="bar-outlier"]').length };
});
const pill = () => page.evaluate(() => {
    const b = document.querySelector('[data-role="gb2-hp-badge"]');
    return b ? b.textContent.replace(/\s+/g, ' ').trim() : '';
});
// The Statistics panel's Descriptives tab, read from rendered cells only.
const descriptives = async () => {
    if (!(await page.locator('[data-st-pane]').count())) {
        await page.locator('#psroot button[title="Statistics"]').first().click();
        await w(700);
    }
    const tab = page.locator('[data-st-tab="desc"]').first();
    if (await tab.count()) { await tab.click(); await w(500); }
    return page.evaluate(() => {
        const pane = document.querySelector('[data-st-pane="desc"]');
        if (!pane) return null;
        const head = Array.from(pane.querySelectorAll('th')).map(th => th.textContent.trim().toLowerCase());
        const rows = Array.from(pane.querySelectorAll('tr'))
            .map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim()))
            .filter(r => r.length >= 3);
        // The panel around the panes (tabs, panes, the note under them), but
        // never an ancestor that holds a <script>: the single-file build
        // inlines the engine, whose source quotes every sentence asserted here.
        let box = pane.parentElement;
        for (let i = 0; i < 4 && box.parentElement && !box.parentElement.querySelector('script'); i++)
            box = box.parentElement;
        const chip = document.querySelector('[data-role="gb2-crumb-chip"]');
        return { head, rows, text: box.textContent.replace(/\s+/g, ' '),
                 chip: chip ? chip.textContent.trim() : '' };
    });
};
const cellOf = (d, rowName, col) => {
    if (!d) return undefined;
    const r = d.rows.find(x => x[0] === rowName), i = d.head.indexOf(col);
    return r && i >= 0 ? r[i] : undefined;
};

ok((await page.evaluate(() => window.PS_SHELL.buildPayload().bars.length)) === 2, 'the chart draws two groups');
await exclude(6, true);

startCase('case 1', 'Compare Groups Descriptives leave the excluded value out');
let d = await descriptives();
key(cellOf(d, 'a', 'n') === '6', `N for group a is 6 of 7 (it reads ${cellOf(d, 'a', 'n')})`);
key(Math.abs(parseFloat(cellOf(d, 'a', 'mean')) - 518.33) < 0.01,
    `and its mean is 518.33, the mean of what remains (it reads ${cellOf(d, 'a', 'mean')})`);
key(/Values excluded in the data are left out of this table/.test(d ? d.text : ''),
    'the table says excluded values are left out');
key(/1 value excluded in the data is left out of everything here/.test(d ? d.text : ''),
    'and the note under the tabs says the same of the tests and the descriptives');
key((d ? d.chip : '') === 'Exclusions applied', `the badge no longer says Full data (it reads "${d ? d.chip : ''}")`);
await page.keyboard.press('Escape');
await w(400);

startCase('case 2', 'the axis does not stretch for an excluded value');
await rerender('plotbuilder', { showDataPoints: true });
let s = await chartSvg();
ok(s && s.points >= 12, `data points are drawn (${s ? s.points : 0})`);
key(s && s.maxTick < 1000, `the value axis tops out below 1000 (its top tick is ${s ? s.maxTick : '?'})`);
key(s && s.ghosts === 0, `nothing is drawn for a value far beyond the axis (${s ? s.ghosts : '?'} markers)`);
key(/1 value excluded/.test(await pill()), `the pill says "1 value excluded" (it reads "${await pill()}")`);
ok((await page.locator('[data-role="gb2-range-warning"]').count()) === 0,
   'and no "points outside the axis range" warning is raised for it');

startCase('case 3', 'an excluded value inside the axis keeps its crossed-out marker');
await exclude(0, true);
s = await chartSvg();
key(s && s.ghosts === 1, `exactly one marker, for the value that is in range (${s ? s.ghosts : '?'})`);
key(/2 values excluded/.test(await pill()), `the pill counts both ("${await pill()}")`);
await exclude(0, false);
s = await chartSvg();
key(s && s.ghosts === 0, 'including it again removes the marker');

startCase('case 4', 'the status bar counts the cases the chart uses');
const status = (await page.locator('#ps-status-selection').textContent()).replace(/\s+/g, ' ').trim();
key(/^13 cases\b/.test(status), `13 of 14 cases (it reads "${status.slice(0, 60)}")`);
key(/1 value excluded/.test(status), 'and it names the excluded value');

startCase('case 5', 'outlier fences are computed from what remains');
await rerender('plotbuilder', null, { showBarOutliers: true });
s = await chartSvg();
key(s && s.outlierRings >= 1,
    `560 is flagged once 5223 is out of the fences (${s ? s.outlierRings : '?'} flagged)`);
await rerender('plotbuilder', { showDataPoints: false }, { showBarOutliers: false });

startCase('case 6', 'Distribution: the Descriptives and the normality test leave it out');
const norm = await page.evaluate(async () => {
    const z = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setModule('distplotbuilder'); await z(300);
    window.PS_SHELL.setRoles('distplotbuilder', { var: 'rt', groupVar: 'cond' }); await z(1600);
    const p = window.PS_SHELL.buildPayload();
    const e = (p.distNormality || []).find(x => x.group === 'a');
    return e ? e.n : null;
});
key(norm === 6, `the normality test for group a runs on 6 values (n = ${norm})`);
d = await descriptives();
key(cellOf(d, 'a', 'n') === '6', `Descriptives N for group a is 6 (it reads ${cellOf(d, 'a', 'n')})`);
key(parseFloat(cellOf(d, 'a', 'max')) === 560, `and its maximum is 560, not 5223 (it reads ${cellOf(d, 'a', 'max')})`);
await page.keyboard.press('Escape');
await w(400);

startCase('guard', "without the host's key the engine keeps the full data", true);
await page.evaluate(async () => {
    const z = ms => new Promise(r => setTimeout(r, ms));
    const real = window.GraphBuilder2.render;
    window.GraphBuilder2.render = function (id, payload) {
        if (payload && typeof payload === 'object') delete payload.pointMenuVerb;
        return real.apply(this, arguments);
    };
    window.PS_SHELL.setModule('plotbuilder'); await z(300);
    window.PS_SHELL.setRoles('plotbuilder', { xvar: 'cond', yvar: 'rt' }); await z(1600);
});
d = await descriptives();
ok(cellOf(d, 'a', 'n') === '7', `Descriptives N for group a is the full 7 (it reads ${cellOf(d, 'a', 'n')})`);
ok(/Full data: hidden bars and points stay included/.test(d ? d.text : ''),
   'and the table says it holds the full data, as it does in jamovi');

ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors[0].slice(0, 160) : ''));
await browser.close();

if (EXPECT_BROKEN) {
    const held = Object.keys(caseRed).filter(k => !caseRed[k]);
    if (failed || held.length) {
        console.log('\nexclusion-everywhere-check control: NOT red where expected' +
            (held.length ? ' (' + held.join(', ') + ' held on the pre-change page)' : '') +
            (failed ? ' (' + failed + ' other check(s) failed)' : ''));
        process.exit(1);
    }
    console.log('\nexclusion-everywhere-check control: every numbered case is red on the pre-change page');
    process.exit(0);
}
if (failed) { console.log('\nexclusion-everywhere-check: ' + failed + ' FAILED'); process.exit(1); }
console.log('\nexclusion-everywhere-check: all cases passed');
