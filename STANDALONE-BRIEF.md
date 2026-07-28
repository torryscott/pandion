# Standalone Plot Studio - build brief

Written Jul 21 2026 by a Claude session working with Torry, as the handoff
for a NEW session to start building. Read this whole file plus the repo's
CLAUDE.md before writing code. The CLAUDE.md conventions are LAW here; this
brief adds the standalone-specific plan on top.

## Mission

Build a standalone, browser-based Plot Studio: the full graphing/editing
experience with NO jamovi and NO R at runtime. One engine, two shells:

- The existing jamovi module keeps working, untouched in behavior.
- A new standalone shell (CSV in, charts out) shares the SAME engine bundle.

Why Torry wants it: the research intervention currently requires installing
jamovi. A link-clickable Plot Studio means zero-install classroom use
(Chromebooks, course pages, Qualtrics embeds). It is also simply a good
product direction.

Explicitly out of scope for v1: jamovi's statistical analyses (t-tests
tables etc.). NOTE though: a large amount of statistics ALREADY lives in the
engine (sigma panel, brackets, ANOVAs, correlations) and comes along for
free - nothing to do there, and do not strip it.

## The architecture insight (why this is feasible)

jamovi provides only: a spreadsheet, R-side payload marshalling, .omv
persistence, and a window. EVERYTHING product-shaped - rendering, click-to-
edit panels, palettes, patterns, axes, Vision check, undo, the sigma panel -
is `inst/widget/graphbuilder2.js` (~94k lines source, ~1.9 MB minified),
pure browser JS.

Engine contract (all verified working outside jamovi):

- `GraphBuilder2.render(hostDivId, payload)` draws + wires the full editor
  into `<div id="..." class="graphbuilder2-host">`.
- The engine writes edits back through `window.setOption(key, value)`.
  Since the chartSpec consolidation, STYLE edits arrive mostly as ONE
  cumulative `chartSpec` JSON blob; data-shaping options (graphType,
  summaryFunc, errorBarType, the xy fit family, etc.) arrive as individual
  real keys. Re-applying = clone the payload, overwrite those keys, call
  render again. That IS the jamovi round-trip, minus jamovi.
- Set `window.__gb2_authoritativeRender = true` immediately before each
  shell-initiated render (the engine treats it as an R-authoritative echo).
- The payload is a flat JSON object (~370 camelCase keys) normally built by
  R's `graphbuilder2_html()` (R/widget.R). The standalone must produce
  equivalent payloads WITHOUT R at runtime - see the template strategy.

## Proof of concept to study first (working code, not theory)

In `~/Desktop/Statistics Visualization` (Torry's other repo):

- `graph-literacy-quiz-ps.html` - search "Plot Studio engine glue". A quiz
  fork where 23 charts render through the engine with the full editor live:
  mocked `window.setOption` captures per-item edits into localStorage,
  re-applies them onto payload clones, renders into a host div. Also has
  `psMakePng` (client-side 2x PNG export: Esc-clears selection, strips
  chrome via a selector denylist, inlines COMPUTED fonts onto the clone -
  required because a data-URI svg rasterizes in an isolated document - then
  canvas at 2x on white). Steal these patterns wholesale.
- `ps-edition/build-ps-payloads.R` - generates engine payloads by driving
  the REAL module wrappers headlessly and regex-extracting
  `var __gb2_payload = {...};` from the emitted HTML. Includes the working
  harness prelude (sources, R_USER_CONFIG_DIR isolation, generated-wrapper
  gotchas). This is the template-generation recipe.
- Live demo: https://claude.ai/code/artifact/1df3faa2-e5a1-44cb-8d33-7d2bd63f4374

In THIS repo:

- `scripts/verify/render.R` - the 40-case battery: the reference corpus of
  module calls for every chart family. Any payload question is answered by
  generating a case here and looking at it.
- `scripts/verify/check.mjs` + the probe fleet - the verification idiom
  (playwright via createRequire from /tmp/node_modules, biggest-svg rule,
  real-gesture requirements; see CLAUDE.md).

## The one new organ: a JS data layer

Everything to build is "get from a CSV to a payload". Components:

1. **CSV import**: file picker + drag-drop + paste. Hand-rolled parser is
   fine (quoted fields, delimiters, BOM). Type inference per column:
   numeric vs factor (jamovi treats small-integer sets as potentially
   ordinal; keep it simple: numeric if all parse finite, else factor;
   let the user flip). Missing values: empty/NA -> excluded per the
   module's rules (CLAUDE.md "Error / empty / NA / small-n").

2. **Module + roles UI**: pick an analysis, drop variables into roles.
   Roles per module (mirrors each jamovi u.yaml):
   - plotbuilder (Compare Groups): xvar (factor), yvar (numeric),
     groupVar?, facetVar?
   - rmplotbuilder (Repeated Measures): measures (multi numeric),
     betweenVar?, facetVar?
   - xyplotbuilder (Scatter): xvar, yvar (numeric), groupVar?, facetVar?
   - distplotbuilder (Distribution): var (numeric), groupVar?, facetVar?
   - freqplotbuilder (Frequencies): var (factor), groupVar?, facetVar?
   - corrplotbuilder (Correlation): vars (multi numeric)
   - likertplotbuilder (Likert): items (multi, shared scale)

3. **Payload construction - the TEMPLATE strategy (strongly recommended)**:
   do NOT reimplement widget.R's ~370 defaults in JS. Instead:
   - Generate, ONCE, a template payload per module x representative config
     via R (the build-ps-payloads.R recipe), commit them as JSON.
   - At runtime the JS data layer clones the right template and replaces
     only the DATA-DEPENDENT keys (channels, labels, category lists).
   - To learn EXACTLY which keys are data-dependent per module: generate
     two payloads from different datasets in R and diff them. The changing
     keys are the data channels; everything stable is template. Do this
     mechanically per module rather than trusting a hand list. Expected
     channels (verify by diff): CG/RM `bars` ({x, group, facet, mean, se,
     n, values} with facets encoded into x via " ¦ "), plus
     xCategories/groupCategories/hasGroups/labels; RM adds rowIds +
     isRepeatedMeasures + errorBarMethod handling (Cousineau-Morey lives
     R-side - see mirrors below); xy `xyPoints` + fit/stats bundles; freq
     `bars` with raw counts (count->percent is ALREADY client-side); corr
     `corrCells`/`corrVars`/`corrRaw`; likert `likertCells`/`likertMeans`/
     `likertLevels`.

4. **Aggregation math in JS - reuse the engine's own mirrors**: the
   instant-preview work already ported much of R client-side. Inventory
   (all inside graphbuilder2.js; find by name): `_gb2StatFold` (CG center +
   error-bar recompute from raw cell values - mean/median, se/sd/ci),
   `_xyComputeStatsClient` (pearson/spearman/kendall incl. exact small-n
   kendall p), `_corrComputeCellsClient` (full matrix), `_gb2RPretty` /
   `_gb2HistWithBreaks` / `_gb2DensityClient` (R-parity pretty breaks,
   hist, KDE), `_xyEnsureMarginalsClient`, `_xyComputeDensity2DClient`
   (kde2d + marching squares), the freq count->percent transform, box/KDE/
   quartiles (drawn from `values` at render time anyway). Gaps to write
   fresh in the shell: per-cell grouping/summarizing from raw rows
   (trivial), RM pivot + Cousineau-Morey correction (formula in
   rmplotbuilder.b.R - port with a parity test), LOESS fits (R-side today;
   v1 can restrict to linear/quadratic fits or port loess later), likert
   aggregation (counts/means per item - simple), shapiro (skip in v1).

5. **The shell loop**: mocked `window.setOption` -> option store (project
   state) -> payload = template + data channels + stored options -> render.
   Undo already works inside the engine; the shell only persists.

6. **Persistence**: a project file = {csv (or parsed table), roles, module,
   optionStore} as JSON. Save = download / localStorage autosave; load =
   file picker. Keep the format versioned from day one.

7. **Export**: PNG via the psMakePng recipe (2x, chrome-stripped, fonts
   inlined); SVG = the serialized clone itself. PDF: defer (jamovi's PDF
   path is R-side librsvg; browser print-to-PDF is the v1 answer).

## What NOT to port (jamovi-only machinery - actively avoid)

The bundle contains jamovi-specific layers the standalone must simply not
engage: the bundle-cache/localStorage handshake and engine-boot placeholder
(call render directly; never emit the store snippet), the copy-clean swap +
snapshot fallback + delivery wrappers (`jmv-results-html` patching), the
native snapshotImage coordination, `clientBundleHash`/`exportRequest`/
`paletteLibrary`/`styleLibrary`/`styleStamp` option traffic (drop these
keys in the setOption sink - see PS_DROP_KEYS in the quiz fork). The
engine's toolbar export button talks to the R pipeline and will be dead;
either hide it in the standalone or rewire it to the client-side exporter.

## Where to build

In THIS repo, new directory `standalone/`:

- `standalone/index.html` - the shell (single-page; may inline the bundle
  at build time like the quiz fork does, or load `<script src>` in dev).
- `standalone/templates/` - the R-generated payload templates (committed).
- `standalone/build-templates.R` - adapted from ps-edition/build-ps-payloads.R.
- `standalone/verify/` - probes (playwright pattern from scripts/verify).

Sharing the repo keeps the engine single-sourced: the jamovi module and the
standalone always ship the same bundle. RULE: changes to graphbuilder2.js
for the standalone must be ADDITIVE and jamovi-safe; after ANY engine edit,
run `bash scripts/verify/run.sh` (both bundles) - the jamovi module must
stay green. Remember the graphbuilder2.js edit rule from CLAUDE.md (atomic
python str.replace passes, never the Edit tool; re-run
scripts/minify-widget.sh before shipping).

## Known traps (each cost real debugging time; do not rediscover)

- Generated module wrappers evaluate ROLE args literally: pass "g" or NULL,
  never a computed variable (branch the call).
- R payload generation MUST isolate `R_USER_CONFIG_DIR` (a saved default
  style would silently restyle every template via style_auto_apply) and set
  `GB2_NO_BUNDLE_CACHE=1`; stub `.gb2_widget_js` to "" when you only want
  payloads.
- Payload extraction regex from emitted HTML:
  `var __gb2_payload = (\{.*?\});\nvar __gb2_id = "([^"]+)";`
- Never persist `_`-prefixed object keys (the minifier prop-mangles /^_/;
  per-build names cannot be read back - CLAUDE.md persistence law).
- Keep bundle-adjacent source ASCII (unicode escapes only).
- Probe laws: playwright lives in /tmp/node_modules (createRequire); the
  chart svg is the LARGEST svg (toolbar icons are svgs too); synthetic
  dispatchEvent clicks are swallowed by phantom-click guards - use
  page.mouse for gesture-level tests; debounced commits need a forced
  flush (`window.dispatchEvent(new Event("beforeunload"))`).
- In sandboxed iframes (artifacts), programmatic downloads are silently
  blocked and inherited colors/fonts are hostile: overlay UI must be fully
  self-styled and offer clipboard + right-click paths (see the quiz fork's
  psShowDownloadOverlay history).

## Milestones

- M0 (proof, ~a session): standalone/index.html renders ONE editable CG bar
  chart from a hardcoded table via a committed template; edits round-trip
  through the setOption sink; probe green.
- M1: CSV import + roles UI + payload builders for CG, Distribution,
  Scatter, Frequencies (the four easy data layers). Parity probes: shell
  payload channels vs R-generated payloads for the same CSV (byte-compare
  the data channels at sensible precision).
- M2: RM (with CM correction ported + parity-tested), Correlation, Likert.
  Project save/load. PNG/SVG export.
- M3: polish - messy CSVs, factor-level reorder UI, empty states, a11y
  pass, distribution decision (single HTML file vs PWA vs Tauri), and the
  jamovi-parity regression suite wired into scripts/verify.

## Status / coordination notes

- The plotstudio working tree currently sits at v2.9.17 UNCOMMITTED with a
  pending release (see the jamovi-upstream memory) - do not commit or
  rebase anything outside `standalone/` without checking that state first.
- The Statistics Visualization repo (quiz + PS edition) is a CONSUMER of
  the engine, not part of this build; leave it alone.
- Torry's standing style rules apply to any user-facing prose: no em/en
  dashes, ASCII-safe.
