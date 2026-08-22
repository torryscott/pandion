# Two colour/markup routes that bypass the ordinary gates, both carried in
# a plain shared .omv with no library action and no machineId:
#   1. the xy*GroupStyles stores persist as a JSON STRING under a key whose
#      name is not colour-ish, so the name-rule walker never sees the
#      colours inside them; the client parses them back out and builds
#      style attributes from them.
#   2. an annotation id is interpolated into id="..." / for="..." in the
#      bracket panel, and was accepted as any string.
# This renders a chart poisoned with both; storegate-check.mjs drives it.
invisible(suppressWarnings(Sys.setlocale("LC_ALL", "en_US.UTF-8")))
if (!requireNamespace("jmvcore", quietly = TRUE)) {
    cat("jmvcore not available - skipped\n"); quit(status = 2)
}
suppressMessages(library(jmvcore))
for (f in c("R/spec_explode.R","R/utils.R","R/gb_family_core.R","R/palette_library.R",
            "R/style_library.R","R/widget.R","R/helpmechoose_wizard.R",
            "R/xyplotbuilder.h.R","R/xyplotbuilder.b.R",
            "R/plotbuilder.h.R","R/plotbuilder.b.R")) source(f)
BUNDLE <- if (identical(Sys.getenv("GB2_BUNDLE"), "min")) "min" else "src"
.gb2_widget_js <- function() paste(readLines(
    if (BUNDLE == "min") "inst/widget/graphbuilder2.min.js"
    else "inst/widget/graphbuilder2.js", warn = FALSE, encoding = "UTF-8"),
    collapse = "\n")
environment(graphbuilder2_html) <- globalenv()
Sys.setenv(GB2_INLINE_BUNDLE = "1")
OUT <- Sys.getenv("GB2_STOREGATE_OUT", "/tmp/gb2-storegate")
dir.create(OUT, showWarnings = FALSE, recursive = TRUE)
wr <- function(h, nm) {
    con <- file(file.path(OUT, nm), open = "wb")
    writeLines('<meta charset="utf-8">', con, useBytes = TRUE)
    writeLines(enc2utf8(h), con, useBytes = TRUE); close(con)
}
H <- 'red;"><img src=zz onerror=window.__PWNED=(window.__PWNED||0)+1>'
gs <- jsonlite::toJSON(list(G1 = list(color = H, outlineColor = H)), auto_unbox = TRUE)

set.seed(1)
d <- data.frame(x = rnorm(40, 10, 3), y = rnorm(40, 50, 9),
                g = factor(rep(c("G1", "G2"), 20)))
spec <- jsonlite::toJSON(list(
    xyEllipseGroupStyles   = as.character(gs),
    xyPointGroupStyles     = as.character(gs),
    xyRugGroupStyles       = as.character(gs),
    xyDensity2DGroupStyles = as.character(gs),
    xyMarginalGroupStyles  = as.character(gs)), auto_unbox = TRUE)
h <- xyplotbuilder(data = d, xvar = "x", yvar = "y", groupVar = "g",
                   facetVar = NULL, sizeVar = NULL, labelVar = NULL,
                   chartSpec = as.character(spec))$widget$content
wr(h, paste0("xy_", BUNDLE, ".html"))
cat("xy: hostile store colour in payload:",
    grepl("onerror=window.__PWNED", h, fixed = TRUE), "\n")

# a bracket annotation whose id breaks out of an attribute
ann <- jsonlite::toJSON(list(list(
    id = 'a" onmouseover="window.__PWNED=(window.__PWNED||0)+1" x="',
    kind = "bracket", from = "A", to = "B", y = 60, label = "x")),
    auto_unbox = TRUE)
set.seed(2)
d2 <- data.frame(x = factor(rep(c("A","B"), each = 8)), y = rnorm(16, 50, 9))
h2 <- plotbuilder(data = d2, xvar = "x", yvar = "y", groupVar = NULL,
                  facetVar = NULL, annotationsJson = as.character(ann))$widget$content
wr(h2, paste0("ann_", BUNDLE, ".html"))
cat("ann: hostile id survived into payload:",
    grepl("onmouseover=", h2, fixed = TRUE), "\n")
