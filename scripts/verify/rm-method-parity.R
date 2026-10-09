# R parity fixtures for the engine's client-side Repeated Measures
# half-width recompute (Oct 9 2026): one grouped dataset with two missing
# occasions, rendered by the R module under every error-bar method x type
# pair. rm-method-parity.mjs then runs the engine's own fold on each page
# toward the OTHER method and compares with R's render of that method.
#
# Usage:  Rscript scripts/verify/rm-method-parity.R
# Env:    GB2_RM_PARITY_OUT  output dir (default /tmp/gb2-rm-parity)
#         GB2_BUNDLE         "source" (default) or "min"
# Exit 2 when jmvcore is not installed (the battery skips the probe).
.self <- gsub("~+~", " ", sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE)[1]), fixed = TRUE)
ROOT <- normalizePath(file.path(dirname(.self), "..", ".."))
setwd(ROOT)
OUT <- Sys.getenv("GB2_RM_PARITY_OUT", "/tmp/gb2-rm-parity")
dir.create(OUT, showWarnings = FALSE, recursive = TRUE)
Sys.setenv(R_USER_CONFIG_DIR = file.path(OUT, "config"))
BUNDLE <- Sys.getenv("GB2_BUNDLE", "source")
if (!requireNamespace("jmvcore", quietly = TRUE)) { message("jmvcore not installed; skipping"); quit(status = 2) }
suppressWarnings(suppressMessages({
    library(jmvcore); library(R6)
    source("R/palette_library.R"); source("R/style_library.R"); source("R/utils.R")
    source("R/gb_family_core.R"); source("R/spec_explode.R"); source("R/widget.R")
    source("R/rmplotbuilder.h.R"); source("R/rmplotbuilder.b.R")
}))
# The working tree's bundle, not an installed package (render.R's idiom).
.gb2_widget_js <- function() {
    f <- if (identical(BUNDLE, "min")) "inst/widget/graphbuilder2.min.js"
         else "inst/widget/graphbuilder2.js"
    paste(readLines(f, warn = FALSE, encoding = "UTF-8"), collapse = "\n")
}
environment(graphbuilder2_html) <- globalenv()
getHtml <- function(res) {
    w <- res$widget
    v <- tryCatch(w$content, error = function(e) NULL)
    if (is.null(v)) v <- tryCatch(w$.__enclos_env__$private$.content, error = function(e) "")
    v
}
wr <- function(res, name) {
    con <- file(file.path(OUT, paste0(name, ".html")), open = "wb")
    writeLines('<meta charset="utf-8">', con, useBytes = TRUE)
    writeLines(getHtml(res), con, useBytes = TRUE)
    close(con)
    cat("wrote", name, "\n")
}
set.seed(11)
subj <- rnorm(40, 0, 6)
rmd <- data.frame(t1 = subj + rnorm(40, 10, 2), t2 = subj + rnorm(40, 12, 2),
                  t3 = subj + rnorm(40, 11, 2), sex = rep(c("M", "F"), 20))
rmd$t2[c(3, 17)] <- NA   # two missing occasions: the lenient subject mean
for (m in c("within", "between")) for (ty in c("se", "sd", "ci95", "ci95c"))
    wr(rmplotbuilder(data = rmd, measures = c("t1", "t2", "t3"), bs = NULL,
                     betweenVar = "sex", errorBarMethod = m, errorBarType = ty),
       paste0("rm_", m, "_", ty))
