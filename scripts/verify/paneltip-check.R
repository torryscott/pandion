# The left-panel data tip is styled by finding a zero-width marker at the
# start of its label, not by comparing against a copy of the wording.
#
# Each chart module used to keep a TIP_TEXT constant in its events file
# that had to match the .u.yaml label character for character, maintained
# by hand and enforced by nothing: edit the label and the styling silently
# fell off (Aug 2026 audit). This pins the replacement. The styling itself
# renders in jamovi's options panel, outside any results iframe, so it
# cannot be driven headlessly - what IS checkable is that the marker is
# present everywhere it must be and that no copy of the wording came back.
invisible(suppressWarnings(Sys.setlocale("LC_ALL", "en_US.UTF-8")))
MARKER <- "​"
mods <- c("plotbuilder", "rmplotbuilder", "xyplotbuilder", "distplotbuilder",
          "freqplotbuilder", "corrplotbuilder", "likertplotbuilder")
fails <- 0L
ok <- function(cond, msg) {
    if (isTRUE(cond)) cat("  ok  ", msg, "\n")
    else { cat("  FAIL", msg, "\n"); fails <<- fails + 1L }
}

for (m in mods) {
    u <- readLines(file.path("jamovi", paste0(m, ".u.yaml")),
                   warn = FALSE, encoding = "UTF-8")
    marked <- grep(paste0("label: '", MARKER), u, fixed = TRUE, value = TRUE)
    ok(length(marked) == 1,
       paste0(m, ".u.yaml: exactly one marked tip label (found ",
              length(marked), ")"))

    js <- paste(readLines(file.path("jamovi", "js", paste0(m, ".js")),
                          warn = FALSE, encoding = "UTF-8"), collapse = "\n")
    ok(!grepl("TIP_TEXT", js, fixed = TRUE),
       paste0(m, ".js: no copy of the wording"))
    ok(grepl("panelTip.style()", js, fixed = TRUE),
       paste0(m, ".js: calls the styler"))

    # the marker must survive compilation into the UI jamovi actually runs
    gen <- file.path("build", "js", paste0(m, ".src.js"))
    if (file.exists(gen)) {
        g <- paste(readLines(gen, warn = FALSE, encoding = "UTF-8"), collapse = "\n")
        ok(grepl(MARKER, g, fixed = TRUE),
           paste0(m, ": marker survives into the compiled UI"))
    }
}

tip <- paste(readLines(file.path("jamovi", "js", "gbPanelTip.js"),
                       warn = FALSE, encoding = "UTF-8"), collapse = "\n")
ok(grepl("\\\\u200B", tip) || grepl(MARKER, tip, fixed = TRUE),
   "gbPanelTip keys off the marker")
ok(!grepl("=== tipText", tip, fixed = TRUE),
   "gbPanelTip no longer compares against a passed-in string")

if (fails > 0L) { cat("PANEL TIP CHECK: FAIL\n"); quit(status = 1) }
cat("PANEL TIP CHECK: PASS\n")
