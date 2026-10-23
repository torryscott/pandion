// Row filters, Oct 2026: the between / outside operators and FORMULA
// conditions (a student's "exclude rows outside a range" and "drop anyone
// who failed the attention check"). Driven through the real Filter
// popover on the welcome sample (24 rows: condition, score, hours, site),
// with every expected count recomputed from the raw table in the page.
//
// The rules asserted: a range is one condition in either direction; a
// formula is kept where true and can say AND / OR / NOT across columns; a
// formula that cannot run (unknown variable, or a text result) is
// PASS-THROUGH and disclosed in the popover, the chart note and the Filter
// button's tooltip (the t4-25 honesty rule), never an empty chart; the two
// shapes ride reload, .pand and the setup file; a rename follows into a
// formula.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

function loadPlaywright() {
    for (const base of [process.env.GB2_NODE_BASE, process.cwd(),
                        new URL('.', import.meta.url).pathname, '/private/tmp', '/tmp'].filter(Boolean)) {
        try { return createRequire(path.join(base, 'x.js'))('playwright'); }
        catch { /* try the next shared dependency location */ }
    }
    console.error('playwright not found');
    process.exit(2);
}
const { chromium } = loadPlaywright();
const PAGE = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(PAGE);
await page.waitForTimeout(600);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1000);

let fails = 0;
function ok(cond, label, detail) {
    if (cond) console.log('  ok  ' + label);
    else { console.log('  FAIL ' + label + ' :: ' + (detail || '')); fails++; }
}
const raw = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return { score: t.raw.score.map(Number), site: t.raw.site.slice(),
             hours: t.raw.hours.map(Number), n: t.raw.score.length };
});
ok(raw.n === 24, 'sample has 24 rows');
const countKept = pred => raw.score.reduce((k, s, i) => k + (pred(s, raw.site[i], raw.hours[i]) ? 1 : 0), 0);
const kept = () => page.evaluate(() =>
    window.PS_SHELL.buildPayload().bars.reduce((a, b) => a + b.n, 0));
const countText = () => page.evaluate(() =>
    (document.querySelector('[data-filter-count]') || {}).textContent || '');
const note = () => page.evaluate(() => window.PS_SHELL.buildPayload().chartNote || '');
const tip = () => page.evaluate(() =>
    document.getElementById('ps-data-filter-btn').getAttribute('data-tip') ||
    document.getElementById('ps-data-filter-btn').getAttribute('title') || '');
async function openMenu() {
    await page.click('[data-ps-workspace="data"]');
    await page.waitForTimeout(300);
    await page.click('#ps-data-filter-btn');
    await page.waitForTimeout(400);
}
async function apply() {
    await page.click('[data-filter-apply]');
    await page.waitForTimeout(700);
}
async function clearAll() {
    await openMenu();
    await page.click('[data-filter-clear]');
    await page.waitForTimeout(500);
}

// ---- case 1: between, one condition for a range
console.log('case 1: between');
await openMenu();
await page.selectOption('#ps-filtermenu [data-filter-col="0"]', 'score');
await page.selectOption('#ps-filtermenu [data-filter-op="0"]', 'between');
await page.fill('#ps-filtermenu input[data-filter-value="0"]', '60');
await page.fill('#ps-filtermenu input[data-filter-value2="0"]', '80');
const expBetween = countKept(s => s >= 60 && s <= 80);
ok(new RegExp('showing ' + expBetween + ' of 24').test(await countText()),
   'preview counts rows with 60 <= score <= 80 (' + expBetween + ')', await countText());
await apply();
ok(await kept() === expBetween, 'chart uses the ' + expBetween + ' rows inside the range', String(await kept()));
ok(/Filter: score between 60 and 80 · showing \d+ of 24 rows/.test(await note()),
   'chart note reads "score between 60 and 80"', await note());

// ---- case 2: outside, the same bounds, the complement
console.log('case 2: outside');
await openMenu();
await page.selectOption('#ps-filtermenu [data-filter-op="0"]', 'outside');
await page.waitForTimeout(200);
ok((await page.evaluate(() => document.querySelector('#ps-filtermenu input[data-filter-value2="0"]').value)) === '80',
   'the high bound survives the operator switch');
const expOutside = 24 - expBetween;
ok(new RegExp('showing ' + expOutside + ' of 24').test(await countText()),
   'preview counts the complement (' + expOutside + ')', await countText());
await apply();
ok(await kept() === expOutside, 'chart uses the rows outside the range', String(await kept()));
ok(/score outside 60 to 80/.test(await note()), 'chart note reads "score outside 60 to 80"', await note());
// bounds given backwards still mean the same range
await openMenu();
await page.fill('#ps-filtermenu input[data-filter-value="0"]', '80');
await page.fill('#ps-filtermenu input[data-filter-value2="0"]', '60');
ok(new RegExp('showing ' + expOutside + ' of 24').test(await countText()),
   'swapped bounds give the same count', await countText());
await page.click('[data-filter-clear]');
await page.waitForTimeout(500);
ok(await kept() === 24, 'cleared');

// ---- case 3: a formula condition through the column select
console.log('case 3: formula via "Formula..."');
await openMenu();
await page.selectOption('#ps-filtermenu [data-filter-col="0"]', '__formula__');
await page.waitForTimeout(200);
ok(await page.evaluate(() => !!document.querySelector('#ps-filtermenu input[data-filter-formula="0"]') &&
     !document.querySelector('#ps-filtermenu [data-filter-op="0"]')),
   'the row becomes a formula box (no operator select)');
ok(await page.evaluate(() => document.activeElement === document.querySelector('#ps-filtermenu input[data-filter-formula="0"]')),
   'focus lands in the formula box');
await page.fill('#ps-filtermenu input[data-filter-formula="0"]', 'score >= 60 AND site == "East"');
const expAnd = countKept((s, site) => s >= 60 && site === 'East');
ok(new RegExp('showing ' + expAnd + ' of 24').test(await countText()),
   'preview counts score >= 60 AND site == "East" (' + expAnd + ')', await countText());
await apply();
ok(await kept() === expAnd, 'chart uses the formula\'s rows', String(await kept()));
ok(/Filter: score >= 60 AND site == "East" · showing \d+ of 24 rows/.test(await note()),
   'chart note carries the formula verbatim', await note());
const dimmed = await page.evaluate(() => ({
    dimmed: document.querySelectorAll('#ps-datagrid td.ps-grid-row-filtered').length,
    chip: document.getElementById('ps-data-filter-btn').textContent
}));
ok(dimmed.dimmed > 0 && new RegExp('Filter · ' + expAnd + ' of 24').test(dimmed.chip),
   'grid dims the dropped rows and the chip counts the kept ones', JSON.stringify(dimmed));

// ---- case 4: OR and NOT in one formula; a second plain condition ANDs with it
console.log('case 4: OR / NOT + a plain row');
await openMenu();
await page.fill('#ps-filtermenu input[data-filter-formula="0"]', 'site == "West" OR NOT(score < 85)');
await page.click('#ps-filtermenu >> text=+ Add condition');
await page.waitForTimeout(200);
await page.selectOption('#ps-filtermenu [data-filter-col="1"]', 'hours');
await page.selectOption('#ps-filtermenu [data-filter-op="1"]', 'ge');
await page.fill('#ps-filtermenu input[data-filter-value="1"]', '3');
const expOr = countKept((s, site, h) => (site === 'West' || !(s < 85)) && h >= 3);
ok(new RegExp('showing ' + expOr + ' of 24').test(await countText()),
   'preview: (West OR score >= 85) AND hours >= 3 (' + expOr + ')', await countText());
await apply();
ok(await kept() === expOr, 'chart matches', String(await kept()));
ok(/Filter: \(site == "West" OR NOT\(score < 85\)\) and hours ≥ 3/.test(await note()),
   'note wraps the formula in parentheses beside a plain condition', await note());

// ---- case 5: a formula that cannot run is pass-through and disclosed
console.log('case 5: unknown variable');
await openMenu();
await page.fill('#ps-filtermenu input[data-filter-formula="0"]', 'scor >= 60');
const strand = await page.evaluate(() => {
    const el = document.querySelector('#ps-filtermenu .ps-filter-stranded');
    return el ? el.textContent : '';
});
ok(/unknown variable "scor"/.test(strand) && /not being applied/.test(strand),
   'popover explains the unknown variable inline', strand);
const expHours = countKept((s, site, h) => h >= 3);
ok(new RegExp('showing ' + expHours + ' of 24').test(await countText()),
   'preview applies only the plain condition (' + expHours + ')', await countText());
await apply();
ok(await kept() === expHours, 'the chart is not emptied by the typo', String(await kept()));
ok(/formula not applied: scor >= 60 \(unknown variable "scor"/.test(await note()),
   'chart note says the formula was not applied and why', await note());
ok(/Formula not applied: scor >= 60/.test(await tip()), 'Filter button tooltip says so too', await tip());

// ---- case 6: a formula that gives text is pass-through too
console.log('case 6: text result');
await openMenu();
await page.fill('#ps-filtermenu input[data-filter-formula="0"]', 'site');
const strand2 = await page.evaluate(() =>
    (document.querySelector('#ps-filtermenu .ps-filter-stranded') || {}).textContent || '');
ok(/gives text, not true or false/.test(strand2), 'popover: a text result is not a condition', strand2);
await apply();
ok(await kept() === expHours, 'chart unchanged', String(await kept()));
ok(/formula not applied: site \(gives text, not true or false\)/.test(await note()),
   'note discloses the text result', await note());

// ---- case 7: reload, .pand and the setup file carry both shapes
console.log('case 7: persistence');
await openMenu();
await page.fill('#ps-filtermenu input[data-filter-formula="0"]', 'score >= 60 AND site == "East"');
await page.selectOption('#ps-filtermenu [data-filter-op="1"]', 'between');
await page.fill('#ps-filtermenu input[data-filter-value="1"]', '2');
await page.fill('#ps-filtermenu input[data-filter-value2="1"]', '5');
const expBoth = countKept((s, site, h) => s >= 60 && site === 'East' && h >= 2 && h <= 5);
await apply();
ok(await kept() === expBoth, 'formula + between apply together (' + expBoth + ')', String(await kept()));
await page.reload();
await page.waitForTimeout(900);
const reloaded = await page.evaluate(() => ({
    filters: JSON.stringify(window.PS_SHELL.project.table.filters),
    n: window.PS_SHELL.buildPayload().bars.reduce((a, b) => a + b.n, 0)
}));
ok(reloaded.n === expBoth && /"formula"/.test(reloaded.filters) && /"value2":5/.test(reloaded.filters),
   'both survive a reload', JSON.stringify(reloaded));
const fileText = await page.evaluate(() => window.PS_SHELL.projectText());
const tmp = '/tmp/ps-filter-formula.pand';
fs.writeFileSync(tmp, fileText);
const ctx2 = await browser.newContext();
const page2 = await ctx2.newPage();
await page2.goto(PAGE);
await page2.waitForTimeout(500);
await page2.click('#ps-welcome-new');
await page2.waitForTimeout(250);
await page2.setInputFiles('#ps-file', tmp);
await page2.waitForTimeout(900);
const pand = await page2.evaluate(() => ({
    filters: JSON.stringify(window.PS_SHELL.project.table.filters),
    n: window.PS_SHELL.buildPayload().bars.reduce((a, b) => a + b.n, 0)
}));
ok(pand.n === expBoth && /"formula"/.test(pand.filters), 'both ride a .pand file', JSON.stringify(pand));
await ctx2.close();
const setupText = await page.evaluate(() => window.PS_SHELL.setupText());
const setup = JSON.parse(setupText);
const sf = setup.filters || [];
ok(sf.some(x => x.formula === 'score >= 60 AND site == "East"') &&
   sf.some(x => x.op === 'between' && Array.isArray(x.value) && x.value.join() === '2,5'),
   'the setup file writes {formula} and value: [low, high]', JSON.stringify(sf));
const parsed = await page.evaluate(t => window.PS_SHELL.parseSetupText(t), setupText);
const pf = (parsed && parsed.setup && parsed.setup.filters) || [];
ok(pf.some(x => x.op === 'formula' && x.formula === 'score >= 60 AND site == "East"') &&
   pf.some(x => x.op === 'between' && x.col === 'hours' && String(x.value) === '2' && String(x.value2) === '5'),
   'the setup reader maps both shapes back', JSON.stringify(pf));
// the hand-written spellings the guide documents read too
const alt = await page.evaluate(() => window.PS_SHELL.parseSetupText(JSON.stringify({
    kind: 'pandion-plots-setup', formatVersion: 1, columns: [],
    filters: [{ formula: 'score > 1' }, { column: 'hours', op: 'outside', low: 1, high: 9 },
              { column: 'score', op: 'between', value: ['60', '70'] }, { column: 'score', op: '>=', value: 60 }],
    charts: [] })));
const af = (alt && alt.setup && alt.setup.filters) || [];
ok(af.length === 4 && af[0].op === 'formula' && af[1].op === 'outside' && String(af[1].value) === '1' &&
   String(af[1].value2) === '9' && af[2].op === 'between' && af[3].op === 'ge',
   'low/high keys, a [low, high] pair, a bare {formula} and a symbol op all parse', JSON.stringify(af));

// ---- case 8: renaming a column follows into the formula
console.log('case 8: rename follows');
await page.click('[data-ps-workspace="data"]');
await page.waitForTimeout(400);
await page.evaluate(() => { window.PS_SHELL.selectVariable && window.PS_SHELL.selectVariable('score'); });
await page.waitForTimeout(300);
await page.evaluate(() => {
    const input = document.getElementById('ps-variable-name');
    input.value = 'points';
    input.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(500);
const afterRename = await page.evaluate(() => ({
    cols: window.PS_SHELL.project.table.order.indexOf('points') !== -1,
    formula: (window.PS_SHELL.project.table.filters.find(f => f.op === 'formula') || {}).formula,
    n: window.PS_SHELL.buildPayload().bars.reduce((a, b) => a + b.n, 0)
}));
ok(!afterRename.cols || (afterRename.formula === 'points >= 60 AND site == "East"' && afterRename.n === expBoth),
   'the formula follows the rename and still applies', JSON.stringify(afterRename));

await clearAll();
ok(await kept() === 24, 'clear all restores every row');
if (errors.length) { console.log('  page errors: ' + errors.join(' | ')); fails++; }
await browser.close();
console.log(fails === 0 ? 'FILTER FORMULA CHECK: ALL GREEN' : fails + ' FAILURES');
process.exit(fails === 0 ? 0 : 1);
