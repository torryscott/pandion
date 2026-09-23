// The box panel's Outliers tab and the docked colour picker (Sep 23 2026,
// Torry: "Outliers on the raincloud color tab don't have the custom hsv
// picker"). A raincloud, and a box plot with its points shown, ring
// outliers among the points, so its Outliers tab carries a ring-colour
// strip instead of the plain box plot's outlier-colour strip; the engine's
// strip-to-swatch dock map had no entry for it and hid the picker. The tab
// switch also fell back to the plain strip's id, so arriving on Outliers
// left the previous tab's picker up. What this pins:
//   1. raincloud, Outliers > Color: the picker docks and shows the ring
//      colour; a hex typed into it recolours the ring swatch, not the
//      whiskers';
//   2. raincloud, Whiskers > Color then the Outliers tab: the pane shows
//      its Show strip and the whiskers' picker is gone;
//   3. raincloud, Outliers > Color, Whiskers, back to Outliers: the picker
//      comes back on the ring colour;
//   4. raincloud, Outliers > Size: no colour on that strip, no picker;
//   5. plain box plot without points, Outliers > Color: the picker docks
//      to the outlier swatch (the entry that already worked).
// CONTROL (main at e76fd7f): cases 1, 2 and 3 fail.
//
// Usage: node standalone/verify/outlier-picker-check.mjs

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
const { chromium } = loadPlaywright();
const HERE = new URL('.', import.meta.url).pathname;
const PAGE = 'file://' + (process.env.PS_PAGE ? path.resolve(process.env.PS_PAGE) : path.resolve(HERE, '..', 'index.html'));
let failures = 0;
function ok(cond, label) { if (cond) console.log('  ok  ' + label); else { console.log('  FAIL ' + label); failures++; } }

const browser = await chromium.launch();
async function boot(graphType, points) {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
    const page = await ctx.newPage();
    page.on('filechooser', () => {}); // Playwright dismisses an unhandled file chooser and Chromium reports that as cancel, which the app honours; a listener keeps the chooser open
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); sessionStorage.clear(); } catch (e) {} });
    await page.goto(PAGE); await page.waitForTimeout(1200);
    await page.click('[data-example="wellbeing"]'); await page.waitForTimeout(1500);
    await page.evaluate(g => window.setOption('graphType', g), graphType); await page.waitForTimeout(2000);
    if (points === false) { await page.evaluate(() => window.setOption('showDataPoints', false)); await page.waitForTimeout(2000); }
    // A spot on a box where the box itself is on top: rain dots sit over parts of it.
    const spot = await page.evaluate(() => {
        for (const b of document.querySelectorAll('[data-role="box-fill"]')) {
            const r = b.getBoundingClientRect();
            for (let fx = 0.05; fx <= 0.95; fx += 0.05) for (let fy = 0.2; fy <= 0.8; fy += 0.3) {
                const x = r.x + r.width * fx, y = r.y + r.height * fy;
                const t = document.elementFromPoint(x, y);
                const role = t && t.getAttribute && t.getAttribute('data-role');
                if (role === 'box-fill' || role === 'box-border') return { x, y };
            }
        }
        return null;
    });
    if (!spot) throw new Error('setup: no clickable box on the ' + graphType + ' chart');
    await page.mouse.move(5, 5); await page.mouse.click(spot.x, spot.y); await page.waitForTimeout(900);
    const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('[data-bs-tab]')).map(t => t.getAttribute('data-bs-tab')));
    if (!tabs.includes('outliers')) throw new Error('setup: the box panel did not open (' + tabs.join(',') + ')');
    return { ctx, page, errors };
}
const picker = page => page.evaluate(() => {
    const p = document.querySelector('[data-role="color-picker"]');
    const shown = !!p && getComputedStyle(p).display !== 'none' && p.getClientRects().length > 0;
    const hex = p && p.querySelector('[data-role="hex"]');
    const vis = Array.from(document.querySelectorAll('[data-bs-tab-pane="outliers"] [data-bs-strip]'))
        .filter(s => s.style.display !== 'none').map(s => s.getAttribute('data-bs-strip'));
    return { shown, hex: hex ? String(hex.value || '').toLowerCase() : '', outliersStrip: vis.join(',') };
});
const chipBg = (page, field) => page.evaluate(f => { const b = document.querySelector('button[data-field="' + f + '"]'); return b ? getComputedStyle(b).backgroundColor : ''; }, field);
// Returns false when there is no picker to type into (the pre-fix build),
// so the assertions after it fail cleanly instead of the probe crashing.
async function typeHex(page, v) {
    const typed = await page.evaluate(val => { const h = document.querySelector('[data-role="color-picker"] [data-role="hex"]'); if (!h) return false; h.value = val; h.dispatchEvent(new Event('input', { bubbles: true })); return true; }, v);
    await page.waitForTimeout(500);
    return typed;
}

// ---- 1. raincloud, Outliers > Color
{
    const { ctx, page, errors } = await boot('raincloud');
    const strips = await page.evaluate(() => Array.from(document.querySelectorAll('[data-bs-tab-pane="outliers"] [data-bs-btn]')).map(b => b.getAttribute('data-bs-btn')));
    ok(strips.includes('outlier-ring-color'), '1: setup: a raincloud carries the ring-colour strip (' + strips.join(',') + ')');
    await page.click('[data-bs-tab="outliers"]'); await page.waitForTimeout(400);
    await page.click('[data-bs-btn="outlier-ring-color"]'); await page.waitForTimeout(700);
    let s = await picker(page);
    ok(s.shown && s.hex === '#d62728', '1: the picker docks on the Color strip and shows the ring colour (' + JSON.stringify(s) + ')');
    const whiskBefore = await chipBg(page, 'bx-w-color');
    await typeHex(page, '#1f7a4d');
    const ringAfter = await chipBg(page, 'bx-o-ring-color'), whiskAfter = await chipBg(page, 'bx-w-color');
    ok(ringAfter === 'rgb(31, 122, 77)' && whiskAfter === whiskBefore, '1: a hex typed into it recolours the ring swatch and leaves the whiskers alone (' + ringAfter + ')');
    ok(errors.length === 0, '1: no page errors' + (errors.length ? ' (' + errors[0] + ')' : ''));
    await ctx.close();
}
// ---- 2. raincloud, Whiskers > Color, then the Outliers tab
{
    const { ctx, page } = await boot('raincloud');
    await page.click('[data-bs-tab="whiskers"]'); await page.waitForTimeout(400);
    await page.click('[data-bs-btn="whisker-color"]'); await page.waitForTimeout(700);
    let s = await picker(page);
    ok(s.shown, '2: setup: the whiskers picker is up (' + s.hex + ')');
    await page.click('[data-bs-tab="outliers"]'); await page.waitForTimeout(800);
    s = await picker(page);
    ok(s.outliersStrip === 'outlier-show' && !s.shown, '2: arriving on Outliers shows its Show strip and the whiskers picker is gone (' + JSON.stringify(s) + ')');
    await ctx.close();
}
// ---- 3 and 4. raincloud, the Color strip remembered across tabs; Size hides it
{
    const { ctx, page } = await boot('raincloud');
    await page.click('[data-bs-tab="outliers"]'); await page.waitForTimeout(400);
    await page.click('[data-bs-btn="outlier-ring-color"]'); await page.waitForTimeout(700);
    await page.click('[data-bs-tab="whiskers"]'); await page.waitForTimeout(600);
    await page.click('[data-bs-tab="outliers"]'); await page.waitForTimeout(800);
    let s = await picker(page);
    ok(s.outliersStrip === 'outlier-ring-color' && s.shown && s.hex === '#d62728', '3: back on Outliers, the remembered Color strip brings the ring picker back (' + JSON.stringify(s) + ')');
    await page.click('[data-bs-btn="outlier-ring-size"]'); await page.waitForTimeout(700);
    s = await picker(page);
    ok(s.outliersStrip === 'outlier-ring-size' && !s.shown, '4: the Size strip has no colour, so no picker (' + JSON.stringify(s) + ')');
    await ctx.close();
}
// ---- 5. plain box plot without points
{
    const { ctx, page, errors } = await boot('box', false);
    const strips = await page.evaluate(() => Array.from(document.querySelectorAll('[data-bs-tab-pane="outliers"] [data-bs-btn]')).map(b => b.getAttribute('data-bs-btn')));
    ok(strips.includes('outlier-color') && !strips.includes('outlier-ring-color'), '5: setup: a box plot without points carries the plain outlier strip (' + strips.join(',') + ')');
    await page.click('[data-bs-tab="outliers"]'); await page.waitForTimeout(400);
    await page.click('[data-bs-btn="outlier-color"]'); await page.waitForTimeout(700);
    const s = await picker(page);
    ok(s.shown, '5: the picker docks on its Color strip (' + JSON.stringify(s) + ')');
    await typeHex(page, '#1f7a4d');
    ok(await chipBg(page, 'bx-o-color') === 'rgb(31, 122, 77)', '5: and it drives the outlier swatch');
    ok(errors.length === 0, '5: no page errors' + (errors.length ? ' (' + errors[0] + ')' : ''));
    await ctx.close();
}
await browser.close();
console.log(failures ? 'outlier-picker: FAIL (' + failures + ')' : 'outlier-picker: PASS');
process.exit(failures ? 1 : 0);
