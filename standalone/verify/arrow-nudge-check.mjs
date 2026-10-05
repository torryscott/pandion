// Arrow keys move what is selected (Oct 1 2026, Torry: "I want the arrows to
// nudge. Also do that for the charts as well."). One rule in both places:
// an arrow key nudges the selection by one pixel (Shift = ten), and Alt with
// an arrow steps the selection to another item or part instead. A chart part
// that cannot move (a bar) still steps on a plain arrow.
// Control: on the tree before this change a plain arrow in the layout canvas
// stepped the selection and a plain arrow on a chart title stepped to a
// sibling part, so case 1 and case 7 both fail there.
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
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1800);
}

// ---- Charts first: the sample chart is already on screen. ----
const svgSel = 'svg[data-role="gb2-chart-svg"]';
const chartInfo = () => page.evaluate(sel => {
    const svg = document.querySelector(sel);
    const t = Array.from(svg.querySelectorAll('text'))
        .find(x => x.textContent.trim() === 'score');
    const crumb = document.querySelector('[data-role="gb2-crumb"]');
    return { tf: t ? (t.getAttribute('transform') || '') : null,
             crumb: crumb ? crumb.textContent : '' };
}, svgSel);
const shiftOf = tf => {
    const m = /translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)\s*\)/.exec(tf || '');
    return m ? [Number(m[1]), Number(m[2])] : [0, 0];
};
const centerOf = fn => page.evaluate(([sel, src]) => {
    const svg = document.querySelector(sel);
    const el = (new Function('svg', 'return (' + src + ')(svg)'))(svg);
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, [svgSel, fn.toString()]);

console.log('case 1: an arrow key moves a selected chart title');
const yt = await centerOf(svg => Array.from(svg.querySelectorAll('text'))
    .find(x => x.textContent.trim() === 'score'));
await page.mouse.click(yt.x, yt.y);
await page.waitForTimeout(600);
let c0 = await chartInfo();
ok(/axis title/i.test(c0.crumb), 'setup: the left axis title is selected (' + c0.crumb + ')');
const s0 = shiftOf(c0.tf);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(300);
let c1 = await chartInfo();
let s1 = shiftOf(c1.tf);
ok(s1[0] === s0[0] + 1 && s1[1] === s0[1],
   'ArrowRight moves it one pixel right (' + JSON.stringify(s0) + ' -> ' + JSON.stringify(s1) + ')');
ok(c1.crumb === c0.crumb, 'and the selection stays on the title');
await page.keyboard.press('Shift+ArrowDown');
await page.waitForTimeout(300);
let c2 = await chartInfo();
let s2 = shiftOf(c2.tf);
ok(s2[0] === s1[0] && s2[1] === s1[1] + 10,
   'Shift+ArrowDown moves it ten pixels down (' + JSON.stringify(s2) + ')');

// The edit's delayed re-render used to drop focus to the page body, after
// which Alt+Arrow and bar stepping did nothing until the next click.
await page.waitForTimeout(2400);
ok(await page.evaluate(() => {
    const a = document.activeElement;
    return !!a && a.getAttribute('data-role') === 'gb2-chart-svg';
}), 'keyboard focus is still on the chart after the edit settles');

console.log('case 2: Alt with an arrow steps the chart selection and moves nothing');
await page.keyboard.press('Alt+ArrowDown');
await page.waitForTimeout(500);
let c3 = await chartInfo();
ok(c3.crumb !== c2.crumb, 'the selection stepped to another part (' + c3.crumb + ')');
ok(c3.tf === c2.tf, 'and the title did not move');

console.log('case 3: a part that cannot move still steps on a plain arrow');
const bar = await centerOf(svg => svg.querySelector('[data-bar-cat]'));
await page.mouse.click(bar.x, bar.y);
await page.waitForTimeout(600);
let c4 = await chartInfo();
ok(/Bars/.test(c4.crumb), 'setup: a bar series is selected (' + c4.crumb + ')');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(500);
let c5 = await chartInfo();
ok(/Bars/.test(c5.crumb) && c5.crumb !== c4.crumb,
   'ArrowRight steps to the next bar series (' + c5.crumb + ')');
ok(c5.tf === c2.tf, 'and nothing was nudged');

console.log('case 4: an arrow in a text field edits the text, not the chart');
const titleNow = () => centerOf(svg => Array.from(svg.querySelectorAll('text'))
    .find(x => x.textContent.trim() === 'score'));
let yt4 = await titleNow();
await page.mouse.click(yt4.x, yt4.y);
await page.waitForTimeout(700);
ok(await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('textarea[data-field="text-content"]'))
        .find(x => x.offsetParent !== null);
    if (!el) return false;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    return document.activeElement === el;
}), 'setup: the caret is in the title\'s text box');
const tf4 = (await chartInfo()).tf;
await page.keyboard.press('ArrowLeft');
await page.keyboard.press('ArrowUp');
await page.waitForTimeout(300);
ok((await chartInfo()).tf === tf4, 'the arrows leave the title where it is');
ok(await page.evaluate(() => {
    const el = document.activeElement;
    return el.tagName === 'TEXTAREA' && el.selectionStart < el.value.length;
}), 'and move the caret instead');

console.log('case 5: a chart that is not on screen takes no arrows');
// The title is still selected. In another workspace, with focus on the page
// itself, an arrow used to move that title on the chart nobody could see.
await page.evaluate(() => { document.activeElement.blur(); });
const tf5 = (await chartInfo()).tf;
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setWorkspace('data'); await s(700);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
});
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(400);
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setWorkspace('chart'); await s(1200);
});
ok((await chartInfo()).tf === tf5,
   'an arrow pressed in the Data workspace did not move the chart title (' + tf5 + ')');

// ---- Layouts. ----
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.addLayout(); await s(800);
    window.PS_SHELL.setWorkspace('layout'); await s(500);
    window.PS_SHELL.runCommand('insert-box'); await s(300);
    window.PS_SHELL.runCommand('insert-box'); await s(300);
});
const items = () => page.evaluate(() => window.PS_SHELL.chart().items
    .map(i => ({ id: i.id, x: Math.round(i.x), y: Math.round(i.y) })));
const sel = () => page.evaluate(() => window.PS_SHELL.layoutSelection());
const nodeCenter = id => page.evaluate(i => {
    const r = document.querySelector('.ps-litem[data-item-id="' + i + '"]').getBoundingClientRect();
    return { x: r.left + 6, y: r.top + 6 };
}, id);
let its = await items();
ok(its.length === 2, 'setup: the layout holds two boxes');
const A = its[0].id, B = its[1].id;
// Pull the second box clear of the first so a click lands on one of them.
await page.evaluate(([id]) => {
    const it = window.PS_SHELL.chart().items.find(i => i.id === id);
    it.x += 240; it.y += 160;
    window.PS_SHELL.selectLayoutItems([]);
}, [B]);
await page.waitForTimeout(300);

console.log('case 6: nothing selected, an arrow in the canvas picks an item');
await page.evaluate(() => document.getElementById('ps-lviewport').focus());
const before5 = await items();
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(250);
ok((await sel()).length === 1, 'ArrowDown selected one item');
ok(JSON.stringify(await items()) === JSON.stringify(before5), 'and moved nothing');

console.log('case 7: an arrow key nudges the selected layout item');
const pa = await nodeCenter(A);
await page.mouse.click(pa.x, pa.y);
await page.waitForTimeout(350);
ok((await sel()).join() === A, 'setup: a click selected the first box');
const a0 = (await items()).find(i => i.id === A);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(250);
let a1 = (await items()).find(i => i.id === A);
ok(a1.x === a0.x + 1 && a1.y === a0.y,
   'ArrowRight moves it one pixel (' + a0.x + ' -> ' + a1.x + ')');
ok((await sel()).join() === A, 'and the selection stays on it');
await page.keyboard.press('Shift+ArrowDown');
await page.waitForTimeout(250);
let a2 = (await items()).find(i => i.id === A);
ok(a2.y === a0.y + 10 && a2.x === a1.x, 'Shift+ArrowDown moves it ten pixels (' + a0.y + ' -> ' + a2.y + ')');
const onCanvas = await page.evaluate(id => {
    const n = document.querySelector('.ps-litem[data-item-id="' + id + '"]');
    return n ? n.style.left + ',' + n.style.top : '';
}, A);
ok(/px,/.test(onCanvas), 'the canvas node follows (' + onCanvas + ')');

console.log('case 8: a run of nudges is one Undo');
await page.keyboard.press(MOD + '+z');
await page.waitForTimeout(400);
let a3 = (await items()).find(i => i.id === A);
ok(a3.x === a0.x && a3.y === a0.y,
   'one Undo puts the box back where it started (' + a3.x + ',' + a3.y + ')');

console.log('case 9: Alt with an arrow steps between items; Alt+Shift extends');
await page.evaluate(id => {
    window.PS_SHELL.selectLayoutItems([id]);
    document.getElementById('ps-lviewport').focus();
}, A);
await page.waitForTimeout(250);
const before8 = await items();
await page.keyboard.press('Alt+ArrowDown');
await page.waitForTimeout(250);
ok((await sel()).join() === B, 'Alt+ArrowDown stepped to the second box');
ok(JSON.stringify(await items()) === JSON.stringify(before8), 'and moved nothing');
await page.keyboard.press('Alt+Shift+ArrowUp');
await page.waitForTimeout(250);
ok((await sel()).length === 2, 'Alt+Shift+ArrowUp extended the selection to both');
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(250);
const after8 = await items();
ok(after8.every((it, i) => it.x === before8[i].x - 1),
   'and an arrow now nudges both together');

console.log('case 10: the rule holds from the rail, and stops outside the workspace');
await page.evaluate(id => window.PS_SHELL.selectLayoutItems([id]), A);
await page.waitForTimeout(300);
const railOk = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#ps-inspector-layout button'))
        .find(x => x.offsetParent !== null && !x.disabled &&
                   !x.closest('[role="tablist"],[role="menu"],[role="grid"]'));
    if (!b) return false;
    b.focus();
    return document.activeElement === b;
});
ok(railOk, 'setup: focus is on a rail button');
const r0 = (await items()).find(i => i.id === A);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(250);
const r1 = (await items()).find(i => i.id === A);
ok(r1.x === r0.x + 1, 'an arrow nudges with focus on a rail button (' + r0.x + ' -> ' + r1.x + ')');
const tabOk = await page.evaluate(() => {
    const b = document.querySelector('#ps-tabs button, #ps-tabs [tabindex]');
    if (!b) return false;
    b.focus();
    return document.activeElement === b;
});
ok(tabOk, 'setup: focus is on the document strip');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(350);
const still = await page.evaluate(id => {
    const d = window.PS_SHELL.chart();
    const it = d && d.items ? d.items.find(i => i.id === id) : null;
    return it ? Math.round(it.x) : null;
}, A);
ok(still === null || still === r1.x,
   'an arrow on the document strip does not nudge the layout (' + still + ')');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('ARROW NUDGE CHECK PASS');
await browser.close();
