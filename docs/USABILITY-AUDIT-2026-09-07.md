# Usability audit — September 7, 2026

This pass found a release-relevant display defect: computed cells can show obsolete values after a source-cell edit even though the column summary has recalculated. It also found misleading repeated-measures sample-size wording, keyboard-focus and selected-state problems in chart controls, and clipped layout actions in narrow windows. The underlying workflows have several strengths worth preserving, especially formula previews, setting search, filter disclosure, and Notebook provenance.

This is an evaluation and proposed work list. No application source, renderer, or build was changed. Findings below distinguish reproduced behavior from design judgments. The priorities are usability priorities, not claims that the numerical-validation matrix failed.

**Implementation follow-up:** The first authorized fix batch addresses UX-01
and the repeated-measures portion of UX-02. See the separate
[fix and validation receipt](USABILITY-FIXES-2026-09-07.md) for changes,
regression evidence, and remaining scope. The findings and evidence below
describe the original audit, before those fixes.

The September 9 follow-up implements UX-03's keyboard-focus fixes. See
[UX-03 validation](UX-03-VALIDATION.md) for the tested controls and the
remaining interactive jamovi acceptance check. A further September 9 fix
adds accessible selected states to UX-04's error-bar Type and Method choices.
See [UX-04 validation](UX-04-VALIDATION.md) for automated coverage, pending
screen-reader acceptance, and the related bar-style control follow-up.
The next September 9 follow-up fixes UX-05's clipped layout actions by
allowing individual commands to wrap. See [UX-05 validation](UX-05-VALIDATION.md)
for narrow-window, keyboard, pane-resizing, and delivery checks. The final
September 9 follow-up implements UX-06, UX-07, and the bar-style accessibility
follow-up. See [final usability validation](UX-FINAL-VALIDATION.md) for reuse,
menu behavior, regression evidence, and pending hands-on acceptance. All
listed code fixes are implemented; installed jamovi and screen-reader
acceptance remain pending. The findings below retain the original audit evidence.

## Scope and evidence

The current bundled standalone build was served locally on a dedicated origin and exercised through ordinary browser UI with entirely synthetic data. The shared chart engine was assessed inside that standalone host. This was not an installed jamovi, Windows, macOS desktop-wrapper, Safari, Firefox, or screen-reader acceptance run.

Viewports: 1176 × 1261, 1366 × 768, and 900 × 700 CSS pixels. The narrow-window check retained the default 205-pixel project rail and 330-pixel settings panel. The viewport override was reset and the temporary browser tab closed afterward.

- [Synthetic starting data](/Users/tsdennis/Desktop/plotstudio/planning/usability-audit-2026-09-07/fixture.tsv)
- [Source and delivery hashes at audit start](/Users/tsdennis/Desktop/plotstudio/planning/usability-audit-2026-09-07/input-hashes.json)
- [Verification receipt](/Users/tsdennis/Desktop/plotstudio/planning/usability-audit-2026-09-07/verification.json)
- [Evidence directory](/Users/tsdennis/Desktop/plotstudio/planning/usability-audit-2026-09-07)

The walkthrough covered paste/import preview, first-chart guidance, variable assignment, direct chart editing, error-bar controls, statistics navigation, setting search, export setup, computed-column creation and typo recovery, source-cell edits, undo, filters, Notebook capture/update, layout composition, repeated-measures setup, local reload recovery, and recent-project recovery. It sampled representative journeys; it did not exercise every option in all seven chart families.

## Prioritized findings

| ID | Priority | Finding | Evidence strength |
|---|---|---|---|
| UX-01 | High — fix before broader release | Computed grid cells remain visibly stale after editing their inputs | Reproduced with Enter and Tab; source path supports cause |
| UX-02 | High — fix before broader release | Repeated measurements are counted as “cases” | Reproduced; status-bar summation confirmed in source |
| UX-03 | Medium | Changing error-bar type loses keyboard position | Reproduced by keyboard activation |
| UX-04 | Medium | Error-bar choices expose no selected state to accessibility APIs | DOM inspection and source confirmation |
| UX-05 | Medium | Layout actions extend underneath the settings panel at narrow widths | Screenshot and DOM geometry |
| UX-06 | Low | The chart helper adds a second document when invoked from an unfinished chart | Reproduced; intentional create action, awkward entry-point behavior |
| UX-07 | Low | Clicking between open application menus can immediately close the destination | Observed; hover/click interaction supported by source |

### UX-01 — The computed value on screen can contradict the data summary

**Reproduce:** Paste the fixture, open Data → Add computed column, name it `Change`, and enter `After - Before`. Initially row 1 is `13 - 12 = 1`. Edit row 1 of `After` to `15` and commit with Enter. Cancel the next cell editor, then select the `Change` column.

**Observed:** The source cell shows 15, but the computed cell still displays 1. The column-selection summary already reports sum 27 and mean 3.375, which incorporate the correct new value of 3. The inspector reports mean 3.38. The mismatch persists after waiting and selecting the column. Leaving Data and returning refreshes the cell to 3.

The same pattern occurred when changing row 2 of `After` from 14 to 16 and committing with Tab: its computed cell remained -1 instead of 1. Data Undo recovered that edit and repainted the grid correctly.

**Impact:** A user checking a transformation sees apparently incorrect arithmetic and inconsistent numbers in the same workspace. Reading or transcribing the visible cell can produce an incorrect result even if downstream calculations use updated data. This directly undermines the intended confidence in data handling.

**Diagnosis:** `gridCommitEdit()` calls `retype(t)`, which recalculates formulas, but then calls `gridPaintCell()` only for the edited source cell. Its subsequent updates do not repaint the dependent grid cells in this route. See [cell-edit commit](/Users/tsdennis/Desktop/plotstudio/standalone/js/ps-shell.js:15113) and [formula recalculation](/Users/tsdennis/Desktop/plotstudio/standalone/js/ps-shell.js:2862).

The evidence supports a stale-view defect. This pass did not establish corruption of stored data or incorrect formula arithmetic, and did not test clipboard/file export while the grid was stale.

**Proposed fix:** Refresh visible dependent cells after recalculation while preserving the next editor, selection, scroll position, and focus. Account for formulas such as column means or z-scores where one edit can change many rows, not just the source row.

**Acceptance:** Commit by Enter, Tab, and clicking away; check a simple difference, a dependent formula chain, and a whole-column formula. Visible cells, accessibility names, selection summaries, chart results, copied values, and saved/reopened data must agree without changing workspace. Undo/redo must preserve that agreement and keyboard navigation.

Evidence: [contradictory grid and summary](/Users/tsdennis/Desktop/plotstudio/planning/usability-audit-2026-09-07/17-computed-grid-summary-mismatch.png), [accessibility tree](/Users/tsdennis/Desktop/plotstudio/planning/usability-audit-2026-09-07/17-computed-grid-summary-mismatch.txt), [after reopening Data](/Users/tsdennis/Desktop/plotstudio/planning/usability-audit-2026-09-07/18-computed-grid-after-reopen.png), [Tab reproduction](/Users/tsdennis/Desktop/plotstudio/planning/usability-audit-2026-09-07/19-computed-tab-reproduction.txt).

### UX-02 — “16 cases” means 16 measurements from 8 cases

**Reproduce:** With the original eight-row fixture, choose Repeated Measures and assign `Before`, then `After`.

**Observed:** The status bar says `16 cases · 2 conditions`. The data contain eight participants, each measured twice. The paired t-test shows seven degrees of freedom, consistent with eight complete pairs. The status function sums each plotted cell's `n`, then universally calls that total “cases.” See [chartCaseText](/Users/tsdennis/Desktop/plotstudio/standalone/js/ps-shell.js:25414).

**Impact:** The status bar can be read as an independent sample size, especially because setup describes repeated measurements from the same cases. The concern here is the meaning of the displayed number; the observed paired-test degrees of freedom did not show doubled sample size.

**Proposed fix:** Distinguish cases, measurements, and analysis-specific complete pairs. For this fixture, a clear label would be `8 cases · 2 conditions · 16 measurements`. Do not obtain the subject count by dividing the sum when missingness or grouping makes that unreliable. Review the same generic status function for other analyses with several contributions per respondent, including multi-item survey charts.

**Acceptance:** Check complete and incomplete repeated measurements, groups, and panels. Label the counted unit explicitly; disclose when the test uses fewer complete pairs than the available chart measurements.

Evidence: [status bar](/Users/tsdennis/Desktop/plotstudio/planning/usability-audit-2026-09-07/14-repeated-measures-case-count.png), [paired test and status together](/Users/tsdennis/Desktop/plotstudio/planning/usability-audit-2026-09-07/14-repeated-measures-case-count.txt).

### UX-03 — A discrete chart change sends keyboard navigation back to the beginning

**Reproduce:** On the Compare Groups bar chart, open Error bars for a selected bar. Activate a different error-bar type using Enter, such as switching 95% CI to SE. After the chart updates, press Tab.

**Observed:** Focus falls to the document root during the rebuild. The next Tab lands on `Skip to chart`, rather than the next control in the error-bar panel. The chart change succeeds, but the user must find the settings again. Changing a filter's variable also lost focus in this pass. Editing an axis-title textbox and tabbing to Clear override worked correctly, so this is not a universal input failure.

**Proposed fix:** Preserve the logical focused control across rebuilding, with a meaningful fallback if that control disappears. Check the shared renderer's asynchronous host echo as well as its local preview. The error-type route calls `_gb2RerenderSoon()` after the change: [error-bar wiring](/Users/tsdennis/Desktop/plotstudio/inst/widget/graphbuilder2.js:64958).

**Acceptance:** Keyboard users can change successive settings without leaving the panel, losing their viewport position, or unexpectedly restarting the tab sequence. Verify in standalone and an actual jamovi host after the fix.

Evidence: [keyboard focus receipt](/Users/tsdennis/Desktop/plotstudio/planning/usability-audit-2026-09-07/04-setting-keyboard-focus.txt).

### UX-04 — The error-bar selector communicates its current choice only visually

**Observed:** SE/SD/CI choices are buttons with blue styling for the active selection, but no `aria-pressed` state. The accessibility tree does not identify the selected type. The inspected 95% CI button returned no `aria-pressed` attribute. Both button generation and repainting apply styles without equivalent selection semantics: [choice generation](/Users/tsdennis/Desktop/plotstudio/inst/widget/graphbuilder2.js:64701), [choice repaint](/Users/tsdennis/Desktop/plotstudio/inst/widget/graphbuilder2.js:64958).

**Proposed fix:** Use a correctly implemented single-selection control, or expose current pressed state consistently. Review other segmented controls built by the same pattern without assuming all controls have the defect; many standalone toggles already expose state.

**Acceptance:** A user accessing the control through assistive technology can determine the current type and hear its changed state. Perform an actual screen-reader check; an accessibility-tree inspection alone is not that check.

### UX-05 — Layout actions are visually clipped at 900 pixels

**Reproduce:** Open a layout at 900 × 700 with the default side-panel widths.

**Observed:** The layout toolbar is about 327 pixels wide but has about 546 pixels of horizontal content. Its Add chart/Add text/From Notebook/Panel label/Add image group stays on one line. Panel label and Add image extend beyond the workspace's right edge under the settings area. The toolbar's outer row wraps, but the inner action group does not: [layout CSS](/Users/tsdennis/Desktop/plotstudio/standalone/index.html:940).

The chart toolbar behaves differently: it intentionally scrolls horizontally and has a fading edge cue. At 900 pixels, Settings, Find, Add, and zoom are outside the initially visible strip. That is a discoverability tradeoff, not evidence those chart controls are absent.

**Proposed fix:** Let layout actions wrap inside their group or provide an explicit accessible overflow menu. For the shared chart toolbar, keep the documented single-row design and consider a labeled overflow button or visible scroll arrows; do not silently reverse the existing one-row preference. Side-panel collapse could be a separately reviewed improvement.

**Acceptance:** At 900, 1024, 1176, and 1366 pixels, every action is visibly available or behind an obvious named control. Check mouse, keyboard, and resized panels. Opening a hidden action through keyboard navigation must bring it into view.

Evidence: [layout at 900](/Users/tsdennis/Desktop/plotstudio/planning/usability-audit-2026-09-07/12-layout-900.png), [chart at 900](/Users/tsdennis/Desktop/plotstudio/planning/usability-audit-2026-09-07/13-chart-toolbar-900.png).

### UX-06 — Help from an unfinished chart creates another unfinished chart

**Reproduce:** Import data, open `Not sure? Help me choose` from blank Chart 1, choose the group-comparison route, then click `Create Compare Groups chart`.

**Observed:** Chart 2 is created and Chart 1 remains blank. Focus correctly moves to the new chart's variable picker. The button is accurately labeled “Create”; the friction is the helper's entry point inside a chart that the user was trying to finish. [Recommendation handler](/Users/tsdennis/Desktop/plotstudio/standalone/js/ps-shell.js:18367).

**Proposed fix:** When the helper was launched from a pristine chart, offer `Use for this chart`; retain explicit new-chart creation elsewhere. Preserve any existing setup or styling unless the user chooses to replace it.

**Acceptance:** Completing the helper from a pristine blank chart leaves one useful chart; entering through New chart still creates a new document. The next action is variable assignment in either case.

Evidence: [duplicate blank chart after helper](/Users/tsdennis/Desktop/plotstudio/planning/usability-audit-2026-09-07/01-wizard-new-blank-chart.png).

### UX-07 — Hover-opening and click-toggling menus interfere

**Observed:** With Insert open, clicking Data closed the menu; clicking Data again opened it. A click on Open recent similarly left the submenu collapsed, while Right Arrow opened it correctly.

**Likely cause:** Moving the pointer to the destination menu opens it on `mouseenter`; the subsequent click sees it as the current owner and toggles it closed. This interaction is visible in the [menu handlers](/Users/tsdennis/Desktop/plotstudio/standalone/js/ps-shell.js:29770). Recheck with a human mouse in the target browsers before broadening the claim beyond this browser run.

**Proposed fix / acceptance:** A deliberate click on another top-level menu should leave that destination open. Preserve hover switching and keyboard navigation. Check submenu clicks as part of the same work.

## Design pressure points to review with users

These are observed interface arrangements and proposed improvements, not measured rates of user failure.

1. **Promote the path from a finished chart to reuse.** Keeping a whole chart starts in its context menu. The empty Notebook teaches that gesture, and a successful keep offers an Open action, but the chart toolbar offers no visible Keep action. Consider a compact chart-actions menu with Keep to Notebook, Send to layout, Copy image, and Export. Layouts already show clear Add chart and From Notebook routes.
2. **Make computed-variable creation easier to discover.** The Data toolbar prominently offers Add row; More data commands does not contain Add computed column. That command is in the application Data menu. A visible Add variable menu could group plain and computed columns without making the main toolbar noisy. Focus the name/formula on entry and select the new column after saving.
3. **Retain useful words when compressing the chart toolbar.** At both 1176 and 1366 pixels the familiar text labels for Statistics, Settings, Find, and Add disappear. Tooltips and accessible names are present, and setting search works very well once found. Prioritize the labels novices need most or expose them through a named menu. [1176-pixel screenshot](/Users/tsdennis/Desktop/plotstudio/planning/usability-audit-2026-09-07/02-chart-toolbar-1176.png).
4. **Unify terminology and scope at decision points.** The helper uses X (categories), Y (values), and Group By; the live sidebar uses Category axis, Value axis, and Color / group. Use the destination's terms in the guidance. An Error bars inspector reached through Control also contains chart-wide Type settings; the existing “Applies to the whole chart” text is useful, but placing the scope next to the setting would make the consequence clearer.
5. **Distinguish unchecked Notebook sources in the navigator.** A later edit to another chart invalidated the freshness check. The inspector honestly said “not checked since the last edit” and offered Open source chart, which restored the changed verdict. The navigator's changed badge disappeared during that unchecked state, however. A separate unchecked marker would distinguish it from a verified unchanged source. [Unchecked state](/Users/tsdennis/Desktop/plotstudio/planning/usability-audit-2026-09-07/15-notebook-unchecked-status.png).

## Successful behavior to preserve

| Journey | What worked in this pass |
|---|---|
| First import | Paste route, type preview, row/column count, and explicit Import data action were understandable. |
| Variable assignment | Compatible-variable pickers explained required roles and guided the user to the next missing variable. Repeated-measures selection explicitly explained collection order. |
| Direct chart editing | Clicking chart parts opened appropriate controls. Freshly opening the title inspector scrolled its fields into view at 1366 × 768. Editing the title maintained useful keyboard focus. |
| Setting search | Cmd+F → “font” → Enter opened Appearance and focused Font family, with an announcement. This is an effective alternative route through a large editor. |
| Formula typo recovery | `After - Befor` suggested `Before`. Correcting it showed source columns and the first three computed values before Save variable. |
| Filters | The filter dialog explained that rows remain in the grid but leave charts/statistics. The chart visibly included `Filter: Site = "North" · showing 4 of 8 rows` in its figure note. |
| Notebook history | Source changes were disclosed. Keep an updated copy created a second page and preserved the original, with an undo action. |
| Layout meaning | The inspector distinguished a live chart following Chart 2 from a Notebook snapshot. Adding a panel grew the page with an explanatory message. Enter opened exact positioning fields. Text could be added and edited directly. |
| Undo and project recovery | Data Undo recovered a cell edit. Reload restored the chart and overridden axis title. After New project, Recent projects restored the eight-row dataset, computed column, two chart documents, two Notebook pages, and layout. |
| Export setup | Format, raster dimensions, DPI, background, caption/provenance, and image-description guidance were explicit. Actual file delivery was not completed in this environment. |

Selected supporting views: [formula validation](/Users/tsdennis/Desktop/plotstudio/planning/usability-audit-2026-09-07/07-formula-validation.png), [filter note](/Users/tsdennis/Desktop/plotstudio/planning/usability-audit-2026-09-07/08-filtered-chart.png), [updated Notebook copy](/Users/tsdennis/Desktop/plotstudio/planning/usability-audit-2026-09-07/10-notebook-updated-copy.png), [export setup](/Users/tsdennis/Desktop/plotstudio/planning/usability-audit-2026-09-07/06-export-dialog.png), [recent-project recovery receipt](/Users/tsdennis/Desktop/plotstudio/planning/usability-audit-2026-09-07/21-recent-project-restored.txt).

## Recommended implementation and follow-up order

1. Fix UX-01 and UX-02 first. Add focused user-path regression checks that assert visible values and sample-size meaning. For UX-01, checking the formula model alone would miss the reproduced defect.
2. Fix keyboard focus and selected-state semantics together, then layout overflow. Validate the real shared renderer in both standalone and jamovi after any renderer change; follow the repository's source/minified delivery checks.
3. Review the helper's entry-point behavior and the menus. Make the discoverability changes as a small coherent pass after agreeing which actions should be prominent.
4. Run short observed sessions with a few people who did not build the application: import unfamiliar data, choose a chart, compute a change score, correct an input, change intervals, keep a figure, assemble a layout, and recover a previous project. Record wrong turns, requests for help, time to recover, and mistaken beliefs about scope or sample size. Retest revised routes with fresh users.
5. Complete the platform acceptance routes below before treating this as broad usability coverage.

## Limits and outstanding acceptance coverage

No formal participant study, timing benchmark, color-contrast sweep, 200% zoom audit, or screen-reader session was performed. Native jamovi integration, installation/update/uninstall, touch interaction, large-project performance, very wide spreadsheets, and all seven analysis families need their own representative journeys. Reshape-to-wide and destructive variable-type changes were located but not exercised here.

The PNG export attempt reached “Choose where to save Chart 2.png…” and the browser's native save-picker boundary. This automation environment does not permit control of that host application's native UI. The page was reloaded to resume the audit. File delivery, native picker cancellation, download fallback, file save-as/overwrite, and `.pand` reopening from disk remain unverified in this pass. Local autosave/recent-project recovery was exercised separately and must not be described as file-save verification.

Use the existing [browser checklist](/Users/tsdennis/Desktop/plotstudio/standalone/BROWSER-CHECKLIST.md) and [assistive-technology checklist](/Users/tsdennis/Desktop/plotstudio/standalone/AT-CHECKLIST.md) for that coverage. The findings in this report should be resolved and the affected journeys rerun; this audit does not certify universal numerical or usability correctness.
