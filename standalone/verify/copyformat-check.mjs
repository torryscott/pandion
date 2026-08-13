// Copy/Paste formatting (Aug 2026, Torry): capture a finished chart's
// whole look from the chart right-click menu and replay it onto another
// chart, no saved style required. Rides the engine's Chart styles
// machinery through the __gb2_styleClipboard* seam, so module gating,
// series re-keying, and the one-Undo revert all come along.
// CONTROL: disarm the engine seam (and RE-MINIFY, the dev page loads the
// min bundle) and the paste assertions fail - the fill stays default.
import { createRequire } from 'node:module';
import path from 'node:path';

function lp() {
    for (const b of [process.cwd(), '/tmp', '/private/tmp']) {
        try { return createRequire(path.join(b, 'x.js'))('playwright'); }
        catch { /* next shared dependency location */ }
    }
    console.error('playwright not found');
    process.exit(2);
}
function ok(cond, msg) {
    if (!cond) throw new Error(msg);
    console.log('  ok  ' + msg);
}

const { chromium } = lp();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(600);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1800);
}

const barFill = () => page.evaluate(() => {
    const el = [...document.querySelectorAll(
        '.graphbuilder2-host [data-bar-cat]')].find(e => e.tagName !== 'text');
    return el ? (el.getAttribute('fill') || '') : null;
});
const openChartMenu = () => page.evaluate(() => {
    const svg = document.querySelector('.graphbuilder2-host svg')
        || document.querySelector('#ps-workcard');
    const r = svg.getBoundingClientRect();
    svg.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true,
        cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + 60 }));
});
const menuItem = key => page.evaluate(k => {
    const b = document.querySelector(`[data-context-action="${k}"]`);
    return b ? { present: true, disabled: !!b.disabled } : { present: false };
}, key);
const clickItem = key => page.evaluate(k =>
    document.querySelector(`[data-context-action="${k}"]`).click(), key);

console.log('case 1: style chart A, and Paste starts disabled');
await page.evaluate(() => {
    window.__gb2_setOption('barColor', '#c2242c');
    window.__gb2_setOption('barCornerRadius', 40);
    window.__gb2_setOption('chartFontFamily', 'Georgia');
});
await page.waitForTimeout(2600);
ok(await barFill() === '#c2242c', 'chart A wears the custom look');
await openChartMenu();
await page.waitForTimeout(300);
ok((await menuItem('copy-format')).present, 'Copy formatting is in the menu');
const pasteBefore = await menuItem('paste-format');
ok(pasteBefore.present && pasteBefore.disabled,
   'Paste formatting is visible but disabled before anything is copied');
await clickItem('copy-format');
await page.waitForTimeout(300);

console.log('case 2: paste onto a second chart of the same kind');
await page.evaluate(() => {
    window.PS_SHELL.addChart('plotbuilder');
    const roles = window.PS_SHELL.rolesStore();
    roles.xvar = 'site'; roles.yvar = 'hours';
    window.PS_SHELL.switchChart(window.PS_SHELL.project.activeChart);
});
await page.waitForTimeout(2200);
ok(await barFill() === '#2d5c94', 'chart B renders the stock look first');
await openChartMenu();
await page.waitForTimeout(300);
ok(!(await menuItem('paste-format')).disabled, 'Paste is enabled now');
await clickItem('paste-format');
await page.waitForTimeout(1200);
ok(await barFill() === '#c2242c', 'the pasted fill lands');
ok(await page.evaluate(() => getComputedStyle(
       document.querySelector('.graphbuilder2-host svg text')).fontFamily
       .indexOf('Georgia') >= 0),
   'the pasted font lands');

console.log('case 3: the paste persists in the option store');
await page.waitForTimeout(2600);   // the debounced commit flush
const spec = await page.evaluate(() =>
    String((window.PS_SHELL.optionStore() || {}).chartSpec || ''));
ok(spec.indexOf('"barColor":"#c2242c"') >= 0
       && spec.indexOf('"barCornerRadius":40') >= 0,
   'chart B\'s own chartSpec carries the pasted values');

console.log('case 4: one Undo reverts the whole paste');
await page.evaluate(() => {
    const b = [...document.querySelectorAll('.graphbuilder2-host button')]
        .find(x => (x.getAttribute('aria-label') || '') === 'Undo'
                || (x.title || '').indexOf('Undo') === 0);
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await page.waitForTimeout(900);
ok(await barFill() === '#2d5c94',
   'one Undo puts chart B back to the stock look');

console.log('case 5: paste onto a DIFFERENT module applies what applies');
await page.evaluate(() => {
    window.PS_SHELL.addChart('distplotbuilder');
    const roles = window.PS_SHELL.rolesStore();
    roles.var = 'score';
    window.PS_SHELL.switchChart(window.PS_SHELL.project.activeChart);
});
await page.waitForTimeout(2200);
await openChartMenu();
await page.waitForTimeout(300);
await clickItem('paste-format');
await page.waitForTimeout(1200);
ok(await page.evaluate(() => getComputedStyle(
       document.querySelector('.graphbuilder2-host svg text')).fontFamily
       .indexOf('Georgia') >= 0),
   'the text look crosses module kinds (Distribution gets the font)');
ok(await page.evaluate(() => {
    const el = document.querySelector(
        '.graphbuilder2-host [data-role="dist-hist-bar"]');
    return el && (el.getAttribute('fill') || '') === '#c2242c';
}), 'the bar color crosses too (the histogram rides the bar pipeline)');

console.log('case 6: pasting onto an empty chart refuses politely');
await page.evaluate(() => {
    window.PS_SHELL.addChart('plotbuilder');   // no roles: placeholder
    window.PS_SHELL.switchChart(window.PS_SHELL.project.activeChart);
});
await page.waitForTimeout(1200);
await openChartMenu();
await page.waitForTimeout(300);
await clickItem('paste-format');
await page.waitForTimeout(500);
ok(await page.evaluate(() =>
       [...document.querySelectorAll('#ps-toast .ps-toast-item')]
           .some(t => t.textContent.indexOf('Add variables') >= 0)),
   'the placeholder chart gets a refusal toast, not a stale-closure apply');
ok(await page.evaluate(() =>
       String((window.PS_SHELL.optionStore() || {}).chartSpec || '')
           .indexOf('#c2242c') < 0),
   'and nothing landed in the empty chart\'s option store');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('COPYFORMAT CHECK PASS');
await browser.close();
