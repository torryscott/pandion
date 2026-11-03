// The per-bar hide eye + the Delete key on UNGROUPED bar charts.
//
// Before Nov 2026 the bar panel's title-bar eye and the Delete key both
// required the clicked bar's GROUP to equal the panel target; on an
// ungrouped chart the target is the clicked CATEGORY (category mode), so
// the eye never rendered and Delete was a no-op on Compare Groups without
// a Group By, on Frequencies, and on Pareto. Grouped charts (series hide)
// and the Distribution box family (bare "bars:" key) are the controls.
//
// Usage:  node scratchpad/barhide-check.mjs <fixture dir> [--expect-broken]
//   --expect-broken  the CONTROL run against a pre-fix render: the three
//                    ungrouped families must FAIL, the controls must pass.
import { createRequire } from 'node:module';
import path from 'node:path';
function loadPW() {
    for (const b of [process.env.GB2_NODE_BASE, process.cwd(), '/private/tmp', '/tmp'].filter(Boolean)) {
        try { return createRequire(path.join(b, 'x.js'))('playwright'); } catch {}
    }
    console.error('playwright not found'); process.exit(2);
}
const { chromium } = loadPW();
const OUT = process.argv[2] || '/tmp/gb2-barhide';
const EXPECT_BROKEN = process.argv.includes('--expect-broken');
const MOCK = `window.__opts = []; window.setOption = function (k, v) { window.__opts.push([k, v]); };`;
const CHART = `(() => { let best=null,ba=0; for (const s of document.querySelectorAll('.graphbuilder2-host svg')) { const r=s.getBoundingClientRect(); if (r.width*r.height>ba){ba=r.width*r.height;best=s;} } return best; })()`;
const BARSEL = 'rect[data-bar-cat],path[data-bar-cat]';
let fails = 0;
const ok = (l, c) => { console.log((c ? '  ok: ' : '  FAIL: ') + l); if (!c) fails++; };
const browser = await chromium.launch();

async function open(fix) {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    await ctx.addInitScript(MOCK);
    const p = await ctx.newPage();
    p.on('pageerror', e => console.log('  PAGEERROR', e.message));
    await p.goto('file://' + path.join(OUT, fix + '.html'));
    await p.waitForFunction((sel) => document.querySelector('.graphbuilder2-host svg ' + sel), BARSEL + ',[data-role="box-fill"]', { timeout: 20000 });
    await p.waitForTimeout(400);
    return { ctx, p };
}
// The first drawn bar shape (not the oversized hit clone): its identity + centre.
// Bars: the drawn rect/path carrying data-bar-cat (not the oversized hit
// clone). Box family: the wrapper <g data-bar-cat> around a box-fill rect;
// the click lands in the box's upper quarter, clear of the median line,
// whose own handler would open the Median tab instead of the box body.
function drawnEls(s, sel) {
    const boxes = [...s.querySelectorAll('g[data-bar-cat]')].filter(g => g.querySelector('[data-role="box-fill"]'));
    if (boxes.length) return boxes.map(g => ({ id: g, shape: g.querySelector('[data-role="box-fill"]'), box: true }));
    return [...s.querySelectorAll(sel)].filter(e => e.getBoundingClientRect().height > 5 && e.getAttribute('data-role') !== 'bar-hit').map(e => ({ id: e, shape: e, box: false }));
}
async function firstBar(p) {
    return p.evaluate(({ C, sel, fn }) => {
        const s = eval(C); const drawnEls = new Function('return ' + fn)();
        const els = drawnEls(s, sel); const e = els[0]; const r = e.shape.getBoundingClientRect();
        return { cat: e.id.getAttribute('data-bar-cat') || '', grp: e.id.getAttribute('data-bar-group') || '', x: r.left + r.width / 2, y: r.top + r.height * (e.box ? 0.25 : 0.5), n: els.length };
    }, { C: CHART, sel: BARSEL, fn: drawnEls.toString() });
}
async function drawnCount(p) {
    return p.evaluate(({ C, sel, fn }) => { const s = eval(C); const drawnEls = new Function('return ' + fn)(); return drawnEls(s, sel).length; }, { C: CHART, sel: BARSEL, fn: drawnEls.toString() });
}
async function cellHidden(p, cat, grp) {
    return p.evaluate(({ cat, grp }) => { const d = window.gb2_undo.getData(); return (d.hiddenBars || []).some(h => String(h.category) === cat && String(h.group || '') === grp); }, { cat, grp });
}
async function flushedHiddenBars(p) {
    await p.evaluate(() => { window.__gb2_inspectorInputAt = 0; window.dispatchEvent(new Event('beforeunload')); });
    await p.waitForTimeout(200);
    return p.evaluate(() => {
        const c = (window.__opts || []).filter(o => o[0] === 'chartSpec').pop();
        if (c) { try { return JSON.parse(c[1]).hiddenBars || null; } catch { return 'parse-fail'; } }
        const r = (window.__opts || []).filter(o => o[0] === 'hiddenBars').pop();
        return r ? r[1] : null;
    });
}

// expect: { eye: /regex on the aria-label/, series: bool } - series = a grouped chart hides every cell of the group
const CASES = [
    { fix: 'cg_ungrouped',       family: 'ungrouped', eye: /^Hide Ctrl$/ },
    { fix: 'cg_ungrouped_facet', family: 'ungrouped', eye: /^Hide / },
    { fix: 'freq_ungrouped',     family: 'ungrouped', eye: /^Hide Agree$/ },
    { fix: 'freq_ungrouped_facet', family: 'ungrouped', eye: /^Hide / },
    { fix: 'freq_pareto',        family: 'ungrouped', eye: /^Hide Agree$/ },
    { fix: 'cg_grouped',         family: 'control',   eye: /^Hide (M|F)$/, series: true },
    { fix: 'freq_grouped',       family: 'control',   eye: /^Hide 202[34]$/, series: true },
    { fix: 'dist_box_ungrouped', family: 'control',   eye: /^Hide Series$/ },
    { fix: 'dist_box_grouped',   family: 'control',   eye: /^Hide (A|B)$/, series: true },
];
const results = {};
for (const c of CASES) {
    console.log('== ' + c.fix + ' (' + c.family + ')');
    const before = fails;
    // --- the title-bar eye
    let { ctx, p } = await open(c.fix);
    let bar = await firstBar(p);
    await p.mouse.move(bar.x, bar.y); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(450);
    const st = await p.evaluate(() => { const t = document.querySelector('[data-role="inspector-title"]'); const eye = t ? t.querySelector('button[aria-label^="Hide"], button[aria-label^="Show"]') : null; return { title: t ? t.textContent.trim().replace(/\s+/g, ' ') : null, eye: eye ? eye.getAttribute('aria-label') : null, r: eye ? eye.getBoundingClientRect().toJSON() : null }; });
    ok('bar click (' + bar.cat + (bar.grp ? ' / ' + bar.grp : '') + ') opened its panel: ' + JSON.stringify(st.title), /Bars|Box|Distribution/i.test(st.title || ''));
    ok('title bar carries the eye: ' + (st.eye || 'NONE'), !!st.eye && c.eye.test(st.eye));
    if (st.eye) {
        await p.mouse.click(st.r.x + st.r.width / 2, st.r.y + st.r.height / 2); await p.waitForTimeout(400);
        const hid = await cellHidden(p, bar.cat, bar.grp);
        const drawn = await drawnCount(p);
        const aria = await p.evaluate(() => { const t = document.querySelector('[data-role="inspector-title"]'); const b = t && t.querySelector('button[aria-label^="Show"]'); return b ? b.getAttribute('aria-label') : null; });
        ok('eye click hides the clicked cell (hiddenBars has it; drawn ' + bar.n + ' -> ' + drawn + ')', hid && drawn < bar.n);
        ok('panel stays open and the eye reads Show (' + aria + ')', /^Show /.test(aria || ''));
        const committed = await flushedHiddenBars(p);
        ok('flush committed hiddenBars via chartSpec: ' + JSON.stringify(committed), Array.isArray(committed) && committed.some(h => String(h.category) === bar.cat && String(h.group || '') === bar.grp));
        // restore from the same eye
        const r2 = await p.evaluate(() => { const t = document.querySelector('[data-role="inspector-title"]'); const b = t && t.querySelector('button[aria-label^="Show"]'); return b ? b.getBoundingClientRect().toJSON() : null; });
        if (r2) { await p.mouse.click(r2.x + r2.width / 2, r2.y + r2.height / 2); await p.waitForTimeout(400); }
        ok('second click restores the cell (drawn back to ' + bar.n + ')', !(await cellHidden(p, bar.cat, bar.grp)) && (await drawnCount(p)) === bar.n);
    }
    await ctx.close();
    // --- the Delete key, on a fresh page
    ({ ctx, p } = await open(c.fix));
    bar = await firstBar(p);
    await p.mouse.move(bar.x, bar.y); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(450);
    await p.keyboard.press('Delete'); await p.waitForTimeout(400);
    const delHid = await cellHidden(p, bar.cat, bar.grp);
    const delDrawn = await drawnCount(p);
    const selCleared = await p.evaluate(() => !document.querySelector('[data-role="inspector-title"]') || document.querySelector('[data-role="inspector-title"]').textContent.trim() === '' || !document.querySelector('[data-role="inspector-title"]').closest('[data-role="inspector-panel"], .gb2-inspector') || true);
    ok('Delete on the selected bar hides it (hiddenBars has it; drawn ' + bar.n + ' -> ' + delDrawn + ')', delHid && delDrawn < bar.n);
    const committed2 = await flushedHiddenBars(p);
    ok('Delete committed hiddenBars: ' + JSON.stringify(committed2), Array.isArray(committed2) && committed2.some(h => String(h.category) === bar.cat && String(h.group || '') === bar.grp));
    if (c.series) {
        // grouped: the Delete key hides ONE cell (the clicked one); the eye hides the series. Just note the drawn count.
        console.log('  (series chart: eye = whole series, Delete = the clicked cell)');
    }
    await ctx.close();
    results[c.fix] = { family: c.family, failed: fails - before };
}
await browser.close();
if (EXPECT_BROKEN) {
    // control semantics: every ungrouped family must have FAILED, every control must have passed
    let bad = 0;
    for (const f in results) {
        const r = results[f];
        const want = r.family === 'ungrouped' ? r.failed > 0 : r.failed === 0;
        console.log((want ? '  control ok: ' : '  CONTROL MISMATCH: ') + f + ' (' + r.family + ', ' + r.failed + ' assertion failures)');
        if (!want) bad++;
    }
    console.log(bad ? 'CONTROL FAILED' : 'CONTROL OK: pre-fix engine fails exactly the ungrouped families');
    process.exit(bad ? 1 : 0);
}
console.log(fails ? ('FAILS: ' + fails) : 'ALL GREEN');
process.exit(fails ? 1 : 0);
