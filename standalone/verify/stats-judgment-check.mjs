// The statistical judgment review (Nov 11 2026) asked one question of the
// app: would a methodologist object to what it says, or to what it lets a
// student do without warning? The numbers matched jamovi; the findings were
// about judgment. Each case here pins one ruling that followed.
//
// The fixtures (stats-judgment-fixtures.json) are the review's hard-case
// datasets: unequal spreads with unequal group sizes, groups of one to
// three, an outlier at n = 12, a mixed design, missing occasions, sparse
// and 2 x 2 tables, survey items coded 0 to 4 and with an unused level.
// Expected values are jamovi's own (the jmv package run with jamovi's R)
// or base R, quoted beside each check.
//
// One case per file in stats-judgment-cases/, run in file order.
//
//   PS_ONLY=rule,spread   run a subset of cases
//   PS_EXPECT_BROKEN=1 PS_PAGE=<a page from before the change>
//                         the control: every case must FAIL there
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

function loadPlaywright() {
    for (const base of [process.env.GB2_NODE_BASE, process.cwd(),
                        new URL('.', import.meta.url).pathname, '/private/tmp', '/tmp']) {
        if (!base) continue;
        try { return createRequire(path.join(base, 'x.js'))('playwright'); }
        catch { /* try the next shared dependency location */ }
    }
    console.error('playwright not found');
    process.exit(2);
}
const { chromium } = loadPlaywright();
const HERE = new URL('.', import.meta.url).pathname;
const PAGE = process.env.PS_PAGE || path.resolve(HERE, '..', 'index.html');
const FX = JSON.parse(fs.readFileSync(path.join(HERE, 'stats-judgment-fixtures.json'), 'utf8'));
const ONLY = process.env.PS_ONLY ? process.env.PS_ONLY.split(',') : null;
const EXPECT_BROKEN = process.env.PS_EXPECT_BROKEN === '1';

let browser;
async function open(id, extraOpts) {
    const fx = FX.find(f => f.id === id);
    if (!fx) throw new Error('no fixture ' + id);
    const page = await browser.newPage({ viewport: { width: 1500, height: 980 } });
    page.__errors = [];
    page.on('pageerror', e => page.__errors.push(String(e)));
    await page.goto('file://' + path.resolve(PAGE));
    await page.waitForTimeout(700);
    if (await page.locator('#ps-welcome').isVisible().catch(() => false)) {
        try { await page.locator('#ps-welcome-blank, #ps-welcome-close').first().click({ timeout: 1500 }); } catch { /* already gone */ }
        await page.waitForTimeout(400);
    }
    await page.evaluate(async ({ fx, extraOpts }) => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        const S = window.PS_SHELL;
        S.loadTable(fx.id, fx.header, fx.rows.map(r => r.map(v => (v === null || v === undefined) ? '' : v)),
            fx.types, fx.levels || null);
        S.setModule(fx.module);
        Object.assign(S.optionStore(), fx.opts || {}, extraOpts || {});
        S.setRoles(fx.module, fx.roles);
        await s(1700);
    }, { fx, extraOpts });
    return page;
}
const press = (page, sel) => page.evaluate(async (sel) => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const el = document.querySelector(sel);
    if (!el) return false;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    el.click();
    await s(800);
    return true;
}, sel);
const stats = async (page, tab) => {
    if (!(await page.evaluate(() => !!document.querySelector('[data-st-pane], .gb2-panel [data-st-scroll]'))))
        await press(page, '.graphbuilder2-host button[title="Statistics"]');
    if (tab) await press(page, '[data-st-tab="' + tab + '"]');
};
// Choose `value` in the visible pane's select that offers `has`.
const choose = (page, has, value) => page.evaluate(async ({ has, value }) => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const pane = [...document.querySelectorAll('[data-st-pane]')].find(p => p.offsetParent && p.offsetHeight > 0)
        || document.querySelector('.gb2-panel');
    const sel = pane && [...pane.querySelectorAll('select')].find(x => x.offsetParent && [...x.options].some(o => o.value === has));
    if (!sel || ![...sel.options].some(o => o.value === value && !o.disabled)) return false;
    sel.value = value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await s(1000);
    return true;
}, { has, value });
// The visible pane: table rows as cell arrays, and every word outside the tables.
const pane = (page) => page.evaluate(() => {
    const p = [...document.querySelectorAll('[data-st-pane]')].find(q => q.offsetParent && q.offsetHeight > 0)
        || document.querySelector('.gb2-panel');
    if (!p) return { rows: [], notes: '', text: '' };
    const rows = [];
    p.querySelectorAll('tr').forEach(tr => {
        if (!tr.offsetParent) return;
        const c = [...tr.querySelectorAll('th,td')].map(x => (x.innerText || '').replace(/\s+/g, ' ').trim());
        if (c.some(Boolean)) rows.push(c);
    });
    const clone = p.cloneNode(true);
    clone.querySelectorAll('table,select,button,option').forEach(n => n.remove());
    return { rows, notes: (clone.textContent || '').replace(/\s+/g, ' ').trim(), text: (p.innerText || '').replace(/\s+/g, ' ').trim() };
});
const rowOf = (p, re) => p.rows.find(r => re.test(r.join(' | '))) || [];
const aria = (page) => page.evaluate(() => {
    const svg = document.querySelector('svg[data-role="gb2-chart-svg"]');
    return svg ? (svg.getAttribute('aria-label') || '') : '';
});
const lint = async (page) => {
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await press(page, 'button[aria-label="Help & shortcuts"]');
    await press(page, '[data-helpnav="graphLint"]');
    return page.evaluate(() => ((document.querySelector('.gb2-panel') || {}).innerText || '').replace(/\s+/g, ' ').trim());
};

let checks = 0;
function ok(cond, msg, extra) {
    if (!cond) throw new Error(msg + (extra !== undefined ? ' :: ' + JSON.stringify(extra) : ''));
    checks++;
    console.log('    ok  ' + msg);
}
const CASE_DIR = path.join(HERE, 'stats-judgment-cases');
const CASE_FILES = fs.readdirSync(CASE_DIR).filter(f => /^\d+-[\w-]+\.mjs$/.test(f)).sort();

browser = await chromium.launch();
const ctx = { open, stats, choose, pane, rowOf, aria, lint, press, ok };
let failed = 0, ran = 0;
for (const file of CASE_FILES) {
    const name = file.replace(/^\d+-/, '').replace(/\.mjs$/, '');
    if (ONLY && !ONLY.includes(name)) continue;
    ran++;
    console.log('case ' + name);
    let err = null;
    try { await (await import(path.join(CASE_DIR, file))).default(ctx); } catch (e) { err = e; }
    if (EXPECT_BROKEN) {
        if (err) console.log('    red as expected: ' + String(err.message).slice(0, 200));
        else { failed++; console.log('  CONTROL FAILED: case ' + name + ' passed on a page from before the change'); }
    } else if (err) {
        failed++;
        console.log('  FAIL ' + String(err.message).slice(0, 600));
    }
    for (const pg of browser.contexts().flatMap(c => c.pages())) await pg.close().catch(() => {});
}
await browser.close();
if (failed) { console.log('stats-judgment-check: ' + failed + ' of ' + ran + ' case(s) FAILED'); process.exit(1); }
console.log(EXPECT_BROKEN ? 'stats-judgment-check: control red on all ' + ran + ' case(s)'
    : 'stats-judgment-check: ALL OK (' + ran + ' cases, ' + checks + ' checks)');
