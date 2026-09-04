# Hidden-points badge round-trip probe - renderer (Sep 2026).
# The badge remembers where the user dragged it in two client-only keys
# (hpBadgeLeft / hpBadgeTop) that ride inside chartSpec. The client filters
# that blob through data.specKeys both when seeding its own copy and when
# exploding into data.*, so a module whose allowlist omits the pair drops
# the position and the next style commit writes the blob back without it.
# Renders one page per points-bearing module with a chartSpec that ALREADY
# carries a dragged badge position.
# Env: GB2_HPBADGE_OUT (default /tmp/gb2-hpbadge)  GB2_BUNDLE=min|source
ok <- requireNamespace("jmvcore", quietly = TRUE)
if (!ok) { cat("jmvcore not available\n"); quit(status = 2) }
suppressWarnings(suppressMessages({
    library(jmvcore); library(R6)
    source("R/palette_library.R"); source("R/style_library.R")
    source("R/utils.R"); source("R/gb_family_core.R")
    source("R/spec_explode.R"); source("R/widget.R")
    for (m in c("plotbuilder", "rmplotbuilder", "distplotbuilder")) {
        source(sprintf("R/%s.h.R", m)); source(sprintf("R/%s.b.R", m))
    }
}))
BUNDLE <- Sys.getenv("GB2_BUNDLE", "source")
jsfile <- if (identical(BUNDLE, "min")) {
    "inst/widget/graphbuilder2.min.js"
} else {
    "inst/widget/graphbuilder2.js"
}
.gb2_widget_js <- function()
    paste(readLines(jsfile, warn = FALSE, encoding = "UTF-8"), collapse = "\n")
.gb2_widget_js_hash <- function() ""
environment(graphbuilder2_html) <- globalenv()

OUT <- Sys.getenv("GB2_HPBADGE_OUT", "/tmp/gb2-hpbadge")
dir.create(OUT, showWarnings = FALSE, recursive = TRUE)
set.seed(7)
n <- 60
df <- data.frame(
    g  = factor(rep(c("A", "B", "C"), each = n / 3)),
    yy = rnorm(n, 50, 9),
    t1 = rnorm(n, 10, 2),
    t2 = rnorm(n, 12, 2)
)
# A dragged position plus one hidden point, which is what makes the badge
# draw at all.
LEFT <- 137; TOP <- 84
spec <- sprintf(
    '{"hpBadgeLeft":%d,"hpBadgeTop":%d,"showDataPoints":true,"hiddenPoints":["0"]}',
    LEFT, TOP)

getC <- function(res) tryCatch(res$widget$content,
    error = function(e) res$widget$.__enclos_env__$private$.content)
writeOne <- function(name, obj) {
    con <- file(file.path(OUT, paste0(name, ".html")), open = "wb")
    writeLines('<meta charset="utf-8">', con, useBytes = TRUE)
    writeLines(getC(obj), con, useBytes = TRUE); close(con)
    cat("wrote", name, "\n")
}
run <- function(name, fn) {
    r <- try(fn(), silent = TRUE)
    if (inherits(r, "try-error")) {
        cat("SKIP", name, ":", conditionMessage(attr(r, "condition")), "\n")
        return(invisible())
    }
    writeOne(name, r)
}
run("cg",   function() plotbuilder(data = df, xvar = "g", yvar = "yy",
                                   groupVar = NULL, facetVar = NULL,
                                   chartSpec = spec))
run("rm",   function() rmplotbuilder(data = df, measures = c("t1", "t2"),
                                     betweenVar = NULL, bs = NULL,
                                     chartSpec = spec))
run("dist", function() distplotbuilder(data = df, var = "yy",
                                       groupVar = NULL, facetVar = NULL,
                                       chartSpec = spec))
cat("POSITION:", LEFT, TOP, "\n")
