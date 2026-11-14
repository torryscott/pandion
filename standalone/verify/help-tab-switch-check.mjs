// A help request switches the open help panel to the tab it asked for.
// Oct 1 2026 report, reproduced with Playwright at 1440x900. With Check my
// graph open from the status-line receipt, Help > "Which graph should I
// use?" CLOSED the panel and opened nothing, and a second try worked. The
// receipt over Which graph? did the same in reverse.
//
// Not a toggle, and not a stale __gb2_helpPanelLive. A trace of the
// inspector selection shows ["graphChooser"] set by the tab and cleared
// 3ms later by the engine's document click listener, with the menu row as
// the click's target. openEngineHelp runs INSIDE the click that asked for
// help; with a help panel open, its first step clicks the requested
// [data-helpnav] tab at once and the engine switches. That same click then
// bubbles on to the document, where the engine closes its panel on any
// click outside it. With no help panel open the first step clicks the "?"
// button instead, and the 60ms poll reopened the panel after the bubble
// had closed it, which is why that route looked fine.
//
// A repeat request closed the panel by the same accident, and only in
// some browsers. WebKit's keyboard clicks carry the button's coordinates,
// Chromium's carry (0,0), which the engine's phantom-click guard ignores,
// so Enter on Help > Check my chart, with Check my graph showing, closed
// it in Safari and left it open in Chrome. A request now always leaves the
// tab it asked for showing.
//
// Cases (chromium + webkit, panel under the chart at 1440x900 and docked
// beside it at 1366x620), every gesture a real one:
//   1. the receipt opens Check my graph
//   2. Help > Which graph should I use? over it switches, and stays
//   3. the receipt over Which graph? switches back, and stays
//   4. Glossary, Chart basics, Label the chart parts and Which graph? from
//      the Help menu each switch the open panel
//   5. a repeat request (the receipt, then Help > Check my chart) leaves
//      Check my graph showing
//   6. the keyboard route (Help menu, arrows, Enter) switches it
//   7. a command palette row switches it
//   8. a genuine click outside the panel still closes it
// CONTROL (main's ps-shell.js, and PS_PAGE=website/app/index.html built
// from main): cases 2 to 5 and 7 end with the panel closed in both
// browsers, case 6 in webkit, 34 failures. Glossary in case 4 passes
// either way. Its search box takes focus, and the engine keeps a panel
// open while focus is inside it, so it is not the tab that shows the bug.
//
// Usage: node standalone/verify/help-tab-switch-check.mjs

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

// The Help menu rows and the engine tab each one asks for.
const MENU = {
    'help-basics': 'help', 'help-chooser': 'graphChooser', 'help-lint': 'graphLint',
    'help-anatomy': 'anatomy', 'help-glossary': 'glossary'
};

async function run(browser, name, dock, w, h) {
    const T = t => '[' + name + ' ' + dock + '] ' + t;
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(d => { try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); localStorage.setItem('psstandalone.preferences.v1', JSON.stringify({ panelDock: d })); } catch (e) {} }, dock);
    await page.goto(PAGE); await page.waitForTimeout(700);
    if (await page.locator('#ps-welcome').isVisible().catch(() => false)) { await page.click('#ps-welcome-sample'); await page.waitForTimeout(1800); }
    try { const got = page.locator('button', { hasText: 'Got it' }).first(); if (await got.isVisible()) { await got.click(); await page.waitForTimeout(300); } } catch {}
    // The report's chart: Compare Groups, condition by score.
    await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        PS_SHELL.setWorkspace('chart'); PS_SHELL.setModule('plotbuilder');
        PS_SHELL.setRoles('plotbuilder', { xvar: 'condition', yvar: 'score' });
        await s(2500);
    });

    // Which help tab the panel shows: 'closed', the active [data-helpnav]
    // key, or 'other' for a panel with no help tabs. A closing panel keeps
    // its content for the 170ms slide, so callers hold before trusting it.
    const showing = () => page.evaluate(() => {
        const p = Array.from(document.querySelectorAll('[data-gb2-inspector]'))
            .find(x => x.style.display !== 'none' && x.getBoundingClientRect().height > 20);
        if (!p) return 'closed';
        const act = Array.from(p.querySelectorAll('[data-helpnav]')).find(b => b.style.fontWeight === '600');
        return act ? act.getAttribute('data-helpnav') : 'other';
    });
    // Waits for the panel to show `key`, then holds past the slide and the
    // poll so a close that follows the switch is caught.
    const settlesOn = async (key) => {
        let now = await showing();
        for (let i = 0; i < 25 && now !== key; i++) { await page.waitForTimeout(80); now = await showing(); }
        if (now !== key) return now;
        await page.waitForTimeout(700);
        return await showing();
    };
    const menu = async (cmd) => {
        await page.click('[data-ps-menu="help"]');
        await page.waitForTimeout(250);
        await page.click('#ps-appmenu [data-app-command="' + cmd + '"]');
    };
    const receipt = () => page.click('#ps-status-check');
    // Setup only: close whatever is open (the engine's own hook) and open
    // `cmd` from the closed state, the route that worked before the fix.
    const fresh = async (cmd) => {
        await page.evaluate(() => { try { window.__gb2_inspectorClear(); } catch (e) {} });
        await page.waitForTimeout(400);
        await menu(cmd);
        return settlesOn(MENU[cmd]);
    };

    const pill = await page.evaluate(() => { const r = document.getElementById('ps-status-check'); return r && !r.hidden && r.offsetParent ? r.textContent.trim() : null; });
    ok(!!pill, T('the status line shows the receipt (' + pill + ')'));
    if (!pill) { await page.close(); return; }

    console.log(T('case 1: the receipt opens Check my graph'));
    await receipt();
    let s = await settlesOn('graphLint');
    ok(s === 'graphLint', T('the receipt opens Check my graph (' + s + ')'));

    console.log(T('case 2: Help > Which graph should I use? over Check my graph'));
    if (s !== 'graphLint') s = await fresh('help-lint');
    await menu('help-chooser');
    s = await settlesOn('graphChooser');
    ok(s === 'graphChooser', T('the panel switches to Which graph? and stays open (' + s + ')'));

    console.log(T('case 3: the receipt over Which graph?'));
    if (s !== 'graphChooser') s = await fresh('help-chooser');
    await receipt();
    s = await settlesOn('graphLint');
    ok(s === 'graphLint', T('the panel switches to Check my graph and stays open (' + s + ')'));

    console.log(T('case 4: every Help menu row switches the open panel'));
    if (s !== 'graphLint') s = await fresh('help-lint');
    for (const cmd of ['help-glossary', 'help-basics', 'help-anatomy', 'help-chooser']) {
        if (s === 'closed') s = await fresh(cmd === 'help-basics' ? 'help-lint' : 'help-basics');
        await menu(cmd);
        s = await settlesOn(MENU[cmd]);
        ok(s === MENU[cmd], T(cmd + ' switches the open panel to ' + MENU[cmd] + ' (' + s + ')'));
    }

    console.log(T('case 5: a repeat request leaves the tab showing'));
    s = await fresh('help-lint');
    await receipt();
    s = await settlesOn('graphLint');
    ok(s === 'graphLint', T('the receipt over Check my graph leaves it open (' + s + ')'));
    if (s !== 'graphLint') s = await fresh('help-lint');
    await menu('help-lint');
    s = await settlesOn('graphLint');
    ok(s === 'graphLint', T('Help > Check my chart over it leaves it open (' + s + ')'));

    console.log(T('case 6: the keyboard route'));
    s = await fresh('help-chooser');
    await page.focus('[data-ps-menu="help"]');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    let reached = false;
    for (let i = 0; i < 30 && !reached; i++) {
        reached = await page.evaluate(() => { const a = document.activeElement; return !!(a && a.getAttribute('data-app-command') === 'help-lint'); });
        if (!reached) await page.keyboard.press('ArrowDown');
    }
    ok(reached, T('arrows reach Check my chart in the Help menu'));
    await page.keyboard.press('Enter');
    s = await settlesOn('graphLint');
    ok(s === 'graphLint', T('Enter switches Which graph? to Check my graph (' + s + ')'));

    console.log(T('case 7: a command palette row'));
    s = await fresh('help-lint');
    await page.keyboard.press('Control+Shift+P');
    await page.waitForTimeout(300);
    await page.fill('#ps-command-search', 'Which graph');
    await page.waitForTimeout(250);
    await page.click('[data-palette-command="help-chooser"]');
    s = await settlesOn('graphChooser');
    ok(s === 'graphChooser', T('the palette row switches Check my graph to Which graph? (' + s + ')'));

    console.log(T('case 8: a click outside still closes the panel'));
    s = await fresh('help-chooser');
    const spot = await page.evaluate(() => { const r = document.querySelector('.ps-statusbar .ps-status-spacer').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; });
    ok(s === 'graphChooser' && spot.w > 20, T('Which graph? is open and the status line has empty space to click (' + s + ', ' + Math.round(spot.w) + 'px)'));
    await page.mouse.click(spot.x, spot.y);
    await page.waitForTimeout(700);
    s = await showing();
    ok(s === 'closed', T('a click on empty space closes the panel (' + s + ')'));

    ok(errors.length === 0, T('no page errors' + (errors.length ? ' (' + errors[0] + ')' : '')));
    await page.close();
}
for (const [name, type] of [['chromium', pw.chromium], ['webkit', pw.webkit]]) {
    let browser;
    try { browser = await type.launch(); } catch (e) { console.log('== ' + name + ': not installed, skipped'); continue; }
    console.log('== ' + name);
    await run(browser, name, 'below', 1440, 900);
    await run(browser, name, 'beside', 1366, 620);
    await browser.close();
}
console.log(failures ? 'help-tab-switch: FAIL (' + failures + ')' : 'help-tab-switch: PASS');
process.exit(failures ? 1 : 0);
