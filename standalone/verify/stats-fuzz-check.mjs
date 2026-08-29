// stats-fuzz-check.mjs - replay the R-generated references (stats-fuzz.R)
// against the rendered widget. Every displayed statistic in the Sigma
// panel - Compare pairs under Welch, Student, and Mann-Whitney, the Holm
// adjusted column, the one-way Omnibus, and the Descriptives cells - is
// parsed from the DOM and compared to base R at the precision the label
// shows. Correlation sets drive the Correlation module's Sigma summary
// across all three methods. Degenerate references (R returned nothing)
// must render as refusals, never as numbers. The seed prints first;
// GB2_FUZZ_SEED replays a failure exactly.
// Usage: node stats-fuzz-check.mjs [refs.json] (PS_PAGE overrides the page)
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
const { chromium } = createRequire('/private/tmp/x.js')('playwright');

const REFS = process.argv[2] || '/tmp/gb2-stats-fuzz.json';
const PAGE = process.env.PS_PAGE || path.resolve(
  new URL('.', import.meta.url).pathname, '..', 'index.html');
const refs = JSON.parse(fs.readFileSync(REFS, 'utf8'));
console.log('stats-fuzz replay: seed ' + refs.seed + ', ' +
  Object.keys(refs.datasets).length + ' datasets, ' +
  Object.keys(refs.corrs).length + ' corr sets');

let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL ' + label); }
};

// Displayed-precision tolerance: parse the shown number, allow half a
// unit in its last digit (plus float fuzz).
function tolOf(str) {
  const m = String(str).match(/\.(\d+)/);
  return (m ? 0.5 * Math.pow(10, -m[1].length) : 0.5) + 1e-9;
}
function closeTo(dispStr, refVal, label) {
  if (refVal === null || refVal === undefined) return; // handled by refusal checks
  const v = parseFloat(String(dispStr).replace(/[^\d.eE+-]/g, ''));
  ok(isFinite(v) && Math.abs(v - refVal) <= tolOf(dispStr),
    label + ': shown "' + dispStr + '" vs R ' + refVal);
}
function pClose(dispStr, refP, label) {
  if (refP === null || refP === undefined) return;
  const s = String(dispStr).trim();
  if (/<\s*\.001/.test(s)) { ok(refP < 0.001 + 1e-12, label + ': "< .001" vs R ' + refP); return; }
  const v = parseFloat(s.replace(/^p\s*[=<]\s*/, '').replace(/[^\d.eE+-]/g, ''));
  ok(isFinite(v) && Math.abs(v - refP) <= tolOf(s),
    label + ': shown "' + s + '" vs R ' + refP);
}

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1500, height: 980 } });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
await page.goto('file://' + path.resolve(PAGE));
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible().catch(() => false)) {
  try { await page.locator('#ps-welcome-blank, #ps-welcome-close').first().click({ timeout: 1500 }); } catch (e) {}
  await page.waitForTimeout(400);
}

// In-page helpers: load one dataset, ensure the Sigma panel is open on a
// named tab, and dump the visible stats tables as structured text.
async function loadGroups(groups) {
  await page.evaluate(async (groups) => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const rows = [];
    for (const g of Object.keys(groups))
      for (const v of groups[g]) rows.push([g, v]);
    window.PS_SHELL.loadTable('fz', ['g', 'v'], rows,
      { g: 'nominal', v: 'continuous' });
    window.PS_SHELL.setModule('plotbuilder');
    window.PS_SHELL.setRoles('plotbuilder', { xvar: 'g', yvar: 'v' });
    await s(1300);
  }, groups);
}
async function openStats(tabRe) {
  return page.evaluate(async (tabReSrc) => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const click = el => {
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      if (typeof el.click === 'function') el.click();
      else el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    };
    if (!document.querySelector('[data-st-pane]')) {
      const btn = document.querySelector('.graphbuilder2-host button[aria-label="Statistics"]');
      if (btn) { click(btn); await s(900); }
    }
    const re = new RegExp(tabReSrc, 'i');
    const tab = [...document.querySelectorAll('.graphbuilder2-host button')]
      .find(x => re.test((x.textContent || '').trim()) && x.offsetParent
        && x.getAttribute('aria-label') !== 'Statistics');
    if (tab) { click(tab); await s(450); }
    // Bare single-section modules (corr) render without pane attributes.
    return !!document.querySelector('[data-st-pane]')
      || /Strongest pair|All pairs/i.test(
           (document.querySelector('.graphbuilder2-host') || {}).innerText || '');
  }, tabRe.source);
}
async function setBand(field, value) {
  // The Test / Correct selects in the Compare-pairs control band.
  return page.evaluate(async ({ field, value }) => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const sels = [...document.querySelectorAll('[data-cmp-band] select, [data-st-pane="pairs"] select')];
    const sel = sels.find(x => [...x.options].some(o => o.value === value));
    if (!sel) return false;
    sel.value = value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await s(600);
    return true;
  }, { field, value });
}
async function readPairsRows() {
  return page.evaluate(() => {
    const out = [];
    document.querySelectorAll('[data-st-pane="pairs"] tr[data-link]').forEach(tr => {
      const tds = [...tr.querySelectorAll('td')].map(td => (td.innerText || '').trim());
      out.push({ cells: tds, sig: !!tr.querySelector('[data-cmp-sig]') });
    });
    return out;
  });
}
async function readVisiblePaneTable() {
  return page.evaluate(() => {
    const pane = [...document.querySelectorAll('[data-st-pane]')]
      .find(p => p.offsetParent && p.style.display !== 'none' && p.offsetHeight > 0);
    if (!pane) return null;
    const rows = [];
    pane.querySelectorAll('tr').forEach(tr => {
      const cells = [...tr.querySelectorAll('th,td')].map(c => (c.innerText || '').trim());
      if (cells.length) rows.push(cells);
    });
    return { key: pane.getAttribute('data-st-pane'), rows, text: pane.innerText };
  });
}
const rowFor = (rows, a, bkey) => rows.find(r =>
  r.cells.some(c => c.includes(a + ' vs ' + bkey)));

// ---- the group datasets -------------------------------------------------
for (const [name, ds] of Object.entries(refs.datasets)) {
  await loadGroups(ds.groups);
  ok(await openStats(/Compare pairs/), name + ': stats panel open');

  const pairKeys = Object.keys(ds.pairs);
  const parseStat = c => { const m = c.match(/([tUz])\s*\(?\s*([\d.]+)?\s*\)?\s*=\s*(-?[\d.]+)/); return m; };

  // Welch (the default Test)
  await setBand('test', 'welch');
  let rows = await readPairsRows();
  for (const pk of pairKeys) {
    const [ga, gb] = pk.split('|');
    const ref = ds.pairs[pk].welch;
    const row = rowFor(rows, ga, gb);
    if (!row) {
      const allNull = !ref || ref.t === null;
      ok(allNull, name + ' ' + pk + ': welch row missing');
      continue;
    }
    const statCell = row.cells.find(c => /=/.test(c) && /[t(]/.test(c)) || '';
    if (ref && ref.t !== null) {
      const m = statCell.match(/t\s*\(([\d.]+)\)\s*=\s*(-?[\d.]+)/);
      ok(!!m, name + ' ' + pk + ': welch stat renders ("' + statCell + '")');
      if (m) {
        closeTo(m[2], ref.t, name + ' ' + pk + ' welch t');
        closeTo(m[1], ref.df, name + ' ' + pk + ' welch df');
      }
      const pCell = row.cells[4] || '';
      pClose(pCell, ref.p, name + ' ' + pk + ' welch p');
      // significance chip keys on the RAW p, not the rounded display
      ok(row.sig === (ref.p < 0.05), name + ' ' + pk + ': chip matches raw p (' + ref.p + ')');
    } else {
      // degenerate: must refuse, never fabricate a t
      ok(!/t\s*\([\d.]+\)\s*=/.test(statCell) || /—/.test(statCell),
        name + ' ' + pk + ': degenerate welch refuses ("' + statCell + '")');
    }
  }
  // Holm adjusted column over the welch family
  if (ds.adjust && ds.adjust.holm && pairKeys.length > 1) {
    await setBand('correct', 'holm');
    rows = await readPairsRows();
    for (const pk of pairKeys) {
      const refAdj = ds.adjust.holm[pk];
      if (refAdj === undefined || refAdj === null) continue;
      const [ga, gb] = pk.split('|');
      const row = rowFor(rows, ga, gb);
      if (!row) continue;
      const adjCell = row.cells[5] || '';
      if (/—/.test(adjCell) || adjCell === '') continue; // no-adj disclosure paths
      pClose(adjCell, refAdj, name + ' ' + pk + ' holm p(adj)');
    }
    await setBand('correct', 'none');
  }
  // Student
  const anyStudent = pairKeys.some(pk => ds.pairs[pk].student && ds.pairs[pk].student.t !== null);
  if (anyStudent) {
    await setBand('test', 'studentT');
    rows = await readPairsRows();
    for (const pk of pairKeys) {
      const ref = ds.pairs[pk].student;
      if (!ref || ref.t === null) continue;
      const [ga, gb] = pk.split('|');
      const row = rowFor(rows, ga, gb);
      if (!row) continue;
      const statCell = row.cells.find(c => /t\s*\(/.test(c)) || '';
      const m = statCell.match(/t\s*\(([\d.]+)\)\s*=\s*(-?[\d.]+)/);
      if (m) {
        closeTo(m[2], ref.t, name + ' ' + pk + ' student t');
        closeTo(m[1], ref.df, name + ' ' + pk + ' student df');
      }
      pClose(row.cells[4] || '', ref.p, name + ' ' + pk + ' student p');
    }
  }
  // Mann-Whitney (U shown as min(U1,U2), the jamovi convention)
  const anyMwu = pairKeys.some(pk => ds.pairs[pk].mwu && ds.pairs[pk].mwu.p !== null);
  if (anyMwu) {
    await setBand('test', 'mannWhitneyU');
    rows = await readPairsRows();
    for (const pk of pairKeys) {
      const ref = ds.pairs[pk].mwu;
      if (!ref || ref.p === null) continue;
      const [ga, gb] = pk.split('|');
      const row = rowFor(rows, ga, gb);
      if (!row) continue;
      const statCell = row.cells.find(c => /U\s*=/.test(c)) || '';
      const m = statCell.match(/U\s*=\s*(-?[\d.]+)/);
      if (m) closeTo(m[1], ref.Umin, name + ' ' + pk + ' U(min)');
      pClose(row.cells[4] || '', ref.p, name + ' ' + pk + ' mwu p');
    }
  }
  await setBand('test', 'welch');

  // Omnibus (one-way over the category factor). The card is a TABLE
  // (Effect | F | df | p | effect size), not a sentence.
  const spreadGroups = Object.values(ds.cells).filter(c => c.sd !== null && c.sd > 0).length;
  if (ds.anova && ds.anova.F !== null && isFinite(ds.anova.F) && ds.anova.df2 > 0
      && spreadGroups >= 1 && Object.keys(ds.groups).length >= 2
      && Object.values(ds.cells).some(c => c.sd !== null && c.sd > 0)) {
    await openStats(/Omnibus/);
    const omni = await readVisiblePaneTable();
    let matched = false;
    if (omni) {
      for (const r of omni.rows) {
        const dfCell = r.find(c => /^\d+(\.\d+)?\s*,\s*\d+(\.\d+)?$/.test(c));
        const fCell = r.find((c, i) => i > 0 && /^-?\d+\.\d+$/.test(c));
        if (!dfCell || !fCell) continue;
        const [d1, d2] = dfCell.split(',').map(x => parseFloat(x));
        if (Math.abs(d1 - ds.anova.df1) > 0.51 || Math.abs(d2 - ds.anova.df2) > 0.51) continue;
        matched = true;
        closeTo(fCell, ds.anova.F, name + ' omnibus F');
        const pCell = r.find(c => /^(<\s*\.001|\.\d+|1\.000)$/.test(c.replace(/\s+/g, ' ')));
        if (pCell) pClose(pCell, ds.anova.p, name + ' omnibus p');
        break;
      }
    }
    ok(matched, name + ': omnibus row found (' +
      (omni ? omni.rows.length + ' rows' : 'no pane') + ')');
  }

  // Descriptives: mean / SD / SE per cell
  await openStats(/Descriptives/);
  const desc = await readVisiblePaneTable();
  if (desc) {
    for (const [g, cell] of Object.entries(ds.cells)) {
      const row = desc.rows.find(r => r[0] === g || r.some(c => c === g));
      if (!row) { ok(false, name + ' ' + g + ': descriptives row missing'); continue; }
      const header = desc.rows[0].map(h => h.toUpperCase());
      const at = lbl => { const i = header.findIndex(h => h === lbl); return i >= 0 ? row[i] : null; };
      const meanCell = at('MEAN'), sdCell = at('SD'), seCell = at('SE');
      if (meanCell && cell.mean !== null) closeTo(meanCell, cell.mean, name + ' ' + g + ' mean');
      if (sdCell && cell.sd !== null && !/—/.test(sdCell)) closeTo(sdCell, cell.sd, name + ' ' + g + ' sd');
      if (seCell && cell.se !== null && !/—/.test(seCell)) closeTo(seCell, cell.se, name + ' ' + g + ' se');
    }
  }
  await openStats(/Compare pairs/);
}

// ---- the correlation sets ----------------------------------------------
for (const [name, cs] of Object.entries(refs.corrs)) {
  await page.evaluate(async (cs) => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const rows = cs.x.map((x, i) => [x, cs.y[i]]);
    window.PS_SHELL.loadTable('fzc', ['x', 'y'], rows,
      { x: 'continuous', y: 'continuous' });
    window.PS_SHELL.setModule('corrplotbuilder');
    window.PS_SHELL.setRoles('corrplotbuilder', { vars: ['x', 'y'] });
    await s(1500);
  }, cs);
  ok(await openStats(/Matrix|Statistics|Summary/), name + ': corr stats open');
  for (const meth of ['pearson', 'spearman', 'kendall']) {
    const ref = cs[meth];
    if (!ref || ref.r === null) continue;
    await page.evaluate(async (meth) => {
      const s = ms => new Promise(r => setTimeout(r, ms));
      const sels = [...document.querySelectorAll('.graphbuilder2-host select')];
      const sel = sels.find(x => [...x.options].some(o => o.value === meth));
      if (sel && sel.value !== meth) {
        sel.value = meth;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        await s(1500);
      }
    }, meth);
    // The card is a TABLE: "x × y | .85 | < .001 | 57" under an
    // All-pairs (or Strongest-pair) header.
    const cells = await page.evaluate(() => {
      const trs = [...document.querySelectorAll('.graphbuilder2-host tr')];
      const row = trs.find(tr => /×/.test(tr.innerText || ''));
      return row ? [...row.querySelectorAll('td')].map(td => (td.innerText || '').trim()) : null;
    });
    ok(!!cells && cells.length >= 3, name + ' ' + meth + ': coefficient renders');
    if (cells && cells.length >= 3) {
      closeTo(cells[1], ref.r, name + ' ' + meth + ' r');
      if (!/…/.test(cells[2])) pClose(cells[2], ref.p, name + ' ' + meth + ' p');
      if (cells[3]) closeTo(cells[3], cs.n, name + ' ' + meth + ' n');
    }
  }
}

ok(pageErrors.length === 0, 'no page errors (' + pageErrors.slice(0, 2).join(' | ') + ')');
console.log((fail === 0 ? 'STATS FUZZ PASS' : 'STATS FUZZ FAIL') +
  ' (' + pass + ' ok, ' + fail + ' failing, seed ' + refs.seed + ')');
await b.close();
process.exit(fail === 0 ? 0 : 1);
