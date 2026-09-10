# Usability fixes and validation — September 7, 2026

The first implementation batch fixes the stale computed-cell display (UX-01)
and the repeated-measures case count (UX-02) from the
[usability audit](USABILITY-AUDIT-2026-09-07.md). Both defects were reproduced
with failing browser checks before the application was edited. The checks
now pass against the source app, rebuilt portable HTML, and rebuilt web app.

## Changes

### UX-01: computed values refresh immediately

Committing a source-cell edit now repaints mounted computed cells after the
existing formula recalculation. This covers formulas on other rows, formula
chains, and whole-column functions such as `VMEAN`. Rows whose filter state
changes also repaint their visual and accessible state; find results and the
filter count refresh. Excluding or including a source cell follows the same
refresh path.

The refresh does not rebuild the grid. The next editor, focus, selection, and
virtualized scroll window remain available. Rows outside that window read
the recalculated values when they are mounted. Formula arithmetic, stored
precision, and the project format have not changed in this batch.

### UX-02: cases and measurements are distinct

For eight cases measured twice, the status now reads:

`8 cases · 2 conditions · 16 measurements`

Cases are counted by stable case identity in the chart payload. Grouping,
panels, and identical numeric values cannot multiply or merge them. Missing
or excluded measurements do not contribute to the measurement count. A case
with no remaining measurements does not contribute to the case count.
Excluded points retained in the rendering payload for crossed-out markers
are explicitly omitted from these counts.

When some represented cases lack a selected measure, the status also reports
the number of complete cases. For example, the tested three-condition
fixture with one missing and one excluded measurement reports
`8 cases · 3 conditions · 22 measurements · 6 complete cases`.
“Complete cases” means cases with every selected measure; it is not a claim
that every statistical test uses that same sample. Existing missing-data
notes remain present. If a future payload lacks case identities, the
fallback labels its total as measurements rather than inventing a case count.

## Verification

All checks below passed on local Chromium with synthetic data and isolated
browser contexts. The new probes use public commands to prepare fixtures,
then exercise real cell-edit commits and inspect the visible grid and status.
They are included in `standalone/verify/run.sh` for source and dist runs.

| Check | Source app | Portable HTML | Web app build |
|---|---|---|---|
| Computed-grid regression: 637 assertions per run | Pass | Pass | Pass |
| Case-count regression: 35 assertions per run | Pass | Pass | Pass |
| Existing computed-variable, keyboard, and exclusion-bridge probes | Pass | Pass | Covered by exact asset parity; not rerun here |

The computed-grid probe verifies Enter, Tab, clicking away, accessible value
names, a formula chain, a whole-column formula, undo/redo, copy, selection
summary, serialized values, save/reopen, exclusions, computed filters, and
chart payload values. A 2,000-row grid verifies mounted and newly mounted
results without a scroll jump or unbounded grid rebuild.

The case-count probe verifies complete and incomplete observations, wholly
missing cases, groups, panels, filters, row and cell exclusions, re-inclusion,
equal numeric values, one and three conditions, singular wording, and the
unchanged basic Compare Groups wording.

Twelve existing adjacent probes passed on the source app: computed variables,
grid keys, grid accessibility, data undo, column sizing, row filters, missing
filters, exclusion bridge, filter honesty, status bar, shape plurals, and
workspace sequences. The sequence probe exercised 216 edits, 216 undo/redo
pairs, and 18 save/reopen/reload cycles. These are regression results for this
change, not a fresh execution of the full numerical-validation matrix.

Both build scripts passed. The website accessibility contract passed.
`artifact-parity-check.mjs` confirmed that the web scripts and portable HTML
contain the current source bytes, and that the website's portable download
is byte-identical to the standalone dist. JavaScript and verification-runner
syntax checks passed. Screenshots of the corrected grid and basic repeated-
measures status were inspected for legibility and layout.

## Evidence

- [Before/after logs, screenshots, and verification receipt](../planning/usability-fixes-2026-09-07/)
- [Original computed-grid failure](../planning/usability-fixes-2026-09-07/computed-grid-refresh-check-before.log)
- [Original case-count failure](../planning/usability-fixes-2026-09-07/case-count-check-before.log)
- [Final delivery results](../planning/usability-fixes-2026-09-07/delivery-results.json)
- [Adjacent regression results](../planning/usability-fixes-2026-09-07/source-adjacent-results.json)
- [Grid screenshot](../planning/usability-fixes-2026-09-07/source/computed-grid-fixed.png)
- [Case-count screenshot](../planning/usability-fixes-2026-09-07/source/repeated-case-count-fixed.png)
- [Application diff against the pre-batch working copy](../planning/usability-fixes-2026-09-07/shell-change.diff)

## Remaining scope

The shared renderer, its minified bundle, and `ps-data.js` retain their
pre-batch hashes. Statistical algorithms were not edited. No installed
jamovi, Windows/macOS installer, Safari, Firefox, or screen-reader acceptance
run was performed. This batch rebuilt local web and portable artifacts; it
did not publish a site, tag a release, or rebuild native installers.

The next usability batch remains keyboard focus and selected-state semantics
in chart controls, followed by narrow-window layout actions. The original
audit's other navigation and discoverability findings remain open. The
broader review of counted units in other multi-contribution analyses, such
as multi-item survey charts, is also still pending. These fixes do not
constitute a claim that the entire application is 100% verified.
