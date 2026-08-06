// The Pinboard (Torry, Jul 31 2026, superseding the marker-layout Notebook
// within hours - his call after using v1). The contracts:
//   1. a FOURTH workspace, placed between Charts and Layouts, document-less
//      like Data: no tabs, export disabled with a pointing tip,
//   2. Keep appends to PROJECT.pins; each capture renders as its OWN PAGE
//      in a vertical scroll; the user is never yanked; the toast's Open
//      lands on the Pinboard,
//   3. Send to layout places a COPY into a chosen or new layout, flowing
//      below existing content,
//   4. delete has a one-click undo restoring the page AT ITS POSITION,
//   5. v1 migration: a project saved with the marker-layout Notebook loads
//      with its captures adopted as pins, notes surviving as an ordinary
//      layout,
//   6. pins ride the project file; opening a DATA file resets them with
//      the documents (the t4-67 rule: new data, new record),
//   7. layouts accept SYSTEM paste: an image becomes an image item, text
//      becomes a text item (the breadth ruling), and "From Pinboard"
//      places kept pages.
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
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(600);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1600);
}

// The Aug 5 2026 redesign routes every Notebook export through the shared
// export dialog: scope menu (or page right-click) -> format -> Export.
// This drives the dialog half of that flow and returns the export stamp.
async function exportViaDialog(format) {
    await page.waitForFunction(() =>
        document.getElementById('ps-exporter').style.display === 'flex',
        null, { timeout: 8000 });
    await page.click('.ps-export-format:has(input[value="' + format + '"])');
    await page.evaluate(() => { window.__psPinExportLast = null; });
    await page.click('#ps-export-go');
    await page.waitForFunction(() => window.__psPinExportLast, null,
                               { timeout: 20000 });
    return page.evaluate(() => window.__psPinExportLast);
}

console.log('case 1: the fourth workspace, placed and gated');
const order = await page.evaluate(() =>
    [...document.querySelectorAll('[data-ps-workspace]')]
        .map(b => b.getAttribute('data-ps-workspace')).join(','));
ok(order === 'data,chart,pinboard,layout',
   `the switcher reads data, chart, pinboard, layout (${order})`);

// Keep two moments from a pinned comparison.
await page.evaluate(() => {
    const b = document.querySelector(
        '.graphbuilder2-host button[aria-label="Statistics"]');
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await page.waitForTimeout(900);
await page.evaluate(() => {
    document.querySelector('[data-st-pane="pairs"] tr[data-link]').click();
});
await page.waitForTimeout(700);
const wsBefore = await page.evaluate(() => window.PS_SHELL.workspace());
await page.click('[data-ps-moment-keep]');
await page.waitForTimeout(2500);
await page.click('[data-ps-moment-keep]');
await page.waitForTimeout(2500);
ok(await page.evaluate(() => ((window.PS_SHELL.project.pinboards || []).flatMap(b => b.pins)).length) === 2,
   'two keeps landed in PROJECT.pins');
ok(await page.evaluate(() => ((window.PS_SHELL.project.pinboards || []).flatMap(b => b.pins))
       .every(p => p.src.indexOf('data:image/svg+xml') === 0)),
   'stored as the composed SVG itself - vector, not a raster (Torry, ' +
   'Aug 1 2026: "does it lose its vector-based resolution?")');
ok(await page.evaluate(() => window.PS_SHELL.workspace()) === wsBefore,
   'without yanking the user anywhere');

console.log('case 2: pages, no tabs, export gated');
await page.evaluate(() => {
    const items = document.querySelectorAll('#ps-toast .ps-toast-item button');
    items[items.length - 1].click();   // the toast's Open
});
await page.waitForTimeout(600);
const board = await page.evaluate(() => ({
    ws: window.PS_SHELL.workspace(),
    pages: document.querySelectorAll('.ps-pinpage').length,
    visible: (() => {
        const p = document.querySelector('.ps-pinpage img');
        return !!p && p.getBoundingClientRect().height > 40;
    })(),
    nums: [...document.querySelectorAll('.ps-pinpage-num')]
        .map(n => n.textContent),
    tabs: document.querySelectorAll('.ps-tab[data-chart-id]').length,
    exportDisabled: document.getElementById('ps-export').disabled,
    exportLabel: document.getElementById('ps-export').textContent,
}));
ok(board.ws === 'pinboard', "the toast's Open lands on the Pinboard");
ok(board.pages === 2 && board.visible,
   'each capture is its own visible page');
ok(/^Page 1 of 2\b/.test(board.nums[0]) &&
   /^Page 2 of 2\b/.test(board.nums[1]),
   `pages number themselves, with the kept time riding after ` +
   `(${board.nums.join('|')})`);
ok(board.tabs === 0, 'no document tabs: document-less like Data');
ok(!board.exportDisabled && board.exportLabel === 'Export Notebook',
   `Export is LIVE with pages on the board ("${board.exportLabel}") - it ` +
   'was disabled-with-a-tip at first and Torry read that as broken');

console.log('case 3: Send to layout places a copy, flowing below content');
await page.locator('[data-pin-send]').first().click();
await page.waitForTimeout(300);
await page.click('[data-context-action="pin-to-new"]');
await page.waitForTimeout(600);
const sent = await page.evaluate(() => {
    const lays = window.PS_SHELL.project.charts.filter(c => c.type === 'layout');
    return { layouts: lays.length, items: lays[0].items.length,
             kind: lays[0].items[0].kind,
             pinsStill: ((window.PS_SHELL.project.pinboards || []).flatMap(b => b.pins)).length,
             ws: window.PS_SHELL.workspace() };
});
ok(sent.layouts === 1 && sent.items === 1 && sent.kind === 'image',
   'a new layout holds the page as an image item');
ok(sent.pinsStill === 2 && sent.ws === 'pinboard',
   'as a COPY: the pin stays, and so does the user');

console.log('case 4: delete restores at its position through the undo toast');
const firstId = await page.evaluate(() => ((window.PS_SHELL.project.pinboards || []).flatMap(b => b.pins))[0].id);
await page.locator('[data-pin-delete]').first().click();
await page.waitForTimeout(400);
ok(await page.evaluate(() => ((window.PS_SHELL.project.pinboards || []).flatMap(b => b.pins)).length) === 1,
   'the page left the board');
await page.evaluate(() => {
    const items = document.querySelectorAll('#ps-toast .ps-toast-item button');
    items[items.length - 1].click();
});
await page.waitForTimeout(400);
const restored = await page.evaluate(() => ({
    n: ((window.PS_SHELL.project.pinboards || []).flatMap(b => b.pins)).length,
    firstBack: ((window.PS_SHELL.project.pinboards || []).flatMap(b => b.pins))[0].id,
}));
ok(restored.n === 2 && restored.firstBack === firstId,
   'undo put it back as page 1, not at the end');

console.log('case 5: a v1 marker-layout Notebook migrates to pins on load');
const migrated = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const p = JSON.parse(window.PS_SHELL.projectFileText());
    const proj = p.project || p;
    // Rebuild the v1 shape: pins go back INTO a marker layout, one image
    // item each, plus a text note that must SURVIVE as an ordinary layout.
    const pins = (proj.pinboards || []).flatMap(b => b.pins);
    delete proj.pinboards; proj.pins = [];
    proj.charts.push({ id: 'c98', name: 'Notebook', type: 'layout',
        notebook: true, items: pins.map((pin, i) => ({
            id: 'i' + (i + 1), kind: 'image', src: pin.src,
            natW: pin.natW, natH: pin.natH, x: 32, y: 32 + i * 500,
            w: pin.w, h: pin.h }))
        .concat([{ id: 'i99', kind: 'text', text: 'my old note',
                   x: 32, y: 2000, w: 200, h: 40, size: 14 }]),
        nextLabel: 0,
        page: { preset: 'custom', w: 1008, h: 2400, margin: 32 },
        view: { zoom: 'fit', grid: 8, showGrid: true, snap: true,
                guides: true, margins: true } });
    window.PS_SHELL.readPickedFile(new File([JSON.stringify(p)],
        'v1-notebook.pand', { type: 'application/json' }));
    await s(1400);
    const charts = window.PS_SHELL.project.charts;
    const exNotebook = charts.find(c => c.name === 'Notebook');
    return {
        pins: ((window.PS_SHELL.project.pinboards || []).flatMap(b => b.pins)).length,
        markerGone: charts.every(c => !c.notebook),
        noteSurvives: !!exNotebook && exNotebook.items.length === 1 &&
            exNotebook.items[0].kind === 'text',
    };
});
ok(migrated.pins === 2, 'the v1 captures were adopted as pins');
ok(migrated.markerGone, 'no marker layout remains');
ok(migrated.noteSurvives,
   'while the old text note survives as an ordinary layout');

console.log('case 6: new data resets the record (t4-67 extended)');
await page.evaluate(() => {
    window.PS_SHELL.readPickedFile(new File(['a,b\n1,2\n'], 'fresh.csv',
        { type: 'text/csv' }));
});
await page.waitForSelector('#ps-import-use', { state: 'visible',
                                               timeout: 8000 });
await page.click('#ps-import-use');
await page.waitForTimeout(800);
ok(await page.evaluate(() => ((window.PS_SHELL.project.pinboards || []).flatMap(b => b.pins)).length) === 0,
   'opening a data file empties the Pinboard with the documents');

console.log('case 7: layouts accept paste and From Pinboard');
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.addLayout ? window.PS_SHELL.addLayout()
        : window.PS_SHELL.runCommand('new-layout');
    await s(300);
    window.PS_SHELL.setWorkspace('layout');
    await s(400);
});
const pastedText = await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'A pasted annotation');
    document.body.dispatchEvent(new ClipboardEvent('paste',
        { clipboardData: dt, bubbles: true, cancelable: true }));
    const lay = window.PS_SHELL.project.charts
        .filter(c => c.type === 'layout').pop();
    const t = lay.items.filter(i => i.kind === 'text');
    return { n: t.length, text: t.length ? t[0].text : '' };
});
ok(pastedText.n === 1 && pastedText.text === 'A pasted annotation',
   'plain text pastes as a text item');
const emptyBoard = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    document.getElementById('ps-laddpin').click();
    await s(300);
    const toast = document.querySelectorAll('#ps-toast .ps-toast-item');
    return toast.length ? toast[toast.length - 1].textContent : '';
});
ok(/Nothing in the Notebook yet/.test(emptyBoard),
   'From Notebook on an empty board says so and offers the way there');

console.log('case 8: no charts-empty overlay; Export writes a real PDF');
await page.evaluate(() => window.PS_SHELL.setWorkspace('pinboard'));
await page.waitForTimeout(500);
ok(await page.evaluate(() =>
       document.getElementById('ps-workspace-empty').style.display) === 'none',
   'the "No charts yet / Create chart" overlay never shows on the ' +
   'Pinboard (the category error in the field screenshot)');
await page.evaluate(async () => {
    // Case 6 replaced the project with a two-column CSV; the fresh chart
    // has no roles, so give it some or there is no svg to pin.
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setWorkspace('chart');
    window.PS_SHELL.setModule('xyplotbuilder');
    window.PS_SHELL.setRoles('xyplotbuilder', { xvar: 'a', yvar: 'b' });
    await s(400);
});
await page.waitForFunction(() => {
    const svg = document.querySelector('.graphbuilder2-host svg');
    return !!svg && svg.querySelectorAll('*').length > 30;
}, null, { timeout: 15000 });
await page.waitForTimeout(400);
await page.evaluate(() => {
    const svg = document.querySelector('.graphbuilder2-host svg');
    const r = svg.getBoundingClientRect();
    svg.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true,
        cancelable: true, clientX: r.left + r.width / 2,
        clientY: r.top + 40 }));
});
await page.waitForTimeout(300);
await page.click('[data-context-action="pin-chart"]');
await page.waitForTimeout(300);
// The Aug 5 2026 shape: Keep always opens the section submenu.
await page.click('#ps-contextmenu [data-context-action^="keep-to-"]' +
    ':not([data-context-action="keep-to-new"])');
await page.waitForTimeout(900);
ok(await page.evaluate(() => {
    const pins = ((window.PS_SHELL.project.pinboards || [])
        .flatMap(b => b.pins));
    return pins.length >= 1 &&
        pins[pins.length - 1].src.indexOf('data:image/svg+xml') === 0;
}), 'the chart right-click "Pin to Pinboard" pins JUST the graph, as vector');
await page.evaluate(() => {
    window.__psPinExportLast = null;
    window.showSaveFilePicker = () => Promise.resolve({
        createWritable: () => Promise.resolve({
            write: () => Promise.resolve(),
            close: () => Promise.resolve() }) });
    window.PS_SHELL.setWorkspace('pinboard');
});
await page.waitForTimeout(500);
await page.click('#ps-export');
await page.waitForTimeout(300);
const scopeMenu = await page.evaluate(() => ({
    page: !!document.querySelector('[data-context-action="pin-export-page"]'),
    active: !!document.querySelector(
        '[data-context-action="pin-export-active"]'),
    all: !!document.querySelector('[data-context-action="pin-export-all"]'),
}));
ok(scopeMenu.page && scopeMenu.all && !scopeMenu.active,
   'one board: the Export menu offers This page and Entire notebook ' +
   '(no redundant section entry)');
await page.click('[data-context-action="pin-export-all"]');
await page.waitForFunction(() =>
    document.getElementById('ps-exporter').style.display === 'flex',
    null, { timeout: 8000 });
const dlg = await page.evaluate(() => ({
    title: document.getElementById('ps-export-title').textContent,
    cap: document.getElementById('ps-export-caption-field').style.display,
    desc: document.getElementById('ps-export-description-field')
        .style.display,
}));
ok(dlg.title === 'Export Notebook' && dlg.cap === 'none' &&
   dlg.desc === 'none',
   'the scope choice opens the shared export dialog in Notebook mode - ' +
   'caption and description step aside (pages are finished captures)');
const pdf = await exportViaDialog('pdf');
ok(pdf.pages >= 1 && pdf.bytes > 1500 && pdf.container === 'pdf',
   `Export writes a real one-page-per-pin PDF (${pdf.pages} page(s), ` +
   `${pdf.bytes} bytes - the svg2pdf ballpark measured against the chart ` +
   `exporter's 2350)`);

console.log('case 9: an svg pin placed in a layout exports as INLINE vector');
await page.locator('[data-pin-send]').first().click();
await page.waitForTimeout(300);
await page.click('[data-context-action="pin-to-new"]');
await page.waitForTimeout(600);
// The send toast's Open lands on THE receiving layout - a bare workspace
// switch would negotiate back to the last-used one (case 7's text layout)
// and export the wrong document.
await page.evaluate(() => {
    const items = document.querySelectorAll('#ps-toast .ps-toast-item button');
    items[items.length - 1].click();
});
await page.waitForTimeout(700);
const inlined = await page.evaluate(async () => {
    const src = await window.PS_SHELL.exportSource('white');
    return { nested: (src.svg.match(/<svg/g) || []).length,
             referenced: src.svg.indexOf('data:image/svg') >= 0 };
});
ok(inlined.nested >= 2 && !inlined.referenced,
   `the layout export carries the pin as REAL svg nodes, not an <image> ` +
   `reference (${inlined.nested} svg roots) - so PDF stays vector through ` +
   `svg2pdf`);

console.log('case 10: pins never travel between projects (the leak)');
await page.evaluate(() => { window.PS_SHELL.runCommand('welcome'); });
await page.waitForTimeout(600);
if (await page.locator('#ps-welcome-sample').isVisible().catch(() => false)) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1400);
}
ok(await page.evaluate(() => ((window.PS_SHELL.project.pinboards || []).flatMap(b => b.pins)).length) === 0,
   'loading another project leaves an EMPTY Pinboard: evidence belongs ' +
   'to its file (the field leak, Aug 1 2026)');

console.log('case 11: boards - the "+" belongs to the Pinboard, not charts');
// Torry's field find (Aug 1 2026): the document strip's "+" leaked onto
// the Pinboard and created a CHART. The strip's "+" now makes a BOARD -
// the board tabs live IN the strip (the Aug 1 consistency round),
// wearing the exact chart/layout tab classes plus a pin icon.
await page.evaluate(() => window.PS_SHELL.setWorkspace('pinboard'));
await page.waitForTimeout(500);
const chrome = await page.evaluate(() => {
    const add = document.querySelector('#ps-tabs .ps-tab-add');
    return {
        addLabel: add ? add.getAttribute('aria-label') : null,
        barTabs: [...document.querySelectorAll(
            '#ps-tabs .ps-tab[data-board-id] .ps-tab-name')]
            .map(t => t.textContent),
        icons: document.querySelectorAll(
            '#ps-tabs .ps-tab[data-board-id] .ps-ticon').length,
    };
});
ok(chrome.addLabel === 'New section',
   'the strip "+" makes a SECTION on this workspace, not a chart');
ok(chrome.barTabs.length === 1 && chrome.icons === 1,
   `a single default board renders one strip tab with its pin icon ` +
   `(${chrome.barTabs[0]})`);
const chartsBefore = await page.evaluate(() =>
    window.PS_SHELL.project.charts.length);
await page.click('#ps-tabs .ps-tab-add');
await page.waitForTimeout(400);
await page.keyboard.type('Methods');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
const boarded = await page.evaluate(() => ({
    boards: window.PS_SHELL.project.pinboards.map(b => b.name),
    charts: window.PS_SHELL.project.charts.length,
    active: (window.PS_SHELL.project.pinboards.find(b =>
        b.id === window.PS_SHELL.project.ui.activeBoard) || {}).name,
}));
ok(boarded.boards.join('|').indexOf('Methods') >= 0 &&
   boarded.charts === chartsBefore,
   `"+" made a BOARD named in place, and zero charts ` +
   `(${boarded.boards.join('|')})`);
ok(boarded.active === 'Methods', 'the new board is active');

console.log('case 12: keeps land on the ACTIVE board; delete has undo');
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setWorkspace('chart');
    await s(500);
    const b = document.querySelector(
        '.graphbuilder2-host button[aria-label="Statistics"]');
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await s(900);
    // a DIFFERENT row: re-clicking the pinned one UNPINS (engine rule)
    const rows = document.querySelectorAll(
        '[data-st-pane="pairs"] tr[data-link]');
    rows[rows.length - 1].click();
});
await page.waitForTimeout(700);
await page.click('[data-ps-moment-keep]');
await page.waitForTimeout(1500);
const keptTo = await page.evaluate(() => ({
    last: window.__psKeepLast,
    counts: window.PS_SHELL.project.pinboards.map(b => b.pins.length),
}));
ok(keptTo.last.board === 'Methods',
   `Keep names its destination ("Kept to ${keptTo.last.board}")`);
await page.evaluate(() => window.PS_SHELL.setWorkspace('pinboard'));
await page.waitForTimeout(400);
await page.locator('#ps-tabs .ps-tab[data-board-id]').nth(1)
    .click({ button: 'right' });
await page.waitForTimeout(300);
await page.click('[data-context-action="board-delete"]');
await page.waitForTimeout(400);
ok(await page.evaluate(() =>
       window.PS_SHELL.project.pinboards.length) === 1,
   'Delete removed the board and its pages');
await page.evaluate(() => {
    const items = document.querySelectorAll('#ps-toast .ps-toast-item button');
    items[items.length - 1].click();
});
await page.waitForTimeout(400);
const boardsBack = await page.evaluate(() =>
    window.PS_SHELL.project.pinboards.map(b => b.name + ':' + b.pins.length));
ok(boardsBack.length === 2 && boardsBack.some(b => /^Methods:1$/.test(b)),
   `the undo toast restored the board WITH its pages (${boardsBack})`);

console.log('case 13: Export offers scope with several boards; all-in-one PDF');
// Case 12 left Board 1 empty and Methods with one page. Fill Board 1 via
// the chart right-click pin (it targets the ACTIVE board).
await page.evaluate(() => window.PS_SHELL.setWorkspace('pinboard'));
await page.waitForTimeout(400);
await page.locator('#ps-tabs .ps-tab[data-board-id] .ps-tab-select')
    .first().click();
await page.waitForTimeout(300);
await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
await page.waitForTimeout(600);
await page.evaluate(() => {
    const svg = document.querySelector('.graphbuilder2-host svg');
    const r = svg.getBoundingClientRect();
    svg.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true,
        cancelable: true, clientX: r.left + r.width / 2,
        clientY: r.top + 40 }));
});
await page.waitForTimeout(300);
// Keep opens the section submenu; rows carry bare section names
await page.click('#ps-contextmenu [data-context-action="pin-chart"]');
await page.waitForTimeout(300);
await page.locator('#ps-contextmenu button', { hasText: 'Section 1' })
    .click();
await page.waitForTimeout(900);
await page.evaluate(() => {
    window.__psPinExportLast = null;
    window.showSaveFilePicker = () => Promise.resolve({
        createWritable: () => Promise.resolve({
            write: () => Promise.resolve(),
            close: () => Promise.resolve() }) });
    window.PS_SHELL.setWorkspace('pinboard');
});
await page.waitForTimeout(400);
await page.click('#ps-export');
await page.waitForTimeout(400);
ok(await page.locator('[data-context-action="pin-export-all"]').count() === 1 &&
   await page.locator('[data-context-action="pin-export-active"]')
       .count() === 1 &&
   await page.locator('[data-context-action="pin-export-page"]')
       .count() === 1,
   'with two populated boards, Export offers page, section AND notebook');
await page.click('[data-context-action="pin-export-all"]');
const allPdf = await exportViaDialog('pdf');
ok(allPdf.scope === 'all' && allPdf.pages === 2 && allPdf.bytes > 1500,
   `"Entire notebook" concatenates every board's pages ` +
   `(${allPdf.pages} pages, ${allPdf.bytes} bytes)`);

console.log('case 14: dragging a pin never arms the file-drop overlay');
// Chromium stamps "Files" onto native image drags, so grabbing a pin used
// to open the data loader (Torry's screenshot). Two layers under test:
// the img is not draggable at all, and an INTERNAL dragstart suppresses
// the overlay whatever the dataTransfer claims.
const dragSafe = await page.evaluate(() => {
    const img = document.querySelector('.ps-pinpage img');
    const notDraggable = !!img && img.draggable === false;
    document.dispatchEvent(new DragEvent('dragstart', { bubbles: true }));
    const dt = new DataTransfer();
    // simulate the virtual-file stamp a native image drag carries
    try { dt.items.add(new File(['x'], 'ghost.png', { type: 'image/png' })); }
    catch (e) { /* jsdom-ish engines */ }
    document.dispatchEvent(new DragEvent('dragenter',
        { bubbles: true, dataTransfer: dt }));
    const overlayOn = document.getElementById('ps-pagedrop')
        .classList.contains('ps-pagedrop-on');
    document.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
    return { notDraggable, overlayOn };
});
ok(dragSafe.notDraggable, 'pin images are not draggable objects');
ok(!dragSafe.overlayOn,
   'and an app-internal drag never lights "Drop to open"');

console.log('case 15: pins carry the live chart font (no serif fallback)');
// The chart's on-screen font comes from the HOST div via CSS inheritance;
// a serialized pin inside an <img> has no page CSS, so an unstamped pin
// fell back to the browser serif (Torry's screenshot, Aug 1 2026).
await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
await page.waitForFunction(() =>
    !!document.querySelector('.graphbuilder2-host svg'), null,
    { timeout: 15000 });
await page.waitForTimeout(300);
const fontPin = await page.evaluate(() => {
    const svgs = [...document.querySelectorAll('.graphbuilder2-host svg')];
    let chart = null, area = 0;
    for (const s of svgs) {
        const r = s.getBoundingClientRect();
        if (r.width * r.height > area) { area = r.width * r.height; chart = s; }
    }
    // hidden elements still resolve computed style, so no ws switch needed
    const live = getComputedStyle(chart).fontFamily;
    const pins = (window.PS_SHELL.project.pinboards || []).flatMap(b => b.pins);
    const pin = pins[pins.length - 1];
    const txt = decodeURIComponent(pin.src.slice(pin.src.indexOf(',') + 1));
    const root = new DOMParser().parseFromString(txt, 'image/svg+xml')
        .documentElement;
    const bare = [...root.querySelectorAll('text')]
        .filter(t => !t.getAttribute('font-family') &&
                     !t.closest('[font-family]')).length;
    return { live, rootFam: root.getAttribute('font-family'), bare };
});
ok(fontPin.rootFam && fontPin.rootFam === fontPin.live,
   `the stored svg root names the live chart's font ` +
   `(${JSON.stringify(fontPin.rootFam)})`);
ok(fontPin.bare === 0,
   'and no text node is left to the viewer serif fallback');
// Legacy pins (kept before the stamp) heal on render: inject a font-less
// pin the way the first build stored them, re-enter the workspace.
await page.evaluate(() => {
    const boards = window.PS_SHELL.project.pinboards;
    const active = boards.find(b =>
        b.id === window.PS_SHELL.project.ui.activeBoard) || boards[0];
    const legacy = '<svg xmlns="http://www.w3.org/2000/svg" width="80" ' +
        'height="40" viewBox="0 0 80 40"><text x="6" y="22">legacy</text></svg>';
    active.pins.push({ id: 'pLegacyFont', natW: 80, natH: 40, w: 80, h: 40,
        src: 'data:image/svg+xml;charset=utf-8,' +
             encodeURIComponent(legacy) });
    window.PS_SHELL.setWorkspace('chart');
});
await page.waitForTimeout(300);
await page.evaluate(() => window.PS_SHELL.setWorkspace('pinboard'));
await page.waitForTimeout(500);
const healed = await page.evaluate(() => {
    const pins = (window.PS_SHELL.project.pinboards || []).flatMap(b => b.pins);
    const pin = pins.find(p => p.id === 'pLegacyFont');
    const txt = decodeURIComponent(pin.src.slice(pin.src.indexOf(',') + 1));
    const root = new DOMParser().parseFromString(txt, 'image/svg+xml')
        .documentElement;
    return root.getAttribute('font-family');
});
ok(healed === 'sans-serif',
   `a pre-stamp pin heals to the app default on render (${healed})`);
await page.evaluate(() => {
    // drop the fixture pin so later reads see real state
    for (const b of window.PS_SHELL.project.pinboards)
        b.pins = b.pins.filter(p => p.id !== 'pLegacyFont');
    window.PS_SHELL.setWorkspace('pinboard');
});
await page.waitForTimeout(300);

console.log('case 16: the Pinboard zooms like Layout');
const zoomStart = await page.evaluate(() => ({
    value: document.getElementById('ps-pzoom').value,
    pageW: document.querySelector('.ps-pinpage').offsetWidth,
    natW: ((window.PS_SHELL.project.pinboards || [])
        .find(b => b.id === window.PS_SHELL.project.ui.activeBoard)
        .pins[0] || {}).natW,
}));
ok(zoomStart.value === 'fit',
   'the zoom select defaults to Fit page (the curated reading width)');
async function setZoom(v) {
    return page.evaluate(z => {
        const sel = document.getElementById('ps-pzoom');
        sel.value = z;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        // measure the IMG: that is the chart area the zoom promises
        return document.querySelector('.ps-pinpage img').offsetWidth;
    }, v);
}
const wHalf = await setZoom('0.5');
const wFull = await setZoom('1');
ok(Math.abs(wHalf - zoomStart.natW * 0.5) <= 4 &&
   Math.abs(wFull - zoomStart.natW) <= 4,
   `percent zoom sizes pages from the pin's NATURAL width: 100% is the ` +
   `chart at its Charts-workspace size (${wHalf}px at 50%, ${wFull}px at ` +
   `100%, natural ${zoomStart.natW}px)`);
ok(await page.evaluate(() => window.PS_SHELL.project.ui.pinZoom) === 1,
   'the choice persists in the project ui state');
await setZoom('fit');
ok(await page.evaluate(() =>
       document.querySelector('.ps-pinpage').offsetWidth) === zoomStart.pageW,
   'Fit page restores the reading width exactly');
// Torry, Aug 1 2026 round 2: 25% squeezed the page-bar buttons off the
// card - 50% is the floor, and a stored smaller value (the option
// existed briefly) normalizes up instead of leaving the select blank.
const floor = await page.evaluate(() => {
    const opts = [...document.querySelectorAll('#ps-pzoom option')]
        .map(o => o.value);
    window.PS_SHELL.project.ui.pinZoom = 0.25;   // legacy stored value
    window.PS_SHELL.setWorkspace('chart');
    return opts;
});
await page.waitForTimeout(200);
await page.evaluate(() => window.PS_SHELL.setWorkspace('pinboard'));
await page.waitForTimeout(400);
ok(!floor.includes('0.25') && floor.includes('0.5'),
   'the zoom floor is 50% - no 25% option on the Pinboard');
ok(await page.evaluate(() => ({
       sel: document.getElementById('ps-pzoom').value,
       ui: window.PS_SHELL.project.ui.pinZoom,
   })).then(z => z.sel === '0.5' && z.ui === 0.5),
   'a stored 25% normalizes up to 50%, never a blank select');
// Aug 5 2026 (Torry): with FOUR buttons the 50% card crushed "Page 1 of
// 7 · kept..." into a one-word-wide column and grew the card tall. The
// bar wraps its BUTTONS below the one-line info text instead.
await setZoom('0.5');
await page.waitForTimeout(300);
const barGeom = await page.evaluate(() => {
    const card = document.querySelector('.ps-pinpage');
    const bar = card.querySelector('.ps-pinpage-bar');
    const num = bar.querySelector('.ps-pinpage-num');
    return { numH: num.getBoundingClientRect().height,
             overflow: bar.scrollWidth > bar.clientWidth + 1,
             buttons: bar.querySelectorAll('button').length };
});
ok(barGeom.numH < 22 && !barGeom.overflow && barGeom.buttons === 4,
   `at 50% zoom the page info stays ONE line and nothing overflows ` +
   `(info ${Math.round(barGeom.numH)}px tall, ${barGeom.buttons} buttons)`);
await setZoom('fit');
// The focus ring must have room BELOW the select: the scroll area starts
// flush under the tools row and its background painted over the ring's
// bottom edge (Torry's screenshot).
const ringRoom = await page.evaluate(() => {
    const sel = document.getElementById('ps-pzoom').getBoundingClientRect();
    const tools = document.getElementById('ps-pintools')
        .getBoundingClientRect();
    return { below: tools.bottom - sel.bottom };
});
ok(ringRoom.below >= 4,
   `the tools row leaves room under the select, so a focus ring draws ` +
   `whole (${ringRoom.below.toFixed(1)}px below)`);

console.log('case 17: board tabs behave like document tabs');
const tabState = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll(
        '#ps-tabs .ps-tab[data-board-id]')];
    return {
        n: tabs.length,
        active: tabs.filter(t => t.classList.contains('ps-tab-active')).length,
        selected: tabs.map(t => t.querySelector('.ps-tab-select')
            .getAttribute('aria-selected')),
        xs: tabs.filter(t => t.querySelector('.ps-tab-x')).length,
    };
});
ok(tabState.n === 2 && tabState.active === 1 &&
   tabState.selected.filter(s => s === 'true').length === 1,
   'exactly one board tab is active/selected');
ok(tabState.xs === 2,
   'every tab carries the per-tab close, chart-strip style');
// switching: click the OTHER board's select
const beforeSwitch = await page.evaluate(() =>
    window.PS_SHELL.project.ui.activeBoard);
await page.evaluate(() => {
    const tabs = [...document.querySelectorAll(
        '#ps-tabs .ps-tab[data-board-id]')];
    const other = tabs.find(t => !t.classList.contains('ps-tab-active'));
    other.querySelector('.ps-tab-select').click();
});
await page.waitForTimeout(400);
ok(await page.evaluate(() => window.PS_SHELL.project.ui.activeBoard)
       !== beforeSwitch,
   'clicking another board tab switches the active board');
// double-click rename opens the in-place input; Escape cancels
await page.evaluate(() => {
    const sel = document.querySelector(
        '#ps-tabs .ps-tab-active .ps-tab-select');
    sel.click();
});
await page.waitForTimeout(80);
await page.evaluate(() => {
    const sel = document.querySelector(
        '#ps-tabs .ps-tab-active .ps-tab-select');
    if (sel) sel.click();
});
await page.waitForTimeout(300);
ok(await page.locator('.ps-tab-rename[data-board-rename]').count() === 1,
   'two quick clicks open the in-place rename, the document-tab idiom');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
ok(await page.locator('.ps-tab-rename[data-board-rename]').count() === 0,
   'Escape cancels the rename');
// the per-tab X deletes with undo
const beforeX = await page.evaluate(() =>
    window.PS_SHELL.project.pinboards.length);
await page.evaluate(() => {
    document.querySelector(
        '#ps-tabs .ps-tab-active .ps-tab-x').click();
});
await page.waitForTimeout(400);
const afterX = await page.evaluate(() =>
    window.PS_SHELL.project.pinboards.length);
await page.evaluate(() => {
    const items = document.querySelectorAll('#ps-toast .ps-toast-item button');
    items[items.length - 1].click();
});
await page.waitForTimeout(400);
ok(afterX === beforeX - 1 &&
   await page.evaluate(() =>
       window.PS_SHELL.project.pinboards.length) === beforeX,
   'the tab X deletes the board; the undo toast brings it back');

console.log('case 18: with several boards, "Pin to" names each one');
// Torry, Aug 1 2026: "do I have the ability to pin it to a specific
// board?" With >= 2 boards the chart right-click lists one entry per
// board; the choice also makes that board active so the toast's Open
// lands on the evidence.
await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
await page.waitForFunction(() =>
    !!document.querySelector('.graphbuilder2-host svg'), null,
    { timeout: 15000 });
await page.waitForTimeout(300);
await page.evaluate(() => {
    const svg = document.querySelector('.graphbuilder2-host svg');
    const r = svg.getBoundingClientRect();
    svg.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true,
        cancelable: true, clientX: r.left + r.width / 2,
        clientY: r.top + 40 }));
});
await page.waitForTimeout(300);
ok(await page.evaluate(() =>
       !!document.querySelector(
           '#ps-contextmenu [data-context-action="pin-chart"]') &&
       !document.querySelector(
           '#ps-contextmenu [data-context-action^="pin-chart:"]')),
   'the main menu carries ONE Keep to Notebook entry (Aug 5 2026 shape)');
await page.click('#ps-contextmenu [data-context-action="pin-chart"]');
await page.waitForTimeout(300);
const pinMenu = await page.evaluate(() => ({
    perBoard: [...document.querySelectorAll(
        '#ps-contextmenu [data-context-action^="keep-to-"]')]
        .filter(b => b.getAttribute('data-context-action') !== 'keep-to-new')
        .map(b => b.textContent),
    newSection: !!document.querySelector(
        '#ps-contextmenu [data-context-action="keep-to-new"]'),
}));
ok(pinMenu.perBoard.length === 2 && pinMenu.newSection,
   `the submenu names each section plus New section, the send-menu ` +
   `shape (${pinMenu.perBoard.join(' | ')})`);
const target = await page.evaluate(() => {
    // pick the NON-active board so the retarget is observable
    const boards = window.PS_SHELL.project.pinboards;
    const other = boards.find(b =>
        b.id !== window.PS_SHELL.project.ui.activeBoard);
    return { id: other.id, name: other.name, count: other.pins.length };
});
await page.click(
    '#ps-contextmenu [data-context-action="keep-to-' + target.id + '"]');
await page.waitForTimeout(900);
const landed = await page.evaluate(id => {
    const boards = window.PS_SHELL.project.pinboards;
    const b = boards.find(x => x.id === id);
    return { count: b.pins.length,
             active: window.PS_SHELL.project.ui.activeBoard === id,
             toast: (document.querySelector('#ps-toast') || {}).textContent };
}, target.id);
ok(landed.count === target.count + 1,
   `the pin landed on the CHOSEN board (${target.name})`);
ok(landed.active, 'and that board became active, so Open shows it');
ok((landed.toast || '').indexOf(target.name) >= 0,
   'the toast names the destination board');
// And the third option (Torry, Aug 5 2026): New section creates a board
// and keeps there in one gesture.
const beforeNew = await page.evaluate(() =>
    window.PS_SHELL.project.pinboards.length);
await page.evaluate(() => {
    const svg = document.querySelector('.graphbuilder2-host svg');
    const r = svg.getBoundingClientRect();
    svg.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true,
        cancelable: true, clientX: r.left + r.width / 2,
        clientY: r.top + 40 }));
});
await page.waitForTimeout(300);
await page.click('#ps-contextmenu [data-context-action="pin-chart"]');
await page.waitForTimeout(300);
await page.click('#ps-contextmenu [data-context-action="keep-to-new"]');
await page.waitForTimeout(900);
const newSec = await page.evaluate(() => {
    const boards = window.PS_SHELL.project.pinboards;
    const b = boards[boards.length - 1];
    return { boards: boards.length, name: b.name, pins: b.pins.length,
             active: window.PS_SHELL.project.ui.activeBoard === b.id };
});
ok(newSec.boards === beforeNew + 1 && newSec.pins === 1 &&
   /^Section \d+$/.test(newSec.name) && newSec.active,
   `New section creates a board and keeps there in one gesture ` +
   `("${newSec.name}", 1 page, active)`);
// Clean up the scratch section and hand the baton back: later cases
// build on the pre-existing boards and read pins in board order.
await page.evaluate((id) => {
    const P = window.PS_SHELL.project;
    const bi = P.pinboards.findIndex(b =>
        b.id === P.ui.activeBoard && b.pins.length === 1);
    if (bi >= 0 && P.pinboards.length > 1) P.pinboards.splice(bi, 1);
    P.ui.activeBoard = id;
}, target.id);

console.log('case 19: the Pinboard owns its right-click');
// Torry, Aug 1 2026: right-click on the Pinboard showed the CHART menu -
// "Copy as image" targeting a chart not on screen and a circular "Pin to
// Pinboard" (#ps-workcard wraps every workspace, so pinboard clicks fell
// through to the chart branch). A page click now mirrors the page card's
// buttons plus the page-scoped export; empty space offers the board export.
await page.evaluate(() => window.PS_SHELL.setWorkspace('pinboard'));
await page.waitForTimeout(500);
await page.evaluate(() => {
    const img = document.querySelector('.ps-pinpage img');
    const r = img.getBoundingClientRect();
    img.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true,
        cancelable: true, clientX: r.left + 30, clientY: r.top + 30 }));
});
await page.waitForTimeout(300);
const pageMenu = await page.evaluate(() => ({
    keys: [...document.querySelectorAll(
        '#ps-contextmenu [data-context-action]')]
        .map(b => b.getAttribute('data-context-action')),
    commands: [...document.querySelectorAll(
        '#ps-contextmenu [data-context-command]')]
        .map(b => b.getAttribute('data-context-command')),
    text: document.getElementById('ps-contextmenu').textContent,
}));
ok(['pin-copy', 'pin-send', 'pin-export-page', 'pin-delete']
       .every(k => pageMenu.keys.includes(k)),
   'a page right-click offers Copy / Send to layout / Export this page / ' +
   'Delete');
ok(!pageMenu.keys.some(k => k.indexOf('pin-chart') === 0) &&
   !pageMenu.commands.includes('copy-image') &&
   pageMenu.text.indexOf('Reset chart styling') < 0,
   'and none of the chart menu leaks in');
await page.evaluate(() => { window.__psPinExportLast = null; });
await page.click('#ps-contextmenu [data-context-action="pin-export-page"]');
await page.waitForFunction(() =>
    document.getElementById('ps-exporter').style.display === 'flex',
    null, { timeout: 8000 });
ok(await page.evaluate(() =>
       document.getElementById('ps-export-title').textContent) ===
   'Export page',
   'the page right-click opens the shared dialog scoped to that page');
const onePage = await exportViaDialog('pdf');
ok(onePage.scope === 'page' && onePage.pages === 1 && onePage.bytes > 700,
   `"Export this page" writes a one-page PDF (${onePage.bytes} bytes)`);
await page.evaluate(() => {
    const scroll = document.getElementById('ps-pinscroll');
    const r = scroll.getBoundingClientRect();
    scroll.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true,
        cancelable: true, clientX: r.left + 8, clientY: r.bottom - 8 }));
});
await page.waitForTimeout(300);
const spaceMenu = await page.evaluate(() => ({
    commands: [...document.querySelectorAll(
        '#ps-contextmenu [data-context-command]')]
        .map(b => b.getAttribute('data-context-command')),
    n: document.querySelectorAll('#ps-contextmenu button').length,
}));
ok(spaceMenu.commands.length === 1 && spaceMenu.commands[0] === 'export' &&
   spaceMenu.n === 1,
   'empty Pinboard space offers just the board-level Export');
await page.keyboard.press('Escape');

console.log('case 20: the PDF keeps the font (no Times fallback)');
// Torry, Aug 1 2026: the board showed sans but the exported PDF read as
// Times. svg2pdf breaks on NUMERIC font weights - the engine's on-screen
// semi-bold 600 does not just lose boldness, it misses the helvetica
// lookup entirely and falls back to Times-Roman (the axis titles).
// normalizePdfFonts now forces >= 600 -> bold, the engine export clone's
// own rule. Assert on the PDF BYTES: what fonts it declares is the truth.
await page.evaluate(() => {
    window.__psPdfText = null;
    window.showSaveFilePicker = () => Promise.resolve({
        createWritable: () => Promise.resolve({
            write: async (data) => {
                const blob = data instanceof Blob ? data : null;
                if (!blob) return;
                const u = new Uint8Array(await blob.arrayBuffer());
                let s = '';
                for (let i = 0; i < u.length; i++)
                    s += String.fromCharCode(u[i]);
                window.__psPdfText = s;
            },
            close: () => Promise.resolve() }) });
});
await page.click('#ps-export');
await page.waitForTimeout(400);
// several populated boards: the scope menu appears; take the active board
if (await page.locator('[data-context-action="pin-export-active"]').count())
    await page.click('[data-context-action="pin-export-active"]');
else
    await page.click('[data-context-action="pin-export-all"]');
await page.waitForFunction(() =>
    document.getElementById('ps-exporter').style.display === 'flex',
    null, { timeout: 8000 });
await page.click('.ps-export-format:has(input[value="pdf"])');
await page.click('#ps-export-go');
await page.waitForFunction(() => window.__psPdfText, null, { timeout: 20000 });
const pdfFonts = await page.evaluate(() =>
    [...new Set([...window.__psPdfText.matchAll(
        /\/BaseFont\s*\/([A-Za-z0-9\-]+)/g)].map(m => m[1]))]);
ok(pdfFonts.length > 0 && !pdfFonts.some(f => /Times/i.test(f)),
   `no text in the exported PDF falls back to Times ` +
   `(${pdfFonts.join(', ')})`);
ok(pdfFonts.some(f => /Helvetica-Bold/.test(f)),
   'and the semi-bold titles kept their emphasis as real bold');

console.log('case 21: the rail knows the selected page (kept time + notes)');
// Torry, Aug 1 2026: the right rail was empty; it now shows the selected
// page's kept time, source, and a notes field saved with the project.
await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
await page.waitForFunction(() =>
    !!document.querySelector('.graphbuilder2-host svg'), null,
    { timeout: 15000 });
await page.waitForTimeout(400);
await page.evaluate(() => {
    const svg = document.querySelector('.graphbuilder2-host svg');
    const r = svg.getBoundingClientRect();
    svg.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true,
        cancelable: true, clientX: r.left + r.width / 2,
        clientY: r.top + 40 }));
});
await page.waitForTimeout(300);
await page.click('#ps-contextmenu [data-context-action="pin-chart"]');
await page.waitForTimeout(300);
await page.evaluate(() => {
    document.querySelector('#ps-contextmenu [data-context-action="keep-to-' +
        window.PS_SHELL.project.ui.activeBoard + '"]').click();
});
await page.waitForTimeout(700);
const freshPin = await page.evaluate(() => {
    const boards = window.PS_SHELL.project.pinboards;
    const active = boards.find(b =>
        b.id === window.PS_SHELL.project.ui.activeBoard);
    const pin = active.pins[active.pins.length - 1];
    return { id: pin.id, at: pin.at, srcChart: pin.srcChart,
             srcSig: pin.srcSig };
});
ok(!!freshPin.at && !!freshPin.srcChart && !!freshPin.srcSig,
   'a new pin records when it was kept and which chart it came from');
await page.evaluate(() => window.PS_SHELL.setWorkspace('pinboard'));
await page.waitForTimeout(500);
await page.click('.ps-pinpage[data-pin-id="' + freshPin.id + '"]');
await page.waitForTimeout(300);
const rail = await page.evaluate(() => ({
    paneActive: document.getElementById('ps-inspector-pinboard')
        .classList.contains('ps-inspector-active'),
    selShown: document.getElementById('ps-pininsp-sel').style.display !== 'none',
    kept: document.getElementById('ps-pininsp-kept').textContent,
    srcState: document.getElementById('ps-pininsp-src')
        .getAttribute('data-state'),
    srcText: document.getElementById('ps-pininsp-src').textContent,
    barKept: [...document.querySelectorAll('.ps-pinpage-num')]
        .some(n => /kept /.test(n.textContent)),
}));
ok(rail.paneActive && rail.selShown && rail.kept.length > 3 &&
   !/Before timestamps/.test(rail.kept),
   `selecting a page fills the rail: kept "${rail.kept}"`);
ok(rail.barKept, 'the page bar carries the kept time too, subtly');
ok(rail.srcState === 'same' && /unchanged since it was kept/.test(rail.srcText),
   `and the source line verifies the chart is unchanged ("${rail.srcText}")`);
await page.fill('#ps-pininsp-note', 'Outlier in Low dose - ask Sam.');
await page.waitForTimeout(900);
ok(await page.evaluate(id => {
    const pins = (window.PS_SHELL.project.pinboards || [])
        .flatMap(b => b.pins);
    return (pins.find(p => p.id === id) || {}).note;
}, freshPin.id) === 'Outlier in Low dose - ask Sam.',
   'typed notes persist on the pin (project data, saved with the file)');
// switch boards away and back: the note survives the rebuild
await page.evaluate(() => {
    const tabs = [...document.querySelectorAll(
        '#ps-tabs .ps-tab[data-board-id]')];
    tabs.find(t => !t.classList.contains('ps-tab-active'))
        .querySelector('.ps-tab-select').click();
});
await page.waitForTimeout(400);
await page.evaluate(id => {
    const boards = window.PS_SHELL.project.pinboards;
    const owner = boards.find(b => b.pins.some(p => p.id === id));
    window.PS_SHELL.project.ui.activeBoard = owner.id;
    window.PS_SHELL.setWorkspace('pinboard');
}, freshPin.id);
await page.waitForTimeout(400);
await page.click('.ps-pinpage[data-pin-id="' + freshPin.id + '"]');
await page.waitForTimeout(300);
ok(await page.evaluate(() =>
       document.getElementById('ps-pininsp-note').value) ===
   'Outlier in Low dose - ask Sam.',
   'the note comes back after leaving and reselecting');
await page.evaluate(() =>
    document.getElementById('ps-pinscroll').click());
await page.waitForTimeout(200);
ok(await page.evaluate(() =>
       document.getElementById('ps-pininsp-empty').style.display !== 'none'),
   'clicking the board background releases the selection');

console.log('case 22: the source verdict is honest through its lifecycle');
// Torry's "feel free to veto" ask, kept: unchanged -> (edit elsewhere) ->
// "not checked" -> (chart re-renders) -> "changed" -> (chart deleted) ->
// "no longer in the project". The verdict never claims what it has not
// verified.
await page.click('.ps-pinpage[data-pin-id="' + freshPin.id + '"]');
await page.waitForTimeout(300);
const excl = await page.evaluate(() => {
    // a data mutation made AWAY from the chart: exclude one observation
    // IN A COLUMN THE CHART PLOTS (the first draft excluded an unplotted
    // column and the verdict correctly said "unchanged" - the honest
    // verdict caught the sloppy probe)
    const rr = window.PS_SHELL.rolesStore();
    const col = Object.values(rr).flat().filter(v =>
        typeof v === 'string' && v)[0];
    window.PS_SHELL.setExcluded(col, 0, true);
    return col;
});
await page.waitForTimeout(500);
const stale = await page.evaluate(id => {
    const el = document.getElementById('ps-pininsp-src');
    return { state: el.getAttribute('data-state'), text: el.textContent };
}, freshPin.id);
ok(stale.state === 'stale' && /not checked/.test(stale.text),
   `after an edit elsewhere it says so honestly ("${stale.text}")`);
await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
await page.waitForTimeout(1200);
await page.evaluate(() => window.PS_SHELL.setWorkspace('pinboard'));
await page.waitForTimeout(500);
await page.click('.ps-pinpage[data-pin-id="' + freshPin.id + '"]');
await page.waitForTimeout(300);
const changed = await page.evaluate(() => {
    const el = document.getElementById('ps-pininsp-src');
    return { state: el.getAttribute('data-state'), text: el.textContent };
});
ok(changed.state === 'changed' && /has changed since/.test(changed.text),
   `once the chart re-renders, the verdict is verified ("${changed.text}")`);
await page.evaluate(col => window.PS_SHELL.setExcluded(col, 0, false), excl);
await page.waitForTimeout(400);
await page.evaluate(id => {
    // a second chart so the source can be closed, then close the source
    window.PS_SHELL.addChart('plotbuilder');
    window.PS_SHELL.closeDocument(id);
}, freshPin.srcChart);
await page.waitForTimeout(500);
await page.evaluate(() => window.PS_SHELL.setWorkspace('pinboard'));
await page.waitForTimeout(400);
await page.click('.ps-pinpage[data-pin-id="' + freshPin.id + '"]');
await page.waitForTimeout(300);
const gone = await page.evaluate(() => {
    const el = document.getElementById('ps-pininsp-src');
    return { state: el.getAttribute('data-state'), text: el.textContent };
});
ok(gone.state === 'gone' && /no longer in the project/.test(gone.text),
   `a deleted source chart is named, and the pin survives it ` +
   `("${gone.text}")`);

console.log('case 23: pages drag-reorder, and the PDF order follows');
// Aug 2 2026 audit: every other surface drag-reorders; a fixed keep-order
// read as breakage. Real mouse gestures - synthetic dispatches are
// swallowed by phantom-click guards (probe law).
await page.evaluate(() => window.PS_SHELL.setWorkspace('pinboard'));
await page.waitForTimeout(500);
const dragSetup = await page.evaluate(() => {
    // case 22's clicks auto-scrolled to the last page; page 1 must be ON
    // SCREEN or the mouse.down lands on app chrome at a negative y
    // zero EVERY scrolled ancestor: playwright's earlier click
    // auto-scrolled #ps-main-workspace, not the board's own scroller
    let anc = document.querySelector('.ps-pinpage');
    while (anc) { if (anc.scrollTop) anc.scrollTop = 0; anc = anc.parentElement; }
    window.scrollTo(0, 0);
    const pins = (window.PS_SHELL.project.pinboards
        .find(b => b.id === window.PS_SHELL.project.ui.activeBoard)).pins;
    const pages = [...document.querySelectorAll('.ps-pinpage')];
    const r0 = pages[0].querySelector('img').getBoundingClientRect();
    const r1 = pages[1].getBoundingClientRect();
    return { order: pins.map(p => p.id), sel: null,
             from: { x: r0.left + r0.width / 2, y: r0.top + 40 },
             to: { x: r1.left + r1.width / 2,
                   y: r1.top + r1.height / 2 + 10 } };
});
ok(dragSetup.order.length >= 3, 'setup: three pages on the active board');
const selBefore = await page.evaluate(() =>
    document.querySelectorAll('.ps-pinpage-sel').length);
await page.mouse.move(dragSetup.from.x, dragSetup.from.y);
await page.mouse.down();
for (let s = 1; s <= 6; s++)
    await page.mouse.move(
        dragSetup.from.x + (dragSetup.to.x - dragSetup.from.x) * s / 6,
        dragSetup.from.y + (dragSetup.to.y - dragSetup.from.y) * s / 6);
await page.waitForTimeout(120);
await page.mouse.up();
await page.waitForTimeout(500);
const dragged = await page.evaluate(() => {
    const pins = (window.PS_SHELL.project.pinboards
        .find(b => b.id === window.PS_SHELL.project.ui.activeBoard)).pins;
    return { order: pins.map(p => p.id),
             domOrder: [...document.querySelectorAll('.ps-pinpage')]
                 .map(p => p.getAttribute('data-pin-id')),
             sel: document.querySelectorAll('.ps-pinpage-sel').length,
             transforms: [...document.querySelectorAll('.ps-pinpage')]
                 .filter(p => p.style.transform).length };
});
ok(dragged.order[0] === dragSetup.order[1] &&
   dragged.order[1] === dragSetup.order[0],
   `dragging page 1 past page 2 swaps them ` +
   `(${dragSetup.order.slice(0, 2)} -> ${dragged.order.slice(0, 2)})`);
ok(dragged.domOrder.join() === dragged.order.join(),
   'the board redraws in the committed order, which is the PDF order');
ok(dragged.sel === selBefore,
   'the drag-release click is swallowed: selection did not toggle');
ok(dragged.transforms === 0, 'no leftover drag transforms');

console.log('case 24: the keyboard mirror - focus, select, move');
const kb = await page.evaluate(() => {
    const scroll = document.getElementById('ps-pinscroll');
    const pages = [...scroll.querySelectorAll('.ps-pinpage')];
    pages[1].focus();
    return { listRole: scroll.getAttribute('role'),
             itemRole: pages[1].getAttribute('role'),
             focusable: pages.every(p => p.tabIndex === 0),
             focusedId: document.activeElement.getAttribute('data-pin-id'),
             label: pages[1].getAttribute('aria-label') };
});
ok(kb.listRole === 'list' && kb.itemRole === 'listitem' && kb.focusable,
   'pages are a keyboard-reachable list');
ok(/^Page 2 of /.test(kb.label) && /kept /.test(kb.label),
   `each page announces its place and kept time ("${kb.label}")`);
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
ok(await page.evaluate(id => {
    const pg = document.querySelector('.ps-pinpage[data-pin-id="' + id + '"]');
    return pg.classList.contains('ps-pinpage-sel') &&
        document.getElementById('ps-pininsp-sel').style.display !== 'none';
}, kb.focusedId), 'Enter selects the focused page and fills the rail');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
ok(await page.evaluate(() =>
       document.querySelectorAll('.ps-pinpage-sel').length === 0 &&
       document.getElementById('ps-pininsp-empty').style.display !== 'none'),
   'Escape releases the selection');
const beforeMove = await page.evaluate(() =>
    (window.PS_SHELL.project.pinboards.find(b =>
        b.id === window.PS_SHELL.project.ui.activeBoard))
        .pins.map(p => p.id));
await page.evaluate(id => {
    document.querySelector('.ps-pinpage[data-pin-id="' + id + '"]').focus();
}, kb.focusedId);
await page.keyboard.press('Alt+ArrowUp');
await page.waitForTimeout(400);
const afterMove = await page.evaluate(() => ({
    order: (window.PS_SHELL.project.pinboards.find(b =>
        b.id === window.PS_SHELL.project.ui.activeBoard))
        .pins.map(p => p.id),
    focused: document.activeElement.getAttribute('data-pin-id'),
}));
ok(afterMove.order[0] === beforeMove[1] &&
   afterMove.order[1] === beforeMove[0] &&
   afterMove.focused === kb.focusedId,
   'Alt+ArrowUp moves the focused page up and keeps focus on it');

console.log('case 25: board tabs drag-reorder like document tabs');
const boardSetup = await page.evaluate(() => {
    // case 24's focus() re-scrolled the outer workspace; the strip must
    // be on screen for real mouse coords
    let anc = document.getElementById('ps-tabs');
    while (anc) { if (anc.scrollTop) anc.scrollTop = 0; anc = anc.parentElement; }
    window.scrollTo(0, 0);
    const tabs = [...document.querySelectorAll(
        '#ps-tabs .ps-tab[data-board-id]')];
    const r0 = tabs[0].getBoundingClientRect();
    const r1 = tabs[1].getBoundingClientRect();
    return { order: window.PS_SHELL.project.pinboards.map(b => b.id),
             active: window.PS_SHELL.project.ui.activeBoard,
             from: { x: r0.left + r0.width / 2, y: r0.top + r0.height / 2 },
             to: { x: r1.right - 4, y: r1.top + r1.height / 2 } };
});
await page.mouse.move(boardSetup.from.x, boardSetup.from.y);
await page.mouse.down();
for (let s = 1; s <= 5; s++)
    await page.mouse.move(
        boardSetup.from.x + (boardSetup.to.x - boardSetup.from.x) * s / 5,
        boardSetup.from.y);
await page.waitForTimeout(120);
await page.mouse.up();
await page.waitForTimeout(400);
const boardsAfter = await page.evaluate(() => ({
    order: window.PS_SHELL.project.pinboards.map(b => b.id),
    domOrder: [...document.querySelectorAll(
        '#ps-tabs .ps-tab[data-board-id]')]
        .map(t => t.getAttribute('data-board-id')),
    active: window.PS_SHELL.project.ui.activeBoard,
}));
ok(boardsAfter.order[0] === boardSetup.order[1] &&
   boardsAfter.order[1] === boardSetup.order[0] &&
   boardsAfter.domOrder.join() === boardsAfter.order.join(),
   'dragging a board tab reorders the boards, strip and model agreeing');
ok(boardsAfter.active === boardSetup.active,
   'a drag is not a switch: the active board is unchanged');

console.log('case 26: the rail reads the evidence (stats text, analysis, ' +
    'board summary)');
// Torry's rail round, Aug 2 2026: the kept statistics as READABLE text,
// the analysis stamped at pin time, a board freshness summary, board
// notes, and the open-source-chart link.
await page.evaluate(() => {
    window.PS_SHELL.setRoles('plotbuilder',
        { xvar: 'condition', yvar: 'score' });
    window.PS_SHELL.setWorkspace('chart');
});
await page.waitForFunction(() => {
    const svg = document.querySelector('.graphbuilder2-host svg');
    return !!svg && svg.querySelectorAll('*').length > 30;
}, null, { timeout: 15000 });
await page.waitForTimeout(500);
await page.evaluate(() => {
    const b = document.querySelector(
        '.graphbuilder2-host button[aria-label="Statistics"]');
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await page.waitForTimeout(900);
await page.evaluate(() => {
    document.querySelector('[data-st-pane="pairs"] tr[data-link]').click();
});
await page.waitForTimeout(700);
ok(await page.evaluate(() =>
       (document.querySelector('[data-ps-moment-keep]') || {}).textContent)
   === 'Keep', 'the stats-card button reads Keep (one verb, Notebook vocabulary)');
await page.click('[data-ps-moment-keep]');
await page.waitForTimeout(1200);
const richPin = await page.evaluate(() => {
    const pins = (window.PS_SHELL.project.pinboards || [])
        .flatMap(b => b.pins);
    const pin = pins[pins.length - 1];
    return { id: pin.id, momTitle: pin.momTitle, momText: pin.momText,
             srcDesc: pin.srcDesc, srcChart: pin.srcChart };
});
ok(!!richPin.momTitle && /[=<]/.test(richPin.momText || ''),
   `the pin stores the comparison READABLE: "${richPin.momTitle}" plus ` +
   `its statistics sentence`);
ok(/Compare Groups/.test(richPin.srcDesc) &&
   /score/.test(richPin.srcDesc) && /condition/.test(richPin.srcDesc),
   `and what the chart was ("${richPin.srcDesc}")`);
await page.evaluate(() => window.PS_SHELL.setWorkspace('pinboard'));
await page.waitForTimeout(500);
await page.click('.ps-pinpage[data-pin-id="' + richPin.id + '"]');
await page.waitForTimeout(300);
const richRail = await page.evaluate(() => ({
    stat: document.getElementById('ps-pininsp-stat').textContent,
    statShown: document.getElementById('ps-pininsp-statrow')
        .style.display !== 'none',
    desc: document.getElementById('ps-pininsp-desc').textContent,
    openShown: document.getElementById('ps-pininsp-open')
        .style.display !== 'none',
}));
ok(richRail.statShown && richRail.stat.indexOf(richPin.momTitle) >= 0,
   'the rail shows the comparison and its numbers as text');
ok(richRail.desc === richPin.srcDesc && richRail.openShown,
   'with the analysis line and a live Open source chart button');
await page.click('#ps-pininsp-open');
await page.waitForTimeout(500);
ok(await page.evaluate(() => window.PS_SHELL.workspace()) === 'chart' &&
   await page.evaluate(() => window.PS_SHELL.project.activeChart) ===
       richPin.srcChart,
   'Open source chart lands on the live chart: navigation, not resurrection');
await page.evaluate(() => window.PS_SHELL.setWorkspace('pinboard'));
await page.waitForTimeout(400);
await page.evaluate(() =>
    document.getElementById('ps-pinscroll').click());
await page.waitForTimeout(300);
const boardRail = await page.evaluate(() => ({
    title: document.getElementById('ps-pininsp-title').textContent,
    sum: document.getElementById('ps-pininsp-bsum').textContent,
    boardShown: document.getElementById('ps-pininsp-board')
        .style.display !== 'none',
}));
ok(boardRail.title === 'Section' && boardRail.boardShown,
   'with nothing selected the rail speaks for the SECTION');
ok(/^\d+ pages, kept /.test(boardRail.sum) &&
   /source charts are no longer in the project/.test(boardRail.sum),
   `the summary audits the evidence at a glance ("${boardRail.sum}")`);
await page.fill('#ps-pininsp-bnote', 'RT practice write-up, draft 2.');
await page.waitForTimeout(900);
ok(await page.evaluate(() => (window.PS_SHELL.project.pinboards
       .find(b => b.id === window.PS_SHELL.project.ui.activeBoard) || {})
       .note) === 'RT practice write-up, draft 2.',
   'board notes persist on the board itself');

console.log('case 27: layouts offer "Open source chart" on right-click');
// Torry, Aug 2 2026: the rail's jump, promoted to layout items. Chart
// panels know their chart; pin placements carry srcChart from the same
// day; anything without provenance simply lacks the entry.
await page.evaluate(() => window.PS_SHELL.setWorkspace('pinboard'));
await page.waitForTimeout(400);
await page.click('.ps-pinpage[data-pin-id="' + richPin.id + '"] ' +
    '[data-pin-send]');
await page.waitForTimeout(300);
await page.click('[data-context-action="pin-to-new"]');
await page.waitForTimeout(600);
await page.evaluate(id => {
    // ride the send toast state: open the layout that received the pin
    const lays = window.PS_SHELL.project.charts.filter(c =>
        c.type === 'layout' && (c.items || []).some(it =>
            it.srcChart === id));
    window.PS_SHELL.switchChart(lays[lays.length - 1].id);
    window.PS_SHELL.setWorkspace('layout');
}, richPin.srcChart);
await page.waitForTimeout(700);
// also give the layout a chart PANEL and a TEXT item to test all three
await page.evaluate(id => {
    const doc = window.PS_SHELL.project.charts.find(c =>
        c.id === window.PS_SHELL.project.activeChart);
    doc.items.push({ id: 'iChart9', kind: 'chart', chartId: id,
                     x: 40, y: 40, w: 200, h: 140 });
    doc.items.push({ id: 'iText9', kind: 'text', text: 'caption',
                     x: 40, y: 200, w: 120, h: 30, size: 14 });
    window.PS_SHELL.setWorkspace('chart');
}, richPin.srcChart);
await page.waitForTimeout(300);
await page.evaluate(() => window.PS_SHELL.setWorkspace('layout'));
await page.waitForTimeout(700);
async function layMenuFor(sel) {
    await page.evaluate(s => {
        const it = document.querySelector(s);
        const r = it.getBoundingClientRect();
        it.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true,
            cancelable: true, clientX: r.left + 10, clientY: r.top + 10 }));
    }, sel);
    await page.waitForTimeout(250);
    return page.evaluate(() => ({
        open: !!document.querySelector(
            '#ps-contextmenu [data-context-action="lay-open-src"]'),
        first: (document.querySelector('#ps-contextmenu button') || {})
            .textContent,
    }));
}
const imgMenu = await layMenuFor('.ps-litem[data-item-id] img') !== null
    ? await layMenuFor('.ps-litem img')
    : null;
ok(imgMenu.open && imgMenu.first === 'Open source chart',
   'a placed PIN offers the jump (srcChart stamped at placement)');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
const chartMenu = await layMenuFor('.ps-litem[data-item-id="iChart9"]');
ok(chartMenu.open, 'a chart PANEL offers it too');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
const textMenu = await layMenuFor('.ps-litem[data-item-id="iText9"]');
ok(!textMenu.open, 'a text item, with no source, does not');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
// take the jump from the pin placement
const backMenu = await layMenuFor('.ps-litem img');
ok(backMenu.open, 'setup: menu re-opened on the pin placement');
await page.click('#ps-contextmenu [data-context-action="lay-open-src"]');
await page.waitForTimeout(500);
ok(await page.evaluate(() => window.PS_SHELL.workspace()) === 'chart' &&
   await page.evaluate(() => window.PS_SHELL.project.activeChart) ===
       richPin.srcChart,
   'the jump lands on the live source chart');

console.log('case 28: a multi-page SVG scope becomes a real zip, one file ' +
            'per page');
// The Aug 5 2026 format redesign: PDF keeps multi-page scopes in one
// file; SVG/PNG/JPG zip one file per page, numbered in page order and
// section-prefixed across boards. Deterministic record, then verify the
// ACTUAL ARCHIVE BYTES with the platform's unzip, not just the stamp.
await page.evaluate(() => {
    const mk = n => 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"' +
        ' font-family="sans-serif"><rect width="200" height="120"' +
        ' fill="#eef"/><text x="12" y="60">zip page ' + n +
        '</text></svg>');
    const pin = (id, n) =>
        ({ id, src: mk(n), natW: 200, natH: 120, w: 200, h: 120 });
    const P = window.PS_SHELL.project;
    P.pinboards = [
        { id: 'b1', name: 'Results A', pins: [pin('p101', 1), pin('p102', 2)] },
        { id: 'b2', name: 'Results B', pins: [pin('p103', 3)] },
    ];
    P.ui.activeBoard = 'b1';
    window.showSaveFilePicker = () => Promise.resolve({
        createWritable: () => Promise.resolve({
            write: () => Promise.resolve(),
            close: () => Promise.resolve() }) });
    window.PS_SHELL.setWorkspace('pinboard');
});
await page.waitForTimeout(600);
await page.click('#ps-export');
await page.waitForTimeout(300);
await page.click('[data-context-action="pin-export-all"]');
const zipRes = await exportViaDialog('svg');
ok(zipRes.container === 'zip' && zipRes.pages === 3 &&
   JSON.stringify(zipRes.files) === JSON.stringify([
       'results-a-page-01.svg', 'results-a-page-02.svg',
       'results-b-page-03.svg']),
   `entire notebook as SVG = one zip, numbered per page and ` +
   `section-prefixed (${(zipRes.files || []).join(', ')})`);
const zipBytes = Buffer.from(await page.evaluate(() =>
    Array.from(window.__psPinExportZip)));
const zfs = await import('node:fs');
const { execFileSync } = await import('node:child_process');
const zPath = '/tmp/ps-notebook-export-test.zip';
zfs.writeFileSync(zPath, zipBytes);
const ztest = execFileSync('unzip', ['-t', zPath], { encoding: 'utf8' });
ok(/No errors detected/.test(ztest),
   'the archive is a REAL zip: unzip validates every header and CRC');
const zEntry = execFileSync('unzip', ['-p', zPath, 'results-a-page-02.svg'],
    { encoding: 'utf8' });
ok(zEntry.indexOf('zip page 2') !== -1 && zEntry.indexOf('<svg') !== -1,
   'and an unzipped entry is the true vector svg of exactly that page');

console.log('case 29: a single page exports as ONE file in the chosen ' +
            'format');
// With NOTHING selected, "This page" means the page on screen. The board
// div is unclipped (an ancestor scrolls), so a naive element-middle
// pointed at the CONTENT middle and named page 2 while page 1 filled the
// window - caught in the feature's own screenshot pass.
await page.evaluate(() => {
    let anc = document.querySelector('.ps-pinpage');
    while (anc) { if (anc.scrollTop) anc.scrollTop = 0; anc = anc.parentElement; }
    window.scrollTo(0, 0);
});
await page.waitForTimeout(200);
await page.click('#ps-export');
await page.waitForTimeout(300);
ok(await page.evaluate(() => {
    const b = document.querySelector(
        '[data-context-action="pin-export-page"]');
    return !!b && /This page \(page 1 of 2\)/.test(b.textContent);
}), 'unselected, "This page" names the page actually ON SCREEN (page 1)');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await page.click('.ps-pinpage[data-pin-id="p101"]');
await page.waitForTimeout(200);
await page.click('#ps-export');
await page.waitForTimeout(300);
ok(await page.evaluate(() => {
    const b = document.querySelector(
        '[data-context-action="pin-export-page"]');
    return !!b && /This page \(page 1 of 2\)/.test(b.textContent);
}), 'the menu names the selected page ("This page (page 1 of 2)")');
await page.click('[data-context-action="pin-export-page"]');
const onePng = await exportViaDialog('png');
ok(onePng.container === 'file' && onePng.pages === 1 &&
   onePng.format === 'png' && onePng.bytes > 500 &&
   (onePng.files || []).length === 1 && /\.png$/.test(onePng.files[0]),
   `a single page in PNG is one plain .png, no zip wrapper ` +
   `(${(onePng.files || [])[0]}, ${onePng.bytes} bytes)`);
// The footer bar mirrors the right-click (Aug 5 2026): its Export button
// opens the same page-scoped dialog, closing the set's one gap.
ok(await page.evaluate(() => {
    const bar = document.querySelector(
        '.ps-pinpage[data-pin-id="p101"] .ps-pinpage-bar');
    return !!bar && !!bar.querySelector('[data-pin-send]') &&
        !!bar.querySelector('[data-pin-copy]') &&
        !!bar.querySelector('[data-pin-export]') &&
        !!bar.querySelector('[data-pin-delete]');
}), 'the page card carries all four verbs the right-click mirrors');
await page.click('.ps-pinpage[data-pin-id="p101"] [data-pin-export]');
await page.waitForFunction(() =>
    document.getElementById('ps-exporter').style.display === 'flex',
    null, { timeout: 8000 });
ok(await page.evaluate(() =>
       document.getElementById('ps-export-title').textContent) ===
   'Export page',
   "the card's Export button opens the dialog scoped to that page");
await page.click('#ps-export-close');
await page.waitForTimeout(300);

console.log('case 30: the layout says LIVE vs SNAPSHOT, and jumps both ways');
// Torry, Aug 5 2026: a chart panel follows its source; a Notebook
// placement is frozen - but nothing on the layout said which was which.
// Now: selection badge, rail card in behavioral terms, differentiated
// right-click (with a jump back to the Notebook page), and the stale
// "source changed" verdict reused from the Notebook's fingerprints.
const liveChartId = await page.evaluate(() => {
    // Give p101 real provenance (case 28 built it bare), then send it to
    // a fresh layout through the app's own path.
    const P = window.PS_SHELL.project;
    const chart = P.charts.find(c => !c.page);
    const b1 = P.pinboards.find(b => b.id === 'b1');
    const pin = b1.pins.find(p => p.id === 'p101');
    pin.srcChart = chart.id;
    pin.srcName = chart.name;
    pin.at = Date.now() - 3600000;
    window.PS_SHELL.setWorkspace('pinboard');
    return chart.id;
});
await page.waitForTimeout(500);
await page.evaluate(() => {
    const pg = document.querySelector('.ps-pinpage[data-pin-id="p101"]');
    const r = pg.getBoundingClientRect();
    pg.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true,
        cancelable: true, clientX: r.left + 30, clientY: r.top + 30 }));
});
await page.waitForTimeout(300);
await page.click('#ps-contextmenu [data-context-action="pin-send"]');
await page.waitForTimeout(300);
await page.click('#ps-contextmenu [data-context-action="pin-to-new"]');
await page.waitForTimeout(700);
// Add a LIVE chart panel beside the snapshot, then open the layout.
await page.evaluate((chartId) => {
    const P = window.PS_SHELL.project;
    const doc = P.charts[P.charts.length - 1];
    doc.items.push({ id: 'iLive30', kind: 'chart', chartId: chartId,
                     x: 60, y: 420, w: 420, h: 280 });
    window.PS_SHELL.switchChart(doc.id);
    window.PS_SHELL.setWorkspace('layout');
}, liveChartId);
await page.waitForTimeout(900);
await page.click('.ps-litem[data-kind="image"]');
await page.waitForTimeout(400);
const snapSel = await page.evaluate(() => ({
    badge: (document.querySelector(
        '.ps-litem[data-kind="image"] .ps-litem-srcbadge') || {})
        .textContent || null,
    title: document.getElementById('ps-layout-selection-title').textContent,
    line: document.getElementById('ps-layout-source-line').textContent,
    geom: (() => {
        const it = document.querySelector('.ps-litem[data-kind="image"]');
        const b = it && it.querySelector('.ps-litem-srcbadge');
        if (!it || !b) return null;
        const ir = it.getBoundingClientRect(), br = b.getBoundingClientRect();
        const bar = it.querySelector('.ps-lbar');
        let overlap = false;
        if (bar) {
            const r2 = bar.getBoundingClientRect();
            overlap = !(br.right < r2.left || br.left > r2.right ||
                        br.bottom < r2.top || br.top > r2.bottom);
        }
        return { atRight: Math.abs(br.right - ir.right) < 10,
                 overlap, hasBar: !!bar };
    })(),
}));
ok(snapSel.badge === 'Snapshot' && snapSel.title === 'Notebook snapshot' &&
   /It will not change\./.test(snapSel.line) && /Kept /.test(snapSel.line),
   `selecting a placed page says SNAPSHOT everywhere ` +
   `("${snapSel.title}" / "${snapSel.line.slice(0, 52)}...")`);
ok(!!snapSel.geom && snapSel.geom.atRight && !snapSel.geom.overlap,
   'the badge docks far RIGHT, clear of the remove control it used to ' +
   'sit on (Torry, Aug 5 2026)');
await page.evaluate(() => {
    const it = document.querySelector('.ps-litem[data-kind="image"]');
    const r = it.getBoundingClientRect();
    it.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true,
        cancelable: true, clientX: r.left + 12, clientY: r.top + 12 }));
});
await page.waitForTimeout(300);
const snapMenu = await page.evaluate(() =>
    [...document.querySelectorAll('#ps-contextmenu button')]
        .map(b => b.textContent));
ok(snapMenu.includes('Open source chart') &&
   snapMenu.includes('Show this page in Notebook'),
   `a snapshot's right-click offers both jumps (${snapMenu[0]}, ` +
   `${snapMenu[1]})`);
await page.click('#ps-contextmenu [data-context-action="lay-open-pin"]');
await page.waitForTimeout(800);
const backAtPage = await page.evaluate(() => ({
    ws: window.PS_SHELL.workspace(),
    board: window.PS_SHELL.project.ui.activeBoard,
    sel: (document.querySelector('.ps-pinpage-sel') || {})
        .getAttribute ? document.querySelector('.ps-pinpage-sel')
        .getAttribute('data-pin-id') : null,
}));
ok(backAtPage.ws === 'pinboard' && backAtPage.board === 'b1' &&
   backAtPage.sel === 'p101',
   '"Show this page in Notebook" lands on the exact page, selected');
// Back to the layout: the chart panel reads LIVE.
await page.evaluate(() => {
    const P = window.PS_SHELL.project;
    const doc = P.charts[P.charts.length - 1];
    window.PS_SHELL.switchChart(doc.id);
    window.PS_SHELL.setWorkspace('layout');
});
await page.waitForTimeout(700);
await page.click('.ps-litem[data-kind="chart"]');
await page.waitForTimeout(400);
const liveSel = await page.evaluate(() => ({
    badge: (document.querySelector(
        '.ps-litem[data-kind="chart"] .ps-litem-srcbadge') || {})
        .textContent || null,
    title: document.getElementById('ps-layout-selection-title').textContent,
    line: document.getElementById('ps-layout-source-line').textContent,
    menuLabelProbe: null,
}));
ok(liveSel.badge === 'Live' && liveSel.title === 'Chart panel - live' &&
   /^Follows /.test(liveSel.line) && /update this panel/.test(liveSel.line),
   `selecting a chart panel says LIVE everywhere ("${liveSel.title}" / ` +
   `"${liveSel.line.slice(0, 40)}...")`);
await page.evaluate(() => {
    const it = document.querySelector('.ps-litem[data-kind="chart"]');
    const r = it.getBoundingClientRect();
    it.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true,
        cancelable: true, clientX: r.left + 12, clientY: r.top + 12 }));
});
await page.waitForTimeout(300);
ok(await page.evaluate(() => {
    const b = document.querySelector(
        '#ps-contextmenu [data-context-action="lay-open-src"]');
    return !!b && b.textContent === 'Show live chart in Charts';
}), 'the live panel\'s jump names its nature ("Show live chart in Charts")');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
// The stale verdict: fingerprint mismatch -> the badge and the rail say
// the source has moved on since the picture was taken.
await page.evaluate(() => {
    const P = window.PS_SHELL.project;
    const doc = P.charts[P.charts.length - 1];
    doc.items.find(i => i.kind === 'image').srcSig = 'bogus-sig';
});
await page.click('.ps-litem[data-kind="image"]');
await page.waitForTimeout(400);
const staleSel = await page.evaluate(() => ({
    badge: (document.querySelector(
        '.ps-litem[data-kind="image"] .ps-litem-srcbadge') || {})
        .textContent || null,
    line: document.getElementById('ps-layout-source-line').textContent,
}));
ok(staleSel.badge === 'Snapshot - source changed' &&
   /has changed since it was kept/.test(staleSel.line),
   `a drifted snapshot discloses it ("${staleSel.badge}")`);

console.log('case 31: the chart right-click sends the LIVE chart to a ' +
            'layout');
// Torry, Aug 5 2026: the same Send-to-layout gesture the Notebook pages
// have, beside Keep. From Charts it places the live panel (what the
// layout's Add chart creates), never a snapshot; one shared menu builder
// keeps the two sends identical in shape.
const sendCtx = await page.evaluate(() => {
    const P = window.PS_SHELL.project;
    const chart = P.charts.find(c => !c.page);
    const doc = P.charts.find(c => c.page &&
        (c.items || []).some(i => i.id === 'iLive30'));
    window.PS_SHELL.switchChart(chart.id);
    window.PS_SHELL.setWorkspace('chart');
    return { chartId: chart.id, docId: doc.id, count: doc.items.length,
             bottom: Math.max.apply(null,
                 doc.items.map(i => (i.y || 0) + (i.h || 0))) };
});
await page.waitForFunction(() => {
    const svg = document.querySelector('.graphbuilder2-host svg');
    return !!svg && svg.querySelectorAll('*').length > 30;
}, null, { timeout: 15000 });
await page.waitForTimeout(300);
await page.evaluate(() => {
    const svg = document.querySelector('.graphbuilder2-host svg');
    const r = svg.getBoundingClientRect();
    svg.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true,
        cancelable: true, clientX: r.left + r.width / 2,
        clientY: r.top + 40 }));
});
await page.waitForTimeout(300);
ok(await page.evaluate(() => {
    const b = document.querySelector(
        '#ps-contextmenu [data-context-action="chart-send"]');
    return !!b && /^Send to layout/.test(b.textContent);
}), 'the chart right-click offers "Send to layout" beside Keep');
await page.click('#ps-contextmenu [data-context-action="chart-send"]');
await page.waitForTimeout(300);
const sendSub = await page.evaluate(() =>
    [...document.querySelectorAll('#ps-contextmenu button')]
        .map(b => b.getAttribute('data-context-action')));
ok(sendSub.includes('chart-to-new') &&
   sendSub.some(k => k && k.indexOf('chart-to-') === 0 &&
       k !== 'chart-to-new'),
   `the submenu lists each layout by name plus New layout, the pin ` +
   `send's exact shape (${sendSub.join(', ')})`);
await page.click('#ps-contextmenu [data-context-action="chart-to-' +
    sendCtx.docId + '"]');
await page.waitForTimeout(500);
const sentLive = await page.evaluate((ctx) => {
    const doc = window.PS_SHELL.project.charts.find(c => c.id === ctx.docId);
    const added = doc.items[doc.items.length - 1];
    return { count: doc.items.length, kind: added.kind,
             chartId: added.chartId, y: added.y,
             toast: (document.getElementById('ps-toast') || {})
                 .textContent || '' };
}, sendCtx);
ok(sentLive.count === sendCtx.count + 1 && sentLive.kind === 'chart' &&
   sentLive.chartId === sendCtx.chartId && sentLive.y >= sendCtx.bottom + 14 &&
   /Sent to /.test(sentLive.toast),
   `it lands as a LIVE panel, flowing below existing content, with the ` +
   `pin send's toast (y ${sentLive.y} under ${sendCtx.bottom})`);

console.log('case 32: Cmd/Ctrl+scroll zooms the board smoothly');
// Aug 6 2026 (Torry, the day after the chart gesture: add the same to
// the Notebook). Same math, the Notebook's own 50% floor, and the
// select shows the custom value via the shared helper.
await page.evaluate(() => {
    const sel = document.getElementById('ps-pzoom');
    sel.value = '1';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    window.PS_SHELL.setWorkspace('pinboard');
});
await page.waitForTimeout(500);
const boardWheel = async (deltaY, ctrl) => page.evaluate(([dy, c]) => {
    const pane = document.getElementById('ps-pinpane');
    const r = document.querySelector('.ps-pinpage').getBoundingClientRect();
    pane.dispatchEvent(new WheelEvent('wheel', { bubbles: true,
        cancelable: true, clientX: r.left + 40, clientY: r.top + 40,
        deltaY: dy, ctrlKey: c }));
    return window.PS_SHELL.project.ui.pinZoom;
}, [deltaY, ctrl]);
ok(await boardWheel(-240, false) === 1,
   'a plain wheel scrolls the board; only the modifier zooms');
const bAtDispatch = await boardWheel(-240, true);
ok(bAtDispatch === 1,
   'the notch does not jump: the board is unchanged at dispatch (easing)');
await page.waitForFunction(() =>
    Number(window.PS_SHELL.project.ui.pinZoom) > 1.3, null,
    { timeout: 4000 });
await page.waitForTimeout(200);
const bz = await page.evaluate(() =>
    Number(window.PS_SHELL.project.ui.pinZoom));
const bState = await page.evaluate(() => {
    const sel = document.getElementById('ps-pzoom');
    const dyn = sel.querySelector('option[data-ps-custom]');
    return { dyn: dyn ? dyn.textContent : null,
             selected: dyn ? sel.value === dyn.value : false };
});
ok(bz > 1.3 && bz < 1.5 && bState.selected && /^\d+%$/.test(bState.dyn),
   `Ctrl+wheel settles between steps and the select shows it ` +
   `(${Math.round(bz * 100)}%, "${bState.dyn}")`);
for (let i = 0; i < 30; i++) await boardWheel(300, true);
await page.waitForFunction(() =>
    Number(window.PS_SHELL.project.ui.pinZoom) === 0.5, null,
    { timeout: 4000 });
ok(await page.evaluate(() => window.PS_SHELL.project.ui.pinZoom) === 0.5,
   'and it clamps at the Notebook\'s own 50% floor (the page-bar rule)');
await page.evaluate(() => {
    const sel = document.getElementById('ps-pzoom');
    sel.value = 'fit';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(300);
ok(await page.evaluate(() => {
    const sel = document.getElementById('ps-pzoom');
    return !sel.querySelector('option[data-ps-custom]') &&
        sel.value === 'fit';
}), 'picking Fit removes the dynamic option');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('PINBOARD CHECK PASS');
await browser.close();
