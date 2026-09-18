// The Notebook's "Copy image" writes the clipboard INSIDE the click (Sep 18
// 2026, Torry's Safari report): Safari drops the user gesture while the page
// rasterizes, and a clipboard write after that gap is refused, so the
// ClipboardItem takes the PNG promise and the write happens synchronously,
// the chart-workspace pattern. The capability gate also says WHY it refused
// (no secure page vs no clipboard image support) instead of a blanket line.
//
// Cases: (1) a kept page copies as a PNG with the write issued in the click's
// own task; (2) with ClipboardItem missing the toast names the missing
// support; (3) with isSecureContext false the toast names the secure-page
// rule (skipped where the property cannot be shadowed). CONTROL (main before
// the fix): case 1's same-task assertion fails, the write landing only after
// rasterization; cases 2 and 3 fail on the wording.
//
// Usage: node standalone/verify/notebook-copy-check.mjs
import { createRequire } from 'node:module';
import path from 'node:path';

function loadPlaywright() {
    const bases = [];
    if (process.env.GB2_NODE_BASE) bases.push(process.env.GB2_NODE_BASE);
    bases.push(process.cwd(), new URL('.', import.meta.url).pathname, '/private/tmp', '/tmp');
    for (const b of bases) {
        try { return createRequire(path.join(b, 'x.js'))('playwright'); }
        catch { /* try the next shared dependency location */ }
    }
    console.error('playwright not found; cd /tmp && npm i playwright');
    process.exit(2);
}
const pw = loadPlaywright();
const PAGE = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
let failures = 0;
function ok(cond, label) { if (cond) console.log('  ok  ' + label); else { console.log('  FAIL ' + label); failures++; } }

for (const [name, type] of [['chromium', pw.chromium], ['webkit', pw.webkit]]) {
    let browser;
    try { browser = await type.launch(); } catch (e) { console.log('== ' + name + ': not installed, skipped'); continue; }
    console.log('== ' + name);
    const T = t => '[' + name + '] ' + t;
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(() => { try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); } catch (e) {} });
    await page.goto(PAGE); await page.waitForTimeout(700);
    if (await page.locator('#ps-welcome').isVisible().catch(() => false)) { await page.click('#ps-welcome-sample'); await page.waitForTimeout(1200); }
    // Seed one kept page (the pinboard-check idiom) and arm the capture.
    await page.evaluate(() => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="140"><rect width="240" height="140" fill="#eef"/><text x="12" y="70" font-family="sans-serif">kept page</text></svg>';
        const P = window.PS_SHELL.project;
        P.pinboards = [{ id: 'b1', name: 'Results', pins: [{ id: 'p1', src: 'data:image/svg+xml,' + encodeURIComponent(svg), natW: 240, natH: 140, w: 240, h: 140 }] }];
        P.ui.activeBoard = 'b1';
        window.PS_SHELL.setWorkspace('pinboard');
        window.__cp = { clickTaskEnded: null, writeInClickTask: null, items: [] };
        document.addEventListener('click', () => {
            window.__cp.clickTaskEnded = false;
            setTimeout(() => { window.__cp.clickTaskEnded = true; }, 0);
        }, true);
        navigator.clipboard.write = async (items) => {
            window.__cp.writeInClickTask = window.__cp.clickTaskEnded === false;
            for (const it of items) for (const t of it.types) {
                const blob = await it.getType(t);
                const buf = new Uint8Array(await blob.arrayBuffer());
                window.__cp.items.push({ type: t, size: buf.length, sig: Array.from(buf.slice(0, 8)).join(',') });
            }
        };
    });
    await page.waitForTimeout(600);
    const btn = page.locator('.ps-pinpage[data-pin-id="p1"] [data-pin-copy]');
    ok(await btn.count() === 1, T('the kept page carries its Copy image button'));
    await btn.click(); await page.waitForTimeout(2000);
    const r1 = await page.evaluate(() => ({ cp: window.__cp, toast: (document.getElementById('ps-toast') || {}).textContent || '' }));
    ok(r1.cp.writeInClickTask === true, T('the clipboard write is issued inside the click task, before the page rasterizes'));
    ok(r1.cp.items.length === 1 && r1.cp.items[0].type === 'image/png' && r1.cp.items[0].sig === '137,80,78,71,13,10,26,10' && r1.cp.items[0].size > 1000,
       T('and the item resolves to a real PNG (' + JSON.stringify(r1.cp.items) + ')'));
    ok(/Page copied/.test(r1.toast), T('confirmation toast (' + r1.toast.slice(0, 60) + ')'));
    // Gate wording: no ClipboardItem.
    await page.evaluate(() => { window.__savedCI = window.ClipboardItem; window.ClipboardItem = undefined; });
    await btn.click(); await page.waitForTimeout(400);
    const t2 = await page.evaluate(() => (document.getElementById('ps-toast') || {}).textContent || '');
    ok(/clipboard image support/.test(t2), T('without ClipboardItem the refusal names the missing support (' + t2.slice(0, 80) + ')'));
    await page.evaluate(() => { window.ClipboardItem = window.__savedCI; });
    // Gate wording: not a secure page (shadow the getter where the engine allows it).
    const shadowed = await page.evaluate(() => { try { Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true }); return window.isSecureContext === false; } catch (e) { return false; } });
    if (shadowed) {
        await page.evaluate(() => { const c = navigator.clipboard; window.__savedClip = c; Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); });
        await btn.click(); await page.waitForTimeout(400);
        const t3 = await page.evaluate(() => (document.getElementById('ps-toast') || {}).textContent || '');
        ok(/secure page/.test(t3), T('on a plain-http page the refusal names the secure-page rule (' + t3.slice(0, 80) + ')'));
    } else console.log('  --  ' + T('isSecureContext cannot be shadowed here; secure-page wording not exercised'));
    ok(errors.length === 0, T('no page errors' + (errors.length ? ' (' + errors[0] + ')' : '')));
    await page.close(); await browser.close();
}
console.log(failures ? 'notebook-copy: FAIL (' + failures + ')' : 'notebook-copy: PASS');
process.exit(failures ? 1 : 0);
