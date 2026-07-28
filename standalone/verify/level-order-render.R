# Punch list t4-18 (R side): pin the KNOWN level-order divergence.
#
# Torry's decision, Jul 26 2026: this shell keeps FIRST-SEEN nominal level
# order and does not match R. The reason is teaching, not convenience -
# R's factor() sorts, so a dose column reading Control / Low dose / High dose
# comes back as Control / High dose / Low dose, which is worse than useless
# for ordered-but-nominal data. Matching R would also silently reorder every
# already-saved chart and reshuffle its palette assignments.
#
# What was actually wrong was that the divergence was INVISIBLE and UNTESTED:
# m1-parity.R declares explicit levels for every factor, so it is structurally
# incapable of seeing this. This file exists to make the difference measured
# rather than latent. It records what R does with an UNDECLARED factor; the
# Node side records what the shell does with the same CSV and asserts both the
# difference AND its exact shape, so a silent change to either side fails.
#
# Usage: Rscript standalone/verify/level-order-render.R
# Writes: /tmp/ps-level-order/expected.json

tryCatch(invisible(Sys.setlocale("LC_ALL", "en_US.UTF-8")),
         warning = function(w) NULL, error = function(e) NULL)

.self <- gsub("~+~", " ", sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE)[1]), fixed = TRUE)
ROOT <- normalizePath(file.path(dirname(.self), "..", ".."))
setwd(ROOT)
OUT <- "/tmp/ps-level-order"
dir.create(OUT, showWarnings = FALSE, recursive = TRUE)
Sys.setenv(R_USER_CONFIG_DIR = file.path(OUT, "config"))
Sys.setenv(GB2_NO_BUNDLE_CACHE = "1")

if (!requireNamespace("jmvcore", quietly = TRUE)) {
    cat("jmvcore not available; skipping\n"); quit(status = 2)
}
suppressWarnings(suppressMessages({
    library(jmvcore); library(R6)
    source("R/palette_library.R"); source("R/style_library.R")
    source("R/utils.R")
    source("R/gb_family_core.R"); source("R/spec_explode.R"); source("R/widget.R")
    source("R/plotbuilder.h.R"); source("R/plotbuilder.b.R")
}))
.gb2_widget_js <- function() ""
environment(graphbuilder2_html) <- globalenv()

payloadOf <- function(res) {
    w <- res$widget
    html <- tryCatch(w$content, error = function(e) NULL)
    if (is.null(html))
        html <- tryCatch(w$.__enclos_env__$private$.content, error = function(e) "")
    m <- regmatches(html, regexec(
        "var __gb2_payload = (\\{.*?\\});\nvar __gb2_id = \"([^\"]+)\";", html))[[1]]
    if (length(m) != 3) stop("payload extraction failed")
    jsonlite::fromJSON(m[2], simplifyVector = FALSE)
}

# The dose case, in the order a person would type it. NO declared levels: this
# is exactly the shape m1-parity.R cannot produce, because it declares every
# factor's levels and so hands both sides the same answer.
#
# Two columns on purpose. `dose` is the ordered-but-nominal case the decision
# turns on (first-seen is MEANINGFUL, alphabetical is nonsense). `site` is the
# genuinely unordered case where alphabetical is harmless, which keeps the
# probe from proving the point only on the example chosen to prove it.
entry <- c("Control", "Low dose", "High dose")
sites <- c("North", "East", "Central")
set.seed(5150)
rows <- expand.grid(dose = entry, site = sites,
                    rep = 1:4, stringsAsFactors = FALSE)
d <- data.frame(
    dose = rows$dose,
    site = rows$site,
    score = round(50 + 10 * stats::rnorm(nrow(rows)), 2),
    stringsAsFactors = FALSE)
write.csv(d, file.path(OUT, "levels.csv"), row.names = FALSE)

# factor() with no levels argument, which is what R does to a bare character
# column: it SORTS.
d$dose <- factor(d$dose)
d$site <- factor(d$site)

res <- plotbuilder(data = d, xvar = "dose", yvar = "score",
                   groupVar = "site", facetVar = NULL,
                   graphType = "bar", chartSpec = "")
p <- payloadOf(res)

expected <- list(
    entryOrder = as.list(entry),
    siteEntryOrder = as.list(sites),
    rXCategories = p$xCategories,
    rGroupCategories = p$groupCategories,
    # Stated rather than assumed, so the probe can assert R really did sort
    # and is not merely agreeing with a coincidence.
    rSortedDose = as.list(sort(entry)),
    rSortedSite = as.list(sort(sites)))

con <- file(file.path(OUT, "expected.json"), open = "wb")
writeLines(as.character(jsonlite::toJSON(expected, auto_unbox = TRUE)),
           con, useBytes = TRUE)
close(con)
cat("R xCategories:", paste(unlist(p$xCategories), collapse = " | "), "\n")
cat("wrote", file.path(OUT, "expected.json"), "\n")
