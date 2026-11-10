// mobile-check.mjs - the phone and tablet harness (mobile work, step 0).
//
// Pandion opens on a phone straight from the website, and until now nothing
// in the suite looked at it there: every probe drives a desktop viewport
// with a mouse. This probe opens the app on Playwright's phone and tablet
// profiles (touch, a mobile viewport, a 2x or 3x screen), walks the start
// centre and all four workspaces, taps and drags with real touch events,
// and makes two kinds of statement.
//
//   HARD checks hold today and have to keep holding: nothing is wider than
//   the screen (a phone answers wide content by zooming the whole page out,
//   so that is what is measured), no script error, the workspaces can be
//   reached, a tap on a bar opens its editor, a chart can be placed in a
//   layout and kept in the Notebook by touch.
//
//   DEBT is what is known to be poor on a phone, measured and written down
//   in mobile-baseline.json: controls under the 24 px target floor, text
//   under 12 px, form fields under the 16 px that stops iOS zooming on
//   focus, how small the chart's own text ends up once the chart is scaled
//   to the screen, how much of the chart is still in view while its editor
//   is open, tabs clipped out of the editor's tab row, what axe reports at
//   phone size, and which touch gestures land. A debt number may only get
//   BETTER. The probe fails when one gets worse than its baseline and says
//   so when one improves, so each mobile step tightens the file as it lands:
//       PS_MOBILE_WRITE_BASELINE=1 node standalone/verify/mobile-check.mjs
//   rewrites it from the current measurement (review the diff, commit it).
//
// The phone tier this serves (ruled Nov 8 2026): viewing, sharing and
// editing, in every workspace including the Notebook and Layouts; full
// authoring stays a larger-screen job. So the Notebook and Layouts are
// measured and touched here like the chart is, not skipped.
//
// CONTROL: PS_EXPECT_BROKEN=1 injects three regressions (a block wider than
// the screen, command-bar buttons squeezed to 14 px, the editor panel
// hidden) on the phone profile and passes only if the harness goes red on
// exactly those three: the wider-than-the-screen check, the target-size
// ratchet and the tap-opens-editor check.
//
// The first thing it found (Nov 8 2026): on a phone held sideways a tap on
// a bar showed nothing. That window is both narrow and short, so the
// editor docked into the settings column, which is a closed drawer at that
// width. Fixed in the shell (the dock never chooses a column that is a
// drawer); PS_MOBILE_DEVICES=phone-landscape with PS_PAGE at a page from
// before the fix fails "a tap on a bar opens its editor".
//
// CONTROL for the engine's part (step 1): PS_EXPECT_BROKEN=touchhost withholds
// the touchHost payload key at the render boundary, which leaves the engine
// exactly as it was before its selection guard while the new shell stays in
// place. It passes only if the two rules that need the guard go red: a swipe
// on a bar opens that bar's editor again, and the finger lifting off the
// long-press menu selects the bar again.
//
// Chromium only, on purpose: the touch drags ride CDP touch events, which
// go through the browser's real gesture pipeline (pan detection, pointer
// cancel), and no other engine exposes them. What Safari does differently
// (it starts a page pan where touch-action allows one) is for a real phone.
//
// PS_PAGE picks the page (default: standalone/index.html beside this file).
// PS_MOBILE_DEVICES=phone,tablet limits the run. PS_MOBILE_OUT=<dir> saves
// a screenshot per screen. Exit 2 = Playwright or axe-core missing.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

function resolveFrom(name) {
    for (const base of [process.env.GB2_NODE_BASE, process.cwd(), new URL('.', import.meta.url).pathname,
                        '/private/tmp', '/tmp'].filter(Boolean)) {
        try { return createRequire(path.join(base, 'x.js')).resolve(name); }
        catch { /* try the next shared dependency location */ }
    }
    return null;
}
const playwrightPath = resolveFrom('playwright');
const axePath = resolveFrom('axe-core');
if (!playwrightPath || !axePath) {
    console.error('mobile-check: playwright and axe-core are required (cd /private/tmp && npm install playwright axe-core).');
    process.exit(2);
}
const { chromium, devices } = createRequire(playwrightPath)('playwright');
const axeSource = readFileSync(path.join(path.dirname(axePath), 'axe.min.js'), 'utf8');
const here = new URL('.', import.meta.url).pathname;
const pageUrl = 'file://' + (process.env.PS_PAGE ? path.resolve(process.env.PS_PAGE)
    : path.resolve(here, '..', 'index.html'));
const BASELINE_PATH = path.join(here, 'mobile-baseline.json');
const WRITE = process.env.PS_MOBILE_WRITE_BASELINE === '1';
const CONTROL = process.env.PS_EXPECT_BROKEN === '1';
const CONTROL_TH = process.env.PS_EXPECT_BROKEN === 'touchhost';
const OUT = process.env.PS_MOBILE_OUT || '';
if (OUT) mkdirSync(OUT, { recursive: true });

// The profiles. A phone both ways up, a second phone width (most Android
// phones are a little wider than an iPhone), and a small tablet both ways
// up. The tablet in portrait is 768 px wide, eight more than the app's
// drawer breakpoint, so it gets the full three-column desktop frame.
const ALL_DEVICES = [
    { id: 'phone', profile: 'iPhone 13', axe: true },
    { id: 'phone-landscape', profile: 'iPhone 13 landscape', axe: false },
    { id: 'android', profile: 'Pixel 7', axe: false },
    { id: 'tablet', profile: 'iPad Mini', axe: true },
    { id: 'tablet-landscape', profile: 'iPad Mini landscape', axe: false }
];
const want = (process.env.PS_MOBILE_DEVICES || '').split(',').map(s => s.trim()).filter(Boolean);
const DEVICES = (CONTROL || CONTROL_TH) ? ALL_DEVICES.slice(0, 1)
    : (want.length ? ALL_DEVICES.filter(d => want.includes(d.id)) : ALL_DEVICES);

// ---------------------------------------------------------------- verdicts
const verdicts = [];   // { id, ok, msg, kind }
let fails = 0;
function check(id, cond, msg, kind) {
    verdicts.push({ id, ok: !!cond, msg, kind: kind || 'hard' });
    if (!CONTROL) console.log((cond ? '  ok  ' : ' FAIL ') + msg);
    if (!cond) fails++;
}
const notes = [];      // improvements worth tightening the baseline for
const note = m => { notes.push(m); if (!CONTROL) console.log('  note  ' + m); };

// ------------------------------------------------- the in-page measurement
// One function, run inside the page, returns everything a screen is judged
// on. Sizes are what a finger meets: client pixels after every CSS zoom.
function measureScreen(opts) {
    const vw = window.innerWidth, vh = window.innerHeight, de = document.documentElement;
    const zoomOf = el => (typeof el.currentCSSZoom === 'number' && el.currentCSSZoom > 0) ? el.currentCSSZoom : 1;
    const onScreen = el => {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return null;
        if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) return null;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return null;
        return r;
    };
    // Reachable = what is on top at the element's centre is the element (or
    // part of it). A control under a dialog, a scrim or a drawer is not
    // something a finger can press, so it is not counted.
    const reachable = (el, r) => {
        const cx = Math.min(vw - 1, Math.max(0, r.left + r.width / 2));
        const cy = Math.min(vh - 1, Math.max(0, r.top + r.height / 2));
        const hit = document.elementFromPoint(cx, cy);
        return !!hit && (hit === el || el.contains(hit) || hit.contains(el));
    };
    const labelOf = el => {
        let s = el.getAttribute('aria-label') || el.getAttribute('title') || '';
        if (!s) s = (el.innerText || el.textContent || '');
        s = String(s).replace(/\s+/g, ' ').trim().slice(0, 40);
        if (!s) s = el.id ? '#' + el.id : ('.' + String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).split(/\s+/)[0]);
        return el.tagName.toLowerCase() + ': ' + s;
    };

    // ---- touch targets
    const sel = 'button, [role="button"], [role="tab"], [role="menuitem"], [role="menuitemradio"], ' +
        '[role="menuitemcheckbox"], [role="option"], [role="switch"], [role="checkbox"], [role="radio"], ' +
        'input:not([type="hidden"]), select, textarea, a[href], summary, [tabindex="0"]';
    const targets = [];
    for (const el of document.querySelectorAll(sel)) {
        if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
        if (el.tagName.toLowerCase() === 'svg') continue;          // the chart itself
        if (el.tagName.toLowerCase() === 'a' && getComputedStyle(el).display === 'inline') continue; // a link in a sentence
        const r = onScreen(el); if (!r) continue;
        if (!reachable(el, r)) continue;
        targets.push({ el, r, min: Math.min(r.width, r.height), cx: r.left + r.width / 2, cy: r.top + r.height / 2 });
    }
    // The 24 px floor with its spacing exception (WCAG 2.5.8): an undersized
    // target passes when a 24 px circle on its centre touches no other
    // target and no other undersized target's circle.
    const under24 = [], spaced = [];
    let under44 = 0;
    for (const t of targets) {
        if (t.min < 43.5) under44++;
        if (t.min >= 23.5) continue;
        let crowded = false;
        for (const o of targets) {
            if (o === t || o.el.contains(t.el) || t.el.contains(o.el)) continue;
            if (o.min < 23.5) {
                if (Math.hypot(o.cx - t.cx, o.cy - t.cy) < 24) { crowded = true; break; }
            } else {
                const nx = Math.max(o.r.left, Math.min(t.cx, o.r.right)), ny = Math.max(o.r.top, Math.min(t.cy, o.r.bottom));
                if (Math.hypot(nx - t.cx, ny - t.cy) < 12) { crowded = true; break; }
            }
        }
        (crowded ? under24 : spaced).push(labelOf(t.el) + ' [' + Math.round(t.r.width) + 'x' + Math.round(t.r.height) + ']');
    }

    // ---- text sizes (HTML chrome; the chart's own text is measured below)
    const chartSvg = (() => {
        let best = null, area = 0;
        for (const s of document.querySelectorAll('.graphbuilder2-host svg')) {
            const b = s.getBoundingClientRect(); if (b.width * b.height > area) { area = b.width * b.height; best = s; }
        }
        return best;
    })();
    let tinyText = 0, minText = 99; const tinySample = [];
    const seen = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.nodeValue || !n.nodeValue.trim()) continue;
        const p = n.parentElement; if (!p || seen.has(p)) continue;
        if (p.closest('script, style, svg, .ps-visually-hidden')) continue;
        const r = onScreen(p); if (!r) continue;
        if (!reachable(p, r)) continue;
        seen.add(p);
        const px = parseFloat(getComputedStyle(p).fontSize) * zoomOf(p);
        if (px < minText) minText = px;
        if (px < 11.5) { tinyText++; if (tinySample.length < 8) tinySample.push(n.nodeValue.trim().slice(0, 28) + ' [' + px.toFixed(1) + ']'); }
    }

    // ---- form fields iOS zooms into (anything typed into under 16 px)
    const zoomInputs = [];
    for (const el of document.querySelectorAll('input, select, textarea')) {
        const ty = (el.getAttribute('type') || '').toLowerCase();
        if (['hidden', 'checkbox', 'radio', 'range', 'color', 'button', 'submit', 'file', 'image', 'reset'].includes(ty)) continue;
        if (el.disabled) continue;
        const r = onScreen(el); if (!r || !reachable(el, r)) continue;
        const px = parseFloat(getComputedStyle(el).fontSize) * zoomOf(el);
        if (px < 15.5) zoomInputs.push(labelOf(el) + ' [' + px.toFixed(1) + ']');
    }

    const out = {
        vw, vh, scrollW: Math.max(de.scrollWidth, vw),
        // Content wider than a phone's screen does not give it a scrollbar: the
        // browser zooms the whole page out to fit, so innerWidth itself grows
        // past the device width and scrollWidth still equals it. Judge both
        // against the width the device really has.
        overflowX: Math.max(de.scrollWidth, vw) > ((opts && opts.deviceW) || vw) + 1,
        targets: targets.length, under24: under24.sort(), under24Spaced: spaced.length, under44,
        tinyText, minText: Math.round(minText * 10) / 10, tinySample, zoomInputs: zoomInputs.sort()
    };

    // ---- the touch text floor: a size it lifted renders at the floor. One
    //      standing well above it was measured under a zoom that has since
    //      changed (the empty-chart card at double size, Nov 2026).
    let liftedOver = 0; const liftedSample = [];
    for (const n of document.querySelectorAll('[data-ps-tf]')) {
        const b = n.getBoundingClientRect(); if (b.width < 1 || b.height < 1) continue;
        const px = parseFloat(getComputedStyle(n).fontSize) * (n.currentCSSZoom || 1);
        if (px > 14.5) { liftedOver++; if (liftedSample.length < 4) liftedSample.push((n.textContent || '').trim().slice(0, 24) + ' [' + px.toFixed(1) + ']'); }
    }
    out.liftedOver = liftedOver; out.liftedSample = liftedSample;
    // ---- a tooltip belongs to a hovering pointer or to keyboard focus. One
    //      standing after a tap stays until the next tap somewhere else.
    const tip = document.getElementById('ps-tip');
    out.tipOpen = !!(tip && tip.hasAttribute('data-open') && tip.getBoundingClientRect().height > 2) ? (tip.textContent || '').trim().slice(0, 40) : '';
    // ---- the start dialog, while it is up: a card that runs past the
    //      dialog's edge is cut off there (the dialog scrolls, the page does
    //      not, so the page-width check cannot see it)
    const wc = document.querySelector('.ps-welcome-card');
    if (wc && wc.getBoundingClientRect().height > 20 && getComputedStyle(wc).visibility !== 'hidden') {
        const cr = wc.getBoundingClientRect(); let past = 0, cards = 0;
        for (const c of wc.querySelectorAll('.ps-launch-action, .ps-template-card, .ps-recent-item')) {
            const b = c.getBoundingClientRect(); if (b.width < 1 || b.height < 1) continue;
            cards++; if (b.right > cr.right + 1 || b.left < cr.left - 1) past++;
        }
        out.welcome = { cards, past, overflow: Math.max(0, wc.scrollWidth - wc.clientWidth) };
    }
    // ---- the chart, when this screen shows one
    if (opts && opts.chart && chartSvg) {
        const r = chartSvg.getBoundingClientRect();
        const natural = (chartSvg.width && chartSvg.width.baseVal && chartSvg.width.baseVal.value) || r.width;
        let texts = 0, minChart = 99, under9 = 0;
        for (const t of chartSvg.querySelectorAll('text')) {
            if (!(t.textContent || '').trim()) continue;
            const b = t.getBoundingClientRect(); if (b.width < 1 || b.height < 1) continue;
            const m = t.getScreenCTM(); if (!m) continue;
            const px = parseFloat(getComputedStyle(t).fontSize) * Math.hypot(m.a, m.b);
            texts++; if (px < minChart) minChart = px; if (px < 9) under9++;
        }
        // In view = on top at the sample point. Counts scrolling, clipping
        // and anything laid over the chart (a sheet, a drawer) alike.
        let vis = 0, all = 0;
        for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) {
            const x = r.left + (i + 0.5) * r.width / 12, y = r.top + (j + 0.5) * r.height / 12; all++;
            if (x < 0 || y < 0 || x >= vw || y >= vh) continue;
            const hit = document.elementFromPoint(x, y);
            if (hit && (hit === chartSvg || chartSvg.contains(hit) || (hit.closest && hit.closest('.graphbuilder2-host') && !hit.closest('.gb2-panel')))) vis++;
        }
        out.chart = {
            w: Math.round(r.width), h: Math.round(r.height), scale: Math.round(r.width / natural * 100) / 100,
            visible: Math.round(vis / all * 100) / 100, texts, textMin: Math.round(minChart * 10) / 10, textUnder9: under9,
            touchAction: getComputedStyle(chartSvg).touchAction
        };
    }
    // ---- the editor panel, when this screen has it open
    if (opts && opts.editor) {
        const p = document.querySelector('.gb2-panel');
        const shown = !!p && getComputedStyle(p).display !== 'none' && p.getBoundingClientRect().height > 20;
        out.editor = { open: shown && p.querySelectorAll('[data-field]').length > 0 };
        if (shown) {
            const pb = p.getBoundingClientRect();
            let vis = 0, all = 0;
            for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
                const x = pb.left + (i + 0.5) * pb.width / 10, y = pb.top + (j + 0.5) * pb.height / 10; all++;
                if (x < 0 || y < 0 || x >= vw || y >= vh) continue;
                const hit = document.elementFromPoint(x, y);
                if (hit && (hit === p || p.contains(hit))) vis++;
            }
            const tabs = [...p.querySelectorAll('[data-gb2-promoted-tabbar="1"] > button, [data-bs-tab]')];
            const clipped = tabs.filter(t => { const b = t.getBoundingClientRect(); return b.width > 0 && (b.right > Math.min(pb.right, vw) + 1 || b.left < pb.left - 1); }).length;
            out.editor.visible = Math.round(vis / all * 100) / 100;
            out.editor.h = Math.round(pb.height); out.editor.w = Math.round(pb.width);
            // The height of the editor inside the pane it scrolls in: what a
            // person sees of it without scrolling, from its header down.
            const pane = document.getElementById('ps-main-workspace');
            const pr2 = pane ? pane.getBoundingClientRect() : { top: 0, bottom: vh };
            out.editor.visiblePx = Math.round(Math.max(0, Math.min(pb.bottom, pr2.bottom, vh) - Math.max(pb.top, pr2.top, 0)));
            out.editor.headerInView = pb.top >= Math.max(pr2.top, 0) - 1 && pb.top < Math.min(pr2.bottom, vh) - 40;
            const hue = document.querySelector('[data-role="color-picker"] [data-role="hue"]');
            const lig = document.querySelector('[data-role="color-picker"] [data-role="lightness"]');
            if (hue && lig) {
                const hb = hue.getBoundingClientRect(), lb = lig.getBoundingClientRect();
                out.editor.strips = { hue: Math.round(hb.height), lightness: Math.round(lb.height), gap: Math.round(lb.top - hb.bottom),
                    lightnessTouchAction: getComputedStyle(lig).touchAction };
            }
            out.editor.tabs = tabs.length; out.editor.clippedTabs = clipped;
        }
    }
    return out;
}

async function runAxe(page) {
    const has = await page.evaluate(() => typeof window.axe !== 'undefined');
    if (!has) await page.addScriptTag({ content: axeSource });
    return page.evaluate(async () => {
        const res = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
        return res.violations.map(v => v.id + ' (' + v.nodes.length + ')').sort();
    });
}

// ------------------------------------------------------------ touch helpers
async function touchDrag(client, page, x0, y0, dx, dy, steps = 12) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
    for (let i = 1; i <= steps; i++) {
        await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + dx * i / steps, y: y0 + dy * i / steps }] });
        await page.waitForTimeout(16);
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function longPress(client, page, x, y, ms = 900) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await page.waitForTimeout(ms);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const scrollState = page => page.evaluate(() => {
    const pane = document.querySelector('.ps-main-workspace');
    return { win: Math.round(window.scrollY), pane: pane ? Math.round(pane.scrollTop) : 0 };
});
const centreOf = (page, js) => page.evaluate(js);
const barCentre = page => page.evaluate(() => {
    const svg = [...document.querySelectorAll('.graphbuilder2-host svg')].sort((a, b) => {
        const A = a.getBoundingClientRect(), B = b.getBoundingClientRect(); return B.width * B.height - A.width * A.height; })[0];
    const bar = svg && svg.querySelector('[data-bar-cat]'); if (!bar) return null;
    bar.scrollIntoView({ block: 'center' });
    const r = bar.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});

// ------------------------------------------------------------- one device
async function runDevice(browser, dev) {
    const result = { screens: {}, touch: {} };
    const profile = devices[dev.profile];
    const ctx = await browser.newContext({ ...profile });
    const page = await ctx.newPage();
    const client = await ctx.newCDPSession(page);
    const errors = [];
    page.on('pageerror', e => errors.push(String(e).slice(0, 160)));
    page.on('filechooser', () => {});
    if (CONTROL_TH) await page.addInitScript(() => {
        // The engine's half of the touch rules is gated on this payload key.
        // Withheld at the render boundary, the engine is exactly as it was
        // before the guard, with the new shell still in place.
        let gb;
        Object.defineProperty(window, 'GraphBuilder2', { configurable: true, get() { return gb; }, set(v) {
            gb = v;
            if (v && typeof v.render === 'function' && !v.__mobNoTouchHost) {
                const r = v.render;
                v.render = function (id, payload) { try { if (payload) delete payload.touchHost; } catch (e) {} return r.apply(this, arguments); };
                v.__mobNoTouchHost = true;
            }
        } });
    });
    const tag = dev.id + ': ';
    const narrow = profile.viewport.width <= 760;
    // A toast is on screen for a few seconds after an action. Measured
    // mid-flight it lands in whichever screen it happens to overlap, so
    // every measurement waits for the toast host to go quiet first.
    const settleToasts = () => page.waitForFunction(() => {
        const t = document.getElementById('ps-toast'); return !t || !t.classList.contains('ps-toast-show');
    }, null, { timeout: 12000 }).catch(() => {});
    async function screen(name, opts) {
        await settleToasts();
        const m = await page.evaluate(measureScreen, { ...(opts || {}), deviceW: profile.viewport.width });
        if (dev.axe) m.axe = await runAxe(page);
        result.screens[name] = m;
        if (OUT) await page.screenshot({ path: path.join(OUT, dev.id + '-' + name + '.png'), timeout: 8000 }).catch(() => {});
        check(dev.id + '/' + name + '/overflowX', !m.overflowX,
            tag + name + ': nothing is wider than the screen (' + m.scrollW + ' in ' + profile.viewport.width + ')');
        if (!CONTROL) check(dev.id + '/' + name + '/floorHolds', m.liftedOver === 0,
            tag + name + ': no text the touch floor lifted stands above the floor (' + m.liftedOver + (m.liftedSample.length ? ': ' + m.liftedSample.join(', ') : '') + ')');
        delete m.liftedSample;
        if (!CONTROL) check(dev.id + '/' + name + '/noTip', !m.tipOpen,
            tag + name + ': no tooltip is left standing after the taps that led here' + (m.tipOpen ? ' ("' + m.tipOpen + '")' : ''));
        delete m.tipOpen;
        return m;
    }
    // Reach a workspace the way a finger does: through the navigator, which
    // is a drawer behind a button on a narrow screen and a rail otherwise.
    async function goWorkspace(ws) {
        if (narrow) { await page.locator('#ps-narrow-nav').tap(); await page.waitForTimeout(350); }
        await page.locator('.ps-workspace-switcher [data-ps-workspace="' + ws + '"]').tap();
        await page.waitForTimeout(900);
        return page.evaluate(() => ({ ws: window.PS_SHELL.workspace(),
            drawerOpen: !!document.querySelector('.ps-app-body.ps-narrow-nav-open') }));
    }

    // The control's regressions, each in place only around the measurement
    // it is aimed at: content wider than the screen makes a phone zoom the
    // whole page out, after which no tap lands where it was aimed.
    const ctl = css => page.evaluate((c) => { const st = document.createElement('style'); st.id = 'ps-mobile-control'; st.textContent = c; document.head.appendChild(st); }, css);
    const unctl = () => page.evaluate(() => { for (const id of ['ps-mobile-control', 'ps-mobile-control-wide']) { const n = document.getElementById(id); if (n) n.remove(); } });

    await page.goto(pageUrl); await page.waitForTimeout(900);

    // 1. the start centre, as a first visit meets it
    check(dev.id + '/start/welcome', await page.locator('#ps-welcome').isVisible(), tag + 'the start centre opens on a first visit');
    check(dev.id + '/touchmode', await page.evaluate(() => document.body.classList.contains('ps-touch')),
        tag + 'the touch density is on (the primary pointer is a finger)');
    if (CONTROL) await page.evaluate(() => { const d = document.createElement('div'); d.id = 'ps-mobile-control-wide'; d.style.cssText = 'position:absolute;left:0;top:0;width:900px;height:1px'; document.body.appendChild(d); });
    const m1 = await screen('start');
    if (CONTROL) { await unctl(); await page.waitForTimeout(200); }
    // Found in real Safari, Nov 2026: the dialog's one column took its width
    // from the longest one-line description and the cards ran off its edge.
    if (!CONTROL) check(dev.id + '/start/cards', !!m1.welcome && m1.welcome.cards >= 4 && m1.welcome.past === 0 && m1.welcome.overflow <= 1,
        tag + 'start: every start card stays inside the dialog (' + (m1.welcome ? m1.welcome.past + ' of ' + m1.welcome.cards + ' past its edge, ' + m1.welcome.overflow + ' px of sideways scroll' : 'no dialog') + ')');

    // 2. the chart workspace with the example loaded, by tap
    await page.locator('#ps-welcome-sample').tap(); await page.waitForTimeout(2400);
    if (CONTROL) { await ctl('.ps-commandbar{gap:2px !important;justify-content:flex-start !important}' +
        '.ps-commandbar button{width:14px !important;height:14px !important;min-width:0 !important;min-height:0 !important;padding:0 !important;margin:0 !important;overflow:hidden !important;flex:0 0 14px !important}'); await page.waitForTimeout(200); }
    const m2 = await screen('chart', { chart: true });
    if (CONTROL) { await unctl(); await page.waitForTimeout(200); }
    check(dev.id + '/chart/drawn', !!m2.chart && m2.chart.w > 100 && m2.chart.w <= m2.vw,
        tag + 'the example chart draws inside the screen width (' + (m2.chart ? m2.chart.w : 0) + ' of ' + m2.vw + ')');
    // the first-run coach mark answers to a tap
    if (await page.locator('#ps-coach-ok').isVisible().catch(() => false)) {
        await page.locator('#ps-coach-ok').tap(); await page.waitForTimeout(400);
        result.touch.coachDismissedByTap = !(await page.locator('#ps-coach-ok').isVisible().catch(() => false));
    }

    // 3. tap a bar: its editor opens
    if (CONTROL) await ctl('#psroot .gb2-panel{display:none !important}');
    let b = await barCentre(page); await page.waitForTimeout(200); b = await barCentre(page);
    if (b) { await page.touchscreen.tap(b.x, b.y); await page.waitForTimeout(1100); }
    const m3 = await screen('editor', { chart: true, editor: true });
    result.touch.barTapOpensEditor = !!(m3.editor && m3.editor.open);
    check(dev.id + '/editor/open', result.touch.barTapOpensEditor, tag + 'a tap on a bar opens its editor');
    if (!CONTROL) {
        // Open is not the same as seen. On a short window (a phone held
        // sideways) the editor used to open entirely below the fold.
        const e3 = m3.editor || {};
        check(dev.id + '/editor/seen', e3.visiblePx >= 90,
            tag + 'the editor that a tap opens is in view, header and first row at least (' + e3.visiblePx + ' px of ' + e3.h + ')');
        // A finger cannot tell an 11 px hue strip from the lightness strip
        // 5 px under it.
        if (e3.strips) check(dev.id + '/editor/strips', e3.strips.hue >= 24 && e3.strips.lightness >= 24 && e3.strips.gap >= 8 && e3.strips.lightnessTouchAction === 'none',
            tag + 'the hue and lightness strips are finger-sized and each is its own drag surface (' + e3.strips.hue + ' and ' + e3.strips.lightness + ' px tall, ' + e3.strips.gap + ' px apart)');
        else note(tag + 'no colour picker was docked on this screen, so its strips went unmeasured');
    }
    // The control's three injected regressions are all judged by here, and
    // the squeezed buttons and hidden panel make the later steps untappable.
    if (CONTROL) { await ctx.close(); return result; }

    // 3b. the text floor follows the zoom. A piece of interface text added
    //     inside the chart host while the view is at 50% is lifted to twice
    //     its size to read as 13px; back at 100% it must read as 13px still,
    //     not 26.
    const tf = await page.evaluate(async () => {
        const sel = document.getElementById('ps-chart-zoom'), host = document.getElementById('psroot');
        if (!sel || !host) return null;
        const wait = ms => new Promise(r => setTimeout(r, ms));
        const set = v => { sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); };
        const before = sel.value;
        set('0.5'); await wait(300);
        const probe = document.createElement('p'); probe.style.cssText = 'font-size:11px;margin:0;position:absolute;left:0;top:0';
        probe.textContent = 'text floor probe'; host.appendChild(probe); await wait(150);
        const eff = () => Math.round(parseFloat(getComputedStyle(probe).fontSize) * (probe.currentCSSZoom || 1) * 10) / 10;
        const small = eff(), smallZoom = probe.currentCSSZoom;
        set('1'); await wait(350);
        const back = eff(), backZoom = probe.currentCSSZoom;
        probe.remove(); set(before); await wait(300);
        return { small, smallZoom, back, backZoom };
    });
    if (tf) check(dev.id + '/floor/zoom', tf.smallZoom < 0.6 && Math.abs(tf.small - 13) < 0.8 && Math.abs(tf.back - 13) < 0.8,
        tag + 'text lifted to the floor at 50% zoom still reads at the floor back at 100% (' + tf.small + ' px at zoom ' + tf.smallZoom + ', then ' + tf.back + ' px at zoom ' + tf.backZoom + ')');
    else note(tag + 'no chart zoom control on this screen, so the floor-follows-zoom case did not run');

    // 4. the touch rules on the chart surface (mobile step 1). Each case
    //    starts from a closed editor, so what it reports is its own doing.
    await page.evaluate(() => {
        window.__mobCancel = 0;
        window.addEventListener('pointercancel', e => { if (e.isTrusted) window.__mobCancel++; }, true);
    });
    const closeEditor = async () => {
        await page.keyboard.press('Escape'); await page.waitForTimeout(200);
        await page.evaluate(() => { try { if (window.__gb2_inspectorClear) window.__gb2_inspectorClear(); } catch (e) {} });
        await page.waitForTimeout(300);
    };
    const editorOpen = () => page.evaluate(() => { const p = document.querySelector('.gb2-panel'); return !!p && getComputedStyle(p).display !== 'none' && p.getBoundingClientRect().height > 20 && p.querySelectorAll('[data-field]').length > 0; });
    const menuOpen = () => page.evaluate(() => { const m = document.getElementById('ps-contextmenu'); return !!m && getComputedStyle(m).display !== 'none' && m.getBoundingClientRect().height > 20; });
    const barOrder = () => page.evaluate(() => [...document.querySelectorAll('.graphbuilder2-host path[data-bar-cat], .graphbuilder2-host rect[data-bar-cat]')]
        .filter(n => n.getBoundingClientRect().height > 30).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
        .map(n => n.getAttribute('data-bar-cat')).filter((v, i, a) => a.indexOf(v) === i).join('|'));
    // the BODY of the last bar (a tap aimed at a bar lands on its fill)
    const barBody = async () => {
        const f = () => page.evaluate(() => {
            const bars = [...document.querySelectorAll('.graphbuilder2-host path[data-bar-cat], .graphbuilder2-host rect[data-bar-cat]')]
                .filter(n => n.getBoundingClientRect().height > 30).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
            if (!bars.length) return null;
            const el = bars[bars.length - 1]; el.scrollIntoView({ block: 'center' });
            const r = el.getBoundingClientRect(), first = bars[0].getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height * 0.6, firstX: first.left + first.width / 2 };
        });
        await f(); await page.waitForTimeout(220); return f();
    };
    const titleAt = async () => {
        const f = () => page.evaluate(() => {
            const svg = [...document.querySelectorAll('.graphbuilder2-host svg')].sort((a, b) => {
                const A = a.getBoundingClientRect(), B = b.getBoundingClientRect(); return B.width * B.height - A.width * A.height; })[0];
            const want = String((window.PS_SHELL.buildPayload() || {}).yLabel || '').trim();
            const t = [...svg.querySelectorAll('text')].find(n => (n.textContent || '').trim() === want);
            if (!t) return null; t.scrollIntoView({ block: 'center' });
            const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        });
        await f(); await page.waitForTimeout(220); return f();
    };
    await closeEditor();

    // 4a. a quick swipe that starts on a bar is a scroll: it opens nothing
    //     and moves nothing
    {
        const o0 = await barOrder();
        let bb = await barBody();
        if (bb) { await touchDrag(client, page, bb.x, bb.y, -6, -90); await page.waitForTimeout(700); }
        const opened1 = await editorOpen();
        bb = await barBody();
        if (bb) { await touchDrag(client, page, bb.x, bb.y, -130, 4); await page.waitForTimeout(700); }
        const opened2 = await editorOpen();
        result.touch.swipeLeavesChartAlone = !!bb && !opened1 && !opened2 && (await barOrder()) === o0;
        await closeEditor();
    }
    // 4b. a tap whose finger wobbles (8 px across, 6 down) is still a tap
    {
        const bb = await barBody();
        if (bb) { await touchDrag(client, page, bb.x, bb.y, 8, 6, 2); await page.waitForTimeout(1000); }
        result.touch.wobblyTapOpensEditor = !!bb && await editorOpen();
    }
    // 4c. the colour square answers a finger dragged across it
    {
        result.touch.pickerDragWorks = false;
        const sv = await page.evaluate(() => {
            const el = document.querySelector('[data-role="color-picker"] [data-role="sv"]'); if (!el) return null;
            el.scrollIntoView({ block: 'center' }); return true;
        });
        if (sv) {
            await page.waitForTimeout(250);
            const g = await page.evaluate(() => {
                const el = document.querySelector('[data-role="color-picker"] [data-role="sv"]'); const r = el.getBoundingClientRect();
                const hex = document.querySelector('[data-role="color-picker"] [data-role="hex"]');
                return { x: r.left, y: r.top, w: r.width, h: r.height, hex: hex ? hex.value : '', shown: r.width > 20 && r.height > 20 };
            });
            if (g.shown) {
                await page.evaluate(() => { window.__mobCancel = 0; });
                await touchDrag(client, page, g.x + g.w * 0.25, g.y + g.h * 0.3, g.w * 0.5, g.h * 0.4);
                await page.waitForTimeout(500);
                const after = await page.evaluate(() => { const hex = document.querySelector('[data-role="color-picker"] [data-role="hex"]'); return { hex: hex ? hex.value : '', cancel: window.__mobCancel }; });
                result.touch.pickerDragWorks = !!after.hex && after.hex !== g.hex && after.cancel === 0;
            }
        }
        await closeEditor();
    }
    // 4d. touch and hold, then drag: an axis title follows the finger
    {
        result.touch.holdDragMovesLabel = false;
        const t0 = await titleAt();
        if (t0) {
            const s0 = await scrollState(page);
            await page.evaluate(() => { window.__mobCancel = 0; });
            await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: t0.x, y: t0.y }] });
            await page.waitForTimeout(420);
            result.touch.holdShowsCue = await page.evaluate(() => { const c = document.getElementById('ps-touch-cue'); return !!c && !c.hidden; });
            for (let i = 1; i <= 12; i++) { await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: t0.x + 60 * i / 12, y: t0.y + 40 * i / 12 }] }); await page.waitForTimeout(16); }
            await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            await page.waitForTimeout(800);
            const t1 = await page.evaluate(() => {
                const svg = [...document.querySelectorAll('.graphbuilder2-host svg')].sort((a, b) => {
                    const A = a.getBoundingClientRect(), B = b.getBoundingClientRect(); return B.width * B.height - A.width * A.height; })[0];
                const want = String((window.PS_SHELL.buildPayload() || {}).yLabel || '').trim();
                const t = [...svg.querySelectorAll('text')].find(n => (n.textContent || '').trim() === want);
                if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, cancel: window.__mobCancel };
            });
            const s1 = await scrollState(page);
            const pan = (s1.win - s0.win) + (s1.pane - s0.pane);
            // the label has to come most of the way with the finger, and the
            // browser must not have taken the touch away mid-drag
            result.touch.holdDragMovesLabel = !!t1 && t1.cancel === 0 &&
                Math.hypot(t1.x - t0.x, (t1.y - t0.y) + pan) >= 0.6 * Math.hypot(60, 40);
        }
        await closeEditor();
    }
    // 4e. touch and hold, then drag: the last bar goes to the front
    {
        result.touch.holdDragReordersBars = false;
        const o0 = await barOrder(); const bb = await barBody();
        if (bb && o0.split('|').length >= 2) {
            await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bb.x, y: bb.y }] });
            await page.waitForTimeout(420);
            for (let i = 1; i <= 14; i++) { await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bb.x + (bb.firstX - 20 - bb.x) * i / 14, y: bb.y }] }); await page.waitForTimeout(16); }
            await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            await page.waitForTimeout(900);
            const o1 = await barOrder();
            result.touch.holdDragReordersBars = o1 !== o0 && o1.split('|')[0] === o0.split('|').slice(-1)[0];
        }
        await closeEditor();
    }
    // 5. touch and hold still: the part's menu opens (the app's own
    //    long-press; iOS never sends the browser's menu event), and the
    //    finger lifting neither closes it nor selects the part under it
    {
        const bb = await barBody();
        if (bb) { await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bb.x, y: bb.y }] }); await page.waitForTimeout(950); }
        result.touch.longPressOpensMenu = !!bb && await menuOpen();
        await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForTimeout(800);
        result.touch.longPressLiftIsQuiet = result.touch.longPressOpensMenu && (await menuOpen()) && !(await editorOpen());
        await page.keyboard.press('Escape'); await page.waitForTimeout(300);
        await page.evaluate(() => { const m = document.getElementById('ps-contextmenu'); if (m && getComputedStyle(m).display !== 'none') m.style.display = 'none'; });
        await closeEditor();
    }

    // 6. keep the chart to the Notebook (the app's own keep, as the menu calls it)
    await page.evaluate(() => { window.PS_SHELL.setWorkspace('chart'); }); await page.waitForTimeout(500);
    await page.evaluate(() => window.PS_SHELL.pinChartForTest()); await page.waitForTimeout(1000);

    // 7. the Data workspace, reached by touch
    const toData = await goWorkspace('data');
    check(dev.id + '/data/reached', toData.ws === 'data' && !toData.drawerOpen,
        tag + 'the Data workspace is reachable by touch' + (narrow ? ' through the navigator drawer, which closes behind it' : ''));
    await screen('data');
    const cell = await page.evaluate(() => {
        const c = [...document.querySelectorAll('[role="gridcell"]')].find(n => { const r = n.getBoundingClientRect(); return r.width > 10 && r.top > 0 && r.bottom < window.innerHeight && r.left >= 0 && r.right <= window.innerWidth; });
        if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (cell) { await page.touchscreen.tap(cell.x, cell.y); await page.waitForTimeout(400); }
    result.touch.cellTapSelects = await page.evaluate(() => {
        try { return String(window.PS_SHELL.selectionText() || '').length > 0; } catch (e) { return false; }
    });

    // 8. the Notebook: the kept chart is there, selects by tap, takes a note
    const toNb = await goWorkspace('pinboard');
    check(dev.id + '/notebook/reached', toNb.ws === 'pinboard', tag + 'the Notebook is reachable by touch');
    const mNb = await screen('notebook');
    const pins = await page.evaluate(() => document.querySelectorAll('.ps-pinpage').length);
    check(dev.id + '/notebook/kept', pins >= 1, tag + 'the kept chart is on a Notebook page (' + pins + ')');
    const pg = await page.evaluate(() => { const p = document.querySelector('.ps-pinpage'); if (!p) return null; p.scrollIntoView({ block: 'center' }); const r = p.getBoundingClientRect(); return { x: r.left + r.width / 2, y: Math.max(r.top + 30, Math.min(r.top + r.height / 2, window.innerHeight - 40)) }; });
    if (pg) { await page.waitForTimeout(250); await page.touchscreen.tap(pg.x, pg.y); await page.waitForTimeout(500); }
    result.touch.notebookTapSelects = await page.evaluate(() => !!document.querySelector('.ps-pinpage.ps-pinpage-sel'));
    // the note field lives in the inspector, a drawer on a narrow screen
    result.touch.notebookNoteEdits = false;
    try {
        if (narrow && await page.locator('#ps-narrow-inspector').isVisible()) { await page.locator('#ps-narrow-inspector').tap(); await page.waitForTimeout(450); }
        const noteBox = page.locator('#ps-pininsp-note');
        if (await noteBox.isVisible()) {
            await noteBox.tap({ timeout: 2500 }); await page.keyboard.type('seen on a phone', { delay: 2 });
            await page.evaluate(() => { const n = document.getElementById('ps-pininsp-note'); if (n) n.blur(); });
            await page.waitForTimeout(400);
            result.touch.notebookNoteEdits = await page.evaluate(() =>
                JSON.stringify(window.PS_SHELL.project.pinboards || []).indexOf('seen on a phone') !== -1);
        }
    } catch (e) { /* recorded as false */ }
    await page.evaluate(() => { const s = document.getElementById('ps-narrow-scrim'); if (s && !s.hidden) s.click(); });
    await page.waitForTimeout(300);

    // 9. Layouts: a new layout, the chart placed by tap, then moved by touch
    await page.evaluate(() => { window.PS_SHELL.addLayout(); }); await page.waitForTimeout(1200);
    const mLay0 = await page.evaluate(() => window.PS_SHELL.workspace());
    check(dev.id + '/layout/reached', mLay0 === 'layout', tag + 'a new layout opens the Layouts workspace');
    await page.locator('#ps-laddchart').tap(); await page.waitForTimeout(500);
    const pick = page.locator('button[data-chart]').first();
    if (await pick.isVisible().catch(() => false)) { await pick.tap(); await page.waitForTimeout(1200); }
    const items = await page.evaluate(() => document.querySelectorAll('#ps-lcanvas .ps-litem').length);
    check(dev.id + '/layout/placed', items >= 1, tag + 'a chart is placed on the layout page by tap (' + items + ' item' + (items === 1 ? '' : 's') + ')');
    await screen('layout');
    const it = await page.evaluate(() => { const e = document.querySelector('#ps-lcanvas .ps-litem'); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; });
    result.touch.layoutSwipeLeavesItem = false; result.touch.layoutItemDragMoves = false;
    if (it) {
        await page.waitForTimeout(250);
        const where = () => page.evaluate(() => { const e = document.querySelector('#ps-lcanvas .ps-litem'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
        // a quick swipe across an item scrolls or does nothing: the item stays put
        const a0 = await where(); let s0 = await scrollState(page);
        await touchDrag(client, page, a0.x + a0.w / 2, a0.y + a0.h / 2, 30, 24);
        await page.waitForTimeout(600);
        let a1 = await where(), s1 = await scrollState(page);
        let pan = (s1.win - s0.win) + (s1.pane - s0.pane);
        result.touch.layoutSwipeLeavesItem = !!a1 && Math.hypot(a1.x - a0.x, (a1.y - a0.y) + pan) < 2;
        // touch and hold, then drag: the item comes with the finger
        const b0 = await where(); s0 = await scrollState(page);
        await page.evaluate(() => { window.__mobCancel = 0; });
        await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b0.x + b0.w / 2, y: b0.y + b0.h / 2 }] });
        await page.waitForTimeout(420);
        for (let i = 1; i <= 12; i++) { await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b0.x + b0.w / 2 + 30 * i / 12, y: b0.y + b0.h / 2 + 24 * i / 12 }] }); await page.waitForTimeout(16); }
        await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForTimeout(700);
        const b1 = await where(); s1 = await scrollState(page);
        pan = (s1.win - s0.win) + (s1.pane - s0.pane);
        const cancelled = await page.evaluate(() => window.__mobCancel);
        result.touch.layoutItemDragMoves = !!b1 && cancelled === 0 &&
            Math.hypot(b1.x - b0.x, (b1.y - b0.y) + pan) >= 0.6 * Math.hypot(30, 24);
    }

    // 10. back on Charts: the "+" menu while the chart is zoomed out, which
    //     is where a phone usually is (Fit was 53% for a grouped chart in the
    //     simulator). Its tiles took their width from the zoomed chart and
    //     their text from the floor, and every label ran over its tile.
    await goWorkspace('chart');
    const am = await page.evaluate(async () => {
        const wait = ms => new Promise(r => setTimeout(r, ms));
        const sel = document.getElementById('ps-chart-zoom'); const btn = document.querySelector('.graphbuilder2-host button[aria-label="Add to chart"]');
        if (!sel || !btn) return null;
        const set = v => { sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); };
        const before = sel.value; set('0.5'); await wait(350);
        btn.click(); await wait(350);
        const m = document.querySelector('[data-role="add-ann-menu"]');
        const out = { open: !!m && getComputedStyle(m).display !== 'none', tiles: 0, over: 0, small: 0, outside: 0, vw: window.innerWidth };
        if (out.open) {
            const mr = m.getBoundingClientRect();
            if (mr.left < -1 || mr.right > window.innerWidth + 1) out.outside++;
            for (const b of m.querySelectorAll('button')) {
                const r = b.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
                out.tiles++;
                if (b.scrollWidth > b.clientWidth + 1 || r.right > mr.right + 1) out.over++;
                if (r.width < 40 || r.height < 36) out.small++;
            }
        }
        btn.click(); await wait(200); set(before); await wait(350);
        return out;
    });
    if (am) check(dev.id + '/addmenu', am.open && am.tiles >= 4 && am.over === 0 && am.small === 0 && am.outside === 0,
        tag + 'the "+" menu at 50% zoom: every tile holds its label, is finger-sized and sits on the screen (' + am.tiles + ' tiles, ' + am.over + ' overflowing, ' + am.small + ' small, ' + am.outside + ' off screen)');
    // 11. a second chart, then back to the first by ONE tap on its tab, and no
    //     tooltip left over the toolbar afterwards.
    const tabsBefore = await page.locator('#ps-tabs [role="tab"]').count();
    await page.locator('.ps-tab-add').tap(); await page.waitForTimeout(500);
    const card = page.locator('#ps-analysis-grid .ps-analysis-card').first();
    if (await card.isVisible().catch(() => false)) {
        await card.tap(); await page.waitForTimeout(1500);
        const tabs = page.locator('#ps-tabs [role="tab"]');
        const made = (await tabs.count()) === tabsBefore + 1;
        await tabs.first().tap(); await page.waitForTimeout(1100);
        const st = await page.evaluate(() => { const t = document.querySelector('#ps-tabs [role="tab"]'); const tip = document.getElementById('ps-tip');
            return { first: !!t && t.getAttribute('aria-selected') === 'true', tip: !!(tip && tip.hasAttribute('data-open') && tip.getBoundingClientRect().height > 2) }; });
        result.touch.tabTapSwitches = made && st.first;
        check(dev.id + '/tabs/tip', !st.tip, tag + 'a tap on a chart tab leaves no tooltip standing over the toolbar');
    }

    check(dev.id + '/errors', errors.length === 0, tag + 'no page errors ' + errors.slice(0, 2).join(' | '));
    await ctx.close();
    return result;
}

// ---------------------------------------------------------- a mouse, still
// None of this may reach a desktop: no touch density, no lifted text, and a
// mouse drags a bar the instant it moves.
async function runDesktop(browser) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(String(e).slice(0, 160)));
    await page.addInitScript(() => { try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); } catch (e) {} });
    await page.goto(pageUrl); await page.waitForTimeout(900);
    await page.click('#ps-welcome-sample'); await page.waitForTimeout(2400);
    const st = await page.evaluate(() => ({ touch: document.body.classList.contains('ps-touch'), lifted: document.querySelectorAll('[data-ps-tf]').length,
        key: (window.PS_SHELL.buildPayload() || {}).touchHost === true }));
    check('desktop/touchmode', !st.touch, 'desktop: the touch density is off for a mouse');
    check('desktop/lifted', st.lifted === 0, 'desktop: no text size was lifted (' + st.lifted + ')');
    check('desktop/key', st.key, 'desktop: the host key rides the payload all the same (gestures are judged per touch, not per device)');
    const geo = () => page.evaluate(() => {
        const bars = [...document.querySelectorAll('.graphbuilder2-host path[data-bar-cat], .graphbuilder2-host rect[data-bar-cat]')]
            .filter(n => n.getBoundingClientRect().height > 30).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
        const r = bars[bars.length - 1].getBoundingClientRect(), f = bars[0].getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height * 0.6, firstX: f.left + f.width / 2,
            order: bars.map(n => n.getAttribute('data-bar-cat')).filter((v, i, a) => a.indexOf(v) === i).join('|') };
    });
    const g0 = await geo();
    await page.mouse.move(g0.x, g0.y); await page.mouse.down();
    for (let i = 1; i <= 14; i++) { await page.mouse.move(g0.x + (g0.firstX - 30 - g0.x) * i / 14, g0.y); await page.waitForTimeout(12); }
    await page.mouse.up(); await page.waitForTimeout(900);
    const g1 = await geo();
    check('desktop/drag', g1.order !== g0.order && g1.order.split('|')[0] === g0.order.split('|').slice(-1)[0],
        'desktop: a mouse drag reorders a bar at once, with no hold (' + g0.order + ' -> ' + g1.order + ')');
    await page.mouse.click(g1.x, g1.y); await page.waitForTimeout(900);
    check('desktop/click', await page.evaluate(() => { const p = document.querySelector('.gb2-panel'); return !!p && getComputedStyle(p).display !== 'none' && p.querySelectorAll('[data-field]').length > 0; }),
        'desktop: a mouse click on a bar opens its editor');
    check('desktop/errors', errors.length === 0, 'desktop: no page errors ' + errors.slice(0, 2).join(' | '));
    await ctx.close();
}

// ------------------------------------------------------------ the ratchet
// Lists: nothing NEW may appear. Counts: may not rise. Fractions and sizes
// that should grow: may not fall (a small tolerance for rounding).
// Booleans: a gesture that works may not stop working.
const LOWER = ['under44', 'tinyText'];
const LISTS = ['under24', 'zoomInputs', 'axe'];
const stripSize = s => String(s).replace(/\s*\[[^\]]*\]$/, '').replace(/\s*\(\d+\)$/, '');
function compare(devId, got, base) {
    for (const [name, m] of Object.entries(got.screens)) {
        const bm = (base.screens || {})[name];
        const where = devId + ' ' + name + ': ';
        if (!bm) { check(devId + '/' + name + '/baseline', false, where + 'no baseline for this screen (run with PS_MOBILE_WRITE_BASELINE=1)', 'debt'); continue; }
        for (const k of LISTS) {
            if (!(k in m)) continue;
            const old = new Set((bm[k] || []).map(stripSize));
            const now = new Set(m[k].map(stripSize));
            const fresh = [...now].filter(x => !old.has(x));
            const gone = [...old].filter(x => !now.has(x));
            check(devId + '/' + name + '/' + k, fresh.length === 0,
                where + k + ' has nothing new (' + m[k].length + ' known)' + (fresh.length ? ' NEW: ' + fresh.join('; ') : ''), 'debt');
            if (gone.length) note(where + k + ' improved, no longer present: ' + gone.join('; '));
        }
        for (const k of LOWER) {
            check(devId + '/' + name + '/' + k, m[k] <= (bm[k] ?? 0),
                where + k + ' did not rise (' + m[k] + ', baseline ' + bm[k] + ')', 'debt');
            if (m[k] < bm[k]) note(where + k + ' improved: ' + bm[k] + ' -> ' + m[k]);
        }
        if (m.chart && bm.chart) {
            for (const [k, tol] of [['visible', 0.03], ['textMin', 0.25], ['scale', 0.02]]) {
                check(devId + '/' + name + '/chart.' + k, m.chart[k] >= bm.chart[k] - tol,
                    where + 'chart ' + k + ' did not fall (' + m.chart[k] + ', baseline ' + bm.chart[k] + ')', 'debt');
                if (m.chart[k] > bm.chart[k] + tol) note(where + 'chart ' + k + ' improved: ' + bm.chart[k] + ' -> ' + m.chart[k]);
            }
            check(devId + '/' + name + '/chart.textUnder9', m.chart.textUnder9 <= bm.chart.textUnder9,
                where + 'chart text under 9 px did not rise (' + m.chart.textUnder9 + ' of ' + m.chart.texts + ', baseline ' + bm.chart.textUnder9 + ')', 'debt');
            if (m.chart.textUnder9 < bm.chart.textUnder9) note(where + 'chart text under 9 px improved: ' + bm.chart.textUnder9 + ' -> ' + m.chart.textUnder9);
        }
        if (m.editor && bm.editor && m.editor.open && bm.editor.open) {
            check(devId + '/' + name + '/editor.visible', m.editor.visible >= bm.editor.visible - 0.03,
                where + 'the open editor is as much in view as before (' + m.editor.visible + ', baseline ' + bm.editor.visible + ')', 'debt');
            if (m.editor.visible > bm.editor.visible + 0.03) note(where + 'editor in view improved: ' + bm.editor.visible + ' -> ' + m.editor.visible);
            check(devId + '/' + name + '/editor.clippedTabs', m.editor.clippedTabs <= bm.editor.clippedTabs,
                where + 'no more editor tabs are clipped than before (' + m.editor.clippedTabs + ' of ' + m.editor.tabs + ', baseline ' + bm.editor.clippedTabs + ')', 'debt');
            if (m.editor.clippedTabs < bm.editor.clippedTabs) note(where + 'clipped editor tabs improved: ' + bm.editor.clippedTabs + ' -> ' + m.editor.clippedTabs);
        }
    }
    for (const [k, v] of Object.entries(got.touch)) {
        const bv = (base.touch || {})[k];
        if (bv === undefined) { check(devId + '/touch/' + k, false, devId + ' touch: no baseline for ' + k, 'debt'); continue; }
        check(devId + '/touch/' + k, !(bv === true && v !== true), devId + ' touch: ' + k + ' ' + (v ? 'works' : 'does not work') + (bv === v ? '' : ' (baseline ' + bv + ')'), 'debt');
        if (bv === false && v === true) note(devId + ' touch: ' + k + ' now works');
    }
}

// ------------------------------------------------------------------- run
// The page is sized by the height a person can see. An emulated phone has no
// browser toolbar, so vh and dvh agree here and no measurement can tell them
// apart; real Safari counts the space under its toolbar in vh, and the whole
// status row sat under it (measured in the iPhone simulator, Nov 2026: 754
// against 714 upright, 402 against 292 sideways). So this one is read from
// the stylesheet: one definition of the visible height, and nothing sized by
// a bare vh beside it.
if (!CONTROL && !CONTROL_TH) {
    const src = readFileSync(pageUrl.replace(/^file:\/\//, ''), 'utf8');
    const css = (src.match(/<style[^>]*>[\s\S]*?<\/style>/g) || []).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
    const bare = (css.match(/[^-\w](\d+(?:\.\d+)?)vh\b/g) || []).length;
    // iPhone Safari plays a hover before a tap's click and, when that hover
    // makes something appear, stops there: the tap is spent and no click is
    // sent. No emulated browser does this, so it is read from the stylesheet:
    // a :hover rule that shows or hides something must sit inside
    // @media (hover: hover).
    const reveal = [];
    (function walk(text, guarded) {
        let i = 0;
        while (i < text.length) {
            const open = text.indexOf('{', i); if (open === -1) break;
            const prelude = text.slice(i, open).trim();
            let depth = 1, j = open + 1;
            while (j < text.length && depth > 0) { const c = text[j]; if (c === '{') depth++; else if (c === '}') depth--; j++; }
            const body = text.slice(open + 1, j - 1);
            if (prelude.startsWith('@')) {
                if (/^@(media|supports|layer|container)/.test(prelude)) walk(body, guarded || /hover:\s*hover/.test(prelude));
            } else if (!guarded && /:hover/.test(prelude) &&
                       (/(^|[;\s])(visibility|display)\s*:/.test(body) || (/(^|[;\s])opacity\s*:/.test(body) && /:hover\s*[ >+~]\s*\S/.test(prelude)))) {
                reveal.push(prelude.replace(/\s+/g, ' ').slice(0, 60));
            }
            i = j;
        }
    })(css, false);
    check('source/hover-reveal', reveal.length === 0,
        'source: no hover rule shows or hides content outside @media (hover: hover), where an iPhone tap would be spent on it (' + (reveal.length ? reveal.join(' | ') : 'none') + ')');
    check('source/visible-height', /--ps-vh:\s*100dvh/.test(css) && /\.ps-page\s*\{[^}]*height:\s*var\(--ps-vh\)/.test(css) && bare === 1,
        'source: the page and its dialogs are sized by the visible height (--ps-vh), with one vh fallback and no other bare vh (' + bare + ' found)');
}
const browser = await chromium.launch();
const measured = {};
for (const dev of DEVICES) {
    if (!CONTROL) console.log('== ' + dev.id + ' (' + dev.profile + ', ' + devices[dev.profile].viewport.width + ' x ' + devices[dev.profile].viewport.height + ')');
    for (let attempt = 1; ; attempt++) {
        const mark = { v: verdicts.length, f: fails, n: notes.length };
        try { measured[dev.id] = await runDevice(browser, dev); break; }
        catch (e) {
            const timedOut = /Timeout|Target (page|closed)|browser has been closed/i.test(String(e && e.message || e));
            if (!timedOut || attempt >= 3) throw e;
            // forget what the cut-short attempt recorded and start the profile again
            verdicts.length = mark.v; fails = mark.f; notes.length = mark.n;
            console.log('  ....  ' + dev.id + ': a step timed out (attempt ' + attempt + ' of 3; the machine slept or was swamped), running this profile again');
            for (const c of browser.contexts()) await c.close().catch(() => {});
        }
    }
}
if (!CONTROL && !CONTROL_TH && !want.length) {
    console.log('== desktop (1280 x 800, a mouse)');
    await runDesktop(browser);
}
await browser.close();

if (CONTROL_TH) {
    // With the engine key withheld, the two rules that need the engine's
    // guard have to fail: a swipe opens the bar's editor again, and the
    // finger lifting off the long-press menu selects the bar again.
    const t = (measured.phone || {}).touch || {};
    const expect = [
        [t.swipeLeavesChartAlone === false, 'without the engine guard a swipe on a bar opens its editor again'],
        [t.longPressLiftIsQuiet === false, 'without the engine guard the lift off the long-press menu selects the bar again']
    ];
    let bad = 0;
    for (const [red, msg] of expect) { console.log((red ? '  ok  ' : ' FAIL ') + 'control: ' + msg); if (!red) bad++; }
    console.log(bad ? 'CONTROL FAILED: the engine guard is not what holds these rules' : 'CONTROL: red where it should be');
    process.exit(bad ? 1 : 0);
}

if (WRITE && !CONTROL) {
    const prev = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : { devices: {} };
    const next = { about: 'Written by mobile-check.mjs with PS_MOBILE_WRITE_BASELINE=1. What a phone and a tablet get today; a number here may only get better. Review the diff before committing a rewrite.',
        devices: { ...(prev.devices || {}), ...measured } };
    for (const d of Object.values(next.devices)) for (const s of Object.values(d.screens || {})) { delete s.tinySample; }
    writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 1) + '\n');
    console.log('baseline written: ' + BASELINE_PATH);
} else {
    if (!existsSync(BASELINE_PATH)) { console.error('mobile-check: no mobile-baseline.json (run with PS_MOBILE_WRITE_BASELINE=1)'); process.exit(1); }
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
    for (const dev of DEVICES) {
        if (!CONTROL) console.log('== ' + dev.id + ': against the baseline');
        const base = (baseline.devices || {})[dev.id];
        if (!base) { check(dev.id + '/baseline', false, dev.id + ': no baseline for this device', 'debt'); continue; }
        compare(dev.id, measured[dev.id], base);
    }
}

if (CONTROL) {
    // The harness has to go red on exactly the three injected regressions.
    const red = id => verdicts.some(v => v.id === id && !v.ok);
    const expect = [
        ['phone/start/overflowX', 'a block wider than the screen trips the sideways-scroll check'],
        ['phone/chart/under24', 'command-bar buttons squeezed to 14 px trip the target-size ratchet'],
        ['phone/editor/open', 'a hidden editor panel trips the tap-opens-editor check']
    ];
    let bad = 0;
    for (const [id, msg] of expect) { const r = red(id); console.log((r ? '  ok  ' : ' FAIL ') + 'control: ' + msg); if (!r) bad++; }
    console.log(bad ? 'CONTROL FAILED: the harness missed an injected regression' : 'CONTROL: red where it should be');
    process.exit(bad ? 1 : 0);
}
if (notes.length) console.log(notes.length + ' improvement' + (notes.length === 1 ? '' : 's') + ' over the baseline: tighten it with PS_MOBILE_WRITE_BASELINE=1 once the change is meant.');
console.log(fails ? 'FAILED: ' + fails + ' check' + (fails === 1 ? '' : 's') : 'ALL GREEN');
process.exit(fails ? 1 : 0);
