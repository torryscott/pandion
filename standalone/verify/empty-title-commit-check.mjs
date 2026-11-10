// A title typed into its panel must be saved, even when that title is not
// drawn on the chart at the moment.
//
// THE BUG (found by a first-use walkthrough, Nov 2026). The engine keeps a
// title's commit hook in textEditOnCommit, and a hook is only there while
// the title's element is drawn (makeEditableText registers it on every
// redraw) or after a click on the title's click-to-add zone. Every redraw
// empties the map. So a panel opened for an EMPTY title by any other route
// (Find a setting, or clearing the text and typing again in the same open
// panel) had no hook: Enter did nothing, the typed text lived only in the
// session's typed-text store, and it vanished at the next chart switch or
// reopen. Repeated Measures hit it by default, because its value-axis title
// starts empty: a manuscript figure went out without one.
//
// The contracts, each for a title that is NOT drawn when the typing starts:
//   1. Compare Groups, Y title cleared, retyped through Find a setting,
//   2. Repeated Measures, the default empty Y title, through Find,
//   3. the X title, cleared and retyped through Find,
//   4. clearing a title and typing a new one in the SAME open panel.
// In each: the title is in the saved chart settings after Enter, it is
// drawn, and it is still there after switching to another chart and back.
// A fifth case guards the chart title, which never had the gap (redraw()
// recomputes hasTitle, so its first typed character draws the element and
// registers the hook): it must keep working, before and after.
//
// CONTROL: PS_EXPECT_BROKEN=1 with PS_PAGE aimed at a page built before the
// fix must find every case red, or the probe proves nothing.
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
// A check the fix is responsible for. Normally it must hold. Under the
// control it is only recorded: every case has to show at least one of
// these failing against the pre-fix page.
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
// Long enough for the engine's 1.5 s option flush and the shell's echo.
const SETTLE = 2800;

// The text the chart draws: every <text> of the largest svg in the widget.
const drawnTexts = () => page.evaluate(() => {
    const host = document.querySelector('.graphbuilder2-host');
    let best = null, area = 0;
    for (const s of (host ? host.querySelectorAll('svg') : [])) {
        const a = s.clientWidth * s.clientHeight;
        if (a > area) { area = a; best = s; }
    }
    return best ? Array.from(best.querySelectorAll('text')).map(t => t.textContent) : [];
});
const isDrawn = async (title) => (await drawnTexts()).includes(title);
// The saved chart settings, read from what the shell would build a fresh
// render from. This is independent of the engine's session-only store of
// typed text, which is exactly the thing that used to hide the loss.
const savedSpec = () => page.evaluate(() => {
    const p = window.PS_SHELL.buildPayload() || {};
    let spec = {};
    try { spec = JSON.parse(p.chartSpec || '{}'); } catch (e) {}
    return { xTitle: spec.xTitle, xOverride: spec.xTitleOverride,
             yTitle: spec.yTitle, yOverride: spec.yTitleOverride,
             chartTitle: spec.chartTitle, xLabel: p.xLabel, yLabel: p.yLabel };
});
const field = () => page.locator('[data-field="text-content"]:visible').first();
const fieldOpen = async () => (await page.locator('[data-field="text-content"]:visible').count()) > 0;
const closePanels = async () => {
    for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape'); await w(150); }
};
// Find a setting, the route a first-time user took: it opens the title's
// panel without the title ever being clicked on the chart.
const openByFind = async (query) => {
    await closePanels();
    await page.keyboard.press('Meta+f');
    await page.locator('[data-role="setting-search-input"]:visible').first()
        .waitFor({ state: 'visible', timeout: 4000 });
    await page.keyboard.type(query, { delay: 12 });
    await w(400);
    await page.keyboard.press('Enter');
    await field().waitFor({ state: 'visible', timeout: 4000 });
    await w(300);
};
const typeIntoField = async (text) => {
    await field().click();
    await page.keyboard.press('Meta+a');
    await page.keyboard.press('Backspace');
    if (text) await page.keyboard.type(text, { delay: 12 });
    await page.keyboard.press('Enter');
    await w(SETTLE);
};
// Away to a new chart and back: the shell rebuilds the first chart from its
// saved settings alone, and drops the engine's typed-text store on the way.
const awayAndBack = async () => {
    await closePanels();
    await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        const home = window.PS_SHELL.chart().id;
        window.PS_SHELL.addChart('plotbuilder'); await s(900);
        const away = window.PS_SHELL.chart().id;
        window.PS_SHELL.switchChart(home); await s(1500);
        window.PS_SHELL.closeDocument(away); await s(900);
        if (window.PS_SHELL.chart().id !== home) { window.PS_SHELL.switchChart(home); await s(1200); }
    });
};

startCase('case 1', 'Compare Groups: a cleared Y title, retyped through Find a setting');
ok((await page.evaluate(() => window.PS_SHELL.chart().module)) === 'plotbuilder',
   'the sample opens on a Compare Groups chart');
const y0 = (await savedSpec()).yLabel;
ok(typeof y0 === 'string' && y0.length > 0 && await isDrawn(y0),
   `it starts with a drawn Y title ("${y0}")`);
await openByFind('Y-axis title');
await typeIntoField('');
ok(!(await isDrawn(y0)) && (await savedSpec()).yLabel === '',
   'clearing it removes the title from the chart and from the saved settings');
await openByFind('Y-axis title');
await typeIntoField('Reaction time (ms)');
key((await savedSpec()).yTitle === 'Reaction time (ms)',
    `the typed title is in the saved settings (yTitle = ${JSON.stringify((await savedSpec()).yTitle)})`);
key(await isDrawn('Reaction time (ms)'), 'and it is drawn after Enter, with the panel still open');
await awayAndBack();
key(await isDrawn('Reaction time (ms)'), 'and it is still there after switching charts and back');

startCase('case 2', 'Repeated Measures: the default empty Y title, through Find a setting');
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const rows = [];
    for (let i = 0; i < 16; i++)
        rows.push([String(20 + (i % 5)), String(17 + (i % 4)), String(18 + (i % 6)), i % 2 ? 'a' : 'b']);
    window.PS_SHELL.loadTable('titles', ['pre', 'post', 'followup', 'arm'], rows, null, null);
    await s(800);
    window.PS_SHELL.setModule('rmplotbuilder'); await s(400);
    window.PS_SHELL.setRoles('rmplotbuilder', { measures: ['pre', 'post', 'followup'] });
    await s(1800);
});
ok((await savedSpec()).yLabel === '' && (await drawnTexts()).includes('pre'),
   'a fresh Repeated Measures chart draws its occasions and no Y title');
await openByFind('Y-axis title');
await typeIntoField('Perceived stress');
key((await savedSpec()).yTitle === 'Perceived stress' && (await savedSpec()).yLabel === 'Perceived stress',
    `the typed title is in the saved settings (yTitle = ${JSON.stringify((await savedSpec()).yTitle)})`);
key(await isDrawn('Perceived stress'), 'and it is drawn after Enter, with the panel still open');
await awayAndBack();
key(await isDrawn('Perceived stress'), 'and it is still there after switching charts and back');

startCase('case 3', 'the X title, cleared and retyped through Find a setting');
const x0 = (await savedSpec()).xLabel;
ok(typeof x0 === 'string' && x0.length > 0 && await isDrawn(x0),
   `the chart starts with a drawn X title ("${x0}")`);
await openByFind('X-axis title');
await typeIntoField('');
ok(!(await isDrawn(x0)), 'clearing it removes the title from the chart');
await openByFind('X-axis title');
await typeIntoField('Time point');
key((await savedSpec()).xTitle === 'Time point',
    `the typed title is in the saved settings (xTitle = ${JSON.stringify((await savedSpec()).xTitle)})`);
key(await isDrawn('Time point'), 'and it is drawn after Enter');
await awayAndBack();
key(await isDrawn('Time point'), 'and it is still there after switching charts and back');

startCase('case 4', 'a title cleared and retyped in the same open panel');
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.addChart('rmplotbuilder'); await s(600);
    window.PS_SHELL.setRoles('rmplotbuilder', { measures: ['pre', 'post', 'followup'] });
    await s(1800);
});
ok(await isDrawn('Measure'), 'a second fresh chart draws its default X title ("Measure")');
await openByFind('X-axis title');
ok((await field().inputValue()) === 'Measure', 'the panel opens on the drawn title');
await typeIntoField('');
ok(!(await isDrawn('Measure')), 'clearing it removes the title from the chart');
if (!(await fieldOpen())) {
    // The panel is allowed to close on the clear. Reopening it is then the
    // Find route again, which cases 1 to 3 already pin; say so plainly.
    console.log('  note the panel closed after the clear; reopening it through Find');
    await openByFind('X-axis title');
}
await typeIntoField('Occasion');
key((await savedSpec()).xTitle === 'Occasion',
    `the retyped title is in the saved settings (xTitle = ${JSON.stringify((await savedSpec()).xTitle)})`);
key(await isDrawn('Occasion'), 'and it is drawn after Enter');
await awayAndBack();
key(await isDrawn('Occasion'), 'and it is still there after switching charts and back');

startCase('case 5', 'guard: the chart title on a chart that has none still saves', true);
ok(!(await savedSpec()).chartTitle, 'the chart starts without a chart title');
await openByFind('Chart title');
await typeIntoField('Stress over time');
ok((await savedSpec()).chartTitle === 'Stress over time',
   `the typed title is in the saved settings (chartTitle = ${JSON.stringify((await savedSpec()).chartTitle)})`);
await awayAndBack();
ok(await isDrawn('Stress over time'), 'and it is still there after switching charts and back');

ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors[0].slice(0, 160) : ''));
await browser.close();

if (EXPECT_BROKEN) {
    const held = Object.keys(caseRed).filter(k => !caseRed[k]);
    if (failed || held.length) {
        console.log('\nempty-title-commit-check control: NOT red where expected' +
            (held.length ? ' (' + held.join(', ') + ' held on the pre-fix page)' : '') +
            (failed ? ' (' + failed + ' setup check(s) failed)' : ''));
        process.exit(1);
    }
    console.log('\nempty-title-commit-check control: every case is red on the pre-fix page');
    process.exit(0);
}
if (failed) { console.log('\nempty-title-commit-check: ' + failed + ' FAILED'); process.exit(1); }
console.log('\nempty-title-commit-check: all cases passed');
