// The error-bar Method switch on Repeated Measures previews at the click
// (Oct 9 2026, Torry: the buttons changed but the bars did not). Method
// was the one error-bar setting with no client preview: the bars waited
// for the engine's debounced commit and the app's rebuild, and a quick
// second click cancelled the first before it was drawn. The engine now
// recomputes every occasion's half-width from the subject values the
// payload carries (the Cousineau-Morey step for within). What must hold:
//   - right after picking Between (or Within) the bars are already at the
//     size the data layer computes for that method
//   - the echo re-render leaves them where the preview put them
//   - Between then Within inside the debounce window ends at Within and
//     stays there after the echo
//   - a grouped chart on 95% CI previews exactly too
//   - Undo returns the bars to the previous method instantly
// Control: on main the bars are unchanged 150 ms after the click.
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
const SOFT = process.env.PS_SOFT === '1';
let failed = 0;
function ok(cond, msg) {
    if (!cond) {
        if (!SOFT) throw new Error(msg);
        failed++; console.log('  FAIL  ' + msg); return;
    }
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
await page.addInitScript(() => { try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); } catch (e) {} });
await page.goto(pageUrl);
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1500);
}
const w = ms => page.waitForTimeout(ms);
// 24 subjects with a strong subject effect, so the within-subjects bars
// are far smaller than the between-subjects ones; a group for case 4.
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const rows = [];
    for (let i = 0; i < 24; i++) { const subj = i * 2; rows.push([String(subj + 10 + (i % 3)), String(subj + 14 + ((i * 7) % 3)), String(subj + 18 + ((i * 5) % 3)), i % 2 ? 'A' : 'B']); }
    window.PS_SHELL.loadTable('ebmethod', ['t1', 't2', 't3', 'grp'], rows, null, null);
    await s(800);
    window.PS_SHELL.setModule('rmplotbuilder'); await s(400);
});
const setup = (roles) => page.evaluate(async (roles) => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setRoles('rmplotbuilder', roles); await s(1800);
}, roles);
// The engine's live half-widths (what is drawn) and the data layer's for
// a given method (what the echo will ship).
const drawn = () => page.evaluate(() => window.gb2_undo.getData().bars.map(b => +b.se));
const layer = (m) => page.evaluate((m) => {
    const o = window.PS_SHELL.chart().options.rmplotbuilder; const keep = o.errorBarMethod;
    o.errorBarMethod = m; const se = window.PS_SHELL.buildPayload().bars.map(b => +b.se);
    if (keep === undefined) delete o.errorBarMethod; else o.errorBarMethod = keep; return se;
}, m);
const close = (a, b, tol) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= (tol || 1e-9));
const fmt = a => a.slice(0, 3).map(v => v.toFixed(3)).join('/');
async function openMethodStrip() {
    await page.locator('[data-bar-cat] circle').first().click({ force: true }); await w(500);
    await page.locator('[data-ls-tab="errorbars"]').first().click({ force: true }); await w(400);
}
const pickMethod = async (m) => { await page.locator('[data-eb-method="' + m + '"]').first().click({ force: true }); };

console.log('case 1: Between previews at the click and the echo keeps it');
await setup({ measures: ['t1', 't2', 't3'] });
const within0 = await drawn(), betweenL = await layer('between');
ok(close(within0, await layer('within')) && !close(within0, betweenL, 1e-3), 'setup: drawn within ' + fmt(within0) + ' vs between ' + fmt(betweenL));
await openMethodStrip();
await pickMethod('between'); await w(150);
const b150 = await drawn();
ok(close(b150, betweenL), 'the drawn half-widths equal the data layer\'s between numbers 150 ms after the click (' + fmt(b150) + ')');
await w(3200);
ok(close(await drawn(), betweenL), 'and the echo left them there');
ok(await page.evaluate(() => window.PS_SHELL.chart().options.rmplotbuilder.errorBarMethod === 'between'), 'the option is stored as between');

console.log('case 2: Within previews back the same way');
await pickMethod('within'); await w(150);
ok(close(await drawn(), within0), 'within numbers back at the click (' + fmt(await drawn()) + ')');
await w(3200);
ok(close(await drawn(), within0), 'and after the echo');

console.log('case 3: Between then Within inside the debounce window ends at Within');
await pickMethod('between'); await w(120);
await pickMethod('within'); await w(150);
ok(close(await drawn(), within0), 'within at once');
await w(3400);
ok(close(await drawn(), within0) && await page.evaluate(() => window.PS_SHELL.chart().options.rmplotbuilder.errorBarMethod === 'within'), 'still within after the echo, option within');

console.log('case 4: grouped chart on 95% CI');
await setup({ measures: ['t1', 't2', 't3'], betweenVar: 'grp' });
await page.evaluate(() => window.__gb2_setOption('errorBarType', 'ci95')); await w(3400);
const gW = await drawn(), gB = await layer('between');
ok(close(gW, await layer('within')) && gW.length === 6 && !close(gW, gB, 1e-3), 'setup: six cells, within CI ' + fmt(gW) + ' vs between ' + fmt(gB));
await openMethodStrip();
await pickMethod('between'); await w(150);
ok(close(await drawn(), gB), 'between CI previewed exactly for every cell (' + fmt(await drawn()) + ')');
await w(3200);
ok(close(await drawn(), gB), 'and kept by the echo');

console.log('case 5: Undo returns the previous method at once');
const undoBtn = page.locator('.graphbuilder2-host button[title^="Undo"]').first();
ok(await undoBtn.count() > 0, 'an Undo button is on the toolbar');
await undoBtn.click({ force: true }); await w(150);
ok(close(await drawn(), gW), 'the within CI numbers are back at once (' + fmt(await drawn()) + ')');
await w(3200);
ok(close(await drawn(), gW) && await page.evaluate(() => window.PS_SHELL.chart().options.rmplotbuilder.errorBarMethod === 'within'), 'and after the echo, option within');

ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors[0].slice(0, 160) : ''));
await browser.close();
if (failed) { console.log('\neb-method-preview-check: ' + failed + ' FAILED'); process.exit(1); }
console.log('\neb-method-preview-check: all cases passed');
