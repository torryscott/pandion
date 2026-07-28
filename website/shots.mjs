// Regenerate the product screenshots on the landing page.
//
//   cd website && python3 -m http.server 8791 &
//   node website/shots.mjs [port]
//
// Shoots the REAL app - the same build the "Try it now" button serves,
// at website/app/ - driven headlessly through PS_SHELL, and writes:
//
//   assets/app-chart.png    the chart workspace  (the hero product shot)
//   assets/app-data.png     the data workspace   (typing, levels, exclusions)
//   assets/app-layout.png   the figure composer  (multi-panel figures)
//
// The last two exist because the site otherwise showed only a chart, and
// a chart is the part of this app that a dozen other tools also have.
//
// Framing is 1520x950 CSS at deviceScaleFactor 2, i.e. 3040x1900 PNGs, the
// same as the shots they replace. The page renders them at ~1030px wide,
// so they stay crisp on retina displays.
//
// Run this whenever the app UI changes enough that the site would be
// advertising a UI that no longer exists.
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

const PORT = process.argv[2] || '8791';
const OUT = path.resolve(new URL('.', import.meta.url).pathname, 'assets');
const { chromium } = loadPlaywright();

const browser = await chromium.launch();
const problems = [];

async function session() {
    // A fresh context per shot: the app persists its project and its
    // "seen the coach mark" flag, so a reused context would silently
    // change what the next shot shows.
    const ctx = await browser.newContext({
        viewport: { width: 1520, height: 950 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('pageerror', e => problems.push('pageerror: ' + e.message));
    page.on('console', m => {
        if (m.type() === 'error') problems.push('console: ' + m.text()); });
    page.on('response', r => {
        if (r.status() >= 400) problems.push(r.status() + ' ' + r.url()); });
    await page.goto(`http://127.0.0.1:${PORT}/app/`, { waitUntil: 'load' });
    await page.waitForTimeout(900);
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1600);
    // The first-run coach mark is real onboarding, but it covers the chart.
    const ok = await page.$('#ps-coach-ok');
    if (ok) { await ok.click(); await page.waitForTimeout(400); }
    return { ctx, page };
}

async function shot(page, name) {
    // Park the pointer off-canvas and drop focus, or the shot keeps a
    // hover highlight and a focus ring from whatever was clicked last.
    await page.mouse.move(4, 946);
    await page.evaluate(() => {
        if (document.activeElement && document.activeElement.blur)
            document.activeElement.blur();
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, name) });
    const kb = Math.round(fs.statSync(path.join(OUT, name)).size / 1024);
    console.log(`  ${name}  ${kb} KB`);
}

// ---------------------------------------------------------------- 1. chart
{
    const { ctx, page } = await session();
    // Scatter with marginal distributions, from the built-in sample: the
    // shot the landing page has always used, in the current UI.
    await page.evaluate(() => window.PS_SHELL.setModule('xyplotbuilder'));
    await page.waitForTimeout(1400);
    // Through the chart's own "+" menu, not by poking options: the
    // overlays are computed when that menu enables them, so setting
    // xyMarginal directly stores the option and draws nothing.
    for (const kind of ['ovl_fit', 'ovl_marginal']) {
        await page.click('[aria-label="Add to chart"]');
        await page.waitForTimeout(250);
        await page.click(`button[data-kind="${kind}"]`);
        await page.waitForTimeout(1200);
        // Each item opens the new overlay's style panel; close it so the
        // shot shows the chart, not an editor mid-edit.
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
    }
    await shot(page, 'app-chart.png');
    await ctx.close();
}

// ----------------------------------------------------------------- 2. data
{
    const { ctx, page } = await session();
    await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
    await page.waitForTimeout(500);
    // Selecting a variable opens the inspector: measure type, levels, and
    // the exclusion controls. That inspector is the point of the shot.
    await page.evaluate(() => window.PS_SHELL.selectVariable('condition'));
    await shot(page, 'app-data.png');
    await ctx.close();
}

// --------------------------------------------------------------- 3. layout
{
    const { ctx, page } = await session();
    // A composed figure needs something to compose, so give the project a
    // second chart before opening the template gallery.
    await page.evaluate(() => window.PS_SHELL.addChart('xyplotbuilder'));
    await page.waitForTimeout(1200);
    // A new chart starts with no roles, and an unassigned chart renders in
    // the layout as a "needs variables" placeholder rather than a figure.
    await page.evaluate(() => window.PS_SHELL.setRoles(
        'xyplotbuilder', { xvar: 'hours', yvar: 'score', groupVar: 'condition' }));
    await page.waitForTimeout(1600);
    await page.evaluate(() => window.PS_SHELL.showLayoutGallery());
    await page.waitForTimeout(400);
    await page.click('[data-layout-template="two-columns"]');
    await page.waitForTimeout(300);
    // Slot 2 defaults to the same chart as slot 1; a figure of one chart
    // twice would not show what the composer is for.
    await page.evaluate(() => {
        const s = document.querySelectorAll(
            '#ps-layout-template-assignments select[data-layout-slot]');
        if (s.length < 2) return;
        const opts = [...s[1].options].map(o => o.value);
        const other = opts.find(v => v && v !== s[0].value);
        if (other) {
            s[1].value = other;
            s[1].dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
    await page.click('#ps-layout-gallery-create');
    await page.waitForTimeout(2200);
    await shot(page, 'app-layout.png');
    await ctx.close();
}

await browser.close();
if (problems.length) {
    console.error('\nPROBLEMS (the shots may not show a healthy app):');
    console.error([...new Set(problems)].slice(0, 12).join('\n'));
    process.exit(1);
}
console.log('\nall three shots clean: no console errors, no failed requests');
