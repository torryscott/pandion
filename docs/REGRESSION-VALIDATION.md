# Regression validation contract

Local working-tree evidence, 2026-09-05. This is one part of the release
validation record, not sign-off on the complete application or native packages.

## Linear, quadratic and cubic fits

- The curve estimates the conditional mean of y using an intercept and
  polynomial terms through the selected degree. The confidence band is a
  pointwise confidence interval for that fitted mean, not a prediction interval
  for a new observation or a simultaneous band for the entire curve.
- A degree-d curve requires at least d + 1 observations and a full-rank design.
  A confidence interval additionally requires positive residual degrees of
  freedom, n − d − 1. A saturated model retains its curve and omits the band.
  An unavailable model produces no curve.
- Standalone and the shared preview use scaled, twice-orthogonalized QR.
  Scaling must preserve fitted values and intervals when measurement units
  change. Singular normalized designs are refused; arbitrarily ill-conditioned
  designs are not certified by this test roster.
- Independent references use R `lm` with an orthogonal polynomial basis and
  `predict.lm(interval = "confidence")`. The application-produced R payload
  is checked separately against those references, so a mistake in the R
  application code cannot automatically become the expected answer.

The permanent 39-case polynomial roster covers degrees 1–3, 80/95/99% levels,
x scales of 1e-6 and 1e6, offsets, a small response scale, tied predictors,
constant responses, zero and one residual df, insufficient n and rank
deficiency. Each available model has a 100-point observed-range grid and a
separate 21-point numerical prediction grid extending 25% beyond each edge.
Existing module parity tests separately cover grouped/faceted polynomial fits.

## LOESS

Jamovi uses R's default Gaussian degree-2 interpolated LOESS. Its pointwise
band uses `predict(..., se = TRUE)$fit`, `se.fit` and the supplied residual
`df`. The fitted object's `enp` is an equivalent parameter count and is not
the residual df for this interval. See the official
[predict.loess documentation](https://stat.ethz.ch/R-manual/R-patched/library/stats/html/predict.loess.html).

The 45 permanent Jamovi cases cross regular, irregular and tied x values
with spans 0.1, 0.5, 0.75, 1 and 1.5, and confidence levels 80%, 95% and 99%.
Every case has 100 observations and 100 prediction locations.

Standalone intentionally supplies a LOESS curve without a confidence band.
Its curve now targets R's **direct** Gaussian degree-2 smoother, which can
differ from Jamovi's default interpolated surface. The local fit uses weighted,
twice-orthogonalized QR on dimensionless local predictors and scaled response
differences. The neighbor count is `min(n, floor(n * span + 1e-5))`.
For span > 1, the distance radius is multiplied by `sqrt(span)`, matching
the squared-distance calculation in R's implementation. This last detail is
verified against executable R references, rather than inferred from the
manual's general span description. See R's
[neighborhood sizing](https://raw.githubusercontent.com/wch/r-source/trunk/src/library/stats/src/loessc.c)
and [distance weights](https://raw.githubusercontent.com/wch/r-source/trunk/src/library/stats/src/loessf.f).

The permanent `loess-direct` roster has 75 cases: n = 20/31/60/100;
regular, irregular and tied predictors; spans 0.1/0.5/0.75/1/1.5; small and
large x units; offsets; small and constant responses; an exact quadratic;
and four-point, insufficient-data, undersized-neighborhood, constant-x,
two-level and partially singular designs. The 70 available reference cases
must have 100 finite predictions and no R singularity warnings. Five explicit
unavailable cases require no curve. A local QR diagonal must exceed 1e-12
times its original column norm. Any failed prediction refuses the group's
whole curve; no lower-degree fallback or bridging across failed points is
permitted. Arbitrarily near-singular data remain outside this finite roster.

The browser checks the payload, SVG vertices, and the actual compiled preview
when an old linear curve arrives for a LOESS request. Invalid fits must clear
the old curve. Neither JS helper emits an approximate band. Literal group
labels that collide with JavaScript object properties also have a regression
check. Eight negative controls require the verifier to reject incomplete,
wrong, non-finite or warning-bearing reference evidence.

## Acceptance tolerances and rendering

The fit checker requires every declared case and every finite reference
endpoint. Missing results fail unless the case explicitly requires an
unavailable model or a curve without a band. The eight verifier guards test
the valid baseline and intentionally damaged evidence.

Fitted values and interval endpoints use a maximum error of 2e-9 times the
largest absolute input response in these fixtures; predictor grids use the
same relative scale for x. There is no floor of one response unit, so a wrong
answer cannot pass simply because measurements are small. Larger-offset
response fixtures will need a separate error budget for interval widths.

The browser checks actual curve/band presence and finite SVG paths. It also
calibrates plotting coordinates from the observation marks and compares each
curve and band vertex against the independent R predictions, within 0.001 SVG
units. It checks standalone OLS and R-supplied OLS/LOESS payloads in the shared
renderer. The direct LOESS suite adds standalone and compiled preview checks
against its separate R direct-surface references, using the same response
and geometry tolerances and an x-grid tolerance of 2e-14 times the x scale.

The observed-range geometry suite turns off extension to plot edges and sets
limits enclosing the independent curve and band so every vertex remains
checkable. A separate export suite covers the visible clipped geometry below.

## Rendered and exported polynomial extensions

The `fit-export` roster crosses degree 1–3 with 15 cases each: extended ranges,
tight y clipping, cropped x ranges, extension disabled, zero residual df, small
and large x units, x offsets, small responses, band-only and line-only views,
groups, hidden fits, literal JavaScript-property group names, and two panels.
Independent R `lm` / `predict` references contain the 100 observed-range points
and 100 additional positions at each extended edge. The host-generated R fits
are captured separately and must agree with the independent references.

The renderer evaluates these extra positions from the observations, using the
polynomial degree and confidence level. Before extending, it checks **every**
supplied observed-range mean and interval endpoint against the recomputed model
within 2e-8 times the largest absolute input response. A mismatch, unsupported
model or non-finite prediction leaves the supplied range intact. It preserves
missing intervals, including saturated models. The unit probe independently
compares extension predictions with R within 2e-9 times the response scale.

The browser compares standalone live SVG, actual standalone SVG export,
R-supplied live SVG, and the shared serializer's SVG. Curve segments must match
an independent parametric clipping oracle within 0.001 SVG units, including
where the curve leaves and re-enters the viewport. Band vertices must lie on
and retain the independent R boundary; a 29 × 23 interior sample checks the
filled region for missing lobes or spurious bridges. Visible segment midpoints
must approximate the continuous R prediction within **0.25 SVG units**. This
is a finite polyline-approximation budget, not 0.001-unit accuracy everywhere
between vertices or a guarantee at arbitrary user-selected axis ranges.

All serialized fit/band vertices must remain within the clipping rectangle.
This is necessary because SVG `getBBox()` includes vertices hidden by an SVG
clip path, which could otherwise make a cropped PNG/PDF canvas enormous.
Export dimensions are bounded in these fixtures. Tightly cropped linear,
quadratic and cubic cases must also successfully produce PNG and PDF blobs.
Eight negative geometry controls, eight model/refusal guards, seven exact
clipping fixtures and eight tick-loop guards check the verifiers and boundaries.
The tick-loop fixtures have a deadline so a restored infinite loop fails CI.

Three additional portable exports (wide quadratic, cropped cubic and two-panel
cubic) were converted to PDF/PNG. Each PDF was rasterized at 192 dpi, visually
inspected, and compared with native PNG output: more than 99.99% of the selected
regression-colored pixels matched within two pixels in both directions. This
checks those samples' conversion and clipping, not every font or export layout.
Scatter log-axis switches remain dormant; these checks cover linear axes.

## Panel populations (corrected 2026-09-06)

Fits, fitted-mean intervals, linear-model standardized residuals and data
ellipses now use facet × group cells in both R and standalone. The compiled
preview and edge-extension helper use the same identity. The renderer assigns
each curve, band, ellipse and statistics row to its panel; a one-level facet
also remains scoped. A missing facet is not a model population, and missing
group values are not treated as a new fitted group. Hidden panels retain their
computed results but do not draw those results in another panel.

Previously, North with y = x and South with y = −x both drew a pooled horizontal
fit while reporting slopes +1 and −1. Both hosts now produce the corresponding
+1 and −1 curves. Legacy untagged pooled curves are recomputed per cell before
painting; unscoped legacy ellipses/statistics are withheld in faceted views
until a current host payload arrives. Singular or undersized cells have no
fit, and saturated polynomial cells have a curve without a confidence band.

The independent `facet-fit` roster contains **56 cases**: linear, quadratic,
cubic and LOESS × opposite trends, grouped data, unequal n, missing values,
sparse cells, saturated models, rank deficiency, one panel, literal labels,
hidden panels, 80/99% intervals, entirely missing group values and entirely
missing facet values. R references are computed separately from production
payloads. LOESS keeps the previously documented direct-versus-interpolated
conventions, evaluated within the correct cells.

The checker requires each fitted cell, all 100 predictions and available band
endpoints, within 2e-9 times that cell's input-response scale. It compares panel
n, r, linear slope/intercept and R², and checks p within 2e-8 relative error
plus eight subnormal-double steps (without an absolute probability floor); checks standardized residuals within 1e-7;
and verifies ellipse vertices using the independent covariance matrix and
chi-square level. Live and exported SVG curves/bands use the 0.001 SVG-unit
vertex tolerance. Rendered ellipse vertices must satisfy the covariance
boundary within 1e-5 relative. It also tests compiled legacy-fit replacement,
missing-panel exclusion, hidden panels, printed n/r/p/equation/R² fields and
unavailable statistics. Eight
negative controls reject omitted, pooled, numerically wrong or mis-scoped
models, bands, statistics, ellipses and residuals.

A panel with an undefined R correlation now displays unavailable r/p values
instead of crashing or showing a null p as significant. When a polynomial or
LOESS curve is selected, exported equation/R² labels explicitly identify the
separate linear model. These labels do not claim to be polynomial coefficients
or a LOESS goodness-of-fit statistic.

The extension/export roster's panel fixtures now reference **four separate
facet × group models**, rather than certifying the old pooled behavior. Its
prior pooled-panel evidence is superseded by the current fixtures. These are
finite numerical/rendering contracts; supported installed-platform checks and
independent methodology review remain part of final release acceptance.

## Reproduce

```sh
Rscript standalone/verify/fit-boundary.R
node standalone/verify/fit-boundary-guard.mjs
node standalone/verify/fit-boundary-check.mjs
PS_PAGE=standalone/dist/pandion-plots.html node standalone/verify/fit-boundary-check.mjs
Rscript standalone/verify/loess-direct.R
node standalone/verify/loess-direct-guard.mjs
node standalone/verify/loess-direct-check.mjs
PS_PAGE=standalone/dist/pandion-plots.html node standalone/verify/loess-direct-check.mjs
Rscript standalone/verify/fit-export.R
node standalone/verify/fit-export-unit.mjs
node standalone/verify/fit-export-check.mjs --guard-selftest
node standalone/verify/fit-export-check.mjs
PS_PAGE=standalone/dist/pandion-plots.html node standalone/verify/fit-export-check.mjs
Rscript standalone/verify/facet-fit.R
node standalone/verify/facet-fit-check.mjs --guard-selftest
node standalone/verify/facet-fit-check.mjs
PS_PAGE=standalone/dist/pandion-plots.html node standalone/verify/facet-fit-check.mjs
```

The browser checks need Playwright/Chromium and accept `GB2_NODE_BASE` for its
installation directory. Both CI and the standalone release gate include them.
