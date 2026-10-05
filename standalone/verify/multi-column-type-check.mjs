// Several selected columns change measure type together (Oct 4 2026, a
// colleague's ask; jamovi does this natively). The type menu opened from a
// header badge inside a column selection names the set and applies the pick
// to all of them: one undo mark, one retype, the lost-values warning summed.
// A badge outside the selection, or with no column selection, still changes
// that one column.
// Control: on main, case 1 fails because only the clicked column changes.
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
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1500);
}
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(700);
const types = () => page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    const o = {}; t.order.forEach(c => { o[c] = t.types[c]; }); return o;
});
const headPoint = col => page.evaluate(c => {
    const th = Array.from(document.querySelectorAll('#ps-datagrid th[data-grid-col]'))
        .find(h => h.getAttribute('data-grid-col') === c);
    const r = th.getBoundingClientRect();
    const b = th.querySelector('[data-grid-type]').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, bx: b.left + b.width / 2, by: b.top + b.height / 2 };
}, col);
const menu = () => page.evaluate(() => {
    const m = document.getElementById('ps-typemenu');
    return { open: m.style.display === 'block', head: (m.querySelector('.ps-tm-head') || {}).textContent || '',
             cur: Array.from(m.querySelectorAll('button.ps-tm-cur')).map(b => b.getAttribute('data-type')) };
});
const pick = type => page.evaluate(ty => {
    document.querySelector('#ps-typemenu button[data-type="' + ty + '"]').click();
}, type);
const toast = () => page.evaluate(() => (document.getElementById('ps-toast') || {}).textContent || '');
// page.mouse.click takes no modifiers; hold Shift around the click.
async function shiftClick(x, y) {
    await page.keyboard.down('Shift');
    await page.mouse.click(x, y);
    await page.keyboard.up('Shift');
}
const t0 = await types();
ok(t0.score === 'continuous' && t0.hours === 'continuous' && t0.condition === 'nominal' && t0.site === 'nominal',
   'setup: score and hours are continuous, condition and site nominal');

console.log('case 1: a badge inside a two-column selection changes both');
let p = await headPoint('score');
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(200);
p = await headPoint('hours');
await shiftClick(p.x, p.y);
await page.waitForTimeout(200);
const selDbg = await page.evaluate(() => ({ cols: window.PS_SHELL.selectedColumns(), sel: window.PS_SHELL.gridSelection() }));
ok(selDbg.cols.join() === 'score,hours',
   'setup: score and hours are selected (' + JSON.stringify(selDbg) + ')');
await page.mouse.click(p.bx, p.by);
await page.waitForTimeout(300);
let m = await menu();
ok(m.open && /2 variables/.test(m.head) && /score/.test(m.head) && /hours/.test(m.head),
   'the type menu names both (' + m.head + ')');
ok(m.cur.join() === 'continuous', 'and marks their shared type as current');
await pick('nominal');
await page.waitForTimeout(600);
let t1 = await types();
ok(t1.score === 'nominal' && t1.hours === 'nominal', 'both are nominal now');
ok(t1.condition === 'nominal' && t1.site === 'nominal', 'and the columns outside the selection are untouched');

console.log('case 2: one Undo restores both');
await page.keyboard.press(MOD + '+z');
await page.waitForTimeout(700);
let t2 = await types();
ok(t2.score === 'continuous' && t2.hours === 'continuous', 'score and hours are continuous again after one Undo');

console.log('case 3: the lost-values warning is summed over the set');
p = await headPoint('condition');
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(200);
p = await headPoint('site');
await shiftClick(p.x, p.y);
await page.waitForTimeout(200);
await page.mouse.click(p.bx, p.by);
await page.waitForTimeout(300);
await pick('continuous');
await page.waitForTimeout(600);
const t3 = await types();
const tx = await toast();
ok(t3.condition === 'continuous' && t3.site === 'continuous', 'condition and site are continuous (and empty)');
ok(/condition and site are now Continuous/.test(tx) && /columns are empty/.test(tx),
   'the warning names both and says the columns are empty (' + tx.trim().slice(0, 90) + ')');
await page.keyboard.press(MOD + '+z');
await page.waitForTimeout(700);
ok((await types()).condition === 'nominal' && (await types()).site === 'nominal', 'one Undo brings both back');

console.log('case 4: a badge outside the selection changes that column alone');
p = await headPoint('score');
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(200);
p = await headPoint('hours');
await shiftClick(p.x, p.y);
await page.waitForTimeout(200);
p = await headPoint('site');
await page.mouse.click(p.bx, p.by);
await page.waitForTimeout(300);
m = await menu();
ok(m.open && m.head.trim() === 'site', 'the menu for a column outside the selection names only it (' + m.head + ')');
await pick('ordinal');
await page.waitForTimeout(600);
const t4 = await types();
ok(t4.site === 'ordinal' && t4.score === 'continuous' && t4.hours === 'continuous', 'only site changed');

console.log('case 5: mixed current types mark nothing as current');
await page.keyboard.press('Escape');
p = await headPoint('hours');
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(200);
p = await headPoint('site');
await shiftClick(p.x, p.y);
await page.waitForTimeout(200);
await page.mouse.click(p.bx, p.by);
await page.waitForTimeout(300);
m = await menu();
ok(m.open && /2 variables/.test(m.head) && m.cur.length === 0,
   'hours (continuous) and site (ordinal) share no current type (' + JSON.stringify(m) + ')');
await page.keyboard.press('Escape');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('MULTI COLUMN TYPE CHECK PASS');
await browser.close();
