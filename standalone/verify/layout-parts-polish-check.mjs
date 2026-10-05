// Figure parts, slice three (Sep 29 2026, Torry's review of slice two):
// the parts follow the chart's click-to-edit habit. A phase band opens a
// real color picker when clicked on the canvas or from its rail chip; a
// tick click lands in its rail row; the timeline's line and ticks have
// widths (all ticks, or one tick on its own) and a tick length; and every
// swatch row (box fill, box border, arrow, timeline) has a custom-color
// chip that opens the same picker. Control: a tree without the feature
// has no custom chip, so case 1 fails at once.
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
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1500);
}
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.addLayout(); await s(800);
    window.PS_SHELL.setWorkspace('layout'); await s(500);
});
const items = () => page.evaluate(() => window.PS_SHELL.chart().items);
const itemNode = id => '.ps-litem[data-item-id="' + id + '"]';
const popState = () => page.evaluate(() => {
    const p = document.getElementById('ps-lcolorpop');
    return { open: !!p && p.style.display === 'block',
             hex: p ? p.querySelector('.ps-lcp-hex').value : null,
             focused: document.activeElement && document.activeElement.className };
});
async function typeHex(hex) {
    await page.fill('#ps-lcolorpop .ps-lcp-hex', hex);
    await page.dispatchEvent('#ps-lcolorpop .ps-lcp-hex', 'change');
    await page.waitForTimeout(250);
}

console.log('case 1: a click on a phase band opens the color picker on it');
ok(await page.locator('#ps-ltl-custom').count() === 1 && await page.locator('#ps-lbox-fillcustom').count() === 1,
   'the rail carries the custom-color chips (none = control red)');
await page.evaluate(() => window.PS_SHELL.runCommand('insert-timeline'));
await page.waitForTimeout(400);
await page.click('#ps-ltl-add-band');
await page.waitForSelector('[data-role="lay-band"]');
await page.waitForTimeout(250);
const tl = (await items())[0];
const band = await page.evaluate(sel => {
    const r = document.querySelector(sel + ' [data-role="lay-band"]').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, itemNode(tl.id));
await page.mouse.click(band.x, band.y);
await page.waitForTimeout(400);
let pop = await popState();
ok(pop.open && pop.hex === '#e8f0fb' && pop.focused === 'ps-lcp-hex',
   'the picker opened on the band\'s color with the hex field focused');
await typeHex('#ffcc00');
let st = await page.evaluate(sel => {
    const it = window.PS_SHELL.chart().items[0];
    return { fill: it.bands[0].fill,
             canvas: document.querySelector(sel + ' [data-role="lay-band"]').getAttribute('fill'),
             chip: document.getElementById('ps-ltl-band-fill-0').style.background,
             depth: window.PS_SHELL.layoutHistoryDepth() };
}, itemNode(tl.id));
ok(st.fill === '#ffcc00' && st.canvas === '#ffcc00' && st.chip === 'rgb(255, 204, 0)',
   'a typed hex recolors the band on the canvas and its rail chip');
const depth0 = st.depth;
const sv = await page.evaluate(() => {
    const r = document.querySelector('#ps-lcolorpop .ps-lcp-sv').getBoundingClientRect();
    return { x: r.left + r.width * 0.2, y: r.top + r.height * 0.3,
             x2: r.left + r.width * 0.9, y2: r.top + r.height * 0.1 };
});
await page.mouse.move(sv.x, sv.y);
await page.mouse.down();
await page.mouse.move(sv.x2, sv.y2, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(300);
st = await page.evaluate(() => ({ fill: window.PS_SHELL.chart().items[0].bands[0].fill,
                                  depth: window.PS_SHELL.layoutHistoryDepth() }));
ok(st.fill !== '#ffcc00' && /^#[0-9a-f]{6}$/.test(st.fill) && st.depth === depth0,
   'dragging the square recolors live and folds into the same undo step (' + st.fill + ')');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
pop = await popState();
ok(!pop.open, 'Escape closes the picker');
await page.click('#ps-lundo');
await page.waitForTimeout(300);
st = await page.evaluate(() => window.PS_SHELL.chart().items[0].bands[0].fill);
// The typed hex and the drag that followed it within the coalesce window
// are ONE step, the way a burst of nudges is: one Undo returns the band to
// the color it had when the picker opened.
ok(st === '#e8f0fb', 'one Undo takes back the whole picker session (' + st + ')');
await page.evaluate(() => document.getElementById('ps-lredo').click());
await page.waitForTimeout(300);
ok(/^#[0-9a-f]{6}$/.test(await page.evaluate(() => window.PS_SHELL.chart().items[0].bands[0].fill)),
   'Redo brings the picked color back');
await page.evaluate(() => { const it = window.PS_SHELL.chart().items[0]; it.bands[0].fill = '#ffcc00'; });
await page.click('#ps-ltl-band-fill-0');
await page.waitForTimeout(250);
pop = await popState();
ok(pop.open && pop.hex === '#ffcc00', 'the rail chip opens the same picker');
await page.click('#ps-lcolorpop .ps-lcp-done');
await page.waitForTimeout(200);
ok(!(await popState()).open, 'Done closes it');

console.log('case 2: a tick click lands in its rail row; widths and length');
const tick = await page.evaluate(sel => {
    const r = document.querySelector(sel + ' [data-role="lay-tick"][data-idx="2"]').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, itemNode(tl.id));
await page.mouse.click(tick.x, tick.y);
await page.waitForTimeout(400);
ok(await page.evaluate(() => document.activeElement && document.activeElement.id === 'ps-ltl-tick-label-2'),
   'clicking a tick (no drag) focuses that tick\'s label field');
await page.fill('#ps-ltl-ticks .ps-ltl-row[data-idx="2"] input[data-ltl-tick="width"]', '3');
await page.waitForTimeout(250);
await page.evaluate(() => document.activeElement.blur());
await page.fill('#ps-ltl-tickw-num', '2');
await page.dispatchEvent('#ps-ltl-tickw-num', 'change');
await page.waitForTimeout(250);
await page.fill('#ps-ltl-tickl-num', '20');
await page.dispatchEvent('#ps-ltl-tickl-num', 'change');
await page.waitForTimeout(250);
await page.fill('#ps-ltl-width-num', '3');
await page.dispatchEvent('#ps-ltl-width-num', 'change');
await page.waitForTimeout(250);
st = await page.evaluate(sel => {
    const it = window.PS_SHELL.chart().items[0];
    const lines = Array.from(document.querySelectorAll(sel + ' line'))
        .map(l => l.getAttribute('stroke-width') + '@' +
                  (Number(l.getAttribute('y2')) - Number(l.getAttribute('y1'))));
    return { widths: it.ticks.map(t => t.width), tickWidth: it.tickWidth, tickLen: it.tickLen,
             width: it.width, lines,
             path: document.querySelector(sel + ' path').getAttribute('stroke-width') };
}, itemNode(tl.id));
ok(st.widths[2] === 3 && st.widths[0] == null && st.tickWidth === 2 && st.tickLen === 20 && st.width === 3,
   'one tick at 3, every other tick at 2, ticks 20 long, the line at 3');
ok(st.lines.join(' ') === '2@20 2@20 3@20 2@20' && st.path === '3',
   'the canvas draws exactly that (' + st.lines.join(' ') + ')');
let svg = (await page.evaluate(() => window.PS_SHELL.exportSource('white'))).svg;
ok((svg.match(/<line [^>]*stroke-width="2"/g) || []).length === 3 &&
   (svg.match(/<line [^>]*stroke-width="3"/g) || []).length === 1,
   'and the export draws the same widths');

console.log('case 3: custom-color chips on the timeline, box, and arrow rows');
await page.click('#ps-ltl-custom');
await page.waitForTimeout(250);
await typeHex('#0055aa');
await page.click('#ps-lcolorpop .ps-lcp-done');
await page.waitForTimeout(200);
st = await page.evaluate(() => ({ color: window.PS_SHELL.chart().items[0].color,
    pressed: document.getElementById('ps-ltl-custom').getAttribute('aria-pressed'),
    chip: document.getElementById('ps-ltl-custom').style.background }));
ok(st.color === '#0055aa' && st.pressed === 'true' && st.chip === 'rgb(0, 85, 170)',
   'the timeline takes a custom color and its chip shows it as the current one');
await page.evaluate(() => window.PS_SHELL.runCommand('insert-box'));
await page.waitForTimeout(300);
await page.click('#ps-lbox-bordercolor');
await page.waitForTimeout(250);
await typeHex('#aa0000');
await page.click('#ps-lcolorpop .ps-lcp-done');
await page.waitForTimeout(200);
await page.click('#ps-lbox-fillcustom');
await page.waitForTimeout(250);
await typeHex('#eeeeff');
await page.click('#ps-lcolorpop .ps-lcp-done');
await page.waitForTimeout(200);
st = await page.evaluate(() => {
    const b = window.PS_SHELL.chart().items.find(i => i.kind === 'box');
    const n = document.querySelector('.ps-litem[data-item-id="' + b.id + '"] .ps-lbox');
    return { borderColor: b.borderColor, fill: b.fill,
             css: getComputedStyle(n).borderTopColor + ' / ' + getComputedStyle(n).backgroundColor };
});
ok(st.borderColor === '#aa0000' && st.fill === '#eeeeff' &&
   st.css === 'rgb(170, 0, 0) / rgb(238, 238, 255)',
   'a box takes a custom border color and fill, painted on the canvas');
svg = (await page.evaluate(() => window.PS_SHELL.exportSource('white'))).svg;
ok(/<rect[^>]*fill="#eeeeff"[^>]*stroke="#aa0000"/.test(svg), 'and the export carries both');
await page.evaluate(() => window.PS_SHELL.runCommand('insert-arrow'));
await page.waitForTimeout(300);
await page.click('#ps-larrow-custom');
await page.waitForTimeout(250);
await typeHex('#008800');
await page.mouse.click(700, 820);
await page.waitForTimeout(250);
st = await page.evaluate(() => ({ color: window.PS_SHELL.chart().items.find(i => i.kind === 'arrow').color,
                                  open: document.getElementById('ps-lcolorpop').style.display }));
ok(st.color === '#008800' && st.open === 'none',
   'an arrow takes a custom color and a press outside closes the picker');

ok(errors.length === 0, 'no page errors (' + errors.join(' | ') + ')');
await browser.close();
console.log('layout-parts-polish-check: PASS');
