// corr-method-echo-check.mjs - a correlation-matrix method switch must
// SURVIVE its echo. The engine's method guard recomputes the cells
// client-side at render entry within 4 s of a switch (so a stale echo
// cannot revert them); if that recompute fails, the echo render ships
// the pairs with no coefficient and the matrix plus the Sigma All-pairs
// table read em dashes. That is exactly what happened to Spearman for
// three days (Sep 2026) on pairs with 9 or fewer complete, tie-free
// cases (the exact-permutation branch): its permutation cache was a
// render-scope var, hoisted but uninitialized at guard time. Larger or
// tied pairs never touch the cache, so a normal-sized matrix looked
// fine and only a tiny table showed it. The fuzzer only caught it
// when the echo beat its fixed 1500 ms read, so this probe never sleeps
// through the echo: it intercepts GraphBuilder2.render, waits for the
// render that carries the switched method, lets the panel restore, and
// then reads. Control: against the pre-fix engine the Spearman case
// goes red while Pearson and Kendall stay green.
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

// The fuzzer's corr01 (tie-free, Spearman rho exactly 0.5, p .216) plus a
// third tie-free variable so the All-pairs table has three rows.
const x = [0.17333, -0.14527, 1.56853, 0.46499, 1.35274, 0.06012, 0.21221, 0.08838];
const y = [0.01045, -0.04967, 3.81865, 0.12862, 2.03944, 1.3655, -0.26521, 0.30708];
const z = [1.1, 0.4, 2.9, 0.9, 2.2, 1.7, 0.2, 1.3];

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 950 } });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
await page.goto('file://' + PAGE);
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible().catch(() => false)) {
  try { await page.locator('#ps-welcome-blank, #ps-welcome-close').first().click({ timeout: 1500 }); } catch (e) {}
  await page.waitForTimeout(300);
}

const r = await page.evaluate(async ({ x, y, z }) => {
  const s = ms => new Promise(r => setTimeout(r, ms));
  const click = el => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    el.click();
  };
  const S = window.PS_SHELL;
  S.loadTable('cme', ['x', 'y', 'z'], x.map((v, i) => [v, y[i], z[i]]),
    { x: 'continuous', y: 'continuous', z: 'continuous' });
  S.setModule('corrplotbuilder');
  S.setRoles('corrplotbuilder', { vars: ['x', 'y', 'z'] });
  await s(1500);
  // Every render at the engine boundary, with the method its payload
  // carries: the echo of a switch is the first render after it whose
  // payload names the switched method.
  const log = [];
  const G = window.GraphBuilder2, orig = G.render;
  G.render = function (id, payload) {
    try { log.push({ t: Date.now(), method: payload && payload.corrMethod }); } catch (e) {}
    return orig.apply(this, arguments);
  };
  const btn = document.querySelector('.graphbuilder2-host button[aria-label="Statistics"]');
  if (btn) { click(btn); await s(900); }
  // Re-queried per switch: an echo rebuilds the panel, and a select held
  // from before it is detached (its listener still fires, but into the
  // previous render's closure).
  const findSel = () => [...document.querySelectorAll('.graphbuilder2-host select')]
    .find(el => [...el.options].some(o => o.value === 'spearman'));
  if (!findSel()) return { error: 'no method select in the Sigma panel' };
  const readRows = () => [...document.querySelectorAll('.graphbuilder2-host [data-st-corrpairs] tr')]
    .map(tr => [...tr.querySelectorAll('td')].map(td => (td.innerText || '').trim()))
    .filter(cells => cells.length >= 3);
  const liveCells = () => (window.gb2_undo.getData().corrCells || [])
    .filter(c => c.a !== c.b)
    .map(c => ({ a: c.a, b: c.b, n: c.n, r: c.r, p: c.p }));
  const out = [];
  for (const meth of ['spearman', 'kendall', 'pearson']) {
    const sel = findSel();
    if (!sel) return { error: 'method select vanished before ' + meth };
    const mark = Date.now();
    sel.value = meth;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const atSwitch = { rows: readRows(), cells: liveCells() };
    let echo = false;
    for (let i = 0; i < 160; i++) {      // up to 8 s
      await s(50);
      if (log.some(e => e.t >= mark && e.method === meth)) { echo = true; break; }
    }
    await s(400);
    const first = { rows: readRows(), cells: liveCells() };
    await s(400);
    const second = { rows: readRows(), cells: liveCells() };
    out.push({ meth, echo, atSwitch, first, second,
               stable: JSON.stringify(first) === JSON.stringify(second) });
  }
  G.render = orig;
  return { out };
}, { x, y, z });

if (r.error) { ok(false, r.error); }
else for (const rec of r.out) {
  const label = rec.meth;
  ok(rec.echo, label + ': the switch produced an echo render carrying the method');
  ok(rec.stable, label + ': the settled state is stable across two reads');
  const num = /^-?\.?\d+(\.\d+)?$/;
  const cellsOk = rec.first.cells.length === 3 &&
    rec.first.cells.every(c => typeof c.r === 'number' && isFinite(c.r) &&
                               typeof c.p === 'number' && isFinite(c.p));
  ok(cellsOk, label + ': after the echo every pair keeps a finite r and p (' +
    JSON.stringify(rec.first.cells) + ')');
  const rowsOk = rec.first.rows.length === 3 &&
    rec.first.rows.every(cells => num.test(cells[1]) && (num.test(cells[2]) || /^<\s*\.001$/.test(cells[2])));
  ok(rowsOk, label + ': the All-pairs table prints a number in every coefficient and p cell (' +
    JSON.stringify(rec.first.rows) + ')');
  const atSwitchOk = rec.atSwitch.cells.length === 3 &&
    rec.atSwitch.cells.every(c => typeof c.r === 'number' && isFinite(c.r));
  ok(atSwitchOk, label + ': the instant client recompute at the switch had every r too');
  if (rec.meth === 'spearman') {
    const xy = rec.first.cells.find(c => c.a === 'x' && c.b === 'y') || {};
    ok(Math.abs((xy.r || 0) - 0.5) < 1e-9 && Math.abs((xy.p || 0) - 0.216170634920635) < 1e-6,
      'spearman x x y settles at R\'s rho 0.5, p .216170635 (' + JSON.stringify(xy) + ')');
  }
}
ok(pageErrors.length === 0, 'no page errors (' + pageErrors.slice(0, 2).join(' | ') + ')');
console.log((fail === 0 ? 'CORR METHOD ECHO CHECK PASS' : 'CORR METHOD ECHO CHECK FAIL') +
  ' (' + pass + ' ok, ' + fail + ' failing)');
await b.close();
process.exit(fail === 0 ? 0 : 1);
