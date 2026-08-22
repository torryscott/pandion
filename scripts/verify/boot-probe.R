# Engine-boot handshake probe (speed pass Phase 1, Jul 2026).
#
# Renders the pages boot-check.mjs drives, then asserts the R-side
# emission contract:
#   boot.html      empty-variable placeholder WITH the engine boot:
#                  marker-wrapped bundle + clientBundleHash
#                  write-back, but NO payload and NO
#                  render() call.
#   confirmed.html the same placeholder once the client hash matches:
#                  plain message only (this is what the hash echo's
#                  re-run emits, replacing the 1.9 MB boot content).
#   cached.html    a DATA render with the hash confirmed: the ~20 KB
#                  payload+loader page (in-window engine reuse).
#
# Always uses the MINIFIED bundle regardless of GB2_BUNDLE: that is
# what production ships, and the un-minified source (~5.8 MB) exceeds
# the localStorage quota, so the store snippet could never commit and
# boot-check.mjs's handoff cases would false-fail.
#
# Exit 2 = jmvcore missing (skipped) or min bundle not built.
# Env: GB2_BOOT_OUT  output dir (default /tmp/gb2-boot-probe)

ok <- requireNamespace("jmvcore", quietly = TRUE)
if (!ok) { cat("jmvcore not available\n"); quit(status = 2) }
if (!file.exists("inst/widget/graphbuilder2.min.js")) {
    cat("graphbuilder2.min.js not built (run scripts/minify-widget.sh)\n")
    quit(status = 2)
}

suppressWarnings(suppressMessages({
    library(jmvcore); library(R6)
    source("R/palette_library.R"); source("R/style_library.R")
    source("R/utils.R"); source("R/gb_family_core.R"); source("R/spec_explode.R"); source("R/widget.R")
    source("R/plotbuilder.h.R"); source("R/plotbuilder.b.R")
}))

JS_HASH <- unname(tools::md5sum("inst/widget/graphbuilder2.min.js"))
.gb2_widget_js <- function()
    paste(readLines("inst/widget/graphbuilder2.min.js", warn = FALSE,
                    encoding = "UTF-8"), collapse = "\n")
.gb2_widget_js_hash <- function() JS_HASH
environment(graphbuilder2_html) <- globalenv()
environment(gb2_engine_boot_html) <- globalenv()

OUT <- Sys.getenv("GB2_BOOT_OUT", "/tmp/gb2-boot-probe")
dir.create(OUT, showWarnings = FALSE, recursive = TRUE)

set.seed(1)
dat <- data.frame(grp = factor(sample(c("A", "B", "C"), 120, TRUE)),
                  y = rnorm(120, 50, 10))

getC <- function(res) tryCatch(res$widget$content, error = function(e)
    res$widget$.__enclos_env__$private$.content)
# Binary connection + useBytes: Rscript may run in the C locale, and
# plain writeLines would mangle multibyte chars (see render.R).
wr <- function(html, name) {
    con <- file(file.path(OUT, name), open = "wb")
    writeLines('<meta charset="utf-8">', con, useBytes = TRUE)
    writeLines(html, con, useBytes = TRUE)
    close(con)
}

fails <- 0L
expect <- function(label, cond) {
    if (isTRUE(cond)) cat("  ok:", label, "\n")
    else { cat("  FAIL:", label, "\n"); fails <<- fails + 1L }
}

# NOTE: the placeholder is triggered with ONE role empty (yvar) - the
# generated wrapper cannot select zero columns headlessly (jamovi
# handles the truly-empty case in production).
boot <- getC(plotbuilder(data = dat, xvar = "grp", yvar = NULL,
                         groupVar = NULL, facetVar = NULL))
wr(boot, "boot.html")
expect("boot: bundle markers present",
       grepl(paste0("GB2_BUNDLE_START:", JS_HASH), boot, fixed = TRUE))
expect("boot: placeholder message present",
       grepl("Drag a categorical variable", boot, fixed = TRUE))
expect("boot: hash write-back snippet present",
       grepl("clientBundleHash", boot, fixed = TRUE))
boot_tail <- sub(paste0(".*GB2_BUNDLE_END:", JS_HASH, "\\*/"), "", boot)
expect("boot: no render() call after the bundle",
       !grepl(".render(", boot_tail, fixed = TRUE))

confirmed <- getC(plotbuilder(data = dat, xvar = "grp", yvar = NULL,
                              groupVar = NULL, facetVar = NULL,
                              clientBundleHash = JS_HASH))
wr(confirmed, "confirmed.html")
expect("confirmed: plain placeholder (no script, small)",
       !grepl("<script>", confirmed, fixed = TRUE) && nchar(confirmed) < 2000)

cached <- getC(plotbuilder(data = dat, xvar = "grp", yvar = "y",
                           groupVar = NULL, facetVar = NULL,
                           clientBundleHash = JS_HASH))
wr(cached, "cached.html")
expect("cached: no bundle markers",
       !grepl("GB2_BUNDLE_START", cached, fixed = TRUE))
# The cached loader reuses the engine already live in this window; the
# localStorage copy it used to eval as a second layer was removed in the
# Aug 2026 audit (the cached VALUE was never verified against the hash
# that keyed it). Pinned negatively so the eval cannot return by accident.
expect("cached: reuses the in-window engine",
       grepl("window.GraphBuilder2.__hash ===", cached, fixed = TRUE))
expect("cached: NO localStorage bundle read",
       !grepl("graphbuilder2.bundle.", cached, fixed = TRUE))
expect("cached: NO eval of cached script",
       !grepl("(0, eval)", cached, fixed = TRUE))
expect("cached: self-heal poke present (clears the hash when no engine)",
       grepl('setOption("clientBundleHash", "")', cached, fixed = TRUE))
expect("cached: module-missing fallback retained",
       grepl("gb2-module-missing", cached, fixed = TRUE))
expect("cached: small (payload + loader only)", nchar(cached) < 300000)
expect("cached: run-entry prelude timing present",
       grepl("prelude=", cached, fixed = TRUE))

writeLines(JS_HASH, file.path(OUT, "hash.txt"))
cat(sprintf("boot=%d bytes  cached=%d bytes  -> %s\n",
            nchar(boot), nchar(cached), OUT))
if (fails > 0L) quit(status = 1)
