import { createRequire } from 'node:module';
const { chromium } = createRequire('/tmp/x.js')('playwright');
const b = await chromium.launch();
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ok  ' : '  FAIL ') + m); };

const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();
await page.addInitScript(() => { window.__probeCommits = []; window.setOption = function (k, v) { window.__probeCommits.push([k, String(v)]); }; });
await page.goto('file:///tmp/gb2-verify/cg_bar_labels.html');
await page.waitForTimeout(1800);

// wrap host in a jmv-results-svg element and re-render (class + observer
// wiring are render-time, gated on that ancestor)
const wrapped = await page.evaluate(() => {
  const host = document.querySelector('.graphbuilder2-host');
  if (!host) return false;
  const wrap = document.createElement('jmv-results-svg');
  host.parentNode.insertBefore(wrap, host);
  wrap.appendChild(host);
  window.__gb2_lastRenderedHash = null;
  const s = [...document.scripts].find((x) => /GraphBuilder2\.render\(/.test(x.textContent || ''));
  if (!s) return 'no-render-script';
  (0, eval)(s.textContent);
  return true;
});
console.log('wrapped+rerendered:', wrapped);
await page.waitForTimeout(800); // twin builds at +30ms

const st = await page.evaluate(() => {
  const live = document.querySelector('jmv-results-svg [data-role="gb2-chart-svg"]');
  const twin = document.querySelector('[data-role="gb2-harvest-twin"]');
  return {
    liveSel: live ? live.classList.contains('jmv-results-svg-selection') : null,
    liveContent: live ? live.classList.contains('jmv-results-svg-content') : null,
    twinClass: twin ? twin.getAttribute('class') : null,
    firstMatch: (() => {
      const m = document.querySelector('svg.jmv-results-svg-selection');
      return m ? (m.getAttribute('data-role') || 'unknown') : null;
    })(),
    w: live ? parseFloat(live.getAttribute('width')) : -1,
    h: live ? parseFloat(live.getAttribute('height')) : -1,
    extra: live ? (live.__gb2_extraBottomPx || 0) : -1,
  };
});
ok(st.liveSel === true, 'live chart wears jmv-results-svg-selection');
ok(st.liveContent === false, 'live chart shed jmv-results-svg-content (twin standing)');
ok(st.twinClass === 'jmv-results-svg-content', 'twin class is content ONLY: ' + st.twinClass);
ok(st.firstMatch === 'gb2-chart-svg', 'selection selector lands on the LIVE chart, not the twin');

// external resize, the way jamovi's handle would do it
const grew = { w: st.w + 120, h: st.h + 90 };
await page.evaluate((g) => {
  const live = document.querySelector('jmv-results-svg [data-role="gb2-chart-svg"]');
  live.setAttribute('width', g.w);
  live.setAttribute('height', g.h);
}, grew);
await page.waitForTimeout(1000); // live follow (rAF) + 250ms debounce + rerender

const after = await page.evaluate(() => {
  const live = document.querySelector('jmv-results-svg [data-role="gb2-chart-svg"]');
  const dig = (blob) => { try { const s = typeof blob === 'string' ? JSON.parse(blob) : blob; return [s.plotWidth, s.plotHeight]; } catch (e) { return null; } };
  let pw, ph;
  const po = window.__gb2_pendingOpts || {};
  if (po.chartSpec) { const v = dig(po.chartSpec); if (v && v[0] !== undefined) [pw, ph] = v; }
  if (pw === undefined && po.plotWidth !== undefined) { pw = po.plotWidth; ph = po.plotHeight; }
  if (pw === undefined) {
    const cs = (window.__probeCommits || []).filter((c) => c[0] === 'chartSpec').pop();
    if (cs) { const v = dig(cs[1]); if (v && v[0] !== undefined) [pw, ph] = v; }
  }
  return {
    pw, ph,
    w: live ? parseFloat(live.getAttribute('width')) : -1,
    sel: live ? live.classList.contains('jmv-results-svg-selection') : null,
    bars: document.querySelectorAll('jmv-results-svg [data-bar-cat]').length,
  };
});
const expW = Math.round((grew.w / 96) * 100) / 100;
const expH = Math.round(((grew.h - st.extra) / 96) * 100) / 100;
ok(typeof after.pw === 'number' && Math.abs(after.pw - expW) < 0.011, `plotWidth committed ${after.pw} (expected ${expW})`);
ok(typeof after.ph === 'number' && Math.abs(after.ph - expH) < 0.011, `plotHeight committed ${after.ph} (expected ${expH})`);
ok(Math.abs(after.w - expW * 96) < 1.2, `chart re-rendered at the committed width (${after.w})`);
ok(after.sel === true, 'selection class survives the follow re-render');
ok(after.bars > 0, 'chart content intact after follow');

// stop-and-go: a SECOND resize right after the first commit must follow
// immediately (the re-arm grace; a cold 350ms quiet-gate froze resumed
// drags and released them in one jump)
const grew2 = { w: grew.w + 60, h: grew.h + 40 };
await page.evaluate((g) => {
  const live = document.querySelector('jmv-results-svg [data-role="gb2-chart-svg"]');
  live.setAttribute('width', g.w);
  live.setAttribute('height', g.h);
}, grew2);
const quick = await page.evaluate(() => {
  const live = document.querySelector('jmv-results-svg [data-role="gb2-chart-svg"]');
  return parseFloat(live.getAttribute('width'));
});
ok(Math.abs(quick - grew2.w) < 1.2, `second drag followed in the same task (${quick})`);
await page.waitForTimeout(700);
const after2 = await page.evaluate(() => {
  const dig = (blob) => { try { const s = typeof blob === 'string' ? JSON.parse(blob) : blob; return s.plotWidth; } catch (e) { return undefined; } };
  const po = window.__gb2_pendingOpts || {};
  if (po.chartSpec) { const v = dig(po.chartSpec); if (v !== undefined) return v; }
  if (po.plotWidth !== undefined) return po.plotWidth;
  const cs = (window.__probeCommits || []).filter((c) => c[0] === 'chartSpec').pop();
  if (cs) { const v = dig(cs[1]); if (v !== undefined) return v; }
  const pwc = (window.__probeCommits || []).filter((c) => c[0] === 'plotWidth').pop();
  return pwc ? parseFloat(pwc[1]) : undefined;
});
const expW2 = Math.round((grew2.w / 96) * 100) / 100;
ok(typeof after2 === 'number' && Math.abs(after2 - expW2) < 0.011, `second commit landed (${after2} vs ${expW2})`);

// negative control: NO wrapper -> observer never wired, resize commits nothing
const page2 = await ctx.newPage();
await page2.addInitScript(() => { window.__probeCommits = []; window.setOption = function (k, v) { window.__probeCommits.push([k, String(v)]); }; });
await page2.goto('file:///tmp/gb2-verify/cg_bar_labels.html');
await page2.waitForTimeout(1800);
const neg = await page2.evaluate(async () => {
  const live = document.querySelector('[data-role="gb2-chart-svg"]');
  const w = parseFloat(live.getAttribute('width'));
  live.setAttribute('width', w + 120);
  live.setAttribute('height', parseFloat(live.getAttribute('height')) + 90);
  await new Promise((r) => setTimeout(r, 900));
  const po = window.__gb2_pendingOpts || {};
  const blob = po.chartSpec || ((window.__probeCommits || []).filter((c) => c[0] === 'chartSpec').pop() || [])[1];
  let pw; try { pw = JSON.parse(blob).plotWidth; } catch (e) {}
  return { pw: pw === undefined ? null : pw, sel: live.classList.contains('jmv-results-svg-selection') };
});
ok(neg.pw === null, 'no wrapper: external resize commits nothing');
ok(neg.sel === true, 'no wrapper: marker class still present (harmless, matches content-class precedent)');

console.log(`\nVERDICT: ${pass} pass, ${fail} fail => ${fail === 0 ? 'PASS' : 'FAIL'}`);
await b.close();
process.exit(fail === 0 ? 0 : 1);
