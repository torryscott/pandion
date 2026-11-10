"""Independent SciPy studentized-range probabilities vs the R references.

stats-range.R builds its references from the t distribution (two groups),
from a chi mixture of R's df = Inf range CDF (three to six groups) and from
a direct integral of the range of k normals (eight to fifty groups). SciPy's
studentized_range is a third implementation that shares no code with any of
them, so agreement here says the references themselves are right.
Exit 2 means SciPy is absent.
"""
import json
import math
import sys
import warnings

try:
    import scipy
    from scipy import stats
except ImportError:
    print("SciPy is required for range validation", file=sys.stderr)
    sys.exit(2)

with open(sys.argv[1] if len(sys.argv) > 1 else "/tmp/pandion-stats-range.json") as f:
    refs = json.load(f)
assert refs["schemaVersion"] == 1
DFS = [1, 1.3133734984249466, 1.5, 2, 3, 5, 10, 30, 100, 150, 200, 447,
       598, 999, 1000, 1001, 1197, 5000, 50000]
QS = [.5, 1, 2, 3, 3.5, 4, 5.800019621705907, 8, 12, 25]
assert [(r["q"], r["df"]) for r in refs["exact"]] == [(q, df) for df in DFS for q in QS]
assert [(r["q"], r["k"], r["df"]) for r in refs["mix"]] == [
    (q, k, df) for k in [3, 4, 5, 6] for df in DFS for q in QS]
assert [(r["q"], r["k"]) for r in refs["normal"]] == [
    (w, k) for k in [8, 10, 20, 50] for w in [1, 2, 3, 4, 5, 6, 8]]
checks = 0
worst = 0.0


def compare(got, expected, label):
    global checks, worst
    assert isinstance(expected, (int, float)) and math.isfinite(expected), (label, "reference", expected)
    assert math.isfinite(got), (label, "result", got)
    err = abs(got - expected)
    assert err <= 1e-9, (label, got, expected)
    worst = max(worst, err)
    checks += 1


with warnings.catch_warnings():
    warnings.simplefilter("ignore")
    for r in refs["exact"]:
        label = "two groups q=%g df=%g" % (r["q"], r["df"])
        compare(2 * stats.t.sf(r["q"] / math.sqrt(2), r["df"]), r["p"], label + " t")
        compare(float(stats.studentized_range.sf(r["q"], 2, r["df"])), r["p"], label + " range")
    for r in refs["mix"]:
        compare(float(stats.studentized_range.sf(r["q"], r["k"], r["df"])), r["p"],
                "k=%d q=%g df=%g" % (r["k"], r["q"], r["df"]))
    for r in refs["normal"]:
        compare(float(stats.studentized_range.sf(r["q"], r["k"], math.inf)), r["p"],
                "k=%d q=%g df=inf" % (r["k"], r["q"]))
print(f"RANGE THIRD REFERENCE: {checks} comparisons passed, worst {worst:.1e} (SciPy {scipy.__version__})")
