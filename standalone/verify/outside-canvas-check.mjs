// Torry, Jul 29 2026, with a heatmap whose Count legend he had dragged to
// the right: "the legend is no longer in the exported file... If we go to
// Add Chart, under Layout, the legend does show up. If you export the
// layout, even though that legend shows up on the layout, the legend
// doesn't show up on the exported version."
//
// Measured cause: the chart svg overflows visibly (no clip), so a part
// dragged past the canvas edge still PAINTS on screen - but every
// serialization cropped at the declared canvas. In the reported case the
// legend sat at x 844-873 against a 720-wide canvas, and the export viewBox
// stopped at 720.
//
// His ruling: grow the export to include it, AND change the size numbers so
// the row never advertises a size no exported file will have. This probe
// pins all three halves - the export box, the layout snapshot box, and the
// honest size row - plus the guarantee that an ordinary chart (nothing
// outside) is completely unaffected.
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
function ok(cond, msg, extra) {
    if (!cond) throw new Error(msg + (extra ? ' :: ' + extra : ''));
    console.log('  ok  ' + msg);
}

const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1400);

// A scatter, then the heatmap type through the real flyout: the heatmap's
// Count legend is the draggable part Torry reported.
await page.evaluate(() => window.PS_SHELL.addChart('xyplotbuilder'));
await page.waitForTimeout(700);
await page.evaluate(() =>
    window.PS_SHELL.setRoles('xyplotbuilder', { xvar: 'hours', yvar: 'score' }));
await page.waitForTimeout(2600);
const trig = await page.evaluate(() => {
    const b = document.querySelector('button[data-role="graphtype-trigger"]');
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.click(trig.x, trig.y);
await page.waitForTimeout(400);
const hm = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button[data-gt="heatmap"]'))
        .find(x => x.getBoundingClientRect().width > 0);
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.click(hm.x, hm.y);
await page.waitForTimeout(3200);

// Through the SHELL's export path, not the engine's raw serializer: the
// engine hands over the chart as drawn, and the shell is what decides the
// figure's box. (First cut of this probe called __gb2_serializeSvg directly
// and tested nothing the fix touches.)
const exportBox = () => page.evaluate(async () => {
    const src = await window.PS_SHELL.exportSource('shown');
    const doc = new DOMParser().parseFromString(src.svg, 'image/svg+xml');
    const root = doc.documentElement;
    return {
        w: Number(root.getAttribute('width')) || src.w,
        viewBox: root.getAttribute('viewBox'),
        hasLegend: !!root.querySelector('[data-role="xy-bin-legend"]'),
    };
});
const sizeRow = () => page.evaluate(() => {
    const f = document.getElementById('ps-fit-pane');
    const field = f && f.closest('.ps-inspector-field');
    const span = field && field.querySelector('span');
    return span ? span.textContent : '';
});

console.log('case 1: an ordinary chart is untouched by any of this');
{
    const before = await exportBox();
    ok(before.hasLegend, 'setup: the heatmap draws its Count legend');
    const vb = before.viewBox.trim().split(/\s+/).map(Number);
    const content = await page.evaluate(() => {
        const svg = Array.from(document.querySelectorAll('#psroot svg'))
            .sort((a, b) => (b.clientWidth * b.clientHeight) -
                            (a.clientWidth * a.clientHeight))[0];
        const bb = svg.getBBox();
        return { right: bb.x + bb.width, declared: svg.clientWidth };
    });
    ok(content.right <= content.declared + 1,
       'nothing sits outside the canvas yet',
       `content right ${Math.round(content.right)} <= ${content.declared}`);
    ok(vb[2] <= 740,
       'so the export box is the ordinary canvas, not grown',
       before.viewBox);
    const row = await sizeRow();
    ok(!/exports/.test(row), 'and the size row reads normally', row);
}

console.log('case 2: a legend dragged outside grows the export to fit it');
let grownW = 0;
{
    const legPos = await page.evaluate(() => {
        const l = document.querySelector('#psroot [data-role="xy-bin-legend"]');
        const r = l.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.move(legPos.x, legPos.y);
    await page.mouse.down();
    await page.mouse.move(legPos.x + 190, legPos.y + 10, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(2600);

    const outside = await page.evaluate(() => {
        const svg = Array.from(document.querySelectorAll('#psroot svg'))
            .sort((a, b) => (b.clientWidth * b.clientHeight) -
                            (a.clientWidth * a.clientHeight))[0];
        const bb = svg.getBBox();
        return { right: Math.round(bb.x + bb.width), declared: svg.clientWidth };
    });
    ok(outside.right > outside.declared + 20,
       'setup: the legend now sits outside the canvas',
       `content right ${outside.right} vs canvas ${outside.declared}`);

    const after = await exportBox();
    ok(after.hasLegend, 'the legend still rides the serialized figure');
    const vb = after.viewBox.trim().split(/\s+/).map(Number);
    const boxRight = vb[0] + vb[2];
    grownW = after.w;
    ok(boxRight >= outside.right,
       'and the export box now REACHES it (this is the reported bug)',
       `box right ${Math.round(boxRight)} >= legend right ${outside.right}`);
    ok(after.w > outside.declared,
       'the exported figure is wider than the canvas, as it must be',
       `${after.w}px vs canvas ${outside.declared}px`);
}

console.log('case 3: the size row states the size the file will really have');
{
    const row = await sizeRow();
    ok(/exports\s+[\d.]+\s+x\s+[\d.]+\s+in/.test(row),
       'the row discloses the exported size', row);
    const m = row.match(/exports\s+([\d.]+)\s+x/);
    const inches = Number(m[1]);
    ok(inches > 7.5,
       'and that number is bigger than the 7.5in canvas, not a repeat of it',
       row);
    // The chart itself must NOT have been re-laid-out: growing the canvas
    // would move the very legend that grew it, and could loop.
    const canvas = await page.evaluate(() => {
        const svg = Array.from(document.querySelectorAll('#psroot svg'))
            .sort((a, b) => (b.clientWidth * b.clientHeight) -
                            (a.clientWidth * a.clientHeight))[0];
        return svg.clientWidth;
    });
    ok(canvas === 720, 'while the chart canvas itself is untouched at 720px',
       String(canvas));
}

console.log('case 4: a layout carries the legend into its export too');
{
    await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        window.PS_SHELL.addLayout();
        await s(1200);
    });
    await page.waitForTimeout(600);
    const snap = await page.evaluate(() => {
        const ids = window.PS_SHELL.snapshots();
        const id = ids[ids.length - 1];
        const s = window.PS_SHELL.snapshotOf(id);
        if (!s) return null;
        const doc = new DOMParser().parseFromString(s.svg, 'image/svg+xml');
        const root = doc.documentElement;
        return {
            w: s.w, h: s.h, viewBox: root.getAttribute('viewBox'),
            hasLegend: !!root.querySelector('[data-role="xy-bin-legend"]'),
        };
    });
    ok(!!snap, 'setup: the chart has a layout snapshot');
    ok(snap.hasLegend, 'the snapshot still contains the legend');
    const vb = snap.viewBox.trim().split(/\s+/).map(Number);
    ok(vb[0] + vb[2] > 720,
       'and its viewBox reaches past the canvas, so a layout export ' +
       'shows what the layout shows', snap.viewBox);
    ok(snap.w > 720,
       'the snapshot reports the grown width, so the panel keeps its aspect',
       String(snap.w));
}

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('OUTSIDE CANVAS CHECK PASS');
await browser.close();
