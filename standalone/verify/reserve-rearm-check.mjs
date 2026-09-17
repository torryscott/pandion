// The height reserve re-arms on an option commit (Sep 16 2026; filed Sep
// 14 by the adversarial review of the Safari chart-shift fix).
//
// The reserve floors the chart host's height on every trusted press so
// the engine's transient wipe during a re-render cannot shrink the
// content under a scrolled pane (the browser clamps the scroll: an
// instant jump to the top). It armed ONLY on a press, and dropped
// silently after about 1.5s of quiet. A commit arriving after that with
// no press behind it (a keyboard edit in the panel, arrow keys on a
// slider, Enter in a number field, an undo shortcut) re-rendered through
// the same wipe with no floor, and the pane went to 0. Now
// window.setOption raises the floor itself when it finds it down.
//
// Case, chromium + webkit, 1470x800 with the panel under the chart:
//   a Compare Groups chart with a figure note, a real click on an error
//   bar (the reveal scrolls the pane down to the panel), 3.5s of quiet so
//   the floor drops, then the note is removed through window.setOption
//   with no press. The pane must not be clamped to the top: sampled per
//   frame for 3s, the scroll position never goes below where it was
//   minus the note's own height, and never reaches 0.
// CONTROL (main's ps-shell.js): the pane lands at 0 within the window.
//
// Usage: node standalone/verify/reserve-rearm-check.mjs

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

async function open(browser) {
    const page = await browser.newPage({ viewport: { width: 1470, height: 800 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.__errors = errors;
    await page.addInitScript(() => {
        try {
            localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1');
            localStorage.setItem('psstandalone.preferences.v1', JSON.stringify({ panelDock: 'below' }));
        } catch (e) { /* private mode */ }
    });
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
    await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        PS_SHELL.setWorkspace('chart');
        PS_SHELL.setModule('plotbuilder');
        PS_SHELL.setRoles('plotbuilder', { xvar: 'condition', yvar: 'score', groupVar: 'site' });
        await s(1500);
        window.setOption('errorBarType', 'ci95');
        window.setOption('chartNote', 'Error bars show 95% confidence intervals around each mean. ' +
            'Scores are the pooled classroom measure for the term.');
        await s(2500);
    });
    return page;
}

async function engineRun(name, type) {
    let browser;
    try { browser = await type.launch(); }
    catch (e) { console.log('== ' + name + ': not installed, skipped'); return; }
    console.log('== ' + name);
    const T = t => '[' + name + '] ' + t;
    const page = await open(browser);

    // A real press on an error bar: the panel opens below the chart and
    // the reveal scrolls the pane down to it.
    const t = await page.evaluate(() => {
        const el = document.querySelector('.graphbuilder2-host svg[data-role="gb2-chart-svg"] [data-role="error-bar"]');
        if (!el) return null;
        const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    ok(!!t, T('an error bar is on screen to click'));
    if (!t) { await page.close(); await browser.close(); return; }
    await page.mouse.click(t.x, t.y);
    await page.waitForTimeout(1800);
    const st0 = await page.evaluate(() => document.getElementById('ps-main-workspace').scrollTop);
    const noteFind = () => Array.from(document.querySelectorAll('.graphbuilder2-host svg[data-role="gb2-chart-svg"] text'))
        .find(t => /Error bars show 95%/.test(t.textContent));
    const noteH = await page.evaluate(fn => { const n = (new Function('return (' + fn + ')()'))(); return n ? n.getBoundingClientRect().height : 0; }, noteFind.toString());
    ok(noteH > 0, T('the figure note is drawn before the test (' + Math.round(noteH) + 'px)'));
    ok(st0 > 40, T('the reveal scrolled the pane down to the open panel (scrollTop ' + st0 + ')'));

    // 3.5s of quiet: the reserve's floor drops silently (main and fixed
    // alike; the fix is what happens at the NEXT commit).
    await page.waitForTimeout(3500);
    const stQuiet = await page.evaluate(() => document.getElementById('ps-main-workspace').scrollTop);
    ok(Math.abs(stQuiet - st0) <= 1, T('the pane held still while the floor dropped (' + st0 + ' -> ' + stQuiet + ')'));

    // The commit with no press behind it: remove the note.
    const r = await page.evaluate(async () => {
        const sc = document.getElementById('ps-main-workspace');
        const w = { min: sc.scrollTop, frames: 0, zero: 0 };
        const loop = () => { const v = sc.scrollTop; w.frames++; if (v < w.min) w.min = v; if (v <= 0) w.zero++; w.raf = requestAnimationFrame(loop); };
        w.raf = requestAnimationFrame(loop);
        window.setOption('chartNote', '');
        await new Promise(res => setTimeout(res, 3000));
        cancelAnimationFrame(w.raf);
        return { min: w.min, frames: w.frames, zero: w.zero, end: sc.scrollTop,
                 note: Array.from(document.querySelectorAll('.graphbuilder2-host svg[data-role="gb2-chart-svg"] text')).some(t => /Error bars show 95%/.test(t.textContent)) };
    });
    ok(r.frames > 60, T('sampled ' + r.frames + ' frames across the commit'));
    ok(!r.note, T('the note really left the chart (the commit landed)'));
    ok(r.zero === 0, T('the pane was never clamped to the top (' + r.zero + ' frames at 0)'));
    ok(r.min >= st0 - Math.max(40, noteH + 20), T('the scroll position never fell below the note\'s own height (min ' + r.min + ' from ' + st0 + ', note ' + Math.round(noteH) + 'px)'));
    ok(r.end > 0, T('and it ended scrolled, not at the top (' + r.end + ')'));
    ok(page.__errors.length === 0, T('no page errors' + (page.__errors.length ? ' (' + page.__errors[0] + ')' : '')));
    await page.close();
    await browser.close();
}
await engineRun('chromium', pw.chromium);
await engineRun('webkit', pw.webkit);
console.log(failures ? 'reserve-rearm: FAIL (' + failures + ')' : 'reserve-rearm: PASS');
process.exit(failures ? 1 : 0);
