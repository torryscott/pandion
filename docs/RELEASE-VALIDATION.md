# Release validation record

**Working-tree assessment, updated 2026-09-06. Release sign-off is still pending.**

This record concerns the local changes based on commit
`2e5d2dc5ed6ac17e929023e76add419a5d7685fa`. It is not a certification of
the deployed website, a GitHub release, or an installed Windows package.
The source version is still 3.1.1; the numerical changes are documented as
unreleased in [NUMERICAL-CHANGES.md](../NUMERICAL-CHANGES.md).

Acceptance means that every supported feature has an explicit contract,
appropriate independent reference, boundary cases, and evidence from the
artifacts being released. A passing assertion count alone does not establish
this. Bit-for-bit preservation is required for stored observations; statistical
calculations across libraries use documented numerical tolerances.

## Faceted-model blocker corrected (2026-09-06)

The panel-population mismatch is corrected in local R and standalone code.
Fits, intervals, ellipses and linear-model standardized residuals now use
facet × group cells, matching panel statistics. The original opposite-slope
fixture now draws +1 in North and −1 in South. Compiled previews and exported
curves preserve the same populations. See the independent acceptance fixtures
in [REGRESSION-VALIDATION.md](REGRESSION-VALIDATION.md).

Release sign-off still requires the remaining acceptance matrix and final
release artifacts. This correction does not certify every statistical method,
installed host, browser or possible data magnitude.

## Validation process changes

- The SciPy checker requires the declared random-fixture count, replay seed,
  fixed boundary roster, every group pair, and every expected result. Missing
  references, unexpected non-finite results, and calculation exceptions fail.
  Constant-data cases are reported with explicit reasons. No method can pass
  with zero comparisons. Degrees of freedom are now compared too.
- Twenty-four checker guard tests cover the valid baseline, empty/malformed
  input, omitted datasets/results (including undefined cases), wrong answers,
  and injected SciPy failures.
- The tag build calls the statistics workflow on its own commit. Publishing
  requires that job to succeed. The workflow also runs on pull requests.
- Detailed statistical-method, bracket and Sigma-table probes are required in
  the shared-engine gate and CI, on source and minified bundles. The fixture
  generator now honors the requested bundle instead of always embedding source.
- CI and the standalone gate compare all seven modules' payloads with real R
  analysis output on both source and portable builds. The roster now includes
  cubic fits and their confidence intervals, with grouped/faceted and 80%/95%
  cases. The checker requires the full case roster and finite fitted references;
  ellipse comparison guards reject empty and non-finite coordinates.
- Corpus freezing permits only a complete existing entry as a no-op. Other
  failures propagate, and release preparation refuses newly added uncommitted
  corpus files as well as changed tracked files.
- A seeded workspace model checks sequences of edits, formula changes,
  filtering, exclusions, type changes, undo/redo, save/reopen and autosave/reload.
  It now includes structural edits and dependency cycles; see the
  [workspace validation contract](WORKSPACE-VALIDATION.md).
- The deeper fuzzer found a real zero-variance defect: 47 and 31 copies of
  `0.000001` produced a spurious Welch test. Shared and standalone means and
  variances now preserve constant samples exactly; a permanent boundary fixture
  and direct core checks cover the correction. See the numerical change ledger.
- Follow-up inspection found the same defect in standalone computed-column
  aggregates: constant-column z scores could become approximately +1 or -1.
  `VMEAN`, `VSD` and row `MEAN` now preserve constant samples, with 81 direct
  regressions and ten additional real computed-column formulas against R.
- Standalone templates were regenerated after the R precision change; the
  portable and website artifacts were rebuilt from the updated sources.
- The token contrast probe now converts WCAG's point sizes to CSS pixels,
  applies the contrast threshold without rounding up, requires nonempty
  measurements and checks five known passing/failing calibration examples.
  See [W3C's contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
- The follow-up regression boundary suite adds 84 explicit cases with separate
  R references and real Jamovi payloads. It exposed incorrect Jamovi LOESS
  interval degrees of freedom, undefined polynomial bands at zero residual
  df, and standalone/shared polynomial fits lost after changing x units.
  Those are corrected and recorded in the numerical ledger. Eight verifier
  guards reject missing coverage, non-finite references and incorrect bands.
  [Regression contracts and tolerances](REGRESSION-VALIDATION.md) describe the
  tested conventions and the remaining limits, including the separately
  tested rendered/exported extrapolation and corrected panel-population mismatch.
- A separate tail suite compares t and F probabilities and actual tests with
  both R and SciPy using relative error. It exposed premature zeros in the
  shared t-test and ANOVA p calculations; those now use direct tail identities.
  Seven calibration controls ensure that small wrong probabilities cannot
  pass under an absolute tolerance.

## Numerical coverage matrix

“Covered” below identifies existing tests, not blanket approval of every input.
Rows sharing a probe still need their own method/convention review. R tests
that implement a formula by hand are not a third independent library.

| Surface | Current independent evidence | Additional release evidence needed |
| --- | --- | --- |
| Observation storage and R → JSON → JS transport | `transport-precision.R` / `transport-precision-check.mjs`: 1,048 exact R hexadecimal doubles, including extreme/subnormal values; nine real analysis fixtures | Repeat on the final artifacts; test the supported installed Jamovi versions |
| Mean, median, SD, SE, N, extrema, skew, kurtosis | `stats-fuzz`, `m1-parity`, `stats-probe`: R functions and specified sample-moment formulas; rendered table checks | Review per-method tolerances and limits, including large offsets and near-zero spread |
| Welch and Student t tests | R `t.test`, SciPy `ttest_ind`; t, df and p; table/bracket probes; `stats-tail` adds directional and tiny-tail comparisons | Broaden highly unequal n and missingness; verify tiny probabilities on all copy/export surfaces |
| Mann–Whitney U and rank effect size | R `wilcox.test`, fixed and randomized ties/boundaries; reported U convention pins | Add a third reference with explicitly matched exact/tie/continuity conventions |
| Paired t and Wilcoxon signed-rank | R paired tests; clean, tied, zero-difference and large-n fixtures; `stats-tail` adds R/SciPy directional and tiny-tail paired t checks | Third-reference signed-rank checks; more missing-pair and all-zero-difference cases |
| One-way ANOVA | R `aov`, SciPy `f_oneway`, rendered omnibus table; `stats-tail` adds direct F survival and very small test probabilities | Additional imbalance/extreme-scale and undefined-input cases |
| Two-/three-factor Type III ANOVA and interactions | `stats-probe` plus `anova-run`: `car::Anova` and 80-digit Wald references; imbalance, missing/empty cells, tiny errors, unit/offset and factor-order variants; actual Sigma tables in five delivery paths | Independent methodology review; larger designs and broader ill-conditioning/estimability cases |
| Repeated-measures and mixed ANOVA | `stats-probe` plus `anova-run`: independent `car`/80-digit references; 2/3/4 occasions, listwise missingness, unbalanced groups, GG epsilon/dfs/p and partial eta squared; exact observations through real R crossed-factor output | Independent review of design/sphericity restrictions; multiple within factors, larger designs and installed-host acceptance |
| Holm, Bonferroni, BH, Games–Howell | `stats-fuzz`: R `p.adjust`, `ptukey`; missing-result negative control | More partial/selected comparison families and tail regimes; verify family disclosure |
| Tukey and Dunnett | `stats-probe`: R `ptukey`, `mvtnorm::pmvt`; invalid-family disclosure | Broaden unequal n, shared-control and extreme-tail cases |
| Cohen d, rank r, eta squared, partial eta squared, omega squared | `stats-probe`: specified formulas and convention pins | Inventory every selectable effect/interval and verify each independently |
| Chi-square, counts, percentages, standardized residuals | `m1-parity`, `stats-probe`: R `chisq.test`, independence/goodness-of-fit fixtures | Sparse/zero margins, denominator changes, missing-data cases and caveat review |
| Proportion comparisons and confidence intervals | `stats-probe`: independent/same-group proportion fixtures with z, p, difference and CI | Boundary proportions, small denominators and family-correction combinations |
| Pearson, Spearman, Kendall | R `cor.test` in fuzzer/payload checks; SciPy coefficients and Pearson p | SciPy intentionally does not compare rank p values; cover each documented exact/approximate regime separately |
| Correlation CI, pairwise N and matrix coloring | R payloads and Sigma-panel fixtures | More missingness patterns; independently verify CI endpoints, displayed N and color encoding together |
| Shapiro–Wilk | R payload and rendered normality-table probes | Minimum/maximum supported n, constant/nearly constant data and numerical extremes |
| Linear/quadratic fit and fitted CI | `m1-parity` real R analysis payloads; `fit-boundary` R QR references, 80/95/99% intervals, units/offsets, ties, rank/minimum-n cases and extrapolated numerical predictions; `fit-export` checks live/exported extended and clipped geometry | Panel-population mismatch corrected by `facet-fit`; broaden ill-conditioning and missingness combinations |
| Cubic fit | `m1-parity` grouped/faceted payloads plus `fit-boundary` R QR references, units/offsets, ties, rank/minimum-n cases, 80/95/99% intervals and extrapolated numerical predictions; `fit-export` checks live/exported extended and clipped geometry | Panel-population mismatch corrected by `facet-fit`; broaden ill-conditioning and missingness combinations |
| LOESS | `fit-boundary` checks 45 real Jamovi curves/intervals; `loess-direct` checks 75 standalone cases against R's direct surface, including singularity refusal, compiled preview, stale-curve clearing and SVG vertices | More adversarial conditioning, grouping/faceting and independent methodology review; direct and interpolated surfaces can differ |
| Data ellipse | R covariance/eigen references; center, axes and area | Near-singular covariance and rendered orientation/axis-scale checks |
| Repeated-measures error bars | R payloads and `stats-probe` Cousineau–Morey SE fixtures | Missing-subject/design and CI-level combinations; independent convention review |
| Likert means, t CIs, Cronbach alpha | R payloads, seeded item battery and rendered alpha/table probes | Reverse coding, declared order, incomplete items and zero total variance |
| Box quartiles, whiskers, outliers | `stats-unit-parity`: R type-7 quantiles and specified Tukey fences | Final-bundle geometry checks; alternative settings and degenerate inputs |
| Density/violin curves and 2D density | `stats-unit-parity`: bandwidth/kernel sums and MASS `kde2d` reference samples | Every offered kernel/bandwidth/trim setting; final rendered and exported paths |
| Q–Q points and confidence bands | R reference construction in `stats-fuzz`; browser comparisons | Extreme quantiles, sample-size boundaries and exported geometry |
| Formula vocabulary and numeric/text semantics | `formula-fuzz`: fixed expressions on seeded columns, R/explicit house rules; precision-chain regressions | Generated expression/dependency graphs; Unicode case/length conventions and complex cycles |
| Display rounding and significance formatting | `stats-format-unit`, `stats-probe`, `stats-fuzz` rendered output | Audit all export/copy surfaces and significance-threshold boundaries |

The new `stats-tail` roster contains 63 t-distribution parameter pairs (three
tails each), 120 F-distribution parameter triples and 90 actual test cases.
It spans fractional through 1,000 degrees of freedom and checks Welch,
Student, paired t and one-way ANOVA on sample sizes 3, 20 and 60. Probability
error is at most 2e-8 relative plus eight subnormal-double steps; there is no
1e-9 absolute floor. The smallest positive reference is approximately
3.1608052e-245. Eight distribution references underflow to zero in both R and
SciPy and are checked explicitly. See R's official
[t distribution](https://stat.ethz.ch/R-manual/R-patched/library/stats/html/TDist.html)
and [F distribution](https://stat.ethz.ch/R-manual/R-patched/library/stats/html/Fdist.html)
definitions for the direct-tail identities. This is bounded numerical evidence,
not verification of every possible floating-point magnitude or ANOVA design.

## Workspace, rendering and distribution matrix

| Surface | Current evidence | Remaining work |
| --- | --- | --- |
| CSV/TSV import and export | Independent CSV writer in `data-roundtrip-fuzz`, fixed hostile inputs, raw-cell identity | Longer mutation sequences involving import/append/reshape and declared missing codes |
| Computed/edit/filter/exclusion history | `workspace-sequence-check`: 216 edits with row/column insertion, deletion, duplication, renaming, movement, paste growth, formula cycles and recovery; checks every undo/redo and reopen boundary against an independent model | More combinations with import, reshape, declared missing codes and external recovery failures |
| Damaged project adoption | `data-integrity-check`: malformed table/metadata refusal preserves data, autosave, libraries and history | More malformed schemas and interrupted-save/recovery scenarios |
| Storage/quota and recovery | `hardening-dom-check`, `autosave-honesty-check`, lifecycle/recovery probes | Installed-browser private-mode, quota and interrupted-write tests |
| Backward compatibility | `corpus-compat-check`, one frozen 3.1.1 corpus pair | Add the new release's real frozen files and broader historical/feature fixtures |
| Axes, labels and chart interactions | Shared-engine geometry/axis battery and standalone feature probes | Representative human review at extreme ranges, narrow widths and dense layouts |
| SVG/PDF/raster export | Independent R fit/geometry probes; XML-safe character and workflow checks; accessibility, hover-cleanup, layout and image probes; native macOS PDF sample review | Broaden export/font/layout combinations and supported external viewers; see [XML export validation](XML-EXPORT-VALIDATION.md) |
| Role-picker accessibility | `axe-state-check` exposed partly covered active role controls; neighboring role cards are now inert while a picker is open; source and portable audits/keyboard checks pass | Manual assistive-technology acceptance using the existing [AT checklist](../standalone/AT-CHECKLIST.md) |
| Browser coverage | Primarily Chromium; a targeted WebKit probe exists | [Browser checklist](../standalone/BROWSER-CHECKLIST.md) on supported Safari/Firefox/Edge versions; Chromium automation is not installed Edge verification |
| Desktop wrapper | Existing `electron-check` and eyedropper probe use isolated profiles | Install/reopen/export/upgrade checks of signed/notarized Mac and Windows release installers |
| Jamovi | Real analysis-generated HTML, source/minified shared engine tests, package content checks | Install the final platform-specific modules in supported Jamovi versions and run a known-answer project |
| Hosted/portable bytes | Local `artifact-parity-check`; post-deployment `production-parity-check` exists | Verify the live deployment after authorized publishing; local builds are not proof of deployed content |

## Release acceptance

1. Resolve every required numerical/coverage discrepancy and finish the named
   methodology reviews. An unexpected missing reference or skipped required
   test is a failure, including failures in the verifier itself.
2. Freeze the version and exact source commit. Rebuild and check the source,
   minified, portable, website and native artifacts; record their checksums.
3. Run the mandatory automated gates with all dependencies installed. Record
   test versions, seeds, comparison coverage and explicitly undefined cases.
   Development runs with optional skips cannot serve as full release evidence.
4. Complete the native-installation, browser, export and human visual checks
   above on those artifacts. Record platform/runtime versions and outcomes.
5. Keep the validation record, numerical change notes, frozen project corpus,
   and any accepted limitations with the release evidence. Publish only after
   the required checks have passed, then verify the deployed bytes.

An independent statistical reviewer should examine the analysis contracts and
known-answer fixtures, particularly ANOVA designs, missing-data handling,
comparison families and effect sizes. Matching code implementations cannot
alone settle methodological correctness.

## Local evidence from this pass

Runtime: R 4.4.3, jsonlite 1.9.1, jmvcore 2.6.3, mvtnorm 1.3.3,
Node 20.20.0, Playwright 1.62.1, axe-core 4.11.0, Python 3.9.6,
SciPy 1.13.1 and NumPy 2.0.2. These are local test versions, not claims about
the eventual CI runner or installed release environments.

Development checks were resumed after failures were corrected and generated
assets refreshed. This combined local evidence does not replace the single
clean run on the frozen release commit required above.

- SciPy versus R, seed 20260905: **2,692 comparisons passed**, 134 group datasets,
  32 correlation datasets; seven explicitly accounted-for undefined cases.
- Numerical and distribution-shape unit comparisons on those references:
  **8,459 passed**, including 84 new checks of constant samples in both cores.
- The rebuilt portable app passed **52 checks** on the newly found constant-data
  boundary fixture. The deeper browser replay passed **8,942 checks with zero
  failures**, using the 134 group datasets and 32 correlation datasets above.
- Checker guards: **24 passed**. Declaring unavailable references explicitly
  leaves all generated baseline reference values unchanged.
- Workspace model, seed 20260905: **1,142 assertions passed on source and 1,142
  on portable**, each with 90 edits, 30 undo/redo pairs and six save/reopen/reload
  cycles. This does not cover arbitrary operation sequences.
- All seven module payloads, now including the cubic-fit cases: **7,665
  comparisons passed on source and 7,665 on portable**. Five ellipse-checker
  calibration/invalid-input guards passed in each run.
- Shared-engine required source and minified gates: **both passed**, each
  including the detailed statistical-method probe and 1,185 transport checks.
  The initial separate minified method run
  exposed a probe reading a renamed private copy callback; the probe now tests
  the real copy action through its clipboard boundary, and its rerun passed.
- Complete standalone gate: preflight passed; the first feature pass stopped
  because axe-core was missing. After installation, its accessibility audit
  found the role-picker issue above. That fix passed on source. The marshal
  freshness check then required the regenerated templates noted above. The
  source feature battery and subsequent numerical gate passed after those
  corrections. All **151 portable feature probes** then passed, followed by
  both module-payload comparisons, three transport checks, level-order checks
  and repeated-measures panel checks. The continuation exited **0** with
  **`STANDALONE VERIFY: ALL GREEN`**. Together with the completed source probes
  and targeted follow-up regressions, the local battery is complete; this was
  a resumed development run, not the frozen-release run required above.
- Source numerical browser gate: **1,591 checks passed**; formula parity:
  **238 checks passed on source and 238 on portable** after the formula-engine
  correction. The formula unit suite also passed, including its 81 new boundary
  checks. At the exact largest double, R's own SD calculation overflowed; those
  direct unit cases use the mathematical constant-sample identity. R browser
  references use finite, usable boundary values up to 1e306.
  Local Electron wrapper and eyedropper probes passed.
  These development-wrapper checks do not certify signed release installers.
- Corpus freezing was exercised in an isolated temporary corpus: a new pair
  was created, a complete existing pair retained identical SHA-256 checksums,
  and a partial pair failed with a nonzero exit.
- Corrected source and portable contrast probes: all five calibration cases
  passed in each, with no failing styles in 355 text measurements per build
  across start, chart and data views. This is a sampled color check, not a
  full accessibility sign-off.
- Visual spot-check of portable start, chart, data and statistics views at
  1440 × 1000 found no obvious clipping or layout defects in those views.
  The sample's three displayed Welch t/df/p results and Cohen d values matched
  a separate R calculation at display precision. This does not cover the full
  rendering/export matrix.
- A sample SVG/PDF/PNG/JPG export was inspected. SVG bar coordinates matched
  independently calculated means; PDF text extraction retained the labels,
  and macOS PDFKit rendered the chart with the intended bold axis titles.
  Poppler's initial font substitution differed because its bundled font
  configuration was incomplete; the PDF itself correctly specified the bold
  font. This one-chart spot-check is not general font/export acceptance.
- LOESS diagnostic: `x = seq(0, 5, length.out = 31)`,
  `y = sin(x) + 0.12 * cos(seq_along(x) * 2.4)`, degree 2, span 0.75,
  100 prediction points. The standalone curve differed from R's default
  interpolated curve by at most **0.0172661**. This establishes a parity
  limitation, not which smoothing convention is preferable. On this fixture,
  R's **direct** LOESS matches within **7e-15**. A further 24-case diagnostic
  (n = 20, 30, 31, 40, 41, 60, 61, 100; spans 0.5, 0.75, 1) isolated a second
  convention: rounding the neighbor count instead of flooring it. An isolated
  diagnostic variant using floor matched R's direct curves within **2.3e-14**
  on those cases; the shipped code was not changed. Permanent tests still need
  tied x values, irregular spacing, boundary spans and conditioning cases.
  The standalone
  payload does not include LOESS confidence intervals; unused internal band
  approximations are not reported to users. Cubic OLS was checked on the same
  data. This diagnostic does not replace a permanent fit-validation suite.
  The later `loess-direct` suite and correction supersede this diagnostic's
  open implementation work; its historical results are retained here.
- GitHub execution, native installer acceptance and deployment verification
  have **not** been completed by this local pass.

## Follow-up regression and tail validation

The next local pass corrected the four issues described in the numerical
ledger: Jamovi LOESS interval df, saturated-model confidence bands, polynomial
unit sensitivity and prematurely zero t/F probabilities. The shared
incomplete-beta calculation now uses a tighter convergence threshold.

- **84 fit cases passed** on the development page and rebuilt portable app,
  with **108,826 checks per build**. These include the R application payload,
  independent references, standalone/shared helper calculations, actual
  curve/band presence and observed-range SVG vertex geometry. See the
  [regression contract](REGRESSION-VALIDATION.md) for precise scope.
- **Eight fit-verifier guards passed.** Missing cases/references, empty bands,
  non-finite values, wrong intervals and invented zero-df bands are rejected.
- **588 tail checks plus seven checker guards passed** against R on both
  source and the compiled minified statistical core;
  **570 independent SciPy comparisons passed**. These use relative error,
  including probabilities below 1e-200 and directional alternatives.
  The compiled check uses Acorn 8 to locate the statistical object and its
  renamed tail function; it tests the raw numbers beneath display formatting.
- All seven module payloads still match R: **7,665 comparisons per build**.
  The affected standalone polish probe passes on development and portable.
- Deep reference checks, seed 20260905: **8,459 numerical/shape checks** and
  **2,692 SciPy comparisons** passed, with the same seven explicitly undefined
  cases. All 24 general reference-checker guards passed.
- Source and minified assets, standalone templates, portable download and
  local hosted assets were rebuilt. The artifact-parity check passed.
- The complete shared-engine source and minified gates both passed, including
  statistical tables and transport precision. The deeper portable browser
  replay passed **8,942 checks with zero failures**, seed 20260905, across
  134 group datasets and 32 correlation datasets.
- The updated release-pipeline contract, JavaScript/Python/Bash syntax and
  workflow YAML checks passed. GitHub itself was not run remotely. The full
  151-feature standalone battery from the earlier pass was not repeated;
  this follow-up used the affected numerical/rendering/polish checks above
  and both complete shared-engine gates.

Evidence and failure reproductions are retained locally under
`planning/release-validation-2026-09-05/regression-followup/`, with SHA-256
checksums. This is uncommitted development evidence; it does not replace the
frozen-release run, native-package acceptance or independent method review.

## Direct LOESS and structural workspace follow-up

The next local pass corrected standalone/shared LOESS neighborhood rounding,
radius inflation above span one, unit-sensitive normal equations, and silent
weighted-mean/partial-curve fallbacks. Invalid fits now clear an old preview;
literal group labels such as `__proto__` no longer break preview grouping.
Approximate JS confidence bands were removed. Jamovi's final interpolated R
curve and corrected interval retain their existing convention.

- **75 direct LOESS cases passed**, with **64,852 checks per build** on the
  development page and rebuilt portable app. These check numerical values,
  explicit unavailability, SVG vertices, the actual compiled preview and
  unusual group labels. The largest observed absolute difference from R in
  the 70 available core fixtures was **8.89e-15**; that is an observed error
  over this finite roster, not a general error guarantee.
- **Eight LOESS-verifier guards passed**, rejecting missing cases, wrong
  conventions, suppressed availability, incomplete/non-finite/wrong curves,
  and singularity warnings in a supposedly valid reference.
- The expanded workspace model passed **29,650 assertions per run**, with
  **216 edits, 216 undo/redo pairs and 18 save/reopen/reload cycles**. Seed
  20260905 passed on both builds, 20260906 on development and 20260907 on
  portable. It adds structural operations, row identity checks, cell
  exclusions, dependency renames and cycles. No additional workspace defect
  was found in these runs. See [the contract](WORKSPACE-VALIDATION.md).
- Existing regression references still passed: **84 cases and 108,826 checks
  per build**. Fit controls, polish, data commands, project integrity, reshape
  and all seven module payloads also passed on both builds; module parity
  remains **7,665 comparisons per build**.
- The compiled tail checker still passed **588 numerical checks and seven
  guards**. The new LOESS suite is required in CI and the local release gate.
  Source/minified assets, templates, portable download and local hosted
  assets were rebuilt; artifact parity, release-pipeline checks and syntax
  checks passed.
- **Both complete shared-engine gates passed**, on source and final minified
  bundles, including statistical tables, data transport, chart interactions,
  export state, serialization and snapshot recovery. No required dependency
  check was skipped.

Evidence is retained in
`planning/release-validation-2026-09-05/loess-workspace-followup/`, including
before-fix reproductions, R references, numerical error measurements and
completed test logs. The full 151-feature standalone battery was not repeated
in this pass; targeted probes and the shared-engine gates provide this pass's
regression evidence. Native packages, remote CI, deployed bytes, a frozen
release snapshot and independent method review remain pending.

## Regression export follow-up

This local pass corrected straight-tangent polynomial extensions, incorrectly
extended confidence-band edges, literal scatter-group suppression, and hidden
SVG vertices enlarging cropped export canvases. Boundary testing also reproduced
and corrected a tick-generation hang when a positive increment rounds away at
a nonzero axis offset. The [numerical ledger](../NUMERICAL-CHANGES.md) records
these changes as unreleased.

- **45 independent R export fixtures** now exercise degree 1–3 curves and
  fitted-mean bands on standalone live/exported SVG and R-supplied live/exported
  SVG, including cropping, re-entry, groups, hidden fits, literal names and
  two-panel geometry. The final development and portable builds each passed
  **960,534 checks**, including cropped PDF/PNG conversion and a real compiled
  narrow-axis rendering check with a deadline.
- The extension unit suite passed **66,429 checks**, with eight model/refusal
  guards. Eight geometry-verifier controls, seven exact clipping fixtures and
  eight tick-loop fixtures also passed. These tests are required in CI and the
  local standalone release gate.
- The existing 84-case fit suite retains every original vertex comparison by
  setting display limits to enclose the independent curve and interval.
  The 75-case direct LOESS suite likewise displays every expected vertex;
  clipping is assessed separately. These changes preserve full vertex coverage
  after the renderer began discarding invisible geometry.
- Three portable PDF exports were rasterized, visually inspected and compared
  with native PNG exports at 192 dpi. Page sizes stayed bounded and selected
  regression-colored pixels agreed within two pixels at greater than 99.99%
  bidirectional coverage. This is sample conversion evidence, not a complete
  font, platform or export-layout certification.
- Fit controls, polish, export accessibility and local artifact parity passed
  on development and portable builds. Source, minified renderer, templates,
  portable HTML and local website assets were rebuilt.
- **Both complete shared-engine gates passed**, on the final source and
  minified bundles, including statistical tables, exact data transport,
  interactions, export state and snapshot recovery. No dependency check was
  skipped. The existing overlapping pie-slice hover probe reports a weak
  assertion because its hover did not arm; this limitation is retained in
  the evidence rather than treated as complete hover-state coverage.

Evidence and reproduction scripts are retained in
`planning/release-validation-2026-09-05/fit-export-followup/`. Its artifact hashes
identify the local bytes tested. The opposite-slope faceting reproduction is
included for both hosts; that population mismatch was still a release blocker at the end of that pass
and is corrected by the 2026-09-06 follow-up below.
This pass did not repeat the complete 151-feature standalone battery, install
native packages, run remote CI, publish a release or verify a deployed website.


## Facet population follow-up — 2026-09-06

The R analysis, standalone payload builder, shared compiled fit preview and
renderer now agree on facet × group populations. Fits, fitted-mean intervals,
ellipses and standardized linear residuals no longer pool panels. The original
opposite-slope reproduction is corrected. Unavailable cells cannot inherit
another panel's curve, and legacy pooled fit payloads are recomputed before
display. Undefined R r/p values now display as unavailable instead of crashing
or turning a null p into `p < .001`. Nonlinear views explicitly label their
separate linear equation/R² statistics.

The new independent R suite has 56 cases covering four model types, opposite
trends, unequal n, missing data, sparse/saturated/singular cells, one panel,
hidden panels, literal labels, 80/99% confidence levels and entirely missing
group/facet values. It checks model values, intervals, statistics, residuals,
covariance ellipses, compiled legacy previews and actual SVG exports. Eight
negative controls require it to reject corrupted or incorrectly scoped data.
The prior 45-case export suite now uses separate facet × group reference fits.

Final development and portable focused runs each passed **444,633 checks across
56 facet fixtures**. Their updated export suites each passed 45 cases and
960,630 checks; observed-range fits passed 84 cases and 108,826 checks; direct
LOESS passed 75 cases and 64,856 checks; all seven module payloads matched real
R output in 9,309 comparisons per build. The panel suite also checks every
printed n/r/p/equation/R² field, with relative tolerances for small p-values.
Fit controls, polish, export accessibility and source/artifact parity passed.

Both complete shared-renderer gates passed on the final source and minified
bundles, including statistical tables, exact data transport, interactions,
export state and snapshot/recovery checks. No required dependency was skipped.
The existing overlapping pie-slice hover probe still reports a weak assertion
because its hover did not arm; that is retained as a coverage limitation.

Three representative portable charts (opposite linear trends, grouped cubic
fits and unequal-n LOESS panels) were exported to SVG/PNG/PDF. Their PDFs were
rasterized at 192 dpi and visually inspected; selected curve-colored regions
agreed with native PNGs at greater than 99.9% bidirectional coverage within two
pixels. This sample check does not certify every font, layout or platform.

**Additional export edge case recorded in this pass:** an adversarial label containing raw
U+0001 (prohibited by XML 1.0) causes SVG export preparation to fail. This was
found while testing composite label identities. The numerical grouping helper
is tested with such keys, while exported-label fixtures use printable labels.
It was not counted as a passing export case in that pass. The following XML
export correction addresses it; see [XML-EXPORT-VALIDATION.md](XML-EXPORT-VALIDATION.md).

Evidence is retained under
`planning/release-validation-2026-09-06/facet-fit-followup/`. All changes and
builds are local and unreleased. This pass does not replace final native
installer/installed-Jamovi checks, the full standalone release gate on frozen
artifacts, deployed-byte verification or independent methodology review.

## XML export follow-up (2026-09-06)

The control-character failure is corrected in the shared renderer and standalone
export workflows, including the separate layout-snapshot route discovered by
the new tests. Unsupported characters display as readable escapes; tables,
model identities, numeric payloads and editable strings retain their originals.
The detailed contract is in [XML-EXPORT-VALIDATION.md](XML-EXPORT-VALIDATION.md).

- All 65,536 individual UTF-16 code units and 3,072 supplementary pairs passed
  the character-boundary checks. The browser XML parser rejects the original
  control fixture and accepts the prepared clone; original attributes recover
  exactly from metadata without changing the live DOM.
- **34 rendered cases passed** on the unminified renderer (**70,437 checks**),
  portable build (**70,436**) and generated local website (**70,436**). These
  include exact group/facet identities, live/exported geometry, per-cell n,
  labels, notes, captions, descriptions, data preservation and saved raw data.
  Single/multiline editors, Notebook captures and layout snapshots also pass.
- Two real R-analysis/Jamovi XML fixtures passed in **both complete shared
  gates**, which ran sequentially and each exited **0**. The previously
  recorded overlapping-pie hover assertion remains weak; no dependency
  checks were skipped.
- The independent R facet oracle passed again on the final portable build:
  **56 cases, 444,633 checks, zero failures**. Existing export-accessibility,
  layout-text, Notebook fidelity/records, hardening, artifact-parity and
  release-pipeline checks passed.
- Chart and layout SVG/PNG/PDF samples were inspected. Native macOS PDF
  rasters preserve text styles and readable escapes; selected plotted curve
  regions have complete bidirectional coverage within two pixels of PNGs.
  This does not claim complete pixel equality for text. The initial Poppler
  font-substitution discrepancy was isolated to that QA setup: PDF text uses
  the correct bold/italic fonts and native rendering agrees. Ordinary ASCII
  SVG/PNG files are byte-identical before/after, as are the rendered PDFs.

Evidence is retained under
`planning/release-validation-2026-09-06/xml-export-followup/`, with artifact and
verifier checksums. All work remains local and unpublished. Release-wide
sign-off still requires the full standalone gate on frozen artifacts, final
native/installed-Jamovi and supported-browser acceptance, deployed-byte checks
and the outstanding independent methodology reviews.

## Complete standalone gate and rendering follow-up (2026-09-06)

The complete standalone suite finished with **exit 0** against a frozen local
copy of the preceding numerical/XML corrections. All **151 feature probes**
passed on both development and portable pages. All 698 recorded input files
still matched their SHA-256 hashes after the run. The suite used the locked
Electron **43.4.1** runtime, including its wrapper and synthetic-frame
eyedropper smoke tests, and every required R/SciPy tier.

The run included 29,650 workspace-sequence assertions per build, 7,756 rendered
statistics checks, 7,240 direct statistics checks, 238 computed-formula checks,
2,332 third-reference comparisons and 570 additional SciPy tail comparisons.
All seven modules' R payloads passed 9,309 comparisons per build. Regression
boundaries, direct LOESS, faceted fits, actual regression exports, exact transport,
category-order conventions and repeated-measures panels also passed.
Undefined cases and tolerance contracts remain explicit in the individual probes.

Stronger coverage and visual inspection during that run exposed two additional
rendering defects, now corrected locally:

- An invisible legend drag target acquired delayed geometry and expanded saved
  figure bounds, making an unchanged chart appear to have changed. Measurements
  and exported clones now exclude that interaction geometry. The strengthened
  Notebook probe requires all seven modules, a fresh valid capture after each
  echo, byte-identical recapture, unchanged tables and usable live drag targets.
  It also verifies a legend moved beyond the original canvas in chart and layout
  exports. Both standalone builds pass.
- Layout SVGs lost the source chart's inherited font and fell back to Times;
  layout panels could also inherit the interface font. Snapshot metadata now
  carries the source font into displayed/exported panels without changing the
  historical snapshot bytes used for Notebook signatures. A new mandatory test
  checks every label against three differently styled source charts, both
  initially and after project save/reopen. Both builds pass; raw data, typed
  values, case IDs and every other original table field remain unchanged.

Both complete shared-renderer gates passed on the final renderer. **All 22
affected standalone checks** passed after both corrections, including layout
workflows, drag/zoom, Notebook records, export accessibility and 34 XML export
cases per build. Independent R regression-export checks also passed again:
45 cases and 960,630 checks per build. The rebuilt website/portable artifacts
match their sources; manifest/icon checks and real localhost HTTP checks pass.

The desktop CI job now uses Node 22 and `npm ci --engine-strict`, matching the
locked toolchain's minimum. A clean Node 22.23.2 installation passed; a Node 20
negative control failed with `EBADENGINE`. The pipeline contract enforces this.

**Evidence scope:** the full 151-probe run belongs to the earlier frozen copy.
It is not a full standalone run on the subsequent rendering corrections; the
separate final-renderer and affected checks cover those changes. The mandatory
standalone roster now contains 152 probes. Detailed logs, seeds, negative
controls, reference fixtures, images and hashes are under
`planning/release-validation-2026-09-06/standalone-gate-followup/`.

The optional `superb` package was absent (formula pin only), and the shared
suite's previously recorded overlapping-pie hover assertion remains weak.
These are not positive independent-package/interaction coverage. Release
approval still requires a clean versioned commit and fresh mandatory gates on
its exact artifacts, independent methodology review, final native and installed
Jamovi acceptance, supported-browser/assistive-technology checks and deployed
artifact verification after authorized publication. Nothing was published here.


## ANOVA precision and independent-package follow-up (2026-09-06)

The next numerical audit found and corrected three precision problems:

- Two-/three-factor ANOVA could lose small residual SS by subtracting large
  fitted sums, refusing a valid result or substantially changing F.
- Pure and mixed repeated-measures ANOVA could lose small within-subject error
  and perturb Greenhouse–Geisser epsilon during subtraction of subject/occasion
  sums and covariance entries. Direct residual calculations now avoid that.
- The R crossed-factor repeated-measures reshape rounded numeric inputs by
  converting them to text. Numeric observations now reach the renderer exactly.

The new mandatory `standalone/verify/anova-run.sh` compares **75 designs in five
paths**: source and compiled standalone, portable compiled, and real R analysis
output with source and compiled rendering. All pass: **16,990 application checks**,
plus reference-contract and invariance checks. It uses `car::Anova` and an
independent 80-digit Decimal calculation with SciPy F survival probabilities.
Fourteen negative controls require complete references, correct numeric inputs,
all valid results and honest refusals, including when both references would
otherwise agree on an erroneous refusal.

The final checker rejects the saved old renderer in five cases, one per model
family. The R-host precision regression also failed before its correction.
Exact original-observation comparisons, unchanged-data checks, raw calculations
and displayed Sigma-table values are required. Three representative portable
tables were inspected visually. The release CI job installs `car` as a test
dependency and requires this suite; it adds no runtime application dependency.

The tolerance is 3e-7 relative for application statistics, with only a subnormal
absolute floor. The measured largest relative errors were 4.64e-9 for F and
1.74e-7 for p (near 1e-293). The double-precision package alone has a documented
1e-5 tail tolerance for near-perfect fixtures; the application still meets the
stricter 80-digit-reference comparison. See [ANOVA validation](ANOVA-VALIDATION.md)
for hypotheses, transformations, refusal contracts and scope.

Both complete required shared-renderer gates (`scripts/verify/run.sh` and
`--min`) passed on the final production files. Artifact parity, release pipeline
contracts and syntax checks passed too. The existing overlapping-pie hover weak
assertion remains disclosed; optional `--extras` suites were not rerun here.

Evidence is in `planning/release-validation-2026-09-06/anova-package-followup/`.
This is local, untagged verification. The earlier full standalone sweep belongs
to its earlier frozen candidate; it is not counted as a new full standalone run
for these ANOVA changes. Final versioned native and installed Jamovi acceptance,
supported-browser/accessibility checks and independent methodology review remain.
