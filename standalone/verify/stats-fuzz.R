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
#   cor.test with NO exact= argument (the jamovi-parity rule).
# Values ship raw at full precision; the JS side owns display tolerance.

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

anova_ref <- function(groups) {
    y <- unlist(groups)
    g <- factor(rep(seq_along(groups), vapply(groups, length, 1L)))
    if (nlevels(droplevels(g)) < 2) return(NULL)
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
    list(groups = lapply(groups, function(v) as.numeric(v)),
         cells = lapply(groups, cell_refs),
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
    out
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

payload <- list(seed = seed, datasets = datasets, corrs = corrs)
con <- file(out_path, open = "wb")
writeLines(to_json(payload), con, useBytes = TRUE)
close(con)
cat(sprintf("wrote %s (%d datasets, %d corr sets)\n",
            out_path, length(datasets), length(corrs)))
