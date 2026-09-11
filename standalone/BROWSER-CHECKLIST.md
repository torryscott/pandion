# Pandion Plots: cross-browser launch checklist

Most automated browser probes in this project run Playwright Chromium;
targeted grid, modal and reflow probes also run Firefox and WebKit. These do not certify installed
Chrome, Edge, Safari, or Firefox. This is the manual pass for each supported
browser, about 15 minutes per browser. Record its exact version and the tested
artifact's checksum. Run it once on the HOSTED app and once on the
PORTABLE file (double-clicked from Finder/Explorer), because the two differ
in exactly the places browsers disagree: storage, file access, and the
clipboard.

Mark each line pass/fail. Anything that fails, note what you saw; the wording
of an error matters as much as the failure.

For required coursework, use the [classroom acceptance pack](../docs/accessibility-classroom/README.md)
alongside this browser checklist. It includes the same assignment for browser
and jamovi, a synthetic dataset and answer key, platform-specific records and
criteria for accepting a browser fallback. No human session has been accepted
in that pack yet; automated browser/host checks do not fill in those results.

## A. Boot and storage (the paths most likely to differ)

1. Open the app. The start center appears with three example datasets and
   no console errors (Safari: Develop menu > Show JavaScript Console).
2. Load the Dose response example. The chart draws.
3. Reload the tab. The project RESUMES (same chart, same data) - this is
   localStorage autosave. **Portable file on Safari is the risk case**:
   Safari has historically treated file:// storage differently.
4. Quit the browser entirely, reopen, revisit. Still resumes.
5. Preferences (Cmd/Ctrl+,) shows a storage estimate sentence, not an error.

## B. Files in

6. File > Open: pick a .csv. Preview appears, import works.
7. Open an .xlsx (any small spreadsheet). The sheet bar appears if the file
   has several sheets.
8. Open a .omv (jamovi file) if one is handy.
9. Open a .pand saved earlier. Both its documents return.
10. Paste import: copy two columns from a real spreadsheet app, New project,
    paste into the box. Columns split correctly (tab handling).

## C. Files out

11. Save project (Cmd/Ctrl+S). A .pand downloads. Reopen it: intact.
12. Export chart as SVG, PNG, and PDF. Each downloads and opens.
    For PDF accessibility acceptance, open chart, two-panel layout and Notebook
    files in the institution's supported PDF reader with its screen reader.
    Check the figure description, Unicode text, caption, page order, and
    included notes. Repeat with an older saved Notebook page. Review the
    description's meaning and supply an accessible data table for assignments
    requiring exact values. Tagged structure checks alone do not complete this
    acceptance. See [A11Y-01 validation](../docs/A11Y-01-VALIDATION.md).
    PDF is the one to eyeball: text should be selectable (vector), not a
    picture of text.
13. Export data as CSV from the Data workspace.

## D. Clipboard (the most browser-sensitive feature in the app)

14. Click the chart, press Cmd/Ctrl+C, paste into a slide or document.
    A PNG image should arrive. **Safari is the risk case**: ClipboardItem
    permissions differ. If it fails, note whether anything appeared at all.
15. In the Data grid, select a range, copy, paste into a spreadsheet.
    Cells should land as cells (TSV), not one blob.

## E. Working feel

16. Click a bar: the style panel opens. Change a color: the bar follows.
17. Drag a bar to reorder categories; drag a legend entry; drag an axis
    title. All should track the pointer without jumps.
18. View select: 50%, 100%, 150%. The chart scales; toolbar and panels
    stay normal size; export afterwards is still identical.
19. Layouts: add a chart panel and a text item, drag them around, snap
    lines appear, Cmd/Ctrl+A selects all, arrows nudge.
20. Resize the window through 900px, 640px and 320px, then return to desktop
    width. Repeat with actual browser zoom at 200% and 400%, including Safari.
    Check comfortable, compact and spacious density. Apply the text-spacing
    overrides used by the reflow probe (1.5 line height, 2em paragraph spacing,
    .12em letter spacing and .16em word spacing). Header buttons, project and
    save status, and Data commands must remain visible without sideways
    scrolling of application chrome. Tab to the chart, switch to Data and use
    Cmd/Ctrl+Down and Cmd/Ctrl+Right to reach the last cell: only the grid should
    scroll, while its toolbar and summary remain visible. Verify useful focus
    indicators, all three narrow drawers, and restoration of the desktop panels
    and resize handles after widening. Record the zoom, viewport, browser
    version and any clipping; see [A11Y-05 validation](../docs/A11Y-05-VALIDATION.md).

## F. Recovery honesty

21. With unsaved work, close the tab and reopen: the work is there.
22. Private/incognito window: the app should either work or say plainly
    that local storage is unavailable - never silently lose work.
    (Safari private windows are the strictest.)

---

Fastest triage if something fails: does it also fail in Chrome on the same
machine? If yes it is not a browser issue. If Safari-only or Firefox-only,
capture the console line and the step number.
