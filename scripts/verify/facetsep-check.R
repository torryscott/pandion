# The pareto category-total split must survive a category label that
# CONTAINS the facet separator (pre-fix: greedy regex stripped to the
# last separator, the label totalled 0, and the pareto silently ranked
# it last).
# Rscript runs in the C locale under this shell, which mangles multibyte
# literals; the separator is U+00A6, so pin UTF-8 before anything reads it.
suppressWarnings(Sys.setlocale("LC_ALL", "en_US.UTF-8"))
library(jmvcore)
for (f in c("R/spec_explode.R", "R/utils.R", "R/gb_family_core.R",
            "R/palette_library.R", "R/style_library.R", "R/widget.R",
            "R/helpmechoose_wizard.R", "R/freqplotbuilder.h.R",
            "R/freqplotbuilder.b.R")) source(f)

.gb2_widget_js <- function()
    paste(readLines(if (identical(Sys.getenv("GB2_BUNDLE"), "min"))
                       "inst/widget/graphbuilder2.min.js"
                   else "inst/widget/graphbuilder2.js", warn = FALSE,
                    encoding = "UTF-8"), collapse = "\n")
environment(graphbuilder2_html) <- globalenv()

hostile <- "A ¦ B"   # a category named "A ¦ B"
df <- data.frame(
    cat = factor(c(rep(hostile, 8), rep("C", 2), rep(hostile, 7), rep("C", 3)),
                 levels = c(hostile, "C")),
    fac = factor(c(rep("F1", 10), rep("F2", 10)))
)
an <- freqplotbuilder(data = df, var = "cat", groupVar = NULL, facetVar = "fac",
                      graphType = "pareto")
html <- an$widget$content
m <- regmatches(html, regexpr('"xCategories":\\[[^]]*\\]', html))
stopifnot(length(m) == 1)
cat("xCategories:", m, "\n")
# hostile has 8 (F1) and 7 (F2) vs C's 2 and 3: hostile must rank FIRST
# in each facet block.
xc <- jsonlite::fromJSON(sub('"xCategories":', '', m))
stopifnot(length(xc) == 4,
          grepl(paste0("^F1 ¦ ", hostile, "$"), xc[1]),
          grepl(paste0("^F2 ¦ ", hostile, "$"), xc[3]))
cat("facetsep-check: PASS (hostile-label category ranked by its true counts)\n")
