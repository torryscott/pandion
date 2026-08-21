# Script-src suite-wide contract probe.
#
# Verifies both sides of the production-default transition:
#   * all seven chart analyses declare the shared module script, mark their
#     graphbuilder2_html() delivery as script-src-ready, and avoid shipping an
#     inline engine with empty placeholders;
#   * graphbuilder2_html() emits a payload-only script-src loader by default,
#     while the existing cached-inline path remains available through the
#     explicit emergency rollback switch.

deps <- c("jsonlite", "htmltools")
missing <- deps[!vapply(deps, requireNamespace, logical(1), quietly = TRUE)]
if (length(missing)) {
    cat("missing packages:", paste(missing, collapse = ", "), "\n")
    quit(status = 2)
}
if (!file.exists("inst/widget/graphbuilder2.min.js")) {
    cat("graphbuilder2.min.js not built (run scripts/minify-widget.sh)\n")
    quit(status = 2)
}

source("R/palette_library.R")
source("R/style_library.R")
source("R/utils.R")
source("R/gb_family_core.R")
source("R/spec_explode.R")
source("R/widget.R")

js_code <- paste(readLines("inst/widget/graphbuilder2.min.js",
                           warn = FALSE, encoding = "UTF-8"),
                 collapse = "\n")
js_hash <- unname(tools::md5sum("inst/widget/graphbuilder2.min.js"))
.gb2_widget_js <- function() js_code
.gb2_widget_js_hash <- function() js_hash
environment(graphbuilder2_html) <- globalenv()
environment(gb2_engine_boot_html) <- globalenv()
environment(gb2_engine_placeholder_html) <- globalenv()

fails <- 0L
expect <- function(label, cond) {
    if (isTRUE(cond)) cat("  ok:", label, "\n")
    else {
        cat("  FAIL:", label, "\n")
        fails <<- fails + 1L
    }
}

analysis_files <- file.path(
    "R",
    c("plotbuilder.b.R", "distplotbuilder.b.R", "freqplotbuilder.b.R",
      "xyplotbuilder.b.R", "rmplotbuilder.b.R", "corrplotbuilder.b.R",
      "likertplotbuilder.b.R")
)
for (path in analysis_files) {
    txt <- paste(readLines(path, warn = FALSE), collapse = "\n")
    label <- basename(path)
    expect(paste(label, "initializes shared script-src"),
           grepl("gb2_init_script_src(self$results$widget)", txt, fixed = TRUE))
    expect(paste(label, "marks payload script-src-ready"),
           grepl("script_src_ready = TRUE", txt, fixed = TRUE))
    expect(paste(label, "routes placeholders through shared selector"),
           grepl("gb2_engine_placeholder_html(", txt, fixed = TRUE))
    expect(paste(label, "has no direct placeholder bundle ship"),
           !grepl("gb2_engine_boot_html(", txt, fixed = TRUE))
}

# The production default must be script-src with no opt-in flag.
old_rollback <- Sys.getenv("GB2_INLINE_BUNDLE", unset = NA_character_)
Sys.unsetenv("GB2_INLINE_BUNDLE")
expect("script-src is enabled by default", isTRUE(gb2_script_src_on()))

# Exercise the generated analysis wrappers too when jmvcore is available.
# This proves .init() reaches the real Html result binding and that each
# analysis emits engine-free content under the flag.
if (requireNamespace("jmvcore", quietly = TRUE) &&
        requireNamespace("R6", quietly = TRUE)) {
    suppressWarnings(suppressMessages({
        library(jmvcore)
        library(R6)
        for (stem in c("plotbuilder", "distplotbuilder", "freqplotbuilder",
                       "xyplotbuilder", "rmplotbuilder", "corrplotbuilder",
                       "likertplotbuilder")) {
            source(file.path("R", paste0(stem, ".h.R")))
            source(file.path("R", paste0(stem, ".b.R")))
        }
    }))

    dat <- data.frame(
        cat = factor(rep(c("A", "B"), 6)),
        y = seq_len(12),
        z = seq_len(12) + rep(c(0, 1), 6),
        l1 = factor(rep(1:3, 4)),
        l2 = factor(rep(3:1, 4))
    )
    runtime_cases <- list(
        "Compare Groups" = function() plotbuilder(
            data = dat, xvar = "cat", yvar = NULL,
            groupVar = NULL, facetVar = NULL),
        "Distribution" = function() distplotbuilder(
            data = dat, var = "y", groupVar = NULL, facetVar = NULL),
        "Frequencies" = function() freqplotbuilder(
            data = dat, var = "cat", groupVar = NULL, facetVar = NULL),
        "Correlations" = function() xyplotbuilder(
            data = dat, xvar = "y", yvar = NULL, groupVar = NULL,
            facetVar = NULL, sizeVar = NULL, labelVar = NULL),
        "Repeated Measures" = function() rmplotbuilder(
            data = dat, measures = "y", betweenVar = NULL, bs = NULL,
            rm = NULL, rmCells = NULL),
        "Correlation Matrix" = function() corrplotbuilder(
            data = dat, vars = c("y", "z")),
        "Likert" = function() likertplotbuilder(
            data = dat, items = c("l1", "l2"))
    )
    for (label in names(runtime_cases)) {
        res <- tryCatch(runtime_cases[[label]](), error = identity)
        expect(paste(label, "runtime wrapper constructs"),
               !inherits(res, "error"))
        if (!inherits(res, "error")) {
            expect(paste(label, "runtime Html carries module script"),
                   identical(res$widget$scripts,
                             "widget/graphbuilder2.min.js"))
            expect(paste(label, "runtime content carries no inline engine"),
                   !grepl("GB2_BUNDLE_START", res$widget$content,
                          fixed = TRUE))
        }
    }
} else {
    cat("  skip: jmvcore unavailable for runtime wrapper checks\n")
}

# Raw scripts binding helper.
fake_result <- new.env(parent = emptyenv())
expect("shared initializer reports success",
       isTRUE(gb2_init_script_src(fake_result)))
expect("shared initializer sets package-relative script path",
       identical(fake_result$scripts, "widget/graphbuilder2.min.js"))

bars <- list(list(x = "A", group = "", mean = 1, se = 0,
                  n = 1, values = 1))

# Enabled path. The bundle and localStorage store must be completely absent.
set.seed(1)
ss <- graphbuilder2_html(bars = bars, script_src_ready = TRUE,
                         client_bundle_hash = js_hash)
expect("enabled output has script-src lifecycle loader",
       grepl("gb2-scriptsrc-wait", ss, fixed = TRUE))
expect("enabled output carries no embedded engine markers",
       !grepl("GB2_BUNDLE_START", ss, fixed = TRUE))
expect("enabled output carries no bundle localStorage key",
       !grepl(paste0("graphbuilder2.bundle.", js_hash), ss, fixed = TRUE))
expect("enabled output reports scriptsrc mode",
       grepl('\\"bundle_mode\\":\\"scriptsrc\\"', ss))
# "Plain" means engine-free and deterministic, not byte-frozen: since
# Aug 2026 placeholders deliberately draw a full-size EMPTY chart frame
# (the jamovi convention, its maintainer's ask) around the message, so the
# old byte-exact expectation would re-fail on every frame polish. The
# durable contract: the message rides through verbatim, an aria-hidden
# frame svg may accompany it, and the enabled path never smuggles the
# engine or a bundle store in with it.
ph1 <- gb2_engine_placeholder_html(
    "<div>placeholder</div>", js_hash, script_src_ready = TRUE)
ph2 <- gb2_engine_placeholder_html(
    "<div>placeholder</div>", js_hash, script_src_ready = TRUE)
expect("enabled placeholder stays plain",
       grepl("<div>placeholder</div>", ph1, fixed = TRUE) &&
       !grepl("GB2_BUNDLE_START", ph1, fixed = TRUE) &&
       !grepl("localStorage", ph1, fixed = TRUE) &&
       !grepl("<script", ph1, fixed = TRUE) &&
       identical(ph1, ph2))

# Guard and rollback switch. A module not declaring readiness must not emit an
# engine-less script-src payload, and the explicit rollback must preserve the
# current cached-inline route for emergency recovery.
set.seed(1)
not_ready <- graphbuilder2_html(bars = bars, script_src_ready = FALSE,
                                client_bundle_hash = "")
expect("readiness guard falls back to inline engine",
       grepl("GB2_BUNDLE_START", not_ready, fixed = TRUE))

Sys.setenv(GB2_INLINE_BUNDLE = "1")
expect("emergency rollback disables script-src", !gb2_script_src_on())
set.seed(1)
cached <- graphbuilder2_html(bars = bars, script_src_ready = TRUE,
                             client_bundle_hash = js_hash)
expect("rollback preserves cached-inline loader",
       grepl(paste0("graphbuilder2.bundle.", js_hash), cached, fixed = TRUE))
expect("rollback reports cached mode",
       grepl('\\"bundle_mode\\":\\"cached\\"', cached))

if (is.na(old_rollback)) {
    Sys.unsetenv("GB2_INLINE_BUNDLE")
} else {
    Sys.setenv(GB2_INLINE_BUNDLE = old_rollback)
}

if (fails > 0L)
    quit(status = 1)
cat("script-src suite-wide contract passed\n")
