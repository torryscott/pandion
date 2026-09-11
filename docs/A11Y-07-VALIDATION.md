# A11Y-07: classroom acceptance preparation and review fixes

September 10, 2026. **Acceptance prepared; A11Y-07 remains open.** The owner
expects a mix of browser and jamovi use, with browser as a fallback if installed
jamovi cannot provide an independently usable route. Neither platform is
declared accepted in this record.

## Completed work

The [classroom pack](accessibility-classroom/README.md) supplies a common
browser/jamovi assignment, an eight-record synthetic CSV, a worked answer key,
an edition/platform matrix and a session template. It covers discovery,
import/missing data, correction/undo, formula errors/recalculation, chart roles,
descriptive results, exports, project reopening and actual LMS submission.
Course-specific chart families and Layouts/Notebook tasks must be added when
required. Assisted, blocked and untested tasks cannot become independent passes.

The local [public statement](../website/accessibility.html) now describes
implemented grid/Layout features and tagged PDFs, accurately distinguishes
automated tests from human acceptance, and discloses unresolved contrast and
installed-host limitations. It is dated September 10. It was **not published**.

Two markup findings were corrected in the standalone shell: the generic brand
container no longer has a prohibited name, and Layout history is a named
`group` around Undo/Redo. The brand's visible text remains available. This
follows the ARIA distinction between a nameless generic container and a group
that can have a name. [WAI-ARIA generic role](https://www.w3.org/TR/wai-aria-1.2/#generic)

The rehearsal also found and fixed a substantive result-label defect. Some
statistics cells were focusable definition buttons whose accessible name was
only “p value, definition” or “t statistic, definition,” omitting the displayed
result. Names now begin with the same formatted value/label shown visually,
followed by the term and definition action. Header and contextual glossary
actions also retain their visible labels. The label for `.071` is now
“.071, p value, definition.” This changes accessibility names, not statistical
calculations, displayed values or chart palettes.

The shared renderer, minified bundle, portable download and hosted app were
rebuilt. Result-name regression checks now visit every Statistics subpanel in
the seven chart-family fixtures, including R-generated source/minified hosts.
The setting-search lifecycle check is part of the accessibility release runner
for source, portable and hosted editions.

## Verification and evidence

Evidence root: `planning/a11y-07-fixes-2026-09-10/`. The final release run and
individual reports are in `final-run.log` and `final/`. The machine-readable
`verification.json` records final counts, hashes and completed checks.

The completed local release run passed **284 axe states with zero blocking
rules and zero execution errors**. It retains **297 open review rule/state
entries** (down from 333 because the 36 generic-naming entries no longer
occur). The new name checks examined **80 Statistics subpanel views and 1,217
definition actions** across three standalone artifacts and two R hosts; these
are repeated fixture instances, not distinct statistical procedures.
Five setting-search reports cover **175 lifecycle states**, including source
Chromium/Firefox/WebKit and portable/hosted Chromium. All passed. Each of the
three artifact runs also passed the PDF export/structure checks. The final
website scan and desktop/narrow visual captures were refreshed after the
standalone-PDF scope clarification.

- The classroom rehearsal uses the real CSV importer, grid keys/cell editor,
  Undo, command palette and formula dialog. It checks the seven original valid
  Scores, correction to 20, error recovery, eight exact computed values,
  recomputation/undo, group means 13/17 with N=4, SE=√(5/3), the actual
  Descriptives table and accessible result names. Native project serialization
  and reopening retain the corrected data and formula.
- The answer-key anchors were also checked with base R (`mean`, `sd` and
  `aggregate`), independently of the application. The app table displays SD
  2.58 and SE 1.29 at two decimals; the assignment accepts the displayed
  precision rather than demanding unavailable extra digits.
- `before-statistics-fix/classroom-fixture.json` reproduces the result-name
  failure with the retained old minified renderer. The final fixture passes
  role/name lookup for the actual t-statistic and p-value controls.
- Setting-search checks cover closed, open, filtered/active result, Escape and
  rebuilt states in all seven families. Each reference has exactly one target,
  expected roles, matching expanded/visible state, and a live selected option.
  Focus returns on Escape. Source was also sampled in Firefox and WebKit.
- The full automated accessibility release runner checks all three app
  artifacts, public site/guide, PDF structure and two R-generated hosts. Raw
  incomplete findings are still retained for review; no rules were suppressed
  to obtain a pass. Grid, modal, layout and bypass keyboard contracts were
  rerun separately.

Two test-harness corrections are recorded: the initial Layout history probe
needed to create a layout before its toolbar existed; and an initial statistics
assertion searched the whole accessibility snapshot, which also includes
descendant text even when `aria-label` overrides the accessible name. That
assertion was replaced with actual role/name lookup and name/value comparisons;
the old renderer then fails as intended. The initial fixture rehearsal is
retained separately from the final negative control.

The browser rehearsal uses locator assistance and programmatic chart setup
and project serialization. It does not establish unassisted keyboard use,
actual speech/braille output, native Save dialogs, full course equivalence or
LMS submission. R chart hosts are not installed jamovi. Playwright WebKit is
not Safari/VoiceOver. No installed-host or human acceptance session occurred.

## Adjudication of the earlier review queue

The A11Y-06 baseline contained 333 **rule/state entries**, including repetitions
across editions and states. They were not 333 distinct defects. This ledger
records decisions without rewriting the historical raw reports.

| Earlier rule / count | Decision and evidence | What remains |
| --- | --- | --- |
| `aria-prohibited-attr` / 36 | Confirmed generic-container naming issues; fixed brand/Layout markup and checked browser accessibility representation plus new scans | Final host/AT reading experience still needs acceptance |
| `aria-valid-attr-value` / 69 | The flagged Find-a-setting controls relationships are valid in the tested standalone lifecycle; unique targets persist while closed and after rebuild | Scanner entries remain raw review items; installed jamovi behavior and actual AT announcements remain open |
| `document-title` / 20; `html-has-lang` / 20 | R fixtures omit the document wrapper; responsibility remains explicitly assigned to the actual host | Verify title and language in installed jamovi; no synthetic wrapper added to manufacture a pass |
| `bypass` / 18 | Fixture/host navigation requires contextual adjudication | Verify native jamovi analysis/results traversal and ability to exit its frame |
| `color-contrast` / 170 | SVG text, gradients, overlaps and native controls still need rendered-state review | Not dismissed. A11Y-02's measured default-fill contrast gap remains open; palette changes are deferred |

The new result-name defect was found by task rehearsal rather than the old
scanner queue. Correct descriptive table values did not prove that every
interactive statistical result had a useful accessible name.

## Remaining acceptance

Run the pack with the university's actual supported browser/AT and installed
jamovi/AT combinations. Record each edition separately. A jamovi-host failure
must remain in the delivered-workflow issue list even if its fix belongs
upstream. Browser becomes an accepted fallback only if it independently passes
the same required learning objectives, input/output and submission tasks.

Complete low-vision/contrast review and actual PDF-reader/LMS testing. Extend
the assignment to required charts, large datasets and authoring workflows.
Update the criterion matrix with the resulting evidence before preparing a
version-specific conformance report. This pass does not close A11Y-02 or claim
Title II/WCAG conformance.
