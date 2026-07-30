// Punch list 34, 35 and 36: what the app draws for itself.
//
//   34  icons were half real 16x16 stroked SVG, half unicode dingbats. The
//       geometric shapes and the fullwidth plus fall back to a symbol font on
//       Windows and Linux at a different weight, baseline, or as an empty box,
//       which made this the one visual defect that literally looks different on
//       the machine you build on and the machines students use.
//   35  Help Me Choose was a third colour family: eight teal values that appear
//       nowhere else in the project, plus a 23px heading and 142px pills inside
//       an app whose surrounding UI runs 10.5 to 12px. A novice's first serious
//       interaction, in a skin from another product.
//   36  both places where a student picks a chart were text only. "New chart"
//       gave each MODULE one character; Help Me Choose listed its recommended
//       graph types as bare chips; the welcome previews were three CSS-styled
//       <i> elements faking a bar chart. Students choose graphs by picture.
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
function ok(cond, msg) {
    if (!cond) throw new Error(msg);
    console.log('  ok  ' + msg);
}

const here = new URL('.', import.meta.url).pathname;
const src = fs.readFileSync(path.resolve(here, '..', 'index.html'), 'utf8');

console.log('case 1: no UI glyph depends on a symbol font (34)');
// The chrome's markup, not the whole file: the base64 favicon and the engine
// are not ours, and prose may legitimately contain typographic characters.
const chrome = src.slice(src.indexOf('<header class="ps-appbar"'));
const dingbats = [...chrome.matchAll(
    /[←-⇿⌀-⏿■-◿☀-➿＀-￯⠀-⣿]/g)]
    .map(m => m[0]);
ok(dingbats.length === 0,
   `no geometric shape, arrow or fullwidth character is left in the chrome ` +
   `(${JSON.stringify(dingbats.slice(0, 6))})`);

console.log('case 2: the wizard is the app, not a third product (35)');
const hmc = src.slice(src.indexOf('.ps-hmc-card {'),
                      src.indexOf('.ps-hmc-requirement'));
const teals = [...hmc.matchAll(/#[0-9a-fA-F]{6}/g)].map(m => m[0].toLowerCase())
    .filter(h => {
        const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16),
              b = parseInt(h.slice(5, 7), 16);
        return g > r + 12 && g >= b;      // a green cast
    });
ok(teals.length === 0,
   `the teal family is gone from the wizard (${JSON.stringify(teals)})`);
// The scoped scan above is why one survivor escaped for weeks: a teal
// PRESS state for the wizard's primary lived OUTSIDE the sliced wizard
// region, in the shared active-state block (found in the button-vocabulary
// fold, Jul 28 2026). The whole stylesheet is teal-press-free now, and a
// primary may never define its own colors: the accent tokens are the only
// source (the vocabulary rule at the .ps-btn definition).
ok(src.indexOf('#0c665e') === -1,
   'no teal press state anywhere in the stylesheet, scoped scans included');
ok(!/font-size: 2[0-9]px/.test(hmc),
   'and its type sits in the app\'s range rather than at 23px');

const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(here, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 940 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(800);

console.log('case 3: the start centre shows charts (36)');
const wel = await page.evaluate(() => ({
    slots: document.querySelectorAll('[data-template-thumb]').length,
    drawn: document.querySelectorAll('[data-template-thumb] svg').length,
    fakeBars: document.querySelectorAll('.ps-template-preview i').length,
    launchIcons: document.querySelectorAll('.ps-launch-icon svg').length
}));
ok(wel.slots === 3 && wel.drawn === 3,
   `every example dataset carries the drawing of the analysis it suits ` +
   `(${wel.drawn} of ${wel.slots})`);
ok(wel.fakeBars === 0,
   `and none of them is three <i> elements faking a bar chart (${wel.fakeBars})`);
ok(wel.launchIcons >= 2,
   `the start actions carry stroked SVG rather than arrows (${wel.launchIcons})`);

await page.click('#ps-welcome-sample');
await page.waitForTimeout(1000);

console.log('case 4: so does the chart picker (36)');
// Scoped to the SWITCHER, which is what this claims to check. It counted
// every .ps-nav-icon in the document and happened to equal 3 because the
// switcher was the only place using them; once the project list adopted
// the same icons (t4-41) the count read 4 and this failed on a change that
// was correct. An assertion should measure the thing it names.
const nav = await page.evaluate(() =>
    document.querySelectorAll('.ps-workspace-switcher .ps-nav-icon svg').length);
ok(nav === 3, `the workspace switcher uses drawn icons (${nav} of 3)`);

const gal = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.runCommand('new-chart');
    await sleep(600);
    const cards = Array.from(document.querySelectorAll('.ps-analysis-card'));
    // Torry's Jul 27 screenshot: t2-36 widened the icon 42 -> 52px and the
    // card grid still reserved 42px, so the icon overflowed its column and
    // the text sat flush against it. The card must give the text a real gap.
    window.__iconGaps = cards.map(c => {
        const icon = c.querySelector('.ps-analysis-icon');
        const copy = c.querySelector('.ps-analysis-copy');
        if (!icon || !copy) return null;
        return Math.round(copy.getBoundingClientRect().left -
                          icon.getBoundingClientRect().right);
    }).filter(g => g !== null);
    return cards.map(c => ({
        mod: c.getAttribute('data-analysis-module'),
        thumb: !!c.querySelector('.ps-analysis-icon svg.ps-thumb'),
        marks: c.querySelectorAll('.ps-analysis-icon svg *').length
    }));
});
const modules = gal.filter(c => c.mod);
ok(modules.length === 7,
   `all seven analyses are offered (${modules.length})`);
ok(modules.every(c => c.thumb),
   `each shows a miniature chart rather than one character ` +
   `(${modules.filter(c => !c.thumb).map(c => c.mod).join(', ') || 'all drawn'})`);
ok(modules.every(c => c.marks >= 4),
   `and each drawing has real geometry in it ` +
   `(${JSON.stringify(modules.map(c => c.marks))})`);
// Seven DIFFERENT charts: one thumbnail reused everywhere would pass the
// checks above and teach nothing.
const shapes = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.ps-analysis-card[data-analysis-module]'))
        .map(c => (c.querySelector('.ps-analysis-icon svg') || {}).innerHTML || ''));
ok(new Set(shapes).size === 7,
   `and the seven are distinct drawings (${new Set(shapes).size} unique)`);
const gaps = await page.evaluate(() => window.__iconGaps);
ok(gaps.length >= 8 && gaps.every(g => g >= 6 && g <= 24),
   `every card gives the text a real gap from its icon, so the drawing ` +
   `never touches the words (gaps: ${JSON.stringify(gaps)})`);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

console.log('case 5: and the wizard\'s recommended types (36)');
const wiz = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.showHelpMeChoose();
    await sleep(600);
    for (let i = 0; i < 5; i++) {
        const b = document.querySelector('.ps-hmc-option');
        if (!b) break;
        b.click();
        await sleep(350);
    }
    const chips = Array.from(document.querySelectorAll('.ps-hmc-chart-types > span'));
    return { chips: chips.length,
             art: chips.filter(c => c.querySelector('.ps-hmc-chip-art svg')).length,
             labels: chips.map(c => c.textContent.trim()),
             resultThumb: !!document.querySelector('.ps-hmc-result-icon svg') };
});
ok(wiz.chips >= 2 && wiz.art === wiz.chips,
   `every recommended chart type shows its shape ` +
   `(${wiz.art} of ${wiz.chips}: ${JSON.stringify(wiz.labels)})`);
ok(wiz.resultThumb,
   'and the recommended analysis carries its own drawing');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('VISUALS CHECK PASS');
await browser.close();
