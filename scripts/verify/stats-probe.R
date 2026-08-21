# Stats-suite probe (bracket stats + the Sigma Statistics panel):
# renders ~30 fixtures through the REAL analyses (render.R idiom),
# computes R-side expected values into expected.json, and
# stats-probe.mjs asserts ~240 behaviors against them — bracket tests
# and corrections, the Sigma panels of all 7 modules, Compare pairs +
# Place brackets, table<->chart linking, sticky stats mode, the
# Cmd/Ctrl+click gesture, focus card + steppers, folds, windowed
# tables, the dist Frequency-table tab, and the picker handoff.
# Run via scripts/verify/run.sh --extras. Exit 2 = jmvcore missing.
.self <- gsub("~+~", " ", sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE)[1]), fixed = TRUE)
ROOT <- normalizePath(file.path(dirname(.self), "..", ".."))
setwd(ROOT)
OUT <- Sys.getenv("GB2_STATS_PROBE_OUT", "/tmp/gb2-stats-probe")
dir.create(OUT, showWarnings = FALSE, recursive = TRUE)
if (!requireNamespace("jmvcore", quietly = TRUE)) {
    message("stats-probe: jmvcore not installed in this R library - skipping")
    quit(status = 2)
}

suppressWarnings(suppressMessages({
    library(jmvcore); library(R6)
    source("R/palette_library.R"); source("R/style_library.R")
    source("R/utils.R")
    source("R/gb_family_core.R");  source("R/spec_explode.R"); source("R/widget.R")
    source("R/plotbuilder.h.R");     source("R/plotbuilder.b.R")
    source("R/rmplotbuilder.h.R");   source("R/rmplotbuilder.b.R")
}))

.gb2_widget_js <- function() {
    paste(readLines("inst/widget/graphbuilder2.js", warn = FALSE, encoding = "UTF-8"),
          collapse = "\n")
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
    # explicit charset: file:// pages get charset-SNIFFED by Chromium,
    # and the heuristic can flip with unrelated byte changes (eta
    # rendered as mojibake after one bundle edit)
    writeLines('<meta charset="utf-8">', con, useBytes = TRUE)
    writeLines(getHtml(res), con, useBytes = TRUE)
    close(con)
    cat("wrote", name, "\n")
}

annJson <- function(test, fmt, lcat, rcat, text = "*") {
    sprintf(paste0(
        '[{"id":"probe1","kind":"bracket","text":"%s","x":150,"y":60,"x2":350,',
        '"autoPValue":true,"autoPTest":"%s","autoPFormat":"%s",',
        '"anchorLeftCat":"%s","anchorLeftGroup":"","anchorRightCat":"%s",',
        '"anchorRightGroup":""}]'), text, test, fmt, lcat, rcat)
}

# ---- Case A: RM, autoPTest "auto" -> must resolve to PAIRED t --------
t1 <- c(4.1, 5.3, 6.2, 4.8, 5.9, 6.4, 5.1, 4.6)
t2 <- t1 + c(1.2, 0.8, 1.5, 0.9, 1.1, 1.3, 0.7, 1.4)
rmd <- data.frame(t1 = t1, t2 = t2)
wr(rmplotbuilder(data = rmd, measures = c("t1", "t2"), bs = NULL, betweenVar = NULL, graphType = "bar",
                 annotationsJson = annJson("auto", "apa", "t1", "t2")),
   "a_rm_auto")

# ---- Case B: CG, persisted "pairedT" -> must REFUSE (fallback text) --
set.seed(1)
cgd <- data.frame(x = rep(c("A", "B"), each = 12),
                  y = c(rnorm(12, 10, 2), rnorm(12, 13, 2)))
wr(plotbuilder(data = cgd, xvar = "x", yvar = "y", groupVar = NULL, facetVar = NULL, graphType = "bar",
               annotationsJson = annJson("pairedT", "apa", "A", "B",
                                         text = "MANUAL")),
   "b_cg_paired_refused")

# ---- Case C: RM + Tukey persisted -> raw p passthrough + disclosure --
wr(rmplotbuilder(data = rmd, measures = c("t1", "t2"), bs = NULL, betweenVar = NULL, graphType = "bar",
                 chartSpec = cspec(autoPCorrection = "tukey"),
                 annotationsJson = annJson("auto", "apa", "t1", "t2")),
   "c_rm_tukey")

# ---- Case D: CG + Tukey on Welch brackets -> still really corrects ---
set.seed(2)
cg3 <- data.frame(x = rep(c("A", "B", "C"), each = 12),
                  y = c(rnorm(12, 10, 2), rnorm(12, 12, 2), rnorm(12, 14, 2)))
ann2 <- paste0(
    '[{"id":"pr1","kind":"bracket","text":"*","x":100,"y":50,"x2":250,',
    '"autoPValue":true,"autoPTest":"welch","autoPFormat":"p",',
    '"anchorLeftCat":"A","anchorLeftGroup":"","anchorRightCat":"B","anchorRightGroup":""},',
    '{"id":"pr2","kind":"bracket","text":"*","x":100,"y":30,"x2":400,',
    '"autoPValue":true,"autoPTest":"welch","autoPFormat":"p",',
    '"anchorLeftCat":"A","anchorLeftGroup":"","anchorRightCat":"C","anchorRightGroup":""}]')
wr(plotbuilder(data = cg3, xvar = "x", yvar = "y", groupVar = NULL, facetVar = NULL, graphType = "bar",
               chartSpec = cspec(autoPCorrection = "tukey"), annotationsJson = ann2),
   "d_cg_tukey")

# ---- Expected values, computed independently in R --------------------
fmtP <- function(p) {
    if (p < 0.001) "p < .001"
    else paste0("p = ", sub("^0", "", formatC(p, format = "f", digits = 3)))
}
# A/C: paired t, df 7 (JS computes left-right = t1-t2)
pt <- t.test(t1, t2, paired = TRUE)
# D: Tukey-adjusted pairwise via pooled one-way MSE (matches the JS math)
aov0 <- anova(lm(y ~ x, data = cg3))
MSE <- aov0[["Mean Sq"]][2]; dfW <- aov0[["Df"]][2]
m <- tapply(cg3$y, cg3$x, mean); n <- tapply(cg3$y, cg3$x, length)
qs <- function(a, b) abs(m[a] - m[b]) / sqrt((MSE / 2) * (1 / n[a] + 1 / n[b]))
pAB <- ptukey(qs("A", "B"), 3, dfW, lower.tail = FALSE)
pAC <- ptukey(qs("A", "C"), 3, dfW, lower.tail = FALSE)
exp_json <- sprintf(paste0(
    '{"pairedDf":"t(%d)","pairedT":"%s","pAB":"%s","pAC":"%s"}'),
    pt$parameter, formatC(pt$statistic, format = "f", digits = 2),
    fmtP(pAB), fmtP(pAC))
con <- file(file.path(OUT, "expected.json"), open = "wb")
writeLines(exp_json, con, useBytes = TRUE)
close(con)
cat("expected:", exp_json, "\n")

# ---- Case E: RM one-tailed disclosure on labels ----------------------
annE <- paste0(
  '[{"id":"pe1","kind":"bracket","text":"*","x":150,"y":60,"x2":350,',
  '"autoPValue":true,"autoPTest":"auto","autoPFormat":"apa","autoPTail":"less",',
  '"anchorLeftCat":"t1","anchorLeftGroup":"","anchorRightCat":"t2","anchorRightGroup":""},',
  '{"id":"pe2","kind":"bracket","text":"*","x":150,"y":30,"x2":350,',
  '"autoPValue":true,"autoPTest":"auto","autoPFormat":"asterisks","autoPTail":"less",',
  '"anchorLeftCat":"t1","anchorLeftGroup":"","anchorRightCat":"t2","anchorRightGroup":""}]')
wr(rmplotbuilder(data = rmd, measures = c("t1", "t2"), bs = NULL, betweenVar = NULL,
                 graphType = "bar", annotationsJson = annE), "e_rm_onetailed")

# ---- Case F: applied correction + in-app note lacking its name -------
wr(plotbuilder(data = cg3, xvar = "x", yvar = "y", groupVar = NULL, facetVar = NULL,
               graphType = "bar",
               chartSpec = cspec(autoPCorrection = "tukey",
                                 chartNote = "Data from the spring cohort."),
               annotationsJson = ann2), "f_cg_tukey_note")

# ---- Case G: single x-category CG -> omnibus options hidden ----------
set.seed(3)
cg1 <- data.frame(x = rep("A", 20), y = rnorm(20, 10, 2))
wr(plotbuilder(data = cg1, xvar = "x", yvar = "y", groupVar = NULL, facetVar = NULL,
               graphType = "bar", annotationsJson = annJson("welch", "p", "A", "A")),
   "g_cg_onecat")

# ---- Case H: retired chi-square plot stays gone; Statistics remains --
suppressWarnings(suppressMessages({
    source("R/freqplotbuilder.h.R"); source("R/freqplotbuilder.b.R")
}))
fqd <- data.frame(
    resp = factor(c(rep("Agree", 70), rep("Neutral", 20), rep("Disagree", 10),
                    rep("Agree", 30), rep("Neutral", 40), rep("Disagree", 30))),
    g    = factor(c(rep("F", 100), rep("M", 100))))
wr(freqplotbuilder(data = fqd, var = "resp", groupVar = "g", facetVar = NULL,
                   chartSpec = cspec(freqShowChisq = TRUE)), "h_freq_chisq_hover")
stH <- chisq.test(table(fqd$resp, fqd$g), correct = FALSE)$stdres
iH <- which(abs(stH) == max(abs(stH)), arr.ind = TRUE)[1, ]
resWho <- paste0(rownames(stH)[iH[1]], " in ", colnames(stH)[iH[2]])
# signed 2 dp since the Jul 2026 formatting pass (all three
# residual surfaces agree on "+5.66"-style values)
resVal <- sprintf("%+.2f", stH[iH[1], iH[2]])
exp2 <- sub("}$", sprintf(',"resWho":"%s","resVal":"%s"}', resWho, resVal),
            exp_json)
con <- file(file.path(OUT, "expected.json"), open = "wb")
writeLines(exp2, con, useBytes = TRUE)
close(con)
cat("expected2:", exp2, "\n")

# ---- Case I: freq proportion brackets (dodged bar) -------------------
fq2 <- data.frame(
    resp = factor(c(rep("Agree", 40), rep("Neutral", 35), rep("Disagree", 25),
                    rep("Agree", 30), rep("Neutral", 30), rep("Disagree", 40)),
                  levels = c("Agree", "Neutral", "Disagree")),
    g = factor(c(rep("F", 100), rep("M", 100))))
annI <- paste0(
  '[{"id":"pi1","kind":"bracket","text":"*","x":100,"y":50,"x2":250,',
  '"autoPValue":true,"autoPTest":"auto","autoPFormat":"apa",',
  '"anchorLeftCat":"Agree","anchorLeftGroup":"F",',
  '"anchorRightCat":"Agree","anchorRightGroup":"M"},',
  '{"id":"pi2","kind":"bracket","text":"*","x":100,"y":30,"x2":400,',
  '"autoPValue":true,"autoPTest":"auto","autoPFormat":"apa",',
  '"anchorLeftCat":"Agree","anchorLeftGroup":"F",',
  '"anchorRightCat":"Disagree","anchorRightGroup":"F"}]')
wr(freqplotbuilder(data = fq2, var = "resp", groupVar = "g", facetVar = NULL,
                   chartSpec = cspec(autoPCorrection = "none"),
                   annotationsJson = annI), "i_freq_prop_brackets")
# Independent pair (Agree: F vs M) — prop.test(correct = FALSE) parity.
pt1 <- prop.test(c(40, 30), c(100, 100), correct = FALSE)
zInd <- (0.40 - 0.30) / sqrt(0.35 * 0.65 * (1 / 100 + 1 / 100))
stopifnot(abs(zInd^2 - as.numeric(pt1$statistic)) < 1e-9)
# Same-sample pair (F: Agree vs Disagree) — multinomial z.
zS <- (0.40 - 0.25) / sqrt((0.40 + 0.25 - (0.40 - 0.25)^2) / 100)
pS <- 2 * pnorm(-abs(zS))
strip0 <- function(v) sub("^(-?)0\\.", "\\1.", sprintf("%.2f", v))
exp3 <- sub("}$", sprintf(paste0(
    ',"propIndZ":"z = %.2f","propIndP":"%s","propIndD":"%s",',
    '"propIndCi":"[%.2f, %.2f]","propSameZ":"z = %.2f","propSameP":"%s"}'),
    zInd, fmtP(pt1$p.value), strip0(0.10),
    pt1$conf.int[1], pt1$conf.int[2], zS, fmtP(pS)), exp2)
con <- file(file.path(OUT, "expected.json"), open = "wb")
writeLines(exp3, con, useBytes = TRUE)
close(con)
cat("expected3:", exp3, "\n")

# ---- Case J: pure-RM one-way RM-ANOVA (GG-corrected) ------------------
set.seed(21)
nJ <- 12
base <- rnorm(nJ, 10, 2)
rmj <- data.frame(o1 = base + rnorm(nJ, 0, 0.5),
                  o2 = base + 1.0 + rnorm(nJ, 0, 0.5),
                  o3 = base + 1.6 + rnorm(nJ, 0, 3.0))
annJ <- paste0(
  '[{"id":"pj1","kind":"bracket","text":"*","x":150,"y":40,"x2":350,',
  '"autoPValue":true,"autoPTest":"rmAnova","autoPFormat":"apa"}]')
wr(rmplotbuilder(data = rmj, measures = c("o1", "o2", "o3"),
                 bs = NULL, betweenVar = NULL, graphType = "bar",
                 annotationsJson = annJ), "j_rm_anova")
# Independent hand implementation + aov() cross-check.
X <- as.matrix(rmj); kJ <- 3
gm <- mean(X); rM <- rowMeans(X); cM <- colMeans(X)
sst <- sum((X - gm)^2); sss <- kJ * sum((rM - gm)^2)
sstr <- nJ * sum((cM - gm)^2); sse <- sst - sss - sstr
FJ <- (sstr / (kJ - 1)) / (sse / ((kJ - 1) * (nJ - 1)))
long <- data.frame(v = as.vector(X), occ = factor(rep(1:kJ, each = nJ)),
                   subj = factor(rep(1:nJ, kJ)))
av <- summary(aov(v ~ occ + Error(subj / occ), data = long))
tabJ <- av[["Error: subj:occ"]][[1]]
Fa <- tabJ[grep("^occ", rownames(tabJ))[1], "F value"]
stopifnot(abs(FJ - Fa) < 1e-8)
SJ <- cov(X)
BJ <- SJ - outer(rowMeans(SJ), rep(1, kJ)) -
      outer(rep(1, kJ), colMeans(SJ)) + mean(SJ)
epsJ <- sum(diag(BJ))^2 / ((kJ - 1) * sum(BJ^2))
epsJ <- min(1, max(epsJ, 1 / (kJ - 1)))
df1c <- epsJ * (kJ - 1); df2c <- epsJ * (kJ - 1) * (nJ - 1)
pJ <- pf(FJ, df1c, df2c, lower.tail = FALSE)
etaPJ <- sstr / (sstr + sse)
dfFmt <- function(v) {
    if (abs(v - round(v)) < 1e-12) sprintf("%d", round(v))
    else sprintf("%.2f", v)
}
rmF <- sprintf("F(%s, %s) = %.2f", dfFmt(df1c), dfFmt(df2c), FJ)
rmEta <- paste0("\u03b7\u00b2p = ", sub("^0", "", sprintf("%.2f", etaPJ)))
rmEps <- sub("^0", "", sprintf("%.2f", epsJ))

# ---- Case K: mixed RM -> omnibus gated --------------------------------
rmk <- rmj
rmk$sex <- factor(rep(c("a", "b"), 6))
wr(rmplotbuilder(data = rmk, measures = c("o1", "o2", "o3"),
                 bs = NULL, betweenVar = "sex", graphType = "bar",
                 annotationsJson = annJson("auto", "apa", "o1", "o2")),
   "k_rm_mixed")

exp4 <- sub("}$", sprintf(
    ',"rmF":"%s","rmP":"%s","rmEta":"%s","rmEps":"%s"}',
    rmF, fmtP(pJ), rmEta, rmEps), exp3)
con <- file(file.path(OUT, "expected.json"), open = "wb")
writeLines(exp4, con, useBytes = TRUE)
close(con)
cat("expected4:", exp4, "\n")

# ---- Case L: asterisk bracket + note lacking the key -> starnote -----
wr(plotbuilder(data = cgd, xvar = "x", yvar = "y", groupVar = NULL, facetVar = NULL,
               graphType = "bar", chartSpec = cspec(chartNote = "Data from the fall term."),
               annotationsJson = annJson("auto", "asterisks", "A", "B")),
   "l_starnote")

# ---- Case M: median chart + t-test bracket -> medmean ----------------
wr(plotbuilder(data = cgd, xvar = "x", yvar = "y", groupVar = NULL, facetVar = NULL,
               graphType = "bar", summaryFunc = "median",
               annotationsJson = annJson("auto", "apa", "A", "B")),
   "m_medmean")

# ---- Case N: Dunnett vs control matches mvtnorm::pmvt -----------------
set.seed(41)
cgn <- data.frame(
    x = factor(rep(c("Ctrl", "A", "B", "C"), each = 12),
               levels = c("Ctrl", "A", "B", "C")),
    y = c(rnorm(12, 10, 2), rnorm(12, 11.5, 2),
          rnorm(12, 12, 2), rnorm(12, 13.5, 2)))
brk <- function(id, y0, l, rgt) paste0(
  '{"id":"', id, '","kind":"bracket","text":"*","x":80,"y":', y0,
  ',"x2":200,"autoPValue":true,"autoPTest":"welch","autoPFormat":"p",',
  '"anchorLeftCat":"', l, '","anchorLeftGroup":"","anchorRightCat":"',
  rgt, '","anchorRightGroup":""}')
annN <- paste0("[", brk("n1", 60, "Ctrl", "A"), ",",
                    brk("n2", 40, "Ctrl", "B"), ",",
                    brk("n3", 20, "Ctrl", "C"), "]")
wr(plotbuilder(data = cgn, xvar = "x", yvar = "y", groupVar = NULL,
               facetVar = NULL, graphType = "bar",
               chartSpec = cspec(autoPCorrection = "dunnett"), annotationsJson = annN),
   "n_dunnett")
aovN <- anova(lm(y ~ x, data = cgn))
MSE <- aovN[["Mean Sq"]][2]; dfW <- aovN[["Df"]][2]
mN <- tapply(cgn$y, cgn$x, mean); nN <- tapply(cgn$y, cgn$x, length)
trt <- c("A", "B", "C")
lam <- sqrt(nN[trt] / (nN[trt] + nN[["Ctrl"]]))
R3 <- outer(lam, lam); diag(R3) <- 1
tD <- (mN[trt] - mN[["Ctrl"]]) /
      sqrt(MSE * (1 / nN[trt] + 1 / nN[["Ctrl"]]))
pD <- vapply(abs(tD), function(q)
    1 - mvtnorm::pmvt(lower = rep(-q, 3), upper = rep(q, 3),
                      df = dfW, corr = R3,
                      algorithm = mvtnorm::GenzBretz(abseps = 1e-9,
                                                     maxpts = 1e7))[1],
    numeric(1))

# ---- Case O: no shared control -> raw p + disclosure ------------------
annO <- paste0("[", brk("o1", 60, "A", "B"), ",",
                    brk("o2", 40, "Ctrl", "C"), "]")
wr(plotbuilder(data = cgn, xvar = "x", yvar = "y", groupVar = NULL,
               facetVar = NULL, graphType = "bar",
               chartSpec = cspec(autoPCorrection = "dunnett"), annotationsJson = annO),
   "o_dunnett_violation")
wAB <- t.test(cgn$y[cgn$x == "A"], cgn$y[cgn$x == "B"])
wCC <- t.test(cgn$y[cgn$x == "Ctrl"], cgn$y[cgn$x == "C"])

exp5 <- sub("}$", sprintf(
    ',"dunA":"%s","dunB":"%s","dunC":"%s","rawAB":"%s","rawCC":"%s"}',
    fmtP(pD[1]), fmtP(pD[2]), fmtP(pD[3]),
    fmtP(wAB$p.value), fmtP(wCC$p.value)), exp4)
con <- file(file.path(OUT, "expected.json"), open = "wb")
writeLines(exp5, con, useBytes = TRUE)
close(con)
cat("expected5:", exp5, "\n")

# ---- Case P: freq stats INCLUDE hidden bars ---------------------------
wr(freqplotbuilder(data = fq2, var = "resp", groupVar = "g", facetVar = NULL,
                   chartSpec = cspec(hiddenBars = list(list(category = "Neutral", group = "M"))),
                   annotationsJson = annI), "p_freq_hidden_include")

# ---- Case Q: CG brackets EXCLUDE hidden points ------------------------
yA <- cgd$y[cgd$x == "A"]; yB <- cgd$y[cgd$x == "B"]
wq <- t.test(yA[-c(1, 2)], yB)
wr(plotbuilder(data = cgd, xvar = "x", yvar = "y", groupVar = NULL,
               facetVar = NULL, graphType = "bar",
               chartSpec = cspec(autoPCorrection = "none",
                                 hiddenPoints = list(list(cat = "A", group = "", idx = 0L),
                                                     list(cat = "A", group = "", idx = 1L))),
               annotationsJson = annJson("welch", "p", "A", "B")),
   "q_cg_hidden_exclude")
exp6 <- sub("}$", sprintf(',"exclP":"%s"}', fmtP(wq$p.value)), exp5)
con <- file(file.path(OUT, "expected.json"), open = "wb")
writeLines(exp6, con, useBytes = TRUE)
close(con)
cat("expected6:", exp6, "\n")

# ==== Sigma stats panel — Phase 1 probe pages ==========================
suppressWarnings(suppressMessages({
    source("R/xyplotbuilder.h.R");     source("R/xyplotbuilder.b.R")
    source("R/corrplotbuilder.h.R");   source("R/corrplotbuilder.b.R")
    source("R/likertplotbuilder.h.R"); source("R/likertplotbuilder.b.R")
    source("R/distplotbuilder.h.R");   source("R/distplotbuilder.b.R")
}))

# CG omnibus expected (cg3 already rendered as d_cg_tukey)
aovS <- anova(lm(y ~ x, data = cg3))
cgF <- sprintf("F(2, 33) = %.2f", aovS[["F value"]][1])
# RM omnibus expected on rmd (a_rm_auto): k = 2 -> F = paired t squared
rmF2 <- sprintf("F(1, 7) = %.2f", as.numeric(pt$statistic)^2)
# Freq chi-square on fq2 (i_freq_prop_brackets)
chiS <- chisq.test(table(fq2$resp, fq2$g), correct = FALSE)
fqChi <- sprintf("(2, N = 200) = %.2f", as.numeric(chiS$statistic))

# Dist page: one clearly normal + one clearly skewed group
set.seed(51)
dsd <- data.frame(
    y = c(rnorm(80, 50, 8), rexp(80, 0.2) + 30),
    g = factor(rep(c("norm", "skewed"), each = 80)))
wr(distplotbuilder(data = dsd, var = "y", groupVar = "g", facetVar = NULL,
                   graphType = "histogram"), "r_dist_stats")
strip0 <- function(v, d = 2) sub("^(-?)0\\.", "\\1.", sprintf(paste0("%.", d, "f"), v))
swS <- shapiro.test(dsd$y[dsd$g == "skewed"])
swN <- shapiro.test(dsd$y[dsd$g == "norm"])
dW <- strip0(as.numeric(swS$statistic), 3)
dWn <- strip0(as.numeric(swN$statistic), 3)

# Scatter page
set.seed(52)
xyd <- data.frame(x = rnorm(60))
xyd$y <- 0.6 * xyd$x + rnorm(60, 0, 0.7)
wr(xyplotbuilder(data = xyd, xvar = "x", yvar = "y", groupVar = NULL,
                 facetVar = NULL, sizeVar = NULL, labelVar = NULL), "s_xy_stats")
pe <- cor.test(xyd$x, xyd$y)
sp <- suppressWarnings(cor.test(xyd$x, xyd$y, method = "spearman"))
rV <- as.numeric(pe$estimate)
zr <- atanh(rV); sez <- 1 / sqrt(60 - 3); zc <- qnorm(0.975)
xyR <- strip0(rV); xyRho <- strip0(as.numeric(sp$estimate))
xyCi <- paste0("[", strip0(tanh(zr - zc * sez)), ", ",
               strip0(tanh(zr + zc * sez)), "]")

# Correlation page
set.seed(53)
cvd <- data.frame(v1 = rnorm(50))
cvd$v2 <- 0.8 * cvd$v1 + rnorm(50, 0, 0.4)
cvd$v3 <- rnorm(50)
wr(corrplotbuilder(data = cvd, vars = c("v1", "v2", "v3")), "t_corr_stats")
r12 <- cor.test(cvd$v1, cvd$v2)
corrStrong <- paste0("r = ", strip0(as.numeric(r12$estimate)))

# Likert page: 3 consistent items on a 1..5 scale
set.seed(54)
basev <- sample(1:5, 60, TRUE)
clamp15 <- function(v) pmin(5, pmax(1, v))
lkd <- data.frame(
    q1 = factor(basev, levels = 1:5),
    q2 = factor(clamp15(basev + sample(-1:1, 60, TRUE)), levels = 1:5),
    q3 = factor(clamp15(basev + sample(-1:1, 60, TRUE)), levels = 1:5))
wr(likertplotbuilder(data = lkd, items = c("q1", "q2", "q3")),
   "u_likert_stats")
mAl <- cbind(as.numeric(as.character(lkd$q1)),
             as.numeric(as.character(lkd$q2)),
             as.numeric(as.character(lkd$q3)))
vt <- var(rowSums(mAl)); vi <- sum(apply(mAl, 2, var))
lkAlpha <- strip0((3 / 2) * (1 - vi / vt))

exp7 <- sub("}$", sprintf(paste0(
    ',"cgF":"%s","rmF2":"%s","fqChi":"%s","dW":"%s","dWn":"%s",',
    '"xyR":"%s","xyRho":"%s","xyCi":"%s","corrStrong":"%s","lkAlpha":"%s"}'),
    cgF, rmF2, fqChi, dW, dWn, xyR, xyRho, xyCi, corrStrong, lkAlpha), exp6)
con <- file(file.path(OUT, "expected.json"), open = "wb")
writeLines(exp7, con, useBytes = TRUE)
close(con)
cat("expected7:", exp7, "\n")

# ==== Phase 2: Compare-pairs table + Place brackets ====================
# autoPCorrection "none" is STATED, not assumed: these cases check the
# Compare-pairs mechanics against RAW t-test expectations computed just
# below, and Compare Groups now defaults to Tukey (Aug 2026).
wr(plotbuilder(data = cg3, xvar = "x", yvar = "y", groupVar = NULL,
               facetVar = NULL, graphType = "bar",
               chartSpec = cspec(autoPCorrection = "none")), "v_cmp_place")
# No chartSpec at all: this one exists to pin the shipped DEFAULT
# correction, which is the whole point of the Aug 2026 change.
wr(plotbuilder(data = cg3, xvar = "x", yvar = "y", groupVar = NULL,
               facetVar = NULL, graphType = "bar"), "v_cmp_default")
stripP <- function(x) sub("^p ", "", sub("^p = ", "", x))
yA <- cg3$y[cg3$x == "A"]; yB <- cg3$y[cg3$x == "B"]; yC <- cg3$y[cg3$x == "C"]
wABp <- t.test(yA, yB)$p.value
wACp <- t.test(yA, yC)$p.value
wBCp <- t.test(yB, yC)$p.value
cmpSig <- sum(c(wABp, wACp, wBCp) < 0.05)
hol <- p.adjust(c(wABp, wACp, wBCp), "holm")
exp8 <- sub("}$", sprintf(paste0(
    ',"cmpRawAB":"%s","cmpRawBC":"%s","cmpSig":%d,"cmpHolmAB":"%s"}'),
    stripP(fmtP(wABp)), stripP(fmtP(wBCp)), cmpSig, stripP(fmtP(hol[1]))), exp7)
con <- file(file.path(OUT, "expected.json"), open = "wb")
writeLines(exp8, con, useBytes = TRUE)
close(con)
cat("expected8:", exp8, "\n")

# ==== Two-way omnibus (Type III) + effect sizes + SEM ==================
set.seed(61)
mkcell <- function(x, g, n, mu) data.frame(x = x, g = g, y = rnorm(n, mu, 2))
cgw <- rbind(
    mkcell("A", "F", 10, 10), mkcell("A", "M", 14, 11),
    mkcell("B", "F", 12, 12), mkcell("B", "M",  9, 15),
    mkcell("C", "F", 15, 14), mkcell("C", "M", 11, 13))
cgw$x <- factor(cgw$x); cgw$g <- factor(cgw$g)
wr(plotbuilder(data = cgw, xvar = "x", yvar = "y", groupVar = "g",
               facetVar = NULL, graphType = "bar",
               chartSpec = cspec(autoPCorrection = "none")), "w_twoway")
# Type III via sum-coded model comparisons (unbalanced, so the SS
# types genuinely differ — this is the discriminating reference).
X <- model.matrix(~ x * g, data = cgw,
                  contrasts.arg = list(x = "contr.sum", g = "contr.sum"))
asgn <- attr(X, "assign")
rssFor <- function(keep) {
    Xk <- X[, asgn %in% keep, drop = FALSE]
    sum(lm.fit(Xk, cgw$y)$residuals^2)
}
rssFull <- rssFor(0:3)
dfe <- nrow(cgw) - 6
mse <- rssFull / dfe
ssA <- rssFor(c(0, 2, 3)) - rssFull
ssB <- rssFor(c(0, 1, 3)) - rssFull
ssAB <- rssFor(c(0, 1, 2)) - rssFull
ssTot <- sum((cgw$y - mean(cgw$y))^2)
twA <- sprintf("F(2, %d) = %.2f", dfe, (ssA / 2) / mse)
twB <- sprintf("F(1, %d) = %.2f", dfe, (ssB / 1) / mse)
twAB <- sprintf("F(2, %d) = %.2f", dfe, (ssAB / 2) / mse)
etaAB <- strip0(ssAB / ssTot)
etaPAB <- strip0(ssAB / (ssAB + rssFull))
omegaAB <- strip0((ssAB - 2 * mse) / (ssTot + mse))
yAF <- cgw$y[cgw$x == "A" & cgw$g == "F"]
semAF <- sprintf("%.2f", sd(yAF) / sqrt(length(yAF)))
exp9 <- sub("}$", sprintf(paste0(
    ',"twA":"%s","twB":"%s","twAB":"%s","etaAB":"%s","etaPAB":"%s",',
    '"omegaAB":"%s","semAF":"%s"}'),
    twA, twB, twAB, etaAB, etaPAB, omegaAB, semAF), exp8)
con <- file(file.path(OUT, "expected.json"), open = "wb")
writeLines(exp9, con, useBytes = TRUE)
close(con)
cat("expected9:", exp9, "\n")

# ==== Dot chart: marker-ring linking ===================================
wr(plotbuilder(data = cgw, xvar = "x", yvar = "y", groupVar = "g",
               facetVar = NULL, graphType = "dot"), "u4_dot")

# ==== Dist Descriptives tab fidelity (Summary table retired) ===========
# The Sigma Descriptives tab is now the ONLY home of the per-cell
# moments; verify the panel's values against jamovi's Descriptives
# formulas (sample-adjusted SPSS G1/G2 skew/kurtosis - the same
# algebra as jmv descriptives.b.R - excess kurtosis, sample SD).
dnv <- dsd$y[dsd$g == "norm"]
dmu <- mean(dnv)
dnn <- length(dnv)
dxc <- dnv - dmu
dG1 <- (sqrt(dnn * (dnn - 1)) / (dnn - 2)) *
    (sqrt(dnn) * sum(dxc^3) / (sum(dxc^2)^1.5))
dvv <- sum(dxc^2) / (dnn - 1)
dG2 <- (dnn * (dnn + 1)) / ((dnn - 1) * (dnn - 2) * (dnn - 3)) *
    (sum(dxc^4) / dvv^2) -
    3 * (dnn - 1)^2 / ((dnn - 2) * (dnn - 3))
fmt2 <- function(v) sprintf("%.2f", v)
exp10 <- sub("}$", sprintf(paste0(
    ',"dMean":"%s","dMed":"%s","dSd":"%s","dSe":"%s","dMin":"%s",',
    '"dMax":"%s","dSkew":"%s","dKurt":"%s"}'),
    fmt2(dmu), fmt2(median(dnv)), fmt2(sd(dnv)),
    fmt2(sd(dnv) / sqrt(length(dnv))), fmt2(min(dnv)), fmt2(max(dnv)),
    fmt2(dG1), fmt2(dG2)), exp9)
con <- file(file.path(OUT, "expected.json"), open = "wb")
writeLines(exp10, con, useBytes = TRUE)
close(con)
cat("expected10:", exp10, "\n")

# ==== Regression cases for the Jul 2026 Sigma-panel fixes ==============
# (These lock in fixes whose gaps let the originals ship: the dead freq
#  Copy button, hidden-points descriptives, the dropped pie Pairwise
#  tab, the false "(X-adjusted)" tally, the scatter hidden-group row,
#  and the omnibus one-way fallback.)

# z_freq_pie: a Frequencies PIE (categories ride the group field). The
# Sigma Pairwise tab must APPEAR with same-sample z rows (it used to be
# dropped because pie sets hasGroups=true and took the two-proportion
# path -> se=0 -> null -> empty card -> tab removed).
wr(freqplotbuilder(data = fq2, var = "resp", groupVar = NULL, facetVar = NULL,
                   graphType = "pie"), "z_freq_pie")

# z_xy_hidden: grouped scatter with one group hidden. The Sigma table
# must drop the hidden group's row (matching the on-chart overlay) and
# disclose it via a hidden-note.
set.seed(71)
xyg <- data.frame(x = rnorm(40), y = rnorm(40), g = rep(c("P", "Q"), 20))
wr(xyplotbuilder(data = xyg, xvar = "x", yvar = "y", groupVar = "g",
                 facetVar = NULL, sizeVar = NULL, labelVar = NULL,
                 chartSpec = cspec(xyHiddenGroups = list("Q"))), "z_xy_hidden")

# z_omni_collapse: grouped 2x3 with the WHOLE M group hidden -> the
# two-way is undefined -> the omnibus must fall back to a one-way over X
# (was a misleading "not enough data per cell" refusal). cgw is the
# unbalanced two-way fixture defined above.
wr(plotbuilder(data = cgw, xvar = "x", yvar = "y", groupVar = "g",
               facetVar = NULL, graphType = "bar",
               chartSpec = cspec(hiddenBars = list(list(category = "A", group = "M"),
                                                   list(category = "B", group = "M"),
                                                   list(category = "C", group = "M")))),
   "z_omni_collapse")

# F2 expected: the q_cg_hidden_exclude fixture (cgd, cat A idx0+idx1
# hidden) — the Descriptives tab must report the FULL n/mean for cat A
# (hiding excludes from TESTS, includes in the descriptives table).
cgA <- cgd$y[cgd$x == "A"]
exp11 <- sub("}$", sprintf(',"f2An":%d,"f2AMean":"%s"}',
                          length(cgA), fmt2(mean(cgA))), exp10)
con <- file(file.path(OUT, "expected.json"), open = "wb")
writeLines(exp11, con, useBytes = TRUE)
close(con)
cat("expected11:", exp11, "\n")

# ==== Torry-approved fixes (Jul 2026): RM CM SE, median note, chisq caveat ==
# hh_rm_cmse (#1): RM under the within method — the Descriptives SE must be
# the Cousineau-Morey within-subject value (matching the drawn error bars and
# the Summary table), NOT the raw sd/sqrt(n).
set.seed(81); nS <- 10; kS <- 3
bse <- rnorm(nS, 50, 10)
rmw <- data.frame(t1 = bse + rnorm(nS, 0, 3), t2 = bse + 2 + rnorm(nS, 0, 3),
                  t3 = bse + 4 + rnorm(nS, 0, 3))
wr(rmplotbuilder(data = rmw, measures = c("t1", "t2", "t3"), bs = NULL, betweenVar = NULL,
                 graphType = "bar"), "hh_rm_cmse")
Mw <- as.matrix(rmw); nrmw <- Mw - rowMeans(Mw) + mean(Mw)
cmseW <- apply(nrmw, 2, function(c) sd(c) * sqrt(kS / (kS - 1)) / sqrt(length(c)))

# ii_box (#2): a box-plot Compare Groups chart — the Compare-pairs card must
# warn that the listed t-tests compare MEANS while the chart shows a distribution.
set.seed(82)
cgbx <- data.frame(x = rep(c("A", "B", "C"), each = 15),
                   y = c(rnorm(15, 5), rnorm(15, 7), rnorm(15, 9)))
wr(plotbuilder(data = cgbx, xvar = "x", yvar = "y", groupVar = NULL,
               facetVar = NULL, graphType = "box"), "ii_box")

# jj_sparse (#3): sparse table (min expected 4.5 < 5) — the Chi-square card
# must carry the small-expected-count caveat.
spf <- data.frame(
  resp = factor(c(rep("Yes", 8), rep("No", 2), rep("Yes", 1), rep("No", 9))),
  g = factor(c(rep("X", 10), rep("Y", 10))))
wr(freqplotbuilder(data = spf, var = "resp", groupVar = "g", facetVar = NULL,
                   graphType = "bar"), "jj_sparse")

exp12 <- sub("}$", sprintf(',"cmse1":"%s","cmse2":"%s","cmse3":"%s"}',
                          fmt2(cmseW[1]), fmt2(cmseW[2]), fmt2(cmseW[3])), exp11)
con <- file(file.path(OUT, "expected.json"), open = "wb")
writeLines(exp12, con, useBytes = TRUE)
close(con)
cat("expected12:", exp12, "\n")

# ==== #6 three-way ANOVA (facet as a factor) + #8 Shapiro nudges ==========
# kk_threeway: unbalanced 2x2x2 Compare Groups (x=A, group=B, facet=C). The
# omnibus must show all SEVEN factorial terms with Type III F matching R
# sum-coded model comparisons.
set.seed(88)
lev3 <- expand.grid(A = c("a1","a2"), B = c("b1","b2"), C = c("c1","c2"),
                    stringsAsFactors = TRUE)
n3 <- c(8,11,7,10,9,6,12,8); mu3 <- c(10,12,11,15,13,10,14,12)
r3 <- do.call(rbind, lapply(seq_len(nrow(lev3)), function(i)
  data.frame(A = lev3$A[i], B = lev3$B[i], C = lev3$C[i], y = rnorm(n3[i], mu3[i], 2))))
r3$A <- factor(r3$A); r3$B <- factor(r3$B); r3$C <- factor(r3$C)
wr(plotbuilder(data = r3, xvar = "A", yvar = "y", groupVar = "B", facetVar = "C",
               graphType = "bar"), "kk_threeway")
X3 <- model.matrix(~ A * B * C, data = r3,
                   contrasts.arg = list(A = "contr.sum", B = "contr.sum", C = "contr.sum"))
as3 <- attr(X3, "assign")
rf3 <- function(k) sum(lm.fit(X3[, as3 %in% k, drop = FALSE], r3$y)$residuals^2)
full3 <- rf3(0:7); dfe3 <- nrow(r3) - ncol(X3); mse3 <- full3 / dfe3
tm3 <- c(A = 1, B = 2, C = 3, AB = 4, AC = 5, BC = 6, ABC = 7)
Fk <- sapply(names(tm3), function(nm) ((rf3(setdiff(0:7, tm3[[nm]])) - full3) / 1) / mse3)

# ll_shapiro: a large clearly-skewed group (n=250 -> flagged + large-n nudge)
# and a tiny group (n=12 -> not flagged + small-n nudge).
set.seed(89)
lls <- data.frame(y = c(rexp(250, 0.15) + 20, rnorm(12, 50, 5)),
                  g = factor(c(rep("big", 250), rep("small", 12))))
wr(distplotbuilder(data = lls, var = "y", groupVar = "g", facetVar = NULL,
                   graphType = "histogram"), "ll_shapiro")

exp13 <- sub("}$", sprintf(paste0(
  ',"kkA":"%s","kkB":"%s","kkC":"%s","kkAB":"%s","kkAC":"%s","kkBC":"%s","kkABC":"%s"}'),
  sprintf("%.2f", Fk[["A"]]), sprintf("%.2f", Fk[["B"]]), sprintf("%.2f", Fk[["C"]]),
  sprintf("%.2f", Fk[["AB"]]), sprintf("%.2f", Fk[["AC"]]), sprintf("%.2f", Fk[["BC"]]),
  sprintf("%.2f", Fk[["ABC"]])), exp12)
con <- file(file.path(OUT, "expected.json"), open = "wb")
writeLines(exp13, con, useBytes = TRUE)
close(con)
cat("expected13:", exp13, "\n")

# ==== Jul 2026 jamovi-parity cases =====================================
# nn1: median chart -> SE/SD/CI error bars are SUPPRESSED (mean-model
# formulas describe the mean, so no bar draws around a median) and the
# Sigma Descriptives foot discloses it.
wr(plotbuilder(data = cgd, xvar = "x", yvar = "y", groupVar = NULL,
               facetVar = NULL, graphType = "bar",
               summaryFunc = "median", errorBarType = "ci95"),
   "nn1_median")

# nn2: Mann-Whitney bracket -> displayed U = min(U1, U2) (jamovi's
# convention; R prints W = U1), rank-biserial = 1 - 2*U1/(n1*n2)
# (jamovi ttestis.b.R biSerial - NOTE its sign runs opposite to d),
# p = R's wilcox.test default. Group A is the HIGH group so U1 is the
# LARGE direction: the displayed U must be the complement, and the
# jamovi rank-biserial comes out NEGATIVE while d would be positive.
mwA <- c(12.4, 13.6, 11.9, 14.2, 15.1, 13.1, 14.8,
         12.7, 15.6, 13.9, 16.3, 11.4, 14.5, 15.9)
mwB <- c(8.1, 9.4, 10.2, 11.7, 12.3, 9.9, 10.8, 8.7, 11.1, 12.9)
stopifnot(!any(duplicated(c(mwA, mwB))))
mwd <- data.frame(x = rep(c("A", "B"), c(length(mwA), length(mwB))),
                  y = c(mwA, mwB))
wr(plotbuilder(data = mwd, xvar = "x", yvar = "y", groupVar = NULL,
               facetVar = NULL, graphType = "bar",
               annotationsJson = annJson("mannWhitneyU", "apa", "A", "B")),
   "nn2_mw")

# nn3: unequal n AND unequal spread -> Cohen's d beside Welch's t uses
# jamovi's Welch-row denominator sqrt((v1+v2)/2), NOT the pooled SD
# (the two disagree at label precision here by design).
wd1 <- c(10.1, 10.4, 9.8, 10.2, 9.9, 10.6)
wd2 <- c(6.2, 14.8, 9.1, 17.3, 4.4, 12.9, 15.7, 7.6, 11.2,
         18.4, 5.3, 13.8, 8.9, 16.1, 10.7, 3.8, 12.2, 14.4)
wdd <- data.frame(x = rep(c("A", "B"), c(length(wd1), length(wd2))),
                  y = c(wd1, wd2))
wr(plotbuilder(data = wdd, xvar = "x", yvar = "y", groupVar = NULL,
               facetVar = NULL, graphType = "bar",
               annotationsJson = annJson("welch", "pAndEffect", "A", "B")),
   "nn3_welchd")

# nn4: small-n tie-free Spearman -> the matrix p is R's DEFAULT
# cor.test (exact - matching jamovi's corrmatrix and our own Scatter),
# not the exact=FALSE approximation the module used to force.
cx <- c(1.2, 2.7, 3.1, 4.9, 5.4, 6.8)
cy <- c(2.1, 2.4, 4.6, 4.2, 6.9, 6.1)
cnd <- data.frame(a = cx, b = cy)
wr(corrplotbuilder(data = cnd, vars = c("a", "b"),
                   corrMethod = "spearman"), "nn4_corr_exact")

w1  <- suppressWarnings(wilcox.test(mwA, mwB))   # W = U for group A (left anchor)
U1  <- as.numeric(w1$statistic)
nU  <- length(mwA) * length(mwB)
uD  <- min(U1, nU - U1)
rbJ <- 1 - 2 * U1 / nU
dWa <- (mean(wd1) - mean(wd2)) / sqrt((var(wd1) + var(wd2)) / 2)
dWp <- (mean(wd1) - mean(wd2)) /
    sqrt(((length(wd1) - 1) * var(wd1) + (length(wd2) - 1) * var(wd2)) /
         (length(wd1) + length(wd2) - 2))
stopifnot(sprintf("%.2f", dWa) != sprintf("%.2f", dWp))
spx <- suppressWarnings(cor.test(cx, cy, method = "spearman"))
strip0 <- function(v, d = 2) sub("^(-?)0\\.", "\\1.",
                                 sprintf(paste0("%.", d, "f"), v))
exp14 <- sub("}$", sprintf(paste0(
    ',"mwU":"U = %d","mwUraw":"U = %d","mwR":"r = %s",',
    '"welchD":"d = %s","welchDpooled":"d = %s","spexP":"%s"}'),
    as.integer(uD), as.integer(U1), strip0(rbJ),
    sprintf("%.2f", dWa), sprintf("%.2f", dWp),
    sub("^p = ", "", fmtP(spx$p.value))), exp13)
con <- file(file.path(OUT, "expected.json"), open = "wb")
writeLines(exp14, con, useBytes = TRUE)
close(con)
cat("expected14:", exp14, "\n")

# ==== Mixed (split-plot) ANOVA in the Sigma Omnibus tab (Jul 10 2026,
# Torry) ================================================================
# UNBALANCED groups on purpose: Type III SS_occ (jamovi's convention,
# what the widget computes) diverges from R aov's sequential table
# there, and the pooled-within-group-covariance GG epsilon sits well
# below 1. Reference = hand sum-coded model comparisons with subject
# dummies over the LONG data - structurally independent of the widget's
# subject-centering + normal-equations route.
set.seed(77)
nMX <- 22; grpMX <- c(rep("A", 8), rep("B", 14)); baseMX <- rnorm(nMX, 15, 2.5)
mxw <- data.frame(
    m1 = baseMX + rnorm(nMX, 0, 1.1),
    m2 = baseMX + 0.9 + ifelse(grpMX == "B", 1.2, 0) + rnorm(nMX, 0, 2.3),
    m3 = baseMX - 0.3 + ifelse(grpMX == "B", 2.2, 0) + rnorm(nMX, 0, 1.0))
mxd <- cbind(mxw, gg = factor(grpMX))
wr(rmplotbuilder(data = mxd, measures = c("m1", "m2", "m3"), bs = NULL,
                 betweenVar = "gg", graphType = "bar"), "mx_rm_omni")
local({
    kMX <- 3; NMX <- nMX; GMX <- 2
    longMX <- data.frame(
        y = as.vector(as.matrix(mxw)),
        occ = factor(rep(seq_len(kMX), each = NMX)),
        g = factor(rep(grpMX, kMX)),
        subj = factor(rep(seq_len(NMX), kMX)))
    avMX <- summary(aov(y ~ g * occ + Error(subj / occ), data = longMX))
    bMX <- avMX[["Error: subj"]][[1]]
    ssGrp <- bMX["g", "Sum Sq"]; dfGrp <- bMX["g", "Df"]
    ssSub <- bMX["Residuals", "Sum Sq"]; dfSub <- bMX["Residuals", "Df"]
    sumCode <- function(f) {
        lv <- levels(f); q <- length(lv) - 1
        M <- matrix(0, length(f), q)
        for (i in seq_len(q)) M[, i] <- ifelse(f == lv[i], 1, ifelse(f == lv[q + 1], -1, 0))
        M
    }
    subjM <- model.matrix(~ subj, longMX)
    occM <- sumCode(longMX$occ); gM <- sumCode(longMX$g)
    intM <- matrix(0, nrow(longMX), (kMX - 1) * (GMX - 1))
    cn <- 0
    for (i in seq_len(kMX - 1)) for (j in seq_len(GMX - 1)) {
        cn <- cn + 1; intM[, cn] <- occM[, i] * gM[, j]
    }
    rssMX <- function(X) sum(lm.fit(X, longMX$y)$residuals^2)
    rssFull <- rssMX(cbind(subjM, occM, intM))
    ssOcc <- rssMX(cbind(subjM, intM)) - rssFull
    ssInt <- rssMX(cbind(subjM, occM)) - rssFull
    ssErr <- rssFull
    dfOcc <- kMX - 1; dfInt <- (GMX - 1) * (kMX - 1); dfErr <- (NMX - GMX) * (kMX - 1)
    SpMX <- matrix(0, kMX, kMX)
    for (gv in levels(factor(grpMX))) {
        sub2 <- as.matrix(mxw[grpMX == gv, , drop = FALSE])
        SpMX <- SpMX + cov(sub2) * (nrow(sub2) - 1)
    }
    SpMX <- SpMX / (NMX - GMX)
    CbMX <- SpMX - matrix(rowMeans(SpMX), kMX, kMX) -
        matrix(rowMeans(SpMX), kMX, kMX, byrow = TRUE) + mean(SpMX)
    epsMX <- (sum(diag(CbMX))^2) / ((kMX - 1) * sum(CbMX^2))
    epsMX <- min(1, max(epsMX, 1 / (kMX - 1)))
    Fg <- (ssGrp / dfGrp) / (ssSub / dfSub)
    Fo <- (ssOcc / dfOcc) / (ssErr / dfErr)
    Fi <- (ssInt / dfInt) / (ssErr / dfErr)
    s0 <- function(v) sub("^(-?)0\\.", "\\1.", sprintf("%.2f", v))
    exp15 <- sub("}$", sprintf(paste0(
        ',"mxGrpF":"%s","mxGrpDf":"%s","mxGrpP":"%s","mxGrpEta":"%s",',
        '"mxOccF":"%s","mxOccDf":"%s","mxOccP":"%s","mxOccEta":"%s",',
        '"mxIntF":"%s","mxIntP":"%s","mxIntEta":"%s","mxEps":"%s"}'),
        sprintf("%.2f", Fg), paste0(dfFmt(dfGrp), ", ", dfFmt(dfSub)),
        sub("^p ", "", sub("^p = ", "", fmtP(pf(Fg, dfGrp, dfSub, lower.tail = FALSE)))),
        s0(ssGrp / (ssGrp + ssSub)),
        sprintf("%.2f", Fo), paste0(dfFmt(epsMX * dfOcc), ", ", dfFmt(epsMX * dfErr)),
        sub("^p ", "", sub("^p = ", "", fmtP(pf(Fo, epsMX * dfOcc, epsMX * dfErr, lower.tail = FALSE)))),
        s0(ssOcc / (ssOcc + ssErr)),
        sprintf("%.2f", Fi),
        sub("^p ", "", sub("^p = ", "", fmtP(pf(Fi, epsMX * dfInt, epsMX * dfErr, lower.tail = FALSE)))),
        s0(ssInt / (ssInt + ssErr)), s0(epsMX)), exp14)
    con <- file(file.path(OUT, "expected.json"), open = "wb")
    writeLines(exp15, con, useBytes = TRUE)
    close(con)
    cat("expected15 (mixed ANOVA):", exp15, "\n")
})
