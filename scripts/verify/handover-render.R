# Fixture for handover-check.mjs: a plain chart rendered with the CURRENT
# engine, with both handover switches OFF (the shipping default), so the
# check can drive all three states from one page.
invisible(suppressWarnings(Sys.setlocale("LC_ALL", "en_US.UTF-8")))
if (!requireNamespace("jmvcore", quietly = TRUE)) {
    cat("jmvcore not available - skipped\n"); quit(status = 2)
}
suppressMessages(library(jmvcore))
for (f in c("R/spec_explode.R","R/utils.R","R/gb_family_core.R","R/palette_library.R",
            "R/style_library.R","R/widget.R","R/helpmechoose_wizard.R",
            "R/plotbuilder.h.R","R/plotbuilder.b.R")) source(f)
BUNDLE <- if (identical(Sys.getenv("GB2_BUNDLE"), "min")) "min" else "src"
.gb2_widget_js <- function() paste(readLines(
    if (BUNDLE == "min") "inst/widget/graphbuilder2.min.js"
    else "inst/widget/graphbuilder2.js", warn = FALSE, encoding = "UTF-8"),
    collapse = "\n")
environment(graphbuilder2_html) <- globalenv()
Sys.setenv(GB2_INLINE_BUNDLE = "1")
OUT <- Sys.getenv("GB2_HANDOVER_OUT", "/tmp/gb2-handover")
dir.create(OUT, showWarnings = FALSE, recursive = TRUE)
set.seed(4)
d <- data.frame(x = factor(rep(c("A","B","C"), each = 8)), y = rnorm(24, 50, 9))
h <- plotbuilder(data = d, xvar = "x", yvar = "y", groupVar = NULL,
                 facetVar = NULL)$widget$content
con <- file(file.path(OUT, paste0("h_", BUNDLE, ".html")), open = "wb")
writeLines('<meta charset="utf-8">', con, useBytes = TRUE)
writeLines(enc2utf8(h), con, useBytes = TRUE); close(con)
# The shipping default must not advertise either handover. Check the
# PAYLOAD, not the page: the engine source is inlined here and of course
# mentions both key names.
pl <- regmatches(h, regexpr("var __gb2_payload = \\{.*?\\};\n", h))
stopifnot(length(pl) == 1)
res <- grepl("svgHandoverResize", pl, fixed = TRUE)
exp <- grepl("svgHandoverExport", pl, fixed = TRUE)
cat("payload advertises resize handover:", res, "\n")
cat("payload advertises export handover:", exp, "\n")
if (res || exp) {
    cat("FAIL: a handover switch is on by default - the module would stand",
        "down as soon as jamovi ships the Svg element\n")
    quit(status = 1)
}
cat("default: both handovers pending (module keeps its own controls)\n")

# ---- The switch has to work where it will actually be thrown ----------
# An env var reaches a harness but never a running jamovi (it strips
# inherited env at the Electron->server spawn), so the flag file is the
# only route a person can use to try the handover against a live build.
# HOME is redirected first: this probe must never touch the real one.
real_home <- Sys.getenv("HOME")
tmp_home <- file.path(tempdir(), "handover-home")
dir.create(tmp_home, showWarnings = FALSE, recursive = TRUE)
on.exit(Sys.setenv(HOME = real_home), add = TRUE)
Sys.setenv(HOME = tmp_home)
stopifnot(identical(path.expand("~"), tmp_home))   # else we would write to the real home
for (v in c("GB2_HANDOVER_RESIZE", "GB2_HANDOVER_EXPORT")) Sys.unsetenv(v)

rz <- file.path(tmp_home, ".plotstudio-handover-resize")
ex <- file.path(tmp_home, ".plotstudio-handover-export")
say <- function(label, ok) {
    cat(if (ok) "  ok   " else "  FAIL ", label, "\n", sep = "")
    if (!ok) quit(status = 1)
}
say("clean home: both pending",
    !gb2_handover_resize() && !gb2_handover_export())
invisible(file.create(rz))
say("resize flag stands the grip down, on its own",
    gb2_handover_resize() && !gb2_handover_export())
invisible(file.create(ex))
say("export flag stands the button down too", gb2_handover_export())
# The env var still wins, so a harness can force either state back.
Sys.setenv(GB2_HANDOVER_RESIZE = "0")
say("an explicit env off beats the flag file", !gb2_handover_resize())
Sys.unsetenv("GB2_HANDOVER_RESIZE")
unlink(c(rz, ex))
say("removing the flags takes both controls back",
    !gb2_handover_resize() && !gb2_handover_export())
Sys.setenv(HOME = real_home)
cat("handover switches: reachable in a real installation, off by default\n")
