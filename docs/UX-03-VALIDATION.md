# UX-03: keyboard focus after control rebuilds

Implemented and verified September 9, 2026. Both full source and minified
renderer regression suites passed, along with the focused checks and
rebuilt delivery checks. Interactive acceptance in installed jamovi remains
pending as described below.

## Problem and fix

Changing an error-bar type with Enter or Space rebuilt the chart and left
focus on the page body. The next Tab restarted navigation outside the
settings panel. The baseline regression reproduced this in Compare Groups
and Repeated Measures. Changing the variable in the standalone filter menu
also left focus on the body.

Error-bar Type and Method buttons now have stable `data-field` identities.
This lets the existing renderer focus keeper find the same choice after a
local redraw, a standalone host echo, or a jamovi HTML-result replacement.
It retains the existing protection against stealing focus when the user has
moved elsewhere. No new chart-level focus fallback was introduced, because
the existing code documents an ancestor-frame scrolling problem with that
fallback in jamovi.

The filter menu captures the focused control's role and condition number
before rebuilding. Variable and comparison changes restore that control.
Adding a condition focuses its variable selector; removing a condition
focuses the next surviving condition, or the preceding one when the last
condition was removed. Restoration applies only when focus belonged to the
filter menu, and preserves its scroll position.

The application change is confined to error-choice identities in the shared
renderer and focus handling in the standalone filter menu. No statistical
formula, data value, project format, or chart geometry calculation changed.

## Focused verification

`standalone/verify/control-focus-check.mjs` is registered in both the
standalone source/dist runner and the shared source/minified renderer runner.
Fixtures use synthetic data. Tests inspect `document.activeElement` after
real keyboard activation and control replacement, without repairing focus
before the assertions.

| Delivery | Focus checks |
|---|---|
| Standalone with source renderer | 55 passed |
| Standalone with minified renderer | 55 passed |
| Rebuilt portable HTML | 55 passed |
| Rebuilt web app | 55 passed |

Coverage includes Enter and Space activation, successive error-type changes,
Tab and Shift+Tab, turning error bars off and back on, delayed standalone
host updates, deliberately moving focus elsewhere before an update,
viewport position, the repeated-measures Method choice in a shorter window,
filter variable/comparison changes, comparisons that hide the value control,
adding/removing conditions, and Escape back to the filter trigger.

The R-generated Compare Groups and Repeated Measures fixtures also exercise
the production jamovi pre-swap hook. A minimal `jmv-results-html` test element
replaces the chart host with a fresh host and a real R-generated payload;
the test element contains no focus-preservation code. These simulated
replacement checks pass, including restoration to the same choice and
continued keyboard navigation: 38 checks passed on each renderer bundle.
They are not an installed jamovi UI test.

Five adjacent standalone probes passed: row filters, panel reveal, panel
height limits, bypass accessibility, and grid accessibility. Screenshots of
the rebuilt app were inspected: after choosing SE, Tab visibly focuses SD
inside the error-bar panel.

The repository's full `scripts/verify/run.sh` and `--min` runs both exited
successfully. They covered rendering, statistical displays, precision and
exports, axes, control consistency, search, undo/redo, loading diagnostics,
and snapshot delivery. The optional `--extras` extension was not run.

## Builds and evidence

The minified renderer was rebuilt with the cached, pinned Terser 5.49.0 and
the exact compiler flags in `scripts/minify-widget.sh`. Direct use of the
cached compiler avoided a blocked npm registry lookup. The script's
`--check` passed. The portable and web builds passed, as did the website
accessibility contract and artifact parity checks.

- [Baseline failures](../planning/ux-03-fixes-2026-09-09/before-focus.log)
- [Delivery results](../planning/ux-03-fixes-2026-09-09/delivery-results.json)
- [Verification receipt](../planning/ux-03-fixes-2026-09-09/verification.json)
- [Full renderer results](../planning/ux-03-fixes-2026-09-09/engine-results.json)
- [Source renderer log](../planning/ux-03-fixes-2026-09-09/engine-source.log)
- [Minified renderer log](../planning/ux-03-fixes-2026-09-09/engine-min.log)
- [Keyboard focus screenshot](../planning/ux-03-fixes-2026-09-09/portable/cg_bar-keyboard.png)
- [Renderer change against the starting working copy](../planning/ux-03-fixes-2026-09-09/engine-change.diff)
- [Shell change against the starting working copy](../planning/ux-03-fixes-2026-09-09/shell-change.diff)

## Remaining acceptance work

An interactive check in installed jamovi remains pending because computer-
control permissions were unavailable. The user reported that they do not
have administrator access; no admin access or system installation was needed
for the code fix, R fixtures, local builds, or automated checks. No native
installer was rebuilt and nothing was published or deployed.

UX-04 (accessible selected states) and UX-05 through UX-07 remain open.
This fixes the controls reproduced in UX-03; it is not a claim that every
control or every host has completed keyboard or screen-reader acceptance.
