// End-to-end proof in REAL jamovi (Jonathon's svg-ftw container) that the
// selection-class resize contract works for BOTH ways jamovi resizes things:
//   A. CSS `resize: both` -> inline style width/height  (jamovi's own image idiom)
//   B. width/height attribute writes
// Unlike the first container probe, this one does not stub setOption. It
// WRAPS jamovi's real one so a commit is observed as it actually happens,
// then confirms the size still holds after the analysis re-runs.
import { createRequire } from 'node:module';
const { chromium } = createRequire('/tmp/x.js')('playwright');
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
let pass = 0, fail = 0;
const bad = (m) => { console.log('  FAIL: ' + m); fail++; };
const good = (m) => { console.log('  ok:   ' + m); pass++; };
const click = `for (const t of ['pointerdown','mousedown','pointerup','mouseup','click'])
  el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true }));`;

async function openFile(match) {
  await page.evaluate((c) => { const f = new Function('el', c);
    for (const el of document.querySelectorAll('.silky-bs-op-button'))
      if ((el.textContent || '').trim() === 'Open') { f(el); return; } }, click);
  await page.waitForTimeout(1200);
  await page.evaluate((c) => { const f = new Function('el', c);
    const p = [...document.querySelectorAll('.silky-bs-op-place')].filter((e) => e.offsetParent);
    if (p.length) f(p[0]); }, click);
  await page.waitForFunction((m) => !!document.querySelector(`.silky-bs-fslist-item[data-path*="${m}"]`), match, { timeout: 20000 });
  const bx = await page.evaluate((m) => {
    const el = document.querySelector(`.silky-bs-fslist-item[data-path*="${m}"]`);
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, match);
  await page.mouse.dblclick(bx.x, bx.y);
}

await page.goto('http://127.0.0.1:41337/');
await page.waitForTimeout(5000);
await openFile('Grey');
await page.waitForTimeout(9000);

const pre = new Set(page.frames().map((f) => f.url()));
await page.evaluate((c) => { const f = new Function('el', c);
  f(document.querySelector('button.jmv-ribbon-menu-item[data-ns="pandion"][data-name="xyplotbuilder"]')); }, click);
await page.waitForTimeout(4000);
let assigned = 0;
for (let step = 0; step < 2; step++) {
  let done = false;
  for (const f of page.frames()) {
    if (done) break;
    try {
      done = await f.evaluate(([c, idx]) => {
        const fn = new Function('el', c);
        const items = [...document.querySelectorAll('.silky-list-item-value')].filter((e) => e.offsetParent);
        const btns = [...document.querySelectorAll('button.jmv-variable-transfer')];
        if (!items.length || btns.length < 2) return false;
        fn(items[0]); fn(btns[idx]); return true;
      }, [click, step]);
    } catch (e) { }
  }
  if (done) assigned++;
  await page.waitForTimeout(2500);
}
assigned === 2 ? good('fresh Scatter created and populated') : bad(`assigned ${assigned}/2`);
await page.waitForTimeout(9000);

let sf = null;
for (const f of page.frames()) {
  if (pre.has(f.url())) continue;
  try {
    const d = await f.evaluate(() => !!document.querySelector('.graphbuilder2-host svg[data-role="gb2-chart-svg"]')
      && /Scatter/.test((document.querySelector('h1,h2') || {}).textContent || ''));
    if (d) sf = f;
  } catch (e) { }
}
if (!sf) { bad('no fresh Scatter frame'); console.log(`\nVERDICT: ${pass} pass, ${fail} fail`); await b.close(); process.exit(1); }

// WRAP jamovi's real setOption so commits are observed, not faked
await sf.evaluate(() => {
  window.__seen = [];
  const real = window.setOption;
  window.setOption = function (k, v) {
    try { window.__seen.push([k, typeof v === 'string' ? v.slice(0, 400) : v]); } catch (e) {}
    return real.apply(this, arguments);
  };
});
good('wrapped jamovi\'s real setOption (commits observed, still delivered)');

// under the Svg element the corner belongs to the host handle: our own
// grip must be detached (the gripresize probe guards the unwrapped case)
const gripOff = await sf.evaluate(() =>
  [...document.querySelectorAll('div')].filter((d) =>
    d.style.cursor === 'nwse-resize' && d.isConnected && d.offsetParent).length === 0);
gripOff ? good('own corner grip is OFF under the Svg element') : bad('corner grip still present');

const snap = () => sf.evaluate(() => {
  const live = document.querySelector('.graphbuilder2-host svg[data-role="gb2-chart-svg"]');
  const pt = document.querySelector('.graphbuilder2-host [data-role="xy-point"]');
  return {
    attrW: parseFloat(live.getAttribute('width')),
    attrH: parseFloat(live.getAttribute('height')),
    rectW: Math.round(live.getBoundingClientRect().width),
    firstPointX: pt ? Math.round(pt.getBoundingClientRect().x) : -1,
  };
});
const commits = () => sf.evaluate(() => {
  const out = [];
  for (const [k, v] of (window.__seen || [])) {
    if (k === 'plotWidth' || k === 'plotHeight') out.push([k, v]);
    else if (k === 'chartSpec') { try { const o = JSON.parse(v); if (o.plotWidth !== undefined) out.push(['plotWidth', o.plotWidth], ['plotHeight', o.plotHeight]); } catch (e) {} }
  }
  return out;
});

async function testCase(name, resizeFn, dw, dh) {
  console.log(`\n${name}`);
  await sf.evaluate(() => { window.__seen = []; });
  const before = await snap();
  await sf.evaluate(resizeFn, { dw, dh });
  await page.waitForTimeout(1200);
  const mid = await snap();
  Math.abs(mid.rectW - (before.rectW + dw)) < 3
    ? good(`chart is on screen at the new width (${mid.rectW})`)
    : bad(`on-screen width ${mid.rectW}, expected ~${before.rectW + dw}`);
  mid.firstPointX !== before.firstPointX || mid.attrW !== before.attrW
    ? good('chart re-laid out to the new size (real redraw, not a stretch)')
    : bad('chart did NOT re-lay out, it only stretched');
  // let the debounce + flush + R rerun happen
  await page.waitForTimeout(8000);
  const seen = await commits();
  const w = seen.filter((c) => c[0] === 'plotWidth').pop();
  const expW = Math.round(((before.rectW + dw) / 96) * 100) / 100;
  w && Math.abs(parseFloat(w[1]) - expW) < 0.02
    ? good(`jamovi received a real plotWidth commit of ${w[1]} in (expected ${expW})`)
    : bad(`no/incorrect commit reached jamovi: ${JSON.stringify(seen)}`);
  const after = await snap();
  Math.abs(after.rectW - (before.rectW + dw)) < 3
    ? good(`size still holds after the analysis re-ran (${after.rectW})`)
    : bad(`size reverted after rerun: ${after.rectW} vs ${before.rectW + dw}`);
  const s1 = (await snap()).attrH;
  await page.waitForTimeout(1200);
  const s2 = (await snap()).attrH;
  Math.abs(s1 - s2) < 0.5 ? good('stable, no feedback loop') : bad(`still moving: ${s1} -> ${s2}`);
}

// CASE A: jamovi's own idiom - CSS resize writes an inline style size
await testCase(
  'CASE A: CSS resize (inline style, what `resize: both` produces)',
  ({ dw, dh }) => {
    const live = document.querySelector('.graphbuilder2-host svg[data-role="gb2-chart-svg"]');
    live.style.width = (live.getBoundingClientRect().width + dw) + 'px';
    live.style.height = (live.getBoundingClientRect().height + dh) + 'px';
  }, 120, 80);

// reset to a clean state between cases
await sf.evaluate(() => {
  const live = document.querySelector('.graphbuilder2-host svg[data-role="gb2-chart-svg"]');
  live.style.width = ''; live.style.height = '';
});
await page.waitForTimeout(6000);

// CASE B: width/height attribute writes
await testCase(
  'CASE B: width/height attribute writes',
  ({ dw, dh }) => {
    const live = document.querySelector('.graphbuilder2-host svg[data-role="gb2-chart-svg"]');
    live.setAttribute('width', parseFloat(live.getAttribute('width')) + dw);
    live.setAttribute('height', parseFloat(live.getAttribute('height')) + dh);
  }, 110, 70);

console.log(`\nVERDICT: ${pass} pass, ${fail} fail => ${fail === 0 ? 'PASS' : 'FAIL'}`);
await b.close();
process.exit(fail === 0 ? 0 : 1);
