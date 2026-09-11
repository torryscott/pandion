# Original-input references and real Jamovi-host HTML for the precision seam.
# No pre-rounding: hex doubles also independently pin the R -> JSON -> JS wire.
.self <- gsub("~+~", " ", sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE)[1]), fixed = TRUE)
setwd(normalizePath(file.path(dirname(.self), "..", "..")))
args <- commandArgs(trailingOnly = TRUE)
OUT <- if (length(args)) args[[1]] else "/tmp/pandion-transport-precision"
dir.create(OUT, recursive = TRUE, showWarnings = FALSE)
Sys.setenv(GB2_INLINE_BUNDLE = "1", GB2_NO_BUNDLE_CACHE = "1",
           R_USER_CONFIG_DIR = file.path(OUT, "config"))
tryCatch(invisible(Sys.setlocale("LC_ALL", "en_US.UTF-8")), error = function(e) NULL)
suppressPackageStartupMessages({ library(jmvcore); library(R6) })
for (f in c("palette_library", "style_library", "utils", "gb_family_core", "spec_explode", "widget"))
    source(paste0("R/", f, ".R"))
for (m in c("plotbuilder", "distplotbuilder", "rmplotbuilder", "xyplotbuilder", "corrplotbuilder")) {
    source(paste0("R/", m, ".h.R")); source(paste0("R/", m, ".b.R"))
}
.gb2_widget_js <- function() {
    p <- if (Sys.getenv("GB2_BUNDLE") == "min") "inst/widget/graphbuilder2.min.js" else "inst/widget/graphbuilder2.js"
    paste(readLines(p, warn = FALSE, encoding = "UTF-8"), collapse = "\n")
}
environment(graphbuilder2_html) <- globalenv()
htmlOf <- function(res) {
    tryCatch(res$widget$content, error = function(e) res$widget$.__enclos_env__$private$.content)
}
writeText <- function(text, path) {
    con <- file(path, "wb"); on.exit(close(con)); writeLines(text, con, useBytes = TRUE)
}
cases <- list()
record <- function(name, module, data, roles, result, summaries = NULL) {
    writeText(c('<meta charset="utf-8">', htmlOf(result)), file.path(OUT, paste0(name, ".html")))
    rows <- lapply(seq_len(nrow(data)), function(i) unname(lapply(data, function(v) {
        if (is.numeric(v)) sprintf("%.17g", v[i]) else as.character(v[i])
    })))
    cases[[name]] <<- list(module = module, header = names(data), rows = rows,
                          roles = roles, summaries = summaries)
}
for (name in c("centered", "shifted", "negative", "scaled", "narrow")) {
    off <- switch(name, centered = 0, negative = -1e10, narrow = 1e6, 1e10)
    scale <- switch(name, scaled = 8, narrow = 2^-20, 1)
    d <- data.frame(g = factor(rep(c("A", "B"), each = 3)), v = off + (1:6) * scale)
    sums <- lapply(split(d$v, d$g), function(v) list(mean = mean(v), sd = sd(v), se = sd(v)/sqrt(length(v))))
    record(name, "plotbuilder", d, list(xvar = "g", yvar = "v"),
           plotbuilder(data = d, xvar = "g", yvar = "v", groupVar = NULL, facetVar = NULL, graphType = "bar"), sums)
}
d <- data.frame(g = factor(rep(c("A", "B"), each = 3)), v = 1e10 + 1:6)
record("dist", "distplotbuilder", d, list(var = "v", groupVar = "g"),
       distplotbuilder(data = d, var = "v", groupVar = "g", facetVar = NULL, graphType = "box"))
d <- data.frame(t1 = 1e10 + 1:6, t2 = 1e10 + c(3,4,7,8,8,10))
record("rm", "rmplotbuilder", d, list(measures = list("t1", "t2")),
       rmplotbuilder(data = d, measures = c("t1","t2"), bs = NULL, betweenVar = NULL, graphType = "bar"))
record("xy", "xyplotbuilder", d, list(xvar = "t1", yvar = "t2"),
       xyplotbuilder(data = d, xvar = "t1", yvar = "t2", groupVar = NULL, facetVar = NULL, labelVar = NULL, sizeVar = NULL))
record("corr", "corrplotbuilder", d, list(vars = list("t1", "t2")),
       corrplotbuilder(data = d, vars = c("t1", "t2")))
set.seed(20260905)
wire <- c(1e10 + 1:6, pi, 1.2345678901234567, .Machine$double.xmin,
          .Machine$double.xmax, .Machine$double.eps, 2^-1074,
          (1 + runif(512)) * 2^sample(-1074:1022, 512, replace = TRUE))
wire <- c(wire, -wire)
html <- graphbuilder2_html(bars = list(list(x = "wire", values = wire, mean = 0, se = 0, n = length(wire))))
matched <- regmatches(html, regexec("var __gb2_payload = (\\{.*?\\});\nvar __gb2_id", html))[[1]]
stopifnot(length(matched) == 2)
writeText(matched[2], file.path(OUT, "wire.json"))
writeText(jsonlite::toJSON(list(cases = cases, hex = sprintf("%a", wire)),
          auto_unbox = TRUE, null = "null", digits = I(17)), file.path(OUT, "expected.json"))
cat("TRANSPORT REFERENCES:", length(cases), "real analyses,", length(wire), "wire values\n")
