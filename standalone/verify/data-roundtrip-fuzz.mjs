// data-roundtrip-fuzz.mjs - the data layer's analog of the stats fuzzer.
// Seeded hostile tables are written as CSV text by an INDEPENDENT
// RFC-4180 writer here, pushed through the app's real parser
// (PS_SHELL.parseTableText), built into a real table (type inference
// included), exported by the app's real writer (PS_SHELL.tableToCsv),
// and reparsed - asserting, cell for cell:
//   A. the app's parser reads the independent writer's bytes exactly,
//   B. the built table stores every raw value verbatim,
//   C. export -> reparse returns the identical table (lossless round
//      trip - where corruption hides, because both halves can be
//      individually plausible while disagreeing),
//   D. inferred types are stable across the round trip, and match the
//      recipe (numbers continuous; leading-zero IDs, mixed columns, and
//      unparseable values nominal - never silently coerced).
// The roster covers quotes, embedded newlines (LF and CRLF), unicode,
// scientific notation, huge integers past float precision, leading
// zeros, whitespace padding, missing tokens, decimal commas, thousands
// separators, ragged rows, duplicate headers, BOM, and tab/semicolon
// delimiters. Seed rotates daily; PS_DATA_FUZZ_SEED replays a failure.
// Usage: node data-roundtrip-fuzz.mjs (PS_PAGE overrides the page)
import { createRequire } from 'node:module';
import path from 'node:path';
const { chromium } = createRequire('/private/tmp/x.js')('playwright');

const PAGE = process.env.PS_PAGE || path.resolve(
  new URL('.', import.meta.url).pathname, '..', 'index.html');
const now = new Date();
const seed = Number(process.env.PS_DATA_FUZZ_SEED) ||
  (now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate());
console.log('data round-trip fuzz: seed ' + seed);

// mulberry32 - the repo's standard seeded PRNG
function mkRnd(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mkRnd(seed);
const pick = arr => arr[Math.floor(rnd() * arr.length)];

// Column recipes: value generator + the type the app must infer.
const RECIPES = [
  { name: 'ints', type: 'continuous', gen: () => String(Math.floor(rnd() * 200 - 50)) },
  { name: 'floats', type: 'continuous', gen: () => (rnd() * 100 - 20).toFixed(1 + Math.floor(rnd() * 6)) },
  { name: 'sci', type: 'continuous', gen: () => (rnd() * 9 + 1).toFixed(3) + 'e' + (rnd() < 0.5 ? '-' : '') + Math.ceil(rnd() * 8) },
  { name: 'bigint', type: 'continuous', gen: () => String(9007199254740000 + Math.floor(rnd() * 2000)) },
  { name: 'padded', type: 'continuous', gen: () => '  ' + Math.floor(rnd() * 90) + ' ' },
  { name: 'negzero', type: 'continuous', gen: () => pick(['-0', '0', '0.0', '-0.0']) },
  { name: 'idcoded', type: 'nominal', gen: () => '00' + Math.floor(rnd() * 900 + 100) },
  { name: 'levels', type: 'nominal', gen: () => pick(['low', 'mid', 'high']) },
  { name: 'mixed', type: 'nominal', gen: () => rnd() < 0.7 ? String(Math.floor(rnd() * 50)) : pick(['x', 'unknown', '?']) },
  { name: 'deccomma', type: 'nominal', gen: () => Math.floor(rnd() * 9) + ',' + Math.floor(rnd() * 90) },
  { name: 'thousands', type: 'nominal', gen: () => '1,' + String(100 + Math.floor(rnd() * 900)) },
  { name: 'quoty', type: 'nominal', gen: () => pick(['say "hi"', 'a,b', 'line1\nline2', 'tail\r\nwind', 'mac\rline', 'plain']) },
  { name: 'unicode', type: 'nominal', gen: () => pick(['café', '北京', 'naïve', 'A ¦ B', '📊 chart']) },
  { name: 'inflike', type: 'nominal', gen: () => pick(['Infinity', '-Infinity', 'NaN', '1']) },
  { name: 'missing', type: 'continuous', gen: () => rnd() < 0.3 ? pick(['NA', '']) : String(Math.floor(rnd() * 100)) },
];

// Independent RFC-4180 writer (deliberately NOT the app's csvCell).
const wr = (v, d) => (v.indexOf('"') >= 0 || v.indexOf(d) >= 0 ||
  v.indexOf('\n') >= 0 || v.indexOf('\r') >= 0)
  ? '"' + v.replace(/"/g, '""') + '"' : v;

function genTable(t) {
  const nCols = 2 + Math.floor(rnd() * 5);
  const nRows = 4 + Math.floor(rnd() * 20);
  const cols = [];
  for (let c = 0; c < nCols; c++) cols.push(pick(RECIPES));
  const header = cols.map((r, c) => r.name + '_' + c);
  const rows = [];
  for (let i = 0; i < nRows; i++) rows.push(cols.map(r => r.gen()));
  const delim = pick([',', ',', ',', '\t', ';']);
  const eol = pick(['\n', '\r\n']);
  let text = [header, ...rows].map(rw => rw.map(v => wr(v, delim)).join(delim)).join(eol) + eol;
  let bom = false;
  if (t % 5 === 4) { text = '﻿' + text; bom = true; }
  return { header, rows, types: cols.map(r => r.type), text, delim, bom };
}

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

async function roundTrip(tbl, label) {
  return page.evaluate(({ tbl, label }) => {
    const out = [];
    const S = window.PS_SHELL;
    const p1 = S.parseTableText(tbl.text, 'auto', true, 0);
    if (!p1) return [[false, label + ': parse returned null']];
    // A: parser reads the independent writer's bytes exactly
    out.push([p1.header.length === tbl.header.length,
      label + ': header width ' + p1.header.length + ' vs ' + tbl.header.length]);
    // PINNED ingestion normalization: parseDelimitedRows runs
    // text.replace(/\r\n?/g, "\n") before quote parsing, so CR and CRLF
    // inside quoted cells arrive as LF. Content survives; only the
    // line-ending flavor unifies. Everything else must be byte-exact.
    const norm = v => v.replace(/\r\n?/g, '\n');
    let cellsOk = true, firstBad = '';
    for (let i = 0; i < tbl.rows.length && cellsOk; i++) {
      if (!p1.rows[i]) { cellsOk = false; firstBad = 'row ' + i + ' missing'; break; }
      for (let c = 0; c < tbl.header.length; c++) {
        if (p1.rows[i][c] !== norm(tbl.rows[i][c])) {
          cellsOk = false;
          firstBad = 'r' + i + 'c' + c + ' ' + JSON.stringify(p1.rows[i][c]) +
            ' vs ' + JSON.stringify(tbl.rows[i][c]);
          break;
        }
      }
    }
    out.push([cellsOk, label + ': parse == source (' + firstBad + ')']);
    out.push([p1.header.every(h => h.indexOf('﻿') < 0),
      label + ': BOM never reaches a header name']);
    // B: build the real table; raw storage is verbatim
    S.loadTable('fz_' + label, p1.header, p1.rows);
    const t = S.project.table;
    let rawOk = true, rb = '';
    for (let c = 0; c < t.order.length && rawOk; c++) {
      const col = t.order[c];
      for (let i = 0; i < p1.rows.length; i++) {
        const want = p1.rows[i][c] == null ? '' : p1.rows[i][c];
        const got = t.raw[col][i] == null ? '' : String(t.raw[col][i]);
        if (got !== want) { rawOk = false; rb = col + ' r' + i + ' ' + JSON.stringify(got) + ' vs ' + JSON.stringify(want); break; }
      }
    }
    out.push([rawOk, label + ': raw storage verbatim (' + rb + ')']);
    // D1: inferred types match the recipes
    for (let c = 0; c < tbl.types.length; c++) {
      const col = t.order[c];
      out.push([t.types[col] === tbl.types[c],
        label + ' ' + col + ': type ' + t.types[col] + ' vs expected ' + tbl.types[c]]);
    }
    // C: export -> reparse is the identity
    const csv = S.tableToCsv(t);
    const p2 = S.parseTableText(csv, ',', true, 0);
    if (!p2) { out.push([false, label + ': reparse returned null']); return out; }
    let rtOk = p2.rows.length === p1.rows.length && p2.header.length === t.order.length;
    let rtBad = rtOk ? '' : 'shape ' + p2.rows.length + 'x' + p2.header.length;
    for (let i = 0; i < p1.rows.length && rtOk; i++)
      for (let c = 0; c < t.order.length; c++) {
        const want = t.raw[t.order[c]][i] == null ? '' : String(t.raw[t.order[c]][i]);
        if (p2.rows[i][c] !== want) {
          rtOk = false;
          rtBad = 'r' + i + 'c' + c + ' ' + JSON.stringify(p2.rows[i][c]) + ' vs ' + JSON.stringify(want);
          break;
        }
      }
    out.push([rtOk, label + ': export->reparse identity (' + rtBad + ')']);
    // D2: types stable across the round trip
    S.loadTable('fz2_' + label, p2.header, p2.rows);
    const t2 = S.project.table;
    let tyOk = true, tyBad = '';
    for (let c = 0; c < t.order.length; c++) {
      if (t2.types[t2.order[c]] !== t.types[t.order[c]]) {
        tyOk = false; tyBad = t.order[c]; break;
      }
    }
    out.push([tyOk, label + ': types stable across round trip (' + tyBad + ')']);
    return out;
  }, { tbl, label });
}

// ---- seeded random tables ------------------------------------------------
const N = Number(process.env.PS_DATA_FUZZ_N) || 14;
for (let t = 0; t < N; t++) {
  const tbl = genTable(t);
  const res = await roundTrip(tbl, 'rand' + String(t).padStart(2, '0') +
    (tbl.delim === ',' ? '' : tbl.delim === '\t' ? '(tab)' : '(semi)') +
    (tbl.bom ? '(bom)' : ''));
  for (const [cond, label] of res) ok(cond, label);
}

// ---- fixed hostile roster ------------------------------------------------
// Ragged rows: the parser pads short rows with "" - the round trip is
// asserted on the PADDED table (first-trip normalization is allowed,
// second trip must be the identity).
{
  const text = 'a,b,c\n1,2,3\n4,5\n6\n7,8,9\n';
  const res = await page.evaluate((text) => {
    const S = window.PS_SHELL;
    const out = [];
    const p1 = S.parseTableText(text, ',', true, 0);
    out.push([!!p1 && p1.ragged === true, 'ragged: flagged as ragged']);
    if (!p1) return out;
    out.push([p1.rows[1].length === 3 && p1.rows[1][2] === '',
      'ragged: short rows padded with empty cells']);
    S.loadTable('fz_ragged', p1.header, p1.rows);
    const t = S.project.table;
    const p2 = S.parseTableText(S.tableToCsv(t), ',', true, 0);
    let same = p2 && p2.rows.length === p1.rows.length;
    for (let i = 0; same && i < p1.rows.length; i++)
      for (let c = 0; c < 3; c++)
        if (p2.rows[i][c] !== (t.raw[t.order[c]][i] == null ? '' : String(t.raw[t.order[c]][i]))) same = false;
    out.push([same, 'ragged: padded table round-trips exactly']);
    return out;
  }, text);
  for (const [cond, label] of res) ok(cond, label);
}
// Duplicate headers: data must survive under the resolved names.
{
  const res = await page.evaluate(() => {
    const S = window.PS_SHELL;
    const out = [];
    const p1 = S.parseTableText('x,x,x\n1,2,3\n4,5,6\n', ',', true, 0);
    if (!p1) return [[false, 'dupheader: parse returned null']];
    const uniq = new Set(p1.header);
    out.push([uniq.size === 3, 'dupheader: names resolved unique (' + p1.header.join('|') + ')']);
    S.loadTable('fz_dup', p1.header, p1.rows);
    const t = S.project.table;
    out.push([String(t.raw[t.order[0]][0]) === '1' && String(t.raw[t.order[1]][0]) === '2'
      && String(t.raw[t.order[2]][0]) === '3',
      'dupheader: every column keeps its own data']);
    return out;
  });
  for (const [cond, label] of res) ok(cond, label);
}

ok(pageErrors.length === 0, 'no page errors (' + pageErrors.slice(0, 2).join(' | ') + ')');
console.log((fail === 0 ? 'DATA ROUNDTRIP FUZZ PASS' : 'DATA ROUNDTRIP FUZZ FAIL') +
  ' (' + pass + ' ok, ' + fail + ' failing, seed ' + seed + ')');
await b.close();
process.exit(fail === 0 ? 0 : 1);
