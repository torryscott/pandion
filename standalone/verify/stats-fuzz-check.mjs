// stats-fuzz-check.mjs - replay the R-generated references (stats-fuzz.R)
// against the rendered widget. Every displayed statistic in the Sigma
// panel - Compare pairs under Welch, Student, and Mann-Whitney, the
// Holm and Games-Howell adjusted columns, the one-way Omnibus, and the
// Descriptives cells - is parsed from the DOM and compared to base R at
// the precision the label shows. Correlation sets drive the Correlation
// module's Sigma summary across all three methods, then the Scatter
// module's linear slope + R^2 and the 95% confidence ellipse (read from
// the payload in data units, compared via rotation-invariant center /
// axes / area). RM sets cover paired t and Wilcoxon signed-rank in the
// exact, tied, zero-difference, and large-n regimes; a likert battery
// covers item-mean t CIs and Cronbach's alpha; and the Q-Q confidence
// band is read off the rendered pixels through the y-axis tick
// calibration. Degenerate references (R returned nothing) must render
// as refusals, never as numbers. The seed prints first; GB2_FUZZ_SEED
// replays a failure exactly.
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
async function setBand(field, value, refusalExpected = false) {
  // The Test / Correct selects in the Compare-pairs control band.
  const selected = await page.evaluate(async ({ field, value }) => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const sels = [...document.querySelectorAll('[data-cmp-band] select, [data-st-pane="pairs"] select')];
    const sel = sels.find(x => [...x.options].some(o => o.value === value));
    if (!sel) return false;
    sel.value = value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await s(600);
    return true;
  }, { field, value });
  if (!selected && refusalExpected) {
    const text = await page.locator('.graphbuilder2-host').innerText();
    ok(/Not available for this chart/i.test(text),
      "Undefined comparison has a visible unavailable-result explanation");
  } else ok(selected, "Compare-pairs " + field + " control offers " + value);
  // Negative-control mode: erase rendered adjusted p-values AFTER the
  // genuine UI change. A small fixture must then exit nonzero. Normal CI
  // runs leave this unset; the guard check below verifies the verifier.
  if (process.env.PS_FUZZ_NEGATIVE_CONTROL === value) {
    await page.evaluate(() => {
      document.querySelectorAll('[data-st-pane="pairs"] tr[data-link]').forEach(tr => {
        const td = tr.querySelectorAll('td')[5];
        if (td) td.textContent = '';
      });
    });
  }
  return selected;
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
  // Constant data can legitimately offer no comparison controls. This is
  // allowed only when R has no defined p-value for ANY comparison method,
  // and the panel must explicitly say that the result is unavailable.
  const noNumericalPairs = pairKeys.every(pk =>
    Object.values(ds.pairs[pk]).every(ref => !ref || !Number.isFinite(ref.p)));
  const parseStat = c => { const m = c.match(/([tUz])\s*\(?\s*([\d.]+)?\s*\)?\s*=\s*(-?[\d.]+)/); return m; };

  // Welch (the default Test)
  await setBand('test', 'welch', noNumericalPairs);
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
      if (!row) { ok(false, name + " " + pk + ": expected comparison row missing"); continue; }
      const adjCell = row.cells[5] || '';
      pClose(adjCell, refAdj, name + ' ' + pk + ' holm p(adj)');
    }
    await setBand('correct', 'none');
  }
  // Games-Howell adjusted p (test is still Welch here - the pooled trio
  // gates on it). Reference: R's own t.test + ptukey vs the engine's
  // descriptive recompute through its JS ptukey port.
  if (ds.adjust && ds.adjust.gh && Object.keys(ds.adjust.gh).length > 0) {
    await setBand('correct', 'gamesHowell');
    rows = await readPairsRows();
    for (const pk of pairKeys) {
      const refGh = ds.adjust.gh[pk];
      if (refGh === undefined || refGh === null) continue;
      const [ga, gb] = pk.split('|');
      const row = rowFor(rows, ga, gb);
      if (!row) { ok(false, name + " " + pk + ": expected comparison row missing"); continue; }
      const adjCell = row.cells[5] || '';
      pClose(adjCell, refGh, name + ' ' + pk + ' games-howell p(adj)');
    }
    await setBand('correct', 'none');
  }
  // Tukey adjusted p vs R's own TukeyHSD (Kramer for unequal n).
  if (ds.adjust && ds.adjust.tukey && Object.keys(ds.adjust.tukey).length > 0) {
    await setBand('correct', 'tukey');
    rows = await readPairsRows();
    for (const pk of pairKeys) {
      const refTk = ds.adjust.tukey[pk];
      if (refTk === undefined || refTk === null) continue;
      const [ga, gb] = pk.split('|');
      const row = rowFor(rows, ga, gb);
      if (!row) continue;
      const adjCell = row.cells[5] || '';
      if (/—/.test(adjCell) || adjCell === '') continue;
      pClose(adjCell, refTk, name + ' ' + pk + ' tukey p(adj)');
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
      if (!row) { ok(false, name + " " + pk + ": expected comparison row missing"); continue; }
      const statCell = row.cells.find(c => /t\s*\(/.test(c)) || '';
      const m = statCell.match(/t\s*\(([\d.]+)\)\s*=\s*(-?[\d.]+)/);
      ok(!!m, name + " " + pk + ": student t renders");
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
      if (!row) { ok(false, name + " " + pk + ": expected comparison row missing"); continue; }
      const statCell = row.cells.find(c => /U\s*=/.test(c)) || '';
      const m = statCell.match(/U\s*=\s*(-?[\d.]+)/);
      ok(!!m, name + " " + pk + ": Mann-Whitney U renders");
      if (m) closeTo(m[1], ref.Umin, name + ' ' + pk + ' U(min)');
      pClose(row.cells[4] || '', ref.p, name + ' ' + pk + ' mwu p');
    }
  }
  await setBand('test', 'welch', noNumericalPairs);

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
        pClose(pCell || "", ds.anova.p, name + ' omnibus p');
        break;
      }
    }
    ok(matched, name + ': omnibus row found (' +
      (omni ? omni.rows.length + ' rows' : 'no pane') + ')');
  }

  // Descriptives: mean / SD / SE per cell
  await openStats(/Descriptives/);
  const desc = await readVisiblePaneTable();
  ok(!!desc, name + ": descriptives table renders");
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
      const kCell = at('KURTOSIS');
      if (kCell && cell.g2 !== null && cell.g2 !== undefined && !/—/.test(kCell))
        closeTo(kCell, cell.g2, name + ' ' + g + ' kurtosis (G2)');
      const skCell = at('SKEW');
      if (skCell && cell.g1 !== null && cell.g1 !== undefined && !/—/.test(skCell))
        closeTo(skCell, cell.g1, name + ' ' + g + ' skew (G1)');
    }
  }
  await openStats(/Compare pairs/);
}

// ---- the correlation sets ----------------------------------------------
// A method switch is answered by an ECHO render (the shell re-marshals
// with the committed method), and the engine's guard recomputes the
// cells at that render's entry. The read must come AFTER the echo or a
// broken recompute hides behind timing: a fixed 1500 ms read passed for
// three days while every Spearman echo blanked the cells of small
// tie-free pairs (the em-dash failure at seed 20260901, n = 8, only
// showed on a slow run). So the renders
// are intercepted once and each switch waits for the render carrying
// its method (see corr-method-echo-check.mjs for the dedicated probe).
await page.evaluate(() => {
  if (window.__fzRenderLog) return;
  window.__fzRenderLog = [];
  const G = window.GraphBuilder2, orig = G.render;
  G.render = function (id, payload) {
    try { window.__fzRenderLog.push({ t: Date.now(), method: payload && payload.corrMethod }); } catch (e) {}
    return orig.apply(this, arguments);
  };
});
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
    const echoed = await page.evaluate(async (meth) => {
      const s = ms => new Promise(r => setTimeout(r, ms));
      const sels = [...document.querySelectorAll('.graphbuilder2-host select')];
      const sel = sels.find(x => [...x.options].some(o => o.value === meth));
      if (!sel || sel.value === meth) return 'unchanged';
      const mark = Date.now();
      sel.value = meth;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      for (let i = 0; i < 160; i++) {          // up to 8 s for the echo
        await s(50);
        if (window.__fzRenderLog.some(e => e.t >= mark && e.method === meth)) {
          await s(400);                          // panel restore after the echo
          return 'echoed';
        }
      }
      return 'no-echo';
    }, meth);
    ok(echoed !== 'no-echo', name + ' ' + meth + ': the method switch was echoed by a render');
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
      pClose(cells[2], ref.p, name + ' ' + meth + ' p');
      closeTo(cells[3], cs.n, name + ' ' + meth + ' n');
    }
  }
}

// ---- repeated-measures sets: paired t + Wilcoxon signed-rank ------------
for (const [name, rs] of Object.entries(refs.rmsets || {})) {
  await page.evaluate(async (rs) => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const occ = Object.keys(rs.data);
    const n = rs.data[occ[0]].length;
    const rows = [];
    for (let i = 0; i < n; i++) rows.push(occ.map(o => rs.data[o][i]));
    const types = {}; occ.forEach(o => { types[o] = 'continuous'; });
    window.PS_SHELL.loadTable('fzr', occ, rows, types);
    window.PS_SHELL.setModule('rmplotbuilder');
    window.PS_SHELL.setRoles('rmplotbuilder', { measures: occ });
    await s(1500);
  }, rs);
  ok(await openStats(/Compare pairs/), name + ': rm stats open');
  // Paired t
  await setBand('test', 'pairedT');
  let rmRows = await readPairsRows();
  for (const [pk, pr] of Object.entries(rs.pairs)) {
    const ref = pr.paired;
    if (!ref || ref.t === null) continue;
    const [oa, ob] = pk.split('|');
    const row = rowFor(rmRows, oa, ob);
    if (!row) { ok(false, name + ' ' + pk + ': paired row missing'); continue; }
    const statCell = row.cells.find(c => /t\s*\(/.test(c)) || '';
    const m = statCell.match(/t\s*\(([\d.]+)\)\s*=\s*(-?[\d.]+)/);
    ok(!!m, name + ' ' + pk + ': paired t renders ("' + statCell + '")');
    if (m) {
      closeTo(m[2], ref.t, name + ' ' + pk + ' paired t');
      closeTo(m[1], ref.df, name + ' ' + pk + ' paired df');
    }
    pClose(row.cells[4] || '', ref.p, name + ' ' + pk + ' paired p');
  }
  // Wilcoxon signed-rank (V + p, R's exact-vs-approx auto rule)
  ok(await setBand('test', 'wilcoxonSignedRank'), name + ': signed-rank offered');
  rmRows = await readPairsRows();
  for (const [pk, pr] of Object.entries(rs.pairs)) {
    const ref = pr.signedrank;
    if (!ref || ref.p === null) continue;
    const [oa, ob] = pk.split('|');
    const row = rowFor(rmRows, oa, ob);
    if (!row) { ok(false, name + ' ' + pk + ': signed-rank row missing'); continue; }
    const statCell = row.cells.find(c => /[VW]\s*=/.test(c)) || '';
    const m = statCell.match(/[VW]\s*=\s*([\d.]+)/);
    ok(!!m, name + " " + pk + ": signed-rank V renders");
    if (m) closeTo(m[1], ref.V, name + ' ' + pk + ' signed-rank V');
    pClose(row.cells[4] || '', ref.p, name + ' ' + pk + ' signed-rank p');
  }
  // One-way RM omnibus with Greenhouse-Geisser, from first principles.
  if (rs.omni && rs.omni.F !== null) {
    await openStats(/Omnibus/);
    const omni = await readVisiblePaneTable();
    let matched = false;
    if (omni) {
      for (const r of omni.rows) {
        const dfCell = r.find(c => /^\d+(\.\d+)?\s*,\s*\d+(\.\d+)?$/.test(c));
        const fCell = r.find((c, i) => i > 0 && /^-?\d+\.\d+$/.test(c));
        if (!dfCell || !fCell) continue;
        const [d1, d2] = dfCell.split(',').map(x => parseFloat(x));
        if (Math.abs(d1 - rs.omni.df1) > 0.06 || Math.abs(d2 - rs.omni.df2) > 0.06) continue;
        matched = true;
        closeTo(fCell, rs.omni.F, name + ' rm omnibus F');
        const pCell = r.find(c => /^(<\s*\.001|\.\d+|1\.000)$/.test(c.replace(/\s+/g, ' ')));
        if (pCell) pClose(pCell, rs.omni.p, name + ' rm omnibus p (GG)');
        const etaCell = [...r].reverse().find(c => /^\.\d+$/.test(c));
        if (etaCell && etaCell !== pCell) closeTo(etaCell, rs.omni.etaP, name + ' rm omnibus eta2p');
        break;
      }
    }
    ok(matched, name + ': GG omnibus row found (df ' +
      rs.omni.df1.toFixed(2) + ', ' + rs.omni.df2.toFixed(2) + ')');
    await openStats(/Compare pairs/);
  }
}

// ---- likert battery: item-mean t CIs + Cronbach's alpha -----------------
for (const [name, lk] of Object.entries(refs.lksets || {})) {
  await page.evaluate(async (lk) => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const items = Object.keys(lk.data);
    const n = lk.data[items[0]].length;
    const rows = [];
    for (let i = 0; i < n; i++) rows.push(items.map(q => String(lk.data[q][i])));
    const types = {}; items.forEach(q => { types[q] = 'nominal'; });
    window.PS_SHELL.loadTable('fzl', items, rows, types);
    window.PS_SHELL.setModule('likertplotbuilder');
    window.PS_SHELL.setRoles('likertplotbuilder', { items: items });
    await s(1500);
  }, lk);
  ok(await openStats(/Item means/), name + ': likert stats open');
  const tbl = await readVisiblePaneTable();
  ok(!!tbl, name + ": item means table renders");
  if (tbl) {
    const header = tbl.rows[0] || [];
    const meanAt = header.findIndex(h => /^Mean$/i.test(h));
    const ciAt = header.findIndex(h => /% CI/i.test(h));
    ok(meanAt >= 0 && ciAt >= 0, name + ': Mean + CI columns present (' + header.join('|') + ')');
    for (const [item, ref] of Object.entries(lk.items)) {
      const row = tbl.rows.find(r => r[0] === item);
      if (!row) { ok(false, name + ' ' + item + ': row missing'); continue; }
      if (meanAt >= 0) closeTo(row[meanAt], ref.mean, name + ' ' + item + ' mean');
      if (ciAt >= 0) {
        const nums = (row[ciAt] || '').match(/-?[\d.]+/g) || [];
        ok(nums.length >= 2, name + ' ' + item + ': CI renders ("' + row[ciAt] + '")');
        if (nums.length >= 2) {
          closeTo(nums[0], ref.lo, name + ' ' + item + ' CI lo');
          closeTo(nums[1], ref.hi, name + ' ' + item + ' CI hi');
        }
      }
    }
  }
  if (lk.alpha !== null && lk.alpha !== undefined) {
    await openStats(/Reliability/);
    const rel = await readVisiblePaneTable();
    const aCell = rel && rel.rows.flat().find(c => /^-?\.?\d*\.\d+$/.test(c));
    ok(!!aCell, name + ': alpha renders');
    if (aCell) closeTo(aCell, lk.alpha, name + ' alpha');
  }
}

// ---- scatter: linear slope + R^2, then the confidence ellipse -----------
for (const [name, cs] of Object.entries(refs.corrs)) {
  if (!cs.fit || cs.fit.slope === null) continue;
  await page.evaluate(async (cs) => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const rows = cs.x.map((x, i) => [x, cs.y[i]]);
    window.PS_SHELL.loadTable('fzs', ['x', 'y'], rows,
      { x: 'continuous', y: 'continuous' });
    window.PS_SHELL.setModule('xyplotbuilder');
    window.PS_SHELL.setRoles('xyplotbuilder', { xvar: 'x', yvar: 'y' });
    await s(1500);
  }, cs);
  // Scatter's Sigma is a bare single-section card (no data-st-pane and
  // no pairs table), so openStats' generic success probe misses it; the
  // 'scatter table renders' assertion below is the real gate.
  await openStats(/Statistics|Correlation/);
  const xt = await page.evaluate(() => {
    const trs = [...document.querySelectorAll('.graphbuilder2-host tr')];
    const head = trs.find(tr => /Linear slope/i.test(tr.innerText || ''));
    if (!head) return null;
    const headers = [...head.querySelectorAll('th')].map(th => (th.innerText || '').trim());
    const body = trs.find(tr => tr !== head && tr.querySelectorAll('td').length >= headers.length - 1);
    const cells = body ? [...body.querySelectorAll('td')].map(td => (td.innerText || '').trim()) : null;
    return { headers, cells };
  });
  ok(!!(xt && xt.cells), name + ': scatter table renders');
  if (xt && xt.cells) {
    const at = re => { const i = xt.headers.findIndex(h => re.test(h)); return i >= 0 ? xt.cells[i] : null; };
    const sl = at(/Linear slope/i), r2 = at(/R²|R2/i);
    closeTo(sl, cs.fit.slope, name + ' linear slope');
    if (cs.fit.r2 !== null) closeTo(r2, cs.fit.r2, name + ' linear R2');
  }
  // Confidence ellipse: enable, then read the payload's data-unit points
  // and compare rotation-invariant quantities against R's eigen route.
  if (cs.ell) {
    const got = await page.evaluate(async () => {
      const s = ms => new Promise(r => setTimeout(r, ms));
      window.setOption('xyShowEllipse', true);
      await s(1600);
      const d = window.gb2_undo && window.gb2_undo.getData && window.gb2_undo.getData();
      const e = d && d.xyEllipses && d.xyEllipses[0];
      window.setOption('xyShowEllipse', false);
      if (!e || !e.points || e.points.length < 50) return null;
      const pts = e.points;
      // The polygon samples t = 2*pi*i/99 for i = 0..99, so the first
      // and last points coincide; the mean over one full period (the
      // first 99) recovers the center exactly (uniform cos/sin sum 0).
      let cx = 0, cy = 0;
      const nP = pts.length - 1;
      for (let i = 0; i < nP; i++) { cx += pts[i].x; cy += pts[i].y; }
      cx /= nP; cy /= nP;
      // Axis lengths via the SECOND-MOMENT matrix of the uniform-t
      // samples: over one full period the mean outer product is exactly
      // (aa' + bb')/2, so its eigenvalues are a^2/2 and b^2/2 with NO
      // sampling error. (Min/max over sampled distances was tried first
      // and overshoots the semi-minor axis on a highly eccentric
      // ellipse - the daily seed rotation found that estimator bias on
      // 20260830; the engine's points were exact all along.)
      let sxx = 0, sxy = 0, syy = 0, area = 0;
      for (let i = 0; i < nP; i++) {
        const dx = pts[i].x - cx, dy = pts[i].y - cy;
        sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
      }
      sxx /= nP; sxy /= nP; syy /= nP;
      const tr = sxx + syy, det = sxx * syy - sxy * sxy;
      const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
      const rmax = Math.sqrt(2 * (tr / 2 + disc));
      const rmin = Math.sqrt(2 * Math.max(0, tr / 2 - disc));
      for (let i = 0; i < pts.length; i++) {
        const q = pts[(i + 1) % pts.length];
        area += (pts[i].x * q.y - q.x * pts[i].y) / 2;
      }
      return { cx, cy, rmax, rmin, area: Math.abs(area) };
    });
    ok(!!got, name + ': ellipse ships in the payload');
    if (got) {
      const rel = (a, b) => Math.abs(a - b) <= 2e-3 * Math.max(1e-9, Math.abs(b));
      const relTight = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1e-9, Math.abs(b));
      ok(Math.abs(got.cx - cs.ell.cx) < 1e-6 && Math.abs(got.cy - cs.ell.cy) < 1e-6,
        name + ' ellipse center: (' + got.cx + ',' + got.cy + ') vs R (' + cs.ell.cx + ',' + cs.ell.cy + ')');
      ok(relTight(got.rmax, cs.ell.rmax), name + ' ellipse major axis: ' + got.rmax + ' vs R ' + cs.ell.rmax);
      ok(relTight(got.rmin, cs.ell.rmin), name + ' ellipse minor axis: ' + got.rmin + ' vs R ' + cs.ell.rmin);
      ok(rel(got.area, cs.ell.area), name + ' ellipse area: ' + got.area + ' vs R ' + cs.ell.area);
    }
  }
}

// ---- frequencies: chi-square, Cramer's V, pairwise Holm -----------------
for (const [name, fq] of Object.entries(refs.fqsets || {})) {
  await page.evaluate(async (fq) => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const S = window.PS_SHELL;
    const rows = [];
    if (fq.kind === 'indep') {
      fq.cats.forEach((cat, ci) => fq.groups.forEach((g, gi) => {
        for (let i = 0; i < fq.counts[ci][gi]; i++) rows.push([cat, g]);
      }));
      S.loadTable('fq', ['cat', 'grp'], rows, { cat: 'nominal', grp: 'nominal' });
      S.setModule('freqplotbuilder');
      S.setRoles('freqplotbuilder', { var: 'cat', groupVar: 'grp' });
    } else {
      fq.cats.forEach((cat, ci) => {
        // The reference serializes n as an object keyed by category.
        const cnt = Number(Array.isArray(fq.n) ? fq.n[ci] : fq.n[cat]);
        for (let i = 0; i < cnt; i++) rows.push([cat]);
      });
      S.loadTable('fq', ['cat'], rows, { cat: 'nominal' });
      S.setModule('freqplotbuilder');
      // Roles persist per module: the previous case's groupVar would
      // dangle against a table that lacks the column.
      S.setRoles('freqplotbuilder', { var: 'cat', groupVar: null });
    }
    await s(1500);
  }, fq);
  ok(await openStats(/Chi-square/), name + ': freq stats open');
  const chi = await readVisiblePaneTable();
  let found = false;
  if (chi) {
    for (const r of chi.rows) {
      const cells = r.map(c => c.replace(/\s+/g, ' ').trim());
      const chiCell = cells.find(c => /^\d+\.\d\d$/.test(c));
      const dfCell = cells.find(c => /^\d+$/.test(c) && parseFloat(c) === fq.df);
      if (!chiCell || !dfCell) continue;
      found = true;
      closeTo(chiCell, fq.chisq, name + ' chi-square');
      const pCell = cells.find(c => /^(<\s*\.001|\.\d+|1\.000)$/.test(c));
      if (pCell) pClose(pCell, fq.p, name + ' chi-square p');
      if (fq.kind === 'indep' && fq.V !== null) {
        const vCell = [...cells].reverse().find(c => /^\.\d+$/.test(c) && c !== pCell);
        if (vCell) closeTo(vCell, fq.V, name + " Cramer's V");
      }
      break;
    }
  }
  ok(found, name + ': chi-square row found (df ' + fq.df + ')');
  if (fq.kind === 'indep') {
    await openStats(/Pairwise/);
    // Every category shares the same "gA vs gB" row label; the rows'
    // data-link identities carry the CATEGORY, so match on those.
    const pwRows = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('[data-st-pane="pairwise"] tr[data-link], [data-st-pane] tr[data-link]').forEach(tr => {
        let link = null;
        try { link = JSON.parse(tr.getAttribute('data-link')); } catch (e) {}
        out.push({ link, cells: [...tr.querySelectorAll('td')].map(td => (td.innerText || '').trim()) });
      });
      return out;
    });
    const holmOf = cells => [...cells].reverse().find(c => /^(<\s*\.001|\.\d+|1\.000)$/.test(c));
    for (const [key, pref] of Object.entries(fq.pairs)) {
      const [cat, ga, gb] = key.split('|');
      const row = pwRows.find(r => Array.isArray(r.link) && r.link.length >= 2 &&
        r.link.some(c => String(c[0]).includes(cat) && String(c[1]) === ga) &&
        r.link.some(c => String(c[0]).includes(cat) && String(c[1]) === gb));
      if (!row) { ok(false, name + ' ' + key + ': pairwise row missing'); continue; }
      const hc = holmOf(row.cells);
      if (hc) pClose(hc, pref.holm, name + ' ' + key + ' holm p');
    }
  }
}

// ---- 4-variable correlation: per-pair r/p + matrix-wide Holm ------------
if (refs.corr4) {
  const c4 = refs.corr4;
  await page.evaluate(async (c4) => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const S = window.PS_SHELL;
    const nm = Object.keys(c4.cols);
    const rows = [];
    for (let i = 0; i < c4.n; i++) rows.push(nm.map(k => c4.cols[k][i]));
    const types = {}; nm.forEach(k => { types[k] = 'continuous'; });
    S.loadTable('c4', nm, rows, types);
    S.setModule('corrplotbuilder');
    S.setRoles('corrplotbuilder', { vars: nm });
    await s(1600);
  }, c4);
  await openStats(/Matrix|Statistics/);
  await page.evaluate(async () => {
    // The corr-sets loop above may leave the module's corrMethod on
    // its last pick; this leg asserts PEARSON references. The method
    // select lives in the OPEN Sigma panel's quiet band, so pin it
    // there and let the client recompute settle.
    const s = ms => new Promise(r => setTimeout(r, ms));
    const sels = [...document.querySelectorAll('.graphbuilder2-host select')];
    const sel = sels.find(x => [...x.options].some(o => o.value === 'pearson'));
    if (sel && sel.value !== 'pearson') {
      sel.value = 'pearson';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await s(1800);
  });
  const readAllPairs = () => page.evaluate(() => {
    const out = {};
    for (const tr of document.querySelectorAll('.graphbuilder2-host tr')) {
      const txt = (tr.innerText || '');
      const m = txt.match(/^\s*(\w+)\s*\u00d7\s*(\w+)/);
      if (!m) continue;
      out[m[1] + '|' + m[2]] = [...tr.querySelectorAll('td')]
        .map(td => (td.innerText || '').trim());
    }
    return out;
  });
  let pairsDom = await readAllPairs();
  let rOk = 0;
  for (const [key, pref] of Object.entries(c4.pairs)) {
    const cells = pairsDom[key] || pairsDom[key.split('|').reverse().join('|')];
    if (!cells) continue;
    closeTo(cells[1], pref.r, 'corr4 ' + key + ' r');
    pClose(cells[2], pref.p, 'corr4 ' + key + ' raw p');
    rOk++;
  }
  ok(rOk >= 5, 'corr4: ' + rOk + ' of 6 pairs rendered in All pairs');
  // Matrix-wide Holm through the panel's own Adjust-p select.
  const adj = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const sels = [...document.querySelectorAll('.graphbuilder2-host select')];
    const sel = sels.find(x => [...x.options].some(o => o.value === 'holm'));
    if (!sel) return false;
    sel.value = 'holm';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await s(1200);
    return true;
  });
  ok(adj, 'corr4: Adjust-p select offers holm');
  if (adj) {
    // The All-pairs p column stays RAW under adjustment (the adjusted
    // value is the deciding p for stars, copies, and the tally). If a
    // holm-labeled column exists, compare it directly; otherwise
    // verify the adjustment through the significance TALLY, which
    // counts the DECIDING p against alpha.
    const adjRead = await page.evaluate(() => {
      const host = document.querySelector('.graphbuilder2-host');
      const heads = [...host.querySelectorAll('th')].map(th => (th.innerText || '').trim());
      const holmIdx = heads.findIndex(h => /holm|adj/i.test(h));
      const tally = ([...host.querySelectorAll('[data-cmp-tally]')]
        .map(el => (el.innerText || '').trim()).find(t => /of/.test(t))) || '';
      const rows = {};
      for (const tr of host.querySelectorAll('tr')) {
        const m = (tr.innerText || '').match(/^\s*(\w+)\s*\u00d7\s*(\w+)/);
        if (m) rows[m[1] + '|' + m[2]] = [...tr.querySelectorAll('td')].map(td => (td.innerText || '').trim());
      }
      return { holmIdx, heads, tally, rows };
    });
    // The All-pairs p column stays RAW; the DECIDING (adjusted) p
    // drives the significance tally, so that is the assertion surface.
    const nSig = Object.values(c4.pairs).filter(pr => pr.holm < 0.05).length;
    const m = adjRead.tally.match(/(\d+)\s*of\s*(\d+)/);
    ok(!!m && parseInt(m[1], 10) === nSig && parseInt(m[2], 10) === 6,
      'corr4 tally counts holm-adjusted significance: "' + adjRead.tally +
      '" vs R ' + nSig + ' of 6');
  }
}

// ---- distribution moments: G1/G2 through the dist Descriptives ----------
{
  const ds = refs.datasets.b_negative;
  await page.evaluate(async (ds) => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const S = window.PS_SHELL;
    const rows = [];
    for (const g of Object.keys(ds.groups))
      for (const v of ds.groups[g]) rows.push([g, v]);
    S.loadTable('dm', ['g', 'v'], rows, { g: 'nominal', v: 'continuous' });
    S.setModule('distplotbuilder');
    S.setRoles('distplotbuilder', { var: 'v', groupVar: 'g' });
    await s(1500);
  }, ds);
  ok(await openStats(/Descriptives/), 'dist moments: stats open');
  const dm = await readVisiblePaneTable();
  if (dm) {
    const header = dm.rows[0] ? dm.rows[0].map(h => h.toUpperCase()) : [];
    const at = (row, lbl) => { const i = header.findIndex(h => h.includes(lbl)); return i >= 0 ? row[i] : null; };
    for (const [g, cell] of Object.entries(ds.cells)) {
      const row = dm.rows.find(r => r.some(c => c === g));
      if (!row) { ok(false, 'dist moments ' + g + ': row missing'); continue; }
      const sk = at(row, 'SKEW'), ku = at(row, 'KURT');
      if (sk && cell.g1 != null && !/—/.test(sk)) closeTo(sk, cell.g1, 'dist ' + g + ' G1 skew');
      if (ku && cell.g2 != null && !/—/.test(ku)) closeTo(ku, cell.g2, 'dist ' + g + ' G2 kurtosis');
    }
  }
}

// ---- Q-Q confidence band: rendered pixels mapped back to data units -----
if (refs.qqset && refs.qqset.band) {
  const qb = refs.qqset.band;
  await page.evaluate(async (vals) => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.loadTable('fzq', ['v'], vals.map(v => [v]), { v: 'continuous' });
    window.PS_SHELL.setModule('distplotbuilder');
    window.PS_SHELL.setRoles('distplotbuilder', { var: 'v' });
    await s(1400);
    window.setOption('graphType', 'qq');
    await s(1400);
    window.setOption('qqBand', true);
    await s(1400);
  }, refs.qqset.values);
  const band = await page.evaluate(() => {
    const svgs = [...document.querySelectorAll('.graphbuilder2-host svg')];
    let svg = null, best = 0;
    for (const s of svgs) {
      const r = s.getBoundingClientRect();
      if (r.width * r.height > best) { best = r.width * r.height; svg = s; }
    }
    if (!svg) return null;
    const path = svg.querySelector('[data-role="dist-qq-band"]');
    if (!path) return null;
    const nums = (path.getAttribute('d') || '').match(/-?[\d.]+/g).map(Number);
    // y-axis calibration from two numeric tick labels on the left
    const texts = [...svg.querySelectorAll('text')].map(t => {
      const b = t.getBBox();
      return { v: parseFloat((t.textContent || '').replace('−', '-')),
               x: b.x + b.width / 2, y: b.y + b.height / 2,
               raw: (t.textContent || '').trim() };
    }).filter(t => isFinite(t.v) && /^[-−]?\d+(\.\d+)?$/.test(t.raw));
    const plotLeft = Math.min(...nums.filter((_, i) => i % 2 === 0));
    const yTicks = texts.filter(t => t.x < plotLeft).sort((a, b) => a.y - b.y);
    if (yTicks.length < 2) return null;
    const t1 = yTicks[0], t2 = yTicks[yTicks.length - 1];
    return { nums, cal: { y1: t1.y, v1: t1.v, y2: t2.y, v2: t2.v } };
  });
  ok(!!band, 'qq band renders with y calibration');
  if (band) {
    const { nums, cal } = band;
    const toData = py => cal.v1 + (py - cal.y1) * (cal.v2 - cal.v1) / (cal.y2 - cal.y1);
    const perPx = Math.abs((cal.v2 - cal.v1) / (cal.y2 - cal.y1));
    const nPts = nums.length / 2;
    const nTop = Math.round(nPts / 2); // top edge then reversed bottom edge
    for (const row of qb.rows) {
      const i = Math.min(row.s, nTop - 1);
      const topY = toData(nums[i * 2 + 1]);
      const botY = toData(nums[(nPts - 1 - i) * 2 + 1]);
      const tol = 1.5 * perPx;
      ok(Math.abs(topY - row.top) <= tol,
        'qq band top s=' + row.s + ': ' + topY.toFixed(3) + ' vs R ' + row.top.toFixed(3));
      ok(Math.abs(botY - row.bot) <= tol,
        'qq band bottom s=' + row.s + ': ' + botY.toFixed(3) + ' vs R ' + row.bot.toFixed(3));
    }
  }
}

ok(pageErrors.length === 0, 'no page errors (' + pageErrors.slice(0, 2).join(' | ') + ')');
console.log((fail === 0 ? 'STATS FUZZ PASS' : 'STATS FUZZ FAIL') +
  ' (' + pass + ' ok, ' + fail + ' failing, seed ' + refs.seed + ')');
await b.close();
process.exit(fail === 0 ? 0 : 1);
