# Workspace sequence validation

`standalone/verify/workspace-sequence-check.mjs` compares the live application
with a small independent spreadsheet model. The model does not call the app's
formula evaluator, parser, aggregator or history code to obtain expected values.

Each run performs 216 edits, checks the state after each edit, checks the
complete prior state after undo, and checks the edited state again after redo.
It saves and reopens a `.pand` project and reloads from autosave at 18 boundaries.
The 18-operation schedule repeats 12 times; the seed changes row selections,
values and filter thresholds, not the operation order.

The schedule combines:

- Raw-cell edits, changing formulas, filters, row exclusions and column types.
- Row insertion, duplication and deletion, including excluded observations.
- Column movement, renaming a formula/filter dependency, insertion before the
  first column, deletion and duplication with raw text/type preservation.
- Pasting beyond the final row and applying cell exclusions after structural
  changes.
- A three-column dependency cycle, blank/error propagation, restoration by
  undo/redo, and repair through a subsequent valid formula edit.

The oracle checks every raw and computed cell, column order, row identity
continuity and uniqueness, row/cell exclusions, stored formulas and cycle
errors, filter references, analysis roles, included sample size and the
observations supplied to the analysis. Source measurements near 1e10 make
small increments in the formula chain sensitive to accidental rounding.
Leading-zero text checks that changing a type does not rewrite raw cells.

Row duplication creates a new case identity and does not copy row or cell
exclusions to the new observation. Column duplication copies raw observations
and the measure type. These are explicit expectations of the tested commands.

The completed local runs use seed 20260905 on development and portable builds,
20260906 on development, and 20260907 on portable. Each run passed 29,650
assertions. No additional production workspace defect was found in these runs.

This finite model does not establish corruption immunity. Its formula family
is deliberately small; the separate formula/R suite covers the broader
language. More sequences combining import/append files, reshape, declared
missing codes, malformed recovery, storage failures and multi-document
operations remain in the release acceptance matrix. Existing dedicated
integrity and reshape probes supplement this sequence test.

## Reproduce

```sh
PS_STATE_FUZZ_SEED=20260905 node standalone/verify/workspace-sequence-check.mjs
PS_STATE_FUZZ_SEED=20260905 PS_PAGE=standalone/dist/pandion-plots.html node standalone/verify/workspace-sequence-check.mjs
```

Playwright/Chromium is required. The script resolves Playwright from
`/private/tmp` or `NODE_PATH`. CI runs development and portable variants;
the standalone gate also includes both.
