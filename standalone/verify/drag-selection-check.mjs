// Torry, Jul 29 2026, from a screenshot of a correlation heatmap mid-drag:
// "sometimes when I drag stuff around on the screen, there's still some kind
// of background highlighting like you would see on a regular website. I
// obviously don't want that to be possible."
//
// A drag that starts on the chart surface was starting a BROWSER TEXT
// SELECTION: the blue wash spilled across the chart card and the colour
// scale. The Jul 26 pass (punch list 42a) gave the app chrome
// user-select:none but never covered the chart host or the layout canvas -
// the two surfaces that are nothing BUT dragging. The engine itself already
// uses user-select:none on its own drag handles (tick strips, panel titles,
// reorder rows), so this is the same idiom finished from the shell side,
// with no engine edit.
//
// It is not only cosmetic: the shell's copy-as-image path bails when
// getSelection() is non-empty, so a stray highlight silently disabled the
// copy gesture.
//
// The assertions are BEHAVIOURAL - a real pointer drag, then read the live
// selection - so they fail with the CSS reverted rather than merely
// restating the stylesheet. Two guard cases pin the exceptions, because the
// wrong fix here (blanket the whole app) would quietly remove the ability to
// select the numbers in the statistics panel or the data grid.
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
function ok(cond, msg, extra) {
    if (!cond) throw new Error(msg + (extra ? ' :: ' + extra : ''));
    console.log('  ok  ' + msg);
}

const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForFunction(() => {
    const svgs = Array.from(document.querySelectorAll('#psroot svg'));
    return svgs.some(s => s.clientWidth > 300 && s.clientHeight > 200);
}, null, { timeout: 20000 });

const readSelection = () => page.evaluate(() => {
    const sel = window.getSelection();
    return {
        text: sel ? String(sel).replace(/\s+/g, ' ').trim() : '',
        ranges: sel ? sel.rangeCount : 0,
        collapsed: sel ? sel.isCollapsed : true,
    };
});
// The chart svg is the largest one: a toolbar icon is also an <svg>.
const chartBox = async () => page.evaluate(() => {
    const svg = Array.from(document.querySelectorAll('#psroot svg'))
        .sort((a, b) => (b.clientWidth * b.clientHeight) -
                        (a.clientWidth * a.clientHeight))[0];
    const b = svg.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
});

console.log('case 1: dragging across the chart selects nothing');
{
    const b = await chartBox();
    ok(b.w > 300 && b.h > 200, 'setup: the chart is drawn',
       `${Math.round(b.w)}x${Math.round(b.h)}`);
    // Start inside the plotting area and drag well across it, the gesture
    // that produced Torry's screenshot.
    await page.mouse.move(b.x + b.w * 0.25, b.y + b.h * 0.3);
    await page.mouse.down();
    for (const t of [0.4, 0.55, 0.7, 0.85]) {
        await page.mouse.move(b.x + b.w * t, b.y + b.h * (0.3 + t * 0.4),
                              { steps: 4 });
    }
    await page.mouse.up();
    await page.waitForTimeout(120);
    const sel = await readSelection();
    ok(sel.text === '' && (sel.ranges === 0 || sel.collapsed),
       'a drag across the chart leaves no text selection',
       JSON.stringify(sel));
    const host = await page.evaluate(() =>
        getComputedStyle(document.getElementById('psroot')).userSelect);
    ok(host === 'none', 'and the chart host declares user-select: none', host);
}

console.log('case 2: the statistics panel numbers stay selectable');
// The guard against over-applying the fix. Those tables carry the values
// behind the chart; Copy buttons are the supported path, but hand-selecting
// a number must not become impossible.
{
    const statsBtn = page.locator('#psroot button[aria-label="Statistics"]')
        .first();
    ok(await statsBtn.count() === 1, 'setup: the Statistics control exists');
    await statsBtn.click();
    await page.waitForTimeout(500);
    const st = await page.evaluate(() => {
        const table = document.querySelector('#psroot [data-st-pane] table') ||
            document.querySelector('#psroot .gb2-panel table');
        if (!table) return { found: false };
        // A cell with actual TEXT: the first td is often an empty spacer
        // (the corner of a header block), and selecting nothing proves
        // nothing.
        const cell = Array.from(table.querySelectorAll('td, th'))
            .find(c => (c.textContent || '').trim().length > 0);
        if (!cell) return { found: false };
        // Behavioural, not declarative: select the cell for real and read
        // back what the selection contains. user-select:none yields ''.
        const range = document.createRange();
        range.selectNodeContents(cell);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        const got = String(sel).replace(/\s+/g, ' ').trim();
        sel.removeAllRanges();
        return {
            found: true,
            style: getComputedStyle(cell).userSelect,
            text: got,
            cellText: (cell.textContent || '').replace(/\s+/g, ' ').trim(),
        };
    });
    ok(st.found, 'setup: the statistics panel renders a table of values');
    ok(st.style === 'text',
       'statistics cells still declare user-select: text', st.style);
    // Case-insensitive on purpose: a stats header carries CSS
    // text-transform:uppercase, and String(selection) reflects the RENDERED
    // text while textContent does not (the repo's standing probe law).
    ok(st.text.length > 0 &&
       st.text.toLowerCase() === st.cellText.toLowerCase(),
       'and a statistics value can still be selected and read',
       JSON.stringify(st));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
}

console.log('case 3: dragging a layout item selects nothing');
{
    await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        window.PS_SHELL.addLayout();
        await s(900);
    });
    await page.click('#ps-laddtext');
    await page.waitForTimeout(400);
    const item = await page.evaluate(() => {
        const el = document.querySelector('#ps-lcanvas .ps-litem');
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
    });
    ok(item && item.w > 10, 'setup: a text item is on the layout canvas');
    await page.mouse.move(item.x + item.w / 2, item.y + item.h / 2);
    await page.mouse.down();
    await page.mouse.move(item.x + item.w / 2 + 140, item.y + item.h / 2 + 90,
                          { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    const sel = await readSelection();
    ok(sel.text === '' && (sel.ranges === 0 || sel.collapsed),
       'dragging a layout item leaves no text selection',
       JSON.stringify(sel));
    const canvas = await page.evaluate(() =>
        getComputedStyle(document.getElementById('ps-lcanvas')).userSelect);
    ok(canvas === 'none', 'and the layout canvas declares user-select: none',
       canvas);
}

console.log('case 4: editing text on the layout still selects normally');
// The over-application guard for THIS fix. user-select is inherited, so a
// rule on the canvas reaches the in-place text editor inside it; if that
// editor stopped being selectable, editing layout text would break in a way
// no other probe watches. (Note for readers: grid CELLS are deliberately
// user-select:none - the grid owns its own range-select and copy gesture,
// and a later rule has overridden the 42a "cells stay selectable" exception
// since long before this fix. Left alone on purpose.)
{
    await page.evaluate(() => window.PS_SHELL.setWorkspace('layout'));
    await page.waitForTimeout(500);
    const item = await page.evaluate(() => {
        const el = document.querySelector('#ps-lcanvas .ps-litem');
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    ok(!!item, 'setup: the layout text item is still there');
    await page.mouse.dblclick(item.x, item.y);
    await page.waitForTimeout(400);
    const ed = await page.evaluate(() => {
        const ta = document.querySelector('#ps-lcanvas textarea');
        if (!ta) return { found: false };
        ta.value = 'selectable text';
        ta.select();
        return {
            found: true,
            style: getComputedStyle(ta).userSelect,
            selected: ta.selectionEnd - ta.selectionStart,
        };
    });
    ok(ed.found, 'setup: double-click opens the in-place text editor');
    ok(ed.style === 'text' && ed.selected === 'selectable text'.length,
       'the layout text editor still selects its own text',
       JSON.stringify(ed));
}

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('DRAG SELECTION CHECK PASS');
await browser.close();
