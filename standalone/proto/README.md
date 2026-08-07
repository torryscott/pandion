# Prototype sandbox (branch `probe/charts-deepdive` only)

These files exist so the Charts deep-dive proposal can be re-run. Nothing
here ships, and `inst/widget/graphbuilder2.js` is deliberately UNTOUCHED:
the repo's Stop hook re-minifies and side-loads any edit under `inst/widget/`
straight into the local jamovi module, which is not a side effect a probe
branch should have.

The `brackclaim` RULE is LANDED in `inst/widget/graphbuilder2.js` (Aug 7
2026, approved) and needs nothing here: `standalone/verify/chart-check-check.mjs`
verifies it against the ordinary dev page, cases 1 to 4.

What is left unlanded is the other half of the same proposal: a
`__gb2_graphLint` host hook and the status-bar receipt the shell builds from
it. `make-proto.py` applies that hook to a COPY of the engine and writes the
two pages the receipt cases run against.

    python3 standalone/proto/make-proto.py

writes (both gitignored):
  standalone/scratchpad/engine-lintproto.js   patched engine source
  standalone/scratchpad/engine-vanilla.js     unpatched control

and (tracked on this branch, delete before any merge):
  standalone/proto-lint.html      the shell + the patched engine
  standalone/proto-vanilla.html   the shell + the unpatched engine

Then:

    node standalone/verify/chart-check-check.mjs       # cases 5-6 SKIP
    PS_BOOT=4000 PS_PAGE=standalone/proto-lint.html \
        node standalone/verify/chart-check-check.mjs   # cases 5-6 run

The remaining engine change is nine lines: `host.__gb2_graphLint`, beside
the existing `__gb2_serializeSvg` / `__gb2_chartSize` hooks inside
`render()`, returning the same `{findings, passed, total}` report the Check
graph panel draws. See `engine-lint.patch`.
