# The saved palette / style libraries are held back for jamovi at its
# maintainer's request (they persist outside the .omv). One switch,
# gb2_libraries_on(), governs it. This pins both states, because the
# feature has to come back the day jamovi ships global options.
suppressWarnings(Sys.setlocale("LC_ALL", "en_US.UTF-8"))
library(jmvcore)
for (f in c("R/spec_explode.R", "R/utils.R", "R/gb_family_core.R",
            "R/palette_library.R", "R/style_library.R", "R/widget.R",
            "R/helpmechoose_wizard.R", "R/plotbuilder.h.R", "R/plotbuilder.b.R"))
    source(f)
.gb2_widget_js <- function()
    paste(readLines(if (identical(Sys.getenv("GB2_BUNDLE"), "min"))
                        "inst/widget/graphbuilder2.min.js"
                    else "inst/widget/graphbuilder2.js",
                    warn = FALSE, encoding = "UTF-8"), collapse = "\n")
environment(graphbuilder2_html) <- globalenv()
Sys.setenv(GB2_INLINE_BUNDLE = "1")

# Never touch the real library files.
home <- file.path(tempdir(), "libhold-home")
dir.create(home, showWarnings = FALSE, recursive = TRUE)
old_cfg <- Sys.getenv("R_USER_CONFIG_DIR")
Sys.setenv(R_USER_CONFIG_DIR = home)
on.exit(Sys.setenv(R_USER_CONFIG_DIR = old_cfg), add = TRUE)
for (v in c("GB2_LIBRARIES")) Sys.unsetenv(v)

fails <- 0
ok <- function(cond, msg) {
    cat(if (cond) "  ok   " else "  FAIL ", msg, "\n", sep = "")
    if (!cond) fails <<- fails + 1
}

set.seed(1)
df <- data.frame(x = factor(rep(c("A","B","C"), each = 8)),
                 y = rnorm(24, 50, 9))
render <- function() {
    an <- plotbuilder(data = df, xvar = "x", yvar = "y",
                      groupVar = NULL, facetVar = NULL)
    an$widget$content
}
SAVE <- paste0('{"kind":"save","name":"Probe","colors":["#112233","#445566"],',
               '"machineId":"m_libraries_off","timestamp":',
               format(as.numeric(Sys.time()) * 1000, scientific = FALSE), '}')

# ---- held back (the shipping default) --------------------------------
ok(!isTRUE(gb2_libraries_on()), "off by default")
h <- render()
ok(grepl('"chartLibrariesOff":true', h, fixed = TRUE),
   "the payload tells the widget to hide the saving surfaces")
ok(grepl('"paletteLibrary":{}', h, fixed = TRUE) ||
   grepl('"paletteLibrary":\\[\\]', h),
   "no saved palettes ship")
ok(grepl('"styleLibrary":{}', h, fixed = TRUE) ||
   grepl('"styleLibrary":\\[\\]', h),
   "no saved styles ship")

# A save action carried by a shared .omv must not reach the disk. Drive the
# REAL path: the gate lives at widget.R's call site, so calling the library
# function directly would bypass it and prove nothing about production.
before <- list.files(home, recursive = TRUE)
invisible(plotbuilder(data = df, xvar = "x", yvar = "y", groupVar = NULL,
                      facetVar = NULL, paletteLibrary = SAVE)$widget$content)
after <- list.files(home, recursive = TRUE)
ok(identical(before, after), "a save action carried by a file writes nothing to disk")

# The machineId has to be STABLE or the payload hash churns every render.
mid <- function(x) regmatches(x, regexpr('"paletteLibraryMachineId":"[^"]*"', x))
ok(identical(mid(h), mid(render())), "the machine id is stable across renders")

# ---- put back (the day jamovi ships global options) -------------------
Sys.setenv(GB2_LIBRARIES = "1")
ok(isTRUE(gb2_libraries_on()), "the switch turns it back on")
h2 <- render()
# Scope to the PAYLOAD form: the inlined engine source contains the bare
# name in its own gates and would satisfy a loose negative grep forever.
ok(!grepl('"chartLibrariesOff":true', h2, fixed = TRUE),
   "the hide flag is gone, so the surfaces return")
live <- .gb_palette_lib_read()
lib <- .gb_palette_lib_apply(live, sub("m_libraries_off",
                                       as.character(live$machineId), SAVE, fixed = TRUE))
ok(!is.null(lib$palettes[["Probe"]]), "saving works again")
Sys.unsetenv("GB2_LIBRARIES")

# ---- the flag file is the route that works inside a real jamovi -------
flag <- file.path(home, ".plotstudio-libraries")
real_home <- Sys.getenv("HOME"); Sys.setenv(HOME = home)
ok(!isTRUE(gb2_libraries_on()), "no flag file: still held back")
invisible(file.create(flag))
ok(isTRUE(gb2_libraries_on()), "the flag file turns it on in a live session")
unlink(flag)
ok(!isTRUE(gb2_libraries_on()), "removing the flag holds it back again")
Sys.setenv(HOME = real_home)

# Fixtures for the client half: the three surfaces have to be GONE when
# held back and BACK when restored (libhold-check.mjs).
OUT <- Sys.getenv("GB2_LIBHOLD_OUT", "")
if (nzchar(OUT)) {
    dir.create(OUT, showWarnings = FALSE, recursive = TRUE)
    bn <- if (identical(Sys.getenv("GB2_BUNDLE"), "min")) "min" else "src"
    for (state in c("off", "on")) {
        if (identical(state, "on")) Sys.setenv(GB2_LIBRARIES = "1")
        else Sys.unsetenv("GB2_LIBRARIES")
        con <- file(file.path(OUT, paste0("lib_", state, "_", bn, ".html")), open = "wb")
        writeLines('<meta charset="utf-8">', con, useBytes = TRUE)
        writeLines(enc2utf8(render()), con, useBytes = TRUE)
        close(con)
    }
    Sys.unsetenv("GB2_LIBRARIES")
    cat("wrote held-back and restored fixtures to", OUT, "\n")
}

cat(if (fails) sprintf("LIBRARY HOLD-BACK CHECK: FAIL (%d)\n", fails)
    else "LIBRARY HOLD-BACK CHECK: PASS\n")
quit(status = if (fails) 1 else 0)
