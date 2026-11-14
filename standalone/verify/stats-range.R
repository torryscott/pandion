# Studentized-range references for the widget's ptukey (Tukey HSD and
# Games-Howell adjusted p), across the whole range of df the app can
# produce: from a group of two (df near 1) to thousands of rows.
#
# Three routes, all independent of the widget's code:
#   exact : k = 2. The range of two means is a t statistic, so
#           P(Q > q | 2, df) = 2 * pt(-q / sqrt(2), df): closed form at
#           every df. With two groups the adjusted p IS the t test p.
#   mix   : k > 2. The chi mixture of R's df = Inf range CDF, integrated
#           piecewise between quantiles of S = sqrt(chisq(df)/df) and of
#           the range itself, so neither the narrow spike at large df nor
#           the far tail at small df is missed. R's finite-df ptukey is
#           not used: it returns NaN below df 2 and misreports extreme
#           tails. integrate() is told not to stop on its own roundoff
#           warnings (a sliver next to zero cannot meet a relative
#           tolerance); instead the upper tail and the CDF are integrated
#           separately and must sum to one, or the script stops.
#   normal: 8 to 50 groups at df = Inf, the range of k standard normals
#           integrated directly from its definition with pnorm. The step
#           of the widget's inner integral depends on k and on nothing
#           else, so this is where many groups are held.
# mix stops at 6 groups because R's df = Inf kernel loses accuracy with k
# (within 6e-11 of SciPy to 6 groups, 1.5e-9 at 10, 3e-7 at 50); SciPy
# (stats-range-thirdref.py) checks every row of all three families.
args <- commandArgs(trailingOnly = TRUE)
out <- if (length(args)) args[[1]] else "/tmp/pandion-stats-range.json"
dfs <- c(1, 1.3133734984249466, 1.5, 2, 3, 5, 10, 30, 100, 150, 200, 447,
         598, 999, 1000, 1001, 1197, 5000, 50000)
qs <- c(.5, 1, 2, 3, 3.5, 4, 5.800019621705907, 8, 12, 25)
ks <- c(3, 4, 5, 6)
big_ks <- c(8, 10, 20, 50)
ws <- c(1, 2, 3, 4, 5, 6, 8)
fS <- function(s, df) dchisq(df * s * s, df) * 2 * df * s
mix <- function(q, k, df) {
    lo <- c(1e-15, 1e-12, 1e-9, 1e-6, 1e-3, .05, .25, .5, .75, .95)
    hi <- c(1e-3, 1e-6, 1e-9, 1e-12, 1e-15, 1e-18)
    bs <- c(sqrt(qchisq(lo, df) / df), sqrt(qchisq(hi, df, lower.tail = FALSE) / df))
    bw <- suppressWarnings(qtukey(c(1e-8, 1e-3, .1, .5, .9, .999), k, Inf)) / q
    br <- sort(unique(c(0, bs, bw[is.finite(bw) & bw > 0 & bw < max(bs)])))
    tail <- 0; cdf <- 0
    for (i in seq_len(length(br) - 1L)) {
        piece <- function(lower) integrate(
            function(s) fS(s, df) * ptukey(q * s, k, Inf, lower.tail = lower),
            br[i], br[i + 1L], rel.tol = 1e-11, abs.tol = 1e-17,
            subdivisions = 500L, stop.on.error = FALSE)$value
        tail <- tail + piece(FALSE); cdf <- cdf + piece(TRUE)
    }
    if (!is.finite(tail) || abs(tail + cdf - 1) > 1e-9)
        stop(sprintf("range reference failed its own check at q=%g k=%g df=%g", q, k, df))
    tail
}
range_inf <- function(w, k) {
    f <- function(z) dnorm(z) * (pnorm(z + w) - pnorm(z))^(k - 1)
    br <- c(-12 - w, -w - 2, -w, -w / 2, 0, 2, 12)
    tot <- 0
    for (i in seq_len(length(br) - 1L))
        tot <- tot + integrate(f, br[i], br[i + 1L], rel.tol = 1e-13,
                               abs.tol = 1e-18, subdivisions = 500L,
                               stop.on.error = FALSE)$value
    p <- 1 - k * tot
    # R's own kernel is the coarse cross-check (3e-7 at 50 groups).
    if (!is.finite(p) || abs(p - ptukey(w, k, Inf, lower.tail = FALSE)) > 1e-6)
        stop(sprintf("normal-range reference failed its own check at w=%g k=%g", w, k))
    p
}
exact <- list(); mixed <- list(); normal <- list()
for (df in dfs) for (q in qs)
    exact[[length(exact) + 1L]] <- list(q = q, df = df, p = 2 * pt(-q / sqrt(2), df))
for (k in ks) for (df in dfs) for (q in qs)
    mixed[[length(mixed) + 1L]] <- list(q = q, k = k, df = df, p = mix(q, k, df))
for (k in big_ks) for (w in ws)
    normal[[length(normal) + 1L]] <- list(q = w, k = k, p = range_inf(w, k))
writeLines(jsonlite::toJSON(list(schemaVersion = 1L, exact = exact, mix = mixed, normal = normal),
    auto_unbox = TRUE, digits = I(17)), out)
cat("RANGE REFERENCES:", length(exact), "exact two-group rows,", length(mixed),
    "mixture rows,", length(normal), "many-group rows at df = Inf\n")
