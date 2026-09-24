# Point marks: data checks and render fixtures.
#
#   GB2_MARKS_OUT=/tmp/gb2-marks GB2_BUNDLE=source|min Rscript scripts/verify/marks-render.R
#
# Data side ("Mark points by", Sep 2026): the marks array rides each cell
# parallel to its values, a missing mark keeps its point as "", the
# summary still pools every point, and a chart without a mark variable
# ships nothing new. Then renders the pages marks-check.mjs drives: point
# marks on bar / box / raincloud charts, and on a dot chart drawn with the
# Line marker shape.
# Writes expected.json (each cell's marks, for the alignment check).
# Exit 2 = jmvcore missing (skipped).

OUT <- Sys.getenv("GB2_MARKS_OUT", "/tmp/gb2-marks")
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

fails <- 0
check <- function(label, ok) {
    if (isTRUE(ok)) cat("  ok:", label, "\n")
    else { cat("  FAIL:", label, "\n"); fails <<- fails + 1 }
}

# 32 mice: one without a recorded sex (keeps its point), one without a
# weight (drops out everywhere, marks included).
set.seed(11)
d <- data.frame(
    mouse = sprintf("m%02d", 1:32),
    group = rep(c("Control", "Treatment"), each = 16),
    sex = rep(c("F", "M"), 16),
    weight = round(c(rnorm(16, 42, 4), rnorm(16, 51, 4)), 1),
    stringsAsFactors = FALSE)
d$sex[5] <- NA
d$weight[20] <- NA
d$group <- factor(d$group); d$sex <- factor(d$sex)
d$site <- factor(rep(c("North", "South"), length.out = nrow(d)))

captured <- NULL
real <- graphbuilder2_html
graphbuilder2_html <- function(...) { captured <<- list(...); real(...) }
pb <- function(..., groupVar = NULL, facetVar = NULL, markVar = NULL) {
    captured <<- NULL
    a <- c(list(data = d, xvar = "group", yvar = "weight",
                groupVar = groupVar, facetVar = facetVar, markVar = markVar), list(...))
    res <- do.call(plotbuilder, a)
    list(res = res, args = captured)
}
getHtml <- function(res) {
    w <- res$widget
    v <- tryCatch(w$content, error = function(e) NULL)
    if (is.null(v)) v <- tryCatch(w$.__enclos_env__$private$.content, error = function(e) "")
    v
}
wr <- function(r, name) {
    con <- file(file.path(OUT, paste0(name, ".html")), open = "wb")
    writeLines('<meta charset="utf-8">', con, useBytes = TRUE)
    writeLines(getHtml(r$res), con, useBytes = TRUE)
    close(con)
}

cat("== point marks: data\n")
m <- pb(graphType = "bar", markVar = "sex")
bars <- m$args$bars
check("every cell ships marks parallel to its values",
      all(vapply(bars, function(b) length(b$marks) == length(b$values), logical(1))))
keep <- d[is.finite(d$weight), ]
for (b in bars) {
    rows <- keep[as.character(keep$group) == b$x, ]
    want <- ifelse(is.na(rows$sex), "", as.character(rows$sex))
    check(paste0(b$x, ": marks follow the rows in order (missing sex = \"\")"),
          identical(as.character(b$marks), want) &&
          isTRUE(all.equal(as.numeric(b$values), rows$weight)))
}
check("mark levels are the levels in use", identical(as.character(m$args$mark_levels), c("F", "M")))
check("mark label is the variable name", identical(m$args$mark_label, "sex"))
plain <- pb(graphType = "bar")
check("no mark variable: no marks field on any cell",
      !any(vapply(plain$args$bars, function(b) !is.null(b$marks), logical(1))))
check("no mark variable: no mark levels", is.null(plain$args$mark_levels))
check("the means pool every point, marks or not",
      isTRUE(all.equal(vapply(bars, function(b) b$mean, 0),
                       vapply(plain$args$bars, function(b) b$mean, 0))) &&
      isTRUE(all.equal(vapply(bars, function(b) b$mean, 0),
                       as.numeric(tapply(keep$weight, droplevels(keep$group), mean)))))
check("payload carries markLevels",
      grepl('"markLevels":["F","M"]', getHtml(m$res), fixed = TRUE))
check("payload of a plain chart has no markLevels key",
      !grepl('"markLevels"', getHtml(plain$res), fixed = TRUE))
g <- pb(graphType = "box", groupVar = "site", markVar = "sex", showDataPoints = TRUE)
check("grouped cells stay aligned",
      all(vapply(g$args$bars, function(b) length(b$marks) == length(b$values), logical(1))))

expected <- lapply(bars, function(b) list(x = b$x, marks = as.character(b$marks)))
writeLines(as.character(jsonlite::toJSON(expected, auto_unbox = TRUE)),
           file.path(OUT, "expected.json"))

cat("== rendering fixtures\n")
wr(m, "mk_bar")
wr(pb(graphType = "bar", markVar = "sex", showDataPoints = TRUE,
      chartSpec = cspec(markAutoShown = TRUE, pointSize = 6,
          pointMarkStyles = list(
              list(level = "F", color = "#c2242c", shape = "triangle"),
              list(level = "M", color = "#2d5c94", shape = "square")))), "mk_bar_styled")
wr(pb(graphType = "bar", markVar = "sex", showDataPoints = TRUE,
      chartSpec = cspec(markAutoShown = TRUE, hiddenElements = list("markLegend"))), "mk_bar_nokey")
wr(pb(graphType = "bar", markVar = "sex", showDataPoints = TRUE,
      chartSpec = cspec(markAutoShown = TRUE,
          hiddenPoints = list(list(cat = "Control", group = "", idx = 2)))), "mk_bar_hidden")
wr(g, "mk_box_grouped")
wr(pb(graphType = "raincloud", markVar = "sex"), "mk_rain")
wr(plain, "mk_none")
wr(pb(graphType = "bar", showDataPoints = TRUE), "mk_none_points")
wr(pb(graphType = "dot", markVar = "sex", showDataPoints = TRUE,
      chartSpec = cspec(linePointShape = "line", markAutoShown = TRUE)), "ml_dot_marks")
cat("wrote fixtures to", OUT, "\n")
if (fails > 0) { cat(fails, "data check(s) failed\n"); quit(status = 1) }
