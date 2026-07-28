# Pandion Plots: a jamovi module

Customizable statistical graphics for [jamovi](https://www.jamovi.org), built
around one idea: **drop in a variable or two and get a polished,
publication-ready plot with zero configuration**, then click any part of the
chart to customize it, right on the chart itself.

Pandion Plots provides seven main chart analyses plus the **Help Me Choose**
guide:

| Analysis | For | Chart types |
| --- | --- | --- |
| **Compare Groups** | between-subjects designs | bar, line, dot, box, violin, raincloud |
| **Repeated Measures** | within-subjects (wide) data | line, bar, dot, box, violin, raincloud |
| **Scatter** | two continuous variables | scatter, binned density heatmap |
| **Distribution** | one variable at a time | histogram, density, histogram + density, box, violin, raincloud, Q-Q, ECDF |
| **Frequencies** | categorical counts / proportions | bar (side-by-side, stacked, 100%), pie, donut, pareto |
| **Correlation Matrix** | two or more numeric variables | heatmap, circles, numbers, mixed |
| **Likert / Survey** | batteries of rating-scale items | diverging stacked, 100% stacked, item means ± CI |

## How it works

Unlike most jamovi modules, almost nothing lives in the options panel: just
the variable boxes and a short data tip. Everything else is edited
**directly on the chart**:

- **Click any element** (a bar, an axis, the title, a legend entry, or a fit
  line) to open its lower style panel for colors, patterns, sizes, ordering,
  scales, and other relevant controls.
- **The ＋ button** adds overlays: significance brackets, reference lines,
  data points, value/N labels, rug marks, normal curves, Q-Q confidence
  bands, text annotations, and more, depending on the chart type.
- **The toolbar** provides undo/redo, the **Σ Statistics** panel, the
  visibility menu, chart settings, fuzzy **Find a setting** search
  (`Cmd/Ctrl+F`), the add menu, export, and the five-part **?** help family.
- **Export** produces SVG, PNG, JPG, or vector PDF.

Edits persist with the analysis, so a saved `.omv` file reopens with every
customization intact.

## Feature highlights

- **Statistics built in**: module-aware descriptives, assumptions, omnibus
  tests, pairwise comparisons, frequency tests, and correlations in the
  **Σ Statistics** panel; mean/median summaries; SE, SD, and confidence
  intervals for means (Cousineau-Morey-corrected for repeated measures); and
  significance brackets backed by the same test engine.
- **Model fits**: linear, quadratic, cubic, and LOESS fit lines with
  confidence bands, per-group or pooled, plus data ellipses, marginal
  distributions, and rug marks.
- **Large-n scatter**: switch to a binned density heatmap with a
  color-scale legend.
- **Color & pattern system**: curated palettes, a full HSV picker with
  eyedropper, pattern fills, transparent fills, and a
  **palette library** that saves custom palettes across data files.
- **Search and teaching tools**: fuzzy setting and statistical-term search,
  chart-part labels, graph-selection guidance, an integrated glossary, and a
  **Check graph** panel for accessibility and misleading-graph checks.
- **Panels** in the supported analyses and chart families, with per-panel
  plotting and strip-label controls.
- **Layout control**: orientation, spacing, category/group reordering by
  drag, value/N labels on bars, axis ranges/steps/breaks, rotated tick
  labels, legend placement.

## Installation

For review or testing before Pandion Plots is listed in the jamovi library:

1. Obtain the `.jmo` file supplied for your platform.
2. In jamovi, click **Modules**, choose **Sideload** (the sideways-arrow
   icon), and select the `.jmo` file.
3. Open the ribbon's **Plots** tab and choose an analysis from the
   **Pandion Plots** group.

Once Pandion Plots is listed in the jamovi library, choose **Modules → jamovi
library**, find **Pandion Plots**, and click **Install**.

## Quick start

- **Compare Groups**: drop a categorical variable on *X-Axis Variable* and
  a numeric outcome on *Y-Axis Variable*; add optional *Group By* and
  *Panels* variables.
- **Repeated Measures**: define the levels under *Repeated Measures
  Factors*, place the wide-format measure columns in *Repeated Measures
  Cells*, and optionally add *Between Subject Factors*.
- **Scatter**: drop continuous *X Variable* and *Y Variable* fields; use
  optional *Group By*, *Panels*, *Label Points By*, or *Size By* fields.
- **Distribution**: drop one numeric *Variable*; optional *Group By* and
  *Panels* fields compare distributions.
- **Frequencies**: drop one categorical *Variable* and its categories are
  counted; optional *Group By* and *Panels* fields break the counts down.
- **Correlation Matrix**: drop two or more numeric *Variables* for an
  r matrix with significance handling and a diverging color scale.
- **Likert / Survey**: drop your rating-scale *Items* for diverging
  stacked rows centered on neutral, or an item-means summary. Drag any
  row up or down to reorder the questions; click an item's label to
  rename or reverse-score it (negatively worded items mirror across
  the scale and gain an "(R)" marker).

Then click anything on the chart you want to change.

## Development

Rendering happens in a custom HTML/SVG widget (`inst/widget/graphbuilder2.js`),
not in R graphics. The R side (`R/*.b.R`) aggregates the data and ships one
JSON payload per render.

### Standalone application

The browser-based application in `standalone/` uses the same chart engine and
customization model as the jamovi module. Its release-candidate shell includes
project files, local autosave with last-known-good recovery, explicit project
format migration, vector PDF/SVG export, a virtualized large-data grid, and a
copyable diagnostics panel under **Help → Diagnostics**.

The teaching layer is reachable from the application rather than only from the
chart toolbar: **Help** carries the user guide, Which graph should I use?, Check
my chart, Label the chart parts and the glossary, and the command palette finds
all of them. Three example datasets ship, each pointed at the analyses it can
honestly demonstrate. Measure types are defined wherever they are chosen, and a
role slot that refuses a variable says why and offers the one change that would
work. Presentation runs on a token layer (`:root` in `standalone/index.html`);
add a token when a role is missing rather than a hex literal.

Build the distributable single-file application with:

```bash
bash standalone/build-dist.sh
```

The generated file is `standalone/dist/pandion-plots.html`; it has no server
requirement and can be opened directly in a modern browser.

Verify with `bash standalone/verify/run.sh`, which runs every probe against the
dev page and then the built single file, followed by an R parity battery. For
presentation changes there is also `standalone/verify/shot.mjs`
(`before` / `after` / `diff`), which captures eleven surfaces and reports
per-surface pixel differences. It is a development tool rather than part of the
suite, because it needs a before/after pair; the run-to-run noise floor on the
live chart is about 0.011%, so anything at or under that is identical.

### Building from source

> **Important:** if you build this module yourself, make sure the minified
> widget bundle exists first. `inst/widget/graphbuilder2.min.js` is committed
> to the repo, but if you have edited `inst/widget/graphbuilder2.js` (or the
> min file is missing/stale for any reason), run:
>
> ```bash
> bash scripts/minify-widget.sh   # requires Node (npx)
> ```
>
> before `jmc --build .`. **Why it matters:** without a current
> `graphbuilder2.min.js`, the module still builds and installs cleanly, but
> at runtime it falls back to inlining the full ~6 MB un-minified source into
> the results HTML on every render — which can freeze jamovi's results view
> so the chart never draws, while everything else looks fine. (A module built
> that way shows a "built without its minified chart bundle" note under the
> chart area.) Release preparation and CI verify the committed source hash and
> refuse a stale minified bundle; the `.jmo` files on the
> [releases page](../../releases) always include the bundle.

```r
# from the project root, with jmvtools installed
jmvtools::prepare()   # regenerate headers + validate the yaml (fast)
```
```bash
# build + side-load into a local jamovi
# (NOT jmvtools::install()/build(); they hang or are not exported under
# jamovi 2.7.32 — this helper drives the jamovi-compiler's --build mode)
bash scripts/jmv-build-install.sh
```

- `scripts/minify-widget.sh`: refresh the minified widget bundle (+ its
  committed hash) after editing the widget source; `--check` performs the
  offline release/CI freshness check without rewriting it.
- `scripts/verify/run.sh [--min]`: headless verification battery that renders
  the chart families and edge cases, then checks them in Playwright/Chromium
  for page errors, missing geometry, NaN coordinates, and expected messages.

### Preparing and publishing a release

Release preparation and publication are deliberately separate. Preparation
never commits, tags, pushes, publishes, or side-loads a module into jamovi.
Publication never edits, builds, stages, or commits files.

```bash
# 1. Synchronize every maintained public version reference.
node scripts/release-version.mjs set 3.0.1

# 2. Review the version/release-note changes and commit them.
# 3. Build and verify the portable app, website, shared engine, and local JMO.
scripts/prepare-release.sh 3.0.1

# 4. Inspect .release/v3.0.1/release.json and SHA256SUMS.
#    The default publication command is a read-only preflight.
scripts/release.sh 3.0.1

# 5. Only after explicit approval:
scripts/release.sh 3.0.1 --publish
```

If a deterministic build changes a committed generated file, preparation
stops and asks for that diff to be reviewed and committed before it will issue
a release receipt. The receipt binds the artifact checksums and required test
gates to the exact commit being published. GitHub Actions independently checks
the source version, release-tooling contract, generated website parity, and
the contents of each platform `.jmo`.

## Author & license

Copyright © 2026 Torry Scott Dennis, PhD.

Pandion Plots is free, open-source software licensed under the
[GNU General Public License v3.0](LICENSE) (GPL-3.0): you may use, study,
modify, and share it, but any version you distribute must also be released
under the GPL. It can't be taken closed-source. GPL-3.0 is compatible with
jamovi's `jmvcore` (`GPL (>= 2)`), which this module builds on.

Questions and licensing inquiries are welcome at <tsdennis@smcm.edu>.
