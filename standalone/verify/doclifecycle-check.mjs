// Punch list t3-51: the document lifecycle keyboard model, and the tab strip
// that wrapped.
//
// Half of what the item asked for cannot be built in a browser, and saying so
// is part of the fix rather than an excuse: Cmd/Ctrl+W closes the browser tab,
// Ctrl+Tab and Cmd/Ctrl+bracket walk the browser's tabs and history, and
// Cmd/Ctrl+number picks a browser tab. None of those reach a page. So the
// document keys are Alt+number, the workspace keys are Cmd/Ctrl+Shift+number,
// and the shortcuts sheet states which keys the browser has taken and why.
//
// The rest was straightforwardly missing: Export, the terminal action of most
// sessions, had no accelerator while Preferences did; and #ps-tabs was
// flex-wrap: wrap, so a project with a dozen documents pushed the canvas down
// a row at a time, which no tabbed application does.
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
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 860 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1400);

// Enough documents to overflow a 1180px strip.
await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 9; i++) { window.PS_SHELL.addChart(); await sleep(120); }
});
await page.waitForTimeout(900);

console.log('case 1: the strip scrolls sideways instead of pushing the canvas down');
const strip = await page.evaluate(() => {
    const bar = document.getElementById('ps-tabs');
    const cs = getComputedStyle(bar);
    const tabs = Array.from(bar.querySelectorAll('[data-chart-id]'));
    const tops = new Set(tabs.map(t => Math.round(t.getBoundingClientRect().top)));
    return { wrap: cs.flexWrap, overflowX: cs.overflowX,
             rows: tops.size, tabs: tabs.length,
             height: Math.round(bar.getBoundingClientRect().height),
             scrolls: bar.scrollWidth > bar.clientWidth };
});
ok(strip.tabs >= 10, `setup: ${strip.tabs} documents, more than fit`);
ok(strip.wrap === 'nowrap' && strip.overflowX === 'auto',
   `the strip is nowrap and scrolls (${strip.wrap}, ${strip.overflowX})`);
ok(strip.scrolls,
   'and it genuinely overflows at this width, so this is not a vacuous pass');
ok(strip.rows === 1,
   `every tab is on ONE row (${strip.rows} rows), so the canvas never gets ` +
   `pushed down`);
ok(strip.height < 60,
   `the strip stays one tab tall (${strip.height}px)`);

console.log('case 2: Alt+number picks a document, and it is brought into view');
const jump = await page.evaluate(() => ({
    ids: Array.from(document.querySelectorAll('#ps-tabs [data-chart-id]'))
        .map(t => t.getAttribute('data-chart-id')),
    active: window.PS_SHELL.chart().id
}));
await page.keyboard.press('Alt+Digit1');
await page.waitForTimeout(600);
ok(await page.evaluate(() => window.PS_SHELL.chart().id) === jump.ids[0],
   `Alt+1 goes to the first document (${jump.ids[0]})`);
await page.keyboard.press('Alt+Digit9');
await page.waitForTimeout(700);
const ninth = await page.evaluate(() => ({
    id: window.PS_SHELL.chart().id,
    visible: (() => {
        const bar = document.getElementById('ps-tabs');
        const live = bar.querySelector('.ps-tab-active');
        if (!live) return false;
        const b = bar.getBoundingClientRect(), l = live.getBoundingClientRect();
        return l.left >= b.left - 1 && l.right <= b.right + 1;
    })()
}));
ok(ninth.id === jump.ids[8], `Alt+9 goes to the ninth (${ninth.id})`);
ok(ninth.visible,
   'and the strip scrolls it into view, which a scrolling strip has to do or ' +
   'the selection changes with nothing on screen moving');

// Nine is the ceiling by construction; ten must do nothing rather than wrap
// round to the first, which would be a surprising way to lose your place.
const before = await page.evaluate(() => window.PS_SHELL.chart().id);
await page.keyboard.press('Alt+Digit0');
await page.waitForTimeout(400);
ok(await page.evaluate(() => window.PS_SHELL.chart().id) === before,
   'Alt+0 is not bound to anything and does not wrap round');

console.log('case 3: the three workspaces the View menu lists');
for (const [combo, want] of [['Control+Shift+Digit1', 'data'],
                             ['Control+Shift+Digit3', 'layout'],
                             ['Control+Shift+Digit2', 'chart']]) {
    await page.keyboard.press(combo);
    await page.waitForTimeout(600);
    const got = await page.evaluate(() => window.PS_SHELL.workspace());
    ok(got === want, `${combo} opens the ${want} workspace (${got})`);
}
const menu = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('[data-ps-menu="view"]').click();
    await sleep(300);
    const rows = Array.from(document.querySelectorAll('#ps-appmenu button'))
        .map(b => b.textContent.trim());
    document.querySelector('[data-ps-menu="view"]').click();
    return rows;
});
// The menu prints the raw shortcut string; only the sheet spaces it out.
ok(menu.filter(r => /Cmd\/Ctrl\+Shift\+[123]$/.test(r)).length === 3,
   `and the View menu prints them, so they are discoverable ` +
   `(${JSON.stringify(menu.slice(0, 3))})`);

console.log('case 4: Export has an accelerator, like Preferences already did');
// Jul 27 2026: Torry gave Cmd/Ctrl+E to value exclusion (the frequent,
// in-flow action), so Export moved to Shift the same day it first gained
// an accelerator, before any muscle memory existed.
await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
await page.waitForTimeout(500);
await page.keyboard.press('Control+Shift+e');
await page.waitForTimeout(600);
ok(await page.evaluate(() =>
       getComputedStyle(document.getElementById('ps-exporter')).display !== 'none'),
   'Cmd/Ctrl+Shift+E opens the exporter');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.keyboard.press('Control+e');
await page.waitForTimeout(400);
ok(await page.evaluate(() =>
       getComputedStyle(document.getElementById('ps-exporter')).display === 'none'),
   'and plain Cmd/Ctrl+E no longer opens it: that chord belongs to exclusion');

console.log('case 5: the sheet says which keys the browser took, and why');
await page.keyboard.press('F1');
await page.waitForTimeout(500);
const sheet = await page.evaluate(() => ({
    text: document.getElementById('ps-shortcuts-body').innerText,
    rows: Array.from(document.querySelectorAll(
        '#ps-shortcuts-body .ps-shortcut-list span'))
        .map(s => [s.textContent,
                   s.nextElementSibling ? s.nextElementSibling.textContent : ''])
}));
// Case-insensitive: the section headings are uppercased by a CSS
// text-transform, so innerText reads DOCUMENTS whatever was authored.
ok(/documents/i.test(sheet.text), 'there is a Documents section');
ok(sheet.rows.some(r => /Alt \+ 1 to 9/.test(r[1])),
   'listing the document keys');
ok(/Cmd\/Ctrl\+W/.test(sheet.text) && /browser/.test(sheet.text),
   'and stating that Cmd/Ctrl+W belongs to the browser, which is why it is ' +
   'not offered - a user who tries it loses the whole tab');
ok(sheet.rows.some(r => /Export/i.test(r[0]) && /E$/.test(r[1].trim())),
   `the Export key reached the sheet through the menu, with no second edit ` +
   `(${JSON.stringify((sheet.rows.find(r => /Export/i.test(r[0])) || [])[1])})`);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

console.log('case 8: an in-flight edit never bleeds onto a new document');
// Torry's report, Jul 27 2026, reproduced end to end before fixing: edit
// chart A, create chart B inside the engine's 1500ms commit debounce, and
// A's WHOLE style blob (chartSpec carries annotations, labels, colors)
// first painted B's bars and then FLUSHED PERMANENTLY into B's store. Two
// halves guard it: addChart drains pending edits to the document that
// produced them BEFORE the active document flips (switchChart already
// did), and syncEngineDocState clears the engine's window-side pins when
// the hosted document changes - the boundary jamovi gets for free from
// its per-analysis iframes.
const bleed = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const charts = window.PS_SHELL.charts().filter(c => c.type !== 'layout');
    window.PS_SHELL.switchChart(charts[0].id);
    await s(800);
    const blob = JSON.stringify({
        barColor: '#ff0000',
        annotationsJson: JSON.stringify([{ id: 'a1', kind: 'text',
            text: 'BLEED', x: 200, y: 60, fontSize: 16 }])
    });
    window.__gb2_setOption('chartSpec', blob);
    await s(150);   // inside the debounce: the pin is live, the flush is not
    window.PS_SHELL.addChart('plotbuilder');
    await s(300);
    window.PS_SHELL.setRoles('plotbuilder', { xvar: 'condition', yvar: 'score' });
    await s(1200);
    const bar = document.querySelector('[data-bar-cat]');
    await s(1800);  // let the debounced flush fire while B is active
    let bSpec = {};
    try { bSpec = JSON.parse(window.PS_SHELL.optionStore().chartSpec || '{}'); }
    catch (e) {}
    // And the drain's POSITIVE half: A kept the edit it produced.
    window.PS_SHELL.switchChart(charts[0].id);
    await s(700);
    let aSpec = {};
    try { aSpec = JSON.parse(window.PS_SHELL.optionStore().chartSpec || '{}'); }
    catch (e) {}
    return { bFill: bar ? bar.getAttribute('fill') : null,
             bBarColor: bSpec.barColor || null,
             bHasAnn: !!bSpec.annotationsJson,
             aBarColor: aSpec.barColor || null,
             aHasAnn: !!aSpec.annotationsJson };
});
ok(bleed.bFill !== '#ff0000' && !bleed.bBarColor && !bleed.bHasAnn,
   `a chart created inside A's commit window renders and stores its OWN ` +
   `style, not A's (fill ${bleed.bFill})`);
ok(bleed.aBarColor === '#ff0000' && bleed.aHasAnn,
   'while A keeps the edit it produced: drained to its own document, ' +
   'not discarded');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('DOC LIFECYCLE CHECK PASS');
await browser.close();
