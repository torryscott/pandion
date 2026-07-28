// Torry, Jul 27 2026: the layout toolbar's second row (grid, step, snap,
// smart guides, margins, inset) "might be better served in the right-hand
// rail, under their own heading or whatever combination of headings makes
// the most logical sense".
//
// The split chosen: MARGINS + INSET join the existing Page section, being
// properties of the page itself; GRID + SNAP + SMART GUIDES + GRID STEP
// form a new "Guides and snapping" section, being aids that change how the
// canvas behaves while you work and never what the figure is. The toolbar
// keeps the ACTIONS (undo, add, page size, zoom).
//
// Every control kept its id, so this pins the thing that actually matters:
// they still WORK from the rail, and their state still round-trips.
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
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1500);
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.addLayout();
    await s(1200);
    window.PS_SHELL.setWorkspace('layout');
    await s(700);
});

// UNITS: this case checks that the RELOCATED controls still work, and it
// types a raw number into the inset. Since t4-45 that field reads in the
// user's unit (inches by default), so pin pixels first - as a user would
// from Preferences - and the numbers below mean pixels. units-check owns
// the conversion behaviour.
await page.evaluate(() => window.PS_SHELL.runCommand('preferences'));
await page.waitForTimeout(400);
await page.selectOption('#ps-pref-units', 'px');
await page.click('#ps-preferences-save');
await page.waitForTimeout(500);

console.log('case 1: the canvas aids live in the rail, not the toolbar');
const where = await page.evaluate(() => {
    const rail = document.getElementById('ps-inspector-layout');
    const bar = document.getElementById('ps-ltoolbar');
    const ids = ['ps-lgrid-toggle', 'ps-lsnap', 'ps-lguides', 'ps-lgrid',
                 'ps-lmargins', 'ps-lmargin'];
    const out = {};
    ids.forEach(id => {
        const el = document.getElementById(id);
        out[id] = !el ? 'missing'
            : rail.contains(el) ? 'rail'
            : bar.contains(el) ? 'toolbar' : 'elsewhere';
    });
    out.headings = Array.from(rail.querySelectorAll('.ps-inspector-section-title'))
        .map(n => n.textContent.trim());
    out.barRows = bar.querySelectorAll('.ps-ltoolbar-row').length;
    return out;
});
ok(['ps-lgrid-toggle', 'ps-lsnap', 'ps-lguides', 'ps-lgrid', 'ps-lmargins',
    'ps-lmargin'].every(id => where[id] === 'rail'),
   `all six controls are in the rail (${JSON.stringify(where).slice(0, 90)}...)`);
ok(where.barRows === 1,
   `the toolbar is down to its single row of actions (${where.barRows})`);
ok(where.headings.indexOf('Guides and snapping') !== -1 &&
   where.headings.indexOf('Page') !== -1,
   `under headings that say what they are (${JSON.stringify(where.headings)})`);

console.log('case 2: they still do their jobs from there');
// The state is what proves it: toggling must flip the stored view flag,
// not merely the button's own appearance.
const flags = () => page.evaluate(() => {
    const v = window.PS_SHELL.chart().view || {};
    return { grid: !!v.showGrid, snap: !!v.snap, guides: !!v.guides,
             margins: !!v.margins, step: v.grid, inset: window.PS_SHELL
                 .chart().page.margin };
});
const before = await flags();
await page.click('#ps-lgrid-toggle');
await page.waitForTimeout(300);
await page.click('#ps-lsnap');
await page.waitForTimeout(300);
const after = await flags();
ok(after.grid === !before.grid && after.snap === !before.snap,
   `Grid and Snap flip the layout's own state from the rail ` +
   `(grid ${before.grid}->${after.grid}, snap ${before.snap}->${after.snap})`);
ok(await page.evaluate(() =>
       document.getElementById('ps-lgrid-toggle')
           .getAttribute('aria-pressed')) === String(after.grid),
   'and the pressed state on the button agrees with it');
await page.selectOption('#ps-lgrid', '8');
await page.waitForTimeout(300);
ok((await flags()).step === 8,
   'the grid step select still applies');
await page.evaluate(() => {
    const box = document.getElementById('ps-lmargin');
    box.value = '32';
    box.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(300);
ok((await flags()).inset === 32,
   'and so does the margin inset');

console.log('case 3: the state survives a reload, as it did before');
await page.reload();
await page.waitForTimeout(1700);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-continue');
    await page.waitForTimeout(1400);
}
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setWorkspace('layout');
    await s(600);
});
const reloaded = await page.evaluate(() => ({
    grid: document.getElementById('ps-lgrid-toggle')
        .getAttribute('aria-pressed'),
    step: document.getElementById('ps-lgrid').value,
    inset: document.getElementById('ps-lmargin').value
}));
ok(reloaded.step === '8' && reloaded.inset === '32' &&
   reloaded.grid === String(after.grid),
   `the controls come back showing the saved state ` +
   `(step ${reloaded.step}, inset ${reloaded.inset}, grid ${reloaded.grid})`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('LAYOUT RAIL CHECK PASS');
await browser.close();
