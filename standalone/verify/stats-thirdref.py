#!/usr/bin/env python3
"""Independent SciPy checks of the R fuzzer's t tests, ANOVA and correlations.

Every declared fixture and expected result must be checked. Only mathematically
undefined constant-data cases may be unavailable, and those are reported. Rank
correlations compare coefficients only: their R/SciPy p-value conventions differ.
Exit 2 means SciPy is absent; malformed references and calculation errors exit 1.
"""
import json
import math
import sys
from collections import Counter
from itertools import combinations


FIXED_DATASETS = {
    "b_offset", "b_offset_neg", "b_offset_scaled", "b_n2", "b_n2_vs_40",
    "b_ties_all", "b_const_a", "b_const_ab", "b_huge", "b_tiny",
    "b_negative", "b_tied_p", "b_k1_family", "b_const_tiny_unequal",
}
METHODS = ("welch", "student", "anova", "pearson", "spearman", "kendall")


class ValidationError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise ValidationError(message)


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def vector(value, label):
    require(isinstance(value, list) and len(value) >= 2, label + ": expected at least two observations")
    require(all(finite(v) for v in value), label + ": observations must be finite numbers")
    return value


def constant(values):
    return all(v == values[0] for v in values)


def mapping(value, label):
    require(isinstance(value, dict), label + ": expected an object")
    return value


def load_references(path):
    def invalid_constant(value):
        raise ValidationError("invalid JSON numeric constant: " + value)
    with open(path, encoding="utf-8") as handle:
        return json.load(handle, parse_constant=invalid_constant)


def validate(refs, sp):
    """Return coverage only after all expected comparisons have succeeded."""
    mapping(refs, "references")
    require(type(refs.get("schemaVersion")) is int and refs["schemaVersion"] == 1,
            "missing/unsupported reference schemaVersion")
    n_random = refs.get("n_random")
    require(type(n_random) is int and n_random >= 0, "missing/invalid n_random coverage declaration")
    require(type(refs.get("seed")) is int, "missing/invalid replay seed")
    datasets = mapping(refs.get("datasets"), "datasets")
    corrs = mapping(refs.get("corrs"), "corrs")
    expected_datasets = FIXED_DATASETS | {"rand%02d" % d for d in range(1, n_random + 1)}
    expected_corrs = {"corr_ties_small", "corr_exact_n12"} | {
        "corr%02d" % d for d in range(1, max(3, math.ceil(n_random / 4)) + 1)}
    for label, actual, expected in (("datasets", datasets, expected_datasets),
                                    ("corrs", corrs, expected_corrs)):
        require(set(actual) == expected, "%s coverage mismatch: missing=%s unexpected=%s" %
                (label, sorted(expected - set(actual)), sorted(set(actual) - expected)))

    counts = Counter()
    unavailable = []

    def compare(method, label, result, reference, fields):
        mapping(reference, label + " reference")
        for field, attr in fields:
            want = reference.get(field)
            got = getattr(result, attr)
            require(finite(want), label + " " + field + ": missing/non-finite R reference")
            require(finite(got), label + " " + field + ": non-finite SciPy result")
            # Numerical agreement, not bitwise equality between libraries.
            require(abs(got - want) <= max(1e-9, 1e-6 * abs(want)),
                    "%s %s: scipy %.17g vs R %.17g" % (label, field, got, want))
            counts[method] += 1

    def undefined(label, reference, reason, fields, defined=None):
        # R can retain a defined df even when t and p are undefined.
        defined = defined or {}
        if reference is not None:
            mapping(reference, label + " reference")
            require(set(reference) == set(fields) | set(defined), label + ": missing/unexpected reference fields")
            require(all(reference.get(field) is None for field in fields),
                    label + ": R supplied a result for mathematically undefined input")
            for field, expected in defined.items():
                if reference.get(field) is not None:
                    require(reference[field] == expected, label + ": unexpected " + field)
        unavailable.append({"case": label, "reason": reason})

    def calculate(label, function, *args, **kwargs):
        try:
            return function(*args, **kwargs)
        except Exception as exc:
            raise ValidationError(label + ": SciPy calculation failed: " + str(exc)) from exc

    for name, ds in datasets.items():
        mapping(ds, name)
        groups = mapping(ds.get("groups"), name + " groups")
        require(len(groups) >= 2, name + ": fewer than two groups")
        for key, values in groups.items():
            vector(values, name + " " + key)
        pairs = mapping(ds.get("pairs"), name + " pairs")
        expected_pairs = {a + "|" + b for a, b in combinations(groups, 2)}
        require(set(pairs) == expected_pairs, name + ": missing/unexpected pair references")
        for a, b in combinations(groups, 2):
            label = name + " " + a + "|" + b
            pair = mapping(pairs[a + "|" + b], label)
            ga, gb = groups[a], groups[b]
            for method, equal_var in (("welch", False), ("student", True)):
                require(method in pair, label + ": omitted " + method + " reference")
                ref = pair.get(method)
                if constant(ga) and constant(gb):
                    undefined(label + " " + method, ref, "both groups have zero within-group variance",
                              ("t", "p", "df") if method == "welch" else ("t", "p"),
                              {"df": len(ga) + len(gb) - 2} if method == "student" else None)
                    continue
                # Common translation preserves t/df/p and avoids cancellation
                # from large offsets in SciPy, just as in the R oracle.
                origin = ga[0]
                result = calculate(label + " " + method, sp.ttest_ind,
                                   [v - origin for v in ga], [v - origin for v in gb],
                                   equal_var=equal_var)
                compare(method, label + " " + method, result, ref,
                        (("t", "statistic"), ("df", "df"), ("p", "pvalue")))
        require("anova" in ds, name + ": omitted anova reference")
        values = [v for group in groups.values() for v in group]
        if constant(values):
            undefined(name + " anova", ds.get("anova"), "all observations are identical", ("F", "p"))
        else:
            origin = values[0]
            result = calculate(name + " anova", sp.f_oneway,
                               *[[v - origin for v in g] for g in groups.values()])
            compare("anova", name + " anova", result, ds.get("anova"),
                    (("F", "statistic"), ("p", "pvalue")))

    for name, cs in corrs.items():
        mapping(cs, name)
        x, y = vector(cs.get("x"), name + " x"), vector(cs.get("y"), name + " y")
        require(len(x) == len(y) and cs.get("n") == len(x), name + ": inconsistent paired lengths/n")
        for method, function in (("pearson", sp.pearsonr), ("spearman", sp.spearmanr),
                                 ("kendall", sp.kendalltau)):
            require(method in cs, name + ": omitted " + method + " reference")
            if constant(x) or constant(y):
                undefined(name + " " + method, cs.get(method), "a correlation variable is constant", ("r", "p"))
                continue
            result = calculate(name + " " + method, function, x, y)
            fields = (("r", "statistic"), ("p", "pvalue")) if method == "pearson" else (("r", "statistic"),)
            compare(method, name + " " + method, result, cs.get(method), fields)

    require(all(counts[method] > 0 for method in METHODS), "one or more required methods had zero comparisons")
    return {"seed": refs["seed"], "datasets": len(datasets), "correlations": len(corrs),
            "comparisons": dict(counts), "undefined": unavailable}


def main():
    try:
        from scipy import stats as sp
    except ModuleNotFoundError as exc:
        if exc.name != "scipy":
            raise
        print("scipy unavailable - third reference skipped (exit 2)")
        return 2
    path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/gb2-stats-fuzz.json"
    try:
        coverage = validate(load_references(path), sp)
    except Exception as exc:
        print("STATS THIRDREF FAIL: " + str(exc))
        return 1
    print("Coverage: " + json.dumps(coverage, sort_keys=True))
    print("STATS THIRDREF PASS (%d comparisons; %d explicitly undefined cases)" %
          (sum(coverage["comparisons"].values()), len(coverage["undefined"])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
