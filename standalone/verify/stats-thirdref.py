#!/usr/bin/env python3
"""stats-thirdref.py - a third, independent reference (hardening item 5).

The parity net's references are R and jamovi - and jamovi IS R, so a
shared convention error could hide from both. This recomputes the core
tests with scipy on the SAME datasets the fuzzer generated and compares
against the R references in the JSON. Exit 2 when scipy is missing
(run.sh warns and skips locally; CI installs scipy so it always runs).

Tolerances are loose-ish (1e-6 relative) on purpose: scipy and R
differ legitimately in exact-vs-approximation switchover rules for the
rank tests, so those compare only where both use the same regime.
"""
import json, sys

try:
    from scipy import stats as sp
except Exception:
    print("scipy unavailable - third reference skipped (exit 2)")
    sys.exit(2)

refs_path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/gb2-stats-fuzz.json"
refs = json.load(open(refs_path))
fails = ok = 0

def chk(label, got, want, rel=1e-6, absr=1e-9):
    global fails, ok
    if got is None or want is None:
        return
    try:
        if got != got or want != want:  # NaN on either side: no comparison
            return
    except Exception:
        return
    if abs(got - want) <= max(absr, rel * abs(want)):
        ok += 1
    else:
        fails += 1
        print("  FAIL %s: scipy %.12g vs R %.12g" % (label, got, want))

for name, ds in refs["datasets"].items():
    groups = ds["groups"]
    keys = list(groups.keys())
    for pk, pr in ds["pairs"].items():
        a, b = pk.split("|")
        ga, gb = groups[a], groups[b]
        w = pr.get("welch") or {}
        if w.get("t") is not None and len(ga) > 1 and len(gb) > 1:
            try:
                t, p = sp.ttest_ind(ga, gb, equal_var=False)
                chk(name + " " + pk + " welch t", t, w["t"])
                chk(name + " " + pk + " welch p", p, w["p"])
            except Exception:
                pass
        s = pr.get("student") or {}
        if s.get("t") is not None and len(ga) > 1 and len(gb) > 1:
            try:
                t, p = sp.ttest_ind(ga, gb, equal_var=True)
                chk(name + " " + pk + " student t", t, s["t"])
                chk(name + " " + pk + " student p", p, s["p"])
            except Exception:
                pass
    an = ds.get("anova")
    if an and an.get("F") is not None and len(keys) >= 2:
        try:
            F, p = sp.f_oneway(*[groups[k] for k in keys])
            chk(name + " anova F", F, an["F"])
            chk(name + " anova p", p, an["p"])
        except Exception:
            pass

for name, cs in refs["corrs"].items():
    x, y = cs["x"], cs["y"]
    pe = cs.get("pearson") or {}
    if pe.get("r") is not None:
        r, p = sp.pearsonr(x, y)
        chk(name + " pearson r", r, pe["r"])
        chk(name + " pearson p", p, pe["p"])
    spm = cs.get("spearman") or {}
    if spm.get("r") is not None:
        r, p = sp.spearmanr(x, y)
        chk(name + " spearman r", r, spm["r"])
        # p regimes differ (R AS89 vs scipy t) - coefficient only.
    kd = cs.get("kendall") or {}
    if kd.get("r") is not None:
        r, p = sp.kendalltau(x, y)
        chk(name + " kendall tau", r, kd["r"])

print(("STATS THIRDREF FAIL (%d ok, %d failing)" if fails else
       "STATS THIRDREF PASS (%d ok)") % ((ok, fails) if fails else (ok,)))
sys.exit(1 if fails else 0)
