# Charts workspace deep dive

Branch `probe/charts-deepdive`. Nothing here lands; every item below wants
approving or rejecting on its own.

Method: I imported a real 84-row, 7-column trial CSV and did the twelve
tasks in the brief end to end, headless, screenshotting and reading what
the screen actually said. Then I looked for what the best version of this
surface does that this one does not, then I went looking for the worst
moments. Two prototypes are committed with probes that were demonstrated
failing against the shipping code first.

**The headline.** The Charts workspace is, on the whole, better than the
paid tool it is competing with. The first chart is genuinely finished
before you touch it. Type switches are instant. The Statistics panel is
the best thing in the product. The seams I stress-tested (reload, undo,
duplicate, size, export) all held. So the ranked list below is short, and
it is dominated by one theme, because that is where the gap actually is.

---

## 1. The app knows the chart is misleading and does not say so

> **STATUS, Aug 7 2026.** The `brackclaim` rule is **LANDED** (`1acd41b`) and
> verified on both bundles. The `__gb2_graphLint` host hook and the shell's
> status-bar receipt are **not landed**; they stay in `standalone/proto` and
> the rest of this item still describes them as proposed. See "What landed"
> at the end of this section.

**What a user feels.** I truncated the bars, and nothing anywhere told me
the picture now lies. Then I added a significance star that no test
produced, and the app's own chart checker told me my chart looked good.

**The evidence.**

On the trial chart I set the value-axis minimum to 30. Drug B now reads as
about a sixth of Placebo when it is really about two thirds. What the app
said about it: status bar unchanged, no toast, no pill, no mark on the
chart, and no word matching truncat / baseline / mislead / exagger / zero
anywhere in the visible DOM. Screenshot
`standalone/proto/shots/before-truncated-and-silent.png`.

Then the worse half. `+ Add > Sig. bracket` creates this, verbatim from
the option store:

    [{"kind":"bracket","text":"*","autoP":false}]

An asterisk, with `autoPValue` off and neither leg anchored. The label is a
placeholder glyph; the panel underneath says "Auto-compute p-value from raw
data" is unchecked and "Drag a leg to a bar to anchor it." But every reader
of a figure takes an asterisk over a bracket to mean a test came out under
.05, and it is not decoration in the file either: I asserted the exported
SVG carries it. Then I opened Help > Check my chart:

> This chart was run against 14 checks for its graph type. **All passed.**
> **Looks good.** No common pitfalls found against the current checks.

Screenshot `before-lint-says-looks-good.png`. The product's honesty
checker certifying a fabricated significance claim is the single worst
thing I found, and it is worse than silence, because it is a positive
assurance.

Two separate faults sit underneath, and they compound:

* No rule covers an unearned significance mark. The lint has 40-odd rules
  and this is not one of them.
* The lint only ever speaks when asked, and since Aug 6 it is asked from
  the Help menu (the engine's "?" was removed from the standalone toolbar,
  deliberately). Nothing on the chart surface has ever mentioned it exists.

**The prototype.** Commit `20ebb63`, both halves.

*Engine* (`standalone/proto/engine-lint.patch`, 41 lines, two additions
inside `render()`):

* a `brackclaim` rule in `_graphLintFindings` plus its registry row. A test
  is behind a bracket's label only when auto-p is on and both legs are
  anchored, or it is a main-effect bracket. Fires only when the label reads
  as a significance claim: an asterisk run, a dagger, `p <`/`=`/`>`, or
  `n.s.` A typed `Delta = 4.2` is an annotation and is left alone.
* `host.__gb2_graphLint`, beside the existing `__gb2_serializeSvg` /
  `__gb2_accessibleDescription` / `__gb2_chartSize` hooks, returning the
  same `{findings, passed, total}` report the panel draws. jamovi never
  calls it.

*Shell* (`standalone/index.html` +15, `js/ps-shell.js` +68): a status-bar
receipt beside "84 cases - 6 groups". Muted "Checks passed" when clean, so
the feature is discoverable before it has bad news; amber "2 things to
check" when not, with the worst finding named in the tooltip; a click opens
Check my chart. It hides in Data and Layouts, and hides entirely when the
engine has no hook, so it degrades to today's behaviour on the shipping
bundle (asserted). No new visual language: amber is what the panel already
uses, and the status bar already carries chips.

Before and after: `before-truncated-and-silent.png` against
`after-receipt-two-things.png`; `before-lint-says-looks-good.png` against
`after-lint-catches-it.png`; the quiet state in `after-receipt-clean.png`.

One property worth noticing: the new rule's text says "or use the
Statistics panel's Compare pairs tab, which runs every test and places the
brackets for you." So the discoverability problem in item 3 gets solved by
the honesty fix, at the exact moment the user has demonstrated they want a
bracket, for free.

**The cost.** Engine: 41 added lines, no existing line touched. Shell: 83
lines across two files. Probe: `standalone/verify/chart-check-check.mjs`,
7 cases, new. Probes affected: none red on my branch (statusbar, tokens,
chrome, narrow, polish, reflow-accessibility, axe-state all green; see
Verification). Half a day, plus the jamovi verification below.

**What landed, and what it cost.** The rule went into
`inst/widget/graphbuilder2.js` in one atomic pass: 47 lines added, none
changed, pure ASCII (`\uXXXX` escapes only), `node --check` clean, then
`scripts/minify-widget.sh` (6349 KB source to 2082 KB, hash
`667821c73dd8458299d2d0e2c007a117` matching the committed `.hash`).

* `scripts/verify/run.sh` - 396 assertions, exit 0.
* `scripts/verify/run.sh --min` - 396 assertions, exit 0.
* `scripts/verify/pedagogy-check.mjs` - all 122 checks pass, with two new
  assertions on the EXISTING `p_cg_anat` fixture, whose bracket already
  carries `"text":"*"` with no `autoPValue` and no anchors. That fixture has
  been shipping this exact chart in the jamovi probe corpus all along, and
  the panel called it fine.
* Controls, both ways. Reverting the rule and re-rendering the pedagogy
  fixtures fails both new assertions; the standalone probe's case 2 fails on
  the pre-rule engine at the line that used to read "Looks good".

Both batteries ran in my worktree, so the Stop hook (which watches the
shared repo) never fired and nothing was side-loaded into your live jamovi
module. Landing on `main` will trigger it, which is the intended behaviour
there.

Total: about two hours including both battery runs.

**Still outstanding from this item.** The host hook and the receipt. The
hook is nine lines; the shell side is already written and committed
(`20ebb63`) and is currently dormant, hiding itself because the hook is
absent. Cases 5 and 6 of the probe skip rather than fail, and say so.

**The smallest version.** The `brackclaim` rule alone, no host hook, no
receipt. This is what was approved and what shipped. It converts "Looks
good" into a warning on the one case that is actively dishonest, and it
leaves the lint mute until asked, which is the half still worth doing.

**What it risks.** The rule is a heuristic over user-typed text. A user who
deliberately types `*` meaning a footnote marker gets a warning they did
not want; that is a tip-shaped annoyance, not a wrong chart, and the
finding's own text tells them how to reword. The receipt runs the lint 260
ms after each render, and the lint reads the DOM: on a very dense chart
that is real work on a timer. I did not measure it and it should be
measured before landing. Catching a regression: `chart-check-check.mjs`
cases 5 and 6 are the false-positive guards, and both were demonstrated
meaningful (case 5 places four real brackets from Compare pairs and asserts
the rule reports as *passed*, not merely absent).

---

## 2. The suite has not run past its third probe, for anyone

**What a user feels.** Nothing. This one is aimed at whoever runs
`bash standalone/verify/run.sh` and believes the result.

**The evidence.** At `958c243`, the branch point,
`hardening-dom-check.mjs` dies while `ps-shell.js` is still loading:

    ReferenceError: MutationObserver is not defined
        at watchChartToolbar (...ps-shell.js:15775)

It runs the shell inside linkedom, which has no `MutationObserver`. The
shell has four; three are inside functions and are never reached in that
harness, but `watchChartToolbar` is a boot-time IIFE (added with the Aug 5
zoom-into-the-toolbar work), so it throws during load. `run.sh` runs under
`set -e` and treats only exit 2 as a skip, so the suite stops there. The
125 feature probes after it, and their 125 repeats against the built
single-file dist, never run. I confirmed this on a clean worktree at
`958c243`, with none of my work present.

**The prototype.** Commit `439b258`: an eleven-line no-op
`MutationObserver` stub in the probe's existing shim block, which already
fakes `requestAnimationFrame`, storage, `GraphBuilder2` and
`HTMLSelectElement.value`. The stub is honest rather than convenient: that
observer is a backstop for renders the shell does not drive, and this
harness drives every one of them.

**Cost.** One file in `standalone/verify/`. Minutes.

**What it uncovers.** With the crash gone the probe reaches the end and
reports one genuine failure, which is not mine and not this fix's:

      FAIL view zoom is the sanctioned display mechanism, applied at the host

`#ps-chart-zoom` is not in the document by the time that line runs. The
control is re-parented into engine-owned toolbar DOM by
`dockChartZoomInToolbar()`, and the harness's stub `render()` replaces
`host.innerHTML`, which destroys the re-homed subtree; the real app
survives this only because the observer re-docks it. That is worth a look
by whoever owns the chrome: the Zoom select is a markup element living
inside DOM another component owns and rebuilds, and it is not re-created
if a rebuild ever lands without the re-dock firing. I have not chased it,
and I did not fix it, because a second fix would have hidden the first.

---

## 3. The good way to put a bracket on a chart is invisible from where you reach for one

**What a user feels.** I clicked Add, then Sig. bracket, and got a floating
asterisk over empty space that I had to drag into position by its legs.
One panel away there was a table that had already run all nine tests,
marked which were significant, and would place the brackets for me in one
click. Nothing pointed from the first to the second.

**The evidence.** The Compare pairs tab (`Σ Stats`) is excellent: every
within-facet pair enumerated through the real bracket engine, sectioned by
family, green chips on significant p values, per-row Copy APA, a
correction selector, and Place brackets, which tiers them collision-free
and expands the axis to fit. Screenshot of the result in the session shots
(`brackets-placed`), and it took one click.

Two things hide it. The Σ button is unlabelled as to what is inside, and
**Place brackets sits 258 px below the fold** on a 1000 px window: measured
`y = 1156` against a viewport of 1000, in a pane whose scrollHeight is 1142
against 898 of client height. The user must open Σ, notice the tab, and
scroll a pane that does not look scrollable.

**The prototype.** None, deliberately. Item 1's rule already routes the
user here by name at the moment they have shown they want a bracket, and I
would ship that first and see whether this still bites. The Add menu is
engine chrome with `data-kind` hooks the shell could target, but injecting
shell copy into an engine menu is exactly the kind of second copy the house
rule forbids.

**The smallest version, if it still bites.** One line under the Add menu's
bracket item, in the engine, next to the existing hint text: name Compare
pairs. Cheaper than any shell workaround and it helps jamovi too.

**What it risks.** Nothing much; the risk is doing it before item 1 and
then discovering item 1's copy made it redundant.

---

## 4. The import preview shows a quarter of a wide file, with no cue

**What a user feels.** I imported a 20-column survey file and set the
measure types. I set five of them. I never saw the other fifteen.

**The evidence.** Preview table is 1800 px wide inside a 522 px box:
`{"cols":20,"visible":5,"tableW":1800,"boxW":522,"canScroll":true,
"overflowX":"auto","scrollbarPx":0}`. Overlay scrollbars mean nothing is
drawn, so the only cue is the sixth column being sliced through the middle
of the word "Continuous". Screenshot
`standalone/proto/shots/import-preview-clips-15-of-20.png`. The dialog is
560 px inside a 1500 px window.

This is the moment a Likert battery gets typed Continuous instead of
Ordinal, an id column gets typed Nominal (which the `catsingle` lint then
catches downstream, on the chart, after the damage), and dates get read or
not. Three quarters of that decision is off screen.

**The prototype.** None; it is not my workspace's file and the Data
deep-dive session is live in the same tree. Filed here because I met it on
the way into Charts and it changes what every chart is built from.

**The smallest version.** Let the dialog use the width it has when the
table is wide, and put the column count where the truncation is (the header
already says "60 rows x 20 columns"; it does not say five are shown). A
horizontal scroll shadow, which the Σ panel already implements for exactly
this problem, is the existing pattern to copy.

**What it risks.** Widening a dialog interacts with the narrow-mode
contract; `narrow-check` and `reflow-accessibility-check` guard it.

---

## Free wins

Small, and I would approve the set together.

* **The MutationObserver stub** (item 2). Already committed, `439b258`. Without
  it nobody's suite run means anything.
* **"1 rows x 2 columns"** in the command bar on a single-row import. Also
  "5 rows x 1 columns". Pluralise both.
* **The first-run coach mark lands on the data.** "Every part of this chart
  is editable" opens centred over the first two bars of the chart the user
  has just built, so their first sight of their own data is occluded. The
  chart pane has ~300 px of empty space below it at the default size; the
  same card there says the same thing and covers nothing.
* **The palette flyout and the Add menu also open over the plot** rather than
  below their triggers, covering Placebo in both cases. Same fix, same
  place.

## Needs a decision

* **Is a quiet always-present receipt right, or should the status bar stay
  silent until something fires?** I built the receipt to show "Checks
  passed" when clean, because a control that only ever appears with bad
  news is a control nobody knows exists, and the first time they see it
  they are already being told off. The cost is one more thing on screen at
  all times. *Recommendation: keep the passed state.* Both are one line to
  change; the probe pins the passing state, so flipping it means editing
  case 1.

* **Does `brackclaim` ship to jamovi too?** It is one rule in a shared
  file, so it does unless it is gated, and jamovi has exactly the same hole
  (its Add menu makes the same bracket). *Recommendation: let it ship
  ungated.* It is the same lie in both products and jamovi has real users.
  The cost of the other branch is a module gate in a function that
  currently has none, which is a precedent I would not set for an honesty
  rule.

* **"Fit window" never enlarges** (`applyViewZoom`, documented as "the
  huge-monitor rule"). On a 1000 px window the chart uses 604 px of about
  900 and the label says Fit window. I think the behaviour is right and the
  word is wrong. *Recommendation: leave the behaviour, and only if it comes
  up again, consider naming the option for what it does.* Low confidence
  that anyone but me has noticed.

## Considered and rejected

* **A pre-export warning when the lint has findings.** Tempting, because
  export is the moment the claim leaves the building. Rejected: it makes
  the app nag at the worst possible moment, it would fire on tips as well
  as warnings, and the receipt is already on screen throughout. The house
  answer is do it and offer it back, not stop and ask.
* **A shell-side check for the fabricated bracket, with no engine change.**
  The shell sees `annotationsJson` through the sink and could spot this on
  its own, with no engine work and no jamovi blast radius. Rejected on the
  house rule: the judgment about what makes a chart honest belongs in the
  engine, in one place, or the shell and the panel will eventually disagree
  and the panel will be the one the user believes.
* **Making `+ Add > Sig. bracket` default to auto-p on.** It cannot: auto-p
  needs both legs anchored and a fresh bracket has neither, so it would
  draw a bracket with no label at all and look broken.
* **Changing the bracket's default label away from `*`.** Same problem from
  the other side, plus it changes muscle memory in jamovi for a case the
  lint now covers properly.
* **An engine change to make the lint run automatically and push findings
  out.** Rejected in favour of the pull-shaped host hook: an engine that
  volunteers work on every render costs jamovi something for a feature only
  the standalone uses, and the hook costs it nothing.
* **Reporting the boot-time `ReferenceError: active is not defined`** I saw
  on three headless runs. It did not reproduce on later runs and I could
  not get a stack, so I have nothing worth acting on. Noted here only so
  the next person who sees it knows it is not new.

## Verification

Branch `probe/charts-deepdive`, three commits on `958c243`. Built in a
separate worktree, because four deep-dive sessions are sharing this working
tree and HEAD moved under me twice (see the note at the end).

**New probe.** `standalone/verify/chart-check-check.mjs`, 7 cases, 20
assertions. Demonstrated failing against the shipping engine first:

    node standalone/verify/chart-check-check.mjs
    case 1: ...
      ok  the status bar has a chart-check slot
    Error: a passing chart says so quietly ("")

and passing against the prototype:

    python3 standalone/proto/make-proto.py
    PS_BOOT=4000 PS_PAGE=standalone/proto-lint.html \
        node standalone/verify/chart-check-check.mjs
    ... CHART CHECK: PASS

Cases 5 and 6 are the ones that matter: four brackets really placed from
Compare pairs do not fire the rule and report as a *passed* check, and a
bracket labelled `Delta = 4.2` is left alone. Both were confirmed
meaningful by watching the count move (14 checks / 0 findings clean, 15 / 1
with the fabricated bracket, 16 / `bracketcorr` only with four real ones).

**Existing probes.** The seven most exposed to a new status-bar element all
pass on my branch: `statusbar-check`, `tokens-check`, `chrome-check`,
`narrow-check`, `polish-check`, `reflow-accessibility-check`,
`axe-state-check`.

**`run.sh` on my branch.** It does not complete, and it did not complete at
the branch point either. Before my item-2 fix it stopped at probe 3 with
the `MutationObserver` crash. After it, `hardening-dom-check` runs to the
end and reports one failure (the `#ps-chart-zoom` assertion above), which
`set -e` still treats as fatal, so the 250 probe runs after it remain
unrun.

I did not fix that second failure, and I checked rather than assumed it was
not mine: running my patched probe against a clean detached worktree at
`958c243`, with none of my work present, produces the identical line at the
identical assertion. It is in chrome another session is actively editing,
and fixing it here would have hidden the first finding. Everything else I
could verify, I verified by running the affected probes directly.

**Two probe laws paid for here.**

* A control that fails for the wrong reason is not a control. `tokens-check`
  and `chrome-check` went red the first time I ran them and both were
  another session's in-flight work, not mine. Reversing my own hunks out of
  the shared tree and re-running was the only way to tell.
* `PS_BOOT` matters. The prototype pages carry the un-minified 6.5 MB
  engine, and the harness's default 800 ms wait fires before the app is
  wired, which presents as an unrelated `filechooser` timeout.

---

## Merge state (Aug 7 2026, after the Data dive landed)

Rebased onto `e193d18`, the new `launch/standalone-desktop` tip, 32 Data
commits ahead of my old base. No conflicts, which is the thing to distrust
rather than celebrate, so I checked the result instead of the exit code:
every one of my five identifiers appears exactly once, `e193d18` never
carried my receipt so there was nothing to duplicate against, the engine is
byte-identical at both tips (`e56b41d7`) so the rule and its minified hash
still agree, and all 14 exposed probes pass.

**The `syncChartCheck` collision is not what it looks like.** The handoff
describes two branch bodies to reconcile, keeping whichever lands last.
What actually happened is that `probe/layout-deepdive` carries MY receipt -
markup, CSS, the 60 lines of JS and the click wiring - swept into commit
`5bb6eee` while my work was sitting uncommitted in the shared tree. The
"difference" between the two bodies is an earlier draft of mine against my
final one: a dead `warns` counter I removed afterwards. It is not two
implementations.

So the resolution is not to pick a body. It is to **delete the receipt from
the layout branch.** Reconciling it there would land an unapproved feature
on `main` through a Layouts merge: dormant (that branch has no
`__gb2_graphLint` hook, so the receipt hides itself and can never appear),
untested (`chart-check-check.mjs` is not on that branch), and undecided -
whether the receipt should exist at all is still an open question in this
document. Keeping "whichever lands last" would additionally pick my draft
over my final.

**The suite blocker is still live at the new tip.** Two `MutationObserver`
guards landed with the Data work, on `wireMomentButton` and
`wireStandaloneEngineExclusionLabels`. The site that actually breaks the
harness, `watchChartToolbar`, is still unguarded at `e193d18`, so
`hardening-dom-check` still needs the stub on this branch to load at all -
and once it loads it still reports the pre-existing `#ps-chart-zoom`
failure, so `run.sh` still cannot complete. If the Layout session lands a
shell-side guard, my harness stub becomes redundant but stays worth having:
it protects the harness against the next boot-time observer rather than
against this one.

## A coordination note, which is not a finding but cost real time

Four deep-dive sessions are running against one working tree and one HEAD.
While I worked, HEAD was moved out from under my branch twice, my first
commit landed on `probe/layout-deepdive`, another session's commit swept up
two of my untracked prototype files, and my own `git add -A` swept up their
uncommitted work. I unwound all of it: their branch is back where it was,
their in-flight edits to `ps-shell.js` and `index.html` are untouched (I
removed only my own hunks, from the live file, after checking it had moved
under me), and my work is now in an isolated worktree so I cannot do it
again.

Nothing was lost, and I checked rather than assumed. But the setup means
any of the four of us can silently commit another's work, and `git add -A`
is a live hazard for all of us. Separate worktrees per session would remove
it entirely.
