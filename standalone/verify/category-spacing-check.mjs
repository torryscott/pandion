// Category spacing on line and dot charts (Sep 16 2026, Torry: "I don't
// see the category gaps slider in the dot option"; option 1 of the
// proposal, chosen by him).
//
// Category columns on a line or dot chart are evenly spaced across the
// plot width by construction, so Gap between categories (which shrinks
// the virtual bar inside each slot) cannot move them. lineCategorySpacing
// (1 = fill the width, down to 0.4) pads both ends of the category axis
// so the columns move closer together and stay centred; ticks, labels
// and markers follow because every category centre reads the same
// layout. Home: the Gap tab's Category spacing slider; the between-
// category seam on the chart edits the same value (it used to be dropped
// on line and dot). Bars keep Gap between categories.
//
// Cases (chromium):
//   1. a grouped dot chart at spacing 1: the label pitch and centre are
//      recorded; a commit of 0.6 through the shell brings the pitch to
//      0.6x within 2px, keeps the centre, and the markers ride along.
//   2. the Gap tab's slider is there at 60%; a slider input to 0.8
//      redraws to 0.8x immediately (before any echo).
//   3. the seam: hovering between two category columns arms a seam whose
//      drag label reads Category spacing; a drag to the right raises the
//      value and commits it (chartSpec).
//   4. a bar chart ignores the option (pitch unchanged at 0.6) and its
//      between seam still edits Gap between categories.
// CONTROL (main's engine): case 1's pitch does not change (red).
//
// Usage: node standalone/verify/category-spacing-check.mjs

import { createRequire } from 'node:module';
import path from 'node:path';

function loadPlaywright() {
    const bases = [];
    if (process.env.GB2_NODE_BASE) bases.push(process.env.GB2_NODE_BASE);
    bases.push(process.cwd(), new URL('.', import.meta.url).pathname, '/private/tmp', '/tmp');
    for (const b of bases) {
        try { return createRequire(path.join(b, 'x.js'))('playwright'); }
        catch { /* try the next shared dependency location */ }
    }
    console.error('playwright not found; cd /tmp && npm i playwright');
    process.exit(2);
}
const pw = loadPlaywright();
const PAGE = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
let failures = 0;
function ok(cond, label) { if (cond) console.log('  ok  ' + label); else { console.log('  FAIL ' + label); failures++; } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1470, height: 800 } });
const errors = []; page.on('pageerror', e => errors.push(String(e)));
await page.addInitScript(() => { try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); localStorage.setItem('psstandalone.preferences.v1', JSON.stringify({ panelDock: 'below' })); } catch (e) {} });
await page.goto(PAGE); await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible().catch(() => false)) { await page.click('#ps-welcome-sample'); await page.waitForTimeout(1800); }
try { const got = page.locator('button', { hasText: 'Got it' }).first(); if (await got.isVisible()) { await got.click(); await page.waitForTimeout(300); } } catch {}

// The category layout as the reader sees it: label centres, their pitch
// and mean, and the marker centres per category.
const layout = () => page.evaluate(() => {
    const svg = document.querySelector('#psroot svg[data-role="gb2-chart-svg"]');
    const labels = Array.from(svg.querySelectorAll('text[data-role="x-cat-label"]')).map(t => { const r = t.getBoundingClientRect(); return { cat: t.getAttribute('data-bar-cat') || t.textContent, x: r.left + r.width / 2 }; }).sort((a, b) => a.x - b.x);
    const marks = Array.from(svg.querySelectorAll('[data-role="line-marker"]')).map(m => { const r = m.getBoundingClientRect(); return r.left + r.width / 2; });
    const xs = labels.map(l => l.x);
    const pitch = xs.length > 1 ? (xs[xs.length - 1] - xs[0]) / (xs.length - 1) : 0;
    const centre = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
    const spec = (() => { try { return JSON.parse(PS_SHELL.optionStore().chartSpec || '{}'); } catch (e) { return {}; } })();
    return { n: xs.length, pitch, centre, marks: marks.length ? { min: Math.min(...marks), max: Math.max(...marks) } : null, spacing: spec.lineCategorySpacing };
});
async function chart(gt) {
    await page.evaluate(async g => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        PS_SHELL.setWorkspace('chart'); PS_SHELL.setModule('plotbuilder');
        PS_SHELL.setRoles('plotbuilder', { xvar: 'condition', yvar: 'score', groupVar: 'site' });
        await s(1200);
        window.setOption('graphType', g);
        await s(2200);
    }, gt);
}

// ---- 1. the option moves the columns together, centred ----
await chart('dot');
const L0 = await layout();
ok(L0.n >= 3 && L0.pitch > 60, '1: a dot chart with ' + L0.n + ' categories at pitch ' + L0.pitch.toFixed(1) + 'px');
await page.evaluate(async () => { const s = ms => new Promise(r => setTimeout(r, ms)); window.setOption('lineCategorySpacing', 0.6); await s(2200); });
const L1 = await layout();
ok(near(L1.pitch, 0.6 * L0.pitch, 2), '1: spacing 0.6 brings the pitch to 0.6x (' + L0.pitch.toFixed(1) + ' -> ' + L1.pitch.toFixed(1) + ', expected ' + (0.6 * L0.pitch).toFixed(1) + ')');
ok(near(L1.centre, L0.centre, 2), '1: the block stays centred (' + L0.centre.toFixed(1) + ' -> ' + L1.centre.toFixed(1) + ')');
ok(L1.marks && L0.marks && (L1.marks.max - L1.marks.min) < (L0.marks.max - L0.marks.min) - 40, '1: the markers rode along (span ' + (L0.marks ? (L0.marks.max - L0.marks.min).toFixed(0) : '?') + ' -> ' + (L1.marks ? (L1.marks.max - L1.marks.min).toFixed(0) : '?') + ')');

// ---- 2. the Gap tab slider ----
const mk = await page.evaluate(() => { const m = document.querySelector('#psroot svg [data-role="line-marker"]'); const r = m.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
// The panel lands on its sticky tab; ask for Gap before the click.
await page.evaluate(() => { window.__gb2_bsActiveTab = 'gap'; window.__gb2_lsActiveTab = 'gap'; });
await page.mouse.click(mk.x, mk.y); await page.waitForTimeout(900);
await page.evaluate(() => { const t = document.querySelector('[data-gb2-inspector] [data-bs-tab="gap"], [data-gb2-inspector] [data-ls-tab="gap"], [data-gb2-inspector] [data-xytab="gap"]'); if (t) t.click(); });
await page.waitForTimeout(600);
const slider = await page.evaluate(() => { const i = document.querySelector('[data-gb2-inspector] input[data-field="cat-spacing"]'); return i ? { value: i.value, visible: !!i.offsetParent, min: i.min, max: i.max } : null; });
ok(slider && slider.visible && near(Number(slider.value), 0.6, 0.001), '2: the Gap tab shows Category spacing at 60% (' + JSON.stringify(slider) + ')');
let L2 = L1;
if (slider) {
    await page.evaluate(() => { const i = document.querySelector('[data-gb2-inspector] input[data-field="cat-spacing"]'); i.value = '0.8'; i.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(150);
    L2 = await layout();
    ok(near(L2.pitch, 0.8 * L0.pitch, 2), '2: a slider input to 80% redraws at once (' + L2.pitch.toFixed(1) + ' for ' + (0.8 * L0.pitch).toFixed(1) + ')');
    await page.evaluate(() => { const i = document.querySelector('[data-gb2-inspector] input[data-field="cat-spacing"]'); i.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(2200);
    const L2b = await layout();
    ok(near(L2b.spacing, 0.8, 0.001), '2: the release committed 0.8 to the chart spec (' + L2b.spacing + ')');
}

// ---- 3. the seam between two columns ----
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
const seamPt = await page.evaluate(() => {
    const svg = document.querySelector('#psroot svg[data-role="gb2-chart-svg"]');
    const labels = Array.from(svg.querySelectorAll('text[data-role="x-cat-label"]')).map(t => t.getBoundingClientRect()).sort((a, b) => a.left - b.left);
    const a = labels[0], b = labels[1];
    const marks = Array.from(svg.querySelectorAll('[data-role="line-marker"]')).map(m => m.getBoundingClientRect());
    const lowest = Math.max(...marks.map(m => m.bottom));
    // Below the lowest marker (a marker or line hit path would steal the hover), above the axis.
    return { x: (a.left + a.width / 2 + b.left + b.width / 2) / 2, y: Math.min(lowest + 18, a.top - 12) };
});
await page.mouse.move(seamPt.x, seamPt.y); await page.waitForTimeout(120);
await page.mouse.move(seamPt.x + 1, seamPt.y); await page.waitForTimeout(600);
const armed = await page.evaluate(() => !!document.querySelector('#psroot svg [data-role="gap-seam-chrome"]'));
ok(armed, '3: hovering between two columns arms a seam');
await page.mouse.down();
await page.mouse.move(seamPt.x + 20, seamPt.y, { steps: 5 }); await page.waitForTimeout(80);
const lbl = await page.evaluate(() => { const g = document.querySelector('#psroot svg [data-role="gap-seam-chrome"]'); return g ? g.textContent : ''; });
ok(/Category spacing/.test(lbl), '3: the drag label reads Category spacing (' + lbl.trim() + ')');
await page.mouse.move(seamPt.x + 40, seamPt.y, { steps: 5 });
await page.mouse.up(); await page.waitForTimeout(2200);
const L3 = await layout();
ok(L3.pitch > L2.pitch + 4, '3: the drag to the right widened the spacing (' + L2.pitch.toFixed(1) + ' -> ' + L3.pitch.toFixed(1) + ')');
ok(typeof L3.spacing === 'number' && L3.spacing > 0.8 && L3.spacing <= 1, '3: and committed the value (' + L3.spacing + ')');

// ---- 4. bars are untouched ----
await chart('bar');
const B0 = await layout();
await page.evaluate(async () => { const s = ms => new Promise(r => setTimeout(r, ms)); window.setOption('lineCategorySpacing', 0.6); await s(2200); });
const B1 = await layout();
ok(near(B1.pitch, B0.pitch, 0.5), '4: a bar chart ignores the option (' + B0.pitch.toFixed(1) + ' -> ' + B1.pitch.toFixed(1) + ')');
ok(errors.length === 0, 'no page errors' + (errors.length ? ' (' + errors[0] + ')' : ''));
await browser.close();
console.log(failures ? 'category-spacing: FAIL (' + failures + ')' : 'category-spacing: PASS');
process.exit(failures ? 1 : 0);
