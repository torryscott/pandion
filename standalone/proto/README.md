# Prototype sandbox (branch `probe/charts-deepdive` only)

These files exist so the Charts deep-dive proposal can be re-run. Nothing
here ships, and `inst/widget/graphbuilder2.js` is deliberately UNTOUCHED:
the repo's Stop hook re-minifies and side-loads any edit under `inst/widget/`
straight into the local jamovi module, which is not a side effect a probe
branch should have.

`make-proto.py` applies the proposed engine change to a COPY of the engine
and writes the two pages the probe runs against.

    python3 standalone/proto/make-proto.py

writes (both gitignored):
  standalone/scratchpad/engine-lintproto.js   patched engine source
  standalone/scratchpad/engine-vanilla.js     unpatched control

and (tracked on this branch, delete before any merge):
  standalone/proto-lint.html      the shell + the patched engine
  standalone/proto-vanilla.html   the shell + the unpatched engine

Then:

    PS_BOOT=4000 PS_PAGE=standalone/proto-lint.html \
        node standalone/verify/chart-check-check.mjs   # passes
    node standalone/verify/chart-check-check.mjs       # fails at case 1

The engine change is two additions to `graphbuilder2.js`, both inside
`render()`: a `__gb2_graphLint` host hook beside the existing
`__gb2_serializeSvg` / `__gb2_chartSize` hooks, and a `brackclaim` rule plus
its registry row inside `_graphLintFindings`. See `make-proto.py` for the
exact text.
