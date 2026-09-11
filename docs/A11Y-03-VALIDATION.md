# A11Y-03: Focus-scoped chart Help shortcut

September 9, 2026. Pandion Plots 3.1.1 working copy.

## Change

The shared renderer's document-level `?` handler now requires both the event
target and actual keyboard focus to be inside its chart host. Focus on a chart,
its toolbar or its non-editable inspector controls can activate Help; focus in
the standalone shell, another results control, the Data workspace or an export
dialog cannot. Native input, textarea, select and contenteditable handling is
preserved. Composition events (including key code 229), Ctrl/Alt/Meta combinations
and events already handled elsewhere are ignored.

The explicit Help routes remain available. The chart's Help panel and the
standalone shortcut sheet now explain that `?` applies while the chart is
focused. The source edit was one atomic replacement pass, preserving the
pre-existing worktree changes, then the pinned minifier regenerated the shipped
renderer. Portable and website applications were rebuilt locally.

This implements the focus-scoping option described by
[WCAG 2.1 SC 2.1.4](https://www.w3.org/WAI/WCAG21/Understanding/character-key-shortcuts.html).
It does not establish whole-application conformance or certify speech-input
behavior without a real assistive-technology trial.

## Regression coverage

`standalone/verify/character-shortcut-check.mjs` failed against the original
source when `?` on Open opened Help. Its positive/negative cases cover:

- Outside focus neither opens Help nor closes an already open Help panel.
- Chart focus opens and closes Help once, including physical Shift+Slash.
- Native input, textarea, contenteditable and select controls inside the host
  retain their own character input; fixture controls isolate the shared handler
  from individual editors' input validation.
- Synthetic composition, modified, defaultPrevented and stale-target events
  exercise the corresponding guard conditions.
- Real standalone export controls and the Data grid do not activate Help;
  returning to Charts does not reveal an accidentally opened panel.
- Explicit Help routes, the updated visible instructions, and shortcut use
  while a Help-panel button has focus continue to work.
- A renderer rebuild retains the focus restriction and a single toggle per key.

The test runs through source and minified standalone code, the portable and
website builds, source/minified R-generated jamovi HTML, Firefox and WebKit.
The R fixture comes from `scripts/verify/render.R` (`cg_bar_labels.html`), with
an adjacent harness control representing focus outside the chart. This is a
real R-generated result in a browser, not an installed jamovi acceptance test.

The check is wired into the standalone feature runner and both shared-bundle
verification runs. Both complete standard shared-bundle suites passed, including
the 50 rendered fixtures and the existing statistics, keyboard, persistence and
export probes. Neither run skipped a stage; the optional `--extras` group was
not run. Both logs retain the existing weak hover assertion for the
most-overlapped pie slice, so that case is not strong hover-activation evidence.

The existing standalone Help, modal and grid accessibility probes also passed.
The Help probe now requires chart focus and checks the updated shortcut-sheet
wording. A separate run verified the new test's `GB2_NODE_BASE` dependency
resolution without `NODE_PATH`. Build parity, syntax and whitespace checks
passed. See the [verification receipt](../planning/a11y-03-fixes-2026-09-09/verification.json)
for completed checks and final file hashes; [baseline failure](../planning/a11y-03-fixes-2026-09-09/baseline.log)
records the original defect.

```sh
node standalone/verify/character-shortcut-check.mjs
PS_SHORTCUT_SOURCE=inst/widget/graphbuilder2.js node standalone/verify/character-shortcut-check.mjs
PS_PAGE=standalone/dist/pandion-plots.html node standalone/verify/character-shortcut-check.mjs
GB2_SHORTCUT_HOST_DIR=/path/to/rendered-fixtures node standalone/verify/character-shortcut-check.mjs
PS_SHORTCUT_BROWSER=firefox node standalone/verify/character-shortcut-check.mjs
PS_SHORTCUT_BROWSER=webkit node standalone/verify/character-shortcut-check.mjs
```

## Remaining acceptance and A11Y-04 discussion

Installed jamovi/Electron and actual speech-input testing remain manual
acceptance steps. No installer was installed or packaged and no website was
published during this change.

A11Y-04 was reviewed for explanation only. The confirmed findings concern the
retained landing-page prototypes `website/v2.html` and `website/v3.html`. If
they are unused, move them outside the deployment directory or otherwise exclude
them from published assets. Their current `noindex` headers do not make them
inaccessible by URL. If retained publicly, adjust v2's gold headings, download
fine print and footer/link colors (including narrow layouts), and v3's pale
download notes and muted feature text. Scan the resulting intended public
inventory at desktop and narrow widths. A local preview artifact should also
stay outside deployment, including manual folder uploads.

This does not require a chart-palette change or a main-site redesign. Live
prototype availability remains unconfirmed: the web retrieval tool could not
open the site's URLs in this session. No A11Y-04 files were changed.
