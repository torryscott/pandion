// Distinguish the points, live in the app (Sep 24 2026, Torry: "I added an
// option to Distinguish By. It's just not showing up... None of this was
// fast or truly live").
//
// The engine's auto-show fold turns the data points on the first time a
// Distinguish-by variable arrives and commits that through _setOption.
// _setOption pre-stamps the last-rendered hash with the post-fold payload so
// the later echo can hash-skip; stamped at render ENTRY it made the very
// render that carried the marks see its own payload as already drawn, and a
// chart already sitting in the host (the app reuses its host; jamovi swaps
// the DOM per delivery) skipped that render, then skipped the echo too. The
// marks only appeared after some unrelated edit changed the payload. The
// commits now go out after the render.
//
// Cases: (1) adding the variable to a drawn chart shows every point
// distinguished, with the key, on the first paint (150 ms, before any echo);
// (2) nothing later replaces them with plain points; (3) removing the
// variable clears the marks and the key just as fast. CONTROL (the engine
// before the fix): case 1 finds no points at all and case 2 never sees them.
//
// Usage: node standalone/verify/distinguish-live-check.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
function loadPlaywright() {
    const bases = [];
    if (process.env.GB2_NODE_BASE) bases.push(process.env.GB2_NODE_BASE);
    bases.push(process.cwd(), new URL('.', import.meta.url).pathname, '/private/tmp', '/tmp');
    for (const b of bases) {
        try { return createRequire(path.join(b, 'x.js'))('playwright'); }
        catch { /* try the next shared dependency location */ }
    }
    console.error('playwright not found; cd /tmp && npm i playwright');
    process.exit(2);
}
const pw = loadPlaywright();
const PAGE = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
let failures = 0;
function ok(cond, label) { if (cond) console.log('  ok  ' + label); else { console.log('  FAIL ' + label); failures++; } }

// Thirty mice, one without a recorded sex.
const rows = [];
const treat = ['Control', 'Low dose', 'High dose'];
for (let i = 0; i < 30; i++) {
    const sex = (i === 4) ? '' : (i % 2 ? 'M' : 'F');
    rows.push(`m${i + 1},${treat[i % 3]},${sex},${(20 + (i % 3) * 4 + ((i * 7) % 5) - 2).toFixed(1)}`);
}
const CSV = 'mouse,treatment,sex,weight_g\n' + rows.join('\n') + '\n';

const state = () => ({
    pts: document.querySelectorAll('[data-role="data-point"]').length,
    marked: document.querySelectorAll('[data-role="data-point"][data-point-mark]').length,
    key: !!document.querySelector('[data-role="mark-legend"]'),
});

const browser = await pw.chromium.launch();
try {
    const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage();
    page.setDefaultTimeout(10000);
    page.on('filechooser', () => {});
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(() => { try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); localStorage.setItem('psstandalone.preferences.v1', JSON.stringify({ panelDock: 'below' })); } catch (e) {} });
    await page.goto(PAGE); await page.waitForTimeout(700);
    if (await page.locator('#ps-welcome').isVisible().catch(() => false)) { await page.click('#ps-welcome-sample'); await page.waitForTimeout(1500); }
    await page.evaluate(async (text) => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        const t = window.PS_SHELL.parseCSV(text);
        window.PS_SHELL.loadTable('mice', t.header, t.rows);
        await s(600);
        window.PS_SHELL.setWorkspace('chart');
        window.PS_SHELL.setModule('plotbuilder');
        await s(300);
        window.PS_SHELL.setRoles('plotbuilder', { xvar: 'treatment', yvar: 'weight_g' });
    }, CSV);
    // Let the first chart settle, echo included: the case is a variable
    // ADDED to a chart that is already drawn.
    await page.waitForTimeout(2500);
    const before = await page.evaluate(state);
    ok(before.pts === 0 && !before.key, 'the drawn chart starts with its points off and no key');

    // Case 1: the first paint after the assignment carries the marks.
    const first = await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        const S = window.PS_SHELL;
        S.setRoles('plotbuilder', Object.assign({}, S.chart().roles.plotbuilder, { markVar: 'sex' }));
        await s(150);
        return { pts: document.querySelectorAll('[data-role="data-point"]').length,
                 marked: document.querySelectorAll('[data-role="data-point"][data-point-mark]').length,
                 key: !!document.querySelector('[data-role="mark-legend"]'),
                 rows: Array.from(document.querySelectorAll('[data-role="mark-legend-row"]')).map(r => r.getAttribute('data-mark-level')) };
    });
    ok(first.pts === 30 && first.marked === 30, 'assigning the variable shows every point distinguished on the first paint, before any echo (' + first.marked + ' of ' + first.pts + ')');
    ok(first.key && JSON.stringify(first.rows) === JSON.stringify(['F', 'M', '']), 'and the key is there with F, M and the blank level ' + JSON.stringify(first.rows));

    // Case 2: nothing later swaps them for plain points.
    const later = await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        let plainSeen = false, gone = false;
        for (let i = 0; i < 25; i++) {
            await s(100);
            const pts = document.querySelectorAll('[data-role="data-point"]').length;
            const marked = document.querySelectorAll('[data-role="data-point"][data-point-mark]').length;
            if (pts > 0 && marked === 0) plainSeen = true;
            if (pts === 0) gone = true;
        }
        return { plainSeen, gone, final: { pts: document.querySelectorAll('[data-role="data-point"]').length, marked: document.querySelectorAll('[data-role="data-point"][data-point-mark]').length, key: !!document.querySelector('[data-role="mark-legend"]') } };
    });
    ok(!later.plainSeen && !later.gone, 'over the next 2.5 s the points never fall back to plain or disappear');
    ok(later.final.marked === 30 && later.final.key, 'and the echo leaves the distinguished points and the key in place');
    const opts = await page.evaluate(() => { const o = window.PS_SHELL.chart().options.plotbuilder || {}; let sp = {}; try { sp = JSON.parse(o.chartSpec || '{}'); } catch (e) {} return { sdp: o.showDataPoints, mas: sp.markAutoShown }; });
    ok(opts.sdp === true && opts.mas === true, 'the points-on switch and the once-only stamp were committed ' + JSON.stringify(opts));

    // Case 3: removing the variable clears the marks as fast.
    const removed = await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        const S = window.PS_SHELL;
        const r = Object.assign({}, S.chart().roles.plotbuilder); delete r.markVar;
        S.setRoles('plotbuilder', r);
        await s(150);
        return { pts: document.querySelectorAll('[data-role="data-point"]').length,
                 marked: document.querySelectorAll('[data-role="data-point"][data-point-mark]').length,
                 key: !!document.querySelector('[data-role="mark-legend"]') };
    });
    ok(removed.marked === 0 && !removed.key, 'removing the variable clears the marks and the key on the first paint');
    ok(removed.pts === 30, 'the points themselves stay on (' + removed.pts + ')');
    ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
} finally {
    await browser.close();
}
if (failures) { console.log('DISTINGUISH LIVE CHECK: ' + failures + ' failure(s)'); process.exit(1); }
console.log('DISTINGUISH LIVE CHECK: ALL GREEN');
