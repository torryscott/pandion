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

# ---- The MIRROR case: a FACET LEVEL that contains the separator. The
# key is "<level><sep><category>", so splitting on the first separator
# truncates the level and hands its tail back as part of the category.
# R must ship the true levels; the client probe then checks the drawn
# panels (facetsep-client-check.mjs).
hostileLv <- "North \u00a6 East"
df2 <- data.frame(
    cat = factor(rep(c("A", "B", "A"), 8)),
    fac = factor(rep(c(hostileLv, "South"), each = 12),
                 levels = c(hostileLv, "South"))
)
an2 <- freqplotbuilder(data = df2, var = "cat", groupVar = NULL,
                       facetVar = "fac", graphType = "bar")
h2 <- an2$widget$content
fl <- regmatches(h2, regexpr('"facetLevels":\\[[^]]*\\]', h2))
stopifnot(length(fl) == 1)
fls <- jsonlite::fromJSON(sub('"facetLevels":', '', fl))
stopifnot(length(fls) == 2, identical(fls[1], hostileLv), identical(fls[2], "South"))
cat("facetsep-check: PASS (hostile facet level shipped whole)\n")

OUT <- Sys.getenv("GB2_FACETSEP_OUT", "")
if (nzchar(OUT)) {
    Sys.setenv(GB2_INLINE_BUNDLE = "1")
    an3 <- freqplotbuilder(data = df2, var = "cat", groupVar = NULL,
                           facetVar = "fac", graphType = "bar")
    dir.create(OUT, showWarnings = FALSE, recursive = TRUE)
    bn <- if (identical(Sys.getenv("GB2_BUNDLE"), "min")) "min" else "src"
    fp <- file.path(OUT, paste0("facetlv_", bn, ".html"))
    con <- file(fp, open = "wb")
    writeLines('<meta charset="utf-8">', con, useBytes = TRUE)
    writeLines(enc2utf8(an3$widget$content), con, useBytes = TRUE)
    close(con)
    cat("wrote", fp, "\n")
}
