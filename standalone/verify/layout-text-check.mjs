// Layout text styling in the rail (Torry, Aug 6 2026): capability parity
// with the chart workspace's text panel - size, bold, italic, color,
// rotation - placed in the Layout rail, where this workspace already
// edits everything. Pinned here: the section appears only for a single
// text selection, every control round-trips item -> canvas -> EXPORT,
// rotation lives on the inner text node (never the item box), and one
// undo reverts a style change. Nothing here exists in the jamovi module.
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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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
    window.PS_SHELL.addLayout(); await s(1000);
    window.PS_SHELL.setWorkspace('layout'); await s(600);
});
await page.click('#ps-laddtext');
await page.waitForTimeout(500);

console.log('case 1: the Text section appears for a single text selection');
const textId = await page.evaluate(() => {
    const it = window.PS_SHELL.chart().items.find(i => i.kind === 'text');
    window.PS_SHELL.selectLayoutItems([it.id]);
    return it.id;
});
await page.waitForTimeout(300);
ok(await page.evaluate(() =>
       document.getElementById('ps-layout-text-section')
           .style.display !== 'none'),
   'selecting a text item reveals the rail Text section');
await page.click('#ps-laddtext');
await page.waitForTimeout(400);
await page.evaluate(() => {
    const ids = window.PS_SHELL.chart().items
        .filter(i => i.kind === 'text').map(i => i.id);
    window.PS_SHELL.selectLayoutItems(ids);
});
await page.waitForTimeout(300);
// CONTRACT CHANGED, deliberately, Aug 2026. This used to assert that the
// section LEFT on a multi-selection, because it styled one item. That made
// restyling a figure's four panel letters four separate visits to this
// panel, which is the one thing the section exists for. It now stays, says
// how many items it is about to change, and applies to all of them; where
// they disagree a field reads Mixed rather than showing one member's value.
// The per-set behaviour is covered in layout-figure-check case 15.
{
    const sec = await page.evaluate(() => {
        const e = document.getElementById('ps-layout-text-section');
        return { shown: e.style.display !== 'none',
                 title: e.querySelector('.ps-inspector-section-title').textContent };
    });
    ok(sec.shown, 'and it STAYS for a multi-selection, because a set of ' +
       'labels is exactly what a figure needs restyled together');
    ok(/2 items/.test(sec.title),
       'saying how many it will change ("' + sec.title + '")');
}
await page.evaluate((id) => window.PS_SHELL.selectLayoutItems([id]), textId);
await page.waitForTimeout(300);

console.log('case 2: size, bold, italic, color and rotation all apply');
await page.evaluate(() => {
    const n = document.getElementById('ps-ltx-size-num');
    n.value = '24';
    n.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(250);
await page.click('#ps-ltx-bold');
await page.waitForTimeout(150);
await page.click('#ps-ltx-italic');
await page.waitForTimeout(150);
await page.click('#ps-ltx-swatches button[data-color="#c2242c"]');
await page.waitForTimeout(150);
await page.evaluate(() => {
    const n = document.getElementById('ps-ltx-rot-num');
    n.value = '45';
    n.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(300);
const styled = await page.evaluate((id) => {
    const it = window.PS_SHELL.chart().items.find(i => i.id === id);
    const node = document.querySelector(
        '.ps-litem[data-item-id="' + id + '"] .ps-ltext');
    const cs = getComputedStyle(node);
    return { fontSize: it.fontSize, bold: it.bold, italic: it.italic,
             color: it.color, rotate: it.rotate,
             domSize: cs.fontSize, domStyle: cs.fontStyle,
             domColor: cs.color, domTransform: cs.transform,
             boxTransform: getComputedStyle(node.closest('.ps-litem'))
                 .transform,
             pressed: {
                 bold: document.getElementById('ps-ltx-bold')
                     .getAttribute('aria-pressed'),
                 italic: document.getElementById('ps-ltx-italic')
                     .getAttribute('aria-pressed'),
             } };
}, textId);
ok(styled.fontSize === 24 && styled.domSize === '24px',
   `size round-trips (${styled.fontSize} -> ${styled.domSize})`);
ok(styled.bold === true && styled.italic === true &&
   styled.domStyle === 'italic' &&
   styled.pressed.bold === 'true' && styled.pressed.italic === 'true',
   'bold and italic apply, and the buttons show their pressed state');
ok(styled.color === '#c2242c' && styled.domColor === 'rgb(194, 36, 44)',
   `the preset swatch recolors the canvas text (${styled.domColor})`);
ok(styled.rotate === 45 && styled.domTransform !== 'none' &&
   styled.boxTransform === 'none',
   'rotation lands on the INNER text node; the item box stays unrotated ' +
   'so drag and align geometry is untouched');

console.log('case 3: the layout EXPORT carries every style');
await page.evaluate(() => {
    window.__psLayoutSvg = null;
    window.showSaveFilePicker = () => Promise.resolve({
        createWritable: () => Promise.resolve({
            write: async (data) => {
                const blob = data instanceof Blob ? data : null;
                if (blob) window.__psLayoutSvg = await blob.text();
            },
            close: () => Promise.resolve() }) });
});
await page.click('#ps-export');
await page.waitForFunction(() =>
    document.getElementById('ps-exporter').style.display === 'flex',
    null, { timeout: 8000 });
await page.click('.ps-export-format:has(input[value="svg"])');
await page.click('#ps-export-go');
await page.waitForFunction(() => window.__psLayoutSvg, null,
                           { timeout: 15000 });
const svg = await page.evaluate(() => window.__psLayoutSvg);
ok(svg.indexOf('fill="#c2242c"') !== -1 &&
   svg.indexOf('font-style="italic"') !== -1 &&
   svg.indexOf('font-weight="700"') !== -1 &&
   /transform="rotate\(45 /.test(svg) &&
   svg.indexOf('font-size="24"') !== -1,
   'the exported svg carries fill, italic, bold, size AND the rotation ' +
   'about the item centre');

console.log('case 4: one undo steps the style back');
const beforeUndo = await page.evaluate((id) =>
    window.PS_SHELL.chart().items.find(i => i.id === id).rotate, textId);
await page.keyboard.press('ControlOrMeta+z');
await page.waitForTimeout(400);
const afterUndo = await page.evaluate((id) =>
    window.PS_SHELL.chart().items.find(i => i.id === id).rotate, textId);
ok(beforeUndo === 45 && (afterUndo || 0) === 0,
   `Cmd/Ctrl+Z reverts the rotation (${beforeUndo} -> ${afterUndo || 0})`);

console.log('case 5: the inline editor mirrors the styles it can');
await page.evaluate((id) => {
    const node = document.querySelector(
        '.ps-litem[data-item-id="' + id + '"]');
    node.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
}, textId);
await page.waitForTimeout(400);
const editor = await page.evaluate(() => {
    const ta = document.querySelector('.ps-ltext-edit');
    if (!ta) return null;
    const cs = getComputedStyle(ta);
    return { style: cs.fontStyle, color: cs.color };
});
ok(!!editor && editor.style === 'italic' &&
   editor.color === 'rgb(194, 36, 44)',
   'double-click editing keeps the italic red look under the caret');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

console.log('case 6: round 2 (Torry) - row layout, picker, handle, halo');
// B/I sit ON the Size row, to the right of the slider and number.
const rowGeom = await page.evaluate(() => {
    const mid = id => {
        const r = document.getElementById(id).getBoundingClientRect();
        return { y: r.top + r.height / 2, left: r.left };
    };
    const size = mid('ps-ltx-size'), bold = mid('ps-ltx-bold'),
          ital = mid('ps-ltx-italic'), num = mid('ps-ltx-size-num');
    return { sameLine: Math.abs(size.y - bold.y) < 5 &&
                       Math.abs(size.y - ital.y) < 5,
             toTheRight: bold.left > num.left };
});
ok(rowGeom.sameLine && rowGeom.toTheRight,
   'Bold and Italic sit on the Size row, right of the slider and number');
// The chart-style color stack: hex input, hue slider, SV square.
await page.evaluate(() => {
    const hx = document.getElementById('ps-ltx-hex');
    hx.value = '#136f4a';
    hx.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(250);
ok(await page.evaluate((id) =>
       window.PS_SHELL.chart().items.find(i => i.id === id).color, textId)
   === '#136f4a',
   'the hex field commits an arbitrary color');
const svPick = await page.evaluate(() => {
    const sv = document.getElementById('ps-ltx-sv');
    const r = sv.getBoundingClientRect();
    return { x: r.left + r.width * 0.8, y: r.top + r.height * 0.3 };
});
await page.mouse.move(svPick.x, svPick.y);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(250);
const afterSv = await page.evaluate((id) =>
    window.PS_SHELL.chart().items.find(i => i.id === id).color, textId);
ok(/^#[0-9a-f]{6}$/i.test(afterSv) && afterSv !== '#136f4a',
   `the SV square picks a color (${afterSv})`);
await page.evaluate(() => {
    const hue = document.getElementById('ps-ltx-hue');
    hue.value = '210';
    hue.dispatchEvent(new Event('input', { bubbles: true }));
    hue.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(250);
const afterHue = await page.evaluate((id) =>
    window.PS_SHELL.chart().items.find(i => i.id === id).color, textId);
ok(afterHue !== afterSv && /^#[0-9a-f]{6}$/i.test(afterHue),
   `the hue slider shifts it again (${afterHue})`);
// The selection halo on TEXT is dashed, the chart workspace's look -
// carried by the rotating frame (round 4), not the item outline.
ok(await page.evaluate((id) => {
    const node = document.querySelector(
        '.ps-litem[data-item-id="' + id + '"]');
    const fr = node.querySelector('.ps-ltx-frame');
    return !!fr && getComputedStyle(fr).borderTopStyle === 'dashed' &&
        getComputedStyle(node).outlineStyle === 'none';
}, textId),
   'selected text wears the dashed frame, like text in Charts');
// The rotate grip: drag it and the item rotates, slider following.
await page.evaluate((id) => {
    const it = window.PS_SHELL.chart().items.find(i => i.id === id);
    it.rotate = 0;
    window.PS_SHELL.selectLayoutItems([id]);
}, textId);
await page.waitForTimeout(300);
const grip = await page.evaluate((id) => {
    const g = document.querySelector(
        '.ps-litem[data-item-id="' + id + '"] [data-role="ltx-rotate-handle"]');
    if (!g) return null;
    const r = g.getBoundingClientRect();
    const box = document.querySelector(
        '.ps-litem[data-item-id="' + id + '"]').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + 4,
             cx: box.left + box.width / 2, cy: box.top + box.height / 2 };
}, textId);
ok(!!grip, 'the selected text box grows a rotate grip above it');
// Torry's screenshot (Aug 6 2026): on a NARROW box the grip's knob sat
// on the mini toolbar's first button. The bar parks BELOW text items;
// at rest the grip owns the top - they must never intersect.
const chrome = await page.evaluate((id) => {
    const box = document.querySelector(
        '.ps-litem[data-item-id="' + id + '"]');
    const g = box.querySelector('[data-role="ltx-rotate-handle"]')
        .getBoundingClientRect();
    const b = box.querySelector('.ps-lbar').getBoundingClientRect();
    const r = box.getBoundingClientRect();
    return { overlap: !(g.right < b.left || g.left > b.right ||
                        g.bottom < b.top || g.top > b.bottom),
             barBelow: b.top >= r.bottom,
             gripAbove: g.bottom <= r.top + 2 };
}, textId);
ok(!chrome.overlap && chrome.barBelow && chrome.gripAbove,
   'the grip owns the top and the mini toolbar parks below: no collision ' +
   'at any box width');
await page.mouse.move(grip.x, grip.y);
await page.mouse.down();
// Sweep to the right of the centre: roughly +40 degrees.
await page.mouse.move(grip.cx + 120, grip.cy - 100, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(400);
const spun = await page.evaluate((id) => ({
    rotate: window.PS_SHELL.chart().items.find(i => i.id === id).rotate,
    slider: document.getElementById('ps-ltx-rot').value,
}), textId);
ok(typeof spun.rotate === 'number' && spun.rotate > 15 &&
   spun.rotate <= 90 && String(spun.rotate) === spun.slider,
   `dragging the grip rotates the text and the rail follows ` +
   `(${spun.rotate} degrees)`);
// Round 4 (Torry: the text angled but the box stayed flat): the dashed
// frame - grip riding it - rotates WITH the text, the chart look.
const followed = await page.evaluate((id) => {
    const box = document.querySelector(
        '.ps-litem[data-item-id="' + id + '"]');
    const fr = box.querySelector('.ps-ltx-frame');
    const tx = box.querySelector('.ps-ltext');
    return { frame: getComputedStyle(fr).transform,
             text: getComputedStyle(tx).transform,
             gripInFrame: !!fr.querySelector(
                 '[data-role="ltx-rotate-handle"]') };
}, textId);
ok(followed.frame !== 'none' && followed.frame === followed.text &&
   followed.gripInFrame,
   'the dashed frame rotates WITH the text, and the grip orbits on it');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('LAYOUT TEXT CHECK PASS');
await browser.close();
