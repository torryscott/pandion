# Fixture for handover-check.mjs: a plain chart rendered with the CURRENT
# engine, with both handover switches OFF (the shipping default), so the
# check can drive all three states from one page.
invisible(suppressWarnings(Sys.setlocale("LC_ALL", "en_US.UTF-8")))
if (!requireNamespace("jmvcore", quietly = TRUE)) {
    cat("jmvcore not available - skipped\n"); quit(status = 2)
}
suppressMessages(library(jmvcore))
for (f in c("R/spec_explode.R","R/utils.R","R/gb_family_core.R","R/palette_library.R",
            "R/style_library.R","R/widget.R","R/helpmechoose_wizard.R",
            "R/plotbuilder.h.R","R/plotbuilder.b.R")) source(f)
BUNDLE <- if (identical(Sys.getenv("GB2_BUNDLE"), "min")) "min" else "src"
.gb2_widget_js <- function() paste(readLines(
    if (BUNDLE == "min") "inst/widget/graphbuilder2.min.js"
    else "inst/widget/graphbuilder2.js", warn = FALSE, encoding = "UTF-8"),
    collapse = "\n")
environment(graphbuilder2_html) <- globalenv()
Sys.setenv(GB2_INLINE_BUNDLE = "1")
OUT <- Sys.getenv("GB2_HANDOVER_OUT", "/tmp/gb2-handover")
dir.create(OUT, showWarnings = FALSE, recursive = TRUE)
set.seed(4)
d <- data.frame(x = factor(rep(c("A","B","C"), each = 8)), y = rnorm(24, 50, 9))
h <- plotbuilder(data = d, xvar = "x", yvar = "y", groupVar = NULL,
                 facetVar = NULL)$widget$content
con <- file(file.path(OUT, paste0("h_", BUNDLE, ".html")), open = "wb")
writeLines('<meta charset="utf-8">', con, useBytes = TRUE)
writeLines(enc2utf8(h), con, useBytes = TRUE); close(con)
# The shipping default must not advertise either handover. Check the
# PAYLOAD, not the page: the engine source is inlined here and of course
# mentions both key names.
pl <- regmatches(h, regexpr("var __gb2_payload = \\{.*?\\};\n", h))
stopifnot(length(pl) == 1)
res <- grepl("svgHandoverResize", pl, fixed = TRUE)
exp <- grepl("svgHandoverExport", pl, fixed = TRUE)
cat("payload advertises resize handover:", res, "\n")
cat("payload advertises export handover:", exp, "\n")
if (res || exp) {
    cat("FAIL: a handover switch is on by default - the module would stand",
        "down as soon as jamovi ships the Svg element\n")
    quit(status = 1)
}
cat("default: both handovers pending (module keeps its own controls)\n")
