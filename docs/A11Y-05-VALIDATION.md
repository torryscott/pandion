# A11Y-05: Narrow-layout containment and Data scrolling

September 10, 2026. Pandion Plots 3.1.1 working copy.

## Change and cause

The original WebKit reflow sequence failed locally: the Data pane shifted
three pixels left at 640px, with larger shifts at 320px and after enlarged
text spacing. Two layout problems contributed:

- Desktop sidebar resize handles remained in the narrow one-column grid after
  their sidebars became drawers. Their obsolete grid areas created implicit
  tracks, and their hit regions extended the scrollable frame by three pixels.
- The single-row header could not hold its buttons, project details and save
  status at 320px. Keyboard focus and `scrollIntoView` could scroll the hidden
  overflow of the body, moving the whole application out of view.

The standalone now hides those resize handles below 760px and lets header,
command and status rows grow with their text. Below 560px, project details and
save status occupy a second header row. All three drawer buttons stay visible.

Visual review caught two related Data issues during verification: the grid's
old viewport-height calculation let navigation to the last row scroll its
toolbar out of view, and enlarged spacing made the command bar scroll sideways.
The narrow Data card now uses the available workspace height, with the grid
scrolling inside it and its commands wrapping as needed. The shell clears the
card's inline display override when opening it so CSS can choose the layout.
The desktop card continues to use its existing block layout.

These edits concern standalone layout and card visibility. The shared chart
renderer, calculations, palette and data operations were not changed in this
pass. Portable and website application artifacts were rebuilt locally.

## Verification

The expanded `standalone/verify/reflow-accessibility-check.mjs` passes against
source in Chromium, Firefox and WebKit. It checks:

- Charts, Data and Layouts at 640px and 320px, before and after focus traversal.
- Specified text spacing, dialogs, drawers and the lower chart editor.
- Overflow on the body and inner page as well as the document element; the
  document element alone missed WebKit's scrollable hidden overflow.
- Header containment and absence of horizontal or vertical frame scrolling.
- Real Tab navigation to the chart, followed by grid keys to the last row and
  column, at both widths in all three densities with text spacing applied.
- Independent grid scrolling, a visible Data toolbar and summary, and Data
  command buttons that fit without horizontal toolbar scrolling.

The updated test remains in the existing standalone feature runner. Select a
browser with `PS_REFLOW_BROWSER`; use `PS_PAGE` for a built artifact and
`PS_REFLOW_OUT` to retain screenshots. Tests use installed Playwright engines.

```sh
PS_REFLOW_BROWSER=chromium node standalone/verify/reflow-accessibility-check.mjs
PS_REFLOW_BROWSER=firefox node standalone/verify/reflow-accessibility-check.mjs
PS_REFLOW_BROWSER=webkit node standalone/verify/reflow-accessibility-check.mjs
PS_REFLOW_BROWSER=webkit PS_PAGE=standalone/dist/pandion-plots.html node standalone/verify/reflow-accessibility-check.mjs
PS_REFLOW_BROWSER=webkit PS_PAGE=website/app/index.html node standalone/verify/reflow-accessibility-check.mjs
```

The adjacent narrow-layout test was corrected to dismiss nested menus in two
steps: Escape closes the File popup, then Escape closes its containing menu
drawer. Its previous one-Escape expectation failed against the pre-change shell
as well. The test now asserts both stages; product dismissal behavior was not
changed. The desktop shell check now reads the card's computed display value
instead of requiring a particular inline declaration.

The rebuilt portable and website artifacts pass the expanded WebKit matrix.
The narrow-layout, fit-panes, bypass-accessibility and desktop M1 shell checks
also pass, including Data editing and export coverage in the latter. Both
builds, artifact parity, JavaScript syntax and changed-file whitespace checks
pass. The shared renderer's source hash still matches its minified-bundle
receipt; no renderer rebuild was needed for this shell-only change.

Completed checks, artifact hashes and log paths are recorded in the
[verification receipt](../planning/a11y-05-fixes-2026-09-10/verification.json).
The [baseline failure](../planning/a11y-05-fixes-2026-09-10/baseline-webkit.log)
and [baseline menu-test failure](../planning/a11y-05-fixes-2026-09-10/baseline-narrow.log)
are retained. Final WebKit images show the
[ordinary narrow Data view](../planning/a11y-05-fixes-2026-09-10/webkit-images/data-320.png)
and the [last cell with enlarged text spacing](../planning/a11y-05-fixes-2026-09-10/webkit-images/data-320-textspacing.png).

## Remaining acceptance

The automated runs use 640px and 320px CSS viewports, with a minimum tested
height of 640px. They do not establish behavior at every viewport height or
replace actual browser zoom, magnifier or screen-reader acceptance. The built
website artifact is exercised locally, not on a deployed production origin.

Direct Safari control was unavailable because computer-use permissions were
not granted. No administrator access or new installation was needed for these
fixes or automated runs. Actual Safari zoom, focus visibility and text-spacing
checks remain on the [browser checklist](../standalone/BROWSER-CHECKLIST.md),
along with the institution's complete assistive-technology workflows. An
installed Chrome extension does not establish Safari or VoiceOver acceptance.

A11Y-05's reproduced layout defect is remediated locally; this is not a full
WCAG conformance or Title II compliance determination. No website was deployed,
release published, or native installer built in this pass.
