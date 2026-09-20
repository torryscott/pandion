// Axis names follow the drawn position on the categorical charts (Sep 19
// 2026, Torry: "I just want it to do the correct thing when flipped"). The
// field bug: on a horizontal bar chart the Show/hide rows "X axis tick
// labels" and "X axis title" removed the text on the LEFT. Measured: the
// axis panels and the line/ticks hide ids are positional (x = bottom, y =
// left), but the tick-label and title hide ids follow the data role, so the
// old "X axis" tab mixed bottom-drawn rows with left-drawn ones. Now the
// panels and tabs read "Bottom axis (values)" / "Left axis (categories)"
// and every row sits under the axis it is drawn on; a horizontal chart's
// axis panels open with a note saying so. Scatter keeps plain X / Y.
//
// Cases (chromium + webkit): (1) vertical bar: tabs and panel titles are
// positional with the role, no note; (2) horizontal: the roles swap in the
// names, the note appears, the Left axis tab's "tick labels" row removes the
// labels drawn on the LEFT and the Bottom axis tab's removes the numbers at
// the bottom; (3) scatter: plain X / Y, no note. CONTROL (main before the
// fix): every naming and note assertion fails; the row-to-side pairing fails
// on the horizontal tab.
//
// Usage: node standalone/verify/axis-role-labels-check.mjs

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

const readState = () => {
    const pnl = document.querySelector('[data-gb2-inspector]');
    const title = pnl && pnl.querySelector('[data-role="inspector-title"]');
    const btns = pnl ? Array.from(pnl.querySelectorAll('button')).map(b => (b.textContent || '').trim()) : [];
    // Side classification uses the drawn axis lines as dividers: a label
    // whose right edge ends before the left axis line is on the LEFT; one
    // whose top starts below the bottom axis line is along the BOTTOM.
    const lAxis = document.querySelector('#psroot svg [data-role="y-axis-line"]');
    const bAxis = document.querySelector('#psroot svg [data-role="x-axis-line"]');
    const axisX = lAxis ? lAxis.getBoundingClientRect().left : 0;
    const axisY = bAxis ? bAxis.getBoundingClientRect().top : 0;
    const side = (r) => (r.right <= axisX + 2) ? 'left' : (r.top >= axisY - 2 ? 'bottom' : 'other');
    const texts = Array.from(document.querySelectorAll('#psroot svg text'));
    return {
        title: title ? title.textContent.trim() : '',
        btns,
        note: ((document.querySelector('[data-role="axis-side-note"]') || {}).textContent || '').trim(),
        catLabels: texts.filter(t => t.getAttribute('data-role') === 'x-cat-label').map(t => side(t.getBoundingClientRect())),
        numbers: texts.filter(t => /^\d+$/.test(t.textContent.trim())).map(t => side(t.getBoundingClientRect())),
        strips: Array.from(document.querySelectorAll('#psroot [title*="axis"]')).map(e => e.title)
    };
};

async function clickStrip(page, which) {
    // The bottom hit strip carries the tooltip; the left tick column has no
    // tooltip, so aim 6px left of the left axis line.
    const pt = await page.evaluate((which) => {
        if (which === 'bottom') {
            const e = Array.from(document.querySelectorAll('#psroot [title*="axis"]')).find(x => /bottom axis|X axis/.test(x.title));
            if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
        const l = document.querySelector('#psroot svg [data-role="y-axis-line"]');
        if (!l) return null; const r = l.getBoundingClientRect(); return { x: r.left - 6, y: r.top + r.height / 2 };
    }, which);
    if (!pt) return false;
    await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(600);
    return true;
}

async function run(browser, name) {
    const T = t => '[' + name + '] ' + t;
    const page = await browser.newPage({ viewport: { width: 1470, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(() => { try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); localStorage.setItem('psstandalone.preferences.v1', JSON.stringify({ panelDock: 'below' })); } catch (e) {} });
    await page.goto(PAGE); await page.waitForTimeout(700);
    if (await page.locator('#ps-welcome').isVisible().catch(() => false)) { await page.click('#ps-welcome-sample'); await page.waitForTimeout(1800); }
    try { const got = page.locator('button', { hasText: 'Got it' }).first(); if (await got.isVisible()) { await got.click(); await page.waitForTimeout(300); } } catch {}
    await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        PS_SHELL.setWorkspace('chart'); PS_SHELL.setModule('plotbuilder');
        PS_SHELL.setRoles('plotbuilder', { xvar: 'condition', yvar: 'score' });
        await s(1500);
    });
    const eye = '#psroot button[aria-label="Show / hide elements"]';
    const clickTab = (label) => page.evaluate((label) => { const t = Array.from(document.querySelectorAll('[data-gb2-inspector] button')).find(b => (b.textContent || '').trim() === label); if (t) { t.click(); return true; } return false; }, label);

    // ---- 1. vertical bar
    await page.click(eye); await page.waitForTimeout(600);
    let st = await page.evaluate(readState);
    ok(st.btns.includes('Bottom axis (categories)') && st.btns.includes('Left axis (values)'),
       T('1: Show/hide tabs read Bottom axis (categories) and Left axis (values) on a vertical bar chart'));
    await clickTab('Bottom axis (categories)'); await page.waitForTimeout(300);
    st = await page.evaluate(readState);
    ok(st.btns.includes('Bottom axis tick labels') && st.btns.includes('Bottom axis title'),
       T('1: its rows are named by position (' + st.btns.filter(b => /Bottom axis/.test(b)).join(', ') + ')'));
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    ok(await clickStrip(page, 'bottom'), T('1: the bottom hit strip exists'));
    st = await page.evaluate(readState);
    ok(/Bottom axis \(categories\)/.test(st.title), T('1: the bottom axis panel is titled by position and role (' + st.title + ')'));
    ok(st.note === '', T('1: no orientation note on a vertical chart'));
    ok(st.catLabels.length === 3 && st.catLabels.every(p => p === 'bottom'), T('1: the category labels are drawn along the bottom'));
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);

    // ---- 2. horizontal
    await page.evaluate(async () => { window.setOption('chartOrientation', 'horizontal'); await new Promise(r => setTimeout(r, 2500)); });
    st = await page.evaluate(readState);
    ok(st.catLabels.length === 3 && st.catLabels.every(p => p === 'left'), T('2: after the flip the category labels are drawn on the left'));
    ok(st.strips.some(t => /bottom axis \(values\)/.test(t)), T('2: the bottom strip tooltip now names the values (' + st.strips.join(' | ') + ')'));
    ok(await clickStrip(page, 'bottom'), T('2: bottom strip clickable'));
    st = await page.evaluate(readState);
    ok(/Bottom axis \(values\)/.test(st.title), T('2: the bottom panel is now Bottom axis (values) (' + st.title + ')'));
    ok(/bottom axis carries the values/.test(st.note), T('2: and carries the orientation note'));
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    ok(await clickStrip(page, 'left'), T('2: left tick column clickable'));
    st = await page.evaluate(readState);
    ok(/Left axis \(categories\)/.test(st.title), T('2: the left panel is Left axis (categories) (' + st.title + ')'));
    ok(/left axis carries the/.test(st.note), T('2: with the same note'));
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    // The Left axis tab's tick-labels row removes the LEFT text (the categories).
    await page.click(eye); await page.waitForTimeout(600);
    ok(await clickTab('Left axis (categories)'), T('2: Show/hide has a Left axis (categories) tab'));
    await page.waitForTimeout(300);
    st = await page.evaluate(readState);
    ok(st.btns.includes('Left axis tick labels') && st.btns.includes('Left axis title'), T('2: its rows are the left-drawn ones (' + st.btns.filter(b => /Left axis/.test(b)).join(', ') + ')'));
    ok(await clickTab('Left axis tick labels'), T('2: clicking Left axis tick labels'));
    await page.waitForTimeout(900);
    st = await page.evaluate(readState);
    ok(st.catLabels.length === 0, T('2: removes the category labels on the left (' + st.catLabels.length + ' left)'));
    ok(st.numbers.filter(p => p === 'bottom').length >= 3, T('2: while the numbers along the bottom stay (' + st.numbers.filter(p => p === 'bottom').length + ')'));
    await clickTab('Left axis tick labels'); await page.waitForTimeout(900);   // restore
    ok(await clickTab('Bottom axis (values)'), T('2: and a Bottom axis (values) tab'));
    await page.waitForTimeout(300);
    ok(await clickTab('Bottom axis tick labels'), T('2: clicking Bottom axis tick labels'));
    await page.waitForTimeout(900);
    st = await page.evaluate(readState);
    ok(st.numbers.filter(p => p === 'bottom').length === 0 && st.catLabels.length === 3, T('2: removes the numbers at the bottom and leaves the categories (' + st.numbers.filter(p => p === 'bottom').length + ' numbers, ' + st.catLabels.length + ' categories)'));
    await clickTab('Bottom axis tick labels'); await page.waitForTimeout(600);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);

    // ---- 3. scatter keeps plain X / Y
    await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        PS_SHELL.setModule('xyplotbuilder');
        PS_SHELL.setRoles('xyplotbuilder', { xvar: 'hours', yvar: 'score' });
        await s(1800);
    });
    await page.click(eye); await page.waitForTimeout(600);
    st = await page.evaluate(readState);
    ok(st.btns.includes('X axis') && st.btns.includes('Y axis') && !st.btns.some(b => /Bottom axis|Left axis/.test(b)),
       T('3: scatter keeps plain X axis / Y axis tabs'));
    ok(st.note === '', T('3: and no orientation note'));
    await page.keyboard.press('Escape');
    ok(errors.length === 0, T('no page errors' + (errors.length ? ' (' + errors[0] + ')' : '')));
    await page.close();
}

for (const [name, type] of [['chromium', pw.chromium], ['webkit', pw.webkit]]) {
    let browser;
    try { browser = await type.launch(); } catch (e) { console.log('== ' + name + ': not installed, skipped'); continue; }
    console.log('== ' + name);
    await run(browser, name);
    await browser.close();
}
console.log(failures ? 'axis-role-labels: FAIL (' + failures + ')' : 'axis-role-labels: PASS');
process.exit(failures ? 1 : 0);
