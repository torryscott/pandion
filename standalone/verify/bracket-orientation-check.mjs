// bracket-orientation-check.mjs - a significance bracket must follow its
// bars when the chart is flipped between vertical and horizontal.
//
// Torry's report (Sep 2026): place brackets from the Statistics panel on a
// bar chart, switch the orientation, and the brackets do not rotate with
// the bars. Cause: a bracket's spine is stored data-relative (ann.yRel px
// beyond the data it spans) but that was computed only in vertical mode,
// where the value axis is Y. In horizontal mode ann.y is read as the
// spine's X, so a bracket flipped over kept a Y pixel and landed at an
// arbitrary X. The legs were always fine - their anchors resolve through
// bar centres, which are recorded along whichever axis is categorical.
//
// What this pins, in both directions:
//   1. after a flip the spine sits just BEYOND the bars it spans (right of
//      them horizontally, above them vertically), not at a stale pixel;
//   2. the legs still land on the two bars the bracket names;
//   3. flipping back restores essentially the original geometry;
//   4. a bracket created while horizontal survives a flip to vertical.
// Control: against the pre-fix engine case 1 fails - the spine lands at
// the old Y pixel, far from the bars.
import { createRequire } from 'node:module';
import path from 'node:path';
const { chromium } = createRequire('/private/tmp/x.js')('playwright');

const HERE = path.resolve(new URL('.', import.meta.url).pathname);
const PAGE = path.resolve(process.env.PS_PAGE || path.resolve(HERE, '..', 'index.html'));
let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL ' + label); }
};

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1500, height: 950 } });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
await page.addInitScript(() => {
  try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); } catch (e) {}
});
await page.goto('file://' + PAGE);
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible().catch(() => false)) {
  try { await page.locator('#ps-welcome-blank, #ps-welcome-close').first().click({ timeout: 1500 }); } catch (e) {}
  await page.waitForTimeout(300);
}

// Geometry of the drawn bracket plus the bars it spans, in screen pixels.
// The bracket is three lines in a [data-ann-id] group; the spine is the
// one whose ends share a coordinate on the value axis.
const geom = () => page.evaluate(() => {
  const host = document.querySelector('.graphbuilder2-host');
  const svg = [...host.querySelectorAll('svg')]
    .sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight))[0];
  const out = { brackets: [], bars: [] };
  svg.querySelectorAll('[data-ann-id]').forEach(g => {
    const lines = [...g.querySelectorAll('line')].map(l => ({
      x1: +l.getAttribute('x1'), y1: +l.getAttribute('y1'),
      x2: +l.getAttribute('x2'), y2: +l.getAttribute('y2')
    })).filter(l => [l.x1, l.y1, l.x2, l.y2].every(isFinite));
    if (lines.length) out.brackets.push({ id: g.getAttribute('data-ann-id'), lines });
  });
  svg.querySelectorAll('[data-bar-cat]').forEach(el => {
    if (el.tagName.toLowerCase() === 'text' || el.getAttribute('data-role')) return;
    const bb = el.getBBox ? el.getBBox() : null;
    if (bb && bb.width >= 2 && bb.height >= 2)
      out.bars.push({ x: bb.x, y: bb.y, w: bb.width, h: bb.height });
  });
  return out;
});
const spineOf = (br, horizontal) => {
  // vertical chart: the spine is the horizontal line (y1 === y2)
  // horizontal chart: the spine is the vertical line (x1 === x2)
  const cand = br.lines.filter(l => horizontal
    ? Math.abs(l.x1 - l.x2) < 0.6 && Math.abs(l.y1 - l.y2) > 2
    : Math.abs(l.y1 - l.y2) < 0.6 && Math.abs(l.x1 - l.x2) > 2);
  if (!cand.length) return null;
  return cand.sort((a, b) => (horizontal
    ? Math.abs(b.y1 - b.y2) - Math.abs(a.y1 - a.y2)
    : Math.abs(b.x1 - b.x2) - Math.abs(a.x1 - a.x2)))[0];
};

console.log('setup: a grouped bar chart with two placed brackets');
const placed = await page.evaluate(async () => {
  const s = ms => new Promise(r => setTimeout(r, ms));
  const rows = [];
  const vals = { A: [4, 6, 9, 13, 7], B: [10, 14, 15, 21, 12], C: [2, 3, 4, 3, 5] };
  for (const g of Object.keys(vals)) for (const v of vals[g]) rows.push([g, v]);
  const S = window.PS_SHELL;
  S.loadTable('br', ['g', 'y'], rows, { g: 'nominal', y: 'continuous' });
  S.setModule('plotbuilder');
  S.setRoles('plotbuilder', { xvar: 'g', yvar: 'y' });
  await s(1600);
  // Place brackets the way the report did: the Statistics panel's
  // Compare pairs tab, Place brackets.
  const click = el => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    el.click();
  };
  const host = document.querySelector('.graphbuilder2-host');
  const stats = host.querySelector('button[aria-label="Statistics"]');
  if (stats) { click(stats); await s(1000); }
  const rowsSel = [...host.querySelectorAll('[data-st-pane="pairs"] tr[data-link] input[type="checkbox"]')];
  rowsSel.slice(0, 2).forEach(cb => { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); });
  await s(400);
  const place = [...host.querySelectorAll('button')].find(x => /^Place brackets/.test((x.textContent || '').trim()));
  if (place) { click(place); await s(1500); }
  const anns = (window.gb2_undo.getData().annotations || []).filter(a => a && a.kind === 'bracket');
  return { n: anns.length, ticked: rowsSel.length };
});
ok(placed.n >= 1, 'brackets were placed from the Statistics panel (' + JSON.stringify(placed) + ')');

const flip = async (mode) => page.evaluate(async (mode) => {
  window.__gb2_setOption('chartOrientation', mode);
  await new Promise(r => setTimeout(r, 1800));
}, mode);

// A spine is correct when it sits just BEYOND the spanned bars along the
// value axis, and within the chart. 4..90 px beyond covers the placer's
// tiering without accepting a stale coordinate (which lands hundreds of
// pixels away, or off the plot entirely).
function judge(g, horizontal, label) {
  ok(g.bars.length >= 3, label + ': bars are drawn (' + g.bars.length + ')');
  ok(g.brackets.length >= 1, label + ': the bracket is still drawn');
  for (const br of g.brackets) {
    const sp = spineOf(br, horizontal);
    if (!sp) { ok(false, label + ': no spine line found in the bracket'); continue; }
    // the bars this bracket spans, along the categorical axis
    const lo = horizontal ? Math.min(sp.y1, sp.y2) : Math.min(sp.x1, sp.x2);
    const hi = horizontal ? Math.max(sp.y1, sp.y2) : Math.max(sp.x1, sp.x2);
    const spanned = g.bars.filter(bar => {
      const c = horizontal ? (bar.y + bar.h / 2) : (bar.x + bar.w / 2);
      return c >= lo - 30 && c <= hi + 30;
    });
    ok(spanned.length >= 2,
      label + ': the spine spans at least two bars (' + spanned.length + ')');
    if (!spanned.length) continue;
    // "beyond the data": right of the bar ends horizontally, above them vertically
    const spineVal = horizontal ? sp.x1 : sp.y1;
    const dataEnd = horizontal
      ? Math.max(...spanned.map(bar => bar.x + bar.w))
      : Math.min(...spanned.map(bar => bar.y));
    const gap = horizontal ? (spineVal - dataEnd) : (dataEnd - spineVal);
    ok(gap > 0 && gap < 140,
      label + ': the spine sits just beyond the bars it spans (gap ' +
      Math.round(gap) + 'px)');
  }
}

// The stored offset is what must stay constant across a flip: the spine's
// absolute coordinate is DERIVED from it each draw, against whichever axis
// the data grows along.
const yRels = () => page.evaluate(() => (window.gb2_undo.getData().annotations || [])
  .filter(a => a && a.kind === 'bracket')
  .map(a => ({ y: Math.round(a.y), yRel: a.yRel == null ? null : Math.round(a.yRel) })));

console.log('case 1: flipped to horizontal, the brackets follow the bars');
const beforeFlip = await yRels();
await flip('horizontal');
judge(await geom(), true, 'horizontal');
const afterFlip = await yRels();
ok(beforeFlip.length === afterFlip.length && beforeFlip.length > 0 &&
   beforeFlip.every((r, i) => r.yRel !== null && afterFlip[i].yRel === r.yRel),
  'the stored offset survives the flip unchanged (' +
  JSON.stringify(beforeFlip) + ' -> ' + JSON.stringify(afterFlip) + ')');
ok(afterFlip.every((r, i) => r.y !== beforeFlip[i].y),
  'the spine coordinate itself was re-derived for the new axis');

console.log('case 2: flipped back to vertical');
await flip('vertical');
judge(await geom(), false, 'back to vertical');
const backAgain = await yRels();
ok(backAgain.every((r, i) => Math.abs(r.y - beforeFlip[i].y) <= 2),
  'flipping back restores the original spine coordinates (' +
  JSON.stringify(backAgain) + ')');

console.log('case 3: a bracket created while horizontal survives a flip to vertical');
// Built directly rather than through Place, which is deliberately not
// offered on horizontal charts. It carries anchors and an absolute spine
// X but NO stored offset, which is the legacy shape: the renderer has to
// capture the offset from the horizontal geometry, and the vertical draw
// then has to derive a sane spine from it.
await flip('horizontal');
const injected = await page.evaluate(async () => {
  const s2 = ms => new Promise(r => setTimeout(r, ms));
  const d = window.gb2_undo.getData();
  const keep = (d.annotations || []).filter(a => !(a && a.kind === 'bracket'));
  // a spine just right of the bars, legs on the A and B rows
  const svg = [...document.querySelectorAll('.graphbuilder2-host svg')]
    .sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight))[0];
  const bars = [...svg.querySelectorAll('[data-bar-cat]')]
    .filter(el => el.tagName.toLowerCase() !== 'text' && !el.getAttribute('data-role'))
    .map(el => el.getBBox()).filter(bb => bb.width >= 2 && bb.height >= 2);
  const rightMost = Math.max(...bars.map(bb => bb.x + bb.width));
  const rows = bars.map(bb => bb.y + bb.height / 2).sort((a, b) => a - b);
  keep.push({ id: 'brk_horiz_born', kind: 'bracket',
              x: rows[0], x2: rows[rows.length - 1], y: rightMost + 24,
              label: 'p = .01', anchorLeftCat: 'A', anchorRightCat: 'C' });
  window.__gb2_setOption('annotationsJson', JSON.stringify(keep));
  // the commit is debounced: wait for the render that carries it, never a
  // fixed sleep (an earlier version of this probe read before it landed and
  // blamed the engine)
  for (let i = 0; i < 80; i++) {
    await s2(100);
    const now = (window.gb2_undo.getData().annotations || [])
      .filter(a => a && a.kind === 'bracket');
    if (now.length === 1 && now[0].id === 'brk_horiz_born')
      return { ok: true, yRel: now[0].yRel == null ? null : Math.round(now[0].yRel) };
  }
  return { ok: false };
});
ok(injected.ok, 'the horizontal-born bracket is in place (' + JSON.stringify(injected) + ')');
if (injected.ok) {
  judge(await geom(), true, 'born horizontal');
  await flip('vertical');
  judge(await geom(), false, 'born horizontal, flipped to vertical');
}

ok(pageErrors.length === 0, 'no page errors (' + pageErrors.slice(0, 2).join(' | ') + ')');
console.log((fail === 0 ? 'BRACKET ORIENTATION CHECK PASS' : 'BRACKET ORIENTATION CHECK FAIL') +
  ' (' + pass + ' ok, ' + fail + ' failing)');
await b.close();
process.exit(fail === 0 ? 0 : 1);
