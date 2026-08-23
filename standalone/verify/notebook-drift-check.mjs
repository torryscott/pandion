// t4-230 (Torry, Aug 22 2026): a Notebook page kept after using the Sigma
// panel's compare-pairs flow could read "source chart has changed" when
// nothing about the chart had changed - the user had only clicked around
// panels.
//
// ROOT CAUSE, two routes with one root: the freshness verdict hashes the
// shell's chart snapshot, and editor chrome leaked into those bytes.
// (1) The engine's selection indicators (addIndicatorBox rects, axis
//     marching ants, handles) carry NO sel-halo role, so SNAP_STRIP kept
//     them: an echo landing while anything was selected captured the
//     dashed box into the hash; the next echo without it hashed
//     differently -> false "changed".
// (2) exportContentBox measured the LIVE svg's getBBox - chrome included -
//     so a selection box poking past the canvas grew the recorded
//     viewBox even though the box was stripped from the clone.
// Plus the fingerprint class: the shared text-hover rect and the marquee
// keep their last x/y/width/height forever after a single hover, and
// attribute-based hover mutations (data-hover-base-*) were captured
// mid-hover without being restored.
//
// THE FIX preserves byte-compatibility for at-rest charts (the indicator
// groups are always-present fixtures, so only their CHILDREN are
// stripped; the pie's persistent seam handles are NOT stripped; parked
// chrome is reset to its as-created attribute set), so every healthy
// already-kept page keeps reading "unchanged" across the update.
//
// CONTROL (run during development, Aug 22 2026): against the pre-fix
// shell, case 2 fails with two different signatures across the
// selected/deselected echo pair, and case 4's kept picture contains the
// dashed indicator rect. Against the fixed shell both pass, and case 1's
// at-rest capture is byte-identical to the pre-fix capture (verified by
// A/B stash diff), so the compat gate in case 1 is meaningful.
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
function sig(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++)
        h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(16);
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
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible().catch(() => false)) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1800);
}

async function snapSvg() {
    return page.evaluate(() => {
        const id = window.PS_SHELL.project.activeChart;
        const sn = window.PS_SHELL.snapshotOf(id);
        return sn ? sn.svg : null;
    });
}
async function echo() {
    // a same-value commit: epoch bump + echo re-render, zero visual change
    await page.evaluate(() => {
        const p = window.PS_SHELL.buildPayload();
        window.setOption('chartTitle', p.chartTitle || '');
    });
    await page.waitForTimeout(1000);
}
async function clickChartEl(sel) {
    const pt = await page.evaluate((sel) => {
        const svg = [...document.querySelectorAll('.graphbuilder2-host svg')]
            .sort((a, b) => b.clientWidth * b.clientHeight -
                            a.clientWidth * a.clientHeight)[0];
        const el = svg.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, sel);
    if (!pt) return false;
    await page.mouse.move(pt.x, pt.y);
    await page.mouse.down(); await page.mouse.up();
    return true;
}
async function barCenter(k) {
    return page.evaluate((k) => {
        const svg = [...document.querySelectorAll('.graphbuilder2-host svg')]
            .sort((a, b) => b.clientWidth * b.clientHeight -
                            a.clientWidth * a.clientHeight)[0];
        const seen = {}, cats = [];
        for (const b of svg.querySelectorAll('[data-bar-cat]')) {
            const c = b.getAttribute('data-bar-cat');
            if (!seen[c]) { seen[c] = b; cats.push(c); }
        }
        const r = seen[cats[k]].getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, k);
}

console.log('case 1: captures are stable at rest and across echoes');
const rest1 = await snapSvg();
ok(!!rest1, 'an at-rest snapshot exists');
ok(rest1.indexOf('data-role="inspector-indicator"') !== -1,
   'the indicator fixture group survives in the capture (byte-compat with ' +
   'pages kept before this fix)');
await echo();
const rest2 = await snapSvg();
ok(rest1 === rest2, 'an echo of an unchanged chart re-captures byte-identically');

console.log('case 2: selection chrome never reaches the hashed bytes');
ok(await clickChartEl('[data-role="y-axis-line"], [data-role="axis-line"]'),
   'setup: the value axis is selected (marching-ants indicator)');
await page.waitForTimeout(600);
await echo();
const selSnap = await snapSvg();
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await echo();
const deselSnap = await snapSvg();
ok(selSnap === deselSnap,
   'echo captures hash the same with the axis selected and deselected ' +
   `(${sig(selSnap)})`);
ok(selSnap === rest1,
   'and both equal the never-selected capture - chrome-independent by construction');

console.log('case 3: the reported repro end to end');
await page.evaluate(() =>
    document.querySelector('.graphbuilder2-host button[aria-label="Statistics"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true })));
await page.waitForTimeout(900);
await page.mouse.move(0, 0);
const b0 = await barCenter(0);
await page.mouse.move(b0.x, b0.y); await page.mouse.down(); await page.mouse.up();
await page.waitForTimeout(500);
const b1 = await barCenter(1);
await page.mouse.move(b1.x, b1.y); await page.mouse.down(); await page.mouse.up();
await page.waitForTimeout(700);
ok(await page.locator('[data-ps-moment-keep]').count() === 1,
   'setup: two bars picked, the comparison focus card offers Keep');
await page.locator('[data-ps-moment-keep]').first().click();
await page.waitForTimeout(600);
// click around: tabs, a correction flip and back, close, bar panel, escape
const tabs = page.locator('[data-st-tab]');
const tn = await tabs.count();
for (let i = 0; i < tn; i++) { await tabs.nth(i).click(); await page.waitForTimeout(250); }
await page.evaluate(() => {
    const sels = [...document.querySelectorAll('[data-cmp-band] select')];
    const corr = sels.find(s => [...s.options].some(o => /holm/i.test(o.value)));
    if (!corr) return;
    corr.value = [...corr.options].find(o => /holm/i.test(o.value)).value;
    corr.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(800);
await page.evaluate(() => {
    const sels = [...document.querySelectorAll('[data-cmp-band] select')];
    const corr = sels.find(s => [...s.options].some(o => /holm/i.test(o.value)));
    if (!corr) return;
    corr.value = [...corr.options].find(o => /none/i.test(o.value)).value;
    corr.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(900);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
const b2 = await barCenter(2);
await page.mouse.move(b2.x, b2.y); await page.mouse.down(); await page.mouse.up();
await page.waitForTimeout(700);
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
await echo();
await page.evaluate(() => window.PS_SHELL.setWorkspace('pinboard'));
await page.waitForTimeout(900);
const chip = await page.evaluate(() => {
    const d = document.querySelector('.ps-pinpage-drift');
    return d ? d.textContent : null;
});
ok(chip === null,
   'the kept comparison page shows NO "source chart has changed" chip ' +
   'after clicking around panels');
const srcOk = await page.evaluate(() => {
    const P = window.PS_SHELL.project;
    const id = P.activeChart;
    for (const b of (P.pinboards || []))
        for (const p of (b.pins || []))
            if (p.srcSig) {
                const sn = window.PS_SHELL.snapshotOf(p.srcChart);
                return sn ? { srcSig: p.srcSig, cur: sn.svg } : null;
            }
    return null;
});
ok(srcOk && sig(srcOk.cur) === srcOk.srcSig,
   'the pin srcSig equals the live snapshot signature exactly');

console.log('case 4: a kept picture never carries the selection box');
await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
await page.waitForTimeout(1200);
// select the value axis (ants + handles on the chart), then keep the
// chart through the REAL right-click menu
await clickChartEl('[data-role="y-axis-line"], [data-role="axis-line"]');
await page.waitForTimeout(600);
const liveHasChrome = await page.evaluate(() =>
    !!document.querySelector(
        '.graphbuilder2-host [data-role="inspector-indicator"] > *'));
ok(liveHasChrome, 'setup: the live chart carries selection chrome at keep time');
const pinsBefore = await page.evaluate(() =>
    (window.PS_SHELL.project.pinboards || [])
        .reduce((n, b) => n + (b.pins || []).length, 0));
const org = await page.evaluate(() => {
    const h = document.querySelector('.graphbuilder2-host');
    let best = null, a = 0;
    for (const s of h.querySelectorAll('svg')) {
        const r = s.getBoundingClientRect();
        if (r.width * r.height > a) { a = r.width * r.height; best = r; }
    }
    return { x: best.x, y: best.y };
});
await page.mouse.click(org.x + 40, org.y + 20, { button: 'right' });
await page.waitForTimeout(300);
await page.evaluate(() => {
    const list = [...document.querySelectorAll(
        '#ps-contextmenu [role="menuitem"], #ps-contextmenu button')];
    (list.find(n => /keep to notebook/i.test(n.textContent))).click();
});
await page.waitForTimeout(300);
await page.evaluate(() => {
    const list = [...document.querySelectorAll(
        '#ps-contextmenu [role="menuitem"], #ps-contextmenu button')];
    (list.find(n => /section/i.test(n.textContent))).click();
});
await page.waitForTimeout(900);
const keptPic = await page.evaluate(() => {
    const P = window.PS_SHELL.project;
    let txt = null, count = 0;
    for (const b of (P.pinboards || []))
        for (const p of (b.pins || [])) {
            count++;
            txt = decodeURIComponent(p.src.slice(p.src.indexOf(',') + 1));
        }
    if (!txt) return { count, chrome: null };
    const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
    const groups = ['inspector-indicator', 'inspector-indicator-back',
                    'inspector-indicator-under', 'inspector-bar-glow',
                    'selection-group', 'alignment-guides'];
    const nonEmpty = groups.filter(g => {
        const el = doc.querySelector('[data-role="' + g + '"]');
        return el && el.childElementCount > 0;
    });
    const loose = ['refline-handle', 'ann-rot-handle', 'ann-rot-line',
                   'data-point-selected']
        .filter(r => doc.querySelector('[data-role="' + r + '"]'));
    return { count, chrome: nonEmpty.concat(loose) };
});
ok(keptPic.count === pinsBefore + 1, 'the chart was kept as a page');
ok(Array.isArray(keptPic.chrome) && keptPic.chrome.length === 0,
   'the kept page picture contains no selection chrome (' +
   JSON.stringify(keptPic.chrome) + ')');

console.log('case 5: every module re-captures byte-identically across an echo');
const mods = await page.evaluate(() => Object.keys(window.PS_TEMPLATES || {}));
const roleSets = {
    plotbuilder: { xvar: 'condition', yvar: 'score' },
    freqplotbuilder: { var: 'condition' },
    distplotbuilder: { var: 'score' },
    xyplotbuilder: { xvar: 'hours', yvar: 'score' },
    corrplotbuilder: { vars: ['score', 'hours'] },
    likertplotbuilder: null,   // sample table has no battery; skipped
    rmplotbuilder: null        // no wide measures in the sample; skipped
};
for (const mod of mods) {
    if (!(mod in roleSets)) continue;
    const rr = roleSets[mod];
    if (!rr) { console.log(`  ..  ${mod}: no fitting sample columns, skipped`); continue; }
    const okRoles = await page.evaluate(({ mod, rr }) => {
        const cols = window.PS_SHELL.project.table.order;
        for (const k of Object.keys(rr)) {
            const want = rr[k];
            const list = Array.isArray(want) ? want : [want];
            for (const w of list) if (cols.indexOf(w) === -1) return false;
        }
        window.PS_SHELL.setModule(mod);
        window.PS_SHELL.setRoles(mod, rr);
        return true;
    }, { mod, rr });
    if (!okRoles) { console.log(`  ..  ${mod}: sample columns missing, skipped`); continue; }
    await page.waitForTimeout(1400);
    const a = await snapSvg();
    if (!a) { console.log(`  ..  ${mod}: no capture (placeholder?), skipped`); continue; }
    await echo();
    const b = await snapSvg();
    ok(a === b, `${mod}: echo re-capture is byte-identical`);
}

ok(errors.length === 0, 'zero page errors (' + errors.length + ')');
console.log('NOTEBOOK DRIFT CHECK PASS');
await browser.close();
