// Torry, Aug 10 2026: "the swatch view, or the swatch row, where it's
// supposed to be a row, looks different depending on where you are... in
// the y-axis it's compacted into this 4x3 grid... I've uploaded the exact
// same graph but with how color is handled in the bars option, and that's
// how I want it to look everywhere."
//
// THE CAUSE. The quick-pick row is a flex item (flex:1 1 0; min-width:0;
// flex-wrap:wrap) so it can sit BESIDE the big current-colour chip. Every
// colour strip except the Bars fill one also put the hint text "or use the
// HSV picker on the right." on that same flex line. The hint took width,
// the row got what was left, and twelve 22px chips wrapped into a grid.
// The Bars fill strip was not special - it was the one place with no such
// sibling, which is exactly why it looked right.
//
// THE FIX. The hint takes its own line, using the flex-break idiom already
// in the file, so the row spans the strip and stays on ONE line. Chip size
// and the 3px gap are untouched, so the WCAG 2.2 target-size spacing
// exception still holds.
//
// This is engine code, so jamovi had the identical inconsistency and gets
// the identical fix.
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
await page.waitForTimeout(Number(process.env.PS_BOOT || 1300));
await page.click('#ps-welcome-sample');
await page.waitForTimeout(2200);

// Measure the OPEN panel's quick-pick row: how many lines the chips
// occupy, and whether the hint sits below them rather than beside.
const strip = () => page.evaluate(() => {
    const panel = document.querySelector('#psroot .gb2-panel');
    if (!panel) return { err: 'no panel open' };
    // The chips carry a namespaced data-*-palette attribute, so gather by
    // attribute shape rather than by any one panel's namespace.
    const chips = Array.from(panel.querySelectorAll('button')).filter(b =>
        Array.from(b.attributes).some(a => /-palette$/.test(a.name)) &&
        b.getBoundingClientRect().width > 0);
    if (!chips.length) return { err: 'no swatch chips in the open panel' };
    const rects = chips.map(c => c.getBoundingClientRect());
    const lines = new Set(rects.map(r => Math.round(r.top))).size;
    const bottom = Math.max(...rects.map(r => r.bottom));
    const hint = Array.from(panel.querySelectorAll('span')).find(s =>
        /or use the HSV picker/.test(s.textContent) &&
        s.getBoundingClientRect().width > 0);
    return {
        n: chips.length, lines,
        hasHint: !!hint,
        hintBelow: hint ? hint.getBoundingClientRect().top >= bottom - 2 : null,
        // Guard the ruling the row's density rests on: 22px chips, 3px
        // gap, so adjacent centres are 25px apart.
        pitch: rects.length > 1
            ? Math.round((rects[1].left - rects[0].left) * 10) / 10 : null,
        size: Math.round(rects[0].width * 10) / 10
    };
});

const chartPoint = (sel) => page.evaluate((s) => {
    const svg = Array.from(document.querySelectorAll('#psroot svg'))
        .sort((a, b) => b.getBoundingClientRect().width -
                        a.getBoundingClientRect().width)[0];
    const e = svg && svg.querySelector(s);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, sel);

async function openFromChart(sel, label) {
    const p = await chartPoint(sel);
    ok(!!p, `${label}: the part is on the chart`);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(1400);
}

// Click a VISIBLE tab or strip chip by its label. Visibility matters:
// collapsed strips keep their DOM, so a blind text match can hit a hidden
// chip and silently do nothing.
async function clickLabel(label) {
    const hit = await page.evaluate((t) => {
        const b = Array.from(
            document.querySelectorAll('#psroot .gb2-panel button'))
            .filter(x => (x.textContent || '').trim() === t)
            .find(x => x.getBoundingClientRect().width > 0);
        if (!b) return false;
        const r = b.getBoundingClientRect();
        b.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1,
            clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
        return true;
    }, label);
    await page.waitForTimeout(700);
    return hit;
}

// Open a named strip inside the panel that is already open.
async function openStrip(field) {
    await page.evaluate((f) => {
        const b = document.querySelector('#psroot [data-field="' + f + '"]');
        if (!b) return;
        const r = b.getBoundingClientRect();
        b.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1,
            clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
    }, field);
    await page.waitForTimeout(700);
}

console.log('case 1: the Bars fill strip - the one Torry pointed at as right');
await openFromChart('[data-bar-cat]', 'a bar');
const bars = await strip();
ok(!bars.err, `the bar style panel is open with its swatches (${bars.n} chips)`);
ok(bars.lines === 1,
   `its quick picks are ONE row, which is the look being matched ` +
   `(${bars.n} chips, ${bars.lines} line)`);
ok(bars.size === 22 && bars.pitch === 25,
   `at the settled density: 22px chips, adjacent centres 25px apart ` +
   `(size ${bars.size}, pitch ${bars.pitch})`);

console.log('case 2: the Y axis line colour - the strip he reported');
await openFromChart('[data-role="y-axis-line"]', 'the Y axis');
const yaxis = await strip();
ok(!yaxis.err, `the Y axis panel is open with its swatches (${yaxis.n} chips)`);
ok(yaxis.lines === 1,
   `its quick picks are ONE row too, not a ${Math.ceil(yaxis.n / 4)}-row grid ` +
   `(${yaxis.n} chips, ${yaxis.lines} line)`);
ok(yaxis.hasHint && yaxis.hintBelow,
   'and the HSV hint sits BELOW the chips rather than stealing their width');
ok(yaxis.size === 22 && yaxis.pitch === 25,
   `with the same chip density as the bars strip ` +
   `(size ${yaxis.size}, pitch ${yaxis.pitch})`);

console.log('case 3: the same strip on the ticks tab');
await openStrip('tick-color-btn');
const ticks = await strip();
ok(!ticks.err && ticks.lines === 1,
   `axis tick colour is one row as well (${ticks.n} chips, ${ticks.lines} line)`);
ok(!ticks.hasHint || ticks.hintBelow,
   'its hint is below the chips too');

console.log('case 4: an error bar, a third panel built the same way');
await openFromChart('[data-role="error-bar"]', 'an error bar');
// The bar panel's tab and strip are session-sticky and the error-bar
// panel deliberately lands on Type, so name both rather than assume.
await clickLabel('Error bars');
await clickLabel('Color');
const eb = await strip();
ok(!eb.err && eb.lines === 1,
   `error bar colour is one row (${eb.n} chips, ${eb.lines} line)`);
ok(!eb.hasHint || eb.hintBelow, 'its hint is below the chips too');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('SWATCH ROW CHECK PASS');
await browser.close();
