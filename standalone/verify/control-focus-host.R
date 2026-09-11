# A real recomputed RM result for the UX-03/04 host-replacement probe.
# Use the same synthetic seed/data as scripts/verify/render.R's rm_bar.
args <- commandArgs(trailingOnly = TRUE)
stopifnot(length(args) == 1L)
OUT <- args[[1L]]
Sys.setenv(R_USER_CONFIG_DIR = file.path(OUT, "config"), GB2_INLINE_BUNDLE = "1")
suppressWarnings(suppressMessages({
    library(jmvcore); library(R6)
    source("R/palette_library.R"); source("R/style_library.R")
    source("R/utils.R"); source("R/gb_family_core.R")
    source("R/spec_explode.R"); source("R/widget.R")
    source("R/rmplotbuilder.h.R"); source("R/rmplotbuilder.b.R")
}))
.gb2_widget_js <- function() paste(readLines("inst/widget/graphbuilder2.js",
    warn = FALSE, encoding = "UTF-8"), collapse = "\n")
environment(graphbuilder2_html) <- globalenv()
set.seed(5)
rmd <- data.frame(t1 = rnorm(40, 10, 2), t2 = rnorm(40, 12, 2),
                  t3 = rnorm(40, 13, 2), sex = rep(c("M", "F"), 20))
res <- rmplotbuilder(data = rmd, measures = c("t1", "t2", "t3"), bs = NULL,
                    betweenVar = "sex", graphType = "bar",
                    errorBarType = "sd", errorBarMethod = "between")
html <- tryCatch(res$widget$content, error = function(e) NULL)
if (is.null(html)) html <- res$widget$.__enclos_env__$private$.content
stopifnot(is.character(html), length(html) == 1L)
# Retain the actual serialized payload, including R-computed half-widths.
marker <- regexpr("var __gb2_payload = ", html, fixed = TRUE)
stopifnot(marker[[1L]] > 0L)
tail <- substring(html, marker[[1L]] + attr(marker, "match.length"))
payload <- strsplit(tail, ";\n", fixed = TRUE)[[1L]][[1L]]
parsed <- jsonlite::fromJSON(payload, simplifyVector = FALSE)
stopifnot(identical(parsed$errorBarType, "sd"), identical(parsed$errorBarMethod, "between"))
writeLines(payload, file.path(OUT, "rm_bar_between_payload.json"), useBytes = TRUE)
