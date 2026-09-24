# The mean line marker: render fixtures for meanline-check.mjs.
#
#   GB2_MEANLINE_OUT=/tmp/gb2-meanline GB2_BUNDLE=source|min Rscript scripts/verify/meanline-render.R
#
# Dot charts drawn with the Line marker shape (Sep 2026): default and long
# lengths, a horizontal chart, a grouped chart, and plain dot charts the
# probe switches to Line through the panel. GB2_BUNDLE may also name a
# bundle file, to render a control against another engine.
# Exit 2 = jmvcore missing (skipped).

OUT <- Sys.getenv("GB2_MEANLINE_OUT", "/tmp/gb2-meanline")
BUNDLE <- Sys.getenv("GB2_BUNDLE", "source")
dir.create(OUT, showWarnings = FALSE, recursive = TRUE)
Sys.setenv(R_USER_CONFIG_DIR = file.path(OUT, "config"))
# file:// fixtures need the inline bundle (the default is a script-src stub).
Sys.setenv(GB2_INLINE_BUNDLE = "1")
if (!requireNamespace("jmvcore", quietly = TRUE)) quit(status = 2)

suppressWarnings(suppressMessages({
    library(jmvcore); library(R6)
    source("R/palette_library.R"); source("R/style_library.R"); source("R/utils.R")
    source("R/gb_family_core.R"); source("R/spec_explode.R"); source("R/widget.R")
    source("R/plotbuilder.h.R"); source("R/plotbuilder.b.R")
}))
.gb2_widget_js <- function() {
    f <- if (identical(BUNDLE, "min")) "inst/widget/graphbuilder2.min.js"
         else if (identical(BUNDLE, "source")) "inst/widget/graphbuilder2.js"
         else BUNDLE
    paste(readLines(f, warn = FALSE, encoding = "UTF-8"), collapse = "\n")
}
environment(graphbuilder2_html) <- globalenv()
cspec <- function(...) as.character(jsonlite::toJSON(list(...), auto_unbox = TRUE))

set.seed(11)
d <- data.frame(
    group = factor(rep(c("Control", "Treatment"), each = 16)),
    site = factor(rep(c("North", "South"), 16)),
    weight = round(c(rnorm(16, 42, 4), rnorm(16, 51, 4)), 1))
pb <- function(name, ..., groupVar = NULL) {
    a <- c(list(data = d, xvar = "group", yvar = "weight",
                groupVar = groupVar, facetVar = NULL), list(...))
    res <- do.call(plotbuilder, a)
    w <- res$widget
    html <- tryCatch(w$content, error = function(e) NULL)
    if (is.null(html)) html <- tryCatch(w$.__enclos_env__$private$.content, error = function(e) "")
    con <- file(file.path(OUT, paste0(name, ".html")), open = "wb")
    writeLines('<meta charset="utf-8">', con, useBytes = TRUE)
    writeLines(html, con, useBytes = TRUE)
    close(con)
}
pb("ml_dot_plain", graphType = "dot")
pb("ml_dot", graphType = "dot", chartSpec = cspec(linePointShape = "line"))
pb("ml_dot_long", graphType = "dot", chartSpec = cspec(linePointShape = "line", lineMarkerLength = 0.9))
pb("ml_dot_horiz", graphType = "dot", chartSpec = cspec(linePointShape = "line", chartOrientation = "horizontal"))
pb("ml_dot_grouped", graphType = "dot", groupVar = "site", chartSpec = cspec(linePointShape = "line"))
pb("ml_dot_grouped_plain", graphType = "dot", groupVar = "site")
cat("wrote mean-line fixtures to", OUT, "\n")
