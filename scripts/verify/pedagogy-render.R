# Pedagogy panel probe, render half: targeted cases for the "?" help-panel
# features (Which graph? blurbs/thumbs/trade-offs, Check graph rules incl.
# CVD + faceting, Label parts chips + live-settings copy, Basics rows) and
# the Help Me Choose wizard (batteries, caps, big-N steer, grouping-vs-
# panels). pedagogy-check.mjs drives the rendered pages and asserts the
# copy. Run via scripts/verify/run.sh --extras.
#
# Env:  GB2_PEDAGOGY_OUT  output dir (default /tmp/gb2-pedagogy)
# Exit: 2 when jmvcore is unavailable (run.sh treats that as a skip).
if (!requireNamespace("jmvcore", quietly = TRUE)) {
    cat("jmvcore not available; skipping pedagogy probe\n")
    quit(status = 2)
}
# Rscript spells spaces in --file= as "~+~"; undo that before using it.
.self <- gsub("~+~", " ", sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE)[1]), fixed = TRUE)
ROOT <- normalizePath(file.path(dirname(.self), "..", ".."))
setwd(ROOT)
OUT <- Sys.getenv("GB2_PEDAGOGY_OUT", "/tmp/gb2-pedagogy")
dir.create(OUT, showWarnings = FALSE, recursive = TRUE)

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
    source("R/helpmechoose_wizard.R")
    source("R/helpmechoose.h.R");    source("R/helpmechoose.b.R")
}))

# GB2_BUNDLE "source" (default) or "min", mirroring render.R, so the
# pedagogy surfaces (lint copy, chooser blurbs, anatomy chips, wizard) can
# be verified on BOTH bundles. Added Jul 2026 with the crowded-axis label
# thinning: the minifier prop-mangles /^_/ properties, so any rule that
# reads or stamps one has to be proven on the shipped bundle too.
BUNDLE <- Sys.getenv("GB2_BUNDLE", "source")
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
    writeLines(getHtml(res), con, useBytes = TRUE)
    close(con)
    cat("wrote", name, "\n")
}

set.seed(42)

# 1. CG bar: SD error bars + bracket + refLine + rect shape + facets.
cgd <- data.frame(
    x = rep(c("Ctrl", "Drug"), each = 30),
    y = c(rnorm(30, 10, 3), rnorm(30, 14, 3)),
    f = rep(rep(c("Lab1", "Lab2"), 15), 2))
ann <- paste0(
    '[{"id":"ann_p1","kind":"bracket","x":150,"x2":300,"y":40,"text":"*","fontSize":13},',
    '{"id":"ann_p2","kind":"refLine","orientation":"horizontal","x":0,"y":170,',
    '"lineStyle":"dashed","lineColor":"#000000","lineWidth":1},',
    '{"id":"ann_p3","kind":"rect","x":220,"y":120,"x2":320,"y2":180}]')
wr(plotbuilder(data = cgd, xvar = "x", yvar = "y", groupVar = NULL, facetVar = "f",
               graphType = "bar", errorBarType = "sd", annotationsJson = ann),
   "p_cg_anat")

# 2. Scatter: ellipse + rug + 2-D contours (anatomy) + heatmap blurb (chooser).
scd <- data.frame(x = rnorm(80), y = rnorm(80), g = rep(c("A", "B"), 40))
wr(xyplotbuilder(data = scd, xvar = "x", yvar = "y", groupVar = "g", facetVar = NULL,
                 sizeVar = NULL, labelVar = NULL, xyShowDensity2D = TRUE,
                 chartSpec = cspec(xyShowEllipse = TRUE, xyRug = "both")),
   "p_xy_anat")

# 3. Overplotted scatter -> lint tip + one-click Switch to Heatmap.
sco <- data.frame(x = rnorm(600), y = rnorm(600))
wr(xyplotbuilder(data = sco, xvar = "x", yvar = "y", groupVar = NULL, facetVar = NULL,
                 sizeVar = NULL, labelVar = NULL), "p_xy_overplot")

# 4. Heatmap with few points -> lint tip + one-click Switch to Scatter.
scf <- data.frame(x = rnorm(60), y = rnorm(60))
wr(xyplotbuilder(data = scf, xvar = "x", yvar = "y", groupVar = NULL, facetVar = NULL,
                 sizeVar = NULL, labelVar = NULL, xyBin = "square"),
   "p_xy_heatfew")

# 5-7. Distribution: small-n qq, small-n density, over-binned histogram.
dsm <- data.frame(y = rnorm(12, 50, 8))
wr(distplotbuilder(data = dsm, var = "y", groupVar = NULL, facetVar = NULL,
                   graphType = "qq"), "p_dist_qq_small")
wr(distplotbuilder(data = dsm, var = "y", groupVar = NULL, facetVar = NULL,
                   graphType = "density"), "p_dist_dens_small")
dh <- data.frame(y = rnorm(40, 50, 8))
wr(distplotbuilder(data = dh, var = "y", groupVar = NULL, facetVar = NULL,
                   graphType = "histogram", histBins = 60),
   "p_dist_bins")

# 8. Correlation: 5 vars (10 pairs, stars on) with one nearly-empty column.
cr <- as.data.frame(matrix(rnorm(150), ncol = 5)); names(cr) <- paste0("v", 1:5)
cr$v5[7:30] <- NA
wr(corrplotbuilder(data = cr, vars = paste0("v", 1:5), chartSpec = cspec(corrSigStars = TRUE)),
   "p_corr_lint")

# 9. Likert item means on a 4-point scale with one sparse item (n = 6).
lk <- data.frame(
    A = factor(sample(1:4, 30, TRUE), levels = 1:4),
    B = factor(sample(1:4, 30, TRUE), levels = 1:4),
    C = factor(sample(1:4, 30, TRUE), levels = 1:4),
    D = factor(c(sample(1:4, 6, TRUE), rep(NA, 24)), levels = 1:4))
wr(likertplotbuilder(data = lk, items = c("A", "B", "C", "D"),
                     graphType = "likertmeans"), "p_likert_lint")

# 10. CVD lint: custom red/green pair - a TRUE deuteranopia merge (0.003
# dOK under the corrected Vienot simulation, t4-145) that the
# normal-vision color rule does NOT flag (hue-opposed, so
# _paletteColorDist is far above 16). The old fixture pair
# (#edc949/#ff9da7 yellow/pink) was chosen by the pre-2026 improvised
# matrices and is genuinely SEPARABLE for deutan/protan under the
# accurate simulation - it only merges under tritanopia, which the lint
# deliberately does not test (prevalence; the Vision tiles cover it).
cvd <- data.frame(x = rep(c("A", "B"), each = 20), y = rnorm(40, 10, 2),
                  g = rep(c("G1", "G2"), 20))
wr(plotbuilder(data = cvd, xvar = "x", yvar = "y", groupVar = "g", facetVar = NULL,
               chartSpec = cspec(chartPalette = "custom", customPalette = "#e15759,#59a14f")),
   "p_cg_cvd")

# 11-13. Help Me Choose data-route refinements.
lk2 <- data.frame(
    Q1 = factor(sample(1:5, 30, TRUE), levels = 1:5),
    Q2 = factor(sample(1:5, 30, TRUE), levels = 1:5))
wr(helpmechoose(data = lk2, vars = c("Q1", "Q2")), "w_likert2")

lk5 <- data.frame(
    A = factor(sample(1:5, 30, TRUE), levels = 1:5),
    B = factor(sample(1:5, 30, TRUE), levels = 1:5),
    C = factor(sample(1:5, 30, TRUE), levels = 1:5),
    D = factor(sample(1:5, 30, TRUE), levels = 1:5),
    gender = factor(sample(c("M", "F"), 30, TRUE)))
wr(helpmechoose(data = lk5, vars = c("A", "B", "C", "D", "gender")), "w_likert_extra")

big <- data.frame(x = rnorm(800), y = rnorm(800))
wr(helpmechoose(data = big, vars = c("x", "y")), "w_bign")

# 13b. Wizard battery/numeric interactions (Jul 2026 fixes): a numeric 1-5
# battery + gender (Likert primary, banner points at RM), the same battery +
# a stray continuous (battery-scoped counts + leave-it-out caps on Likert AND
# the RM alt), a factor battery + age (Likert primary with a Compare Groups
# alt instead of the old silent CG fall-through), a time-named numeric
# battery (the RM-primary flip), and a battery beside unrelated sequential
# t1/t2 timings (the battery-scoped flip must NOT fire). sample(rep(...))
# keeps every level present so the shared-signature match is deterministic.
nb <- data.frame(q1 = sample(rep(1:5, 8)), q2 = sample(rep(1:5, 8)),
                 q3 = sample(rep(1:5, 8)), q4 = sample(rep(1:5, 8)),
                 gender = factor(sample(c("M", "F"), 40, TRUE)))
wr(helpmechoose(data = nb, vars = c("q1", "q2", "q3", "q4", "gender")), "w_numbat")

nba <- data.frame(q1 = sample(rep(1:5, 8)), q2 = sample(rep(1:5, 8)),
                  q3 = sample(rep(1:5, 8)), q4 = sample(rep(1:5, 8)),
                  q5 = sample(rep(1:5, 8)), age = rnorm(40, 40, 10))
wr(helpmechoose(data = nba, vars = c("q1", "q2", "q3", "q4", "q5", "age")), "w_numbat_age")

fba <- data.frame(A = factor(sample(rep(1:5, 8)), levels = 1:5),
                  B = factor(sample(rep(1:5, 8)), levels = 1:5),
                  C = factor(sample(rep(1:5, 8)), levels = 1:5),
                  D = factor(sample(rep(1:5, 8)), levels = 1:5),
                  age = rnorm(40, 40, 10))
wr(helpmechoose(data = fba, vars = c("A", "B", "C", "D", "age")), "w_factbat_age")

tf <- data.frame(t1 = sample(rep(1:7, 6)), t2 = sample(rep(1:7, 6)),
                 t3 = sample(rep(1:7, 6)))
wr(helpmechoose(data = tf, vars = c("t1", "t2", "t3")), "w_timeflip")

tsc <- data.frame(q1 = sample(rep(1:5, 8)), q2 = sample(rep(1:5, 8)),
                  q3 = sample(rep(1:5, 8)), t1 = rnorm(40), t2 = rnorm(40))
wr(helpmechoose(data = tsc, vars = c("q1", "q2", "q3", "t1", "t2")), "w_timeflip_scoped")

# 13d. Ordinal battery where two items carry a REVERSE-ORDERED stored level
# set (the reverse-scored-item pattern; Torry's Jul 10 2026 field report).
# The level-set signature is order-insensitive, so all four join ONE
# battery: Likert primary with NO "no single chart" banner and NO
# no-grouping-slot cap naming battery members.
obr <- data.frame(
    q1 = factor(sample(1:5, 40, TRUE), levels = 1:5, ordered = TRUE),
    q2 = factor(sample(1:5, 40, TRUE), levels = 5:1, ordered = TRUE),
    q3 = factor(sample(1:5, 40, TRUE), levels = 1:5, ordered = TRUE),
    q5 = factor(sample(1:5, 40, TRUE), levels = 5:1, ordered = TRUE))
wr(helpmechoose(data = obr, vars = c("q1", "q2", "q3", "q5")), "w_ordbat_rev")

# 14. Faceting rules: a rare panel (n = 8) and undisclosed free Y.
fth <- data.frame(
    x = c(rep(c("A", "B"), 26), rep(c("A", "B"), 4)),
    y = rnorm(60, 10, 2),
    f = c(rep("Main", 52), rep("Rare", 8)))
wr(plotbuilder(data = fth, xvar = "x", yvar = "y", groupVar = NULL, facetVar = "f",
               graphType = "bar"), "p_cg_facet_thin")

ffy <- data.frame(
    x = rep(c("A", "B"), 30),
    y = c(rnorm(30, 10, 2), rnorm(30, 40, 8)),
    f = rep(c("Lab1", "Lab2"), each = 30))
wr(plotbuilder(data = ffy, xvar = "x", yvar = "y", groupVar = NULL, facetVar = "f",
               graphType = "bar", chartSpec = cspec(facetFreeY = TRUE)), "p_cg_freey")

# 15. Wizard: 1 numeric + 2 categoricals -> grouping-vs-panels teaching block.
cg2 <- data.frame(y = rnorm(40, 10, 2),
                  g1 = factor(rep(c("M", "F"), 20)),
                  g2 = factor(rep(c("S1", "S2"), each = 20)))
wr(helpmechoose(data = cg2, vars = c("y", "g1", "g2")), "w_cg2cat")

# 16. Identifier-in-a-category-slot (Jul 2026, Torry's wall-of-IDs chart)
# plus its false-positive guard, and the crowded-axis label thinning that
# rides the same shape. See the catsingle / xcatthin rules in the bundle.

# 16a. The accident itself: a per-row ID column in the X slot. 40 levels,
# 40 observations, every level a singleton. Fires catsingle AND (40 long
# names on one axis) the label thinning.
idc <- data.frame(subject_id = factor(sprintf("TSD-AM-%02d", 1:40)),
                  score = rnorm(40, 10, 2))
wr(plotbuilder(data = idc, xvar = "subject_id", yvar = "score", groupVar = NULL,
               facetVar = NULL, graphType = "bar"), "p_cg_idcat")

# 16b. MANY categories, each with real data (30 levels / 240 observations):
# the axis is crowded so the labels thin, but catsingle must stay silent -
# a lot of categories is not the same defect as a column of row labels.
mnc <- data.frame(cat = factor(rep(sprintf("Condition %02d", 1:30), each = 8)),
                  y = rnorm(240, 10, 2))
wr(plotbuilder(data = mnc, xvar = "cat", yvar = "y", groupVar = NULL,
               facetVar = NULL, graphType = "bar"), "p_cg_manycat")

# 16c. THE false-positive guard: legitimate long-tail count data. 20 levels,
# 16 of them singletons (gate 1 passes), but 216 observations, so the level
# count is nowhere near the observation count (gate 2 fails) and the rule
# must stay quiet. Rare countries are real data, not a mis-paste.
ltc <- data.frame(country = factor(c(sprintf("Rare%02d", 1:16),
                                     rep(c("USA", "UK", "CAN", "AUS"), each = 50))))
wr(freqplotbuilder(data = ltc, var = "country", groupVar = NULL, facetVar = NULL,
                   graphType = "bar"), "p_freq_longtail")

# 16d. The same accident on Frequencies: counting a row-label column.
fid <- data.frame(row_label = factor(sprintf("R-%03d", 1:36)))
wr(freqplotbuilder(data = fid, var = "row_label", groupVar = NULL, facetVar = NULL,
                   graphType = "bar"), "p_freq_idcat")

# 16e. The ID in the COLOR GROUPING slot instead: two honest categories, but
# 40 single-observation groups. The category role passes, the group role
# fires, and the copy must name the Group By slot.
idg <- data.frame(cond = factor(rep(c("A", "B"), 20)),
                  y = rnorm(40, 10, 2),
                  pid = factor(sprintf("S%02d", 1:40)))
wr(plotbuilder(data = idg, xvar = "cond", yvar = "y", groupVar = "pid",
               facetVar = NULL, graphType = "bar"), "p_cg_idgroup")

# 16f. The legitimate n = 1 design the rule must never scold: a single-subject
# repeated-measures series. 20 occasions, one observation each. RM categories
# are measure columns the user picked by hand, so RM is exempt on that role.
rs1 <- as.data.frame(as.list(stats::setNames(
    as.numeric(c(4, 5, 6, 6, 7, 8, 8, 9, 9, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15)),
    sprintf("t%02d", 1:20))))
wr(rmplotbuilder(data = rs1, measures = sprintf("t%02d", 1:20), bs = NULL,
                 betweenVar = NULL, graphType = "line"), "p_rm_single")

# 16g. Horizontal mode: the category axis runs down the LEFT, so crowding is
# vertical and the labels stack rather than rotate. Its own stride path.
hmc <- data.frame(cat = factor(rep(sprintf("Group %02d", 1:40), each = 3)),
                  y = rnorm(120, 10, 2))
wr(plotbuilder(data = hmc, xvar = "cat", yvar = "y", groupVar = NULL,
               facetVar = NULL, graphType = "bar",
               chartSpec = cspec(chartOrientation = "horizontal")), "p_cg_horizmany")

cat("probe render done\n")
