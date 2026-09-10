# Independent regression references plus the real Jamovi analysis payload.
# The reference never reads numbers back from that payload. OLS uses R's QR
# fit on scaled predictors; LOESS intervals use predict.loess's residual df.
# Usage: Rscript standalone/verify/fit-boundary.R [output directory]
.self <- gsub("~+~", " ", sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE)[1]), fixed = TRUE)
setwd(normalizePath(file.path(dirname(.self), "..", "..")))
args <- commandArgs(trailingOnly = TRUE)
OUT <- if (length(args)) args[[1]] else "/tmp/pandion-fit-boundary"
dir.create(OUT, recursive = TRUE, showWarnings = FALSE)
Sys.setenv(GB2_NO_BUNDLE_CACHE = "1", R_USER_CONFIG_DIR = file.path(OUT, "config"))
suppressPackageStartupMessages({ library(jmvcore); library(R6) })
for (f in c("palette_library", "style_library", "utils", "gb_family_core", "spec_explode", "widget", "xyplotbuilder.h", "xyplotbuilder.b"))
    source(paste0("R/", f, ".R"))
.gb2_widget_js <- function() ""
environment(graphbuilder2_html) <- globalenv()
cases <- list()
add <- function(id, x, y, degree = 1L, level = .95, span = NULL) {
    stopifnot(length(x) == length(y), all(is.finite(x)), all(is.finite(y)))
    type <- if (!is.null(span)) "loess" else c("linear", "poly2", "poly3")[[degree]]
    grid <- seq(min(x), max(x), length.out = 100)
    outside <- seq(min(x) - diff(range(x)) / 4, max(x) + diff(range(x)) / 4, length.out = 21)
    available <- if (is.null(span)) length(x) >= degree + 1L && length(unique(x)) > degree else TRUE
    reference <- extra <- NULL
    df <- NULL
    if (available) {
        if (is.null(span)) {
            # Independent QR, same polynomial space; scaling removes the units
            # of x from the conditioning of the reference problem.
            center <- x[[1]]; scale <- max(abs(x - center)); z <- (x - center) / scale
            model <- lm(y ~ poly(z, degree))
            stopifnot(model$rank == degree + 1L)
            df <- df.residual(model)
            ref <- function(g) {
                nd <- data.frame(z = (g - center) / scale)
                if (df > 0) {
                    v <- predict(model, nd, interval = "confidence", level = level)
                    list(xs = g, ys = unname(v[, "fit"]), lwrs = unname(v[, "lwr"]), uprs = unname(v[, "upr"]))
                } else list(xs = g, ys = unname(predict(model, nd)))
            }
            reference <- ref(grid); extra <- ref(outside)
        } else {
            model <- loess(y ~ x, span = span, degree = 2, family = "gaussian")
            pr <- predict(model, data.frame(x = grid), se = TRUE)
            df <- pr$df
            stopifnot(is.finite(df), df > 0, all(is.finite(pr$fit)), all(is.finite(pr$se.fit)))
            critical <- qt((1 + level) / 2, df)
            reference <- list(xs = grid, ys = unname(pr$fit),
                              lwrs = unname(pr$fit - critical * pr$se.fit),
                              uprs = unname(pr$fit + critical * pr$se.fit))
        }
        stopifnot(all(is.finite(unlist(reference))), all(is.finite(unlist(extra))))
    }
    data <- data.frame(x = x, y = y)
    result <- suppressWarnings(xyplotbuilder(data = data, xvar = "x", yvar = "y",
        groupVar = NULL, facetVar = NULL, labelVar = NULL, sizeVar = NULL,
        xyFitType = type, xyCILevel = level, xyLoessSpan = if (is.null(span)) .75 else span,
        chartSpec = '{"xyShowFit":true,"xyShowCI":true}'))
    html <- tryCatch(result$widget$content, error = function(e) result$widget$.__enclos_env__$private$.content)
    m <- regmatches(html, regexec("var __gb2_payload = (\\{.*?\\});\nvar __gb2_id", html))[[1]]
    stopifnot(length(m) == 2)
    payload <- jsonlite::fromJSON(m[[2]], simplifyVector = FALSE)
    # Capture only the fit channel to avoid mixing this check with other
    # statistics' independent coverage and to keep the evidence small.
    cases[[id]] <<- list(type = type, degree = degree, level = level, span = span,
        x = I(x), y = I(y), df = df, available = available, reference = reference,
        extrapolation = extra, hostFits = payload$xyFits)
}
z <- seq(-2, 3, length.out = 19)
signal <- 2 + .4 * z - .3 * z^2 + .07 * z^3 + .15 * sin(seq_along(z) * 2.1)
for (degree in 1:3) {
    pre <- paste0("ols", degree, "_")
    for (level in c(.8, .95, .99)) add(paste0(pre, "level", level * 100), z, signal, degree, level)
    add(paste0(pre, "small_units"), z * 1e-6, signal, degree)
    add(paste0(pre, "large_units"), z * 1e6, signal, degree)
    add(paste0(pre, "offset"), z + 1000, signal, degree)
    add(paste0(pre, "small_response"), z, signal * 1e-8, degree)
    add(paste0(pre, "tied_x"), rep(z, each = 2), rep(signal, each = 2) + rep(c(-.1,.1), length(z)), degree)
    add(paste0(pre, "constant_y"), z, rep(1e-6, length(z)), degree)
    n <- degree + 1L
    add(paste0(pre, "zero_df"), seq_len(n), c(.13, 2.71, -.83, 4.22)[seq_len(n)], degree)
    add(paste0(pre, "one_df"), seq_len(n + 1L), c(.13, 2.71, -.83, 4.22, 1.11)[seq_len(n + 1L)], degree, .99)
    add(paste0(pre, "too_few"), seq_len(degree), seq_len(degree)^2, degree)
    add(paste0(pre, "rank_deficient"), rep(seq_len(degree), each = 3), sin(seq_len(degree * 3)), degree)
}
for (shape in c("regular", "irregular", "tied")) {
    x <- switch(shape, regular = seq(0, 5, length.out = 100),
                irregular = (seq_len(100) / 100)^2 * 5,
                tied = rep(seq(0, 5, length.out = 50), each = 2))
    y <- sin(x) + .12 * cos(seq_along(x) * 2.4)
    for (span in c(.1, .5, .75, 1, 1.5))
        for (level in c(.8, .95, .99))
            add(paste0("loess_", shape, "_", span, "_", level), x, y, level = level, span = span)
}
out <- list(schemaVersion = 1L, rVersion = as.character(getRversion()), cases = cases)
writeLines(jsonlite::toJSON(out, auto_unbox = TRUE, digits = I(17), null = "null", na = "null"),
           file.path(OUT, "expected.json"))
cat("FIT REFERENCES:", length(cases), "cases; independent R references and real Jamovi payloads\n")
