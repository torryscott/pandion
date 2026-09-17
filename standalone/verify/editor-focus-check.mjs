// The inline text editor opens without moving the pane (Sep 16 2026;
// filed Sep 14 by the adversarial review of the Safari chart-shift fix).
//
// Double-clicking a label drops a textarea over it and focuses it a tick
// later. A plain focus() also scrolls the nearest scrolling pane to
// reveal the textarea, so a label within a few pixels of the pane's
// bottom edge moved the chart the moment its editor opened. The focus
// now passes preventScroll: the label the user just clicked is on
// screen by construction.
//
// Case (chromium + webkit), with the editing panel docked BESIDE the
// chart (a panel under the chart would be revealed by the shell's own
// scroll on the click, which is by design and not this item): a tall
// chart in a pane scrolled so a category label's box ends 4px above the
// pane's bottom edge; a real double-click on the label. The editor opens
// and the pane's scroll position is unchanged. CONTROL (main's engine):
// the focus reveal scrolls the pane.
//
// Usage: node standalone/verify/editor-focus-check.mjs

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

async function engineRun(name, type) {
    let browser;
    try { browser = await type.launch(); } catch (e) { console.log('== ' + name + ': not installed, skipped'); return; }
    console.log('== ' + name);
    const T = t => '[' + name + '] ' + t;
    const page = await browser.newPage({ viewport: { width: 1366, height: 620 } });
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(() => { try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); localStorage.setItem('psstandalone.preferences.v1', JSON.stringify({ panelDock: 'beside' })); } catch (e) {} });
    await page.goto(PAGE); await page.waitForTimeout(700);
    if (await page.locator('#ps-welcome').isVisible().catch(() => false)) { await page.click('#ps-welcome-sample'); await page.waitForTimeout(1800); }
    try { const got = page.locator('button', { hasText: 'Got it' }).first(); if (await got.isVisible()) { await got.click(); await page.waitForTimeout(300); } } catch {}
    await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        PS_SHELL.setWorkspace('chart'); PS_SHELL.setModule('plotbuilder');
        PS_SHELL.setRoles('plotbuilder', { xvar: 'condition', yvar: 'score', groupVar: 'site' });
        await s(1200);
        // A tall chart at 100% view zoom (Fit would shrink it to the
        // pane), so the pane has room to scroll.
        window.setOption('plotHeight', 7.5);
        await s(2200);
        const sel = document.querySelector('#ps-charttools select') ||
            Array.from(document.querySelectorAll('select')).find(x => Array.from(x.options).some(o => o.value === 'fit'));
        if (sel) { sel.value = '1'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
        await s(600);
    });
    // Select the label first: the panel going live beside the chart resets
    // the pane to the top by design (syncDockLive), and that must happen
    // before the scroll position this case measures is set.
    const first = await page.evaluate(() => { const lbl = document.querySelector('#psroot svg text[data-role="x-cat-label"]'); const r = lbl.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.click(first.x, first.y);
    await page.waitForTimeout(1200);
    // Now scroll the pane so that same label ends 4px above the pane's bottom edge.
    const t = await page.evaluate(() => {
        const sc = document.getElementById('ps-main-workspace');
        const lbl = document.querySelector('#psroot svg text[data-role="x-cat-label"]');
        if (!lbl) return null;
        const pr = sc.getBoundingClientRect();
        let r = lbl.getBoundingClientRect();
        sc.scrollTop += (r.bottom - pr.bottom + 4);
        r = lbl.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, gap: pr.bottom - r.bottom, st: sc.scrollTop, max: sc.scrollHeight - sc.clientHeight };
    });
    ok(!!t && t.st > 0 && t.gap >= 0 && t.gap <= 8, T('a category label sits ' + (t ? t.gap.toFixed(1) : '?') + 'px above the pane\'s bottom edge (scrollTop ' + (t ? t.st : '?') + ' of ' + (t ? t.max : '?') + ')'));
    if (!t) { await page.close(); await browser.close(); return; }
    await page.mouse.dblclick(t.x, t.y);
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
        const sc = document.getElementById('ps-main-workspace');
        const ed = document.querySelector('[data-role="inline-text-editor"], .gb2-inline-editor, textarea[data-role="gb2-inline-editor"]') || Array.from(document.querySelectorAll('textarea')).find(x => x.offsetParent && x.closest('.graphbuilder2-host'));
        return { st: sc.scrollTop, editor: !!ed, focused: document.activeElement && document.activeElement.tagName };
    });
    const beside = await page.evaluate(() => { const p = document.querySelector('[data-gb2-inspector]'); const slot = document.getElementById('ps-engine-dock-slot'); return !!(p && slot && slot.contains(p)); });
    ok(beside, T('the editing panel is beside the chart, so no panel reveal scrolls the pane'));
    ok(r.editor, T('the inline editor opened (focus on ' + r.focused + ')'));
    ok(r.st === t.st, T('the pane did not move when the editor opened (' + t.st + ' -> ' + r.st + ')'));
    await page.keyboard.press('Escape');
    ok(errors.length === 0, T('no page errors' + (errors.length ? ' (' + errors[0] + ')' : '')));
    await page.close(); await browser.close();
}
await engineRun('chromium', pw.chromium);
await engineRun('webkit', pw.webkit);
console.log(failures ? 'editor-focus: FAIL (' + failures + ')' : 'editor-focus: PASS');
process.exit(failures ? 1 : 0);
