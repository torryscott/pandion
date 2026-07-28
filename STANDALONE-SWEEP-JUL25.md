# Pandion Plots standalone: sweep findings

Jul 25 2026. Read-only. Nothing in `standalone/`, `inst/widget/`, or
`website/` was modified.

Method: the running app was driven directly (start center, data grid,
chart editor, export dialog, layouts, menus, a deliberately messy CSV
import) at 1440x900 and at 1366x768, with the shell CSS and DOM measured
live in the page; in parallel eight agents each read one dimension of the
source, and a second agent per dimension tried to refute every claim
against the tree. Findings that the refuter knocked down are not listed
here. Numbers below are measured, not estimated.

CORRECTIONS (Jul 25, after an independent re-check): the shell's real
transition count is 4 not 5; `MODULE_GUIDE` has no raincloud glyph (it is
one character per module); `hideWelcome` has nine call sites, of which the
three named are the adopt paths; `pandion-mark.svg` is referenced in the
unpublished v2/v3 drafts; six live italic sites, not seven.

NOTE: `standalone/index.html` and `js/ps-shell.js` were edited by another
session AFTER this sweep (3071 to 3113 lines, 10411 to 10440). Line
references can sit tens of lines high. Search the quoted code, not the number.

---

## Calibration first: what is genuinely strong

This matters because most of this document is problems, and the ratio is
not representative.

- **The application frame is real and correct.** A 34px app bar with a
  working menu bar, a 43px command bar, a three-pane body, a 25px status
  bar, a command palette, preferences, session restore that survives a
  reload including the active workspace. That is application
  architecture, not a web page with a header.
- **The analysis layer is faithful.** `js/ps-data.js` is a line-by-line
  port of the `.b.R` files (Cousineau-Morey at `ps-data.js:733`,
  chi-square with Haberman residuals at `ps-stat.js:411`, exact Spearman
  and Kendall p at `ps-stat.js:266`/`320`, Cronbach alpha at
  `ps-data.js:1020`). The parity harness compares 5,707 values.
- **The engine bridge is disciplined.** The overlay-cache work (M6b),
  the heatmap self-heal (M6d), and the library bridge (M5c) all solve
  genuinely hard problems without touching the engine.
- **The data workspace is dense and correct** where it counts: 21px
  rows, tabular numerals, sticky headers, draggable dividers,
  virtualization, real context menus, range selection, find.
- **The export path is better than jamovi's** in format coverage
  (SVG / PDF / PNG / JPG, all client-side) and it emits clean
  chrome-free output.
- **Destructive data actions already offer undo toasts** and disabled
  commands explain themselves. That is a level of care most apps skip.

---

## Part 1. Why it reads as web design instead of software

The frame is right. The surface on top of it is not, for six measurable
reasons. Ranked by how much each one costs.

### 1. The type you specified is not the type on screen (a bug)

`standalone/index.html` contains **22 declarations of the form
`font: <weight> <size> inherit`**, for example:

- `index.html:1201` `.ps-menubar button { font: 12px inherit; }`
- `index.html:1224` `.ps-command { font: 600 11.5px inherit; }`
- `index.html:1268` `.ps-workspace-switcher button, .ps-project-item { font: 500 12px inherit; }`

This is invalid CSS. In the `font` shorthand the last component must be
a real family name; `inherit` is only legal as the *entire* value
(`font: inherit`, which the file uses correctly twice). An invalid
shorthand means the browser discards **the whole declaration**, so those
elements fall back to the user-agent default for form controls.

Measured in the running app: **51 of 67 visible controls render in
Arial 13.3333px weight 400** instead of the system stack at 11.5 to 12px
semibold. Every menu bar item, every command bar button, the workspace
rail, project items, context menu items.

Verified by injecting `.ps-page button, .ps-page input, .ps-page select,
.ps-page textarea { font-family: inherit }` plus the missing size and
weight longhands into the live page: the count went 51 to 0 and the
chrome immediately tightened. This was done in the browser only.

This single defect is doing a large share of the "web page" work,
because browser-default Arial next to deliberately sized SF Pro labels is
the exact fingerprint of an unstyled web form. Effort: S.

### 2. There is no design system, and the site has one

| | app | website |
|---|---|---|
| `:root` design tokens | 0 | 8 (`--navy #192E49`, `--cobalt #375CA0`, `--sky`, `--amber #E3A12E`, `--ink`, `--muted`, `--line`, `--wash`) |
| distinct hex literals | 351 | governed by the token block |
| font sizes | 19, seven of them inside the 9.5 to 12.5px band | about 8 |
| border radii | 12+ (2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 17px) | consistent |
| box-shadow rules | 44 | sparing |
| z-index values | 5, 8, 1000, 1001, 9999, 10000 (x5), 11000, 12000, 12500, 13000, 13500, 14000 | n/a |

None of the four brand colors appears anywhere in the app. The app's
primary `#3573bd` (33 uses) appears zero times on the site: it is the
engine's inherited jamovi-era blue, never chosen. The one exception is
the welcome screen, which paints an amber radial gradient
(`index.html:1971`).

The honest reason the site looks more professional is not that it is
prettier. It is that the site is **governed** and the app is not. Half
pixel type tiers (9.5 / 10.5 / 11.5 / 12.5) are the fingerprint of
per-component eyeballing rather than a scale, and they land on
fractional baselines.

### 3. The main pane is still a web page inside the app frame

Two of the three panes were correctly converted to application regions
(the inspector was de-carded, the data grid runs edge to edge). The
chart pane, the one the user looks at most, was not. It keeps 14px
padding, a 6px radius and a drop shadow, floating on a gray page.

Supporting evidence:

- `index.html:16` still ships `.ps-page { max-width: 1080px; margin: 0
  auto; padding: 18px 20px 40px }`. That 1080px is the marketing site's
  `.wrap` value, superseded 1164 lines later by the app frame, its
  `.ps-head` rules now dead.
- `index.html:1419` puts `backdrop-filter: blur(8px)` on the sticky
  workspace heading. A translucent blurred sticky header is a marketing
  site idiom, not application chrome.
- The chart is a fixed 6 x 4 inch figure (`plotWidth`/`plotHeight` in
  the templates, 576 x 384px at 96 DPI). `grep plotWidth js/ps-shell.js`
  returns nothing: the shell never touches it. At 1440x900 that leaves
  roughly 137px of dead white on each side inside the card. There is no
  zoom, no fit-to-window, and no way to make a wide or tall figure,
  although the Layout workspace does have a zoom control.

The result is a graphic centered in a box, which is the definition of
web layout.

### 4. It is missing the small physical tells of native software

Each of these is individually invisible and collectively decisive.

- **Chrome is text-selectable.** `user-select: none` covers only the app
  bar, status bar, panel titles and a few drag surfaces. Drag across a
  toolbar and it highlights like prose.
- **Cursor policy is inverted.** `cursor: pointer` appears 36 times.
  Desktop applications use the arrow on their own controls and reserve
  the hand for hyperlinks; this does the opposite almost everywhere.
- **Tooltips are native `title=` attributes**: roughly 1.5s delay, OS
  styling, no keyboard access, no consistency with the engine's own
  tooltips.
- **Right-click still opens the browser menu** on the chart, the layout
  canvas, role cards and the inspector. The data grid is the exception.
- **Icons are half a system.** 8 hand-drawn SVGs alongside 8 Unicode
  dingbats (`▦ ▥ ⊞ ↗ ↓ ‹ › ⋯`). On ChromeOS and Windows those come from
  a fallback font at a different weight and baseline.
- **Scrollbars are unstyled in 15 overflow regions.** On Windows and
  ChromeOS each renders a 15 to 17px opaque OS bar; the 205px project
  rail loses 8 percent of its width to one.
- **Two pressed-state rules against 57 hover rules.** Clicks do not feel
  like they land.
- **Italic UI text** in seven places. Italics are a print convention; at
  9.5 to 11px they read as copy, not state.
- **No web app manifest.** No `manifest`, no `display: standalone`, no
  `apple-mobile-web-app`. The product can never leave the browser tab,
  which is the most literal possible version of "a web page rather than
  software that happens to run in a browser."

### 5. Almost nothing moves

The shell's entire stylesheet contains **four transition declarations
and one `@keyframes`** (an attention pulse). Hover states hard-cut.
Workspace switches, tab changes, inspector pane swaps, role picker
expansion, every dialog and the command palette all appear with
`display: flex`. Meanwhile the engine directly below animates bar
reorders, error-bar changes and line vertex tweens on a 250 to 260ms
clock. See Part 2, which is the more interesting half of this.

Also: the reduced-motion preference in Preferences currently governs
only the attention pulse, so it is effectively a no-op in both
directions.

### 6. Structural leftovers from the page era

- **No pane splitters.** Both rails are hard-coded (205px and 330px).
  The CSS for a collapsed inspector (`.ps-no-inspector`) exists but the
  class is only ever removed, never added, so it is dead code. Worse,
  the engine's own Sigma panel copy tells the user to "widen jamovi's
  splitter", which does not exist here.
- **Two document navigators.** Every document appears in the left
  project rail and again in the tab strip, and the active document's
  name appears a third time in the 48px workspace heading.
- **Five different modal treatments** (welcome, loader, new chart,
  preferences, export) with four scrims, four radii and four shadows.
  A user meets four of them in the first minute.
- **The status bar carries a tutorial sentence** ("Click a chart element
  to edit") and a restatement of the save state instead of live
  readouts. The grid footer likewise spends permanent chrome on
  instructions where Excel, Sheets and Numbers all put Sum / Average /
  Count for the current selection. This is the clearest single example
  of the complaint.
- **The inspector leads with Delete.** Rename, Duplicate and Delete
  (used once per document) sit above the variable roles (used every few
  seconds).
- **Horizontal scroll bug**: between roughly 760px and 1240px of
  viewport width the entire main pane scrolls sideways.
- **At 1366x768**, the standard classroom Chromebook, roughly 239px of
  stacked chrome sits above a 384px chart, so opening any engine editor
  panel pushes it below the fold and the chart scrolls away while you
  edit it.

### What to do about it, as a system

Not a list of tweaks. Five moves in order.

1. **Fix the font shorthand and add a token layer.** One global
   `button, input, select, textarea { font: inherit }` reset plus the
   missing size and weight longhands, then a `:root` block adopting the
   site's eight tokens plus a radius scale (4px controls, 6px surfaces,
   nothing else), a type scale (11 / 12 / 13 / 15 / 20, no half
   pixels), and a spacing scale. Delete the dead `.ps-page` page CSS.
   This is mechanical and it is most of the visual gap. Effort: M.
2. **Give the chart pane to the chart.** Decide explicitly that the
   chart is a *document canvas*, then commit to it: a neutral canvas
   background, the figure as a page with a hairline and a real shadow,
   a zoom control with fit-to-window, and the figure size exposed
   (`plotWidth`/`plotHeight` are already payload keys the shell simply
   never sets). Remove the card, the 14px padding and the blurred
   sticky header. Effort: M.
3. **Dock the engine's editor instead of letting it push the chart
   down.** The engine renders its inspector below the chart inside the
   host. The shell can give the host a fixed-height region with its own
   scroll so the chart never leaves the screen, which fixes the 1366x768
   problem without touching the engine. Effort: M.
4. **Adopt the native tells**: `user-select: none` on all chrome,
   arrow cursors on controls, a shell tooltip layer at about 400ms, a
   `contextmenu` handler on every surface, styled scrollbars, an
   `:active` state, and one icon set (replace the eight dingbats with
   SVGs at the same 1.5 stroke weight the existing eight use).
   Effort: M, and it buys more than its size suggests.
5. **Ship a web app manifest.** `display: standalone`, name, theme
   color, the existing icons. On ChromeOS and Windows the student then
   installs Pandion from the address bar and it opens in its own window
   with no browser chrome at all. This is the single most literal answer
   to the question, and it is roughly an afternoon. Effort: S.

Optional sixth: a dark chrome / light canvas theme (the Figma and
Illustrator convention). It reads as professional tooling precisely
because the white figure sits inside dark chrome. The engine draws a
white chart regardless, so this works *with* the constraint rather than
against it. There is currently no `prefers-color-scheme` handling
anywhere in the app, although the favicon has it.

### Do not do this

- Do not add more shadows, gradients, large radii, hero type or
  illustration to the app. Every one of those moves it further toward
  the site.
- Do not restyle the engine's chrome to match the shell. The shell
  should meet the engine's metrics (3 to 4px radii, 11px text), not the
  other way round, because the engine is the part that cannot change and
  it is already the more app-like of the two.
- Do not introduce a third accent color. There are already two blues
  (shell and engine) plus Help Me Choose's own family.

### The seam with the engine, stated plainly

Two inspector systems currently coexist: the shell's right rail (which
shows Chart setup and does not respond to chart selection) and the
engine's bottom panel (which does). A user clicking a bar gets an editor
in a different place, in a different visual language, from the panel
they were just using.

The honest options are (a) shell adopts engine metrics and frames the
engine region as the document surface, or (b) shell moves its own
inspector content out of the way when the engine's panel is open. Both
are shell-only. What does not work is pretending they are one panel.

---

## Part 2. The animations are already built and the shell switches them off

This is the most useful finding in the sweep.

The engine ships real motion: stat-morph glides when a summary or
error-bar type changes, FLIP reorders when categories move, line vertex
tweens so a line stays glued to its markers. Default duration is 250ms
(`graphbuilder2.js:100130`). The engine deliberately refuses to animate
on an authoritative render:

```
if (_gb2AuthRender) return;           // echoes never animate
```
`graphbuilder2.js:100127`

The shell sets `window.__gb2_authoritativeRender = true` before every
render (`ps-shell.js:2468`) and schedules one **120ms after every
committed option**:

```
echoTimer = window.setTimeout(render, 120);
```
`ps-shell.js:3220` and `:3247`

So on every edit the engine begins a 250ms animation, and 120ms later
the shell replaces the whole chart DOM with a render that is flagged as
an echo. The animation is cut roughly in half, every time. In jamovi the
R round trip takes 1 to 2 seconds, so the same animations play in full.
That is why the jamovi build feels smoother than the standalone despite
the standalone being faster.

The shell also forces `transition: none !important` onto the engine's
toolbar (`index.html:914`).

Fixes, all shell-only:

- Raise the echo past the motion window (about 320ms), or better, hold
  the echo while an engine animation is in flight.
- Consider not echoing at all for pure style commits. The engine has
  already applied them locally; the echo exists to keep the shell's
  payload authoritative, which could be done without a repaint.
- Drop the `transition: none` on the engine toolbar and see whether the
  layout override still needs the `transform: none`.

Then the shell's own motion: adopt the engine's clock rather than
inventing one. 150ms ease-out for state changes, 200ms for panel
reveals, nothing over 250ms. Specifically missing today: dialog and menu
open, workspace and tab switches, inspector pane swaps, role picker
expansion, the empty-state to chart transition, drop affordance on file
drag, any busy indicator at all, and a pressed state on any button.

---

## Part 3. Things a user will actually hit

### Tier 0: correctness and data integrity

1. **Leading zeros are silently destroyed.** `inferType`
   (`ps-shell.js:133`) calls a column continuous if every non-missing
   value passes `isFinite(Number(v))`. Verified live: participant id
   `001` displays as `1`, zip `02138` as `2138`. An `id` type exists in
   `VAR_TYPES` (`ps-shell.js:92`) and is simply never inferred. The raw
   strings survive in `t.raw`, so this is a display and inference
   problem, not lost data, but the student sees wrong values.
2. **All chart tabs share one engine undo stack.** The engine's LS key
   is the bare constant `graphbuilder2.undo.v2`
   (`graphbuilder2.js:91941`) and the shell renders every chart document
   into the same host. Cmd+Z in the Charts workspace is deliberately
   handed to the engine (`ps-shell.js:6260`), so undo after switching
   tabs can write chart 1's old option value into chart 2's option
   store. Fixable shell-side without touching the engine:
   `window.gb2_undo.stack` and `.redo` are live array references
   (`graphbuilder2.js:92404`), so the shell can stash and swap them per
   document on tab switch.
3. **The Sigma Normality tab prints a false explanation.**
   `ps-data.js:261` ships `distNormality: []` (a documented v1 gap: no
   client Shapiro-Wilk), and the engine's panel then tells the student
   their sample is the wrong size. A student reads that as a fact about
   their data. Either compute Shapiro-Wilk or suppress the tab.
4. **Layout and export snapshots go stale after data edits.** Only the
   active chart re-renders; a figure composed in the Layout workspace
   can keep showing pre-edit data.
5. **`dataHiddenPoints` is O(n^2) and runs on every render**: measured
   around 2.6s at 20k rows, and it runs on every 120ms style echo too.
6. **Nominal level order is first-seen, not sorted**, a silent
   divergence from R that the parity harness cannot see. The same CSV
   can produce a different category order in jamovi and in the
   standalone.
7. **LOESS is an acknowledged approximation** (`ps-stat.js:474`) with no
   disclosure in the UI, on a chart that presents itself as research
   grade.
8. **Computed variables have no cycle detection**: `A = B + 1` and
   `B = A + 1` both compile clean.
9. **Escape does not cancel a layout drag** and leaves the drag live.
10. **The layout editor has no undo at all.** Deleting a chart panel, a
    caption or an image is permanent, and Cmd+Z afterwards undoes an
    unrelated chart edit.
11. **Layout export silently omits any chart panel that has no
    snapshot.** The on-screen canvas is honest and paints a
    `ps-lmissing` placeholder (`ps-shell.js:8029`); the SVG / PNG / PDF
    composition just leaves the panel out. You export a four-panel
    figure and get three panels with no warning.
12. **Style and palette library writes fail silently.**
    `saveLibrariesNow`'s catch is empty, so a quota-full save produces
    no toast, no health change and no diagnostics entry, and the library
    is the one thing a `.pand` round trip does not recover.

### Tier 1: the first sixty seconds

11. **Dropping a CSV on the start screen looks like nothing happened.**
    The document drop handler fires (`ps-shell.js:9434`) and opens the
    import preview at `z-index: 9999`, underneath the welcome overlay at
    `13000` (`index.html:1026`, `1967`). This is the single most natural
    first action a user can take.
12. **The welcome dialog has no close control**: no X, no Close, no
    backdrop click.
13. **Nothing ever tells a student the chart is clickable.**
    Click-anything-to-edit is the product's defining capability and the
    thing the website leads with.
14. **One stray token demotes a whole numeric column.** Missing tokens
    default to `""` and `"NA"` only (`ps-shell.js:79`). Verified live: a
    single `n/a` turned a numeric column nominal with levels
    `["10","12","n/a","14","15","16"]`. Worse, the escape hatch does not
    fully work: `setMissingTokens` (`ps-shell.js:4062`) calls `retype`
    but never re-infers, so declaring `n/a` missing leaves the column
    nominal and the user must also change the type by hand. Nothing
    explains either step.
    The right shape here is the one you already ruled on for reshape:
    refuse and explain by default, then offer the one-click remedy.
    "23 of 24 values in *score* are numbers. One value (`n/a`) is not.
    Treat it as missing?"
15. **Import failures blame the wrong thing.** A header-only file, an
    unsupported binary and a genuinely malformed delimiter all produce
    the same delimiter message.
16. **The engine-load failure message tells the student to run a bash
    script** (`ps-shell.js:2440`).
17. **Reset styling is destructive, top-level, and silent.** One click
    discards every style edit on that chart, with no confirmation and no
    undo toast, from a button that sits permanently in the command bar.
18. **No busy state on import or long operations.** A 13MB CSV freezes
    the tab for around a second with nothing on screen. (Export is the
    exception and does have a proper busy state.)

### Tier 2: application shape

19. **No `beforeunload` guard anywhere in the shell.** In practice
    autosave covers most of it, but an in-flight style edit inside the
    engine's 700ms debounce is dropped outright on tab close. Relatedly,
    opening a recent project or the start center replaces live work
    immediately with no unsaved-work check.
20. **Two browser tabs silently overwrite each other's project and
    library.**
21. **`navigator.storage.persist()` is never requested**, so all work
    sits in evictable storage. On shared classroom machines that is a
    real loss vector.
22. **The recovery ladder switches itself off silently, in order of
    increasing project value**: recents stop being written above 900,000
    bytes (`ps-shell.js:1076`, and they are capped at 3 anyway), the
    backup tier above 1.5MB, autosave above its own ceiling. A
    5,000 x 20 classroom survey produces a 1.21MB snapshot, so recents
    never work for real data. The save-state chip still says "Autosaved
    locally".
23. **The data grid has no arrow-key navigation and no Cmd+A.**
24. **No document-tab keyboard model**: no Cmd+W, Ctrl+Tab, Cmd+1..9.
25. **Roughly 35 data commands exist only behind right-click.** There is
    no Data menu and they are not in the command palette.
26. **Cmd+P prints the DOM.** No print stylesheet, no Page setup.
27. **No data export in any format.** A student can import, retype, edit
    cells, add computed variables, filter rows and reshape long to wide,
    and then cannot get the cleaned table back out. The raw strings are
    already preserved in `t.raw`, so this is small.
28. **The window title never shows the dirty state or the file.**
29. **No global error boundary.** `buildPayload` and the aggregation
    path sit outside the render try/catch, so an exception there leaves
    a blank card and a console message.
30. **The keyboard shortcuts sheet has no keyboard route** (no F1, no
    bare `?`) and is deliberately excluded from the command palette. It
    is also hand-written HTML that has already drifted from the code,
    and it documents one Cmd+Z when the app carefully implements two.
31. **About is a toast.**

---

## Part 4. Gaps against the jamovi build

- **Repeated Measures is on the legacy flat path**: `measures` and
  `betweenVar` only, no `facetVar` (Panels) and no crossed or factorial
  within-subject design, which the jamovi module supports.
- **The user guide is unreachable from the standalone**, and from the
  website. `docs/user-guide.html` is a finished illustrated manual that
  only jamovi users can currently find.
- **The engine's Basics help points at an Export button the shell
  hides** (`index.html:1021`).
- **Help Me Choose ships without the wizard's chart thumbnails**, its
  grouping-versus-panels teaching tip, and its handoff into the in-chart
  help tabs. It is also not in the Help menu; it is reachable only from
  the New chart dialog and the empty state.
- **The Chart settings Diagnostics checkbox is a dead control** in the
  browser.
- **`.omv` import is one-way**: dataset only, no analyses in, nothing
  out. An `.omv` column whose `measureType` is unmapped defaults to
  Continuous and reads as entirely missing.
- **No provenance surface.** Nothing records what produced a chart:
  no dataset name, no filter state, no app version in the export.
- **Payload templates carry no engine-version stamp**
  (`templates/templates.js:1`), so an engine change that alters a
  payload key drifts silently until something visibly breaks.
- **The engine's undo blob and the shell's autosave compete for one
  ~5MB localStorage quota and neither knows about the other.** The
  engine sizes its undo budget by measuring the cached bundle, which in
  the standalone does not exist.
- Bubble sizing and per-point labels are fully built in the engine and
  exposed in neither shell. That matches your Jul 9 ruling, so it is
  consistent rather than an oversight, but the capability is sitting
  there.

---

## Part 5. Site and app as one product

- The site is a governed design system on three pages: one `:root`
  token block, one type stack, a coherent 24px stroked icon set,
  confident dash-free copy. Adopting those eight tokens in the app is
  the cheapest possible unification and it does not make the app more
  web-like, because tokens are values, not decoration.
- **The New chart dialog draws chart types as character glyphs while
  eight real renders sit unused** in `website/assets/gallery/`. That is
  the most important decision surface in the product.
- **The deployed app page has no metadata and no route back to the
  site.** A student who lands on `/app/` from a shared link cannot get
  to the guide, the gallery, or anything else. The app contains zero
  external links of any kind: no website, no documentation, no way to
  report a problem.
- **The privacy promise is missing from the app.** "No accounts, no
  uploads: your data never leaves your machine" is the site's most
  load-bearing claim and the app never says it, which is exactly where a
  student needs to read it.
- Four colorways of the brand mark are in circulation, and
  `pandion-mark.svg` (already recolored to the site tokens) is used
  nowhere on the live site, only in the unpublished v2/v3 drafts.
- Shell secondary text fails AA contrast at sizes the site never goes
  near (8.5 to 9.5px muted grays).
- **The site and the app disagree about what version this is.** The site
  says "Current release 3.0.0" (`website/index.html:331`) and prints an
  APA citation for "Version 3.0.0" (`website/about.html:238`), while the
  app reports `0.9.0-rc1` (`ps-shell.js:39`) in its About toast. 3.0.0
  is the jamovi module's version. A student citing the browser app would
  cite the wrong thing.
- **The app carries no license, copyright or citation surface**, despite
  GPL-3.0 and a whole "Citing Pandion Plots" section on the site.
- **The site's only product screenshot predates the M6e role-picker
  redesign**, so it advertises a UI that no longer exists.
- **The web app is byte-identical to the portable download.**
  `website/app/index.html` and `standalone/dist/pandion-plots.html` are
  the same 3,416,197 bytes. The "open it in your browser" product and
  the "put it on a USB stick" product are one file, with no
  web-appropriate build: no manifest, no service worker, no caching, and
  3.4MB re-downloaded on every visit for a Chromebook on school wifi.
  `website/app/index.html` is a manual copy made by `website/build.sh`.
  It is currently in sync; nothing enforces that.

## Housekeeping

- Four prose em dashes remain in user-facing strings, against the house
  rule: the browser tab title (`ps-shell.js:8932`), two status bar
  strings (`:4144`, `:4145`), and a Help Me Choose line (`:6955`). The
  three em dashes used as missing-value tokens (`:604`, `:737`, `:4923`)
  are correct and match the engine's convention.
- The README's "Known v1 gaps" section is stale: it still describes the
  scatter overlay reload gap that M6b closed.
- `templates/manifest.json` advertises `distNormality` as a live channel
  the shell never fills.
- No verify probe covers the first-run surface or any import-failure
  path, which is why the Tier 1 items above are invisible to the suite.

---

## Suggested order

If the goal is "it should feel like software", the first four items in
Part 1's system plus the echo-timer change in Part 2 will do most of it,
and none of them touch the engine. If the goal is "a student should not
get stuck", Tier 1 items 11, 13, 14 and 17 are the ones that will bite
in a classroom.


---

# Appendix A: the design system proposal in detail

The counter-moves in Part 1 stated at the level of "what to do". This is
the same argument at the level of "what values to type", produced by the
design pass of the sweep and checked against the same measurements. It
is the most implementation-ready part of this document. Where it and
Part 1 disagree in emphasis, prefer this one: it is more specific.

Two notes before reading it. First, its step 0 (a web app manifest) is
the single highest-ratio item in the whole sweep and is not a design
change. Second, it argues for declining dark mode rather than adding it,
on the grounds that the engine hardcodes light chrome and a dark shell
would be a second design system to maintain. That argument is better
than the one in Part 1 and supersedes it: the honest choice is to
decline it explicitly so it stops reading as an oversight.

# The frame is a web page wearing an app's clothes

## Diagnosis: six properties, each measurable

**1. The page is still literally in the file.** `standalone/index.html:16` opens the stylesheet with `.ps-page { max-width: 1080px; margin: 0 auto; padding: 18px 20px 40px }`. That 1080px is copied verbatim from the marketing site's `.wrap` (`website/index.html:36`). It is superseded 1164 lines later by the application grid at `index.html:1180-1184`, and its companions `.ps-head / .ps-head h1 / .ps-head .ps-tag` (17-23) have zero DOM uses. Anyone reading the stylesheet top-down inherits the page metaphor before they reach the app.

**2. Content floats instead of filling.** The main pane scrolls (`index.html:1411-1413`), the chart sits in a rounded shadowed card that keeps 14px of padding (`.ps-card` 33-36, overridden to radius 6 + shadow at 1424-1426, applied at 2375), the engine toolbar inside it gets its *own* border + radius 6 + shadow (895-919), and the whole thing sits under a sticky heading at `rgba(238,241,245,0.96)` with `backdrop-filter: blur(8px)` (1415-1420). That is byte-for-byte the site header recipe at `website/index.html:40-43`. Meanwhile the chart itself renders at a fixed 576x384 (plotWidth 6in x 96px/in, `templates/plotbuilder.json`), so at 1440 wide it floats with roughly 137px of dead white on each side while the toolbar controlling it spans 851px. The Data workspace already got this right and proves the point: `.ps-datagrid-card { padding: 0 }` (498-500) and an edge-to-edge command bar with only a border-bottom (502-507).

**3. Nothing is governed.** 351+ distinct hex literals, zero `:root` blocks (only two custom properties exist in 3071 lines, and one is never declared). 67 background surfaces, 73 one-pixel border colors. 19 font sizes, seven of them crowded into 9.5-12.5px, five on half-pixel tiers. 12 radius values, 76 of 121 declarations at 6px or larger. 23 padding values, 17 gap values. The marketing site does the same job with 8 tokens and one `--line`. The site is not prettier; it is *governed*, and the app is not.

**4. The frame hard-cuts while the chart glides.** Five real transition rules in the whole stylesheet (334, 1173, 1376, 1385) against 57 `:hover` rules and exactly 2 `:active` rules (519, 955). The only `@keyframes` is a decorative 1.7s attention pulse (1936-1942). The engine inside it runs 85 rAF sites, 79 `style.transition` assignments, a 260ms FLIP and a 250ms stat morph. Worse, the shell actively suppresses that: `transition: none !important` on the engine toolbar (913-914), `window.__gb2_authoritativeRender = true` before every render (`ps-shell.js:2468`, which makes the engine discard its morph store), and a 120ms echo timer (`ps-shell.js:3219`) that tears down the DOM roughly halfway through every 250-260ms engine animation.

**5. Every browser reflex falls through.** `cursor: pointer` on 36 rules including every button class, `cursor: default` on 6 (the menubar got it right at 1201 and nothing else did). `user-select: none` on 9 rules, so dragging across the inspector or a role card paints browser text selection. No `<link rel="manifest">`, no `theme-color`, so the app permanently wears a URL bar above the 34px appbar it built. Right-click gives Chrome's menu everywhere except five specific surfaces. Tooltips are native `title=` attributes: OS font, OS delay, no keyboard access.

**6. There is no brand anchor.** `#192E49`, `#375CA0`, `#E3A12E` appear zero times in the app; `#3573bd` (the app's primary, inherited from the engine's jamovi era) appears zero times on the site. The chrome is four stacked near-whites: appbar `#f8f9fb`, statusbar `#f7f8fa`, page `#eef1f5`, command bar `#fff`. Nothing on screen says what product this is except a 19px wing.

The through-line: **the app was composed as a page and then given a frame, and the page won.** Software reads as software because of structure (bands, flush panes, one governed vocabulary), not because of finish.

---

## The counter-system

### Chrome architecture

Five regions, all edge-to-edge, separated by 1px hairlines, none of them floating.

| Region | Height | Surface | Persists |
|---|---|---|---|
| App bar (brand, menubar, doc identity, save state) | 32px | navy `#192E49` | always |
| Command bar (workspace-contextual actions) | 36px | `--surface` white, hairline bottom | always |
| Project rail | 200px, drag 160-320 | `--surface-1` | toggleable, remembered |
| **Document surface** | fills | white, **no radius, no shadow, no outer padding** | always |
| Inspector rail | 320px, drag 260-520 | `--surface-1` | toggleable, remembered |
| Status bar | 22px | navy, dimmed text | always |

Rules that make it read as software:
- The document surface **fills its cell**. `#ps-workcard`: `padding: 0`, `border-radius: 0`, no `box-shadow`, `flex: 1`, `min-width` removed (kill `min-width: 680px` at 1427, which is what forces horizontal scroll between 760 and 1239px).
- **Delete `.ps-workspace-heading` entirely** (1415-1420). It is 48px + 10px margin of blurred translucent hero, and everything in it is already in the appbar, the tab strip, the rail and the status bar. That reclaims 58px against a 239px chrome stack sitting above a 384px chart.
- **The chart owns the pane.** ResizeObserver on the document surface, compute `plotWidth`/`plotHeight` in inches from the measured interior, clamp to the engine's own limits (`graphbuilder2.js:5679-5682`, 3-14in x 2-10in), snap to 0.25in so a 3px window nudge does not re-render, debounce, and expose Fit / 100% in the status bar. This is not the M4aa display-scale experiment that was rolled back: that was a CSS transform which broke hit targets. This changes layout inches at native 100%, which is exactly the coordinate system M4aa preserved.
- **Rails resize and persist.** Two 4px handles writing CSS custom properties on `.ps-app-body`, stored in `APP_PREFS`. Wire the already-written-but-dead `.ps-no-inspector` class (defined at 1250-1253 and 2082, and only ever *removed*, at `ps-shell.js:8920`) to a View menu item plus a shortcut.
- **Below 980px, collapse, never delete.** The current 760px query (2085-2091) deletes the menubar, both rails and the workspace switcher, leaving no route to save, create, or assign a variable. Replace with drawers and a hamburger.
- **Status bar carries instrumentation, not instructions.** Today it is the constant string `"Click a chart element to edit"` (`ps-shell.js:8977`). It should read: module, n plotted, k groups, chart size, zoom. Same for the grid footer, which currently spends permanent chrome on a four-sentence how-to (`ps-shell.js:4805`) where Excel puts Count / Mean / SD.

### Density and type scale

Adopt the engine's ladder, because the engine is the thing you cannot change and it speaks one size: `11px` appears 649 times in the engine source, `10px` 281, `12px` 198.

```
--fs-micro: 10px   uppercase labels, counts, status bar
--fs-body:  11px   THE default. set on body (index.html:10-14 sets none, so
                   unstyled text currently inherits 16px)
--fs-emph:  12px   active tab, primary button, section lead
--fs-title: 13px   pane and panel titles
--fs-dlg:   15px   dialog headings (currently 16-23px, and 23px in Help Me Choose)
```

Delete every half-pixel tier. Roughly 150 declarations collapse onto 5 values. Spacing: `2 / 4 / 6 / 8 / 12 / 16 / 24`, nothing else.

**Control vocabulary** (these numbers are the shared contract with the engine, whose restyled toolbar buttons sit at 28-29px):

- icon button 24x24 in chrome, 28x28 in toolbars
- text button height 28 default, 24 compact; padding `0 10px` / `0 8px`
- input / select height 24, padding `0 6px`
- menu item 24, project rail row 26, tab 28, grid row 21 (already correct, do not touch it, it is the best-calibrated thing in the app)
- one exception: do not reintroduce the 24px-pitch swatch spacing. That WCAG 2.5.8 fix was tried and reverted per Torry (CLAUDE.md convention 15) and `target-size` is in the a11y ignore set.

### Surface and elevation

Three surfaces. Two border weights. One shadow.

```
--surface-0: #eef1f5   canvas behind panes
--surface-1: #f7f8fa   rails, headers, sunken wells
--surface-2: #ffffff   document, inputs, cards inside dialogs
--line:      #dde5ee   hairline (site's --line, use it everywhere)
--line-strong: #c6ccd4 input borders, header rules
--shadow-float: 0 12px 32px rgba(20,29,40,0.22)
```

**A shadow is allowed only on a layer that floats above the application plane and can be dismissed:** menus, flyouts, dialogs, the command palette, toasts, drag ghosts, the color picker. Zero shadows on anything docked. That single rule removes the card treatment from `#ps-workcard`, the engine toolbar wrapper, the inspector, and the data grid card, and it is the fastest structural read of "this is a window, not a page."

**Radius:** `0` for docked regions, `4px` for controls and inputs (matching the engine's dominant 3-4px), `6px` for floating layers. Delete 7, 8, 9, 10, 12, 14, 17. The 17px pill in the Help Me Choose modebar (1587) and the 12px chips are marketing geometry.

**Modals collapse to one recipe:** scrim `rgba(24,34,47,0.42)`, card radius 6, `--shadow-float`, corner glyph close. Today there are five treatments (scrims at 1027, 1099, 1478, 1505, and two radial gradients at 1969-1972; card radii 12 / 14 / 9 / 10 / 12; shadows up to `0 24px 70px`).

### Motion doctrine

Three durations, borrowed from the engine so the two layers cannot disagree.

```
--dur-state: 90ms   cubic-bezier(0,0,.58,1)   background, border, color
--dur-reveal: 140ms ease-out                  dialog/menu enter, disclosure, pane cross-fade
--dur-move: 260ms   cubic-bezier(0,0,.58,1)   position, FLIP, reorder
```

260ms and that curve are the engine's `_playBarFlip` values, and the shell already learned this lesson once: `_gb2CssEaseOut` exists precisely because an `easeOutCubic` let a line drift a few px from its markers mid-glide.

**What animates:** hover and press color; dialog and menu enter (opacity + 6px translateY) and exit (100ms); disclosure height (the role picker, ported from `_animatePanelCollapse`'s max-height idiom); the tab underline (one absolutely-positioned 2px element, `left`/`width` tweened, instead of a per-tab inset shadow that hard-cuts); layout align/distribute as a real FLIP; workspace pane cross-fade.

**What must never animate:** any hover lift, scale or translate (that is `website/index.html:151,189`, the card-lift, and it is the single loudest marketing tell); decorative loops; skeleton shimmer; anything on the chart canvas, which the engine owns.

**Press is non-negotiable.** One rule covering `.ps-btn`, `.ps-command`, menubar buttons, menu items, tabs, role cards, launch actions: darken one step, no transition on the down edge, 90ms on release. Two `:active` rules against 57 `:hover` rules is why every click in the app feels dead.

**And stop suppressing the engine.** Drop `transition: none !important` (913-914). Do not set `__gb2_authoritativeRender` on style-only echoes. Raise the 120ms echo timer past 300ms, or defer it while `window.__gb2_statMorph` is live. The engine's motion is already built and paid for; the shell is currently throwing it away.

### Icons and color

**One icon system.** 16x16 viewBox, `fill: none`, `stroke: currentColor`, stroke-width 1.5, round caps, inline `<symbol>` sprite beside `#ps-pandion-wing`. The app already has three correct icons (2321-2346: undo, redo, search). Draw the remaining ~12 and delete every dingbat: `▦ ▥ ⊞` (2165-2171), `↗` (2150), `↓` (2152), `⋯` (2368), `↻` (2547), fullwidth `＋` (2561), `⣿`, plus the seven analysis glyphs in `MODULE_GUIDE` (`ps-shell.js:54-62`). Those glyphs render in a fallback symbol font on Windows and Linux, which means this defect is invisible on the machine it was built on and visible on every machine it ships to.

**Color: 16 tokens, three roles.**

- **Frame:** navy `#192E49` (appbar, status bar). This is where the brand lives, and it is the region the engine never draws, so it is free.
- **Interactive:** keep `#3573bd`. Do not repoint it at the site's cobalt. The engine paints its own controls this blue; convergence here is what makes the seam disappear.
- **Attention:** amber `#E3A12E`, reserved for exactly one job (unsaved / needs attention). Not for buttons, not for washes. Replace the welcome's `rgba(226,139,11,.10)` (1971), which matches no other amber in the product.
- **Delete the teal entirely** (`#16877d` and five relatives, 1570-1608). It exists in one dialog, appears nowhere in the engine or the site, and it swaps the app's accent hue mid-session.

Add `theme-color: #192E49` and a manifest. Also: `user-select: none` on `.ps-app-body` with opt-ins for inputs and diagnostics output; `cursor: default` on chrome controls; a `::selection` color; a styled 120ms tooltip layer to replace `title=`; `scrollbar-width: thin` plus a `::-webkit-scrollbar` block (15+ overflow regions are unstyled today, which is invisible on macOS overlay bars and a chunky OS bar everywhere else).

---

## The seam: how the shell meets the engine

Three options were on the table. Here is the honest split.

**Adopt engine metrics for type, density, radius and accent. Do not negotiate.** The engine is 65% 11px text, 3-4px radii, `#3573bd` buttons, `#ddd` panel borders. Those are the metrics of the part of the product that cannot change, therefore they are the metrics of the product. A shell speaking 10.5px / 6px / 7px / blue-grey borders around it is the deviant party. This is convergence, not coupling: it costs nothing at runtime and cannot break on an engine update.

**Frame the engine as document chrome, not as a peer of app chrome.** The right mental model is Word or Figma: application chrome (navy bar, command bar, rails, status bar) and then, on the paper, the document's own toolbar. Two toolbars is not the problem. The problem today is that the app's command bar and the engine's toolbar are both rounded, bordered, shadowed boxes at the same elevation, so they read as siblings competing for authority. Fix: the engine toolbar goes edge-to-edge at the top of the document surface with a hairline below it, no radius, no shadow, no 14px inset, exactly like `.ps-data-commandbar` (502-507). The engine's inspector panel (`graphbuilder2.js:43923-43941`, `border: 1px solid #ddd`, `radius 0 0 4px 4px`) fills the bottom of the document surface, with the shell restyling only its border color to `--line`. Once both bands are flush and the pane has no padding, the seam is a hairline instead of a nested box, and the two stop looking like two products.

**Reject CSS-restyling engine internals as a strategy, and narrow what already exists.** The shell already does this in `index.html:895-955` and the cost is on record: hiding the export button at 1021-1023 left `graphbuilder2.js:52868`'s Basics panel telling students to click a button that does not exist, and pinned it with a probe (`verify/m0-check.mjs:110-122`). Every override is a bet on a selector you do not own plus a copy contradiction you have to remember. Keep the overrides that are *layout* (make the toolbar fill its band). Drop the ones that are *motion* (913-914). Where an engine affordance is dead in this shell, intercept it rather than hide it: a capture-phase click on `button[title="Export plot"]` routing to `openExportDialog` makes the help copy true and removes a hidden control, at the same cost as the CSS rule that hides it.

**One thing to decline:** dark mode. The engine hardcodes light chrome across hundreds of literals and has zero `prefers-color-scheme` rules. A dark shell around a light chart pane is defensible (Figma, Illustrator, Keynote all do it) but it is a second design system to maintain and it is not what is producing the "web page" read. Do it after the token layer exists, or decline it explicitly so it stops looking like an oversight.

---

## Do not do this

1. **No hero gradients.** Kill the two radial gradients on the welcome screen (1969-1972, the same technique as `website/index.html:65-68`) and the gradient chip and card on the guide card (1546-1553). Flat surfaces read as software.
2. **No hover lift, scale, or translate** on cards, buttons, or tabs. This is the single most recognizable marketing motion.
3. **No `backdrop-filter` on docked chrome** (1415-1420, 1478, 1505). Blur is for transient layers over content, if at all.
4. **No pill radii.** Nothing above 6px, and never `border-radius: 999px` on a control.
5. **No shadow on anything that does not float and cannot be dismissed.**
6. **No new accent family.** One blue, one navy, one amber. Adding a teal for one dialog is how you end up with three.
7. **No "hide the chrome" breakpoints.** Collapsing into drawers is software; deleting the menubar and both rails is a responsive web page.
8. **No 16px anywhere in chrome**, and no body text without an explicit size.
9. **No decorative animation loops.** Retime the 1.7s attention pulse to one 450ms shot, and only ever fire it as a "look here" arrival cue.
10. **No em dashes in any string.** Three prose sites remain (`ps-shell.js:4144-4145`, `6955`, and `8932`, which is the browser tab title, the most-screenshotted string in the product). Leave the em dashes that are missing-value glyphs; those are a documented engine convention.
11. **No third icon system**, no emoji, no unicode geometry standing in for a drawn glyph.
12. **Do not animate the chart from the shell.** Fix the suppression instead and let the engine do what it already does well.

---

## Sequence: five moves, in order

**0. Manifest and theme-color. 20 minutes.**
A 12-line `manifest.json`, `<link rel="manifest">`, `theme-color: #192E49`, `apple-touch-icon` (the site already ships `icon-180.png`). Installed, the app opens in its own window with its own dock icon and no URL bar, no tab strip, no bookmark star. Every other item on this list fights the browser frame. This one removes it. Highest ratio in the whole document, and it is not even a design change.

**1. Token layer plus scale collapse. M, about one day.**
`:root` with ~18 tokens (3 surfaces, 2 lines, 4 text greys, accent + hover + wash, navy, amber, danger, selection, shadow, 3 durations). `body { font-size: 11px }`. Snap 19 font sizes to 5 and delete the half-pixel tiers. Snap 12 radii to 0 / 4 / 6. Snap paddings and gaps to the 6-step scale. Delete `index.html:16-23` and hoist the app-frame block to the top of the sheet. Sweep the sub-AA greys to `#666` minimum while you are in there (the engine already did exactly this sweep; `#99a0aa` at 2.64:1 and `#929ba5` at 8.5px are below any UI floor). This is the substrate for everything else, and it alone is most of the "governed" signal that makes the site read as more professional.

**2. Flush the document pane. S, half a day.**
`#ps-workcard`: padding 0, radius 0, no shadow, `flex: 1`, `min-width` gone. Engine toolbar edge-to-edge with a border-bottom. Delete `.ps-workspace-heading`. One scrim, one dialog radius, one shadow token. Add `user-select: none` on `.ps-app-body`, `cursor: default` on chrome controls, and a scrollbar rule. After this the app has a chrome band, flush panes, and no floating cards, which is the structural half of the whole thesis.

**3. Chart fills its pane. M, about one day.**
ResizeObserver plus payload inches, clamped and snapped, with Fit / 100% in the status bar. This is the one that removes the 137px of dead white on either side of the product's centerpiece. Do it after step 2, because the pane has to be flush before the chart has a pane to fill.

**4. Chrome anchor, brand, icons. M, about one day.**
Navy appbar and status bar with dimmed text. Brand lockup to 22px. Kill the teal. Amber reserved for attention only. Draw the 12 icons to one spec, inline the sprite, delete every dingbat. Repaint the wing to `#192E49` / `#375CA0` so the mark, the site and the app finally agree (today the wing is `#152d5e` / `#1a53cf`, which appears in neither palette).

**5. Motion and press. S to M, half a day to a day.**
The three duration tokens. `:active` on every button class. 90ms on hover color, 140ms on dialog and menu enter and on pane cross-fade, 260ms on the tab indicator and layout FLIP. Unblock the engine: drop `transition: none !important`, stop flagging style echoes as authoritative renders, raise the echo timer past 300ms. Retime the pulse to a single 450ms shot and route it through the existing `body.ps-reduce-motion` plumbing, which is already wired and persisted and currently governs almost nothing.

Total: roughly four to four and a half days for the visual thesis, with step 0 landing in the first twenty minutes and step 2 producing the biggest single perceptual jump per hour spent.

Everything above is shell-only. The one engine-adjacent recommendation (narrow the toolbar overrides to layout, intercept the export button rather than hiding it) removes existing coupling rather than adding it.


---

# Appendix B: the itemized inventory

The merged, deduplicated, verified punch list: 60 numbered entries in
four tiers, then 21 bugs and 3 performance risks, each with a file:line
anchor, an effort estimate, and an explicit engine flag. Exactly one
entry in the whole list would need `graphbuilder2.js`, and it is dark
mode, which Appendix A argues for declining.

Parts 3 to 5 above are the summary of this. Read this when you are
picking work, not when you are deciding direction.

# Pandion Plots Standalone: Master Gap Report

Synthesis of 8 verified dimension surveys. Every entry below survived a second-pass verification against the source. Findings the verifiers downgraded are marked **(partial)** with what already exists. Engine changes are called out loudly; only one entry in the whole report requires touching `graphbuilder2.js`.

---

## What is already genuinely strong

Calibration first, so the list below reads as a punch list and not a verdict.

- **The statistics are real.** `ps-data.js` is a line-by-line port of each `.b.R` (CG row filtering vs `R/plotbuilder.b.R:289-300`, Cousineau-Morey vs `R/rmplotbuilder.b.R:451-525`, both exact), and `ps-stat.js` carries genuine R-parity numerics: Cody pnorm, AS 89 Spearman, exact pkendall DP, bisection qt, exact `prho` port. `verify/m1-parity.R` covers 18 cases across all 7 modules with NAs on every role.
- **Payload parity is near-total.** A mechanical diff of every `data.<key>` the engine reads against the committed templates leaves only nine unset keys, one of which matters. Every data-shaping option that jamovi keeps as a REAL R option round-trips here: `summaryFunc`, `errorBarType`, `errorBarMethod` with the CM gate, `corrMethod`, `likertCiLevel`, `xyFitType`, `xyStatsCorrType`, `likertReverseItems`, plus `corrRaw`, `rowIds`, `xyStats`, `likertAlpha` and the >25-level Likert continuous path.
- **The style/palette library ACTION protocol is fully re-interpreted shell-side** (`ps-shell.js:2885-3040`, `3216-3230`), including the `styleStamp` write-back. That is subtle work and it is correct.
- **The app does things jamovi cannot**: typed spreadsheet with per-cell exclusion, row filters, computed variables with a real formula engine, long-to-wide reshape, linked chart-to-row selection, and a figure composer with page presets, align/distribute and layering.
- **Persistence discipline is above web-app average**: versioned snapshot with a real v2 to v3 migration, a second-tier backup key, recents, an honest `AUTOSAVE_HEALTH` state machine, a Diagnostics dialog reporting snapshot size and `navigator.storage.estimate()`, Cmd+S save-in-place via File System Access, and an undo toast on document deletion.
- **The novice affordances that exist are well designed**: role cards with Required/Optional badges, eligible counts, per-role teaching blurbs and aria-labels (`ps-shell.js:3480-3600`); the needs-variables placeholder with "Choose variables" and "Not sure? Help me choose" (`ps-shell.js:2358-2386`); disabled commands that explain themselves (`ps-shell.js:9877-9893`); plain-language corrupt-snapshot recovery (`ps-shell.js:1225-1250`); module build errors written for students (`ps-data.js:180, 221, 952-963`).
- **The chart output is publication grade.** `website/assets/gallery/*.png` are unretouched renders from this app.
- **The Help Me Choose wizard does something the jamovi version structurally cannot**: its "Create <module> chart" button pre-assigns the roles (`ps-shell.js:6743, 6864-6871`). jamovi was explicitly denied that by the results-iframe sandbox.
- **The engine reskin instinct is right.** Restyling the engine toolbar to app-bar proportions instead of fighting it is the correct architectural call.
- **21 playwright probes** pin real behavior and were the reason several of these findings could be scoped precisely.

---

## Tier 1: things a user will hit and be blocked or confused by

### 1. Dropping a CSV on the start screen silently does nothing
**What:** The document drop handler runs the whole import, but `#ps-loader` is z-index 9999 under `#ps-welcome` at 13000, so the preview renders invisibly beneath the welcome overlay (which also sets `aria-hidden` on the page). `.pand` and `.omv` work because their adopt paths call `hideWelcome`; the CSV/TSV/xlsx path never does.
**Why:** This is the single most natural first action, on a cold load, for the format undergraduates actually have. It reads as "the app is broken".
**Where:** `index.html:1026` vs `index.html:1967`; `ps-shell.js:9433-9440`, `9354-9372`; `hideWelcome` called on the adopt paths only at `2111, 9192, 9213` (`9471` and `9558-9573` are recents and the welcome dialog's own buttons).
**Effort:** S | **Engine:** no

### 2. Nothing anywhere tells a student the chart is clickable
**What:** The engine's first-run hint is permanently disabled (`graphbuilder2.js:93272-93273`, an early `return`), and the shell adds no replacement. Grepping index.html and all five js files for "click any", "click the chart", "coach", "tour" returns only a code comment.
**Why:** Click-anything-to-edit is the product's defining capability and the thing the website leads with. A student sees a finished chart and six identical icon buttons and concludes the app draws one fixed chart.
**Where:** `graphbuilder2.js:93272`; only on-screen instruction is `index.html:2211` (about roles, not the canvas).
**Effort:** M | **Engine:** no (a shell-side one-shot coach mark; reuse `ps-attention-pulse` at `index.html:1936` and the toast at `ps-shell.js:1456`)

### 3. The entire teaching layer is orphaned from the application frame
**What:** Which graph?, Check graph, Glossary and Label parts are reachable only through one unlabeled 29px "?" icon inside the engine toolbar. The Help menu is Keyboard shortcuts / Diagnostics / About (`ps-shell.js:9837-9841`), and `commandCatalog` explicitly excludes the Help group, so Cmd+Shift+P cannot find them either. Grepping the shell for `glossary`, `graphLint`, `graphChooser`, `setInspectorSelection`: zero hits.
**Why:** The marketing site sells exactly these features. Real software puts its help in the Help menu. These are already public engine selection keys, and `window.__gb2_helpPanelLive` keeps them open across re-renders.
**Where:** `ps-shell.js:9837-9841`, `10033-10044`; engine entry at `graphbuilder2.js:93248-93252`.
**Effort:** M | **Engine:** no

### 4. The user guide is unreachable from the app **(partial: the site half already shipped)**
**What:** `docs/user-guide.html` (2.46 MB, 15 screenshots) is orphaned in the app. `userGuidePath` appears in no template and nowhere in the shell, so the engine's "Open the user guide" button never renders, and the Help menu has no entry.
**Already exists:** The site half is done - `website/index.html:270` has a Docs nav link, `:333` has a User guide link, and `website/build.sh:25-30` already copies `docs/` into `website/docs/`. Only the app-side link and the payload key are missing.
**Why:** The audience least able to reverse-engineer the UI is the one with no manual.
**Where:** `graphbuilder2.js:52888` (the payload gate); note the engine builds an http module-asset URL at `52927-52931`, so an absolute URL may need a click intercept rather than the payload key.
**Effort:** S | **Engine:** no

### 5. Sigma Normality tab prints a false "n/a (needs 3-5000 values)" **(partial: the absence is a documented brief ruling; the misleading output is not)**
**What:** The shell ships `distNormality: []`. The engine does not degrade silently - it builds a row per cell, prints em-dashes for W and p, and sets `verdict = "n/a (needs 3-5000 values)"`.
**Why:** On a 24-row sample the app tells a student their sample size is wrong when it is not. In a stats course this is worse than the feature being absent. The README's own description of the gap ("shows no rows") is factually wrong.
**Where:** `ps-data.js:261-263`; `graphbuilder2.js:51663-51686, 51716`. Brief ruling at `STANDALONE-BRIEF.md:134`.
**Fix options:** Suppress the tab, or port Royston AS R94 into `ps-stat.js` (about 80-150 lines, round W to 3 dp per CLAUDE.md convention 16).
**Effort:** M | **Engine:** no

### 6. There is no data export in any format
**What:** The app reads CSV, TSV, xlsx, .omv and .pand, and can write only `.pand` (the proprietary project JSON) and images. Grepping for `text/csv`, `toCSV`, `exportData`: zero hits. The only two `a.download` sites are `ps-shell.js:1356` and `1991`.
**Why:** A student can clean a table, retype columns, add computed variables, reshape long-to-wide, and then cannot hand it to a partner, take it into jamovi, or submit it. Reshape makes it sharper: it is advertised as a one-way import repair, so the repaired table is exactly what they want to keep.
**Where:** `index.html:2944` (import-only accept list). `gridSelectionText` at `ps-shell.js:4234` already has the TSV quoting rules; `saveExportBlob` at `1971` already handles the picker plus anchor fallback.
**Effort:** S | **Engine:** no

### 7. Layout has no undo, and Cmd+Z there does something invisible and unrelated
**What:** `layDeleteSelected`, `layDuplicateSelected`, `layMoveLayer`, `layMoveSelected`, `layAlign` all mutate then `persist(); renderLayout()` with no snapshot and no toast. The undo router claims the key only in the Data workspace or when data acted last; otherwise it falls through to the engine's chart-style history with the comment "else the engine's document-capture handler takes it".
**Why:** Deleting a layout panel is permanent, and the user's first reflex afterwards silently mutates a different document they are not looking at. Every other destructive action in the app has an undo toast.
**Where:** `ps-shell.js:8182-8190, 8195, 8213, 8232, 8244`; router at `6239-6280` (fallthrough at `6266`). Contrast `closeChart:7310` and `offerDataUndo:1488`.
**Effort:** M (S for a toast-only interim) | **Engine:** no

### 8. "Reset styling" is a top-level button that destroys work with no confirm and no undo
**What:** `chart.options[curModule()] = {}; persist(); render();` - no snapshot, no toast, no confirm. It sits in the always-visible command bar one button from Export. The app has no `confirm()` anywhere (verified: zero hits).
**Why:** One click discards every style edit, annotation, palette and axis title on that chart. Because it wipes the option store directly rather than going through `window.setOption`, the engine's undo stack never sees it, so the shell cannot claim Cmd+Z recovers it.
**Where:** `ps-shell.js:10273-10279`; button at `index.html:2156`. The right pattern already exists at `closeChart:7310`.
**Effort:** S | **Engine:** no

### 9. Nothing in the app ever says it is busy
**What:** One `@keyframes` in a 3071-line stylesheet (`ps-attention-pulse`, used once). No spinner, skeleton, progress element, `aria-busy` or `cursor: progress` anywhere. Uncovered: cold start (3.4 MB of blocking script over a fully painted, inert app frame), CSV parse (a synchronous char-by-char loop, ~950 ms for 13 MB before `buildTable`/`retype`/`persist`), `ensureSnapshotsThen` (one full engine render per tick with no UI), and any large render.
**Already exists:** Export is the one flow done right - `EXPORT_BUSY`, disabled button, staged status text into a `role="status"` div (`ps-shell.js:2008-2020`). Make it the template.
**Why:** This is the strongest "web page, not software" signal in the product. Software says "Reading 12,480 rows" and dims what you cannot touch.
**Where:** `index.html:1936` (only keyframe), `3060-3069` (ten blocking scripts); `ps-shell.js:894-921`, `2559-2585`, `9355-9373`.
**Effort:** M | **Engine:** no

### 10. Import failures blame the wrong thing, and binaries parse as garbage
**What:** `parseTableText` returns bare `null` for three distinct failures (no columns, header-only, no rows), all surfaced as one message: "Could not preview the data. Check the delimiter and first-row settings." `readPickedFile` sniffs only `.xlsx` and `.omv`, so a dropped PNG or PDF is read as text and shown as an import preview of binary noise with type dropdowns over it. None of the three FileReaders has an `onerror` handler, so an unreadable file leaves the dialog sitting there forever.
**Where:** `ps-shell.js:928, 932, 9287-9293, 9339-9345`; `onerror` exists only at `1824, 8099, 8121` (image paths).
**Effort:** M | **Engine:** no

### 11. The data grid has no arrow-key navigation and no Cmd+A
**What:** The grid keydown handler handles only Escape and Delete/Backspace. Arrows do nothing with a range selected; the only motion is Enter/Tab from inside an open editor. No Cmd/Ctrl+A branch exists; select-all is a corner-cell click only.
**Why:** Every spreadsheet a student has used makes arrows the primary motion. `GRID_SELECTION` already carries `{anchorCol, anchorRow, focusCol, focusRow}`, so the model is there.
**Where:** `ps-shell.js:5836-5845` (the handler), `5852` (corner click), `5055-5068` (editor-scoped motion).
**Effort:** M | **Engine:** no

### 12. Right-click opens Chrome's menu on most of the app
**What:** Five `contextmenu` listeners exist: engine host (does not preventDefault), grid, tabs, layout items only (`closest(".ps-litem")`), navigator. Nothing on the empty layout canvas, the chart card, the inspector, role cards, the command bar or dialogs.
**Why:** Right-click is the gesture a desktop user makes to ask "what can I do with this?" The layout case is sharpest: right-click an item and get a proper menu, right-click 10px away and get "View page source".
**Where:** `ps-shell.js:2879, 5940, 7595, 8490, 8767`. (The engine does bind its own on data-point halos at `graphbuilder2.js:32543`.)
**Effort:** M | **Engine:** no

### 13. No unsaved-work guard, and in-flight style edits are dropped on tab close
**What:** Zero `beforeunload` / `pagehide` / `visibilitychange` handlers in the shell. Compounding it, the engine's own flush DEFERS via `setTimeout` while `__gb2_widgetPointerDown` is set or within 700 ms of `__gb2_inspectorInputAt` - and a setTimeout scheduled during unload never runs. Separately, three in-app paths replace the project with no prompt: the start-center sample button, whole-page drop, and `adoptProject`/`adoptOMV`.
**Why:** Drag a slider, release, close the tab within 700 ms: the edit is gone. Click "try the sample" out of curiosity with six charts open: they are gone, and `PS_BACKUP_KEY` is only reachable when the primary snapshot fails to parse.
**Where:** `ps-shell.js` (no unload handler; only hit is `verify/m0-check.mjs:199`); engine at `graphbuilder2.js:3991-4016, 4224`; replace paths at `ps-shell.js:9567-9569, 9424-9430, 9433-9439, 2093, 9195`.
**Effort:** S (the flush guard) + M (the destructive-action guard) | **Engine:** no - read `window.__gb2_pendingOpts` on `pagehide` and fold it into options yourself

### 14. Cmd+P prints the DOM; Cmd+W closes the tab
**What:** No `window.print`, `@media print`, or `beforeprint` anywhere, and `html, body { overflow: hidden }` on a full-height grid, so browser print yields one clipped viewport of app chrome. Cmd+W is unbound and, with no beforeunload, ends the session silently.
**Why:** Cmd+P is muscle memory for anyone producing a figure. The output is the most embarrassing possible for a graphics application, and a perfectly good vector PDF path already exists at `ps-shell.js:1998`.
**Where:** `index.html:1179`; shortcut handlers at `ps-shell.js:10219-10232, 10259-10272` (only s/o/n, Shift+P, comma, D).
**Effort:** S | **Engine:** no

### 15. Local storage: the recovery ladder silently switches itself off in three tiers
**What:** Recents skip above 900 KB with no message; the backup copy skips above 1.5 MB, silently; autosave fails at quota with one 2.8 s toast and no remedy button. Meanwhile up to five copies of the project (autosave + backup + 3 recents, each carrying `table.raw`) compete for one ~5 MB origin quota alongside the engine's own undo blob, which reserves up to 2.7 MB because `__gb2_bundleBytes` is never set and the dist inlines the bundle so no bundle key exists to measure. Measured: 5,000 x 20 = 1.21 MB per snapshot; 20,000 x 20 = 5.10 MB.
**Why:** The three safety nets disappear in order of increasing project value, and the user is never told. A 20,000-row import blows quota on the first persist.
**Where:** `ps-shell.js:1076, 1101-1102, 1117-1124`; `graphbuilder2.js:91947, 91965-91966`.
**Cheap first move:** set `window.__gb2_bundleBytes = 3600000` before the first render (the engine reads that window global first) to hand ~1.7 MB back.
**Effort:** M | **Engine:** no

### 16. Two tabs of the app silently overwrite each other
**What:** No `storage` listener, no `BroadcastChannel`, no `navigator.locks`. Both tabs write the same fixed keys. `PS_LIBS` is read once at boot and written whole by `saveLibrariesNow`, whose catch is empty.
**Why:** Last write wins on the project; `PS_BACKUP_KEY` can end up holding the *other* project, so "recovered the previous backup" can restore a different dataset. Styles saved in one tab vanish with no error. Note the dist is usually opened from `file://`, where Chrome shares one localStorage across every `file://` page, so two downloaded copies collide the same way.
**Where:** `ps-shell.js:33-37, 1092-1109, 2896, 2917-2927`.
**Effort:** M | **Engine:** no

### 17. Below 760px the menu bar, navigator, workspace switcher and inspector all vanish with no replacement **(partial: Open/Save/Reset/Export survive in the command bar)**
**What:** One media query sets `display: none` on `.ps-project-panel`, `.ps-controls` and `.ps-menubar`. The workspace switcher lives inside the project panel, so it goes too. No hamburger, drawer or bottom sheet exists.
**Why:** On a Chromebook in portrait or a half-screen window, the user loses the ability to switch workspaces, create a document, or assign a variable. "Hide the chrome below a breakpoint" is the web default and the opposite of what an application does.
**Where:** `index.html:2085-2091`; switcher at `index.html:2161-2172`; the surviving command bar at `index.html:2146-2157`.
**Effort:** M | **Engine:** no

### 18. Type inference is all-or-nothing, ignores the user's missing tokens, and names no offender
**Three linked defects:**
(a) `inferType` tests the module constant `MISSING_TOKENS = {"": 1, "NA": 1}` instead of `t.missingTokens`, so declaring "." or "N/A" or "-99" as missing does nothing for typing - and since `numericish` comes from the same call, the variable becomes permanently undroppable on a Y axis with no explanation. (`ps-shell.js:133-142, 79, 833`; the field advertises "NA, N/A, ." at `index.html:2250`.)
(b) One unparseable value returns `"nominal"` immediately - no proportion test, no tolerance, no offender reported, and the preview shows six rows so a typo in row 40,000 is invisible. `"1,234"`, `"$12"`, `"5%"`, `"2026-01-15"`, `"TRUE"` all fail. (`ps-shell.js:139, 9310`.)
(c) `"007"` and `"0x10"` pass as 7 and 16, so zero-padded IDs and long numeric IDs are silently rewritten on screen and in every chart label. `t.raw` is preserved so it is reversible, but nothing routes the user to the ID type that exists for exactly this. (`ps-shell.js:139, 841, 4907-4929`.)
**Effort:** S (a and c) + M (b, with an offender count and a "treat these as missing" action) | **Engine:** no

### 19. Measure types are the app's core gate and are never defined anywhere
**What:** `VAR_TYPES` is four bare labels. The type menu renders icon plus label with no description; the chip tooltip says only "<Type> variable - click to change the type". None of the 131 engine glossary entries covers nominal, ordinal, continuous, measure type or level.
**Why:** Every role gate is typed. A student whose 1-5 rating column will not drop on the value axis has to understand three words the app never explains.
**Where:** `ps-shell.js:91-96, 3728-3745, 3684`. (`acceptsTooltip` at `162-172` does surface the vocabulary in context, which makes the missing definitions more conspicuous, not less.)
**Effort:** S | **Engine:** no

### 20. The one sample dataset misrepresents Repeated Measures and cannot demo Likert
**What:** `loadSample` pre-assigns `rmplotbuilder: { measures: ["score", "hours"] }` on a dose-response dataset, so switching the Analysis dropdown plots a test score and a study-hours count as two occasions of the same measurement with Cousineau-Morey error bars. `likertplotbuilder: {}` gives an empty placeholder because no sample variable has a shared response scale.
**Why:** Switching the dropdown is the fastest way to explore, and the app's own example demonstrates a textbook misconception.
**Where:** `ps-shell.js:14-32, 2127-2132`; advertised at `index.html:2578-2581`.
**Fix:** Ship two or three named examples (dose-response between-subjects; a genuine RM set id/t1/t2/t3/group; a 5-item Likert battery) and point each module's default roles at the dataset that fits it.
**Effort:** M | **Engine:** no

### 21. Whole-page file drop is advertised with no visual target
**What:** The loader says "(or drop one anywhere on the page)" and the document handler is a bare `dragover` preventDefault with no dragenter/dragleave and no overlay. Role slots, the variable list and the wizard all light up on dragover; the page itself does not.
**Where:** `index.html:2943`; `ps-shell.js:9433`. Contrast `3584-3596`, `6102-6113`, `6922-6930`.
**Effort:** S | **Engine:** no

### 22. Engine-load and render failures are written for the developer
**What:** The load-failure card tells the user to run `bash standalone/build-dist.sh`; the render-failure card prints a raw JS exception with no next step and no reload button. The same load branch fires in the shipped dist if the inlined engine throws.
**Where:** `ps-shell.js:2440-2447, 2473-2475`.
**Effort:** S | **Engine:** no

### 23. The chart-error empty state has no next step
**What:** `showMessage` builds its action buttons only when the message starts with "Assign ". Every module *build error* falls into the other branch: "This chart needs attention" plus the error plus a fixed "Review the selected variables or inspect the data for missing values." So the harder failures are exactly the ones with no button, and the advice is generic where the error is specific (a Likert battery with too many levels even names the right destination without offering a way there).
**Where:** `ps-shell.js:2358-2386`; errors at `ps-data.js:180, 221, 287, 846, 952, 958`.
**Effort:** M | **Engine:** no

---

## Tier 2: polish and motion that separate "good demo" from "shipped software"

### 24. The app has no design-token layer at all
**What:** No `:root` block; exactly one custom property is ever declared. 351-361 distinct hex literals from ~673 occurrences, 67 background surfaces, 73 one-pixel border colors. The website, by contrast, declares the same 8-token `:root` on all three pages.
**Why:** This is the structural cause of nearly every visual finding below. The site can only drift as far as its 8 tokens allow; the app can drift anywhere. It is also why the marketing site reads as more professional - it is *governed*, not prettier.
**Where:** `index.html:409, 688` (the only two properties); `website/index.html:17-26`.
**Effort:** M | **Engine:** no

### 25. Zero brand color in the app, and no chrome anchor
**What:** `192E49`, `375CA0`, `E3A12E`, `3E6DA9` all return 0 hits across `index.html` and `ps-shell.js`. The app's chrome is four stacked near-whites (#f8f9fb appbar, #f7f8fa statusbar, #eef1f5 page, #fff command bar). The app's own primary `#3573bd` returns 0 hits on the site. The site declares `theme-color #192E49`; the app declares none.
**Why:** Clicking "Try it now" moves you from a navy-anchored, amber-accented brand to an unbranded gray one. Four near-white bands is what a web page looks like; one saturated chrome band framing the document is what an application looks like. Highest leverage-per-line change in the report (about 8 declarations).
**Where:** `index.html:1183, 1188, 1218, 1439, 1194`; `website/index.html:10, 17-26`.
**Effort:** S | **Engine:** no

### 26. The workspace is a web page: floating cards on a scrolling background under a blurred sticky header
**What:** `.ps-main-workspace { overflow: auto; padding: 0 12px 14px }` with a rounded shadowed `#ps-workcard` inside it, under `.ps-workspace-heading { position: sticky; background: rgba(238,241,245,0.96); backdrop-filter: blur(8px) }` - the identical recipe to `website/index.html:40-43`. The engine toolbar then gets its own border, 6px radius and shadow *inside* that padded card. Two of the three panes were already converted correctly (the inspector is de-carded at `index.html:1300-1304`, the data grid is edge-to-edge at `498-507`); the chart pane, the one users look at most, was not.
**Why:** This is the most concrete answer to "fancy web design instead of software". Same functional element - a toolbar - is edge-to-edge in Data and a floating pill in Charts, two clicks apart.
**Where:** `index.html:1411-1426, 33-36, 895-919, 2375`.
**Effort:** M | **Engine:** no

### 27. The chart does not auto-fit the pane, and there are no pane splitters **(partial: the engine ships manual sizing)**
**What:** Templates ship `plotWidth: 6` / `plotHeight: 4` = 576x384px, and nothing in the shell reads or writes them - no ResizeObserver, no Fit control. At 1440x900 the chart sits with ~137px of white on each side inside an 851px card whose toolbar spans the full width. Separately, `.ps-app-body` is a fixed `205px / 1fr / 330px` grid with no resizer, and the `.ps-no-inspector` CSS exists but its class is only ever *removed* (`ps-shell.js:8920`), never added.
**Already exists:** the engine has a width/height input pair with aspect presets (`graphbuilder2.js:25808-25848`) and edge-drag resize grips (`70690-70737`). So this is "does not auto-fit and has no shell-level Fit control", not "unresizable". Note the M4aa rollback removed a CSS *transform* display scale; changing `plotWidth`/`plotHeight` is a different mechanism that keeps the coordinate system M4aa protected.
**Consequence worth naming:** `#ps-workcard { min-width: 680px }` plus 535px of fixed rails means the main pane scrolls **horizontally** between ~760px and ~1239px viewport - a 1024px projector, an iPad landscape, and any half-screen window on a 1920 display.
**Where:** `templates/plotbuilder.json`; `index.html:1246, 1250-1253, 1411-1427, 2081-2090`; `graphbuilder2.js:5679-5682`.
**Effort:** M | **Engine:** no

### 28. The shell discards the engine's own animations, twice
**What:** Two shell-side behaviors cancel the motion the engine already has. (a) `renderChartIntoHost` sets `window.__gb2_authoritativeRender = true` before *every* render, and the engine's morph consume opens with `if (_gb2AuthRender) return; // echoes never animate` - so every state change routed through the shell lands with the 250 ms stat-morph discarded. (b) `window.setOption` schedules a full authoritative render 120 ms after any commit, while the engine's FLIP is 260 ms and its morph 250 ms - so the shell tears down and rebuilds the chart DOM roughly halfway through every engine animation.
**Why:** The premise "the chart moves like software and the frame hard-cuts" is only half true: the shell is suppressing the chart's motion too. This is the highest-value motion item in the report and it is entirely shell-side.

**CORRECTION (Jul 25 2026, measured):** this item is wrong as written and was
reverted after implementation. (b) was built at 320ms and measured: bars still
carry mid-animation transforms at 90/170/250ms with the echo at 120ms,
identical to 320ms. The teardown that does happen lands at ~60ms and is the
ENGINE's own local re-render, which then runs the morph on the fresh nodes. It
bought nothing and cost 200ms per echo. (a) is actively UNSAFE: the flag also
gates release of the engine's `__gb2_recentCommits` pins
(`graphbuilder2.js:3085`), so suppressing it strands them (the M6b pin lesson).
To re-open, measure a path where the payload genuinely differs (a category
reorder / FLIP), not a style commit the engine has already folded client-side.
**Where:** `ps-shell.js:2468-2470, 3219-3220, 3246-3247`; `graphbuilder2.js:3046-3048, 100127`.
**Effort:** S | **Engine:** no

### 29. The shell has five motion rules total, and no pressed states
**What:** Across a 3071-line stylesheet: 4 real transitions (tab reorder, toast, and two on the same level-drag component), one keyframe, and four `transition: none` suppressors (the fourth is the reduced-motion `transition-duration: 0.001ms`) - one of which forcibly disables transitions on the engine's own toolbar with no explanatory comment. Against that: 57-61 `:hover` rules, **none** with a transition, and exactly 2 `:active` rules, both on icon strips.
**Why:** A press state is the cheapest and most universal "this is software, not a link" cue, and it is absent on every button the user clicks. Hover hard-cuts everywhere. Every dialog, menu, workspace swap and inspector pane change happens in a single frame.
**Bonus:** the reduced-motion plumbing is already wired and persisted (`APP_PREFS.motion`, `body.ps-reduce-motion`, `ps-shell.js:9619-9621`), so a motion pass inherits working reduced-motion support on day one. Today that preference governs almost nothing, and the OS-level media query governs only the toast.
**Where:** `index.html:334, 336, 913-915, 1173, 1376, 1385, 1936-1943, 1955-1958, 2100-2102, 519, 955`.
**Effort:** S | **Engine:** no

### 30. Everything transient snaps: dialogs, menus, tabs, panes, disclosure
**What:** `openShellDialog` sets `display: flex`; the command palette materializes a 2px backdrop blur and a 65px shadow in one frame; the welcome screen uses two radial gradients (the site's own hero technique). Menubar dropdowns and the context menu - the two most-opened surfaces in the app, dozens of times per session - are raw `display: block` toggles. The tab active indicator is a per-tab inset shadow on a strip that is fully rebuilt on every sync. The role picker (M6e's primary interaction) expands at full height with no disclosure animation while the whole column is `innerHTML`-cleared. Empty-state to chart is a hard content swap plus a large reflow at the app's payoff moment.
**Related:** role eligibility highlighting strobes on chip hover (a 45% opacity swing with no transition), and reveal-in-data teleports through four consecutive instant jumps to a static ring, where the engine solves the same problem with a smooth centered scroll and an animated pin.
**Where:** `ps-shell.js:9594-9613, 7532-7535, 7536-7538, 3387-3391, 2358-2380, 2660-2682`; `index.html:241-245, 301-303, 1474-1478, 1966-1978`.
**Effort:** M for the set | **Engine:** no

### 31. Five modal treatments, four scrims, five radii, five shadows
**What:** Loader (radius 12 / `0 8px 30px`), exporter (14 / `0 16px 48px`), palette (9 / `0 22px 65px` + blur), dialogs (10 / `0 22px 65px` + blur), welcome (12 / `0 24px 70px` + two radial gradients). Four different scrim colors.
**Why:** A user's first minute is Welcome, New chart, maybe Preferences, then Export - four different designs for the same conceptual object. The shadows are marketing-scale elevation; native app dialogs sit around `0 8px 24px`.
**Where:** `index.html:1027-1030, 1099-1102, 1478-1480, 1505-1507, 1969-1978`.
**Effort:** S | **Engine:** no

### 32. Type scale, spacing and radius vocabularies are noise
**What:** 19 font sizes, seven of them inside the 9.5-12.5px band, five half-pixel tiers, and `body` sets no font-size at all so unstyled text inherits 16px. 23 padding values, 17 gap values covering every integer 1-16. 12 border radii, 76 of 121 declarations at 6px or larger, including a 17px pill - against an engine that speaks 3-4px corners and 11px text (560 uses) in the same window.
**Why:** Half-pixel tiers and every-integer gaps are invisible individually and corrosive collectively; nothing lands on a rhythm. It is also why the density preference can only reach three declarations - there is no scale to multiply.
**Where:** `index.html:10-14` and throughout; engine at `graphbuilder2.js:43923-43941`.
**Effort:** M | **Engine:** no

### 33. Secondary text fails AA at sizes the site never approaches
**What:** `#99a0aa` on white = 2.64:1 at 11px; `#929ba5` = 2.82:1 at **8.5px**; `#8a939d` = 3.01:1 at 9.5px; `#a0a6ae` = 2.45:1; `#8a929d` = 3.14:1. The site's muted `#5f6f80` at 14.5-16px = 5.16:1. The **engine** was already swept to a `#666` minimum (CLAUDE.md convention 15).
**Why:** Half the app's supporting copy is illegible-adjacent, in the same window as an engine that was explicitly remediated. Two mechanical passes fix it: raise the grays to `#666` or darker, raise the 8.5/9px tiers to 10px.
**Where:** `index.html:120, 139-141, 249-253, 1214, 1215, 1458`.
**Effort:** S | **Engine:** no

### 34. Icons are half hand-drawn SVG, half unicode dingbats
**What:** Real 16x16 / 1.5-stroke SVGs for undo, redo and search sit in the same 43px band as `▦ ▥ ⊞` nav icons, `↗` Open, `↓` Save, `⋯`, `↻`, and a **fullwidth** `＋`. The geometric shapes and the braille grip fall back to a symbol font on Windows and Linux at a different weight, baseline, or as a box.
**Why:** This is the one visual defect that literally looks different on the machine Torry builds on versus the machines students use. The site already established the icon spec (24x24, fill none, stroke currentColor, 1.8, round) that would fix it.
**Where:** `index.html:2150, 2152, 2164-2171, 2321-2346, 2368, 2547, 2561`; `ps-shell.js:54-62`.
**Effort:** M | **Engine:** no

### 35. Help Me Choose is a third color family and a landing page
**What:** Eight teal values (`#16877d` etc.) that appear nowhere else in the project - not in the engine, not in the jamovi wizard it imitates (which uses `#14524b` etc.), not on the site. Plus a 23px h2 with -0.02em tracking, 17px questions, and 142px 17px-radius pills, inside an app whose surrounding UI is 10.5-12px.
**Why:** The app already runs two blues; this invents a third accent for one surface, and it is a novice's first serious interaction. Opening it feels like navigating from the app to a product page. The content is good; only the skin is foreign.
**Where:** `index.html:1564-1608`.
**Effort:** S | **Engine:** no

### 36. The chart pickers show glyphs, not charts
**What:** "New chart" gives each MODULE one character (Distribution a sine wave, Scatter a dot, Correlation a box glyph), and the welcome template preview is three CSS-styled `<i>` elements faking a bar chart. Help Me Choose renders its recommended graph types as bare text chips. Meanwhile eight real unretouched renders sit in `website/assets/gallery/`, and the app already owns a chrome-stripped chart-SVG snapshot pipeline (`CHART_SNAPS`).
**Why:** Both places where a student picks a chart are text-only. Students choose graphs by picture.
**Where:** `ps-shell.js:54-62, 6329, 6858-6863, 7078-7081`; `index.html:1537-1541, 2577-2579`.
**Effort:** M | **Engine:** no

### 37. The status bar and grid footer carry instructions instead of instrumentation
**What:** The chart workspace's selection slot is the literal constant "Click a chart element to edit"; the context slot restates the highlighted nav item; the document slot duplicates the appbar's save chip in different words. The grid footer is a permanent four-sentence how-to where Excel, Sheets and Numbers all put Sum / Average / Count, and `ps-stat.js` is already loaded.
**Why:** A status bar earns its 25px by reporting the state of the machine. Two of three workspaces already do it live (Data mirrors a real range summary, Layout reports a count), which proves the mechanism works - the gap is content.
**Where:** `ps-shell.js:8941, 8977, 1279-1294, 4805, 4139-4146`.
**Effort:** M | **Engine:** no

### 38. `renderLayout()` re-parses every chart SVG on every drag release, align and selection clear
**What:** `canvas.innerHTML = ""` then rebuild, with `elI.innerHTML = snap.svg` per chart item. 27 call sites including `layPointerUp`, align, distribute, nudge, zoom, grid, resize debounce and the Escape path.
**Why:** A four-panel figure re-parses four full SVG strings (100-300 KB each) every time the user drops an item or clears the selection. That is a guaranteed hitch on the most-used gesture in the workspace, and it makes any future FLIP impossible because the old nodes no longer exist to measure against.
**Related and systemic:** there are **28** `innerHTML = ""` full-rebuild sites in the shell (tabs, roles, grid, toast). Any future motion work that needs a before-state is blocked by this everywhere, not just in three places. Note also that the shell's single `requestAnimationFrame` is a scroll throttle that calls `syncDataGrid`, which is a full table rebuild - so virtualized scrolling destroys and recreates every visible row.
**Where:** `ps-shell.js:7954-7972, 8028, 8630, 5703-5715, 4688-4697`.
**Effort:** L | **Engine:** no

### 39. Three (four) drag systems with four different feels
**What:** Variable chips use native HTML5 DnD with no lift class (and therefore no touch support at all). Tabs use pointer events with a styled lifted state and neighbors that part. Layout items write `style.left/top` directly with **no** dragging class and no `cursor: grabbing` despite declaring `cursor: grab`. The grid column resizer sets a body state class. Same verb, four treatments; the one with zero acknowledgement is the figure composer.
**Where:** `ps-shell.js:3694-3709, 7450-7461, 8477, 8615-8618, 5733`; `index.html:335-340, 585`.
**Effort:** M | **Engine:** no

### 40. Cold boot paints a complete, inert application
**What:** Ten blocking `<script>` tags at end of body, ~3.4 MB total including 506 KB of jsPDF + svg2pdf loaded eagerly for an export most sessions never touch. No `defer`, no boot state. The chrome paints first, so the user sees a finished app whose menus do nothing and whose status bar already claims "Autosaved locally" before any JS has run, then the welcome modal snaps in.
**Why:** On the target hardware this is seconds, and it is the first thing anyone sees.
**Where:** `index.html:3060-3069`; `ps-shell.js:10403-10409`; `dist/pandion-plots.html` = 3,416,197 bytes.
**Effort:** S (boot state) + M (lazy PDF libs) | **Engine:** no

### 41. No web app manifest: the product can never leave the browser tab
**What:** The head is doctype, charset, viewport, title, favicon. No `<link rel="manifest">`, no `theme-color`, no `apple-touch-icon`, no service worker, no `og:*`, no description. The favicon itself has a dark-mode rule; nothing else in the app does.
**Why:** The app always runs with a URL bar, tab strip and bookmark star above the 34px appbar it built. A 12-line manifest with `display: standalone` gives it its own window and dock icon, which is the single highest ratio of "reads as software" to effort in the whole report. It also fixes the missing card preview when the app URL is shared, and gives the home-screen tile the wing that `icon-180.png` already exists for.
**Where:** `standalone/index.html:1-8`; site equivalents at `website/index.html:7-15`.
**Effort:** S | **Engine:** no

### 42. Small chrome tells that add up
- **App chrome is text-selectable.** `user-select: none` covers only the appbar, status bar, tabs, grid and two drag handles. Drag across the inspector, navigator, workspace title or a role card and the browser paints a blue selection. It also breaks a real gesture: the copy-as-image branch bails on a non-empty `getSelection()`, so a stray highlight silently disables it. No `::selection` rule either. (`index.html:297, 586, 693, 699, 732, 866, 1189, 1377, 1390, 1440`; `ps-shell.js:10214`) **S**
- **Cursor policy is inverted.** `cursor: pointer` on 36 rules including every toolbar and dialog button; `cursor: default` on 6. The menubar got it right and nothing else did, so the cursor changes to a hand crossing from File down onto the command bar. **S**
- **Tooltips are native `title=` attributes**: OS delay, OS font, unstylable, never on keyboard focus. The app's most frequent transient surface is drawn by the browser. (14 in markup plus runtime strings at `ps-shell.js:4761, 8052`) **S**
- **Scrollbars unstyled in 15-17 overflow regions.** The only scrollbar rule in the file *hides* the engine toolbar's, so the technique is understood and simply not generalized. On Windows and Linux the 205px rail loses 8% of its width to an opaque bar. (`index.html:916-918`) **S**
- **Italic UI text on six live empty/missing states** (a seventh sits inside the dead `.ps-head` CSS), and `kbd` rendered as plain monospace with no key cap. The moments where the app has nothing to show are the moments it looks most like a document. (`index.html:120, 435, 578, 742, 846, 1647, 1895-1897`) **S**
- **Superseded page CSS still opens the stylesheet**, including the site's exact 1080px content column and four dead `.ps-head` rules, overridden 1164 lines later by the app frame. Diagnostic rather than damaging, but it is the literal evidence: a web page that grew an application frame, with the page still in the file. (`index.html:9, 16-23, 54-57` vs `1179-1184`) **S**
- **No `forced-colors` or `@media print` handling.** Under Windows High Contrast the three-pane structure disappears entirely, since the panes are distinguished only by background plus a hairline. **S**

### 43. Dark mode - the one entry that would need engine work
**What:** No `prefers-color-scheme` anywhere in the app *or the engine*; the only occurrence in the project is inside the base64 favicon. `APP_PREFS` has density, motion and startup but no theme.
**Why:** Its absence now reads as "this is a web page" rather than a design choice, and the tab icon adapting while the app does not is a comedy a sharp user will notice.
**Honest constraint:** a genuine full dark mode is **not reachable without engine edits** - the engine hardcodes hundreds of light literals. Two defensible options: ship dark **shell chrome only** with the chart pane deliberately staying light "paper" (what Figma, Illustrator and Keynote do), which is shell-only once the token layer exists; or decline it explicitly and record why, so it stops reading as an oversight.
**Where:** `ps-shell.js:38`; `index.html:7`.
**Effort:** M | **Engine:** YES for a full dark chart. Do not attempt without a plan.

---

## Tier 3: feature gaps vs the jamovi build worth closing

### 44. Repeated Measures is stuck on the legacy flat path **(partial: a documented v1 scope cut, twice)**
**What:** Roles are `measures` + `betweenVar` only, with **no facet role** - `buildRM` is the only builder without a `hasFacet` block. So RM charts can never be paneled, and `pivotFactors`/`pivotObs` (the engine's on-chart pivot chips, which re-aggregate 100% client-side) are dark.
**Downstream:** the engine's mixed three-way ANOVA, the "Every pair, across panels too" compare scope, and per-panel simple-effect brackets are all unreachable on RM because no RM chart can have panels.
**Cheap half:** adding just `facetVar` and encoding it into `bars[].x` with `FACET_SEP` (copying `buildCG` at `ps-data.js:79-152`) unlocks panels and the mixed ANOVA on its own.
**Where:** `ps-data.js:718-722, 825-835, 1133-1147`; ruling at `STANDALONE-BRIEF.md:93`.
**Effort:** S for panels, L for full factorial + pivot | **Engine:** no

### 45. Command coverage: ~35 data commands exist only behind right-click **(partial: a persistent Data command bar covers ~8 of them)**
**What:** `APP_MENU_DEFS` defines only file/edit/view/insert/help, and `commandCatalog` builds the palette from four of those, so the palette is a 20-item mirror of the menu bar. Reshape to wide, Add computed column, Sort, Hide column, Insert column and Restore exclusions live only in context menus. The palette's filter is plain `indexOf`, and there is no way to jump to a document by name - the classic first use of a palette. Insert lacks "Chart panel" though the layout toolbar has it.
**Already exists:** undo, redo, Add row, Find, Filter, Hidden columns and Restore exclusions are in the visible Data command bar (`index.html:2318-2369`). The M4c scope was deliberately four menus.
**Where:** `ps-shell.js:9796-9843, 10033-10057`; `index.html:2874-2922`.
**Effort:** L (promote one COMMANDS registry that menus, context menus and the palette all render from - `commandEnabled`/`commandDisabledReason`/`runAppCommand` at `9857-9946` is already that shape) | **Engine:** no

### 46. The Edit menu never mentions the app's own clipboard, and Copy is disabled where copying works
**What:** Edit has Undo/Redo, Copy as image, document commands, Reset styling, Preferences - no Cut, Copy, Paste, Select all or Find. Meanwhile the grid implements TSV copy and delimiter-sniffing matrix paste, and `commandEnabled` disables "copy-image" *whenever the workspace is Data*, with the reason "Open a chart or layout to copy it as an image". So in Data the Edit menu's only clipboard entry is greyed out while a real clipboard model runs underneath it.
**Where:** `ps-shell.js:9807-9821, 9864-9866, 9884-9886, 5820-5835`.
**Effort:** S | **Engine:** no

### 47. Spreadsheet gaps: no find-and-replace, no column reorder, no fill-down, no column stats
**What:** Find exists with prev/next and a count; Replace does not (grep confirms). The column menu has 12 commands and no move left/right, and headers are not draggable. Fill is "Fill with focused value" only. The variable inspector shows Rows/Valid/Missing/Distinct/Excluded/Used-in and no mean, SD, min, median, max or level frequencies.
**Why:** Recoding "Male"/"male"/"M" to one level currently requires a computed IF() column or one cell at a time. Column order is the only ordering the app exposes to the eye. And there is no way to sanity-check a column before plotting it.
**Where:** `ps-shell.js:4645, 8785, 8812-8819`; `index.html:2350-2353, 2876, 2879-2901`.
**Effort:** L for all four; Replace alone is M | **Engine:** no

### 48. No date or time measure type
**What:** `VAR_TYPES` is id/nominal/ordinal/continuous. `ps-xlsx.js` does the hard part correctly (builtin numFmt ids plus custom `formatCode` sniffing, serial-to-ISO at `49-60`) and then the type system has nowhere to put the result, so dates land Nominal with one level per day.
**Why:** The most common longitudinal shape a student brings produces a 400-bar Frequencies chart with no chronological ordering except by lexicographic accident.
**High-value slice:** detect ISO-ish dates in `inferType`, keep them Nominal but write the sorted chronological order into `declaredLevels` so the axis at least reads left to right, plus an "Extract year / month" hint. A real continuous date axis is a separate project.
**Where:** `ps-shell.js:91-96, 139`; `ps-xlsx.js:35-60`.
**Effort:** M for the slice | **Engine:** no

### 49. Scatter overlays switch off on any data change **(partial: the self-heal pattern already ships for the heatmap)**
**What:** On a stale overlay fingerprint, `buildPayload` rewrites `xyMarginal` to "none" and `xyShowDensity2D` to false. R, by contrast, recomputes and re-ships every run.
**Already exists:** M6d does exactly the proposed pin-a-synthetic-commit self-heal for the heatmap (`RECON_BIN_PIN` into `window.__gb2_pendingOpts`, `ps-shell.js:3185-3204`). The ask is "extend M6d to marginals and contours", not a new idea. The engine's own client computers (`_xyEnsureMarginalsClient`, `_xyComputeDensity2DClient`) are what the shell already harvests.
**Where:** `ps-shell.js:2288-2306, 3078-3080`.
**Effort:** M | **Engine:** no

### 50. Help Me Choose ships without the wizard's thumbnails, teaching tip, and handoff
**What:** No graph-type glyphs, no `gpBlock` "Color grouping or panels?" teaching tip (the single most common confusion the jamovi wizard was extended to address), and no closing line pointing at the on-chart "Which graph?" / "Check graph" tabs - so the wizard dead-ends.
**Where:** `ps-shell.js:6858-6871, 7078-7081`; jamovi equivalent in `R/helpmechoose_wizard.R`.
**Effort:** M | **Engine:** no

### 51. Document lifecycle keyboard model
**What:** No Cmd+W (closes the browser tab), no Ctrl+Tab or bracket cycling, no Cmd+1..9, no Cmd+1/2/3 for workspaces despite the View menu listing all three. `#ps-tabs` uses `flex-wrap: wrap`, so a project with a dozen charts pushes the canvas down a row at a time - which no tabbed application does. Export, the terminal action of every session, has no accelerator at all while Preferences has one.
**Where:** `ps-shell.js:10219-10232, 10259-10272, 9805`; `index.html:290-293`.
**Effort:** M | **Engine:** no

### 52. Layout copy/paste and image paste
**What:** The only paste listener is on the grid. Cmd+C in a layout always copies the whole page as an image, even with a single caption selected. Images enter only through the file input; clipboard paste is impossible. Cmd+D duplicates *within* a layout, which makes the absence of cross-layout copy more conspicuous.
**Where:** `ps-shell.js:5826, 10208-10217, 8517`; `index.html:2395`.
**Effort:** M | **Engine:** no

### 53. Preferences is five settings with no defaults, storage, or backup control
**What:** density, motion, on-launch, default export format, default raster DPI, and no Restore defaults. Nothing exposes the default palette or chart style (settable only from inside the engine's gallery), default missing-value tokens, autosave control, storage usage, or a clear-local-data action - even though Diagnostics already computes the storage estimate.
**Where:** `index.html:2779-2820`; `ps-shell.js:38, 9695-9696`.
**Effort:** M | **Engine:** no

### 54. Recents cap silently at 900 KB and lose their file association **(partial: the 3-slot cap is a documented M4b ruling)**
**What:** `rememberRecent` bails above 900,000 characters with no signal, so any project with a few thousand rows *never* appears and the feature looks broken. There is no File > Open Recent submenu. `openRecentProject` nulls `FILE_HANDLE`/`FILE_SAVED_REV`, so reopening does not reconnect to the file on disk - and it replaces live work with no unsaved check.
**Where:** `ps-shell.js:1071-1090, 9460-9472, 9797-9806`.
**Effort:** M (metadata plus a persisted `FileSystemFileHandle` in IndexedDB) | **Engine:** no

### 55. Shortcuts sheet is hand-written, already stale, and covers only shell keys
**What:** 13 static rows. Missing but implemented: Cmd+N, Cmd+comma, Cmd+F, Alt+Up/Down for level reordering, Cmd+Enter to save a formula. It conflates the grid TSV copy with copy-as-image in one row. It never mentions the chart-editing keys (Delete to hide, Cmd+Shift+C/V style copy, arrows between chart parts, `?` for help), which live only in the engine's own table. It documents "Undo / redo" as one thing when the app deliberately implements two arbitrated stacks. And the sheet itself has no keyboard route: no F1, no bare `?`, and `commandCatalog` explicitly excludes it from the palette.
**Where:** `index.html:2835-2848`; `ps-shell.js:9938-9939, 10043-10044`; `graphbuilder2.js:52847-52862`; router at `ps-shell.js:6239-6275`.
**Effort:** S | **Engine:** no

### 56. Help has no documentation, and About is a 2.8-second toast
**What:** Help is Keyboard shortcuts / Diagnostics / About. About is `showToast(...)`. No user guide, no What's new, no link to the site or gallery, no pointer to the engine's built-in tutors. The app contains **zero external links** of any kind (grep for `http://`/`https://` excluding namespaces: nothing), so a stuck student's only escape hatch is their instructor.
**Where:** `ps-shell.js:9837-9844, 9942-9944`.
**Effort:** S | **Engine:** no

### 57. `.omv` is a one-way dataset import, and the site promises more
**What:** Analyses (the protobuf option blobs) are not imported, and there is no `.omv` writer. Meanwhile the site says "projects save as portable files that open in any of them" directly under a four-card list whose fourth card is jamovi. The three Pandion builds do share `.pand`; jamovi neither reads nor writes it.
**Note:** the shell already re-interprets the whole jamovi option vocabulary (chartSpec, annotationsJson, the library ACTION protocol), so inbound analysis import sits on machinery that exists.
**Where:** `ps-omv.js:11-13`; `website/index.html:321-325, 381-394`.
**Effort:** S to narrow the sentence; L to import analyses | **Engine:** no

### 58. Per-variable missing tokens, and copy with headers
- **Missing tokens are dataset-wide only.** One shared list cannot express "-99 means missing in Age, 9 means missing in a rating item, 0 is real in Errors". The control is honestly labelled but sits inside a panel headed "Inspecting <name>". (`ps-shell.js:80-85, 4062`; `index.html:2247-2253`) **M**
- **Grid copy emits headerless TSV** with no option, even when the selection spans whole columns - the exact case where headers are wanted. `GRID_SELECTION_KIND` is already tracked. (`ps-shell.js:4230-4249`) **S**

### 59. No provenance or reproducibility surface
**What:** jamovi analyses appear in syntax mode as reproducible R calls. Here the project file is opaque JSON, an exported PNG carries no statement of variables / summary function / error-bar type / filter / version, and Diagnostics reports app version, project, dataset, documents, snapshot size, autosave, render ms and browser capability - nothing about what produced the chart.
**Note:** most of the raw material already exists (the filter disclosure string, the per-module missing note), so this is assembly, not computation. It could ride the export caption (M6a) and reach PNG/SVG/PDF for free.
**Where:** `ps-shell.js:9656-9677, 3100-3106`.
**Effort:** M | **Engine:** no

### 60. Templates carry no engine-version stamp, and declared channels are never checked
**What:** `templates.js` has no hash or version; `manifest.json` records only per-module key counts and channel lists. Any new payload key with a non-falsy default, or any changed default, leaves the standalone rendering `undefined` or last month's look with no warning. And `manifest.json:8` declares `distNormality` as a live distplotbuilder channel that the shell hard-codes empty - so the one mechanism that could have caught the Shapiro gap mechanically is inert.
**Fix:** stamp `__engineMd5` from `build-templates.R`, and loop declared channels asserting the builder wrote each. Surface both as Diagnostics rows.
**Where:** `templates/templates.js:1`, `templates/manifest.json`; `ps-shell.js:2237-2242`.
**Effort:** S | **Engine:** no

---

## Tier 4: nice to have, later, or deliberately not

- **Bubble sizing and per-point labels are fully built in the engine and hidden in both shells.** jamovi withdrew them Jul 9 2026. **Do not ship them here** unless that ruling is re-opened, or the two shells will disagree about what Scatter can do. (`ps-data.js:1177-1186`)
- **Site says 3.0.0, app says 0.9.0-rc1**, and `about.html:230-231` explicitly tells a citing researcher to use the number under Help in the app. Two numbers, one of them wrong, on a citation path. (`ps-shell.js:39`; `website/index.html:331`, `about.html:238`) **S**
- **The app has no license, copyright or citation surface** despite GPL-3.0 and a whole "Citing Pandion Plots" section on the site. Grep for cite/GPL/license/copyright in the shell: zero. The portable HTML is the form most likely to travel without the site attached. **S**
- **The site's only product screenshot is stale** - `app-scatter.png` predates the M6e role-picker redesign, so it advertises a UI the live app no longer has. **S**
- **The site never shows the two things that make this more than a chart tool**: the typed data workspace and the figure composer. Everything displayed could come from a dozen other tools. Both shots take minutes with the same playwright script. **S**
- **The web app is byte-identical to the portable download** (3,416,197 bytes), so the browser target can never cache the 1.9 MB engine across visits. A cache-friendly build already exists structurally (`index.html` loads nine separate scripts) and is simply not what gets deployed. **M**
- **The privacy promise the site leads with is absent from the app.** "No accounts, no uploads: your data stays on your machine" appears nowhere in the shell - not on the start center, not in the loader, not in About. It is the most load-bearing claim for a student on a school Chromebook, and stating where the data lives is something software does and a web page usually cannot. **S**
- **The welcome dialog has no close control at all** (no X, no Close, no backdrop click), and Escape is gated on `BOOT_RESTORED`, which is false on a cold load. So on the very first visit the modal is inescapable except by choosing one of three actions, with a fully loaded sample project sitting behind it. There is no "let me look around first" path. (`index.html:2526-2588`; `ps-shell.js:9556-9589`) **S**
- **Start center says nothing about what the product is.** "Open a project, recover recent work, or begin from data" is written for someone who already owns projects. One borrowed sentence from the site would fix it. **S**
- **Three unicode em dashes in prose** break the house rule: `document.title` (the most-screenshotted string in the product), the grid range status, and one HMC line. **Careful:** the other four `\u2014` occurrences (`ps-shell.js:604, 737, 4923`) are missing-value glyphs that CLAUDE.md convention 19 mandates - a blind sweep breaks that. `verify/branding-check.mjs:48` pins the title form. **S**
- **"Help Me Choose" vs "Help me choose"** - the one Title Case string in a consistently sentence-cased app, and the feature instructors will name in course materials. `verify/help-me-choose-check.mjs:33-41` pins the Title Case form. **S**
- **Dead code:** `#ps-pandion-logo` (~5 KB of osprey path data, never `<use>`d, shipped in every 3.4 MB download); the four `.ps-head` rules; `.ps-datarow`. Meanwhile `pandion-mark.svg` - the one piece of art already recolored to the site's tokens - is used nowhere at all. **S**
- **Four colorways of one brand mark:** the wing (site and app) is `#152d5e`/`#1a53cf`, `pandion-mark.svg` is `#192E49`/`#375CA0`/`#E3A12E`, the dead app symbol is `#0f335d`/`#2760b3`/`#e28b0b`, the app's interactive blue is `#3573bd`. There is currently no single color anyone could call "Pandion blue". **S**
- **Three READMEs are stale.** `standalone/README.md:806-818` "Known v1 gaps" still lists the scatter overlay and RM/Corr/Likert bullets that M6b and the shipped builders superseded - only Shapiro and LOESS still hold, and it sits under a heading a reviewer trusts. `README.md:877-879` says the setOption sink drops paletteLibrary/styleLibrary/styleStamp when the code interprets all three, so a future session obeying it would delete the working style bridge. `website/README.md:44-45` misattributes two assets. **S**
- **No pane splitters, and the engine tells users to drag one.** The sigma panel's clip note says "drag the divider between the spreadsheet and the results", which is impossible here. Adding splitters makes the sentence approximately true and gives the panel the room it negotiates for. (`graphbuilder2.js:52784`; `index.html:1245-1252`) **M**
- **The Chart-settings Diagnostics checkbox is dead**: it writes `gb2_debug_timing` and calls `window.__gb2_buildDbgOverlay`, which is defined only in `R/widget.R`. Either hide the row, or - better value for the same effort - define that function in the shell to draw standalone-meaningful lines (payload build ms, render ms, row count, template hash). The engine calls it by name and does not care who defines it. (`graphbuilder2.js:67615, 68685, 68882-68896`) **S**
- **LOESS is approximate and nothing in the UI says so.** `pEff = max(2, min(n-1, 1.2*(n/q)))` drives the CI band, versus R's exact trace-based df. Every other statistic in the shell is R-parity by construction, and the curve looks identical while the band does not. Only the README discloses it. Cheapest honest fix: append a sentence to the payload's `missingNote` when `xyFitType === "loess"`. (`ps-stat.js:474-540`; `README.md:809`) **S**
- **Nominal level order is first-seen, not sorted** - a silent divergence from R that the parity harness is structurally blind to (`verify/m1-parity.R:113-117` passes explicit levels for every factor). The same CSV can produce a different X order and therefore different palette assignments in the two shells. Ordinal first-seen order IS documented (`README.md:790`); nominal is not. Decide it, document it, and add a parity case that does *not* pass levels. **S**
- **Exclusion disclosure wording.** On Frequencies / Scatter / Correlation / Likert, hand-excluded cells are counted into "N of M cases not shown (missing values)", which attributes an author decision to missing data - the one wording a reader takes as reassurance. The three-module scope of the ghost markers is a documented M4l decision; the wording is not. `retypeColumns` already knows which nulls came from exclusion. (`ps-data.js:23-26`; `ps-shell.js:2175-2181, 839, 864`) **M**
- **Menu bar keyboard model is incomplete**: no Left/Right between open menus, no Home/End, no typeahead, no F10 or Alt entry point. The mouse path (mouseenter re-targets an open menu) is correct, which makes the keyboard gap look like an oversight. (`ps-shell.js:10142-10166`) **S**
- **`navigator.storage.persist()` is never requested**, so all work sits in evictable storage while the chip says "Autosaved locally". One line at boot, result surfaced in Diagnostics. **S**
- **The toast is a single slot floating over the status bar** the app built. `showToast` and `showUndoToast` share one node and one timer. Errors share the success channel: same `aria-live="polite"` region, and a *shorter* life (2.8 s) than the undo toast. **S** (see also the correctness item below)

---

## Bugs and correctness risks

Ordered by consequence. These are the ones that produce silently wrong output, silently lost work, or a keystroke that does damage.

**B1. Layout and export snapshots go stale after most data edits.** `CHART_SNAPS` is invalidated at 8 mutation sites and not at 8 others - notably `gridCommitEdit`, `setColType`, data undo/redo, `deleteVariable`, `renameVariable`, `sortRowsByVariable`, `applyVariableLevelOrder`, `setMissingTokens`. Only the active chart re-renders, so a layout containing other charts draws and **exports** the pre-edit chart. A publication figure that silently disagrees with the data, with no visible cue.
`ps-shell.js:2505, 2554, 2565, 1763, 8026`; resets at `374, 627, 2784, 5240, 5283, 5317, 5519, 10336`. **Fix:** key each snapshot with a data revision so invalidation cannot be forgotten again. **S / no engine**

**B2. Layout export silently omits any panel with no snapshot.** The on-screen canvas is honest (it paints a `ps-lmissing` placeholder); the export path does `if (!snap || !snap.svg) continue;` and drops the panel, leaving a hole with no error and no warning. Combined with `captureChartSnapshot`'s silent bail (`clientWidth < 200`) and `ensureSnapshotsThen`'s best-effort loop with no completion check, a composed figure can export a panel short. Strictly worse than B1: a stale panel at least looks like a chart.
`ps-shell.js:1763` vs `8026-8030`; bail at `2513`. **S / no engine**

**B3. The engine's undo stack is shared across all chart tabs.** Every chart renders into the same host through the same engine with one fixed localStorage key, and `switchChart` never partitions or clears it. `_undoApply` re-emits `_setOption(key, oldValue)`, and the shell's sink writes to `optionsFor(curModule())` - the *currently active* chart. So styling chart A, switching to B, and pressing Cmd+Z applies A's old value to B and persists it. CLAUDE.md convention 20 documents this hazard for jamovi where it needs two open analyses; here every tab switch reproduces it. The `hasOwnProperty` guard does not bound it, because the shell clones ~554-key templates whose key sets overlap almost completely. And in the Charts workspace the shell **deliberately** hands Cmd+Z to the engine (`ps-shell.js:6265`, "else the engine's document-capture handler takes it") while the Edit menu advertises the shortcut.
`graphbuilder2.js:91941, 92255, 92384`; `ps-shell.js:3243, 6239-6266, 6284-6300`. **Fix:** namespace both `graphbuilder2.undo.v2` and `graphbuilder2.inspector.v1` per chart doc from the shell around each render - plain localStorage strings, no engine change. **M / no engine**

**B4. Escape does not cancel a layout drag, and leaves the drag live.** The handler clears the selection and repaints from already-mutated coordinates, never touching `LAY_DRAG` or its document listeners - so the item stays where the cursor put it and keeps following the mouse with no selection outline. Two of the app's three drag systems honor Escape (`tabDragEsc`, `levelPointerEscape`); the one that arranges a publication figure does not.
`ps-shell.js:8516-8518`; `LAY_DRAG` at `7716, 8477, 8625`. **S / no engine**

**B5. Retyping a filtered column to Nominal blanks every chart in the project.** `computeFilterState`'s non-numeric branch supports eq/ne only and returns `false` for gt/ge/lt/le, and `validFilters` never re-checks op against type. Build `score > 60`, switch Score to Nominal (a two-click action), and every row fails: zero rows, every chart empty, only a "showing 0 of 24 rows" chip to explain it. Same on load if a saved `.pand` carries a filter whose column was retyped.
`ps-shell.js:241-247, 285-290, 3752, 5420`. **Cheapest safe fix:** treat an inapplicable op as pass-through so a type change can never blank the dataset. **S / no engine**

**B6. A row whose filter column is MISSING is dropped, and the disclosure never says so.** `computeFilterState` treats a null on any filter column as a failure. The chart note names only the conditions and counts, so a reader attributes all dropped rows to the stated threshold. It compounds B5 and the inferType findings: a column whose missing token is not "NA" types Nominal, which flips the filter into the eq/ne branch, which then drops everything.
`ps-shell.js:270-272, 2312-2316`. **S / no engine**

**B7. Row-filter disclosure can never appear in an exported figure.** The filter sentence is prepended to `payload.missingNote`, which the engine renders as a dismissible HTML pill appended to the wrap, not the SVG - CLAUDE.md convention 18 states outright it is not part of the exported figure. `chartExportSource` serializes only the SVG plus a background rect plus the optional caption. So every SVG/PNG/JPG/PDF export, every layout snapshot and the 192-DPI copy-as-image shows a filtered subset with zero indication.
`ps-shell.js:2311-2317, 1624-1680`; `graphbuilder2.js:93487-93488`. **Fix:** write the sentence into `chartNote` (a real spec key, reachable via setOption/chartSpec, and inside the SVG) or into the export caption block. **M / no engine**

**B8. `buildPayload` and the aggregation path sit outside the render error boundary**, and there is no `window.onerror` or `unhandledrejection` anywhere. Because `render()` is the last statement in nearly every mutation path, a throw leaves the state committed and persisted with nothing on screen - `switchChart` points at the new tab while the host shows the old chart. Reloading replays the same stored options, so a payload that reliably throws is a permanent wedge with no in-app way out.
`ps-shell.js:2447-2481`. (Fair credit: module builders return `{error}` objects for *expected* failures, and the engine-render call itself is wrapped, so only genuine exceptions escape.) **S / no engine**

**B9. `.omv` columns with an unmapped `measureType` default to Continuous and read as entirely missing.** `MEASURE_MAP` covers four keys; anything else becomes `"continuous"`, and every text label then `Number()`s to null. The import reports success. Worse, `adoptOMV` **bypasses the import preview entirely** - no per-column type select, no confirmation, no undo - so there is no correction surface. One-line fallback: use `dataType` when the map misses.
`ps-omv.js:72-73, 122-123`; `ps-shell.js:9195-9215, 9346`. **S / no engine**

**B10. Computed variables have no cycle or forward-reference detection.** `knownColumns` includes every other computed column, including ones defined later, and `recomputeFormulas` evaluates in `t.order` order writing as it goes. `A = B + 1` and `B = A + 1` both compile clean and drift on every subsequent edit with no signal. Forward references silently use stale values for one cycle, so a computed column reads one edit behind. The `computedErrors` reporting channel already exists.
`ps-formula.js:330-338`; `ps-shell.js:794-827`. **Fix:** topologically sort by refs; on a cycle write the error the fx badge already renders. **M / no engine**

**B11. Scatter overlay fingerprint uses a column SUM, so compensating edits keep a stale overlay.** Edit 5 to 3 and 7 to 9 in the same column and the sum, row count and roles are identical, so cached marginals, heatmap tiles and contours keep drawing against data that no longer exists. This contradicts M6b's own stated guarantee that "a wrong overlay can never draw", and it is exactly the swap-two-values correction a student makes when fixing a typo. Replace the sum with an order-sensitive hash over the same pass.
`ps-shell.js:3097-3108, 2288, 3150`. **S / no engine**

**B12. In-flight style edits are dropped on tab close.** See Tier 1 #13. The engine's `_flushOpts` defers via `setTimeout` inside its 700 ms interaction guard, and a setTimeout scheduled during unload never runs. The shell registers no unload handler to compensate. This is why probes must zero `__gb2_inspectorInputAt` before dispatching beforeunload.
`graphbuilder2.js:3991-4016, 4224`. **S / no engine**

**B13. The save-state chip claims "autosaved" when autosave has failed.** The honest branch is gated on `FILE_SAVED_REV == null`, so once a user has saved a `.pand` even once, a subsequent quota failure leaves the most prominent persistence indicator reading "Modified - autosaved". The truthful text is one line lower in a small grey status bar. `verify/hardening-dom-check.mjs` asserts the diagnostics string, not the chip.
`ps-shell.js:1283-1287`. **S / no engine**

**B14. `AUTOSAVE_HEALTH` resets to "ok" on any successful write**, so one lucky small write erases all evidence that saves have been failing, including the honest status line. There is no failure counter and no "last successful autosave" timestamp - and `projectSnapshot` carries no `savedAt` at all, while `projectFileText` and recents both do. So the recovery button can offer a snapshot of unknown age, and the app cannot answer "when did my work last actually reach storage".
`ps-shell.js:1046-1065, 1109-1110, 9480-9482`. **S / no engine**

**B15. Save-to-file failure is completely silent in the download fallback.** The whole Blob/anchor/click sequence *plus* `flashSaved()` is wrapped in `try { } catch (e) {}` with an empty handler, and `flashSaved` is inside the try - so a blocked download is indistinguishable from a success. This is the path Safari and Firefox take, and the `.pand` is the only durable copy of the work. The sandboxed-iframe branch just above does give an honest fallback, so this is an inconsistency rather than a house style.
`ps-shell.js:1352-1364`. **S / no engine**

**B16. Style/palette library writes fail silently.** `saveLibrariesNow`'s catch is empty and `PS_LIBS` is read once at boot, so a quota-full save shows the style card in the UI and loses it on reload, with nothing able to heal it.
`ps-shell.js:2917-2927`. **S / no engine**

**B17. A later toast can destroy a pending Undo without running it.** One toast node, one timer, both writers clear `innerHTML` first. `showUndoToast` is the only recovery path for closing a document and for the three named data deletions, and it lives 6 seconds - but any `showToast` inside that window (an autosave error, "Copied N cells", an exclusion toast) silently removes the Undo button and the offered restore never happens.
`index.html:3058`; `ps-shell.js:1456-1486, 7310, 4022, 4327, 5185`. **S / no engine**

**B18. Opening a recent project replaces live work with no unsaved check.** `openRecentProject` applies the snapshot immediately, clears history, nulls the file association and persists - which also overwrites the autosave key with the newly opened project. If the current project was never saved to a `.pand`, it is gone.
`ps-shell.js:9460-9472`. **S / no engine**

**B19. Duplicate and blank column names are renamed silently, and the deduped column loses its supplied type and levels.** Blank headers become `V1..Vn` and duplicates get `_2` with no record - and the import preview renders the *pre-rename* names, so the preview cannot show the outcome. Worse for `.omv`/`.xlsx`: `types` and `levels` are keyed by the original name while the lookup uses the deduped one, so a duplicate-named jamovi factor arrives with an inferred type and first-seen levels. This is exactly the merged-cell Excel shape. The ragged-row case already discloses honestly, so the pattern exists.
`ps-shell.js:181-185, 209-211, 9299-9312, 9302`. **S / no engine**

**B20. Blank rows are silently dropped at parse time with no count.** `parseDelimitedRows` filters all-blank rows and pops trailing empties before the preview counts anything, so the "N rows x M variables" line reports the post-drop number as if it were the file's. Spacer rows or blank observations change row count and therefore alignment with any external key.
`ps-shell.js:917-921, 9302-9305`. **S / no engine**

**B21. Basics help tells students to click an export button the shell hides.** `.graphbuilder2-host button[title="Export plot"] { display: none !important; }`, while `graphbuilder2.js:52868` unconditionally renders "The **export** button in the toolbar saves the chart as SVG, PDF, PNG or JPG." The hide is a sanctioned brief option; the stranded copy is not. **Better than hiding:** leave the button visible and intercept its click in capture phase to open the shell's export dialog - that makes the sentence true and removes a dead affordance.
`index.html:1021-1023`; `ps-shell.js:1561`. **S / no engine**

### Performance risks

**P1. `dataHiddenPoints` is O(n squared) and runs on every render.** `t.caseIds.indexOf(...)` per plotted value, computed *before* the `pointSourceColumns` gate, so a table with zero exclusions pays full price. Measured on this machine: 174 ms at n=5,000, **2,624 ms at n=20,000** - paid on the initial draw, every 120 ms style echo, every data edit and every tab switch. Fix: build a caseId-to-row Map once per retype, move the call inside the gate, and return early when `t.excluded` is empty. `ps-shell.js:2219-2237, 2270`. **S**

**P2. Every single cell commit re-types the entire table.** `retype()` walks all columns building fresh typed arrays and level lists, runs every formula, re-derives the whole filter mask, and types the table a second time if any formula wrote. Inside it, `tableMissingTokens` allocates a fresh object per cell (459 ms per 400,000 calls) and level lists are built with `indexOf` inside the row loop (965 ms for 20,000 distinct) - and the `id` guard sits *after* the loop, so ID columns build the list and discard it. `ps-shell.js:80-88, 781-788, 829-871, 4957-4964`. **S**

**P3. `persist()` does a full-project stringify plus a blocking localStorage write on every commit** - 88 call sites, including the setOption sink. 20 ms of stringify at 5,000 rows plus a multi-megabyte synchronous write, right after the user releases a slider. `harvestOverlayArrays` adds a *second* full persist on scatter overlay commits and permanently inflates the snapshot with cloned engine arrays. `ps-shell.js:1092-1125, 3243-3245, 3110-3132`. **M**

**P4. Data undo is capped by count, not bytes**: 50 whole-table snapshots = ~250 MB of retained strings at 20,000 rows, reachable in 50 cell edits, on the Chromebook target. The engine derives a byte budget at runtime; the shell does not. The history is also purely in-memory, so a reload silently discards every step. Steps are unnamed too - the menu says a fixed "Undo data change" and the toast a generic "Previous data state restored", though three destructive paths *do* name their step in an actionable toast. `ps-shell.js:4821-4849, 4890, 9808`. **M**

**P5. Large-file import blocks the main thread twice with no size guard**, and re-parses the full text on every delimiter, header or encoding change. The only byte guard anywhere in the app is for layout images. `ps-shell.js:894-921, 9281-9330, 9355-9373, 8065-8066`. **M**

---

## Probe coverage note

Two verifiers independently observed that the 21-probe suite - which is strong evidence for what exists, and was used that way throughout this report - stops exactly where several of these findings live. Nothing exercises the start center as a first-run experience, and **no probe asserts on any import error message** (`grep -ln "ps-loader-msg\|Could not preview" verify/*.mjs` returns nothing), so B19, B20 and Tier 1 #1 and #10 could not have been caught by the harness. Likewise `verify/row-filters-check.mjs` covers rename and delete of a filtered variable but not retype (B5), and `verify/computed-variables-check.mjs` has no cycle case (B10). Anything fixed from this report needs a probe or it will drift back.

---

## Suggested order of attack

If only one afternoon: **#41 (manifest), #25 (navy chrome), #29 (pressed states plus hover transitions), #28 (stop discarding the engine's animations), #9 (one busy affordance).** Those five are all S, all shell-only, and together they change the hand-feel more than any feature would.

If only one week: add **B1 + B2** (silently wrong figures), **#1** (the CSV dead end), **#7 and #8** (undo coherence), **#6** (data export), **#3** (Help menu wiring), **#24** (the token layer, which unlocks the rest of Tier 2), and **#5** (Shapiro or suppress the false verdict).
