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
      if (!row) continue;
      const adjCell = row.cells[5] || '';
      if (/—/.test(adjCell) || adjCell === '') continue; // disclosure path
      pClose(adjCell, refGh, name + ' ' + pk + ' games-howell p(adj)');
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
    if (m) closeTo(m[1], ref.V, name + ' ' + pk + ' signed-rank V');
    pClose(row.cells[4] || '', ref.p, name + ' ' + pk + ' signed-rank p');
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
    if (sl) closeTo(sl, cs.fit.slope, name + ' linear slope');
    if (r2 && cs.fit.r2 !== null) closeTo(r2, cs.fit.r2, name + ' linear R2');
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
      let rmax = 0, rmin = 1 / 0, area = 0;
      for (let i = 0; i < pts.length; i++) {
        const dx = pts[i].x - cx, dy = pts[i].y - cy;
        const r = Math.hypot(dx, dy);
        if (r > rmax) rmax = r; if (r < rmin) rmin = r;
        const q = pts[(i + 1) % pts.length];
        area += (pts[i].x * q.y - q.x * pts[i].y) / 2;
      }
      return { cx, cy, rmax, rmin, area: Math.abs(area) };
    });
    ok(!!got, name + ': ellipse ships in the payload');
    if (got) {
      const rel = (a, b) => Math.abs(a - b) <= 2e-3 * Math.max(1e-9, Math.abs(b));
      ok(Math.abs(got.cx - cs.ell.cx) < 1e-6 && Math.abs(got.cy - cs.ell.cy) < 1e-6,
        name + ' ellipse center: (' + got.cx + ',' + got.cy + ') vs R (' + cs.ell.cx + ',' + cs.ell.cy + ')');
      ok(rel(got.rmax, cs.ell.rmax), name + ' ellipse major axis: ' + got.rmax + ' vs R ' + cs.ell.rmax);
      ok(rel(got.rmin, cs.ell.rmin), name + ' ellipse minor axis: ' + got.rmin + ' vs R ' + cs.ell.rmin);
      ok(rel(got.area, cs.ell.area), name + ' ellipse area: ' + got.area + ' vs R ' + cs.ell.area);
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
