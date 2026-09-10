#!/usr/bin/env python3
"""Negative controls: a broken reference/calculator must never earn a PASS."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
from unittest.mock import patch
import warnings

from scipy import stats as sp

checker = Path(__file__).with_name("stats-thirdref.py")
spec = importlib.util.spec_from_file_location("thirdref", checker)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
refs = module.load_references(sys.argv[1] if len(sys.argv) > 1 else "/tmp/gb2-stats-fuzz.json")
passed = 0


def rejected(label, value, expected):
    global passed
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            module.validate(value, sp)
    except module.ValidationError as exc:
        assert expected in str(exc), (label, str(exc))
        passed += 1
        print("  ok " + label)
    else:
        raise AssertionError(label + ": invalid validation was accepted")


with warnings.catch_warnings():
    warnings.simplefilter("ignore", RuntimeWarning)
    coverage = module.validate(refs, sp)
assert all(coverage["comparisons"].get(method, 0) > 0 for method in module.METHODS)
assert len([case for case in coverage["undefined"] if case["case"].startswith("b_const_ab ")]) == 3
passed += 1
print("  ok complete R reference passes, with constant-data cases explicitly accounted for")

rejected("empty document", {}, "schemaVersion")
bad = copy.deepcopy(refs)
bad["datasets"] = {}
rejected("empty dataset roster", bad, "coverage mismatch")
bad = copy.deepcopy(refs)
bad["datasets"].pop("b_offset")
rejected("missing boundary dataset", bad, "coverage mismatch")
bad = copy.deepcopy(refs)
bad["corrs"].pop("corr_exact_n12")
rejected("missing correlation dataset", bad, "coverage mismatch")

for label, path in [
    ("omitted undefined test", ("datasets", "b_const_ab", "pairs", "G1|G2", "welch")),
    ("omitted undefined ANOVA", ("datasets", "b_const_ab", "anova")),
    ("omitted correlation method", ("corrs", "corr_exact_n12", "kendall")),
    ("omitted undefined field", ("datasets", "b_const_ab", "pairs", "G1|G2", "welch", "p")),
]:
    bad = copy.deepcopy(refs)
    target = bad
    for key in path[:-1]:
        target = target[key]
    del target[path[-1]]
    rejected(label, bad, "reference")

for label, path, value, expected in [
    ("missing pair", ("datasets", "b_offset", "pairs"), {}, "pair references"),
    ("missing test", ("datasets", "b_offset", "pairs", "G1|G2", "welch"), None, "expected an object"),
    ("missing p-value", ("datasets", "b_offset", "pairs", "G1|G2", "student", "p"), None, "R reference"),
    ("NaN reference", ("datasets", "b_offset", "anova", "F"), float("nan"), "R reference"),
    ("wrong finite answer", ("datasets", "b_offset", "anova", "F"), -99, "scipy"),
    ("missing correlation coefficient", ("corrs", "corr_exact_n12", "spearman", "r"), None, "R reference"),
    ("non-numeric observation", ("datasets", "b_offset", "groups", "G1"), [1, "bad", 3], "finite numbers"),
    ("infinite observation", ("datasets", "b_offset", "groups", "G1"), [1, float("inf"), 3], "finite numbers"),
    ("pairing length mismatch", ("corrs", "corr_exact_n12", "y"), [1, 2], "paired lengths"),
    ("fabricated constant-data result", ("datasets", "b_const_ab", "pairs", "G1|G2", "welch"), {"t": 0, "p": 1, "df": None}, "undefined input"),
]:
    bad = copy.deepcopy(refs)
    target = bad
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value
    rejected(label, bad, expected)

with patch.object(sp, "ttest_ind", return_value=SimpleNamespace(statistic=float("nan"), pvalue=.5, df=4)):
    rejected("unexpected NaN from SciPy", refs, "non-finite SciPy result")
with patch.object(sp, "ttest_ind", side_effect=RuntimeError("injected calculation failure")):
    rejected("unexpected SciPy exception", refs, "injected calculation failure")

# Exercise the executable's exit status as well as the comparison function.
with tempfile.TemporaryDirectory(prefix="pandion-thirdref-guard-") as directory:
    target = Path(directory) / "bad.json"
    for label, text in (("empty JSON CLI", "{}"), ("malformed JSON CLI", "{"),
                        ("nonstandard NaN JSON CLI", '{"seed": NaN}')):
        target.write_text(text)
        result = subprocess.run([sys.executable, str(checker), str(target)], capture_output=True, text=True)
        assert result.returncode == 1 and "STATS THIRDREF FAIL" in result.stdout, (label, result)
        assert "STATS THIRDREF PASS" not in result.stdout
        passed += 1
        print("  ok " + label)

print("STATS THIRDREF GUARD PASS (%d checks)" % passed)
