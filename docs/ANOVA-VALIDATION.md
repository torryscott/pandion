# ANOVA validation

This verification covers the shared renderer's two- and three-factor Type III
ANOVA, one-factor repeated-measures ANOVA, and mixed ANOVA with one or two
between-subject factors. It was added during the 2026-09-06 release audit.
It provides bounded numerical evidence, not a proof for every possible dataset.

## Independent calculations

`standalone/verify/anova-reference.R` calls the installed `car::Anova` package:
sum contrasts and Type III hypotheses for factorial models; multivariate linear
models with an occasion factor for univariate repeated-measures tests and
Greenhouse–Geisser corrections. It does not source application code. The
[car documentation](https://search.r-project.org/CRAN/refmans/car/html/Anova.html)
specifies these model and contrast conventions. Sequential default `aov` tables
are not interchangeable with this reference for unbalanced designs.

The reference centers the response and scales it in residual-SD units before
calling the package, then converts sums of squares back to the original units.
The package has an absolute residual-deviance guard that would otherwise reject
small-unit data. Within-subject tests use a separate subject-centered fit to
remove an irrelevant subject intercept before covariance calculations.
These transformations preserve the tested hypotheses.

`anova-precision.py` adds a separate calculation using 80-digit Decimal
arithmetic. It tests equal marginal cell means with Wald contrasts and computes
within-subject error and epsilon from orthogonally centered observations.
It uses neither the application's normal-equation model fits nor R's QR fits.
SciPy supplies F survival probabilities. Inputs are the exact binary64 values
used by the browser, checked against independent R hexadecimal representations.

Every successful reference requires all expected effects and finite F, p,
degrees of freedom, epsilon, partial eta-squared, effect SS and error SS.
The application is compared to the high-precision reference at 3e-7 relative
error, with only a 16-subnormal-unit absolute floor. Tiny p-values cannot pass
as zero merely because they are below a conventional absolute tolerance.
The same tolerance compares both references, except for package p-values on
1e-8 residual fixtures: there the package comparison allows 1e-5 relative error.
This exception does not relax the application's high-precision comparison.

## Coverage

The fixed default seed is 20260907. Seventy-five cases comprise five model
families and fifteen variants: balanced, unbalanced, missing values, shuffled
rows, reversed factor/occasion order, small units, large units, large response
offset, tiny residuals, exactly zero residuals, constant responses, missing
cells, one observation/subject per cell, two occasions and four occasions.
The last two variants repeat the ordinary design for between-subject models.

The suite verifies unit, row-order and level-order invariance in both references.
Large-offset cases retain the actual quantization of input doubles; they are
compared on identical inputs, not against an unrealistically unrounded dataset.
Missing observations are listwise excluded for repeated-measures inference.
A missing crossed cell and zero residual degrees of freedom are refused;
exactly zero error/constant data must not yield finite inferential results.
A whole lost level of the single between factor instead leaves a valid smaller
mixed model. Mixed models retain the application's requirement of at least two
complete subjects per between-subject cell. Refusal cases pin these structural
contracts; no package result is asserted for them.

`anova-package-check.mjs` exercises actual visible-chart population assembly
and the Omnibus dispatcher. It checks the original observations exactly,
requires calculations to leave the data unchanged, compares raw results, then
opens the Sigma panel and checks effect labels, row order, displayed F, degrees
of freedom, p formatting and partial eta-squared. Raw factorial SS/error SS and
repeated-measures epsilon are also compared. Display tolerances account for
rounding separately from the raw-number checks.

Test-only observers capture the private functions, including functions inlined
by the compiler. All original function-body bytes are preserved; no production
test hooks are shipped. The selected source or compiled file's SHA-256 is logged.
The portable check requires an exact embedded compiled bundle. R fixtures come
from real `plotbuilder` and `rmplotbuilder` calls, including the crossed-factor
registry for two between-subject factors. They are not an installed Jamovi test.

Fourteen negative controls reject absent cases, mismatched seeds, rounded inputs,
changed model dimensions, duplicate effects, wrong statistics/degrees of freedom,
missing results, false refusals (including matching false refusals in both
references) and erased small probabilities.

## Corrections found

- Factorial full-model residual SS used subtraction of large sums, which could
  erase small real residuals. Full-model SS now sums within-cell residuals;
  reduced-model SS sums fitted residuals directly, with an origin shift first.
- Repeated-measures error and epsilon similarly suffered cancellation between
  subject/occasion sums and covariance entries. Occasion differences and direct
  double-centered error vectors now retain small residual variation. Epsilon's
  scale cancels before covariance entries are squared.
- The R crossed-factor repeated-measures reshape formatted numeric observations
  as text and parsed them again. Numeric values now bypass that rounding step;
  nonnumeric inputs retain label-based conversion.

These are shared numerical and R transport corrections; existing exported
figures retain their historical numbers. See `NUMERICAL-CHANGES.md`.

## Reproduction and limits

With R `car`, `jmvcore`, `R6`, `jsonlite`; Python `scipy`; Node `acorn` and
Playwright/Chromium available:

```sh
bash scripts/minify-widget.sh --check
bash standalone/build-dist.sh
bash standalone/verify/anova-run.sh
```

The runner fails on missing dependencies and checks development/source,
development/compiled, portable/compiled, R output/source and R output/compiled.
It is mandatory in the local release verification and reusable statistics CI
job. `PS_ANOVA_VERIFY_OUT` selects its evidence directory. `PS_ANOVA_SEED` selects
another reproducible fixture seed; all default release evidence records its seed.

Final run results and hashes are recorded in
`planning/release-validation-2026-09-06/anova-package-followup/` and the
release-validation matrix. The full shared-renderer source and compiled suites
are also required after these changes. This audit does not establish all
statistical methods, arbitrary factor counts, all numeric extremes, multiple
within-subject factors, installed native/Jamovi packages, or cross-browser visual
acceptance. Independent methodology review and final artifact acceptance remain
release work.
