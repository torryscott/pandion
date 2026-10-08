// A browser with NO larger store (Oct 5 2026, the 12,570 by 1,010 survey
// file). Since the large-project autosave landed (large-autosave-check.mjs),
// a project too large for localStorage normally goes to IndexedDB. This
// probe removes IndexedDB before the page loads and checks the fallback:
// the project is told so ONCE, in one notice that stays until answered,
// nothing is rebuilt on later changes, the large-file question waits for
// an answer, and Preferences names the limit that applies.
// Control: on main before these changes, case 1 fails (a toast fires on
// every interaction and the whole project is serialized each time).
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
const page = await browser.newPage({ viewport: { width: 1500, height: 960 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
// No larger store in this browser: the app must fall back to the warning.
await page.addInitScript(() => {
    try { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); } catch (e) {}
});
await page.goto(pageUrl);
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1300);
}
// Count every attempt to write the project, and every project-sized
// serialization, from here on.
await page.evaluate(() => {
    window.__writes = 0; window.__bigJson = 0;
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
        if (/psstandalone\.project/.test(k)) window.__writes++;
        return set.apply(this, arguments);
    };
    const str = JSON.stringify;
    JSON.stringify = function () {
        const out = str.apply(this, arguments);
        if (typeof out === 'string' && out.length > 3000000) window.__bigJson++;
        return out;
    };
});
const toastItems = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('#ps-toast .ps-toast-item')).map(n => ({
        text: n.childNodes[0] ? n.childNodes[0].textContent : n.textContent,
        buttons: Array.from(n.querySelectorAll('button')).map(b => b.textContent) })));
const counts = () => page.evaluate(() => ({ writes: window.__writes, big: window.__bigJson }));
const chip = () => page.evaluate(() => (document.getElementById('ps-save-state') || {}).textContent || '');
const statusLine = () => page.evaluate(() => (document.getElementById('ps-status-document') || {}).textContent || '');

console.log('case 1: a project that cannot fit is announced once and not rebuilt again');
// 4,000 rows by 320 columns of short values: about 1.3 million cells, well
// past what the browser keeps.
await page.evaluate(async () => {
    const cols = []; for (let c = 0; c < 320; c++) cols.push('v' + c);
    const rows = [];
    for (let r = 0; r < 4000; r++) { const row = new Array(320); for (let c = 0; c < 320; c++) row[c] = String((r * 7 + c * 13) % 97); rows.push(row); }
    window.PS_SHELL.loadTable('wide', cols, rows, null, null);
    await new Promise(r => setTimeout(r, 600));
});
let items = await toastItems();
let big = items.filter(i => /too large for browser autosave/.test(i.text));
ok(big.length === 1, 'one notice says the project is too large for browser autosave (' +
   JSON.stringify(items.map(i => i.text.slice(0, 50))) + ')');
ok(big.length === 1 && /about 5 MB/.test(big[0].text) && /\.pand/.test(big[0].text),
   'it names the limit and the fix');
ok(big.length === 1 && big[0].buttons.join('|') === 'Save to a file|Not now',
   'and offers Save to a file, with a way to put it aside (' + (big[0] ? big[0].buttons.join('|') : '') + ')');
ok(/Autosave unavailable/.test(await chip()), 'the chip says autosave is unavailable (' + await chip() + ')');
ok(/too large for browser autosave/.test(await statusLine()) && /Not saved yet/.test(await statusLine()),
   'the status line says the work is not saved yet (' + (await statusLine()).slice(0, 80) + ')');
const c0 = await counts();
// The things he did next: a chart, a style change, a cell edit.
await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    const S = window.PS_SHELL;
    S.setModule('distplotbuilder'); S.setRoles('distplotbuilder', { var: 'v3' }); await w(500);
    window.setOption('chartSpec', JSON.stringify({ barOpacity: 0.7 })); await w(500);
    S.setWorkspace('data'); await w(900);
    S.setWorkspace('chart'); await w(500);
});
const c1 = await counts();
ok(c1.writes === c0.writes, 'later changes make no attempt to write it (' + c0.writes + ' -> ' + c1.writes + ')');
ok(c1.big === c0.big, 'and never serialize the whole project again (' + c0.big + ' -> ' + c1.big + ')');
items = await toastItems();
ok(items.filter(i => /too large for browser autosave|storage is full/i.test(i.text)).length === 1,
   'the notice is not repeated');

console.log('case 2: the notice stays until answered, and the status line follows the file');
await page.waitForTimeout(9000);
items = await toastItems();
ok(items.some(i => /too large for browser autosave/.test(i.text)),
   'nine seconds on, the notice is still there to act on');
await page.evaluate(() => Array.from(document.querySelectorAll('#ps-toast .ps-toast-dismiss'))
    .find(b => b.textContent === 'Not now').click());
await page.waitForTimeout(300);
ok(!(await toastItems()).some(i => /too large for browser autosave/.test(i.text)), 'Not now puts it away');

console.log('case 3: Preferences names the limit that applies');
const pref = await page.evaluate(async () => {
    window.PS_SHELL.runCommand('preferences');
    await new Promise(r => setTimeout(r, 700));
    const l = document.getElementById('ps-pref-storage');
    return l ? l.textContent : '';
});
ok(/about\s+5 MB/.test(pref) && !/GB in total/.test(pref),
   'the storage line says about 5 MB, not the browser\'s whole budget (' + pref.slice(-150) + ')');
ok(/is not being autosaved/.test(pref), 'and says the open project is not being autosaved');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

console.log('case 4: the large-file question waits for an answer');
await page.evaluate(() => window.PS_SHELL.readPickedFile({ name: 'survey.csv', size: 60 * 1024 * 1024 }));
await page.waitForTimeout(7500);
items = await toastItems();
let q = items.filter(i => /survey\.csv/.test(i.text));
ok(q.length === 1 && q[0].buttons.join('|') === 'Read it anyway|Cancel',
   'seven seconds on, the question is still there, with Cancel beside it (' + JSON.stringify(q.map(x => x.buttons)) + ')');
await page.evaluate(() => window.PS_SHELL.readPickedFile({ name: 'survey2.csv', size: 61 * 1024 * 1024 }));
await page.waitForTimeout(300);
items = await toastItems();
ok(items.filter(i => /Read it anyway/.test(i.buttons.join())).length === 1 && items.some(i => /survey2\.csv/.test(i.text)),
   'choosing another large file replaces the question instead of stacking a second');
await page.evaluate(() => Array.from(document.querySelectorAll('#ps-toast .ps-toast-dismiss'))
    .find(b => b.textContent === 'Cancel').click());
await page.waitForTimeout(300);
ok(!(await toastItems()).some(i => /Read it anyway/.test(i.buttons.join())), 'Cancel puts it away');

console.log('case 5: once the table is small again, autosave resumes by itself');
const c2 = await counts();
await page.evaluate(async () => {
    window.PS_SHELL.loadTable('small', ['g', 'y'], [['a', '1'], ['b', '2'], ['a', '3']], null, null);
    await new Promise(r => setTimeout(r, 600));
});
const c3 = await counts();
ok(c3.writes > c2.writes, 'the next change writes the project (' + c2.writes + ' -> ' + c3.writes + ')');
ok(/Autosaved locally/.test(await chip()), 'and the chip says so (' + await chip() + ')');
ok(await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('psstandalone.project.v2')).table.order.join() === 'g,y'; } catch (e) { return false; } }),
   'the small table is what is in storage');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
if (failed) { console.log('LARGE PROJECT CHECK: ' + failed + ' failing'); await browser.close(); process.exit(1); }
console.log('LARGE PROJECT CHECK PASS');
await browser.close();
