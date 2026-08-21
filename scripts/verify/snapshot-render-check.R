# The snapshot Image must still rasterize now that .renderSnapshot reads the
# OPTION instead of this image's state (the state was a duplicate copy of the
# same SVG, ~13% of the saved analyses in a real file).
.libPaths(c(file.path(Sys.getenv("HOME"),
    "Library/Application Support/jamovi/modules/pandion/R"), .libPaths()))
invisible(suppressWarnings(Sys.setlocale("LC_ALL", "en_US.UTF-8"))); if (!requireNamespace("jmvcore", quietly = TRUE)) {
    cat("jmvcore not available - skipped\n"); quit(status = 2)
}
suppressMessages(library(jmvcore))
for (f in c("R/spec_explode.R","R/utils.R","R/gb_family_core.R","R/palette_library.R",
            "R/style_library.R","R/widget.R","R/helpmechoose_wizard.R",
            "R/plotbuilder.h.R","R/plotbuilder.b.R")) source(f)
ok <- function(c,m) if (isTRUE(c)) cat("  ok  ",m,"\n") else stop("FAIL: ",m)
if (!requireNamespace("rsvg", quietly = TRUE)) {
    cat("rsvg not available (module not installed here) - skipped\n"); quit(status = 2)
}
ok(TRUE, "rsvg available (the module ships it)")

svg <- paste0('<svg data-role="gb2-chart-svg" xmlns="http://www.w3.org/2000/svg" ',
  'width="700" height="450"><rect width="700" height="450" fill="#eee"/>',
  '<rect x="40" y="40" width="120" height="300" fill="#2d5c94"/></svg>')

# Call the real private method with a stub self/image, the way jamovi does.
render <- plotbuilderClass$private_methods$.renderSnapshot
ok(is.function(render), "the module still defines .renderSnapshot")

run <- function(snapopt) {
  env <- new.env()
  env$self <- list(options = list(chartSnapshot = snapopt))
  environment(render) <- list2env(list(self = env$self), parent = globalenv())
  img <- list(state = NULL, width = 700, height = 450)   # NO state on purpose
  f <- tempfile(fileext=".png"); png(f, width=700, height=450)
  r <- tryCatch(render(img, NULL, NULL), error=function(e) paste("THREW:", conditionMessage(e)))
  dev.off(); unlink(f); r
}
ok(isTRUE(run(paste0("700:450|", svg))),
   "renders from the OPTION with the image carrying no state")
ok(identical(run(""), FALSE), "no snapshot -> FALSE, no throw")
ok(identical(run("700:450|<svg><script>alert(1)</script></svg>"), FALSE),
   "script-bearing snapshot refused (gb_parse_snapshot now gates the render path too)")
ok(identical(run("not-a-valid-snapshot"), FALSE), "malformed snapshot -> FALSE, no throw")
ok(identical(run(paste0("700:450|", paste(rep("x", 100), collapse=""))), FALSE),
   "non-svg body refused")
cat("SNAPSHOT RENDER CHECK: PASS\n")
