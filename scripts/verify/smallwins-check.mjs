// Verify the 6 review-finding fixes (A,B,C,D,F on JS; E checked in R).
import { createRequire } from 'node:module';
import path from 'node:path';
const req = createRequire('/tmp/x.js');
const pw = req('playwright');
// The battery passes its output folder; the default is where a plain run writes.
const OUT = process.env.GB2_VERIFY_OUT || '/tmp/gb2-verify';
let fails = 0;
const ok = (l, c) => { console.log((c ? ' ok  ' : 'FAIL ') + l); if (!c) fails++; };
const b = await pw.chromium.launch();

// ---- A/B: corr Σ 'Matrix summary' shows integer pair count (no /2) ----
{
  const ctx = await b.newContext(); const p = await ctx.newPage();
  p.on('pageerror', e => { console.log('PAGEERR ' + e.message); fails++; });
  await p.goto('file://' + path.join(OUT, 'corr_heat.html'));
  await p.waitForSelector('[title="Statistics"]', { timeout: 8000 });
  await p.click('[title="Statistics"]');
  await p.waitForSelector('[data-cmp-tally]', { timeout: 5000 });
  const tally = await p.evaluate(() => {
    const el = document.querySelector('[data-cmp-tally]');
    return el ? el.textContent : '';
  });
  // corr_heat has 4 vars -> choose(4,2) = 6 unique pairs (was 3 with /2 bug)
  ok('A corr Σ tally shows "of 6" (integer, no /2): ' + JSON.stringify(tally),
     / of 6\b/.test(tally));
  ok('A corr Σ tally has no fractional ".5"', !/\.5\b/.test(tally));
  await ctx.close();
}

// ---- F: xyPointLabel text panel hides the text-content box ----
{
  const ctx = await b.newContext(); const p = await ctx.newPage();
  p.on('pageerror', e => { console.log('PAGEERR ' + e.message); fails++; });
  await p.goto('file://' + path.join(OUT, 'xy_bubble_labels.html'));
  await p.waitForSelector('[data-role="xy-point-label"]', { timeout: 8000 });
  await p.click('[data-role="xy-point-label"]');
  await p.waitForSelector('[data-field="text-content"]', { state: 'attached', timeout: 5000 });
  const hidden = await p.evaluate(() => {
    const ta = document.querySelector('[data-field="text-content"]');
    if (!ta) return { present: false };
    // computed labels wrap the textarea in a display:none div -> offsetParent null
    return { present: true, visible: ta.offsetParent !== null };
  });
  ok('F xyPointLabel panel present', hidden.present);
  ok('F text-content box is hidden (computed label, no rename box)', hidden.present && !hidden.visible);
  await ctx.close();
}

// ---- C/D: Order pane keeps manual reordering after value-sort removal ----
{
  const ctx = await b.newContext(); const p = await ctx.newPage();
  p.on('pageerror', e => { console.log('PAGEERR ' + e.message); fails++; });
  await p.goto('file://' + path.join(OUT, 'freq_bar_fill_facet.html'));
  await p.waitForSelector('svg [data-bar-cat]', { timeout: 8000 });
  await p.locator('svg [data-bar-cat]').first().click();
  await p.waitForSelector('[data-bs-tab="order"]', { timeout: 5000 });
  await p.click('[data-bs-tab="order"]');
  const state = await p.evaluate(() => ({
    sortControls: document.querySelectorAll('[data-field="cat-sort"], [data-role="sort-asc"], [data-role="sort-desc"]').length,
    categoryRows: document.querySelectorAll('[data-field="cat-order"] > [data-cat]').length,
    upButtons: document.querySelectorAll('[data-field="cat-order"] [data-role="up"]').length,
    downButtons: document.querySelectorAll('[data-field="cat-order"] [data-role="down"]').length
  }));
  ok('C value-sort controls are absent', state.sortControls === 0, JSON.stringify(state));
  ok('D manual category-order rows and arrows remain',
     state.categoryRows > 1 && state.upButtons === state.categoryRows && state.downButtons === state.categoryRows,
     JSON.stringify(state));
  await ctx.close();
}

await b.close();
if (fails > 0) { console.log('\n' + fails + ' FIX CHECKS FAILED'); process.exit(1); }
console.log('\nALL FIX CHECKS PASSED');
