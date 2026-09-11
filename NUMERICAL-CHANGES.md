# Numerical changes

Every release of Pandion Plots that changes a number the program
displays - a statistic, a computed value, a rounding - is recorded
here, newest first. A chart or table exported before the fix keeps the
old number forever; this ledger is how you find out whether a given
output could be affected. Exported SVG and PDF files carry the app
version that produced them, and every `.pand` project records the
version that saved it, so outputs are traceable to rows in this table.

The hosted app at pandionplots.com deploys ahead of tagged releases,
so a fix can be live there before the version number below ships to
the desktop app and jamovi module. The "live on the web app" date is
when the fix reached the hosted page.

## v3.1.2 (unreleased; deployment dates noted per change)

**Factorial and repeated-measures ANOVA preserve small residual variation.**
Subtraction of large fitted, subject or occasion sums could erase small real
error variance, refusing valid tests or changing F statistics and corrected
p-values. The shared renderer now computes factorial error within cells and
repeated-measures error from occasion differences and directly centered residuals.
Greenhouse–Geisser epsilon uses normalized residual cross-products. Two-/three-
factor Type III, pure repeated-measures, and mixed models with one/two between
factors are covered by independent `car::Anova` and 80-digit reference calculations.
Applies to standalone and Jamovi output. Implemented 2026-09-06; not deployed.

**Crossed repeated-measures input retains numeric precision in R.** The R reshape
converted numeric observations to text and back, rounding values before they
reached the chart. Around a large response origin this changed the differences
used by mixed ANOVA. Numeric columns now bypass text formatting; factor labels
still parse as before. Exact original-observation checks cover the real R analysis
path. Implemented 2026-09-06; not deployed. Verification scope and tolerances are
recorded in [ANOVA validation](docs/ANOVA-VALIDATION.md).

**Faceted scatter models use each panel's own observations.** Fits and bands
previously pooled groups across panels while the displayed correlations and
linear equations used facet × group cells. With y = x in North and y = −x
in South, both panels could draw a pooled horizontal fit despite reporting
slopes +1 and −1. R and standalone now compute fits, intervals, data ellipses
and linear-model standardized residuals within each facet × group cell.
The shared renderer filters by that identity, and compiled fit previews and
edge extensions use the same cells. Legacy untagged pooled fit records are
recomputed before display; unscoped ellipses/statistics cannot bleed into a
panel. Missing facet values and unavailable fits do not borrow another panel's
model. Literal facet/group names use collision-safe identities. Implemented
2026-09-06; not deployed.

**Undefined scatter statistics remain unavailable.** R can send null r/p values
for a panel with a constant predictor. JavaScript's coercing `isFinite(null)`
allowed a null r to crash formatting and a null p to display as `p < .001`.
The scatter statistics formatter now requires finite numbers and displays a
dash for unavailable r or p. With a polynomial or LOESS curve selected, the
exported linear equation and linear R² are explicitly labeled as linear
statistics. Their underlying estimates remain linear. Implemented 2026-09-06;
not deployed.

**Extended regression curves and confidence bands now evaluate the fitted model.**
“Extend to plot edges” previously prolonged the first and last polyline slopes.
That drew straight tails for quadratic/cubic curves and extrapolated interval
edges without evaluating the fitted-mean uncertainty. The shared renderer now
predicts additional x positions using the group's observations and the selected
polynomial degree and confidence level. Every supplied observed-range vertex
must match the recomputed model before extension; stale or unsupported fits
retain their supplied range. Missing confidence bands are never invented.
The geometry is clipped before serialization so invisible vertices cannot
inflate PDF/PNG export dimensions; separate visible curve segments are retained.
Affects both standalone and Jamovi rendering. Implemented 2026-09-05; not deployed.

**Literal scatter group names remain visible.** Names such as `constructor`,
`__proto__` and `toString` could collide with inherited JavaScript properties
in the renderer's hidden-group lookups, suppressing observations or fits.
Those lookups now have no inherited properties. Independent rendered/exported
regression fixtures verify that these groups' observations and fits remain
present. Implemented 2026-09-05; not deployed.

**Very narrow axes no longer loop forever when a tick increment rounds away.**
At a nonzero offset, a positive increment smaller than floating-point spacing
can satisfy `value + step === value`. Tick generation now stops on that
condition and rejects invalid/non-finite inputs. This prevents the reproduced
hang around y = 7 with a step of 1e-16; it does not certify all extreme-axis
label formatting or every possible custom tick density. Implemented 2026-09-05;
not deployed.

**Standalone LOESS curves now follow R's direct-surface convention.**
The old calculation rounded the neighbor count, over-inflated the radius at
spans above one, and used unscaled normal equations. A 31-point fixture at
span 0.5 differed from R's direct curve by as much as 0.00608951; changing x
units to 1e-6 could remove the curve entirely. The local fit now uses scaled
weighted QR, with the neighborhood size and radius of R's direct implementation.
If any requested local quadratic is singular, that group's whole curve is
withheld with an explanation, instead of silently substituting a weighted mean
or joining across missing predictions. The shared preview uses the same curve,
clears stale fits when a new fit is unavailable, and handles literal group
labels such as `__proto__`. Approximate confidence bands have been removed
from the preview helpers; standalone LOESS remains curve-only. Jamovi's final
R-generated curve and interval still use its default interpolated surface,
which can differ from the direct curve. Independent references cover 75 cases
and observed-range SVG geometry. Implemented 2026-09-05; not yet deployed.

**Small t-test and ANOVA probabilities no longer round prematurely to zero.**
Subtracting a CDF rounded to one erased representable small probabilities.
For example, the two-sided probability at t = 100 with 30 degrees of freedom
was zero instead of approximately 1.9846118e-39. Welch, Student and paired
t tests now evaluate the appropriate tail directly, including directional
tests. One-way, factorial, repeated-measures and mixed ANOVA use the direct
F survival probability; the scatter correlation preview uses the same t-tail
correction. The incomplete-beta continued fraction also converges more
tightly. Tail-specific R and SciPy comparisons use relative tolerances so an
incorrect zero cannot pass merely because p is small. This verifies the tail
calculation; it does not settle each ANOVA design's separate methodological
review. Affects: shared client-side statistics in both hosts. Implemented
2026-09-05; not yet deployed.

**Jamovi LOESS confidence bands use residual degrees of freedom.** The band
previously used the fitted smoother's equivalent number of parameters
(`enp`) in its t critical value. It now uses `predict.loess(..., se = TRUE)$df`,
the residual degrees of freedom intended for that interval. On the permanent
100-point regular-grid example at span 0.75 and 95% confidence, the old band
was approximately 35% wider. The fitted Jamovi curve is unchanged. Standalone
LOESS continues to omit confidence bands. Earlier comparisons of standalone
band approximations against the incorrect R-side band are superseded.
Implemented 2026-09-05; not yet deployed.

**Polynomial fits preserve their meaning when measurement units change.**
The standalone and shared preview now fit a scaled QR basis instead of raw
normal equations. Quadratic and cubic curves could previously disappear
when x values were rescaled to units around 1e-6. Independent R comparisons
cover degree 1–3, small/large units, offsets, tied predictors, response scales,
rank deficiency and prediction grids within and beyond the observed range.
At exactly degree + 1 observations, the curve is retained but its undefined
confidence band is omitted in both hosts. Standalone previously invented
one residual degree of freedom; Jamovi supplied non-finite endpoints and
the shared preview dropped the curve. Implemented 2026-09-05; not deployed.

**Constant observations no longer acquire artificial variance.** Repeated
floating-point addition could give identical observations slightly different
means at different sample sizes. For example, groups of 47 and 31 copies of
`0.000001` incorrectly produced Welch `t(60.32) = -8.36` despite containing
exactly the same value. Constant samples now retain their exact mean and zero
variance, and undefined Welch, Student and paired t tests are unavailable.
Affects: shared client-side statistics in standalone and Jamovi, and the
standalone numeric core. Small real differences are preserved; this uses exact
equality, not an arbitrary near-zero cutoff. Implemented 2026-09-05;
not yet deployed.

The standalone formula engine had the same issue independently: `VSD` on a
constant column could produce an artificial nonzero result, and
`(x - VMEAN(x)) / VSD(x)` could yield values near +1 or -1 instead of missing.
`VMEAN`, `VSD` and row-wise `MEAN` now preserve constant inputs exactly;
undefined constant-column z scores remain missing. Existing computed columns
recalculate on reopen under the precision migration described below.

**Charts and statistics preserve source-data precision in both hosts.**
The R-to-widget JSON transport, standalone payload builders and immediate
chart previews previously rounded numbers to ten significant digits. Values
such as `10000000001, 10000000002, 10000000003` became indistinguishable,
so Descriptives reported SD 0 instead of 1. Other tightly spaced values
could acquire artificial variance, ties or altered paired differences.
R now serializes 17 significant digits and JavaScript keeps the original
doubles, including in summaries, preview calculations and reshape averages.
Affects: client-side statistics, plots and error bars in both standalone and
Jamovi when data required more than ten significant digits. Reopened charts
recompute; previously exported figures and tables retain their old values.
Regression checks cover exact R-to-JS doubles, offset and scale variants,
multiple analyses and preview/echo behavior. Implemented 2026-09-05;
not yet deployed.

**Standalone computed columns retain full numeric precision.** Previously,
results were stored at ten significant digits before another formula read
them. With `x = 10000000000`, `a = x + 1`, and `b = a - x`, that made
`b` zero; it is now one, matching the direct expression `(x + 1) - x`.
Numeric-to-text formula functions retain the same stored precision.
Affects: standalone computed columns, dependent formulas, and analyses
using those columns, including the web and desktop builds. This does not
change Jamovi's computed-column engine. The separate transport correction
is described above. Older projects recalculate with a notice; saved
files are untouched until saved again. New `.pand` files use wrapper
format 3 / snapshot 5 so older readers refuse them. Implemented 2026-09-05;
not yet deployed.

**Standalone ROUND handles extreme decimal places.** For example,
`ROUND(1, -309)` is now zero instead of one. Small numbers can be rounded
to more than 308 decimal places without overflowing the scaling factor.
The regression roster compares these cases, negative values, subnormals,
and fractional digit arguments against base R. Implemented 2026-09-05;
not yet deployed.

**ROUND ties now match R (half to even).** `ROUND(2.5)` is 2,
`ROUND(3.5)` is 4, `ROUND(-1.5)` is -2, and `ROUND(2.675, 2)` is
2.67, exactly as R and jamovi print them. The old behavior rounded
halves up (and toward positive infinity on negatives, matching
neither R nor Excel). Affects: computed variables using ROUND on
values that are exact halves at the requested digit; reopened
projects recompute, so such a column can shift by one final digit.
Live on the web app 2026-08-30.

**Mann-Whitney exact p-values are correct at larger samples.** The
exact-p computation overflowed past roughly 30 observations per
group; in strongly separated groups the displayed p could be wrong
by many orders of magnitude (for example, 2.5e-19 displayed as a
much larger value). Rebuilt on a probability-space recurrence and
verified against R across the full range. Affects: Mann-Whitney U
p-values in Compare pairs and significance brackets when both groups
were larger than about 30 and the separation was extreme. Live on
the web app 2026-08-29.

**Spearman p-values use R's exact algorithm.** The client
computation used a t approximation where R uses the AS 89 algorithm
(exact permutation to n = 9, Edgeworth expansion beyond); some
p-values differed at display precision (for example .504 vs .503).
Affects: Spearman p in the Scatter and Correlation Matrix statistics
panels. Live on the web app 2026-08-29.

## How this ledger is maintained

A change lands here in the same commit that changes the number, with
the affected surfaces named and the fix verified against base R by
the statistics parity net (which compares its covered statistical results
against R on gate runs and relevant pushes). When a project saved
under an older version is opened after a change on this ledger, the
app shows a one-time notice naming what was recomputed.
