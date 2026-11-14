// A scatter point's hover ring must go out when the pointer leaves, even
// when the app took a picture of the chart while the pointer rested there.
//
// The app serializes the chart shortly after every rebuild and again a few
// seconds later. To keep hover marks out of that picture the engine sends
// the hovered mark a leave, copies the chart, and puts every attribute
// back. The scatter points share one hover handler that remembers the lit
// point in a variable of its own; the leave made it forget, the put-back
// lit the ring again, and from then on nothing switched that ring off. The
// next point hovered or tapped got a second ring, and the readout stayed
// up after the pointer left (a phone showed it most: a tapped point stays
// hovered until the next tap, so any picture in between stranded it).
//
// The engine now marks the leaves it sends for a harvest, and the handler
// keeps its lit point through them. This probe hovers a point with a
// mouse, waits for the app's own snapshot to run while the pointer rests
// there, then moves to a second point and away.
//   1. one ring while resting, before and after the snapshot,
//   2. moving to another point leaves exactly one ring, on that point,
//   3. moving away leaves none, and the readout is gone.
// Control: PS_PAGE at a page from before the change goes red at 2 and 3.
// scripts/verify/hover-export-check.mjs checks the same for every other
// hover target, on the engine alone.
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
let failed = 0;
function check(cond, msg) {
    if (!cond) failed++;
    console.log((cond ? '  ok  ' : ' FAIL ') + msg);
}

const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 140)));
await page.addInitScript(() => { try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); } catch (e) {} });
await page.goto(pageUrl); await page.waitForTimeout(900);
await page.locator('#ps-welcome-sample').click(); await page.waitForTimeout(2400);
await page.evaluate(() => { const S = window.PS_SHELL, t = S.project.table;
    const nums = t.order.filter(c => t.types[c] === 'continuous');
    S.addChart('xyplotbuilder'); S.setRoles('xyplotbuilder', { xvar: nums[0], yvar: nums[1] || nums[0] }); });
await page.waitForTimeout(3000);

// A point's ring is the hit circle drawn right after it; lit means stroked.
const state = () => page.evaluate(() => {
    const pts = [...document.querySelectorAll('.graphbuilder2-host svg [data-role="xy-point"]')];
    const tip = document.querySelector('[data-role="xy-tooltip"]');
    return { n: pts.length,
        lit: pts.map((q, i) => { const h = q.nextElementSibling; return h && h.getAttribute('stroke') && h.getAttribute('stroke') !== 'none' ? i : -1; }).filter(i => i >= 0),
        tip: !!tip && tip.style.display !== 'none' && tip.getBoundingClientRect().width > 0 };
});
const centre = i => page.evaluate(i => { const q = document.querySelectorAll('.graphbuilder2-host svg [data-role="xy-point"]')[i];
    q.scrollIntoView({ block: 'center' }); const r = q.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, i);

const n = (await state()).n;
check(n >= 6, 'a scatter with points to hover (' + n + ')');
const A = 1, B = n - 2;

// Count the app's own serializations, then make an edit so a rebuild and its
// snapshots are on the way, and rest the pointer on a point before they run.
await page.evaluate(() => { window.__ser = 0; const o = XMLSerializer.prototype.serializeToString;
    XMLSerializer.prototype.serializeToString = function (node) { window.__ser++; return o.call(this, node); }; });
await page.evaluate(() => { window.__svg0 = document.querySelector('.graphbuilder2-host svg[data-role="gb2-chart-svg"]');
    window.__gb2_setOption('chartTitle', 'Ring check'); });
await page.waitForFunction(() => document.querySelector('.graphbuilder2-host svg[data-role="gb2-chart-svg"]') !== window.__svg0, null, { timeout: 9000 });
const ser0 = await page.evaluate(() => window.__ser);
const a = await centre(A);
await page.mouse.move(a.x - 40, a.y - 40); await page.mouse.move(a.x, a.y, { steps: 4 }); await page.waitForTimeout(200);
const resting = await state();
check(resting.lit.length === 1 && resting.lit[0] === A && resting.tip, 'resting on a point lights its ring and shows its readout (lit ' + JSON.stringify(resting.lit) + ')');
await page.waitForFunction(k => window.__ser > k, ser0, { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(300);
const snaps = (await page.evaluate(() => window.__ser)) - ser0;
const after = await state();
check(snaps >= 1, 'the app took its picture of the chart while the pointer rested there (' + snaps + ' serialization' + (snaps === 1 ? '' : 's') + ')');
check(after.lit.length === 1 && after.lit[0] === A && after.tip, 'and the ring and readout are as they were (lit ' + JSON.stringify(after.lit) + ')');

const b = await centre(B);
await page.mouse.move(b.x, b.y, { steps: 6 }); await page.waitForTimeout(250);
const moved = await state();
check(moved.lit.length === 1 && moved.lit[0] === B, 'moving to another point leaves one ring, on that point (lit ' + JSON.stringify(moved.lit) + ')');

await page.mouse.move(b.x + 220, b.y + 160, { steps: 6 }); await page.waitForTimeout(250);
const away = await state();
check(away.lit.length === 0 && !away.tip, 'moving away leaves no ring and no readout (lit ' + JSON.stringify(away.lit) + ', readout ' + (away.tip ? 'up' : 'gone') + ')');

check(errors.length === 0, 'no page errors ' + errors.slice(0, 2).join(' | '));
await browser.close();
if (failed) { console.error('SCATTER RING CHECK FAILED (' + failed + ')'); process.exit(1); }
console.log('SCATTER RING CHECK PASS');
