// Figure parts, slice two (Sep 2026): the Timeline item (named ticks you
// drag along the line, labels above or below, plain or arrowed ends, phase
// bands between two ticks, a rail that lists ticks and bands), and the
// three diagram templates that use it or the boxes: Timeline over a chart,
// Study design, Trial sequence. Control: on a tree without the feature the
// Add part menu has no Timeline entry and case 1 fails.
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
const center = async (selector, fx, fy) => page.evaluate(([sel, fx2, fy2]) => {
    const r = document.querySelector(sel).getBoundingClientRect();
    return { x: r.left + r.width * (fx2 == null ? 0.5 : fx2),
             y: r.top + r.height * (fy2 == null ? 0.5 : fy2) };
}, [selector, fx, fy]);

console.log('case 1: Add part offers Timeline; it adds one with four named ticks');
await page.click('#ps-laddpart');
await page.waitForTimeout(150);
ok(await page.locator('#ps-contextmenu button[data-context-action="part-timeline"]').count() === 1,
   'the Add part menu lists Timeline (no entry = control red)');
await page.click('#ps-contextmenu button[data-context-action="part-timeline"]');
await page.waitForTimeout(350);
let its = await items();
const tl = its[0];
ok(its.length === 1 && tl.kind === 'timeline' && tl.ticks.length === 4 &&
   tl.ticks[0].label === 'Start' && tl.ticks[3].pos === 1,
   'one timeline, 360 x 84, ticks Start .. End at 0 .. 1');
let rail = await page.evaluate(() => ({
    title: document.getElementById('ps-layout-selection-title').textContent,
    sec: document.getElementById('ps-layout-timeline-section').style.display,
    text: document.getElementById('ps-layout-text-section').style.display,
    rows: document.querySelectorAll('#ps-ltl-ticks .ps-ltl-row').length,
    labels: (document.querySelector('[data-ltl-labels][aria-pressed="true"]') || {}).textContent,
    ends: (document.querySelector('[data-ltl-ends][aria-pressed="true"]') || {}).textContent,
    ticksDrawn: document.querySelectorAll('.ps-litem[data-kind="timeline"] [data-role="lay-tick"]').length
}));
ok(rail.title === 'Timeline' && rail.sec === '' && rail.text === 'none' &&
   rail.rows === 4 && rail.labels === 'Above' && rail.ends === 'Plain' && rail.ticksDrawn === 4,
   'the rail shows the Timeline section with four tick rows, Above and Plain; the Text section stays away');

console.log('case 2: dragging a tick slides it along the line; one undo step');
const t1 = await center(itemNode(tl.id) + ' [data-role="lay-tick"][data-idx="1"]');
await page.mouse.move(t1.x, t1.y);
await page.mouse.down();
await page.mouse.move(t1.x + 12, t1.y, { steps: 3 });
await page.mouse.move(t1.x + 70, t1.y, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(350);
its = await items();
const p1 = its[0].ticks[1].pos;
ok(p1 > 0.45 && p1 < 0.7 && its[0].x === tl.x,
   'the second tick moved right (pos ' + p1 + ') and the timeline itself stayed put');
await page.click('#ps-lundo');
await page.waitForTimeout(350);
its = await items();
ok(Math.abs(its[0].ticks[1].pos - 1 / 3) < 0.001, 'Undo puts the tick back');

console.log('case 3: double-click on the line adds a tick and focuses its label field');
const lineHit = await center(itemNode(tl.id) + ' .ps-ltl-line-hit', 0.85, 0.5);
await page.mouse.dblclick(lineHit.x, lineHit.y);
await page.waitForTimeout(400);
its = await items();
ok(its[0].ticks.length === 5 && its[0].ticks[4].pos > 0.75 && its[0].ticks[4].pos < 0.95,
   'a fifth tick landed near where the line was double-clicked (pos ' + its[0].ticks[4].pos + ')');
ok(await page.evaluate(() => document.activeElement && document.activeElement.id === 'ps-ltl-tick-label-4'),
   'its label field in the rail has focus');
await page.keyboard.type('Test day');
await page.evaluate(() => document.activeElement.blur());
await page.waitForTimeout(300);
its = await items();
ok(its[0].ticks[4].label === 'Test day', 'typing in the rail names the tick');
ok(await page.evaluate(() => Array.from(document.querySelectorAll(
       '.ps-litem[data-kind="timeline"] [data-role="lay-tick-label"]')).some(t => t.textContent === 'Test day')),
   'the canvas draws the new label');

console.log('case 4: the rail adds a band, sets its ticks and label; the export carries it');
await page.click('#ps-ltl-add-band');
await page.waitForTimeout(300);
await page.selectOption('#ps-ltl-bands .ps-ltl-row select[data-ltl-band="b"]', '3');
await page.waitForTimeout(250);
await page.fill('#ps-ltl-bands .ps-ltl-row input[data-ltl-band="label"]', 'Dosing');
await page.evaluate(() => document.activeElement.blur());
await page.waitForTimeout(250);
await page.click('[data-ltl-ends="arrow"]');
await page.waitForTimeout(250);
await page.click('[data-ltl-labels="below"]');
await page.waitForTimeout(250);
its = await items();
ok(its[0].bands.length === 1 && its[0].bands[0].a === 0 && its[0].bands[0].b === 3 &&
   its[0].bands[0].label === 'Dosing' && its[0].ends === 'arrow' && its[0].labels === 'below',
   'band Start..End named Dosing, arrowed end, labels below');
let svg = (await page.evaluate(() => window.PS_SHELL.exportSource('white'))).svg;
ok(/<rect[^>]*fill="#e8f0fb"/.test(svg) && svg.indexOf('>Dosing<') !== -1 &&
   (svg.match(/<polygon/g) || []).length === 1 && svg.indexOf('>Test day<') !== -1 &&
   (svg.match(/<line /g) || []).length === 5,
   'the export draws the band, its label, the arrow head, five ticks and the labels');
const geomBelow = await page.evaluate(id => {
    const n = document.querySelector('.ps-litem[data-item-id="' + id + '"]');
    const lab = n.querySelector('[data-role="lay-tick-label"][data-idx="0"]');
    const line = n.querySelector('path');
    return { labelY: Number(lab.getAttribute('y')), lineY: Number(line.getAttribute('d').split(' ')[1]) };
}, tl.id);
ok(geomBelow.labelY > geomBelow.lineY, 'with Labels below the tick names sit under the line');

console.log('case 5: removing a tick drops the band that touched it and shifts the rest');
await page.click('#ps-ltl-ticks .ps-ltl-row[data-idx="0"] [data-ltl-tick="remove"]');
await page.waitForTimeout(300);
its = await items();
ok(its[0].ticks.length === 4 && its[0].bands.length === 0,
   'removing the first tick removed its band');
await page.click('#ps-lundo');
await page.waitForTimeout(350);
its = await items();
ok(its[0].ticks.length === 5 && its[0].bands.length === 1, 'Undo restores tick and band');

console.log('case 6: typed width resizes the line, .pand round trip keeps everything');
await page.fill('#ps-ctx-lw', '5');
await page.dispatchEvent('#ps-ctx-lw', 'change');
await page.waitForTimeout(250);
its = await items();
ok(Math.round(its[0].w) === 480 && its[0].h === 84, 'a typed width of 5 in changes only the width');
const text = await page.evaluate(() => window.PS_SHELL.projectText());
await page.evaluate(t => window.PS_SHELL.openProjectText(t), text);
await page.waitForTimeout(700);
const back = await page.evaluate(() => {
    const lay = window.PS_SHELL.charts().filter(c => c.type === 'layout');
    const t = lay[lay.length - 1].items.find(i => i.kind === 'timeline');
    return { ticks: t.ticks.length, bands: t.bands.length, label: t.ticks[4].label, ends: t.ends };
});
ok(back.ticks === 5 && back.bands === 1 && back.label === 'Test day' && back.ends === 'arrow',
   'the timeline comes back from the project text intact');

console.log('case 7: the three templates');
await page.evaluate(() => window.PS_SHELL.showLayoutGallery());
await page.waitForTimeout(250);
const cards = await page.evaluate(() => Array.from(document.querySelectorAll('[data-layout-template]'))
    .map(b => b.getAttribute('data-layout-template') + (b.disabled ? '!' : '')));
ok(cards.length === 12 && cards.indexOf('timeline') !== -1 && cards.indexOf('design') !== -1 &&
   cards.indexOf('trial') !== -1 && cards.indexOf('prisma') !== -1,
   'the gallery lists twelve templates including the four diagrams (' + cards.join(' ') + ')');
await page.click('[data-layout-template="timeline"]');
await page.waitForTimeout(150);
await page.click('#ps-layout-gallery-create');
await page.waitForTimeout(800);
let made = await page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    const t = c.items.find(i => i.kind === 'timeline'), ch = c.items.find(i => i.kind === 'chart');
    return { n: c.items.length, tl: !!t, chart: !!ch, sameWidth: t && ch && Math.abs(t.w - ch.w) < 1,
             below: t && ch && ch.y > t.y + t.h, band: t && t.bands.length === 1 };
});
ok(made.n === 2 && made.tl && made.chart && made.below && made.band,
   'Timeline over a chart: the timeline above the chosen chart, with a phase band');
await page.evaluate(() => window.PS_SHELL.showLayoutGallery());
await page.waitForTimeout(250);
await page.click('[data-layout-template="design"]');
await page.waitForTimeout(150);
await page.click('#ps-layout-gallery-create');
await page.waitForTimeout(800);
made = await page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    const kinds = c.items.reduce((m, i) => (m[i.kind] = (m[i.kind] || 0) + 1, m), {});
    const arrows = c.items.filter(i => i.kind === 'arrow');
    const drawn = arrows.every(a => {
        const n = document.querySelector('.ps-litem[data-item-id="' + a.id + '"]');
        return n && parseFloat(n.style.left) > 100 && n.querySelector('path');
    });
    return { kinds, attached: arrows.every(a => a.from && a.to), drawn };
});
ok(made.kinds.box === 9 && made.kinds.arrow === 6 && made.kinds.text === 6 && made.attached && made.drawn,
   'Study design: nine boxes, six attached arrows drawn between them, six labels');
await page.evaluate(() => window.PS_SHELL.showLayoutGallery());
await page.waitForTimeout(250);
await page.click('[data-layout-template="trial"]');
await page.waitForTimeout(150);
await page.click('#ps-layout-gallery-create');
await page.waitForTimeout(800);
made = await page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    const kinds = c.items.reduce((m, i) => (m[i.kind] = (m[i.kind] || 0) + 1, m), {});
    const t = c.items.find(i => i.kind === 'timeline');
    return { kinds, ticks: t ? t.ticks.map(x => x.sub) : [], ends: t && t.ends };
});
ok(made.kinds.box === 4 && made.kinds.timeline === 1 && made.ticks[0] === '500 ms' &&
   made.ticks[3] === 'until response' && made.ends === 'arrow',
   'Trial sequence: four screens over an arrowed timeline of durations');
svg = (await page.evaluate(() => window.PS_SHELL.exportSource('white'))).svg;
ok((svg.match(/<rect[^>]*rx=/g) || []).length === 4 && svg.indexOf('>until response<') !== -1,
   'its export carries the four boxes and the timeline labels');

console.log('case 8: names, the Insert menu, and a PDF');
const labels = await page.evaluate(() => Array.from(
    document.querySelectorAll('#ps-layout-options [role="option"]')).map(o => o.getAttribute('aria-label')));
ok(labels.some(l => /^Timeline, "Fixation, Cue, Target, Response"/.test(l)),
   'the accessible list names a timeline by its ticks');
const before8 = (await items()).length;
await page.evaluate(() => window.PS_SHELL.runCommand('insert-timeline'));
await page.waitForTimeout(300);
ok((await items()).length === before8 + 1, 'Insert > Timeline adds one');
const pdf = await page.evaluate(async () => {
    const blob = await window.PS_SHELL.exportBlob('pdf', 300, 'white');
    const buf = new Uint8Array(await blob.arrayBuffer());
    return { size: buf.length, head: String.fromCharCode.apply(null, buf.slice(0, 5)) };
});
ok(pdf.head === '%PDF-' && pdf.size > 1500, 'the page exports as a PDF (' + pdf.size + ' bytes)');

ok(errors.length === 0, 'no page errors (' + errors.join(' | ') + ')');
await browser.close();
console.log('layout-timeline-check: PASS');
