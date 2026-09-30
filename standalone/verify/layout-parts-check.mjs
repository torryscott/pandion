// Figure parts in Layouts (Sep 2026, Torry: "build slice one as proposed"):
// box and arrow items, the Add part menu, the Box and Arrow rail sections,
// attachment by dragging an end onto a box, arrows that follow their boxes,
// undo, copy and duplicate, the page export, the .pand round trip, and the
// PRISMA 2020 template in the New layout gallery.
//
// Control: point PS_PAGE at a tree without the feature and case 1 fails at
// the missing Add part button (no such tree has #ps-laddpart).
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
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1500);
}
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.addLayout(); await s(800);
    window.PS_SHELL.setWorkspace('layout'); await s(500);
});
const items = () => page.evaluate(() => window.PS_SHELL.chart().items);
const sel = () => page.evaluate(() => window.PS_SHELL.laySelectedIds
    ? window.PS_SHELL.laySelectedIds() : window.PS_SHELL.layoutSelection());
async function addPart(which) {
    await page.click('#ps-laddpart');
    await page.waitForTimeout(150);
    await page.click('#ps-contextmenu button[data-context-action="part-' + which + '"]');
    await page.waitForTimeout(350);
}
const center = async (selector) => page.evaluate(sel => {
    const r = document.querySelector(sel).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, selector);
const itemNode = id => '.ps-litem[data-item-id="' + id + '"]';
const arrowD = id => page.evaluate(sel => {
    const p = document.querySelector(sel + ' path:not(.ps-larrow-hit):not(.ps-larrow-halo)');
    return p ? p.getAttribute('d') : null;
}, itemNode(id));

console.log('case 1: Add part menu adds a box, selected, with its rail sections');
ok(await page.locator('#ps-laddpart').count() === 1,
   'the layout toolbar carries ONE Add part button (no feature here = control red)');
await page.click('#ps-laddpart');
await page.waitForTimeout(150);
const menu = await page.evaluate(() => Array.from(
    document.querySelectorAll('#ps-contextmenu button')).map(b => b.textContent.trim()));
// Slice two adds Timeline between Arrow and Templates; the slice-one
// entries and their order are what this pins.
ok(menu[0] === 'Box' && menu[1] === 'Arrow' && /^Templates/.test(menu[menu.length - 1]),
   'the menu offers Box, Arrow and Templates (' + menu.join(', ') + ')');
await page.click('#ps-contextmenu button[data-context-action="part-box"]');
await page.waitForTimeout(350);
let its = await items();
ok(its.length === 1 && its[0].kind === 'box' && its[0].w === 150 && its[0].h === 44,
   'Box adds one 150 x 44 box item');
const box1 = its[0].id;
let rail = await page.evaluate(() => ({
    title: document.getElementById('ps-layout-selection-title').textContent,
    box: document.getElementById('ps-layout-box-section').style.display,
    arrow: document.getElementById('ps-layout-arrow-section').style.display,
    text: document.getElementById('ps-layout-text-section').style.display,
    fills: document.querySelectorAll('#ps-lbox-fills button[data-fill]').length,
    pressedFill: (document.querySelector('#ps-lbox-fills button[aria-pressed="true"]') || {}).getAttribute
        ? document.querySelector('#ps-lbox-fills button[aria-pressed="true"]').getAttribute('data-fill') : null,
    border: (document.querySelector('[data-lbox-border][aria-pressed="true"]') || {}).textContent,
    wEnabled: !document.getElementById('ps-ctx-lw').disabled
}));
ok(rail.title === 'Box' && rail.box === '' && rail.arrow === 'none' && rail.text === '',
   'the rail shows the Box and Text sections for a box, not the Arrow section');
ok(rail.fills === 8 && rail.pressedFill === '#ffffff' && rail.border === 'Thin' && rail.wEnabled,
   'the Box section reads the box: white fill, thin border, sized fields live');
const row = await page.evaluate(() => {
    const kids = Array.from(document.querySelector('#ps-ltoolbar .ps-ltoolbar-row').children)
        .filter(k => getComputedStyle(k).display !== 'none');
    const tops = kids.map(k => Math.round(k.getBoundingClientRect().top));
    return Math.max(...tops) - Math.min(...tops);
});
ok(row < 8, 'the toolbar stays on one row with the new button (spread ' + row + 'px)');

console.log('case 2: double-click edits the box text; the export carries it');
await page.dblclick(itemNode(box1) + ' .ps-lbox');
await page.waitForTimeout(200);
ok(await page.locator(itemNode(box1) + ' textarea.ps-ltext-edit').count() === 1,
   'double-click opens the text editor inside the box');
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
await page.keyboard.type('Randomized');
await page.evaluate(() => document.querySelector('textarea.ps-ltext-edit').blur());
await page.waitForTimeout(300);
its = await items();
ok(its[0].text === 'Randomized', 'the typed text is stored on the box');
let svg = (await page.evaluate(() => window.PS_SHELL.exportSource('white'))).svg;
// rx is the corner less half the stroke (thin = 1 px): the canvas border
// is inside the box, the stroke sits on the rect edge, so the OUTER curve
// matches the canvas corner of 4.
ok(/<rect[^>]*rx="3\.5"[^>]*fill="#ffffff"[^>]*stroke="#22364d"/.test(svg) &&
   /<text[^>]*text-anchor="middle"[^>]*>(<tspan[^>]*>)?Randomized/.test(svg),
   'the export draws the box as a rounded rect with centred text');

console.log('case 3: the Box section styles the box; typed width leaves height alone');
await page.click('#ps-lbox-fills button[data-fill="#eef4fc"]');
await page.waitForTimeout(150);
await page.click('[data-lbox-border="thick"]');
await page.waitForTimeout(150);
await page.fill('#ps-lbox-corner-num', '10');
await page.press('#ps-lbox-corner-num', 'Enter');
await page.dispatchEvent('#ps-lbox-corner-num', 'change');
await page.waitForTimeout(200);
its = await items();
ok(its[0].fill === '#eef4fc' && its[0].border === 'thick' && its[0].corner === 10,
   'fill, border and corner round-trip from the rail to the item');
const canvasBox = await page.evaluate(sel => {
    const b = document.querySelector(sel + ' .ps-lbox');
    const cs = getComputedStyle(b);
    return { bg: cs.backgroundColor, bw: cs.borderTopWidth, r: cs.borderTopLeftRadius };
}, itemNode(box1));
ok(canvasBox.bg === 'rgb(238, 244, 252)' && canvasBox.bw === '2px' && canvasBox.r === '10px',
   'the canvas paints them (' + JSON.stringify(canvasBox) + ')');
await page.fill('#ps-ctx-lw', '3');
await page.dispatchEvent('#ps-ctx-lw', 'change');
await page.waitForTimeout(250);
its = await items();
ok(Math.round(its[0].w) === 288 && its[0].h === 44,
   'typing a width of 3 in resizes the width only (h stays 44)');

console.log('case 4: Arrow with a box selected starts attached to it');
await page.evaluate(() => { const c = window.PS_SHELL.chart(); c.items[0].w = 150; window.PS_SHELL.selectLayoutItems([c.items[0].id]); });
await addPart('box');
its = await items();
const box2 = its[1].id;
await page.evaluate(id => {
    const c = window.PS_SHELL.chart();
    const b = c.items.find(i => i.id === id);
    b.x = 420; b.y = 200; b.text = 'Drug (n = 8)';
    window.PS_SHELL.selectLayoutItems([c.items[0].id]);
}, box2);
await page.waitForTimeout(200);
await addPart('arrow');
its = await items();
const arrow = its.find(i => i.kind === 'arrow');
ok(arrow && arrow.from && arrow.from.id === box1 && arrow.to === null,
   'the new arrow is attached to the selected box, free at the other end');
rail = await page.evaluate(() => ({
    title: document.getElementById('ps-layout-selection-title').textContent,
    arrow: document.getElementById('ps-layout-arrow-section').style.display,
    box: document.getElementById('ps-layout-box-section').style.display,
    from: document.getElementById('ps-larrow-from').value,
    to: document.getElementById('ps-larrow-to').value,
    route: (document.querySelector('[data-larrow-route][aria-pressed="true"]') || {}).textContent,
    heads: (document.querySelector('[data-larrow-heads][aria-pressed="true"]') || {}).textContent,
    handles: document.querySelectorAll('[data-role="lay-arrow-end"]').length,
    wDisabled: document.getElementById('ps-ctx-lw').disabled
}));
ok(rail.title === 'Arrow' && rail.arrow === '' && rail.box === 'none' &&
   rail.from === box1 && rail.to === '' && rail.route === 'Elbow' && rail.heads === 'End' &&
   rail.handles === 2 && rail.wDisabled,
   'the rail shows the Arrow section (From = the box, To = free, Elbow, End) and two end handles');

console.log('case 5: dragging the free end onto another box attaches it; undo frees it');
const hb = await center('[data-role="lay-arrow-end"][data-end="b"]');
const b2c = await center(itemNode(box2));
await page.mouse.move(hb.x, hb.y);
await page.mouse.down();
await page.mouse.move(hb.x + 24, hb.y + 12, { steps: 4 });
await page.mouse.move(b2c.x, b2c.y, { steps: 8 });
await page.waitForTimeout(80);
const lit = await page.evaluate(() => document.querySelectorAll('.ps-litem-droptarget').length);
await page.mouse.up();
await page.waitForTimeout(350);
its = await items();
let a = its.find(i => i.kind === 'arrow');
ok(lit === 1 && a.to && a.to.id === box2,
   'the box lit up as the drop target and the end is attached to it');
await page.click('#ps-lundo');
await page.waitForTimeout(400);
its = await items();
a = its.find(i => i.kind === 'arrow');
ok(a && a.to === null && a.from && a.from.id === box1,
   'Undo frees the end again (one step for the whole gesture)');
await page.evaluate(() => document.getElementById('ps-lredo').click());
await page.waitForTimeout(400);
its = await items();
a = its.find(i => i.kind === 'arrow');
ok(a.to && a.to.id === box2, 'Redo re-attaches it');
const arrowId = a.id;

console.log('case 6: moving a box moves the arrow with it, live and after release');
await page.evaluate(id => window.PS_SHELL.selectLayoutItems([id]), box2);
await page.waitForTimeout(150);
const dBefore = await arrowD(arrowId);
const b2 = await center(itemNode(box2));
await page.mouse.move(b2.x, b2.y);
await page.mouse.down();
await page.mouse.move(b2.x + 10, b2.y + 40, { steps: 4 });
await page.mouse.move(b2.x + 60, b2.y + 120, { steps: 8 });
await page.waitForTimeout(60);
const dDuring = await arrowD(arrowId);
await page.mouse.up();
await page.waitForTimeout(350);
const dAfter = await arrowD(arrowId);
ok(dBefore && dDuring && dDuring !== dBefore && dAfter !== dBefore,
   'the arrow path changed during the drag and stayed changed after it');
its = await items();
a = its.find(i => i.kind === 'arrow');
const bx2 = its.find(i => i.id === box2);
const endB = { x: a.x + a.bx, y: a.y + a.by };
ok(Math.abs(endB.x - (bx2.x + bx2.w / 2)) < 0.6 || Math.abs(endB.y - (bx2.y + bx2.h / 2)) < 0.6,
   'the attached end sits on a side centre of the moved box');
svg = (await page.evaluate(() => window.PS_SHELL.exportSource('white'))).svg;
const pathM = /<path d="M([\d.]+) ([\d.]+)/.exec(svg);
ok(pathM && (svg.match(/<polygon/g) || []).length === 1,
   'the export draws the arrow as one path with one head');

console.log('case 7: deleting a box frees the arrow end where it was; undo re-attaches');
const endBefore = endB;
await page.evaluate(id => window.PS_SHELL.selectLayoutItems([id]), box2);
await page.keyboard.press('Delete');
await page.waitForTimeout(350);
its = await items();
a = its.find(i => i.kind === 'arrow');
ok(its.length === 2 && a && a.to === null,
   'the box is gone and the arrow end is free');
ok(Math.abs(a.x + a.bx - endBefore.x) < 0.6 && Math.abs(a.y + a.by - endBefore.y) < 0.6,
   'the freed end stays exactly where it was drawn');
await page.click('#ps-lundo');
await page.waitForTimeout(400);
its = await items();
a = its.find(i => i.kind === 'arrow');
ok(its.length === 3 && a.to && a.to.id === box2, 'Undo brings the box back, attached');

console.log('case 8: duplicate remaps attachments to the copies; a lone arrow copy is free');
await page.evaluate((ids) => window.PS_SHELL.selectLayoutItems(ids), [box1, box2, arrowId]);
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+d' : 'Control+d');
await page.waitForTimeout(400);
its = await items();
ok(its.length === 6, 'Cmd/Ctrl+D copies all three');
const copies = its.slice(3);
const copyArrow = copies.find(i => i.kind === 'arrow');
const copyBoxIds = copies.filter(i => i.kind === 'box').map(i => i.id);
ok(copyArrow && copyBoxIds.indexOf(copyArrow.from.id) !== -1 &&
   copyBoxIds.indexOf(copyArrow.to.id) !== -1,
   'the copied arrow joins the COPIED boxes');
await page.click('#ps-lundo');
await page.waitForTimeout(350);
await page.evaluate((id) => window.PS_SHELL.selectLayoutItems([id]), arrowId);
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+d' : 'Control+d');
await page.waitForTimeout(400);
its = await items();
const lone = its[its.length - 1];
ok(its.length === 4 && lone.kind === 'arrow' && lone.from === null && lone.to === null,
   'duplicating the arrow alone gives a free arrow (never one pointing at the originals)');
await page.click('#ps-lundo');
await page.waitForTimeout(350);

console.log('case 9: pasted into another layout, an arrow arrives free');
await page.evaluate((ids) => window.PS_SHELL.selectLayoutItems(ids), [arrowId]);
await page.evaluate(() => window.PS_SHELL.layCopySelected(false));
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.addLayout(); await s(600);
});
await page.evaluate(() => window.PS_SHELL.layPasteClipboard());
await page.waitForTimeout(350);
its = await items();
ok(its.length === 1 && its[0].kind === 'arrow' && its[0].from === null && its[0].to === null &&
   (await arrowD(its[0].id)),
   'the pasted arrow is free at both ends and draws');

console.log('case 10: the PRISMA 2020 template');
await page.evaluate(() => window.PS_SHELL.showLayoutGallery());
await page.waitForTimeout(300);
const gallery = await page.evaluate(() => ({
    cards: document.querySelectorAll('[data-layout-template]').length,
    heading: (document.querySelector('.ps-layout-template-heading') || {}).textContent,
    prisma: !!document.querySelector('[data-layout-template="prisma"]'),
    portraitPreview: !!document.querySelector(
        '[data-layout-template="prisma"] .ps-layout-template-portrait')
}));
ok(gallery.cards >= 9 && gallery.heading === 'Diagrams' && gallery.prisma && gallery.portraitPreview,
   'the gallery lists PRISMA 2020 under a Diagrams heading with a portrait preview');
await page.click('[data-layout-template="prisma"]');
await page.waitForTimeout(150);
await page.click('#ps-layout-gallery-create');
await page.waitForTimeout(800);
const prisma = await page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    const kinds = c.items.reduce((m, i) => (m[i.kind] = (m[i.kind] || 0) + 1, m), {});
    const side = c.items.find(i => i.kind === 'box' && i.text === 'Screening');
    const node = document.querySelector('.ps-litem[data-item-id="' + side.id + '"] .ps-lbox > span');
    const attached = c.items.filter(i => i.kind === 'arrow').every(i => i.from && i.to &&
        c.items.some(b => b.id === i.from.id) && c.items.some(b => b.id === i.to.id));
    return { page: c.page.preset, w: c.page.w, h: c.page.h, kinds, attached,
             sideRot: node ? node.style.transform : null,
             sideW: node ? parseFloat(node.style.width) : null };
});
ok(prisma.page === 'letterp' && prisma.w === 816 && prisma.h === 1056,
   'it opens on a Letter portrait page');
ok(prisma.kinds.box === 12 && prisma.kinds.arrow === 8 && prisma.kinds.text === 1 && prisma.attached,
   'twelve boxes, eight arrows all attached at both ends, and a title');
ok(prisma.sideRot === 'rotate(-90deg)' && prisma.sideW > 200,
   'the side labels run along their bar (rotated text laid out at the bar height)');
svg = (await page.evaluate(() => window.PS_SHELL.exportSource('white'))).svg;
ok((svg.match(/<rect[^>]*rx=/g) || []).length === 12 &&
   (svg.match(/<polygon/g) || []).length === 8 &&
   /<text[^>]*transform="rotate\(-90 /.test(svg) &&
   svg.indexOf('Records identified from:') !== -1,
   'the export carries twelve rects, eight arrow heads and the rotated side labels');

console.log('case 11: the .pand round trip keeps the parts and their attachments');
const text = await page.evaluate(() => window.PS_SHELL.projectText());
await page.evaluate(t => window.PS_SHELL.openProjectText(t), text);
await page.waitForTimeout(800);
const back = await page.evaluate(() => {
    const lay = window.PS_SHELL.charts().filter(c => c.type === 'layout');
    const p = lay[lay.length - 1];
    return { boxes: p.items.filter(i => i.kind === 'box').length,
             arrows: p.items.filter(i => i.kind === 'arrow' && i.from && i.to).length };
});
ok(back.boxes === 12 && back.arrows === 8, 'twelve boxes and eight attached arrows come back');

console.log('case 12: keyboard - F2 edits a box, Cmd/Ctrl+B bolds it, labels name the parts');
await page.evaluate(() => {
    const c = window.PS_SHELL.chart();
    const b = c.items.find(i => i.kind === 'box' && i.text.indexOf('Records screened') === 0);
    window.PS_SHELL.selectLayoutItems([b.id]);
    document.getElementById('ps-lviewport').focus();
});
await page.waitForTimeout(150);
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+b' : 'Control+b');
await page.waitForTimeout(250);
let bolded = await page.evaluate(() => window.PS_SHELL.chart().items.find(
    i => i.kind === 'box' && i.text.indexOf('Records screened') === 0).bold);
ok(bolded === true, 'Cmd/Ctrl+B bolds the selected box');
await page.evaluate(() => document.getElementById('ps-lviewport').focus());
await page.keyboard.press('F2');
await page.waitForTimeout(200);
ok(await page.locator('textarea.ps-ltext-edit').count() === 1, 'F2 opens the box editor');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
const labels = await page.evaluate(() => Array.from(
    document.querySelectorAll('#ps-layout-options [role="option"]')).map(o => o.getAttribute('aria-label')));
ok(labels.some(l => /^Box, "Records screened/.test(l)) &&
   labels.some(l => /^Arrow from "Records screened[^"]*" to "Records excluded/.test(l)),
   'the accessible list names boxes by their text and arrows by their ends');

console.log('case 13: the Insert menu commands and the PDF export');
const before13 = (await items()).length;
await page.evaluate(() => window.PS_SHELL.runCommand('insert-box'));
await page.waitForTimeout(300);
await page.evaluate(() => window.PS_SHELL.runCommand('insert-arrow'));
await page.waitForTimeout(300);
its = await items();
ok(its.length === before13 + 2 && its[its.length - 2].kind === 'box' &&
   its[its.length - 1].kind === 'arrow' && its[its.length - 1].from &&
   its[its.length - 1].from.id === its[its.length - 2].id,
   'Insert > Box and Insert > Arrow add a box and an arrow attached to it');
const pdf = await page.evaluate(async () => {
    const blob = await window.PS_SHELL.exportBlob('pdf', 300, 'white');
    const buf = new Uint8Array(await blob.arrayBuffer());
    return { size: buf.length, head: String.fromCharCode.apply(null, buf.slice(0, 5)) };
});
ok(pdf.head === '%PDF-' && pdf.size > 4000,
   'the page exports as a PDF with the parts in it (' + pdf.size + ' bytes)');

ok(errors.length === 0, 'no page errors (' + errors.join(' | ') + ')');
await browser.close();
console.log('layout-parts-check: PASS');
