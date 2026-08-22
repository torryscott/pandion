# The INSTALLED package's export surface.
#
# NAMESPACE is hand-authoritative: the jamovi-compiler appends
# export(<name>Class) / export(<name>Options) per analysis at build time, but
# NOT the wrapper functions. Those must be public, because jmvcore's
# Analysis$asProtoBuf embeds asSource() in every results payload as
# "pandion::<analysis>(...)" - the syntax jamovi displays and users paste into
# Rj - and "::" requires an export. Omitting one is invisible in the GUI and
# fails only when a user runs the syntax, so it is asserted here instead.
#
# Every other verify script sources the working TREE, which cannot see an
# export regression at all. This one deliberately loads the installed module.
invisible(suppressWarnings(Sys.setlocale("LC_ALL", "en_US.UTF-8")))
MOD <- file.path(Sys.getenv("HOME"),
                 "Library/Application Support/jamovi/modules/pandion/R")
if (!dir.exists(file.path(MOD, "pandion"))) {
    cat("pandion not installed here - skipped\n"); quit(status = 2)
}
.libPaths(c(MOD, .libPaths()))
if (!requireNamespace("pandion", quietly = TRUE)) {
    cat("installed pandion cannot be loaded - skipped\n"); quit(status = 2)
}
fails <- 0L
ok <- function(cond, msg) {
    if (isTRUE(cond)) cat("  ok  ", msg, "\n")
    else { cat("  FAIL", msg, "\n"); fails <<- fails + 1L }
}

# The analyses are whatever the manifest declares, so a NEW analysis whose
# wrapper was never added to NAMESPACE fails here rather than in the field.
manifest <- readLines("jamovi/0000.yaml", warn = FALSE)
analyses <- sub('^\\s*-?\\s*name:\\s*', '', grep('^\\s*-?\\s*name:\\s*[a-z]', manifest, value = TRUE))
analyses <- unique(analyses[nzchar(analyses) & !grepl('[^a-z0-9]', analyses)])
analyses <- setdiff(analyses, c("pandion"))
ok(length(analyses) >= 8, paste("manifest declares", length(analyses), "analyses"))

ex <- getNamespaceExports("pandion")
for (a in analyses) {
    ok(a %in% ex, paste0("wrapper exported: ", a, "() - syntax mode needs it"))
    ok(paste0(a, "Class") %in% ex, paste0("class exported: ", a, "Class"))
    ok(paste0(a, "Options") %in% ex, paste0("options exported: ", a, "Options"))
}

# Internals must NOT be public: that is the point of the explicit list.
for (h in c("graphbuilder2_html", "gb_safe_color", "gb_sanitize_colors",
            "gb_parse_snapshot", "gb_svg_dims", "gb_spec_args",
            "gb_resolve_annotations", "helpmechoose_html"))
    ok(!(h %in% ex), paste0("internal stays private: ", h))

# And the public surface actually works through the namespace, not just the tree.
set.seed(1)
d <- data.frame(g = factor(rep(c("A", "B"), 8)), y = rnorm(16, 50, 9))
res <- tryCatch(pandion::plotbuilder(data = d, xvar = "g", yvar = "y",
                                     groupVar = NULL, facetVar = NULL),
                error = function(e) e)
ok(!inherits(res, "error"), "pandion::plotbuilder() runs from the installed package")
if (!inherits(res, "error"))
    ok(nchar(res$widget$content) > 10000, "and returns a rendered widget")

cat(sprintf("export surface: %d exports\n", length(ex)))
if (fails > 0L) { cat("EXPORT SURFACE CHECK: FAIL\n"); quit(status = 1) }
cat("EXPORT SURFACE CHECK: PASS\n")
