# stats-fuzz.R - reference generator for the statistics parity fuzzer.
#
# Generates SEEDED random datasets plus a fixed roster of boundary cases,
# computes the reference statistics with BASE R (no packages), and writes
# one JSON file for stats-fuzz-check.mjs to replay against the rendered
# widget. The seed rotates by day (override with GB2_FUZZ_SEED) so every
# gate run explores new input territory while any failure is replayable
# from the seed the log prints first. GB2_FUZZ_N sets the random-dataset
# budget (default 12; a release --deep run can pass hundreds).
#
# Reference conventions mirror the widget's documented targets:
#   welch/student t.test, wilcox.test defaults (exact-vs-approx auto),
#   U reported both as R's W (= U1) and the displayed min(U1, U2),
#   one-way aov F, p.adjust holm/bonferroni/BH over the welch family,
#   Games-Howell via R's ptukey over per-pair Welch t/df,
#   cor.test with NO exact= argument (the jamovi-parity rule),
#   paired t.test + paired wilcox.test per RM occasion pair,
#   likert item-mean t CIs + Cronbach's alpha on the 1..k coding,
#   lm slope/R^2, the chi-square(2) confidence ellipse, MASS::kde2d,
#   quantile(type=7) box stats, bw.nrd0 KDE, and car::qqPlot's Q-Q band.
# Values ship raw at full precision; the JS side owns display tolerance.
# Consumers: stats-fuzz-check.mjs (browser replay), stats-unit-parity.mjs
# (source-extracted shape functions), stats-thirdref.py (scipy).

args <- commandArgs(trailingOnly = TRUE)
out_path <- if (length(args) >= 1) args[[1]] else file.path(tempdir(), "stats-fuzz.json")

seed_env <- Sys.getenv("GB2_FUZZ_SEED", "")
seed <- if (nzchar(seed_env)) as.integer(seed_env) else
    as.integer(format(Sys.Date(), "%Y%m%d"))
n_random <- as.integer(Sys.getenv("GB2_FUZZ_N", "12"))
set.seed(seed)
cat(sprintf("stats-fuzz seed=%d n_random=%d\n", seed, n_random))

`%||%` <- function(a, b) if (is.null(a)) b else a

num_or_null <- function(x) {
    if (is.null(x) || length(x) == 0 || !is.finite(x)) NULL else as.numeric(x)
}

safe <- function(expr) tryCatch(expr, error = function(e) NULL)

g1_skew <- function(v) {
    # Sample-adjusted SPSS G1 (the widget's Descriptives convention).
    n <- length(v)
    if (n < 3) return(NULL)
    s <- sd(v); if (!is.finite(s) || s == 0) return(NULL)
    m3 <- mean((v - mean(v))^3)
    g1 <- m3 / (mean((v - mean(v))^2))^1.5
    num_or_null(g1 * sqrt(n * (n - 1)) / (n - 2))
}

pair_refs <- function(a, b) {
    out <- list()
    w <- safe(t.test(a, b, var.equal = FALSE))
    if (!is.null(w)) out$welch <- list(t = num_or_null(unname(w$statistic)),
                                       df = num_or_null(unname(w$parameter)),
                                       p = num_or_null(w$p.value))
    s <- safe(t.test(a, b, var.equal = TRUE))
    if (!is.null(s)) out$student <- list(t = num_or_null(unname(s$statistic)),
                                         df = num_or_null(unname(s$parameter)),
                                         p = num_or_null(s$p.value))
    m <- safe(suppressWarnings(wilcox.test(a, b)))
    if (!is.null(m)) {
        u1 <- unname(m$statistic)
        u2 <- length(a) * length(b) - u1
        out$mwu <- list(U1 = num_or_null(u1), Umin = num_or_null(min(u1, u2)),
                        p = num_or_null(m$p.value))
    }
    out
}

cell_refs <- function(v) {
    n <- length(v)
    list(n = n,
         mean = num_or_null(mean(v)),
         sd = if (n >= 2) num_or_null(sd(v)) else NULL,
         se = if (n >= 2) num_or_null(sd(v) / sqrt(n)) else NULL,
         g1 = g1_skew(v))
}

box_ref <- function(v) {
    # The engine's _computeBoxStats: type-7 quantiles, 1.5 IQR Tukey
    # fences, whiskers at the extreme in-fence values CLAMPED to the
    # hinges (the ggplot2 range(hinges + non-outliers) equivalence its
    # comment documents). Consumed by stats-unit-parity.mjs.
    v <- v[is.finite(v)]
    n <- length(v)
    if (n == 0) return(NULL)
    q <- unname(quantile(v, c(0.25, 0.5, 0.75), type = 7))
    iqr <- q[3] - q[1]
    lof <- q[1] - 1.5 * iqr; hif <- q[3] + 1.5 * iqr
    list(q1 = q[1], med = q[2], q3 = q[3],
         wlo = min(min(v[v >= lof]), q[1]),
         whi = max(max(v[v <= hif]), q[3]),
         nout = sum(v < lof | v > hif))
}

kde_ref <- function(v) {
    # The engine's _computeKDEUncached, gaussian kernel: bandwidth is
    # R's bw.nrd0 (identical formula while sd > 0), density is the
    # definitional kernel sum mean(dnorm(x, v, h)) evaluated at the
    # engine's own trim-true grid x = min + (s/384)(max - min).
    v <- v[is.finite(v)]
    n <- length(v)
    if (n < 2 || !isTRUE(sd(v) > 0)) return(NULL)
    if (max(v) - min(v) < 1e-9) return(NULL)
    h <- safe(bw.nrd0(v))
    if (is.null(h) || !is.finite(h) || h <= 0) return(NULL)
    ss <- c(0, 64, 128, 192, 256, 320, 384)
    xs <- min(v) + (ss / 384) * (max(v) - min(v))
    ds <- vapply(xs, function(x0) mean(dnorm(x0, mean = v, sd = h)), 0)
    list(bw = h, s = ss, xs = xs, ds = ds)
}

epan_ref <- function(v) {
    # One alternative-kernel pin: epanechnikov scaled to sd = h
    # (R density()'s kernel convention, which the engine mirrors).
    v <- v[is.finite(v)]
    n <- length(v)
    if (n < 2 || !isTRUE(sd(v) > 0)) return(NULL)
    h <- bw.nrd0(v); a <- h * sqrt(5)
    ss <- c(64, 192, 320)
    xs <- min(v) + (ss / 384) * (max(v) - min(v))
    ds <- vapply(xs, function(x0) {
        u <- (x0 - v) / a
        mean(ifelse(abs(u) < 1, 0.75 * (1 - u^2) / a, 0))
    }, 0)
    list(bw = h, s = ss, xs = xs, ds = ds)
}

qq_ref <- function(v, level = 0.95) {
    # The Q-Q confidence band: robust type-7 quartile fit against
    # qnorm(.25)/qnorm(.75), then car::qqPlot's pointwise SE
    # |slope|/dnorm(z) * sqrt(p(1-p)/n) at z_crit = qnorm(1-(1-l)/2),
    # sampled at the engine's uniform 160-step z grid.
    v <- sort(v[is.finite(v)]); n <- length(v)
    if (n < 4 || !isTRUE(sd(v) > 0)) return(NULL)
    qs <- unname(quantile(v, c(0.25, 0.75), type = 7))
    ts <- qnorm(c(0.25, 0.75))
    slope <- (qs[2] - qs[1]) / (ts[2] - ts[1]); inter <- qs[1] - slope * ts[1]
    if (!isTRUE(abs(slope) > 0)) return(NULL)
    crit <- qnorm(1 - (1 - level) / 2)
    z0 <- qnorm(0.5 / n); z1 <- qnorm((n - 0.5) / n)
    rows <- lapply(c(0, 40, 80, 120, 160), function(s) {
        z <- z0 + (s / 160) * (z1 - z0)
        p <- pnorm(z)
        se <- abs(slope) / dnorm(z) * sqrt(p * (1 - p) / n)
        list(s = s, z = z, fit = inter + slope * z,
             top = inter + slope * z + crit * se,
             bot = inter + slope * z - crit * se)
    })
    list(n = n, slope = slope, inter = inter, crit = crit, rows = rows)
}

anova_ref <- function(groups) {
    y <- unlist(groups)
    g <- factor(rep(seq_along(groups), vapply(groups, length, 1L)))
    if (nlevels(droplevels(g)) < 2) return(NULL)
    # A zero-variance outcome makes F a 0/0 artifact: R's aov emits F = 1
    # with its own 'essentially perfect fit is unreliable' warning, scipy
    # refuses with NaN, and the widget refuses too. An unreliable number
    # is not a reference - emit none (the third reference surfaced this
    # seam on its first local run, Aug 29 2026).
    if (!isTRUE(sd(y) > 0)) return(NULL)
    a <- safe(anova(aov(y ~ g)))
    if (is.null(a)) return(NULL)
    list(F = num_or_null(a$`F value`[1]),
         df1 = num_or_null(a$Df[1]), df2 = num_or_null(a$Df[2]),
         p = num_or_null(a$`Pr(>F)`[1]))
}

dataset_refs <- function(groups) {
    # The payload ships numerics at 10 significant digits (jsonlite
    # digits = I(10); the standalone mirrors it), so the references are
    # computed on EXACTLY the values the widget receives.
    groups <- lapply(groups, function(v) signif(as.numeric(v), 10))
    names(groups) <- paste0("G", seq_along(groups))
    pairs <- list()
    ks <- names(groups)
    raw_p <- c(); pair_keys <- c()
    for (i in seq_along(ks)) for (j in seq_along(ks)) {
        if (j <= i) next
        key <- paste0(ks[[i]], "|", ks[[j]])
        pr <- pair_refs(groups[[i]], groups[[j]])
        pairs[[key]] <- pr
        if (!is.null(pr$welch$p)) { raw_p <- c(raw_p, pr$welch$p); pair_keys <- c(pair_keys, key) }
    }
    adj <- list()
    if (length(raw_p) > 0) {
        for (meth in c("holm", "bonferroni", "BH")) {
            av <- p.adjust(raw_p, method = meth)
            adj[[meth]] <- as.list(setNames(as.list(as.numeric(av)), pair_keys))
        }
    }
    # Games-Howell: per-pair Welch t + Welch-Satterthwaite df under the
    # studentized range with k = the group count (the engine's
    # _facetCells k). Independent route: R's own t.test + ptukey vs the
    # engine's descriptive recompute + its JS ptukey port. Emitted only
    # where the engine applies it (both n > 1, positive SE, k >= 2).
    k_cells <- length(groups)
    gh <- list()
    if (k_cells >= 2) {
        for (key in names(pairs)) {
            pr <- pairs[[key]]
            if (is.null(pr$welch) || is.null(pr$welch$t) || is.null(pr$welch$df)) next
            gs <- strsplit(key, "|", fixed = TRUE)[[1]]
            a <- groups[[gs[1]]]; b <- groups[[gs[2]]]
            if (length(a) < 2 || length(b) < 2) next
            se2 <- var(a) / length(a) + var(b) / length(b)
            if (!isTRUE(se2 > 0)) next
            pv <- safe(suppressWarnings(ptukey(abs(pr$welch$t) * sqrt(2),
                              nmeans = k_cells,
                              df = pr$welch$df, lower.tail = FALSE)))
            if (!is.null(pv) && !is.finite(pv)) pv <- NULL
            if (!is.null(num_or_null(pv))) gh[[key]] <- as.numeric(pv)
        }
    }
    if (length(gh) > 0) adj$gh <- gh
    list(groups = lapply(groups, function(v) as.numeric(v)),
         cells = lapply(groups, cell_refs),
         shapes = lapply(groups, function(v)
             list(box = box_ref(v), kde = kde_ref(v))),
         pairs = pairs,
         adjust = adj,
         anova = anova_ref(groups))
}

corr_refs <- function(x, y) {
    x <- signif(as.numeric(x), 10); y <- signif(as.numeric(y), 10)
    out <- list(x = x, y = y, n = length(x))
    for (meth in c("pearson", "spearman", "kendall")) {
        ct <- safe(suppressWarnings(cor.test(x, y, method = meth)))
        if (!is.null(ct)) out[[meth]] <- list(r = num_or_null(unname(ct$estimate)),
                                              p = num_or_null(ct$p.value))
    }
    # Linear fit (the scatter Sigma table's always-on slope + R^2).
    fm <- safe(lm(y ~ x))
    if (!is.null(fm)) {
        sm <- safe(summary(fm))
        out$fit <- list(slope = num_or_null(unname(coef(fm)[2])),
                        r2 = if (is.null(sm)) NULL else num_or_null(sm$r.squared))
    }
    # 95% confidence ellipse: chi-square(2 df) scaling of the covariance
    # eigen-decomposition. Compared via rotation-invariant quantities
    # (center, sorted axis lengths, area) since eigenvector sign/order
    # are arbitrary.
    if (length(x) >= 3) {
        cv <- safe(stats::cov(cbind(x, y)))
        if (!is.null(cv) && all(is.finite(cv))) {
            eg <- safe(eigen(cv, symmetric = TRUE))
            if (!is.null(eg) && all(is.finite(eg$values)) && all(eg$values > 0)) {
                chi <- qchisq(0.95, 2)
                r1 <- sqrt(chi * eg$values[1]); r2e <- sqrt(chi * eg$values[2])
                out$ell <- list(cx = mean(x), cy = mean(y),
                                rmax = max(r1, r2e), rmin = min(r1, r2e),
                                area = pi * r1 * r2e)
            }
        }
    }
    out
}

rm_refs <- function(mat) {
    # Wide within-subjects data: paired t and Wilcoxon signed-rank per
    # occasion pair, R defaults (exact iff small, tie-free, and no
    # dropped zero differences - the rule the engine mirrors).
    mat <- lapply(mat, function(v) signif(as.numeric(v), 10))
    occ <- names(mat)
    pairs <- list()
    for (i in seq_along(occ)) for (j in seq_along(occ)) {
        if (j <= i) next
        a <- mat[[i]]; b <- mat[[j]]
        key <- paste0(occ[i], "|", occ[j])
        pt <- safe(t.test(a, b, paired = TRUE))
        sr <- safe(suppressWarnings(wilcox.test(a, b, paired = TRUE)))
        pairs[[key]] <- list(
            paired = if (is.null(pt)) NULL else list(
                t = num_or_null(unname(pt$statistic)),
                df = num_or_null(unname(pt$parameter)),
                p = num_or_null(pt$p.value)),
            signedrank = if (is.null(sr)) NULL else list(
                V = num_or_null(unname(sr$statistic)),
                p = num_or_null(sr$p.value)))
    }
    list(data = mat, pairs = pairs)
}

lk_refs <- function(items) {
    # Likert battery on the 1..k index coding: per-item mean + t CI at
    # 95%, plus Cronbach's alpha (listwise; complete by construction).
    refs <- list()
    for (nm in names(items)) {
        code <- as.numeric(items[[nm]])
        nIt <- length(code)
        m <- mean(code); se <- sd(code) / sqrt(nIt)
        half <- se * qt(0.975, nIt - 1)
        refs[[nm]] <- list(n = nIt, mean = m, lo = m - half, hi = m + half)
    }
    sums <- Reduce(`+`, lapply(items, as.numeric))
    vt <- var(sums); vi <- sum(vapply(items, function(v) var(as.numeric(v)), 0))
    kI <- length(items)
    alpha <- if (isTRUE(vt > 0)) (kI / (kI - 1)) * (1 - vi / vt) else NULL
    list(data = items, items = refs, alpha = num_or_null(alpha))
}

kde2d_ref <- function(x, y) {
    # The scatter 2D-density client mirrors MASS::kde2d (bandwidth.nrd,
    # h/4 gaussian kernel) on the same 0.75*bandwidth-expanded lims the
    # R side uses. MASS ships with base R; guard anyway.
    if (!requireNamespace("MASS", quietly = TRUE)) return(NULL)
    hx <- safe(MASS::bandwidth.nrd(x)); hy <- safe(MASS::bandwidth.nrd(y))
    if (is.null(num_or_null(hx)) || is.null(num_or_null(hy))
        || !isTRUE(hx > 0) || !isTRUE(hy > 0)) return(NULL)
    lims <- c(min(x) - 0.75 * hx, max(x) + 0.75 * hx,
              min(y) - 0.75 * hy, max(y) + 0.75 * hy)
    kk <- safe(MASS::kde2d(x, y, n = 25, lims = lims))
    if (is.null(kk)) return(NULL)
    cells <- lapply(list(c(1, 1), c(5, 9), c(13, 13), c(20, 7), c(25, 25)),
        function(ij) list(i = ij[1], j = ij[2], z = kk$z[ij[1], ij[2]]))
    list(lims = lims, hx = hx, hy = hy, zmax = max(kk$z), cells = cells)
}

# ---- random dataset generator -------------------------------------------
rand_group <- function() {
    n <- sample(2:50, 1)
    kind <- sample(c("normal", "lognormal", "ties", "shifted", "negative",
                     "bigscale", "tinyscale"), 1,
                   prob = c(0.35, 0.12, 0.18, 0.15, 0.08, 0.06, 0.06))
    v <- switch(kind,
        normal    = rnorm(n, mean = runif(1, -20, 80), sd = runif(1, 0.5, 25)),
        lognormal = rlnorm(n, meanlog = runif(1, 0, 3), sdlog = runif(1, 0.2, 1)),
        ties      = sample(1:7, n, replace = TRUE),
        shifted   = rnorm(n, mean = runif(1, 500, 900), sd = runif(1, 1, 40)),
        negative  = rnorm(n, mean = runif(1, -60, -10), sd = runif(1, 1, 15)),
        bigscale  = rnorm(n, mean = 1e9, sd = 1e7),
        tinyscale = rnorm(n, mean = 1e-6, sd = 1e-7))
    round(as.numeric(v), 6)
}

datasets <- list()
for (d in seq_len(n_random)) {
    k <- sample(2:4, 1)
    datasets[[sprintf("rand%02d", d)]] <- dataset_refs(
        lapply(seq_len(k), function(i) rand_group()))
}

# ---- fixed boundary roster ----------------------------------------------
# Cases the fixtures never covered: gates, ties, degenerate variance,
# extreme magnitudes, tied p values inside the corrections.
fixed <- list(
    b_n2        = list(c(3.1, 4.9), c(7.2, 9.8)),
    b_n2_vs_40  = list(c(3.1, 4.9), round(rnorm(40, 8, 2), 4)),
    b_ties_all  = list(rep(c(2, 3), 8), rep(c(2, 4), 8)),
    b_const_a   = list(rep(5, 12), round(rnorm(12, 7, 2), 4)),
    b_const_ab  = list(rep(5, 10), rep(5, 10)),
    b_huge      = list(round(rnorm(15, 1e9, 1e7), 2), round(rnorm(15, 1.02e9, 1e7), 2)),
    b_tiny      = list(round(rnorm(15, 1e-6, 1e-7), 12), round(rnorm(15, 1.4e-6, 1e-7), 12)),
    b_negative  = list(round(rnorm(14, -50, 5), 4), round(rnorm(14, -44, 5), 4)),
    b_tied_p    = list(c(1, 2, 3, 4, 5, 6), c(2, 3, 4, 5, 6, 7),
                       c(3, 4, 5, 6, 7, 8), c(4, 5, 6, 7, 8, 9)),
    b_k1_family = list(round(rnorm(10, 10, 2), 4), round(rnorm(10, 14, 2), 4))
)
for (nm in names(fixed)) datasets[[nm]] <- dataset_refs(fixed[[nm]])

# ---- correlation sets ----------------------------------------------------
corrs <- list()
for (d in seq_len(max(3, ceiling(n_random / 4)))) {
    n <- sample(8:60, 1)
    x <- rnorm(n)
    kind <- sample(c("linear", "none", "monotone", "ties"), 1)
    y <- switch(kind,
        linear   = 2 * x + rnorm(n, sd = runif(1, 0.3, 2)),
        none     = rnorm(n),
        monotone = x^3 + rnorm(n, sd = 0.5),
        ties     = round(x) + sample(0:1, n, replace = TRUE))
    corrs[[sprintf("corr%02d", d)]] <- corr_refs(round(x, 5), round(y, 5))
}
corrs[["corr_ties_small"]] <- corr_refs(rep(1:4, 4), rep(c(1, 2), 8))
corrs[["corr_exact_n12"]] <- corr_refs(round(rnorm(12), 5), round(rnorm(12), 5))
corrs[["corr01"]]$kde2d <- kde2d_ref(corrs[["corr01"]]$x, corrs[["corr01"]]$y)

# ---- repeated-measures sets (paired t + signed-rank regimes) -------------
mk_rm <- function(n, tie = FALSE, zeros = FALSE) {
    base <- rnorm(n, 20, 4)
    m <- list(t1 = round(base + rnorm(n, 0, 1.5), 4),
              t2 = round(base + 1.2 + rnorm(n, 0, 1.5), 4),
              t3 = round(base + 2.1 + rnorm(n, 0, 1.5), 4))
    if (tie) m <- lapply(m, round)          # integer values -> tied diffs
    if (zeros) m$t2[1:3] <- m$t1[1:3]       # zero differences get dropped
    m
}
rmsets <- list(
    rm_clean = rm_refs(mk_rm(14)),                       # exact regime
    rm_ties  = rm_refs(mk_rm(24, tie = TRUE)),           # tie-forced approx
    rm_zeros = rm_refs(mk_rm(16, tie = TRUE, zeros = TRUE)),
    rm_big   = rm_refs(mk_rm(60))                        # n >= 50 approx
)

# ---- likert battery (item-mean CIs + alpha) ------------------------------
# The first five rows run 1..5 in every item so the standalone's
# first-seen level ordering matches the numeric coding exactly.
mk_item <- function(prob) c(1:5, sample(1:5, 35, replace = TRUE, prob = prob))
lksets <- list(lk_basic = lk_refs(list(
    q1 = mk_item(c(1, 2, 3, 3, 2)),
    q2 = mk_item(c(3, 3, 2, 1, 1)),
    q3 = mk_item(rep(1, 5)),
    q4 = mk_item(c(1, 1, 2, 3, 4)))))

# ---- Q-Q band reference (one clean fixed dataset) ------------------------
qqset <- list(values = as.numeric(signif(fixed$b_negative[[1]], 10)))
qqset$band <- qq_ref(qqset$values)

# ---- write ---------------------------------------------------------------
to_json <- function(x) {
    if (is.null(x)) return("null")
    if (is.list(x)) {
        if (length(x) == 0) return("{}")
        if (is.null(names(x)))
            return(paste0("[", paste(vapply(x, to_json, ""), collapse = ","), "]"))
        return(paste0("{", paste(sprintf('"%s":%s', names(x),
            vapply(x, to_json, "")), collapse = ","), "}"))
    }
    if (is.numeric(x)) {
        if (length(x) > 1)
            return(paste0("[", paste(vapply(as.list(x), to_json, ""), collapse = ","), "]"))
        if (!is.finite(x)) return("null")
        return(sprintf("%.15g", x))
    }
    if (is.character(x)) return(sprintf('"%s"', x))
    if (is.logical(x)) return(tolower(as.character(x)))
    stop("unhandled type")
}

payload <- list(seed = seed, datasets = datasets, corrs = corrs,
                rmsets = rmsets, lksets = lksets, qqset = qqset)
con <- file(out_path, open = "wb")
writeLines(to_json(payload), con, useBytes = TRUE)
close(con)
cat(sprintf("wrote %s (%d datasets, %d corr sets)\n",
            out_path, length(datasets), length(corrs)))
