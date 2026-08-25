// Panel height budget (Torry, Aug 24 2026): the standalone ships
// payload.panelMaxVh = 42 and the engine caps the inspector panel at
// that percent of the window height (240px floor), scrolling it INSIDE
// itself, with the pane-scroll-cue inset shadow at the panel's bottom
// edge while there is more below. The contracts:
//   1. an opened panel rests at maxHeight = cap with overflow-y auto,
//   2. a panel taller than the cap scrolls internally; the cue shadow
//      shows, and clears at the end of the scroll,
//   3. the click reveal composes: the page scroll a panel open causes
//      is bounded by the cap (the chart stays on screen),
//   4. the collapse roll never flashes taller than the cap,
//   5. inertness: with the key absent (jamovi's world), the panel
//      rests uncapped exactly as before.
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
const VW = 1280, VH = 620;
const CAP = Math.max(240, Math.round(VH * 0.42));   // engine formula
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: VW, height: VH } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(600);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1500);
}

async function markBox() {
    // A clickable data mark in the biggest svg (bar first, then the
    // other families), in viewport coordinates.
    return page.evaluate(() => {
        const svgs = [...document.querySelectorAll('.graphbuilder2-host svg')];
        let best = null, area = 0;
        for (const s of svgs) {
            const b = s.getBoundingClientRect();
            if (b.width * b.height > area) { area = b.width * b.height; best = s; }
        }
        if (!best) return null;
        const m = best.querySelector('[data-bar-cat], [data-role="dist-hist-bar"], ' +
            '[data-role="xy-point"], [data-role="freq-slice"]');
        if (!m) return null;
        const r = m.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
}
async function panelState() {
    return page.evaluate(() => {
        const p = document.querySelector('.gb2-panel');
        if (!p) return null;
        return {
            display: p.style.display,
            maxHeight: p.style.maxHeight,
            overflowY: p.style.overflowY,
            boxShadow: p.style.boxShadow,
            clientH: p.clientHeight,
            scrollH: p.scrollHeight,
            scrollTop: p.scrollTop
        };
    });
}

console.log('case 1: an opened panel rests at the cap with internal overflow');
const mb = await markBox();
ok(!!mb, 'found a clickable data mark');
const scroll0 = await page.evaluate(() =>
    document.getElementById('ps-main-workspace').scrollTop);
await page.mouse.click(mb.x, mb.y);
await page.waitForTimeout(900);
const scroll1 = await page.evaluate(() =>
    document.getElementById('ps-main-workspace').scrollTop);
ok(scroll1 - scroll0 >= 0 && scroll1 - scroll0 <= CAP + 90,
   `reveal moved the page ${scroll1 - scroll0}px, within cap + slack`);
let st = await panelState();
ok(!!st && st.display !== 'none', 'panel opened');
ok(st.maxHeight === CAP + 'px', `panel rests at maxHeight ${CAP}px (got "${st.maxHeight}")`);
ok(st.overflowY === 'auto', `panel overflow-y is auto (got "${st.overflowY}")`);
ok(st.clientH <= CAP + 2, `rendered height ${st.clientH} stays within the cap`);

console.log('case 2: a long panel (Statistics) scrolls inside itself with the cue');
const statsBtn = await page.evaluateHandle(() => {
    const btns = [...document.querySelectorAll(
        '.graphbuilder2-host [data-role="chart-toolbar"] button')];
    return btns.find(b => /statistic|Σ/i.test(
        (b.textContent || '') + ' ' + (b.getAttribute('title') || ''))) || null;
});
ok(await statsBtn.evaluate(b => !!b), 'found the Statistics toolbar button');
const preScroll = await page.evaluate(() =>
    document.getElementById('ps-main-workspace').scrollTop);
await statsBtn.asElement().click();
await page.waitForTimeout(1300);
st = await panelState();
ok(st.scrollH > st.clientH + 10,
   `Statistics content (${st.scrollH}) exceeds the capped window (${st.clientH})`);
ok(/inset/.test(st.boxShadow), 'more-below cue shadow is showing');
await page.evaluate(() => {
    const p = document.querySelector('.gb2-panel');
    p.scrollTop = p.scrollHeight;
});
await page.waitForTimeout(120);
st = await panelState();
ok(st.boxShadow === '', 'cue clears at the end of the panel scroll');

console.log('case 3: the chart stays on screen beside the open panel');
const postScroll = await page.evaluate(() =>
    document.getElementById('ps-main-workspace').scrollTop);
ok(postScroll - preScroll <= CAP + 90,
   `page moved ${postScroll - preScroll}px for the Statistics panel, within cap + slack`);
const chartVisible = await page.evaluate(() => {
    const svgs = [...document.querySelectorAll('.graphbuilder2-host svg')];
    let best = null, area = 0;
    for (const s of svgs) {
        const b = s.getBoundingClientRect();
        if (b.width * b.height > area) { area = b.width * b.height; best = s; }
    }
    if (!best) return 0;
    const r = best.getBoundingClientRect();
    return Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
});
ok(chartVisible > 120, `chart keeps ${Math.round(chartVisible)}px on screen beside the open panel`);

console.log('case 4: the collapse roll never flashes taller than the cap');
await page.evaluate(() => {
    window.__capSampler = { max: 0, on: true };
    (function tick() {
        if (!window.__capSampler.on) return;
        const p = document.querySelector('.gb2-panel');
        if (p && p.style.display !== 'none') {
            const h = p.getBoundingClientRect().height;
            if (h > window.__capSampler.max) window.__capSampler.max = h;
        }
        requestAnimationFrame(tick);
    })();
});
await page.keyboard.press('Escape');
await page.waitForTimeout(450);
const sampled = await page.evaluate(() => {
    window.__capSampler.on = false;
    return window.__capSampler.max;
});
st = await panelState();
ok(st.display === 'none', 'panel closed on Escape');
ok(sampled <= CAP + 6,
   `roll-down peaked at ${Math.round(sampled)}px, never past the cap`);

console.log('case 5: inertness - a page whose payload never carries the key');
// jamovi's world is a FIRST render without the key, not a key stripped
// mid-session (local re-renders clone the live payload, so an in-place
// strip never reaches the engine). Boot a fresh page with buildPayload
// wrapped before any render.
const ctx2 = await browser.newContext({ viewport: { width: VW, height: VH } });
const page2 = await ctx2.newPage();
const errors2 = [];
page2.on('pageerror', e => errors2.push(String(e)));
await page2.addInitScript(() => {
    // Intercept at the ENGINE boundary: the shell calls its internal
    // buildPayload (the PS_SHELL reference is an exposed copy), so the
    // faithful strip wraps GraphBuilder2.render(elementId, payload) and
    // removes the key from every payload the engine ever sees.
    const t = setInterval(() => {
        if (window.GraphBuilder2 && window.GraphBuilder2.render &&
            !window.GraphBuilder2.__keyless) {
            clearInterval(t);
            const orig = window.GraphBuilder2.render;
            window.GraphBuilder2.render = function (id, payload) {
                if (payload && typeof payload === 'object')
                    delete payload.panelMaxVh;
                return orig.apply(this, arguments);
            };
            window.GraphBuilder2.__keyless = true;
        }
    }, 5);
});
await page2.goto(pageUrl);
await page2.waitForTimeout(600);
if (await page2.locator('#ps-welcome').isVisible()) {
    await page2.click('#ps-welcome-sample');
    await page2.waitForTimeout(1500);
}
const mb2 = await page2.evaluate(() => {
    const svgs = [...document.querySelectorAll('.graphbuilder2-host svg')];
    let best = null, area = 0;
    for (const s of svgs) {
        const b = s.getBoundingClientRect();
        if (b.width * b.height > area) { area = b.width * b.height; best = s; }
    }
    if (!best) return null;
    const m = best.querySelector('[data-bar-cat], [data-role="dist-hist-bar"], ' +
        '[data-role="xy-point"], [data-role="freq-slice"]');
    if (!m) return null;
    const r = m.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
ok(!!mb2, 'found a clickable data mark on the key-less page');
await page2.mouse.click(mb2.x, mb2.y);
await page2.waitForTimeout(900);
const st2 = await page2.evaluate(() => {
    const p = document.querySelector('.gb2-panel');
    return p ? { display: p.style.display, maxHeight: p.style.maxHeight,
                 overflowY: p.style.overflowY } : null;
});
ok(!!st2 && st2.display !== 'none', 'panel opened without the key');
ok(st2.maxHeight === '', `panel rests UNCAPPED with the key absent (maxHeight "${st2.maxHeight}")`);
ok(st2.overflowY === '', 'no forced overflow with the key absent');

ok(errors.length === 0, 'no page errors on the capped page (' + errors.join(' | ').slice(0, 200) + ')');
ok(errors2.length === 0, 'no page errors on the key-less page (' + errors2.join(' | ').slice(0, 200) + ')');
await browser.close();
console.log('panelcap-check: ALL OK');
