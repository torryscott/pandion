# Workspace deep-dive prompts

Four prompts, one per workspace, for handing to a coding agent in its own
session.

**How to assemble one.** Paste `THE STANDARD` first, then one workspace
block, as a single message. The standard is identical in all four so that
tuning it once retunes every dive. Nothing else is needed. Each assembled
prompt is self-contained.

---

# THE STANDARD

*(paste this first, every time)*

## The bar

Someone opens Pandion Plots, spends an hour in the workspace you own, and
thinks "how in the world can this possibly be free, this is the best
software I have ever used."

That reaction is the specification. Every judgment call resolves toward it.

**Nothing you write lands.** Your deliverable is a proposal, approved item by
item, not a set of changes. Read that twice, because the rest of this brief
tells you to write a lot of code.

You are expected to write code, on a throwaway branch, because building a
thing is the fastest way to learn whether it is right and what it costs. A
recommendation carrying a working prototype and a measurement is worth ten
that carry neither. But the branch is where it stays.

This is also not the broad audit. Those have been run and their findings are
recorded. This is one workspace, taken seriously, by someone who used it.
Depth in one surface beats breadth across four.

Work for a long time.

## The product

Pandion Plots standalone is a browser-only statistics and charting
application. No install, no account, no server, no R at runtime. Students
and researchers use it to build publication-quality figures and to read
honest statistics behind them. It is free and intends to stay free, so the
only currency it has is how good it feels to use.

Four workspaces share one project. Data, Charts, Notebook, Layouts. They are
one application, not four tools sharing a window, and the seams between them
matter as much as the interiors.

## Where everything is

- **Repo root.** `/Users/tsdennis/Desktop/plotstudio`
- **Dev page.** `standalone/index.html`. Loads the chart engine from
  `../inst/widget/graphbuilder2.min.js`, so it only runs from inside the
  repo.
- **Shipping form.** `bash standalone/build-dist.sh` emits
  `standalone/dist/pandion-plots.html`, one self-contained file that runs
  from anywhere.
- **Shell code.** `standalone/js/ps-shell.js` is the whole application frame,
  about 22,000 lines, sectioned by banner comments (sample, table, csv,
  project, export, payload, render, sink, libraries, UI, layout, application
  frame, boot). Supporting modules are `ps-data.js` (payload channel
  builders), `ps-stat.js` (R-parity numeric core), `ps-formula.js`,
  `ps-xlsx.js`, `ps-omv.js`, `ps-tour.js` (the Show me how walkthroughs).
- **Markup and styles.** `standalone/index.html`, including the `--ps-*`
  design token layer.
- **Chart engine.** `inst/widget/graphbuilder2.js` at the repo root, shared
  with the jamovi module. Read the rules before you touch it.
- **Probes.** `standalone/verify/*.mjs`, Playwright, run by
  `bash standalone/verify/run.sh`.

## Read before you start

1. `standalone/README.md`. Long, current, and the truth. The `Known gaps
   (documented, deliberate)`, `Harness laws learned here`, and `Rules`
   sections in particular.
2. `planning/STANDALONE-BRIEF.md`. Why the app exists and what was
   deliberately not ported.
3. Root `CLAUDE.md`. The chart engine's conventions, laws, and history.
4. Prior findings, so you do not refile what is already known.
   `planning/STANDALONE-PUNCHLIST.html` (the live checklist, self-marking),
   `planning/STANDALONE-SWEEP-JUL25.md`, and the project memory at
   `/Users/tsdennis/.claude/projects/-Users-tsdennis-Desktop-plotstudio/memory/`
   (start with `standalone-sweep-fixes.md`, `standalone-m4-audit.md`,
   `standalone-pandion.md`).

An open punch-list item is not permission to skip past it. If it sits in your
workspace and it is holding the surface below world-class, it belongs in your
proposal, whatever its current state says.

## How to work

Three passes, in order. Do not skip the first one.

### Pass one. Be a user, not a reader

Drive the running app and do real work in it. Not feature tests. Whole tasks,
start to finish, the way a person with a deadline would. Your workspace block
lists the tasks. Do all of them, and invent more when one exposes something
interesting.

Headless Playwright is your hands. Take screenshots. Look at them. Read what
the screen actually says.

The output of this pass is a friction log. Record every moment you hesitated,
guessed wrong, backtracked, hunted for something that was not there, did the
same thing twice, or read a message that did not tell you what to do next.
Small annoyances count and are usually the most valuable entries, because
they are the ones real users feel constantly and never bother reporting.

For each entry write what you expected, what happened, and what it cost.

### Pass two. Raise the ceiling

Now ask what the best version of this surface in the world does that this one
does not. Your workspace block names the products worth studying and the
specific behavior in each that is worth beating.

The question is never "what feature is missing". It is "what does an expert
user of this kind of surface reach for by reflex, and what happens here when
they do". Reflexes are the tell. A keyboard shortcut that is not bound, a
drag that does not do the obvious thing, a right-click that offers the wrong
menu, a paste that loses structure, a number field that will not take an
expression.

Weigh candidates by how many users touch it multiplied by how often, not by
how impressive it sounds. One correct default beats three settings.

### Pass three. Harden the floor

Software is judged on its worst moment, not its best. Go find the worst
moments.

- **Ugly input.** Real data is messy. Blank rows, duplicate names, mixed
  types in one column, unicode, enormous values, a single row, a single
  column, ten thousand rows, empty everything.
- **Error paths.** Every failure message must carry the escape, not just the
  news. If it says no, it says what to do instead.
- **Interruption.** Reload mid-edit. Close mid-drag. Two tabs at once. Switch
  workspaces with something half-finished.
- **Undo.** Every action that changes state should be undoable, the Edit menu
  label should match what the key will actually undo, and undo should never
  land in the wrong document.
- **Keyboard.** Everything reachable by mouse is reachable by keyboard, and
  focus goes somewhere sensible afterward.
- **Assistive technology.** `standalone/AT-CHECKLIST.md` is the manual
  script. The automated contracts (axe, grid semantics, modal focus loops,
  target size, reflow) are release-blocking and already green. Keep them
  green and extend them where your work adds surface.
- **Small screens.** The app has a documented narrow mode. Do not let your
  work break it.
- **First run.** The empty state is the first thing a new user sees. It should
  teach, not apologize.

## How to work with code

Make a throwaway branch before you touch anything, named for your workspace,
for example `probe/data-deepdive`. Everything you write lives there.

- Never commit to `main`, and never push.
- Never leave the working tree dirty. If you pause, commit to your branch.
- The tree carries other sessions' work. Touch files outside your workspace
  only when a prototype genuinely needs it, and say so when it does.

Inside that branch, prototype freely. The point is to answer three things no
amount of reading answers.

1. **Does it work.** In the running app, on real data, not in principle.
2. **What does it cost.** Files touched, which existing probes go red, whether
   it needs an engine change, roughly how long.
3. **Is there a smaller version** that captures most of the value.

Write probes for your prototypes. A probe you have **demonstrated fails
against the code before the change** is the evidence that the problem is real,
and it is also most of the work of shipping the fix later, so it makes the
proposal cheap to approve. A probe that passes both ways proves nothing.

Run `bash standalone/verify/run.sh` against your branch and record what broke.
A prototype that turns three probes red is not disqualified. It is a
prototype with a known price, which is exactly what a decision needs.

Prototypes should be representative, so keep the house rules while building
them. A prototype that ignores the design language is not evidence about
anything that could actually ship.

## House rules, non-negotiable

- **The chart engine is the highest bar in the proposal.**
  `inst/widget/graphbuilder2.js` ships to the jamovi module, the portable
  file, the hosted app, and the desktop app at once, and jamovi has real
  users. An engine change is not forbidden, it is expensive, so it has to earn
  its place. If you prototype one on your branch, follow the real mechanics or
  the prototype is not evidence. Edit by a single atomic Python `str.replace`
  pass with count asserts (a watcher rewrites the file mid-edit, so the Edit
  tool corrupts it), keep the source ASCII with `\uXXXX` escapes, re-run
  `scripts/minify-widget.sh`, and verify the jamovi battery on both bundles as
  well as the standalone suite. Report what the jamovi side did. If the
  prototype looks like a day of work, ask before spending the day.
- **Prose style.** No em dashes and no colons in prose, anywhere. That
  includes UI copy, error messages, code comments, and your report.
  Restructure with periods, commas, semicolons, or parentheses. Hyphens
  inside compound words are fine. Structural labels are exempt.
- **No `confirm()`.** The app has none by design. The house answer to a
  destructive action is do it and offer it back, with a toast that carries
  the undo.
- **No new visual language.** Use the existing components and the `--ps-*`
  tokens. If you need something that does not exist, build it out of what
  does.
- **Never persist an underscore-prefixed key.** The minifier prop-mangles
  those per build, so a persisted `_foo` is unreadable by any other build.
- **Do not sweep unrelated files into commits.** The branch contains the
  blast radius, but a diff full of noise is a diff nobody can approve.
- **Shell numerics round to 10 significant digits** (`toPrecision(10)`) so
  echoes hash-match the engine's folds.
- **Set `window.__gb2_authoritativeRender = true`** before every
  shell-initiated render.
- Dark mode is declined, not pending. Do not build it.

## Probe laws, learned the hard way

- Playwright resolves from `/tmp/node_modules` via `createRequire`.
- Force the flush before asserting a commit. Zero `__gb2_inspectorInputAt`
  before dispatching `beforeunload`.
- `scrollIntoView` before `page.mouse` clicks. Panels sit below the fold.
- Pre-scroll drag targets too. Playwright's mid-gesture auto-scroll grabs a
  neighbor and fakes a regression.
- Synthetic clicks need real coordinates **and** `detail:1`. The engine drops
  synthesized clicks at (0,0) with `detail===0`. Real-gesture surfaces need
  `page.mouse` plus `document.elementFromPoint` hit testing, not
  `dispatchEvent`.
- Aim with `document.elementFromPoint`, not at the element. The engine floats
  invisible HTML hit strips above the SVG.
- Resolve targets lazily and take the first **visible** match. Every commit
  rebuilds panel DOM and the engine keeps retired chrome in the document.
- `:hover` never matches in headless Chromium, even on a plain div. Nothing
  may be built on it.
- A hidden pane measures 0 for scroll metrics. Open the tab before asserting.
- `file://` localStorage persists across runs. Use a fresh ephemeral context
  per page.
- Harness pages need `<meta charset="utf-8">` first. Chromium sniffs
  `file://` pages.
- Verify shell changes headless. The Claude browser pane long-lives one JS
  context and serves cached `file://` subresources across navigations. The
  single-file dist is immune.

## When to interrupt mid-dive

The whole dive ends in an approval, so you never need permission to
investigate. Interrupt only when carrying on would waste your time or his.

- **Something is actively harmful.** Data loss, a wrong statistic, a silent
  corruption. Do not sit on that until the end of the dive.
- **You want to prototype an engine change** and it looks like a day of work.
  Ask whether it is on the table before you spend the day.
- **A documented deliberate choice looks wrong to you** and the rest of your
  plan depends on which way it goes. First-seen level order is the live
  example.
- **Two designs are both defensible** and the prototype cost differs by a lot.

Everything else goes in the proposal. Frame each interruption as a decision
with your recommendation, not as an open question.

## The deliverable

A proposal document, ranked, strongest first. For each item.

1. **What a user feels.** One sentence in their language, not the software's.
2. **The evidence.** What happened in pass one, or the measurement, or the
   comparison against the product you studied.
3. **The prototype.** The commit on your branch that demonstrates it, or a
   note that you judged it without building it and why that was enough.
4. **The cost.** Files touched, probes affected, whether it needs an engine
   change, roughly how long.
5. **The smallest version.** The cheapest change that captures most of the
   value. This is often the one that gets approved.
6. **What it risks.** What could regress, and what would catch it.

Then four short lists.

- **Free wins.** Anything so small and so obviously right that approving it is
  a formality, gathered in one place so the whole set can be approved at once.
- **Needs a decision.** Each with a recommendation and the cost of each
  branch.
- **Considered and rejected.** What you found, judged and would not do, with
  the reason. This is as valuable as the proposal itself.
- **Verification.** The branch name, which probes you added, that each was
  demonstrated failing first, and what `run.sh` does on your branch.

Plus before and after screenshots for anything visual.

---

# WORKSPACE BLOCK 1. DATA

## What you own

The Data workspace, switcher key `data`. Everything from a file landing in
the app to a column being ready to plot.

Code sits in the `table` and `csv` banner sections of
`standalone/js/ps-shell.js`, plus the grid, selection, menus and command bar
in the `UI` and `application frame` sections. Supporting modules are
`ps-formula.js` (computed variables), `ps-xlsx.js`, and `ps-omv.js` (the
jamovi file reader).

Vocabulary that is load-bearing.

- `VAR_TYPES` is the measure-type system. Four types, `id`, `nominal`,
  `ordinal`, `continuous`, each carrying a `gloss`, an `example` and a `note`
  that the tooltip, the inspector hint and the menu all build from.
  `LEGACY_TYPES` normalizes the older `numeric` and `factor` names so old
  saves still load.
- `retype(t)` is the single choke point. Typing, exclusion, missingness and
  factor-level derivation all run through it, which is why every payload
  builder, chart and missing-data note follows a change with no data-layer
  edits. Its value is that there is only one of it.
- `roleAccepts(def, t, col)` is the single gate for which columns a chart role
  accepts. `colStoresNumbers` implements the ordinal dual role, where an
  ordinal column whose values all parse can go on a value axis as well as
  group.
- `inferType(rawVals, tokens)` decides between continuous and nominal, over a
  `numericAudit` that reports rather than guesses. A column with any
  unparseable value stays nominal so no case is silently dropped, and the
  audit names the values that decided it.
- The mutation chain is `dataMark(label)`, mutate, `retype(t)`,
  `validateRoles()`, `persist()`, `syncAll()`, `render()`. Skipping a link is
  how the historical bugs happened.
- `t.excluded` holds per-cell exclusions against stable `caseIds`, `t.edited`
  marks edited cells, `t.filters` holds dataset-wide AND-combined row filters,
  `t.computed` holds formulas by name, `t.dateColumns` marks ISO date columns.
- `EXAMPLES` holds the built-in datasets. `Dose response study`,
  `Reaction time practice`, `Course feedback survey` and others.

Probes already on this surface include `grid-keys-check`, `data-undo-check`,
`data-menu-check`, `data-commandbar-check`, `computed-variables-check`,
`row-filters-check`, `reshape-check`, `dates-check`, `level-order-check`,
`variable-levels-check`, `hidden-vars-check`, `column-sizing-check`,
`column-gestures-check`, `percol-missing-check`, `exclusion-bridge-check`,
`filter-honesty-check`, `import-errors-check`, `clipboard-check`,
`copyformat-check`, `findpop-check`, `spreadsheet-gaps-check`,
`grid-accessibility-check`, `correctness-check`, and the R parity battery.

## What it already does

This surface is already deep. Read the list before you propose anything, or
you will spend a day rebuilding what is there.

Import from CSV and TSV with delimiter sniffing, BOM strip, CRLF normalize,
ragged rows padded with a warning and blank rows dropped with a count. Excel
through a dependency-free OOXML reader. Jamovi `.omv`. An import preview with
six sample rows, per-column type selects, a summary line and warning chips.
Import refusals with specific copy per file kind, including binary detection
by content. Four measure types, each carrying a definition, examples and a
what-it-is-for note reused identically by the type menu, the header chip
tooltip and the inspector. A variable-advice card that names a problem and
offers the one-click fix. A virtualized grid with a self-measuring row pitch,
sticky header, per-column resize handles that are keyboard-operable, and
auto-fit. Distinct cell rendering for missing, excluded, filtered-out and
computed. Single click selects and editing is the deliberate second act.
Shift-click extend, drag-select with edge auto-scroll, whole row, whole
column, select all. A full keyboard model including type-over, Cmd or Ctrl
with arrows to the edges, and Enter or Tab commit semantics. Structure edits
for insert, duplicate and delete on both rows and columns, with floors. TSV
clipboard, delimiter-sniffing matrix paste that grows the table, and
single-cell paste that fills a selection. Fill with value and fill down.
Stable sorting that carries caseIds and exclusions with the rows. Find and
replace with a match count and a reveal that centres the row inside the
virtual window. Row filters with a live kept-count preview, where failing
rows stay visible and dimmed. Per-value and whole-row exclusions against
stable caseIds, with a review dropdown that breaks down rows against values.
A chart-to-data bridge where hiding a point becomes a real, undoable,
visible cell exclusion. Computed variables with a spreadsheet-flavoured
formula engine, dependency ordering and cycle detection. Long-to-wide
reshape. Column hiding, sizing and gestures. Level order editing with a
chronological sort for ISO date columns. Scoped data undo and redo. A
command bar. Rename that follows through into filters and formulas. CSV
export.

## Starting leads

Orientation, not the assignment. Verify each before acting.

- **A verified selection bug.** `gridSelectionRect` indexes `t.order` while
  the grid renders `gridVisibleColumns`, so a shift-click across a hidden
  column selects the wrong cells.
- **Two command routes with different scope.** The right-click menus resolve
  targets through multi-selection-aware helpers, while `runDataCommand` does
  not, so the same command can mean different things depending on how it was
  reached.
- **Nothing infers `ordinal` or `id`.** A participant number arrives as
  continuous and the app will average it. The `numericAudit` behind inference
  is careful and reports, so the raw material for better inference is already
  there.
- **There is no date measure type.** Dates stay nominal and only their level
  order becomes chronological. The detector accepts ISO only, and the
  narrowness is deliberate. Its comment says a loose parser accepts far too
  much, that "5" is a valid date to `Date`, and that mistyping a category
  column as dates would reorder someone's chart for no reason. Widening it
  needs a plan that keeps the conservatism, not a bigger regex.
- **Nominal level order is first-seen, not sorted.** A documented deliberate
  divergence from R's `factor()` with an open decision recorded for Torry.
  First-seen keeps a meaningful entry order such as Control, Low dose, High
  dose, which alphabetical sorting would scramble. The parity harness cannot
  see it because it passes explicit levels. Do not change it quietly.
- Rows are virtualized, columns are not, so a wide table emits a cell per
  visible column on every windowed row.
- `retype()` rebuilds every column on every mutation, running the numeric
  audit over all rows per column.
- Data undo is not persisted across a reload, stated in the code, because it
  would be a third claimant on the storage quota. Each history step
  stringifies the whole table.
- Column hide and chart-focus are session-only view state, absent from the
  project snapshot.
- The inspector level list caps at 40 entries and the exclusion review list
  caps at 200.
- Row filters are AND-only over six operators on one column each. No OR, no
  grouping, no contains, no is-missing, no between, no formula filter.
- The formula engine has no string or date functions.
- Reshape is long-to-wide only. Wide-to-long is absent on purpose, per the
  README.
- SPSS, Stata, SAS, R and Parquet files are refused rather than read.
- The `.omv` import is dataset-only. Analyses are not imported, filter columns
  are skipped, and computed columns arrive as values rather than formulas.
- CSV export ignores row filters and keeps excluded values. Disclosed in the
  toast, so it is a stated choice, but there is no alternative offered.
- Shapiro-Wilk is client-computed and LOESS confidence bands are approximate.
  Both are documented and disclosed on the chart. Not bugs.

## Do these tasks first

Whole tasks, in the running app, start to finish.

1. A colleague sends a messy CSV. The real header is not row one, one numeric
   column contains `N/A` and `-99`, group names arrive with trailing spaces
   and inconsistent capitalization, and the dates are day first. Get it ready
   to plot. Time yourself and count the actions.
2. Load `Dose response study`. Decide `condition` should be ordinal with
   Control first, and make it so.
3. Paste three hundred rows from a spreadsheet into the grid. Then undo it.
   Then redo it.
4. Find every row with a missing score and decide what to do about them.
5. Build three computed variables. A difference score, a z score, and a recode
   into bands. Use one in a chart.
6. Import a real jamovi `.omv` and satisfy yourself nothing was lost.
7. Spot an implausible value, exclude it, watch the chart change, change your
   mind.
8. Rename a column that is assigned to a chart role, referenced by a computed
   variable, and used in a row filter.
9. Reshape a long table to wide and use the result. Note that wide-to-long
   does not exist and is absent on purpose.
10. Work the grid for five minutes with the keyboard only.
11. Load twenty thousand rows with forty columns and scroll, sort, edit,
    filter and select.
12. Export the cleaned table and reopen it. Check whether what came out
    matches what you were looking at.
13. Import a file with a participant-number column and see what the app
    assumes about it.
14. Hide a column, then shift-click a selection that spans it.
15. Filter to a subset, work on it, then take the filter off and check that
    your edits landed on the rows you meant.

## What excellent looks like here

- The grid never lags. A held arrow key scrolls at frame rate and typing shows
  the character you typed in the frame you typed it.
- Nothing is destroyed without a way back, and the way back is one keystroke
  that undoes exactly the thing you just did.
- The app already knows things you would have had to explain to a lesser tool.
  It notices the header is on row three, sees that `Control` and `control `
  are the same level, and does not offer to average a participant number.
- Cleaning is visible. You see what a change is about to do before you commit
  it and what it did afterward.
- No number ever changes silently. Coercion, exclusion and missingness are
  disclosed where they cost you a row, in the place you are looking.
- Measure type feels like a real statistical idea rather than a setting,
  because getting it right visibly makes the rest of the app smarter. The
  glosses in `VAR_TYPES` already do this well. Push further.
- Paste from Excel simply works, including a block that needs the table to
  grow.
- The route from a raw file to a first chart is short and has no dead ends.

## Who to beat, and at what

- **Excel and Google Sheets, on grid feel.** Held arrow keys, type-over to
  start editing, the fill handle, rectangular paste that expands the table,
  undo covering structural edits, and the live selection statistics in the
  status bar. This is the muscle memory every user arrives with.
- **OpenRefine, on the two things it does better than anything.** Faceting, so
  you can see what a column actually contains rather than guessing, and
  cluster-and-merge for collapsing typo variants of one level. This is exactly
  the mess student and field data arrives in and it is the highest-leverage
  idea available to this workspace.
- **Airtable and Notion, on type changes that preview their consequences.**
  Say how many values will become missing before the change, not after.
- **Google Sheets import and Tableau's data interpreter, on messy files.**
  Header not on row one, junk rows above it, a totals row at the bottom.
- **jamovi and SPSS variable view, on measure type as a first-class idea,**
  value labels, and a real per-variable editor.
- **Stata's data browser, on staying responsive at size.**

## Traps specific to this dive

- Do not add a second path around `retype()`. It bumps the snapshot epoch that
  makes layout and export snapshots invalidate, rebuilds typed views and
  levels, re-evaluates every computed formula in dependency order, and
  rebuilds the filtered view. There is no partial retype. Anything that
  changes cells, types, exclusions, levels, missing tokens, filters or
  formulas routes through it.
- Keep the whole mutation chain. `dataMark(label)`, mutate, `retype(t)`,
  `validateRoles()`, `persist()`, `syncAll()`, `render()`. Skipping a link is
  how the historical bugs happened.
- Do not fork `roleAccepts`.
- This workspace is upstream of everything. A change to type inference or
  level order changes palette assignment and axis order in every chart of
  every saved project. Any proposal here has to come with a prototype and a
  saved project opened against it, showing what it did to work that already
  exists.
- Anything touching numerics runs the R parity battery, which compares to ten
  significant digits.
- Old saves must keep loading. Check the `LEGACY_TYPES` path before renaming
  anything persisted.
- Rename already propagates into filters and formulas. If you add a fourth
  thing that references a column by name, it joins that list.

---

# WORKSPACE BLOCK 2. CHARTS

## What you own, and the one boundary that shapes this dive

The Charts workspace, switcher key `chart`. Everything from picking an
analysis to a finished figure leaving the app.

Read this part carefully, because this workspace is unusual. **The chart
picture and everything on it belong to the engine.** The shell owns exactly
three things. Building the payload, hosting the render, and absorbing
`window.setOption`. Panels, toolbar, palettes, Vision check, chart styles,
Label parts, the Sigma statistics panel, annotations and engine undo are all
engine code that the shell only drives through stable `data-role` and
`aria-label` selectors or documented window seams. There is deliberately no
second copy of any engine surface in the shell, so nothing can drift.

The engine is `inst/widget/graphbuilder2.js`, shared verbatim with the jamovi
module, and it needs Torry's approval per change. That is not a reason to work
around it. It means your leverage sits in three places.

1. **Everything around the canvas.** Analysis choice, the roles UI, tabs and
   groups, sizing, duplication, Help me choose, export, the project navigator.
2. **The seams.** Data into a chart, chart into Notebook, chart into Layout,
   chart into a manuscript. Seams are where cheap software gives itself away
   and where this app can be conspicuously better than paid tools.
3. **The engine changes that are genuinely worth their price.** If the honest
   answer to a piece of friction is an engine change, say so rather than
   inventing a shell workaround that is worse. Diagnose it properly, and
   prototype it if it is cheap enough to prototype. The case names the
   problem, the change, the blast radius across all four shipping channels,
   what the jamovi battery did, and the probe that would prove it. Some of the
   best findings in this workspace will be of exactly this shape.

Vocabulary that is load-bearing.

- `PROJECT.charts` holds chart documents and layout documents together.
  `isLayoutTab(c)` discriminates. A chart is
  `{id, name, module, roles, options, styleStamp, group?, caption?, fitPane?, viewZoom?}`.
- Seven modules. `plotbuilder`, `rmplotbuilder`, `xyplotbuilder`,
  `distplotbuilder`, `freqplotbuilder`, `corrplotbuilder`,
  `likertplotbuilder`. Roles and options are stored per module inside one tab,
  so switching analysis and switching back restores both.
- Role keys are `xvar`, `yvar`, `var`, `groupVar`, `facetVar`, `measures`,
  `betweenVar`, `vars`, `items`. `rolePresentation` maps them to user names.
- **channels** are the data-dependent payload keys a builder fills.
- **chartSpec** is the engine's single cumulative style blob, stored as one
  option and exploded over `data.*` at render entry.
- **the sink** is `window.setOption`. `DROP_KEYS` is exactly
  `clientBundleHash`, `exportRequest`, `exportPath`, `chartSnapshot`.
  `paletteLibrary` and `styleLibrary` are interpreted as one-shot library
  actions. `styleStamp` is handled rather than dropped.
- **fit versus view zoom.** `doc.fitPane !== false` means the app owns the
  logical figure size, which is the `Standard chart size` checkbox.
  `doc.viewZoom` is display only. Keep them distinct.
- **SNAP_EPOCH**, `bumpSnapEpoch`, `validSnap`, `CHART_SNAPS`, `SNAP_STRIP`
  are the snapshot model that feeds Layouts and Notebook.
- Host hooks the engine assigns per render include `__gb2_serializeSvg`,
  `__gb2_accessibleDescription`, `__gb2_chartSize`. Host-declared payload
  opt-ins include `pointMenuVerb`, `textScale`, `toolbarLabels`.

Probes include `chart-groups-check`, `chart-size-check`,
`chart-from-selection-check`, `chart-accessibility-check`,
`export-accessibility-check`, `copy-image-check`, `sigma-freshness-check`,
`help-me-choose-check`, `hmc-list-check`, `wizard-parity-check`,
`overlay-restore-check`, `overlay-reload-check`, `engine-stamp-check`,
`library-bridge-check`, `linked-selection-check`, `tour-check`.

## What it already does

Do not rebuild these. Seven live analyses. Chart documents with create,
switch, rename, duplicate and undoable delete. Chart groups in the rail.
Per-tab per-module memory of roles and styling. Role cards that are their own
drop target, with an eligible-columns-only picker and drag from the variable
list. Guided empty states where the payload builder declares the fix and the
shell turns it into real buttons. A new-chart gallery that reads a Data
selection and states each analysis's reading of it, with live mini previews.
Help me choose. Standard chart size with a defined handover to the engine's
own size drag. View zoom docked into the engine toolbar. Export to SVG, PDF,
PNG and JPG with background choice, DPI, accessible title and description, and
a caption that rides every format. Copy as image and copy chart formatting
between charts. Chart to Data linking, including a point hide that writes a
real dataset exclusion every other chart then sees. Honesty disclosures
injected into `chartNote` so they ride exports. Style and palette libraries
that persist across documents. Per-document engine undo partitioning.

## Starting leads

Orientation, not the assignment. Verify each before acting.

- A parked punch-list item, t2-28, records that the shell discards the
  engine's own animations, twice.
- Scatter marginals and 2-D density contours cannot be rebuilt by the shell,
  because only the engine's add gesture computes their geometry and there is
  no render-entry hook for them. Heatmap bins do have one, which is why bins
  survive a reload and the other two do not.
- The role picker hides columns hidden in Data but deliberately does not drop
  already-assigned hidden columns, so pickers and `validateRoles` follow two
  different rules for the same question.
- The overlay picker popover can clip at the rail scrollport for a slot near
  the bottom.
- `chartCaseText` calls `buildPayload()` a second time purely to count cases,
  on every render tail.
- `payload.textScale = 1.15` and the standard 7.5 by 5 inch size are single
  hand-tuned constants with no derivation behind them.

## Do these tasks first

1. From a fresh import, reach a publication-quality grouped bar chart with
   error bars and a significance bracket, without reading documentation. Note
   every point where you had to guess.
2. Do it again through Help me choose, as someone who does not know what chart
   they want.
3. Build the same chart for three outcome variables and make all three look
   identical to each other.
4. Change your mind about the chart type halfway through a styling session.
5. Restyle to a journal's requirements. A named font, a size in millimeters,
   no gridlines, safe in black and white.
6. Save that look and apply it to another chart, then to a chart built from a
   different dataset with different variable names.
7. Read the statistics behind the chart and get an APA sentence into a
   manuscript.
8. Export at 300 dpi at an exact width, then as SVG, and open the SVG in a
   vector editor to confirm editable text and paths.
9. Reload mid-edit. Confirm you got back exactly what you left, including
   anything that was computed rather than stored.
10. Build a chart with a colorblind-unsafe palette and see whether the app
    tells you and whether the fix is one action.
11. Duplicate a chart and change one thing about the copy.
12. Do task 1 again in a 1280 wide window with a trackpad.

## What excellent looks like here

- The first chart is good before you touch anything. The default is a finished
  answer, not a starting point.
- Assigning variables feels impossible to get wrong, and when something will
  not fit a slot the app explains in the language of the data rather than the
  language of the software.
- Every edit is instant. Where a lesser tool would need a server round trip,
  this one has already computed the answer.
- The chart tells the truth and says so out loud. Truncated axes, hidden
  points, multiple comparisons, excluded rows.
- Nothing you can do makes an ugly chart by accident, and nothing stops you
  making the exact chart a reviewer demanded.
- Coming back tomorrow gives you precisely the chart you left.
- The path from chart to figure to manuscript never repeats work you already
  did.
- A user who does not know statistics learns some without ever being lectured,
  because the app explains at the moment of the choice.

## Who to beat, and at what

- **GraphPad Prism.** The scientists' standard and the real competitor. Study
  how it pairs an analysis with its graph, how the gallery is organized around
  the data you actually have, and how reliably its exports land in journals.
  Beating Prism on the road from data to figure is the whole game.
- **Datawrapper.** Study the guardrails. Its defaults make a dishonest chart
  hard to produce and it explains itself in plain language at the moment of
  the choice rather than in a help page.
- **Tableau and Vega-Lite.** Study role assignment feel. Dropping a field and
  getting an instant sensible answer, and never losing styling when a role
  changes.
- **Figma and Illustrator.** Study direct manipulation of a mark, alignment,
  and undo depth.
- **RAWGraphs and Flourish.** Study chart-type discovery for a user who does
  not know the name of what they want.
- **Excel charts.** Study what to beat. It is what most users are escaping,
  and matching its muscle memory where it is right costs nothing.

## Traps specific to this dive

- The canvas is not yours. Read root `CLAUDE.md` before concluding anything on
  the chart is broken. Most of what looks odd there is documented, deliberate
  and hard won.
- One engine, window-global state. The engine's undo store, help-panel flag
  and anatomy flags are window-scoped, which is why the shell keeps exactly one
  live chart behind tabs. Do not try to render two.
- `DROP_KEYS` is exactly four keys. Adding to it silently loses user work.
- Payload numerics round to ten significant digits so echoes hash-match the
  engine's folds. Break that and the chart flickers on every edit.
- Per-document engine state is already partitioned so undo in chart B cannot
  restore chart A's value. Do not undo that work.
- `window.__gb2_authoritativeRender = true` before every shell-initiated
  render.
- The Show me how tours drive the real UI with real gestures against semantic
  targets. Changing a `data-role`, `data-kind` or `data-field` can break a
  tour. `tour-check` guards it.
- `activeChart()` can return a layout. `activeChartTab()` deliberately falls
  back to the last real chart so late engine commits never land on a layout.
  New code must decide which it wants.

---

# WORKSPACE BLOCK 3. NOTEBOOK

## What you own, and what this workspace actually is

The Notebook workspace, switcher key `pinboard`.

**Two things to absorb before you form any opinion.**

First, **grep for `pinboard`, not `notebook`.** The August 2026 rename was
display only and Torry ratified it that way. Ids, file-format fields,
function names and menu action keys all still say pin and board so old
projects load untouched and probes keep their selectors. Do not clean up the
naming.

Second, **this is not a writing surface.** There is no block model, no rich
text, no formatting controls, no tables and no prose. It is a lab notebook in
the evidence sense. An append-only chronological stack of frozen,
provenance-tracked chart captures, grouped into sections, each annotatable
with a plain-text note in the right rail. The hierarchy is OneNote's, one
level deep. Notebook, then sections, then pages, and nothing nests inside a
section. The freeform composition surface is Layouts, and that boundary is
precisely why this workspace stopped being called Pinboard. Judge it as an
evidence record, not as a document editor.

Vocabulary that is load-bearing.

- **section** is the display name for a `board`. `PROJECT.pinboards`,
  `activePinBoard()`, `pinBoards()`, default names `Section 1` and so on.
- **page** is the display name for a `pin`. `board.pins`, `projectPins()`,
  `allPins()`, `pushPin()`, `deletePin()`, `movePinToIndex()`, `PIN_SEL`.
- **Keep** is the verb. Never Pin, never Add.
- A pin record is
  `{id, src, natW, natH, w, h, at, note, srcChart, srcName, srcSig, srcDesc, momEyebrow, momTitle, momText}`.
  `src` is a full SVG data URI, so a page stays vector through the board, a
  layout placement and the PDF.
- Source verdict states are `same`, `changed`, `stale`, `gone`, `na`, shown by
  `pinSourceStatus`.
- Capture fidelity guards are `stripHoverFromClone`, `stampPinFonts` and
  `repairPinFonts`.
- Export scope objects are `{kind:'page', pinId}`, `{kind:'active'}` and
  `{kind:'all'}`.

Probes include `pinboard-check`, `copy-moment-check`, `keep-fidelity-check`,
`provenance-check`, `rail-icons-check`, `doclifecycle-check`.

## What it already does

Do not rebuild these. Two entry paths, a chart right-click Keep to Notebook
with a section submenu, and a Keep button injected into the engine's Sigma
focus card that also mines the comparison text so it rides as data rather
than only as pixels. Per-page and per-section plain-text notes. An honest
freshness verdict per page that refuses to claim what it has not verified.
Click to select, drag to reorder with a FLIP glide, Alt with arrows to move,
delete with a one-click undo toast that restores at position. Sections as real
document tabs with arrows, Home, End, F2, rename, drag reorder and delete.
Export by scope then format, with a vector PDF that puts one notebook page on
one PDF page. Per-page verbs for send to layout, copy image, export and
delete. Zoom with a fit reading width and pointer-anchored Cmd or Ctrl scroll.
Keyboard and ARIA throughout. A round trip to Layouts and back. Idempotent
migration from the v1 marker layout.

## Starting leads

Orientation, not the assignment. The first two are verified in source. Verify
the rest before acting.

- **Notes are never exported.** `pin.note` and `board.note` are read into the
  rail and written back from it, and nothing else touches them. Neither the
  PDF builder nor the file export includes them. Someone writes the sentence
  that explains their figure, exports, and the sentence is gone. Verified.
- **There is no undo scope for the Notebook.** `undoScope()` branches on data
  and layout and returns `chart` otherwise, so in the Notebook Cmd or Ctrl
  plus Z drives the chart engine's undo. Verified.
- Delete-page undo resolves the active board at undo time rather than capture
  time, so deleting a page, switching section, then undoing may restore into
  the wrong section.
- There is no way to move a page between sections.
- The rail's table of contents stops at sections. No page-level outline, no
  in-notebook page list, no search.
- Pages are frozen and cannot be refreshed from their source. Drift is
  reported honestly and a navigation link is offered, but there is no update.
- No tables anywhere. Both callers of `pushPin` hand it a chart SVG.
- No print path. Cmd or Ctrl plus P opens the export dialog with PDF
  preselected, for the stated reason that printing the DOM gives one clipped
  viewport of chrome.
- Page order is the only structure. No headings, no numbering beyond Page N of
  M on the card, no section title page in an entire-notebook PDF.
- Every page's full SVG rides the project snapshot and every autosave. The
  cost was disclosed and not mitigated.
- `standalone/README.md` never mentions this workspace. `ps-tour.js` has no
  tour for it.

## Do these tasks first

1. Run a real analysis, keep three results, and annotate each so a reader who
   was not there understands them.
2. Export the whole notebook as a PDF and read it as a supervisor would.
   Check whether your notes are in it.
3. Change an underlying chart, come back, and see what the Notebook tells you
   and what you can do about it.
4. Keep twelve pages across three sections and then find one.
5. Keep a page into the wrong section and put it right.
6. Delete a page, switch section, then undo.
7. Press Cmd or Ctrl plus Z in the Notebook and see what it undoes.
8. Keep a comparison from the statistics panel and check the numbers still
   match the chart.
9. Come back a week later, cold, and work out what you were thinking.
10. Save a project with thirty kept pages. Watch the file size and the
    autosave.
11. Do a full session with the keyboard only.
12. Send a page to a layout, then get back to it from there.

## What excellent looks like here

- A kept page never lies about whether it still matches its source, and the
  verdict is legible before you cite it.
- Everything you wrote survives the trip out of the app.
- Nothing you kept can end up somewhere you did not put it.
- Undo means the same thing here as it does everywhere else in the app.
- Thirty pages are as navigable as three.
- The exported PDF looks like a document a person made on purpose.
- Keeping is one gesture from wherever the evidence is, and it never
  interrupts what you were doing.
- The record is trustworthy enough to defend a result from months later,
  which is the entire reason a lab notebook exists.
- The empty state teaches the workflow rather than describing the feature.

## Who to beat, and at what

- **Microsoft OneNote.** The hierarchy here is explicitly its model, so study
  what it gets right about sections and pages at volume, and where it falls
  apart. Its page list and search are the obvious comparison.
- **Electronic lab notebooks such as Benchling and LabArchives.** Study what
  makes a record defensible months later. Timestamps, provenance, immutability
  and the ability to show that a figure came from a specific state of the
  data. This is the closest thing to what this workspace is for.
- **Jupyter and Observable.** Study how they treat output that no longer
  matches its source. Staleness as a first-class state rather than an error is
  the central problem of this surface.
- **Evernote and Notion web clippers.** Study keep-with-source. The clipping
  carries where it came from and when, and that is what makes it trustworthy
  later.
- **Zotero.** Study collected evidence with notes attached to items, and how
  it stays usable once there are hundreds of things in it.
- **Scrivener.** Study how a long argument gets restructured by moving pieces,
  and how an outline and a document stay in step.

## Traps specific to this dive

- The rename is display only and ratified. Do not rename ids, file-format
  fields, function names or action keys.
- Layouts owns freeform arranging. The Notebook owns the frozen chronological
  record. Do not add drag-anywhere placement here.
- Pages are frozen by design. Making them live is a product decision for
  Torry. If you believe it is right, make the case rather than the change.
- The snapshot pipeline has laws, each learned from a field bug. The engine
  svg carries inline `position:relative` and `z-index` that must be
  neutralized on the clone. Every id in a clone must be prefixed and every
  fully delimited reference token rewritten, because `url(#id)` resolves
  document-wide to the first match, and an unprefixed clone paints nothing
  while every geometry probe passes because `getBoundingClientRect` ignores
  `clip-path`. Assert on pixels. The offscreen host must be
  `visibility:hidden` with a large left offset and `!important`, never
  `display:none`, because engine text measurement needs layout.
- `repairPinFonts` and `stampPinFonts` exist for a reason. Understand them
  before changing them.
- A page can outlive the chart that made it. That is a feature.

---

# WORKSPACE BLOCK 4. LAYOUTS

## What you own

The Layouts workspace, switcher key `layout`. Turning finished charts into one
composed figure for a paper, a poster or a slide.

A layout is not a separate document type in storage. It is a `PROJECT.charts`
entry with `type:"layout"`, discriminated by `isLayoutTab`, holding `items`,
`page`, `view` and `nextLabel`. Code sits in the `layout` banner section of
`standalone/js/ps-shell.js` behind the `lay*` function prefix.

Vocabulary that is load-bearing.

- `item.kind` is `chart`, `text` or `image`. `laySizedKind` is chart or image.
- `page.preset` is one of nine names or `custom`. `view` holds `zoom`, `grid`,
  `showGrid`, `snap`, `guides`, `margins`.
- Module state includes `LAYOUT_SEL`, `LAY_DRAG`, `LAY_CLIP`, `LAYOUT_HIST`,
  `LAY_COALESCE`, `LAY_NODE_POOL`, `LAY_PRESETS`.
- Export goes through `layoutExportSource` into `exportBlobFor`.
- Snapshot side is `CHART_SNAPS`, `SNAP_EPOCH`, `validSnap`,
  `captureChartSnapshot`, `svgSelfContainedClone`, `SNAP_STRIP`.
- Units are `PX_PER_IN`, `pxToUnit`, `unitToPx`, `APP_PREFS.units`.
- The test API exposes `selectLayoutItems`, `layoutSelection`,
  `layCopySelected`, `layPasteClipboard`, `layoutHistoryDepth`,
  `resizeLayoutPanel`, `createLayoutFromTemplate`.

Probes are the largest cluster in the suite. `layout-arrange-check`,
`layout-clipboard-check`, `layout-image-check`, `layout-orientation-check`,
`layout-rail-check`, `layout-reuse-check`, `layout-selectall-check`,
`layout-text-check`, `layout-undo-check`, `layout-accessibility-check`, plus
`fitpanes-check`, `units-check`, `outside-canvas-check`, `chart-size-check`
and `drag-feel-check`.

## What it already does

Do not rebuild these. Three item kinds on one page model, where a chart panel
is a live reference redrawn whenever its source changes. Nine page presets
plus custom, with a margin inset. Pointer drag with a 3px threshold, grid
snapping of the selection bounds, and smart guides against page edges,
margins, page centre and every other item. Proportional resize with Shift for
freeform. Six alignment commands against the selection's union bounds,
progressively disclosed once two items are selected. Four z-order commands.
An ordered selection array where the last id is primary. A full keyboard
composite where the viewport is one tab stop with a parallel hidden option
list as the assistive-technology model. Text items with an inline editor, a
floating mini bar, drag-to-rotate with 15 degree snapping, and a rail panel.
Per-layout undo and redo, forty deep, with coalescing, deliberately excluding
view state. Clipboard for whole items across layouts, plus OS image paste.
Export to SVG, PNG, JPG and real vector PDF at exact page geometry. Export
honesty that blocks and explains rather than silently omitting a panel it
cannot draw. A monotonic snapshot epoch bumped only at the two choke points
that change what a chart draws. A node pool that moves an unchanged panel's
DOM rather than re-parsing multi-megabyte SVG. Eight templates with an
orientation switch and per-slot assignment. Live versus Snapshot disclosure
stated in four places for the same item. One app-wide units preference.

## Starting leads

Orientation, not the assignment. The first two are verified in source. Verify
the rest before acting.

- **Orientation flip ignores image items.** `layApplyOrientation` scales `x`
  and `y` for every item but rescales `w` and `h` only when
  `kind === "chart"`, even though image is a sized kind everywhere else.
  Verified.
- **A four-line listener block is registered twice.** The
  `["x","y","w","h"].forEach(... addEventListener("change", layApplyInspector))`
  block appears twice in immediate succession inside the same function.
  Verified.
- Send to layout is not undoable. It pushes an item and can grow the page
  height, flipping the preset to custom, with no history snapshot.
- Proportional resize floors images at the chart minimum rather than the image
  minimum.
- The OS-paste text path writes a `size` field that no reader uses, since
  every reader reads `fontSize`.
- Default size for an image with no width or height disagrees between two
  functions, 480 by 320 in one and 240 by 180 in the other.
- The keyboard layer-move path announces a move that may not happen, because
  the end-of-stack guard lives in the menu gating rather than in the mover.
- Rotation range is stated three ways. The text rotate clamps to plus or minus
  180 while the drag handle and the rail slider clamp to plus or minus 90.
- There is no marquee selection and no grouping. Multi-select is click by
  click or select all.
- Layout undo history is session only. Items and page persist, the ability to
  step back does not.
- Align is selection-relative only. There is no align to page or to margin,
  and **distribute was removed by ruling**, so do not simply add it back.
- Text geometry depends on the live DOM, with a character-count approximation
  as fallback.
- `var nested` is declared twice in one function scope in
  `layoutExportSource`.

## Do these tasks first

1. Build a two by two multi-panel figure for a paper. Panels the same size,
   axes aligned across panels, labels A through D. Time yourself and count the
   actions.
2. Set the page to a journal's single-column width in millimeters and export
   at 300 dpi.
3. Change one of the charts after it is placed and get the figure to agree.
4. Rearrange a five-panel figure into a different reading order.
5. Add a caption and a note, and check they read correctly at print size
   rather than at screen size.
6. Make one panel wider and keep everything else aligned.
7. Reuse a finished layout for a second dataset.
8. Do the alignment with the keyboard only.
9. Select every text item at once and restyle them together.
10. Export SVG and open it in a vector editor. Confirm vector, editable, fonts
    intact.
11. Undo ten steps and redo them with two layouts open. Then reload and try to
    undo.
12. Build the figure in a 1280 wide window.

## What excellent looks like here

- Alignment is effortless and exact. The app helps you land it, tells you it
  landed, and the guide disappears when it stops helping.
- Panels of equal size are one action, not eight nudges.
- Axes align across panels. This is the single thing scientists hand-fight
  most when assembling a figure, and the app knows what is inside each panel
  while a page-layout tool does not.
- The page is a real page. Real units, real dimensions, and what is on screen
  is what prints.
- Nothing about the export surprises you. Fonts, resolution, vector fidelity,
  behavior at the page edge.
- A change to a chart reaches the figure without rebuilding it.
- Undo is per figure, never lands in the wrong one, and covers everything that
  changed the figure.
- The keyboard can do the entire job, including exact positioning by typing a
  number.
- Reusing a layout for new data is faster than building it again.

## Who to beat, and at what

- **Figma.** The benchmark for making precision feel casual. Study snapping,
  multi-select resize, constraint-preserving scaling, and how fast an exact
  number can be typed into a position field.
- **Adobe Illustrator and Affinity Designer.** Study artboards, smart guides,
  and the distinction between aligning to the page and aligning to the
  selection.
- **Keynote and PowerPoint.** Study alignment guides that a non-expert
  discovers by accident and immediately understands. This is the discoverable
  half of the same idea.
- **InDesign.** Study real page setup, units, and print-accurate output.
- **GraphPad Prism Layouts.** Study the specific job this surface exists to
  do, which is turning several finished graphs into one journal figure.
- **patchwork in R and matplotlib's constrained layout.** Study what automatic
  panel alignment achieves when the tool understands that the things being
  aligned are charts with axes rather than rectangles with pixels. This is the
  highest-leverage idea available to this workspace.

## Traps specific to this dive

- **Pixels are the model, everywhere.** Units, zoom and the rail are display
  only. Never store a converted number.
- **Zoom is a CSS transform on the canvas only.** Item styles are in unscaled
  page pixels and every pointer delta is divided by the zoom. Anything
  measuring with `getBoundingClientRect` inside the canvas must divide by
  `layZoom()`.
- **The canvas is `aria-hidden` on purpose.** A second hidden list of plain
  `role="option"` divs is the assistive-technology model, because a captured
  chart SVG would otherwise become a pile of nested interactive descendants
  inside an ARIA option. If you add on-canvas chrome, mirror it into the
  option list. Do not un-hide the canvas.
- View state is deliberately outside the undo snapshot. Folding a display
  preference in makes undoing a delete also switch the grid back on. Do not
  fold it in.
- Never mix live `getBoundingClientRect` with animated transforms in slot
  math. Cache geometry once at grab. This caused a real flicker bug in the tab
  reorder work and the same shape will recur here.
- The snapshot laws from the Notebook apply identically. Id prefixing on
  clones, the inline `position` and `z-index` on the engine svg, and the
  offscreen host being `visibility:hidden` rather than `display:none`. Assert
  on pixels, not on geometry.
- `activeChart()` can return a layout while `activeChartTab()` falls back to
  the last real chart. New code must decide which it wants.
- Torry's framing for this surface is that it is additive and does not change
  existing things. Improving it should not change how the other workspaces
  behave.
