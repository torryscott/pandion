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
//   assets/app-notebook.png the Notebook         (kept moments, one per page)
//   assets/app-layout.png   the Layouts workspace (multi-panel figures)
//
// The other three exist because the site otherwise showed only a chart, and
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
    // A grouped bar with the raw observations on top. This replaced a
    // scatter with marginal histograms: the marginals read as clutter at
    // the size the landing page renders this, and a single-colour scatter
    // showed neither grouping nor the error bars and points that are the
    // reason to reach for this app over a spreadsheet.
    await page.evaluate(() => window.PS_SHELL.setRoles(
        'plotbuilder', { xvar: 'condition', yvar: 'score', groupVar: 'site' }));
    await page.waitForTimeout(1800);
    // Through the chart's own "+" menu, not by poking options: the overlay
    // is computed when that menu enables it, so setting showDataPoints
    // directly stores the option and draws nothing.
    await page.click('[aria-label="Add to chart"]');
    await page.waitForTimeout(250);
    await page.click('button[data-kind="showDataPoints"]');
    await page.waitForTimeout(1400);
    // The item opens the new overlay's style panel; close it so the shot
    // shows the chart, not an editor mid-edit.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Styling, all of it reachable from the app's own panels.
    await page.evaluate(() => {
        const set = window.__gb2_setOption;
        // Capitalised axis titles and legend heading: what a reader gets by
        // clicking each title and typing. The variable chips in the setup
        // panel keep the real column names, which are lower case.
        set('xTitleOverride', true);     set('xTitle', 'Condition');
        set('yTitleOverride', true);     set('yTitle', 'Score');
        set('groupTitleOverride', true); set('groupTitle', 'Site');
        // The automatic range tops out at 120, which leaves the tallest bar
        // sitting two thirds up the panel. 100 puts the top of the range just
        // above the data, and a step of 10 keeps the gridline spacing honest
        // at that shorter range. The tallest observation is 91, so nothing is
        // clipped: Check graph would raise "Axis range shows all data" if it
        // were, and the shot asserts that check still passes.
        set('yMaxOverride', true);       set('yMax', 100);
        // Each range field is gated by its OWN override flag; yInterval on
        // its own is stored and ignored, which is why the ticks stayed at 20.
        set('yIntervalOverride', true);  set('yInterval', 10);
        // Blue and red, straight from the shipped default palette: slot 0
        // and slot 2, no hand-tuning. The shot used to darken the red by
        // hand because the OLD palette's blue and red merged in black and
        // white (0.056 apart, under the app's own 0.08 line), which Check
        // graph flagged. The rainbow default fixed that at the source: this
        // pair measures 0.136 in grayscale and clears every vision check.
        //
        // Slot 2 rather than the palette's own second colour because the
        // default two-group pair, blue and orange, is the one that still
        // fails grayscale (0.065). So the red is not a preference dressed
        // up as a standard; it is the pair that raises nothing.
        set('groupColors', [{ original: 'East', color: '#417499' },
                            { original: 'West', color: '#86262c' }]);
        // The observations take a DARKER SHADE OF THEIR OWN BAR rather than
        // one flat colour, so each dot still reads as belonging to its
        // group. Darkened in HLS, holding hue and saturation and dropping
        // lightness: scaling RGB instead desaturates, and a "darker red"
        // comes out brown. Per-group, so this is the Data points panel's
        // "This group" scope, not anything bespoke.
        //
        // Literals, not a formula. One factor no longer serves both: the
        // new red is already dark, so the 0.70 that suits the blue leaves
        // its dots only 0.095 from their own bar. 0.62 on the red gives
        // 0.123, which matches the blue's 0.121. Pinning the hex also keeps
        // the blue off a rounding boundary it sits one ULP away from.
        set('pointColorMatch', false);
        set('pointSize', 5.5);
        set('pointOpacity', 1);
        set('groupDataPoints', [{ original: 'East', color: '#2d516b' },
                                 { original: 'West', color: '#53181b' }]);
    });
    await page.waitForTimeout(2600);

    // The comment above promises Check graph passes. Promise kept here
    // rather than in prose: the hero is the one image where the app is
    // being held up as an example, so it must not be quietly showing a
    // chart its own checks would complain about.
    // The accessor hangs off the chart HOST element, not off window.
    const lint = await page.evaluate(() => {
        const host = document.querySelector('.graphbuilder2-host');
        if (!host || typeof host.__gb2_graphLint !== 'function') return 'MISSING';
        const f = host.__gb2_graphLint();
        if (!f) return 'MISSING';
        const list = f.findings || f;
        return (list || []).map(x => x.id || x.title || 'unnamed').join(', ');
    });
    if (lint === 'MISSING')
        problems.push('hero: __gb2_graphLint is gone, the check went unverified');
    else if (lint)
        problems.push('hero: Check graph raised ' + lint);
    else console.log('  hero: Check graph raised nothing');

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

// ------------------------------------------------------------- 3. notebook
{
    const { ctx, page } = await session();
    // A kept page has to be made, not staged: Keep records what is on the
    // chart at that moment, so the chart must have finished drawing first.
    await page.waitForFunction(() => {
        const svg = document.querySelector('.graphbuilder2-host svg');
        return !!svg && svg.querySelectorAll('*').length > 30;
    }, null, { timeout: 20000 });
    await page.waitForTimeout(600);
    // The Statistics button lives in the chart's own toolbar, which reads
    // dispatched clicks rather than the page-level one.
    await page.evaluate(() => {
        const b = document.querySelector(
            '.graphbuilder2-host button[aria-label="Statistics"]');
        b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(1200);
    // Pinning a comparison is what puts Keep on the focus card, and the
    // rings it draws around the two bars ride into the kept page.
    await page.evaluate(() => {
        document.querySelector('[data-st-pane="pairs"] tr[data-link]').click();
    });
    await page.waitForTimeout(900);
    await page.click('[data-ps-moment-keep]');
    await page.waitForFunction(() => (window.PS_SHELL.project.pinboards || [])
        .some(b => b.pins.length), null, { timeout: 15000 });
    // Keep confirms with a toast offering to open the Notebook. Wait it out
    // rather than photograph the app mid-announcement.
    await page.waitForFunction(
        () => !document.querySelectorAll('#ps-toast .ps-toast-item').length,
        null, { timeout: 15000 });
    // The workspace id is still "pinboard" although the UI says Notebook.
    await page.evaluate(() => window.PS_SHELL.setWorkspace('pinboard'));
    await page.waitForSelector('.ps-pinpage', { timeout: 10000 });
    await page.waitForTimeout(700);
    // Selecting the page opens its rail: when it was kept, the comparison it
    // holds, and whether the source chart has changed since. Same reason the
    // data shot selects a variable.
    await page.click('.ps-pinpage');
    await page.waitForTimeout(500);
    await shot(page, 'app-notebook.png');
    await ctx.close();
}

// --------------------------------------------------------------- 4. layout
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
console.log('\nall four shots clean: no console errors, no failed requests');
