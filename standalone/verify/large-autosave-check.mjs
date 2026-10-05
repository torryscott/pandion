// A project too large for localStorage is autosaved in the browser's larger
// store (Oct 5 2026, the 12,570 by 1,010 survey file). What must hold:
//   - a project that certainly cannot fit never builds the whole-project
//     string at all; it goes straight to the larger store, says nothing
//     alarming, and the chip reads Autosaved locally
//   - the data is kept one record per column, and a cell edit writes that
//     column and the small record, not the table
//   - a reload brings the project back from the larger store
//   - a smaller project replacing it hands the slot back to localStorage
//     and clears the larger store
//   - a project that only turns out not to fit (the write fails on quota)
//     is handed over the same way, without counting as a failed autosave
//   - Preferences says where the project is kept
// Control: on the tree before this change, case 1 fails (the too-large
// notice fires and nothing is written anywhere) and case 3 fails (a reload
// loses the project).
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
function note(msg) { console.log('  --  ' + msg); }
const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 960 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
// Counters that survive a reload: every project-sized serialization, every
// put into the larger store (by key), and every localStorage project write.
await page.addInitScript(() => {
    window.__bigJson = 0; window.__puts = []; window.__lsWrites = 0;
    const str = JSON.stringify;
    JSON.stringify = function () {
        const out = str.apply(this, arguments);
        if (typeof out === 'string' && out.length > 3000000) window.__bigJson++;
        return out;
    };
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (v, k) { window.__puts.push(String(k)); return put.apply(this, arguments); };
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k) {
        if (k === 'psstandalone.project.v2') window.__lsWrites++;
        return set.apply(this, arguments);
    };
});
// Start clean: the file:// origin's storage persists across runs in a
// persistent profile, but a fresh context has none. Belt and braces.
await page.goto(pageUrl);
await page.evaluate(() => new Promise(r => { try { localStorage.clear(); } catch (e) {} const q = indexedDB.deleteDatabase('ps-autosave'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
await page.goto(pageUrl);
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1300);
}
const big = () => page.evaluate(() => window.PS_SHELL.bigAutosave());
const chip = () => page.evaluate(() => (document.getElementById('ps-save-state') || {}).textContent || '');
const statusLine = () => page.evaluate(() => (document.getElementById('ps-status-document') || {}).textContent || '');
const toasts = () => page.evaluate(() => Array.from(document.querySelectorAll('#ps-toast .ps-toast-item')).map(n => n.textContent));
const marker = () => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('psstandalone.project.big.v1') || 'null'); } catch (e) { return 'bad'; } });
const slot = () => page.evaluate(() => localStorage.getItem('psstandalone.project.v2') !== null);
const settled = async (minWrites) => {
    await page.waitForFunction(n => { const b = window.PS_SHELL.bigAutosave(); return !b.pending && b.writes >= n; }, minWrites, { timeout: 20000 });
    return big();
};
const readStore = () => page.evaluate(() => new Promise(resolve => {
    const q = indexedDB.open('ps-autosave', 1);
    q.onerror = () => resolve(null);
    q.onsuccess = () => {
        const db = q.result;
        try {
            const tx = db.transaction('project', 'readonly'), st = tx.objectStore('project');
            const keys = st.getAllKeys(), meta = st.get('meta'), v3 = st.get('col:v3');
            tx.oncomplete = () => { db.close(); resolve({
                keys: keys.result.length, cols: keys.result.filter(k => String(k).startsWith('col:')).length,
                metaOrder: meta.result && meta.result.tableMeta ? meta.result.tableMeta.order.length : null,
                metaName: meta.result ? meta.result.name : null,
                charts: meta.result && meta.result.small ? meta.result.small.charts.length : null,
                v3: v3.result ? { len: v3.result.length, r2: v3.result[2] } : null }); };
            tx.onerror = () => { db.close(); resolve(null); };
        } catch (e) { db.close(); resolve(null); }
    };
}));
const loadWide = (rows, cols, width) => page.evaluate(async ([R, C, W]) => {
    const header = []; for (let c = 0; c < C; c++) header.push('v' + c);
    const body = [];
    for (let r = 0; r < R; r++) { const row = new Array(C); for (let c = 0; c < C; c++) row[c] = String((r * 7 + c * 13) % 97).padStart(W, '0'); body.push(row); }
    window.PS_SHELL.loadTable('wide', header, body, null, null);
    await new Promise(r => setTimeout(r, 400));
}, [rows, cols, width]);

console.log('case 1: a project that certainly cannot fit goes straight to the larger store');
// 4,000 rows by 320 columns: 1.28 million cells, past the room at any width.
await page.evaluate(() => { window.__bigJson = 0; window.__puts = []; window.__lsWrites = 0; });
await loadWide(4000, 320, 1);
let b = await settled(1);
ok(b.active && b.writes >= 1 && !b.unavailable, 'the larger store took the project (' + JSON.stringify(b) + ')');
ok(await page.evaluate(() => window.__bigJson) === 0, 'without ever building the whole-project string');
ok(await page.evaluate(() => window.__lsWrites) === 0, 'and without trying localStorage');
let m = await marker();
ok(m && m.id && m.cells === 4000 * 320, 'the marker names the project and its size (' + JSON.stringify(m) + ')');
ok(!(await slot()), 'the ordinary autosave slot is empty');
let st = await readStore();
ok(st && st.metaOrder === 320 && st.cols === 320 && st.v3 && st.v3.len === 4000,
   'the store holds the small record and one record per column (' + JSON.stringify(st) + ')');
ok(/Autosaved locally/.test(await chip()), 'the chip reads Autosaved locally (' + await chip() + ')');
ok(!(await toasts()).some(t => /too large for browser autosave|storage is full/i.test(t)),
   'and nothing warns about size');
ok(!/autosave failed/.test(await statusLine()), 'no failed autosave is counted (' + (await statusLine()).slice(0, 70) + ')');

console.log('case 2: a cell edit writes its column, not the table');
await page.evaluate(() => { window.PS_SHELL.setWorkspace('data'); });
await page.waitForTimeout(700);
const pt = await page.evaluate(() => {
    const td = Array.from(document.querySelectorAll('#ps-datagrid td[data-gc]'))
        .find(x => x.getAttribute('data-gc') === 'v3' && x.getAttribute('data-gr') === '2');
    const r = td.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.evaluate(() => { window.__puts = []; });
const before = (await big()).writes;
await page.mouse.click(pt.x, pt.y);
await page.waitForTimeout(150);
await page.keyboard.type('777');
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(200);
b = await big();
ok(b.pending, 'the write is owed right after the edit');
b = await settled(before + 1);
const puts = await page.evaluate(() => window.__puts);
// Selecting the cell persisted the small record on its own; the edit's
// write then carried the small record and the one column.
ok(puts.filter(k => k.startsWith('col:')).join(',') === 'col:v3' && puts.filter(k => k === 'meta').length <= 2,
   'the writes carried the small record and v3 only, never the other 319 columns (' + puts.join(', ') + ')');
st = await readStore();
ok(st && st.v3 && st.v3.r2 === '777', 'and the store has the new value (' + (st && st.v3 && st.v3.r2) + ')');
ok(!b.pending, 'nothing is owed afterwards');

console.log('case 3: a reload brings the project back from the larger store');
const t0 = Date.now();
await page.reload();
await page.waitForFunction(() => window.PS_SHELL && !window.PS_SHELL.bigAutosave().booting, null, { timeout: 30000 });
const ms = Date.now() - t0;
const back = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return { cols: t.order.length, rows: t.raw.v0.length, v3r2: t.raw.v3[2], name: t.name,
             busy: document.getElementById('ps-busy').classList.contains('ps-busy-on'),
             welcome: document.getElementById('ps-welcome').style.display,
             cont: (document.getElementById('ps-welcome-continue') || {}).style ? document.getElementById('ps-welcome-continue').style.display : '' };
});
ok(back.cols === 320 && back.rows === 4000 && back.name === 'wide', 'the table is back whole (' + back.cols + ' x ' + back.rows + ', ' + ms + ' ms)');
ok(back.v3r2 === '777', 'with the edit that was made before the reload');
ok(!back.busy, 'the busy curtain is down');
// This tab dismissed the start centre earlier in its session, so a reload
// does not show it again (the rule every restore follows). Opened by hand,
// it must offer Continue for the restored project.
ok(back.welcome !== 'flex', 'the start centre stays dismissed for this tab session, as after any reload');
const cont = await page.evaluate(async () => {
    window.PS_SHELL.runCommand('welcome');
    await new Promise(r => setTimeout(r, 300));
    const c = document.getElementById('ps-welcome-continue');
    return { shown: document.getElementById('ps-welcome').style.display, cont: c ? c.style.display : '',
             current: !!document.querySelector('.ps-recent-current') };
});
ok(cont.shown === 'flex' && cont.cont === 'flex', 'opened by hand, the start centre offers Continue (' + JSON.stringify(cont) + ')');
b = await big();
ok(b.active && !b.pending, 'the larger store is still the autosave slot (' + JSON.stringify(b) + ')');
await page.click('#ps-welcome-continue');
await page.waitForTimeout(400);
ok(/Autosaved locally/.test(await chip()), 'the chip reads Autosaved locally after Continue');
note('restore from the larger store took ' + ms + ' ms including boot');

console.log('case 4: Preferences says where the project is kept');
const pref = await page.evaluate(async () => {
    window.PS_SHELL.runCommand('preferences');
    await new Promise(r => setTimeout(r, 700));
    const l = document.getElementById('ps-pref-storage');
    return l ? l.textContent : '';
});
ok(/larger store/.test(pref) && /\.pand/.test(pref), 'the storage line names the larger store and the .pand copy (' + pref.slice(-160) + ')');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

console.log('case 5: a smaller project hands the slot back');
await page.evaluate(() => { window.__puts = []; });
await page.evaluate(() => window.PS_SHELL.loadSampleProject ? window.PS_SHELL.loadSampleProject() : null);
await page.evaluate(async () => {
    const header = ['a', 'b'], body = [];
    for (let r = 0; r < 20; r++) body.push([String(r), String(r * 2)]);
    window.PS_SHELL.loadTable('small', header, body, null, null);
    await new Promise(r => setTimeout(r, 400));
});
await page.waitForTimeout(600);
b = await big();
ok(!b.active, 'the larger store is no longer the slot');
ok((await marker()) === null, 'the marker is gone');
ok(await slot(), 'and the ordinary slot holds the project again');
st = await readStore();
ok(st && st.keys === 0, 'the larger store is empty (' + (st && st.keys) + ' records)');

console.log('case 6: a project that only turns out not to fit is handed over, not counted as a failure');
// 2,000 rows by 400 columns of eight-character values: 800,000 cells, which
// is not certainly too big, but about 9 million characters, which is.
await page.evaluate(() => { window.__bigJson = 0; window.__puts = []; window.__lsWrites = 0; });
await loadWide(2000, 400, 8);
b = await settled(1);
ok(b.active && b.writes >= 1, 'the larger store took it after the ordinary write failed (' + JSON.stringify(b) + ')');
ok(await page.evaluate(() => window.__lsWrites) >= 1, 'the ordinary write was tried first');
ok(!(await toasts()).some(t => /too large for browser autosave|storage is full/i.test(t)), 'nothing warned');
ok(!/autosave failed/.test(await statusLine()), 'and the handover did not count as a failed autosave (' + (await statusLine()).slice(0, 70) + ')');
ok(/Autosaved locally/.test(await chip()), 'the chip reads Autosaved locally');

ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
if (failed) { console.log('\nlarge-autosave-check: ' + failed + ' FAILED'); process.exit(1); }
console.log('\nlarge-autosave-check: all cases passed');
