// The user guide's computed-variable recipes are VERIFIED DOCS (Torry,
// Aug 2 2026): every <code data-guide-formula> in docs/user-guide.html is
// extracted and run against the real formula engine, with spot-checked
// values, so the guide cannot drift into examples that no longer run.
// Also pins the guide's channel switch (jamovi vs app): defaults, the
// ?channel= override, filtering, and nav filtering.
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
const { chromium } = loadPlaywright();
const root = path.resolve(new URL('.', import.meta.url).pathname, '..', '..');
const guidePath = path.join(root, 'docs', 'user-guide.html');

console.log('case 1: every documented formula runs, with true values');
const guide = fs.readFileSync(guidePath, 'utf8');
const formulas = [...guide.matchAll(
    /<code data-guide-formula>([^]*?)<\/code>/g)]
    .map(m => m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim());
ok(formulas.length >= 10,
   `the guide documents ${formulas.length} formulas (extraction is live)`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto('file://' + path.join(root, 'standalone', 'index.html'));
await page.waitForTimeout(600);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1400);
}
const run = await page.evaluate(fl => {
    window.PS_SHELL.loadTable('guidecheck',
        ['paced', 'clear', 'useful', 'supported', 'score', 'pre', 'post',
         'rt', 'first quiz'],
        [['3', '4', '5', '4', '61', '10', '14', '420', '7'],
         ['4', '5', '5', '5', '75', '12', '11', '380', '8'],
         ['2', '3', '4', '3', '58', '9', '16', '1250', '5'],
         ['4', '4', '4', '4', '90', '11', '15', '510', '9']],
        { paced: 'continuous', clear: 'continuous', useful: 'continuous',
          supported: 'continuous', score: 'continuous', pre: 'continuous',
          post: 'continuous', rt: 'continuous',
          'first quiz': 'continuous' });
    const out = [];
    for (let i = 0; i < fl.length; i++) {
        const r = window.PS_SHELL.saveComputedColumn('gf' + i, fl[i]);
        const t = window.PS_SHELL.project.table;
        out.push({ formula: fl[i],
                   error: r && r.error ? r.error : null,
                   values: t.raw['gf' + i] ? t.raw['gf' + i].slice(0, 4)
                                           : null });
    }
    return out;
}, formulas);
const broken = run.filter(r => r.error || !r.values);
ok(broken.length === 0,
   'all documented formulas compile and fill their column' +
   (broken.length ? ' - broken: ' + JSON.stringify(broken) : ''));
// Spot-check true arithmetic on the known rows (score 61/75/58/90:
// mean 71, Bessel SD ~14.674).
function vals(f) {
    const hit = run.find(r => r.formula === f);
    return hit ? hit.values : null;
}
ok(String(vals('6 - supported')) === '2,1,3,2',
   'reverse-scoring is exact (6 - supported -> 2,1,3,2)');
ok(String(vals('(paced + clear + useful + supported) / 4')) ===
   '4,4.75,3,4', 'the scale mean is exact (4, 4.75, 3, 4)');
const z = (vals('(score - MEAN(score)) / SD(score)') || [])
    .map(Number);
ok(Math.abs(z[0] - (61 - 71) / 14.674404) < 1e-4 &&
   Math.abs(z[3] - (90 - 71) / 14.674404) < 1e-4,
   `z-scores use the Bessel SD (${z[0].toFixed(4)}, ${z[3].toFixed(4)})`);
ok(String(vals('IF(score >= MEAN(score), "high", "low")')) ===
   'low,high,low,high',
   'the mean split labels the right rows (low,high,low,high)');
ok(String(vals('`first quiz` * 2')) === '14,16,10,18',
   'backtick-quoted names work exactly as documented');

console.log('case 2: the channel switch filters the guide honestly');
const gpage = await browser.newPage();
await gpage.goto('file://' + guidePath);
await gpage.waitForTimeout(700);
const chDefault = await gpage.evaluate(() => ({
    channel: document.body.getAttribute('data-channel'),
    appSecVisible: (() => {
        const h = document.getElementById('computed');
        return !!h && h.getBoundingClientRect().height > 0;
    })(),
    jamExportHidden: (() => {
        const h = document.getElementById('export-panel');
        return !!h && h.getBoundingClientRect().height === 0;
    })(),
    navAppShown: (() => {
        const a = document.querySelector('#navlinks a[href="#computed"]');
        return !!a && a.getBoundingClientRect().height > 0;
    })(),
}));
ok(chDefault.channel === 'app',
   'opened outside jamovi, the guide defaults to the app channel');
ok(chDefault.appSecVisible && chDefault.jamExportHidden,
   'app sections show; the jamovi export panel is filtered out');
ok(chDefault.navAppShown,
   'the nav lists the app sections (Computed variables reachable)');
await gpage.evaluate(() => {
    document.querySelector('.chswitch button[data-ch="jamovi"]').click();
});
await gpage.waitForTimeout(200);
const chJam = await gpage.evaluate(() => ({
    channel: document.body.getAttribute('data-channel'),
    computedHidden: document.getElementById('computed')
        .getBoundingClientRect().height === 0,
    exportShown: document.getElementById('export-panel')
        .getBoundingClientRect().height > 0,
    navAppHidden: document.querySelector('#navlinks a[href="#computed"]')
        .getBoundingClientRect().height === 0,
}));
ok(chJam.channel === 'jamovi' && chJam.computedHidden &&
   chJam.exportShown && chJam.navAppHidden,
   'the jamovi tab swaps content AND the nav, both directions');
await gpage.reload();
await gpage.waitForTimeout(700);
ok(await gpage.evaluate(() =>
       document.body.getAttribute('data-channel')) === 'jamovi',
   'the clicked choice sticks across a reload');
await gpage.goto('file://' + guidePath + '?channel=app');
await gpage.waitForTimeout(700);
ok(await gpage.evaluate(() =>
       document.body.getAttribute('data-channel')) === 'app',
   '?channel= overrides the stored choice (the deep-link contract)');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('GUIDE FORMULAS CHECK PASS');
await browser.close();
