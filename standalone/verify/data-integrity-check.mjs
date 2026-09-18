// Value-preservation regressions from the September 2026 release audit.
// Exercise the same import, formula and project-adoption paths as the UI,
// with a fresh browser profile. PS_PAGE also runs this against the dist.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const { chromium } = createRequire('/private/tmp/x.js')('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const browser = await chromium.launch();
let checks = 0;
function check(value, message) { assert.ok(value, message); checks++; }
try {
  const page = await browser.newPage();
  await page.goto('file://' + path.resolve(root, process.env.PS_PAGE || 'standalone/index.html'));
  await page.waitForFunction(() => !!window.PS_SHELL);
  const precision = await page.evaluate(() => {
    const S = window.PS_SHELL;
    S.loadTable('precision', ['x'], [['10000000000'], ['1']]);
    for (const [name, formula] of [['a', 'x + 1'], ['b', 'a - x'],
      ['direct', '(x + 1) - x'], ['third', 'x / 3'], ['tripled', 'third * 3'],
      ['astext', 'UPPER(a)']]) {
      const r = S.saveComputedColumn(name, formula);
      if (r.error) throw Error(r.error);
    }
    return { raw: S.project.table.raw, file: S.projectFileText() };
  });
  check(precision.raw.a[0] === '10000000001', 'intermediate computed value retains the increment');
  check(precision.raw.b[0] === precision.raw.direct[0] && precision.raw.b[0] === '1',
    'chained and direct calculations agree');
  check(precision.raw.tripled[1] === '1', 'ordinary fractional intermediates retain precision');
  check(precision.raw.astext[0] === '10000000001', 'string functions retain the stored numeric value');
  const header = JSON.parse(precision.file);
  check(header.formatVersion === 3 && header.project.version === 5,
    'new projects refuse older readers that would round intermediate values');
  await page.reload();
  await page.waitForFunction(() => !!window.PS_SHELL);
  check(await page.evaluate(() => window.PS_SHELL.project.table.raw.a[0] === '10000000001'),
    'autosave/reload preserves precision');
  const history = await page.evaluate(() => {
    const S = window.PS_SHELL;
    const editedResult = S.saveComputedColumn('a', 'x + 2', 'a');
    if (editedResult.error) throw Error(editedResult.error);
    const edited = S.project.table.raw.b[0];
    S.dataUndo(); const undone = S.project.table.raw.b[0];
    S.dataRedo(); const redone = S.project.table.raw.b[0];
    return [edited, undone, redone];
  });
  check(history.join(',') === '2,1,2', 'formula edits and undo/redo recalculate dependent values precisely');

  // Return JSON text: Playwright's object transport treats __proto__ specially.
  const names = JSON.parse(await page.evaluate(() => {
    const S = window.PS_SHELL;
    const header = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'normal'];
    const rows = [['1', '2', '3', '4', '5'], ['6', '7', '8', '9', '10']];
    S.loadTable('names', header, rows);
    const formula = S.saveComputedColumn('sum', '__proto__ + constructor');
    const text = S.projectFileText();
    const reopened = S.openProjectText(text);
    const t = S.project.table;
    return JSON.stringify({ formula, reopened, raw: t.raw, computed: t.computed,
      own: header.every(c => Object.prototype.hasOwnProperty.call(t.raw, c)),
      csv: S.parseTableText(S.tableToCsv(t), ',', true, 0) });
  }));
  check(names.own && names.reopened.ok, 'all valid column names survive a project round trip');
  check(names.raw.__proto__[1] === '6' && names.raw.constructor[1] === '7', 'special names retain their values');
  check(names.formula.ok && names.raw.sum.join(',') === '3,13', 'formulas can reference special names');
  check(names.csv.rows[1].slice(0, 5).join(',') === '6,7,8,9,10', 'CSV export preserves special-name columns');

  const malformed = await page.evaluate(() => {
    const S = window.PS_SHELL;
    S.loadTable('safe project', ['a', 'b'], [['1', '10'], ['2', '20'], ['3', '30']]);
    S.saveComputedColumn('derived', 'a + b');
    const base = JSON.parse(S.projectFileText());
    const variants = [
      s => s.table.raw.a.pop(),
      s => delete s.table.raw.b,
      s => { s.table.raw.b = 'not an array'; },
      s => { s.table.raw.b[1] = { unexpected: 'object' }; },
      s => { s.table.order = ['a', 'a']; },
      s => { s.table.types.b = 'unknown'; },
      s => { s.table.computed = { b: [] }; },
      s => { s.charts = {}; },
      s => { delete s.table; }
    ];
    variants.push(
      s => { s.table.caseIds[1] = s.table.caseIds[0]; },
      s => { s.table.caseIds.pop(); },
      s => { s.table.missingTokens = "NA"; },
      s => { s.table.missingTokensByCol = { a: "NA" }; },
      s => { s.table.levelOrderDefaults = { a: 42 }; },
      s => { s.table.excluded = { a: { 10: 1 } }; },
      s => { s.table.excludedRows = { nonexistent: 1 }; },
      s => { s.table.filters = [{ col: 'a', op: 'bogus', value: 1 }]; },
      s => { delete s.charts[0].roles; }
    );
    const out = [];
    for (const damage of variants) {
      const f = JSON.parse(JSON.stringify(base)); damage(f.project);
      f.libraries = { palettes: { AuditShouldNotImport: ["#001122", "#334455"] } };
      const before = JSON.stringify(S.project.table.raw);
      const stored = localStorage.getItem('psstandalone.project.v2');
      const libs = JSON.stringify(S.libraries());
      const history = JSON.stringify(S.dataHistory());
      const r = S.openProjectText(JSON.stringify(f));
      out.push({ refused: !!r.error, preserved: before === JSON.stringify(S.project.table.raw),
        autosave: stored === localStorage.getItem('psstandalone.project.v2'),
        libraries: libs === JSON.stringify(S.libraries()),
        history: history === JSON.stringify(S.dataHistory()) });
    }
    return out;
  });
  malformed.forEach((r, i) => {
    check(r.refused, 'damaged project ' + i + ' is refused');
    check(r.preserved && r.autosave && r.libraries && r.history,
      'damaged project ' + i + ' leaves the open data, autosave and libraries intact');
  });
  const legacy = await page.evaluate(() => {
    const S = window.PS_SHELL;
    const f = JSON.parse(S.projectFileText());
    f.formatVersion = 2; f.project.version = 4;
    f.project.table.raw = { x: ['10000000000'], a: ['10000000000'], b: ['0'] };
    f.project.table.order = ['x', 'a', 'b'];
    f.project.table.types = { x: 'continuous', a: 'continuous', b: 'continuous' };
    f.project.table.computed = { a: 'x + 1', b: 'a - x' };
    f.project.table.caseIds = ['legacy-row'];
    const result = S.openProjectText(JSON.stringify(f));
    return { result, b: S.project.table.raw.b, toast: document.getElementById('ps-toast').textContent };
  });
  check(legacy.result.ok && legacy.b[0] === '1', 'legacy files recalculate chains with full precision');
  // The precision-migration notice was retired Sep 18 2026 (Torry: the app
  // had not spread widely enough for the disclosure to matter); legacy files
  // still recalculate at full precision, they just open quietly.
  check(!/full precision of the source data/.test(legacy.toast), 'legacy files open without the precision migration notice');
  console.log('DATA INTEGRITY CHECK PASS (' + checks + ' assertions)');
} finally { await browser.close(); }
