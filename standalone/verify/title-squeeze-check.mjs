// The inspector title bar is one no-wrap row: the element name on the left,
// the Applies-to cluster and the eye on the right. When the panel narrows,
// flexbox squeezes the name's cell - but an unclamped inline-flex crumb went
// on painting at its natural width, so a long level name ran straight through
// the cluster (Torry, Sep 2026, seen below the chart and reproducible in a
// narrowed jamovi results column).
//
// The clamp has to hold at squeezed widths AND stay inert where there is
// room, since a fix that always truncates would be worse than the bug.
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

const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
let fails = 0;
function ok(cond, msg) {
    console.log((cond ? '  ok  ' : ' FAIL ') + msg);
    if (!cond) fails++;
}

await page.addInitScript(() => {
    try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); } catch (e) {}
});
await page.goto(pageUrl);
await page.waitForTimeout(900);
if (await page.locator('#ps-welcome').isVisible().catch(() => false)) {
    try { await page.locator('#ps-welcome-blank, #ps-welcome-close').first().click({ timeout: 1500 }); }
    catch (e) { /* the dialog is optional */ }
    await page.waitForTimeout(400);
}

// Level names long enough to outgrow a squeezed cell, which is what real
// survey and course data looks like.
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const S = window.PS_SHELL, rows = [];
    const cats = ['Undergraduate students living on campus',
                  'Graduate students commuting from off campus'];
    const vals = [4, 6, 9, 11, 14, 15];
    for (const c of cats) for (const v of vals) for (const g of cats) rows.push([c, g, v]);
    S.loadTable('t', ['x', 'g', 'y'], rows, { x: 'nominal', g: 'nominal', y: 'continuous' });
    S.setModule('plotbuilder');
    S.setRoles('plotbuilder', { xvar: 'x', yvar: 'y', groupVar: 'g' });
    S.setWorkspace('chart');
    await s(2400);
});
const bar = await page.evaluate(() => {
    const b = [...document.querySelectorAll('#psroot svg [data-bar-cat]')]
        .filter(e => e.tagName !== 'text')[0];
    const r = b.getBoundingClientRect();
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
});
await page.mouse.click(bar.cx, bar.cy);
await page.waitForSelector('[data-role="gb2-crumb"]', { timeout: 6000 });

const measure = () => page.evaluate(() => {
    const ti = document.querySelector('[data-role="inspector-title"]');
    const crumb = ti && ti.querySelector('[data-role="gb2-crumb"]');
    if (!crumb) return null;
    const cell = crumb.closest('[data-role="inspector-title"] > *') || crumb.parentElement;
    const others = [...ti.children].filter(k => !k.contains(crumb))
        .map(k => k.getBoundingClientRect()).filter(r => r.width > 0);
    const rightAt = others.length ? Math.min(...others.map(r => r.left))
        : ti.getBoundingClientRect().right;
    const cr = crumb.getBoundingClientRect(), cellR = cell.getBoundingClientRect();
    const eyebrow = crumb.children[0], line = crumb.children[1];
    const ecs = getComputedStyle(eyebrow);
    return {
        cellW: Math.round(cellR.width), crumbW: Math.round(cr.width),
        past: Math.round(cr.right - cellR.right),
        gapToCluster: Math.round(rightAt - cr.right),
        barH: Math.round(ti.getBoundingClientRect().height),
        clipped: line.scrollWidth > line.clientWidth + 1,
        ebPast: Math.round(eyebrow.getBoundingClientRect().right - cellR.right),
        ebNoWrap: ecs.whiteSpace === 'nowrap' && ecs.textOverflow === 'ellipsis'
    };
});

// A wide window first: this is the reference the clamp must not disturb.
const wide = await measure();
ok(!!wide, 'the bar panel opens with a breadcrumb title');
ok(wide && wide.past === 0 && wide.gapToCluster > 0,
   `with room, the name sits inside its cell and clear of the cluster (${JSON.stringify(wide)})`);
ok(wide && !wide.clipped, 'and it is shown in full, not truncated');
ok(wide && wide.ebNoWrap, 'the eyebrow is clipped rather than wrappable');

const baseH = wide ? wide.barH : 0;
for (const W of [1050, 950, 900, 820]) {
    await page.setViewportSize({ width: W, height: 900 });
    await page.waitForTimeout(400);
    const m = await measure();
    ok(!!m, `title still present at ${W}px`);
    ok(m && m.past <= 0,
       `name never paints past its cell at ${W}px (past ${m ? m.past : '?'}px)`);
    ok(m && m.ebPast <= 0,
       `eyebrow stays inside the cell at ${W}px (past ${m ? m.ebPast : '?'}px)`);
    ok(m && m.gapToCluster > 0,
       `name stays clear of the Applies-to cluster at ${W}px (gap ${m ? m.gapToCluster : '?'}px)`);
    ok(m && m.barH === baseH,
       `title bar does not grow taller at ${W}px (${m ? m.barH : '?'} vs ${baseH})`);
}

// Back to a wide window: the clamp must release, not stick.
await page.setViewportSize({ width: 1400, height: 900 });
await page.waitForTimeout(400);
const back = await measure();
ok(back && !back.clipped && back.past === 0,
   `widening shows the whole name again (${JSON.stringify(back)})`);

if (errors.length) { console.log('page errors: ' + errors.join(' | ')); fails++; }
console.log(fails ? `TITLE SQUEEZE CHECK: ${fails} FAILED` : 'TITLE SQUEEZE CHECK PASS');
await browser.close();
process.exit(fails ? 1 : 0);
