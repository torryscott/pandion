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
const DEVICES = CONTROL ? ALL_DEVICES.slice(0, 1)
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
        if (OUT) await page.screenshot({ path: path.join(OUT, dev.id + '-' + name + '.png') });
        check(dev.id + '/' + name + '/overflowX', !m.overflowX,
            tag + name + ': nothing is wider than the screen (' + m.scrollW + ' in ' + profile.viewport.width + ')');
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
    if (CONTROL) await page.evaluate(() => { const d = document.createElement('div'); d.id = 'ps-mobile-control-wide'; d.style.cssText = 'position:absolute;left:0;top:0;width:900px;height:1px'; document.body.appendChild(d); });
    await screen('start');
    if (CONTROL) { await unctl(); await page.waitForTimeout(200); }

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
    // The control's three injected regressions are all judged by here, and
    // the squeezed buttons and hidden panel make the later steps untappable.
    if (CONTROL) { await ctx.close(); return result; }

    // 4. touch-drag an axis title: it moves, and the page does not pan away
    const title = await page.evaluate(() => {
        const svg = [...document.querySelectorAll('.graphbuilder2-host svg')].sort((a, b) => {
            const A = a.getBoundingClientRect(), B = b.getBoundingClientRect(); return B.width * B.height - A.width * A.height; })[0];
        const want = (window.PS_SHELL.buildPayload() || {}).xLabel;
        const t = [...svg.querySelectorAll('text')].find(n => (n.textContent || '').trim() === String(want || '').trim());
        if (!t) return null;
        t.scrollIntoView({ block: 'center' });
        const r = t.getBoundingClientRect(); window.__mobTitle = t;
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: t.textContent.trim() };
    });
    if (title) {
        await page.waitForTimeout(250);
        const t0 = await page.evaluate(() => { const r = window.__mobTitle.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
        const s0 = await scrollState(page);
        await touchDrag(client, page, t0.x, t0.y, -46, -34);
        await page.waitForTimeout(700);
        const after = await page.evaluate((want) => {
            const svg = [...document.querySelectorAll('.graphbuilder2-host svg')].sort((a, b) => {
                const A = a.getBoundingClientRect(), B = b.getBoundingClientRect(); return B.width * B.height - A.width * A.height; })[0];
            const t = [...svg.querySelectorAll('text')].find(n => (n.textContent || '').trim() === want);
            if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }, title.text);
        const s1 = await scrollState(page);
        const scrolled = Math.abs(s1.win - s0.win) + Math.abs(s1.pane - s0.pane);
        // where the label sits relative to the content, so a pan is not read as a move
        const moved = after ? Math.hypot((after.x - t0.x), (after.y - t0.y) + (s1.win - s0.win) + (s1.pane - s0.pane)) : 0;
        result.touch.labelDragMoves = moved > 12;
        result.touch.labelDragHoldsPage = scrolled < 4;
    } else { result.touch.labelDragMoves = false; result.touch.labelDragHoldsPage = false; }

    // 5. long-press on a bar: the context menu
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    b = await barCentre(page); await page.waitForTimeout(200); b = await barCentre(page);
    if (b) { await longPress(client, page, b.x, b.y); await page.waitForTimeout(500); }
    result.touch.longPressOpensMenu = await page.evaluate(() => {
        const m = document.getElementById('ps-contextmenu'); if (!m) return false;
        const r = m.getBoundingClientRect(); return getComputedStyle(m).display !== 'none' && r.width > 20 && r.height > 20;
    });
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.evaluate(() => { const m = document.getElementById('ps-contextmenu'); if (m && getComputedStyle(m).display !== 'none') document.body.click(); });

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
    result.touch.layoutItemDragMoves = false; result.touch.layoutDragHoldsPage = false;
    if (it) {
        await page.waitForTimeout(250);
        const i0 = await page.evaluate(() => { const e = document.querySelector('#ps-lcanvas .ps-litem'); const r = e.getBoundingClientRect(); const it = e.getAttribute('data-item-id'); return { x: r.left, y: r.top, id: it }; });
        const s0 = await scrollState(page);
        await touchDrag(client, page, i0.x + it.w / 2, i0.y + it.h / 2, 30, 24);
        await page.waitForTimeout(700);
        const i1 = await page.evaluate((id) => { const e = document.querySelector('#ps-lcanvas .ps-litem[data-item-id="' + id + '"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top }; }, i0.id);
        const s1 = await scrollState(page);
        const pan = (s1.win - s0.win) + (s1.pane - s0.pane);
        result.touch.layoutItemDragMoves = !!i1 && Math.hypot(i1.x - i0.x, (i1.y - i0.y) + pan) > 8;
        result.touch.layoutDragHoldsPage = Math.abs(pan) < 4;
    }

    check(dev.id + '/errors', errors.length === 0, tag + 'no page errors ' + errors.slice(0, 2).join(' | '));
    await ctx.close();
    return result;
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
const browser = await chromium.launch();
const measured = {};
for (const dev of DEVICES) {
    if (!CONTROL) console.log('== ' + dev.id + ' (' + dev.profile + ', ' + devices[dev.profile].viewport.width + ' x ' + devices[dev.profile].viewport.height + ')');
    measured[dev.id] = await runDevice(browser, dev);
}
await browser.close();

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
