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
//   8  Send to layout recorded no history step, so the next undo in that
//      layout removed the sent panel AND reverted an unrelated earlier edit.
//   9  a drag on empty canvas cleared the selection and did nothing else;
//      there was no marquee, so multi-select was click by click.
//  10  there was no way to make two panels the same size.
//  11  the Text section hid itself the moment a second item was selected,
//      so restyling four panel letters was four visits to the same panel.
//  12  a selected chart panel's toolbar sat exactly on its own panel letter
//      (measured: a 19x24 label under a 33x24 bar at the same x).
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

console.log('case 12: a drag on empty canvas selects what it touches');
// The gesture every design tool answers the same way, and the one that makes
// multi-select cheap enough for the rows below to be worth having. Before
// this, a drag on empty canvas cleared the selection and did nothing else.
// Case 8 left the page portrait with a probe image on it, so this puts the
// fixture back to the landscape 2 by 2 the geometry below assumes.
await page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    c.items = c.items.filter(i => i.id !== 'imgprobe');
    window.PS_SHELL.selectLayoutItems([]);
});
await page.selectOption('#ps-layout-orientation', 'landscape');
await page.waitForTimeout(1600);
const canvasGeom = await page.evaluate(() => {
    const cv = document.getElementById('ps-lcanvas');
    const r = cv.getBoundingClientRect();
    return { l: r.left, t: r.top, z: r.width / window.PS_SHELL.chart().page.w,
             pageW: window.PS_SHELL.chart().page.w,
             pageH: window.PS_SHELL.chart().page.h };
});
const at = (x, y) => ({ x: canvasGeom.l + x * canvasGeom.z,
                        y: canvasGeom.t + y * canvasGeom.z });
async function marquee(x0, y0, x1, y1, mod) {
    const a = at(x0, y0), b = at(x1, y1);
    if (mod) await page.keyboard.down(mod);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 6 });
    await page.waitForTimeout(120);
    const live = await page.evaluate(() =>
        ({ box: !!document.querySelector('.ps-lmarquee'),
           sel: window.PS_SHELL.layoutSelection().length }));
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.waitForTimeout(120);
    await page.mouse.up();
    if (mod) await page.keyboard.up(mod);
    await page.waitForTimeout(450);
    return live;
}
await page.evaluate(() => window.PS_SHELL.selectLayoutItems([]));
await page.waitForTimeout(300);
// A box down the left half of the page. Asserted on WHICH items, not how
// many, so it stays meaningful whatever the fixture's exact geometry is.
const half = canvasGeom.pageW * 0.49;
const live = await marquee(2, 2, half, canvasGeom.pageH - 2);
ok(live.box, 'a box is drawn while the pointer is down');
ok(live.sel > 0, 'and the selection updates live, before the release');
const leftCol = await page.evaluate(() => window.PS_SHELL.layoutSelection());
const expectIn = ['i1', 'i3', 'i5', 'i7'], expectOut = ['i2', 'i4', 'i6', 'i8'];
ok(expectIn.every(k => leftCol.indexOf(k) !== -1),
   'releasing keeps the two left panels and their two labels (' +
   leftCol.join(',') + ')');
ok(expectOut.every(k => leftCol.indexOf(k) === -1),
   'and nothing from the right column came with them');
ok(await page.evaluate(() => !document.querySelector('.ps-lmarquee')),
   'and the box is gone');
ok(/\d+ items selected/.test(await page.evaluate(() =>
       document.getElementById('ps-layout-live').textContent)),
   'the count is announced');
await page.mouse.click(at(2, 2).x, at(2, 2).y);
await page.waitForTimeout(400);
ok((await page.evaluate(() => window.PS_SHELL.layoutSelection())).length === 0,
   'a press that never travels still clears, which is what it always did');
await page.evaluate(() => window.PS_SHELL.selectLayoutItems(['i1']));
await page.waitForTimeout(250);
await marquee(canvasGeom.pageW * 0.52, canvasGeom.pageH * 0.5,
              canvasGeom.pageW - 2, canvasGeom.pageH - 2, 'Shift');
ok((await page.evaluate(() => window.PS_SHELL.layoutSelection())).indexOf('i1') !== -1,
   'shift-drag adds to the selection rather than replacing it');

console.log('case 13: Escape abandons the box and puts the selection back');
await page.evaluate(() => window.PS_SHELL.selectLayoutItems(['i1']));
await page.waitForTimeout(250);
{
    const a = at(canvasGeom.pageW * 0.52, canvasGeom.pageH * 0.5);
    const b = at(canvasGeom.pageW - 2, canvasGeom.pageH - 2);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.waitForTimeout(120);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.mouse.up();
    await page.waitForTimeout(300);
}
const afterEsc = await page.evaluate(() => window.PS_SHELL.layoutSelection());
ok(afterEsc.length === 1 && afterEsc[0] === 'i1',
   'the selection that was there before the drag is restored (' +
   afterEsc.join(',') + ')');
ok(await page.evaluate(() => !document.querySelector('.ps-lmarquee')),
   'and the box is torn down');

console.log('case 14: two panels can be made the same size in one action');
await page.evaluate(() => {
    const it = window.PS_SHELL.chart().items.find(i => i.kind === 'chart');
    it.w = 300; it.h = 200;
    window.PS_SHELL.selectLayoutItems([]);
});
await page.waitForTimeout(400);
await page.evaluate(() => window.PS_SHELL.selectLayoutItems(['i1', 'i2']));
await page.waitForTimeout(400);
ok(await page.evaluate(() => {
       const r = document.querySelector('.ps-inspector-samesize');
       return r && getComputedStyle(r).display !== 'none';
   }), 'the Same size row appears for two sized items');
ok(/Chart 2/.test(await page.evaluate(() =>
       document.querySelector('[data-ctx-samesize="wh"]').getAttribute('data-tip'))),
   'and names what it will match, so "the same as what" is never a guess');
const sizeDepth = await page.evaluate(() => window.PS_SHELL.layoutHistoryDepth());
await page.click('[data-ctx-samesize="w"]');
await page.waitForTimeout(600);
// Against the target's own width rather than a literal, because an earlier
// case round-trips the page through portrait and back and a scale of 1.5
// then 0.667 does not land on the same integer.
const wOnly = await page.evaluate(() => {
    const it = window.PS_SHELL.chart().items.find(i => i.id === 'i1');
    const tgt = window.PS_SHELL.chart().items.find(i => i.id === 'i2');
    return { w: Math.round(it.w), h: Math.round(it.h), tw: Math.round(tgt.w) };
});
ok(wOnly.w === wOnly.tw && wOnly.h === 200,
   'Width matches the width and leaves the height alone (' +
   wOnly.w + 'x' + wOnly.h + ', target width ' + wOnly.tw + ')');
await page.click('[data-ctx-samesize="wh"]');
await page.waitForTimeout(600);
ok(await page.evaluate(() => {
       const a = window.PS_SHELL.chart().items.find(i => i.id === 'i1');
       const b = window.PS_SHELL.chart().items.find(i => i.id === 'i2');
       return Math.round(a.w) === Math.round(b.w) && Math.round(a.h) === Math.round(b.h);
   }), 'and Both matches both');
ok(await page.evaluate(() => window.PS_SHELL.layoutHistoryDepth()) === sizeDepth + 2,
   'each is one history entry');
await page.evaluate(() => window.PS_SHELL.selectLayoutItems(['i5', 'i6']));
await page.waitForTimeout(400);
ok(await page.evaluate(() =>
       getComputedStyle(document.querySelector('.ps-inspector-samesize')).display === 'none'),
   'and it hides for text items, which size themselves to their content');

console.log('case 15: a set of text items restyles together');
await page.evaluate(() => window.PS_SHELL.selectLayoutItems(['i5', 'i6', 'i7', 'i8']));
await page.waitForTimeout(450);
const txtSec = () => page.evaluate(() => {
    const e = document.getElementById('ps-layout-text-section');
    const n = document.getElementById('ps-ltx-size-num');
    return { shown: getComputedStyle(e).display !== 'none',
             title: e.querySelector('.ps-inspector-section-title').textContent,
             size: n.value, placeholder: n.placeholder,
             italic: document.getElementById('ps-ltx-italic').getAttribute('aria-pressed') };
});
const four = await txtSec();
ok(four.shown, 'the Text section is there with four labels selected');
ok(/4 items/.test(four.title), 'and says how many it is about to change ("' +
   four.title + '")');
await page.evaluate(() => {
    const n = document.getElementById('ps-ltx-size-num');
    n.value = '11';
    n.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(700);
ok(await page.evaluate(() =>
       window.PS_SHELL.chart().items.filter(i => i.kind === 'text')
           .every(i => i.fontSize === 11)),
   'one edit changes all four');
await page.evaluate(() => document.getElementById('ps-lviewport').focus());
await page.keyboard.press('Meta+z');
await page.waitForTimeout(700);
ok(await page.evaluate(() =>
       window.PS_SHELL.chart().items.filter(i => i.kind === 'text')
           .every(i => i.fontSize !== 11)),
   'and one undo takes all four back');
await page.evaluate(() => {
    const it = window.PS_SHELL.chart().items.find(i => i.text === 'B');
    it.fontSize = 30; it.italic = true;
    window.PS_SHELL.selectLayoutItems(['i5', 'i6', 'i7', 'i8']);
});
await page.waitForTimeout(500);
const mixed = await txtSec();
ok(mixed.size === '' && /Mixed/i.test(mixed.placeholder),
   'where they disagree the field says Mixed rather than showing one of them');
ok(mixed.italic === 'mixed', 'and a toggle reports aria-pressed="mixed"');
// Order matters once Text can appear beside Align. With several things
// selected, arranging them is why you selected them, and the Text section
// carries a colour picker about 330 px tall, so leaving Text first pushed
// every arrangement control below the fold.
await page.evaluate(() => window.PS_SHELL.selectLayoutItems(['i1', 'i3', 'i5', 'i7']));
await page.waitForTimeout(500);
const railOrder = await page.evaluate(() =>
    [...document.querySelectorAll('#ps-layout-selection-properties ' +
        '.ps-inspector-section-title, #ps-layout-selection-properties ' +
        '.ps-inspector-sublabel')]
        .filter(e => e.offsetParent).map(e => e.textContent).join(' > '));
ok(railOrder.indexOf('Align') < railOrder.indexOf('Text'),
   'arranging comes before styling on a mixed selection ("' + railOrder + '")');

console.log('case 16: selecting a panel does not cover its own letter');
await page.evaluate(() => window.PS_SHELL.selectLayoutItems(['i1']));
await page.waitForTimeout(450);
const barHits = await page.evaluate(() => {
    const bar = document.querySelector('#ps-lcanvas .ps-lbar');
    if (!bar) return null;
    const b = bar.getBoundingClientRect();
    const hit = r => !(b.right < r.left || b.left > r.right ||
                       b.bottom < r.top || b.top > r.bottom);
    const labels = [...document.querySelectorAll(
        '#ps-lcanvas .ps-litem[data-kind="text"]')].map(e => e.getBoundingClientRect());
    const badge = document.querySelector('#ps-lcanvas .ps-litem-srcbadge');
    const handle = document.querySelector('#ps-lcanvas .ps-lhandle');
    return { label: labels.some(hit),
             badge: badge ? hit(badge.getBoundingClientRect()) : false,
             handle: handle ? hit(handle.getBoundingClientRect()) : false };
});
ok(barHits && !barHits.label,
   'the panel toolbar clears every panel letter on the page');
ok(barHits && !barHits.badge && !barHits.handle,
   'and neither the Live badge nor the resize handle');

console.log('case 17: Same size never claims a match it did not make');
// An adversarial audit of the first cut found it clamping the copied size to
// the room left where the item already sat, then announcing a match anyway,
// so the panel ended a different size from the one the button named.
await page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    const a = c.items.find(i => i.id === 'i1'), b = c.items.find(i => i.id === 'i4');
    a.x = 20; a.y = 20; a.w = 900; a.h = 600;
    b.x = 900; b.y = 600; b.w = 100; b.h = 60;
    window.PS_SHELL.selectLayoutItems(['i4', 'i1']);
});
await page.waitForTimeout(500);
await page.click('[data-ctx-samesize="wh"]');
await page.waitForTimeout(700);
const matched = await page.evaluate(() => {
    const b = window.PS_SHELL.chart().items.find(i => i.id === 'i4');
    return { w: Math.round(b.w), h: Math.round(b.h),
             x: Math.round(b.x), y: Math.round(b.y),
             said: document.getElementById('ps-layout-live').textContent };
});
ok(matched.w === 900 && matched.h === 600,
   'the item really is the size the button named (' +
   matched.w + 'x' + matched.h + ')');
ok(matched.x < 900 && matched.y < 600,
   'reached by MOVING it to where that size fits, not by shrinking it ' +
   'to the room that happened to be left (' + matched.x + ',' + matched.y + ')');
const noopDepth = await page.evaluate(() => window.PS_SHELL.layoutHistoryDepth());
await page.click('[data-ctx-samesize="wh"]');
await page.waitForTimeout(600);
ok(await page.evaluate(() => window.PS_SHELL.layoutHistoryDepth()) === noopDepth,
   'a press that changes nothing costs no history entry');
ok(/Already the same size/.test(await page.evaluate(() =>
       document.getElementById('ps-layout-live').textContent)),
   'and says so rather than reporting a match');

console.log('case 18: Same size says when it has undone an alignment');
// The two rail rows genuinely fight in the order a person uses them, because
// changing a panel's size moves its axis inside its box. Disclosed rather
// than re-aligned behind their back.
await page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    const a = c.items.find(i => i.id === 'i1');
    a.x = 32; a.y = 60; a.w = 463; a.h = 240;
    const b = c.items.find(i => i.id === 'i3');
    b.x = 32; b.y = 373; b.w = 463; b.h = 267;
    window.PS_SHELL.selectLayoutItems(['i1', 'i3']);
});
await page.waitForTimeout(600);
await page.click('[data-ctx-plotalign="left"]');
await page.waitForTimeout(700);
await page.evaluate(() => window.PS_SHELL.selectLayoutItems(['i1', 'i3']));
await page.waitForTimeout(400);
await page.click('[data-ctx-samesize="h"]');
await page.waitForTimeout(700);
ok(/no longer line up/.test(await page.evaluate(() =>
       document.getElementById('ps-layout-live').textContent)),
   'evening the heights out says the axes drifted, so the row above is ' +
   'worth clicking again');

console.log('case 19: Bold resolves a mixed set instead of inverting it');
await page.evaluate(() => {
    window.PS_SHELL.chart().items.filter(i => i.kind === 'text')
        .forEach((t, n) => { t.bold = n === 0; t.italic = false; });
    window.PS_SHELL.selectLayoutItems(['i5', 'i6', 'i7', 'i8']);
});
await page.waitForTimeout(500);
ok(await page.evaluate(() =>
       document.getElementById('ps-ltx-bold').getAttribute('aria-pressed')) === 'mixed',
   'a set that disagrees reports mixed');
await page.click('#ps-ltx-bold');
await page.waitForTimeout(600);
ok(await page.evaluate(() =>
       window.PS_SHELL.chart().items.filter(i => i.kind === 'text')
           .every(t => t.bold)),
   'and one press makes them all bold, rather than flipping each member ' +
   'and leaving the set mixed forever');
await page.click('#ps-ltx-bold');
await page.waitForTimeout(600);
ok(await page.evaluate(() =>
       window.PS_SHELL.chart().items.filter(i => i.kind === 'text')
           .every(t => !t.bold)),
   'a second press turns them all off');

console.log('case 20: two text edits on two sets are two undo steps');
// The same defect case 5 fixed for nudges, in the control that made it easy
// to hit: restyling a figure's labels in two groups is the normal way.
await page.evaluate(() => window.PS_SHELL.selectLayoutItems(['i5', 'i6']));
await page.waitForTimeout(300);
await page.evaluate(() => {
    const n = document.getElementById('ps-ltx-size-num');
    n.value = '30'; n.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(400);
await page.evaluate(() => window.PS_SHELL.selectLayoutItems(['i7', 'i8']));
await page.waitForTimeout(200);          // inside the 1.2 s coalesce window
await page.evaluate(() => {
    const n = document.getElementById('ps-ltx-size-num');
    n.value = '9'; n.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(600);
await page.evaluate(() => document.getElementById('ps-lviewport').focus());
await page.keyboard.press('Meta+z');
await page.waitForTimeout(700);
const sizes = await page.evaluate(() => {
    const t = window.PS_SHELL.chart().items.filter(i => i.kind === 'text');
    return { ab: t.filter(i => 'AB'.indexOf(i.text) !== -1).map(i => i.fontSize),
             cd: t.filter(i => 'CD'.indexOf(i.text) !== -1).map(i => i.fontSize) };
});
ok(sizes.ab.every(v => v === 30),
   'undoing the second group leaves the first group where it was (' +
   sizes.ab.join(',') + ')');
ok(sizes.cd.every(v => v !== 9), 'and the second group came back (' +
   sizes.cd.join(',') + ')');

console.log('case 21: the marquee survives what pointer gestures run into');
const cg = await page.evaluate(() => {
    const r = document.getElementById('ps-lcanvas').getBoundingClientRect();
    return { l: r.left, t: r.top, z: r.width / window.PS_SHELL.chart().page.w,
             pw: window.PS_SHELL.chart().page.w,
             ph: window.PS_SHELL.chart().page.h };
});
const pt = (x, y) => ({ x: cg.l + x * cg.z, y: cg.t + y * cg.z });
const boxCount = () => page.evaluate(() =>
    document.querySelectorAll('.ps-lmarquee').length);
// Escape before the press has travelled must leave the press usable, not
// silently kill it. The first cut tore the gesture down before checking
// whether it had armed, so the drag that followed drew nothing at all.
await page.evaluate(() => window.PS_SHELL.selectLayoutItems([]));
await page.waitForTimeout(300);
await page.mouse.move(pt(4, 4).x, pt(4, 4).y);
await page.mouse.down();
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await page.mouse.move(pt(cg.pw * 0.49, cg.ph - 4).x, pt(cg.pw * 0.49, cg.ph - 4).y,
                      { steps: 8 });
await page.waitForTimeout(150);
ok(await boxCount() > 0,
   'a press that was Escaped before it travelled still draws a box');
await page.mouse.up();
await page.waitForTimeout(400);
// A cancelled pointer never sends pointerup, so nothing else would end it.
await page.evaluate(() => window.PS_SHELL.selectLayoutItems([]));
await page.mouse.move(pt(4, 4).x, pt(4, 4).y);
await page.mouse.down();
await page.mouse.move(pt(300, 300).x, pt(300, 300).y, { steps: 6 });
await page.waitForTimeout(150);
await page.evaluate(() =>
    document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true })));
await page.waitForTimeout(300);
ok(await boxCount() === 0, 'a pointercancel tears the box down');
await page.mouse.move(pt(900, 600).x, pt(900, 600).y, { steps: 6 });
await page.waitForTimeout(250);
ok(await boxCount() === 0 &&
   (await page.evaluate(() => window.PS_SHELL.layoutSelection())).length === 0,
   'and a move with no button held afterwards does nothing');
await page.mouse.up();
// A switch mid-drag must not go on rewriting a figure nobody is looking at.
await page.evaluate(() => window.PS_SHELL.selectLayoutItems(['i1', 'i2', 'i3']));
await page.mouse.move(pt(4, 4).x, pt(4, 4).y);
await page.mouse.down();
await page.mouse.move(pt(200, 200).x, pt(200, 200).y, { steps: 5 });
await page.waitForTimeout(150);
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(400);
await page.mouse.move(pt(900, 600).x, pt(900, 600).y, { steps: 5 });
await page.waitForTimeout(250);
await page.mouse.up();
await page.waitForTimeout(300);
const kept = await page.evaluate(() => window.PS_SHELL.layoutSelection());
ok(kept.length === 3 && await boxCount() === 0,
   'a workspace switch ends the gesture and restores what was selected (' +
   kept.join(',') + ')');
await page.evaluate(() => window.PS_SHELL.setWorkspace('layout'));
await page.waitForTimeout(1000);

console.log('case 22: the primary is something the box reached, and the rail agrees');
// Earlier cases move panels about deliberately, so this puts the 2 by 2 back
// and pre-selects a panel in the RIGHT column, which the left-half box below
// cannot reach. That is the whole point of the assertion.
await page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    const put = (id, x, y) => {
        const it = c.items.find(i => i.id === id);
        it.x = x; it.y = y; it.w = 463; it.h = 267;
    };
    put('i1', 32, 60); put('i2', 513, 60); put('i3', 32, 373); put('i4', 513, 373);
    window.PS_SHELL.selectLayoutItems(['i4']);
});
await page.waitForTimeout(500);
await page.keyboard.down('Shift');
await page.mouse.move(pt(2, 2).x, pt(2, 2).y);
await page.mouse.down();
await page.mouse.move(pt(cg.pw * 0.49, cg.ph - 2).x, pt(cg.pw * 0.49, cg.ph - 2).y,
                      { steps: 8 });
await page.waitForTimeout(200);
const ringsDuring = await page.evaluate(() =>
    document.querySelectorAll('.ps-litem-primary').length);
await page.mouse.up();
await page.keyboard.up('Shift');
await page.waitForTimeout(500);
ok(ringsDuring === 1,
   'the key-object ring stays on during the drag that is choosing it');
const agree = await page.evaluate(() => {
    const sel = window.PS_SHELL.layoutSelection();
    const ring = document.querySelector('.ps-litem-primary');
    const btn = document.querySelector('[data-ctx-samesize="wh"]');
    return { last: sel[sel.length - 1],
             ring: ring ? ring.getAttribute('data-item-id') : null,
             tip: btn ? btn.getAttribute('data-tip') : '' };
});
ok(agree.last !== 'i4',
   'shift-marquee makes something the BOX reached primary, not whatever was ' +
   'already selected, so it agrees with shift-click');
ok(agree.ring === agree.last,
   'the ring is on the primary (' + agree.ring + ')');
ok(/Chart/.test(agree.tip),
   'and Same size names a chart panel rather than a label ("' + agree.tip + '")');

console.log('case 23: the panel toolbar is not a hole in the canvas');
// Moving it to the top centre for case 16 put its padding in the gutter
// between two rows, which is exactly where someone drags to select a row.
await page.evaluate(() => window.PS_SHELL.selectLayoutItems(['i3']));
await page.waitForTimeout(500);
const barPt = await page.evaluate(() => {
    const r = document.querySelector('#ps-lcanvas .ps-lbar').getBoundingClientRect();
    return { x: r.left + 2, y: r.top + 2 };
});
await page.mouse.move(barPt.x, barPt.y);
await page.mouse.down();
await page.mouse.move(barPt.x + 260, barPt.y + 120, { steps: 8 });
await page.waitForTimeout(200);
ok(await boxCount() > 0,
   'a drag starting on the bar\'s own padding still draws a box');
await page.mouse.up();
await page.waitForTimeout(300);

console.log('case 24: a marquee catches a rotated label');
// A text item's rotation is a CSS transform on an inner node, so the model
// rect is the unrotated box and a box over the rendered strip missed it.
await page.evaluate(() => {
    const it = window.PS_SHELL.chart().items.find(i => i.text === 'A');
    it.rotate = 90; it.x = 470; it.y = 150; it.fontSize = 40;
    window.PS_SHELL.selectLayoutItems([]);
});
await page.waitForTimeout(700);
const rot = await page.evaluate(() => {
    const n = document.querySelector('.ps-litem[data-item-id="i5"]');
    const t = n.querySelector('.ps-ltext');
    const cv = document.getElementById('ps-lcanvas').getBoundingClientRect();
    const z = cv.width / window.PS_SHELL.chart().page.w;
    const nb = n.getBoundingClientRect(), tb = t.getBoundingClientRect();
    return { un: [(nb.left - cv.left) / z, (nb.left + nb.width - cv.left) / z],
             re: [(tb.left - cv.left) / z, (tb.top - cv.top) / z,
                  (tb.top + tb.height - cv.top) / z] };
});
ok(rot.re[0] < rot.un[0] - 2,
   'the rendered box really does stick out past the unrotated one (' +
   Math.round(rot.re[0]) + ' vs ' + Math.round(rot.un[0]) + ')');
// A thin strip in the sliver that only the RENDERED box covers.
{
    const a = pt(rot.re[0] + 1, rot.re[1] + 2);
    const b = pt(rot.un[0] - 2, rot.re[2] - 2);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(500);
}
ok((await page.evaluate(() => window.PS_SHELL.layoutSelection())).indexOf('i5') !== -1,
   'and a box drawn only in that sliver catches the label');

ok(errors.length === 0, 'no page errors (' + errors.join(' | ') + ')');
console.log('\nlayout-figure-check: all cases passed');
await browser.close();
