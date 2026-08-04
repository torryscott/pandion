// Real-browser check for LAYOUT IMAGE ITEMS + EXPORT CAPTIONS (Tier 2).
// Images: Add image places a real PNG at its aspect ratio, drags and
// proportionally resizes like chart panels, embeds in the exported
// layout SVG, rides .pand, and - per Torry's ruling - ORIGINALS ARE
// HONORED: the large-image path discloses and offers an explicit
// choice instead of silently downscaling. Captions: a per-chart
// caption typed in the Export dialog persists, renders as a wrapped
// text block UNDER the exported figure (SVG grows), never shows in
// the editing view, and stays out of caption-less exports.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

function loadPlaywright() {
    for (const base of [process.cwd(), new URL('.', import.meta.url).pathname,
                        '/private/tmp', '/tmp']) {
        try { return createRequire(path.join(base, 'x.js'))('playwright'); }
        catch { /* try the next shared dependency location */ }
    }
    console.error('playwright not found');
    process.exit(2);
}
const { chromium } = loadPlaywright();
const PAGE = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const FIXTURE = path.resolve(new URL('.', import.meta.url).pathname,
    'fixtures', 'probe-image.png');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(PAGE);
await page.waitForTimeout(600);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(900);

// ---- a layout with one chart, then Add image
await page.evaluate(() => window.PS_SHELL.createLayoutFromTemplate('single'));
await page.waitForTimeout(1000);
await page.setInputFiles('#ps-laddimage-file', FIXTURE);
await page.waitForTimeout(600);
const placed = await page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    const img = c.items.find(i => i.kind === 'image');
    const node = document.querySelector(
        '#ps-lcanvas .ps-litem[data-kind="image"] img');
    return img ? { w: img.w, h: img.h, natW: img.natW, natH: img.natH,
                   srcHead: img.src.slice(0, 22),
                   rendered: !!node && node.complete } : null;
});
if (!placed || placed.natW !== 8 || placed.natH !== 6 ||
    Math.abs(placed.w / placed.h - 8 / 6) > 0.05 ||
    placed.srcHead !== 'data:image/png;base64,' || !placed.rendered)
    throw new Error('image placement wrong: ' + JSON.stringify(placed));
console.log('  ok  Add image places the file at its own aspect ratio');

// ---- proportional corner resize (the chart-panel machinery)
const imgId = await page.evaluate(() =>
    window.PS_SHELL.chart().items.find(i => i.kind === 'image').id);
await page.evaluate(() => document.getElementById('ps-layout')
    .scrollIntoView({ block: 'start' }));
await page.waitForTimeout(200);
const r0 = await page.evaluate((id) => {
    const n = document.querySelector(
        '#ps-lcanvas .ps-litem[data-item-id="' + id + '"]');
    const r = n.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
}, imgId);
await page.mouse.click(r0.x + 10, r0.y + 10);
await page.waitForTimeout(250);
const hnd = await page.evaluate((id) => {
    const h = document.querySelector(
        '#ps-lcanvas .ps-litem[data-item-id="' + id + '"] [data-role="lay-resize"]');
    if (!h) return null;
    const r = h.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, imgId);
if (!hnd) throw new Error('image item has no resize handle');
await page.mouse.move(hnd.x, hnd.y);
await page.mouse.down();
await page.mouse.move(hnd.x + 80, hnd.y + 10, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(300);
const resized = await page.evaluate((id) => {
    const it = window.PS_SHELL.chart().items.find(i => i.id === id);
    return { ratio: it.w / it.h };
}, imgId);
if (Math.abs(resized.ratio - 8 / 6) > 0.06)
    throw new Error('image resize lost proportions: ' + JSON.stringify(resized));
console.log('  ok  images resize proportionally with the shared corner handle');

// ---- exported layout SVG embeds the image
const laySvg = await page.evaluate(() => window.PS_SHELL.exportSource('white'));
if (!/<image[^>]+data:image\/png;base64,/.test(laySvg.svg))
    throw new Error('layout export does not embed the image');
console.log('  ok  the exported layout SVG embeds the image data');

// ---- large-image path: disclosure + explicit choice (threshold
// lowered for the probe; the ruling is the BEHAVIOR, not the number)
await page.evaluate(() => { window.PS_IMG_WARN_BYTES = 40; });
await page.setInputFiles('#ps-laddimage-file', FIXTURE);
await page.waitForTimeout(500);
const disclosure = await page.evaluate(() => ({
    open: document.getElementById('ps-imgsize-dialog').style.display === 'flex',
    copy: document.getElementById('ps-imgsize-copy').textContent
}));
if (!disclosure.open || !/Keeping the original is fine/.test(disclosure.copy) ||
    !/local autosave/.test(disclosure.copy))
    throw new Error('large-image disclosure wrong: ' +
                    JSON.stringify(disclosure));
await page.click('#ps-imgsize-keep');
await page.waitForTimeout(400);
const kept = await page.evaluate(() => ({
    images: window.PS_SHELL.chart().items.filter(i => i.kind === 'image').length,
    toast: (document.getElementById('ps-toast') || {}).textContent
}));
if (kept.images !== 2 || !/original kept/.test(kept.toast))
    throw new Error('Keep-original did not honor the file: ' +
                    JSON.stringify(kept));
await page.evaluate(() => { window.PS_IMG_WARN_BYTES = null; });
console.log('  ok  large images disclose and the original is honored on request');

// ---- images ride .pand
const fileText = await page.evaluate(() => window.PS_SHELL.projectFileText());
const tmp = '/tmp/ps-layout-image.pand';
fs.writeFileSync(tmp, fileText);
const ctx2 = await browser.newContext();
const page2 = await ctx2.newPage();
await page2.goto(PAGE);
await page2.waitForTimeout(500);
await page2.click('#ps-welcome-new');
await page2.waitForTimeout(250);
await page2.setInputFiles('#ps-file', tmp);
await page2.waitForTimeout(1200);
const pand = await page2.evaluate(() => {
    const lay = window.PS_SHELL.charts().find(c => c.type === 'layout');
    return { images: lay.items.filter(i => i.kind === 'image').length };
});
if (pand.images !== 2)
    throw new Error('.pand lost the images: ' + JSON.stringify(pand));
console.log('  ok  image items ride .pand project files');
await ctx2.close();

// ---- CAPTIONS: type in the Export dialog, export grows downward
await page.evaluate(() => {
    window.PS_SHELL.setWorkspace('chart');
});
await page.waitForTimeout(700);
const plainSize = await page.evaluate(() =>
    window.PS_SHELL.exportSource('white'));
await page.click('#ps-export');
await page.waitForTimeout(500);
const capVisible = await page.evaluate(() => ({
    shown: document.getElementById('ps-export-caption-field')
        .style.display !== 'none'
}));
if (!capVisible.shown) throw new Error('caption field missing for charts');
await page.fill('#ps-export-caption',
    // Long enough to wrap at ANY plausible figure width. The original text
    // wrapped only because the chart was a fixed 576px; punch list 27's
    // fit-to-pane made the figure wider, the same words fitted on one line,
    // and the assertion that wrapping works stopped testing anything.
    'Figure 1. Mean score by condition, with error bars showing one standard ' +
    'error around each mean, computed from the visible data after excluded ' +
    'cells and rows failing the active filters have been removed from every ' +
    'cell, so the interval describes exactly what the figure draws.');
await page.waitForTimeout(300);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const withCap = await page.evaluate(async () => {
    const src = await window.PS_SHELL.exportSource('white');
    return { h: src.h, w: src.w,
             hasCaption: /data-role="export-caption"/.test(src.svg),
             tspans: (src.svg.match(/<tspan/g) || []).length,
             text: /Figure 1\. Mean score by condition/.test(src.svg),
             editingView: !!document.querySelector(
                 '#psroot [data-role="export-caption"]') };
});
if (!withCap.hasCaption || !withCap.text || withCap.h <= plainSize.h ||
    withCap.tspans < 2 || withCap.editingView)
    throw new Error('caption export wrong: ' + JSON.stringify(withCap) +
                    ' vs plain h ' + plainSize.h);
console.log('  ok  the caption typesets under the exported figure (wrapped, ' +
            (withCap.h - plainSize.h) + 'px added) and never shows while editing');

// ---- caption persists; clearing it restores the plain export
await page.reload();
await page.waitForTimeout(900);
const persisted = await page.evaluate(async () => ({
    caption: (window.PS_SHELL.chart() || {}).caption || '',
    h: (await window.PS_SHELL.exportSource('white')).h
}));
if (!/Figure 1\./.test(persisted.caption) || persisted.h <= plainSize.h)
    throw new Error('caption lost on reload: ' + JSON.stringify(persisted));
await page.click('#ps-export');
await page.waitForTimeout(400);
await page.fill('#ps-export-caption', '');
await page.waitForTimeout(250);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
if ((await page.evaluate(async () =>
    (await window.PS_SHELL.exportSource('white')).h)) !== plainSize.h)
    throw new Error('clearing the caption did not restore the plain export');
console.log('  ok  captions persist across reload and clear cleanly');

if (errors.length) throw new Error(errors[0]);
await browser.close();
console.log('LAYOUT IMAGE CHECK: ALL GREEN');
