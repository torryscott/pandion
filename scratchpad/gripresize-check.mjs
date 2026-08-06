import { createRequire } from 'node:module';
const { chromium } = createRequire('/tmp/x.js')('playwright');

const b = await chromium.launch();
let pass = 0, fail = 0;
const bad = (m) => { console.log('  FAIL: ' + m); fail++; };
const good = (m) => { console.log('  ok: ' + m); pass++; };

async function testPage(file, { faceted = false, expectCommit = true } = {}) {
  console.log(`=== ${file.split('/').pop()} ${faceted ? '(faceted)' : ''} ===`);
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await ctx.newPage();
  if (expectCommit)
    await page.addInitScript(() => { window.setOption = function () {}; });
  await page.goto('file://' + file);
  await page.waitForTimeout(2500);

  const st = await page.evaluate(() => {
    const svgs = [...document.querySelectorAll('svg')];
    let chart = null, area = 0;
    for (const s of svgs) { const r = s.getBoundingClientRect(); if (r.width * r.height > area) { area = r.width * r.height; chart = s; } }
    const wrap = chart ? chart.parentElement : null;
    const divs = wrap ? [...wrap.querySelectorAll(':scope > div')] : [];
    const cursorCount = (c) => divs.filter((d) => (d.style.cssText || '').includes('cursor:' + c) || d.style.cursor === c).length;
    const grip = divs.find((d) => d.style.cursor === 'nwse-resize');
    let gripBox = null;
    if (grip) { const r = grip.getBoundingClientRect(); gripBox = { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }
    return {
      svgW: chart ? parseFloat(chart.getAttribute('width')) : -1,
      svgH: chart ? parseFloat(chart.getAttribute('height')) : -1,
      ew: cursorCount('ew-resize'),
      nwse: cursorCount('nwse-resize'),
      gripBox,
    };
  });
  st.nwse === 1 ? good('exactly one corner grip') : bad(`nwse-resize count ${st.nwse}`);
  st.ew === 0 ? good('old width grip gone') : bad(`ew-resize still present (${st.ew})`);
  if (!st.gripBox) { bad('no grip box'); await ctx.close(); return; }

  // free drag +100,+80
  await page.mouse.move(st.gripBox.x, st.gripBox.y);
  await page.mouse.down();
  await page.mouse.move(st.gripBox.x + 50, st.gripBox.y + 40, { steps: 5 });
  await page.mouse.move(st.gripBox.x + 100, st.gripBox.y + 80, { steps: 5 });
  const mid = await page.evaluate(() => {
    const tags = [...document.querySelectorAll('div')].filter((d) => /\d+ x \d+ px/.test(d.textContent || '') && d.className.includes('ignore-html'));
    const t = tags[0];
    // target opacity, not computed: the 150ms fade-in can be mid-flight
    return t ? { vis: t.style.opacity, txt: t.textContent } : null;
  });
  mid && mid.vis === '1' ? good(`readout live during drag (${mid.txt})`) : bad('no live size readout');
  (mid && /^[\d.]+ x [\d.]+ in/.test((mid.txt || '').trim())) ? good('readout shows inches too') : bad('readout missing inches: ' + (mid && mid.txt));
  await page.mouse.up();
  await page.waitForTimeout(400);

  const after = await page.evaluate(() => {
    const svgs = [...document.querySelectorAll('svg')];
    let chart = null, area = 0;
    for (const s of svgs) { const r = s.getBoundingClientRect(); if (r.width * r.height > area) { area = r.width * r.height; chart = s; } }
    return {
      w: parseFloat(chart.getAttribute('width')),
      h: parseFloat(chart.getAttribute('height')),
      pend: JSON.stringify(window.__gb2_pendingOpts || {}),
    };
  });
  const dw = after.w - st.svgW, dh = after.h - st.svgH;
  (dw > 99 && dw < 101) ? good(`width grew exactly ${dw.toFixed(1)}px`) : bad(`width delta ${dw}`);
  (dh > 79 && dh < 81) ? good(`height grew exactly ${dh.toFixed(1)}px`) : bad(`height delta ${dh}`);
  // NO release snap (Torry, Aug 2026): the committed width must be the
  // start width plus the exact 100px drag, within the 2dp-inch rounding
  let cw = -1, ch = -1;
  try {
    const po = JSON.parse(after.pend);
    const spec = po.chartSpec ? JSON.parse(po.chartSpec) : po;
    cw = (spec.plotWidth || 0) * 96; ch = (spec.plotHeight || 0) * 96;
  } catch (e) { }
  (cw > 0 && Math.abs(cw - (st.svgW + 100)) < 1.2) ? good(`commit is EXACT, no snap (${st.svgW} + 100 -> ${cw.toFixed(1)})`) : bad(`commit not exact: ${st.svgW} + 100 vs ${cw}`);
  if (expectCommit) {
    (/plotWidth/.test(after.pend) && /plotHeight/.test(after.pend)) ? good('both dims committed') : bad('commit missing: ' + after.pend.slice(0, 120));
  }
  const note = await page.evaluate(() => {
    const el = document.querySelector('[data-field="plot-px-note"]');
    return el ? el.textContent : null;
  });
  (note && new RegExp('^' + Math.round(cw) + ' x ' + Math.round(ch) + ' px on screen$').test(note))
    ? good('sizing panel px note agrees (' + note + ')') : bad('px note wrong: ' + note + ' vs ' + Math.round(cw) + 'x' + Math.round(ch));

  // shift drag preserves ratio
  const g2 = await page.evaluate(() => {
    const wrapDivs = [...document.querySelectorAll('div')].filter((d) => d.style.cursor === 'nwse-resize');
    const r = wrapDivs[0].getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  const ratio0 = after.h / after.w;
  await page.keyboard.down('Shift');
  await page.mouse.move(g2.x, g2.y);
  await page.mouse.down();
  await page.mouse.move(g2.x + 90, g2.y + 5, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.waitForTimeout(300);
  const after2 = await page.evaluate(() => {
    const svgs = [...document.querySelectorAll('svg')];
    let chart = null, area = 0;
    for (const s of svgs) { const r = s.getBoundingClientRect(); if (r.width * r.height > area) { area = r.width * r.height; chart = s; } }
    return { w: parseFloat(chart.getAttribute('width')), h: parseFloat(chart.getAttribute('height')) };
  });
  Math.abs(after2.h / after2.w - ratio0) < 0.03 ? good('Shift preserved aspect ratio') : bad(`ratio drifted ${ratio0.toFixed(3)} -> ${(after2.h / after2.w).toFixed(3)}`);

  await ctx.close();
}

await testPage('/tmp/gb2-verify/cg_bar_labels.html');
await testPage('/tmp/gb2-verify/xy_facet.html', { faceted: true });

// --- cm toggle: display converts, commits stay inches ---
console.log('=== cm unit toggle ===');
{
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => { window.__probeCommits = []; window.setOption = function (k, v) { window.__probeCommits.push([k, String(v)]); }; });
  await page.goto('file:///tmp/gb2-verify/cg_bar_labels.html');
  await page.waitForTimeout(2500);
  const gpos = () => page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find((d) => d.style.cursor === 'nwse-resize');
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  let g = await gpos();
  await page.mouse.move(g.x, g.y); await page.mouse.down();
  await page.mouse.move(g.x + 15, g.y + 10, { steps: 3 }); await page.mouse.up();
  await page.waitForTimeout(500);
  const inVal = await page.evaluate(() => parseFloat(document.querySelector('[data-field="plot-w"]').value));
  await page.evaluate(() => document.querySelector('[data-size-unit="cm"]').click());
  await page.waitForTimeout(600);
  const st = await page.evaluate(() => ({
    w: parseFloat(document.querySelector('[data-field="plot-w"]').value),
    title: document.querySelector('[data-field="plot-w"]').getAttribute('title') || '',
  }));
  Math.abs(st.w - inVal * 2.54) < 0.03 ? good(`cm value converts (${inVal} in -> ${st.w} cm)`) : bad(`cm conversion off: ${inVal} -> ${st.w}`);
  /centimeters/.test(st.title) ? good('input title says centimeters') : bad('title: ' + st.title);
  g = await gpos();
  await page.mouse.move(g.x, g.y); await page.mouse.down();
  await page.mouse.move(g.x + 60, g.y + 40, { steps: 5 });
  const tag = await page.evaluate(() => {
    const t = [...document.querySelectorAll('div')].find((d) => /\d+ x \d+ px/.test(d.textContent || '') && d.className.includes('ignore-html'));
    return t ? t.textContent : null;
  });
  (tag && /^[\d.]+ x [\d.]+ cm\n/.test(tag)) ? good('readout first line in cm (' + tag.split('\n')[0] + ')') : bad('readout not cm: ' + JSON.stringify(tag));
  await page.mouse.up();
  await page.waitForTimeout(400);
  const readSpec = async () => {
    // pending if unflushed, else the last FLUSHED chartSpec via the mock
    return await page.evaluate(() => {
      const dig = (blob) => { try { const s = typeof blob === 'string' ? JSON.parse(blob) : blob; return s.plotWidth; } catch (e) { return undefined; } };
      const po = window.__gb2_pendingOpts || {};
      if (po.chartSpec) { const v = dig(po.chartSpec); if (v !== undefined) return v; }
      if (po.plotWidth !== undefined) return po.plotWidth;
      const cs = (window.__probeCommits || []).filter((c) => c[0] === 'chartSpec').pop();
      if (cs) { const v = dig(cs[1]); if (v !== undefined) return v; }
      const pwc = (window.__probeCommits || []).filter((c) => c[0] === 'plotWidth').pop();
      return pwc ? parseFloat(pwc[1]) : -1;
    });
  };
  const pw = await readSpec();
  const wCm = await page.evaluate(() => parseFloat(document.querySelector('[data-field="plot-w"]').value));
  Math.abs(pw - wCm / 2.54) < 0.02 ? good(`commit stays inches (${pw} in = ${wCm} cm)`) : bad(`commit mismatch: ${pw} vs ${(wCm / 2.54).toFixed(3)}`);
  await page.evaluate(() => {
    const el = document.querySelector('[data-field="plot-w"]');
    el.value = '20';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(300);
  const pw2 = await readSpec();
  Math.abs(pw2 - 20 / 2.54) < 0.02 ? good(`typed 20 cm commits ${pw2} in`) : bad(`typed-cm commit wrong: ${pw2}`);
  await page.evaluate(() => document.querySelector('[data-size-unit="in"]').click());
  await page.waitForTimeout(500);
  const backVal = await page.evaluate(() => parseFloat(document.querySelector('[data-field="plot-w"]').value));
  Math.abs(backVal - pw2) < 0.03 ? good(`back to inches (${backVal})`) : bad(`inch restore wrong: ${backVal} vs ${pw2}`);
  await ctx.close();
}

console.log(`\nVERDICT: ${pass} pass, ${fail} fail => ${fail === 0 ? 'PASS' : 'FAIL'}`);
await b.close();
process.exit(fail === 0 ? 0 : 1);
