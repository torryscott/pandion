# Render the verification battery: every module x key graph types +
# edge cases, written as self-contained HTML files for check.mjs.
#
# Usage:   Rscript scripts/verify/render.R
# Env:     GB2_VERIFY_OUT  output dir (default /tmp/gb2-verify)
#          GB2_BUNDLE      "source" (default) or "min" — which widget
#                          bundle to inline, so both are testable.
#
# This sources the working-tree R files directly (no install needed)
# and reaches into the jmvcore results object for the HTML — a dev
# harness idiom, not a pattern for production code.

# Rscript spells spaces in --file= as "~+~"; undo that before using it.
.self <- gsub("~+~", " ", sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE)[1]), fixed = TRUE)
ROOT <- normalizePath(file.path(dirname(.self), "..", ".."))
setwd(ROOT)
OUT <- Sys.getenv("GB2_VERIFY_OUT", "/tmp/gb2-verify")
dir.create(OUT, showWarnings = FALSE, recursive = TRUE)
# Isolate BOTH cross-file libraries (palettes + styles) from the real
# user config dir: battery output must not depend on what the developer
# has saved in jamovi - a real default palette/style would restyle every
# case and break exact-count assertions downstream (styles-check.mjs
# asserts an EMPTY style library on the cg pages). tools::R_user_dir
# honors R_USER_CONFIG_DIR at call time.
Sys.setenv(R_USER_CONFIG_DIR = file.path(OUT, "config"))
BUNDLE <- Sys.getenv("GB2_BUNDLE", "source")

suppressWarnings(suppressMessages({
    library(jmvcore); library(R6)
    source("R/palette_library.R"); source("R/style_library.R")
    source("R/utils.R")
    source("R/gb_family_core.R");  source("R/spec_explode.R"); source("R/widget.R")
    source("R/plotbuilder.h.R");     source("R/plotbuilder.b.R")
    source("R/rmplotbuilder.h.R");   source("R/rmplotbuilder.b.R")
    source("R/xyplotbuilder.h.R");   source("R/xyplotbuilder.b.R")
    source("R/distplotbuilder.h.R"); source("R/distplotbuilder.b.R")
    source("R/freqplotbuilder.h.R"); source("R/freqplotbuilder.b.R")
    source("R/corrplotbuilder.h.R"); source("R/corrplotbuilder.b.R")
    source("R/likertplotbuilder.h.R"); source("R/likertplotbuilder.b.R")
}))

.gb2_widget_js <- function() {
    f <- if (identical(BUNDLE, "min")) "inst/widget/graphbuilder2.min.js"
         else "inst/widget/graphbuilder2.js"
    paste(readLines(f, warn = FALSE, encoding = "UTF-8"), collapse = "\n")
}
environment(graphbuilder2_html) <- globalenv()
cspec <- function(...) { a <- list(...); if (length(a) == 0) "" else as.character(jsonlite::toJSON(a, auto_unbox = TRUE)) }


getHtml <- function(res) {
    w <- res$widget
    v <- tryCatch(w$content, error = function(e) NULL)
    if (is.null(v))
        v <- tryCatch(w$.__enclos_env__$private$.content, error = function(e) "")
    v
}
wr <- function(res, name) {
    con <- file(file.path(OUT, paste0(name, ".html")), open = "wb")
    # Explicit charset: file:// pages get charset-SNIFFED by Chromium
    # (production jamovi serves proper headers), and the heuristic can
    # flip with unrelated byte changes in the inlined bundle — one edit
    # turned an eta into mojibake and failed text assertions.
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

# --- Compare Groups -------------------------------------------------
wr(plotbuilder(data = cg, xvar = "x", yvar = "y", groupVar = "g", facetVar = NULL,
               graphType = "bar", chartSpec = cspec(barValueLabels = TRUE, barNLabels = TRUE)), "cg_bar_labels")
# A full 12-slot custom palette on a 12-group chart, so every stored
# colour has to survive the pipeline AND get drawn. customPalette is a
# comma-joined LIST, and a per-colour length cap applied to the whole
# string once wiped any palette past eight (Aug 2026 audit); nothing
# else in this battery would notice.
set.seed(12)
pal12 <- data.frame(
    x = factor(rep(c("A", "B"), each = 24)),
    y = rnorm(48, 50, 8),
    g = factor(rep(paste0("G", sprintf("%02d", 1:12)), 4)))
wr(plotbuilder(data = pal12, xvar = "x", yvar = "y", groupVar = "g",
               facetVar = NULL, graphType = "bar",
               chartSpec = cspec(chartPalette = "custom",
                                 customPalette = paste(c(
                                     "#2d5c94", "#902634", "#e18e4c", "#597b2f",
                                     "#faca59", "#32295e", "#5bb1ba", "#d35a80",
                                     "#4478ad", "#6fb3ad", "#266741", "#976d76"),
                                     collapse = ","))), "cg_palette12")

wr(plotbuilder(data = cg, xvar = "x", yvar = "y", groupVar = "g", facetVar = NULL,
               graphType = "dot"), "cg_dot")
wr(plotbuilder(data = cg, xvar = "x", yvar = "y", groupVar = "g", facetVar = NULL,
               graphType = "box"), "cg_box")
wr(plotbuilder(data = cg, xvar = "x", yvar = "y", groupVar = "g", facetVar = NULL,
               graphType = "violin"), "cg_violin")
wr(plotbuilder(data = cg, xvar = "x", yvar = "y", groupVar = "g", facetVar = NULL,
               graphType = "raincloud"), "cg_raincloud")

# --- Repeated Measures ----------------------------------------------
set.seed(5)
rmd <- data.frame(t1 = rnorm(40, 10, 2), t2 = rnorm(40, 12, 2),
                  t3 = rnorm(40, 13, 2), sex = rep(c("M", "F"), 20))
# The simple `measures`+`betweenVar` cases exercise the OLD-file back-compat
# path (both options are now hidden tombstones but still render). `bs = NULL`
# is required because the generated wrapper evaluates every variable-role arg.
wr(rmplotbuilder(data = rmd, measures = c("t1", "t2", "t3"), bs = NULL,
                 betweenVar = "sex"), "rm_line")
wr(rmplotbuilder(data = rmd, measures = c("t1", "t2", "t3"), bs = NULL,
                 betweenVar = "sex", graphType = "bar"), "rm_bar")
wr(rmplotbuilder(data = rmd, measures = c("t1", "t2", "t3"), bs = NULL,
                 betweenVar = "sex", graphType = "dot"), "rm_dot")

# CROSSED within-subjects factors: the Cells box holds one drop target per
# level COMBINATION, so any factor can go on the X-axis / Grouped by / Panels
# and two within factors can share one chart. Here Time(3) x Emotion(2) with no
# between: default one-per-slot -> x=Time, grouped=Emotion. 2 lines, 6 markers /
# error bars. rm/rmCells passed via do.call so the list values are evaluated
# (the wrapper NSE-quotes bare arg expressions).
set.seed(17)
rm2 <- data.frame(
    t1h = rnorm(48, 10, 2), t1s = rnorm(48, 14, 2),   # Time1 x {Happy, Sad}
    t2h = rnorm(48, 12, 2), t2s = rnorm(48, 15, 2),   # Time2
    t3h = rnorm(48, 13, 2), t3s = rnorm(48, 16, 2))   # Time3
rm2_rm <- list(list(label = "Time",    levels = list("T1", "T2", "T3")),
               list(label = "Emotion", levels = list("Happy", "Sad")))
rm2_cells <- list(
    list(measure = "t1h", cell = list("T1", "Happy")), list(measure = "t1s", cell = list("T1", "Sad")),
    list(measure = "t2h", cell = list("T2", "Happy")), list(measure = "t2s", cell = list("T2", "Sad")),
    list(measure = "t3h", cell = list("T3", "Happy")), list(measure = "t3s", cell = list("T3", "Sad")))
wr(do.call(rmplotbuilder, list(data = rm2, measures = NULL, rm = rm2_rm,
        rmCells = rm2_cells, bs = NULL, betweenVar = NULL,
        graphType = "line")), "rm_twoway_within")

# CROSSED single within factor (Cond) + TWO between factors -> x=Cond,
# grouped=Drug, panelled=Sex. 4 lines (2 Drug x 2 Sex panels), 8 markers /
# error bars. A single crossed factor makes one-element cells (its levels).
set.seed(23)
rm3 <- data.frame(
    c1 = rnorm(48, 10, 2), c2 = rnorm(48, 12, 2),         # Cond levels
    Drug = rep(c("Drug", "Placebo"), 24),
    Sex  = rep(c("M", "F"), each = 24))
rm3_rm <- list(list(label = "Cond", levels = list("C1", "C2")))
rm3_cells <- list(
    list(measure = "c1", cell = list("C1")), list(measure = "c2", cell = list("C2")))
wr(do.call(rmplotbuilder, list(data = rm3, measures = NULL, rm = rm3_rm,
        rmCells = rm3_cells, bs = c("Drug", "Sex"), betweenVar = NULL,
        graphType = "line")), "rm_mixed_bs")

# CROSSED two within factors (Time x Emotion) + a between grp -> x=Time,
# grouped=Emotion, panelled=grp: an interaction plot faceted by the between.
# 4 lines, 8 markers. Both within factors shown at once (the crossing).
set.seed(31)
rmc <- data.frame(
    Hap_T1 = rnorm(48, 10, 2), Hap_T2 = rnorm(48, 13, 2),
    Sad_T1 = rnorm(48,  8, 2), Sad_T2 = rnorm(48,  9, 2),
    grp = rep(c("Drug", "Placebo"), 24))
rmc_rm <- list(list(label = "Time",    levels = list("T1", "T2")),
               list(label = "Emotion", levels = list("Happy", "Sad")))
rmc_cells <- list(
    list(measure = "Hap_T1", cell = list("T1", "Happy")), list(measure = "Hap_T2", cell = list("T2", "Happy")),
    list(measure = "Sad_T1", cell = list("T1", "Sad")),   list(measure = "Sad_T2", cell = list("T2", "Sad")))
wr(do.call(rmplotbuilder, list(data = rmc, measures = NULL, rm = rmc_rm,
        rmCells = rmc_cells, bs = "grp", betweenVar = NULL,
        graphType = "line")), "rm_crossed")

# --- Scatter ----------------------------------------------------------
set.seed(3)
sc <- data.frame(x = rnorm(150), y = rnorm(150),
                 g = rep(c("A", "B", "C"), 50),
                 f = rep(c("Panel A", "Panel B"), 75))
wr(xyplotbuilder(data = sc, xvar = "x", yvar = "y", groupVar = "g", facetVar = NULL,
                 sizeVar = NULL, labelVar = NULL), "xy_basic")
wr(xyplotbuilder(data = sc, xvar = "x", yvar = "y", groupVar = "g", facetVar = "f",
                 sizeVar = NULL, labelVar = NULL,
                 chartSpec = cspec(facetLayout = "wrap", facetWrapCols = 1)), "xy_facet")
wr(xyplotbuilder(data = sc, xvar = "x", yvar = "y", groupVar = NULL, facetVar = NULL,
                 sizeVar = NULL, labelVar = NULL,
                 chartSpec = cspec(xyShowFit = TRUE, xyShowCI = TRUE)), "xy_fit_ci")
wr(xyplotbuilder(data = sc, xvar = "x", yvar = "y", groupVar = NULL, facetVar = NULL,
                 sizeVar = NULL, labelVar = NULL, xyBin = "square"), "xy_heatmap")
set.seed(9)
ln <- data.frame(x = rlnorm(150, 3, 1), y = rlnorm(150, 2, 1.2))
wr(xyplotbuilder(data = ln, xvar = "x", yvar = "y", groupVar = NULL, facetVar = NULL,
                 sizeVar = NULL, labelVar = NULL,
                 chartSpec = cspec(xyXScale = "log10", xyYScale = "log10")), "xy_log")
# Small Wins: bubble sizing + per-point labels (20 pts so labels show).
set.seed(11)
scl <- data.frame(x = rnorm(20), y = rnorm(20),
                  g = rep(c("A", "B"), 10),
                  wt = runif(20, 1, 9),
                  id = paste0("P", sprintf("%02d", 1:20)))
wr(xyplotbuilder(data = scl, xvar = "x", yvar = "y", groupVar = "g", facetVar = NULL,
                 sizeVar = "wt", labelVar = "id"), "xy_bubble_labels")

# --- Distribution ----------------------------------------------------
set.seed(11)
dd <- data.frame(y = c(rnorm(90, 50, 10), rnorm(90, 60, 8)),
                 grp = rep(c("A", "B"), each = 90))
wr(distplotbuilder(data = dd, var = "y", groupVar = "grp", facetVar = NULL,
                   graphType = "histogram"), "dist_hist")
wr(distplotbuilder(data = dd, var = "y", groupVar = "grp", facetVar = NULL,
                   graphType = "histogram", chartSpec = cspec(distNormalCurve = TRUE)), "dist_hist_normal")
wr(distplotbuilder(data = dd, var = "y", groupVar = "grp", facetVar = NULL,
                   graphType = "density"), "dist_density")
wr(distplotbuilder(data = dd, var = "y", groupVar = "grp", facetVar = NULL,
                   graphType = "histdensity"), "dist_histdensity")
wr(distplotbuilder(data = dd, var = "y", groupVar = "grp", facetVar = NULL,
                   graphType = "qq", chartSpec = cspec(qqBand = TRUE)), "dist_qq_band")
wr(distplotbuilder(data = dd, var = "y", groupVar = "grp", facetVar = NULL,
                   graphType = "ecdf"), "dist_ecdf")
wr(distplotbuilder(data = dd, var = "y", groupVar = "grp", facetVar = NULL,
                   graphType = "box"), "dist_box")

# --- Frequencies ------------------------------------------------------
set.seed(13)
fqd <- data.frame(
    resp = factor(sample(c("Agree", "Neutral", "Disagree"), 200, TRUE, prob = c(.5, .3, .2))),
    cohort = factor(sample(c("2023", "2024"), 200, TRUE)),
    site = factor(sample(c("North", "South"), 200, TRUE)))
wr(freqplotbuilder(data = fqd, var = "resp", groupVar = "cohort", facetVar = NULL,
                   freqPosition = "stack", chartSpec = cspec(barValueLabels = TRUE)), "freq_bar_stack")
wr(freqplotbuilder(data = fqd, var = "resp", groupVar = "cohort", facetVar = "site",
                   freqPosition = "fill"), "freq_bar_fill_facet")
wr(freqplotbuilder(data = fqd, var = "resp", groupVar = NULL, facetVar = NULL,
                   graphType = "pie"), "freq_pie")
wr(freqplotbuilder(data = fqd, var = "resp", groupVar = "cohort", facetVar = NULL,
                   graphType = "donut"), "freq_donut_pooled")
# Sliver slices (< 4.5%) get leader-line callouts instead of inside labels;
# two adjacent slivers exercise the per-side anti-overlap nudge.
fqsm <- data.frame(resp = factor(c(rep("P", 90), rep("Q", 60),
                                   rep("R", 4), rep("S", 3))))
wr(freqplotbuilder(data = fqsm, var = "resp", groupVar = NULL, facetVar = NULL,
                   graphType = "pie"), "freq_pie_callout")
wr(freqplotbuilder(data = fqd, var = "resp", groupVar = NULL, facetVar = NULL,
                   graphType = "pareto"), "freq_pareto")

# --- Correlation Matrix ------------------------------------------------
set.seed(23)
crn <- 140
crd <- local({
    a <- rnorm(crn); b <- 0.6 * a + rnorm(crn, 0, 0.75)
    c <- -0.45 * a + rnorm(crn, 0, 0.85); d <- rnorm(crn)
    data.frame(Anxiety = a, Depression = b, Sleep = c, Height = d)
})
crd$Anxiety[sample(crn, 10)] <- NA
wr(corrplotbuilder(data = crd, vars = names(crd)), "corr_heat")
wr(corrplotbuilder(data = crd, vars = names(crd), graphType = "corrcircles"), "corr_circles")
wr(corrplotbuilder(data = crd, vars = names(crd), graphType = "corrnumbers",
                   chartSpec = cspec(corrSigStars = TRUE, corrSigTreat = "fade")), "corr_numbers")
wr(corrplotbuilder(data = crd, vars = c("Anxiety", "Depression")), "corr_two")
wr(corrplotbuilder(data = crd, vars = "Anxiety"), "corr_one_placeholder")

# --- Likert / Survey ---------------------------------------------------
set.seed(29)
lkv <- c("Strongly Disagree", "Disagree", "Neutral", "Agree", "Strongly Agree")
lmk <- function(p) factor(sample(lkv, 150, TRUE, prob = p), levels = lkv)
lkd <- data.frame(EnjoyClass = lmk(c(.05, .10, .15, .40, .30)),
                  FairGrading = lmk(c(.15, .25, .25, .25, .10)),
                  Workload = lmk(c(.25, .30, .25, .15, .05)))
wr(likertplotbuilder(data = lkd, items = names(lkd)), "likert_div")
wr(likertplotbuilder(data = lkd, items = names(lkd),
                     graphType = "likertstacked"), "likert_stacked")
wr(likertplotbuilder(data = lkd, items = names(lkd),
                     graphType = "likertmeans"), "likert_means")
# Reverse-scored item: counts mirror across the scale, label gains (R).
wr(likertplotbuilder(data = lkd, items = names(lkd),
                     chartSpec = cspec(likertReverseItems = list("Workload"))), "likert_reverse")
lkn <- data.frame(Q1 = sample(1:5, 90, TRUE), Q2 = sample(1:5, 90, TRUE))
wr(likertplotbuilder(data = lkn, items = c("Q1", "Q2")), "likert_numeric")
# Continuous battery (>25 distinct values, all numeric): routes to the
# means-only path - dots + t CIs on a numeric axis, no stacking.
lkc <- data.frame(x = rnorm(60), y = rnorm(60))
wr(likertplotbuilder(data = lkc, items = c("x", "y")), "likert_continuous")
# Non-numeric many-level battery still refused (means are impossible).
lkf <- data.frame(x = factor(paste0("r", 1:30)), y = factor(paste0("r", 1:30)))
wr(likertplotbuilder(data = lkf, items = c("x", "y")), "likert_textrefuse")

# --- Edge cases -------------------------------------------------------
allna <- data.frame(y = as.numeric(rep(NA, 30)), g = rep(c("A", "B"), 15))
wr(distplotbuilder(data = allna, var = "y", groupVar = "g", facetVar = NULL,
                   graphType = "histogram"), "edge_allna")
one <- data.frame(y = c(42, rep(NA, 9)))
wr(distplotbuilder(data = one, var = "y", groupVar = NULL, facetVar = NULL,
                   graphType = "histogram"), "edge_n1_hist")
wr(distplotbuilder(data = one, var = "y", groupVar = NULL, facetVar = NULL,
                   graphType = "qq"), "edge_n1_qq")
# Single-category factor: the as.list()/auto_unbox regression trap — a
# one-element xCategories must still reach the JS as an array.
onecat <- data.frame(k = factor(rep("Only", 12)))
wr(freqplotbuilder(data = onecat, var = "k", groupVar = NULL, facetVar = NULL), "freq_single_cat")
fqna <- data.frame(k = factor(c(NA, NA, NA)))
wr(freqplotbuilder(data = fqna, var = "k", groupVar = NULL, facetVar = NULL), "freq_allna")

cat("battery complete ->", OUT, "(bundle:", BUNDLE, ")\n")
