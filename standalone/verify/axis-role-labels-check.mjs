// Axis names carry their role where the orientation flip bites (Sep 19 2026,
// Torry: "I just want it to do the correct thing when flipped"). x is always
// the category axis and y the value axis, in both orientations; the field
// bug was a horizontal bar chart whose "X axis" hide rows removed the LEFT
// text, which read as the wrong axis vanishing. The small fix: on the
// categorical charts the Show/hide rows, the axis panel titles, the text
// panel's axis-title names and the quick toolbar read "X axis (categories)"
// and "Y axis (values)", and a horizontal chart's axis panels open with a
// note saying where each axis now sits. Scatter keeps plain X / Y.
//
// Cases (chromium + webkit): (1) vertical bar: the rows and panel title carry
// the role, no note; (2) horizontal: the note appears in both axis panels and
// hiding "X axis (categories) tick labels" removes the labels drawn on the
// LEFT, so the name and the behaviour agree; (3) scatter: plain names, no
// note. CONTROL (main before the fix): every role-label and note assertion
// fails; the hide behaviour was already correct.
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

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Read the Show/hide panel's axis tab labels + rows, the axis panel title,
// the note, and the category-label geometry, all from the live DOM.
const readState = () => ({
    visTabs: Array.from(document.querySelectorAll('[data-vis-tab], .gb2-vis-tab, button'))
        .map(b => (b.textContent || '').trim()).filter(t => /axis/i.test(t) && t.length < 30),
    note: (document.querySelector('[data-role="axis-side-note"]') || {}).textContent || '',
    panelTitle: (document.querySelector('[data-gb2-inspector] [data-role="inspector-title"]') || {}).textContent || '',
    catLabels: Array.from(document.querySelectorAll('#psroot svg text[data-role="x-cat-label"]'))
        .map(t => { const r = t.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width }; }),
    svgBox: (() => { const s = document.querySelector('#psroot svg[data-role="gb2-chart-svg"]'); const r = s ? s.getBoundingClientRect() : null; return r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null; })()
});

async function openAxisPanel(page, which) {
    // The axis line is the click-to-edit target for the axis panel.
    await page.evaluate((which) => {
        const el = document.querySelector('#psroot svg [data-role="' + which + '-axis-line"]');
        if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1, clientX: 5, clientY: 5 }));
    }, which);
    await page.waitForTimeout(500);
}

async function openShowHide(page) {
    await page.evaluate(() => {
        const b = document.querySelector('#psroot button[aria-label="Show/hide"], #psroot button[aria-label="Visibility"], #psroot button[title*="Show/hide"]');
        if (b) b.click();
    });
    await page.waitForTimeout(500);
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

    // ---- 1. vertical bar: role labels, no note
    await openShowHide(page);
    let st = await page.evaluate(readState);
    ok(st.visTabs.some(t => t === 'X axis (categories)') && st.visTabs.some(t => t === 'Y axis (values)'),
       T('1: Show/hide names the axes by role on a bar chart (' + JSON.stringify(st.visTabs) + ')'));
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await openAxisPanel(page, 'x');
    st = await page.evaluate(readState);
    ok(/X axis \(categories\)/.test(st.panelTitle), T('1: the X axis panel is titled by role (' + st.panelTitle.trim() + ')'));
    ok(st.note === '', T('1: no orientation note on a vertical chart'));
    const vertLabels = st.catLabels;
    ok(vertLabels.length === 3 && vertLabels.every(l => l.y > (st.svgBox.top + st.svgBox.bottom) / 2),
       T('1: the category labels sit along the bottom (' + vertLabels.length + ')'));
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);

    // ---- 2. horizontal: the note, and the hide row removes the LEFT labels
    await page.evaluate(async () => { window.setOption('chartOrientation', 'horizontal'); await new Promise(r => setTimeout(r, 2500)); });
    await openAxisPanel(page, 'x');
    st = await page.evaluate(readState);
    ok(/runs up the left side/.test(st.note), T('2: the X axis panel says the categories now run up the left (' + st.note.slice(0, 60) + ')'));
    ok(/X axis \(categories\)/.test(st.panelTitle), T('2: and keeps its role title (' + st.panelTitle.trim() + ')'));
    const horizLabels = st.catLabels;
    ok(horizLabels.length === 3 && horizLabels.every(l => l.x + l.w < (st.svgBox.left + st.svgBox.right) / 2),
       T('2: the category labels are drawn on the LEFT (' + horizLabels.length + ')'));
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await openAxisPanel(page, 'y');
    st = await page.evaluate(readState);
    ok(/along the bottom/.test(st.note), T('2: the Y axis panel carries the same note (' + st.note.slice(0, 40) + ')'));
    ok(/Y axis \(values\)/.test(st.panelTitle), T('2: titled Y axis (values) (' + st.panelTitle.trim() + ')'));
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    // Hide the category tick labels through the Show/hide row that names them.
    await openShowHide(page);
    const hid = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('#psroot button, #psroot label, #psroot [role="switch"], #psroot input[type="checkbox"]'));
        const tab = Array.from(document.querySelectorAll('#psroot button')).find(b => (b.textContent || '').trim() === 'X axis (categories)');
        if (tab) tab.click();
        const row = Array.from(document.querySelectorAll('#psroot button, #psroot label, #psroot [role="switch"]')).find(b => /X axis \(categories\) tick labels/.test(b.textContent || ''));
        if (!row) return { found: false };
        const ctl = row.matches('input') ? row : (row.querySelector('input[type="checkbox"], button, [role="switch"]') || row);
        ctl.click();
        return { found: true };
    });
    await page.waitForTimeout(900);
    st = await page.evaluate(readState);
    ok(hid.found, T('2: the Show/hide row "X axis (categories) tick labels" exists'));
    ok(st.catLabels.length === 0, T('2: toggling it removes the labels on the left, so the name and the behaviour agree (' + st.catLabels.length + ' left)'));
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);

    // ---- 3. scatter keeps plain X / Y
    await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        PS_SHELL.setModule('xyplotbuilder');
        PS_SHELL.setRoles('xyplotbuilder', { xvar: 'hours', yvar: 'score' });
        await s(1800);
    });
    await openAxisPanel(page, 'x');
    st = await page.evaluate(readState);
    ok(/^\s*(Scatter)?\s*X axis\s*$/.test(st.panelTitle.replace(/Scatter/, '')) || /X axis$/.test(st.panelTitle.trim()),
       T('3: scatter keeps a plain X axis title (' + st.panelTitle.trim() + ')'));
    ok(st.note === '', T('3: and no orientation note'));
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
