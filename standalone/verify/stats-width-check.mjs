// Statistics reading width (Sep 15 2026, Torry: the Sigma panel docked
// beside the chart needed sideways scrolling for every wide table, and
// the narrow-table mockup felt crammed; "or maybe widening the right
// rail a bit").
//
// While a Statistics panel is docked beside the chart, the shell widens
// the rail to what its widest visible table needs (never narrower than
// the rail was, capped by the splitter's 640 and the chart's 320px
// floor); a tab switch can widen further but never narrows mid-read;
// Close, Escape or the Sigma toggle give the width back; a splitter
// drag while it is open wins for the rest of that session. The engine,
// gated on the dock: sticky first column, a right-edge scroll cue,
// "CI lo" / "CI hi" descriptives headers with the full name in the
// aria-label, and a clip note that names the panel's edge.
//
// Cases (chromium; webkit when installed):
//   1. 1366x620 beside: open Sigma -> rail widens, panel stays beside,
//      every visible table fits, the chart's zoom holds within 3% (the
//      pane is height-bound; WebKit's wider table metrics take the rail
//      to 585 where Chromium needs 558); Descriptives / Omnibus tabs never
//      narrow it; the Descriptives headers read CI lo / CI hi with the
//      full name spoken; Close restores 380 and the chart refits.
//   2. same page: Escape and the Sigma toggle both restore 380.
//   3. same page: a real splitter drag while Sigma is open keeps the
//      panel open (the shell arms the engine's outside-click suppression
//      window around the press), starts from the width on screen, and
//      is kept across a tab switch (the user's width wins).
//   4. same page, rail dragged to its minimum: the fallback chrome -
//      sticky first column, right-edge cue that clears at the end of
//      the scroll, the docked clip note.
//   5. 1366x620 Automatic dock: the panel stays beside while wide (no
//      beside/below oscillation).
//   6. 1470x800 below: the rail is untouched (330), long headers stay.
// CONTROL (main's standalone): cases 1, 3 and 4 go red (no widening,
// 95% CI lower headers, no sticky column, no right cue).
//
// Usage: node standalone/verify/stats-width-check.mjs

import { createRequire } from 'node:module';
import path from 'node:path';

function loadPlaywright() {
    const bases = [];
    if (process.env.GB2_NODE_BASE) bases.push(process.env.GB2_NODE_BASE);
    bases.push(process.cwd(), new URL('.', import.meta.url).pathname,
               '/private/tmp', '/tmp');
    for (const b of bases) {
        try { return createRequire(path.join(b, 'x.js'))('playwright'); }
        catch { /* try the next shared dependency location */ }
    }
    console.error('playwright not found; cd /tmp && npm i playwright');
    process.exit(2);
}
const pw = loadPlaywright();
const PAGE = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));

let failures = 0;
function ok(cond, label) {
    if (cond) console.log('  ok  ' + label);
    else { console.log('  FAIL ' + label); failures++; }
}

async function open(browser, w, h, dock, roles) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.__errors = errors;
    await page.addInitScript(d => {
        try {
            localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1');
            localStorage.setItem('psstandalone.preferences.v1', JSON.stringify({ panelDock: d }));
        } catch (e) { /* private mode */ }
    }, dock);
    await page.goto(PAGE);
    await page.waitForTimeout(700);
    if (await page.locator('#ps-welcome').isVisible().catch(() => false)) {
        await page.click('#ps-welcome-sample');
        await page.waitForTimeout(1800);
    }
    try {
        const got = page.locator('button', { hasText: 'Got it' }).first();
        if (await got.isVisible()) { await got.click(); await page.waitForTimeout(300); }
    } catch { /* no toast */ }
    await page.evaluate(async r => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        PS_SHELL.setWorkspace('chart');
        PS_SHELL.setModule('plotbuilder');
        PS_SHELL.setRoles('plotbuilder', r || { xvar: 'condition', yvar: 'score', groupVar: 'site' });
        await s(1800);
    }, roles || null);
    return page;
}

// The state the cases read: rail width, dock placement, table fit.
const geom = () => {
    const col = document.querySelector('.ps-controls');
    const body = document.querySelector('.ps-app-body');
    const host = document.querySelector('.graphbuilder2-host');
    const panel = document.querySelector('[data-gb2-inspector]');
    const slot = document.getElementById('ps-engine-dock-slot');
    const svg = host && host.querySelector('svg[data-role="gb2-chart-svg"]');
    const wraps = panel ? Array.from(panel.querySelectorAll('[data-st-scroll]')).filter(w => w.offsetParent) : [];
    return {
        rail: col ? Math.round(col.getBoundingClientRect().width) : null,
        railVar: body ? body.style.getPropertyValue('--ps-insp-w') : null,
        inSlot: !!(panel && slot && slot.contains(panel)),
        stats: !!(panel && panel.querySelector('[data-role="st-close-btn"]')),
        zoom: host ? Number(host.style.zoom || 1) : null,
        svgW: svg ? Math.round(svg.getBoundingClientRect().width) : null,
        overflow: wraps.filter(w => w.scrollWidth > w.clientWidth + 1).map(w => w.scrollWidth + '>' + w.clientWidth),
        tables: wraps.length
    };
};
const G = page => page.evaluate('(' + geom.toString() + ')()');

async function clickSigma(page) {
    await page.evaluate(() => {
        const b = document.querySelector('.graphbuilder2-host button[aria-label="Statistics"]');
        if (!b) throw new Error('no Sigma button');
        b.click();
    });
    await page.waitForTimeout(900);
}
async function clickTab(page, tab) {
    const found = await page.evaluate(t => {
        const b = document.querySelector('[data-gb2-inspector] [data-st-tab="' + t + '"]');
        if (!b) return false;
        b.click();
        return true;
    }, tab);
    ok(found, 'the ' + tab + ' tab is there to click');
    await page.waitForTimeout(700);
}
async function clickClose(page) {
    await page.evaluate(() => {
        const b = document.querySelector('[data-gb2-inspector] [data-role="st-close-btn"]');
        if (!b) throw new Error('no Close button');
        b.click();
    });
    await page.waitForTimeout(900);
}
async function dragSplitter(page, dx) {
    const r = await page.evaluate(() => {
        const b = document.querySelector('[data-splitter="inspector"]');
        const q = b.getBoundingClientRect();
        return { x: q.left + q.width / 2, y: q.top + q.height / 2 };
    });
    await page.mouse.move(r.x, r.y);
    await page.mouse.down();
    await page.mouse.move(r.x + dx / 2, r.y, { steps: 4 });
    const mid = await G(page);
    await page.mouse.move(r.x + dx, r.y, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    return mid;
}

async function engineRun(name, type) {
    let browser;
    try { browser = await type.launch(); }
    catch (e) { console.log('== ' + name + ': not installed, skipped'); return; }
    console.log('== ' + name);
    const T = t => '[' + name + '] ' + t;

    // Case 1: beside, the rail widens and the tables fit.
    {
        const page = await open(browser, 1366, 620, 'beside');
        const g0 = await G(page);
        ok(g0.rail === 380, T('1366x620 beside starts at the docked 380 (' + g0.rail + ')'));
        await clickSigma(page);
        const g1 = await G(page);
        ok(g1.stats && g1.inSlot, T('Sigma opened beside the chart'));
        ok(g1.rail > g0.rail + 40, T('the rail widened for Statistics (' + g0.rail + ' -> ' + g1.rail + ')'));
        ok(g1.rail <= 640, T('within the splitter cap (' + g1.rail + ' <= 640)'));
        ok(g1.tables > 0 && g1.overflow.length === 0, T('every visible Compare-pairs table fits (' + g1.tables + ' tables, overflow ' + JSON.stringify(g1.overflow) + ')'));
        // Height-bound pane: Chromium's 558 costs the chart nothing (it
        // even grows); WebKit's wider table metrics take the rail to 585
        // and the chart gives up under 3% (0.772 -> 0.751 measured).
        ok(g1.zoom >= g0.zoom - 0.03, T('the chart zoom held within 3% (' + g0.zoom + ' -> ' + g1.zoom + ')'));
        const live = await page.evaluate(() => (document.getElementById('ps-dock-live') || {}).textContent || '');
        ok(/widened/.test(live), T('the live region announced the widening'));
        await clickTab(page, 'desc');
        const g2 = await G(page);
        ok(g2.rail >= g1.rail, T('Descriptives never narrows the rail (' + g1.rail + ' -> ' + g2.rail + ')'));
        ok(g2.overflow.length === 0, T('the Descriptives table fits (overflow ' + JSON.stringify(g2.overflow) + ')'));
        const hdr = await page.evaluate(() => {
            const pane = document.querySelector('[data-gb2-inspector] [data-st-pane="desc"]');
            const ths = pane ? Array.from(pane.querySelectorAll('th')) : [];
            const lo = ths.find(t => /CI lo/i.test(t.textContent));
            const term = lo && lo.querySelector('.gb2-stterm');
            return { texts: ths.map(t => t.textContent.trim()), aria: term ? term.getAttribute('aria-label') : null, title: term ? term.getAttribute('title') : null };
        });
        ok(hdr.texts.some(t => /^CI lo$/i.test(t)) && hdr.texts.some(t => /^CI hi$/i.test(t)), T('Descriptives headers read CI lo / CI hi (' + hdr.texts.join(' | ') + ')'));
        ok(!!hdr.aria && /95% CI lower/.test(hdr.aria) && /95% CI lower/.test(hdr.title || ''), T('the short header speaks its full name (' + hdr.aria + ')'));
        await clickTab(page, 'omnibus');
        const g3 = await G(page);
        ok(g3.rail === g2.rail, T('Omnibus keeps the width (' + g2.rail + ' -> ' + g3.rail + ')'));
        // Back to the wide tab: the tab is sticky, and a re-open on the
        // Omnibus tab (which fits in 380) rightly widens nothing.
        await clickTab(page, 'pairs');
        await clickClose(page);
        const g4 = await G(page);
        ok(!g4.stats, T('Close closed the panel'));
        ok(g4.rail === 380, T('Close gave the width back (' + g4.rail + ')'));
        ok(Math.abs(g4.zoom - g0.zoom) < 0.02, T('the chart refit to where it started (' + g0.zoom + ' -> ' + g4.zoom + ')'));

        // Case 2: Escape and the Sigma toggle restore too.
        await clickSigma(page);
        const g5 = await G(page);
        ok(g5.rail > 400, T('re-opened wide (' + g5.rail + ')'));
        await page.keyboard.press('Escape');
        await page.waitForTimeout(900);
        const g6 = await G(page);
        ok(!g6.stats && g6.rail === 380, T('Escape gave the width back (' + g6.rail + ')'));
        await clickSigma(page);
        await clickSigma(page);
        const g7 = await G(page);
        ok(!g7.stats && g7.rail === 380, T('the Sigma toggle gave the width back (' + g7.rail + ')'));

        // Case 3: the user's own drag wins for the session.
        await clickSigma(page);
        const g8 = await G(page);
        ok(g8.stats && g8.rail > 400, T('re-opened wide for the drag (' + g8.rail + ')'));
        const mid = await dragSplitter(page, 120);
        ok(mid.rail < g8.rail && mid.rail > g8.rail - 120, T('the drag started from the width on screen (' + g8.rail + ' -> ' + mid.rail + ' at half travel)'));
        const g9 = await G(page);
        ok(g9.stats && g9.inSlot, T('the splitter drag kept Statistics open'));
        ok(Math.abs(g9.rail - (g8.rail - 120)) <= 2, T('the drag narrowed the rail by its travel (' + g8.rail + ' -> ' + g9.rail + ')'));
        await clickTab(page, 'desc');
        await clickTab(page, 'pairs');
        const g10 = await G(page);
        ok(g10.rail === g9.rail, T('tab switches keep the dragged width (' + g9.rail + ' -> ' + g10.rail + ')'));

        // Case 4: the fallback chrome at the narrowest rail.
        await dragSplitter(page, 400);
        await clickTab(page, 'desc');
        const fb = await page.evaluate(() => {
            const pane = document.querySelector('[data-gb2-inspector] [data-st-pane="desc"]');
            const wrap = pane && pane.querySelector('[data-st-scroll]');
            const t = wrap && wrap.querySelector('table');
            const th0 = t && t.querySelector('tr th');
            const td0 = t && t.querySelector('tr + tr td');
            const tr1 = t && t.querySelector('tr + tr');
            const note = document.querySelector('[data-gb2-inspector] [data-role="st-clip-note"]');
            const out = {
                rail: Math.round(document.querySelector('.ps-controls').getBoundingClientRect().width),
                scrolls: !!(wrap && wrap.scrollWidth > wrap.clientWidth + 1),
                thSticky: !!(th0 && getComputedStyle(th0).position === 'sticky' && getComputedStyle(th0).left === '0px'),
                tdSticky: !!(td0 && getComputedStyle(td0).position === 'sticky' && getComputedStyle(td0).left === '0px'),
                tdBg: td0 ? getComputedStyle(td0).backgroundColor : null,
                trBg: tr1 ? getComputedStyle(tr1).backgroundColor : null,
                cueStart: wrap ? wrap.style.boxShadow : null,
                note: note && note.offsetParent ? note.textContent : ''
            };
            if (wrap) { wrap.scrollLeft = 10000; wrap.dispatchEvent(new Event('scroll')); }
            out.cueEnd = wrap ? wrap.style.boxShadow : null;
            out.tdLeftAfterScroll = td0 ? Math.round(td0.getBoundingClientRect().left - wrap.getBoundingClientRect().left) : null;
            return out;
        });
        ok(fb.rail <= 260, T('the rail is at its narrowest (' + fb.rail + ')'));
        ok(fb.scrolls, T('the Descriptives table now scrolls sideways'));
        ok(fb.thSticky && fb.tdSticky, T('the first column is sticky (th ' + fb.thSticky + ', td ' + fb.tdSticky + ')'));
        ok(fb.tdBg === fb.trBg && /rgb\(255, 255, 255\)/.test(fb.tdBg || ''), T('the sticky cell paints its row background (' + fb.tdBg + ')'));
        // Browsers re-serialize the shadow (color first, "inset" last).
        const rightCue = v => /-12px 0(px)? 10px -10px/.test(v || '') && /inset/.test(v || '');
        ok(rightCue(fb.cueStart), T('the right-edge cue shows at the start (' + fb.cueStart + ')'));
        ok(!rightCue(fb.cueEnd), T('the right-edge cue clears at the end (' + fb.cueEnd + ')'));
        ok(fb.tdLeftAfterScroll != null && fb.tdLeftAfterScroll <= 1, T('the first cell stayed put through the scroll (' + fb.tdLeftAfterScroll + 'px)'));
        ok(/drag the panel's edge/.test(fb.note), T('the clip note names the panel edge (' + fb.note.slice(0, 60) + ')'));
        ok(page.__errors.length === 0, T('no page errors' + (page.__errors.length ? ' (' + page.__errors[0] + ')' : '')));
        await page.close();
    }

    // Case 5: Automatic dock stays beside while wide.
    {
        const page = await open(browser, 1366, 620, 'auto');
        await page.evaluate(() => {
            const el = document.querySelector('.graphbuilder2-host svg [data-role="bar"], .graphbuilder2-host svg rect[data-bar-cat]');
            if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await clickSigma(page);
        const g1 = await G(page);
        ok(g1.stats, T('auto: Sigma opened'));
        ok(g1.inSlot, T('auto: the panel is beside the chart'));
        ok(g1.rail > 420, T('auto: the rail widened (' + g1.rail + ')'));
        await page.waitForTimeout(1500);
        const g2 = await G(page);
        ok(g2.inSlot && g2.rail === g1.rail, T('auto: still beside at the same width 1.5s later (' + g2.rail + ')'));
        await clickClose(page);
        ok(page.__errors.length === 0, T('auto: no page errors'));
        await page.close();
    }

    // Case 6: under the chart, nothing changes.
    {
        const page = await open(browser, 1470, 800, 'below');
        const g0 = await G(page);
        await clickSigma(page);
        const g1 = await G(page);
        ok(g1.stats && !g1.inSlot, T('1470x800 below: Sigma opened under the chart'));
        ok(g1.rail === g0.rail && g1.rail === 330, T('below: the rail is untouched (' + g0.rail + ' -> ' + g1.rail + ')'));
        await clickTab(page, 'desc');
        const hdr = await page.evaluate(() => Array.from(document.querySelectorAll('[data-gb2-inspector] [data-st-pane="desc"] th')).map(t => t.textContent.trim()));
        ok(hdr.some(t => /95% CI lower/.test(t)), T('below: the long CI headers stay (' + hdr.join(' | ') + ')'));
        const td = await page.evaluate(() => { const c = document.querySelector('[data-gb2-inspector] [data-st-pane="desc"] tr + tr td'); return c ? getComputedStyle(c).position : null; });
        ok(td === 'static', T('below: no sticky column (' + td + ')'));
        ok(page.__errors.length === 0, T('below: no page errors'));
        await page.close();
    }
    await browser.close();
}
await engineRun('chromium', pw.chromium);
await engineRun('webkit', pw.webkit);
console.log(failures ? 'stats-width: FAIL (' + failures + ')' : 'stats-width: PASS');
process.exit(failures ? 1 : 0);
