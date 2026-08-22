# Robustness of the R-side gates against option values that are not the
# shape the client normally sends (Aug 2026 audit round 2). jsonlite
# simplifies a JSON array into a VECTOR, and several gates assumed a
# scalar - which either threw (killing the analysis, since these run
# outside any tryCatch) or silently destroyed saved data.
#
# Writes only under a redirected config dir: the library functions persist
# to disk, and without this the suite would rewrite the developer's real
# palettes.json.
invisible(suppressWarnings(Sys.setlocale("LC_ALL", "en_US.UTF-8")))
if (!requireNamespace("jsonlite", quietly = TRUE)) {
    cat("jsonlite not available - skipped\n"); quit(status = 2)
}
CFG <- file.path(tempdir(), "gb2-secgate-cfg")
unlink(CFG, recursive = TRUE); dir.create(CFG, recursive = TRUE, showWarnings = FALSE)
Sys.setenv(R_USER_CONFIG_DIR = CFG)
source("R/utils.R"); source("R/spec_explode.R")
source("R/palette_library.R"); source("R/style_library.R")

fails <- 0L
ok <- function(cond, msg) {
    if (isTRUE(cond)) cat("  ok  ", msg, "\n")
    else { cat("  FAIL", msg, "\n"); fails <<- fails + 1L }
}

# ---- gb_parse_snapshot -------------------------------------------------
good <- '700:450|<svg xmlns="http://www.w3.org/2000/svg"></svg>'
ok(!is.null(gb_parse_snapshot(good)), "a well-formed snapshot parses")
ok(is.null(gb_parse_snapshot("")), "empty snapshot refused")
ok(is.null(gb_parse_snapshot("no-signature|<svg></svg>")), "missing signature refused")
ok(is.null(gb_parse_snapshot("700:450|not svg at all")), "non-SVG body refused")
ok(is.null(gb_parse_snapshot('700:450|<svg><script>x</script></svg>')),
   "script-bearing snapshot refused")
ok(is.null(gb_parse_snapshot(c("700:450|<svg></svg>", "b"))), "vector input refused")
ok(is.null(gb_parse_snapshot(NA_character_)), "NA refused")
# invalid multibyte input must not THROW: this runs outside .run()'s tryCatch
badutf <- rawToChar(as.raw(c(0x37,0x30,0x30,0x3a,0x34,0x35,0x30,0x7c,
                             0x3c,0x73,0x76,0x67,0x20,0xff,0xfe,0x3e)))
r <- tryCatch({ gb_parse_snapshot(badutf); "no throw" },
              error = function(e) paste("THREW:", conditionMessage(e)))
ok(identical(r, "no throw"), paste("invalid UTF-8 does not throw:", r))
# the cap must count BYTES - jamovi's 4 MB transport ceiling is a byte limit
big <- paste0("700:450|<svg ", strrep("a", 4100000), "</svg>")
ok(is.null(gb_parse_snapshot(big)), "oversized snapshot refused (byte cap)")

# ---- gb_svg_dims -------------------------------------------------------
d <- gb_svg_dims('<svg width="640" height="480"></svg>')
ok(identical(d$w, 640) && identical(d$h, 480), "dimensions read from the root tag")
d2 <- gb_svg_dims("<svg></svg>")
ok(d2$w == 700 && d2$h == 450, "absent dimensions fall back to defaults")
d3 <- gb_svg_dims('<svg width="99999" height="1"></svg>')
ok(d3$w == 700 && d3$h == 450, "out-of-range dimensions clamped to defaults")

# ---- palette library: a replace must never wipe the library ------------
# The action verb is `kind`, and the machineId must match the library's
# (that guard is what keeps a shared .omv from rewriting the recipient's
# saved palettes; it is asserted here too so it cannot quietly regress).
lib0 <- .gb_palette_lib_empty("M1")
lib <- .gb_palette_lib_apply(lib0, jsonlite::toJSON(list(kind = "save",
    name = "Mine", colors = c("#111111", "#222222"),
    machineId = "M1", timestamp = 1000), auto_unbox = TRUE))
ok(length(lib$palettes) == 1, "a palette can be saved")

foreign <- .gb_palette_lib_apply(lib, jsonlite::toJSON(list(kind = "save",
    name = "Theirs", colors = c("#333333"), machineId = "OTHER",
    timestamp = 2000), auto_unbox = TRUE))
ok(length(foreign$palettes) == 1,
   "an action from another machine is ignored (a shared .omv cannot rewrite the library)")

for (b in list(
        '{"kind":"replace","palettes":[1,2,3],"machineId":"M1","timestamp":2000}',
        '{"kind":"replace","palettes":[],"machineId":"M1","timestamp":2001}',
        '{"kind":"replace","palettes":{},"machineId":"M1","timestamp":2002}')) {
    out <- tryCatch(.gb_palette_lib_apply(lib, b),
                    error = function(e) structure(list(err = conditionMessage(e)),
                                                  class = "gberr"))
    if (inherits(out, "gberr")) { ok(FALSE, paste("replace threw:", out$err)); next }
    ok(length(out$palettes) == 1,
       paste0("a replace carrying ", substr(b, 20, 34),
              " leaves the saved palettes intact"))
}
good_repl <- '{"kind":"replace","palettes":{"A":["#333333"]},"machineId":"M1","timestamp":3000}'
out <- .gb_palette_lib_apply(lib, good_repl)
ok(length(out$palettes) == 1 && !is.null(out$palettes[["A"]]),
   "a legitimate replace still works")

# ---- export request: array-valued fields must not kill the analysis ----
# Exercise the SHIPPED block rather than restating it, so the probe cannot
# drift away from the code it guards.
src <- paste(readLines("R/plotbuilder.b.R", warn = FALSE), collapse = "\n")
blk <- regmatches(src, regexpr(
    "(?s)\\.one <- function\\(x\\) \\{.*?base_name <- paste0\\(\"plot\\.\", ext\\)",
    src, perl = TRUE))
ok(length(blk) == 1 && nzchar(blk), "the export naming block was located in the source")
if (length(blk) == 1) {
    run_block <- function(parsed) {
        e <- new.env(); assign("parsed", parsed, envir = e)
        tryCatch({ eval(parse(text = blk), envir = e); get("base_name", envir = e) },
                 error = function(err) paste("THREW:", conditionMessage(err)))
    }
    for (p in list(list(format = c("png", "svg"), filename = NULL),
                   list(format = "png", filename = c("a", "b")),
                   list(format = "png", filename = list(NULL)),
                   list(format = NULL, filename = NULL),
                   list(format = NA, filename = NA))) {
        got <- run_block(p)
        ok(is.character(got) && length(got) == 1 && !grepl("^THREW", got) &&
           nzchar(got) && !identical(got, "NA"),
           paste0("export naming survives a malformed request -> ", got[1]))
    }
    ok(identical(run_block(list(format = "svg", filename = "chart.svg")), "chart.svg"),
       "a normal request still names the file correctly")
    ok(identical(run_block(list(format = "PNG", filename = "../../escape.png")),
                 "escape.png"), "path traversal still stripped")
}

# ---- palette library: replay protection --------------------------------
# lastAppliedTs must be strictly increasing, so reopening a file cannot
# re-apply an action that already ran.
replayed <- .gb_palette_lib_apply(lib, jsonlite::toJSON(list(kind = "save",
    name = "Replay", colors = c("#444444"), machineId = "M1",
    timestamp = 1000), auto_unbox = TRUE))
ok(length(replayed$palettes) == 1 && is.null(replayed$palettes[["Replay"]]),
   "an action at the already-applied timestamp is ignored (replay protection)")
older <- .gb_palette_lib_apply(lib, jsonlite::toJSON(list(kind = "save",
    name = "Older", colors = c("#555555"), machineId = "M1",
    timestamp = 1), auto_unbox = TRUE))
ok(is.null(older$palettes[["Older"]]), "an older timestamp is ignored")
for (bad_ts in c('"timestamp":null', '"timestamp":[1,2]', '"timestamp":"soon"')) {
    j <- paste0('{"kind":"save","name":"X","colors":["#666666"],',
                '"machineId":"M1",', bad_ts, '}')
    out <- tryCatch(.gb_palette_lib_apply(lib, j),
                    error = function(e) structure(list(e = conditionMessage(e)),
                                                  class = "gberr"))
    ok(!inherits(out, "gberr") && is.null(out$palettes[["X"]]),
       paste("a malformed timestamp is ignored, not thrown on:", bad_ts))
}

# ---- style library: the same guards, same shapes ------------------------
slib0 <- .gb_style_lib_empty("M1")
slib <- .gb_style_lib_apply(slib0, jsonlite::toJSON(list(kind = "save",
    name = "Look", groups = c("colors"), opts = list(barColor = "#111111"),
    machineId = "M1", timestamp = 1000), auto_unbox = TRUE))
ok(length(slib$styles) == 1, "a style can be saved")
ok(length(.gb_style_lib_apply(slib, jsonlite::toJSON(list(kind = "save",
    name = "Theirs", groups = c("colors"), opts = list(barColor = "#222222"), machineId = "OTHER",
    timestamp = 2000), auto_unbox = TRUE))$styles) == 1,
   "a style action from another machine is ignored")
for (bad_ts in c('"timestamp":null', '"timestamp":[1,2]')) {
    j <- paste0('{"kind":"save","name":"Y","groups":["colors"],"opts":{"barColor":"#333333"},"machineId":"M1",', bad_ts, '}')
    out <- tryCatch(.gb_style_lib_apply(slib, j),
                    error = function(e) structure(list(e = conditionMessage(e)),
                                                  class = "gberr"))
    ok(!inherits(out, "gberr"),
       paste("style library survives a malformed timestamp:", bad_ts))
}

# ---- the libraries are a colour source too -----------------------------
# They do not go through chartSpec: they live in palettes.json /
# styles.json, written from an action a shared .omv can carry, and the
# palette flyout builds swatch markup from them. That was a live,
# executing injection until this gate (Aug 2026 audit round 3).
hostile <- 'red;"><img src=x onerror=alert(1)>'
poisoned <- .gb_palette_lib_apply(.gb_palette_lib_empty("M1"),
    jsonlite::toJSON(list(kind = "save", name = "P",
        colors = c(hostile, "#2d5c94"), machineId = "M1",
        timestamp = 5000), auto_unbox = TRUE))
stored <- unlist(poisoned$palettes[["P"]])
ok(!any(grepl("<img", stored, fixed = TRUE)),
   "a hostile colour never reaches the saved palette library")
ok("#2d5c94" %in% stored, "the legitimate colour in the same action survives")

pstyle <- .gb_style_lib_apply(.gb_style_lib_empty("M1"),
    jsonlite::toJSON(list(kind = "save", name = "S", groups = c("colors"),
        opts = list(barColor = hostile, barOpacity = 0.9),
        machineId = "M1", timestamp = 5000), auto_unbox = TRUE))
sopts <- pstyle$styles[["S"]]$opts
ok(!is.null(sopts) && !grepl("<img", as.character(sopts$barColor), fixed = TRUE),
   "a hostile colour never reaches a saved style")
ok(identical(sopts$barOpacity, 0.9), "a non-colour option in the same style is untouched")

# ---- JSON-string stores and the annotation id --------------------------
# Five xy stores persist as a JSON STRING under a key whose name is not
# colour-ish, so the name-rule walker passed the whole blob through while
# the client parsed the colours back out of it (Aug 2026 audit round 4).
HJ <- '{"G1":{"color":"red;\\"><img src=x onerror=alert(1)>","outlineColor":"#2d5c94"}}'
for (k in c("xyPointGroupStyles", "xyEllipseGroupStyles", "xyRugGroupStyles",
            "xyMarginalGroupStyles", "xyDensity2DGroupStyles")) {
    out <- gb_sanitize_colors(HJ, k)
    ok(!grepl("<img", out, fixed = TRUE), paste0(k, ": nested colour gated"))
    ok(grepl("#2d5c94", out, fixed = TRUE),
       paste0(k, ": the legitimate sibling colour survives"))
}
ok(identical(gb_sanitize_colors('{"G1":{"color":"#111111"}}', "xyPointGroupStyles"),
             '{"G1":{"color":"#111111"}}'),
   "a clean JSON store is returned byte-identical")
ok(identical(gb_sanitize_colors("", "xyPointGroupStyles"), ""),
   "an empty JSON store is untouched")
ok(identical(gb_sanitize_colors("not json", "xyPointGroupStyles"), "not json"),
   "an unparseable store degrades rather than throwing")

# ---- export request: the staleness window ------------------------------
# This gate is why a crafted .omv cannot reach the file-writing code at
# all: a replayed request carries an old (or absent, or array) id and must
# be refused. Extracted from the shipped source so it cannot drift.
gate_src <- regmatches(src, regexpr(
    "(?s)req_ts <- suppressWarnings.*?req_ts > now_ms \\+ 60000\\)",
    src, perl = TRUE))
ok(length(gate_src) == 1 && nzchar(gate_src),
   "the export staleness gate was located in the source")
if (length(gate_src) == 1) {
    stale <- function(id) {
        e <- new.env(); assign("parsed", list(id = id), envir = e)
        txt <- sub("^(req_ts <- )", "\\1", gate_src)
        txt <- sub("if \\(", "stale <- (", txt)
        tryCatch({ eval(parse(text = txt), envir = e); get("stale", envir = e) },
                 error = function(err) paste("THREW:", conditionMessage(err)))
    }
    fresh <- paste0(format(as.numeric(Sys.time()) * 1000, scientific = FALSE), "-abc")
    ok(identical(stale(fresh), FALSE), "a request made just now is accepted")
    ok(identical(stale("1000000000000-abc"), TRUE),
       "a replayed request from a saved file is refused")
    ok(identical(stale(paste0(format(as.numeric(Sys.time()) * 1000 + 600000,
                                     scientific = FALSE), "-abc")), TRUE),
       "a future-dated request is refused")
    for (weird in list(NULL, c("1", "2"), NA, "no-timestamp-here", list(1)))
        ok(isTRUE(stale(weird)),
           paste("a malformed request id is refused, not thrown on:",
                 paste(utils::head(as.character(weird), 2), collapse = ",")))
}

if (fails > 0L) { cat("SECGATE CHECK: FAIL\n"); quit(status = 1) }
cat("SECGATE CHECK: PASS\n")
