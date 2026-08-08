// A colour you have picked must not be thrown away by a reload while the
// status bar says the project is saved.
//
// THE BUG. The engine's colour picker commits ONCE, on close
// (_hideColorPicker: "This is when setOption fires"). The saturation
// square and the hex box only set state.changed, and repaint the chart
// live. So between picking a colour and closing the picker, the drawn
// chart and the saved project genuinely disagree - and the status bar,
// which knows nothing about the engine's in-flight state, reads
// "Autosaved just now" throughout.
//
// Reproduced with a real pointer drag: the bar drew rgb(57, 78, 99), the
// option store held no colour key at all, forcing the shell's own unload
// flush changed nothing, and after a reload the bar was back to the stock
// rgb(68, 120, 173). Not a repaint glitch - the pick was never written.
//
// Most panel switches, tab changes and strip changes close the picker, so
// the exposure is "pick a colour, touch nothing else, then reload or close
// the tab". That is narrow, and it is also exactly what someone does when
// they have just got the colour right.
//
// THE FIX. The engine already has _commitColorPickerInPlace(), which
// fires the commit callback without tearing the picker down - it exists so
// panel-internal toggles can bank a pending colour. The three "the user is
// about to lose interactivity" handlers (beforeunload, blur, tab hidden)
// now bank the picker before flushing, so the value rides the same
// debounced write as every other edit. jamovi has the same bug and gets
// the same fix.
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
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(Number(process.env.PS_BOOT || 1300));
await page.click('#ps-welcome-sample');
await page.waitForTimeout(2000);

const barFill = () => page.evaluate(() => {
    const svg = Array.from(document.querySelectorAll('#psroot svg'))
        .sort((a, b) => b.getBoundingClientRect().width -
                        a.getBoundingClientRect().width)[0];
    const e = svg && svg.querySelector('[data-bar-cat]');
    return e ? getComputedStyle(e).fill : null;
});
const stored = () => page.evaluate(() => {
    const raw = window.localStorage.getItem('psstandalone.project.v2') || '';
    return { hasColour: /(barColor|groupColors|categoryStyles)/.test(raw),
             doc: (document.getElementById('ps-status-document') || {}).textContent };
});

console.log('case 1: pick a colour with a real drag');
const before = await barFill();
// Click a bar for its style panel, then the fill chip to dock the picker.
const bar = await page.evaluate(() => {
    const svg = Array.from(document.querySelectorAll('#psroot svg'))
        .sort((a, b) => b.getBoundingClientRect().width -
                        a.getBoundingClientRect().width)[0];
    const r = svg.querySelector('[data-bar-cat]').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await page.mouse.click(bar.x, bar.y);
await page.waitForTimeout(1400);
await page.evaluate(() => {
    const c = document.querySelector('#psroot [data-field="fill-chip"]');
    const r = c.getBoundingClientRect();
    c.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1,
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
});
await page.waitForTimeout(900);
const sq = await page.evaluate(() => {
    const el = document.querySelector('#psroot [data-role="sv"]');
    if (!el) return null;
    el.scrollIntoView({ block: 'nearest' });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width * 0.25, y: r.top + r.height * 0.35 };
});
ok(!!sq, 'the saturation square is on screen');
await page.mouse.move(sq.x, sq.y);
await page.mouse.down();
await page.mouse.move(sq.x + 30, sq.y + 25, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(1300);
const picked = await barFill();
ok(picked && picked !== before,
   `the chart repaints with the picked colour (${before} -> ${picked})`);

console.log('case 2: the picker is still open, and the tab is closing');
ok(await page.evaluate(() => {
    const el = document.querySelector('#psroot [data-role="sv"]');
    return !!el && el.getBoundingClientRect().width > 0;
}), 'the picker is still open - this is the whole exposure');
// The shell's own flush law, plus the real unload event the engine hears.
await page.evaluate(() => {
    window.__gb2_inspectorInputAt = 0;
    window.dispatchEvent(new Event('beforeunload'));
});
await page.waitForTimeout(1100);
const st = await stored();
ok(st.hasColour,
   `the pick reached the saved project before the page went away ` +
   `(status bar said "${(st.doc || '').trim()}")`);

console.log('case 3: and it is still there after a reload');
await page.reload();
await page.waitForTimeout(Number(process.env.PS_BOOT || 1300));
await page.evaluate(() => {
    const c = document.getElementById('ps-welcome-continue') ||
              document.getElementById('ps-welcome-close');
    if (c && c.getBoundingClientRect().width > 0) c.click();
});
await page.waitForTimeout(2200);
const after = await barFill();
ok(after === picked,
   `the bar comes back the colour it was left (${after})`);
ok(after !== before,
   'and not the stock default, which is what the loss looked like');

console.log('case 4: and a SAVED file carries it too');
// The durable path, and the one the first fix missed. Cmd/Ctrl+S is bound
// on a window CAPTURE listener with no focused-field guard, so it fires
// happily with the cursor in the picker's hex box - and projectFileText
// snapshotted the option store, which the picker had not written to yet.
// Measured before this: a .pand 581 bytes short with no colour key, while
// the status bar said "Saved". Banking alone was not enough either: the
// commit queues through the engine's 1500ms debounce, so the host hook
// banks AND flushes.
const bar2 = await page.evaluate(() => {
    const svg = Array.from(document.querySelectorAll('#psroot svg'))
        .sort((a, b) => b.getBoundingClientRect().width -
                        a.getBoundingClientRect().width)[0];
    const r = svg.querySelector('[data-bar-cat]').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await page.mouse.click(bar2.x, bar2.y);
await page.waitForTimeout(1400);
await page.evaluate(() => {
    const c = document.querySelector('#psroot [data-role="primary-color"]');
    const r = c.getBoundingClientRect();
    c.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1,
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
});
await page.waitForTimeout(900);
const sq2 = await page.evaluate(() => {
    const e = document.querySelector('#psroot [data-role="sv"]');
    if (!e) return null;
    e.scrollIntoView({ block: 'nearest' });
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width * 0.85, y: r.top + r.height * 0.2 };
});
ok(!!sq2, 'the picker is open again');
await page.mouse.move(sq2.x, sq2.y);
await page.mouse.down();
await page.mouse.move(sq2.x + 8, sq2.y + 8, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(1200);
const saved = await page.evaluate(() => {
    const svg = Array.from(document.querySelectorAll('#psroot svg'))
        .sort((a, b) => b.getBoundingClientRect().width -
                        a.getBoundingClientRect().width)[0];
    const fill = getComputedStyle(svg.querySelector('[data-bar-cat]')).fill;
    // THE SPECIFIC colour, not "a colour key exists". Cases 1 to 3 already
    // committed one, so a presence test passes without the fix - it did,
    // and this case proved nothing until it was written this way.
    const m = fill.match(/(\d+),\s*(\d+),\s*(\d+)/);
    const hex = m ? ('#' + [1, 2, 3].map(i =>
        Number(m[i]).toString(16).padStart(2, '0')).join('')) : null;
    const txt = window.PS_SHELL.projectFileText();
    return { pickerOpen: !!document.querySelector('#psroot [data-role="sv"]'),
             drawn: fill, hex: hex,
             hasThis: !!hex && txt.toLowerCase().indexOf(hex) >= 0 };
});
ok(saved.pickerOpen,
   'the picker is STILL open, which is the whole exposure');
ok(saved.hasThis,
   `the file the app would write carries THIS colour, the one on screen ` +
   `(${saved.hex} / ${saved.drawn})`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('PICKER PERSISTENCE: PASS');
await browser.close();
