"""Independent SciPy survival probabilities and actual tests vs R references."""
import json
import math
import sys

try:
    import scipy
    from scipy import stats
except ImportError:
    print("SciPy is required for tail validation", file=sys.stderr)
    sys.exit(2)

with open(sys.argv[1] if len(sys.argv) > 1 else "/tmp/pandion-stats-tail.json") as f:
    refs = json.load(f)
assert refs["schemaVersion"] == 1
assert [(r["df"], r["t"]) for r in refs["ts"]] == [
    (df, t) for df in [.5, 1, 2, 5, 30, 100, 1000] for t in [-100,-12,-8,-2,0,2,8,12,100]]
assert [(r["df1"], r["df2"], r["f"]) for r in refs["fs"]] == [
    (d1,d2,f) for d1 in [1,2,5,10] for d2 in [.5,1,10,100,1000] for f in [0,.01,1,10,100,1e6]]
assert [(r["n"],r["shift"],r["method"],r.get("tail")) for r in refs["tests"]] == [
    (n,shift,method,tail) for n in [3,20,60] for shift in [.2,5,30]
    for method,tail in [(m,t) for m in ["welch","student","paired"] for t in ["two","greater","less"]] + [("anova",None)]]
checks = 0

def compare(got, expected, label):
    global checks
    assert isinstance(expected, (int, float)) and math.isfinite(expected), (label, "reference", expected)
    assert math.isfinite(got), (label, "result", got)
    assert abs(got - expected) <= 2e-8 * abs(expected) + 8 * math.ulp(0.0), (label, got, expected)
    checks += 1

for r in refs["ts"]:
    compare(2 * stats.t.sf(abs(r["t"]), r["df"]), r["two"], "two-sided t")
    compare(stats.t.sf(r["t"], r["df"]), r["greater"], "greater t")
    compare(stats.t.cdf(r["t"], r["df"]), r["less"], "less t")
for r in refs["fs"]:
    compare(stats.f.sf(r["f"], r["df1"], r["df2"]), r["p"], "F survival")
for r in refs["tests"]:
    if r["method"] == "anova":
        result = stats.f_oneway(r["x"], r["y"])
        compare(result.statistic, r["f"], "ANOVA F")
    else:
        alt = "two-sided" if r["tail"] == "two" else r["tail"]
        result = stats.ttest_rel(r["x"], r["y"], alternative=alt) if r["method"] == "paired" else stats.ttest_ind(
            r["x"], r["y"], equal_var=r["method"] == "student", alternative=alt)
        compare(result.statistic, r["t"], r["method"] + " t")
        compare(result.df, r["df"], r["method"] + " df")
    compare(result.pvalue, r["p"], r["method"] + " p")
print(f"TAIL THIRD REFERENCE: {checks} comparisons passed (SciPy {scipy.__version__})")
