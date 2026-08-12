// The Export button hides ONLY where jamovi owns export natively (the
// Svg element). Three-way guard:
//   1. plain page (standalone shape): button present, panel opens
//   2. jmv-results-html (production jamovi): button STAYS (no native
//      export for the interactive chart there yet)
//   3. jmv-results-svg (Damo's world): button hidden, stale export
//      selection lands on Basics
import { createRequire } from 'node:module';
const { chromium } = createRequire('/tmp/x.js')('playwright');
const b = await chromium.launch();
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ok   ' : '  FAIL ') + m); };

const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });

async function state(page) {
  return page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((x) => x.title === 'Export plot');
    return { present: !!btn && btn.offsetParent !== null };
  });
}
async function load(page) {
  await page.addInitScript(() => { window.setOption = function () {}; });
  await page.goto('file:///tmp/gb2-verify/cg_bar_labels.html');
  await page.waitForTimeout(1600);
}
async function wrapIn(page, tag) {
  await page.evaluate((t) => {
    const host = document.querySelector('.graphbuilder2-host');
    const wrap = document.createElement(t);
    host.parentNode.insertBefore(wrap, host);
    wrap.appendChild(host);
    window.__gb2_lastRenderedHash = null;
    const s = [...document.scripts].find((x) => /GraphBuilder2\.render\(/.test(x.textContent || ''));
    (0, eval)(s.textContent);
  }, tag);
  await page.waitForTimeout(700);
}

// 1. plain
const p1 = await ctx.newPage();
await load(p1);
const s1 = await state(p1);
ok(s1.present, 'plain page: Export button present (standalone behavior)');
await p1.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((x) => x.title === 'Export plot');
  for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
    btn.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true }));
});
await p1.waitForTimeout(400);
const t1 = await p1.evaluate(() => (document.querySelector('[data-role="inspector-title"]') || {}).textContent || '');
ok(/Export/.test(t1), 'plain page: export panel opens (' + t1 + ')');
await p1.close();

// 2. production jamovi (Html element)
const p2 = await ctx.newPage();
await load(p2);
await wrapIn(p2, 'jmv-results-html');
const s2 = await state(p2);
ok(s2.present, 'jmv-results-html: Export button STAYS (production keeps it)');
await p2.close();

// 3. Svg element: hidden + stale selection redirect
const p3 = await ctx.newPage();
await load(p3);
// open the export panel first so the stale-session path is exercised
await p3.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((x) => x.title === 'Export plot');
  for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
    btn.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true }));
});
await p3.waitForTimeout(300);
await wrapIn(p3, 'jmv-results-svg');
const s3 = await state(p3);
ok(!s3.present, 'jmv-results-svg: Export button hidden');
await p3.close();

console.log(`\nVERDICT: ${pass} pass, ${fail} fail => ${fail === 0 ? 'PASS' : 'FAIL'}`);
await b.close();
process.exit(fail === 0 ? 0 : 1);
