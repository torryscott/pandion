# Data workspace deep dive

Branch `probe/data-deepdive`, eight commits, nine probes. Nothing here has
landed anywhere else. Every probe was demonstrated failing against pristine
HEAD before the change that makes it pass.

The workspace is in much better shape than this document's length suggests.
Row identity survives sorting, filtering, exclusion, paste and undo without a
single corruption across four independent sessions. Undo and redo of a 300 row
paste run in 1 ms and 24 ms with exact restoration. The `.omv` reader is
byte-exact on 240 rows by 18 fields including three reverse-scored level
orders. Rename propagates into chart roles, axis titles, five modules' stored
role sets, a computed formula and a filter condition, and one undo puts all of
it back. The row-filter disclosure is the clearest copy in the product.

What follows is what a user hits anyway.

---

## How this was found

Five simultaneous sessions drove the running app through the fifteen whole
tasks in the brief, with real Playwright gestures, and returned friction logs.
I drove the messy-import task myself and ran an ugly-input pass. Everything
below is either something I reproduced myself or something two independent
sessions found separately.

Two sessions independently landed on the same line of code
(`ps-shell.js:13309`) from two different tasks. That is the strongest signal in
the whole exercise and it is item 3.

---

# THE PROPOSAL, strongest first

## 1. A hidden column is inside every range operation and outside every pixel of the highlight

**What a user feels.** They hide a column to get it out of the way, select some
cells, press Delete, and destroy data in a column they cannot see.

**The evidence.** On a six column table where every cell names itself, hide
`C`, click `B2`, shift-click `E2`. Three cells light up. The app says
`1 row x 4 columns - 4 cells selected`. Then

| what they do | what they see | what happens to the data |
|---|---|---|
| Cmd+C | 3 cells lit | clipboard holds `B2 C2 D2 E2` |
| Fill with focused value | 3 cells change | C2 overwritten |
| Clear, or Delete | 3 cells blank | C2 destroyed |
| paste four values | 3 land, one vanishes | values sit one column left of where they appear |
| Exclude | menu says 4 | C2 excluded from every statistic, no mark anywhere |

`gridSelectionRect` indexed `t.order`, the full column list, while the grid
renders `gridVisibleColumns`. Undo does reverse all of it, but undo only helps
someone who knows something went wrong, and by construction the damage is
invisible.

**The prototype.** `d11e20b`. The rectangle is now over the visible columns and
carries their names, so nothing downstream walks `t.order` between `c0` and
`c1` again. This is the rule the codebase already chose for discontiguous
column selections, under-select rather than span a gap.

**Cost.** One file, eight call sites, about 40 lines. No engine change. Probe
`hidden-selection-check.mjs`, seven cases. Eight existing selection probes
re-run green, including `column-gestures-check`, which encodes the neighbouring
rule.

**Smallest version.** There isn't one worth having. A cosmetic fix that only
corrected the readout would leave the data destruction in place.

**Risk.** Any consumer I did not find still walking `t.order` by index. I
grepped the family to zero and case 7 pins that with nothing hidden every path
is byte-identical.

---

## 2. A numeric missing-value code is averaged, and the panel shows the evidence without joining it up

**What a user feels.** Their mean is 25 percent wrong and every screen says the
data is fine.

**The evidence.** 24 rows of minutes, two coded `-99` for not recorded. The app
prints **Mean 36.3**. The truth is 48.5. `typeAudit` reports `bad: 0,
numeric: true`, the column types Continuous, and the advice card returns null.

The three facts were already on one panel and nothing joined them.
`Min -99` sits two rows above `Mean 36.3`, and the field directly below both
carries the placeholder *"Set a list here when a code means missing in THIS
variable only, such as -99 for an age or 9 for a rating."*

**The prototype.** `b3a7709` and `0f1c4d2`. A fourth branch on the existing
advice card, using the existing one-click action pattern and the existing
`setColumnMissingTokens` writer. It names the code, the row count and the cost
("moves the mean of minutes from 48.5 to 36.3").

The detector reports and never acts, which is what lets it be useful without
being reckless. A value must match a conventional code shape **and** either be
negative in a measurement that is otherwise never negative, or sit further
from the data than the data is wide, twice over. Every column of all three
shipped example datasets stays silent, and that is in the probe.

**Cost.** One file, about 90 lines. Probe `missing-codes-check.mjs`, five cases
including the false-positive controls.

**Smallest version.** Drop clause B and fire only on a negative code in
otherwise non-negative data. That is the commonest real case and the safest
claim, and it is about 20 lines.

**Risk.** A false positive on real data. Mitigated because the card asks rather
than acts, and because the controls run over every shipped example.

---

## 3. Opening a menu destroys the selection the menu acts on

**What a user feels.** They select cells, open the Data menu, and the command
they want is greyed out with a tooltip telling them to select some cells.

**The evidence.** Found independently by two sessions, from two different
tasks. A document `pointerdown` handler clears the grid selection for any press
outside `#ps-datagrid` and four grid popovers. The application menu bar is not
on that list, so the press that OPENS the menu throws the selection away.

- **Edit then Paste** answers `Select the cell to paste into first.`
- **Data then Exclude or include selected values** is permanently greyed,
  tooltip `Select cells in the Data workspace first.`
- **Data then New chart from selection** the same.
- **Data then Fill down** renders *enabled*, because its enable test reads the
  variable inspector which survives, then refuses with `Select a cell to fill
  from.`

Four commands, each blaming the user for not doing the thing they had just
done. All four have always worked from the keyboard, because F10 fires no
pointerdown, which is exactly why this survived.

**The prototype.** `9c9bdff`. Four ids added to the allowlist. A press on a
menu that acts on the selection is not clicking away.

**Cost.** Four lines. Probe `menu-selection-check.mjs`, six cases including the
control that pressing genuinely outside still clears.

**Risk.** Very low. The control is in the probe.

---

## 4. The variable panel goes stale the moment you exclude something

**What a user feels.** They exclude an outlier, the mean beside it does not
move, so they exclude another one.

**The evidence.** Found independently by two sessions. After Cmd+E the panel
still reads `Excluded 0`, `Valid 24` and the old mean, while the chip two
inches above reads `Excluded 1` and its own popover says the values leave every
chart and statistic. It heals only if you select a **different** column and
come back. One session measured `Mean 91.9, Max 520` on screen where the truth
was `73.3` and `91`.

**The prototype.** `3e9f323`. `syncVariableInspector()` added to the exclusion
tail and the filter tail, which is the one thing they were not calling.

**Cost.** Two lines. Probe `inspector-freshness-check.mjs`.

**Risk.** None found.

---

## 5. A file whose header is not on row one cannot be fixed inside the app

**What a user feels.** A real export with a title line above the header
imports with its title as the first column name, and there is no way back
except leaving the app and editing the file.

**The evidence.** `parseTableText` takes row one or nothing. "First row" offers
Variable names and Data values, and nothing else. A file with two preamble
lines imports as `Wellbeing pilot study - export`, `V2`, `V3`, `V4`, `V5`, with
`participant, group, visit_date, score, minutes` sitting in the table as a data
row. There is no promote-row-to-header command anywhere.

The app was already computing the evidence and throwing it away. The import
preview warns *"2 variables hold text in otherwise numeric columns, e.g. score
in row 2"*, and the text it names IS the misplaced header.

**The prototype.** `a6ed6b9`. The preview offers the row it found, quoting it
back, and the user decides. Adopting a guessed header would discard a row of
real data on a hunch, so it is offered and never taken. It fires only on the
shape it is built for, short preamble rows above one full row of words, and
never when row one already looks like a header.

**Cost.** Two files, about 70 lines, one additive defaulted parameter on
`parseTableText`. Probe `header-row-check.mjs`, six cases including two
controls.

**Smallest version.** As built. The detector is the cheap part.

---

## 6. The 40 column grid is not usable, and the rows are not the reason

**What a user feels.** The arrow key takes a quarter of a second per row and
dragging a selection is a twenty second operation.

**The evidence.** Measured with real input events, medians.

| operation | 20k x 40 | 2k x 40 | 20k x 5 |
|---|---|---|---|
| ArrowDown, per press | 221 ms | 214 ms | 20 ms |
| drag-select, per pointer move | 1145 ms | | 40 ms |
| DOM mutations for ONE ArrowDown | 78,704 | 78,704 | 10,104 |
| Enter to commit a cell edit | 718 ms | 291 ms | 83 ms |

2k x 40 and 20k x 40 are identical on every interactive operation, including
the mutation count to the digit. **The column axis is the entire cost.**

`gridApplySelection` makes two full passes over every rendered `td` on every
selection change. Pass one unconditionally removes six classes plus an
attribute from every cell including ones nothing touched. Pass two calls
`t.order.indexOf(name)` once per cell. `GRID_WINDOW_ROWS` is 140 while about 34
rows fit on screen, so roughly three quarters of that work is spent on rows
nobody can see.

**Not prototyped.** Three obvious moves, in order of ratio. Track the
previously-selected cells and only clear those. Replace the per-cell
`indexOf` with a prebuilt index map. Cut the window toward what is visible.
The first two are contained inside one function.

**Cost.** Estimate half a day with a before-and-after measurement harness,
which the numbers above already sketch.

**Risk.** `gridApplySelection` is the paint path for every selection state
including linked-selection and discontiguous columns. It needs its own probe
before touching, and there are five existing selection probes to lean on.

---

## 7. An identifier column is averaged, and Check my chart calls it clean

**What a user feels.** They plot mean participant number by group and the app
tells them twice that the chart is fine.

**The evidence.** `participant_id` holding 1..40 types Continuous. The panel
prints `Distinct 40` next to `Rows 40` and then `Mean 20.5`. The value axis
picker lists it first. Check my chart returns *"This chart was run against 10
checks. All passed"*, and one of the ten green pills is named **"Categories
hold real groups"**.

The same column in three costumes gets three outcomes.

| shape | type | nudge |
|---|---|---|
| `1..40` | Continuous | none |
| `001..040` | Nominal | yes, amber card with a working **Set type to ID** button |
| `P001..P040` | Nominal | none |

The feature is built and the copy is already written. The trigger is "this
string has a leading zero", which is a formatting accident rather than the
identifier signature. The signature is `Distinct == Rows`, which the panel
already computes and displays two lines above the empty callout slot, and
which the `catsingle` lint already uses correctly on the category axis.

**Not prototyped**, but it is the same shape as item 2. A fifth branch on the
same advice card, reusing the existing `advice-id` action. I stopped because
the threshold is a judgement call that belongs to you (see decisions, below).

**Cost.** Roughly item 2 again, about 40 lines, plus a probe.

---

## 8. Twenty thousand rows are lost with a reassuring message on top

**What a user feels.** They import a big file, work, come back, and the app
offers to restore a stale demo dataset labelled "saved just now".

**The evidence.** Immediately after a 20k x 40 import the app shows
`Autosave unavailable` and a red toast reading exactly `Browser storage is
full; recent changes remain in memory`. After a reload the welcome screen
offers, as its highlighted default, `Continue autosaved project` subtitled
`Dose response study - 24 rows - saved just now`. The 20,000 row project is
gone.

At 5k, 8k and 12k rows the app instead says *"This project is now too large for
the local recent-projects list. It is still autosaved, but save it to a .pand
file so you have a copy that does not depend on this browser."* That names the
fix, and all three genuinely recover. The message that would have saved the
user appears only in the cases where they did not need it.

**Not prototyped.** Two separable pieces. The 20k message should name the same
fix the 12k message names. The stale "saved just now" subtitle is a separate
correctness bug in the welcome card.

---

## 9. Typing a value the column cannot hold voids it, and tells a screen reader it saved

**What a user feels.** They type `sixty one` into a numeric cell, press Enter,
and get an em dash with no explanation.

**The evidence.** No toast, no highlight. The only visible trace is the Missing
count in a different pane. The visually hidden live region announces `Saved
score, row 1 as sixty one.` A screen reader user is affirmatively told the
value was stored in exactly the circumstance where it was not.

Note the asymmetry. Deliberately clearing a cell gets a toast with an Undo
button. Accidentally voiding one gets silence.

**Not prototyped.** The announcement is a one-line correctness fix at the
commit site. The visible half is the same shape as item 12 and could share its
wording.

---

## 10. A paste that voids a whole column reports a successful paste

**What a user feels.** They paste a five column block into a four column grid
and the toast congratulates them while 300 values become em dashes.

**The evidence.** The header row lands as data, the fifth column is created and
named literally `Variable`, and 300 text values land in `score`, which is
Continuous, so all of them read as missing. `score` ends with 301 missing of
301. The toast reads `Pasted 301 x 5 cells - condition gained 298 new values -
press Cmd/Ctrl+Z if this paste was misaligned`. The heuristic behind it counts
distinct values GAINED and never values VOIDED.

**Not prototyped.** The existing level-explosion heuristic is the right place.
It needs the mirror-image test, values lost, alongside the one it has.

---

## 11. The .omv reader silently drops three things, one of which changes N

**What a user feels.** They open a colleague's jamovi file and chart rows the
colleague had filtered out.

**The evidence.** Data fidelity is exact, verified byte for byte. What is
dropped without a word is

- **Filter columns.** A jamovi filter HIDES rows. The importing user gets more
  rows than the sender was working with, and the string `Filter 1` appears
  nowhere in the app.
- **Per-column missing rules.** A jamovi `missingValues` rule of `== 1151`
  arrives nowhere, and 1151 is counted in the mean. The app has exactly the
  right field for this and leaves it empty. This is item 2 arriving through a
  different door.
- **Computed column formulas.** They arrive frozen as ordinary data with no
  badge, so editing a source silently staleifies them.

There is also no import report of any kind. The only new information after an
`.omv` import is the file strip.

**Not prototyped.** Per-column missing rules are the cheapest and the most
damaging, and the writer already exists. Filter columns need a decision (see
below).

---

## 12. A type change that empties a column says nothing

**What a user feels.** They flip a currency column to Continuous and every
value disappears.

**The evidence.** `$12.50`, `1,234` and `45%` parse as no number, so the column
goes to 0 valid of 8 with no message. The raw text survives and one undo
restores the type, so nothing is destroyed, but the only report was `Valid 0`
in a panel nobody is reading at that moment, with the type select directly
above it.

**The prototype.** `cda3e24`. No confirm(), per the house rule. Do it, say what
it cost, carry the way back. Losing a handful stays quiet because the advice
card already names those values.

**Cost.** About 20 lines. Probe `typechange-cost-check.mjs`, four cases.

---

## 13. Category spellings are three bars and three palette colours

**What a user feels.** `Control`, `control` and `CONTROL` draw three bars.

**The evidence.** Whitespace is already folded into levels, so ` Control` and
`Control` arrive merged and the machinery exists. It stops at case. With no
cluster-and-merge the only route is find-and-replace once per variant, which
means knowing the variants in advance. On a three group study spelled
inconsistently that is six replaces before any work starts.

**The prototype.** `a6ed6b9`. Named on the advice card with a one-click merge
that keeps the commonest spelling. The key is deliberately shallow, case and
spacing and the punctuation people vary by, and stops short of token sorting,
which is the first trick that merges labels which are genuinely different.

It also prunes the declared level order, which find-and-replace does not, so a
retired spelling cannot come back as an empty category.

**Cost.** About 100 lines. Probe `level-variants-check.mjs`, six cases, all
19 columns of the three shipped examples silent.

---

## 14. You cannot ask which rows are incomplete

**What a user feels.** They want the rows with a missing score and there is no
way to ask.

**The evidence.** Find matches no blanks (the em dash, `-`, `NA` and `blank`
all return no matches). The filter operator list has no *is missing*, and the
level dropdown offers no `(missing)` entry. The `Missing 3` number in the panel
is not a link. The only thing that works is sorting ascending, which is one
column at a time and permanently reorders the dataset to answer a read-only
question.

**Not prototyped.** The cheapest real answer is an `is missing` / `is not
missing` operator in the filter builder, which reuses the whole existing
mechanism and needs no new surface.

---

## 15. The formula engine has three gaps that block whole workflows

**What a user feels.** Reflexes fail and the errors are parser output.

**The evidence.** There is no way to test for a missing value. Every operator
null-propagates, so `if this is missing, use 0` is not expressible.
There is not a single string function, and equality is exact-string, so a user
with dirty labels cannot recode them. `MAX(pre, post)` returns `MAX() takes one
column name`, because the aggregate names collide with the row-wise ones.

The error messages never suggest the fix. `unexpected "="` never says formulas
here are just the expression. `unknown function LOG()` never says try `LOG10`
or `LN`, both of which are named one row above. `unknown variable "Score"`
never says did you mean `score`.

Four things that produce a silent all-missing column with no error at all,
which can then be saved and charted, are `condition + "_" + site`, `score / 0`,
`score / (hours - hours)` and `SQRT(-score)`.

**Not prototyped.** Priced in three tiers. `ISMISSING` and `COALESCE` need a
"does not null-propagate" flag on the function table, about 30 lines. `TRIM`,
`UPPER`, `LOWER`, `LEN`, `CONTAINS`, `CONCAT` need the null-propagating
prologue moved behind a per-function flag, about 60 lines. Row-wise
`MAX(a, b)` needs the one-plain-column rule relaxed and disambiguated, which is
a parser change.

There are no unit tests for the engine today. Anything added here should carry
an extract-and-eval unit runner, the `catstride-unit.mjs` pattern.

---

# FREE WINS

Small, obviously right, approvable as a set.

1. **Category counts in the level list.** Committed, `e9b4fbf`. The list named
   the categories and never their sizes, so whether `CONTROL` is a typo or a
   third of the data needed a filter or a chart to answer. Counted off the
   typed column so it agrees with every other number in the panel, announced in
   the row label without displacing the position it already carried.
2. **Sort A-Z is built, wired, and can never appear.** `.ps-level-reset` is
   `display: none` and only its sibling `ps-variable-level-reset` ever gets its
   display restored. The button carries the tooltip "Sort levels the way R
   would" and a working handler. One CSS or one line of JS.
3. **The computed-variable dialog promises quick transforms it does not
   show.** The empty preview says "or pick a quick transform" while the
   transform row only renders when a numeric column was selected first. Either
   render them or change the sentence.
4. **That dialog has both a Close and a Cancel**, same effect.
5. **`Missing 1` and `Excluded 1` both count the same cell**, so a user reading
   Missing goes looking for a blank.
6. **"Used in 4 roles"** counts modules the user has never opened, because the
   count walks every module's stored role set.
7. **Selecting a whole row** moves the inspector to the last column.
8. **Two number formats on screen at once**, `20000 rows x 40 columns` in the
   selection readout and `20,000 rows - 40 columns` in the status bar 40 pixels
   below.
9. **The status bar row count is one behind after Add row** until a workspace
   switch.
10. **`Exclude this value from dataset`** is missing an article.
11. **Escape in Find takes two presses** and the shortcut sheet says one.
12. **The F1 sheet has four holes**, add row, insert or delete column, measure
    type, and the variable inspector, plus `Cmd/Ctrl+E` which works and is not
    listed.
13. **`Restore all exclusions`** is the one reversal with no toast.
14. **Export data gives no feedback when the picker is cancelled**, which makes
    a cancelled save and a broken button pixel-identical.

---

# NEEDS A DECISION

**A. Three statistics surfaces, three bases, no labels.** Under a live filter
the variable panel and the status bar both describe the full table while the
chart describes the filtered rows, and the filter panel's own copy says failing
rows "leave every chart and statistic". *Recommendation.* Keep the panel on the
full table, because the computed-variable filter seam is already pinned that
way deliberately, and label it. Changing the basis is the more expensive branch
and would contradict a settled decision.

**B. The identifier threshold.** `Distinct == Rows` is the signature, but a
genuinely continuous measurement with no ties also satisfies it at small n.
*Recommendation.* Fire only when the column is all-integer and distinct equals
rows and n is at least 12, and phrase it as a question with the existing
**Set type to ID** button. Cheap either way, the threshold is the only
judgement.

**C. jamovi Filter columns.** *Recommendation.* Translate them into Pandion row
filters where the formula is expressible and say so, and refuse loudly with the
formula quoted where it is not. The current silence is the one branch that
cannot be right, because it changes N without saying so.

**D. Hidden columns are lost by the project save.** Deliberate, per the source
comment, and undisclosed either way. *Recommendation.* On an eighteen column
file the arrangement is the whole reason to hide, so persist it. If the
decision stands, the reopen should say so.

**E. Nominal level order stays first-seen.** The open decision recorded in the
README. *Recommendation.* Keep it, and make free win 2 (Sort A-Z) visible,
which turns the divergence into a one-click choice and is most of what the
decision is about.

**F. Importing data replaces the project with a five second undo window.** The
title changes, the toast expires, the toolbar Undo is disabled throughout, and
the word "replace" never appears. *Recommendation.* Treat it as the same
project-replacing path the other four already use, which capture the outgoing
project and offer it back.

---

# CONSIDERED AND REJECTED

- **Making the level-order merge use OpenRefine's full fingerprint key**
  (token sorting, punctuation stripping, n-gram). Token sorting merges `dose,
  high` with `high dose`, and it is also the first rule that merges two labels
  that are genuinely different. The shallow key covers what actually goes
  wrong.
- **Auto-applying the header guess.** It would discard a row of real data on a
  heuristic. Offered and never taken is the house pattern and the right one.
- **Widening the date detector with a bigger regex.** `03/06/2026` is genuinely
  ambiguous. A column-level plan does exist (a first component above 12 proves
  day-first, a second component above 12 proves month-first, both present
  proves it is not a date column, neither present means ask) but it is a
  separate piece of work and the current conservatism is correct until then.
- **Filtering the level list by clicking a category, the OpenRefine facet.**
  Attractive, but it needs a decision about whether that writes a row filter or
  a view state, and the counts alone deliver most of the value.
- **A confirm() on destructive type changes.** The app has none by design.
- **Fixing the ghost level that find-and-replace leaves behind** when a level
  order was set by hand. I reproduced it, then checked whether it reaches a
  chart. It does not, the payload builder drops empty levels, so it is a dead
  row in the inspector list and not wrong data. Filed as a papercut, not
  ranked.
- **Dark mode.** Declined, not pending.

---

# VERIFICATION

**Branch.** `probe/data-deepdive`, eight commits on top of `958c243`.

**Probes added**, all in `standalone/verify/`, all demonstrated failing against
a pristine HEAD worktree first, with the failing assertion quoted.

| probe | cases | failing assertion on HEAD |
|---|---|---|
| `hidden-selection-check.mjs` | 7 | `and the readout says three, got "1 row x 4 columns - 4 cells selected"` |
| `missing-codes-check.mjs` | 5 | `the advice names the code itself, got ""` |
| `menu-selection-check.mjs` | 6 | `the selection survives opening Edit, got null` |
| `inspector-freshness-check.mjs` | 3 | `the Excluded count follows without reselecting, got Excluded 0` |
| `header-row-check.mjs` | 6 | `the notice quotes the row it found, got ""` |
| `level-variants-check.mjs` | 6 | `the advice says nine spellings are really three, got ""` |
| `typechange-cost-check.mjs` | 4 | `and the app says so, naming the column, got ""` |

Each carries at least one control that fails if the change is disarmed. The
false-positive controls run over every column of all three shipped example
datasets.

**Suite.** `bash standalone/verify/run.sh` **cannot complete on this branch,
and could not before I touched it.** `hardening-dom-check` fails on pristine
HEAD for two reasons, a missing `typeof MutationObserver` guard in
`watchChartToolbar` and a chart-zoom assertion, and `set -e` kills the run after
three probes. Both are already fixed in another session's working tree, so this
resolves when they commit. My numbers are measured with that one probe skipped
and its guard applied locally, never committed.

With that exclusion every probe in `run.sh` passes on this branch.

---

# ONE THING OUTSIDE THIS WORKSPACE

`planning/STANDALONE-PUNCHLIST.html` renders **zero items** and has done since
before this branch. The inline `SECTIONS` literal throws `SyntaxError:
Unexpected identifier 'move'`, because item `t4-105`'s done-note carries bare
double quotes inside a double-quoted JS string. Confirmed committed in HEAD,
not a working-tree edit. The fix is escaping those quotes. Untouched, because
it is not mine.
