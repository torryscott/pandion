# Layouts deep dive

Branch `probe/layout-deepdive`, commits `cba8f8f` and `fb9e327`.
Nothing here is shipped. Approve item by item.

I built a real 2 by 2 publication figure, exported it, changed a chart under
it, rearranged it, tried to reuse it, and drove the whole thing from the
keyboard. What follows is what that cost, and what it should cost.

The measurements come from the four-panel template holding four Compare
Groups charts of the same categories on four different scales (score, cost,
hours, rate), which is the ordinary paper case.

---

## 1. A figure whose panels are the same size still looks crooked

**What a user feels.** They line the panels up perfectly, and the printed
figure still looks a little off, so they open Illustrator and nudge until it
stops bothering them.

**The evidence.** A panel's box carries its tick labels, and an axis reading
`100000` is wider than one reading `0.10`. So the four-panel template, which
gives every panel exactly 463 by 267 pixels, draws the left column's y axes
**6 px apart** and the right column's **11 px apart**. On a 7-inch printed
figure that is about 3 mm, which is well past the point a careful reader
notices. Aligning the panel boxes cannot fix it, because the boxes are
already aligned; the thing that is crooked is the drawing inside them.

This is the one job a figure tool can do that a page-layout tool cannot, and
it is the reason `patchwork` and matplotlib's `constrained_layout` exist.
They know the rectangles are charts with axes, not rectangles with pixels.
Pandion knows that too and was not using it.

Before and after, with a reference line drawn through panel A's axis.

![axis alignment before and after](layout-deepdive/axis-alignment.png)

**The prototype.** `cba8f8f`. Two buttons appear under Align, in their own
`PLOT AREAS` row, when the selection actually holds two chart panels that
share a column or a row. **Left axes** and **Baselines** move the panels so
the drawn plots coincide.

![the plot-areas row in the rail](layout-deepdive/plot-align-rail.png)

Three decisions inside it worth naming.

* It groups the selection by the column or row the panels already sit in, so
  select-all plus one click fixes an entire 2 by 2 grid. Grouping is plain
  box overlap, which is what "same column" looks like on screen.
* It measures the axis as a **fraction of the item box**, never in screen
  pixels, so it is invariant to the fit-page zoom and to a live drag
  transform. The residual error after aligning is under 0.02 page pixels.
* It is an action, not a mode. Silent geometry is against the house rule,
  and a mode would fight every subsequent drag.

**Cost.** One file plus markup and CSS. About 130 lines of shell, no engine
change, no new persisted state, no new option. One undo step. No existing
probe moved.

**Smallest version.** What is built is already the small version. A smaller
one still (a single "Line up the axes" button that does columns and rows at
once) saves about 20 lines and costs the user the ability to say which.

**What it risks.** After aligning, a panel's box sits a few pixels left of
where it was, so the A/B/C/D letters no longer sit at the same offset from
each plot. They are separate text items and nothing moves them. That is
honest but it is a loose end; the standard answer is grouping (item 7).
Guarded by `layout-figure-check` cases 1 to 4.

**The alternative I did not build.** The textbook fix is the other way
round, having every chart in the set *reserve the same gutter* so the panels
never disagree in the first place. That needs an engine change, a payload
key floored into `_computeLeftReserved` and `_computeAxisBottomBase`, in
exactly the shape convention 15 already sanctions for `textScale`, meaning one
key, clamped, floors only, identity when absent. It is about fifteen lines of
engine plus a two-pass render in the shell, and it would also fix the
letterboxing in item 5 for free. I did not build it because it is a day with
a jamovi blast radius, and because the shell-side version measures exact. If
you want the textbook version, it is a well-scoped day and I would take it.

---

## 2. "Print - 300 DPI" produced a file that says it is 44 inches wide

**What a user feels.** They export at 300 DPI, drop the file into Word or a
submission portal, and it arrives enormous and is flagged as low resolution.
They resize it by hand and hope.

**The evidence.** The pixels were always right. The *declaration* was
missing. `canvas.toBlob` writes no density metadata, so the exported PNG was
3150 by 2100 with no `pHYs` chunk and the JPEG carried JFIF `units=0,
density 1x1`. Every reader then assumes 72 or 96 dpi.

```
before   3150 x 2100, dpi = None      -> opens at 43.75 x 29.17 in
after    3150 x 2100, dpi = (300,300) -> opens at 10.50 x  7.00 in
```

which is the page size the user actually set.

**The prototype.** `cba8f8f`. The encoded bytes are patched after `toBlob`,
with a `pHYs` chunk inserted before the first `IDAT` for PNG and the five
JFIF density bytes rewritten for JPEG. Both are single well-defined edits on a
file the browser just produced and both return null (leaving the blob
untouched) on anything unexpected.

**Cost.** About 85 lines in one file, including a CRC32 table. No
dependency. Affects every raster export, Copy as image, and layout
snapshots, all of which route through `rasterizeExport`. `copy-image-check`
and the export battery both still pass.

**Smallest version.** PNG only. JPEG is nine more lines and journals accept
both, so there is no reason to split it.

**What it risks.** A malformed patch would corrupt every raster export.
`layout-figure-check` case 10 parses the real chunk out of a real export and
asserts 300 dpi in both formats; `copy-image-check` and `m1-shell-check`'s
export battery cover the rest of the pipeline.

---

## 3. A panel cannot be pointed at a different chart

**What a user feels.** They put the wrong chart in panel C, or they want to
reuse a finished figure for a second set of results, and the only route is
delete the panel and place a new one, which throws away the exact position
and size the figure was built on.

**The evidence.** The panel right-click offered Duplicate, Delete and four
layering commands. There was no way to change which chart a panel shows.
That makes the brief's task 7 (reuse a layout for a second dataset) a
rebuild rather than four picks, and task 4 (rearrange into a different
reading order) a drag-and-measure exercise instead of two swaps.

**The prototype.** `cba8f8f`. "Show a different chart here" in the panel
right-click opens the existing Add-chart flyout in replace mode, anchored to
the panel, with the chart it already shows disabled. Picking one keeps the
box exactly and is one undo.

![show a different chart here](layout-deepdive/replace-chart.png)

**Cost.** About 45 lines. Reuses the flyout, the snapshot ensure pass and
the layout history. No new markup.

**Smallest version.** This is it.

**What it risks.** Very little; the panel already tolerates its chart
changing underneath it, which is what "Live" means. Guarded by
`layout-figure-check` case 7.

---

## 4. The Orientation control is the least trustworthy thing on the page

Two separate defects, one fixed and one needing a decision.

**Fixed.** The flip scaled chart panels and left **image items at their old
size**, because it tested `kind === "chart"` where every other sized-item
path tests `laySizedKind`. A 400 by 200 logo stayed 400 by 200 while the
panels around it shrank to two thirds, so it landed across the figure.
Verified, fixed in `cba8f8f`, guarded by case 8.

This turned out bigger than I wrote it up. The Notebook dive, merged into
this branch afterwards, added **From Notebook**, and a placed Notebook page
arrives as `kind: "image"` (`ps-shell.js` around line 5940, carrying
`srcChart`, `srcPin` and the drift fingerprint). So image items are not the
rare pasted logo any more, they are how one of the two ways to get content
onto a page works, and every one of them survived an orientation flip at the
wrong size. The fix already covers them because it keys off `laySizedKind`.

**Needs a decision.** The flip scales width by `sx` and height by `sy`
*independently*, so a 463 by 267 panel becomes 309 by 401. The chart inside
has a fixed aspect, so it shrinks to the smaller dimension and the panel
fills with white. A landscape 2 by 2 flipped to portrait comes back with
panels that are about two thirds empty.

![portrait flip](layout-deepdive/portrait-flip.png)

The copy says "Changing orientation scales the current arrangement to fit",
which is true and still produces a figure nobody would use.

*Recommendation.* Scale by one factor, `min(sx, sy)`, so every item keeps
its shape, then centre the result on the new page. A flipped figure then
looks like the original at a smaller size, which is what "scales to fit"
promises. About 15 lines, one probe case, and it changes the behaviour of an
existing control, which is why it is a decision rather than a free win.

---

## 5. Fifteen per cent of every template panel is dead space

**What a user feels.** The gutters in their figure are wider than they set
them, and dragging a panel's edge to close the gap does nothing, because the
gap is inside the panel.

**The evidence.** `layoutTemplateRects` derives panel boxes from the page
alone and never looks at the charts going into them. A four-panel cell is
463 by 267 (aspect 1.734); a chart canvas is 720 by 490 (aspect 1.469). With
`preserveAspectRatio="xMidYMid meet"` the chart draws 392 by 267 and is
centred, leaving **35 px of dead space on each side of every panel**, 15.2%
of the panel width. Alignment, snapping and the smart guides all operate on
the box, so the user is aligning something 35 px away from what they see.

**No prototype.** I judged it without building because it interacts with the
decision in item 1, because the engine-side common-gutter fix would remove the
letterboxing as a side effect, and the shell-side fix I did build makes the
alignment consequence mostly moot. Building the panel-aspect fix now could
be work thrown away.

*Recommendation, if item 1's engine version is not taken.* Size template
cells to the assigned chart's aspect and centre them in their grid slot.
About 25 lines in `layoutTemplateRects` plus the chart lookup. Existing
layouts are untouched; only newly created ones differ.

**Cost of leaving it.** The figure still exports correctly. It costs
honesty in every alignment gesture and a slightly loose-looking figure.

---

## 6. Restyling four panel labels means four separate edits

**What a user feels.** They want the panel letters at 14 pt bold, select all
four, and the rail shows nothing about text at all.

**The evidence.** Select one text item and the rail offers Size, Bold,
Italic, Color and Rotate. Select four and the TEXT section disappears
entirely, leaving only Align and a read-only geometry block. Every design
tool applies text properties to the whole selection.

**No prototype.** The panel already exists and already writes per-item
fields; the work is rendering it for a homogeneous multi-selection and
looping the writer. I left it because items 1 to 4 were the ones with
evidence behind them, and because it needs one small decision, namely what a
control shows when the selected items disagree (Figma shows "Mixed").

*Recommendation.* Render the TEXT section whenever every selected item is a
text item; show a value when they agree and a blank field when they do not;
apply to all. About 60 lines and one probe case.

---

## 7. Marquee selection, grouping, and Alt-drag do not exist

**What a user feels.** They drag a box around three items expecting to
select them, and instead the selection clears.

**The evidence.** A reflex sweep against the canvas.

| reflex | result |
| --- | --- |
| drag on empty canvas (marquee) | clears the selection |
| Alt+drag to duplicate | moves, does not duplicate |
| Cmd/Ctrl+G to group | nothing |
| Cmd/Ctrl+D duplicate | works |
| Cmd/Ctrl+A select all | works |
| Cmd/Ctrl+wheel zoom | works |
| Cmd/Ctrl+0, +, - | nothing (now fixed, item F3) |
| an expression in a number field | rejected, the fields are `type=number` |

Marquee is the largest of these. It is the gesture that makes multi-select
cheap, and multi-select is what items 1 and 6 both depend on.

**No prototype.** Marquee needs pointer handling on the canvas that does not
fight the drag threshold or the Escape-cancels-a-drag rule, and it has an
interaction with the deliberately `aria-hidden` canvas (a marquee has to
mirror into the option list). It is the biggest single item here and it is
not a free win. Estimate 120 to 180 lines, two probe cases, half a day.

Grouping is separate and larger, and it is also the honest answer to the
loose end in item 1. I would take marquee first and let grouping wait for
evidence that people want it.

---

## 8. One arrow key, two opposite meanings

**What a user feels.** They press the right arrow and sometimes the panel
moves and sometimes the selection jumps to a different panel, and they
cannot tell what decides it.

**The evidence.** Inside the canvas, plain arrows navigate between items and
Alt+Arrow nudges, which is the engine's own rule and the right one for the
assistive-technology model. But a second handler further down the same
keydown function nudges on **plain** arrows whenever focus is anywhere else
in the layout workspace, which in practice is any time the user has just
clicked a rail or toolbar button. Same key, opposite effect, decided by
something invisible.

This one cost me twenty minutes of a probe looking like an app bug.

*Recommendation.* Delete the fall-through, so Alt+Arrow nudges everywhere
and plain arrows never move anything. One rule, matching the engine and the
canvas. It is a decision because it removes a shortcut some users may have
learned. Three lines and one probe case.

---

## 9. There is no "make these the same size"

**What a user feels.** Two panels are nearly the same size. They read the
width off one, select the other, and type it in. Twice, for width and
height.

**The evidence.** The rail offers six align commands and no match-size
command. Illustrator, Figma, PowerPoint and Keynote all have one, and it is
the second reflex after align in every multi-panel figure. Resize is also
only available from a **single bottom-right corner handle**; there are no
edge handles and no other corners.

*Recommendation.* A `SAME SIZE` row beside `PLOT AREAS` with Width, Height
and Both, sizing every selected sized item to the primary (last-selected)
one. About 40 lines, reusing `layAlign`'s grammar and `laySnapshot`. Edge
handles are a separate, larger piece of work.

---

# Free wins

All five are in `cba8f8f`, all five were demonstrated failing first, all
five are covered by `layout-figure-check`.

**F1 · A nudge on one panel no longer folds into a nudge on another.**
The undo coalesce key was the literal string `"move"`, so nudging panel A
and then panel B within 1.2 seconds produced one history entry and one
undo pulled both back. The key now carries the selection.

**F2 · Disabled Width and Height read as disabled.** On a multi-selection
they showed the union size, were `disabled`, and rendered *identically* to
the live X and Y beside them with no tooltip. This is the same defect the
Align buttons had before Jul 27, applied to inputs. They are now muted and
say "Size applies to one item at a time."

**F3 · Cmd/Ctrl+0, + and - drive the canvas zoom.** Cmd+wheel already
worked; the three keys every canvas application binds did nothing. Cmd+0
toggles fit-page and actual size. (Worth recording, these must be bound at
**capture** on `window`. Something on the way down already stops propagation
for plain Cmd chords, so a bubble-phase listener never sees `=` or `-` at
all, while `0` arrives, which made the first attempt look half-working.)

**F4 · Deleting a chart says which layouts use it.** The toast said
"Deleted Chart 2 / Undo". A layout keeps drawing the deleted chart's
captured picture for the rest of the session, so nothing looked wrong until
the next launch, by which point the undo was long gone and the panel read
"(this chart was closed)". It now says "Deleted Chart 2 (used by Layout 1)".

**F5 · The geometry-field listeners are registered once.** The
`["x","y","w","h"].forEach(...)` block appeared twice in immediate
succession, so every typed X/Y/W/H ran `layApplyInspector` twice.

**F6 · Sending something to a layout is one undoable step.** Found late, by
an adversarial auditor run over the merge, and it is the one lead from the
brief that my own passes missed. `addChartToLayout` and `addPinToLayout`
mutate the target layout while a DIFFERENT document is on screen, and
neither took a snapshot. Worse than the lead said, because the send does
three things: it adds an item, it grows the page, and it flips the preset to
custom. With no step recorded, the next Cmd/Ctrl+Z in that layout removed
the sent panel AND reverted whatever the user had done before it, in one
unlabelled move. Measured before the fix, depth 1 to 1 across the send, then
one undo took the panel off and put an aligned column back to where it
started. The fix is `laySnapshotDoc(doc, label)`, the same push aimed at a
named document rather than the active one, storing that document's selection
only when it is the one on screen. Probe case 11, demonstrated failing
first.

**F7 · (not built, one line)** Selecting a chart panel covers its own panel
label. The mini bar sits at (277, 230, 33x24) and the "A" text item at
(277, 235, 19x24), measured. Offsetting the bar by its own height clears it.

---

# Needs a decision

| | Recommendation | Cost of each branch |
| --- | --- | --- |
| **Orientation flip** (item 4) | Scale by `min(sx, sy)` and centre, so items keep their shape | Fix: ~15 lines + 1 probe case. Leave: a portrait flip keeps producing two-thirds-empty panels |
| **Arrow keys** (item 8) | Delete the fall-through; Alt+Arrow nudges everywhere | Fix: 3 lines. Leave: the same key keeps meaning two things |
| **Template panel aspect** (item 5) | Only if the engine gutter fix in item 1 is *not* taken | Fix: ~25 lines, new layouts only. Leave: 15% of each panel stays dead space |
| **Engine common gutter** (item 1) | Take it only if you want alignment to be automatic rather than a button | Engine: ~15 lines + shell two-pass + jamovi battery on both bundles, about a day. Not taking it: the shipped button already measures exact |
| **Marquee** (item 7) | Take it; it is what makes multi-select cheap | ~150 lines, half a day, plus mirroring into the AT option list |

---

# Considered and rejected

* **Aligning plot areas automatically when a template is created.** It is
  the obviously "helpful" version and it is wrong, because it changes geometry the
  user did not ask to change, and the house rule is no invisible changes. A
  button that says what it did is better and is one undo away.
* **Distribute across / down.** Removed by ruling on Jul 29. I hit the gap
  twice while rearranging a five-panel figure and still would not put it
  back; "Show a different chart here" solves the same task better, because
  rearranging a figure is usually about which chart is where, not about
  spacing.
* **Millimetres as a unit.** Journals specify mm, so I expected to want it.
  The cm preference displays one decimal, which resolves to exactly 1 mm,
  and 8.5 cm round-trips through the pixel model back to 8.5. Adding mm buys
  a label, not a capability.
* **Making the number fields accept expressions** ("5/2"). Figma does it and
  it is pleasant, but it means abandoning `type=number`, which is what gives
  the fields their steppers, their mobile keyboard and their validation. Not
  worth it for a field that is typed into once per figure.
* **A "panel gutter" page setting.** Tempting after measuring the dead space
  in item 5, but the gap between panels is a consequence of where the panels
  are, and adding a setting that also controls it gives two owners to one
  number.
* **Fading or dimming the rest of the figure while aligning.** Considered as
  a preview affordance and dropped, because the smart guides already say what is
  about to line up, and the recorded ruling is that fading is fine for
  attention chrome but never on a surface where the user is judging colour.

---

# Verification

**Branch.** `probe/layout-deepdive`. `cba8f8f` the work, `fb9e327` the probe
wiring, `15286e3` this proposal, `a0a2042` the merge with the Notebook dive,
`7cd0c1c` the README and a comment-placement fix, `<F6>` the send-to-layout
history step.

**Probe added.** `standalone/verify/layout-figure-check.mjs`, 11 cases,
wired into `run.sh` beside the other layout probes and honoring `PS_PAGE` so
it runs on the dev page and the dist.

**Demonstrated failing first.** Every case was reproduced against the code
before its fix. The axis spread was measured at 6 px and 11 px on the
untouched four-panel template; the coalescing bug was reproduced with a
two-panel nudge sequence; the disabled fields read back as the same
`rgb(48,59,71)` on white as the live fields; the orientation flip was run
with an image item and left it at 400x200; the export was written to disk
and inspected with `file` and PIL, reporting `density 1x1` and `dpi = None`;
the zoom keys were pressed and recorded as no-ops; the context menu was
dumped and had no replace entry; and case 11 reports depth 4 to 4 against
`HEAD` and 4 to 5 with the fix. Case 1 is deliberately a *characterisation*
rather than a regression, because it asserts the misalignment exists, so it
will start failing the day the engine-side gutter fix lands, which is the
correct signal.

**The Notebook dive is merged in.** `git merge probe/notebook-deepdive`,
base `ca07680`, zero conflicts, and `git merge-tree --write-tree` returns a
byte-identical tree in either direction, which is worth measuring rather
than reasoning about. The committed merge tree equals that prediction. Two
corrections to the handoff that came with it. Its expected `grep -c NB_UNDO`
of 10 was recorded mid-dive and the tip carries 11, so the right check is
that the merged count equals the notebook tip rather than a literal. And
`chartCheckReport` reaching zero is correct, but it was never either dive's
work; it arrived through the shared baseline commit `39623fd` and is
committed properly on `probe/charts-deepdive`.

**Suite.** Run as the probe list directly rather than through `run.sh`, so
nothing hides behind an early abort.

```
104 feature probes  x dev and dist   208 runs, 0 failing, 0 skipped
m0-check, m1-shell-check             pass on both
accessibility-source-check           pass
hardening-dom-check                  pass
level-order-check   (R fixture)      pass
rm-panels-check     (R fixture)      pass
m1-parity                            5750 comparisons, no mismatches
```

Not run, on purpose. `artifact-parity-check` is a release gate, not a
regression. Any change under `standalone/` makes the committed website
artifacts stale until `website/build.sh` runs, and regenerating them on a
probe branch would be noise. Because `run.sh` uses `set -e` it aborts there,
which is what hides the dist probes and the R blocks behind it, so those
were run directly instead. `electron-check` is opt-in per machine.

**Three adversarial auditors** were run over the merge, because zero
conflicts is not zero semantic loss when two dives edit 23000 lines of the
same file. All three returned clean.

* *Did either parent lose work.* Every line, every identifier and every
  function body each parent added is present. 42 tokens added by the
  Layouts side and 21 by the Notebook side, none missing. 918 functions
  common to all four versions, 8 modified by one parent and 32 by the other,
  every one landing byte-for-byte; only two were co-edited, and the merge
  carries both sides' hunks in each.
* *Did the merge create a double.* One cosmetic finding, which I had already
  fixed in `7cd0c1c`. The merge left my zoom block between the undo router's
  comment and the router itself.
* *Does it work together at runtime.* The undo key routes to the right
  history in all three workspaces and never lands in another one; the zoom
  keys stay inert outside Layouts. It also found F6 above, which is the one
  real defect any of this turned up, and it is mine rather than the merge's.

**No engine change.** `inst/widget/graphbuilder2.js` is untouched, so
nothing here reaches the jamovi module.
