# M1 parity harness (R side): build a fixture table exercising every edge
# (NAs on every role, ties, non-alphabetical factor levels, unbalanced
# facets that push spearman into BOTH its exact and Edgeworth regimes),
# run the four M1 modules through the REAL jamovi marshalling, extract the
# payload channels, and write expected.json for m1-parity-check.mjs.
#
# Usage: Rscript standalone/verify/m1-parity.R
# Writes: /tmp/ps-standalone-parity/expected.json

# Rscript under this shell defaults to the C locale, which degrades the
# multibyte facet separator in the sourced b.R literals to ASCII "<c2><a6>"
# text inside the emitted payloads. Force UTF-8 BEFORE sourcing (production
# jamovi is UTF-8; the shell side always uses the real separator).
tryCatch(invisible(Sys.setlocale("LC_ALL", "en_US.UTF-8")),
         warning = function(w) NULL, error = function(e) NULL)

.self <- gsub("~+~", " ", sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE)[1]), fixed = TRUE)
ROOT <- normalizePath(file.path(dirname(.self), "..", ".."))
setwd(ROOT)
OUT <- "/tmp/ps-standalone-parity"
dir.create(OUT, showWarnings = FALSE, recursive = TRUE)
Sys.setenv(R_USER_CONFIG_DIR = file.path(OUT, "config"))
Sys.setenv(GB2_NO_BUNDLE_CACHE = "1")

suppressWarnings(suppressMessages({
    library(jmvcore); library(R6)
    source("R/palette_library.R"); source("R/style_library.R")
    source("R/utils.R")
    source("R/gb_family_core.R"); source("R/spec_explode.R"); source("R/widget.R")
    source("R/plotbuilder.h.R");     source("R/plotbuilder.b.R")
    source("R/rmplotbuilder.h.R");   source("R/rmplotbuilder.b.R")
    source("R/xyplotbuilder.h.R");   source("R/xyplotbuilder.b.R")
    source("R/distplotbuilder.h.R"); source("R/distplotbuilder.b.R")
    source("R/freqplotbuilder.h.R"); source("R/freqplotbuilder.b.R")
    source("R/corrplotbuilder.h.R"); source("R/corrplotbuilder.b.R")
    source("R/likertplotbuilder.h.R"); source("R/likertplotbuilder.b.R")
}))
.gb2_widget_js <- function() ""
environment(graphbuilder2_html) <- globalenv()
cspec <- function(...) { a <- list(...); if (length(a) == 0) "" else as.character(jsonlite::toJSON(a, auto_unbox = TRUE)) }

getHtml <- function(res) {
    w <- res$widget
    v <- tryCatch(w$content, error = function(e) NULL)
    if (is.null(v)) v <- tryCatch(w$.__enclos_env__$private$.content, error = function(e) "")
    v
}
payloadOf <- function(res) {
    html <- getHtml(res)
    m <- regmatches(html, regexec("var __gb2_payload = (\\{.*?\\});\nvar __gb2_id = \"([^\"]+)\";", html))[[1]]
    if (length(m) != 3) stop("payload extraction failed")
    jsonlite::fromJSON(m[2], simplifyVector = FALSE)
}

# ------------------------------------------------------------------ fixture
set.seed(4207)
N <- 57
grp3_lv <- c("B", "A", "C")           # deliberately non-alphabetical
g2_lv   <- c("Y", "X")
site_lv <- c("S1", "S2")
grp3 <- sample(grp3_lv, N, TRUE)
g2   <- sample(g2_lv, N, TRUE)
site <- c(rep("S1", 40), rep("S2", 17))          # unbalanced facets
num1 <- as.numeric(sample(1:12, N, TRUE))        # integer ties
num2 <- round(5 + 45 * stats::runif(N), 3)
num3 <- round(10 + 0.8 * num2 + stats::rnorm(N, 0, 6), 3)
grp3[c(3, 41)] <- NA
g2[8] <- NA
num1[c(5, 22, 50)] <- NA
# RM measures (correlated, NAs in different rows), likert item batteries
# (factor with non-alphabetical declared levels + small-integer numeric),
# and a many-distinct continuous trio for the likert continuous branch.
m1 <- round(20 + 6 * stats::rnorm(N), 2)
m2 <- round(m1 + 2 + stats::rnorm(N), 2)
m3 <- round(m1 + 4 + stats::rnorm(N), 2)
m1[7] <- NA; m2[c(2, 30)] <- NA
lk_lv <- c("SD", "D", "N", "A", "SA")
i1 <- sample(lk_lv, N, TRUE); i2 <- sample(lk_lv, N, TRUE)
i3 <- sample(lk_lv, N, TRUE); i4 <- sample(lk_lv, N, TRUE)
i2[c(4, 19)] <- NA
k1 <- as.numeric(sample(1:7, N, TRUE)); k2 <- as.numeric(sample(1:7, N, TRUE))
c1 <- round(50 + 12 * stats::rnorm(N), 3)
d <- data.frame(
    grp3 = factor(grp3, levels = grp3_lv),
    num1 = num1,
    num2 = num2,
    num3 = num3,
    g2   = factor(g2, levels = g2_lv),
    site = factor(site, levels = site_lv),
    m1 = m1, m2 = m2, m3 = m3,
    i1 = factor(i1, levels = lk_lv), i2 = factor(i2, levels = lk_lv),
    i3 = factor(i3, levels = lk_lv), i4 = factor(i4, levels = lk_lv),
    k1 = k1, k2 = k2, c1 = c1
)

# Serialize the table for the JS side (strings; NA -> "NA").
cellStr <- function(v) {
    if (is.na(v)) return("NA")
    if (is.numeric(v)) return(format(v, digits = 15, trim = TRUE, scientific = FALSE))
    as.character(v)
}
tab_rows <- lapply(seq_len(N), function(i)
    lapply(names(d), function(cn) cellStr(d[[cn]][i])))
tab <- list(
    name = "parity-fixture",
    header = as.list(names(d)),
    rows = tab_rows,
    types = list(grp3 = "factor", num1 = "numeric", num2 = "numeric",
                 num3 = "numeric", g2 = "factor", site = "factor",
                 m1 = "numeric", m2 = "numeric", m3 = "numeric",
                 i1 = "factor", i2 = "factor", i3 = "factor", i4 = "factor",
                 k1 = "numeric", k2 = "numeric", c1 = "numeric"),
    levels = list(grp3 = as.list(grp3_lv), g2 = as.list(g2_lv),
                  site = as.list(site_lv), i1 = as.list(lk_lv),
                  i2 = as.list(lk_lv), i3 = as.list(lk_lv),
                  i4 = as.list(lk_lv))
)

# ------------------------------------------------------------------ cases
CH_COMMON <- c("xLabel", "yLabel", "groupLabel", "facetLabel",
               "xLabelDefault", "yLabelDefault", "groupLabelDefault",
               "facetLevels", "missingNote", "groupCategories", "hasGroups")
CH <- list(
    plotbuilder    = c("bars", "xCategories", "facetSeparator", CH_COMMON),
    distplotbuilder = c("bars", "xCategories", "facetSeparator",
                        "distNormality", CH_COMMON),
    freqplotbuilder = c("bars", "xCategories", "facetSeparator",
                        "freqTests", "freqPooledNote", CH_COMMON),
    xyplotbuilder  = c("xyPoints", "xyFits", "xyStats", "xyEllipses",
                       "xyXLevels", "xyYLevels", CH_COMMON),
    rmplotbuilder  = c("bars", "xCategories", "groupCategories", "hasGroups",
                       "groupLabel", "groupLabelDefault", "xLabel", "yLabel",
                       "missingNote", "errorBarMethod", "summaryFunc",
                       "errorBarType"),
    corrplotbuilder = c("corrCells", "corrVars", "corrRaw", "corrMethod",
                        "missingNote"),
    likertplotbuilder = c("likertItems", "likertLevels", "likertCells",
                          "likertMeans", "likertAlpha", "likertContinuous",
                          "graphType", "graphTypeChoices", "missingNote")
)

# Ship the RAW payload JSON per case: an R fromJSON/toJSON round trip
# under Rscript's C locale mangles multibyte strings (the facet separator)
# into per-byte code points - the render.R artifact lesson. The Node probe
# parses the raw string and picks the channel keys itself.
# Raw payload bytes go to per-case files through a BINARY connection
# (render.R idiom): any path that treats the string as text in the C
# locale (incl. toJSON of a string field) mangles the multibyte facet
# separator into per-byte code points.
runs <- list()
addCase <- function(name, mod, roles, opts, res) {
    html <- getHtml(res)
    m <- regmatches(html, regexec("var __gb2_payload = (\\{.*?\\});\nvar __gb2_id = \"([^\"]+)\";", html))[[1]]
    if (length(m) != 3) stop(name, ": payload extraction failed")
    con <- file(file.path(OUT, paste0(name, ".payload.json")), open = "wb")
    writeLines(m[2], con, useBytes = TRUE)
    close(con)
    runs[[name]] <<- list(mod = mod, roles = roles, opts = opts,
                          channelKeys = as.list(CH[[mod]]))
    cat(name, "ok\n")
}

addCase("cg_basic", "plotbuilder",
        list(xvar = "grp3", yvar = "num1", groupVar = "g2", facetVar = "site"),
        list(),
        plotbuilder(data = d, xvar = "grp3", yvar = "num1", groupVar = "g2",
                    facetVar = "site", graphType = "bar", chartSpec = ""))
addCase("cg_median", "plotbuilder",
        list(xvar = "grp3", yvar = "num1"),
        list(summaryFunc = "median"),
        plotbuilder(data = d, xvar = "grp3", yvar = "num1", groupVar = NULL,
                    facetVar = NULL, graphType = "bar",
                    summaryFunc = "median", chartSpec = ""))
addCase("cg_ci95", "plotbuilder",
        list(xvar = "grp3", yvar = "num1", groupVar = "g2"),
        list(errorBarType = "ci95"),
        plotbuilder(data = d, xvar = "grp3", yvar = "num1", groupVar = "g2",
                    facetVar = NULL, graphType = "bar",
                    errorBarType = "ci95", chartSpec = ""))
addCase("dist_hist", "distplotbuilder",
        list(var = "num1", groupVar = "g2", facetVar = "site"),
        list(),
        distplotbuilder(data = d, var = "num1", groupVar = "g2",
                        facetVar = "site", graphType = "histogram", chartSpec = ""))
addCase("dist_box", "distplotbuilder",
        list(var = "num1"),
        list(graphType = "box"),
        distplotbuilder(data = d, var = "num1", groupVar = NULL,
                        facetVar = NULL, graphType = "box", chartSpec = ""))
addCase("freq_ind", "freqplotbuilder",
        list(var = "grp3", groupVar = "g2", facetVar = "site"),
        list(),
        freqplotbuilder(data = d, var = "grp3", groupVar = "g2",
                        facetVar = "site", graphType = "bar", chartSpec = ""))
addCase("freq_gof", "freqplotbuilder",
        list(var = "grp3"),
        list(),
        freqplotbuilder(data = d, var = "grp3", groupVar = NULL,
                        facetVar = NULL, graphType = "bar", chartSpec = ""))
addCase("freq_pie", "freqplotbuilder",
        list(var = "grp3", groupVar = "g2"),
        list(graphType = "pie"),
        freqplotbuilder(data = d, var = "grp3", groupVar = "g2",
                        facetVar = NULL, graphType = "pie", chartSpec = ""))
addCase("freq_par", "freqplotbuilder",
        list(var = "grp3", facetVar = "site"),
        list(graphType = "pareto"),
        freqplotbuilder(data = d, var = "grp3", groupVar = NULL,
                        facetVar = "site", graphType = "pareto", chartSpec = ""))
addCase("xy_lin", "xyplotbuilder",
        list(xvar = "num2", yvar = "num3", groupVar = "g2", facetVar = "site"),
        list(),
        xyplotbuilder(data = d, xvar = "num2", yvar = "num3", groupVar = "g2",
                      facetVar = "site", sizeVar = NULL, labelVar = NULL,
                      chartSpec = ""))
addCase("xy_poly2k", "xyplotbuilder",
        list(xvar = "num2", yvar = "num3"),
        list(xyFitType = "poly2", xyStatsCorrType = "kendall"),
        xyplotbuilder(data = d, xvar = "num2", yvar = "num3", groupVar = NULL,
                      facetVar = NULL, sizeVar = NULL, labelVar = NULL,
                      xyFitType = "poly2", xyStatsCorrType = "kendall",
                      chartSpec = ""))
addCase("xy_ties", "xyplotbuilder",
        list(xvar = "num1", yvar = "num3"),
        list(),
        xyplotbuilder(data = d, xvar = "num1", yvar = "num3", groupVar = NULL,
                      facetVar = NULL, sizeVar = NULL, labelVar = NULL,
                      chartSpec = ""))

addCase("rm_within", "rmplotbuilder",
        list(measures = list("m1", "m2", "m3"), betweenVar = "g2"),
        list(),
        rmplotbuilder(data = d, measures = c("m1", "m2", "m3"),
                      betweenVar = "g2", rm = NULL, rmCells = NULL, bs = NULL,
                      graphType = "line", chartSpec = ""))
addCase("rm_between", "rmplotbuilder",
        list(measures = list("m1", "m2", "m3")),
        list(errorBarMethod = "between"),
        rmplotbuilder(data = d, measures = c("m1", "m2", "m3"),
                      betweenVar = NULL, rm = NULL, rmCells = NULL, bs = NULL,
                      graphType = "line", errorBarMethod = "between",
                      chartSpec = ""))
addCase("rm_median", "rmplotbuilder",
        list(measures = list("m1", "m2")),
        list(summaryFunc = "median", errorBarType = "ci95"),
        rmplotbuilder(data = d, measures = c("m1", "m2"),
                      betweenVar = NULL, rm = NULL, rmCells = NULL, bs = NULL,
                      graphType = "bar", summaryFunc = "median",
                      errorBarType = "ci95", chartSpec = ""))
addCase("corr_p", "corrplotbuilder",
        list(vars = list("num1", "num2", "num3", "m1")),
        list(),
        corrplotbuilder(data = d, vars = c("num1", "num2", "num3", "m1"),
                        chartSpec = ""))
addCase("corr_k", "corrplotbuilder",
        list(vars = list("num2", "num3", "m1")),
        list(corrMethod = "kendall"),
        corrplotbuilder(data = d, vars = c("num2", "num3", "m1"),
                        corrMethod = "kendall", chartSpec = ""))
addCase("corr_s", "corrplotbuilder",
        list(vars = list("num2", "num3", "k1")),
        list(corrMethod = "spearman"),
        corrplotbuilder(data = d, vars = c("num2", "num3", "k1"),
                        corrMethod = "spearman", chartSpec = ""))
addCase("lk_factor", "likertplotbuilder",
        list(items = list("i1", "i2", "i3", "i4")),
        list(chartSpec = "{\"likertReverseItems\":[\"i2\"]}"),
        likertplotbuilder(data = d, items = c("i1", "i2", "i3", "i4"),
                          chartSpec = cspec(likertReverseItems = list("i2"))))
addCase("lk_num", "likertplotbuilder",
        list(items = list("k1", "k2")),
        list(),
        likertplotbuilder(data = d, items = c("k1", "k2"), chartSpec = ""))
addCase("lk_cont", "likertplotbuilder",
        list(items = list("c1", "num2", "num3")),
        list(),
        likertplotbuilder(data = d, items = c("c1", "num2", "num3"),
                          chartSpec = ""))

out <- list(table = tab, cases = runs)
con <- file(file.path(OUT, "expected.json"), open = "wb")
writeLines(as.character(jsonlite::toJSON(out, auto_unbox = TRUE, digits = I(10),
                                         null = "null")), con, useBytes = TRUE)
close(con)
cat("wrote", file.path(OUT, "expected.json"), "-", length(runs), "cases\n")
