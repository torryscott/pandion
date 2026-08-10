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
//  13  there were three placement rules and the loudest one covered your
//      work. Add chart on a two-column template landed at 128,112 across
//      BOTH panels; on a full four-panel page it landed at 76,68 across two
//      of them, with no page growth and nothing said. It was 460 wide
//      against the template's 463, so the new panel never matched. Send to
//      layout used a third rule, stacking two charts at y 32 and y 359 and
//      growing the page to 704, where the toolbar would have put them side
//      by side.
//  14  the file wrapped layout text in the UI font stack while declaring
//      sans-serif, because wrapCaptionLines took three arguments and
//      layoutTextNode had been passing four since the caption fix.
//  15  page growth was written straight into page.h, so asking past the 4000
//      maximum toasted that the page had grown over an item that had just
//      been clamped back on top of the figure.
//  16  a pasted paragraph measured 21 px tall against the 284 px it renders,
//      because the text estimate counted characters on the longest logical
//      line and never wrapped, so the placement dropped it on a panel.
//  17  bringing the new item into view used scrollIntoView, which negotiates
//      with every scrolling ancestor, so it also scrolled the workspace pane
//      33 px and took the toolbar out from under the pointer.
//  18  Send to layout writes into a document that is not on screen and
//      nothing clamped it, so a send onto a page of 3990 left the panel's
//      bottom at 4492 against a page clamped to 4000. 492 px of it sat below
//      the page, permanently and invisibly, and opening the layout did not
//      correct it.
//  19  the "Three panels" template says one wide chart above two supporting
//      ones and drew a wide bar in the gallery, and made three identical
//      392 by 267 panels, the top one at x 308 with 276 px of white either
//      side. A chart's aspect is fixed, so a 267 px tall panel is 392 px
//      wide whatever its cell is, and an evenly split height could not
//      deliver the promise.
//  20  Alt+drag moved the item, like a plain drag, in an application where
//      every neighbour pulls off a copy.
//  21  Escape during an Alt+drag left the copy behind, at 57,32 on top of
//      57,32, with layoutHistoryDepth still 0 and nothing for undo to
//      remove. Invisible on screen and present in select-all, Same size,
//      plot-align and every export.
//  22  an Alt+drag copy of a caption near the right edge was born 309 px
//      left of its source, because the copy was clamped with a rect measured
//      before it joined the document, and its x then stayed pinned because
//      the drag kept the ORIGINAL selection's bounds.
//  23  with snapping off, a 4 px Alt+drag put the copy back at 120,160 on
//      top of its source at 120,160, because the source stopped being
//      excluded from the smart guides and became a guide for its own copy.
//  24  a send measured an off-screen layout's text at the flat 480 px cap
//      while the canvas wraps at the room left on the page, so it silently
//      moved a caption that had no need to move.
//  25  case 48 pinned the two placement routes at x 32, the one position
//      where the estimate and the rendered box agree by construction, so it
//      could not have caught 24.
//
// One hazard is closed here WITHOUT a live repro, and is recorded rather than
// probed. Item ids are per document and every template starts at i1, so the
// canvas can hold a node carrying an item's id that belongs to a different
// layout. It measures zero today only because the layout pane is hidden
// whenever a send runs, so layItemRect now compares item IDENTITY against the
// active layout instead of trusting the id.
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
// Copy CHANGED with grouping: it used to say "select a single panel", which
// grouping had just made impossible for a panel bound to its letter.
ok(/one panel at a time/i.test(look.tip),
   'with a tooltip that says why ("' + look.tip + '")');

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
    window.beforeFlipPanelW =
        window.PS_SHELL.chart().items.find(i => i.kind === 'chart').w;
});
await page.waitForTimeout(400);
await page.selectOption('#ps-layout-orientation', 'portrait');
await page.waitForTimeout(1600);
// Against a PANEL's factor, not the page's ratio. Case 27 changed the flip
// to fit the arrangement to the new page rather than scale by the page's own
// ratio, and this assertion had been passing on the old contract by luck.
const flipScale = await page.evaluate(() => {
    const it = window.PS_SHELL.chart().items;
    const img = it.find(i => i.id === 'imgprobe');
    const panel = it.find(i => i.kind === 'chart');
    return { img: img.w / 400, imgH: img.h / 200,
             panel: panel.w / beforeFlipPanelW };
});
ok(flipScale.img !== 1,
   'the image box scaled with the flip (factor ' +
   flipScale.img.toFixed(3) + ')');
ok(Math.abs(flipScale.img - flipScale.panel) < 0.02 &&
   Math.abs(flipScale.img - flipScale.imgH) < 0.02,
   'by the same factor as the panels, and the same on both axes, so it keeps ' +
   'its shape (' + flipScale.img.toFixed(3) + ' against ' +
   flipScale.panel.toFixed(3) + ')');

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
// The whole GROUP of i1, since case 29's templates bind a panel to its
// letter and selection normalises to whole groups.
const escWant = await page.evaluate(() => {
    const it = window.PS_SHELL.chart().items;
    const p = it.find(i => i.id === 'i1');
    return it.filter(i => p.group ? i.group === p.group : i.id === 'i1')
             .map(i => i.id).sort().join(',');
});
ok(afterEsc.slice().sort().join(',') === escWant,
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
// UNGROUPED text, because case 29's templates bind each letter to a panel
// and selecting a letter therefore selects a panel too, which does have a
// size. This is about text on its own.
await page.evaluate(() => {
    ['i5', 'i6'].forEach(id => {
        const it = window.PS_SHELL.chart().items.find(i => i.id === id);
        if (it) delete it.group;
    });
    window.PS_SHELL.selectLayoutItems(['i5', 'i6']);
});
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
// Earlier cases move panels to deliberately awkward places, and grouping
// carries their letters with them, so this puts the 2 by 2 back before
// pressing on what has to be empty canvas.
await page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    const put = (id, x, y, w, h) => {
        const it = c.items.find(i => i.id === id);
        if (it) { it.x = x; it.y = y; if (w) { it.w = w; it.h = h; } }
    };
    put('i1', 67, 60, 392, 267); put('i2', 548, 60, 392, 267);
    put('i3', 67, 373, 392, 267); put('i4', 548, 373, 392, 267);
    put('i5', 67, 32); put('i6', 548, 32);
    put('i7', 67, 345); put('i8', 548, 345);
    window.PS_SHELL.selectLayoutItems([]);
});
await page.waitForTimeout(600);
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
await page.waitForTimeout(200);
// The EXPANDED selection, because those panels are grouped with their
// letters and selection normalises to whole groups.
const preSwitch = await page.evaluate(() =>
    window.PS_SHELL.layoutSelection().slice().sort().join(','));
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
ok(kept.slice().sort().join(',') === preSwitch && await boxCount() === 0,
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

console.log('case 25: layout text measures the same on screen as in the file');
// The export writes sans-serif on purpose, so the file renders the same
// everywhere. The canvas was drawing in the application UI stack, which is 3
// to 5 percent wider, and everything downstream measures the SCREEN box
// (layItemRect, and through it align, the marquee and the page clamp), so a
// caption placed against a panel edge by eye landed elsewhere in the file.
await page.evaluate(() => {
    const it = window.PS_SHELL.chart().items.find(i => i.id === 'i5');
    it.x = 200; it.y = 500; it.fontSize = 13; it.bold = false; it.rotate = 0;
    it.text = 'Figure 1. Mean score across four dosing conditions';
    window.PS_SHELL.selectLayoutItems([]);
});
await page.waitForTimeout(800);
const wysiwyg = await page.evaluate(async () => {
    const n = document.querySelector('.ps-litem[data-item-id="i5"] .ps-ltext');
    const cv = document.getElementById('ps-lcanvas').getBoundingClientRect();
    const z = cv.width / window.PS_SHELL.chart().page.w;
    const rg = document.createRange();
    rg.selectNodeContents(n);
    const ink = rg.getBoundingClientRect();
    const svg = (await window.PS_SHELL.exportSource({ format: 'svg' })).svg;
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    let hit = null;
    doc.querySelectorAll('text').forEach(t => {
        if (/Figure 1\./.test(t.textContent)) hit = t;
    });
    // Measure the exported declaration with the browser's own text metrics.
    const c = document.createElement('canvas').getContext('2d');
    c.font = (hit.getAttribute('font-weight') || '400') + ' ' +
             hit.getAttribute('font-size') + 'px ' +
             hit.getAttribute('font-family');
    return { screenFamily: getComputedStyle(n).fontFamily,
             exportFamily: hit.getAttribute('font-family'),
             screenW: +(ink.width / z).toFixed(2),
             exportW: +c.measureText(hit.textContent).width.toFixed(2),
             exportX: Number(hit.getAttribute('x')) };
});
ok(wysiwyg.screenFamily === wysiwyg.exportFamily,
   'the canvas draws the family the file declares ("' +
   wysiwyg.screenFamily + '")');
ok(Math.abs(wysiwyg.screenW - wysiwyg.exportW) < 1,
   'so a caption is the same width in both (' + wysiwyg.screenW + ' vs ' +
   wysiwyg.exportW + ')');
ok(Math.abs(wysiwyg.exportX - 204) < 1.5,
   'and it starts where the screen puts it, inside the same 4 px inset (' +
   wysiwyg.exportX + ')');

console.log('case 26: a panel box contains its chart, with nothing spare');
// A chart draws at a fixed aspect and letterboxes inside its panel, so a box
// whose shape does not match its chart carries dead space the user cannot
// see and cannot close. It was 62 px on a 404 px panel, about 15 percent,
// and align, snapping, the guides, the marquee and the selection outline all
// act on the BOX, so the user was lining up something 31 px from the thing
// they were looking at. The exported figure is unchanged, verified against a
// pre-change export at the same page size: the bar runs land within a pixel
// and the best whole-pixel alignment between the two images is zero.
await page.evaluate(() => window.PS_SHELL.setWorkspace('layout'));
await page.waitForTimeout(500);
await page.evaluate(() => window.PS_SHELL.showLayoutGallery());
await page.waitForTimeout(500);
await page.click('[data-layout-template="four"]');
await page.waitForTimeout(300);
await page.click('[data-layout-create], #ps-layout-gallery-create');
await page.waitForTimeout(3500);
const spare = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('#ps-lcanvas .ps-litem[data-kind="chart"]')
        .forEach(it => {
            const svg = it.querySelector('svg');
            const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
            const r = it.getBoundingClientRect();
            const s = Math.min(r.width / vb[2], r.height / vb[3]);
            out.push({ w: Math.round(r.width - vb[2] * s),
                       h: Math.round(r.height - vb[3] * s) });
        });
    return out;
});
ok(spare.length === 4 && spare.every(v => v.w === 0 && v.h === 0),
   'every template panel fits its chart exactly (' +
   spare.map(v => v.w + 'x' + v.h).join(' ') + ')');
// The two placement paths pick a height from the chart too, rather than the
// constant 310 that was 1.484 against the engine's 1.469.
const placed = await page.evaluate(() => {
    const before = window.PS_SHELL.chart().items.length;
    const c = window.PS_SHELL.charts().filter(x => x.type !== 'layout')[0];
    document.getElementById('ps-laddchart').click();
    return { before: before, chartId: c.id };
});
await page.waitForTimeout(400);
await page.click('#ps-lchartmenu button[data-chart]');
await page.waitForTimeout(1500);
const added = await page.evaluate(() => {
    const it = window.PS_SHELL.chart().items.filter(i => i.kind === 'chart').pop();
    const s = window.PS_SHELL.snapshotOf(it.chartId);
    return { ratio: it.w / it.h, chart: s ? s.w / s.h : null };
});
ok(added.chart && Math.abs(added.ratio - added.chart) < 0.01,
   'and Add chart places a panel at the chart\'s own ratio (' +
   added.ratio.toFixed(3) + ' against ' + added.chart.toFixed(3) + ')');

console.log('case 27: an orientation flip keeps every item its own shape');
// Approved decision. The flip used to scale width and height independently,
// so a 463 by 267 panel became 309 by 401 and the chart inside, which has a
// fixed aspect, shrank to the smaller dimension. A flipped 2 by 2 came back
// about two thirds empty. The factor FITS the arrangement to the new page
// rather than being the page's own ratio, so it grows as readily as it
// shrinks and a flip does not compound.
await page.evaluate(() => window.PS_SHELL.setWorkspace('layout'));
await page.waitForTimeout(600);
await page.evaluate(() => window.PS_SHELL.showLayoutGallery());
await page.waitForTimeout(500);
await page.click('[data-layout-template="four"]');
await page.waitForTimeout(300);
await page.click('[data-layout-create], #ps-layout-gallery-create');
await page.waitForTimeout(3500);
const shape = () => page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    const p = c.items.filter(i => i.kind === 'chart');
    const b = p.reduce((a, i) => ({
        x0: Math.min(a.x0, i.x), y0: Math.min(a.y0, i.y),
        x1: Math.max(a.x1, i.x + i.w), y1: Math.max(a.y1, i.y + i.h)
    }), { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 });
    return { ratio: +(p[0].w / p[0].h).toFixed(3),
             blockW: Math.round(b.x1 - b.x0), blockH: Math.round(b.y1 - b.y0),
             pageW: c.page.w, pageH: c.page.h };
});
const flat = await shape();
await page.selectOption('#ps-layout-orientation', 'portrait');
await page.waitForTimeout(1600);
const tall = await shape();
ok(Math.abs(tall.ratio - flat.ratio) < 0.02,
   'a flipped panel keeps its aspect (' + flat.ratio + ' to ' + tall.ratio + ')');
ok(await page.evaluate(() =>
       Array.from(document.querySelectorAll(
           '#ps-lcanvas .ps-litem[data-kind="chart"]')).every(it => {
           const svg = it.querySelector('svg');
           const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
           const r = it.getBoundingClientRect();
           const s = Math.min(r.width / vb[2], r.height / vb[3]);
           return Math.abs(r.width - vb[2] * s) < 2 &&
                  Math.abs(r.height - vb[3] * s) < 2;
       })),
   'so the chart still fills it, instead of the panel filling with white');
// Measured over EVERY item, which is what the centring uses; the panel
// letters sit above and left of the panels, so a chart-only bbox is not the
// block that was centred.
const gaps = await page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    const nodes = [...document.querySelectorAll('#ps-lcanvas .ps-litem')];
    const cv = document.getElementById('ps-lcanvas').getBoundingClientRect();
    const z = cv.width / c.page.w;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    nodes.forEach(n => {
        const r = n.getBoundingClientRect();
        x0 = Math.min(x0, (r.left - cv.left) / z);
        x1 = Math.max(x1, (r.right - cv.left) / z);
        y0 = Math.min(y0, (r.top - cv.top) / z);
        y1 = Math.max(y1, (r.bottom - cv.top) / z);
    });
    return { left: x0, right: c.page.w - x1, top: y0, bottom: c.page.h - y1 };
});
ok(Math.abs(gaps.left - gaps.right) < 3 && Math.abs(gaps.top - gaps.bottom) < 3,
   'and the fitted block is centred on the page (margins ' +
   [gaps.left, gaps.right, gaps.top, gaps.bottom].map(Math.round).join(' ') + ')');
// There and back must not compound.
await page.selectOption('#ps-layout-orientation', 'landscape');
await page.waitForTimeout(1600);
const back = await shape();
await page.selectOption('#ps-layout-orientation', 'portrait');
await page.waitForTimeout(1600);
await page.selectOption('#ps-layout-orientation', 'landscape');
await page.waitForTimeout(1600);
const again = await shape();
ok(Math.abs(again.blockW - back.blockW) < 3,
   'flipping twice more lands on the same size, so the flip does not shrink ' +
   'the figure a little each time (' + back.blockW + ' then ' + again.blockW + ')');

console.log('case 28: one rule for the arrow keys');
// Approved decision. Inside the canvas plain arrows navigate and Alt+Arrow
// nudges, the engine's rule and what the hidden option list serves. A second
// handler nudged on PLAIN arrows whenever focus was anywhere else in the
// workspace, so the same key did two opposite things.
const px = () => page.evaluate(() => {
    const it = window.PS_SHELL.chart().items.find(i => i.kind === 'chart');
    return Math.round(it.x);
});
await page.evaluate(() => {
    const it = window.PS_SHELL.chart().items.find(i => i.kind === 'chart');
    window.PS_SHELL.selectLayoutItems([it.id]);
});
await page.waitForTimeout(400);
// A VISIBLE button. The align row is hidden for a single unit, and focusing a
// display:none element is a no-op that leaves focus in the canvas, where a
// plain arrow legitimately navigates. The first version of this case did
// exactly that and passed for the wrong reason.
await page.evaluate(() => {
    const b = [...document.querySelectorAll('#ps-laddtext, #ps-laddlabel, ' +
        '[data-ctx-align], [data-ctx-samesize]')].find(n => n.offsetParent);
    b.focus();
});
const focusedRail = await page.evaluate(() => document.activeElement.id ||
    document.activeElement.getAttribute('data-ctx-align') || '');
ok(focusedRail && focusedRail !== 'ps-lviewport',
   'focus really is on a control outside the canvas ("' + focusedRail + '")');
const rail0 = await px();
const railSel = await page.evaluate(() =>
    window.PS_SHELL.layoutSelection().join(','));
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(400);
ok(await px() === rail0,
   'a plain arrow with focus on a rail button moves nothing (' + rail0 + ')');
ok(await page.evaluate(() => window.PS_SHELL.layoutSelection().join(',')) ===
   railSel, 'and does not navigate either, because focus is not in the canvas');
await page.evaluate(() => document.getElementById('ps-lviewport').focus());
await page.waitForTimeout(250);
const canv0 = await px();
await page.keyboard.press('Alt+ArrowRight');
await page.waitForTimeout(400);
ok(await px() === canv0 + 1,
   'Alt+Arrow nudges inside the canvas (' + canv0 + ' -> ' + (await px()) + ')');
await page.evaluate(() => {
    const b = document.querySelector('[data-ctx-align="left"]') ||
              document.getElementById('ps-laddtext');
    b.focus();
});
const rail1 = await px();
await page.keyboard.press('Alt+ArrowRight');
await page.waitForTimeout(400);
ok(await px() === rail1 + 1, 'and outside it, so there is one rule');
// The canvas instructions and the shortcuts reference already said Alt with
// an arrow; only the code disagreed. Pinned so the three cannot drift apart
// again.
const said = await page.evaluate(() => ({
    instructions: document.getElementById('ps-layout-instructions').textContent,
    tip: (document.querySelector('[data-tip*="corner resize"]') || {})
             .getAttribute ? document.querySelector('[data-tip*="corner resize"]')
             .getAttribute('data-tip') : ''
}));
ok(/Alt with an arrow moves selected items/.test(said.instructions),
   'the canvas instructions say Alt with an arrow');
ok(/Alt\+arrow nudges/.test(said.tip) && !/^.*[^+]Arrows nudge/.test(said.tip),
   'and the Selection tooltip agrees ("' + said.tip.slice(-46) + '")');

console.log('case 29: a panel letter belongs to its panel');
// The loose end item 1 shipped with. Aligning a column moved the panels and
// left the letters where they were, so a figure came out with its letters at
// different offsets from their plots. Templates bind each letter to its own
// panel, so the common case needs no action at all.
await page.evaluate(() => window.PS_SHELL.setWorkspace('layout'));
await page.waitForTimeout(600);
await page.evaluate(() => window.PS_SHELL.showLayoutGallery());
await page.waitForTimeout(500);
await page.click('[data-layout-template="four"]');
await page.waitForTimeout(300);
await page.click('[data-layout-create], #ps-layout-gallery-create');
await page.waitForTimeout(3500);
const bound = await page.evaluate(() => {
    const it = window.PS_SHELL.chart().items;
    const panels = it.filter(i => i.kind === 'chart');
    const texts = it.filter(i => i.kind === 'text');
    return { allGrouped: panels.every(p => p.group) && texts.every(t => t.group),
             pairs: panels.every(p => texts.some(t => t.group === p.group)),
             flush: panels.every(p => texts.some(t => t.group === p.group &&
                                                 Math.abs(t.x - p.x) < 2)) };
});
ok(bound.allGrouped && bound.pairs,
   'a template binds each letter to its own panel');
ok(bound.flush,
   'and places it against that panel, not at the cell corner it used to sit in');
await page.evaluate(() => {
    const p = window.PS_SHELL.chart().items.find(i => i.kind === 'chart');
    window.PS_SHELL.selectLayoutItems([p.id]);
});
await page.waitForTimeout(400);
ok((await page.evaluate(() => window.PS_SHELL.layoutSelection())).length === 2,
   'clicking one member takes the whole group');
// The loose end itself.
const lefts = () => page.evaluate(() => {
    const it = window.PS_SHELL.chart().items;
    const p = it.filter(i => i.kind === 'chart')
        .sort((a, b) => a.y - b.y || a.x - b.x)[0];
    const t = it.find(i => i.kind === 'text' && i.group === p.group);
    return { panel: Math.round(p.x), letter: Math.round(t.x) };
});
const preAlign = await lefts();
await page.evaluate(() => {
    const it = window.PS_SHELL.chart().items.filter(i => i.kind === 'chart')
        .sort((a, b) => a.x - b.x);
    window.PS_SHELL.selectLayoutItems([it[0].id, it[1].id]);
});
await page.waitForTimeout(500);
await page.click('[data-ctx-plotalign="left"]');
await page.waitForTimeout(800);
const postAlign = await lefts();
ok(postAlign.panel !== preAlign.panel,
   'aligning the plot areas moved a panel (' + preAlign.panel + ' to ' +
   postAlign.panel + ')');
ok(postAlign.letter - postAlign.panel === preAlign.letter - preAlign.panel,
   'and its letter moved with it, keeping the same offset (' +
   (preAlign.letter - preAlign.panel) + ' then ' +
   (postAlign.letter - postAlign.panel) + ')');

console.log('case 30: grouping is a whole gesture');
await page.evaluate(() => {
    const p = window.PS_SHELL.chart().items.filter(i => i.kind === 'chart');
    window.PS_SHELL.selectLayoutItems([p[0].id, p[1].id]);
});
await page.waitForTimeout(400);
// Align must treat a group as ONE thing, or a column would stack each letter
// on top of its own panel.
const unitAlign = await page.evaluate(() => {
    const it = window.PS_SHELL.chart().items;
    const sel = window.PS_SHELL.layoutSelection();
    return { selected: sel.length,
             groups: [...new Set(sel.map(id =>
                 it.find(i => i.id === id).group))].length };
});
ok(unitAlign.selected === 4 && unitAlign.groups === 2,
   'selecting two grouped panels selects four items in two units');
await page.click('[data-ctx-align="left"]');
await page.waitForTimeout(700);
const stacked = await page.evaluate(() => {
    const it = window.PS_SHELL.chart().items;
    const sel = window.PS_SHELL.layoutSelection().map(id =>
        it.find(i => i.id === id));
    const panels = sel.filter(i => i.kind === 'chart').map(i => Math.round(i.x));
    const texts = sel.filter(i => i.kind === 'text').map(i => Math.round(i.x));
    return { panels: panels, texts: texts };
});
ok(stacked.panels[0] === stacked.panels[1],
   'aligning left puts both panels on one edge (' + stacked.panels.join(',') + ')');
ok(stacked.texts[0] === stacked.texts[1] &&
   stacked.texts[0] === stacked.panels[0],
   'and their letters came with them rather than being aligned separately (' +
   stacked.texts.join(',') + ')');
// Cmd+G and Cmd+Shift+G.
await page.evaluate(() => {
    const p = window.PS_SHELL.chart().items.filter(i => i.kind === 'chart');
    window.PS_SHELL.selectLayoutItems([p[2].id, p[3].id]);
    document.getElementById('ps-lviewport').focus();
});
await page.waitForTimeout(400);
const preG = await page.evaluate(() => window.PS_SHELL.layoutSelection().length);
await page.keyboard.press('Meta+g');
await page.waitForTimeout(700);
ok(await page.evaluate(() => {
       const it = window.PS_SHELL.chart().items;
       const sel = window.PS_SHELL.layoutSelection().map(id =>
           it.find(i => i.id === id));
       return [...new Set(sel.map(i => i.group))].length === 1;
   }), 'Cmd/Ctrl+G binds the selection into one group (was ' + preG + ' items)');
await page.keyboard.press('Meta+Shift+g');
await page.waitForTimeout(700);
ok(await page.evaluate(() => {
       const it = window.PS_SHELL.chart().items;
       return window.PS_SHELL.layoutSelection().every(id =>
           !it.find(i => i.id === id).group);
   }), 'and Cmd/Ctrl+Shift+G breaks it apart again');
// A duplicate is its own group, not a bigger one.
await page.evaluate(() => {
    const p = window.PS_SHELL.chart().items.find(i => i.kind === 'chart' && i.group);
    window.PS_SHELL.selectLayoutItems([p.id]);
});
await page.waitForTimeout(400);
const srcGroup = await page.evaluate(() => {
    const id = window.PS_SHELL.layoutSelection()[0];
    return window.PS_SHELL.chart().items.find(i => i.id === id).group;
});
await page.evaluate(() => document.getElementById('ps-lviewport').focus());
await page.keyboard.press('Meta+d');
await page.waitForTimeout(800);
ok(await page.evaluate((g) => {
       const it = window.PS_SHELL.chart().items;
       const sel = window.PS_SHELL.layoutSelection().map(id =>
           it.find(i => i.id === id));
       return sel.length === 2 && sel.every(i => i.group && i.group !== g);
   }, srcGroup),
   'duplicating a grouped panel gives a second group, not a four-member one');

console.log('case 31: a group cannot be torn apart by accident');
// An adversarial pass found Space bypassing the group normalisation, so one
// member could be taken out of a group and nudged away for good.
await page.evaluate(() => window.PS_SHELL.setWorkspace('layout'));
await page.waitForTimeout(500);
await page.evaluate(() => window.PS_SHELL.showLayoutGallery());
await page.waitForTimeout(500);
await page.click('[data-layout-template="four"]');
await page.waitForTimeout(300);
await page.click('[data-layout-create], #ps-layout-gallery-create');
await page.waitForTimeout(3500);
const pairOf = () => page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    const panel = c.items.find(i => i.kind === 'chart' && i.group);
    const letter = c.items.find(i => i.kind === 'text' && i.group === panel.group);
    return { panel: panel.id, letter: letter.id,
             dy: Math.round(letter.y - panel.y),
             dx: Math.round(letter.x - panel.x) };
});
const pair = await pairOf();
await page.evaluate((id) => window.PS_SHELL.selectLayoutItems([id]), pair.panel);
await page.evaluate(() => document.getElementById('ps-lviewport').focus());
await page.waitForTimeout(400);
await page.keyboard.press('Space');
await page.waitForTimeout(400);
await page.keyboard.press('Alt+ArrowDown');
await page.keyboard.press('Alt+ArrowDown');
await page.waitForTimeout(500);
const pairAfter = await pairOf();
ok(pairAfter.dy === pair.dy && pairAfter.dx === pair.dx,
   'Space then a nudge leaves the letter on its panel (' +
   pair.dx + ',' + pair.dy + ' then ' + pairAfter.dx + ',' + pairAfter.dy + ')');

console.log('case 32: a grouped panel is still a panel');
// Grouping made the primary an arbitrary member, so clicking a grouped chart
// panel put the resize handle and the mini toolbar on its letter, the rail
// lost the "Follows <chart>" line, and the panel could not be resized at all
// while the refusal told the user to select a single panel.
await page.evaluate((id) => window.PS_SHELL.selectLayoutItems([id]), pair.panel);
await page.waitForTimeout(600);
const chrome = await page.evaluate(() => {
    const owner = sel => {
        const n = document.querySelector('#ps-lcanvas ' + sel);
        return n ? n.closest('.ps-litem').getAttribute('data-item-id') : null;
    };
    const line = document.getElementById('ps-layout-source-line');
    return { primary: (document.querySelector('.ps-litem-primary') || {})
                 .getAttribute ? document.querySelector('.ps-litem-primary')
                 .getAttribute('data-item-id') : null,
             handle: owner('.ps-lhandle'), bar: owner('.ps-lbar'),
             title: document.getElementById('ps-layout-selection-title').textContent,
             source: getComputedStyle(line).display === 'none' ? '' : line.textContent,
             wEnabled: !document.getElementById('ps-ctx-lw').disabled };
});
ok(chrome.primary === pair.panel && chrome.handle === pair.panel &&
   chrome.bar === pair.panel,
   'the ring, the resize handle and the toolbar all sit on the panel, not ' +
   'its letter (' + chrome.primary + '/' + chrome.handle + '/' + chrome.bar + ')');
ok(/Chart panel/.test(chrome.title) && /Follows /.test(chrome.source),
   'the rail still names it and says whether it is live ("' +
   chrome.title + '", "' + chrome.source.slice(0, 30) + '")');
ok(chrome.wEnabled, 'and its Width field is live');
const wBefore = await page.evaluate((id) =>
    Math.round(window.PS_SHELL.chart().items.find(i => i.id === id).w), pair.panel);
await page.evaluate(() => document.getElementById('ps-lviewport').focus());
await page.keyboard.press('Alt+Equal');
await page.waitForTimeout(500);
ok(await page.evaluate((id) =>
       Math.round(window.PS_SHELL.chart().items.find(i => i.id === id).w),
       pair.panel) > wBefore,
   'and the keyboard can resize it (' + wBefore + ' px before)');

console.log('case 33: a pasted group is its own group');
// Group ids are only unique within a layout and every template starts at g1,
// so a paste collided by construction and merged into whatever held that id.
await page.evaluate((id) => {
    window.PS_SHELL.selectLayoutItems([id]);
    window.PS_SHELL.layCopySelected();
}, pair.panel);
await page.waitForTimeout(400);
const nBefore = await page.evaluate(() => window.PS_SHELL.chart().items.length);
await page.evaluate(() => window.PS_SHELL.layPasteClipboard());
await page.waitForTimeout(900);
const pasted = await page.evaluate((n) => {
    const it = window.PS_SHELL.chart().items;
    const made = it.slice(n);
    return { groups: [...new Set(made.map(i => i.group))],
             clashes: made.some(m => it.slice(0, n).some(o => o.group === m.group)) };
}, nBefore);
ok(pasted.groups.length === 1 && pasted.groups[0],
   'the pasted pair shares one group (' + pasted.groups.join(',') + ')');
ok(!pasted.clashes,
   'and it is a NEW one, so it did not merge into a group already on the page');

console.log('case 34: a group of one is not a group');
await page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    const t = c.items.find(i => i.kind === 'text' && i.group);
    window.PS_SHELL.selectLayoutItems([t.id]);
    window.__orphanPanel = c.items.find(i => i.kind === 'chart' &&
        i.group === t.group).id;
    window.__orphanText = t.id;
});
await page.evaluate(() => document.getElementById('ps-lviewport').focus());
await page.keyboard.press('Meta+Shift+g');
await page.waitForTimeout(500);
await page.evaluate(() => window.PS_SHELL.selectLayoutItems([window.__orphanText]));
await page.waitForTimeout(300);
await page.keyboard.press('Delete');
await page.waitForTimeout(800);
ok(await page.evaluate(() => {
       const p = window.PS_SHELL.chart().items.find(i => i.id === window.__orphanPanel);
       return p && !p.group;
   }), 'a survivor does not keep a group id, or offer Ungroup for nothing');

console.log('case 35: resizing the page scales the figure, it does not stack it');
// Both audits found this independently. layClampAllItems squashed each panel
// to the page width and slid them to x 0, so a journal single-column page
// landed all four on top of each other, the letters stayed where they were,
// and the export shipped the pile.
await page.evaluate(() => window.PS_SHELL.showLayoutGallery());
await page.waitForTimeout(500);
await page.click('[data-layout-template="four"]');
await page.waitForTimeout(300);
await page.click('[data-layout-create], #ps-layout-gallery-create');
await page.waitForTimeout(3500);
const overlapCount = () => page.evaluate(() => {
    const p = window.PS_SHELL.chart().items.filter(i => i.kind === 'chart');
    let n = 0;
    for (let a = 0; a < p.length; a++)
        for (let b = a + 1; b < p.length; b++) {
            const A = p[a], B = p[b];
            if (A.x < B.x + B.w && A.x + A.w > B.x &&
                A.y < B.y + B.h && A.y + A.h > B.y) n++;
        }
    return n;
});
ok(await overlapCount() === 0, 'the template starts with nothing overlapping');
await page.evaluate(() => document.getElementById('ps-lunit-cm').click());
await page.waitForTimeout(400);
await page.fill('#ps-lpage-w', '8.5');
await page.press('#ps-lpage-w', 'Enter');
await page.waitForTimeout(900);
await page.fill('#ps-lpage-h', '12');
await page.press('#ps-lpage-h', 'Enter');
await page.waitForTimeout(1200);
ok(await overlapCount() === 0,
   'and a journal single-column page still has nothing overlapping');
ok(/scaled to \d+ percent/.test(await page.evaluate(() =>
       document.getElementById('ps-layout-live').textContent)),
   'the figure says it was scaled rather than doing it silently');
const fitKept = await page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    const bad = [];
    document.querySelectorAll('#ps-lcanvas .ps-litem[data-kind="chart"]')
        .forEach(it => {
            const svg = it.querySelector('svg');
            const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
            const r = it.getBoundingClientRect();
            const s = Math.min(r.width / vb[2], r.height / vb[3]);
            if (Math.abs(r.width - vb[2] * s) > 2 ||
                Math.abs(r.height - vb[3] * s) > 2) bad.push(1);
        });
    const letters = c.items.filter(i => i.kind === 'text' && i.group).every(t => {
        const p = c.items.find(i => i.kind === 'chart' && i.group === t.group);
        return p && Math.abs(t.x - p.x) < 3;
    });
    return { letterboxed: bad.length, lettersFollow: letters };
});
ok(fitKept.letterboxed === 0,
   'the panels still fit their charts at the smaller size');
ok(fitKept.lettersFollow, 'and the letters came with their panels');
await page.evaluate(() => document.getElementById('ps-lunit-in').click());
await page.waitForTimeout(300);

console.log('case 36: Add text lets you type the text');
// Focus stayed on the toolbar BUTTON, so every Space press activated it again
// and added another text box, Enter did the same, and F2 renamed the document
// instead of editing the text that had just appeared.
await page.evaluate(() => window.PS_SHELL.setWorkspace('layout'));
await page.waitForTimeout(500);
const beforeAdd = await page.evaluate(() => ({
    n: window.PS_SHELL.chart().items.length,
    name: window.PS_SHELL.chart().name }));
await page.click('#ps-laddtext');
await page.waitForTimeout(700);
ok(await page.evaluate(() =>
       document.activeElement.classList.contains('ps-ltext-edit')),
   'the new text box takes focus, with its editor open');
const caption = 'Figure 1. Dose response by condition and site over the ' +
    'whole study window, with error bars showing the standard error of the ' +
    'mean for each of the four dosing groups.';
await page.keyboard.type(caption);
await page.waitForTimeout(400);
await page.evaluate(() => {
    const t = document.querySelector('.ps-ltext-edit');
    if (t) t.blur();
});
await page.waitForTimeout(800);
const afterAdd = await page.evaluate(() => ({
    n: window.PS_SHELL.chart().items.length,
    name: window.PS_SHELL.chart().name,
    text: window.PS_SHELL.chart().items.filter(i => i.kind === 'text').pop().text }));
ok(afterAdd.n === beforeAdd.n + 1,
   'typing adds ONE item, not one per space bar (' + beforeAdd.n + ' to ' +
   afterAdd.n + ')');
ok(afterAdd.text === caption, 'and what you typed is what the item says');
ok(afterAdd.name === beforeAdd.name,
   'while the document keeps its name ("' + afterAdd.name + '")');

console.log('case 37: a caption breaks in the file where it breaks on screen');
// The canvas caps a text item at 480 px and wraps inside it; the file split
// on newlines only, so a caption came out as one long line, which changes the
// figure's shape and can run past the page edge and be cut. The line STEP
// disagreed too: a computed line-height of normal against the file's
// dy 1.25em drifted a fourth line 1.6 mm low on paper.
const wrapCmp = await page.evaluate(async () => {
    const c = window.PS_SHELL.chart();
    const t = c.items.filter(i => i.kind === 'text').pop();
    t.x = 60; t.y = 500; t.fontSize = 13; t.bold = false; t.rotate = 0;
    window.PS_SHELL.selectLayoutItems([]);
    await new Promise(r => setTimeout(r, 700));
    const node = document.querySelector(
        '.ps-litem[data-item-id="' + t.id + '"] .ps-ltext');
    const cv = document.getElementById('ps-lcanvas').getBoundingClientRect();
    const z = cv.width / c.page.w;
    const rg = document.createRange();
    rg.selectNodeContents(node);
    // One rect per line fragment, so fold them onto their line by top edge.
    // Bin to the nearest pixel. A single wrapped line can come back as
    // several rects whose tops differ in the third decimal, so a finer bin
    // counts one line twice.
    const byTop = {};
    [...rg.getClientRects()].forEach(r => {
        const top = Math.round((r.top - cv.top) / z);
        byTop[top] = (byTop[top] || 0) + r.width / z;
    });
    const tops = Object.keys(byTop).map(Number).sort((a, b) => a - b);
    const svg = (await window.PS_SHELL.exportSource({ format: 'svg' })).svg;
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    let hit = null;
    doc.querySelectorAll('text').forEach(x => {
        if (/Figure 1\./.test(x.textContent)) hit = x;
    });
    const spans = [...hit.querySelectorAll('tspan')].map(sp => sp.textContent);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = '400 13px sans-serif';
    return { screenLines: tops.length,
             screenSteps: tops.slice(1).map((v, i) => +(v - tops[i]).toFixed(1)),
             screenWidths: tops.map(t => +byTop[t].toFixed(1)),
             fileLines: spans.length,
             fileWidths: spans.map(l => +ctx.measureText(l).width.toFixed(1)),
             // A wrapped line's client rect includes the trailing space that
             // the break consumed; the file's line text has it trimmed. That
             // is the whole residual, so it is measured rather than guessed.
             spaceW: +ctx.measureText(' ').width.toFixed(2) };
});
ok(wrapCmp.fileLines > 1,
   'the file wraps the caption rather than writing one long line (' +
   wrapCmp.fileLines + ' lines)');
ok(wrapCmp.fileLines === wrapCmp.screenLines,
   'into the same number of lines the canvas shows (' +
   wrapCmp.screenLines + ' on screen)');
ok(wrapCmp.screenWidths.every((w, i) =>
       Math.abs(w - wrapCmp.fileWidths[i]) <= wrapCmp.spaceW + 0.5),
   'breaking at the same words, so the block is the same shape, within the ' +
   wrapCmp.spaceW + ' px trailing space (' +
   wrapCmp.screenWidths.join('/') + ' against ' +
   wrapCmp.fileWidths.join('/') + ')');
ok(wrapCmp.screenSteps.every(v => Math.abs(v - 13 * 1.25) < 1),
   'and stepping its lines by the same 1.25 em the file writes (' +
   wrapCmp.screenSteps.join(',') + ' against ' + (13 * 1.25) + ')');

console.log('case 38: a new item never lands on top of the figure');
// There were three placement rules. The toolbar cascaded from the top-left
// corner in steps of 26 by 22 and wrapped every sixth item, so on any
// template the first Add chart landed ON panel A and a seventh landed exactly
// on the first; Send to layout stacked below everything; a pasted image did
// its own variant. Now there is one rule, the reading order of a figure.
await page.evaluate(() => window.PS_SHELL.showLayoutGallery());
await page.waitForTimeout(500);
await page.click('[data-layout-template="two-columns"]');
await page.waitForTimeout(300);
await page.click('[data-layout-create], #ps-layout-gallery-create');
await page.waitForTimeout(3500);
// Overlap is counted among SIZED items only. A template's panel letter sits
// at panel.y - 28 in a padded box a few pixels taller than that, so it laps
// its own panel by design and by four pixels; text over a chart is a
// legitimate thing to want. A PANEL covering a panel is not.
const p38Geom = () => page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    const rs = c.items.filter(i => i.kind === 'chart' || i.kind === 'image')
        .map(i => ({ x: i.x, y: i.y, w: i.w, h: i.h }));
    let hits = 0;
    for (let a = 0; a < rs.length; a++)
        for (let b = a + 1; b < rs.length; b++)
            if (rs[a].x < rs[b].x + rs[b].w && rs[a].x + rs[a].w > rs[b].x &&
                rs[a].y < rs[b].y + rs[b].h && rs[a].y + rs[a].h > rs[b].y) hits++;
    return { overlaps: hits, pageH: c.page.h, preset: c.page.preset,
             panels: c.items.filter(i => i.kind === 'chart')
                 .map(i => ({ id: i.id, x: i.x, y: i.y, w: i.w, h: i.h })),
             depth: window.PS_SHELL.layoutHistoryDepth() };
});
async function p38AddChart() {
    await page.click('#ps-laddchart');
    await page.waitForTimeout(300);
    const btn = await page.$('#ps-lchartmenu button[data-chart]:not([disabled])');
    await btn.click();
    await page.waitForTimeout(1400);
}
const p38Two = await p38Geom();
ok(p38Two.overlaps === 0 && p38Two.panels.length === 2,
   'the two-column template starts as two panels, nothing overlapping');
await p38AddChart();
const p38Added = await p38Geom();
ok(p38Added.panels.length === 3, 'the added panel arrived');
ok(p38Added.overlaps === 0,
   'and it is not sitting on anything (' + p38Added.overlaps + ' overlaps)');
ok(p38Added.panels[2].y > p38Two.panels[0].y,
   'it went below the row that was already there rather than into the ' +
   'top-left corner (y ' + p38Added.panels[2].y + ' against ' +
   p38Two.panels[0].y + ')');

console.log('case 39: a new panel is the size of the panels already there');
// The toolbar used a flat 460 while a four-panel template gives 392, so the
// fifth panel of a 2 by 2 arrived as the odd one out and matching it was
// hand work. Only the WIDTH is matched; height still comes from the chart's
// own aspect, so the panel still contains its chart exactly.
ok(p38Added.panels[2].w === p38Two.panels[0].w,
   'the added panel matches the template width (' + p38Added.panels[2].w +
   ' against ' + p38Two.panels[0].w + ')');
const p39Aspect = Math.abs(p38Added.panels[2].w / p38Added.panels[2].h -
    p38Two.panels[0].w / p38Two.panels[0].h);
ok(p39Aspect < 0.02,
   'and keeps the chart aspect rather than copying a height (off by ' +
   p39Aspect.toFixed(4) + ')');

console.log('case 40: a full page grows, says so, and undoes in one step');
await page.evaluate(() => window.PS_SHELL.showLayoutGallery());
await page.waitForTimeout(500);
await page.click('[data-layout-template="four"]');
await page.waitForTimeout(300);
await page.click('[data-layout-create], #ps-layout-gallery-create');
await page.waitForTimeout(3500);
const p40Before = await p38Geom();
ok(p40Before.overlaps === 0 && p40Before.panels.length === 4,
   'a four-panel template fills the page with nothing overlapping');
await p38AddChart();
const p40After = await p38Geom();
ok(p40After.overlaps === 0,
   'the fifth panel still lands clear of the other four (' +
   p40After.overlaps + ' overlaps)');
ok(p40After.pageH > p40Before.pageH,
   'the page grew to hold it (' + p40Before.pageH + ' to ' +
   p40After.pageH + ')');
ok(await page.evaluate(() => {
       const t = document.getElementById('ps-toast');
       return !!t && /page grew/i.test(t.textContent || '');
   }), 'and said so rather than resizing the figure silently');
ok(p40After.depth === p40Before.depth + 1,
   'the add and the growth are one history entry (' + p40Before.depth +
   ' to ' + p40After.depth + ')');
await page.evaluate(() => window.PS_SHELL.setWorkspace('layout'));
await page.waitForTimeout(300);
await page.evaluate(() => document.getElementById('ps-lviewport').focus());
// ONE press. The router accepts either modifier, so pressing both fired undo
// twice and the assertion below claimed one had done the work; it passed only
// because the second press found an empty stack.
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
await page.waitForTimeout(900);
const p40Undone = await p38Geom();
ok(p40Undone.panels.length === 4 && p40Undone.pageH === p40Before.pageH,
   'and one undo takes back both the panel and the height (' +
   p40Undone.panels.length + ' panels, page ' + p40Undone.pageH + ')');

console.log('case 41: Send to layout places the same way Add chart does');
// Sending two charts to an empty layout used to stack them down the page and
// grow it into a tall strip, while the toolbar put them side by side, so the
// same two charts made two different figures depending on the route in.
async function p41Send(actionKey) {
    await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
    await page.waitForTimeout(1500);
    const o = await page.evaluate(() => {
        const r = document.querySelector('.graphbuilder2-host')
            .getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.click(o.x, o.y, { button: 'right' });
    await page.waitForTimeout(500);
    await page.click('#ps-contextmenu button[data-context-action="chart-send"]');
    await page.waitForTimeout(500);
    await page.click('#ps-contextmenu button[data-context-action="' +
        actionKey + '"]');
    await page.waitForTimeout(1800);
}
await p41Send('chart-to-new');
const p41Layout = await page.evaluate(() => {
    const ls = window.PS_SHELL.charts().filter(c => c.type === 'layout');
    return ls[ls.length - 1].id;
});
const p41Charts = await page.evaluate(() =>
    window.PS_SHELL.charts().filter(c => c.type !== 'layout').map(c => c.id));
await page.evaluate(id => window.PS_SHELL.switchChart(id), p41Charts[1]);
await page.waitForTimeout(1200);
await p41Send('chart-to-' + p41Layout);
const p41Sent = await page.evaluate(id => {
    const c = window.PS_SHELL.charts().find(x => x.id === id);
    const p = c.items.filter(i => i.kind === 'chart');
    return { n: p.length, pageH: c.page.h, preset: c.page.preset,
             a: p[0], b: p[1] };
}, p41Layout);
ok(p41Sent.n === 2, 'both charts arrived (' + p41Sent.n + ')');
ok(p41Sent.b.y === p41Sent.a.y && p41Sent.b.x > p41Sent.a.x,
   'the second sits beside the first rather than under it (' +
   p41Sent.a.x + ',' + p41Sent.a.y + ' then ' + p41Sent.b.x + ',' + p41Sent.b.y + ')');
ok(p41Sent.b.w === p41Sent.a.w,
   'at the same width (' + p41Sent.a.w + ' and ' + p41Sent.b.w + ')');
ok(p41Sent.preset !== 'custom',
   'and the page did not have to grow to hold them (' + p41Sent.preset +
   ', ' + p41Sent.pageH + ')');

console.log('case 42: the file wraps in the weight the item actually is');
// layoutTextNode has passed a font to wrapCaptionLines since the caption fix
// landed, and wrapCaptionLines took three arguments, so the fourth was
// dropped on the floor and the file wrapped in the UI font stack at weight
// 400 while declaring sans-serif at the item's real weight. Headless
// Chromium resolves both stacks to the same face, which is exactly why case
// 37 agreed; a Mac resolves them to San Francisco and Helvetica. Weight is
// the half that shows up here, because the same caption in 700 has to break
// earlier than in 400.
// Case 41 left a CHART tab active, so this makes its own layout and its own
// caption rather than reaching for whatever was last on screen.
await page.evaluate(() => window.PS_SHELL.setWorkspace('layout'));
await page.waitForTimeout(500);
await page.evaluate(() => window.PS_SHELL.showLayoutGallery());
await page.waitForTimeout(500);
await page.click('[data-layout-template="single"]');
await page.waitForTimeout(300);
await page.click('[data-layout-create], #ps-layout-gallery-create');
await page.waitForTimeout(3200);
const p42Weight = await page.evaluate(async () => {
    const c = window.PS_SHELL.chart();
    c.items.push({ id: 'i70', kind: 'text', fontSize: 13, x: 60, y: 500,
        text: 'Figure 1. Scores by condition, with ninety five per cent ' +
              'confidence intervals and individual observations shown.' });
    const t = c.items[c.items.length - 1];
    t.rotate = 0;
    const readAt = async (bold) => {
        t.bold = bold;
        window.PS_SHELL.selectLayoutItems([]);
        await new Promise(r => setTimeout(r, 500));
        const svg = (await window.PS_SHELL.exportSource({ format: 'svg' })).svg;
        const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
        let hit = null;
        doc.querySelectorAll('text').forEach(x => {
            if (/Figure 1\./.test(x.textContent)) hit = x;
        });
        const sp = [...hit.querySelectorAll('tspan')].map(x => x.textContent);
        return { first: sp[0], lines: sp.length,
                 weight: hit.getAttribute('font-weight') };
    };
    const plain = await readAt(false);
    const heavy = await readAt(true);
    t.bold = false;
    window.PS_SHELL.selectLayoutItems([]);
    await new Promise(r => setTimeout(r, 300));
    return { plain: plain, heavy: heavy };
});
ok(p42Weight.heavy.weight === '700' && p42Weight.plain.weight === '400',
   'the file declares the weight it was asked for');
ok(p42Weight.heavy.first !== p42Weight.plain.first,
   'and wraps in it, so bold breaks its first line earlier ("' +
   p42Weight.heavy.first + '" against "' + p42Weight.plain.first + '")');
ok(p42Weight.heavy.lines >= p42Weight.plain.lines,
   'taking at least as many lines to do it (' + p42Weight.heavy.lines +
   ' against ' + p42Weight.plain.lines + ')');

console.log('case 43: a page has a maximum, and the toast knows it');
// Growth used to be written straight into page.h. layNormalizeLayout clamps
// it to 4000, so asking for more produced a toast promising the page had
// grown over a panel that layClampAllItems had just pulled back on top of
// the figure.
await page.evaluate(() => window.PS_SHELL.setWorkspace('layout'));
await page.waitForTimeout(400);
await page.evaluate(() => window.PS_SHELL.showLayoutGallery());
await page.waitForTimeout(500);
await page.click('[data-layout-template="single"]');
await page.waitForTimeout(300);
await page.click('[data-layout-create], #ps-layout-gallery-create');
await page.waitForTimeout(3200);
await page.evaluate(() => {
    // A page close to the maximum with one panel filling it, WIDTH included,
    // so the next add cannot fit anywhere. A tall narrow panel leaves a clear
    // column beside it and the placement quite correctly uses it.
    const c = window.PS_SHELL.chart();
    c.page.h = 3900; c.page.preset = 'custom';
    const p = c.items.filter(i => i.kind === 'chart')[0];
    p.x = 32; p.y = 32; p.w = 944; p.h = 3700;
    window.PS_SHELL.selectLayoutItems([]);
});
await page.waitForTimeout(700);
await p38AddChart();
const p43 = await page.evaluate(() => ({
    pageH: window.PS_SHELL.chart().page.h,
    toast: (document.getElementById('ps-toast') || {}).textContent || ''
}));
ok(p43.pageH <= 4000,
   'the page stops at its maximum rather than being written past it (' +
   p43.pageH + ')');
ok(/at its largest/.test(p43.toast) && !/grew to fit/.test(p43.toast),
   'and the message says that instead of claiming the page grew ("' +
   p43.toast.trim() + '")');

console.log('case 44: a pasted paragraph is measured, not guessed');
// The old estimate counted characters on the longest LOGICAL line and never
// wrapped, so a pasted paragraph measured about 21 px tall against the 284 px
// it renders, and the placement dropped it straight onto a panel.
//
// The reload is not decoration. The layout's own cut and paste clipboard is a
// session variable and takes priority over the system one, so once case 33
// has copied a group the document paste handler correctly stands down for the
// rest of the run. A reload empties it and the project reloads from storage.
await page.reload();
await page.waitForTimeout(2500);
await page.evaluate(() => window.PS_SHELL.setWorkspace('layout'));
await page.waitForTimeout(600);
await page.evaluate(() => window.PS_SHELL.showLayoutGallery());
await page.waitForTimeout(500);
await page.click('[data-layout-template="two-columns"]');
await page.waitForTimeout(300);
await page.click('[data-layout-create], #ps-layout-gallery-create');
await page.waitForTimeout(3200);
const p44 = await page.evaluate(async () => {
    const words = ('Participants in the treatment condition reported ' +
        'consistently higher scores across every session, and the ' +
        'difference held after adjusting for baseline. ').repeat(4);
    const dt = new DataTransfer();
    dt.setData('text/plain', words);
    document.dispatchEvent(new ClipboardEvent('paste', {
        clipboardData: dt, bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 900));
    const c = window.PS_SHELL.chart();
    const t = c.items.filter(i => i.kind === 'text').pop();
    if (!t) return { pasted: false };
    const node = document.querySelector(
        '#ps-lcanvas .ps-litem[data-item-id="' + t.id + '"]');
    const cv = document.getElementById('ps-lcanvas').getBoundingClientRect();
    const z = cv.width / c.page.w;
    const nb = node.getBoundingClientRect();
    const box = { x: t.x, y: t.y, w: nb.width / z, h: nb.height / z };
    let hits = 0;
    for (const p of c.items.filter(i => i.kind === 'chart'))
        if (box.x < p.x + p.w && box.x + box.w > p.x &&
            box.y < p.y + p.h && box.y + box.h > p.y) hits++;
    return { pasted: true, box: box, hits: hits, pageH: c.page.h,
             bottom: box.y + box.h,
             toast: (document.getElementById('ps-toast') || {}).textContent || '' };
});
ok(p44.pasted, 'the paste produced a text item');
ok(p44.box.h > 100,
   'a wrapped paragraph is a tall box, and the placement knows it (' +
   Math.round(p44.box.h) + ' px)');
ok(p44.hits === 0,
   'so it does not land on a panel (' + p44.hits + ' overlaps)');
ok(p44.bottom <= p44.pageH + 1,
   'and it fits on the page it landed on (' + Math.round(p44.bottom) +
   ' against ' + p44.pageH + ')');

console.log('case 45: bringing a new item into view moves only the canvas');
// scrollIntoView negotiates with every scrolling ancestor, and the workspace
// pane is one, so showing the new item also slid the toolbar out from under
// the pointer. Measured with scrollIntoView restored, this window and this
// zoom: the pane went 0 to 33 and the toolbar's top went 132 to 99.
//
// The window shrinks for this case because a tall one leaves the workspace
// pane unscrollable, and a test of what a scroll does needs something that
// can scroll. It is restored afterwards.
await page.setViewportSize({ width: 1440, height: 620 });
await page.waitForTimeout(500);
await page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    c.view.zoom = '2';
    window.PS_SHELL.selectLayoutItems([]);
});
await page.waitForTimeout(800);
const p45Read = () => page.evaluate(() => {
    const ws = document.querySelector('.ps-main-workspace');
    const tb = document.getElementById('ps-ltoolbar');
    return { ws: ws ? ws.scrollTop : 0,
             scrollable: ws ? ws.scrollHeight > ws.clientHeight : false,
             vp: document.getElementById('ps-lviewport').scrollTop,
             toolbar: tb ? Math.round(tb.getBoundingClientRect().top) : 0 };
});
const p45Before = await p45Read();
ok(p45Before.scrollable,
   'the workspace pane can scroll, so this case is testing something');
await p38AddChart();
const p45After = await p45Read();
ok(p45After.ws === p45Before.ws,
   'the workspace pane did not move (' + p45Before.ws + ' to ' +
   p45After.ws + ')');
ok(p45After.toolbar === p45Before.toolbar,
   'so the toolbar stayed where the pointer left it (' + p45Before.toolbar +
   ' to ' + p45After.toolbar + ')');
ok(p45After.vp !== p45Before.vp,
   'while the canvas viewport did move, so the item was actually brought ' +
   'into view (' + p45Before.vp + ' to ' + p45After.vp + ')');
await page.setViewportSize({ width: 1500, height: 1000 });
await page.waitForTimeout(500);

console.log('case 46: a figure of kept pages sets the width for a chart too');
// A layout built entirely from Notebook pages carries image items and no
// chart panel, and those ARE its panels, so a chart added beside them took
// the flat 460 and did not match anything.
await page.evaluate(() => window.PS_SHELL.addLayout());
await page.waitForTimeout(1200);
await page.evaluate(() => {
    // Injected rather than dropped through the file picker, which a probe
    // cannot drive. Only the kind and the width matter here.
    const c = window.PS_SHELL.chart();
    c.items.push({ id: 'i90', kind: 'image', natW: 720, natH: 480,
                   src: 'data:image/svg+xml;base64,' +
                        btoa('<svg xmlns="http://www.w3.org/2000/svg" ' +
                             'width="720" height="480"></svg>'),
                   x: 32, y: 32, w: 360, h: 240 });
    c.items.push({ id: 'i91', kind: 'image', natW: 720, natH: 480,
                   src: 'data:image/svg+xml;base64,' +
                        btoa('<svg xmlns="http://www.w3.org/2000/svg" ' +
                             'width="720" height="480"></svg>'),
                   x: 420, y: 32, w: 360, h: 240 });
    window.PS_SHELL.selectLayoutItems([]);
});
await page.waitForTimeout(700);
await p38AddChart();
const p46 = await page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    const ch = c.items.filter(i => i.kind === 'chart');
    return { w: ch.length ? ch[ch.length - 1].w : null, n: ch.length };
});
ok(p46.n === 1 && p46.w === 360,
   'the chart panel takes the width the kept pages are using (' +
   p46.w + ' against 360)');

console.log('case 47: a send cannot leave a panel below the page');
// Send to layout writes into a document that is not on screen, and nothing
// clamped it. Measured before the fix: a send onto a page of 3990 left the
// panel at y 3850 with a height of 642 against a page clamped to 4000, so
// 492 px of it sat below the page, permanently and invisibly, and opening
// the layout did not correct it.
await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
await page.waitForTimeout(1200);
await p41Send('chart-to-new');
const p47Layout = await page.evaluate(() => {
    const ls = window.PS_SHELL.charts().filter(c => c.type === 'layout');
    return ls[ls.length - 1].id;
});
await page.evaluate(id => {
    // A page near the maximum, filled edge to edge, so the next panel cannot
    // fit anywhere and the growth it needs is not available.
    const c = window.PS_SHELL.charts().find(x => x.id === id);
    c.page.h = 3990; c.page.preset = 'custom';
    const p = c.items[0];
    p.x = 32; p.y = 32; p.w = 944; p.h = 3800;
}, p47Layout);
await page.waitForTimeout(300);
await p41Send('chart-to-' + p47Layout);
const p47 = await page.evaluate(id => {
    const c = window.PS_SHELL.charts().find(x => x.id === id);
    const toast = document.getElementById('ps-toast');
    return { pageH: c.page.h,
             below: c.items.filter(i => (i.y + (i.h || 0)) > c.page.h + 0.5)
                 .map(i => i.id),
             lowest: Math.max.apply(null,
                 c.items.map(i => (i.y || 0) + (i.h || 0))),
             toast: toast ? toast.textContent : '' };
}, p47Layout);
ok(p47.pageH <= 4000,
   'the page stops at its maximum (' + p47.pageH + ')');
ok(p47.below.length === 0,
   'and no item is left below it (' + Math.round(p47.lowest) + ' against ' +
   p47.pageH + ')');
ok(/at its largest/.test(p47.toast),
   'the send says the page could not grow rather than claiming it did ("' +
   p47.toast.trim() + '")');
await page.evaluate(id => window.PS_SHELL.switchChart(id), p47Layout);
await page.evaluate(() => window.PS_SHELL.setWorkspace('layout'));
await page.waitForTimeout(1600);
ok(await page.evaluate(id => {
       const c = window.PS_SHELL.charts().find(x => x.id === id);
       return c.items.every(i => (i.y || 0) + (i.h || 0) <= c.page.h + 0.5);
   }, p47Layout),
   'and opening the layout does not reveal one that was hiding below it');

console.log('case 48: the two routes place a panel identically');
// Case 41 sends into an EMPTY layout, where the two routes cannot disagree.
// A caption in the target is what separates them, because a send measures a
// document that is not on screen and has to work from the text estimate
// while the toolbar can read the rendered box.
async function p48Fixture() {
    await page.evaluate(() => window.PS_SHELL.addLayout());
    await page.waitForTimeout(1300);
    return page.evaluate(() => {
        const c = window.PS_SHELL.chart();
        // x 380 on a 672-wide page, NOT the margin. At x 32 the room left
        // on the page exceeds the 480 px cap, so the estimate and the
        // rendered box agree by construction and the case cannot fail. Here
        // the caption wraps at the room it has, and a send measuring it at
        // the flat cap reads it wider than it is.
        c.page = { preset: 'canvasp', w: 672, h: 1008, margin: 32 };
        c.items.push({ id: 'i1', kind: 'text', fontSize: 14, x: 380, y: 32,
            text: 'Figure 2. Scores by condition across every session, ' +
                  'with ninety five per cent confidence intervals shown.' });
        window.PS_SHELL.selectLayoutItems([]);
        return c.id;
    });
}
const p48Sent = await p48Fixture();
await page.waitForTimeout(700);
const p48Caption = await page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    const n = document.querySelector('#ps-lcanvas .ps-litem[data-item-id="i1"]');
    const cv = document.getElementById('ps-lcanvas').getBoundingClientRect();
    const z = cv.width / c.page.w;
    const r = n.getBoundingClientRect();
    return { w: +(r.width / z).toFixed(1), h: +(r.height / z).toFixed(1) };
});
ok(p48Caption.h > 20 && p48Caption.w < 480,
   'the caption renders narrower than the 480 px cap, so the estimate and ' +
   'the rendered box can disagree (' + p48Caption.w + ' by ' +
   p48Caption.h + ')');
const p48Moved = await page.evaluate(id => {
    const c = window.PS_SHELL.charts().find(x => x.id === id);
    return c.items.filter(i => i.kind === 'text')[0].x;
}, p48Sent);
await p41Send('chart-to-' + p48Sent);
const p48A = await page.evaluate(id => {
    const c = window.PS_SHELL.charts().find(x => x.id === id);
    const p = c.items.filter(i => i.kind === 'chart')[0];
    return p ? { x: p.x, y: p.y, w: p.w, h: p.h } : null;
}, p48Sent);
await p48Fixture();
await page.waitForTimeout(700);
await p38AddChart();
const p48B = await page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    const p = c.items.filter(i => i.kind === 'chart')[0];
    return p ? { x: p.x, y: p.y, w: p.w, h: p.h } : null;
});
ok(p48A && p48B, 'both routes placed a panel');
ok(p48A.x === p48B.x && p48A.y === p48B.y,
   'in the same place (' + p48A.x + ',' + p48A.y + ' and ' + p48B.x + ',' +
   p48B.y + ')');
ok(p48A.w === p48B.w && p48A.h === p48B.h,
   'at the same size (' + p48A.w + ' by ' + p48A.h + ')');
ok(p48A.y >= 32 + p48Caption.h,
   'clear of the caption rather than on it (' + p48A.y + ' against a ' +
   'caption ending at ' + Math.round(32 + p48Caption.h) + ')');

console.log('case 49: "Three panels" makes the figure it advertises');
// The template says "One wide chart above two supporting charts" and its
// gallery picture drew a bar more than twice the width of the two below.
// Measured before the fix: three identical 392 by 267 panels, the top one at
// x 308 with 276 px of white either side. A chart's aspect is fixed, so a
// 267 px tall panel is 392 px wide whatever its cell is, and an evenly split
// height could never deliver the promise.
await page.evaluate(() => window.PS_SHELL.setWorkspace('layout'));
await page.waitForTimeout(500);
await page.evaluate(() => window.PS_SHELL.showLayoutGallery());
await page.waitForTimeout(500);
const p49Picture = await page.evaluate(() => {
    const card = document.querySelector('[data-layout-template="three"]');
    const bars = Array.from(card.querySelectorAll(
        '.ps-layout-template-preview span'));
    const pc = el => Number((el.style.width || '0').replace('%', ''));
    return bars.map(pc);
});
await page.click('[data-layout-template="three"]');
await page.waitForTimeout(300);
await page.click('[data-layout-create], #ps-layout-gallery-create');
await page.waitForTimeout(3500);
const p49 = await page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    const p = c.items.filter(i => i.kind === 'chart')
        .slice().sort((a, b) => a.y - b.y || a.x - b.x);
    let hits = 0;
    for (let a = 0; a < p.length; a++)
        for (let b = a + 1; b < p.length; b++)
            if (p[a].x < p[b].x + p[b].w && p[a].x + p[a].w > p[b].x &&
                p[a].y < p[b].y + p[b].h && p[a].y + p[a].h > p[b].y) hits++;
    return { n: p.length, overlaps: hits, page: { w: c.page.w, h: c.page.h },
             top: p[0], left: p[1], right: p[2] };
});
ok(p49.n === 3 && p49.overlaps === 0,
   'three panels, nothing overlapping');
ok(p49.top.w > p49.left.w * 1.5,
   'the top panel really is the wide one (' + p49.top.w + ' against ' +
   p49.left.w + ')');
ok(Math.abs((p49.left.w + 18 + p49.right.w) - p49.top.w) <= 2,
   'and the pair beneath spans it, so the three read as one block (' +
   (p49.left.w + 18 + p49.right.w) + ' against ' + p49.top.w + ')');
ok(p49.left.x === p49.top.x &&
   Math.abs((p49.right.x + p49.right.w) - (p49.top.x + p49.top.w)) <= 2,
   'flush at both outer edges (' + p49.left.x + ' and ' +
   (p49.right.x + p49.right.w) + ' against ' + p49.top.x + ' and ' +
   (p49.top.x + p49.top.w) + ')');
ok(p49.top.y >= 0 && p49.right.y + p49.right.h <= p49.page.h,
   'and the block sits on the page (' + p49.top.y + ' to ' +
   Math.round(p49.right.y + p49.right.h) + ' of ' + p49.page.h + ')');
ok(p49Picture.length === 3 &&
   Math.abs(p49Picture[0] - (p49Picture[1] + p49Picture[2])) < 6,
   'the gallery picture shows the same shape rather than a full-width bar (' +
   p49Picture.join('/') + ' per cent)');

console.log('case 50: Alt+drag pulls off a copy');
// The one reflex from the arrange audit that was never built. Alt+drag moved
// the item, like a plain drag, in an application where every neighbour makes
// a copy.
await page.evaluate(() => window.PS_SHELL.setWorkspace('layout'));
await page.waitForTimeout(500);
await page.evaluate(() => window.PS_SHELL.showLayoutGallery());
await page.waitForTimeout(500);
await page.click('[data-layout-template="single"]');
await page.waitForTimeout(300);
await page.click('[data-layout-create], #ps-layout-gallery-create');
await page.waitForTimeout(3200);
const p50State = () => page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    return { n: c.items.length,
             panels: c.items.filter(i => i.kind === 'chart')
                 .map(i => ({ id: i.id, x: i.x, y: i.y })),
             depth: window.PS_SHELL.layoutHistoryDepth(),
             sel: window.PS_SHELL.layoutSelection() };
});
async function p50Grab(id) {
    const box = await page.evaluate(x => {
        const n = document.querySelector(
            '#ps-lcanvas .ps-litem[data-item-id="' + x + '"]');
        n.scrollIntoView({ block: 'center' });
        const r = n.getBoundingClientRect();
        return { x: r.left + 30, y: r.top + 30 };
    }, id);
    return box;
}
const p50Before = await p50State();
const p50Src = p50Before.panels[0];
// An Alt press that never travels must stay a selection.
let g = await p50Grab(p50Src.id);
await page.keyboard.down('Alt');
await page.mouse.move(g.x, g.y);
await page.mouse.down();
await page.mouse.up();
await page.keyboard.up('Alt');
await page.waitForTimeout(500);
const p50Tap = await p50State();
ok(p50Tap.n === p50Before.n,
   'an Alt press that does not travel leaves nothing behind (' +
   p50Tap.n + ' items)');
// Now the real gesture.
g = await p50Grab(p50Src.id);
await page.keyboard.down('Alt');
await page.mouse.move(g.x, g.y);
await page.mouse.down();
await page.mouse.move(g.x + 90, g.y + 60, { steps: 8 });
await page.mouse.up();
await page.keyboard.up('Alt');
await page.waitForTimeout(700);
const p50After = await p50State();
ok(p50After.panels.length === p50Before.panels.length + 1,
   'Alt+drag made a copy (' + p50Before.panels.length + ' to ' +
   p50After.panels.length + ' panels)');
const p50Orig = p50After.panels.filter(p => p.id === p50Src.id)[0];
ok(p50Orig && p50Orig.x === p50Src.x && p50Orig.y === p50Src.y,
   'the original stayed where it was (' + p50Orig.x + ',' + p50Orig.y + ')');
const p50Copy = p50After.panels.filter(p => p.id !== p50Src.id)[0];
ok(p50Copy.x > p50Src.x && p50Copy.y > p50Src.y,
   'and the copy is the one that followed the pointer (' + p50Copy.x + ',' +
   p50Copy.y + ')');
ok(p50After.sel.length === 1 && p50After.sel[0] === p50Copy.id,
   'the copy is what ends up selected, so the next edit lands on it');
ok(p50After.depth === p50Before.depth + 1,
   'the copy and the move are one history entry (' + p50Before.depth +
   ' to ' + p50After.depth + ')');
await page.evaluate(() => document.getElementById('ps-lviewport').focus());
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
await page.waitForTimeout(800);
const p50Undone = await p50State();
ok(p50Undone.panels.length === p50Before.panels.length,
   'and one undo takes the whole gesture back (' +
   p50Undone.panels.length + ' panels)');

console.log('case 51: the menu says who owns Cmd/Ctrl+D');
// A layout with something selected duplicates the SELECTION, by the same
// routing rule that gives Undo to the layout while a figure is on screen.
// The Edit menu went on advertising the key beside Duplicate document, so
// pressing what the menu showed did the other thing.
await page.evaluate(() => window.PS_SHELL.setWorkspace('layout'));
await page.waitForTimeout(500);
await page.evaluate(() => window.PS_SHELL.showLayoutGallery());
await page.waitForTimeout(500);
await page.click('[data-layout-template="single"]');
await page.waitForTimeout(300);
await page.click('[data-layout-create], #ps-layout-gallery-create');
await page.waitForTimeout(3200);
async function p51Edit() {
    await page.click('[data-ps-menu="edit"]');
    await page.waitForTimeout(350);
    const rows = await page.evaluate(() =>
        Array.from(document.querySelectorAll('#ps-appmenu button')).map(b => {
            const sp = b.querySelectorAll('span');
            return { label: (sp[0] || {}).textContent || '',
                     key: (sp[1] || {}).textContent || '' };
        }).filter(r => /Duplicate document/.test(r.label)));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    return rows[0] || null;
}
await page.evaluate(() => window.PS_SHELL.laySetSelection([]));
await page.waitForTimeout(300);
const p51Empty = await p51Edit();
ok(p51Empty && /Cmd\/Ctrl\+D/.test(p51Empty.key),
   'with nothing selected the key really does duplicate the document ("' +
   (p51Empty || {}).key + '")');
await page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    window.PS_SHELL.selectLayoutItems([c.items[0].id]);
});
await page.waitForTimeout(400);
const p51Sel = await p51Edit();
ok(p51Sel && p51Sel.key === '',
   'and stops claiming it once a panel is selected, because the panel has ' +
   'it ("' + (p51Sel || {}).key + '")');
await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
await page.waitForTimeout(1300);
const p51Chart = await p51Edit();
ok(p51Chart && /Cmd\/Ctrl\+D/.test(p51Chart.key),
   'the chart workspace is untouched ("' + (p51Chart || {}).key + '")');

console.log('case 55: a hidden layout cannot be edited from another workspace');
// The layout stays the ACTIVE document while the Data workspace is on
// screen, and the layout key handler gated only on the active document, so
// Cmd/Ctrl+D there duplicated a hidden layout item with nothing on screen
// changing, and the Edit menu had to withdraw the key to stay honest. The
// visible workspace owns the keys now, the undo router's rule, so in Data
// the key duplicates the DOCUMENT, which arrives as a visible new tab.
await page.evaluate(() => window.PS_SHELL.setWorkspace('layout'));
await page.waitForTimeout(600);
await page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    window.PS_SHELL.laySetSelection([c.items[0].id]);
});
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(900);
const p55Before = await page.evaluate(() => ({
    layItems: window.PS_SHELL.chart().items.length,
    docs: window.PS_SHELL.charts().length,
    sel: window.PS_SHELL.layoutSelection().length
}));
ok(p55Before.sel === 1,
   'setup: the hidden layout still carries a selection');
const p55Menu = await p51Edit();
ok(p55Menu && /Cmd\/Ctrl\+D/.test(p55Menu.key),
   'the Edit menu advertises the key for the document here ("' +
   (p55Menu || {}).key + '")');
await page.evaluate(() => { document.body.focus(); });
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+d' : 'Control+d');
await page.waitForTimeout(800);
const p55After = await page.evaluate(() => ({
    layItems: window.PS_SHELL.charts().find(c => c.type === 'layout' &&
        c.id === window.PS_SHELL.project.activeChart) ?
        window.PS_SHELL.chart().items.length : window.PS_SHELL.chart().items.length,
    docs: window.PS_SHELL.charts().length
}));
ok(p55After.docs === p55Before.docs + 1,
   'and pressing it duplicates the document, visibly (' + p55Before.docs +
   ' to ' + p55After.docs + ' documents)');
ok(p55After.layItems === p55Before.layItems,
   'while the hidden layout is untouched (' + p55After.layItems + ' items)');
// undo the duplicate document so later cases see the fixture they expect
await page.evaluate(() => {
    const ds = window.PS_SHELL.charts();
    window.PS_SHELL.closeDocument(ds[ds.length - 1].id);
});
await page.waitForTimeout(600);

console.log('case 56: the item menu writes its shortcut like a menu');
// The span was rendered but the styling was scoped to the app menu, so the
// row read "DuplicateCmd/Ctrl+D" run together.
await page.evaluate(() => window.PS_SHELL.setWorkspace('layout'));
await page.waitForTimeout(700);
const p56Box = await page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    const p = c.items.filter(i => i.kind === 'chart')[0] || c.items[0];
    window.PS_SHELL.selectLayoutItems([p.id]);
    const n = document.querySelector(
        '#ps-lcanvas .ps-litem[data-item-id="' + p.id + '"]');
    n.scrollIntoView({ block: 'center' });
    const r = n.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await page.waitForTimeout(300);
await page.mouse.click(p56Box.x, p56Box.y, { button: 'right' });
await page.waitForTimeout(500);
const p56 = await page.evaluate(() => {
    const rows = Array.from(
        document.querySelectorAll('#ps-contextmenu button'));
    const dup = rows.find(b => /Duplicate/.test(b.textContent));
    if (!dup) return null;
    const sp = dup.querySelector('.ps-menu-shortcut');
    return { hasSpan: !!sp,
             marginLeft: sp ? getComputedStyle(sp).marginLeft : null,
             fontSize: sp ? getComputedStyle(sp).fontSize : null };
});
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
ok(p56 && p56.hasSpan, 'the Duplicate row carries its shortcut span');
ok(p56.marginLeft === '25px' && p56.fontSize === '10.5px',
   'and the span is styled as a menu shortcut rather than crammed against ' +
   'the label (' + p56.marginLeft + ', ' + p56.fontSize + ')');

console.log('case 52: Escape during an Alt+drag takes the copy back');
// The gesture made its copies on the first movement and repointed the drag at
// them, and layCancelDrag only restored positions. Escape therefore left a
// second panel exactly on top of the first, at 57,32 over 57,32, with
// layoutHistoryDepth still 0 and nothing for undo to remove. Invisible on
// screen, and present in select-all, Same size, plot-align and every export.
await page.evaluate(() => window.PS_SHELL.setWorkspace('layout'));
await page.waitForTimeout(500);
await page.evaluate(() => window.PS_SHELL.showLayoutGallery());
await page.waitForTimeout(500);
await page.click('[data-layout-template="single"]');
await page.waitForTimeout(300);
await page.click('[data-layout-create], #ps-layout-gallery-create');
await page.waitForTimeout(3200);
const p52 = () => page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    return { n: c.items.length, depth: window.PS_SHELL.layoutHistoryDepth(),
             ids: c.items.map(i => i.id),
             sel: window.PS_SHELL.layoutSelection().slice() };
});
const p52Before = await p52();
const p52Grab = await page.evaluate(() => {
    const n = document.querySelector('#ps-lcanvas .ps-litem');
    n.scrollIntoView({ block: 'center' });
    const r = n.getBoundingClientRect();
    return { x: r.left + 40, y: r.top + 40 };
});
await page.keyboard.down('Alt');
await page.mouse.move(p52Grab.x, p52Grab.y);
await page.mouse.down();
await page.mouse.move(p52Grab.x + 80, p52Grab.y + 50, { steps: 6 });
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await page.mouse.up();
await page.keyboard.up('Alt');
await page.waitForTimeout(700);
const p52After = await p52();
ok(p52After.n === p52Before.n,
   'a cancelled Alt+drag leaves the item count where it was (' +
   p52Before.n + ' to ' + p52After.n + ')');
ok(p52After.depth === p52Before.depth,
   'and pushes no history entry (' + p52After.depth + ')');
ok(p52After.ids.join() === p52Before.ids.join(),
   'the items are the ones that were there (' + p52After.ids.join() + ')');
// The press itself selects what it pressed, so the selection is the ORIGINAL
// rather than whatever was selected before the gesture started.
ok(p52After.sel.length === 1 &&
   p52Before.ids.indexOf(p52After.sel[0]) !== -1,
   'and the selection is the original, not a copy that no longer exists (' +
   p52After.sel.join() + ')');

console.log('case 53: an Alt+drag copy goes where the pointer goes');
// Two faults compounded on a text item near the right edge. The copy was
// clamped with a rect measured before it joined the document, so it was born
// hundreds of pixels left of its source rather than in place, and the drag
// kept the ORIGINAL selection's bounds, so the move clamp was computed for an
// item that was no longer being dragged and pinned the copy's x.
await page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    // LONG text at a right-edge x, which is the shape that separates the two
    // measurements. The rendered box is bounded by the room left on the page,
    // about 100 px here, while an estimate taken at the flat 480 px cap reads
    // it as roughly 455 wide, and the clamp then shoves the copy left by the
    // difference. A short caption measures the same either way and cannot
    // show it, which is how the first version of this case passed against the
    // very code it was written for.
    c.items.push({ id: 'i80', kind: 'text', fontSize: 14, x: 900, y: 420,
                   text: 'Scores by condition across every session, with ' +
                         'ninety five per cent confidence intervals.' });
    c.view.snap = false;
    window.PS_SHELL.selectLayoutItems(['i80']);
});
await page.waitForTimeout(700);
const p53Grab = await page.evaluate(() => {
    const n = document.querySelector('#ps-lcanvas .ps-litem[data-item-id="i80"]');
    n.scrollIntoView({ block: 'center' });
    const r = n.getBoundingClientRect();
    return { x: r.left + 8, y: r.top + 8 };
});
await page.keyboard.down('Alt');
await page.mouse.move(p53Grab.x, p53Grab.y);
await page.mouse.down();
await page.mouse.move(p53Grab.x + 10, p53Grab.y + 40, { steps: 4 });
await page.mouse.move(p53Grab.x + 20, p53Grab.y + 90, { steps: 6 });
await page.mouse.up();
await page.keyboard.up('Alt');
await page.waitForTimeout(700);
const p53 = await page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    const t = c.items.filter(i => i.kind === 'text');
    const src = t.filter(i => i.id === 'i80')[0];
    const copy = t.filter(i => i.id !== 'i80')[0];
    return { src: src ? { x: src.x, y: src.y } : null,
             copy: copy ? { x: copy.x, y: copy.y } : null, n: t.length };
});
ok(p53.n === 2 && p53.copy, 'the copy was made');
ok(p53.src.x === 900, 'the original did not move (' + p53.src.x + ')');
ok(Math.abs(p53.copy.x - 900) < 40,
   'and the copy started where its source is rather than hundreds of ' +
   'pixels away (' + p53.copy.x + ' against 900)');
ok(p53.copy.y > p53.src.y + 40,
   'the copy followed the pointer down the page (' + p53.copy.y +
   ' against ' + p53.src.y + ')');

console.log('case 54: a short Alt+drag is not snapped back onto its source');
// With snapping off, the copy starts exactly on its source and the source
// stopped being excluded from the smart guides, so it became a guide for its
// own copy and a 4 px drag put them back on top of each other.
await page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    // i900, well clear of the ids the app hands out, because case 53's own
    // Alt+drag copy legitimately takes the next one and a hardcoded id
    // collided with it.
    c.items.push({ id: 'i900', kind: 'text', fontSize: 14, x: 120, y: 160,
                   text: 'Note' });
    c.view.snap = false;
    window.PS_SHELL.selectLayoutItems(['i900']);
});
await page.waitForTimeout(700);
const p54Grab = await page.evaluate(() => {
    const n = document.querySelector('#ps-lcanvas .ps-litem[data-item-id="i900"]');
    n.scrollIntoView({ block: 'center' });
    const r = n.getBoundingClientRect();
    return { x: r.left + 6, y: r.top + 6 };
});
await page.keyboard.down('Alt');
await page.mouse.move(p54Grab.x, p54Grab.y);
await page.mouse.down();
await page.mouse.move(p54Grab.x + 4, p54Grab.y + 4, { steps: 2 });
await page.mouse.move(p54Grab.x + 4, p54Grab.y + 4, { steps: 2 });
await page.mouse.up();
await page.keyboard.up('Alt');
await page.waitForTimeout(700);
const p54 = await page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    const t = c.items.filter(i => i.kind === 'text' && /^Note$/.test(i.text));
    return t.map(i => ({ id: i.id, x: i.x, y: i.y }));
});
ok(p54.length === 2, 'the short drag still made a copy (' + p54.length + ')');
ok(!(p54[0].x === p54[1].x && p54[0].y === p54[1].y),
   'and the two are not sitting on each other (' +
   p54.map(i => i.x + ',' + i.y).join(' and ') + ')');

console.log('case 57: every figure panel is a white panel, canvas and file');
// A kept Notebook page arrived as an image item with no background while a
// chart panel wore white from CSS, so the canvas grid showed through kept
// pages, which read as "some sends arrive transparent". And the export
// painted NO panel backgrounds at all, so two overlapping panels exported
// with the lower one showing through where the screen showed an opaque
// card. Ordinary uploaded images are exempt on purpose: a logo's
// transparency is intentional. A deliberately transparent export is the
// other exemption: the user asked for transparency, so panels follow.
await page.evaluate(() => window.PS_SHELL.setWorkspace('layout'));
await page.waitForTimeout(500);
await page.evaluate(() => window.PS_SHELL.addLayout());
await page.waitForTimeout(1100);
const p57Charts = await page.evaluate(() =>
    window.PS_SHELL.charts().filter(c => c.type !== 'layout').map(c => c.id));
await page.evaluate((chartId) => {
    const c = window.PS_SHELL.chart();
    const px = 'data:image/svg+xml;base64,' +
        btoa('<svg xmlns="http://www.w3.org/2000/svg" width="200" ' +
             'height="140"><circle cx="100" cy="70" r="50" ' +
             'fill="#4478ad"/></svg>');
    // one of each: a chart panel, a kept page (srcPin), a plain image
    c.items.push({ id: 'i1', kind: 'chart', chartId: chartId,
                   x: 40, y: 40, w: 300, h: 204 });
    c.items.push({ id: 'i2', kind: 'image', src: px, srcPin: 'p99',
                   natW: 200, natH: 140, x: 380, y: 40, w: 200, h: 140 });
    c.items.push({ id: 'i3', kind: 'image', src: px,
                   natW: 200, natH: 140, x: 620, y: 40, w: 200, h: 140 });
    window.PS_SHELL.selectLayoutItems([]);
}, p57Charts[0]);
await page.waitForTimeout(1200);
const p57Canvas = await page.evaluate(() => {
    const read = id => {
        const n = document.querySelector(
            '#ps-lcanvas .ps-litem[data-item-id="' + id + '"]');
        return n ? getComputedStyle(n).backgroundColor : null;
    };
    return { panel: read('i1'), kept: read('i2'), plain: read('i3') };
});
ok(p57Canvas.kept === 'rgb(255, 255, 255)',
   'a kept page is a white panel on the canvas, like the chart beside it (' +
   p57Canvas.kept + ')');
ok(p57Canvas.plain === 'rgba(0, 0, 0, 0)',
   'while an ordinary image keeps its own transparency (' +
   p57Canvas.plain + ')');
const p57Rects = mode => page.evaluate(async (m) => {
    const r = await window.PS_SHELL.exportSource(m);
    const doc = new DOMParser().parseFromString(r.svg, 'image/svg+xml');
    const whites = [...doc.querySelectorAll('rect')]
        .filter(x => /^(#fff(fff)?|white)$/i.test(x.getAttribute('fill') || ''))
        .map(x => [+x.getAttribute('x'), +x.getAttribute('y')]);
    const under = (ix, iy) => whites.some(w => w[0] === ix && w[1] === iy);
    return { panel: under(40, 40), kept: under(380, 40), plain: under(620, 40) };
}, mode);
const p57Shown = await p57Rects('shown');
ok(p57Shown.panel && p57Shown.kept,
   'the export paints the same white under the chart panel and the kept ' +
   'page (' + JSON.stringify(p57Shown) + ')');
ok(!p57Shown.plain,
   'and none under the ordinary image');
const p57Trans = await p57Rects('transparent');
ok(!p57Trans.panel && !p57Trans.kept,
   'a deliberately transparent export keeps every panel transparent (' +
   JSON.stringify(p57Trans) + ')');

console.log('case 58: a selection drags as one thing');
// Marquee three panels or Cmd/Ctrl+A them and everything highlighted, and
// then dragging any one of them moved only that one: the press collapsed
// the selection to the clicked item before the drag armed. The collapse
// was right, its timing was wrong. It lives on the RELEASE now, and only
// for a press that never travelled, which is what a click actually is.
await page.evaluate(() => window.PS_SHELL.setWorkspace('layout'));
await page.waitForTimeout(500);
await page.evaluate(() => window.PS_SHELL.addLayout());
await page.waitForTimeout(1100);
const p58Chart = await page.evaluate(() => {
    const c = window.PS_SHELL.charts().find(x => x.type !== 'layout').id;
    const doc = window.PS_SHELL.chart();
    doc.view.snap = false;
    doc.items.push({ id: 'iA', kind: 'chart', chartId: c,
                     x: 40, y: 40, w: 300, h: 204 });
    doc.items.push({ id: 'iB', kind: 'chart', chartId: c,
                     x: 380, y: 40, w: 300, h: 204 });
    doc.items.push({ id: 'iC', kind: 'chart', chartId: c,
                     x: 40, y: 300, w: 300, h: 204 });
    window.PS_SHELL.selectLayoutItems(['iA', 'iB']);
    return c;
});
await page.waitForTimeout(900);
const p58Geo = () => page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    const m = {};
    c.items.forEach(i => m[i.id] = { x: i.x, y: i.y, w: i.w, h: i.h });
    m.sel = window.PS_SHELL.layoutSelection().slice();
    m.depth = window.PS_SHELL.layoutHistoryDepth();
    return m;
});
const p58Mid = id => page.evaluate(x => {
    const n = document.querySelector('.ps-litem[data-item-id="' + x + '"]');
    n.scrollIntoView({ block: 'center' });
    const r = n.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, id);
const p58a = await p58Geo();
let p58c = await p58Mid('iA');
await page.mouse.move(p58c.x, p58c.y);
await page.mouse.down();
await page.mouse.move(p58c.x + 60, p58c.y + 40, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(500);
const p58b = await p58Geo();
const p58dA = [p58b.iA.x - p58a.iA.x, p58b.iA.y - p58a.iA.y];
const p58dB = [p58b.iB.x - p58a.iB.x, p58b.iB.y - p58a.iB.y];
ok(p58dA[0] > 20 && Math.abs(p58dA[0] - p58dB[0]) < 0.5 &&
   Math.abs(p58dA[1] - p58dB[1]) < 0.5,
   'dragging one selected panel moves the other by the same delta (' +
   p58dA.map(v => v.toFixed(1)).join(',') + ' and ' +
   p58dB.map(v => v.toFixed(1)).join(',') + ')');
ok(p58b.iC.x === p58a.iC.x && p58b.iC.y === p58a.iC.y,
   'while the unselected panel stays put');
ok(p58b.sel.length === 2,
   'and the selection survives the drag (' + p58b.sel.join(',') + ')');
ok(p58b.depth === p58a.depth + 1,
   'as one history entry (' + p58a.depth + ' to ' + p58b.depth + ')');
p58c = await p58Mid('iA');
await page.mouse.click(p58c.x, p58c.y);
await page.waitForTimeout(400);
ok((await p58Geo()).sel.join(',') === 'iA',
   'a press that never travels is a click, and collapses to the clicked ' +
   'item on release');

console.log('case 59: selected panels resize together');
// A multi-selection had no resize at all: the handle only rendered for a
// single unit and the resize branch was gated to one item. Now every
// selected panel wears the handle, whichever one is grabbed drives, and
// two panels of the SAME size stay the same size to the pixel, because a
// same-size follower copies the driver rather than multiplying a ratio.
await page.evaluate(() => window.PS_SHELL.selectLayoutItems(['iA', 'iB']));
await page.waitForTimeout(400);
ok(await page.evaluate(() =>
       document.querySelectorAll('.ps-lhandle').length) === 2,
   'both selected panels wear a resize handle');
const p59a = await p58Geo();
const p59h = await page.evaluate(() => {
    const n = document.querySelector(
        '.ps-litem[data-item-id="iA"] .ps-lhandle');
    const r = n.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await page.mouse.move(p59h.x, p59h.y);
await page.mouse.down();
await page.mouse.move(p59h.x + 60, p59h.y + 60, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(500);
const p59b = await p58Geo();
ok(p59b.iA.w > p59a.iA.w,
   'the grabbed panel grew (' + p59a.iA.w + ' to ' +
   p59b.iA.w.toFixed(1) + ')');
ok(p59b.iA.w === p59b.iB.w && p59b.iA.h === p59b.iB.h,
   'and its same-size partner is the SAME size after, to the pixel (' +
   p59b.iB.w.toFixed(1) + ' by ' + p59b.iB.h.toFixed(1) + ')');
ok(Math.abs(p59b.iA.w / p59b.iA.h - 300 / 204) < 0.02,
   'a plain drag keeps the aspect on both (' +
   (p59b.iA.w / p59b.iA.h).toFixed(3) + ')');
ok(p59b.iC.w === p59a.iC.w,
   'the unselected panel keeps its size');
ok(p59b.depth === p59a.depth + 1,
   'one history entry for the whole synced resize');
await page.evaluate(() => document.getElementById('ps-lviewport').focus());
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
await page.waitForTimeout(600);
const p59u = await p58Geo();
ok(p59u.iA.w === p59a.iA.w && p59u.iB.w === p59a.iB.w,
   'and one undo restores both (' + p59u.iA.w + ' and ' + p59u.iB.w + ')');

ok(errors.length === 0, 'no page errors (' + errors.join(' | ') + ')');
console.log('\nlayout-figure-check: all cases passed');
await browser.close();
