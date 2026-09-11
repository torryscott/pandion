# Remaining usability fixes: bar choices, UX-06, UX-07

Implemented September 9, 2026. This closes the remaining code fixes from the
September 7 audit and its bar-style accessibility follow-up. Hands-on
screen-reader and installed jamovi acceptance remain pending.

## Behavior

**Bar-style choices (UX-04 follow-up).** Orientation, Summary, and Frequencies
bar-height/layout buttons now expose their selected state with `aria-pressed`.
Stable control identities preserve focus through renderer rebuilds. Orientation
also restores focus after its immediate panel rebuild. Compare Groups,
Repeated Measures, and Frequencies retain the focused choice and scroll position
after Enter/Space and subsequent host updates. Button names and visual styles
are retained. The change does not alter statistical calculations or chart
geometry algorithms.

**UX-06: Help me choose.** Opening the guide from a pristine blank chart now
shows **Use for this chart**. Accepting either a recommendation or a starting
chart type completes that same document. Variable-guided recommendations
assign roles there too. Its ID, name, and seeded statistical preferences survive.
The explicit New chart gallery continues to create a new document.

Reuse is deliberately limited to a chart with no variable assignments in any
module, no custom options beyond the current automatic statistical defaults,
no applied style stamp, and no cached rendered snapshot. A chart with existing
configuration retains the explicit Create action. The target is checked again
when accepting; if it changed while the guide was open, the guide refreshes
its action and asks the user to review it without changing a chart.

**UX-07: application menus.** Moving over another menu still opens it. The next
click keeps that destination open; another click on the active menu closes it.
Open recent and Restore now enter their submenu on click even when hover has
already opened it. Switching submenus clears the previous expanded state.
Escape returns from a submenu to its parent item, then from the parent menu to
the menu button. The shell handles that Escape before chart capture listeners.
Outside-click dismissal and arrow-key navigation are retained.

## Verification

The new permanent regression probes are registered in the standalone runner:

- `bar-choice-accessibility-check`: actual button activation, DOM and Chromium
  accessibility-tree selected states, Enter/Space, Tab/Shift+Tab, delayed host
  echoes, focus, scroll position, and Frequencies' conditional height controls.
  The R-host mode also replaces a results element through the production
  pre-swap hook. It is registered in the shared renderer suite.
- `chooser-target-check`: reuse by question, including switching analysis family, type shortcut and variables;
  explicit creation; preservation of assignments and styles across modules;
  cancellation; changed-target handling; and seeded statistical preferences.
- `menu-pointer-check`: real mouse hover followed by click, repeated click,
  outside click, Open recent/Restore transitions, expanded states, focus,
  arrow keys, Escape, and simulated touch taps.

Focused checks pass in development and both rebuilt deliveries. Each portable
and web run passes 97 bar-choice checks, 17 chooser checks, and 33 menu checks.
The unminified renderer also passes the standalone bar probe (97 checks).
R-generated host coverage passes 103 bar-choice checks per renderer bundle.
These counts describe assertions in these probes, not exhaustive coverage.

Ten adjacent development-page probes pass: `help-me-choose-check`,
`hmc-list-check`, `wizard-parity-check`, `chart-from-selection-check`,
`menu-selection-check`, `data-menu-check`, `selection-menus-check`,
`modal-accessibility-check`, `reachability-check`, and `stats-prefs-check`.

Both required standard shared-renderer suites pass: `bash scripts/verify/run.sh`
(source, 798.5 seconds) and `bash scripts/verify/run.sh --min` (minified,
694.4 seconds), with no reported skips. These include statistical display
probes, axes and control consistency, export/hover behavior, undo/redo,
R-side input gates, stored-library handling, and snapshot/host-delivery checks.
The optional `--extras` suites and the entire standalone feature battery were
not rerun; the targeted standalone probes listed above were run.

The pinned Terser 5.49.0 minifier was available locally. Its source-hash check
passes (`f0e59f3f43252aa7784bf4e779e176a4`). Portable and web builds, website
accessibility contract, and artifact parity pass. The website's portable copy
matches the standalone download, and all eleven hosted script assets match
current source assets. Local web screenshots of the chooser and submenu at
1176 x 800 were visually inspected; labels and controls remain readable and
inside their panels.

The first R-host bar run failed because the new probe clicked the value label
covering a bar's center. The probe now clicks a visible corner of the bar using
a real pointer, without forced clicks or state injection. The initial menu
probe also exposed Escape being swallowed before reaching the submenu; the
shell's menu Escape routing fixes that behavior. Original failure logs remain
in the evidence directory.

## Evidence and remaining acceptance

- [Final receipt](../planning/ux-final-fixes-2026-09-09/verification.json)
- [Original chooser/menu observations](../planning/ux-final-fixes-2026-09-09/routing-before.json)
- [Shell change against the starting working copy](../planning/ux-final-fixes-2026-09-09/shell-change.diff)
- [Renderer change against the starting working copy](../planning/ux-final-fixes-2026-09-09/engine-change.diff)
- [Renderer suite results](../planning/ux-final-fixes-2026-09-09/engine-results.json)
- [Delivery checks](../planning/ux-final-fixes-2026-09-09/delivery-results.json)
- [Final chooser checks, including analysis switching](../planning/ux-final-fixes-2026-09-09/chooser-final-results.json)
- [Adjacent checks](../planning/ux-final-fixes-2026-09-09/adjacent-results.json)
- [Build checks](../planning/ux-final-fixes-2026-09-09/build-results.json)
- [Chooser screenshot](../planning/ux-final-fixes-2026-09-09/chooser-web.png)
- [Menu screenshot](../planning/ux-final-fixes-2026-09-09/menu-web.png)

Browser coverage here is Chromium, including its accessibility tree. R-generated
fixtures exercise the real analysis output and the renderer's results-replacement
hook; they do not replace an interactive installed-jamovi acceptance run.
On a suitable machine, complete the earlier UX-03/UX-04 acceptance checks and
verify that a screen reader announces bar choices, their selected states, and
menu/submenu exits during ordinary keyboard use. No native installer was built
or installed, and no deployment or release was published in this work.

These fixes close the listed defects with regression coverage. They do not
establish that every interaction, rendering, or statistical result is correct
for every possible input. Broader toolbar-discoverability design ideas remain
separate from this completed fix list.
