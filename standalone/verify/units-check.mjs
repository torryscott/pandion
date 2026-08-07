// Torry, Jul 27 2026: "I'm looking at the width and height in the layout
// panel and I see these really large numbers. I don't know if those are
// pixels or millimetres... it might be more useful to have these in
// inches, and maybe an option to have it converted to metric as well."
//
// 816 x 1056 is Letter in CSS pixels (96 per inch). The MODEL stays in
// pixels - every stored coordinate, every saved project - and only the
// DISPLAY converts, so the preference can change at any moment without
// touching a single stored number and old projects still load.
//
// The unit lives in Preferences, beside the other app-wide defaults,
// because inches-or-metric is a property of the PERSON, not of a project.
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
await page.waitForTimeout(1500);
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.addLayout(); await s(1200);
    window.PS_SHELL.setWorkspace('layout'); await s(700);
});
await page.selectOption('#ps-lpage', 'letterp');
await page.waitForTimeout(600);
await page.click('#ps-laddtext');
await page.waitForTimeout(500);

const read = () => page.evaluate(() => ({
    w: document.getElementById('ps-lpage-w').value,
    h: document.getElementById('ps-lpage-h').value,
    inset: document.getElementById('ps-lmargin').value,
    x: document.getElementById('ps-ctx-lx').value,
    unitTags: Array.from(document.querySelectorAll('[data-unit-label]'))
        .map(n => n.textContent),
    page: [Math.round(window.PS_SHELL.chart().page.w),
           Math.round(window.PS_SHELL.chart().page.h)]
}));
async function setUnits(u) {
    await page.evaluate(() => window.PS_SHELL.runCommand('preferences'));
    await page.waitForTimeout(500);
    await page.selectOption('#ps-pref-units', u);
    await page.click('#ps-preferences-save');
    await page.waitForTimeout(700);
}

console.log('case 1: a page size reads as a page size');
const inches = await read();
ok(inches.w === '8.5' && inches.h === '11',
   `Letter portrait reads 8.5 x 11, not 816 x 1056 ` +
   `(${inches.w} x ${inches.h})`);
ok(inches.unitTags.length >= 6 &&
   inches.unitTags.every(t => t === 'in'),
   `and every length field says which unit it is in ` +
   `(${inches.unitTags.length} tags, all "${inches.unitTags[0]}")`);
ok(inches.page[0] === 816 && inches.page[1] === 1056,
   `while the model underneath is untouched pixels ` +
   `(${inches.page.join(' x ')})`);

console.log('case 2: metric is one preference away');
await setUnits('cm');
const cm = await read();
ok(cm.w === '21.6' && cm.h === '27.9',
   `the same page reads 21.6 x 27.9 cm (${cm.w} x ${cm.h})`);
ok(cm.unitTags.every(t => t === 'cm'), 'and the labels follow');
ok(cm.page[0] === 816 && cm.page[1] === 1056,
   `with the stored geometry STILL untouched: this is a display setting ` +
   `(${cm.page.join(' x ')})`);

console.log('case 3: pixels remain available for anyone who wants them');
await setUnits('px');
const px = await read();
ok(px.w === '816' && px.h === '1056',
   `pixels are still there for whoever prefers them (${px.w} x ${px.h})`);

console.log('case 4: typing a value means what it says');
await setUnits('in');
await page.evaluate(() => {
    const box = document.getElementById('ps-lpage-w');
    box.value = '6';
    box.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(700);
const typed = await read();
ok(typed.page[0] === 576,
   `typing 6 in makes the page exactly 6 inches (${typed.page[0]}px = ` +
   `${typed.page[0] / 96} in)`);
ok(typed.w === '6', `and the field agrees afterwards (${typed.w})`);
// Round trip: switch away and back with no edit, nothing may drift.
await setUnits('cm');
await setUnits('in');
const back = await read();
ok(back.page[0] === 576 && back.w === '6',
   `switching units and back changes nothing at all ` +
   `(${back.page[0]}px, field ${back.w})`);

console.log('case 5: the grid step stays in pixels, on purpose');
const grid = await page.evaluate(() => {
    const sel = document.getElementById('ps-lgrid');
    const label = sel.closest('label').textContent;
    return { value: sel.value, label: label.replace(/\s+/g, ' ').trim() };
});
ok(/px/i.test(grid.label),
   `it is a SCREEN grid, so it is labelled in px rather than converted ` +
   `to something like 0.04 in ("${grid.label.slice(0, 24)}")`);

console.log('case 6: the choice is remembered');
await setUnits('cm');
await page.reload();
await page.waitForTimeout(1700);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-continue');
    await page.waitForTimeout(1400);
}
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setWorkspace('layout'); await s(700);
});
ok((await read()).unitTags[0] === 'cm',
   'the unit survives a reload, like the other preferences');
await setUnits('in');

console.log('case 7: the layout rail carries the chart-style in/cm pair ' +
            '(Torry, Aug 7 2026)');
const seg = await page.evaluate(() => {
    const bIn = document.getElementById('ps-lunit-in');
    const bCm = document.getElementById('ps-lunit-cm');
    const h = document.getElementById('ps-lpage-h');
    return {
        there: !!bIn && !!bCm,
        rightOfH: bIn.getBoundingClientRect().left >
            h.getBoundingClientRect().right,
        inPressed: bIn.getAttribute('aria-pressed') === 'true',
        wBefore: document.getElementById('ps-lpage-w').value,
    };
});
ok(seg.there && seg.rightOfH && seg.inPressed,
   'the in/cm pair sits right of the H box with inches pressed');
await page.click('#ps-lunit-cm');
await page.waitForTimeout(500);
const flipped = await page.evaluate(() => ({
    cmPressed: document.getElementById('ps-lunit-cm')
        .getAttribute('aria-pressed') === 'true',
    tag: document.querySelector('#ps-inspector-layout [data-unit-label]')
        .textContent,
    w: document.getElementById('ps-lpage-w').value,
    stored: (() => {
        try {
            return JSON.parse(window.localStorage.getItem(
                'psstandalone.preferences.v1') || '{}').units;
        } catch (e) { return null; }
    })(),
}));
ok(flipped.cmPressed && flipped.tag === 'cm' && flipped.stored === 'cm',
   'one click flips every unit label to cm and persists the preference');
ok(Math.abs(Number(flipped.w) - Number(seg.wBefore) * 2.54) < 0.06,
   `and the width converts, not just relabels ` +
   `(${seg.wBefore}in -> ${flipped.w}cm)`);
await page.click('#ps-lunit-in');
await page.waitForTimeout(400);
ok(await page.evaluate(() =>
       document.getElementById('ps-lunit-in')
           .getAttribute('aria-pressed') === 'true' &&
       document.querySelector('#ps-inspector-layout [data-unit-label]')
           .textContent === 'in'),
   'and back again - the same person-level preference Preferences edits');
// The Size select shares the W input's left edge (the alignment note).
const align = await page.evaluate(() => {
    const sel = document.getElementById('ps-lpage');
    const w = document.getElementById('ps-lpage-w');
    const selR = sel.getBoundingClientRect();
    const rowGap = w.getBoundingClientRect().top - selR.bottom;
    return { dx: Math.abs(selR.left - w.getBoundingClientRect().left),
             rowGap };
});
ok(align.dx <= 2 && align.rowGap >= 5,
   `the Size select shares the W input's left edge with breathing room ` +
   `(dx ${align.dx.toFixed(1)}px, gap ${Math.round(align.rowGap)}px)`);

// Torry, Aug 7 2026: "the height is right after the box for width, and if
// you're not paying close attention, it might look like you're saying it's
// 26.7 cm high, but really it's 26.7 cm wide."
//
// Proximity decides what a label names. Measured, each label sat 23px from
// its own input and 6px from the neighbouring one, so the row read
// backwards. The assertion is the RATIO, not a pixel count: whatever the
// panel width or the font, a label must be nearer the box it names than
// the box beside it.
console.log('case 8: each page dimension label binds to its OWN box');
await page.click('#ps-lunit-cm');   // the widest digits, the tightest fit
await page.waitForTimeout(500);
const prox = await page.evaluate(() => {
    // Where the label's INK is, not the grid cell it sits in - a label
    // stranded at the far side of a wide cell is the whole bug.
    const ink = (input) => {
        const r = document.createRange();
        r.selectNodeContents(document.getElementById(input)
            .closest('label').querySelector('span'));
        return r.getBoundingClientRect();
    };
    const box = (id) => document.getElementById(id).getBoundingClientRect();
    const fits = (id) => {
        const e = document.getElementById(id);
        return e.scrollWidth <= e.clientWidth;
    };
    const wL = ink('ps-lpage-w'), hL = ink('ps-lpage-h');
    const wI = box('ps-lpage-w'), hI = box('ps-lpage-h');
    return {
        wOwn: wI.left - wL.right,        // W label -> the box it names
        hOwn: hI.left - hL.right,        // H label -> the box it names
        across: hL.left - wI.right,      // W's box -> H's label
        wFits: fits('ps-lpage-w'), hFits: fits('ps-lpage-h'),
        equal: Math.abs(wI.width - hI.width),
    };
});
ok(prox.hOwn > 0 && prox.across >= prox.hOwn * 2,
   `the H label sits ${(prox.across / prox.hOwn).toFixed(1)}x closer to its ` +
   `own box than to the width box (${Math.round(prox.hOwn)}px vs ` +
   `${Math.round(prox.across)}px)`);
ok(prox.wOwn > 0 && prox.wOwn <= prox.hOwn + 2,
   'and W is bound just as tightly, so the two read as one pattern');
// The separation must not be bought from the boxes: cm carries the widest
// digits, and an input too narrow to show its own value is a worse bug
// than the one being fixed.
ok(prox.wFits && prox.hFits,
   'both boxes still show their value whole in centimetres');
ok(prox.equal <= 1,
   `and the two boxes stayed the same size (${prox.equal.toFixed(1)}px apart)`);
await page.click('#ps-lunit-in');
await page.waitForTimeout(400);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('UNITS CHECK PASS');
await browser.close();
