# Fixture for the color-gate probe: a grouped CG bar with a BENIGN
# chartSpec (the probe injects the hostile blob client-side to exercise
# the JS gate), plus one R-side hostile render proving the R gate.
library(jmvcore)
for (f in c("R/spec_explode.R","R/utils.R","R/gb_family_core.R","R/palette_library.R",
            "R/style_library.R","R/widget.R","R/helpmechoose_wizard.R",
            "R/plotbuilder.h.R","R/plotbuilder.b.R")) source(f)
BUNDLE <- if (identical(Sys.getenv("GB2_BUNDLE"), "min")) "min" else "src"
.gb2_widget_js <- function() {
    f <- if (identical(BUNDLE, "min")) "inst/widget/graphbuilder2.min.js"
         else "inst/widget/graphbuilder2.js"
    paste(readLines(f, warn = FALSE, encoding = "UTF-8"), collapse = "\n")
}
environment(graphbuilder2_html) <- globalenv()
Sys.setenv(GB2_INLINE_BUNDLE = "1")

set.seed(1)
df <- data.frame(x = factor(rep(c("A","B","C"), each = 20)),
                 y = rnorm(60, 50, 10),
                 g = factor(rep(c("G1","G2"), 30)))
OUT <- Sys.getenv("GB2_COLORGATE_OUT", "/tmp/gb2-colorgate")
out <- file.path(OUT, paste0("cg_", BUNDLE, ".html"))
dir.create(dirname(out), showWarnings = FALSE, recursive = TRUE)
an <- plotbuilder(data = df, xvar = "x", yvar = "y", groupVar = "g",
                  facetVar = NULL, graphType = "bar")
con <- file(out, open = "wb")
writeLines('<meta charset="utf-8">', con, useBytes = TRUE)
writeLines(enc2utf8(an$widget$content), con, useBytes = TRUE)
close(con)
cat("wrote", out, nchar(an$widget$content), "\n")

# R-side hostile render: the shipped html must carry NO breakout
hostile <- '{"barColor":"red;\\"><img src=x onerror=window.__pwned=1>","groupColors":[{"group":"G1","color":"x\\"><script>window.__pwned=1</script>"}]}'
an2 <- plotbuilder(data = df, xvar = "x", yvar = "y", groupVar = "g",
                   facetVar = NULL, graphType = "bar", chartSpec = hostile)
h2 <- an2$widget$content
stopifnot(!grepl("onerror=window.__pwned", h2, fixed = TRUE),
          !grepl("<script>window.__pwned", h2, fixed = TRUE))
cat("R gate: hostile chartSpec scrubbed from shipped HTML\n")
