// Pandion Plots standalone - the JS data layer: per-module payload channel
// builders mirroring each jamovi .b.R's aggregation row for row (see the
// module notes in CLAUDE.md and STANDALONE-BRIEF.md). Each builder takes
// (table, roles, opts) and returns { channels: {...} } or { error: html }.
//
// Numbers are rounded to 10 significant digits (PSStat.sigR) to match
// jsonlite's digits = I(10), so shell echoes hash-match the engine's own
// optimistic folds. Parity probes: standalone/verify/m1-parity-*.
// Keep this file ASCII (escapes only).

window.PSData = (function () {
  "use strict";
  var S = window.PSStat;
  var FACET_SEP = " \u00a6 ";

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function isMissing(x) {
    return x == null || x === "" ||
           (typeof x === "number" && !isFinite(x));
  }
  function isFiniteNum(x) { return typeof x === "number" && isFinite(x); }
  function missingNoteFor(nMissing, nTotal) {
    return nMissing > 0
      ? nMissing + " of " + nTotal + " cases not shown (missing values)"
      : "";
  }
  // Declared level order (jamovi factor semantics) restricted to the
  // levels present in the given rows (R droplevels); first-seen fallback.
  function levelsOf(table, col, presentIdx) {
    var vals = table.columns[col];
    var present = {}, i;
    for (i = 0; i < presentIdx.length; i++) {
      var v = vals[presentIdx[i]];
      if (!isMissing(v)) present[String(v)] = true;
    }
    var declared = (table.levels && table.levels[col]) || null;
    var out = [];
    if (declared) {
      for (var d = 0; d < declared.length; d++)
        if (present[declared[d]]) out.push(String(declared[d]));
    } else {
      for (var j = 0; j < presentIdx.length; j++) {
        var w = vals[presentIdx[j]];
        if (!isMissing(w) && out.indexOf(String(w)) === -1) out.push(String(w));
      }
    }
    return out;
  }
  // plotbuilder/distplotbuilder cell_stat (identical in both b.R files).
  function cellStat(vals, summaryFunc, errorType) {
    var v = [], i;
    for (i = 0; i < vals.length; i++) if (isFiniteNum(vals[i])) v.push(vals[i]);
    var n = v.length;
    if (!n) return null;
    var center = (summaryFunc === "median") ? S.median(v) : S.mean(v);
    var err = 0;
    if (n >= 2 && errorType !== "none" && summaryFunc !== "median") {
      var sd = S.sdSample(v), se = sd / Math.sqrt(n);
      err = errorType === "sd" ? sd
          : errorType === "ci95" ? se * S.qt(0.975, n - 1)
          : errorType === "ci99" ? se * S.qt(0.995, n - 1)
          : se;
    }
    return { center: center, err: err, n: n, values: v };
  }
  function titleFrom(spec, overrideKey, textKey, fallback) {
    if (spec && spec[overrideKey] === true)
      return spec[textKey] != null ? spec[textKey] : "";
    return fallback;
  }

  // ================================================================ CG
  function buildCG(table, roles, opts) {
    var xs = table.columns[roles.xvar];
    var ys = table.columns[roles.yvar];
    var gs = roles.groupVar ? table.columns[roles.groupVar] : null;
    var fs = roles.facetVar ? table.columns[roles.facetVar] : null;
    var nTotal = ys.length;

    var nMissing = 0, yFinite = [], i;
    for (i = 0; i < nTotal; i++) {
      var complete = isFiniteNum(ys[i]) && !isMissing(xs[i]) &&
                     (!gs || !isMissing(gs[i])) &&
                     (!fs || !isMissing(fs[i]));
      if (!complete) nMissing++;
      if (isFiniteNum(ys[i])) yFinite.push(i);
    }

    var xLevels = levelsOf(table, roles.xvar, yFinite);
    var gLevels = gs ? levelsOf(table, roles.groupVar, yFinite) : [];
    var fLevels = fs ? levelsOf(table, roles.facetVar, yFinite) : [];
    var hasFacet = !!fs && fLevels.length > 0;

    var synthX = [];
    if (hasFacet) {
      for (var fi = 0; fi < fLevels.length; fi++)
        for (var xi = 0; xi < xLevels.length; xi++)
          synthX.push(fLevels[fi] + FACET_SEP + xLevels[xi]);
    } else synthX = xLevels.slice();

    function cellData(fl, xl, gl) {
      var out = [], rowIds = [];
      for (var r = 0; r < yFinite.length; r++) {
        var idx = yFinite[r];
        if (isMissing(xs[idx]) || String(xs[idx]) !== xl) continue;
        if (fs && (isMissing(fs[idx]) || String(fs[idx]) !== fl)) continue;
        if (gs && (isMissing(gs[idx]) || String(gs[idx]) !== gl)) continue;
        out.push(ys[idx]);
        rowIds.push(table.caseIds && table.caseIds[idx]
          ? table.caseIds[idx] : String(idx + 1));
      }
      return { values: out, rowIds: rowIds };
    }

    var bars = [];
    var fIter = hasFacet ? fLevels : [null];
    for (var f2 = 0; f2 < fIter.length; f2++) {
      var fl = fIter[f2];
      for (var x2 = 0; x2 < xLevels.length; x2++) {
        var xl = xLevels[x2];
        var mkx = hasFacet ? (fl + FACET_SEP + xl) : xl;
        var gIter = gLevels.length ? gLevels : [null];
        for (var g2 = 0; g2 < gIter.length; g2++) {
          var cell = cellData(fl, xl, gIter[g2]);
          var st = cellStat(cell.values,
                            opts.summaryFunc, opts.errorBarType);
          if (!st) continue;
          bars.push({ x: mkx, group: gIter[g2],
                      mean: S.sigR(st.center), se: S.sigR(st.err),
                      n: st.n, values: st.values.map(S.sigR),
                      caseIds: cell.rowIds,
                      sourceColumns: cell.rowIds.map(function () {
                        return roles.yvar;
                      }) });
        }
      }
    }

    var spec = opts.spec || {};
    return { channels: {
      bars: bars,
      xCategories: synthX,
      groupCategories: gLevels,
      hasGroups: gLevels.length > 0,
      xLabel: titleFrom(spec, "xTitleOverride", "xTitle", roles.xvar),
      yLabel: titleFrom(spec, "yTitleOverride", "yTitle", roles.yvar),
      groupLabel: gLevels.length
        ? titleFrom(spec, "groupTitleOverride", "groupTitle", roles.groupVar)
        : "",
      facetLabel: hasFacet ? roles.facetVar : "",
      xLabelDefault: roles.xvar,
      yLabelDefault: roles.yvar,
      groupLabelDefault: roles.groupVar || "",
      facetLevels: fLevels,
      facetSeparator: hasFacet ? FACET_SEP : "",
      missingNote: missingNoteFor(nMissing, nTotal)
    } };
  }

  // ================================================================ dist
  function buildDist(table, roles, opts) {
    var vs = table.columns[roles.var];
    var gs = roles.groupVar ? table.columns[roles.groupVar] : null;
    var fs = roles.facetVar ? table.columns[roles.facetVar] : null;
    var gtype = opts.graphType || "histogram";
    var isCategorical = gtype === "box" || gtype === "violin" || gtype === "raincloud";
    var nTotal = vs.length;

    var nMissing = 0, vFinite = [], i;
    for (i = 0; i < nTotal; i++) {
      var complete = isFiniteNum(vs[i]) &&
                     (!gs || !isMissing(gs[i])) &&
                     (!fs || !isMissing(fs[i]));
      if (!complete) nMissing++;
      if (isFiniteNum(vs[i])) vFinite.push(i);
    }
    if (!vFinite.length)
      return { error: "<strong>" + esc(roles.var) + "</strong> has no " +
                      "usable (non-missing) values to plot.",
               fix: { kind: "nodata", col: roles.var } };

    var gLevels = gs ? levelsOf(table, roles.groupVar, vFinite) : [];
    var fLevels = fs ? levelsOf(table, roles.facetVar, vFinite) : [];
    var hasFacet = !!fs && fLevels.length > 0;

    var bars = [];
    var fIter = hasFacet ? fLevels : [null];
    for (var f2 = 0; f2 < fIter.length; f2++) {
      var fl = fIter[f2];
      var gIter = gLevels.length ? gLevels : [null];
      for (var g2 = 0; g2 < gIter.length; g2++) {
        var gl = gIter[g2];
        var vals = [], rowIds = [];
        for (var r = 0; r < vFinite.length; r++) {
          var idx = vFinite[r];
          if (fs && (isMissing(fs[idx]) || String(fs[idx]) !== fl)) continue;
          if (gs && (isMissing(gs[idx]) || String(gs[idx]) !== gl)) continue;
          vals.push(vs[idx]);
          rowIds.push(table.caseIds && table.caseIds[idx]
            ? table.caseIds[idx] : String(idx + 1));
        }
        var st = cellStat(vals, opts.summaryFunc, opts.errorBarType);
        if (!st) continue;
        bars.push({
          x: hasFacet ? (fl + FACET_SEP + "") : "",
          group: gLevels.length ? gl : null,
          facet: hasFacet ? fl : null,
          mean: S.sigR(st.center), se: S.sigR(st.err),
          n: st.n, values: st.values.map(S.sigR), caseIds: rowIds,
          sourceColumns: rowIds.map(function () { return roles.var; })
        });
      }
    }

    if (gtype === "qq" || gtype === "density") {
      var maxN = 0;
      for (i = 0; i < bars.length; i++) maxN = Math.max(maxN, bars[i].n);
      if (maxN < 2) {
        var what = gtype === "qq" ? "A Q-Q plot" : "A density plot";
        return { error: what + " needs at least 2 non-missing values - <strong>" +
                        esc(roles.var) + "</strong> has " + maxN + ".",
                 fix: { kind: "nodata", col: roles.var } };
      }
    }

    var synthX = hasFacet
      ? fLevels.map(function (fl2) { return fl2 + FACET_SEP + ""; })
      : [""];
    var xCategories = isCategorical ? synthX : [];

    var histStat = opts.histStat || "count";
    var statTitle = histStat === "density" ? "Density"
                  : histStat === "proportion" ? "Proportion" : "Count";
    var defaultX = isCategorical ? ""
                 : gtype === "qq" ? "Theoretical Quantiles" : roles.var;
    var defaultY = isCategorical ? roles.var
                 : gtype === "histogram" || gtype === "histdensity" ? statTitle
                 : gtype === "density" ? "Density"
                 : gtype === "qq" ? "Sample Quantiles"
                 : gtype === "ecdf" ? "Cumulative Proportion"
                 : roles.var;

    var spec = opts.spec || {};
    return { channels: {
      bars: bars,
      xCategories: xCategories,
      groupCategories: gLevels,
      hasGroups: gLevels.length > 0,
      xLabel: titleFrom(spec, "xTitleOverride", "xTitle", defaultX),
      yLabel: titleFrom(spec, "yTitleOverride", "yTitle", defaultY),
      groupLabel: gLevels.length
        ? titleFrom(spec, "groupTitleOverride", "groupTitle", roles.groupVar)
        : "",
      facetLabel: hasFacet ? roles.facetVar : "",
      xLabelDefault: defaultX,
      yLabelDefault: defaultY,
      groupLabelDefault: roles.groupVar || "",
      facetLevels: fLevels,
      facetSeparator: hasFacet ? FACET_SEP : "",
      missingNote: missingNoteFor(nMissing, nTotal),
      // Punch list item 5. This used to ship empty, and the engine does not
      // degrade silently: it prints "n/a (needs 3-5000 values)" against the
      // student's real cell name, which tells them their sample size is wrong
      // when it is not. ps-stat.js now carries Royston AS R94, verified equal
      // to R's shapiro.test. Cells genuinely outside 3..5000 still get the
      // engine's message, where it is accurate.
      //
      // W is rounded to 3 dp HERE, matching what R ships: the engine formats
      // to 3 dp for display, and rounding on the producing side avoids the
      // double-rounding artifact CLAUDE.md convention 16 records (.82548 ->
      // .8255 -> "0.826" where R printed "0.825").
      distNormality: bars.map(function (b) {
        var sw = S.shapiroWilk(b.values || []);
        if (!sw) return null;
        // n is load-bearing: the engine's on-chart normality stat box prints
        // "(n = " + ne.n + ")" (graphbuilder2.js:49674), so omitting it renders
        // "n = undefined". R ships {group, facet, n, w, p}; match it exactly.
        return { group: b.group == null ? "" : String(b.group),
                 facet: b.facet == null ? "" : String(b.facet),
                 n: sw.n,
                 w: Math.round(sw.w * 1000) / 1000,
                 p: S.sigR(sw.p) };
      }).filter(function (e) { return !!e; })
    } };
  }

  // ================================================================ freq
  function buildFreq(table, roles, opts) {
    var cs = table.columns[roles.var];
    var gs = roles.groupVar ? table.columns[roles.groupVar] : null;
    var fs = roles.facetVar ? table.columns[roles.facetVar] : null;
    var gtype = opts.graphType || "bar";
    var isPie = gtype === "pie" || gtype === "donut";
    var isPareto = gtype === "pareto";
    var useGroup = !!gs && !isPie && !isPareto;
    var useFacet = !!fs && !isPie;
    var nTotal = cs.length;

    var keep = [], nMissing = 0, i;
    for (i = 0; i < nTotal; i++) {
      var ok = !isMissing(cs[i]) &&
               (!useGroup || !isMissing(gs[i])) &&
               (!useFacet || !isMissing(fs[i]));
      if (ok) keep.push(i); else nMissing++;
    }
    if (!keep.length)
      return { error: "<strong>" + esc(roles.var) + "</strong> has no " +
                      "usable (non-missing) rows to count.",
               fix: { kind: "nodata", col: roles.var } };

    var catLevels = levelsOf(table, roles.var, keep);
    var gLevels = useGroup ? levelsOf(table, roles.groupVar, keep) : [];
    var fLevels = useFacet ? levelsOf(table, roles.facetVar, keep) : [];
    var hasFacetUse = useFacet && fLevels.length > 0;

    function mkx(fl, cl) { return hasFacetUse ? (fl + FACET_SEP + cl) : cl; }
    function countOf(fl, cl, gl) {
      var n = 0;
      for (var r = 0; r < keep.length; r++) {
        var idx = keep[r];
        if (String(cs[idx]) !== cl) continue;
        if (useFacet && String(fs[idx]) !== fl) continue;
        if (useGroup && String(gs[idx]) !== gl) continue;
        n++;
      }
      return n;
    }

    var bars = [];
    var fIter = hasFacetUse ? fLevels : [null];
    for (var f2 = 0; f2 < fIter.length; f2++) {
      var fl = fIter[f2];
      for (var c2 = 0; c2 < catLevels.length; c2++) {
        var cl = catLevels[c2];
        var gIter = gLevels.length ? gLevels : [null];
        for (var g2 = 0; g2 < gIter.length; g2++) {
          var n = countOf(fl, cl, gIter[g2]);
          if (n === 0) continue;
          if (isPie) bars.push({ x: "", group: cl, mean: n, se: 0, n: n, values: [] });
          else bars.push({ x: mkx(fl, cl),
                           group: useGroup ? gIter[g2] : null,
                           facet: hasFacetUse ? fl : null,
                           mean: n, se: 0, n: n, values: [] });
        }
      }
    }

    var freqTests = computeChisqTests(bars, isPie, useGroup, hasFacetUse);

    function catTotal(cl, fl) {
      var tot = 0;
      for (var b = 0; b < bars.length; b++) {
        var bar = bars[b];
        if (fl != null && bar.facet !== fl) continue;
        var key = isPie ? bar.group : bar.x;
        if (fl == null && !isPie && hasFacetUse) {
          var pre = bar.facet + FACET_SEP;
          if (String(key).indexOf(pre) === 0) key = String(key).slice(pre.length);
        } else if (fl != null) {
          var pre2 = fl + FACET_SEP;
          if (String(key).indexOf(pre2) === 0) key = String(key).slice(pre2.length);
        }
        if (key === cl) tot += bar.n;
      }
      return tot;
    }
    function sortDescStable(levels, totals) {
      var idx = levels.map(function (_, k) { return k; });
      idx.sort(function (a, b) { return (totals[b] - totals[a]) || (a - b); });
      return idx.map(function (k) { return levels[k]; });
    }

    var xCategories;
    if (isPie) xCategories = [""];
    else if (isPareto && hasFacetUse) {
      xCategories = [];
      for (var pf = 0; pf < fLevels.length; pf++) {
        var flv = fLevels[pf];
        var ftot = catLevels.map(function (cl2) { return catTotal(cl2, flv); });
        var sorted = sortDescStable(catLevels, ftot);
        for (var sc = 0; sc < sorted.length; sc++)
          xCategories.push(flv + FACET_SEP + sorted[sc]);
      }
    } else if (isPareto) {
      var tots = catLevels.map(function (cl3) { return catTotal(cl3, null); });
      xCategories = sortDescStable(catLevels, tots);
    } else if (hasFacetUse) {
      xCategories = [];
      for (var xf = 0; xf < fLevels.length; xf++)
        for (var xc = 0; xc < catLevels.length; xc++)
          xCategories.push(fLevels[xf] + FACET_SEP + catLevels[xc]);
    } else xCategories = catLevels.slice();

    var pooled = [];
    if (gs && !useGroup) pooled.push(roles.groupVar);
    if (fs && !useFacet) pooled.push(roles.facetVar);
    var pooledNote = pooled.length ? "Pooled across " + pooled.join(" and ") : "";

    var freqStat = opts.freqStat || "count";
    var statLabel = freqStat === "percent" ? "Percent"
                  : freqStat === "proportion" ? "Proportion" : "Count";
    var defaultX = isPie ? "" : roles.var;
    var defaultY = isPie ? ""
                 : (gtype === "bar" && useGroup && opts.freqPosition === "fill")
                   ? "Percent" : statLabel;

    var spec = opts.spec || {};
    return { channels: {
      bars: bars,
      freqTests: freqTests,
      freqPooledNote: pooledNote,
      xCategories: xCategories,
      groupCategories: isPie ? catLevels : gLevels,
      hasGroups: isPie ? catLevels.length > 0 : gLevels.length > 0,
      xLabel: titleFrom(spec, "xTitleOverride", "xTitle", defaultX),
      yLabel: titleFrom(spec, "yTitleOverride", "yTitle", defaultY),
      groupLabel: isPie
        ? titleFrom(spec, "groupTitleOverride", "groupTitle", roles.var)
        : (useGroup
           ? titleFrom(spec, "groupTitleOverride", "groupTitle", roles.groupVar)
           : ""),
      facetLabel: useFacet && fLevels.length ? roles.facetVar : "",
      xLabelDefault: defaultX,
      yLabelDefault: defaultY,
      groupLabelDefault: isPie ? roles.var : (useGroup ? roles.groupVar : ""),
      facetLevels: fLevels,
      facetSeparator: hasFacetUse ? FACET_SEP : "",
      missingNote: missingNoteFor(nMissing, nTotal)
    } };
  }

  // freqplotbuilder .computeChisqTests port (independence w/ Haberman
  // stdres, else equal-proportion GOF; per facet block).
  function computeChisqTests(bars, isPie, useGroup, useFacet) {
    var entries = [], i;
    for (i = 0; i < bars.length; i++) {
      var b = bars[i];
      var facetLbl = (useFacet && b.facet != null) ? String(b.facet) : "";
      var catLbl = isPie ? String(b.group) : String(b.x);
      if (facetLbl) {
        var pre = facetLbl + FACET_SEP;
        if (catLbl.indexOf(pre) === 0) catLbl = catLbl.slice(pre.length);
      }
      var grpLbl = (useGroup && b.group != null) ? String(b.group) : "";
      entries.push({ facet: facetLbl, cat: catLbl, grp: grpLbl, n: b.n });
    }
    var facetKeys = [];
    for (i = 0; i < entries.length; i++)
      if (facetKeys.indexOf(entries[i].facet) === -1) facetKeys.push(entries[i].facet);

    var tests = [];
    for (var fk = 0; fk < facetKeys.length; fk++) {
      var fl = facetKeys[fk];
      var sub = entries.filter(function (e) { return e.facet === fl; });
      var cats = [], grps = [];
      for (i = 0; i < sub.length; i++) {
        if (cats.indexOf(sub[i].cat) === -1) cats.push(sub[i].cat);
        if (grps.indexOf(sub[i].grp) === -1) grps.push(sub[i].grp);
      }
      var obs = cats.map(function () { return grps.map(function () { return 0; }); });
      for (i = 0; i < sub.length; i++)
        obs[cats.indexOf(sub[i].cat)][grps.indexOf(sub[i].grp)] += sub[i].n;
      var n = 0, ri, cj;
      for (ri = 0; ri < cats.length; ri++)
        for (cj = 0; cj < grps.length; cj++) n += obs[ri][cj];
      if (n <= 0) continue;
      var rowTot = obs.map(function (row) {
        return row.reduce(function (a, x) { return a + x; }, 0);
      });
      var colTot = grps.map(function (_, j) {
        return obs.reduce(function (a, row) { return a + row[j]; }, 0);
      });
      var r = cats.length, cc = grps.length;
      if (useGroup && cc >= 2 && r >= 2) {
        var chisq = 0, minExp = Infinity, cells = [];
        var sres = [];
        for (ri = 0; ri < r; ri++) {
          sres.push([]);
          for (cj = 0; cj < cc; cj++) {
            var expd = rowTot[ri] * colTot[cj] / n;
            chisq += (obs[ri][cj] - expd) * (obs[ri][cj] - expd) / expd;
            minExp = Math.min(minExp, expd);
            sres[ri][cj] = (obs[ri][cj] - expd) /
              Math.sqrt(expd * (1 - rowTot[ri] / n) * (1 - colTot[cj] / n));
          }
        }
        for (ri = 0; ri < r; ri++)
          for (cj = 0; cj < cc; cj++)
            cells.push({ cat: cats[ri], grp: grps[cj],
                         stdres: S.sigR(sres[ri][cj]) });
        var df = (r - 1) * (cc - 1);
        tests.push({
          facet: fl, type: "independence",
          chisq: S.sigR(chisq), df: df,
          p: S.sigR(S.chisqUpperP(chisq, df)),
          n: Math.round(n),
          es: S.sigR(Math.sqrt(chisq / (n * Math.min(r - 1, cc - 1)))),
          esLabel: "V",
          minExp: S.sigR(minExp),
          cells: cells, r: r, c: cc
        });
      } else {
        var k = rowTot.length;
        if (k < 2) continue;
        var expd2 = n / k, chisq2 = 0, cells2 = [];
        for (ri = 0; ri < k; ri++)
          chisq2 += (rowTot[ri] - expd2) * (rowTot[ri] - expd2) / expd2;
        for (ri = 0; ri < k; ri++)
          cells2.push({ cat: cats[ri], grp: "",
                        stdres: S.sigR((rowTot[ri] - expd2) /
                                       Math.sqrt(expd2 * (1 - 1 / k))) });
        tests.push({
          facet: fl, type: "gof",
          chisq: S.sigR(chisq2), df: k - 1,
          p: S.sigR(S.chisqUpperP(chisq2, k - 1)),
          n: Math.round(n),
          es: S.sigR(Math.sqrt(chisq2 / n)),
          esLabel: "w",
          minExp: S.sigR(expd2),
          cells: cells2, k: k
        });
      }
    }
    return tests;
  }

  // ================================================================ xy
  function buildXY(table, roles, opts) {
    var xcol = table.columns[roles.xvar];
    var ycol = table.columns[roles.yvar];
    var gs = roles.groupVar ? table.columns[roles.groupVar] : null;
    var fs = roles.facetVar ? table.columns[roles.facetVar] : null;
    var nTotal = xcol.length;

    // Factor columns plot as their level INDEX (1..k) with the level
    // names shipped for axis labeling (the b.R as.numeric(factor) rule).
    function numericView(col, colName) {
      // Factor-ish columns plot as level codes; continuous and NUMERIC
      // ordinal columns plot their actual values (jamovi types; legacy
      // "factor"/"numeric" names arrive normalized by the shell).
      var ty = table.types ? table.types[colName] : null;
      var numish = !!(table.numericish && table.numericish[colName]);
      var isFactor = ty === "factor" || ty === "nominal" ||
                     ((ty === "ordinal" || ty === "id") && !numish);
      if (!isFactor) {
        return { vals: col.map(function (v) { return isFiniteNum(v) ? v : NaN; }),
                 levels: [] };
      }
      var lv = (table.levels && table.levels[colName]) || levelsOf(table, colName,
        col.map(function (_, k) { return k; }));
      var map = {};
      for (var k2 = 0; k2 < lv.length; k2++) map[lv[k2]] = k2 + 1;
      return { vals: col.map(function (v) {
                 return isMissing(v) ? NaN : (map[String(v)] || NaN);
               }),
               levels: lv.map(String) };
    }
    var xv = numericView(xcol, roles.xvar), yv = numericView(ycol, roles.yvar);

    var nMissing = 0, rowsIdx = [], i;
    for (i = 0; i < nTotal; i++) {
      var complete = isFinite(xv.vals[i]) && isFinite(yv.vals[i]) &&
                     (!fs || !isMissing(fs[i]));
      if (!complete) nMissing++;
      if (isFinite(xv.vals[i]) && isFinite(yv.vals[i])) rowsIdx.push(i);
    }

    var gLevels = gs ? levelsOf(table, roles.groupVar, rowsIdx) : [];
    var fLevels = fs ? levelsOf(table, roles.facetVar, rowsIdx) : [];
    var hasGroup = !!gs && gLevels.length > 0;
    var hasFacet = !!fs && fLevels.length > 0;

    var xs = rowsIdx.map(function (idx) { return xv.vals[idx]; });
    var ys2 = rowsIdx.map(function (idx) { return yv.vals[idx]; });
    var groups = gs ? rowsIdx.map(function (idx) {
      return isMissing(gs[idx]) ? null : String(gs[idx]);
    }) : null;
    var facets = fs ? rowsIdx.map(function (idx) {
      return isMissing(fs[idx]) ? null : String(fs[idx]);
    }) : null;
    var N = xs.length;

    // Per-group linear pool (fits + residual standardization).
    var poolGroups = hasGroup ? gLevels : ["__all__"];
    var pool = {};
    for (var pg = 0; pg < poolGroups.length; pg++) {
      var key = poolGroups[pg], px = [], py = [], pidx = [];
      for (i = 0; i < N; i++) {
        if (hasGroup && groups[i] !== key) continue;
        px.push(xs[i]); py.push(ys2[i]); pidx.push(i);
      }
      if (px.length < 2) continue;
      pool[key] = { x: px, y: py, idx: pidx, n: px.length,
                    xLo: Math.min.apply(null, px), xHi: Math.max.apply(null, px),
                    fit: S.linReg(px, py) };
    }

    var residualStds = new Array(N);
    for (i = 0; i < N; i++) residualStds[i] = null;
    for (var rk = 0; rk < poolGroups.length; rk++) {
      var pe = pool[poolGroups[rk]];
      if (!pe || !pe.fit || pe.n < 3) continue;
      var sd = S.sdSample(pe.fit.residuals);
      if (!isFinite(sd) || sd <= 0) continue;
      for (var q = 0; q < pe.idx.length; q++)
        residualStds[pe.idx[q]] = S.sigR(pe.fit.residuals[q] / sd);
    }

    var xyPoints = {
      parallel: true,
      xs: xs.map(S.sigR),
      ys: ys2.map(S.sigR),
      rows: rowsIdx.map(function (_, k3) { return k3 + 1; }),
      residual_stds: residualStds
    };
    if (gs) xyPoints.groups = groups;
    if (fs) xyPoints.facets = facets;

    // Fits (always computed; the widget gates drawing on xyShowFit/CI).
    var fitType = opts.fitType || "linear";
    var ciLevel = (opts.ciLevel > 0 && opts.ciLevel < 1) ? opts.ciLevel : 0.95;
    var loessSpan = (opts.loessSpan > 0) ? opts.loessSpan : 0.75;
    var xyFits = [];
    if (N >= 2) {
      var minN = (fitType === "loess" || fitType === "poly3") ? 4
               : (fitType === "poly2") ? 3 : 2;
      for (var fg = 0; fg < poolGroups.length; fg++) {
        var fe = pool[poolGroups[fg]];
        if (!fe || fe.n < minN) continue;
        if (!(fe.xHi > fe.xLo)) continue;
        var xseq = [];
        for (var sP = 0; sP < 100; sP++)
          xseq.push(fe.xLo + (fe.xHi - fe.xLo) * sP / 99);
        var pts = null;
        if (fitType === "loess") pts = S.loessFit(fe.x, fe.y, loessSpan, ciLevel, xseq);
        else {
          var deg = fitType === "poly3" ? 3 : fitType === "poly2" ? 2 : 1;
          pts = S.olsFit(fe.x, fe.y, deg, ciLevel, xseq);
        }
        if (!pts || pts.xs.length < 2) continue;
        // LOESS ships the CURVE ONLY (Torry, Aug 10 2026). loessFit's curve is
        // exact-R: measured against stats::loess on three shapes (n = 40, 60,
        // 200, span 0.75, degree 2) the maximum difference was 0.0000. Its
        // BAND is 3 to 4.5% narrow, because the effective degrees of freedom
        // are estimated as 1.2 * (n / q) rather than computed from the trace
        // of the smoother, so pEff floors at 2 where R's enp is about 4.35.
        // The error is a constant scalar, not a shape error, and it errs
        // toward overconfidence. A band that is quietly too tight is worse
        // than no band, so the fit types that CAN draw an exact one keep it
        // and loess does not.
        // Omitting the two arrays is the whole mechanism: the engine gates the
        // band on `_fit.points[0].lwr !== undefined` (graphbuilder2.js ~35084)
        // and its parallel-array decompression already guards
        // `Array.isArray(_xfP.lwrs)` (~2946). So this needs NO engine change,
        // which also leaves the jamovi module alone - its bands come from R's
        // own loess and are exact, and must keep drawing.
        var fitPts = { parallel: true,
                       xs: pts.xs.map(S.sigR), ys: pts.ys.map(S.sigR) };
        if (fitType !== "loess") {
          fitPts.lwrs = pts.lwrs.map(S.sigR);
          fitPts.uprs = pts.uprs.map(S.sigR);
        }
        xyFits.push({
          group: hasGroup ? poolGroups[fg] : null,
          fit_type: fitType,
          points: fitPts
        });
      }
    }

    // Correlation stats per facet x group cell (n >= 3).
    var corrType = opts.corrType || "pearson";
    var xyStats = [];
    var statFacets = hasFacet ? fLevels : [null];
    var statGroups = hasGroup ? gLevels : [null];
    for (var sf = 0; sf < statFacets.length; sf++) {
      for (var sg = 0; sg < statGroups.length; sg++) {
        var cx = [], cy = [];
        for (i = 0; i < N; i++) {
          if (hasFacet && facets[i] !== statFacets[sf]) continue;
          if (hasGroup && groups[i] !== statGroups[sg]) continue;
          cx.push(xs[i]); cy.push(ys2[i]);
        }
        if (cx.length < 3) continue;
        var ct = S.corrTest(cx, cy, corrType);
        if (!ct) continue;
        var entry = { n: cx.length, r: S.sigR(ct.r), p: S.sigR(ct.p),
                      method: corrType };
        var lr = S.linReg(cx, cy);
        if (lr) {
          entry.r2 = S.sigR(lr.r2);
          if (isFinite(lr.intercept) && isFinite(lr.slope)) {
            entry.intercept = S.sigR(lr.intercept);
            entry.slope = S.sigR(lr.slope);
          }
        }
        var pe2 = S.pearsonTest(cx, cy);
        if (pe2) { entry.pearsonR = S.sigR(pe2.r); entry.pearsonP = S.sigR(pe2.p); }
        var sp2 = S.spearmanTest(cx, cy);
        if (sp2) { entry.rho = S.sigR(sp2.r); entry.rhoP = S.sigR(sp2.p); }
        if (hasGroup) entry.group = statGroups[sg];
        if (hasFacet) entry.facet = statFacets[sf];
        xyStats.push(entry);
      }
    }

    // Confidence ellipses per group (n >= 3).
    var ellLevel = (opts.ellLevel > 0 && opts.ellLevel < 1) ? opts.ellLevel : 0.95;
    var xyEllipses = [];
    if (N >= 3) {
      var chi = S.qchisq2(ellLevel);
      for (var eg = 0; eg < poolGroups.length; eg++) {
        var ee = pool[poolGroups[eg]];
        if (!ee || ee.n < 3) continue;
        var cv = S.cov2(ee.x, ee.y);
        if (!cv) continue;
        var eig = S.eigen2(cv.sxx, cv.sxy, cv.syy);
        if (!isFinite(eig.values[0]) || !isFinite(eig.values[1]) ||
            eig.values[0] <= 0 || eig.values[1] <= 0) continue;
        var aScale = Math.sqrt(chi * eig.values[0]);
        var bScale = Math.sqrt(chi * eig.values[1]);
        var aVec = [aScale * eig.vectors[0][0], aScale * eig.vectors[0][1]];
        var bVec = [bScale * eig.vectors[1][0], bScale * eig.vectors[1][1]];
        var pts2 = [];
        for (var tI = 0; tI < 100; tI++) {
          var t = 2 * Math.PI * tI / 99;
          pts2.push({ x: S.sigR(cv.mx + Math.cos(t) * aVec[0] + Math.sin(t) * bVec[0]),
                      y: S.sigR(cv.my + Math.cos(t) * aVec[1] + Math.sin(t) * bVec[1]) });
        }
        var ent2 = { points: pts2 };
        if (hasGroup) ent2.group = poolGroups[eg];
        xyEllipses.push(ent2);
      }
    }

    var spec = opts.spec || {};
    return { channels: {
      xyPoints: xyPoints,
      xyFits: xyFits,
      xyStats: xyStats,
      xyEllipses: xyEllipses,
      xyXLevels: xv.levels,
      xyYLevels: yv.levels,
      groupCategories: gLevels,
      hasGroups: hasGroup,
      xLabel: titleFrom(spec, "xTitleOverride", "xTitle", roles.xvar),
      yLabel: titleFrom(spec, "yTitleOverride", "yTitle", roles.yvar),
      groupLabel: hasGroup
        ? titleFrom(spec, "groupTitleOverride", "groupTitle", roles.groupVar)
        : "",
      facetLabel: hasFacet ? roles.facetVar : "",
      xLabelDefault: roles.xvar,
      yLabelDefault: roles.yvar,
      groupLabelDefault: hasGroup ? roles.groupVar : "",
      facetLevels: fLevels,
      // t4-17 used to append "LOESS confidence band is approximate" here. That
      // disclosure is retired because there is nothing left to disclose: loess
      // now ships no band at all (see the fit block above). The note was also
      // dead code by the time it was removed - it gated on opts.showFit and
      // opts.showCI, which optsFrom read from the option store's TOP LEVEL,
      // and the chartSpec consolidation moved both keys inside the blob, so
      // the gate could never be true from the app's own UI.
      missingNote: missingNoteFor(nMissing, nTotal)
    } };
  }

  // ================================================================ rm
  // Repeated Measures, the SIMPLE measures path (the factorial rm/rmCells
  // design is out of standalone v1 scope): wide measures + the singular
  // between-subjects factor; never faceted. Mirrors rmplotbuilder.b.R's
  // stat_for_cell incl. the Cousineau-Morey correction (Morey, 2008).
  function buildRM(table, roles, opts) {
    var measures = (roles.measures || []).filter(function (m) {
      return table.order.indexOf(m) !== -1;
    });
    if (!measures.length) return { error: "Assign at least one measure." };
    var gs = roles.betweenVar ? table.columns[roles.betweenVar] : null;
    // Punch list t3-44. buildRM was the only builder with no facet block, so
    // RM charts could never be paneled and the engine's mixed three-way ANOVA,
    // its across-panels compare scope and its per-panel brackets were all
    // unreachable. The encoding is Compare Groups': the panel level is folded
    // into bars[].x with FACET_SEP, which is what the engine splits on.
    var fs = roles.facetVar ? table.columns[roles.facetVar] : null;
    var nTotal = table.columns[measures[0]].length;
    var k = measures.length;
    var useWithin = opts.errorBarMethod === "within" && k >= 2;
    var morey = useWithin ? Math.sqrt(k / (k - 1)) : 1;

    var anyMissing = 0, i, j;
    for (i = 0; i < nTotal; i++) {
      var miss = false;
      for (j = 0; j < k; j++)
        if (!isFiniteNum(table.columns[measures[j]][i])) { miss = true; break; }
      if (!miss && gs && isMissing(gs[i])) miss = true;
      if (!miss && fs && isMissing(fs[i])) miss = true;
      if (miss) anyMissing++;
    }
    var missingNote = anyMissing > 0
      ? anyMissing + " of " + nTotal +
        " cases are missing at least one value (shown where measured)"
      : "";

    var allIdx = [];
    for (i = 0; i < nTotal; i++) allIdx.push(i);
    var gLevels = gs ? levelsOf(table, roles.betweenVar, allIdx) : [];
    var hasGroup = !!gs && gLevels.length > 0;
    var fLevels = fs ? levelsOf(table, roles.facetVar, allIdx) : [];
    var hasFacet = !!fs && fLevels.length > 0;
    function mkx(fl, m) { return hasFacet ? (fl + FACET_SEP + m) : m; }

    var bars = [];
    var fIter = hasFacet ? fLevels : [null];
    var gIter = hasGroup ? gLevels : [null];
    for (var f2 = 0; f2 < fIter.length; f2++) {
    var fl = fIter[f2];
    for (var g2 = 0; g2 < gIter.length; g2++) {
      var gl = gIter[g2];
      var rowsIdx = [];
      for (i = 0; i < nTotal; i++) {
        if (hasGroup && (isMissing(gs[i]) || String(gs[i]) !== gl)) continue;
        // A panel variable on Repeated Measures is BETWEEN subjects: each
        // case belongs to one panel, exactly like the group variable beside
        // it. So it narrows the cell rather than the occasion.
        if (hasFacet && (isMissing(fs[i]) || String(fs[i]) !== fl)) continue;
        rowsIdx.push(i);
      }
      if (!rowsIdx.length) continue;
      // subject x measure matrix (NaN = missing)
      var mat = rowsIdx.map(function (ri) {
        return measures.map(function (m) {
          var v = table.columns[m][ri];
          return isFiniteNum(v) ? v : NaN;
        });
      });
      var norm = mat;
      if (useWithin) {
        // Cousineau-Morey normalises within the between-subjects CELL, and
        // with panels in play the cell is panel x group - which is what R's
        // rmplotbuilder.b.R does (its cell_mask is facet_mask & group_mask).
        // What makes that load-bearing is the ROW SET, not the grand mean:
        // adding a constant cannot change a standard deviation, so the whole
        // effect of getting the cell wrong is that the dispersion would be
        // measured over another panel's subjects as well as this one's.
        var gSum = 0, gN = 0;
        for (i = 0; i < mat.length; i++)
          for (j = 0; j < k; j++)
            if (isFinite(mat[i][j])) { gSum += mat[i][j]; gN++; }
        var grand = gN > 0 ? gSum / gN : 0;
        norm = mat.map(function (row) {
          var s = 0, c = 0;
          for (var q = 0; q < k; q++)
            if (isFinite(row[q])) { s += row[q]; c++; }
          var sm = c > 0 ? s / c : NaN;
          return row.map(function (v) { return v - sm + grand; });
        });
      }
      for (j = 0; j < k; j++) {
        var raw = [], rowIds = [], caseIds = [];
        for (i = 0; i < mat.length; i++)
          if (isFinite(mat[i][j])) {
            raw.push(mat[i][j]);
            rowIds.push(rowsIdx[i] + 1);
            caseIds.push(table.caseIds && table.caseIds[rowsIdx[i]]
              ? table.caseIds[rowsIdx[i]] : String(rowsIdx[i] + 1));
          }
        var n = raw.length;
        if (!n) continue;
        var center = (opts.summaryFunc === "median") ? S.median(raw) : S.mean(raw);
        var err = 0;
        if (n >= 2 && opts.errorBarType !== "none" && opts.summaryFunc !== "median") {
          var nv = [];
          for (i = 0; i < norm.length; i++)
            if (isFinite(norm[i][j])) nv.push(norm[i][j]);
          if (nv.length >= 2) {
            var sd = S.sdSample(nv) * morey, se = sd / Math.sqrt(nv.length);
            err = opts.errorBarType === "sd" ? sd
                : opts.errorBarType === "ci95" ? se * S.qt(0.975, nv.length - 1)
                : opts.errorBarType === "ci99" ? se * S.qt(0.995, nv.length - 1)
                : se;
          }
        }
        bars.push({ x: mkx(fl, measures[j]), group: hasGroup ? gl : null,
                    facet: hasFacet ? fl : null,
                    mean: S.sigR(center), se: S.sigR(err), n: n,
                    values: raw.map(S.sigR), rowIds: rowIds,
                    caseIds: caseIds,
                    sourceColumns: caseIds.map(function () {
                      return measures[j];
                    }) });
      }
    }
    }

    var synthX = [];
    if (hasFacet) {
      for (var sf = 0; sf < fLevels.length; sf++)
        for (var sm2 = 0; sm2 < measures.length; sm2++)
          synthX.push(fLevels[sf] + FACET_SEP + measures[sm2]);
    } else synthX = measures.slice();

    var spec = opts.spec || {};
    return { channels: {
      bars: bars,
      xCategories: synthX,
      groupCategories: gLevels,
      hasGroups: hasGroup,
      xLabel: titleFrom(spec, "xTitleOverride", "xTitle", "Measure"),
      yLabel: titleFrom(spec, "yTitleOverride", "yTitle", ""),
      groupLabel: hasGroup
        ? titleFrom(spec, "groupTitleOverride", "groupTitle", roles.betweenVar)
        : "",
      xLabelDefault: "Measure",
      yLabelDefault: "",
      groupLabelDefault: hasGroup ? roles.betweenVar : "",
      // R's simple `measures` path ships an EMPTY facet label even when it
      // panels (rmplotbuilder.b.R sets facet_label_v <- ""), because the
      // occasions axis has no single source variable to name against. Matched
      // rather than improved on: parity with the module is the rule here.
      facetLabel: "",
      facetLevels: fLevels,
      facetSeparator: hasFacet ? FACET_SEP : "",
      missingNote: missingNote
    } };
  }

  // ================================================================ corr
  function buildCorr(table, roles, opts) {
    var vars = (roles.vars || []).filter(function (v) {
      return table.order.indexOf(v) !== -1;
    });
    if (vars.length < 2)
      return { error: "Assign at least two numeric variables." };
    var method = opts.corrMethod || "pearson";
    var cols = vars.map(function (v) {
      return table.columns[v].map(function (x) {
        return isFiniteNum(x) ? x : NaN;
      });
    });
    var nTotal = cols[0].length, i, j, r;

    var anyMissing = 0;
    for (r = 0; r < nTotal; r++) {
      for (i = 0; i < cols.length; i++)
        if (!isFinite(cols[i][r])) { anyMissing++; break; }
    }
    var missingNote = anyMissing > 0
      ? anyMissing + " of " + nTotal + " cases have missing values; each " +
        "correlation uses its pairwise complete cases (n varies by pair)"
      : "";

    var corrRaw = null;
    if (nTotal > 0 && cols.length * nTotal <= 200000)
      corrRaw = cols.map(function (cl) {
        return cl.map(function (v) { return isFinite(v) ? v : null; });
      });

    var cells = [];
    for (i = 0; i < vars.length; i++) {
      for (j = i; j < vars.length; j++) {
        if (i === j) {
          var nDiag = 0;
          for (r = 0; r < nTotal; r++) if (isFinite(cols[i][r])) nDiag++;
          cells.push({ a: vars[i], b: vars[j], r: 1, p: 0, n: nDiag });
          continue;
        }
        var xs = [], ys = [];
        for (r = 0; r < nTotal; r++)
          if (isFinite(cols[i][r]) && isFinite(cols[j][r])) {
            xs.push(cols[i][r]); ys.push(cols[j][r]);
          }
        var entry = { a: vars[i], b: vars[j], n: xs.length };
        if (xs.length >= 3 && S.sdSample(xs) > 0 && S.sdSample(ys) > 0) {
          var ct = S.corrTest(xs, ys, method);
          if (ct && isFinite(ct.r)) {
            entry.r = S.sigR(ct.r);
            if (isFinite(ct.p)) entry.p = S.sigR(ct.p);
          }
        }
        cells.push(entry);
      }
    }
    return { channels: {
      corrCells: cells,
      corrVars: vars,
      corrRaw: corrRaw,
      missingNote: missingNote
    } };
  }

  // ================================================================ likert
  function buildLikert(table, roles, opts) {
    var items = (roles.items || []).filter(function (v) {
      return table.order.indexOf(v) !== -1;
    });
    if (!items.length) return { error: "Assign at least one item." };
    var nTotal = table.columns[items[0]].length;
    var ciLevel = (opts.ciLevel > 0.5 && opts.ciLevel < 1) ? opts.ciLevel : 0.95;
    var spec = opts.spec || {};

    var cols = {}, raws = {}, lvAll = [], it, i;
    function storesNumbers(col) {
      var ty = table.types ? table.types[col] : null;
      return ty === "continuous" || ty === "numeric" ||
             (ty === "ordinal" && !!(table.numericish && table.numericish[col]));
    }
    for (var q = 0; q < items.length; q++) {
      it = items[q];
      var colv = table.columns[it], lv = [];
      if (!storesNumbers(it)) {
        lv = (table.levels && table.levels[it] ? table.levels[it] : []).map(String);
        cols[it] = colv.map(function (v) { return isMissing(v) ? null : String(v); });
      } else {
        var uniq = {};
        for (i = 0; i < colv.length; i++)
          if (isFiniteNum(colv[i])) uniq[colv[i]] = colv[i];
        var uv = Object.keys(uniq).map(function (s) { return uniq[s]; });
        uv.sort(function (a, b) { return a - b; });
        lv = uv.map(String);
        cols[it] = colv.map(function (v) {
          return isFiniteNum(v) ? String(v) : null;
        });
        raws[it] = colv.map(function (v) { return isFiniteNum(v) ? v : NaN; });
      }
      for (i = 0; i < lv.length; i++)
        if (lvAll.indexOf(lv[i]) === -1) lvAll.push(lv[i]);
    }
    // Each item's own levels are sorted numerically above, but the UNION was
    // appended in ITEM order - so a response level used only by a later item
    // landed at the end of the shared scale. On a 1-5 battery whose first item
    // never scores 1, the master scale came out 2,3,4,5,1 and the diverging
    // stack drew "strongly disagree" on the agree side. Found while building
    // the punch list 20 examples; it affects any numeric-coded battery where
    // the first item does not happen to span the whole scale, which is the
    // common case. Documented intent is "numeric ascending" for numeric-coded
    // items; a mixed or factor battery keeps first-seen order, since sorting
    // response TEXT alphabetically would be worse than the order it arrived in.
    var allNumeric = items.length > 0;
    for (i = 0; i < items.length; i++)
      if (!storesNumbers(items[i])) { allNumeric = false; break; }
    if (allNumeric)
      lvAll.sort(function (a, b) { return Number(a) - Number(b); });

    var anyMissing = 0;
    for (i = 0; i < nTotal; i++)
      for (var q2 = 0; q2 < items.length; q2++)
        if (cols[items[q2]][i] == null) { anyMissing++; break; }
    var missingNote = anyMissing > 0
      ? anyMissing + " of " + nTotal +
        " respondents skipped at least one item (item ns vary)"
      : "";

    if (lvAll.length < 2)
      return { error: "The selected items have fewer than 2 distinct " +
                      "response levels - there is nothing to stack.",
               fix: { kind: "roles" } };
    var continuous = false;
    if (lvAll.length > 25) {
      var nonnum = items.filter(function (x) { return !storesNumbers(x); });
      if (nonnum.length > 0)
        return { error: "These items have " + lvAll.length + " distinct values - " +
                        "Likert items need a small shared response scale " +
                        "(typically 3-11 levels), and <strong>" + esc(nonnum[0]) +
                        "</strong> is not numeric, so item means cannot be " +
                        "computed either. Categorical variables with many " +
                        "levels belong in the Frequencies analysis.",
                 fix: { kind: "module", to: "freqplotbuilder",
                        col: nonnum[0] } };
      continuous = true;
    }

    var cells = [], means = [];
    for (var q3 = 0; q3 < items.length; q3++) {
      it = items[q3];
      if (continuous) {
        var vr = [];
        for (i = 0; i < nTotal; i++)
          if (raws[it] && isFinite(raws[it][i])) vr.push(raws[it][i]);
        var me = { item: it, n: vr.length };
        if (vr.length >= 1) {
          var mv = S.mean(vr);
          me.mean = S.sigR(mv);
          if (vr.length >= 2) {
            var seC = S.sdSample(vr) / Math.sqrt(vr.length);
            if (isFinite(seC)) me.se = S.sigR(seC);
            var halfC = seC * S.qt(0.5 + ciLevel / 2, vr.length - 1);
            if (isFinite(halfC)) {
              me.lo = S.sigR(mv - halfC);
              me.hi = S.sigR(mv + halfC);
            }
          }
        }
        means.push(me);
        continue;
      }
      var obs = [];
      for (i = 0; i < nTotal; i++)
        if (cols[it][i] != null) obs.push(cols[it][i]);
      var nIt = obs.length;
      for (var li = 0; li < lvAll.length; li++) {
        var nCell = 0;
        for (i = 0; i < obs.length; i++) if (obs[i] === lvAll[li]) nCell++;
        if (nCell === 0 && nIt > 0) continue;
        cells.push({ item: it, level: lvAll[li], n: nCell,
                     pct: S.sigR(nIt > 0 ? 100 * nCell / nIt : 0) });
      }
      var m2 = { item: it, n: nIt };
      if (nIt >= 1) {
        var code = obs.map(function (o) { return lvAll.indexOf(o) + 1; });
        var mv2 = S.mean(code);
        m2.mean = S.sigR(mv2);
        if (nIt >= 2) {
          var se2 = S.sdSample(code) / Math.sqrt(nIt);
          if (isFinite(se2)) m2.se = S.sigR(se2);
          var half2 = se2 * S.qt(0.5 + ciLevel / 2, nIt - 1);
          if (isFinite(half2)) {
            m2.lo = S.sigR(mv2 - half2);
            m2.hi = S.sigR(mv2 + half2);
          }
        }
      }
      means.push(m2);
    }

    // Cronbach's alpha (listwise complete, reverse items reflected).
    var alpha = null;
    if (items.length >= 2) {
      var revSet = [];
      if (spec.likertReverseItems) {
        var rv = spec.likertReverseItems;
        revSet = Array.isArray(rv) ? rv.map(String) : [String(rv)];
      }
      var kLv = lvAll.length;
      var rowsM = [];
      for (i = 0; i < nTotal; i++) {
        var row = [], okRow = true;
        for (var q4 = 0; q4 < items.length; q4++) {
          it = items[q4];
          var val;
          if (continuous) val = raws[it] ? raws[it][i] : NaN;
          else {
            var o2 = cols[it][i];
            val = o2 == null ? NaN : lvAll.indexOf(o2) + 1;
            if (revSet.indexOf(it) !== -1 && isFinite(val)) val = (kLv + 1) - val;
          }
          if (!isFinite(val)) { okRow = false; break; }
          row.push(val);
        }
        if (okRow) rowsM.push(row);
      }
      if (rowsM.length >= 3) {
        var sums = rowsM.map(function (row) {
          return row.reduce(function (a, x) { return a + x; }, 0);
        });
        var vt = Math.pow(S.sdSample(sums), 2), vi = 0;
        for (var q5 = 0; q5 < items.length; q5++)
          vi += Math.pow(S.sdSample(rowsM.map(function (row) { return row[q5]; })), 2);
        if (isFinite(vt) && vt > 0 && isFinite(vi)) {
          var kk = items.length;
          alpha = { alpha: S.sigR((kk / (kk - 1)) * (1 - vi / vt)),
                    k: kk, n: rowsM.length };
        }
      }
    }

    var ch = {
      likertItems: items.slice(),
      likertLevels: continuous ? [] : lvAll,
      likertCells: continuous ? [] : cells,
      likertMeans: means,
      likertAlpha: alpha,
      likertContinuous: continuous,
      missingNote: missingNote
    };
    if (continuous) {
      // The continuous branch FORCES the means-only type (b.R parity).
      ch.graphType = "likertmeans";
      ch.graphTypeChoices = [{ name: "likertmeans", label: "Means" }];
    }
    return { channels: ch };
  }

  // ================================================================ registry
  // Role defs mirror each module's u.yaml supplier. Each role declares
  // the measure types it ACCEPTS (the jamovi permitted-types model):
  // category slots take nominal/ordinal, value slots take continuous
  // plus numeric ordinal, likert items take all three; ID never plots.
  var MODULES = {
    plotbuilder: {
      label: "Compare Groups",
      build: buildCG,
      roles: [
        { key: "xvar", label: "X (categories)", accepts: ["nominal", "ordinal"], required: true },
        { key: "yvar", label: "Y (values)", accepts: ["continuous", "ordinal"], required: true },
        { key: "groupVar", label: "Group By", accepts: ["nominal", "ordinal"], required: false },
        { key: "facetVar", label: "Panels", accepts: ["nominal", "ordinal"], required: false }
      ],
      optsFrom: function (st, tpl) {
        return {
          summaryFunc: typeof st.summaryFunc === "string" ? st.summaryFunc : tpl.summaryFunc,
          errorBarType: typeof st.errorBarType === "string" ? st.errorBarType : tpl.errorBarType
        };
      }
    },
    distplotbuilder: {
      label: "Distribution",
      build: buildDist,
      roles: [
        { key: "var", label: "Variable", accepts: ["continuous", "ordinal"], required: true },
        { key: "groupVar", label: "Group By", accepts: ["nominal", "ordinal"], required: false },
        { key: "facetVar", label: "Panels", accepts: ["nominal", "ordinal"], required: false }
      ],
      optsFrom: function (st, tpl) {
        return {
          graphType: typeof st.graphType === "string" ? st.graphType : tpl.graphType,
          histStat: typeof st.histStat === "string" ? st.histStat : tpl.histStat,
          summaryFunc: typeof st.summaryFunc === "string" ? st.summaryFunc : tpl.summaryFunc,
          errorBarType: typeof st.errorBarType === "string" ? st.errorBarType : tpl.errorBarType
        };
      }
    },
    freqplotbuilder: {
      label: "Frequencies",
      build: buildFreq,
      roles: [
        { key: "var", label: "Variable", accepts: ["nominal", "ordinal"], required: true },
        { key: "groupVar", label: "Group By", accepts: ["nominal", "ordinal"], required: false },
        { key: "facetVar", label: "Panels", accepts: ["nominal", "ordinal"], required: false }
      ],
      optsFrom: function (st, tpl) {
        return {
          graphType: typeof st.graphType === "string" ? st.graphType : tpl.graphType,
          freqStat: typeof st.freqStat === "string" ? st.freqStat : tpl.freqStat,
          freqPosition: typeof st.freqPosition === "string" ? st.freqPosition : tpl.freqPosition
        };
      }
    },
    rmplotbuilder: {
      label: "Repeated Measures",
      build: buildRM,
      roles: [
        { key: "measures", label: "Measures", accepts: ["continuous", "ordinal"],
          required: true, multi: true },
        { key: "betweenVar", label: "Between Groups",
          accepts: ["nominal", "ordinal"], required: false },
        // t3-44: the panels role RM never had.
        { key: "facetVar", label: "Panels",
          accepts: ["nominal", "ordinal"], required: false }
      ],
      optsFrom: function (st, tpl) {
        return {
          summaryFunc: typeof st.summaryFunc === "string" ? st.summaryFunc : tpl.summaryFunc,
          errorBarType: typeof st.errorBarType === "string" ? st.errorBarType : tpl.errorBarType,
          errorBarMethod: typeof st.errorBarMethod === "string" ? st.errorBarMethod : tpl.errorBarMethod
        };
      }
    },
    corrplotbuilder: {
      label: "Correlation Matrix",
      build: buildCorr,
      roles: [
        { key: "vars", label: "Variables", accepts: ["continuous", "ordinal"],
          required: true, multi: true, min: 2 }
      ],
      optsFrom: function (st, tpl) {
        return {
          corrMethod: typeof st.corrMethod === "string" ? st.corrMethod : tpl.corrMethod
        };
      }
    },
    likertplotbuilder: {
      label: "Likert / Survey",
      build: buildLikert,
      roles: [
        { key: "items", label: "Items",
          accepts: ["nominal", "ordinal", "continuous"], required: true,
          multi: true }
      ],
      optsFrom: function (st, tpl) {
        return {
          ciLevel: typeof st.likertCiLevel === "number" ? st.likertCiLevel : tpl.likertCiLevel
        };
      }
    },
    xyplotbuilder: {
      label: "Scatter",
      build: buildXY,
      roles: [
        { key: "xvar", label: "X", accepts: ["continuous", "ordinal"], required: true },
        { key: "yvar", label: "Y", accepts: ["continuous", "ordinal"], required: true },
        { key: "groupVar", label: "Group By", accepts: ["nominal", "ordinal"], required: false },
        { key: "facetVar", label: "Panels", accepts: ["nominal", "ordinal"], required: false }
      ],
      optsFrom: function (st, tpl) {
        return {
          fitType: typeof st.xyFitType === "string" ? st.xyFitType : tpl.xyFitType,
          loessSpan: typeof st.xyLoessSpan === "number" ? st.xyLoessSpan : tpl.xyLoessSpan,
          ciLevel: typeof st.xyCILevel === "number" ? st.xyCILevel : tpl.xyCILevel,
          ellLevel: typeof st.xyEllipseLevel === "number" ? st.xyEllipseLevel : tpl.xyEllipseLevel,
          corrType: typeof st.xyStatsCorrType === "string" ? st.xyStatsCorrType : tpl.xyStatsCorrType
          // showFit / showCI used to be read here for the t4-17 band
          // disclosure. Both were read from the option store's top level,
          // where the chartSpec consolidation means they never appear, so both
          // were always the template default. The disclosure is retired and so
          // are these; the fits themselves are computed unconditionally and
          // the engine gates the drawing.
        };
      }
    }
  };

  return { FACET_SEP: FACET_SEP, MODULES: MODULES, isMissing: isMissing,
           levelsOf: levelsOf, buildCG: buildCG, buildDist: buildDist,
           buildFreq: buildFreq, buildXY: buildXY, buildRM: buildRM,
           buildCorr: buildCorr, buildLikert: buildLikert };
})();
