# UX-04: accessible error-bar choices

Implemented and automatically verified September 9, 2026. Both full renderer
suites and all focused delivery checks passed. Actual screen-reader and
installed jamovi acceptance remain pending.

## Problem and fix

Error-bar Type and repeated-measures Method choices showed a blue selected
button without exposing a selected state to accessibility APIs. The baseline
regression reproduced missing `aria-pressed` attributes for every Type choice
in both Compare Groups and Repeated Measures.

The shared renderer now sets `aria-pressed="true"` on the current choice and
`aria-pressed="false"` on the other choices, both when creating the controls
and when repainting them after activation. Repainting matters particularly
for Method: its selected control updates before the host recomputes the
error bars. Each group remains independently selected. The existing button
names and UX-03 focus identities are retained.

The application-source change adds two lines in the error-choice generator
and its repaint handler. It changes no statistical formula, data value,
chart geometry, visual style, or project format.

## Regression coverage

The existing `standalone/verify/control-focus-check.mjs` now checks selected
states alongside its keyboard-focus coverage. It is registered in both the
standalone source/dist runner and shared source/minified renderer runner.

Each group-state check compares all the group's DOM states with an explicit
expected selection, then reads Chromium's accessibility tree for each button.
The exposed role, unchanged name, and true/false pressed state must all
match. Tests do not set the accessibility attributes or repair focus.

Coverage includes all six error-bar types, both repeated-measures methods,
Enter and Space, mouse activation, activating an already-selected choice,
turning error bars off and back on, local redraws, delayed standalone host
updates, and independent Type/Method state. The UX-03 checks still cover
sequential keyboard navigation, viewport position, deliberately moving focus
elsewhere, and the standalone filter menu.

R-generated Compare Groups and Repeated Measures fixtures exercise the
production jamovi HTML-result pre-swap hook. A minimal test element replaces
the result host using a real R payload, without implementing focus or
selection preservation itself. `control-focus-host.R` computes a fresh
between-subjects result from the same synthetic data for Method's update;
the test does not relabel the original within-subjects widths. These checks
include Method's immediate repaint and a subsequent result replacement.
This simulates the host lifecycle; it is not an installed jamovi UI or
screen-reader test.

| Delivery | Focus checks | Selected-state group checks |
|---|---:|---:|
| Standalone with source renderer | 71 passed | 46 passed |
| Standalone with minified renderer | 71 passed | 46 passed |
| Rebuilt portable HTML | 71 passed | 46 passed |
| Rebuilt web app | 71 passed | 46 passed |
| R-generated host, source renderer | 53 passed | 55 passed |
| R-generated host, minified renderer | 53 passed | 55 passed |

Each selected-state group check covers every choice in that group through
both DOM and browser accessibility-tree assertions. These counts describe
the tested transitions, not a percentage of all possible application states.

Both `bash scripts/verify/run.sh` and `bash scripts/verify/run.sh --min`
passed with no required skips. They covered chart rendering, statistical
displays, numerical transport and exports, axes, control consistency,
undo/redo, loading diagnostics, and snapshot delivery. The optional
`--extras` extension was not run. The existing drag probe logged one weak
pie-hover assertion per bundle because hover did not arm; that interaction
was not independently established by this run.

## Local builds

The minified renderer was rebuilt with cached Terser 5.49.0 using the exact
flags from `scripts/minify-widget.sh`. Its source-hash and syntax check
passed. This uses the existing compiler without an npm registry lookup or
system installation.

The portable and web builds passed, including the website accessibility
contract. Artifact parity confirmed that the portable download is identical
to the standalone build and that the web app references the current hashed
renderer without stale JavaScript assets. The captured error-bar panel was
visually inspected; selected styling and keyboard focus remain distinct.

## Related-control review

The error-choice helper is used only by Type and Method. A separate
`_bsChoiceBtn` helper for bar-style Orientation, Summary, and Frequencies
choices has similar styling without pressed-state markup. That is a related
follow-up requiring its own interaction coverage; it was not changed by this
error-bar fix. Comparison-sort, distribution-bin-sort, and standalone
orientation controls already contain pressed-state handling in the reviewed
source. This was a targeted pattern review, not acceptance of every control.

## Evidence and remaining acceptance

- [Baseline failure](../planning/ux-04-fixes-2026-09-09/before-choice.log)
- [Application change against the starting working copy](../planning/ux-04-fixes-2026-09-09/engine-change.diff)
- [Source accessibility-tree evidence](../planning/ux-04-fixes-2026-09-09/source/choice-accessibility.json)
- [Delivery results](../planning/ux-04-fixes-2026-09-09/delivery-results.json)
- [Final R-host results](../planning/ux-04-fixes-2026-09-09/host-results.json)
- [Full renderer results](../planning/ux-04-fixes-2026-09-09/engine-results.json)
- [Source renderer log](../planning/ux-04-fixes-2026-09-09/engine-source.log)
- [Minified renderer log](../planning/ux-04-fixes-2026-09-09/engine-min.log)
- [Final verification receipt](../planning/ux-04-fixes-2026-09-09/verification.json)
- [Build results](../planning/ux-04-fixes-2026-09-09/build-results.json)
- [Artifact parity](../planning/ux-04-fixes-2026-09-09/build-artifact-parity.log)
- [Scope review and test-fixture corrections](../planning/ux-04-fixes-2026-09-09/review-notes.json)

Actual screen-reader testing must confirm that users hear the current choice
and its changed state. That acceptance cannot be replaced by an accessibility-
tree assertion. Installed jamovi acceptance also remains pending because
computer-control permissions were unavailable; the user does not have
administrator access. No admin installation is needed for these local code,
R-fixture, browser, or build checks.

No native installer has been rebuilt, and nothing has been published or
deployed. UX-05 through UX-07 remain open.
