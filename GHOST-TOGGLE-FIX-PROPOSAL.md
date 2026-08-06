# Proposal: make Cmd/Ctrl+E work when the mark under a stationary cursor is replaced

**Status:** proposed, NOT applied. Written for review by the agent working on the
svg-results branch before any engine edit is made.

**File:** `inst/widget/graphbuilder2.js` (the shared engine: jamovi module,
portable HTML, hosted web app, Electron desktop).

**Scope:** three small edits, all inside the point-exclusion feature. No change
to the export harvest, the snapshot/restore machinery, hover attribute handling,
or any render-tail behaviour.

---

## 1. The defect

`standalone/verify/exclusion-bridge-check.mjs` fails on the include half of the
Cmd/Ctrl+E point-exclusion toggle:

```
Error: Cmd/Ctrl+E on a hovered ghost did not include:
       {"ghosts":1,"hoursCell":true,"hours":null}
```

User-visible symptom: hover a data point, press Cmd/Ctrl+E, the point becomes a
slashed ghost under your cursor. Press Cmd/Ctrl+E again and nothing happens. The
shortcut stays dead until you move the mouse. The same applies in the other
direction: include a ghost and the freshly drawn point under the still cursor
cannot be excluded again.

## 2. Root cause

`window.__gb2_dpHoverPoint` is the only input the shortcut has. It is written by
`mouseenter` and cleared by `mouseleave` on the marks themselves:

- ghost group listeners at approximately line 32964 and 32975
- live point halo listeners at approximately line 33053 and 33066

Enter and leave fire only when the pointer **crosses** an element boundary. Two
situations produce a live mark under a cursor that never crossed anything:

1. **The rebuild swap.** Excluding rebuilds the chart and draws the ghost at the
   excluded point's exact position. The old element is discarded and the new one
   appears beneath a stationary pointer, so no `mouseenter` fires and the tracked
   hover stays null.
2. **The export harvest.** `_gb2HarvestClone` deliberately dispatches
   `mouseleave` down the hover chain (`_hFire`, approximately line 10415) so the
   clone is captured un-hovered, then restores its attribute snapshot. That
   snapshot covers **attributes**, not JS globals, so `__gb2_dpHoverPoint` is
   left null with the pointer still sitting on the mark. After any copy or
   export, the shortcut is dead until the user moves.

Evidence, measured on the real page rather than inferred:

| Sequence | Tracked hover | Shortcut result |
|---|---|---|
| Move onto ghost from elsewhere (real crossing) | `{cat:"A", group:"", idx:0}` | includes correctly: ghosts 0, excluded false, value 1.5 |
| Ghost appears under a stationary cursor | `null` at 30 / 100 / 300 / 700 / 1200 / 1800 ms | no-op |

So the toggle itself, `_togglePointHidden`, and the whole dataset bridge are
sound. Only the hover lookup fails.

## 3. Proposed change

### 3a. Fall back to hit-testing under the cursor

Current, in the once-per-window keydown wiring (approximately line 4996, inside
`if (!window.__gb2_dpKeyWired)`):

```js
                if (String(e.key).toLowerCase() !== "e" ||
                    !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
                var hp = window.__gb2_dpHoverPoint;
                if (!hp) return;
                var t = e.target;
                if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" ||
                          t.isContentEditable)) return;
```

Proposed (the typing-field guard moves up so the fallback never runs while
someone is typing):

```js
                if (String(e.key).toLowerCase() !== "e" ||
                    !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
                var t = e.target;
                if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" ||
                          t.isContentEditable)) return;
                var hp = window.__gb2_dpHoverPoint || _dpPointUnderCursor();
                if (!hp) return;
```

### 3b. The helper

New function beside the wiring, at the same scope. It reads only the DOM and
existing globals, so it holds no reference to any particular render:

```js
        // The tracked hover comes from enter/leave on the marks, so it is null
        // whenever the element under a STATIONARY cursor was swapped out from
        // under it: excluding a point rebuilds the chart and draws the ghost at
        // the same spot (no crossing, so no enter), and the export harvest
        // dispatches leave down the hover chain then restores ATTRIBUTES, not
        // this JS global. Both leave the shortcut dead until the user jiggles
        // the mouse. Asking what is under the cursor right now fixes every such
        // case at once and needs no new state: __gb2_ptrX/Y are already
        // maintained by the capture-phase pointermove the harvest relies on.
        function _dpPointUnderCursor() {
            try {
                if (typeof window.__gb2_ptrX !== "number" ||
                    typeof window.__gb2_ptrY !== "number" ||
                    !document.elementFromPoint) return null;
                var el = document.elementFromPoint(window.__gb2_ptrX,
                                                   window.__gb2_ptrY);
                if (!el || !el.closest) return null;
                var owner = el.closest("[data-point-idx]");
                if (!owner) return null;
                var idx = parseInt(owner.getAttribute("data-point-idx"), 10);
                if (!isFinite(idx)) return null;
                return {
                    cat: owner.getAttribute("data-point-cat") || "",
                    group: owner.getAttribute("data-point-group") || "",
                    idx: idx
                };
            } catch (_eUc) { return null; }
        }
```

### 3c. Make the live-point halo self-describing

The ghost is a `<g data-role="data-point-hidden">` that already carries
`data-point-cat`, `data-point-group` and `data-point-idx` (approximately line
32918), so `closest()` resolves it from any child, including its transparent hit
disc.

A live point does not resolve, because interaction is owned by a **halo** that is
a *sibling* of the painted dot, and only the dot carries the identity attributes
(set at approximately line 33016). The halo is created at approximately line
33042. Proposed: add the same three attributes there.

```js
                    var halo = svgEl("circle", {
                        cx: px, cy: py, r: hitR,
                        fill: "transparent",
                        stroke: "none",
                        // The halo, not the painted dot, owns interaction.
                        // This preserves editing when point opacity is 0.
                        "pointer-events": "all",
                        // Identity too, so anything hit-testing the cursor can
                        // name the point without knowing the sibling layout.
                        // Deliberately NO data-role: every existing consumer
                        // queries [data-role="data-point"] and would otherwise
                        // start counting halos as points.
                        "data-point-cat": bar.x || "",
                        "data-point-group": bar.group || "",
                        "data-point-idx": idx
                    });
```

**The safety argument for 3c**, which is the only part that changes rendered
output: nothing anywhere selects on these attributes on their own. Every consumer
in the engine queries `[data-role="data-point"]` first and then reads the
attributes with `getAttribute` (see approximately lines 20036, 20055 and 20069).
The single probe selector that mentions them is anchored the same way:
`'[data-role="data-point"][data-point-cat="A"][data-point-idx="0"]'`. A grep for
`[data-point-cat`, `[data-point-group` and `[data-point-idx` used as selectors
returns nothing across the engine and both verify trees. The halo carries no
`data-role`, so it stays invisible to all of them.

## 4. Alternatives considered and rejected

- **Re-arm the hover at the end of `render()`** by hit-testing there. Rejected:
  it puts new work in the render tail, which is exactly the area the svg-results
  work owns, and it would fire on every render rather than only when the user
  actually presses the shortcut.
- **Resolve the live point via `previousElementSibling`** instead of adding
  attributes to the halo. Rejected as fragile: it hard-codes the current sibling
  order, which the selection ring and the outlier ring already perturb.
- **Fix the probe instead.** Rejected: the stationary-cursor case is the normal
  way a user meets this feature, so the product is wrong, not the test.

## 5. What the svg-results agent should scan for

The touchpoints, in order of how much they matter:

1. **`window.__gb2_ptrX` / `__gb2_ptrY`** (written at approximately line 4259 in
   the capture-phase `onDoc("pointermove", ...)`). This proposal only **reads**
   them. Confirm nothing on your branch narrows when they are written, clears
   them, or makes them relative to something other than the viewport. They are
   currently plain `e.clientX` / `e.clientY`, which is what
   `document.elementFromPoint` expects.
2. **`_gb2HarvestClone`'s leave dispatch and attribute snapshot/restore**
   (approximately lines 10380 to 10425). This proposal does not modify it. It
   does change the consequence of one of its side effects: after a harvest the
   shortcut will now work instead of silently failing. Confirm you consider that
   desirable, since the harvest's stated contract is that the live chart is
   byte-identical afterwards, and `__gb2_dpHoverPoint` is state the restore never
   covered.
3. **The halo's attribute set** (approximately line 33042). If anything on your
   branch snapshots, diffs, or serialises halo attributes, it will now see three
   more. The harvest snapshots whatever attributes exist and restores them, so
   more attributes should be inert, but this is the one place my change is
   visible in the DOM and therefore in a harvested clone.
4. **Nothing else.** No change to `_togglePointHidden`, the ghost rendering, the
   point menu, the render tail, the snapshot pipeline, or any export path.

## 6. Verification plan

- New probe assertion in `standalone/verify/exclusion-bridge-check.mjs` covering
  the real contract, which the existing case only reaches by accident: exclude by
  shortcut, then press the shortcut again **without moving the mouse**, and
  assert the value round-trips back into the dataset. Same for the reverse
  direction.
- Control: revert the fix, re-minify, re-run, and confirm the new assertion
  fails. Engine controls must re-minify because the standalone pages load the
  minified bundle.
- Full chain on both bundles: `scripts/verify/run.sh --extras`,
  `scripts/verify/run.sh --min --extras`, `standalone/verify/run.sh`. Current
  baseline is 2,146 / 2,146 green and the standalone suite red only on this case.
- Re-run `standalone/verify/artifact-parity-check.mjs` and rebuild dist plus
  website after the re-minify, since the artifacts embed the bundle.

## 7. Rollback

Three contiguous edits in one file. Reverting is deleting the helper, restoring
the four-line ordering in the keydown handler, and removing three attributes from
one `svgEl` call. No option, payload key, persisted state, or saved-file format
is involved, so nothing round-trips and no old document can be affected.
