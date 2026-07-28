// Punch list t3-49: scatter overlays switched off on any data change, in
// silence.
//
// The switching-off itself is correct and deliberate: the marginal, contour
// and heatmap arrays are computed by the ENGINE from the points it was given,
// the shell harvests and re-ships them, and a stale set would draw an overlay
// describing rows that no longer exist. What was wrong is that a student who
// fixed a typo in one cell watched their marginal strips disappear with no
// message and nothing to click.
//
// WHAT THIS ITEM ASKED FOR AND DID NOT GET: the item proposed extending the
// heatmap's self-heal (a synthetic xyBinCount pin) to marginals and contours.
// That works for the heatmap because the engine rebuilds tiles AT RENDER ENTRY
// while an xyBinCount commit is held. There is no equivalent render-entry hook
// for marginals or contours: their client computers are wired only to
// gestures. So an automatic rebuild needs an engine change (out of scope, the
// engine is shared with the jamovi module) or a second copy of the maths in
// the shell. What ships instead is disclosure plus one click, and the one
// click drives the ENGINE's own add gesture, which is the thing that rebuilds.
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
await page.waitForTimeout(1400);

// A scatter with marginals on, added the way a user adds them: through the
// engine's own "+" menu, which is what fills the arrays in the first place.
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setModule('xyplotbuilder');
    await s(400);
    window.PS_SHELL.setRoles('xyplotbuilder', { xvar: 'hours', yvar: 'score' });
    await s(1200);
});
await page.waitForTimeout(1400);

async function addOverlay(kind) {
    return page.evaluate(async (k) => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        const host = document.getElementById('psroot');
        const plus = host.querySelector('button[aria-label="Add to chart"]');
        if (!plus) return 'no plus button';
        plus.click();
        await s(250);
        const item = host.querySelector('[data-kind="' + k + '"]') ||
            document.querySelector('[data-kind="' + k + '"]');
        if (!item) { plus.click(); return 'no menu item'; }
        item.click();
        await s(900);
        return 'ok';
    }, kind);
}
const strips = () => page.evaluate(() => ({
    opt: window.PS_SHELL.optionStore().xyMarginal,
    drawn: document.querySelectorAll(
        '#psroot [data-role^="xy-marginal"], #psroot [data-role*="marginal"]').length
}));

console.log('case 1: setup, marginals really are on and drawn');
ok(await addOverlay('ovl_marginal') === 'ok', 'the engine adds them from its + menu');
await page.waitForTimeout(1200);
const on = await strips();
ok(on.opt && on.opt !== 'none', `the option is set (${on.opt})`);
ok(on.drawn > 0, `and geometry is on the chart (${on.drawn} elements)`);

console.log('case 2: a data edit switches them off, and SAYS so');
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    // The exact edit the item is about: one cell corrected. Same row count,
    // same roles, different numbers. Through the app's real paste path rather
    // than by writing t.raw, because a raw write never reaches retypeColumns
    // and so never moves t.columns, which is what the fingerprint reads. (A
    // probe that wrote raw would have "passed" a broken fix.)
    window.PS_SHELL.setWorkspace('data');
    await s(500);
    navigator.clipboard.readText = () => Promise.resolve('999');
    window.PS_SHELL.setGridSelection('hours', 0, 'hours', 0, 'cells');
    await s(300);
    window.PS_SHELL.runCommand('paste-cells');
    await s(900);
    window.PS_SHELL.setWorkspace('chart');
    await s(1400);
});
await page.waitForTimeout(1600);
const after = await strips();
ok(!after.opt || after.opt === 'none',
   `the overlay is off, which is the honest state for stale geometry ` +
   `(${after.opt})`);
const toast = await page.evaluate(() => {
    const t = document.getElementById('ps-toast');
    const btn = t.querySelector('button');
    return { text: t.innerText, action: btn ? btn.textContent.trim() : null };
});
ok(/switched off/i.test(toast.text) && /data changed/i.test(toast.text),
   `and the app says what happened and why, instead of the silence this ` +
   `item is about ("${toast.text.replace(/\n/g, ' ').slice(0, 110)}")`);
ok(/marginal/i.test(toast.text),
   'naming the overlay it switched off, not "an overlay"');
ok(!!toast.action, `with something to click ("${toast.action}")`);

console.log('case 3: the offer actually restores them');
await page.evaluate(() => {
    document.querySelector('#ps-toast button').click();
});
await page.waitForTimeout(1800);
const back = await strips();
ok(back.opt && back.opt !== 'none',
   `one click puts the overlay back on (${back.opt})`);
ok(back.drawn > 0,
   `WITH geometry, which is the whole point: setting the option alone would ` +
   `turn it on with nothing to draw, because the engine computes the arrays ` +
   `only on its own add gesture (${back.drawn} elements)`);

console.log('case 4: an untouched chart is not nagged');
const quiet = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    document.getElementById('ps-toast').innerHTML = '';
    window.PS_SHELL.setWorkspace('data');
    await s(400);
    window.PS_SHELL.setWorkspace('chart');
    await s(1500);
    return document.getElementById('ps-toast').innerText;
});
ok(!/switched off/i.test(quiet),
   `merely LOOKING at the data does not fire it (${JSON.stringify(
       quiet.slice(0, 60))})`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('OVERLAY RESTORE CHECK PASS');
await browser.close();
