// stash-guard-check.mjs - the Aug 2026 stash-staleness review's probes.
// (1) The RM error-bar stash's fingerprint is FULL-CONTENT: a data edit
//     that preserves n and the first value (the old fingerprint) must
//     NOT let the stash restore a stale half-width. CONTROL: run with
//     PS_PAGE pointed at a pre-fix tree and the tampered-cell assertion
//     goes red (the stale value restores).
// (2) The shell drops both engine stashes whenever a table is built or
//     the active chart document changes - the standalone runs every
//     document in one window, so a stash keyed only by cell names could
//     otherwise cross documents whose names and counts coincide.
// The fold is driven through window.__gb2_statFold (the probe surface
// beside gb2_undo) with the exact poke-then-fold sequence the eb Type
// strip handler runs.
// Usage: node stash-guard-check.mjs (PS_PAGE overrides the page)
import { createRequire } from 'node:module';
import path from 'node:path';
const { chromium } = createRequire('/private/tmp/x.js')('playwright');

const PAGE = process.env.PS_PAGE || path.resolve(
  new URL('.', import.meta.url).pathname, '..', 'index.html');

let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) { pass++; console.log('  ok  ' + label); }
  else { fail++; console.log('  FAIL ' + label); }
};

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
await page.goto('file://' + path.resolve(PAGE));
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible().catch(() => false)) {
  try { await page.locator('#ps-welcome-blank, #ps-welcome-close').first().click({ timeout: 1500 }); } catch (e) {}
  await page.waitForTimeout(300);
}

console.log('case 1: RM stash refuses a content-changed cell (full fingerprint)');
await page.evaluate(async () => {
  const s = ms => new Promise(r => setTimeout(r, ms));
  const S = window.PS_SHELL;
  // Big within-occasion spread: the error bars must tower over the
  // markers, or the marker's oversized hit clone steals the click and
  // the LINE panel opens instead of the error-bar panel.
  const rows = [];
  for (let i = 0; i < 10; i++) {
    const w = (i % 2 ? 1 : -1) * (6 + i);
    // Occasion-specific jitter keeps every cell's Cousineau-Morey SE
    // solidly positive (perfectly correlated occasions cancel to ~0).
    rows.push([20 + w + (i % 4), 24 + 0.5 * w + ((i * 3) % 5), 27 - 0.3 * w + ((i * 2) % 3)]);
  }
  S.loadTable('sg', ['t1', 't2', 't3'], rows,
    { t1: 'continuous', t2: 'continuous', t3: 'continuous' });
  S.setModule('rmplotbuilder');
  S.setRoles('rmplotbuilder', { measures: ['t1', 't2', 't3'] });
  await s(1500);
});
const seOf = () => page.evaluate(() =>
  (window.gb2_undo.getData().bars || []).map(b => b.se));
const before = await seOf();
ok(before.length >= 3 && before.every(v => v > 0),
  'RM chart ships positive half-widths (' + before.join(',') + ')');
// Drive the fold DIRECTLY through its probe surface with the exact
// sequence the eb Type strip handler runs (poke, fold with the old
// value): synchronous, no UI routing, no timing races.
const zeroed = await page.evaluate(() => {
  const d = window.gb2_undo.getData();
  const old = d.errorBarType;
  d.errorBarType = 'none';
  window.__gb2_statFold(d, { errorBarType: 1 }, old);
  return (d.bars || []).map(b => b.se);
});
ok(zeroed.every(v => v === 0), 'hop to none zeroes them (' + zeroed.join(',') + ')');
const stashInfo = await page.evaluate(() => {
  const st = window.__gb2_rmSeStash || {};
  // Tamper with ONE cell's values, preserving n and the FIRST value -
  // exactly the edit the old n+first fingerprint could not see.
  const d = window.gb2_undo.getData();
  const victim = d.bars[0];
  victim.values[victim.values.length - 1] += 7;
  return { cells: Object.keys(st).length,
           victimKey: (victim.x || '') + '\u0001' + (victim.group || '') };
});
ok(stashInfo.cells >= 3, 'stash written (' + stashInfo.cells + ' cells)');
// Hop back to "se": untampered cells restore from the stash instantly;
// the tampered cell's fingerprint no longer matches, so it must stay
// at zero and wait for the authoritative recompute.
const r1 = await page.evaluate((victimKey) => {
  const d = window.gb2_undo.getData();
  d.errorBarType = 'se';
  window.__gb2_statFold(d, { errorBarType: 1 }, 'none');
  const keyOf = b => (b.x || '') + '\u0001' + (b.group || '');
  const tampered = d.bars.find(b => keyOf(b) === victimKey);
  const others = d.bars.filter(b => keyOf(b) !== victimKey);
  return [
    [others.length >= 2 && others.every(b => b.se > 0),
      'untampered cells restore (' + others.map(b => b.se).join(',') + ')'],
    [!!tampered && tampered.se === 0,
      'tampered cell REFUSES the stale restore (se=' + (tampered && tampered.se) + ')']
  ];
}, stashInfo.victimKey);
for (const [cond, label] of r1) ok(cond, label);

console.log('case 2: the shell drops both stashes on table build and chart switch');
const r2 = await page.evaluate(async () => {
  const s = ms => new Promise(r => setTimeout(r, ms));
  const S = window.PS_SHELL;
  const out = [];
  window.__gb2_rmSeStash = { probe: 1 };
  window.__gb2_freqBarStash = { sig: 'probe' };
  S.loadTable('sg2', ['a'], [[1], [2], [3]], { a: 'continuous' });
  out.push([window.__gb2_rmSeStash === undefined && window.__gb2_freqBarStash === undefined,
    'loadTable clears both stashes']);
  window.__gb2_rmSeStash = { probe: 2 };
  window.__gb2_freqBarStash = { sig: 'probe2' };
  const before = S.charts().length;
  S.addChart();
  await s(400);
  const cleared1 = window.__gb2_rmSeStash === undefined && window.__gb2_freqBarStash === undefined;
  window.__gb2_rmSeStash = { probe: 3 };
  const first = S.charts()[0];
  S.switchChart(first.id || first);
  await s(400);
  out.push([cleared1 || window.__gb2_rmSeStash === undefined,
    'chart add/switch clears the stashes']);
  out.push([S.charts().length === before + 1, 'chart really was added']);
  return out;
});
for (const [cond, label] of r2) ok(cond, label);

ok(pageErrors.length === 0, 'no page errors (' + pageErrors.slice(0, 2).join(' | ') + ')');
console.log((fail === 0 ? 'STASH GUARD CHECK PASS' : 'STASH GUARD CHECK FAIL') +
  ' (' + pass + ' ok, ' + fail + ' failing)');
await b.close();
process.exit(fail === 0 ? 0 : 1);
