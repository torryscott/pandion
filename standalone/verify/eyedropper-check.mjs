// Punch list t4-140: the color picker's dropper existed only where the
// browser ships the EyeDropper API (Chrome, Edge, Electron). The engine
// feature-detects window.EyeDropper at picker-open time and hides the
// button when it is absent, so in Safari and Firefox the feature was
// simply missing (Torry's report, Aug 2026). The standalone now installs
// a same-contract POLYFILL - an in-page sampler - when the global is
// absent; the engine's own native branch then uses it, and browsers with
// the real API keep the real one.
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

async function boot(page) {
    await page.goto(pageUrl);
    await page.waitForTimeout(700);
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1800);
    // Click a bar so its style panel opens and docks the picker.
    await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        const chart = Array.from(
            document.querySelectorAll('.graphbuilder2-host svg'))
            .sort((a, b) => (b.clientWidth * b.clientHeight) -
                            (a.clientWidth * a.clientHeight))[0];
        const bar = chart.querySelector('[data-bar-cat]');
        for (const type of ['pointerdown', 'pointerup', 'click'])
            bar.dispatchEvent(new PointerEvent(type,
                { bubbles: true, cancelable: true }));
        await s(900);
    });
}

// ---------------------------------------------------------------- Safari
// Remove the API before any script runs: this is the browser Torry was
// in when the button was missing.
console.log('case 1: without the native API, the dropper still exists');
let page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.addInitScript(() => {
    try { delete window.EyeDropper; } catch (e) { window.EyeDropper = undefined; }
    // The polyfill runs at ps-shell parse time, AFTER this script.
});
await boot(page);
const present = await page.evaluate(() => {
    const drop = document.querySelector('[data-role="eyedrop"]');
    return {
        polyfilled: typeof window.EyeDropper === 'function' &&
            String(window.EyeDropper).indexOf('native code') === -1,
        visible: !!(drop && drop.offsetParent)
    };
});
ok(present.polyfilled,
   'the shell installs a same-contract EyeDropper polyfill when the ' +
   'global is absent');
ok(present.visible,
   'so the engine\'s own feature-detect keeps the dropper button, with ' +
   'zero engine changes');

console.log('case 2: sampling reads the real element under the cursor');
const sampled = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const chart = Array.from(
        document.querySelectorAll('.graphbuilder2-host svg'))
        .sort((a, b) => (b.clientWidth * b.clientHeight) -
                        (a.clientWidth * a.clientHeight))[0];
    // The bar SHAPE, not just anything stamped data-bar-cat: labels
    // carry the stamp too, and a black label sampled against a
    // black-derived expectation passed this case vacuously once.
    const bar = Array.from(
        chart.querySelectorAll('rect[data-bar-cat], path[data-bar-cat]'))
        .filter(el => {
            const f = getComputedStyle(el).fill;
            return f && f !== 'none' && /\d/.test(f);
        })
        .sort((a, b) => {
            const ra = a.getBBox(), rb = b.getBBox();
            return rb.width * rb.height - ra.width * ra.height;
        })[0];
    // The expectation is DERIVED from the rendered bar, never copied.
    const m = getComputedStyle(bar).fill.match(/\d+/g).map(Number);
    const expect = '#' + m.slice(0, 3).map(n =>
        (n < 16 ? '0' : '') + n.toString(16)).join('');
    const r = bar.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    // A solid fixture in a color no bar uses: committing IT proves the
    // commit actually wrote (the picker already held the bar's own
    // color, so a bar-commit could pass with the commit path dead).
    const fix = document.createElement('div');
    fix.style.cssText = 'position:fixed;left:24px;top:24px;width:40px;' +
        'height:40px;background:#3b9e51;z-index:20;';
    document.body.appendChild(fix);
    const hex = document.querySelector('[data-role="hex"]');
    const before = hex.value.toLowerCase();
    document.querySelector('[data-role="eyedrop"]').click();
    await s(200);
    const overlay = document.getElementById('ps-eyedrop-overlay');
    if (!overlay) return { noOverlay: true };
    overlay.dispatchEvent(new PointerEvent('pointermove',
        { bubbles: true, clientX: cx, clientY: cy }));
    await s(100);
    const chip = document.getElementById('ps-eyedrop-chip');
    const onBar = chip ? chip.textContent.match(/#[0-9a-f]{6}/) : null;
    overlay.dispatchEvent(new PointerEvent('pointermove',
        { bubbles: true, clientX: 44, clientY: 44 }));
    await s(100);
    overlay.dispatchEvent(new PointerEvent('pointerdown',
        { bubbles: true, cancelable: true, clientX: 44, clientY: 44 }));
    overlay.dispatchEvent(new PointerEvent('pointerup',
        { bubbles: true, cancelable: true, clientX: 44, clientY: 44 }));
    await s(400);
    fix.remove();
    return {
        expect, before,
        onBar: onBar ? onBar[0] : null,
        committed: hex.value.toLowerCase(),
        overlayGone: !document.getElementById('ps-eyedrop-overlay'),
        chipGone: !document.getElementById('ps-eyedrop-chip'),
        pickerOpen: !!hex.offsetParent
    };
});
ok(!sampled.noOverlay, 'the button arms an in-page sampling overlay');
ok(sampled.onBar === sampled.expect && sampled.expect !== '#000000',
   `over a bar the live chip names that bar's fill, read from the real ` +
   `pixel stack (${sampled.onBar} = ${sampled.expect})`);
ok(sampled.committed === '#3b9e51' && sampled.committed !== sampled.before,
   `and the click commits the sampled color into the picker, CHANGING ` +
   `it (${sampled.before} -> ${sampled.committed})`);
ok(sampled.overlayGone && sampled.chipGone,
   'the overlay and chip leave with the click');
ok(sampled.pickerOpen,
   'while the picker stays open, because the sampling click never ' +
   'bubbles to the outside-click closers');

console.log('case 3: translucent marks sample as the eye sees them');
// The native dropper reads the screen pixel, so a half-transparent red
// over white is pink. The polyfill composites the element stack the
// same way rather than reporting the pure paint.
const blended = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:20px;top:20px;width:40px;' +
        'height:40px;background:rgba(255,0,0,0.5);z-index:20;';
    document.body.appendChild(probe);
    const under = document.createElement('div');
    under.style.cssText = 'position:fixed;left:20px;top:20px;width:40px;' +
        'height:40px;background:#ffffff;z-index:19;';
    document.body.appendChild(under);
    document.querySelector('[data-role="eyedrop"]').click();
    await s(200);
    const overlay = document.getElementById('ps-eyedrop-overlay');
    overlay.dispatchEvent(new PointerEvent('pointermove',
        { bubbles: true, clientX: 40, clientY: 40 }));
    await s(100);
    const chip = document.getElementById('ps-eyedrop-chip');
    const got = chip.textContent.match(/#[0-9a-f]{6}/)[0];
    // Cancel via Escape rather than committing.
    window.dispatchEvent(new KeyboardEvent('keydown',
        { key: 'Escape', bubbles: true, cancelable: true }));
    await s(200);
    probe.remove(); under.remove();
    return {
        got,
        overlayGone: !document.getElementById('ps-eyedrop-overlay'),
        pickerOpen: !!(document.querySelector('[data-role="hex"]') &&
            document.querySelector('[data-role="hex"]').offsetParent)
    };
});
// Chromium stores the 0.5 alpha as 128/255, so the exact blend is
// #ff7f7f; a browser rounding to 127/255 gives #ff8080. Both are the
// pixel the eye sees; the pure paint (#ff0000) is the failure mode.
ok(/^#ff(7f|80)(7f|80)$/.test(blended.got),
   `rgba(255,0,0,0.5) over white reads as the blended pink the eye ` +
   `sees, never the pure paint (${blended.got})`);
ok(blended.overlayGone,
   'Escape cancels the sampler');
ok(blended.pickerOpen,
   'and KEEPS the picker open - the window-capture listener preempts the ' +
   'engine\'s Esc authority, so exit stays layered');
ok(errors.length === 0, 'no page errors across the whole drive ' +
   JSON.stringify(errors.slice(0, 2)));
await page.close();

// ---------------------------------------------------------- other windows
// t4-141. Safari/Firefox cannot read pixels outside the page, but they
// CAN share a screen: the sampler offers "Pick from another window...",
// grabs ONE still frame from the share, shows it full-screen with a
// loupe, and a click picks the pixel. The stub stands in for the
// browser's share dialog with a canvas stream whose regions have known
// colors, so the frame-coordinate mapping is asserted exactly.
console.log('case 5: the sampler reaches other windows via a shared snapshot');
page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const errors2 = [];
page.on('pageerror', e => errors2.push(String(e)));
await page.addInitScript(() => {
    try { delete window.EyeDropper; } catch (e) { window.EyeDropper = undefined; }
    const c = document.createElement('canvas');
    c.width = 400; c.height = 300;
    const g = c.getContext('2d');
    const paint = () => {
        g.fillStyle = '#0000ff'; g.fillRect(0, 0, 200, 300);
        g.fillStyle = '#ffa500'; g.fillRect(200, 0, 200, 300);
    };
    paint();
    // A static canvas emits no frames; keep repainting so captureStream
    // delivers them.
    setInterval(paint, 60);
    if (!navigator.mediaDevices) Object.defineProperty(navigator,
        'mediaDevices', { value: {}, configurable: true });
    window.__edShareCalls = 0;
    navigator.mediaDevices.getDisplayMedia = () => {
        window.__edShareCalls++;
        if (window.__edDecline) {
            const err = new Error('Permission denied');
            err.name = 'NotAllowedError';
            return Promise.reject(err);
        }
        const stream = c.captureStream(15);
        const t = stream.getVideoTracks()[0];
        const orig = t.stop.bind(t);
        t.stop = () => { window.__edTrackStopped = true; orig(); };
        return Promise.resolve(stream);
    };
});
await boot(page);
const shared = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('[data-role="eyedrop"]').click();
    await s(200);
    const out = {
        bannerOffer: (document.getElementById('ps-eyedrop-share') || {})
            .textContent || null
    };
    document.getElementById('ps-eyedrop-share').click();
    for (let i = 0; i < 40 && !document.querySelector(
        '#ps-eyedrop-overlay canvas'); i++) await s(100);
    const overlay = document.getElementById('ps-eyedrop-overlay');
    const view = overlay.querySelector('canvas');
    out.stillShown = !!view;
    out.dimmed = overlay.style.background !== 'transparent';
    out.trackStopped = !!window.__edTrackStopped;
    if (!view) return out;
    // The view's placement is read back from the DOM, so the expected
    // pointer positions are DERIVED from the real letterboxing.
    const r = view.getBoundingClientRect();
    const at = fx => ({ x: r.left + r.width * fx, y: r.top + r.height / 2 });
    const L = at(0.25), R = at(0.75);
    overlay.dispatchEvent(new PointerEvent('pointermove',
        { bubbles: true, clientX: L.x, clientY: L.y }));
    await s(80);
    const chip = document.getElementById('ps-eyedrop-chip');
    out.leftHex = chip.textContent.match(/#[0-9a-f]{6}/)[0];
    out.loupeShown = chip.querySelector('canvas') &&
        chip.querySelector('canvas').style.display !== 'none';
    overlay.dispatchEvent(new PointerEvent('pointermove',
        { bubbles: true, clientX: R.x, clientY: R.y }));
    await s(80);
    overlay.dispatchEvent(new PointerEvent('pointerdown',
        { bubbles: true, cancelable: true, clientX: R.x, clientY: R.y }));
    overlay.dispatchEvent(new PointerEvent('pointerup',
        { bubbles: true, cancelable: true, clientX: R.x, clientY: R.y }));
    await s(400);
    const hex = document.querySelector('[data-role="hex"]');
    out.committed = hex.value.toLowerCase();
    out.overlayGone = !document.getElementById('ps-eyedrop-overlay');
    out.bannerGone = !document.getElementById('ps-eyedrop-banner');
    out.pickerOpen = !!hex.offsetParent;
    return out;
});
ok(/^Pick from another window/.test(shared.bannerOffer || ''),
   `the sampler banner offers the way out of the page ` +
   `("${shared.bannerOffer}")`);
ok(shared.stillShown && shared.dimmed,
   'sharing yields a full-screen snapshot to pick from');
ok(shared.trackStopped,
   'and the capture is STOPPED the moment the frame lands: one still, ' +
   'nothing recorded');
ok(shared.leftHex === '#0000ff',
   `the left region of the shared frame samples as its exact color ` +
   `(${shared.leftHex})`);
ok(shared.loupeShown,
   'with a magnifier loupe, since a raster has no element outlines to ' +
   'aim by');
ok(shared.committed === '#ffa500',
   `clicking the right region commits ITS color - the letterbox ` +
   `mapping is exact (${shared.committed})`);
ok(shared.overlayGone && shared.bannerGone,
   'the sampler chrome leaves with the click');
ok(shared.pickerOpen, 'and the picker is still open holding the color');

console.log('case 6: Escape peels one layer at a time, and decline is soft');
const layered = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('[data-role="eyedrop"]').click();
    await s(200);
    document.getElementById('ps-eyedrop-share').click();
    for (let i = 0; i < 40 && !document.querySelector(
        '#ps-eyedrop-overlay canvas'); i++) await s(100);
    const esc = () => window.dispatchEvent(new KeyboardEvent('keydown',
        { key: 'Escape', bubbles: true, cancelable: true }));
    esc(); await s(150);
    const overlay = document.getElementById('ps-eyedrop-overlay');
    const afterOne = {
        samplerAlive: !!overlay,
        stillGone: overlay && !overlay.querySelector('canvas'),
        transparent: overlay && overlay.style.background === 'transparent'
    };
    esc(); await s(150);
    const afterTwo = {
        samplerGone: !document.getElementById('ps-eyedrop-overlay'),
        pickerOpen: !!(document.querySelector('[data-role="hex"]') &&
            document.querySelector('[data-role="hex"]').offsetParent)
    };
    // The decline path: the browser refuses the share.
    window.__edDecline = true;
    document.querySelector('[data-role="eyedrop"]').click();
    await s(200);
    document.getElementById('ps-eyedrop-share').click();
    await s(300);
    const banner = document.getElementById('ps-eyedrop-banner');
    const declined = {
        note: banner ? banner.textContent : null,
        samplerAlive: !!document.getElementById('ps-eyedrop-overlay')
    };
    esc(); await s(150);
    window.__edDecline = false;
    return { afterOne, afterTwo, declined };
});
ok(layered.afterOne.samplerAlive && layered.afterOne.stillGone &&
   layered.afterOne.transparent,
   'the first Escape drops the snapshot and returns to in-app sampling');
ok(layered.afterTwo.samplerGone && layered.afterTwo.pickerOpen,
   'the second closes the sampler and still leaves the picker open');
ok(/declined/i.test(layered.declined.note || '') &&
   layered.declined.samplerAlive,
   `a refused share is a note, not a dead end - in-app sampling ` +
   `continues ("${(layered.declined.note || '').slice(0, 60)}")`);
ok(errors2.length === 0, 'no page errors across the share drive ' +
   JSON.stringify(errors2.slice(0, 2)));
await page.close();

// --------------------------------------------------------------- desktop
// t4-142. Electron 33 ships NO EyeDropper API, so the polyfill runs in
// the desktop app too - and there the main process can capture the
// whole screen (eyedrop.js, probed by eyedrop-electron-check). The
// polyfill must PREFER that bridge: instant OS-wide pick, no in-page
// overlay, and the dead share door never renders.
console.log('case 7: the desktop bridge is preferred over in-page sampling');
page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
await page.addInitScript(() => {
    try { delete window.EyeDropper; } catch (e) { window.EyeDropper = undefined; }
    window.__pickCalls = [];
    window.PS_DESKTOP = {
        version: 'probe', platform: 'darwin',
        pickColor: () => {
            window.__pickCalls.push(1);
            return Promise.resolve(window.__pickResult ||
                { ok: true, hex: '#123456' });
        }
    };
});
await boot(page);
const desk = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const hex = document.querySelector('[data-role="hex"]');
    const before = hex.value.toLowerCase();
    document.querySelector('[data-role="eyedrop"]').click();
    await s(300);
    const afterPick = {
        calls: window.__pickCalls.length,
        overlay: !!document.getElementById('ps-eyedrop-overlay'),
        committed: hex.value.toLowerCase(),
        before
    };
    // A cancel commits nothing and opens nothing.
    window.__pickResult = { ok: false, reason: 'cancel' };
    document.querySelector('[data-role="eyedrop"]').click();
    await s(300);
    const afterCancel = {
        overlay: !!document.getElementById('ps-eyedrop-overlay'),
        committed: hex.value.toLowerCase(),
        pickerOpen: !!hex.offsetParent
    };
    // A permission refusal falls back to the in-page sampler, whose
    // share door must NOT render in the desktop app (Electron wires no
    // display-media handler - the door would always decline).
    window.__pickResult = { ok: false, reason: 'permission' };
    document.querySelector('[data-role="eyedrop"]').click();
    await s(300);
    const fallback = {
        overlay: !!document.getElementById('ps-eyedrop-overlay'),
        shareBtn: !!document.getElementById('ps-eyedrop-share')
    };
    window.dispatchEvent(new KeyboardEvent('keydown',
        { key: 'Escape', bubbles: true, cancelable: true }));
    await s(150);
    return { afterPick, afterCancel, fallback };
});
ok(desk.afterPick.calls === 1 && !desk.afterPick.overlay,
   'the dropper button routes to the desktop bridge with NO in-page ' +
   'overlay - the OS-wide pick replaces it');
ok(desk.afterPick.committed === '#123456' &&
   desk.afterPick.committed !== desk.afterPick.before,
   `and the picked color lands in the picker, changing it ` +
   `(${desk.afterPick.before} -> ${desk.afterPick.committed})`);
ok(!desk.afterCancel.overlay &&
   desk.afterCancel.committed === '#123456' && desk.afterCancel.pickerOpen,
   'a cancel commits nothing, opens nothing, and keeps the picker');
ok(desk.fallback.overlay && !desk.fallback.shareBtn,
   'a permission refusal falls back to in-page sampling WITHOUT the ' +
   'share door, which is dead weight in the desktop app');
await page.close();

// -------------------------------------------------------------- Chromium
console.log('case 4: where the real API exists, the polyfill stays out');
page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
await boot(page);
const native = await page.evaluate(() => {
    const drop = document.querySelector('[data-role="eyedrop"]');
    return {
        native: typeof window.EyeDropper === 'function' &&
            String(window.EyeDropper).indexOf('native code') !== -1,
        visible: !!(drop && drop.offsetParent)
    };
});
ok(native.native,
   'stock Chromium keeps its native EyeDropper, which can sample other ' +
   'windows - the polyfill only installs into the gap');
ok(native.visible, 'and the button is there as before');

await browser.close();
console.log('EYEDROPPER CHECK PASS');
