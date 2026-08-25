// Gap seams (Aug 24 2026): hover the space between categories on a cg
// bar-family chart, dwell 350ms, a dashed seam + grip arms; dragging
// edits categoryGap live (2x pointer travel = 1:1 flanking-edge
// tracking) and commits on release. The playground ruling set, pinned
// against the REAL app: one seam at a time, the dwell identical every
// time (no chain), Esc dismiss + suppress, no floor (touching bars stay
// recoverable), unarmed presses fall through, stats mode disarms, and
// jamovi-inertness (the key stripped at the GraphBuilder2.render
// boundary leaves everything inert).
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
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible().catch(() => false)) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1800);
}
try {
    const got = page.locator('button', { hasText: 'Got it' }).first();
    if (await got.isVisible()) { await got.click(); await page.waitForTimeout(300); }
} catch {}

// Adjacent-bar boundaries in CLIENT coords, from the real rendered bars.
async function boundaries() {
    return page.evaluate(() => {
        const svgs = [...document.querySelectorAll('.graphbuilder2-host svg')]
            .sort((a, b) => b.clientWidth * b.clientHeight -
                            a.clientWidth * a.clientHeight);
        const svg = svgs[0];
        const seen = {};
        for (const b of svg.querySelectorAll('path[data-bar-cat]')) {
            const c = b.getAttribute('data-bar-cat');
            if (!seen[c]) seen[c] = b.getBoundingClientRect();
        }
        const rects = Object.values(seen).sort((a, b) => a.left - b.left);
        const out = [];
        for (let i = 1; i < rects.length; i++) {
            out.push({ x: (rects[i - 1].right + rects[i].left) / 2,
                       y: (rects[i].top + rects[i].bottom) / 2,
                       gapPx: rects[i].left - rects[i - 1].right });
        }
        return { seams: out, barW: rects[0].width,
                 parkX: rects[0].left - 60, parkY: rects[0].top - 40 };
    });
}
const chrome = () => page.evaluate(() =>
    document.querySelectorAll('[data-role="gap-seam-chrome"]').length);
const specGap = () => page.evaluate(() => {
    try {
        return JSON.parse(window.PS_SHELL.buildPayload().chartSpec).categoryGap;
    } catch (e) { return undefined; }
});

let B = await boundaries();
ok(B.seams.length >= 2, `found ${B.seams.length} category boundaries`);

console.log('case 1: a sweep across the chart draws nothing');
await page.mouse.move(B.parkX, B.seams[0].y);
await page.mouse.move(B.seams[1].x + 200, B.seams[0].y, { steps: 12 });
await page.waitForTimeout(80);
ok(await chrome() === 0, 'fast sweep armed no seam');

console.log('case 2: a 350ms dwell arms exactly one seam');
await page.mouse.move(B.seams[0].x, B.seams[0].y);
await page.waitForTimeout(600);
ok(await chrome() === 1, 'dwell armed the seam');
const tipTxt = await page.evaluate(() =>
    document.querySelector('[data-role="gap-seam-chrome"]').textContent);
ok(tipTxt.includes('Gap between categories'), 'tooltip names the gap kind');

console.log('case 3: no chain - the next gap pays the same full dwell');
await page.mouse.move(B.seams[1].x, B.seams[1].y);
await page.waitForTimeout(150);
ok(await chrome() === 0, 'adjacent gap does NOT arm instantly');
await page.waitForTimeout(500);
ok(await chrome() === 1, 'it arms after its own full dwell');

console.log('case 4: Esc dismisses and suppresses until the pointer leaves');
await page.keyboard.press('Escape');
await page.waitForTimeout(80);
ok(await chrome() === 0, 'Esc cleared the seam');
await page.mouse.move(B.seams[1].x + 3, B.seams[1].y + 10);
await page.waitForTimeout(600);
ok(await chrome() === 0, 'same gap stays suppressed after a dwell');
await page.mouse.move(B.parkX, B.parkY);
await page.waitForTimeout(100);
await page.mouse.move(B.seams[1].x, B.seams[1].y);
await page.waitForTimeout(600);
ok(await chrome() === 1, 'leaving and returning re-arms after a dwell');

console.log('case 5: drag widens live, opens the Gap tab live, commits');
const gapBefore = await specGap();
await page.mouse.down();
await page.mouse.move(B.seams[1].x + 25, B.seams[1].y, { steps: 5 });
await page.waitForTimeout(120);
const midDrag = await page.evaluate(() => {
    const pnl = document.querySelector('.gb2-panel');
    const r = pnl ? pnl.querySelector('input[data-field="cat"]') : null;
    const st = window.__gb2_gapSeam;
    return { open: !!pnl && pnl.style.display !== 'none',
             tab: window.__gb2_bsActiveTab,
             slider: r ? parseFloat(r.value) : null,
             live: st && st.drag ? st.drag.cur : null,
             shading: document.querySelectorAll('[data-role="gap-shade"]').length };
});
ok(midDrag.open && midDrag.tab === 'gap',
   'the seam drag opened the panel on the Gap tab');
ok(midDrag.shading === 0,
   'and the old gap-shading bands are gone (the seam is the affordance now)');
ok(midDrag.slider != null && midDrag.live != null &&
   Math.abs(midDrag.slider - midDrag.live) < 0.02,
   `the Gap slider tracks the drag live (${midDrag.slider} vs ${midDrag.live})`);
await page.mouse.up();
await page.waitForTimeout(200);
const B2 = await boundaries();
ok(B2.barW < B.barW - 4,
   `bars narrowed live (${B.barW.toFixed(1)} -> ${B2.barW.toFixed(1)})`);
ok(await chrome() === 1, 'the seam just dragged stays armed for re-grab');
await page.waitForTimeout(1400);
const gapAfter = await specGap();
ok(typeof gapAfter === 'number' && gapAfter > (gapBefore ?? 0.2) + 0.02,
   `categoryGap committed (${gapBefore ?? '(default 0.2)'} -> ${gapAfter})`);

console.log('case 6: an unarmed press-drag falls through');
await page.mouse.move(B.parkX, B.parkY);
await page.waitForTimeout(150);
B = await boundaries();
await page.mouse.move(B.seams[0].x, B.seams[0].y);   // no dwell
await page.mouse.down();
await page.mouse.move(B.seams[0].x + 30, B.seams[0].y, { steps: 3 });
await page.mouse.up();
await page.waitForTimeout(250);
const B3 = await boundaries();
ok(Math.abs(B3.barW - B.barW) < 1.5,
   `no seam, no gap change (${B.barW.toFixed(1)} -> ${B3.barW.toFixed(1)})`);

console.log('case 7: touching bars stay recoverable (no floor)');
await page.mouse.move(B3.seams[0].x, B3.seams[0].y);
await page.waitForTimeout(600);
ok(await chrome() === 1, 'seam armed for the narrowing drag');
await page.mouse.down();
await page.mouse.move(B3.seams[0].x - 300, B3.seams[0].y, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(250);
const B4 = await boundaries();
ok(B4.seams[0].gapPx < 2, `bars driven to touching (gap ${B4.seams[0].gapPx.toFixed(1)}px)`);
await page.mouse.move(B4.parkX, B4.parkY);
await page.waitForTimeout(120);
await page.mouse.move(B4.seams[0].x, B4.seams[0].y);
await page.waitForTimeout(600);
ok(await chrome() === 1, 'the seam still arms with bars touching');
await page.mouse.down();
await page.mouse.move(B4.seams[0].x + 40, B4.seams[0].y, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(250);
const B5 = await boundaries();
ok(B5.seams[0].gapPx > 6, `and dragging pulled them back apart (${B5.seams[0].gapPx.toFixed(1)}px)`);

console.log('case 8: statistics mode disarms the seams');
await page.evaluate(() => {
    const btns = [...document.querySelectorAll(
        '.graphbuilder2-host [data-role="chart-toolbar"] button')];
    const b = btns.find(x => /statistic|Σ/i.test(
        (x.textContent || '') + ' ' + (x.getAttribute('title') || '')));
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await page.waitForTimeout(1000);
const B6 = await boundaries();
await page.mouse.move(B6.parkX, B6.parkY);
await page.waitForTimeout(100);
await page.mouse.move(B6.seams[0].x, B6.seams[0].y);
await page.waitForTimeout(650);
ok(await chrome() === 0, 'no seam arms while the Sigma panel is open');
await page.evaluate(() => {
    const c = document.querySelector('[data-role="st-close-btn"]');
    if (c) c.click();
});
await page.waitForTimeout(500);

console.log('case 8b: UNGROUPED line stays seamless by design');
await page.evaluate(() => { window.setOption('graphType', 'line'); });
await page.waitForTimeout(1600);
const lm = await page.evaluate(() => {
    const svg = [...document.querySelectorAll('.graphbuilder2-host svg')]
        .sort((a, b) => b.clientWidth * b.clientHeight -
                        a.clientWidth * a.clientHeight)[0];
    const ms = [...svg.querySelectorAll('[data-role="line-marker"]')]
        .map(m => m.getBoundingClientRect())
        .sort((a, b) => a.left - b.left);
    return ms.length >= 2 ? { x: (ms[0].right + ms[1].left) / 2,
                              y: (ms[0].top + ms[0].bottom) / 2 } : null;
});
ok(!!lm, 'ungrouped line rendered with markers');
await page.mouse.move(lm.x - 150, lm.y - 120);
await page.waitForTimeout(120);
await page.mouse.move(lm.x, lm.y + 60);
await page.waitForTimeout(650);
ok(await chrome() === 0, 'no seam arms on an ungrouped line (nothing the options move)');

console.log('case 8c: GROUPED dot gets the Marker-spread seam');
const ctxG = await browser.newContext();
const pageG = await ctxG.newPage({ viewport: { width: 1500, height: 1000 } });
const errG = [];
pageG.on('pageerror', e => errG.push(String(e)));
await pageG.goto(pageUrl);
await pageG.waitForTimeout(1300);
const rowsG = [];
for (const d of ['Placebo', 'Drug A', 'Drug B'])
    for (const sx of ['F', 'M'])
        for (let i = 0; i < 10; i++)
            rowsG.push(`${d},${sx},${40 + ((i * 7 + (sx === 'M' ? 3 : 0)) % 17)}`);
await pageG.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button'))
        .find(x => /^\s*Paste data\s*$/.test(x.textContent) ||
                   /^\s*Open\s*$/.test(x.textContent));
    b.click();
});
await pageG.waitForTimeout(500);
await pageG.fill('#ps-paste', 'drug,sex,anxiety\n' + rowsG.join('\n') + '\n');
await pageG.click('#ps-paste-use');
await pageG.waitForTimeout(800);
try { await pageG.click('button:has-text("Import data")', { timeout: 2500 }); } catch {}
await pageG.waitForTimeout(1700);
await pageG.evaluate(() => window.PS_SHELL.setRoles('plotbuilder',
    { xvar: 'drug', yvar: 'anxiety', groupVar: 'sex' }));
await pageG.waitForTimeout(2000);
await pageG.evaluate(() => { window.setOption('graphType', 'dot'); });
await pageG.waitForTimeout(1600);
const gm = await pageG.evaluate(() => {
    const svg = [...document.querySelectorAll('.graphbuilder2-host svg')]
        .sort((a, b) => b.clientWidth * b.clientHeight -
                        a.clientWidth * a.clientHeight)[0];
    const ms = [...svg.querySelectorAll('[data-role="line-marker"]')]
        .map(m => { const r = m.getBoundingClientRect();
                    return { l: r.left, r: r.right, cy: (r.top + r.bottom) / 2 }; })
        .sort((a, b) => a.l - b.l);
    if (ms.length < 4) return null;
    // Hover BELOW every marker: the dot chart keeps its line-series-hit
    // paths (width-0 line convention) at the data heights, and they
    // rightly win the hover, so the probe aims under the lowest mark.
    const rB = svg.getBoundingClientRect();
    const lowY = Math.min(Math.max(...ms.map(m => m.cy)) + 55, rB.bottom - 90);
    // first two markers = the first slot's dodged pair; markers 2 and 3
    // straddle the first between-category boundary
    return { within: { x: (ms[0].r + ms[1].l) / 2, y: lowY },
             between: { x: (ms[1].r + ms[2].l) / 2, y: lowY },
             pair0: ms[1].l - ms[0].r,
             n: ms.length };
});
ok(!!gm && gm.n === 6, `grouped dot rendered (${gm ? gm.n : 0} markers)`);
const chromeG = () => pageG.evaluate(() =>
    document.querySelectorAll('[data-role="gap-seam-chrome"]').length);
await pageG.mouse.move(gm.within.x - 200, gm.within.y - 150);
await pageG.waitForTimeout(120);
await pageG.mouse.move(gm.within.x, gm.within.y);
await pageG.waitForTimeout(650);
ok(await chromeG() === 1, 'within-group seam arms between dodged dots');
let lblG = await pageG.evaluate(() =>
    document.querySelector('[data-role="gap-seam-chrome"]').textContent);
ok(lblG.includes('Marker spread'), 'and names it Marker spread (the line-family spacing)');
await pageG.mouse.down();
await pageG.mouse.move(gm.within.x + 20, gm.within.y, { steps: 4 });
await pageG.mouse.up();
await pageG.waitForTimeout(1500);
const bg = await pageG.evaluate(() => {
    try { return JSON.parse(window.PS_SHELL.buildPayload().chartSpec).lineMarkerSpread; }
    catch (e) { return undefined; }
});
ok(typeof bg === 'number' && bg > 0.36 && bg <= 1,
   `within drag committed lineMarkerSpread (${bg}, from the 0.35 default)`);
const pairAfter = await pageG.evaluate(() => {
    const svg = [...document.querySelectorAll('.graphbuilder2-host svg')]
        .sort((a, b) => b.clientWidth * b.clientHeight -
                        a.clientWidth * a.clientHeight)[0];
    const ms = [...svg.querySelectorAll('[data-role="line-marker"]')]
        .map(m => m.getBoundingClientRect()).sort((a, b) => a.left - b.left);
    return ms[1].left - ms[0].right;
});
ok(pairAfter > gm.pair0 + 2,
   `and the dodged pair visibly spread (${gm.pair0.toFixed(1)} -> ${pairAfter.toFixed(1)}px)`);
const dotPanel = await pageG.evaluate(() => {
    const pnl = document.querySelector('.gb2-panel');
    const r = pnl ? pnl.querySelector('input[data-field="marker-spread"]') : null;
    return { tab: window.__gb2_lsActiveTab,
             slider: r ? parseFloat(r.value) : null };
});
ok(dotPanel.tab === 'gap' && dotPanel.slider != null &&
   Math.abs(dotPanel.slider - bg) < 0.03,
   `dot drag opened the line panel's Gap tab with marker-spread synced (${dotPanel.slider})`);
await pageG.mouse.move(gm.within.x - 200, gm.within.y - 150);
await pageG.waitForTimeout(150);
await pageG.mouse.move(gm.between.x, gm.between.y);
await pageG.waitForTimeout(650);
ok(await chromeG() === 0,
   'no between-cluster seam on line/dot: marker spread owns spacing there');
ok(errG.length === 0, 'no page errors on the grouped page (' + errG.join('|').slice(0, 160) + ')');
await ctxG.close();

console.log('case 8d: Repeated Measures gets the seams too');
const ctxR = await browser.newContext();
const pageR = await ctxR.newPage({ viewport: { width: 1500, height: 1000 } });
const errR = [];
pageR.on('pageerror', e => errR.push(String(e)));
await pageR.goto(pageUrl);
await pageR.waitForTimeout(1300);
await pageR.evaluate(() => {
    const card = Array.from(document.querySelectorAll('button, [role="button"], div'))
        .find(x => /Reaction time practice/.test(x.textContent || '') &&
                   x.getBoundingClientRect().height < 90 &&
                   x.getBoundingClientRect().height > 20);
    card.click();
});
await pageR.waitForTimeout(2200);
try {
    const gotR = pageR.locator('button', { hasText: 'Got it' }).first();
    if (await gotR.isVisible()) { await gotR.click(); await pageR.waitForTimeout(300); }
} catch {}
await pageR.evaluate(() => { window.setOption('graphType', 'bar'); });
await pageR.waitForTimeout(1600);
const rB = await pageR.evaluate(() => {
    const svg = [...document.querySelectorAll('.graphbuilder2-host svg')]
        .sort((a, b) => b.clientWidth * b.clientHeight -
                        a.clientWidth * a.clientHeight)[0];
    // ALL bars, no per-category dedupe: on a grouped chart the first
    // adjacent pair straddles the true within gap (a deduped list put
    // the "midpoint" on top of the second group's bar).
    const rects = [...svg.querySelectorAll('path[data-bar-cat]')]
        .map(m => m.getBoundingClientRect()).sort((a, b) => a.left - b.left);
    if (rects.length < 2) return null;
    return { x: (rects[0].right + rects[1].left) / 2,
             y: (rects[0].top + rects[0].bottom) / 2,
             parkX: rects[0].left - 60, parkY: rects[0].top - 40 };
});
ok(!!rB, 'RM sample rendered as bars');
await pageR.mouse.move(rB.parkX, rB.parkY);
await pageR.waitForTimeout(120);
await pageR.mouse.move(rB.x, rB.y);
await pageR.waitForTimeout(650);
const rmChrome = () => pageR.evaluate(() =>
    document.querySelectorAll('[data-role="gap-seam-chrome"]').length);
ok(await rmChrome() === 1, 'a seam arms on Repeated Measures');
const rmLabel = await pageR.evaluate(() =>
    document.querySelector('[data-role="gap-seam-chrome"]').textContent);
await pageR.mouse.down();
await pageR.mouse.move(rB.x + 20, rB.y, { steps: 4 });
await pageR.mouse.up();
await pageR.waitForTimeout(1500);
const rmSpec = await pageR.evaluate(() => {
    try { return JSON.parse(window.PS_SHELL.buildPayload().chartSpec); }
    catch (e) { return {}; }
});
const rmWithin = /within a group/.test(rmLabel);
ok(rmWithin ? (typeof rmSpec.barGap === 'number' && rmSpec.barGap > 0.005)
            : (typeof rmSpec.categoryGap === 'number' && rmSpec.categoryGap > 0.22),
   `RM drag committed ${rmWithin ? 'barGap' : 'categoryGap'} through rm's chartSpec ` +
   `(${rmWithin ? rmSpec.barGap : rmSpec.categoryGap}; seam was "${rmLabel.slice(0, 30)}")`);
ok(errR.length === 0, 'no page errors on the RM page');
await ctxR.close();

console.log('case 8e: Frequencies bars - between always, within only when dodged');
const ctxF = await browser.newContext();
const pageF = await ctxF.newPage({ viewport: { width: 1500, height: 1000 } });
const errF = [];
pageF.on('pageerror', e => errF.push(String(e)));
await pageF.goto(pageUrl);
await pageF.waitForTimeout(1300);
await pageF.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button'))
        .find(x => /^\s*Paste data\s*$/.test(x.textContent) ||
                   /^\s*Open\s*$/.test(x.textContent));
    btn.click();
});
await pageF.waitForTimeout(500);
const rowsF = [];
for (const d of ['Placebo', 'Drug A', 'Drug B'])
    for (const sx of ['F', 'M'])
        for (let i = 0; i < 8; i++) rowsF.push(`${d},${sx}`);
await pageF.fill('#ps-paste', 'drug,sex\n' + rowsF.join('\n') + '\n');
await pageF.click('#ps-paste-use');
await pageF.waitForTimeout(800);
try { await pageF.click('button:has-text("Import data")', { timeout: 2500 }); } catch {}
await pageF.waitForTimeout(1700);
await pageF.evaluate(() => {
    window.PS_SHELL.addChart('freqplotbuilder');
});
await pageF.waitForTimeout(700);
await pageF.evaluate(() => window.PS_SHELL.setRoles('freqplotbuilder',
    { var: 'drug', groupVar: 'sex' }));
await pageF.waitForTimeout(2000);
const fB = await pageF.evaluate(() => {
    const svg = [...document.querySelectorAll('.graphbuilder2-host svg')]
        .sort((a, b) => b.clientWidth * b.clientHeight -
                        a.clientWidth * a.clientHeight)[0];
    const ms = [...svg.querySelectorAll('path[data-bar-cat]')]
        .map(m => m.getBoundingClientRect()).sort((a, b) => a.left - b.left);
    if (ms.length < 4) return null;
    return { within: (ms[0].right + ms[1].left) / 2,
             between: (ms[1].right + ms[2].left) / 2,
             y: (ms[0].top + ms[0].bottom) / 2,
             parkX: ms[0].left - 60, parkY: ms[0].top - 40, n: ms.length };
});
ok(!!fB && fB.n === 6, `freq dodge rendered (${fB ? fB.n : 0} bars)`);
const fChrome = () => pageF.evaluate(() =>
    document.querySelectorAll('[data-role="gap-seam-chrome"]').length);
await pageF.mouse.move(fB.parkX, fB.parkY);
await pageF.waitForTimeout(120);
await pageF.mouse.move(fB.within, fB.y);
await pageF.waitForTimeout(650);
let fTip = await pageF.evaluate(() => {
    const c = document.querySelector('[data-role="gap-seam-chrome"]');
    return c ? c.textContent : '';
});
ok(fTip.includes('Gap within a group'), 'dodged freq bars arm the within seam');
await pageF.evaluate(() => { window.setOption('freqPosition', 'stack'); });
await pageF.waitForTimeout(1600);
const fStack = await pageF.evaluate(() => {
    const svg = [...document.querySelectorAll('.graphbuilder2-host svg')]
        .sort((a, b) => b.clientWidth * b.clientHeight -
                        a.clientWidth * a.clientHeight)[0];
    const seen = {};
    for (const b of svg.querySelectorAll('path[data-bar-cat]')) {
        const c = b.getAttribute('data-bar-cat');
        if (!seen[c]) seen[c] = b.getBoundingClientRect();
    }
    const rects = Object.values(seen).sort((a, b) => a.left - b.left);
    return { between: (rects[0].right + rects[1].left) / 2,
             mid: (rects[0].left + rects[0].right) / 2,
             y: (rects[0].top + rects[0].bottom) / 2,
             parkX: rects[0].left - 60, parkY: rects[0].top - 40 };
});
await pageF.mouse.move(fStack.parkX, fStack.parkY);
await pageF.waitForTimeout(120);
await pageF.mouse.move(fStack.between, fStack.y);
await pageF.waitForTimeout(650);
fTip = await pageF.evaluate(() => {
    const c = document.querySelector('[data-role="gap-seam-chrome"]');
    return c ? c.textContent : '';
});
ok(fTip.includes('Gap between categories'),
   'stacked freq keeps the between seam');
ok(errF.length === 0, 'no page errors on the freq page');
await ctxF.close();

console.log('case 8f: HORIZONTAL bars get horizontal seams, drag down widens');
const ctxH = await browser.newContext();
const pageH = await ctxH.newPage({ viewport: { width: 1500, height: 1000 } });
const errH = [];
pageH.on('pageerror', e => errH.push(String(e)));
await pageH.goto(pageUrl);
await pageH.waitForTimeout(1300);
if (await pageH.locator('#ps-welcome').isVisible().catch(() => false)) {
    await pageH.click('#ps-welcome-sample');
    await pageH.waitForTimeout(1800);
}
try {
    const gotH = pageH.locator('button', { hasText: 'Got it' }).first();
    if (await gotH.isVisible()) { await gotH.click(); await pageH.waitForTimeout(300); }
} catch {}
await pageH.evaluate(() => { window.setOption('chartOrientation', 'horizontal'); });
await pageH.waitForTimeout(1700);
const hB = await pageH.evaluate(() => {
    const svg = [...document.querySelectorAll('.graphbuilder2-host svg')]
        .sort((a, b) => b.clientWidth * b.clientHeight -
                        a.clientWidth * a.clientHeight)[0];
    const rects = [...svg.querySelectorAll('path[data-bar-cat]')]
        .map(m => m.getBoundingClientRect()).sort((a, b) => a.top - b.top);
    if (rects.length < 2) return null;
    return { y: (rects[0].bottom + rects[1].top) / 2,
             x: (rects[0].left + rects[0].right) / 2,
             gap0: rects[1].top - rects[0].bottom,
             parkX: rects[0].left - 60, parkY: rects[0].top - 60 };
});
ok(!!hB, 'horizontal bars rendered');
const hChrome = () => pageH.evaluate(() =>
    document.querySelectorAll('[data-role="gap-seam-chrome"]').length);
await pageH.mouse.move(hB.parkX, hB.parkY);
await pageH.waitForTimeout(120);
await pageH.mouse.move(hB.x, hB.y);
await pageH.waitForTimeout(650);
ok(await hChrome() === 1, 'a horizontal seam arms between horizontal bars');
await pageH.mouse.down();
await pageH.mouse.move(hB.x, hB.y + 20, { steps: 4 });
await pageH.mouse.up();
await pageH.waitForTimeout(1500);
const hSpec = await pageH.evaluate(() => {
    try { return JSON.parse(window.PS_SHELL.buildPayload().chartSpec).categoryGap; }
    catch (e) { return undefined; }
});
ok(typeof hSpec === 'number' && hSpec > 0.22,
   `drag DOWN widened and committed categoryGap (${hSpec})`);
const hGapAfter = await pageH.evaluate(() => {
    const svg = [...document.querySelectorAll('.graphbuilder2-host svg')]
        .sort((a, b) => b.clientWidth * b.clientHeight -
                        a.clientWidth * a.clientHeight)[0];
    const rects = [...svg.querySelectorAll('path[data-bar-cat]')]
        .map(m => m.getBoundingClientRect()).sort((a, b) => a.top - b.top);
    return rects[1].top - rects[0].bottom;
});
ok(hGapAfter > hB.gap0 + 4,
   `the on-screen gap grew (${hB.gap0.toFixed(1)} -> ${hGapAfter.toFixed(1)}px)`);
ok(errH.length === 0, 'no page errors on the horizontal page');
await ctxH.close();

console.log('case 8g: Likert rows get the Row-gap seam');
const ctxL = await browser.newContext();
const pageL = await ctxL.newPage({ viewport: { width: 1500, height: 1000 } });
const errL = [];
pageL.on('pageerror', e => errL.push(String(e)));
await pageL.goto(pageUrl);
await pageL.waitForTimeout(1300);
await pageL.evaluate(() => {
    const card = Array.from(document.querySelectorAll('button, [role="button"], div'))
        .find(x => /Course feedback survey/.test(x.textContent || '') &&
                   x.getBoundingClientRect().height < 90 &&
                   x.getBoundingClientRect().height > 20);
    card.click();
});
await pageL.waitForTimeout(2400);
try {
    const gotL = pageL.locator('button', { hasText: 'Got it' }).first();
    if (await gotL.isVisible()) { await gotL.click(); await pageL.waitForTimeout(300); }
} catch {}
const lB = await pageL.evaluate(() => {
    const svg = [...document.querySelectorAll('.graphbuilder2-host svg')]
        .sort((a, b) => b.clientWidth * b.clientHeight -
                        a.clientWidth * a.clientHeight)[0];
    if (!svg) return null;
    const byItem = {};
    for (const s of svg.querySelectorAll('[data-role="likert-seg"]')) {
        const it = s.getAttribute('data-item');
        const r = s.getBoundingClientRect();
        if (!byItem[it]) byItem[it] = { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
        else { byItem[it].top = Math.min(byItem[it].top, r.top);
               byItem[it].bottom = Math.max(byItem[it].bottom, r.bottom);
               byItem[it].left = Math.min(byItem[it].left, r.left);
               byItem[it].right = Math.max(byItem[it].right, r.right); }
    }
    const rows = Object.values(byItem).sort((a, b) => a.top - b.top);
    if (rows.length < 2) return null;
    return { y: (rows[0].bottom + rows[1].top) / 2,
             x: (rows[0].left + rows[0].right) / 2,
             parkX: rows[0].left - 60, parkY: rows[0].top - 60, n: rows.length };
});
ok(!!lB, `likert rendered with ${lB ? lB.n : 0} item rows`);
const lChrome = () => pageL.evaluate(() =>
    document.querySelectorAll('[data-role="gap-seam-chrome"]').length);
await pageL.mouse.move(lB.parkX, lB.parkY);
await pageL.waitForTimeout(120);
await pageL.mouse.move(lB.x, lB.y);
await pageL.waitForTimeout(650);
ok(await lChrome() === 1, 'the Row-gap seam arms between likert rows');
const lTip = await pageL.evaluate(() =>
    document.querySelector('[data-role="gap-seam-chrome"]').textContent);
ok(lTip.includes('Row gap'), 'and names itself Row gap');
await pageL.mouse.down();
await pageL.mouse.move(lB.x, lB.y + 15, { steps: 4 });
await pageL.waitForTimeout(150);
const lMid = await pageL.evaluate(() => {
    const pnl = document.querySelector('.gb2-panel');
    const r = pnl ? pnl.querySelector('input[data-field="lk-rowgap"]') : null;
    return { tab: window.__gb2_likertLevelTab,
             slider: r ? parseFloat(r.value) : null };
});
await pageL.mouse.up();
await pageL.waitForTimeout(1500);
const lSpec = await pageL.evaluate(() => {
    try { return JSON.parse(window.PS_SHELL.buildPayload().chartSpec).likertRowGap; }
    catch (e) { return undefined; }
});
ok(typeof lSpec === 'number' && lSpec > 0.32,
   `drag down widened and committed likertRowGap (${lSpec}, from 0.3)`);
ok(lMid.tab === 'bars' && lMid.slider != null && lMid.slider > 30,
   `the Level panel opened on Bars with the Row-gap slider tracking (${lMid.slider})`);
ok(errL.length === 0, 'no page errors on the likert page');
await ctxL.close();

console.log('case 9: inertness - a payload without the key');
const ctx2 = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page2 = await ctx2.newPage();
await page2.addInitScript(() => {
    const t = setInterval(() => {
        if (window.GraphBuilder2 && window.GraphBuilder2.render &&
            !window.GraphBuilder2.__gsless) {
            clearInterval(t);
            const orig = window.GraphBuilder2.render;
            window.GraphBuilder2.render = function (id, payload) {
                if (payload && typeof payload === 'object')
                    delete payload.gapSeams;
                return orig.apply(this, arguments);
            };
            window.GraphBuilder2.__gsless = true;
        }
    }, 5);
});
await page2.goto(pageUrl);
await page2.waitForTimeout(700);
if (await page2.locator('#ps-welcome').isVisible().catch(() => false)) {
    await page2.click('#ps-welcome-sample');
    await page2.waitForTimeout(1800);
}
const inert = await page2.evaluate(() => ({
    layout: window.__gb2_gapSeamLayout || null
}));
ok(inert.layout === null, 'layout accessor stays null without the key');
const b2 = await page2.evaluate(() => {
    const svg = [...document.querySelectorAll('.graphbuilder2-host svg')]
        .sort((a, b) => b.clientWidth * b.clientHeight -
                        a.clientWidth * a.clientHeight)[0];
    const seen = {};
    for (const b of svg.querySelectorAll('path[data-bar-cat]')) {
        const c = b.getAttribute('data-bar-cat');
        if (!seen[c]) seen[c] = b.getBoundingClientRect();
    }
    const rects = Object.values(seen).sort((a, b) => a.left - b.left);
    return { x: (rects[0].right + rects[1].left) / 2,
             y: (rects[1].top + rects[1].bottom) / 2 };
});
await page2.mouse.move(b2.x - 200, b2.y);
await page2.mouse.move(b2.x, b2.y);
await page2.waitForTimeout(650);
ok(await page2.evaluate(() =>
    document.querySelectorAll('[data-role="gap-seam-chrome"]').length) === 0,
   'no seam ever arms without the key');

ok(errors.length === 0, 'no page errors (' + errors.join(' | ').slice(0, 200) + ')');
await browser.close();
console.log('gap-seam-check: ALL OK');
