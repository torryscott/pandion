// Row filters say why each row is out (Oct 2026, step 1 of the filter
// follow-ups): the popover's live count carries a breakdown by cause,
// "Show the N rows this leaves out" lists each row with the first
// condition it fails or the column it was missing, the row number scrolls
// the grid there, and the grid's dimmed rows carry the same reason as
// their tooltip. Cases drive the real popover on a fixture with gaps.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

function loadPlaywright() {
    for (const base of [process.env.GB2_NODE_BASE, process.cwd(),
                        new URL('.', import.meta.url).pathname, '/private/tmp', '/tmp']
            .filter(Boolean)) {
        try { return createRequire(path.join(base, 'x.js'))('playwright'); }
        catch { /* try the next shared dependency location */ }
    }
    console.error('playwright not found');
    process.exit(2);
}
function axePath() {
    for (const base of [process.env.GB2_NODE_BASE, '/private/tmp', '/tmp'].filter(Boolean)) {
        const p = path.join(base, 'node_modules', 'axe-core', 'axe.min.js');
        if (fs.existsSync(p)) return p;
    }
    return null;
}
let failures = 0;
function ok(cond, msg) {
    if (cond) console.log('  ok  ' + msg);
    else { console.log(' FAIL ' + msg); failures++; }
}
const { chromium } = loadPlaywright();
const root = path.resolve(new URL('.', import.meta.url).pathname, '..', '..');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto('file://' + path.join(root, 'standalone', 'index.html'));
await page.waitForTimeout(600);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1200);
}
// age: 34 29 - 41 37 23 - 31 ; grp: Control control Treatment Treatment Control Treatment Control Treatment
await page.evaluate(() => {
    window.PS_SHELL.loadTable('why', ['score', 'age', 'grp'],
        [['61', '34', 'Control'], ['55', '29', 'control'], ['68', '', 'Treatment'],
         ['58', '41', 'Treatment'], ['64', '37', 'Control'], ['52', '23', 'Treatment'],
         ['59', '', 'Control'], ['66', '31', 'Treatment']],
        { score: 'continuous', age: 'continuous', grp: 'nominal' });
});
await page.waitForTimeout(300);
const pop = () => page.evaluate(() => {
    const m = document.getElementById('ps-filtermenu');
    const btn = m.querySelector('[data-filter-out-toggle]');
    return {
        open: m.style.display === 'block',
        count: (m.querySelector('[data-filter-count]') || {}).textContent || '',
        toggle: btn ? btn.textContent : null,
        expanded: btn ? btn.getAttribute('aria-expanded') : null,
        controls: btn ? btn.getAttribute('aria-controls') : null,
        items: Array.from(m.querySelectorAll('#ps-filter-outlist li')).map(li => li.textContent.replace(/\s+/g, ' ').trim()),
        listPresent: !!m.querySelector('#ps-filter-outlist'),
    };
});
async function openPopover() {
    await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
    await page.waitForTimeout(200);
    await page.click('#ps-data-filter-btn');
    await page.waitForTimeout(250);
}
async function setRow(idx, col, op, value) {
    // PROBE LAW: set the column first (its change re-renders the row), then the operator, then the value.
    await page.selectOption(`#ps-filtermenu select[data-filter-col="${idx}"]`, col);
    await page.waitForTimeout(120);
    if (op) { await page.selectOption(`#ps-filtermenu select[data-filter-op="${idx}"]`, op); await page.waitForTimeout(120); }
    if (value !== undefined) {
        // A text column's value control is a select of its levels; a numeric column's is an input.
        const sel = `#ps-filtermenu [data-filter-value="${idx}"]`;
        const tag = await page.evaluate(s => (document.querySelector(s) || {}).tagName, sel);
        if (tag === 'SELECT') await page.selectOption(sel, value); else await page.fill(sel, value);
        await page.waitForTimeout(150);
    }
}

console.log('case 1: the live count says how many fail and how many were missing a value');
await openPopover();
await setRow(0, 'age', 'ge', '30');
let s = await pop();
ok(s.count === 'showing 4 of 8 rows (2 fail a condition, 2 left out because age is missing)',
   `the breakdown names the cause and the column (${s.count})`);
ok(s.toggle === 'Show the 4 rows this leaves out' && s.expanded === 'false' && s.controls === 'ps-filter-outlist' && !s.listPresent,
   `a disclosure offers the list, folded (${s.toggle})`);

console.log('case 2: the list names each row with the condition it fails or the value it was missing');
await page.click('#ps-filtermenu [data-filter-out-toggle]');
await page.waitForTimeout(150);
s = await pop();
ok(s.expanded === 'true' && s.toggle === 'Hide the 4 rows this leaves out', 'the disclosure reads expanded');
ok(JSON.stringify(s.items) === JSON.stringify([
    'Row 2 age ≥ 30 fails (age = 29)', 'Row 3 age is missing',
    'Row 6 age ≥ 30 fails (age = 23)', 'Row 7 age is missing']),
   `four rows, each with its reason (${JSON.stringify(s.items)})`);
const focused = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-filter-out-toggle') !== null);
ok(focused, 'focus stays on the disclosure after the rebuild');

console.log('case 3: with two conditions the FIRST failing one is named, in list order');
await page.click('#ps-filtermenu button:has-text("Add condition")');
await page.waitForTimeout(200);
await setRow(1, 'grp', 'eq', 'Control');
s = await pop();
ok(s.count === 'showing 2 of 8 rows (4 fail a condition, 2 left out because age is missing)', `count (${s.count})`);
ok(s.items[2] === 'Row 4 grp = "Control" fails (grp = "Treatment")' && s.items[0] === 'Row 2 age ≥ 30 fails (age = 29)',
   `row 4 passes age and fails grp; row 2 fails age first (${s.items[2]} / ${s.items[0]})`);
ok(s.expanded === 'true' && s.items.length === 6, 'the list stays unfolded across edits and grows with them');

console.log('case 4: a formula condition names the missing column, or says it is false');
await page.selectOption('#ps-filtermenu select[data-filter-col="1"]', '__formula__');
await page.waitForTimeout(200);
await page.fill('#ps-filtermenu input[data-filter-formula="1"]', 'score > 60 AND age > 30');
await page.waitForTimeout(200);
s = await pop();
ok(s.items.indexOf('Row 3 age is missing') !== -1 && s.items.indexOf('Row 4 score > 60 AND age > 30 is false') !== -1,
   `a false formula says so; the first condition still claims the missing rows (${JSON.stringify(s.items)})`);
await setRow(0, 'score', 'ge', '0');
s = await pop();
ok(s.items.indexOf('Row 3 score > 60 AND age > 30: age is missing') !== -1,
   `when the formula is the first to meet the gap it names the missing column (${JSON.stringify(s.items)})`);
ok(/left out because age is missing\)$/.test(s.count), `the breakdown attributes the gap through the formula (${s.count})`);

console.log('case 5: Apply paints the reasons onto the dimmed grid rows and the Filter tooltip');
await page.click('#ps-filtermenu [data-filter-apply]');
await page.waitForTimeout(400);
const grid = await page.evaluate(() => {
    const tds = Array.from(document.querySelectorAll('#ps-datagrid td.ps-grid-row-filtered'));
    const byRow = {};
    tds.forEach(td => { const m = /ps-grid-cell-(\d+)-/.exec(td.id || ''); if (m) byRow[m[1]] = td.getAttribute('data-tip'); });
    return { n: tds.length, byRow, btn: document.getElementById('ps-data-filter-btn').getAttribute('data-tip') };
});
ok(grid.n > 0 && /^Left out by the active row filter: score > 60 AND age > 30: age is missing\. The row stays/.test(grid.byRow['2'] || ''),
   `row 3's cells say why (${grid.byRow['2']})`);
ok(/^Left out by the active row filter: score > 60 AND age > 30 is false\./.test(grid.byRow['1'] || ''),
   `row 2's cells say the formula is false (${grid.byRow['1']})`);
// Row 7 has score 59, so the formula's AND stops at the false left side
// and never reads the missing age: a plain false, not a missing-value drop.
ok(/5 rows out \(4 fail a condition, 1 left out because age is missing\)/.test(grid.btn || ''),
   `the Filter button tooltip carries the breakdown (${grid.btn})`);

console.log('case 6: the row number scrolls the grid to the row; long lists are capped');
await page.evaluate(() => {
    const rows = [];
    for (let i = 1; i <= 60; i++) rows.push([String(i), String(i)]);
    window.PS_SHELL.loadTable('long', ['id', 'age'], rows, { id: 'continuous', age: 'continuous' });
});
await page.waitForTimeout(300);
await openPopover();
await setRow(0, 'age', 'le', '40');
await page.click('#ps-filtermenu [data-filter-out-toggle]');
await page.waitForTimeout(150);
s = await pop();
ok(s.count === 'showing 40 of 60 rows (20 fail a condition)' && s.items.length === 20 && s.items[0] === 'Row 41 age ≤ 40 fails (age = 41)',
   `rows 41 to 60 listed (${s.count}; ${s.items[0]})`);
const before = await page.evaluate(() => document.getElementById('ps-datagrid').scrollTop);
await page.click('#ps-filtermenu .ps-filter-outrow[data-filter-row="54"]');
await page.waitForTimeout(600);
const after = await page.evaluate(() => ({ top: document.getElementById('ps-datagrid').scrollTop,
    rowThere: !!document.getElementById('ps-grid-row-54'), popOpen: document.getElementById('ps-filtermenu').style.display === 'block' }));
ok(after.top > before && after.rowThere && after.popOpen, `Row 55 scrolls the grid to it and keeps the popover (${before} -> ${after.top})`);
await setRow(0, 'age', 'ge', '1000');
s = await pop();
ok(s.items.length === 21 && s.items[20] === 'and 40 more' && s.toggle === 'Hide the 60 rows this leaves out',
   `sixty dropped rows list twenty and say how many more (${JSON.stringify({ n: s.items.length, last: s.items[s.items.length - 1], toggle: s.toggle, expanded: s.expanded, count: s.count })})`);

console.log('case 7: the popover with the list open passes the accessibility audit');
const axe = axePath();
if (!axe) console.log('  --  axe-core not found beside playwright; audit skipped');
else {
    await page.addScriptTag({ path: axe });
    const res = await page.evaluate(async () => {
        const r = await window.axe.run(document.getElementById('ps-filtermenu'), {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
        return r.violations.map(v => v.id + ': ' + v.nodes.map(n => n.target.join(' ')).join(', '));
    });
    ok(res.length === 0, 'zero axe violations in the popover' + (res.length ? ': ' + res.join(' | ') : ''));
}
await page.keyboard.press('Escape');
ok(errors.length === 0, 'zero page errors (' + errors.join('; ') + ')');

await browser.close();
console.log(failures ? `FILTER REASONS CHECK: ${failures} FAILURE(S)` : 'FILTER REASONS CHECK PASS');
process.exit(failures ? 1 : 0);
