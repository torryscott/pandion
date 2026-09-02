// grid-autofit-check.mjs - the Data grid fits every column to its content
// by default (Torry, Sep 2026), instead of stretching them to fill the
// pane. The fit is implemented by FILLING the width a column is missing,
// so the grid's existing explicit-width path draws it; the rules that
// follow from that are what this pins:
//   1. a freshly loaded table renders sized, with one width per column,
//      and a wide-content column comes out wider than a narrow one;
//   2. a width the user dragged is never overwritten by the fit;
//   3. a width carried in a saved project is never overwritten either;
//   4. a column created later (a computed variable) is fitted when it
//      first renders;
//   5. a very long column is measured by a capped, strided scan, so
//      loading stays fast - and a wide value in the last row is still
//      caught, because the scan always includes it.
// Control: against the pre-change shell case 1 fails (the table renders
// unsized, with no widths at all).
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
const page = await b.newPage({ viewport: { width: 1500, height: 920 } });
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

const gridState = () => page.evaluate(() => {
  const table = document.querySelector('.ps-grid-table');
  const cols = {};
  document.querySelectorAll('#ps-datagrid th[data-grid-col]').forEach(th => {
    cols[th.getAttribute('data-grid-col')] = Math.round(th.getBoundingClientRect().width);
  });
  return {
    sized: !!table && table.classList.contains('ps-grid-sized'),
    widths: Object.assign({}, window.PS_SHELL.project.ui.columnWidths),
    rendered: cols,
    order: window.PS_SHELL.project.table.order.slice()
  };
});

console.log('case 1: a freshly loaded table is fitted, not stretched');
await page.evaluate(async () => {
  const rows = [];
  for (let i = 0; i < 40; i++)
    rows.push(['g' + (i % 3), i, 'Participant ' + i + ' from the long-name cohort']);
  window.PS_SHELL.loadTable('fit', ['g', 'n', 'notes'], rows,
    { g: 'nominal', n: 'continuous', notes: 'nominal' });
  window.PS_SHELL.setWorkspace('data');   // the grid only renders here
  await new Promise(r => setTimeout(r, 900));
});
let st = await gridState();
ok(st.sized, 'the grid renders content-sized (ps-grid-sized)');
ok(st.order.every(c => isFinite(Number(st.widths[c]))),
  'every column carries a width (' + JSON.stringify(st.widths) + ')');
ok(st.rendered.notes > st.rendered.g + 40,
  'the long-text column is much wider than the short one (' +
  st.rendered.g + ' vs ' + st.rendered.notes + ')');
ok(st.rendered.g >= 72 && st.rendered.notes <= 600,
  'fitted widths stay inside the 72..600 clamp');

console.log('case 2: a width the user dragged is not overwritten');
const head = c => page.locator(`#ps-datagrid th[data-grid-col="${c}"]`);
const box = await head('g').locator('.ps-grid-col-resizer').boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(250);
const dragged = (await gridState()).widths.g;
await page.evaluate(async () => {
  window.PS_SHELL.setModule('plotbuilder');   // force re-renders of the grid
  window.PS_SHELL.setWorkspace('data');
  await new Promise(r => setTimeout(r, 700));
});
st = await gridState();
ok(Math.abs(Number(st.widths.g) - Number(dragged)) < 2,
  'the dragged width survives later renders (' + dragged + ' -> ' + st.widths.g + ')');

console.log('case 3: a saved project keeps its own widths');
const roundTrip = await page.evaluate(async () => {
  const S = window.PS_SHELL;
  S.project.ui.columnWidths.notes = 240;      // a width the file carries
  const text = S.projectText();
  const res = S.openProjectText(text);
  S.setWorkspace('data');
  await new Promise(r => setTimeout(r, 1200));
  return { ok: !!(res && res.ok), notes: S.project.ui.columnWidths.notes };
});
ok(roundTrip.ok && Number(roundTrip.notes) === 240,
  'a width carried in the .pand is kept, not re-fitted (' + roundTrip.notes + ')');

console.log('case 4: a column added later is fitted when it appears');
const added = await page.evaluate(async () => {
  const S = window.PS_SHELL;
  S.saveComputedColumn('doubled', 'n * 2');
  await new Promise(r => setTimeout(r, 900));
  return { width: S.project.ui.columnWidths.doubled,
           inOrder: S.project.table.order.indexOf('doubled') !== -1 };
});
ok(added.inOrder && isFinite(Number(added.width)) && Number(added.width) >= 72,
  'the computed column got a fitted width (' + JSON.stringify(added) + ')');

console.log('case 5: a long column is measured by a capped scan, last row included');
const big = await page.evaluate(async () => {
  const rows = [];
  const n = 60000;
  for (let i = 0; i < n; i++) rows.push(['x', i]);
  // The widest value is the LAST row: a capped scan that ignored it would
  // under-fit the column, and one that scanned everything would be slow.
  rows[n - 1] = ['x', 'a very long trailing value that must still be measured'];
  const t0 = performance.now();
  window.PS_SHELL.loadTable('big', ['k', 'v'], rows, { k: 'nominal', v: 'nominal' });
  window.PS_SHELL.setWorkspace('data');
  await new Promise(r => setTimeout(r, 1500));
  return { ms: Math.round(performance.now() - t0),
           v: window.PS_SHELL.project.ui.columnWidths.v,
           k: window.PS_SHELL.project.ui.columnWidths.k };
});
ok(Number(big.v) > Number(big.k) + 100,
  'the trailing long value set the width (' + big.k + ' vs ' + big.v + ')');
ok(big.ms < 8000, 'a 60k-row table still loads promptly (' + big.ms + ' ms)');

ok(pageErrors.length === 0, 'no page errors (' + pageErrors.slice(0, 2).join(' | ') + ')');
console.log((fail === 0 ? 'GRID AUTOFIT CHECK PASS' : 'GRID AUTOFIT CHECK FAIL') +
  ' (' + pass + ' ok, ' + fail + ' failing)');
await b.close();
process.exit(fail === 0 ? 0 : 1);
