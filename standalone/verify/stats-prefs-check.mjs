// Statistics preferences (backlog, Aug 2026): a Statistics tab in
// Preferences seeds error bar type, RM method, and alpha onto NEW charts
// at creation time - and ONLY at creation time, so an existing chart
// never changes when a preference does. The rows carry the same
// changes-the-numbers band the chart panels use; the values remain
// ordinary per-chart options afterward.
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
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible().catch(() => false)) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1800);
}

async function openPrefs() {
    await page.evaluate(() => window.PS_SHELL.showPreferences());
    await page.waitForTimeout(400);
}
async function chartOpts(mod) {
    return page.evaluate((mod) => {
        const c = window.PS_SHELL.chart();
        const o = (c.roles, c.options && c.options[mod]) || {};
        const spec = o.chartSpec ? JSON.parse(o.chartSpec) : {};
        return { eb: o.errorBarType || null, method: o.errorBarMethod || null,
                 statsAlpha: spec.statsAlpha ?? null,
                 corrSigLevel: spec.corrSigLevel ?? null };
    }, mod);
}

console.log('case 1: the Statistics tab exists and starts unset');
await openPrefs();
const tabState = await page.evaluate(() => {
    const t = document.getElementById('ps-pref-tab-stats');
    const g = document.getElementById('ps-pref-tab-general');
    return { stats: !!t, roles: t && t.getAttribute('role'),
             genSelected: g && g.getAttribute('aria-selected'),
             statsPaneHidden: document.getElementById('ps-pref-pane-stats')
                .hasAttribute('hidden') };
});
ok(tabState.stats && tabState.roles === 'tab' &&
   tabState.genSelected === 'true' && tabState.statsPaneHidden,
   'tablist present, General selected, Statistics pane hidden');
await page.click('#ps-pref-tab-stats');
await page.waitForTimeout(200);
const paneState = await page.evaluate(() => ({
    shown: !document.getElementById('ps-pref-pane-stats').hasAttribute('hidden'),
    genHidden: document.getElementById('ps-pref-pane-general').hasAttribute('hidden'),
    eb: document.getElementById('ps-pref-def-eb').value,
    rmm: document.getElementById('ps-pref-def-rmm').value,
    alpha: document.getElementById('ps-pref-def-alpha').value
}));
ok(paneState.shown && paneState.genHidden,
   'the Statistics tab shows its pane and hides General');
ok(paneState.eb === '' && paneState.rmm === '' && paneState.alpha === '',
   'all three defaults start at App default');
// arrow keys per the tabs pattern
await page.focus('#ps-pref-tab-stats');
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(150);
const arrowed = await page.evaluate(() =>
    document.getElementById('ps-pref-tab-general').getAttribute('aria-selected'));
ok(arrowed === 'true', 'arrow keys move the tab selection');

console.log('case 2: set preferences; the EXISTING chart is untouched');
const before = await chartOpts('plotbuilder');
await page.click('#ps-pref-tab-stats');
await page.evaluate(() => {
    document.getElementById('ps-pref-def-eb').value = 'sd';
    document.getElementById('ps-pref-def-rmm').value = 'between';
    document.getElementById('ps-pref-def-alpha').value = '0.01';
    document.getElementById('ps-preferences-save').click();
});
await page.waitForTimeout(500);
const after = await chartOpts('plotbuilder');
ok(JSON.stringify(before) === JSON.stringify(after) && after.eb === null,
   `the chart that existed before the change carries no seeds ` +
   `(${JSON.stringify(after)})`);

console.log('case 3: a NEW chart is seeded across the modules');
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.addChart('plotbuilder');
    await s(600);
});
await page.waitForTimeout(800);
const cg = await chartOpts('plotbuilder');
ok(cg.eb === 'sd' && cg.statsAlpha === 0.01,
   `Compare Groups seeded: errorBarType sd, statsAlpha .01 ` +
   `(${JSON.stringify(cg)})`);
const rm = await chartOpts('rmplotbuilder');
ok(rm.eb === 'sd' && rm.method === 'between' && rm.statsAlpha === 0.01,
   `Repeated Measures seeded: sd + between + .01 (${JSON.stringify(rm)})`);
const co = await chartOpts('corrplotbuilder');
ok(co.corrSigLevel === 0.01,
   `Correlation seeded: corrSigLevel .01 (${JSON.stringify(co)})`);
// and the PAYLOAD honors the seed once roles exist
const pay = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setRoles('plotbuilder',
        { xvar: 'condition', yvar: 'score' });
    await s(1200);
    const p = window.PS_SHELL.buildPayload();
    const spec = p.chartSpec ? JSON.parse(p.chartSpec) : {};
    return { eb: p.errorBarType, alpha: spec.statsAlpha };
});
ok(pay.eb === 'sd' && pay.alpha === 0.01,
   `the rendered payload carries both seeds - errorBarType top-level, ` +
   `statsAlpha inside the chartSpec blob the engine explodes ` +
   `(${JSON.stringify(pay)})`);

console.log('case 4: preferences survive a reload; old charts stay clean');
await page.reload();
await page.waitForTimeout(1200);
if (await page.locator('#ps-welcome').isVisible().catch(() => false)) {
    await page.evaluate(() => {
        const w = document.getElementById('ps-welcome');
        const c = [...w.querySelectorAll('button')]
            .find(b => /continue|resume/i.test(b.textContent));
        if (c) c.click();
    });
    await page.waitForTimeout(1500);
}
const persisted = await page.evaluate(() => {
    const saved = JSON.parse(
        window.localStorage.getItem('psstandalone.preferences.v1') || '{}');
    return { eb: saved.defErrorBars, rmm: saved.defRmMethod,
             alpha: saved.defAlpha };
});
ok(persisted.eb === 'sd' && persisted.rmm === 'between' &&
   persisted.alpha === '0.01',
   `the three preferences persist (${JSON.stringify(persisted)})`);

console.log('case 5: alpha .10 seeds cg/rm but honestly skips Correlation');
await openPrefs();
await page.click('#ps-pref-tab-stats');
await page.evaluate(() => {
    document.getElementById('ps-pref-def-alpha').value = '0.1';
    document.getElementById('ps-preferences-save').click();
});
await page.waitForTimeout(400);
await page.evaluate(() => window.PS_SHELL.addChart('plotbuilder'));
await page.waitForTimeout(700);
const ten = await page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    const g = m => {
        const o = (c.options && c.options[m]) || {};
        return o.chartSpec ? JSON.parse(o.chartSpec) : {};
    };
    return { cg: g('plotbuilder').statsAlpha,
             corr: g('corrplotbuilder').corrSigLevel ?? null };
});
ok(ten.cg === 0.1 && ten.corr === null,
   `alpha .10: cg gets .10, corr stays at its own default ` +
   `(${JSON.stringify(ten)})`);

console.log('case 6: restore defaults ends the seeding');
await openPrefs();
await page.evaluate(() => {
    document.getElementById('ps-pref-reset').click();
    document.getElementById('ps-preferences-save').click();
});
await page.waitForTimeout(400);
await page.evaluate(() => window.PS_SHELL.addChart('plotbuilder'));
await page.waitForTimeout(700);
const clean = await chartOpts('plotbuilder');
ok(clean.eb === null && clean.statsAlpha === null,
   `a chart made after Restore defaults carries no seeds ` +
   `(${JSON.stringify(clean)})`);

ok(errors.length === 0, 'zero page errors');
console.log('STATS PREFS CHECK PASS');
await browser.close();
