// formula-fuzz-check.mjs - replay formula-fuzz.R's references against the
// REAL computed-variable path: load the hostile columns into the app,
// create each formula through PS_SHELL.saveComputedColumn (the exact
// function the dialog commits through), and compare the stored column
// cell for cell with base R at 10-significant-digit precision. Missing
// must match missing; strings must match exactly; the negative roster
// must be refused with an error and create no column. CONTROL: with the
// pre-fix ROUND (Math.round), the ROUND rows over half-values go red.
// Usage: node formula-fuzz-check.mjs [refs.json] (PS_PAGE overrides)
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
const { chromium } = createRequire('/private/tmp/x.js')('playwright');

const REFS = process.argv[2] || '/tmp/gb2-formula-fuzz.json';
const PAGE = process.env.PS_PAGE || path.resolve(
  new URL('.', import.meta.url).pathname, '..', 'index.html');
const refs = JSON.parse(fs.readFileSync(REFS, 'utf8'));
console.log('formula-fuzz replay: seed ' + refs.seed + ', ' +
  refs.cases.length + ' formulas, ' + refs.n + ' rows');

let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) { pass++; }
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

// Load the columns as RAW TEXT rows: numeric nulls become the "NA"
// missing token so the app's own ingestion decides missingness, the
// same road real data travels.
await page.evaluate((refs) => {
  const cols = Object.keys(refs.columns);
  const rows = [];
  for (let i = 0; i < refs.n; i++)
    rows.push(cols.map(c => {
      const v = refs.columns[c][i];
      return v === null ? 'NA' : String(v);
    }));
  window.PS_SHELL.loadTable('ff', cols, rows);
}, refs);
await page.waitForTimeout(400);

const results = await page.evaluate((refs) => {
  const S = window.PS_SHELL;
  const out = [];
  refs.cases.forEach((cs, i) => {
    const name = 'fz_' + i;
    const res = S.saveComputedColumn(name, cs.formula);
    if (res && res.error) { out.push({ i, error: String(res.error) }); return; }
    const t = S.project.table;
    const vals = [];
    for (let r = 0; r < refs.n; r++) {
      const raw = t.raw[name] ? t.raw[name][r] : undefined;
      vals.push(raw == null || raw === '' ? null : String(raw));
    }
    out.push({ i, vals });
  });
  const errs = refs.errors.map(f => {
    const res = S.saveComputedColumn('bad_x', f);
    return { f, refused: !!(res && res.error),
             created: S.project.table.order.indexOf('bad_x') !== -1 };
  });
  return { out, errs };
}, refs);

const relClose = (g, w) => {
  if (!isFinite(g) || !isFinite(w)) return false;
  const tol = 5e-10 * Math.max(1, Math.abs(w));
  return Math.abs(g - w) <= tol;
};
for (const r of results.out) {
  const cs = refs.cases[r.i];
  const label = '#' + r.i + ' ' + cs.formula;
  if (r.error) { ok(false, label + ': refused unexpectedly (' + r.error + ')'); continue; }
  let bad = '';
  for (let row = 0; row < refs.n; row++) {
    const want = cs.expect[row];
    const got = r.vals[row];
    if (want === null) {
      if (got !== null) { bad = 'row ' + row + ': got "' + got + '", want missing'; break; }
      continue;
    }
    if (got === null) { bad = 'row ' + row + ': got missing, want ' + JSON.stringify(want); break; }
    if (typeof want === 'number') {
      const g = parseFloat(got);
      // The grid stores 10 significant digits; the reference carries
      // full precision - compare at half that last digit.
      if (!relClose(g, Number(Number(want).toPrecision(10)))) {
        bad = 'row ' + row + ': got ' + got + ', R says ' + want; break;
      }
    } else if (String(got) !== String(want)) {
      bad = 'row ' + row + ': got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want);
      break;
    }
  }
  ok(!bad, label + (bad ? ' - ' + bad : ''));
}
for (const e of results.errs) {
  ok(e.refused && !e.created,
    'error case refused without a column: ' + e.f +
    (e.refused ? '' : ' (accepted!)') + (e.created ? ' (column created!)' : ''));
}

ok(pageErrors.length === 0, 'no page errors (' + pageErrors.slice(0, 2).join(' | ') + ')');
console.log((fail === 0 ? 'FORMULA FUZZ PASS' : 'FORMULA FUZZ FAIL') +
  ' (' + pass + ' ok, ' + fail + ' failing, seed ' + refs.seed + ')');
await b.close();
process.exit(fail === 0 ? 0 : 1);
