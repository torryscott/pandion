// Punch list t2-38: renderLayout re-parsed every chart panel on every rebuild.
//
// MEASURED before anything was changed, because the item's numbers deserved
// checking and the sample data does not show the problem at all (2 ms). On a
// real figure it is severe: four dense scatter panels are ~3 MB of SVG, and
// ONE renderLayout re-parsed 3,793 KB in 56 ms, growing with every panel
// added. That is a whole frame budget and then some, on every drop, align,
// nudge and selection clear.
//
// The fix is not to rebuild what has not changed: appendChild MOVES a node
// rather than re-parsing it, so a panel whose chart snapshot is unchanged is
// reused whole and only its geometry and selection class are rewritten.
//
// The RISK this creates, and the reason the pool is keyed on the snapshot
// revision, is a panel that keeps showing an old picture. Case 3 is that.
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
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1500);

// Two chart panels are enough to show reuse; the cost scales from there.
const built = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const ids = [window.PS_SHELL.chart().id];
    window.PS_SHELL.addChart();
    await s(1200);
    // A new chart has no roles, so it draws a placeholder rather than an SVG
    // and would never exercise the reuse path at all.
    window.PS_SHELL.setRoles('plotbuilder',
        { xvar: 'condition', yvar: 'score' });
    await s(1800);
    ids.push(window.PS_SHELL.chart().id);
    for (const id of ids) { window.PS_SHELL.switchChart(id); await s(1200); }
    window.PS_SHELL.createLayoutFromTemplate('presentation');
    await s(1500);
    for (const id of ids) {
        document.getElementById('ps-laddchart').click();
        await s(250);
        const b = document.querySelector(
            '#ps-lchartmenu button[data-chart="' + id + '"]');
        if (b) b.click();
        await s(900);
    }
    return { ids, items: (window.PS_SHELL.chart().items || []).length,
             svgs: document.querySelectorAll('#ps-lcanvas .ps-litem svg').length };
});
ok(built.items === 2 && built.svgs === 2,
   `setup: two chart panels, both drawing a real SVG ` +
   `(${built.items} items, ${built.svgs} svgs)`);

// Counting innerHTML writes is the direct measure: it is what re-parsing IS.
async function countRebuild(label) {
    return page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        const proto = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
        let svgWrites = 0, chars = 0;
        Object.defineProperty(Element.prototype, 'innerHTML', {
            configurable: true, get: proto.get,
            set: function (v) {
                const t = v ? String(v).length : 0;
                chars += t;
                if (t > 2000 && /<svg/.test(String(v))) svgWrites++;
                return proto.set.call(this, v);
            }
        });
        // A plain rebuild: nudge the selection, which is one of the 27 call
        // sites the item names.
        const items = window.PS_SHELL.chart().items || [];
        window.PS_SHELL.laySetSelection([items[0].id]);
        window.PS_SHELL.runCommand('layer-forward');
        await s(60);
        Object.defineProperty(Element.prototype, 'innerHTML', proto);
        return { svgWrites, KB: Math.round(chars / 1024) };
    });
}

console.log('case 1: an unchanged panel is not re-parsed');
const first = await countRebuild();
ok(first.svgWrites === 0,
   `a rebuild with nothing changed re-parses NO chart SVG ` +
   `(${first.svgWrites} writes, ${first.KB} KB)`);

console.log('case 2: and it stays that way across repeated rebuilds');
const again = await countRebuild();
ok(again.svgWrites === 0,
   `still none on the next one, so the pool is not a one-shot ` +
   `(${again.svgWrites} writes)`);

console.log('case 3: but a RESTYLED chart does re-parse, or it would go stale');
const restyled = await page.evaluate(async (chartId) => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    // Restyle the chart the panel points at, which bumps the snapshot
    // revision. This is the failure the pool key exists to prevent: a panel
    // that keeps showing the old picture is worse than a slow one.
    window.PS_SHELL.setWorkspace('chart');
    window.PS_SHELL.switchChart(chartId);
    await s(1200);
    window.setOption('barColor', '#8e44ad');
    await s(1800);
    // Counted across the RETURN to the layout, because that is where the
    // re-parse happens: coming back renders the layout, and by the time any
    // later rebuild runs the panel is already current. Instrumenting only the
    // later rebuild measures the wrong window and reads 0.
    const proto = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    let svgWrites = 0;
    Object.defineProperty(Element.prototype, 'innerHTML', {
        configurable: true, get: proto.get,
        set: function (v) {
            const t = v ? String(v).length : 0;
            if (t > 2000 && /<svg/.test(String(v))) svgWrites++;
            return proto.set.call(this, v);
        }
    });
    window.PS_SHELL.setWorkspace('layout');
    await s(1600);
    Object.defineProperty(Element.prototype, 'innerHTML', proto);
    // And the panel shows the NEW colour, which is the thing that matters.
    const fills = Array.from(document.querySelectorAll(
        '#ps-lcanvas .ps-litem svg [data-bar-cat]')).map(
        e => e.getAttribute('fill') || '');
    return { svgWrites, purple: fills.filter(f => /8e44ad/i.test(f)).length };
}, built.ids[0]);
ok(restyled.svgWrites >= 1,
   `a restyled chart's panel IS re-parsed (${restyled.svgWrites} writes)`);
ok(restyled.purple > 0,
   `and the panel shows the new colour rather than a cached old picture ` +
   `(${restyled.purple} recoloured bars)`);

// Item ids are PER-LAYOUT, so two figures both have an "i1". A pool keyed on
// item id alone would hand the second one the first one's node. The key
// carries the chart id and its revision precisely so that cannot happen; the
// per-layout reset is a MEMORY bound (otherwise the pool accumulates a node
// for every layout ever visited), which is why removing it does not break
// this case.
console.log('case 4: two figures each with an i1 show their OWN chart');
const swapped = await page.evaluate(async (secondChartId) => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const beforeIds = (window.PS_SHELL.chart().items || []).map(i => i.id);
    window.PS_SHELL.createLayoutFromTemplate('presentation');
    await s(1500);
    // Point the NEW layout's first item at the OTHER chart.
    document.getElementById('ps-laddchart').click();
    await s(300);
    const b = document.querySelector(
        '#ps-lchartmenu button[data-chart="' + secondChartId + '"]');
    if (b) b.click();
    await s(1200);
    const items = window.PS_SHELL.chart().items || [];
    // The RENDERED pixels, not just the model: the model is right whatever
    // the pool does, so asserting it cannot catch a pool that handed over the
    // wrong node. Chart one was turned purple in case 3, so if this panel is
    // secretly showing chart one's node it will be purple and chart two is
    // not.
    const fills = Array.from(document.querySelectorAll(
        '#ps-lcanvas .ps-litem svg [data-bar-cat]')).map(
        e => e.getAttribute('fill') || '');
    return { beforeIds, afterIds: items.map(i => i.id),
             pointsAt: items[0] && items[0].chartId,
             wanted: secondChartId,
             bars: fills.length,
             purple: fills.filter(f => /8e44ad/i.test(f)).length };
}, built.ids[1]);
ok(swapped.beforeIds[0] === swapped.afterIds[0],
   `setup: both layouts really do use the same item id ` +
   `(${swapped.beforeIds[0]} and ${swapped.afterIds[0]})`);
ok(swapped.pointsAt === swapped.wanted,
   `and the second layout's panel points at its OWN chart ` +
   `(${swapped.pointsAt} vs ${swapped.wanted})`);
ok(swapped.bars > 0 && swapped.purple === 0,
   `and DRAWS it: none of its bars carry the purple that was applied to the ` +
   `other chart, which is what a mixed-up pooled node would look like ` +
   `(${swapped.bars} bars, ${swapped.purple} purple)`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('LAYOUT REUSE CHECK PASS');
await browser.close();
