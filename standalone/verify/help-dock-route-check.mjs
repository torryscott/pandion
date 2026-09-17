// The status-line receipt reaches Check my graph with the panel docked
// beside the chart (Torry, Sep 17 2026: clicking the note at the bottom
// "brings up the basics panel, strobes several times and never moves to
// the check graph part").
//
// openEngineHelp drives the engine's own "?" button and [data-helpnav]
// tabs, polling every 60ms. engineHelpTab searched the chart host only;
// beside the chart the panel and its tabs live in the dock slot, so the
// poll never found them, re-clicked the "?" button on every step (open,
// shut, open: the strobe) and gave up on Basics with a false toast. The
// lookup now covers the dock slot too.
//
// Case (chromium + webkit), 1366x620 with the panel docked beside: a bar
// chart with a raised axis minimum, so Check my graph has a finding and
// the receipt shows; a real click on the receipt. Within 2.5s the panel
// shows Check my graph, the help panel opened once (no strobe), and no
// "create a chart first" toast fired. Same click with the panel under
// the chart still works. CONTROL (main's ps-shell.js): beside, the panel
// opens and shuts many times and ends on Basics.
//
// Usage: node standalone/verify/help-dock-route-check.mjs

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

async function run(browser, name, dock, w, h) {
    const T = t => '[' + name + ' ' + dock + '] ' + t;
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(d => { try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); localStorage.setItem('psstandalone.preferences.v1', JSON.stringify({ panelDock: d })); } catch (e) {} }, dock);
    await page.goto(PAGE); await page.waitForTimeout(700);
    if (await page.locator('#ps-welcome').isVisible().catch(() => false)) { await page.click('#ps-welcome-sample'); await page.waitForTimeout(1800); }
    try { const got = page.locator('button', { hasText: 'Got it' }).first(); if (await got.isVisible()) { await got.click(); await page.waitForTimeout(300); } } catch {}
    await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        PS_SHELL.setWorkspace('chart'); PS_SHELL.setModule('plotbuilder');
        PS_SHELL.setRoles('plotbuilder', { xvar: 'condition', yvar: 'score', groupVar: 'site' });
        await s(1500);
        // A raised axis minimum on a bar chart: a Check my graph warning.
        window.setOption('yMinOverride', true); window.setOption('yMin', 5);
        await s(2500);
    });
    const receipt = await page.evaluate(() => { const r = document.getElementById('ps-status-check'); return r && r.offsetParent ? { text: r.textContent.trim(), x: r.getBoundingClientRect().left + r.getBoundingClientRect().width / 2, y: r.getBoundingClientRect().top + r.getBoundingClientRect().height / 2 } : null; });
    ok(!!receipt, T('the status-line receipt shows a finding to look at (' + (receipt ? receipt.text.slice(0, 60) : 'absent') + ')'));
    if (!receipt) { await page.close(); return; }
    await page.evaluate(() => {
        window.__hr = { opens: 0, present: false, toasts: [] };
        const anyTab = () => !!document.querySelector('[data-helpnav]');
        const tick = () => { const p = anyTab(); if (p && !window.__hr.present) window.__hr.opens++; window.__hr.present = p; };
        new MutationObserver(tick).observe(document.body, { childList: true, subtree: true });
        new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && /toast/i.test(n.className || '')) window.__hr.toasts.push(n.textContent.trim()); }).observe(document.body, { childList: true, subtree: true });
    });
    await page.mouse.click(receipt.x, receipt.y);
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => {
        const title = document.querySelector('[data-gb2-inspector] [data-role="inspector-title"]');
        const lint = document.querySelector('[data-gb2-inspector] [data-helpnav="graphLint"]');
        const slot = document.getElementById('ps-engine-dock-slot');
        const panel = document.querySelector('[data-gb2-inspector]');
        return { title: title ? title.textContent.trim() : null, opens: window.__hr.opens, toasts: window.__hr.toasts, hasLintTab: !!lint, beside: !!(panel && slot && slot.contains(panel)) };
    });
    ok(/Check my graph/i.test(r.title || ''), T('the panel ends on Check my graph (title "' + r.title + '")'));
    ok(r.opens >= 1 && r.opens <= 2, T('the help panel opened once, no strobe (' + r.opens + ' openings)'));
    ok(!r.toasts.some(t => /chart first|variables/i.test(t)), T('no false "create a chart first" toast (' + JSON.stringify(r.toasts) + ')'));
    ok(dock !== 'beside' || r.beside, T('the panel sits where the dock preference put it'));
    ok(errors.length === 0, T('no page errors' + (errors.length ? ' (' + errors[0] + ')' : '')));
    await page.close();
}
for (const [name, type] of [['chromium', pw.chromium], ['webkit', pw.webkit]]) {
    let browser;
    try { browser = await type.launch(); } catch (e) { console.log('== ' + name + ': not installed, skipped'); continue; }
    console.log('== ' + name);
    await run(browser, name, 'beside', 1366, 620);
    await run(browser, name, 'below', 1470, 800);
    await browser.close();
}
console.log(failures ? 'help-dock-route: FAIL (' + failures + ')' : 'help-dock-route: PASS');
process.exit(failures ? 1 : 0);
