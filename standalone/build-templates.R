# Generate committed payload TEMPLATES for the standalone Pandion Plots shell.
#
# Strategy (STANDALONE-BRIEF.md): do NOT reimplement widget.R's ~370 defaults
# in JS. Generate, once per module, a fully-defaulted payload via the REAL R
# marshalling, plus a mechanically-diffed list of the DATA-DEPENDENT keys
# (the "channels"). At runtime the JS data layer clones the template and
# replaces only the channel keys.
#
# Channel discovery: per module we build SEVERAL payloads from aggressively
# different datasets/configs (different n, category counts, level names,
# ranges, group/facet presence). A key that differs between ANY pair, or is
# missing from some payload, is a channel. Everything byte-stable is template.
#
# Usage:  Rscript standalone/build-templates.R
# Writes: standalone/templates/<module>.json           (the template payload)
#         standalone/templates/<module>.channels.json  (data-dependent keys)
#         standalone/templates/templates.js            (script-src wrapper:
#             window.PS_TEMPLATES[mod] = {channels, payload} - file:// pages
#             cannot fetch local JSON, the ps-payloads.js lesson)
#         standalone/templates/manifest.json           (modules + counts)

.self <- gsub("~+~", " ", sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE)[1]), fixed = TRUE)
ROOT <- normalizePath(file.path(dirname(.self), ".."))
setwd(ROOT)
OUTDIR <- file.path(ROOT, "standalone", "templates")
dir.create(OUTDIR, showWarnings = FALSE, recursive = TRUE)

# Isolate palette/style libraries: a saved default style would silently
# restyle every template via style_auto_apply (the render.R lesson).
Sys.setenv(R_USER_CONFIG_DIR = file.path(tempdir(), "ps-standalone-config"))
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
.gb2_widget_js <- function() ""   # payloads only; the shell carries the bundle
environment(graphbuilder2_html) <- globalenv()
cspec <- function(...) { a <- list(...); if (length(a) == 0) "" else as.character(jsonlite::toJSON(a, auto_unbox = TRUE)) }

getHtml <- function(res) {
    w <- res$widget
    v <- tryCatch(w$content, error = function(e) NULL)
    if (is.null(v)) v <- tryCatch(w$.__enclos_env__$private$.content, error = function(e) "")
    v
}
extractPayload <- function(res) {
    html <- getHtml(res)
    m <- regmatches(html, regexec("var __gb2_payload = (\\{.*?\\});\nvar __gb2_id = \"([^\"]+)\";", html))[[1]]
    if (length(m) != 3) stop("payload extraction failed")
    m[2]
}

# ------------------------------------------------------------------ datasets
# Three deliberately dissimilar CG datasets. A and B fill every role
# (group + facet) with different names/sizes/ranges so coincidental equality
# is unlikely; C is the bare config (ungrouped, unfaceted) so keys whose
# VALUES flip with role presence (hasGroups etc.) join the channel list.
mkCG <- function(cats, groups, facets, base, spread, npc, seed) {
    set.seed(seed)
    rows <- expand.grid(x = cats, g = if (is.null(groups)) "" else groups,
                        f = if (is.null(facets)) "" else facets,
                        i = seq_len(npc), stringsAsFactors = FALSE)
    d <- data.frame(x = factor(rows$x, levels = cats),
                    y = base + spread * stats::runif(nrow(rows)))
    if (!is.null(groups)) d$g <- factor(rows$g, levels = groups)
    if (!is.null(facets)) d$f <- factor(rows$f, levels = facets)
    d
}

payloads_plotbuilder <- function() {
    dA <- mkCG(c("Alpha", "Beta", "Gamma"), c("G1", "G2"), c("East", "West"), 10, 40, 5, 11)
    dB <- mkCG(c("One", "Two", "Three", "Four"), c("X", "Y", "Z"), c("P1", "P2", "P3"), 100, 800, 8, 22)
    names(dB) <- c("cond", "score", "arm", "site")   # different labels than A
    dB$score[c(3, 17)] <- NA                          # surface missingNote
    dC <- mkCG(c("A", "B", "C"), NULL, NULL, 1, 9, 6, 33)
    names(dC) <- c("category", "value")
    list(
        A = plotbuilder(data = dA, xvar = "x", yvar = "y", groupVar = "g", facetVar = "f",
                        graphType = "bar", chartSpec = ""),
        B = plotbuilder(data = dB, xvar = "cond", yvar = "score", groupVar = "arm", facetVar = "site",
                        graphType = "bar", chartSpec = ""),
        C = plotbuilder(data = dC, xvar = "category", yvar = "value", groupVar = NULL, facetVar = NULL,
                        graphType = "bar", chartSpec = "")
    )
}

payloads_distplotbuilder <- function() {
    dA <- mkCG(c("u"), c("G1", "G2"), c("East", "West"), 10, 40, 30, 44)
    dA$x <- NULL; names(dA) <- c("y", "g", "f")
    set.seed(45); dA$y <- 10 + 40 * stats::runif(nrow(dA))
    dB <- data.frame(hours = c(100 + 800 * stats::runif(150), NA, NA),
                     arm = factor(rep(c("X", "Y", "Z"), length.out = 152)),
                     site = factor(rep(c("P1", "P2"), length.out = 152)))
    dC <- data.frame(value = 1 + 9 * stats::runif(40))
    list(
        A = distplotbuilder(data = dA, var = "y", groupVar = "g", facetVar = "f",
                            graphType = "histogram", chartSpec = ""),
        B = distplotbuilder(data = dB, var = "hours", groupVar = "arm", facetVar = "site",
                            graphType = "histogram", chartSpec = ""),
        C = distplotbuilder(data = dC, var = "value", groupVar = NULL, facetVar = NULL,
                            graphType = "histogram", chartSpec = "")
    )
}

payloads_freqplotbuilder <- function() {
    set.seed(55)
    dA <- data.frame(kind = factor(sample(c("Alpha", "Beta", "Gamma"), 90, TRUE)),
                     g = factor(sample(c("G1", "G2"), 90, TRUE)),
                     f = factor(sample(c("East", "West"), 90, TRUE)))
    dB <- data.frame(cond = factor(sample(c("One", "Two", "Three", "Four"), 210, TRUE),
                                   levels = c("One", "Two", "Three", "Four")),
                     arm = factor(sample(c("X", "Y", "Z"), 210, TRUE)),
                     site = factor(sample(c("P1", "P2", "P3"), 210, TRUE)))
    dB$cond[c(4, 9)] <- NA
    dC <- data.frame(category = factor(sample(c("A", "B", "C"), 60, TRUE)))
    list(
        A = freqplotbuilder(data = dA, var = "kind", groupVar = "g", facetVar = "f",
                            graphType = "bar", chartSpec = ""),
        B = freqplotbuilder(data = dB, var = "cond", groupVar = "arm", facetVar = "site",
                            graphType = "bar", chartSpec = ""),
        C = freqplotbuilder(data = dC, var = "category", groupVar = NULL, facetVar = NULL,
                            graphType = "bar", chartSpec = "")
    )
}

payloads_xyplotbuilder <- function() {
    set.seed(66)
    dA <- data.frame(x = 10 + 40 * stats::runif(60))
    dA$y <- 5 + 0.8 * dA$x + stats::rnorm(60, 0, 4)
    dA$g <- factor(sample(c("G1", "G2"), 60, TRUE))
    dA$f <- factor(sample(c("East", "West"), 60, TRUE))
    set.seed(67)
    dB <- data.frame(hours = 100 + 800 * stats::runif(140))
    dB$score <- 900 - 0.5 * dB$hours + stats::rnorm(140, 0, 60)
    dB$arm <- factor(sample(c("X", "Y", "Z"), 140, TRUE))
    dB$site <- factor(sample(c("P1", "P2", "P3"), 140, TRUE))
    dB$score[c(5, 12)] <- NA
    set.seed(68)
    dC <- data.frame(height = 1 + 9 * stats::runif(35))
    dC$mass <- 2 + 1.5 * dC$height + stats::rnorm(35, 0, 2)
    list(
        A = xyplotbuilder(data = dA, xvar = "x", yvar = "y", groupVar = "g", facetVar = "f",
                          sizeVar = NULL, labelVar = NULL, chartSpec = ""),
        B = xyplotbuilder(data = dB, xvar = "hours", yvar = "score", groupVar = "arm", facetVar = "site",
                          sizeVar = NULL, labelVar = NULL, chartSpec = ""),
        C = xyplotbuilder(data = dC, xvar = "height", yvar = "mass", groupVar = NULL, facetVar = NULL,
                          sizeVar = NULL, labelVar = NULL, chartSpec = "")
    )
}

# RM uses the SIMPLE measures path (the factorial rm/rmCells design is out
# of standalone v1 scope): measures (multi) + the singular betweenVar; the
# simple path never facets.
payloads_rmplotbuilder <- function() {
    set.seed(77)
    dA <- data.frame(t1 = round(10 + 5 * stats::rnorm(24), 2))
    dA$t2 <- round(dA$t1 + 2 + stats::rnorm(24), 2)
    dA$t3 <- round(dA$t1 + 4 + stats::rnorm(24), 2)
    dA$g <- factor(rep(c("G1", "G2"), 12))
    set.seed(78)
    dB <- data.frame(pre = round(100 + 30 * stats::rnorm(40), 1),
                     mid = round(110 + 30 * stats::rnorm(40), 1),
                     post = round(120 + 30 * stats::rnorm(40), 1),
                     late = round(115 + 30 * stats::rnorm(40), 1),
                     arm = factor(rep(c("X", "Y"), 20)))
    dB$mid[c(3, 9)] <- NA
    set.seed(79)
    dC <- data.frame(a1 = round(1 + 9 * stats::runif(15), 3),
                     a2 = round(2 + 9 * stats::runif(15), 3))
    list(
        A = rmplotbuilder(data = dA, measures = c("t1", "t2", "t3"),
                          betweenVar = "g", rm = NULL, rmCells = NULL,
                          bs = NULL, graphType = "line", chartSpec = ""),
        B = rmplotbuilder(data = dB, measures = c("pre", "mid", "post", "late"),
                          betweenVar = "arm", rm = NULL, rmCells = NULL,
                          bs = NULL, graphType = "line", chartSpec = ""),
        C = rmplotbuilder(data = dC, measures = c("a1", "a2"),
                          betweenVar = NULL, rm = NULL, rmCells = NULL,
                          bs = NULL, graphType = "line", chartSpec = "")
    )
}

payloads_corrplotbuilder <- function() {
    set.seed(87)
    dA <- data.frame(w = round(stats::rnorm(50), 3))
    dA$x <- round(0.6 * dA$w + stats::rnorm(50, 0, 0.8), 3)
    dA$y <- round(-0.4 * dA$w + stats::rnorm(50, 0, 0.9), 3)
    dA$z <- round(stats::rnorm(50), 3)
    dA$x[c(4, 11)] <- NA
    set.seed(88)
    dB <- data.frame(alpha = round(50 + 9 * stats::rnorm(120), 2),
                     beta = round(30 + 7 * stats::rnorm(120), 2),
                     gamma = round(20 + 5 * stats::rnorm(120), 2))
    set.seed(89)
    dC <- data.frame(u = round(stats::runif(18), 4),
                     v = round(stats::runif(18), 4))
    list(
        A = corrplotbuilder(data = dA, vars = c("w", "x", "y", "z"), chartSpec = ""),
        B = corrplotbuilder(data = dB, vars = c("alpha", "beta", "gamma"), chartSpec = ""),
        C = corrplotbuilder(data = dC, vars = c("u", "v"), chartSpec = "")
    )
}

payloads_likertplotbuilder <- function() {
    set.seed(97)
    lv5 <- c("Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree")
    mk_item <- function(n) factor(sample(lv5, n, TRUE), levels = lv5)
    dA <- data.frame(q1 = mk_item(60), q2 = mk_item(60), q3 = mk_item(60),
                     q4 = mk_item(60))
    dA$q2[c(5, 12)] <- NA
    set.seed(98)
    dB <- data.frame(s1 = sample(1:7, 90, TRUE), s2 = sample(1:7, 90, TRUE),
                     s3 = sample(1:7, 90, TRUE))
    set.seed(99)
    lv4 <- c("Never", "Sometimes", "Often", "Always")
    dC <- data.frame(r1 = factor(sample(lv4, 30, TRUE), levels = lv4),
                     r2 = factor(sample(lv4, 30, TRUE), levels = lv4))
    list(
        A = likertplotbuilder(data = dA, items = c("q1", "q2", "q3", "q4"), chartSpec = ""),
        B = likertplotbuilder(data = dB, items = c("s1", "s2", "s3"), chartSpec = ""),
        C = likertplotbuilder(data = dC, items = c("r1", "r2"), chartSpec = "")
    )
}

MODULES <- list(plotbuilder = payloads_plotbuilder,
                distplotbuilder = payloads_distplotbuilder,
                freqplotbuilder = payloads_freqplotbuilder,
                xyplotbuilder = payloads_xyplotbuilder,
                rmplotbuilder = payloads_rmplotbuilder,
                corrplotbuilder = payloads_corrplotbuilder,
                likertplotbuilder = payloads_likertplotbuilder)

# ------------------------------------------------------------------ diff
manifest <- list()
tjs <- c("// GENERATED by standalone/build-templates.R - do not hand-edit.",
         "window.PS_TEMPLATES = {};")
for (mod in names(MODULES)) {
    raw <- lapply(MODULES[[mod]](), extractPayload)
    parsed <- lapply(raw, function(txt) jsonlite::fromJSON(txt, simplifyVector = FALSE))
    keys <- sort(unique(unlist(lapply(parsed, names))))
    channels <- character(0)
    for (k in keys) {
        present <- vapply(parsed, function(p) k %in% names(p), logical(1))
        if (!all(present)) { channels <- c(channels, k); next }
        vals <- lapply(parsed, `[[`, k)
        same <- all(vapply(vals[-1], function(v) identical(v, vals[[1]]), logical(1)))
        if (!same) channels <- c(channels, k)
    }
    # The template is the SIMPLEST config's payload (C), written raw so the
    # exact numeric formatting the engine was verified against is preserved.
    writeLines(raw$C, file.path(OUTDIR, paste0(mod, ".json")), useBytes = TRUE)
    writeLines(as.character(jsonlite::toJSON(channels)),
               file.path(OUTDIR, paste0(mod, ".channels.json")), useBytes = TRUE)
    manifest[[mod]] <- list(keys = length(keys), channels = channels)
    tjs <- c(tjs, paste0("window.PS_TEMPLATES[", jsonlite::toJSON(mod, auto_unbox = TRUE),
                         "] = { channels: ", as.character(jsonlite::toJSON(channels)),
                         ", payload: ", raw$C, " };"))
    cat(mod, ":", length(keys), "keys,", length(channels), "channels:\n  ",
        paste(channels, collapse = "\n   "), "\n")
}
# ------------------------------------------------------------------ stamp
# Punch list t3-60. The templates carried no version of any kind, so a change
# to the R marshalling - a new payload key with a non-falsy default, or a
# changed default - left the standalone rendering last month's look with
# nothing anywhere to say so.
#
# TWO hashes, because they answer different questions and only one of them can
# honestly be asserted:
#
#   marshalMd5  the R files that PRODUCE these payloads. If this moves and the
#               templates were not regenerated, the templates are stale. That
#               is a hard failure, and verify/engine-stamp-check.mjs recomputes
#               it and says so.
#   engineMd5   the JS bundle that CONSUMES them. This moves whenever the
#               jamovi side ships, usually without invalidating a single
#               template, so it is recorded and shown in Diagnostics for bug
#               reports and never asserted.
# md5 over a file SET, order-fixed: the files are concatenated and hashed once,
# so adding a marshalling file changes the stamp exactly as editing one does.
md5of <- function(paths) {
    missing <- paths[!file.exists(paths)]
    if (length(missing)) stop("cannot stamp, missing: ",
                              paste(missing, collapse = ", "))
    tf <- tempfile()
    con <- file(tf, "wb")
    on.exit(close(con), add = TRUE)
    for (p in paths)
        writeBin(readBin(p, what = "raw", n = file.size(p)), con)
    close(con); on.exit()
    unname(as.character(tools::md5sum(tf)))
}
MARSHAL_FILES <- c("R/widget.R", "R/spec_explode.R", "R/utils.R",
                   paste0("R/", names(MODULES), ".b.R"))
stamp <- list(
    marshalMd5 = md5of(MARSHAL_FILES),
    marshalFiles = MARSHAL_FILES,
    engineMd5 = md5of("inst/widget/graphbuilder2.min.js"),
    generated = format(Sys.Date()))
tjs <- c(tjs, paste0("window.PS_TEMPLATES.__stamp = ",
                     as.character(jsonlite::toJSON(stamp, auto_unbox = TRUE)),
                     ";"))
manifest[["__stamp"]] <- stamp
writeLines(tjs, file.path(OUTDIR, "templates.js"), useBytes = TRUE)
writeLines(as.character(jsonlite::toJSON(manifest, auto_unbox = TRUE, pretty = TRUE)),
           file.path(OUTDIR, "manifest.json"), useBytes = TRUE)
cat("stamp: marshal", substr(stamp$marshalMd5, 1, 12),
    " engine", substr(stamp$engineMd5, 1, 12), "\n")
cat("wrote templates to", OUTDIR, "\n")
