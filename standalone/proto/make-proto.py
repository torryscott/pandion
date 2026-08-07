#!/usr/bin/env python3
"""Build the prototype pages for the Charts deep-dive proposal.

Applies engine-lint.patch to a COPY of inst/widget/graphbuilder2.js and
writes the two pages standalone/verify/chart-check-check.mjs runs against.
The real engine file is never touched: the repo's Stop hook re-minifies and
side-loads anything under inst/widget/ into the local jamovi module.
"""
import pathlib
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[2]
engine = root / "inst" / "widget" / "graphbuilder2.js"
scratch = root / "standalone" / "scratchpad"
scratch.mkdir(parents=True, exist_ok=True)

vanilla = scratch / "engine-vanilla.js"
patched = scratch / "engine-lintproto.js"
vanilla.write_bytes(engine.read_bytes())
patched.write_bytes(engine.read_bytes())

patch = root / "standalone" / "proto" / "engine-lint.patch"
r = subprocess.run(["patch", "-p0", "-s", str(patched), str(patch)])
if r.returncode != 0:
    sys.exit("patch failed - the engine has moved under the prototype")

r = subprocess.run(["node", "--check", str(patched)])
if r.returncode != 0:
    sys.exit("patched engine does not parse")

page = (root / "standalone" / "index.html").read_text(encoding="utf-8")
old = '<script src="../inst/widget/graphbuilder2.min.js"></script>'
assert page.count(old) == 1, "the engine script tag moved"
for name, rel in (("proto-lint.html", "scratchpad/engine-lintproto.js"),
                  ("proto-vanilla.html", "scratchpad/engine-vanilla.js")):
    (root / "standalone" / name).write_text(
        page.replace(old, '<script src="%s"></script>' % rel, 1),
        encoding="utf-8")
    print("wrote standalone/" + name)
