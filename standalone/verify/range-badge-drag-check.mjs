// The out-of-range warning lands wherever the chart's top-right corner is,
// which is often right on top of the data it is warning about. It can be
// collapsed but not moved, so it stayed in the way (Torry, Sep 2026:
// "collapse it and then move it out of the way").
//
// It is now draggable like the hidden-points badge, and remembers where it
// was put. This probe drags it in both states and checks that the position
// survives a collapse, an expand, and a style commit.
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
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
let fails = 0;
const ok = (cond, msg) => {
    console.log((cond ? '  ok  ' : ' FAIL ') + msg);
    if (!cond) fails++;
};

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

// A chart with visible points, then a Y range that cuts some of them off:
// that is what raises the warning in the first place.
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const S = window.PS_SHELL, rows = [];
    for (let i = 0; i < 60; i++)
        rows.push([i % 2 ? 'A' : 'B', 10 + (i % 20)]);
    S.loadTable('t', ['g', 'y'], rows, { g: 'nominal', y: 'continuous' });
    S.setModule('plotbuilder');
    S.setRoles('plotbuilder', { xvar: 'g', yvar: 'y' });
    S.setWorkspace('chart');
    await s(2400);
    window.__gb2_setOption('showDataPoints', true);
    await s(900);
    window.__gb2_setOption('yMinOverride', true);
    window.__gb2_setOption('yMin', 18);
    window.__gb2_setOption('yMaxOverride', true);
    window.__gb2_setOption('yMax', 24);
    await s(1800);
});
const badgeBox = () => page.evaluate(() => {
    const b = document.querySelector('[data-role="gb2-range-warning"]');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y),
             w: Math.round(r.width), h: Math.round(r.height),
             left: b.style.left, top: b.style.top, right: b.style.right,
             pos: window.__gb2_rangeBadgePos ? {
                 left: Math.round(window.__gb2_rangeBadgePos.left),
                 top: Math.round(window.__gb2_rangeBadgePos.top) } : null };
});

const start = await badgeBox();
ok(!!start, 'the out-of-range warning is showing');
if (!start) { console.log('RANGE BADGE DRAG CHECK: cannot continue'); await browser.close(); process.exit(1); }
ok(start.pos === null, 'and it starts in its default corner, not a stored position');

// Drag the expanded badge down and to the left, grabbing its message text
// (not the minimize button).
const from = { x: start.x + 30, y: start.y + start.h / 2 };
const to = { x: from.x - 260, y: from.y + 190 };
await page.mouse.move(from.x, from.y);
await page.mouse.down();
for (let i = 1; i <= 6; i++)
    await page.mouse.move(from.x + (to.x - from.x) * i / 6,
                          from.y + (to.y - from.y) * i / 6, { steps: 2 });
await page.mouse.up();
await page.waitForTimeout(400);
const moved = await badgeBox();
ok(moved && Math.abs(moved.x - (start.x - 260)) <= 6 &&
   Math.abs(moved.y - (start.y + 190)) <= 6,
   `the badge follows the cursor (${JSON.stringify([moved.x, moved.y])} from ` +
   `${JSON.stringify([start.x, start.y])})`);
ok(moved && moved.pos !== null, 'and the position is remembered');

// Collapsing rebuilds the badge: it must rebuild where the user left it.
await page.evaluate(() => {
    const b = document.querySelector('[data-role="gb2-range-warning"]');
    b.querySelector('button').click();
});
await page.waitForTimeout(400);
const mini = await badgeBox();
ok(mini && Math.abs(mini.x - moved.x) <= 2 && Math.abs(mini.y - moved.y) <= 2,
   `collapsing keeps the position (${JSON.stringify([mini && mini.x, mini && mini.y])})`);

// And the collapsed pill drags too.
const from2 = { x: mini.x + mini.w / 2, y: mini.y + mini.h / 2 };
await page.mouse.move(from2.x, from2.y);
await page.mouse.down();
for (let i = 1; i <= 6; i++)
    await page.mouse.move(from2.x + 120 * i / 6, from2.y - 80 * i / 6, { steps: 2 });
await page.mouse.up();
await page.waitForTimeout(400);
const mini2 = await badgeBox();
ok(mini2 && Math.abs(mini2.x - (mini.x + 120)) <= 6 &&
   Math.abs(mini2.y - (mini.y - 80)) <= 6,
   `the collapsed pill drags too (${JSON.stringify([mini2 && mini2.x, mini2 && mini2.y])})`);
const stillMini = await page.evaluate(() =>
    window.__gb2_rangeWarningMinimized === true);
ok(stillMini, 'and finishing the drag does not count as a click');

// The decisive one: the position rides the chartSpec blob, so a later style
// commit carries it and a reload puts the badge back.
const committed = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.__gb2_setOption('barCornerRadius', 9);
    await s(1200);
    try { window.dispatchEvent(new Event('beforeunload')); } catch (e) {}
    await s(400);
    let o = {};
    try { o = JSON.parse(window.PS_SHELL.buildPayload().chartSpec || '{}'); } catch (e) {}
    return { left: o.rangeBadgeLeft, top: o.rangeBadgeTop };
});
ok(typeof committed.left === 'number' && typeof committed.top === 'number',
   `the position is committed into chartSpec (${JSON.stringify(committed)})`);

if (errors.length) { console.log('page errors: ' + errors.join(' | ')); fails++; }
console.log(fails ? `RANGE BADGE DRAG CHECK: ${fails} FAILED` : 'RANGE BADGE DRAG CHECK PASS');
await browser.close();
process.exit(fails ? 1 : 0);
