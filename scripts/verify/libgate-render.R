# The saved palette/style libraries are a colour source that does NOT go
# through chartSpec: they live in palettes.json / styles.json, written from
# a library ACTION that a shared .omv can carry, and the palette flyout
# builds swatch markup from them. That route was a live, executing
# injection until Aug 2026 (audit round 3). This renders a chart whose
# library is deliberately poisoned; libgate-check.mjs then opens the
# flyout and asserts nothing runs.
#
# The poisoning is written directly into the library file so the probe
# tests the CLIENT defence even against a library poisoned before the
# R-side gate existed.
suppressMessages(library(jmvcore))
for (f in c("R/spec_explode.R","R/utils.R","R/gb_family_core.R","R/palette_library.R",
            "R/style_library.R","R/widget.R","R/helpmechoose_wizard.R",
            "R/plotbuilder.h.R","R/plotbuilder.b.R")) source(f)
BUNDLE <- if (identical(Sys.getenv("GB2_BUNDLE"), "min")) "min" else "src"
.gb2_widget_js <- function() paste(readLines(
  if (BUNDLE=="min") "inst/widget/graphbuilder2.min.js" else "inst/widget/graphbuilder2.js",
  warn=FALSE, encoding="UTF-8"), collapse="\n")
environment(graphbuilder2_html) <- globalenv()
Sys.setenv(GB2_INLINE_BUNDLE="1")
set.seed(1); d <- data.frame(x=factor(rep(c("A","B"),each=8)), y=rnorm(16,50,9))
an <- plotbuilder(data=d, xvar="x", yvar="y", groupVar=NULL, facetVar=NULL)
h <- an$widget$content
OUT <- Sys.getenv("GB2_XSS_OUT", "/tmp/gb2-xss")
dir.create(OUT, showWarnings=FALSE, recursive=TRUE)
con <- file(file.path(OUT, paste0("p_", BUNDLE, ".html")), open="wb")
writeLines('<meta charset="utf-8">', con, useBytes=TRUE)
writeLines(enc2utf8(h), con, useBytes=TRUE); close(con)
cat("hostile colour present in shipped payload:", grepl("onerror=window.__PWNED", h, fixed=TRUE), "\n")
