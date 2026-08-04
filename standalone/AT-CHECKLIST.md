# Pandion Plots: assistive-technology validation script

The automated accessibility contracts (axe passes, ARIA grid semantics,
separator values, modal focus loops, chart summaries, reflow) are green and
run on every suite pass. What automation cannot prove is COMPREHENSION: that
a screen-reader user actually hears the right thing at the right moment.
This script is that missing half. It exists to close the manual clauses of
punch-list items APP-003, APP-004, CHART-001, DATA-001, DATA-002 and DOC-005,
and it is most of QA-001.

Plan ~40 minutes per configuration. The configurations that matter, in
order:

1. **VoiceOver + Safari, macOS** (run this first; it is on your machine)
2. **NVDA + Chrome, Windows** (free download; the most common academic AT)
3. Keyboard-only, any OS (no screen reader running) - 10 minutes

Record pass/fail per numbered step, and WHAT WAS SPOKEN when it differs
from the expectation. Wording that is technically present but confusing is
a finding, not a pass.

VoiceOver quick reference: VO = Control+Option. Start/stop: Cmd+F5.
VO+Right/Left moves; VO+Space activates; VO+A reads all.

## A. Arrival and bypass (5 min)

1. Load the app cold. The page title is spoken and names the product.
2. Press Tab once: a "skip" link is the first stop and is VISIBLE while
   focused. Activate it: focus lands in the active workspace.
3. Tab again from the top: the second stop offers the settings panel skip.
4. Walk the app header: every menu button announces its name and that it
   has a popup. Open File with the keyboard; Arrow through it; each item
   is spoken with its shortcut; Escape closes and returns focus to the
   File button. Repeat once for Help.

## B. The Data grid (10 min) - items DATA-001 / DATA-002

Load the Dose response example first, then the Data workspace.

5. Tab to the grid. It announces itself as a grid/table WITH its total
   dimensions (24 rows, plus headers, and the column count).
6. Arrow around. EACH move announces the cell's value plus its row and
   column position, and the column NAME is part of what you hear (not
   just "column 3").
7. Arrow to row 24 (hold Down). Position announcements stay correct at
   the bottom edge; no silence, no stuck focus.
8. Type over a value and press Enter: the edit is spoken; Escape from an
   edit cancels and says so.
9. Right-click (or press the context key) on a value, exclude it. The
   grid announces the excluded state when you re-visit that cell.
10. Open a project with several hundred rows if one is handy (or paste a
    tall dataset): scroll deep into it and confirm spoken row numbers
    match the visible row-number column - the virtualization must not
    desynchronize what is said from what is shown.

## C. Chart equivalence (8 min) - item CHART-001

11. Charts workspace, the sample bar chart. Tab to the chart: one stop,
    and the spoken summary identifies the chart TYPE, the variables on
    each axis, the group count, and error-bar meaning.
12. Open the Σ statistics panel. It reads as a real table: headers, then
    value cells that make sense read row-by-row (VO+Right through one
    row). Numbers are spoken with their column meaning.
13. Switch the chart to a type from another family (pie or box). The
    summary sentence changes accordingly and is re-announced on focus.
14. Break the chart on purpose (clear the roles): the needs-variables
    state is announced, and its two action buttons are reachable and
    named.
15. Hide a bar (right-click a bar, hide). The chart's spoken summary or
    the disclosure note tells the listener that data is hidden.

## D. Separators and layout (5 min) - items APP-003, layout keyboarding

16. Tab to a pane splitter. It announces: separator, orientation, its
    CURRENT size, and that arrows resize it. Press Arrow: the new value
    is spoken. Home (or double-click) resets and speaks the reset value.
17. Layouts workspace with two items. Cmd/Ctrl+A: the selection count is
    announced. Arrow: the move is announced or at least the selection
    remains (no silent loss). Add-item buttons all name themselves.

## E. Modals and the palette (7 min) - item APP-004

For EACH of: Preferences, Export, New chart, Help me choose, Keyboard
shortcuts:

18. Open it. Focus moves INTO the dialog and its title is announced.
19. Tab forward past the last control: focus wraps within the dialog,
    never escapes to the page behind. Shift+Tab wraps backward.
20. Escape closes it and focus RETURNS to the control that opened it
    (this is the one that fails most often; note the actual landing
    spot if it differs).
21. Command palette (Cmd/Ctrl+Shift+P): typing filters; the ACTIVE
    result is announced as you Arrow; Enter runs it; Escape exits with
    focus restored. The exit must be discoverable from what is spoken.

## F. The guide search (3 min) - item DOC-005

22. Open the user guide, focus its search field. Type a term with
    matches: the result COUNT is announced without your focus moving.
23. Type garbage: the no-match message is announced.
24. Arrow Down enters the results; Escape clears and returns to the
    field with prior state restored.

## G. Display-adaptation spot checks (5 min) - the rest of QA-001

25. OS zoom at 200% (or browser zoom 200%): every workspace remains
    operable, nothing overlaps illegibly, no horizontal scroll of the
    app chrome.
26. macOS Increase Contrast / Windows High Contrast: focus outlines and
    control boundaries remain visible; the chart is still readable.
27. Reduce Motion ON: no animated glides remain (chart morphs, panel
    slides); state changes still visibly complete.

---

## Recording findings

Add each failure to planning/PANDION-TITLE-II-ACCESSIBILITY-PUNCHLIST.html against
its item (the step numbers above name their items), with the exact spoken
text where relevant. When a configuration passes a section, note it in the
item's log with the date, AT, browser and OS - those notes are the evidence
base the public conformance statement (GOV-002) cites.

One honest boundary from QA-001 stands regardless of these results: the
punch list requires at least one user with relevant access needs in
launch-candidate testing, and no checklist substitutes for that.
