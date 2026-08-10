# Pandion Plots Standalone

Browser-only Pandion Plots: the full graphbuilder2 editing experience with no
jamovi and no R at runtime. One engine, two shells - the jamovi module is
untouched; this shell shares the SAME committed bundle
(`inst/widget/graphbuilder2.min.js`). Build brief: `../planning/STANDALONE-BRIEF.md`.

## Status

- SWEEP FIXES DONE (Jul 25 2026): first pass on the audit in
  `../planning/STANDALONE-SWEEP-JUL25.md` (125-item checklist in
  `../planning/STANDALONE-PUNCHLIST.html`, which is self-marking: items carry `d:1`
  plus a note, and a manual untick stores an explicit 0 so it beats the file
  default). FORTY-FIVE fixed, ONE rejected. THE BUG TIER (B1-B24) IS CLEAR.
  * PROJECT SAFETY + CHROME (items 12, 13, 15, 16): all four
    project-replacing paths now capture the outgoing project and offer it back
    (the B18 pattern), gated so it never fires on a project with no work in it
    or one that already has a file copy. The recovery ladder stops switching
    itself off in silence, and reclaims ~1.7 MB by declaring
    __gb2_bundleBytes - the engine's measurement always misses here because
    the standalone never stores the bundle in localStorage, so it reserves
    2.7 MB for a bundle that is not there. A storage listener notices a second
    tab taking the autosave slot. Right-click gives a contextual app menu
    everywhere it used to give "View page source", except text fields, where
    the browser's menu is genuinely the better one.
  * GRID KEYBOARD (item 11): arrows, Shift-extend, Cmd/Ctrl+arrow to the
    edges, Home/End, PageUp/Down, Cmd/Ctrl+A, Enter/F2, and type-over, on the
    anchor/focus model that already existed. The real blocker was a layer
    deeper than the item said: a cell click opens the EDITOR and clears the
    selection, so nothing ever left a cell merely CURRENT and there was no
    cursor to navigate from. Leaving an editor now seats one. PARKED for
    Torry: whether a single click should select rather than edit.
  * BUSY STATES (item 9), shaped by Torry's "never flash on instant work":
    cold boot is MARKUP (on screen at first paint, removed when the app is
    wired, since the delay is the whole point and cannot be gated); a large
    import paints first via double rAF because the parse is synchronous and a
    timer can never fire mid-loop; everything else is delay-gated at 400ms and
    on this machine correctly shows nothing. Export stays the template.
  * EXPORT HONESTY (B7, B21, B22): the row-filter sentence moved from the
    engine's dismissible HTML pill into chartNote, which lives INSIDE the svg,
    so it rides every export, every layout snapshot and copy-as-image (the
    caption block would have covered chart exports only). The engine's own
    export button is visible again with its click intercepted to the shell
    exporter, which makes its Basics help sentence true. The snapshot ensure
    pass verifies each capture, retries once, and records the ones that never
    take so the export refusal stops offering a dead end.
  * B23 AND B24 REPRODUCED, then fixed. Both were filed from code reading and
    NOT reproduced. B23 turned out to be made DETERMINISTIC by this session's
    own B12 fix: flushing before capturing stamped a fresh revision onto a
    pre-edit picture that never healed, so a layout drew and exported a figure
    disagreeing with its chart. Fix is pure ordering. B24 reproduced on the
    THIRD attempt, with a layout holding two other charts so the ensure pass
    genuinely runs: a late engine commit landed on the last chart the pass
    visited offscreen instead of the one being edited.
  * PER-DOCUMENT ENGINE STATE (B3): one engine, one fixed localStorage key,
    and switchChart never partitioned it - style A, switch to B, Cmd+Z, and
    A's old value landed on B. The engine calls this a known trade-off because
    jamovi exposes no stable per-analysis id; the standalone HAS one, so the
    shell swaps graphbuilder2.undo.v2 / .inspector.v1 to the document about to
    render and parks per-document copies. Writes the EMPTY payload rather than
    removing the key: _undoRestore early-returns on a missing value, which
    would leave the previous document's in-memory stack live.
  * ERROR BOUNDARY (B8): only the engine's render() call was wrapped, so a
    throw anywhere in buildPayload or the aggregation path left the state
    committed and persisted with a blank host - and reloading replayed the
    same options, making it a permanent wedge. One recovery card now covers
    the whole path (chart and layout), explains the failure, and offers the
    reset that clears the offending options. window.onerror and
    unhandledrejection exist at last, throttled.
  * FORMULA CYCLES (B10): compile FIRST, topologically sort by refs, evaluate
    dependencies first, and refuse cycles with the error the fx badge already
    renders. Mutual references used to compile clean and drift silently; a
    forward reference read one edit behind forever.
  * CORRECTNESS (B5, B6, B9, B11, B12): silently wrong output. An order
    comparison on a text column failed EVERY row, so retyping a filtered
    column to Nominal blanked every chart in the project - inapplicable
    conditions are now pass-through and say so. Rows dropped because the
    filter column was MISSING are counted and disclosed separately instead of
    being attributed to the threshold. An unmapped .omv measureType fell
    through to continuous and every text label read as missing under a clean
    success report; dataType now decides and the guesses are named. The
    scatter overlay fingerprint was a column SUM, blind to the compensating
    edit a student makes fixing a typo; it is an order-sensitive hash now.
    And B12's premise needed correcting: the engine DOES flush on pagehide,
    but _flushOpts opens with a 700ms interaction guard that defers via
    setTimeout, which never runs during unload - the shell now drains
    __gb2_pendingOpts itself, bypassing the guard.
  * LAYOUT DRAG CANCEL (B4): Escape cleared the SELECTION and repainted from
    already-mutated coordinates without touching LAY_DRAG, so the item stayed
    where the cursor put it and kept following the mouse. layCancelDrag()
    restores the pre-gesture geometry from the origins already captured at
    pointer-down. A live drag now outranks the selection.
  * IMPORT DISCLOSURE (B19, B20): one resolveHeader() serves both the preview
    and buildTable, so the preview shows the names the table will actually
    carry, and renames are reported rather than performed silently. The worse
    half: .omv types and levels are keyed by the ORIGINAL field name while the
    lookup used the DEDUPED one, so a duplicate-named jamovi factor arrived
    with an inferred type and first-seen levels. Blank rows dropped at parse
    time are now counted and disclosed.
  * PRINT + EXIT (t1-14): Cmd/Ctrl+P opens the exporter on vector PDF instead
    of printing one clipped viewport of app chrome; @media print covers File >
    Print. The beforeunload guard is CONDITIONAL - work normally survives in
    the autosave, so it fires only when autosave is actually failing.
  * FIRST SCREEN (t4-08, t4-07, t4-21, t4-10): the start centre can now be
    dismissed on a cold load (close button, backdrop, ungated Escape); the
    privacy promise the site leads with is stated in the start centre, the
    loader and About; navigator.storage.persist() is requested at boot and
    reported in Diagnostics; and the three PROSE em dashes became middle dots
    (the four missing-value glyphs that convention 19 mandates were left).
  * SILENT FAILURES (B13-B18): the app failing without saying so. The toast is
    now a STACK, because one node with one timer meant any announcement
    landing inside a pending Undo's six seconds destroyed the offer (B17) -
    and item 7 had just added a sixth source of offers. Two empty catch
    blocks now report: a blocked project download, which on the Safari and
    Firefox path was indistinguishable from a save (B15), and a quota-full
    style/palette write, which left the card in the UI and lost it on reload
    (B16). The save chip stops claiming "Modified - autosaved" once a .pand
    has ever been saved and autosave is dead (B13). The snapshot carries
    savedAt at last, and a lucky write no longer erases the evidence that
    saves had been failing (B14). Opening a Recent over never-saved work is
    reversible from the toast (B18) - the house answer, since the app
    deliberately has no confirm() anywhere.
  * LAYOUT HISTORY (item 7): per layout DOCUMENT (several figures can be open;
    one shared stack would undo into the wrong one), cap 40. Every mutator
    snapshots first; pointer drags capture at pointer-down and only commit if
    the gesture moved something; arrow nudges coalesce into one step per
    burst. `view` (zoom/grid/snap) is deliberately NOT in the snapshot: it is
    a display preference, and folding it in would make undoing a delete also
    switch the grid back on. The undo-key ROUTER now claims Cmd/Ctrl+Z for
    Layout, and the Edit menu label follows the same scope resolver, so menu,
    key and the new toolbar buttons all name and drive one history. History
    clears on project load: layout ids are not project-unique.
  * IMPORT ERRORS (item 10): parse failures publish a REASON on a side channel
    so no caller's return contract changes; a dropped PNG/PDF/.sav is refused
    by name from the extension with a U+FFFD-density backstop for unlabelled
    binaries; all four FileReaders gained onerror. Found in passing and worse
    than the reported bug: openLoader() resets the import preview and the
    reset CLEARS the message line, so the long-standing set-then-open order
    WIPED every "could not read" message - .omv, Excel and damaged-project
    failures were all opening a blank loader. One showLoaderMessage() helper
    owns the order now.
  * FONT SHORTHAND (the big one): 22 rules used `font: <size> inherit`, which
    is invalid CSS - `inherit` is legal only as the WHOLE value - so the
    browser dropped each declaration and 51 of 67 visible controls rendered in
    the UA default (Arial 13.33px) instead of the system stack at 11.5-12px.
    Fix: one `button, input, select, textarea { font-family: inherit }` reset
    plus longhands. font-family ONLY on purpose: a full `font: inherit` drags
    body's inherited 16px onto every control that sets no size.
  * CHROME ANCHOR (item 25), app bar ONLY per Torry, status bar stays light.
    The wing's fills are now `var(--ps-wing-upper/-under)` with the ORIGINAL
    colours as fallbacks - `<use>` renders into a shadow tree that ordinary
    CSS cannot reach, so custom properties are the only lever. Focus ring
    inside the bar is #8fb8e8 (#3573bd is unreadable on navy) and the item-29
    press state is overridden there or it flashes white.
  * PRESS STATES (item 29): generalised the two that already existed rather
    than inventing one. Background only, so a control keeps its hover border.
    90ms; `body.ps-reduce-motion` already collapses it, no new plumbing.
  * MANIFEST (item 41) + icons rasterised from the wing via Playwright
    (`qlmanage` ignores the viewBox). Chrome needs HTTPS + 192 + 512, so this
    only helps the hosted copy; `website/build.sh` copies the manifest and
    icons into `app/` because the link is relative.
  * B1 + B2, the layout snapshot pair. Snapshots are REVISION-KEYED so
    invalidation is structural, not a hand-maintained list of resets, and
    `ensureSnapshotsThen` now skips only VALID snapshots. Export refuses and
    names the panels it cannot draw instead of dropping them silently.
  * ITEM 1 was bigger than filed: `openLoader()` has SEVEN entry points and on
    a cold load ALL rendered under the start centre, including three error
    messages. `hideWelcome()` at the top of `openLoader()` closes all of them.
  * ITEM 8 (Reset styling) now offers an undo toast, matching `closeChart`;
    ITEM 6 exports CSV from `t.raw`, so zero-padded ids survive - the export
    is MORE faithful than the grid, which still shows 007 as 7 (item 18c).
  * REGRESSION SHIPPED AND FIXED, worth reading: keying snapshots on
    PROJECT_REV was too coarse (it bumps on layout-only state like zoom) and
    `renderLayout()` has no ensure pass, so changing the zoom BLANKED every
    panel until an unrelated render healed it. Now `SNAP_EPOCH`, bumped only
    in `retype()` (all data + all load paths) and `window.setOption` (chart
    options). Monotonic, which also closed a hole the audit found: PROJECT_REV
    resets to 0 on load and chart ids are not project-unique, so a previous
    project's snapshots passed validation in the new one.
  * ITEM 28 REJECTED after measurement, do not retry blind. Raising the echo
    delay past the engine's 250ms morph changed nothing (bars still animate at
    90/170/250ms with it at 120ms); the teardown at ~60ms is the ENGINE's own
    local re-render. The other half - suppressing
    `__gb2_authoritativeRender` for style commits - is UNSAFE: it also gates
    release of `__gb2_recentCommits` pins (graphbuilder2.js:3085). The delay
    is now a named `ECHO_MS` carrying that note.
  * NEW BUGS B22-B24 from the snapshot audit: `ensureSnapshotsThen` never
    checks a capture succeeded (code-confirmed); `switchChart` captures
    without re-rendering; the ensure pass repoints `LAST_CHART_ID`. The last
    two are REPORTED BUT UNREPRODUCED - I tried B24 twice and failed. Do not
    treat that as absence: the layout-blanking regression also took three
    attempts to reproduce.
  * ITEM 5 (Shapiro-Wilk) PORTED, not suppressed: `ps-stat.js` gained Royston
    AS R94 plus Wichura AS 241 (`qnorm`, which AS R94 needs and the module
    lacked). Verified equal to R's `shapiro.test` BEFORE integration across
    n = 3, 5, 8, 11, 12, 24, 50, 200, 1000, both branch boundaries and a
    heavy-ties case (W < 1e-7, p < 1e-6). `distNormality` now ships
    `{group, facet, w, p}` per cell with W rounded to 3 dp on the PRODUCING
    side, matching R and dodging the convention-16 double-rounding artifact.
    The entry MUST carry `n`: the engine's on-chart normality stat box prints
    `"(n = " + ne.n + ")"` (graphbuilder2.js:49674), so omitting it renders
    "n = undefined" - verifying the numbers is not the same as verifying the
    contract. `distNormality` is now in the parity harness's channel list
    (`m1-parity.R` CH), so the values are compared against R's own
    `shapiro.test` every run: 5707 -> 5739 comparisons. That closes the item-60
    complaint for this channel, where manifest.json declared it and nothing
    checked it.
  * PROBE: `verify/punchlist-check.mjs`, 37 assertions, in `run.sh` on dev AND
    dist. Two laws it encodes: the file-drop cases assert the loader is
    TOPMOST, not merely displayed (the weaker assertion passes on the broken
    code, which is why the bug survived), and a `:active` count must count
    SELECTORS, not rules, because the press states are grouped.

- WALKTHROUGHS DONE (Jul 25 2026): "Show me how" (Help menu ->
  `js/ps-tour.js`). A walkthrough moves a simulated cursor over the REAL
  chart and performs the REAL interaction: the panels roll out and the
  chart changes, so there is no video to re-record when the UI moves.
  Four ship (add error bars, change an axis range, recolor one bar, check
  the chart for problems); each is ~10 lines of data at the bottom of
  ps-tour.js, gated by an `applies(ctx)` predicate so a walkthrough is only
  offered on a chart it fits. The picker is a standard `.ps-dialog-overlay`
  declared in index.html, which is what gives it backdrop-click, Escape and
  focus-trap for free; ps-shell owns the dialog, ps-tour owns the list and
  playback. WHY THIS IS CHEAPER THAN IT LOOKS: the engine already carries
  the instruction set. `_findEntriesForContext()` (the Ctrl/Cmd+F "Find a
  setting" registry, ~153 entries) records, per setting, its synonyms, the
  panel to open, the tab/strip state to prepare, and the selector of the
  exact control - `_findActivate` already replays that instantly. A
  walkthrough is the same data played slowly with a cursor and a sentence,
  so a `route:` step kind can delegate navigation to the registry instead
  of hand-coding a click path. THREE ENGINE TRAPS, all now guarded by
  `verify/tour-check.mjs`: synthetic clicks need real coordinates AND
  `detail:1` (the engine drops synthesized clicks at (0,0) with
  `detail===0`); aim via `document.elementFromPoint` and click the TRUE
  geometric centre, because invisible HTML hit strips float above the SVG
  and a zero-width axis line padded by 1px misses its strip entirely; and
  resolve targets lazily to the first VISIBLE match, because every commit
  rebuilds the panel DOM and retired chrome stays in the document (two
  `[data-field="max"]` inputs exist and document order returns the hidden
  legacy popover). PROBE LAW: `page.evaluate(k => window.PS_TOUR.play(k))`
  AWAITS the walkthrough - use a block body so the poll loop, its timeout
  and its miss reporting actually run. The probe asserts the CHART changed
  (error bars drawn, axis 100 -> 140, one series recolored and not all),
  never merely that a panel appeared, because a silent engine change is
  exactly the failure mode. All tour chrome is `ignore-html`, so it never
  rides an export or a copy.
- M6e DONE (Jul 24 2026): ROLE-PICKER REDESIGN (Torry's "still a
  little clumsy" screenshot review; whole set approved). The empty
  slot IS the picker now: clicking a role card expands it IN PLACE
  (ps-role-picker) into a list of ONLY the variables that fit that
  role - the floating #ps-varmenu is fully retired (element, CSS,
  wiring, Escape/outside-click handlers all removed). Single roles
  assign-and-close; multi roles stay open for rapid adding (Done/Clear
  in the picker foot). COPY TRIM: the always-visible per-card teaching
  sentence and the "accepts" strip are gone - the card is one line
  (name + badge + slot), the teaching sentence + accepted types moved
  into the picker blurb (where the user is deciding) and the drop
  tooltip, and the empty slot shows "+ Choose a variable" with an
  ELIGIBLE COUNT chip. BIDIRECTIONAL HIGHLIGHTING: hovering or
  dragging a variable chip glows the role cards it fits and dims the
  rest (highlightEligibleRoles); an open picker dims the list chips
  that do not fit (syncEligibilityHints, re-applied at the tail of
  BOTH syncRolesRow and syncDataRow since either rebuild wipes
  classes). SUGGESTION CHIP: an empty REQUIRED single role with
  exactly ONE eligible-and-unassigned candidate offers "Use <name>"
  as an explicit one-click accept (never assigns silently - the
  no-invisible-changes principle applied to roles; also closes the
  audit's paste-import dead end). Plus: the one unfilled required
  card carries a left accent (ps-role-card-needed). PROBE MIGRATION:
  m1-shell-check's assignRole helper now checks whether the picker is
  already open before clicking the drop (a second click would TOGGLE
  it closed - multi pickers stay open after a pick), the RM measures
  flow picks both measures from one open picker, the accepts-strip
  case became an eligible-count + tooltip case, and library-bridge +
  hardening-dom picker selectors moved to
  '#ps-slots .ps-role-picker button[data-col]'. New coverage: six
  cases in novice-affordances-check (accent + count, eligible-only
  picker + blurb + chip dimming, assign-and-close, suggestion chip,
  hover glow/dim/clear, Escape closes).
- M6d DONE (Jul 24 2026): HEATMAP STALE-DATA SELF-HEAL (the M6b
  follow-up). A data edit under the scatter HEATMAP used to leave a
  BLANK plot: the honest cache drop removed the tiles, the heatmap
  suppresses the point layer, and the engine only recomputes tiles on
  interaction. The heatmap is a chart TYPE (the user's choice is
  honored, never reverted), so reconcileOverlayState now pins a
  synthetic xyBinCount into window.__gb2_pendingOpts for the stale
  render - the ENGINE's render entry rebuilds tiles client-side from
  the CURRENT points whenever such a commit is held - and the render
  tail (settleReconciledHeatmap) removes the pin and harvests the
  fresh tiles, re-stamping the fingerprint. Net: tiles recompute
  against the new data automatically; the stale state lasts exactly
  one render. The pin never clobbers a real in-flight bin-count edit,
  and error/placeholder render paths drop it without harvesting.
  Probe: two new overlay-reload-check stages (flyout type switch via
  button[data-role="graphtype-trigger"] + button[data-gt="heatmap"],
  then a data edit asserting tiles drawn, tiles JSON CHANGED vs
  pre-edit - recomputed, not resurrected - and no leaked pin).
- M6c DONE (Jul 24 2026): NOVICE DISCOVERABILITY POLISH (the M4
  audit's UX pressure points). (a) The "This chart needs variables"
  empty state now carries a "Choose variables" button (scrolls to the
  Chart setup card and pulses it - ps-attention-pulse) and a "Not
  sure? Help me choose" link that opens the wizard directly, so a
  stuck novice always has a way forward (Help Me Choose was previously
  only discoverable inside the New-chart dialog). (b) A visible
  "+ Add row" button in the data command bar (adding rows was
  right-click-only); it appends a row and opens the first cell's
  editor via the existing gridAddRow. (c) Right-clicking a column
  header now moves the variable inspector to that column
  (selectInspectorVariable before showColumnMenu), so the menu and the
  "Inspecting <name>" panel always agree. Probe:
  novice-affordances-check (5 cases). PROBE LAW: fixed-position
  overlays have no offsetParent - assert dialog visibility with
  Playwright's isVisible(), the help-me-choose-check idiom.
- M6b DONE (Jul 24 2026): SCATTER-OVERLAY PERSISTENCE (Tier 2, "the
  small reload gap" - which turned out worse than documented: not just
  reloads, ANY rebuilt payload lost the marginals/2D-density/heatmap
  arrays, because the engine computes them client-side on interaction
  and only jamovi's R side re-ships them per run). The shell now plays
  R's role: when the engine commits an overlay option (the NO_ECHO
  keys), harvestOverlayArrays() copies the engine-computed arrays out
  of window.gb2_undo.getData() onto the chart doc as
  doc.overlayCache = {fp, values}, where fp = overlayFingerprint()
  (roles + row count + x/y column sums). buildPayload re-ships the
  cached arrays while the fingerprint matches - so echoes, reloads,
  and .pand round trips all keep the strips. STALE DATA = CLEANLY OFF:
  when the data changes, reconcileOverlayState() (render entry) clears
  the stored xyMarginal/xyShowDensity2D options, drops the cache, and
  releases the engine's window.__gb2_recentCommits/__gb2_pendingOpts
  pins for those keys - no wrong overlay can ever draw, and the
  engine's + menu offers Distributions/Contours again so ONE click
  recomputes against the current data. THE PIN LESSON: a payload-only
  "none" rewrite loses forever - the engine pins every committed
  option in __gb2_recentCommits until an authoritative render echoes
  the SAME value back, and NO_ECHO keys never get that echo; the
  stored option itself must change, and the pins (host-visible window
  state, the same surface as __gb2_authoritativeRender) must be
  released by the shell. Engine untouched. Probe: overlay-reload-check
  (enable via the real + menu, echo survival, reload survival, .pand
  round trip, stale-data-off honesty, re-enable recomputes). PROBE
  LAWS: use PS_SHELL.setWorkspace()/[data-ps-workspace] to switch
  workspaces (a text-matching panel click can silently no-op, leaving
  the engine host parked at x=-20000 where every toolbar click
  "succeeds" against a dead spot); pick + menu items by
  getBoundingClientRect().width > 0 (the menu markup always exists,
  hidden).
- M6a DONE (Jul 23 2026): LAYOUT IMAGE ITEMS + EXPORT CAPTIONS (Tier 2,
  Torry-approved pair). IMAGES: a third layout item kind
  ({kind:"image", src dataURL, natW/natH}) via the Add image toolbar
  button / Insert menu - drags, aligns, layers, duplicates, and
  corner-resizes PROPORTIONALLY through the same machinery as chart
  panels (laySizedKind generalizes the sized-item code paths;
  per-kind minimums so small logos stay small); placement fits within
  45%/60% of the page at the image's own ratio, scaling tiny icons UP
  to a graspable size; embeds as <image href=dataURL> in layout SVG
  exports (PNG/PDF inherit). TORRY'S SIZE RULING: originals are
  HONORED - no silent downscaling ever; files whose encoded size
  passes ~2.5 MB get a DISCLOSURE dialog (full quality everywhere, but
  local autosave may stop keeping snapshots; .pand saves keep
  everything) with an explicit choice - Keep the original (default
  emphasis) or Use a smaller copy (long edge capped 2000px, canvas
  re-encode, PNG stays PNG for transparency); only crash-scale files
  (>50 MB) refuse outright with an explanation. CAPTIONS: a per-chart
  caption field persisted on the chart doc, edited in the Export
  dialog (hidden for layouts - text items caption those), typeset as
  a wrapped 13px block UNDER the exported figure by nesting the chart
  svg in a taller outer svg (canvas-measured word wrap, explicit
  newlines honored, background extended so text never sits on
  transparency in white exports) - SVG/PNG/JPG/PDF all inherit; the
  editing view NEVER shows it; clearing restores byte-identical plain
  exports. Probe: layout-image-check (7 cases; PS_IMG_WARN_BYTES
  override tests the disclosure BEHAVIOR at a low threshold). PROBE
  LAW: PS_SHELL.exportSource returns a PROMISE - await it inside
  evaluate callbacks (a sync .svg read comes back undefined).
- M5i DONE (Jul 23 2026): RESHAPE LONG-TO-WIDE (Tier 1, completing the
  audit's Tier 1 list; Torry's rulings baked in). WIDE IS THE HOME
  FORMAT - this is a one-way import-repair door for trial-level
  (one-row-per-measurement) exports, reached from the Data overflow
  menu ("Reshape to wide..."). Guided dialog: three pickers (ID /
  occasions / value, defaults inferred from measure types), live
  preview. Both data problems REFUSE AND EXPLAIN by default with an
  explicit one-click remedy the user must choose: repeated
  measurements per person-occasion refuse naming a concrete case
  ("s1 has 2 rows for pre") with an "Average them into one value per
  cell" button; a carried column that contradicts itself within a
  person refuses naming the person and both values, with "Carry each
  person's first value". Remedies disclose in the preview note AND the
  applied toast, and RESET whenever a column choice changes (each
  refusal is confronted for the current configuration). Applying
  replaces the table in ONE undoable data-history step ("one undo
  restores the long table" rides the toast); carried columns =
  everything constant within a person; wide names = value_occasion in
  level order; rows missing ID or occasion are left out with
  disclosure. NO wide-to-long direction exists on purpose. Probe:
  reshape-check (8 cases incl. exact means, RM end to end, undo, and
  remedy reset).
- M5h DONE (Jul 23 2026): COMPUTED VARIABLES (Tier 1, Torry's ruling:
  guided AND formulas together). js/ps-formula.js is a small
  spreadsheet-flavored engine (tokenizer + Pratt parser + per-row
  eval): row functions ABS/SQRT/LN/LOG10/EXP/ROUND/FLOOR/CEILING/
  IF/BIN(col,k), column aggregates MEAN/SD/MEDIAN/MIN/MAX/SUM/N
  (argument must be a plain column reference), operators incl. ^
  (right-assoc), AND/OR/NOT, strings, backtick-quoted names, and
  strict missing propagation (missing in -> missing out; /0, LOG of
  <=0, SQRT of negatives all go missing). t.computed stores name ->
  formula; retype re-evaluates every formula from freshly typed
  sources (chains work left-to-right via in-pass typed updates) then
  runs ONE more typing pass for levels/types. The FILTERS SEAM is
  pinned: computed values are DATA over the FULL table - the filtered
  view keeps subsetted results instead of re-evaluating, so a z-score
  never shifts when rows are filtered. ONE dialog serves both paths:
  quick-transform buttons (log10/ln/z/center/bin/recode) WRITE VISIBLE
  editable formulas (the guided path teaches the formula path), live
  preview + inline parse errors, Cmd/Ctrl+Enter saves. Computed cells
  are read-only in the grid (toast explains), headers carry an fx
  badge (error-tinted with the message when a formula breaks, e.g.
  after its source column is deleted), renaming a source variable
  token-rewrites every formula (strings/function names untouched),
  deleting a computed column deletes its formula, and everything rides
  undo/reload/.pand. Probe: computed-variables-check (12 cases incl.
  the filter seam and R-parity SD (n-1) z-scores).
- M5g DONE (Jul 23 2026): ROW FILTERS (Tier 1, Torry's ruling: dim but
  show). Dataset-wide AND-combined conditions ({col, op, value}; ops
  = != on any type, > >= < <= numeric-only; missing values fail their
  condition). Failing rows stay VISIBLE in the grid at 0.38 opacity
  with an explanatory tooltip but leave every chart and statistic: the
  analysis side consumes t.filteredView, a row-subset rebuilt inside
  retype (raw + caseIds + per-cell exclusion maps REMAPPED to kept
  indexes, then retyped), so every builder count, droplevel, missing
  note, and rowId pairing stays truthful with ZERO per-module changes;
  chart<->data linked selection survives because it is caseId-based.
  Charts append a disclosure to the note pill ("Filter: score >= 60
  and site = \"East\" - showing 11 of 24 rows"). UI: a Filter button in
  the Data command bar (active chip shows kept-of-total) opening a
  condition-builder popover with live row-count preview, Apply (one
  data-history step), and Clear all; level dropdowns for categorical
  values. Filters ride dataSnapshot/dataApply (undo/redo), autosave,
  and .pand; renaming a variable follows into its conditions; deleting
  one drops them. Probe: row-filters-check (8 cases).
- M5f DONE (Jul 23 2026): EXCEL .XLSX IMPORT (Tier 1). js/ps-xlsx.js is a
  dependency-free OOXML reader on PSOmv's ZIP core + DOMParser: shared /
  inline / rich-text strings, formula CACHED values, booleans, error
  cells as missing, and date serials to ISO via the builtin date
  number-format ids AND custom formatCode detection (Excel 1900 system,
  epoch 1899-12-30). Sheets convert to quoted TSV and ride the EXISTING
  typed import preview (header/type/import controls for free); a
  multi-sheet workbook gets a Worksheet bar above the preview (empty
  sheets dropped), and .xlsx/.xlsm join the picker accept list, the
  loader copy, and drag-drop (readPickedFile routes by extension).
  Verified against three producers: the hand-built fixture
  (verify/fixtures/import-fixture.xlsx), openpyxl, and xlsxwriter.
  Probe: xlsx-import-check (preview, types, dates, quoting round trip,
  chart end to end, sheet switching), wired into run.sh.
- M5e DONE (Jul 23 2026): COPY AS IMAGE (Tier 1). Cmd/Ctrl+C on a chart
  or layout writes a 2x (192 DPI) PNG ClipboardItem through the export
  pipeline - the everyday paste-into-slides motion. Promise-valued
  ClipboardItem where supported (Safari's user-gesture rule), awaited
  fallback otherwise, toast on success/failure, Edit-menu entry with
  availability + disabled-reason copy. The Data workspace keeps its TSV
  range copy; real text selections keep native copy; engine-handled
  keys (defaultPrevented) are left alone. Probe: copy-image-check.
- M5d DONE (Jul 23 2026): TAB DOUBLE-CLICK RENAME RESTORED. The native
  dblclick event never fired because the first click's switchChart
  REBUILDS the tab strip (the second click lands on a fresh node, so
  the browser suppresses dblclick). The click handler now detects the
  double click manually (same document within 450ms = open the inline
  rename instead of re-switching); the native dblclick handler stays as
  belt and suspenders for no-rebuild cases. Probed in m1-shell case 16.
- M5c DONE (Jul 23 2026): STYLE/PALETTE LIBRARY BRIDGE (audit fix 2,
  Option A) + the two small audit items. The shell now interprets the
  engine's one-shot styleLibrary/paletteLibrary ACTION options exactly
  like jamovi's R side (style_library.R / palette_library.R): verbs
  save / savedefault / delete / rename / setdefault (+ palette
  replace), guarded by machineId equality + a strictly increasing
  per-library timestamp. The machine library lives in localStorage
  (psstandalone.libraries.v1), feeds back through the same payload keys
  R ships (paletteLibrary / paletteLibraryMachineId / paletteDefaultId /
  styleLibrary / styleDefaultId / styleAutoApply), resolves an unpinned
  chartPalette against the default palette (R parity incl. the
  dangling-saved guard), and rides .pand files as a snapshot - names
  missing from the recipient's library import on open, existing names
  are never clobbered. Default-style auto-apply mirrors R's
  never-restyle-old-charts gate: only chart documents created AFTER the
  bridge carry styleStamp:false, and the engine's one-shot application
  stamps them true through the sink. The shared engine and every jamovi
  file are UNTOUCHED - this is a second interpreter for an existing
  contract. Probe: library-bridge-check (persist/guards/reload/flyout/
  auto-apply/.pand import), wired into run.sh. Audit fix 3 rode along:
  an empty layout panel now says "<chart> needs variables before it can
  appear here" when that is the real cause (the open-the-tab hint only
  shows for drawable charts). Audit item 5 resolved as NOT a defect:
  the start-center preference applies to fresh launches; reloading a
  working tab resumes via a per-tab sessionStorage dismissal (desktop
  convention) - the preference now carries a tooltip saying so.
- M5b DONE (Jul 23 2026): HELP ME CHOOSE ESCAPE REPAIR (audit fix 1).
  Root cause: every step render replaced the dialog body wholesale,
  destroying the focused button; focus fell to <body> and the overlay's
  Escape/Tab handlers went silent - past the first screen the keyboard
  could not leave the dialog. renderHelpMeChoose now re-anchors focus
  inside the open dialog after every render (hmcRestoreFocus), and a
  capture-phase Escape handler steps BACK one question per press
  (matching the breadcrumb), closing from the start screen or the
  variables route via the generic overlay handler. Probe cases added to
  help-me-choose-check (focus containment + back-then-close).
- M5a DONE (Jul 23 2026): VERIFY SUITE RESTORED (audit step 0). The
  legacy m1-shell-check was repaired against the M4 UI - select-all
  before replacing text in the no-longer-autoselecting cell/rename
  editors, add-row via the row context menu, exclusion status read from
  the Data command bar (excluded values are disclosed separately, no
  longer folded into the missing note), workspace switches before
  clicking workspace-scoped chrome (M4g tab strips, supplier slots),
  role-card accepts TEXT instead of icons, F2 rename (the tab
  double-click editor is gone), gallery-routed chart/layout creation,
  and M4i proportional-resize semantics (plus Shift-mid-drag freeform).
  All 22 cases green, including the previously unreachable case 21
  export battery. run.sh now also runs hardening-dom-check + the nine
  PS_PAGE-capable feature probes on BOTH the dev page and the dist.
  PROBE LAWS learned: pre-scroll a drag TARGET into view before
  page.dragAndDrop (playwright's mid-gesture auto-scroll shifts cards
  under the pressed pointer, so the drag grabs a NEIGHBOR - looks like
  an app bug, is not); Shift at pointerdown means multi-select, so
  freeform-resize probes press Shift only after the drag has armed.
- M4ag DONE (Jul 23 2026): VARIABLE-DRIVEN HELP ME CHOOSE. The guidance
  dialog now offers the jamovi-style second route: users click or drag exact
  project variables into a temporary target and receive a live recommendation
  based on declared measure types, chart-role capacity, variable count,
  shared response scales, and sequential repeated-measure names. It identifies
  Likert batteries and repeated occasions, offers an alternative when the
  same selection has more than one plausible interpretation, warns by name
  when selected variables cannot fit the recommended chart, and assigns the
  compatible variables to roles only after confirmation. The chart-gallery
  guide card now has exactly the same footprint as every analysis card.
  Selection is session-only and neither the dataset nor project is changed
  while exploring. The shared GraphBuilder2 engine and Jamovi module remain
  unchanged.
- M4af DONE (Jul 23 2026): HELP ME CHOOSE FOUNDATION. New Chart now
  contains an eighth, visually distinct Help Me Choose card in the open
  bottom-right position. It launches a keyboard-contained, goal-based guide
  modeled on the jamovi module's question route: seven plain-language goals,
  a progressive follow-up for group comparisons, breadcrumb/back/start-over
  navigation, a concise rationale, suitable starting graph styles, and an
  explicit confirmation before creating the recommended existing chart
  module. Opening or exploring the guide never adds a project document.
  The shared GraphBuilder2 engine and Jamovi module remain unchanged.
- M4ae DONE (Jul 23 2026): TEMPORARY COLUMN VISIBILITY. Data headers now
  offer Hide column without changing the dataset, chart inputs, exclusions,
  exports, or saved project. A compact command-bar indicator opens a
  restoration checklist with per-column Show actions and Show all, while
  Focus on current chart variables reduces wide datasets to the columns
  assigned to the active chart. The view resets when a different dataset or
  project is loaded and never enters Data undo/redo or autosave. Find and
  keyboard cell navigation follow the visible grid. The shared GraphBuilder2
  engine and Jamovi module remain unchanged.
- M4ad DONE (Jul 23 2026): RELIABLE DATASET SCROLLING. Moderate datasets no
  longer enter the virtualized grid at only 141 rows: ordinary tables now
  render directly until either row count or total cell count warrants
  virtualization. Truly large datasets retain the bounded 140-row window,
  with horizontal and vertical scroll offsets explicitly restored across
  window rerenders so the browser cannot clamp the user back to the top.
- M4ac DONE (Jul 23 2026): STABLE CENTERING THROUGH UNDO/REDO. Replaced the
  shell's one-time chart-canvas class assignment with a persistent structural
  standalone rule for every non-toolbar child of the engine chart card.
  Intermediate engine rebuilds now center the chart and contextual editor
  before their first paint, eliminating the left-edge flash during undo,
  redo, and delayed option echoes.
- M4ab DONE (Jul 23 2026): CENTERED CONTEXTUAL EDITOR. Aligned the shared
  engine's lower editing panel to the chart's visual centerline in the
  standalone workspace. The panel retains its engine-calculated natural width,
  wider Statistics treatment, responsive maximum, and native coordinate
  system; only its standalone flex alignment changes.
- M4aa DONE (Jul 23 2026): SAFE CHART-VIEW ROLLBACK. Removed the experimental
  display scaling and its status-bar controls after validation exposed
  coordinate, reflow, and editor-panel regressions. Charts again render at the
  engine's native 100 percent geometry; the standalone shell now applies only
  safe horizontal centering, leaving hover targets, editor placement, rerenders,
  snapshots, and exports in the engine's original coordinate system.
- M4z DONE (Jul 23 2026): EXPLANATORY CHART-ROLE CARDS. Reworked the
  standalone Chart setup inspector into uniform full-width role cards with
  plain-language outcomes, Required/Optional badges, analysis-specific
  guidance, descriptive empty states, full assignment badges, and an explicit
  click-to-choose path alongside the existing drag/drop behavior.
- M4y SUPERSEDED (Jul 23 2026): CENTERED CHART VIEW EXPERIMENT. The
  display-only zoom portion of this experiment was removed in M4aa; safe
  horizontal centering remains.
- M4x DONE (Jul 23 2026): COMPACT PANDION WING MARK. Replaced the initial
  portrait falcon branding in the application header and welcome screen with
  the supplied square two-color wing artwork. The transparent inline SVG stays
  crisp at both compact toolbar size and the larger start-screen size.
- M4w DONE (Jul 23 2026): PANDION PLOTS BRANDING FOUNDATION. The standalone
  application now presents as Pandion Plots in its window title, persistent
  application header, start screen, diagnostics, Help menu, export metadata,
  and user-facing recovery/error copy. The supplied Pandion falcon artwork is
  inlined as reusable SVG and replaces the provisional three-circle mark in
  both the compact header and larger start-screen treatment; the start-screen
  atmosphere now subtly uses the logo's blue and orange palette. Project
  compatibility is unchanged: `.pand`, `pandion-plots-project`, and existing
  autosaves continue to open without migration. The shared GraphBuilder2
  engine and Jamovi module remain unchanged.
- M4v DONE (Jul 23 2026): PORTRAIT LAYOUT WORKFLOW. The existing eight-card
  New layout gallery now has a compact Landscape/Portrait switch instead of
  duplicating or lengthening the template list. Landscape remains unchanged;
  Portrait updates the page-shaped previews and creates portrait geometry,
  including a vertically hierarchical Main + supporting arrangement and a
  report-style Presentation figure. Portrait Canvas, Presentation, A4, and
  Letter presets are available in the layout toolbar. A Page orientation
  control in the Layout inspector can swap an existing page later, scaling
  its items proportionally and keeping them within the page. Real-browser
  coverage verifies gallery previews, portrait creation, inspector changes,
  item bounds, and preset synchronization. The shared GraphBuilder2 engine
  and Jamovi module remain unchanged.
- M4u DONE (Jul 23 2026): SILENT CROSS-WORKSPACE SELECTION. The persistent
  chart banner that repeated the active Data cell's variable, row, and value
  has been removed. Cross-workspace identity remains session-only and useful:
  selecting a plotted source value in Data still paints the matching point
  ring, and a point's context menu still offers Reveal in Data with one-shot
  source-cell emphasis. Cells that are not represented by an individual
  plotted point now remain completely silent in Charts and clear any stale
  point ring. Real-engine browser coverage verifies both directions without
  relying on permanent chart chrome. The shared GraphBuilder2 engine and
  Jamovi module remain unchanged.
- M4t DONE (Jul 23 2026): SINGLE-SOURCE WORKSPACE NAVIGATION. The redundant
  Data toggle beside Open and Save has been removed. Data, Charts, and
  Layouts are now entered exclusively through the persistent workspace
  navigator, while the top command bar retains the active dataset name and
  dimensions as passive context. Existing project recovery still restores
  its last workspace. Shell and browser probes now use the same navigator
  path as users and assert that the legacy toggle is absent. The shared
  GraphBuilder2 engine and Jamovi module remain unchanged.
- M4s DONE (Jul 23 2026): CONSTRAINED LIVE CATEGORY REORDERING. Category
  ordering no longer depends on native HTML drag-and-drop. A pointer-driven
  vertical interaction now keeps the active level aligned to its list,
  ignores horizontal pointer drift, and moves neighboring rows out of the
  way continuously to show the eventual destination. Slow holds and releases
  above the first or below the last row resolve deterministically, while
  Escape cancels and release commits a single undoable Data change. Browser
  coverage reproduces a slow bottom-to-top move with substantial horizontal
  drift and verifies the live opening of the target slot. The shared
  GraphBuilder2 engine and Jamovi module remain unchanged.
- M4r DONE (Jul 23 2026): PROGRESSIVE CATEGORY ORDERING. The Data inspector
  now omits categorical-level controls for continuous and ID variables,
  labels nominal ordering as "Category order," and labels ordinal ordering
  as "Ordered levels." Categorical values appear as a compact vertical list
  that can be dragged into the intended chart, legend, and analytical order;
  Alt+Up/Down provides the keyboard equivalent without exposing permanent
  arrow-button clutter. A subtle Reset order action appears only after a
  manual change and restores the exact pre-edit order. Reordering is
  persistent, recoverable through Data undo/redo, and covered in a real
  browser across disclosure, dragging, keyboard access, reset, and recovery.
  The shared GraphBuilder2 engine and Jamovi module remain unchanged.
- M4q DONE (Jul 23 2026): FOCUSED VARIABLE INSPECTOR + CONTEXTUAL SORTING.
  The Data inspector now contains only variable properties, summary
  information, levels, and missing-value settings. Duplicate spreadsheet
  commands for changing type, restoring exclusions, adding, duplicating,
  sorting, and deleting columns have been removed from the panel. Ascending
  and descending row sorting now lives in the selected column header's
  right-click menu alongside the other structural column commands. Sorting
  is stable, preserves case IDs and value exclusions, and participates in
  the existing Data undo/redo history. Real-browser coverage verifies the
  streamlined inspector and both sort directions. The shared GraphBuilder2
  engine and Jamovi module remain unchanged.
- M4p DONE (Jul 23 2026): COMPLETE SPREADSHEET CONTEXT MENUS. Right-clicking
  a row number now offers insert above/below, duplicate, include/exclude, and
  delete; right-clicking a column header offers insert left/right, rename,
  duplicate, measure type, sizing, and delete. Row insert/delete remaps
  cell-exclusion indices so exclusions remain attached to the same values,
  while duplicated rows receive independent case IDs. Column commands reuse
  the established inspector, type picker, role-safe mutation paths, and Data
  history. Delete actions remain recoverable, and menus disable removal when
  it would leave no row or variable. Real-browser coverage executes every
  command and verifies undo plus exclusion identity. The shared GraphBuilder2
  engine and Jamovi module remain unchanged.
- M4o DONE (Jul 23 2026): DATA COMMAND BAR. The Data workspace now opens
  with a compact application-native command strip above the spreadsheet:
  visible Undo/Redo state, full-dataset Find with previous/next navigation
  and Cmd/Ctrl+F, live exclusion status with recovery, and an overflow menu
  for auto-fit and reset-width commands. Its Undo, Redo, and Search controls
  reuse the chart toolbar's exact SVG paths and compact button treatment.
  Structure insertion stays contextual: right-click a row number to insert
  above/below, or a column header to insert left/right. Those insertions use
  the existing Data history and shift cell-exclusion indices safely. Search
  selects and scrolls to real source cells, and the responsive strip allows
  contained horizontal overflow only when necessary. A real-browser probe
  verifies icon parity, search, contextual insertion, exclusions, and sizing.
  The shared GraphBuilder2 engine and Jamovi module remain unchanged.
- M4n DONE (Jul 23 2026): DETERMINISTIC DATA UNDO/REDO. The temporary Undo
  action remains a six-second convenience, while the session keeps up to 50
  Data states independently of that message. When Data is the visible
  workspace, Cmd/Ctrl+Z always restores the previous dataset state and
  Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y reapplies it; chart rerenders can no longer
  win the former timestamp-based shortcut race. Bottom feedback reports
  "Previous data state restored" or "Data change reapplied," and unavailable
  history is explained without falling through to an invisible chart edit.
  A real-browser probe clears a value, waits for the action toast to expire,
  then verifies keyboard undo and redo. This is standalone-only routing; the
  shared GraphBuilder2 engine and Jamovi module remain unchanged.
- M4m DONE (Jul 23 2026): PROFESSIONAL DATA-COLUMN SIZING. Data headers now
  expose keyboard-accessible resize dividers: drag for an exact width,
  double-click or press Enter to auto-fit, and use the header context menu
  to auto-fit one/all or reset one/all widths. Explicit widths remain stable
  while cells are edited, survive local recovery and portable project files,
  follow renamed variables, and remain standalone view state rather than
  dataset mutations. Narrow cells use ellipsis plus full-value tooltips, and
  auto-fit scans the complete dataset while keeping practical width limits.
  A real-browser probe covers dragging, neighboring-column stability,
  persistence, double-click auto-fit, context commands, and reset behavior.
  The shared GraphBuilder2 engine and Jamovi module remain unchanged.
- M4l DONE (Jul 23 2026): DATASET-LINKED OBSERVATION EXCLUSION. Standalone
  datasets now persist a stable case ID per row plus an explicit row-exclusion
  map. Compare Groups, Distribution, and Repeated Measures payloads carry
  those IDs beside individual values, allowing the standalone option bridge
  to promote an on-chart point exclusion into the correct Data row instead of
  retaining a fragile category/group/array index. The excluded observation is
  struck through and identified in Data, omitted from every applicable chart,
  included in data undo/redo and project files, and survives sorting because
  its identity is not its row position. Data's context menu now distinguishes
  Exclude value from Exclude row; row exclusions apply to every variable and
  chart, while cell exclusions continue to represent one missing measurement.
  The chart command is relabeled “Exclude observation from dataset” in the
  standalone shell, and legacy standalone hidden-point lists are promoted
  when their chart next opens. Layout snapshots are invalidated after a row
  exclusion so composed figures cannot retain stale data. No shared
  GraphBuilder2 or jamovi file is changed by this phase.
- M4k DONE (Jul 23 2026): RESPONSIVE STATISTICS PANEL. The chart's lower
  inspector now measures the visible host workspace instead of treating the
  entire browser viewport as usable width. Statistics can still expand for
  wide comparison tables, but contracts again when the browser, standalone
  chart workspace, or jamovi results column narrows; the former 560px
  preferred minimum now yields when necessary and wide tables retain their
  internal horizontal scrolling. Geometry also observes host-width changes,
  covering application-side-panel and jamovi-splitter resizing that does not
  resize the outer browser. This correction lives in the shared GraphBuilder2
  engine, so both shells receive the same behavior without changing any
  analysis or customization feature.
- M4j DONE (Jul 23 2026): STANDALONE-NATIVE CHART TOOLBAR. The chart-type,
  theme, and editing commands retain their familiar engine-owned order and
  behavior, but now sit in a fixed-height, full-workspace application strip
  styled with the standalone shell's borders, colors, spacing, hover states,
  and keyboard focus treatment. Resizing the plot no longer scales, wraps, or
  repositions its toolbar; the chart viewport changes independently beneath
  it. Compact widths preserve every command, first reducing labels to icons
  and then providing contained horizontal overflow as a safe fallback. This
  is a standalone-only presentation layer: the shared GraphBuilder2 engine,
  jamovi toolbar, analysis behavior, and customization schema remain
  unchanged.
- M4i DONE (Jul 23 2026): PROPORTIONAL PANEL RESIZING. Corner-dragging a
  chart panel now uses one scale factor for width and height, driven by the
  dominant pointer axis, so the panel retains its pointer-down aspect ratio
  instead of introducing horizontal or vertical letterboxing. Grid snapping,
  minimum dimensions, and page-edge constraints preserve that ratio as well.
  Holding Shift during the corner drag deliberately restores freeform width
  and height control; exact W/H fields remain available for numeric precision.
  The layout toolbar hint, resize-handle tooltip, and shortcuts reference
  disclose the behavior. The shared GraphBuilder2 engine remains unchanged.
- M4h DONE (Jul 23 2026): LAYOUT TEMPLATE GALLERY. Creating a layout now
  opens a keyboard-contained gallery of eight visual starting points: blank,
  single panel, two columns, two rows, main + supporting, three panels, four
  panels, and a 16:9 presentation figure. Templates declare how many charts
  they need, enable only when the project can satisfy them, and provide
  per-panel chart assignment plus optional automatic A/B/C labels. Creation
  produces the same ordinary chart and text items as manual layout work, so
  every generated panel remains movable, resizable, reorderable, and
  exportable through the existing precision system. The former oversized,
  offset empty-layout rectangle is replaced by a compact fallback centered
  correctly within the page. The shared GraphBuilder2 engine remains
  unchanged.
- M4g DONE (Jul 23 2026): WORKSPACE-SPECIFIC DOCUMENTS. Charts now shows
  chart tabs only, Layouts shows layout tabs only, and Data remains a pure
  spreadsheet workspace; the Project navigator continues to provide the
  global document overview. Each document workspace remembers and restores
  its most recently active document, including across saved projects. The tab
  `+` action is contextual, creating a chart from Charts and a layout from
  Layouts. A workspace with no matching documents remains selected and shows
  a purposeful creation state instead of silently creating or displaying the
  wrong document. Tab drag-reordering now operates within the visible
  document type while preserving the shared project-file structure. The
  shared GraphBuilder2 engine and customization schema remain unchanged.
- M4f DONE (Jul 23 2026): RELEASE HARDENING + PERFORMANCE. The Data
  workspace now virtualizes a moving 140-row window, so very large datasets
  retain spreadsheet selection, editing, copy/paste, and navigation without
  placing every cell in the DOM; the complete dataset still feeds every
  analysis. Versioned v2 projects migrate through an explicit v3 migration
  path. Local autosave writes atomically, retains a bounded last-known-good
  snapshot, recovers from a corrupt newest snapshot with a visible
  explanation, and reports storage failures honestly while keeping current
  work in memory. **Help → Diagnostics** provides a copyable release,
  project-size, dataset, autosave/recovery, chart-render timing, browser
  storage, export-capability, and browser summary. A fast DOM smoke covers
  migration, corrupt-snapshot recovery, a 20,000-row grid, diagnostics, and
  quota failure. The shared GraphBuilder2 engine remains unchanged.
- M4e DONE (Jul 23 2026): GUIDED WORKFLOW + RESILIENCE. New charts now begin
  in a seven-analysis gallery with plain-language purpose, visual identity,
  and requirements derived from the existing module role definitions.
  Incomplete or invalid charts render actionable setup states with direct
  routes to the role inspector and Data workspace. Document deletion,
  variable deletion, and range clearing provide time-limited Undo actions
  instead of modal interruption. A Preferences dialog persists comfortable/
  compact density, system/reduced motion, start-center/resume behavior, and
  default export format/DPI; Cmd/Ctrl+, opens it. Help now provides a
  keyboard-contained shortcuts reference instead of a transient toast.
  Dialogs restore focus and trap Tab/Escape correctly, role slots are
  keyboard-operable buttons with requirement labels, and global focus-visible
  treatment improves navigation clarity. The shared GraphBuilder2 engine
  remains unchanged.
- M4d DONE (Jul 23 2026): DATA WORKFLOW. The Data workspace now supports
  spreadsheet-style whole-row, whole-column, and select-all gestures in
  addition to rectangular cell ranges. Copy remains TSV-compatible; paste
  writes matrices from the selection origin, a single pasted value fills a
  selected range, and pastes expand rows/variables when necessary. Delete
  clears ranges, while the context menu adds Fill and Clear alongside batch
  Include/Exclude. The variable inspector can add, duplicate, or delete
  columns; explicitly sort rows ascending/descending; reorder nominal/ordinal
  levels; and configure dataset missing-value labels. All mutations use one
  data-history step, including role-safe variable deletion/renaming, so Undo
  restores table structure and every affected analysis assignment. CSV/TSV
  loading now pauses at a typed preview with delimiter, first-row/header,
  encoding, per-variable type, dimensions, ragged-row warning, and an explicit
  Import action. The shared GraphBuilder2 engine remains unchanged.
- M4c DONE (Jul 23 2026): CONTEXTUAL INSPECTOR + COMMAND SYSTEM. The right
  inspector now remains stable across Data, Charts, and Layouts. Selecting a
  data column or cell exposes a variable name/type editor, valid/missing/
  distinct/excluded/role-use summary, factor levels, and exclusion recovery;
  renaming a variable updates every analysis role that references it and is
  fully data-undoable. Chart and layout documents expose consistent rename,
  duplicate, and delete actions. Layout selections mirror exact X/Y/W/H,
  layering, duplication, deletion, alignment, and distribution controls in
  the inspector. The Edit menu, navigator and tab context menus, layout-item
  context menu, F2, Cmd/Ctrl+D, and a searchable Cmd/Ctrl+Shift+P command
  palette all route through the same command functions, with unavailable
  actions disabled and explained. The shared GraphBuilder2 engine remains
  unchanged.
- M4b DONE (Jul 23 2026): PROJECT LIFECYCLE. Pandion Plots now opens through a
  desktop-style start center with first-run actions, a curated dose-response
  template, automatic recovery of the last local session, and up to three
  compact recent-project snapshots. Projects have user-facing names (editable
  from the title bar or File menu), portable `.pand` save/save-as commands,
  and distinct `Saved`, `Modified · autosaved`, and `Autosaved locally`
  states. File > New/Open/Start Center/Rename/Save/Save As/Export and the
  conventional Cmd/Ctrl shortcuts complete the lifecycle. Workspace and
  document navigation persist as session view state without falsely marking
  the project file dirty. This layer changes only the standalone shell; the
  shared GraphBuilder2 engine and customization schema remain unchanged.
- M4a DONE (Jul 23 2026): APPLICATION FRAME. The same browser renderer now
  lives inside a full-height program shell: compact menu bar, command toolbar,
  centered project identity, local-save state, Project navigator, persistent
  Data / Charts / Layouts workspaces, contextual chart-setup inspector, central
  document workspace, and status bar. The navigator groups every chart and
  layout and follows creation/activation; the workspace choice persists in
  `.pand` and local autosave. Data mode parks the live chart host offscreen
  rather than using `display:none`, preserving the engine's measurement and
  state laws. File/Edit/View/Insert/Help menus route to the existing commands,
  support keyboard traversal, and expose Open/Save/Export, data undo/redo,
  workspace switching, document creation, layout insertion, shortcuts, and
  About. The renderer remains browser-first and shared with a future desktop
  wrapper.
- M0 DONE (Jul 22 2026): `index.html` renders an editable Compare Groups bar
  chart via a committed template; engine edits round-trip through the mocked
  `window.setOption` sink into a localStorage project store, with a debounced
  authoritative shell re-render standing in for the jamovi R echo; probe green.
- M1 DONE (Jul 22 2026): CSV import (file / drag-drop / paste, quoted fields,
  delimiter sniff, BOM), per-column type inference with click-to-flip chips,
  module + roles UI, and JS payload builders for Compare Groups,
  Distribution, Scatter and Frequencies. The stat core (`js/ps-stat.js`)
  carries faithful ports of R's pnorm (Cody), qt/pt (incomplete beta),
  pchisq (incomplete gamma), cor.test pearson/spearman/kendall (incl. the
  AS 89 prho exact + Edgeworth branches and the exact tie-free kendall DP),
  lm/predict CI fits (linear/poly2/poly3), and the confidence-ellipse math.
  Parity battery: 12 cases x all channels vs real R payloads at
  10-significant-digit tolerance - green (3563 comparisons).
- M2a DONE (Jul 22 2026): single-file dist (`build-dist.sh` ->
  `dist/pandion-plots.html`, runs anywhere) + the read-only data grid
  ("View data": sticky header, type badges, per-analysis role tags,
  missing-cell dashes, 1000-row cap note, open state persisted).
- M2b DONE (Jul 22 2026): grid cell EDITING - click a cell, Enter commits
  and moves down, Tab moves right, Esc cancels, blur commits. Commits
  write the raw string; the column TYPE stays declared, so a non-parsing
  value in a numeric column becomes missing (the jamovi NA convention).
  Factor edits can introduce new levels. Every commit re-renders the
  chart live, marks the dataset "(edited)", and persists. Plus Add row
  (appends an all-missing row and opens its first cell).
- M3c DONE (Jul 22 2026): precision LAYOUT EDITOR. Every layout now owns
  page geometry (Canvas, 16:9 presentation, square, A4 landscape, Letter
  landscape, or exact custom width/height), margin inset, fit-page or
  25-150% zoom, grid step, grid visibility, snapping, and smart-guide
  settings. Zoom is view-only: project coordinates and export dimensions
  stay exact. Shift/Cmd-click multi-selects; selections drag together and
  support exact X/Y plus single-panel W/H, keyboard nudging (1 px, or 10
  with Shift), duplicate, delete, forward/back layer moves, six alignment
  commands, and horizontal/vertical distribution. All settings persist in
  localStorage and .pand; old fixed-canvas layouts migrate to the Canvas
  preset. Export uses the selected page geometry while guides, grid, and
  margins remain editing-only.
- M2n DONE (Jul 23 2026): spreadsheet RANGE SELECTION. A normal cell click
  still opens the editor, while a 4px pointer threshold turns a drag into a
  rectangular multi-cell selection without accidental editing. The range
  gets a professional perimeter/focus treatment, an accessible selected
  state, and a live rows x columns / cell-count announcement. Cmd/Ctrl+C
  copies raw values as spreadsheet-compatible TSV (with quoting for tabs,
  line breaks, and quotes); Shift-click extends from the existing anchor;
  Esc or an outside press clears. Native browser text selection is disabled
  on grid cells (but retained inside the active editor), so it never overlaps
  the range highlight. Right-clicking inside a range preserves it and offers
  one batch Exclude/Include action with a single undo step.
- M3a DONE (Jul 22 2026): LAYOUT TABS - the figure-composition canvas
  (Torry's panel-figure ask). The + tab button opens a menu: New chart /
  New layout. A layout tab starts as a white 1024x680 canvas of items: CHART
  PANELS (snapshot SVGs of the project's chart tabs - drag to arrange,
  corner-handle resize, min 120x80) and TEXT items (drag; double-click
  to edit, committing on blur AND on any outside press, Esc cancels;
  A-/A+/Bold mini bar), plus "Add panel label" stamping bold
  auto-incrementing A/B/C labels (the per-layout counter rides the
  project file). Delete/Backspace removes the selected item; layouts
  persist in localStorage and .pand like any tab. Snapshots are
  SESSION-cached (CHART_SNAPS), captured chrome-stripped at every live
  chart render and on tab switch-away; opening a layout first renders
  any missing charts through the OFFSCREEN engine host (.ps-offscreen =
  visibility:hidden + left:-20000px, never display:none - engine text
  measurement needs layout), one per tick. TWO snapshot laws learned:
  (1) the engine svg carries inline position:relative + z-index:1 -
  neutralize it on the clone or panels stack above later-placed text
  regardless of DOM order; (2) the engine stamps the SAME def ids on
  every render (gb2-cat-data-clip-psroot, ...) and url(#id) resolves
  DOCUMENT-wide to the first match, so a clone's data clip resolved
  into the parked host svg and painted NOTHING - every id inside a
  snapshot is prefixed snap-<chartId>- with its fully-delimited
  reference tokens rewritten. The probe asserts painted PIXELS for
  exactly that failure (getBoundingClientRect ignores clip-path).
- M3b DONE (Jul 22 2026): first-class standalone EXPORT for chart and
  layout tabs. The header Export action opens a keyboard-contained,
  labelled dialog with remembered format / DPI / background choices and
  safe filenames. SVG uses the engine's own chrome-stripping serializer;
  layouts compose the already-id-prefixed chart snapshots and live text
  items into one portable page-sized SVG. PNG/JPG rasterize client-side at
  96/150/300/600 DPI with a 16-megapixel safety gate. PDF converts that
  same clean SVG to a resolution-independent one-page vector document
  through vendored jsPDF + svg2pdf.js; standard sans/serif/mono choices
  map to the matching PDF core fonts. Chromium uses the native Save As
  picker; other browsers download normally. The probe byte-checks real
  SVG, PNG, JPG and PDF output, asserts that ordinary chart PDFs do not
  contain image objects, and covers a two-panel labelled layout.
- M2m DONE (Jul 22 2026): Cmd/Ctrl+S SAVES the project (window-capture
  keydown beats the browser's save-page dialog). Where the File System
  Access API exists (Chrome/Edge), the FIRST save picks the .pand file
  and every later save writes to it SILENTLY in place (desktop-style);
  a stale handle falls back to a download once and re-picks next time;
  no-API browsers (Safari) download each time. The Save button flashes
  "Saved". PROBE LAW: headless Chromium EXPOSES showSaveFilePicker but
  cannot show its dialog - probes must mock it (or undefine it for the
  download path).
- M2l DONE (Jul 22 2026): per-role ACCEPTED TYPES (the jamovi
  permitted-types model) - each role declares `accepts`: category slots
  (CG X, Group By, Panels, freq Variable, RM Between) take nominal/
  ordinal ONLY (continuous no longer coerces in - flip its type first);
  value slots (CG Y, dist/xy/RM/corr) take continuous + NUMERIC ordinal;
  likert items take all three; ID never plots. roleAccepts is the single
  gate (picker, drag highlight, drop, validation). Every slot shows
  dimmed accepted-type icons at its right edge with an "Accepts ..."
  tooltip.
- M2k DONE (Jul 22 2026, reworked same day after field flicker): tabs
  DRAG-REORDER, POINTER-based (HTML5 dnd retired for tabs - its live
  box measurement mid-transition caused rapid slot oscillation, and its
  free-floating ghost let the tab leave the strip). The dragged tab
  slides INLINE: X follows the pointer, Y locks to its row (snapping
  between rows only when the strip wraps); neighbors part via a FLIP
  mapping over geometry cached ONCE at grab, so the slot math can never
  read half-animated positions. 4px arm threshold keeps click/dblclick;
  a post-drag click swallow stops accidental tab switches; Esc abandons.
  Order persists; the active chart never changes on a reorder.
- M2j DONE (Jul 22 2026): MULTI-CHART TABS - one project holds many
  charts over one shared dataset (the jamovi one-spreadsheet-many-
  analyses model). A tab strip above the chart: + adds, click switches,
  double-click renames, x closes (last tab unclosable). Each tab keeps
  its own analysis module + per-module roles/options, fully isolated.
  ONE live chart at a time BY DESIGN: the engine's window-global state
  (undo store, panel restoration, label mode) makes stacked live charts
  fight each other; tabs sidestep that class of bug. Project v3
  ({charts[], activeChart}); v2 localStorage/.pand files migrate to one
  tab; .pand wrapper formatVersion 2 (old pages message cleanly).
- M2i DONE (Jul 22 2026): portable PROJECT FILES - "Save project"
  downloads a .pand file (the product's coming name is Pandion Plots;
  kind: "pandion-plots-project", formatVersion 1, plain JSON) carrying
  the FULL state: table incl. cell edits/exclusions/types/levels,
  module, per-module roles + options (chart styling), and UI state.
  Loading is CONTENT-sniffed, so .pand / .pnd / .pandion / .json all
  open; newer-format files get a friendly update message; sandboxed
  frames fall back to copy-the-JSON (downloads blocked there). Probe:
  full-state round trip into a fresh browser context.
- M2h DONE (Jul 22 2026): jamovi .OMV IMPORT (js/ps-omv.js) - the Load
  data picker and drag-drop accept .omv files. Dependency-free: a minimal
  ZIP central-directory reader + the browser-native
  DecompressionStream("deflate-raw"), then metadata.json fields +
  xdata.json level tables + the column-major data.bin (type "number" =
  LE double / NaN missing, else LE int32 / -2147483648 missing; Text
  cells are codes into xdata). measureType maps onto our ID/Nominal/
  Ordinal/Continuous and xdata label ORDER becomes the declared level
  order (a file declaring 5..1 stays 5..1). Filter columns are skipped,
  computed columns arrive as values, and the analyses inside the file
  (protobuf blobs) are NOT imported - dataset only. Probed against a
  REAL jamovi file (verify/fixtures/) with byte-verified ground truth.
- M2g DONE (Jul 22 2026): ALL SEVEN ANALYSES. Repeated Measures (the
  simple measures path: multi-measure slot + Between Groups; the
  Cousineau-Morey correction ported and parity-exact; rowIds ship so
  paired bracket tests work; the factorial rm/rmCells design stays out
  of scope), Correlation Matrix (pairwise-complete r/p via the R-parity
  corrTest incl. exact Spearman/Kendall; corrRaw size-gated), and
  Likert (level-union batteries, 1..k means + t CIs, Cronbach's alpha
  with reflected reverse items, and the continuous many-level branch
  forcing the means-only type). Multi-variable role slots: drop appends,
  picker toggles, per-chip clear. Parity battery now 21 cases / 5633
  comparisons.
- M2f DONE (Jul 22 2026): data UNDO/REDO - Cmd/Ctrl+Z undoes and
  Cmd/Ctrl+Y (or Shift+Z) redoes DATA changes (cell edits, add row,
  exclusions, type changes). The engine binds the same keys at document
  capture for chart styling, so a WINDOW-capture router claims them for
  data only when the most recent action was a data edit (recency
  timestamps; engine undos re-commit through the sink, keeping chart
  streaks with the engine). Cmd/Ctrl+Y also clicks the engine's Redo
  when data did not act last. History caps at 50, clears on new data.
- M2e DONE (Jul 22 2026): jamovi-style SUPPLIER LAYOUT - a scrollable
  Variables box on the left (filter input appears past 8 columns - the
  200-variable case; assigned chips dim + carry role tags) and labeled
  role SLOTS on the right. Assign by drag, or click a slot for a picker
  menu; slot chips carry a clear button, drag between slots to MOVE an
  assignment, drag back to the box to unassign.
- M2d DONE (Jul 22 2026): jamovi MEASURE TYPES - ID / Nominal / Ordinal /
  Continuous with jamovi-style icons; a type menu opens from each variable
  chip AND each grid header. Semantics: ID columns are never offered to
  analysis roles; numeric ORDINAL columns work as values (numeric roles)
  AND as ordered categories with ascending levels; text ordinal keeps
  declared/first-seen order; legacy "numeric"/"factor" project files
  migrate on load. Plus the drag middle ground: the chip row is the
  labeled Variables box and chips DRAG onto the role boxes
  (kind-validated, dashed highlight), with the selects kept as the
  compact second path. One deviation from jamovi: an ordinal variable on
  a Scatter axis plots its actual numeric values, not 1..k level codes.
- M2c DONE (Jul 22 2026): per-cell EXCLUSION - right-click a cell for
  Exclude value / Include value. Excluded cells stay visible in the grid
  (struck through, dimmed, warm tint) but read as MISSING everywhere
  downstream (one choke point: retype() nulls them and skips their
  factor levels), so charts, stats, level lists, and the missing-values
  note all follow; the grid footer + datainfo disclose the count and
  Restore all clears them. Exclusions persist and toggle freely.
  (Torry's ask: something jamovi itself cannot do.)

## The Notebook workspace

Switcher key `pinboard`. **Grep for `pinboard`, not `notebook`.** The August
2026 rename was display-only and ratified that way, so ids, file-format
fields, function names and menu action keys all still say pin and board. Old
projects load untouched and probe selectors keep working. Do not clean the
naming up.

It is not a writing surface. There is no block model, no rich text, no
formatting controls and no prose. It is a lab notebook in the evidence sense,
an append-only chronological stack of frozen, provenance-tracked chart
captures, grouped into sections, each annotatable with a plain-text note in
the right rail. The hierarchy is OneNote's, one level deep. Notebook, then
sections, then pages, and nothing nests inside a section. Freeform
composition is Layouts' job, and that boundary is why this stopped being
called Pinboard. Judge it as a record, not as a document editor.

The vocabulary is load-bearing. A **section** is a `board`
(`PROJECT.pinboards`, `activePinBoard()`). A **page** is a `pin`
(`board.pins`, `pushPin()`, `PIN_SEL`). The verb is **Keep**, never Pin and
never Add. A page record is `{id, src, natW, natH, w, h, at, note, pageTitle,
srcChart, srcName, srcSig, srcDesc, srcType, srcVars, momEyebrow, momTitle,
momText}`. `src` is a full SVG data URI, so a page stays vector through the
board, a layout placement and the PDF.

Things worth knowing before changing it:

- **Provenance is resolved, not read.** `pinProvenance` derives the graph type
  by resolving the chart's option store OVER the payload template, because the
  store is empty until the user switches type and the engine writes nothing
  when you pick the type you are already on. Scatter switches through `xyBin`
  rather than `graphType`, so a heatmap is only visible there. Reading the
  store alone recorded no type for most pages, and the probe that should have
  caught it manufactured the field by poking `setOption`.
- **The freshness verdict never claims what it has not checked.** The snapshot
  epoch bumps on any edit anywhere, so a stale snapshot says "not checked" and
  heals into a true verdict the next time the source chart renders.
- **Exports carry the record.** `pinComposeWithRecord` nests the page's svg in
  a taller one and typesets the page number, kept date, source, drift verdict
  and note beneath it, reusing `wrapCaptionLines` from the chart exporter so
  the two cannot drift. A checkbox in the export dialog turns it off. Legacy
  bitmap pages get no band, because their bytes are returned before the
  composer runs.
- **The history is session-only and must not outlive its project.**
  `nbHistoryClear()` is called beside `layHistoryClear()` at all three project
  boundaries. Without it, undo could inject a page from a previous project.
- **Capture fidelity has laws.** `stripHoverFromClone`, `stampPinFonts` and
  `repairPinFonts` each exist because of a field bug. Read them before
  touching the capture path.
- A page can outlive the chart that made it. That is a feature.

Probes: `pinboard-check`, `notebook-record-check`, `notebook-pages-check`,
`notebook-undo-check`, `copy-moment-check`, `keep-fidelity-check`,
`provenance-check`, `rail-icons-check`, `doclifecycle-check`.

## The Layouts workspace

Switcher key `layout`. A layout is not a separate document type in storage.
It is a `PROJECT.charts` entry with `type:"layout"`, discriminated by
`isLayoutTab`, holding `items`, `page`, `view` and `nextLabel`. The code sits
in the `layout` banner section of `js/ps-shell.js` behind the `lay*` prefix.

It composes finished charts into one figure for a paper, a poster or a slide.
An `item.kind` is `chart`, `text` or `image`, and `laySizedKind` (chart or
image) is the predicate for anything that has a box. A chart panel is a LIVE
reference redrawn whenever its source chart changes; a Notebook placement
arrives as an `image` item carrying `srcChart`, which is frozen. The
selection badge, the rail card, the accessible label and the right-click all
state that difference in the same words.

Things worth knowing before changing it:

- **Pixels are the model, everywhere.** Units, zoom and the rail are display
  only. Never store a converted number. Zoom is a CSS transform on the canvas
  alone, so anything measuring with `getBoundingClientRect` inside it must
  divide by `layZoom()`.
- **A panel's box is not what the reader sees.** The chart snapshot is
  `viewBox="0 0 720 490"` with `preserveAspectRatio="xMidYMid meet"`, and
  `layoutTemplateRects` sizes cells from the page geometry alone, so a
  four-panel cell of 463 by 267 letterboxes the chart and leaves about 35 px
  dead on each side. Align, snap and the smart guides all act on the box.
  `layPlotFrac` / `layPlotRect` are the pair that reason about the DRAWN plot
  instead, and they measure the axis as a FRACTION of the item box so the
  number survives the zoom transform and a live drag transform.
- **Equal panels do not line their axes up.** A panel box carries its tick
  labels, so a column reading 100000 sits about 6 to 11 px off one reading
  0.10. `layAlignPlots` moves the panels so the plots coincide, grouping the
  selection by the column or row the panels already sit in.
- **Arrow keys mean two different things.** Inside `#ps-lviewport` plain
  arrows NAVIGATE between items and Alt+Arrow nudges, which is the engine's
  rule and the assistive-technology model. A second handler further down the
  same keydown function nudges on PLAIN arrows whenever focus is anywhere
  else in the workspace. A probe that focuses the viewport must press
  Alt+Arrow. Unifying the two is an open decision.
- **The canvas is `aria-hidden` on purpose.** A parallel hidden list of plain
  `role="option"` divs is the assistive-technology model, because a captured
  chart SVG would otherwise become a pile of nested interactive descendants
  inside an ARIA option. Mirror any new on-canvas chrome into the option
  list; do not un-hide the canvas.
- **View state is deliberately outside the undo snapshot.** Folding zoom,
  grid or snap in would make undoing a delete also switch the grid back on.
- **Never mix live `getBoundingClientRect` with animated transforms in slot
  math.** Cache geometry once at grab, the way the tab reorder does.
- **A plain Cmd/Ctrl chord needs a CAPTURE listener on window.** Something on
  the way down stops propagation, so a bubble-phase window keydown never sees
  `=` or `-` while `0` arrives, which makes a half-bound shortcut look like a
  working one.

## Known gaps (documented, deliberate)

Checked and rewritten Jul 26 2026 (punch list t4-14). Three of the five
bullets that used to sit here were superseded by M6b and the shipped
builders, under a heading a reviewer trusts, which made this section the
most misleading page in the repo. What actually still holds:

- **Shapiro-Wilk is client-computed**, so `distNormality` is populated but
  is not R's `shapiro.test` to the last digit. It was empty in v1; the
  older wording here said so long after it stopped being true.
- **LOESS confidence bands are approximate.** `loessFit` estimates the
  effective degrees of freedom as `1.2 * (n / q)` rather than R's exact
  trace-based value, so the CURVE matches R and the BAND does not. As of
  Jul 26 2026 the app says so on the chart itself, in the same note that
  carries the missing-data count, and only when a band is actually drawn.
  Linear and polynomial fits are exact-R.
- **Nominal level order is FIRST-SEEN, not sorted.** R's `factor()` sorts
  levels, so the same CSV can produce a different X order - and therefore a
  different palette assignment - in this shell and in jamovi. First-seen is
  deliberate here (it keeps a meaningful entry order such as Control / Low
  dose / High dose, which alphabetical sorting would scramble to Control /
  High dose / Low dose), but it IS a divergence, and the parity harness
  cannot see it because `m1-parity.R` passes explicit levels for every
  factor. Ordinal levels ascend numerically, which matches jamovi.
  **Open decision for Torry:** match R and sort, or keep first-seen and
  document it as a deliberate difference. Either is defensible; what was
  not defensible was leaving it unwritten.
- **Scatter marginals / heatmap bins / 2-D density contours** are computed
  client-side by the ENGINE when enabled; the shell stores but never
  echo-renders those option keys (a payload rebuild would wipe the
  engine-computed geometry), so after a reload they need re-enabling.
- **Dark mode is DECLINED, not pending** (Torry, Jul 26 2026; punch list 43
  and t4-24). This is a decision, not a gap, and it is written here because
  leaving it silent is exactly what made it read as an oversight.
  The reason it would have been expensive: the chart pane is the ENGINE's,
  and the engine hardcodes its light surface (panel backgrounds, tick and
  label greys, the inspector chrome) in 4,628 literal hex values (931
  distinct) across `inst/widget/graphbuilder2.js`. That file is shared with
  the jamovi module, so a dark theme is not a shell change; it is an engine
  project with a jamovi-side blast radius. The half that IS cheap - dark shell
  chrome around a light chart pane - was considered and rejected on its
  own terms: a white rectangle glowing in a dark frame is worse than either
  consistent choice, and the chart is the thing people look at.
  If it is ever revisited, the shell is ready for it: every shell colour
  already resolves through the `--ps-*` token layer, so the chrome half is
  a token swap. The engine half is the work.

## Files

- `index.html` - the shell page (dev form: loads the engine via
  `<script src="../inst/widget/graphbuilder2.min.js">`).
- `js/ps-stat.js` - the numeric core (R-parity stat mirrors; see Status).
- `js/ps-data.js` - per-module payload channel builders mirroring each
  jamovi .b.R aggregation row for row, plus the module/role registry.
- `js/ps-shell.js` - project state, CSV import, roles UI, the setOption
  sink, the render/echo loop, chart tabs, and the layout canvas.
- `js/ps-tour.js` - the "Show me how" walkthroughs (Help menu). A
  walkthrough moves a simulated cursor over the REAL chart and performs the
  real interaction, so the real panels roll out and the chart really
  changes; there is no video to re-record when the UI moves. Tours are data
  at the bottom of the file, and their targets are semantic
  (`data-role` / `data-kind` / `data-field`), never coordinates. Three
  engine facts constrain the driver, all of them learned the hard way and
  all of them guarded by `verify/tour-check.mjs`:
  (a) synthetic clicks need real coordinates AND `detail:1`, because the
  engine drops synthesized clicks at (0,0) with `detail===0` (a Qt
  WebEngine artefact it defends against);
  (b) aim with `document.elementFromPoint`, not at the element itself - the
  engine floats invisible HTML hit strips above the SVG, so an axis click
  must land on the strip, not the zero-width `<line>` under it, and the
  click point must be the TRUE geometric centre (padding a zero-width rect
  by even 1px misses the strip);
  (c) resolve targets lazily and take the first VISIBLE match - every
  commit rebuilds the panel DOM, and the engine keeps retired chrome in the
  document (there are two `[data-field="max"]` inputs and the first in
  document order is a hidden legacy popover).
  All tour chrome is `ignore-html`, so it never rides an export or a copy.
- `build-templates.R` - generates the committed payload templates by driving
  the real module marshalling headlessly and mechanically diffing payloads
  from dissimilar datasets to find the data-dependent keys ("channels").
- `templates/` - generated, committed: `<module>.json` (template payload),
  `<module>.channels.json` (channel list), `templates.js` (script-src
  wrapper; file:// pages cannot fetch local JSON).
- `verify/` - probes (playwright via createRequire from /tmp/node_modules;
  real-gesture edits; forced flush law: zero `__gb2_inspectorInputAt`
  before dispatching beforeunload; panel elements can sit below the fold -
  scrollIntoView before page.mouse clicks).

## Run

```
bash standalone/build-dist.sh          # build dist/pandion-plots.html
```

`dist/pandion-plots.html` is the SHIPPABLE form: one self-contained file
(engine + templates + shell inlined) that runs from anywhere - double-click,
email, course page, web host.

`standalone/index.html` is the DEV page: it loads the engine from
../inst/widget/, so it only works opened from inside the repo (a copied or
moved standalone/ folder shows "chart engine failed to load" - the data and
roles UI still render because those files live inside standalone/).

```
bash standalone/verify/run.sh          # all probes incl. dist (parity needs jmvcore)
```

```
Rscript standalone/build-templates.R   # regenerate templates (needs jmvcore)
```

## Harness laws learned here

- **A probe must not write the state it is testing for.** The Notebook page
  list is named from a graph type the shell records at keep time.
  `notebook-pages-check` poked `setOption('graphType', ...)` before every
  keep, which MANUFACTURED the field whose absence was the defect, so its
  naming assertions passed against a state a user cannot reach and the probe
  ran green over a broken feature for the length of a dive. That is worse than
  having no probe, because it produced confidence. If an assertion depends on
  a field, reach that field the way a user does, or leave it alone entirely
  and assert on what the app puts there by itself. The corollary is that a
  control has to be judged, not just run: a probe that dies on a missing DOM
  node before testing anything proves only that new markup is absent, which is
  true of any new feature.
- **A jsPDF file's text lives in Flate streams**, so a raw byte search over an
  exported PDF is a false negative, and a naive `indexOf('stream')` also
  matches `endstream` and walks the offsets off the data. Match
  `/stream\r?\n/`, trim the trailing newline before the keyword (node's
  inflate tolerates trailing bytes, the browser's `DecompressionStream`
  rejects them), then join the parenthesised literals. `python3` with `fitz`
  (pymupdf) is the easier route when the probe can reach outside the browser.
- **The app-menu button toggles**, so a probe that reads the Edit menu twice
  closes it on the second read and asserts against stale rows. Press Escape
  first and confirm the menu is closed by COMPUTED display, not the inline
  one, which is the empty string before the menu has ever opened.
- **`PS_TOUR.play()` returns a promise that resolves when the tour ends**, so
  `page.evaluate(() => PS_TOUR.play(k))` blocks for the whole walkthrough.
  Fire it inside a block body to observe a tour while it runs.

- Rscript runs in the C locale: force `Sys.setlocale("LC_ALL",
  "en_US.UTF-8")` BEFORE sourcing the b.R files or the multibyte facet
  separator degrades to ASCII "<c2><a6>" inside emitted payloads, and
  never pass multibyte strings through an R toJSON of extracted text -
  write raw payload bytes per case through a binary connection.
- Ellipse parity compares phase-invariant moments (center / area / second
  moments over the 99 unique samples): eigenvector SIGNS are arbitrary on
  both sides, so pointwise comparison false-fails.

## Rules (from the brief - do not drift)

- Engine changes must be ADDITIVE and jamovi-safe; after ANY engine edit run
  `bash scripts/verify/run.sh` on both bundles.
- The setOption sink DROPS jamovi-only option traffic. Checked against
  `DROP_KEYS` Jul 26 2026, and the list here had drifted twice: it is
  `clientBundleHash`, `exportRequest`, `exportPath`, `chartSnapshot` and
  nothing else. `paletteLibrary` and `styleLibrary` are INTERPRETED as the
  one-shot library actions they are (M5c, Jul 23 2026, see above), and
  `styleStamp` is handled in the sink rather than dropped. A rule someone
  acts on has to match the code it describes.
- Set `window.__gb2_authoritativeRender = true` before every shell-initiated
  render.
- Never persist underscore-prefixed keys; keep source ASCII (escapes only).
- Shell numerics round to 10 significant digits (`toPrecision(10)`) to match
  jsonlite's `digits = I(10)` so echoes hash-match the engine's folds.
