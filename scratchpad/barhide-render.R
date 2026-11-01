# Fixtures for scratchpad/barhide-check.mjs: the per-bar hide eye + Delete
# key on UNGROUPED bar charts (Compare Groups without a Group By,
# Frequencies, Pareto), with grouped charts and the Distribution box
# family as controls.
#
# Usage:  Rscript scratchpad/barhide-render.R
# Env:    GB2_BARHIDE_OUT  output dir (default /tmp/gb2-barhide)
#         GB2_BUNDLE       "source" (default) or "min"
#         GB2_ROOT         repo root to source (default: this script's
#                          repo) - point it at a pre-fix checkout to
#                          render the CONTROL set the probe must fail on.
.self <- gsub("~+~", " ", sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE)[1]), fixed = TRUE)
ROOT <- Sys.getenv("GB2_ROOT", "")
if (!nzchar(ROOT)) ROOT <- normalizePath(file.path(dirname(.self), ".."))
setwd(ROOT)
OUT <- Sys.getenv("GB2_BARHIDE_OUT", "/tmp/gb2-barhide")
dir.create(OUT, showWarnings = FALSE, recursive = TRUE)
Sys.setenv(R_USER_CONFIG_DIR = file.path(OUT, "config"))
Sys.setenv(GB2_INLINE_BUNDLE = "1")
BUNDLE <- Sys.getenv("GB2_BUNDLE", "source")

suppressWarnings(suppressMessages({
    library(jmvcore); library(R6)
    source("R/palette_library.R"); source("R/style_library.R")
    source("R/utils.R")
    source("R/gb_family_core.R");  source("R/spec_explode.R"); source("R/widget.R")
    source("R/plotbuilder.h.R");     source("R/plotbuilder.b.R")
    source("R/distplotbuilder.h.R"); source("R/distplotbuilder.b.R")
    source("R/freqplotbuilder.h.R"); source("R/freqplotbuilder.b.R")
}))
.gb2_widget_js <- function() {
    f <- if (identical(BUNDLE, "min")) "inst/widget/graphbuilder2.min.js"
         else "inst/widget/graphbuilder2.js"
    paste(readLines(f, warn = FALSE, encoding = "UTF-8"), collapse = "\n")
}
environment(graphbuilder2_html) <- globalenv()
getHtml <- function(res) {
    w <- res$widget
    v <- tryCatch(w$content, error = function(e) NULL)
    if (is.null(v)) v <- tryCatch(w$.__enclos_env__$private$.content, error = function(e) "")
    v
}
wr <- function(res, name) {
    con <- file(file.path(OUT, paste0(name, ".html")), open = "wb")
    writeLines('<meta charset="utf-8">', con, useBytes = TRUE)
    writeLines(getHtml(res), con, useBytes = TRUE)
    close(con)
    cat("wrote", name, "\n")
}

set.seed(7)
cg <- data.frame(
    x = rep(c("Ctrl", "Drug1", "Drug2"), each = 40),
    y = c(rnorm(40, 10, 3), rnorm(40, 14, 3), rnorm(40, 12, 3)),
    g = rep(rep(c("M", "F"), 20), 3))
wr(plotbuilder(data = cg, xvar = "x", yvar = "y", groupVar = NULL, facetVar = NULL), "cg_ungrouped")
wr(plotbuilder(data = cg, xvar = "x", yvar = "y", groupVar = NULL, facetVar = "g"), "cg_ungrouped_facet")
wr(plotbuilder(data = cg, xvar = "x", yvar = "y", groupVar = "g", facetVar = NULL), "cg_grouped")

set.seed(13)
fqd <- data.frame(
    resp = factor(sample(c("Agree", "Neutral", "Disagree"), 200, TRUE, prob = c(.5, .3, .2))),
    cohort = factor(sample(c("2023", "2024"), 200, TRUE)),
    site = factor(sample(c("North", "South"), 200, TRUE)))
wr(freqplotbuilder(data = fqd, var = "resp", groupVar = NULL, facetVar = NULL), "freq_ungrouped")
wr(freqplotbuilder(data = fqd, var = "resp", groupVar = NULL, facetVar = "site"), "freq_ungrouped_facet")
wr(freqplotbuilder(data = fqd, var = "resp", groupVar = NULL, facetVar = NULL, graphType = "pareto"), "freq_pareto")
wr(freqplotbuilder(data = fqd, var = "resp", groupVar = "cohort", facetVar = NULL), "freq_grouped")

dd <- data.frame(y = c(rnorm(90, 50, 10), rnorm(90, 60, 8)),
                 grp = rep(c("A", "B"), each = 90))
wr(distplotbuilder(data = dd, var = "y", groupVar = NULL, facetVar = NULL, graphType = "box"), "dist_box_ungrouped")
wr(distplotbuilder(data = dd, var = "y", groupVar = "grp", facetVar = NULL, graphType = "box"), "dist_box_grouped")
cat("barhide fixtures ->", OUT, "(bundle:", BUNDLE, ")\n")
