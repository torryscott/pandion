# Notebook deep dive

Branch `probe/notebook-deepdive`. Nothing here has landed. Every item is a
proposal to approve or decline, item by item.

I used the workspace before I read it. Twelve tasks, start to finish, on the
sample dose-response data. Kept results and annotated them, exported the
record, edited the source charts and came back, built twelve pages across
three sections and tried to find one, kept into the wrong section, deleted
and undid, reloaded mid-edit, ran a session on the keyboard, and pushed it to
forty pages. Then I built the fixes, because the cost of a thing is not
knowable until you have paid it.

The bar for what follows is the one thing this workspace is for. A lab
notebook exists so a result can be defended months later by someone who was
not in the room. Every item below is about whether the record survives
contact with that.

---

## 1. Everything you write about a page is lost the moment you export

**What a user feels.** They keep three charts, write the sentence under each
that explains what it shows, export the notebook as a PDF for their
supervisor, and hand over three unlabelled pictures. The explanation, the
date, and what the figure was drawn from are all still inside the app.

**The evidence.** `pin.note` and `board.note` are read into the rail and
written back from it, and nothing else in the file touches them. Neither the
PDF builder nor the file export sees them. I exported a three-page notebook
with a note on every page and extracted the text.

```
BEFORE  page 1 [540 x 368]   "0 20 40 60 80 100 score Control Low dose High dose condition"
AFTER   page 1 [540 x 428]   "... condition | Page 1 of 3 - kept Aug 7, 1:55 PM
                              | Compare Groups - condition, score
                              | Bar of the means. High dose is clearly above
                                control, but this hides the spread."
```

The before column is the whole of what left the app, eleven axis labels. Read
as a supervisor, three pages of naked charts with no page number, no date, no
title, no source and no note is not a record of anything. Screenshots
`BEFORE.png` and `AFTER.png`.

**The prototype.** Each page composes with a record band under the figure at
export time. It reuses the chart exporter's caption machinery
(`wrapCaptionLines` and the nested-svg geometry that has typeset captions
under figures since t3-59), so the two paths cannot drift. The band carries,
in order, the page's title if it has one, then the section and page number
and kept date, then the analysis and variables it came from, then the drift
verdict if its source has moved on, then the note. A checkbox in the export
dialog turns it off for a bare figure, remembered in the export prefs. It
rides PDF, SVG, PNG and JPG alike, because composition happens on the SVG
before rasterising. The stored page is never rewritten.

**The cost.** `ps-shell.js` gains about 140 lines (`pinRecordBlocks`,
`pinRecordLayout`, `pinComposeWithRecord`, `pinExportSvg`, `pinRecordsFor`,
`pinRecordWanted`, plus threading a record descriptor through `pinFileBytes`
and `pinboardPdfBlob`), and `index.html` gains the checkbox and its style. No
engine change. The checkbox's state is remembered in the existing export prefs
(`pinRecord` in localStorage), which is the only new persisted thing; nothing
new lands in the project file. Probe `notebook-record-check.mjs`, 17
assertions. About half a day including the probe.

**The smallest version.** The note alone, PDF only, no checkbox. That is
roughly 40 of the 140 lines and it fixes the reported harm. I would not stop
there, because the page number and the date are what make it a page rather
than a picture, and they cost almost nothing once the band exists.

**What it risks.** Every Notebook export changes shape by default, and pages
grow taller, so anything downstream that assumed a page's aspect ratio would
notice. `pinboard-check` and `keep-fidelity-check` both pass unchanged. The
one judgement call worth your ruling is in the decisions list below.

---

## 2. Undo, in this workspace, edits a chart you are not looking at

**What a user feels.** They press Cmd+Z in the Notebook expecting the page
they just deleted to come back. Nothing on screen changes. A chart in another
workspace has silently had a style edit undone.

**The evidence.** `undoScope()` branches on data and layout and returns
`"chart"` for everything else, so with the Notebook open the Edit menu reads
"Undo chart styling" and the keyboard handler falls through to the engine's
history. Read from the running app.

```
Undo chart styling      Cmd/Ctrl+Z
Redo chart styling      Cmd/Ctrl+Shift+Z
```

The layout workspace fixed exactly this for itself and left the reason in a
comment, "Without this the press fell through to the engine's handler and
undid a style edit on a chart in another tab, invisibly." The Notebook never
got the same branch.

**The prototype.** A Notebook history in the shape of the existing ones.
Keeping, deleting, moving between sections and reordering each push a named
step, so the Edit menu reads "Undo the deleted page" and the keyboard reaches
all four. The toast's Undo button and Cmd+Z undo an act once between them,
following the `offerDataUndo` rule already in the file for the same hazard.
Notes and titles are deliberately out, because they are text fields where the
browser's own undo already works, and a debounced text history is its own
project.

**The cost.** `ps-shell.js` gains about 90 lines (the stack, four
registrations, and one branch each in `undoScope`, `commandLabel`,
`commandEnabled`, `commandDisabledReason`, the command runner and the keydown
handler). No new persisted state, since the history is session-only like the
layout one. Probe `notebook-undo-check.mjs`, 26 assertions. Half a day.

**The smallest version.** The keydown branch alone, with the menu item
disabled and honest. Three lines that stop the key reaching another
workspace. That removes the hazard and leaves the gap.

**What it risks.** The Notebook now consumes Cmd+Z, so anyone who had learnt
to press it there to undo a chart edit loses that. I think that is correct,
since they were relying on a bug, but it is a behaviour change. Covered by
cases 2 and 3 of the probe.

---

## 3. Forty pages, and no way to find one

**What a user feels.** They know they kept the box plot that showed the
outlier. It is somewhere in a notebook of forty pages, each one filling the
screen. The only instrument is the scroll bar.

**The evidence.** Twelve pages across three sections, and the app offers no
page list, no outline and no search. At forty pages the scroll height is
25,249 px against a 950 px viewport. The left rail is the project's table of
contents and it lists sections, then stops, one level short of what you go
looking for. Screenshot `41-volume.png` shows forty pages with a rail reading
"Section 1" and nothing else.

Rendering is not the problem. Navigation is the whole of it. Two numbers I
filed here need qualifying, because a re-measurement caught both. "Forty pages
render in 17 ms" timed two synchronous workspace switches with no layout,
decode or paint inside the interval, and it re-measures at 22 to 34 ms on
another machine and 61 ms when the forty pages are distinct captures rather
than forty clones of one. And "566 KB" is a floor, not a typical figure. It
came from cloning a bar chart, the cheapest page in the family; forty distinct
captures across the graph types come to 1.0 MB, because a raincloud page's SVG
is about four times a bar's. Neither number changes the conclusion, and both
were softer than I wrote them.

**The prototype.** The rail lists the pages of the section you are in,
numbered, named, with an amber dot when a page's source chart has moved on
since it was kept. A click jumps to the page, selects it and scrolls it into
view. The row's tooltip carries the full name, the kept time, the drift
verdict and the note, and its aria-label carries the drift and the presence
of a note, so the list is as useful to a screen reader as to the eye. Only
the active section expands, which is how a notebook of sections and pages
reads everywhere else. Screenshot `50-outline.png`.

A list needs names, and the derived one was useless. Four pages kept from one
chart tab all read "Compare Groups - condition, score". Two changes fixed
that. `pinProvenance` now records what kind of chart it was, so the name reads
"Bar - condition, score" and "Box - condition, score" and four explorations
are four distinct lines. And a page can be given a title in the rail, which
then names it in the list, on the page card, and in the exported record band.

Recording the type took two goes, and the first one did not work. It read the
graph type from the chart's OPTION STORE, which is empty until the user
switches type, and the engine writes nothing when you pick the type you are
already on. So every page kept before a first type change carried no type at
all and fell straight back to the undifferentiated name this item exists to
fix, which for someone exploring by restyling is every page they keep. Scatter
was structurally worse, because it switches type through `xyBin` rather than
`graphType`, so a point cloud and a heatmap of the same two variables could
never be told apart. The type is now resolved over the payload template the
way `buildPayload` resolves it, and `xyBin` is read. See the self-audit at the
end, which is what caught this.

While fixing that I hit latent fragility of the same family. `pushPin` copied
provenance field by field, and it dropped both fields I added the moment I
added them. On the untouched baseline nothing was being lost, because the four
fields it copied were the only four that existed, so this was a trap rather
than a live bug. It now carries the whole record.

**The cost.** `ps-shell.js` gains about 180 lines (the page rows,
`pinPageLabel`, `pinTypeLabel`, `pinReveal`, `pinSyncCardLabel`, the title
field's wiring, the provenance additions), and `index.html` gains the title
input and the row styles. Two additive persisted fields on a page,
`pageTitle` plus `srcType` and `srcVars` on new keeps. Old projects load
unchanged and fall back to the old derived name. Probe
`notebook-pages-check.mjs`, cases 1 to 3. About a day with the naming work,
plus half a day for the second go at the type recording.

**The smallest version.** The page rows alone, named from the graph type, no
title field. That is most of the navigation for about a third of the lines.
The title is what turns a list of chart types into a list of findings,
though, and it is what the record band wants as its first line.

**What it risks.** The rail grows long in a big section. It scrolls, and only
one section expands, so the ceiling is one section's page count. A section of
200 pages would want a search box, and I would wait until someone has one.

One naming note. The persisted field is `pageTitle`, not `title`. A data
field named `title` trips `chrome-check`'s source-level ban on native
tooltips, which greps for `.title = `. Renaming was cheaper and safer than
weakening a rule that exists for a good reason.

---

## 4. A page can be kept into the wrong section and never moved out

**What a user feels.** They keep a result into Section 1 by mistake. Nothing
in the page menu, the page bar or the rail moves it. The only route is to
delete it and keep it again from the source chart, which loses the note they
wrote and resets the kept date, the two things that made it evidence.

**The evidence.** The page right-click menu, in full, offers Copy image, Send
to layout, Export this page, Delete page. Nothing about sections. The rail's
page panel offers Open source chart and nothing else.

**The prototype.** "Move to section" on the page menu and on the rail's page
row, shaped exactly like Send to layout, with the sections by name (the
current one greyed and saying why) then New section. The move carries the
page whole, including title, note, kept time and provenance, takes the
Notebook to where the page went so the move is something you can see, and is
one click back through the toast or Cmd+Z. Screenshot `52-movemenu.png`.

**The cost.** `ps-shell.js` gains about 60 lines (`movePinToBoard`,
`showPinMoveMenu`, two menu entries). Probe `notebook-pages-check.mjs`, cases
4 and 5. An hour.

**The smallest version.** This is already the smallest version.

**What it risks.** Almost nothing, since it composes existing pieces. The one
open question is whether it should also be a button on the page card. The
card already carries four verbs and wraps awkwardly at low zoom, which is why
I left it in the menu and the rail. Your call.

---

## 5. Undo can move a page to a section you never chose

**What a user feels.** They delete a page from Section 1, click over to
Section 3 while the toast is still up, and press Undo. The page comes back
into Section 3. Nothing says so.

**The evidence.** `deletePin`'s undo closure called `projectPins()`, which
resolves the section at undo time rather than at delete time. Driven in the
running app before the fix.

```
after delete   b1:1  b2:1
switch to Section 2, press Undo
after undo     b1:1  b2:2     restored into board index 1, not the one it
                              was deleted from
```

`deletePinBoard`, three hundred lines away, captures its index at delete time
and is correct. This was a slip, not a design.

**The prototype.** The section is captured at delete time, with a fallback to
the active one if that section has itself been deleted meanwhile. The restore
also takes you to the page, because an undo you cannot see is not much of an
undo, and the toast now names the section it came out of.

**The cost.** `ps-shell.js`, about 12 lines. Probe
`notebook-pages-check.mjs`, case 6. Twenty minutes.

**The smallest version.** This is it.

**What it risks.** Nothing I can find. It makes a wrong thing right.

---

## 6. A page whose source has drifted tells you, and then offers nothing

**Judged, not built.** This one needs your ruling before code.

**What a user feels.** The rail says "Chart 1 - has changed since it was
kept." Good. Now what? There is no way to bring the page up to date. The
route is to open the chart, keep it again, retype the note, delete the old
page, and hope you put the new one in the right place.

**The evidence.** With a page selected whose source I had edited, the rail
offers exactly one button, "Open source chart". Screenshot `30-drift.png`.
Nothing refreshes, updates or re-keeps. Item 1 above at least carries the
verdict into the export, so a reader is warned, but the author still has no
move.

**Why I did not build it.** There are two defensible designs, and the choice
is a product decision rather than an implementation one.

- **Refresh in place.** The page adopts the current chart, keeping its title,
  note and position, and the kept date updates. Cheap and obvious, but it
  destroys evidence. The old capture is gone, which is the one thing a lab
  notebook is not supposed to allow.
- **Keep an updated copy.** A new page appears directly below, carrying the
  note forward, with both versions and both dates in the record. Truthful,
  and it is what Benchling and LabArchives do, because an entry is
  append-only. It grows the notebook, and the user has to delete the old page
  themselves if they did not want two.

I recommend the second, with the first available from the same menu for the
case where the drift was a typo in an axis title. Roughly half a day either
way, since the composition and provenance code it needs already exists.

**Related, and cheaper.** The drift verdict currently lives only in the rail
of the selected page, so scrolling the notebook shows nothing. The rail's
page list now carries a dot per page (item 3) and the export carries the
sentence (item 1), so the remaining gap is the page card itself. A line in
the card footer would close it for about ten lines. I did not add it because
it belongs with whatever you decide above.

---

## Free wins

Small, already built, and approving them is a formality.

- **A note typed and then interrupted survives.** Notes and titles write on a
  600 ms debounce, so a reload inside that window lost what had just been
  typed. They now flush on blur as well. Three lines.
- **The delete toast names the section** it took the page out of, rather than
  saying "the Notebook" while three sections exist.
- **`pushPin` carries the whole provenance record** instead of four
  hand-listed fields. It had already silently dropped two new fields when I
  added them, and would have dropped the next ones too.
- **An exported single page numbers itself correctly.** Exporting page 2 on
  its own used to relabel it "Page 1 of 1", because the number came from the
  export selection rather than from the page's place in its section.
- **`window.PS_SHELL.notebookHistory()`** joins `layoutHistoryDepth()` on the
  probe surface, so what Cmd+Z would do is inspectable.

## Needs a decision

1. **Does the drift warning belong in the exported record?** It rides the
   band today. It is true and it is what a reader needs. But someone who
   keeps four variants from one chart tab will find three of them marked "the
   source chart has changed", which is accurate and reads as an accusation.
   The alternatives are to keep it (my recommendation, since the rail already
   says it and an export that hides it is less honest than one that does
   not), to gate it behind its own checkbox, or to drop it from the export
   and leave it a screen-only fact. Any branch costs under an hour.
2. **Refresh in place, or keep an updated copy?** Item 6. My recommendation
   is the copy, with refresh offered alongside.
3. **Should "Move to section" also be a button on the page card?** The card's
   four verbs already wrap at low zoom, and the stated rule is that the card
   and its menu match. Adding a fifth verb honours the rule and crowds the
   card. Leaving it out keeps the card clean and breaks the rule. I chose the
   second and put the verb in two other places instead.
4. **Should the record band ride "Copy image" too?** It does not today, so a
   page copied to the clipboard is the bare figure. I think that is right,
   because copy is aimed at slides, but it is a seam between two surfaces
   that otherwise match.

## Considered and rejected

- **Search across the notebook.** The reflex from OneNote and Zotero, and the
  obvious next thing after a page list. Rejected for now, because with the
  outline in place and pages named, twelve to forty pages are a glance, and a
  search box that returns page thumbnails is a real design problem rather
  than a control to drop in. Worth revisiting the first time someone has two
  hundred pages.
- **A section title page in the entire-notebook PDF.** Tempting, and it would
  make the PDF read more like a document. Rejected because the per-page band
  already names the section on every page, and an extra sheet per section in
  a three-page export is worse rather than better.
- **Making pages live rather than frozen.** Out of scope by design, and it
  would destroy the property the workspace exists for. The freshness verdict
  is the right answer to drift, and item 6 is about acting on it rather than
  removing it.
- **Dragging pages between sections in the rail.** The outline is the natural
  drag surface and Scrivener's outline-drag is the model. Rejected for this
  round because sections are collapsed to the active one, so there is no
  visible drop target for another section. It would need the rail to expand
  every section, which makes the common case worse to serve the rare one.
  "Move to section" covers the need at a fraction of the cost.
- **Print.** Cmd+P opens the export dialog with PDF preselected, for the
  stated reason that printing the DOM yields one clipped viewport of chrome.
  Now that pages export with their record, that reasoning holds even more
  firmly. Nothing to do.
- **The rest of the Notebook's Edit menu.** Rename, Duplicate and Delete
  document, Copy chart as image and Reset chart styling all appear there,
  which looked like the same defect as Undo. It is not. `workspaceDocument`
  returns null for the Notebook, so every one of them is correctly disabled
  with a reason. Undo was the only entry that both claimed something false
  and acted on it.
- **Capping the record band's height.** A 4,000-character note makes a very
  tall PDF page. Truncating what someone wrote in their own record is worse
  than a tall page, and they can see the box they typed it into. Left
  uncapped deliberately.
- **Anything about the pinboard naming.** Ids, fields, function names and
  action keys still say pin and board, deliberately. I did not touch them,
  and the new code follows the same convention (`pinRecordBlocks`,
  `movePinToBoard`).

## Two gaps I did not fill

Both are documentation rather than code, and both are worth someone's hour.

- **`standalone/README.md` never mentions this workspace.** It is the truth
  about the app and it describes three of the four. Everything I learned
  about the Notebook came from the source and from using it.
- **`ps-tour.js` has no walkthrough for it.** The tours are the app's way of
  teaching a workflow by performing it, and keeping evidence is exactly the
  kind of workflow they suit.

## Verification

Branch `probe/notebook-deepdive`. Three probes added, all wired into
`standalone/verify/run.sh`.

| Probe | Cases | Demonstrated failing first |
| --- | --- | --- |
| `notebook-record-check.mjs` | 7 cases, 17 assertions | Yes. On the unchanged code it fails at case 1, because the option does not exist. The content assertion was proved separately by exporting the same annotated notebook on both revisions. The note is absent before and present after, and the page height goes from 368 to 428. |
| `notebook-pages-check.mjs` | 8 cases, 22 assertions | Yes, at case 1, because no page rows exist in the rail. Case 6, the undo-scope defect, was also demonstrated independently in the running app before the fix (the b1 and b2 trace in item 5). |
| `notebook-undo-check.mjs` | 6 cases, 26 assertions | Yes, at case 1, with exactly the symptom. The Edit menu reads "Undo chart styling" with the Notebook on screen. |

### What run.sh does on this branch

Run from an isolated worktree at this branch's HEAD, so no other session's
in-flight edits are in the measurement.

109 steps ran. 107 green, including all three new probes; one step is the
dist build banner, which succeeds but emits no pass marker. One step fails,
`artifact-parity-check`, and it is not a behaviour regression. It is the
release gate that requires the committed public artifacts
(`website/pandion-plots.html` and the hashed files under `website/app/lib`)
to be byte-identical to a fresh build of `standalone/`. Any change to the
shell makes them stale by definition. Running `bash website/build.sh`, which
is the release step, turns it green, and I confirmed that. I have not
committed the regenerated artifacts, because 4 MB of generated files would
bury a proposal diff that is otherwise reviewable. Regenerate them at
whatever point this work lands.

`set -e` aborts the suite there, so the dist half never ran inside `run.sh`.
I ran it by hand against the built single-file artifact instead, which is the
coverage that matters for a shell change. `m0-check`, `m1-shell-check`, the
three notebook probes, `pinboard-check`, `keep-fidelity-check`,
`copy-moment-check`, `provenance-check` and `doclifecycle-check` all pass on
`standalone/dist/pandion-plots.html`.

Both figures are from the branch AS IT STANDS, after the four fixes the
self-audit forced. The run before those fixes had the same shape, 109 steps
and the same single artifact-parity failure, so the fixes introduced no new
failure anywhere in the 107.

Two probe laws worth recording, because both cost time and will cost it
again.

**A jsPDF file's text lives in Flate streams, so a raw byte search over the
PDF is a false negative**, and a naive `indexOf('stream')` also matches
`endstream` and walks the offsets off the data. Match `/stream\r?\n/`, trim
the trailing newline before the keyword (node's inflate tolerates trailing
bytes while the browser's `DecompressionStream` rejects them), and join the
parenthesised literals. My first two runs of the record probe reported the
note missing when it was present.

**The app-menu button toggles**, so a probe that reads the Edit menu twice
closes it on the second read and asserts against stale rows. Press Escape and
confirm the menu is closed by computed display, not by the inline one, which
is the empty string before the menu is first opened.

### The self-audit, and the four things it caught

After filing the above I had it re-verified independently, applying three
tests the charts dive had found useful. Run a control yourself and make sure
it fails. Check what surface the evidence was actually driven on. Re-measure a
filed number. Seventeen agents did that, and every defect they raised went to
a separate reviewer whose job was to refute it. Nine of twelve survived, and
the material ones were all mine.

Four defects in this dive's own code, now fixed in `c890809`.

1. **The page naming did not work in the ordinary case.** It read the graph
   type from the option store, which is empty until the type is switched. Two
   keeps from one tab with only a style change between them produced two
   identical rows, which is verbatim the failure item 3 says it fixed.
2. **Scatter could never record its type at all**, because it switches through
   `xyBin`. A scatter page and a heatmap page of the same variables were
   permanently indistinguishable.
3. **The exported band never carried the derived name.** Only a user-set
   title reached it, so four variants exported the identical sentence. That is
   the one thing item 1 exists to prevent, in the one place it matters most.
4. **The Notebook history outlived its project.** Nothing cleared it, so after
   opening a different project the Edit menu offered an enabled "Undo the
   deleted page" and pressing it injected a page, note and all, from the
   previous project. A weaker form of this is pre-existing through the delete
   toast, which also survives a project load inside its six-second life.

And one defect in the verification itself, which is why the first three
shipped. **`notebook-pages-check` manufactured the field whose absence was the
defect.** Its `keepAs` helper poked `setOption('graphType', ...)` before every
keep, so the naming assertions passed against a state a user cannot reach, and
the probe ran green over a broken feature. It now keeps its first page without
touching anything, and the four new assertions were each demonstrated failing
against the pre-fix tree.

Two claims in this document were also wrong and are corrected above. Item 1
said "no new persisted state" while the same paragraph described a checkbox
remembered in localStorage, and item 3 called `pushPin`'s field-by-field copy
"a live bug" when it was a trap that had not yet sprung on anyone but me.

What survived unchanged is worth stating too, because it is most of the
document. The five load-bearing claims all held under attack. Notes never
reached an export, Cmd+Z really did reach the chart engine from the Notebook,
`deletePin` really did resolve its section at undo time, the layout comment
says what I quoted, and the branch touches no engine file. The 25,249 px and
the 368-to-428 page heights reproduce exactly. The new code has no XSS
surface, verified by execution as well as by reading. And two claims turned
out to be understated rather than overstated. The Cmd+Z hazard has a second
route I missed, where a recent data edit means the key silently undoes a
DATASET change, and the layout reconciliation is more urgent than a footnote.

### What this dive still gets wrong, disclosed rather than left to be found

Three things the re-audit raised that I judged not worth fixing here, and one
that is not mine to fix. All are disclosed rather than quietly carried.

- **The rail page row truncates at about twenty characters** at the default
  rail width, so a Likert battery and a Correlation matrix can show a shared
  prefix. The type leads the name, which is the distinguishing part, and the
  row's tooltip and aria-label carry the whole thing. A wider rail or a
  two-line row is the real answer and it belongs to whoever owns the rail.
- **A legacy bitmap page gets no record band.** Pages kept in the first hours
  of the Notebook's life are stored as PNG, and `pinFileBytes` returns their
  bytes before the composer runs. Those pages export exactly as they did
  before. The dialog and the toast already say a bitmap page rides as PNG, so
  nothing lies, but the band silently does not apply there.
- **The cost estimates in this document are roughly fifteen percent light in
  aggregate.** The five per-item figures sum to about 482 lines against 553
  actually added to `ps-shell.js`. The word "about" absorbs some of that and
  no decision here turns on it.
- **Not mine.** The delete toast can outlive a project load on the untouched
  baseline too. Inside its six-second life, clicking Undo after opening a
  different project puts the old project's page into the new one. Clearing the
  Notebook history closes the durable form of this, and the toast's own guard
  now refuses a consumed step, but the pre-existing transient hole belongs to
  whoever owns the toast.

### A coordination note, because it changed what is on this branch

Four sessions were writing to one working tree, and it cost real work.

Two `git add -A` commits swept in files belonging to other dives.
`layout-figure-check.mjs` has been untracked again and is untouched on disk,
two prototype HTML files were added and removed inside my own commits, and
the charts session's chart-check status receipt landed in `ps-shell.js` and
`index.html`. The receipt has been removed from this branch, and their own
tree still has it.

Worse, and only visible because the suite caught it, **the Notebook history
work was written but never committed**. The shared `ps-shell.js` was
rewritten from a stale buffer between the edit and the commit, so eleven
lines of that commit survived and the rest was silently lost. It is restored
in commit `48d1114`, recovered by classifying the working tree's 42
outstanding hunks by owner (23 mine, 5 the DPI work, 14 the layout work, none
mixed) and applying only mine.

Everything since has been done in an isolated worktree at this branch's HEAD,
which is also where the suite was run.

### The merge, measured rather than guessed

`probe/layout-deepdive` branched from `ca07680`, an intermediate commit of
this dive, so it carries the record band, the page naming, Move to section and
all three probes, but not the undo history restored later in `48d1114`, and
not the swept-in receipt's removal. Two consequences worth knowing.

First, layout's `run.sh` is red today for a reason that has nothing to do with
layout. Its line 32 wires in all three notebook probes, but its `ps-shell.js`
has no `NB_UNDO`, so `notebook-undo-check` and `notebook-pages-check` fail
there and the suite aborts long before it reaches artifact-parity.

Second, the merge itself is clean, and I measured it rather than reasoning
about it. `git merge-tree --write-tree probe/notebook-deepdive
probe/layout-deepdive` exits 0 with no conflicts in either order, because both
share `ca07680` as their real base. Auditing the materialised result gives
`NB_UNDO` 10, `pageTitle` 6, the layout DPI functions intact, and
`chartCheckReport` and `ps-status-check` at 0, because the receipt's removal
is a one-sided delete against an unchanged copy.

So the reconciliation instruction is short. Merge both with a plain `git
merge`. Do not squash and do not rebase either branch, because the shared base
`ca07680` is what makes it resolve. Then check `grep -c NB_UNDO
standalone/js/ps-shell.js` is 10 and `grep -c chartCheckReport` is 0, and run
`notebook-undo-check`, `notebook-pages-check` and `layout-figure-check`.

### A correction for the charts session

Their handoff says `run.sh` cannot complete on any branch until Layout's
`#ps-chart-zoom` failure is fixed. That is not right, and it matters because
it would send someone hunting a shared blocker that does not exist. The five
probes touching `ps-chart-zoom` are byte-identical to the baseline on both the
Notebook and Layout branches, and all five pass at both tips when run in a
clean worktree. The failure is specific to `probe/charts-deepdive`'s own
lineage, which forked before the baseline the other two dives share and so
never received the fix that landed on Aug 7.
