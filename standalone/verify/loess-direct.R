# Independent direct-surface Gaussian quadratic LOESS references. No app code
# is used. Singular local designs are explicitly refused by the JS contract,
# even where R warns and supplies a pseudoinverse fallback.
args <- commandArgs(trailingOnly = TRUE)
out <- if (length(args)) args[[1]] else "/tmp/pandion-loess-direct.json"
cases <- list()
add <- function(id, x, y, span, available = TRUE) {
    grid <- seq(min(x), max(x), length.out = 100)
    warnings <- character()
    expected <- withCallingHandlers(tryCatch({
        fit <- loess(y ~ x, degree = 2, span = span, family = "gaussian",
                     control = loess.control(surface = "direct"))
        unname(predict(fit, data.frame(x = grid)))
    }, error = function(e) NULL), warning = function(w) {
        warnings <<- c(warnings, conditionMessage(w)); invokeRestart("muffleWarning")
    })
    if (available) stopifnot(length(warnings) == 0, length(expected) == 100, all(is.finite(expected)))
    else stopifnot(length(x) < 4 || length(warnings) > 0 || is.null(expected))
    cases[[id]] <<- list(x = I(x), y = I(y), span = span, available = available,
                        grid = grid, expected = if (available) expected else NULL,
                        referenceWarnings = I(unique(warnings)))
}
for (n in c(20, 31, 60, 100)) for (shape in c("regular", "irregular", "tied")) {
    x <- switch(shape, regular = seq(0, 5, length.out = n),
                irregular = (seq_len(n)/n)^2 * 5,
                tied = rep(seq(0, 5, length.out = ceiling(n/2)), each = 2)[seq_len(n)])
    y <- sin(x) + .12 * cos(seq_along(x) * 2.4)
    for (span in c(.5, .75, 1, 1.5)) add(paste(n, shape, span, sep = "_"), x, y, span)
    if (n == 100) add(paste(n, shape, .1, sep = "_"), x, y, .1)
}
x <- seq(0, 5, length.out = 31); y <- sin(x) + .12 * cos(seq_along(x) * 2.4)
for (span in c(.5, .75, 1, 1.5)) {
    add(paste0("small_units_", span), x * 1e-6, y, span)
    add(paste0("large_units_", span), x * 1e6, y, span)
    add(paste0("offset_", span), x + 1000, y, span)
    add(paste0("small_response_", span), x, y * 1e-8, span)
}
add("constant_response", x, rep(1e-6, length(x)), .75)
add("four_points", 1:4, c(.2, 1.3, -.7, 3), 1.5)
add("quadratic", x, 2 + .3 * x - .7 * x^2, .5)
add("unavailable_few", 1:3, c(.2, 1.3, -.7), 1.5, FALSE)
add("unavailable_span", 1:20, sin(1:20), .1, FALSE)
add("unavailable_constant_x", rep(1, 20), sin(1:20), .75, FALSE)
add("unavailable_two_levels", rep(1:2, each = 15), sin(1:30), 1.5, FALSE)
# A valid neighborhood on one side cannot justify bridging an invalid one.
add("unavailable_partial", c(rep(0, 15), 1:15), sin(1:30), .5, FALSE)
writeLines(jsonlite::toJSON(list(schemaVersion = 1L, rVersion = as.character(getRversion()),
    method = "stats::loess degree=2 family=gaussian surface=direct", cases = cases),
    auto_unbox = TRUE, digits = I(17), null = "null", na = "null"), out)
cat("LOESS DIRECT REFERENCES:", length(cases), "cases\n")
