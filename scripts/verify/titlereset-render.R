# Title Reset undo probe - renderer (Oct 2026).
# Renders Compare Groups pages whose chartSpec ALREADY carries renamed
# titles (chart title, figure note, X axis, legend, points key), so
# undo-check.mjs can press each text's Clear override button and ask
# whether one undo brings the rename back on its own.
# Env: GB2_TITLERESET_OUT (default /tmp/gb2-titlereset)  GB2_BUNDLE=min|source
# Exit 2 = jmvcore missing (skipped).
ok <- requireNamespace("jmvcore", quietly = TRUE)
if (!ok) { cat("jmvcore not available\n"); quit(status = 2) }
# Run from the repo root whatever the caller's directory (render.R's idiom;
# Rscript spells spaces in --file= as "~+~").
.self <- gsub("~+~", " ", sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE)[1]), fixed = TRUE)
setwd(normalizePath(file.path(dirname(.self), "..", "..")))
OUT <- Sys.getenv("GB2_TITLERESET_OUT", "/tmp/gb2-titlereset")
dir.create(OUT, showWarnings = FALSE, recursive = TRUE)
Sys.setenv(R_USER_CONFIG_DIR = file.path(OUT, "config"))
# file:// fixtures need the inline bundle (the default is a script-src stub).
Sys.setenv(GB2_INLINE_BUNDLE = "1")
suppressWarnings(suppressMessages({
    library(jmvcore); library(R6)
    source("R/palette_library.R"); source("R/style_library.R")
    source("R/utils.R"); source("R/gb_family_core.R")
    source("R/spec_explode.R"); source("R/widget.R")
    source("R/plotbuilder.h.R"); source("R/plotbuilder.b.R")
}))
BUNDLE <- Sys.getenv("GB2_BUNDLE", "source")
jsfile <- if (identical(BUNDLE, "min")) {
    "inst/widget/graphbuilder2.min.js"
} else {
    "inst/widget/graphbuilder2.js"
}
.gb2_widget_js <- function()
    paste(readLines(jsfile, warn = FALSE, encoding = "UTF-8"), collapse = "\n")
environment(graphbuilder2_html) <- globalenv()
cspec <- function(...) as.character(jsonlite::toJSON(list(...), auto_unbox = TRUE))

getC <- function(res) tryCatch(res$widget$content,
    error = function(e) res$widget$.__enclos_env__$private$.content)
writeOne <- function(name, obj) {
    con <- file(file.path(OUT, paste0(name, ".html")), open = "wb")
    writeLines('<meta charset="utf-8">', con, useBytes = TRUE)
    writeLines(getC(obj), con, useBytes = TRUE); close(con)
    cat("wrote", name, "\n")
}

set.seed(7)
cg <- data.frame(
    x = rep(c("Ctrl", "Drug1", "Drug2"), each = 40),
    y = c(rnorm(40, 10, 3), rnorm(40, 14, 3), rnorm(40, 12, 3)),
    g = rep(rep(c("M", "F"), 20), 3),
    s = rep(c("F", "M", "M", "F"), 30))
cg$s <- factor(cg$s)

writeOne("tr_cg_titled", plotbuilder(data = cg, xvar = "x", yvar = "y",
    groupVar = "g", facetVar = NULL, graphType = "bar",
    chartSpec = cspec(chartTitle = "Probe chart title",
                      chartNote = "Probe figure note",
                      xTitle = "Treatment arm", xTitleOverride = TRUE,
                      groupTitle = "Sex of subject", groupTitleOverride = TRUE)))
writeOne("tr_cg_marktitle", plotbuilder(data = cg, xvar = "x", yvar = "y",
    groupVar = NULL, facetVar = NULL, markVar = "s", graphType = "bar",
    showDataPoints = TRUE,
    chartSpec = cspec(markAutoShown = TRUE, markTitle = "Probe key title")))
