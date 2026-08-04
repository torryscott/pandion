import { createRequire } from 'node:module';
const { chromium } = createRequire('/tmp/x.js')('playwright');
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
let pass = 0, fail = 0;
const bad = (m) => { console.log('  FAIL: ' + m); fail++; };
const good = (m) => { console.log('  ok: ' + m); pass++; };
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

let preUrls = new Set();
async function snapshotFrames() {
  preUrls = new Set(page.frames().map((f) => f.url()));
}
async function freshFrame() {
  // the session file accumulates analyses from earlier probe runs, so
  // the fresh one is the frame whose URL did not exist pre-create
  let best = null;
  for (const f of page.frames()) {
    if (preUrls.has(f.url())) continue;
    try {
      const d = await f.evaluate(() => {
        const t = (document.querySelector('h1,h2')?.textContent || '').trim();
        if (!/Scatter/.test(t)) return null;
        const live = document.querySelector('.graphbuilder2-host svg[data-role="gb2-chart-svg"]');
        return { live: !!live };
      });
      if (d && d.live) best = f;
    } catch (e) { }
  }
  return best;
}

await page.goto('http://127.0.0.1:41337/');
await page.waitForTimeout(5000);
await openFile('Grey');
await page.waitForTimeout(9000);

await snapshotFrames();
const created = await page.evaluate((c) => {
  const f = new Function('el', c);
  const el = document.querySelector('button.jmv-ribbon-menu-item[data-ns="pandion"][data-name="xyplotbuilder"]');
  if (!el) return false;
  f(el); return true;
}, click);
created ? good('created fresh Scatter') : bad('ribbon item not found');
await page.waitForTimeout(4000);
let assigned = 0;
for (let step = 0; step < 2 && created; step++) {
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
assigned === 2 ? good('assigned X and Y') : bad(`assigned ${assigned}/2`);
await page.waitForTimeout(9000);

const sf = await freshFrame();
if (!sf) { bad('no fresh Scatter frame'); }
else {
  const st = await sf.evaluate(() => {
    const live = document.querySelector('.graphbuilder2-host svg[data-role="gb2-chart-svg"]');
    const twin = document.querySelector('[data-role="gb2-harvest-twin"]');
    const sel = document.querySelector('svg.jmv-results-svg-selection');
    return {
      liveSel: live.classList.contains('jmv-results-svg-selection'),
      twinClass: twin ? twin.getAttribute('class') : null,
      selIsLive: sel === live,
      w: parseFloat(live.getAttribute('width')),
      h: parseFloat(live.getAttribute('height')),
    };
  });
  st.liveSel ? good('live chart wears jmv-results-svg-selection') : bad('marker class missing');
  st.twinClass === 'jmv-results-svg-content' ? good('twin carries content class only') : bad('twin class: ' + st.twinClass);
  st.selIsLive ? good('a handle keyed on the marker lands on the LIVE chart') : bad('marker selector missed the live chart');

  // the Damo simulation: externally resize the marked svg in REAL jamovi
  await sf.evaluate(() => {
    const live = document.querySelector('svg.jmv-results-svg-selection');
    live.setAttribute('width', parseFloat(live.getAttribute('width')) + 120);
    live.setAttribute('height', parseFloat(live.getAttribute('height')) + 90);
  });
  await page.waitForTimeout(1200);
  const mid = await sf.evaluate(() => {
    const live = document.querySelector('svg.jmv-results-svg-selection');
    return { w: parseFloat(live.getAttribute('width')), h: parseFloat(live.getAttribute('height')) };
  });
  Math.abs(mid.w - (st.w + 120)) < 2 ? good(`follow holds the dragged width (${mid.w})`) : bad(`width after follow: ${mid.w}`);
  // wait out the debounce commit + flush + R echo, then confirm it STUCK
  await page.waitForTimeout(7000);
  const fin = await sf.evaluate(() => {
    const live = document.querySelector('.graphbuilder2-host svg[data-role="gb2-chart-svg"]');
    return {
      w: parseFloat(live.getAttribute('width')),
      h: parseFloat(live.getAttribute('height')),
      sel: live.classList.contains('jmv-results-svg-selection'),
      pend: JSON.stringify(window.__gb2_pendingOpts || {}),
    };
  });
  Math.abs(fin.w - (st.w + 120)) < 2 ? good(`size SURVIVED the R echo (${fin.w}) - the commit round-tripped`) : bad(`echo reverted the size: ${fin.w} vs ${st.w + 120}`);
  Math.abs(fin.h - (st.h + 90)) < 6 ? good(`height survived too (${fin.h})`) : bad(`height after echo: ${fin.h} vs ${st.h + 90}`);
  fin.sel ? good('marker class survives the echo re-render') : bad('marker class lost after echo');
  // no storm: two samples a second apart must be stable
  const s1 = await sf.evaluate(() => parseFloat(document.querySelector('svg.jmv-results-svg-selection').getAttribute('height')));
  await page.waitForTimeout(1000);
  const s2 = await sf.evaluate(() => parseFloat(document.querySelector('svg.jmv-results-svg-selection').getAttribute('height')));
  Math.abs(s1 - s2) < 0.5 ? good('size stable, no feedback loop') : bad(`height still moving: ${s1} -> ${s2}`);
}

console.log(`\nVERDICT: ${pass} pass, ${fail} fail => ${fail === 0 ? 'PASS' : 'FAIL'}`);
await b.close();
process.exit(fail === 0 ? 0 : 1);
