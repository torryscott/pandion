// Punch list 27: the chart did not fit its pane, and there were no splitters.
//
// The templates ship plotWidth 6 / plotHeight 4 - a fixed 576x384 - and nothing
// in the shell read or wrote them: no ResizeObserver, no Fit control. At
// 1440x900 that left about 137px of white either side of the chart inside an
// 851px pane whose toolbar spanned the full width. Below about 1240px the fixed
// svg made the pane scroll SIDEWAYS. And .ps-app-body was a fixed 205 / 1fr /
// 330 grid with no resizer, with a .ps-no-inspector rule whose class was only
// ever removed, never added.
import { createRequire } from 'node:module';
import path from 'node:path';

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
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1800);

// The chart svg, not the first svg in the document: the first one is a toolbar
// icon, which is the recurring trap in this suite.
// View-zoom model (Jul 27 2026): the payload carries the LOGICAL size (the
// figure), the svg width attribute confirms what was rendered, and the host
// CSS zoom is the VIEW. The store is deliberately not read: it may hold
// stale window-derived sizes from the committed-fit era, which the render
// ignores.
const geo = () => page.evaluate(() => {
    const pane = document.querySelector('.ps-main-workspace');
    const host = document.getElementById('psroot');
    const svg = Array.from(document.querySelectorAll('.graphbuilder2-host svg'))
        .sort((a, b) => b.getBoundingClientRect().width -
                        a.getBoundingClientRect().width)[0];
    const payload = window.PS_SHELL.buildPayload();
    const g = s => Math.round(
        document.querySelector(s).getBoundingClientRect().width);
    return { plotW: Number(payload.plotWidth), plotH: Number(payload.plotHeight),
             logicalW: svg ? Number(svg.getAttribute('width')) : 0,
             zoom: Number(host.style.zoom || '1'),
             paneW: pane.clientWidth,
             sideways: pane.scrollWidth - pane.clientWidth,
             chartW: svg ? Math.round(svg.getBoundingClientRect().width) : 0,
             rail: g('.ps-project-panel'), insp: g('.ps-controls'),
             main: g('.ps-main-workspace') };
});

console.log('case 1: the chart takes the STANDARD size, not the pane');
// Torry's ruling, Jul 27 2026: fit only ever SHRINKS below one standard
// size (7.5 x 5in). The first shape grew to fill the pane, which pushed the
// engine's below-chart panels out of view on a big monitor and, worse, made
// the same project render a DIFFERENT figure on different screens: the
// engine draws text at fixed point sizes while geometry fills the canvas,
// so logical size IS the figure.
const wide = await geo();
ok(wide.chartW > 0, `setup: a chart is drawn (${wide.chartW}px)`);
ok(Math.abs(wide.plotW - 7.5) < 0.06 && Math.abs(wide.plotH - 5) < 0.06,
   `at 1440 the chart renders the standard 7.5 x 5in, larger than the old ` +
   `6 x 4 default but bounded (${wide.plotW} x ${wide.plotH})`);
ok(wide.chartW > 600 && wide.sideways <= 1,
   `so it uses more of the pane than the old 576px default with no ` +
   `sideways scroll (${wide.chartW} of ${wide.paneW})`);

console.log('case 1b: a bigger monitor renders the IDENTICAL figure');
await page.setViewportSize({ width: 2240, height: 1260 });
await page.waitForTimeout(800);
const huge = await geo();
ok(Math.abs(huge.plotW - wide.plotW) < 0.02 &&
   Math.abs(huge.plotH - wide.plotH) < 0.02,
   `at 2240 the logical size does not change (${huge.plotW} x ${huge.plotH} ` +
   `vs ${wide.plotW} x ${wide.plotH}): two machines, one figure, and the ` +
   `engine's below-chart panels keep their room`);
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(800);

console.log('case 2: a small window scales the VIEW, never the figure');
for (const w of [1200, 1000, 860]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(800);
    const g = await geo();
    ok(g.logicalW === wide.logicalW && Math.abs(g.plotW - 7.5) < 0.06,
       `at ${w}px the FIGURE is untouched: logical ${g.logicalW}px, ` +
       `plotWidth ${g.plotW}in`);
    ok(g.zoom < 1 && g.chartW < g.logicalW - 20,
       `the view zooms instead (${Math.round(g.zoom * 100)}%, ` +
       `${g.chartW}px on screen)`);
    ok(g.sideways <= 1,
       `and the pane does not scroll sideways ` +
       `(${g.sideways}px over, chart ${g.chartW} of ${g.paneW})`);
}
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(800);

console.log('case 3: a size the USER sets wins and keeps winning');
const manual = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // BOTH dimensions, which is what the engine's own aspect presets and edge
    // grips commit. Setting only the width leaves the old height and invents a
    // tall aspect that auto-fit then faithfully preserves - which is what the
    // first version of this probe did, and it read as a fitting failure two
    // cases later.
    window.setOption('plotWidth', 5);
    window.setOption('plotHeight', 3.33);
    await sleep(900);
    return { w: Number(window.PS_SHELL.optionStore().plotWidth),
             fitOff: document.getElementById('ps-fit-pane').checked === false };
});
ok(manual.w === 5 && manual.fitOff,
   `a committed size takes ownership: the standard-size box unchecks ` +
   `(${manual.w}in, fit ${manual.fitOff ? 'off' : 'still on'})`);
const owned = await geo();
ok(Math.abs(owned.plotW - 5) < 0.01 && Math.abs(owned.logicalW - 488) <= 12,
   `and the chart RENDERS at the user's size (${owned.plotW}in, ` +
   `${owned.logicalW}px logical)`);
await page.setViewportSize({ width: 1100, height: 900 });
await page.waitForTimeout(900);
ok(await page.evaluate(() => Number(window.PS_SHELL.optionStore().plotWidth)) === 5,
   'and a window resize does not stomp it');
// the Size & view disclosure must be open for a real click (Aug 2 2026)
await page.evaluate(() => { const t = document.getElementById('ps-sizeview-toggle'); if (t && t.getAttribute('aria-expanded') !== 'true') t.click(); });
await page.click('#ps-fit-pane');
await page.waitForTimeout(900);
const refit = await geo();
ok(Math.abs(refit.plotW - 7.5) < 0.06 && refit.logicalW === wide.logicalW,
   `re-checking the box returns to the STANDARD size ` +
   `(${refit.plotW}in, ${refit.logicalW}px), not to the pane`);
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(800);

console.log('case 4: the rails resize, and remember');
// From a FITTED state: case 3 deliberately left a hand-set size in place.
await page.evaluate(() => {
    const box = document.getElementById('ps-fit-pane');
    if (!box.checked) box.click();
});
await page.waitForTimeout(1000);
const bars = await page.evaluate(() =>
    document.querySelectorAll('.ps-splitter').length);
ok(bars === 2, `there are two splitters (${bars})`);
// Under the standard-size cap (Torry's ruling) a chart at 1440 already
// renders the full 7.5in, so growing the pane must NOT grow it - the old
// tail of this case asserted exactly that growth and moved with the ruling.
// "Fitting is watching" is now proven in the direction that still exists:
// squeeze the pane BELOW the chart and the chart follows it down.
const before = await geo();
const bar = await page.locator('.ps-splitter-a').boundingBox();
await page.mouse.move(bar.x + 2, bar.y + 200);
await page.mouse.down();
await page.mouse.move(bar.x - 55, bar.y + 200, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(900);
const dragged = await geo();
ok(dragged.rail < before.rail - 30,
   `dragging the rail splitter narrows the rail ` +
   `(${before.rail} -> ${dragged.rail})`);
ok(dragged.main > before.main + 30,
   `and the space goes to the chart pane (${before.main} -> ${dragged.main})`);
ok(Math.abs(dragged.chartW - before.chartW) <= 2,
   `which the chart does NOT grow into: it is already at the standard size ` +
   `(${before.chartW} -> ${dragged.chartW})`);
const barB = await page.locator('.ps-splitter-a').boundingBox();
await page.mouse.move(barB.x + 2, barB.y + 200);
await page.mouse.down();
await page.mouse.move(barB.x + 260, barB.y + 200, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(900);
const squeezed = await geo();
// The rail splitter clamps (a drag can never erase the chart pane), so the
// squeeze it can express is modest; any real shrink proves fit responded.
ok(squeezed.chartW <= before.chartW - 15 && squeezed.sideways <= 1,
   `while squeezing the pane below the standard shrinks the chart, because ` +
   `fitting is watching (${before.chartW} -> ${squeezed.chartW}, no ` +
   `sideways scroll)`);

await page.reload();
await page.waitForTimeout(1600);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-continue');
    await page.waitForTimeout(1400);
}
const reloaded = await geo();
// Compare against the LAST drag: the squeeze pass above moved the same
// splitter again, so squeezed.rail is what persistence should hold.
ok(Math.abs(reloaded.rail - squeezed.rail) <= 2,
   `the width survives a reload, because a working layout is a preference ` +
   `(${reloaded.rail} vs ${squeezed.rail})`);

await page.dblclick('.ps-splitter-a');
await page.waitForTimeout(700);
ok(await page.evaluate(() =>
       Math.round(document.querySelector('.ps-project-panel')
           .getBoundingClientRect().width)) === 205,
   'and double-clicking a splitter restores the default width');

// Keyboard, because a splitter that only responds to a drag is not a control.
const kb = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const bar = document.querySelector('.ps-splitter-a');
    bar.focus();
    const before = Math.round(document.querySelector('.ps-project-panel')
        .getBoundingClientRect().width);
    for (let i = 0; i < 3; i++) {
        bar.dispatchEvent(new KeyboardEvent('keydown',
            { key: 'ArrowRight', bubbles: true, cancelable: true }));
        await sleep(80);
    }
    return { before, after: Math.round(
        document.querySelector('.ps-project-panel').getBoundingClientRect().width),
        role: bar.getAttribute('role') };
});
ok(kb.after > kb.before && kb.role === 'separator',
   `and the arrow keys move it, announced as a separator ` +
   `(${kb.before} -> ${kb.after})`);

// ---------------------------------------------------------------------------
// A regression this item CAUSED, kept here because this is what caused it.
// Fitting persists on the first render, which made the app record its own
// pristine boot project in Recents before the user had done anything - and
// again the moment they opened an example, so the list opened with two
// strangers. Recents lists projects worth returning to: one the user CHOSE, or
// one with work in it.
console.log('case 5: fitting does not put a stranger in Recents');
{
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const p2 = await ctx.newPage();
    await p2.goto(pageUrl);
    await p2.waitForTimeout(1500);
    const boot = await p2.evaluate(() => window.PS_SHELL.recentProjects().length);
    ok(boot === 0,
       `the boot project, which nobody asked for, is not recorded (${boot})`);
    await p2.click('#ps-welcome-sample');
    await p2.waitForTimeout(1500);
    const chosen = await p2.evaluate(() =>
        window.PS_SHELL.recentProjects().map(r => r.name));
    ok(chosen.length === 1,
       `and an example the user CHOSE is recorded exactly once ` +
       `(${JSON.stringify(chosen)})`);
    await ctx.close();
}

console.log('case 6: an export does not depend on the window');
// Torry's two-PDF report, Jul 27 2026: the same chart exported at two window
// sizes produced two different figures - same text size, different axis and
// bar geometry - because the export serialized the LIVE svg and fit had
// given it a window-sized canvas. The contract: exports render at the
// chart's AUTHORITATIVE size, so any two machines produce the identical
// file. The display may still shrink; the export must not follow it.
async function armExportMock() {
    await page.evaluate(() => {
        window.__psExportWritten = null;
        Object.defineProperty(window, 'showSaveFilePicker', {
            configurable: true,
            value: async (opts) => ({
                createWritable: async () => ({
                    write: async (blob) => {
                        window.__psExportWritten = {
                            name: opts.suggestedName, type: blob.type,
                            text: blob.type.indexOf('svg') !== -1
                                ? await blob.text() : ''
                        };
                    },
                    close: async () => {}
                })
            })
        });
    });
}
async function exportSvgText() {
    await armExportMock();
    await page.click('#ps-export');
    await page.waitForTimeout(200);
    await page.click('label.ps-export-format:has(input[value="svg"]) span');
    await page.click('#ps-export-go');
    await page.waitForFunction(() => !!window.__psExportWritten);
    return await page.evaluate(() => window.__psExportWritten.text);
}
function svgFacts(text) {
    const w = (text.match(/<svg[^>]*\swidth="([\d.]+)"/) || [])[1];
    const h = (text.match(/<svg[^>]*\sheight="([\d.]+)"/) || [])[1];
    const bar = (text.match(/<path[^>]*data-bar-cat[^>]*\sd="([^"]+)"/) ||
                 text.match(/<path[^>]*\sd="([^"]+)"[^>]*data-bar-cat/) || [])[1];
    return { w: Number(w), h: Number(h), bar: bar || '' };
}
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(900);
const bigFacts = svgFacts(await exportSvgText());
ok(bigFacts.w > 0 && bigFacts.bar.length > 0,
   `setup: a wide-window export parsed (${bigFacts.w} x ${bigFacts.h})`);
await page.setViewportSize({ width: 980, height: 760 });
await page.waitForTimeout(1200);
const shrunk = await geo();
ok(shrunk.chartW < bigFacts.w - 40,
   `setup: the DISPLAYED chart really is smaller in the small window ` +
   `(${shrunk.chartW}px on screen vs ${bigFacts.w}px exported)`);
const smallFacts = svgFacts(await exportSvgText());
ok(smallFacts.w === bigFacts.w && smallFacts.h === bigFacts.h,
   `the export from the small window has the IDENTICAL canvas ` +
   `(${smallFacts.w} x ${smallFacts.h} vs ${bigFacts.w} x ${bigFacts.h})`);
ok(smallFacts.bar === bigFacts.bar,
   'and identical bar geometry: two windows, one figure');
const shownAfter = await geo();
ok(shownAfter.chartW === shrunk.chartW,
   `while the on-screen chart is left exactly as it was ` +
   `(${shownAfter.chartW}px)`);
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(600);

console.log('case 7: the view zoom is a working surface, not a picture');
// Measured in the zoom spikes before this shipped, pinned here for good:
// under CSS zoom the engine's interactions keep working - a click opens the
// right editor and a drag commits the right result - because hit-testing
// and the engine's rect-based slot math both live in visual space.
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(700);
// the Size & view disclosure must be open for a real click (Aug 2 2026)
await page.evaluate(() => { const t = document.getElementById('ps-sizeview-toggle'); if (t && t.getAttribute('aria-expanded') !== 'true') t.click(); });
await page.selectOption('#ps-chart-zoom', '0.75');
await page.waitForTimeout(400);
const z75 = await geo();
ok(Math.abs(z75.zoom - 0.75) < 0.01 && z75.logicalW === wide.logicalW,
   `75% scales the view (${z75.chartW}px shown) while the figure stays ` +
   `${z75.logicalW}px logical`);
// Chrome isolation (Torry's report: 50% made the toolbar tiny, 150% made
// the panel comic): the engine's toolbar and panels counter-zoom to true
// size while ONLY the chart scales.
const chrome75 = await page.evaluate(() => {
    // The export icon is display:none since Jul 31 2026 (command-bar export);
    // the Help button is the same chrome under the same counter-zoom.
    const b = document.querySelector('#psroot button[title="Help & shortcuts"]');
    return b ? Math.round(b.getBoundingClientRect().height) : 0;
});
// the Size & view disclosure must be open for a real click (Aug 2 2026)
await page.evaluate(() => { const t = document.getElementById('ps-sizeview-toggle'); if (t && t.getAttribute('aria-expanded') !== 'true') t.click(); });
await page.selectOption('#ps-chart-zoom', '1');
await page.waitForTimeout(300);
const chrome100 = await page.evaluate(() => {
    // The export icon is display:none since Jul 31 2026 (command-bar export);
    // the Help button is the same chrome under the same counter-zoom.
    const b = document.querySelector('#psroot button[title="Help & shortcuts"]');
    return b ? Math.round(b.getBoundingClientRect().height) : 0;
});
// the Size & view disclosure must be open for a real click (Aug 2 2026)
await page.evaluate(() => { const t = document.getElementById('ps-sizeview-toggle'); if (t && t.getAttribute('aria-expanded') !== 'true') t.click(); });
await page.selectOption('#ps-chart-zoom', '0.75');
await page.waitForTimeout(300);
ok(chrome100 > 10 && Math.abs(chrome75 - chrome100) <= 1,
   `the engine toolbar renders at TRUE size at every zoom ` +
   `(${chrome75}px at 75% vs ${chrome100}px at 100%): only the chart scales`);
const zBar = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('[data-bar-cat]'))
        .filter(el => el.tagName.toLowerCase() === 'path' &&
                (el.getAttribute('fill') || '').indexOf('#') === 0)[0];
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await page.mouse.click(zBar.x, zBar.y);
await page.waitForTimeout(900);
ok(await page.evaluate(() => !!document.querySelector('[data-bs-tab]')),
   'click-to-edit at 75% opens the bar panel at the visual position');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
const zBars = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-bar-cat]'))
        .filter(el => el.tagName.toLowerCase() === 'path' &&
                (el.getAttribute('fill') || '').indexOf('#') === 0)
        .map(b => { const r = b.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }));
await page.keyboard.down('Shift');
await page.mouse.move(zBars[0].x, zBars[0].y);
await page.mouse.down();
for (let i = 1; i <= 12; i++) {
    await page.mouse.move(zBars[0].x + (zBars[1].x + 30 - zBars[0].x) * i / 12,
                          zBars[0].y, { steps: 1 });
    await page.waitForTimeout(25);
}
await page.mouse.up();
await page.keyboard.up('Shift');
// The engine debounces commits by 1500ms: wait on the COMMIT, not a clock.
await page.waitForFunction(() => {
    try {
        return !!JSON.parse(window.PS_SHELL.buildPayload().chartSpec
            || '{}').categoryOrder;
    } catch (e) { return false; }
}, { timeout: 6000 });
const zOrder = await page.evaluate(() => {
    try {
        return JSON.stringify(JSON.parse(
            window.PS_SHELL.buildPayload().chartSpec || '{}').categoryOrder);
    } catch (e) { return 'unparsed'; }
});
ok(zOrder === JSON.stringify(['Low dose', 'Control', 'High dose']),
   `a Shift-drag reorder at 75% commits the same order as at 100% ` +
   `(${zOrder})`);
await page.reload();
await page.waitForTimeout(1600);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-continue');
    await page.waitForTimeout(1400);
}
ok(await page.evaluate(() =>
       document.getElementById('ps-chart-zoom').value) === '0.75',
   'the chosen zoom is a per-document preference that survives a reload');
// the Size & view disclosure must be open for a real click (Aug 2 2026)
await page.evaluate(() => { const t = document.getElementById('ps-sizeview-toggle'); if (t && t.getAttribute('aria-expanded') !== 'true') t.click(); });
await page.selectOption('#ps-chart-zoom', 'fit');
await page.waitForTimeout(400);

console.log('case 8: magnification works, and cannot corrupt the canvas');
// HISTORY: 125/150% shipped, were WITHDRAWN Jul 27 2026 (the engine's
// _ensureChartRoomFor compared VISUAL rect deltas against LOGICAL svg
// attributes, so any magnified redraw inflated the canvas: 720 -> 938.78
// measured, Torry's gap-and-left-shift report), and RETURNED Jul 28 with
// his approval of the engine fix: the deltas are expressed in the svg's
// own logical units before comparing (identity in jamovi, where nothing
// zooms). This pins the whole contract: the options exist, magnification
// scales the VIEW while the figure stays logical, a type switch at 150%
// holds the canvas at 720, and the export still leaves at the standard.
const zoomOpts = await page.evaluate(() =>
    Array.from(document.getElementById('ps-chart-zoom').options)
        .map(o => o.value));
ok(zoomOpts.indexOf('1.25') !== -1 && zoomOpts.indexOf('1.5') !== -1 &&
   zoomOpts.indexOf('2') !== -1,
   `125-200% are offered (${zoomOpts.join(', ')})`);
// the Size & view disclosure must be open for a real click (Aug 2 2026)
await page.evaluate(() => { const t = document.getElementById('ps-sizeview-toggle'); if (t && t.getAttribute('aria-expanded') !== 'true') t.click(); });
await page.selectOption('#ps-chart-zoom', '2');
await page.waitForTimeout(500);
const mag = await geo();
ok(Math.abs(mag.zoom - 2) < 0.01 && mag.logicalW === 720,
   `200% (the Aug 6 ceiling) magnifies the view while the figure stays ` +
   `720px logical (shown ${mag.chartW}px)`);
// The corruption pin: cycle a graph type THROUGH THE REAL FLYOUT at 200%
// and the canvas attribute must hold - this exact gesture inflated it.
for (const label of ['Line', 'Bar']) {
    const t = await page.evaluate(() => {
        const b = document.querySelector(
            '#psroot [data-role="graphtype-trigger"]');
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.click(t.x, t.y);
    await page.waitForTimeout(400);
    const tile = await page.evaluate((lbl) => {
        const fly = document.querySelector(
            '#psroot [data-role="graphtype-flyout"]');
        const el = Array.from(fly.querySelectorAll('div,button'))
            .find(n => (n.textContent || '').trim() === lbl &&
                       n.getBoundingClientRect().width > 30);
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, label);
    await page.mouse.click(tile.x, tile.y);
    await page.waitForTimeout(1400);
}
await page.waitForTimeout(2000);   // let deferred grow sweeps run
const after = await geo();
ok(after.logicalW === 720,
   `type switches at 200% leave the canvas at 720px, not 938 ` +
   `(${after.logicalW}px)`);
const magFacts = svgFacts(await exportSvgText());
// 730 +- 1: the zoomed harvest measures the ink overhang with a
// half-pixel of rounding slack (730.66 at 150%, 730.00 at 100% - the
// exact pin lives in chart-size-check, which runs unzoomed).
ok(Math.abs(magFacts.w - 730) <= 1,
   `and the export still leaves at the standard size (${magFacts.w}px)`);
// the Size & view disclosure must be open for a real click (Aug 2 2026)
await page.evaluate(() => { const t = document.getElementById('ps-sizeview-toggle'); if (t && t.getAttribute('aria-expanded') !== 'true') t.click(); });
await page.selectOption('#ps-chart-zoom', 'fit');
await page.waitForTimeout(400);

console.log('case 9: the size and view controls lay out as rows');
// Torry's screenshot, Jul 27 2026: these rows carry BOTH ps-inspector-field
// and their own class; the later single-class inspector rule (column
// direction, width-100-percent height-29 inputs) beat the row rules on
// source order, so the checkbox rendered comically large above a centered
// label and the select went full width. The two-class selectors fix it;
// this pins the RENDERED geometry, because existence checks pass on broken
// layouts (the icon-button lesson, re-learned).
// Aug 5 2026: the View zoom moved to the chart header row
// (#ps-charttools, the Notebook/Layout placement), so its row geometry
// is judged THERE; Size & view keeps only the Standard-size checkbox.
const rows = await page.evaluate(() => {
    const r = el => el.getBoundingClientRect();
    const mid = el => r(el).top + r(el).height / 2;
    const box = document.getElementById('ps-fit-pane');
    const span = document.querySelector('.ps-fit-field span');
    const sel = document.getElementById('ps-chart-zoom');
    const zlab = document.querySelector('#ps-charttools .ps-ltool-label');
    return { boxW: Math.round(r(box).width),
             fitRow: Math.abs(mid(box) - mid(span)) < 4,
             selW: Math.round(r(sel).width),
             zoomRow: Math.abs(mid(sel) - mid(zlab)) < 4 };
});
ok(rows.boxW <= 20 && rows.fitRow,
   `the Standard-size checkbox is checkbox-sized, on one row with its ` +
   `label (${rows.boxW}px wide)`);
ok(rows.selW <= 200 && rows.zoomRow,
   `the View select is compact, on one row with its label (${rows.selW}px)`);

console.log('case 10: Cmd/Ctrl+scroll zooms smoothly between the steps');
// Torry, Aug 5 2026: the 25 percent steps are pretty big. Ctrl+wheel
// (also the Mac trackpad pinch, which arrives as a ctrl-wheel) zooms
// continuously; the select grows a dynamic option showing the custom
// value, and it leaves when a preset is picked.
await page.selectOption('#ps-chart-zoom', '1');
await page.waitForTimeout(300);
const wheelAt = async (deltaY, ctrl) => page.evaluate(([dy, c]) => {
    const host = document.querySelector('.graphbuilder2-host');
    const svg = host.querySelector('svg');
    const r = svg.getBoundingClientRect();
    host.dispatchEvent(new WheelEvent('wheel', { bubbles: true,
        cancelable: true, clientX: r.left + 60, clientY: r.top + 60,
        deltaY: dy, ctrlKey: c }));
    return { zoom: parseFloat(host.style.zoom) || 1,
             view: window.PS_SHELL.chart().viewZoom };
}, [deltaY, ctrl]);
const plainWheel = await wheelAt(-240, false);
ok(plainWheel.zoom === 1 && plainWheel.view === 1,
   'a plain wheel scrolls; only the modifier zooms');
const atDispatch = await wheelAt(-240, true);
// Eased zoom (Aug 6 2026): the wheel moves a TARGET and the view glides
// there over ~100ms - so the same-task read is UNCHANGED (a mouse notch
// no longer jumps between sizes), and the settled value is the target.
ok(atDispatch.zoom === 1,
   'the notch does not jump: the view is unchanged at dispatch (easing)');
await page.waitForFunction(() => {
    const host = document.querySelector('.graphbuilder2-host');
    const z = parseFloat(host.style.zoom) || 1;
    return z > 1.3 && Math.abs(z - window.PS_SHELL.chart().viewZoom) < 0.005;
}, null, { timeout: 4000 });
const zoomIn = await page.evaluate(() => {
    const host = document.querySelector('.graphbuilder2-host');
    return { zoom: parseFloat(host.style.zoom) || 1,
             view: window.PS_SHELL.chart().viewZoom };
});
ok(zoomIn.zoom > 1.3 && zoomIn.zoom < 1.5 &&
   Math.abs(zoomIn.view - zoomIn.zoom) < 0.01,
   `and it settles smoothly at the between-step target ` +
   `(${Math.round(zoomIn.zoom * 100)}%)`);
const dynOpt = await page.evaluate(() => {
    const sel = document.getElementById('ps-chart-zoom');
    const dyn = sel.querySelector('option[data-ps-custom]');
    return { label: dyn ? dyn.textContent : null,
             selected: dyn ? sel.value === dyn.value : false };
});
ok(dynOpt.selected && /^\d+%$/.test(dynOpt.label),
   `the select DISPLAYS the custom value instead of going blank ` +
   `("${dynOpt.label}")`);
for (let i = 0; i < 12; i++) await wheelAt(-300, true);
await page.waitForFunction(() => (parseFloat(document.querySelector(
    '.graphbuilder2-host').style.zoom) || 1) >= 1.99, null,
    { timeout: 4000 });
const ceiling = await page.evaluate(() => ({
    zoom: parseFloat(document.querySelector('.graphbuilder2-host')
        .style.zoom) || 1 }));
ok(ceiling.zoom <= 2 + 0.001,
   `the gesture clamps at the select's own 200% ceiling ` +
   `(${Math.round(ceiling.zoom * 100)}%)`);
for (let i = 0; i < 30; i++) await wheelAt(300, true);
await page.waitForFunction(() => (parseFloat(document.querySelector(
    '.graphbuilder2-host').style.zoom) || 1) <= 0.351, null,
    { timeout: 4000 });
ok(await page.evaluate(() => parseFloat(document.querySelector(
       '.graphbuilder2-host').style.zoom) || 1) >= 0.35 - 0.001,
   'and at the 35% floor going down');
await page.selectOption('#ps-chart-zoom', '1');
await page.waitForTimeout(300);
ok(await page.evaluate(() => {
    const sel = document.getElementById('ps-chart-zoom');
    return !sel.querySelector('option[data-ps-custom]') &&
        sel.value === '1';
}), 'picking a preset removes the dynamic option again');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('FIT PANES CHECK PASS');
await browser.close();
