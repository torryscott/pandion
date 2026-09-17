# pixel-truth-render.R - render three jamovi-side fixtures with KNOWN
# data for pixel-truth-jamovi-check.mjs: a grouped bar chart with error
# bars, a dot chart, and a scatter - through the real module .b.R path
# (R aggregation -> payload -> engine), so the decode proves the
# jamovi-rendered pixels the same way the standalone gate proves its
# own. The data vectors are hardcoded here AND in the check; the check
# recomputes every expectation independently.
# Exit 2 = jmvcore missing (skip, the extras idiom).
ok <- requireNamespace("jmvcore", quietly = TRUE)
if (!ok) { cat("jmvcore not available\n"); quit(status = 2) }
suppressWarnings(suppressMessages({
    library(jmvcore); library(R6)
    source("R/palette_library.R"); source("R/style_library.R")
    source("R/utils.R"); source("R/gb_family_core.R")
    source("R/spec_explode.R"); source("R/widget.R")
    source("R/plotbuilder.h.R"); source("R/plotbuilder.b.R")
    source("R/xyplotbuilder.h.R"); source("R/xyplotbuilder.b.R")
}))
BUNDLE <- Sys.getenv("GB2_BUNDLE", "source")
jsfile <- if (identical(BUNDLE, "min")) {
    "inst/widget/graphbuilder2.min.js"
} else {
    "inst/widget/graphbuilder2.js"
}
.gb2_widget_js <- function()
    paste(readLines(jsfile, warn = FALSE, encoding = "UTF-8"), collapse = "\n")
.gb2_widget_js_hash <- function() ""   # force inline so the page has the engine
environment(graphbuilder2_html) <- globalenv()
OUT <- Sys.getenv("GB2_PIXEL_OUT", "/tmp/gb2-pixel-jamovi")
dir.create(OUT, showWarnings = FALSE, recursive = TRUE)

getC <- function(res) tryCatch(res$widget$content,
    error = function(e) res$widget$.__enclos_env__$private$.content)
wr <- function(html, name) {
    con <- file(file.path(OUT, name), open = "wb")
    writeLines(paste0("<meta charset=\"utf-8\">", html), con, useBytes = TRUE)
    close(con)
}

# The same vectors the standalone gate uses (its case 1 / 5 / 7).
g1 <- c(4, 6, 9, 13); g2 <- c(10, 14, 15, 21)
g3 <- c(2, 3, 4, 3);  g4 <- c(16, 18, 25, 21)
cg <- data.frame(
    x = factor(rep(c("A", "A", "B", "B"), c(4, 4, 4, 4))),
    g = factor(rep(c("g1", "g2", "g1", "g2"), c(4, 4, 4, 4))),
    y = c(g1, g2, g3, g4))
r1 <- plotbuilder(data = cg, xvar = "x", yvar = "y", groupVar = "g",
                  facetVar = NULL)
wr(getC(r1), "cg_bar.html")

dotd <- data.frame(
    x = factor(rep(c("A", "B"), c(4, 4))),
    y = c(g1, g3))
r2 <- plotbuilder(data = dotd, xvar = "x", yvar = "y", graphType = "dot",
                  groupVar = NULL, facetVar = NULL)
wr(getC(r2), "cg_dot.html")

xs <- c(1, 2, 3, 4, 5, 6, 8, 10, 12, 15)
ys <- c(3, 7, 4, 9, 12, 8, 15, 11, 18, 20)
xy <- data.frame(x = xs, y = ys)
r3 <- xyplotbuilder(data = xy, xvar = "x", yvar = "y",
                    groupVar = NULL, facetVar = NULL,
                    sizeVar = NULL, labelVar = NULL)
wr(getC(r3), "xy_scatter.html")
cat(sprintf("wrote 3 pixel fixtures to %s (%s bundle)\n", OUT, BUNDLE))
