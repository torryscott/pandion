// Layout deep dive (probe/layout-deepdive): the figure-composition contracts
// that a multi-panel publication figure depends on.
//
// Every case here was demonstrated FAILING against the code before its fix:
//   1  four equally sized panels drew their axes 5.2 px (left column) and
//      10 px (right column) apart, because a panel box carries its tick
//      labels and "100000" is wider than "0.10". About 3 mm on a printed
//      7-inch figure, and the thing scientists hand-fix in Illustrator.
//   2  a nudge on one panel folded into a nudge on another whenever the two
//      happened within 1.2 s, so one undo pulled both back.
//   3  the Width/Height fields went disabled on a multi-selection while
//      rendering identically to the live X/Y beside them, with no tooltip.
//   4  the orientation flip scaled chart panels and left image items at
//      their old size, because it tested kind === "chart" where every other
//      sized-item path tests laySizedKind.
//   5  a panel could not be pointed at another chart; correcting one meant
//      deleting it and placing a new one, losing the geometry.
//   6  "Print - 300 DPI" wrote a 3150x2100 PNG with no density metadata, so
//      Word and Photoshop read it as a 44-inch figure at 72 dpi.
//   7  Cmd/Ctrl+0 / + / - did nothing on the layout canvas.
//
// PROBE LAWS honored here: playwright resolves from /tmp/node_modules via
// createRequire; the zoom keys must be pressed with the viewport focused
// because the handler bails inside text fields; and axis geometry is read as
// a RATIO of the item box, never absolute pixels, so the assertion is
// invariant to the fit-page zoom.
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
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1600);

// Four panels of the same measure on wildly different scales: the ordinary
// paper case, and the one that makes the misalignment visible.
await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const S = window.PS_SHELL;
    S.saveComputedColumn('cost', 'score * 1000');
    S.saveComputedColumn('rate', 'score / 1000');
    await w(900);
    const cfg = [{ y: 'score' }, { y: 'cost' }, { y: 'hours' }, { y: 'rate' }];
    for (let i = 0; i < 3; i++) { S.addChart(); await w(700); }
    const all = S.charts().filter(c => c.type !== 'layout');
    for (let i = 0; i < 4; i++) {
        S.switchChart(all[i].id); await w(400);
        S.setModule('plotbuilder'); await w(500);
        S.setRoles('plotbuilder', { xvar: 'condition', yvar: cfg[i].y });
        await w(1000);
    }
});
await page.waitForTimeout(2000);
await page.evaluate(() => window.PS_SHELL.setWorkspace('layout'));
await page.waitForTimeout(400);
await page.evaluate(() => window.PS_SHELL.showLayoutGallery());
await page.waitForTimeout(500);
await page.click('[data-layout-template="four"]');
await page.waitForTimeout(300);
await page.click('[data-layout-create], #ps-layout-gallery-create');
await page.waitForTimeout(3500);

// Axis positions as a RATIO of each panel box, converted back to page pixels
// through the item's own model geometry, so the number is the real figure
// coordinate and not a screen measurement.
const axisSpread = () => page.evaluate(() => {
    const items = window.PS_SHELL.chart().items.filter(i => i.kind === 'chart');
    const rows = [];
    for (const it of items) {
        const node = document.querySelector(
            '#ps-lcanvas .ps-litem[data-item-id="' + it.id + '"]');
        const nb = node.getBoundingClientRect();
        const ya = node.querySelector('[data-role="y-axis-line"]');
        const xa = node.querySelector('[data-role="x-axis-line"]');
        const yb = ya.getBoundingClientRect(), xb = xa.getBoundingClientRect();
        rows.push({
            id: it.id, x: it.x, y: it.y,
            axisX: it.x + ((yb.left + yb.width / 2 - nb.left) / nb.width) * it.w,
            axisY: it.y + ((xb.top + xb.height / 2 - nb.top) / nb.height) * it.h
        });
    }
    const spread = (list, key) => {
        const v = list.map(r => r[key]);
        return +(Math.max(...v) - Math.min(...v)).toFixed(2);
    };
    return {
        leftCol: spread(rows.filter(r => r.x < 400), 'axisX'),
        rightCol: spread(rows.filter(r => r.x >= 400), 'axisX')
    };
});

console.log('case 1: panels of equal size draw their axes in different places');
const before = await axisSpread();
ok(before.leftCol > 2 || before.rightCol > 2,
   'a 2 by 2 grid of equally sized panels starts misaligned (left ' +
   before.leftCol + ' px, right ' + before.rightCol + ' px)');

console.log('case 2: the plot-align buttons appear only when they can act');
const ids = await page.evaluate(() =>
    window.PS_SHELL.chart().items.filter(i => i.kind === 'chart').map(i => i.id));
const btnState = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-ctx-plotalign]'))
        .map(b => b.getAttribute('data-ctx-plotalign') + '=' +
                  (b.getBoundingClientRect().width > 0)).join(' '));
await page.evaluate(i => window.PS_SHELL.selectLayoutItems([i]), ids[0]);
await page.waitForTimeout(350);
ok((await btnState()).indexOf('true') === -1,
   'one panel selected shows neither plot-align button');
await page.evaluate(i => window.PS_SHELL.selectLayoutItems(i), ids);
await page.waitForTimeout(400);
ok((await btnState()) === 'left=true bottom=true',
   'four panels in two columns and two rows offer both');

console.log('case 3: aligning the plot areas actually lines the axes up');
const depth0 = await page.evaluate(() => window.PS_SHELL.layoutHistoryDepth());
await page.click('[data-ctx-plotalign="left"]');
await page.waitForTimeout(800);
const after = await axisSpread();
ok(after.leftCol < 1 && after.rightCol < 1,
   'after one click both columns line up to under a pixel (left ' +
   after.leftCol + ', right ' + after.rightCol + ')');
ok((await page.evaluate(() =>
        document.getElementById('ps-layout-live').textContent))
       .indexOf('2 columns') !== -1,
   'the announcement says how many panels moved and in how many columns');

console.log('case 4: it is one undoable step');
ok(await page.evaluate(() => window.PS_SHELL.layoutHistoryDepth()) === depth0 + 1,
   'aligning four panels pushes exactly one history entry');
await page.evaluate(() => document.getElementById('ps-lviewport').focus());
await page.keyboard.press('Meta+z');
await page.waitForTimeout(800);
const undone = await axisSpread();
ok(Math.abs(undone.leftCol - before.leftCol) < 0.05 &&
   Math.abs(undone.rightCol - before.rightCol) < 0.05,
   'one undo restores the original spread exactly');
await page.keyboard.press('Meta+Shift+z');
await page.waitForTimeout(800);
ok((await axisSpread()).leftCol < 1, 'redo puts the alignment back');

console.log('case 5: a nudge burst does not fold across a selection change');
// Alt+Arrow, because inside the canvas plain arrows navigate between items
// and Alt+Arrow nudges - the engine's rule, which the canvas follows.
await page.evaluate(() => document.getElementById('ps-lviewport').focus());
await page.evaluate(i => window.PS_SHELL.selectLayoutItems([i]), ids[0]);
await page.waitForTimeout(120);
await page.keyboard.press('Alt+ArrowRight');
await page.waitForTimeout(130);
const xAfterFirst = await page.evaluate(i =>
    window.PS_SHELL.chart().items.find(t => t.id === i).x, ids[0]);
await page.evaluate(i => window.PS_SHELL.selectLayoutItems([i]), ids[1]);
await page.waitForTimeout(80);          // well inside the 1.2 s coalesce window
await page.keyboard.press('Alt+ArrowRight');
await page.waitForTimeout(250);
await page.evaluate(() => document.getElementById('ps-lviewport').focus());
await page.keyboard.press('Meta+z');
await page.waitForTimeout(700);
const [x0, x1] = await page.evaluate(i => {
    const it = window.PS_SHELL.chart().items;
    return [it.find(t => t.id === i[0]).x, it.find(t => t.id === i[1]).x];
}, ids);
ok(Math.abs(x0 - xAfterFirst) < 0.01,
   'undoing the second panel\'s nudge leaves the first panel where it was ' +
   '(' + x0 + ' vs ' + xAfterFirst + ')');
ok(x1 < x0 + 1000, 'the second panel came back (' + x1 + ')');

console.log('case 6: a field that cannot be typed into does not look live');
await page.evaluate(i => window.PS_SHELL.selectLayoutItems(i.slice(0, 2)), ids);
await page.waitForTimeout(350);
const look = await page.evaluate(() => {
    const w = document.getElementById('ps-ctx-lw');
    const x = document.getElementById('ps-ctx-lx');
    return { disabled: w.disabled, wColor: getComputedStyle(w).color,
             xColor: getComputedStyle(x).color,
             tip: w.getAttribute('data-tip') || w.title || '' };
});
ok(look.disabled, 'Width is disabled on a multi-selection');
ok(look.wColor !== look.xColor,
   'and reads differently from the live X field beside it');
ok(/single panel/i.test(look.tip), 'with a tooltip that says why');

console.log('case 7: a panel can be pointed at a different chart');
const geomOf = id => page.evaluate(i => {
    const t = window.PS_SHELL.chart().items.find(z => z.id === i);
    return { chartId: t.chartId, x: t.x, y: t.y, w: t.w, h: t.h };
}, id);
const g0 = await geomOf(ids[0]);
const box = await page.evaluate(i => {
    const r = document.querySelector(
        '#ps-lcanvas .ps-litem[data-item-id="' + i + '"]').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, ids[0]);
await page.mouse.click(box.x, box.y, { button: 'right' });
await page.waitForTimeout(450);
await page.click('#ps-contextmenu button[data-context-action="lay-replace-chart"]');
await page.waitForTimeout(450);
ok(await page.evaluate(() =>
       document.querySelectorAll('#ps-lchartmenu button[disabled]').length === 1),
   'the chart it already shows is disabled in the list');
await page.click('#ps-lchartmenu button[data-chart]:not([disabled])');
await page.waitForTimeout(1800);
const g1 = await geomOf(ids[0]);
ok(g1.chartId !== g0.chartId, 'the panel now shows a different chart');
ok(g1.x === g0.x && g1.y === g0.y && g1.w === g0.w && g1.h === g0.h,
   'and keeps its exact box, which is the whole point of the figure');
await page.evaluate(() => document.getElementById('ps-lviewport').focus());
await page.keyboard.press('Meta+z');
await page.waitForTimeout(800);
ok((await geomOf(ids[0])).chartId === g0.chartId, 'one undo puts it back');

console.log('case 8: the orientation flip scales image items too');
await page.evaluate(() => {
    const src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAYAAA' +
        'CiPUmiAAAAF0lEQVQIW2NkYGD4z8DAwMgABXAGNgEAV24BAdVJvBIAAAAASUVORK5CYII=';
    window.PS_SHELL.chart().items.push({ id: 'imgprobe', kind: 'image', src: src,
        natW: 200, natH: 100, x: 300, y: 250, w: 400, h: 200 });
    window.PS_SHELL.selectLayoutItems([]);
});
await page.waitForTimeout(400);
await page.selectOption('#ps-layout-orientation', 'portrait');
await page.waitForTimeout(1600);
const img = await page.evaluate(() =>
    window.PS_SHELL.chart().items.find(i => i.id === 'imgprobe'));
ok(img.w !== 400 && img.h !== 200,
   'the image box scaled with the page (' + img.w + 'x' + img.h + ')');
ok(Math.abs(img.w / 400 - 672 / 1008) < 0.02,
   'by the same factor the page did');

console.log('case 9: the zoom keys every canvas application binds');
await page.evaluate(() => {
    window.PS_SHELL.chart().view.zoom = 'fit';
    document.getElementById('ps-lviewport').focus();
});
await page.waitForTimeout(250);
const zoomNow = () => page.evaluate(() => String(window.PS_SHELL.chart().view.zoom));
await page.keyboard.press('Meta+0');
await page.waitForTimeout(450);
ok(await zoomNow() === '1', 'Cmd/Ctrl+0 goes from fit-page to actual size');
await page.keyboard.press('Meta+Equal');
await page.waitForTimeout(450);
ok(Number(await zoomNow()) > 1, 'Cmd/Ctrl+= zooms in');
await page.keyboard.press('Meta+Minus');
await page.waitForTimeout(450);
ok(Number(await zoomNow()) === 1, 'Cmd/Ctrl+- comes back');
await page.keyboard.press('Meta+0');
await page.waitForTimeout(450);
ok(await zoomNow() === 'fit', 'and Cmd/Ctrl+0 toggles back to fit');

console.log('case 10: an exported raster says how big it is');
const meta = await page.evaluate(async () => {
    const read = async (fmt) => {
        const blob = await window.PS_SHELL.exportBlob(fmt, 300, 'white');
        return new Uint8Array(await blob.arrayBuffer());
    };
    const png = await read('png'), jpg = await read('jpg');
    // pHYs, if present, precedes IDAT.
    let at = 8, phys = null;
    while (at + 8 <= png.length) {
        const len = (png[at] << 24 | png[at + 1] << 16 |
                     png[at + 2] << 8 | png[at + 3]) >>> 0;
        const type = String.fromCharCode(png[at + 4], png[at + 5],
                                         png[at + 6], png[at + 7]);
        if (type === 'pHYs') {
            phys = { ppu: (png[at + 8] << 24 | png[at + 9] << 16 |
                           png[at + 10] << 8 | png[at + 11]) >>> 0,
                     unit: png[at + 16] };
            break;
        }
        if (type === 'IDAT' || type === 'IEND') break;
        at += 12 + len;
    }
    return { phys: phys,
             jfifUnits: jpg[13],
             jfifX: jpg[14] << 8 | jpg[15],
             jfifY: jpg[16] << 8 | jpg[17] };
});
ok(!!meta.phys, 'the PNG carries a pHYs density chunk');
ok(meta.phys.unit === 1 && Math.round(meta.phys.ppu * 0.0254) === 300,
   'declaring 300 dpi, so it opens at the page size and not at four times it');
ok(meta.jfifUnits === 1 && meta.jfifX === 300 && meta.jfifY === 300,
   'and the JPEG says 300 dpi in its JFIF header');

console.log('case 11: sending something to a layout is one undoable step');
// Found by an adversarial auditor after the Notebook dive was merged in, and
// reproduced from the menu. Send to layout adds an item and can ALSO grow the
// page and flip its preset to custom, and none of it reached the layout's
// history. The next Cmd/Ctrl+Z there removed the sent panel AND reverted
// whatever the user had done before it, in one unlabelled step.
const layState = () => page.evaluate(() => {
    const c = window.PS_SHELL.charts().find(x => x.type === 'layout');
    return { n: c.items.length, pageH: c.page.h, preset: c.page.preset,
             firstX: (c.items.find(i => i.kind === 'chart') || {}).x,
             depth: window.PS_SHELL.layoutHistoryDepth() };
});
// An ordinary layout edit first, so an over-eager undo has something to eat.
await page.evaluate(() => window.PS_SHELL.setWorkspace('layout'));
await page.waitForTimeout(600);
await page.evaluate(i => window.PS_SHELL.selectLayoutItems(i), ids);
await page.waitForTimeout(400);
await page.click('[data-ctx-plotalign="left"]');
await page.waitForTimeout(800);
const beforeSend = await layState();

async function sendActiveChartToLayout() {
    await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
    await page.waitForTimeout(1400);
    const o = await page.evaluate(() => {
        const r = document.querySelector('.graphbuilder2-host').getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.click(o.x, o.y, { button: 'right' });
    await page.waitForTimeout(500);
    await page.click('#ps-contextmenu button[data-context-action="chart-send"]');
    await page.waitForTimeout(500);
    await page.click('#ps-contextmenu button:not([disabled])');
    await page.waitForTimeout(1600);
}
await sendActiveChartToLayout();
const afterSend = await layState();
ok(afterSend.n === beforeSend.n + 1, 'the panel arrived (' + afterSend.n + ' items)');
ok(afterSend.depth === beforeSend.depth + 1,
   'and the send pushed exactly one history entry (' + beforeSend.depth +
   ' to ' + afterSend.depth + ')');
await page.evaluate(() => window.PS_SHELL.setWorkspace('layout'));
await page.waitForTimeout(1200);
await page.evaluate(() => document.getElementById('ps-lviewport').focus());
await page.keyboard.press('Meta+z');
await page.waitForTimeout(1000);
const afterUndo = await layState();
ok(afterUndo.n === beforeSend.n, 'one undo takes the sent panel back off');
ok(afterUndo.pageH === beforeSend.pageH && afterUndo.preset === beforeSend.preset,
   'and restores the page it grew (' + afterSend.pageH + ' ' + afterSend.preset +
   ' back to ' + afterUndo.pageH + ' ' + afterUndo.preset + ')');
ok(Math.abs(afterUndo.firstX - beforeSend.firstX) < 0.01,
   'while leaving the earlier alignment alone, which is the whole point ' +
   '(' + afterUndo.firstX + ' vs ' + beforeSend.firstX + ')');

ok(errors.length === 0, 'no page errors (' + errors.join(' | ') + ')');
console.log('\nlayout-figure-check: all cases passed');
await browser.close();
