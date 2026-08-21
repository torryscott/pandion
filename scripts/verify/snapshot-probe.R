# Static-snapshot fallback probe, page generator (see snapshot-check.mjs
# for the browser half). The chartSnapshot option (Jul 2026) carries a
# JS-committed "<sig>|<svg>" back to R, which embeds the SVG as a hidden
# data-URI <img> beside the host div so a machine WITHOUT the module
# still shows the chart (the shared-.omv case jamovi's maintainer raised).
# This half asserts the R-side contract:
#   - no snapshot  -> no fallback block, no chartSnapshotKey payload key
#                     (byte-stability for every pre-snapshot page)
#   - valid value  -> hidden fallback <img data:image/svg+xml;base64,...>
#                     + payload chartSnapshotKey = the sig, and the RAW
#                     svg text itself never enters the payload
#   - hostile value (script body, non-svg body, missing sig) -> NOT
#     embedded (the sanitize gate; the img context is the second fence)
# Pages written for the browser half:
#   snap-inline.html   inline engine + snapshot (live-machine case)
#   snap-cached.html   cached branch + snapshot (module-less reveal case)
#   plain-cached.html  cached branch, no snapshot (module-less message case)
#
# Exit 2 = jmvcore missing (skipped).
# Env: GB2_SNAP_OUT  output dir (default /tmp/gb2-snap-probe)

ok <- requireNamespace("jmvcore", quietly = TRUE)
if (!ok) { cat("jmvcore not available\n"); quit(status = 2) }

suppressWarnings(suppressMessages({
    library(jmvcore); library(R6)
    source("R/palette_library.R"); source("R/style_library.R")
    source("R/utils.R"); source("R/gb_family_core.R"); source("R/spec_explode.R"); source("R/widget.R")
    source("R/plotbuilder.h.R"); source("R/plotbuilder.b.R")
}))

BUNDLE <- if (file.exists("inst/widget/graphbuilder2.min.js"))
    "inst/widget/graphbuilder2.min.js" else "inst/widget/graphbuilder2.js"
JS_HASH <- unname(tools::md5sum(BUNDLE))
.gb2_widget_js <- function()
    paste(readLines(BUNDLE, warn = FALSE, encoding = "UTF-8"), collapse = "\n")
.gb2_widget_js_hash <- function() JS_HASH
environment(graphbuilder2_html) <- globalenv()
environment(gb2_engine_boot_html) <- globalenv()

OUT <- Sys.getenv("GB2_SNAP_OUT", "/tmp/gb2-snap-probe")
dir.create(OUT, showWarnings = FALSE, recursive = TRUE)

set.seed(7)
dat <- data.frame(grp = factor(sample(c("A", "B", "C"), 90, TRUE)),
                  y = rnorm(90, 40, 8))

getC <- function(res) tryCatch(res$widget$content, error = function(e)
    res$widget$.__enclos_env__$private$.content)
wr <- function(html, name) {
    con <- file(file.path(OUT, name), open = "wb")
    writeLines('<meta charset="utf-8">', con, useBytes = TRUE)
    writeLines(html, con, useBytes = TRUE)
    close(con)
}

fails <- 0L
expect <- function(label, cond) {
    if (isTRUE(cond)) cat("  ok:", label, "\n")
    else { cat("  FAIL:", label, "\n"); fails <<- fails + 1L }
}

GOOD_SVG <- paste0(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200">',
    '<rect x="20" y="40" width="60" height="140" fill="#4478ad"/>',
    '<rect x="120" y="80" width="60" height="100" fill="#dd7e2b"/>',
    '<text x="20" y="24" font-size="14">snapshot probe</text></svg>'
)
SIG <- "12345:-987654321"
GOOD_VAL <- paste0(SIG, "|", GOOD_SVG)

mk <- function(...) getC(plotbuilder(data = dat, xvar = "grp", yvar = "y",
                                     groupVar = NULL, facetVar = NULL, ...))

# ---- no snapshot: nothing new anywhere
# PROBE HYGIENE: the inlined bundle SOURCE contains the literal
# "chartSnapshotKey" (the scheduler reads data.chartSnapshotKey), so the
# payload assertion must scope to the payload segment, never the page.
payload_of <- function(html) {
    seg <- sub(".*var __gb2_payload = ", "", html)
    sub(";\nvar __gb2_id.*", "", seg)
}
plain <- mk()
# (quoted-attribute form: the LOADER script itself contains the bare
# marker in querySelector calls on EVERY page - probe hygiene)
expect("plain: no fallback block",
       !grepl('data-role="gb2-static-fallback"', plain, fixed = TRUE))
expect("plain: no chartSnapshotKey payload key",
       !grepl('"chartSnapshotKey"', payload_of(plain), fixed = TRUE))

# ---- valid snapshot: hidden img + payload sig, raw svg NOT in payload
snap <- mk(chartSnapshot = GOOD_VAL)
wr(snap, "snap-inline.html")
expect("snap: fallback block embedded",
       grepl("gb2-static-fallback", snap, fixed = TRUE))
expect("snap: embedded as data-URI img (safe context)",
       grepl("data:image/svg+xml;base64,", snap, fixed = TRUE))
expect("snap: VISIBLE by default (script-less contexts - jamovi's export
        pipeline runs no scripts - must get the picture for free)",
       grepl('data-role="gb2-static-fallback" style="display:block', snap, fixed = TRUE))
expect("snap: caption separately hidden + Save link present unwired",
       grepl('data-role="gb2-static-fallback-caption" style="display:none', snap, fixed = TRUE) &&
       grepl('data-role="gb2-snap-save" download="chart.svg" href="#"', snap, fixed = TRUE))
expect("snap: payload carries the sig",
       grepl(paste0('"chartSnapshotKey":"', SIG, '"'), snap, fixed = TRUE))
expect("snap: raw svg text NOT duplicated into the payload",
       !grepl("snapshot probe</text>", sub(".*var __gb2_payload = ", "",
             sub("var __gb2_id.*", "", snap)), fixed = TRUE))

# ---- hostile values: sanitize gate refuses the embed
bad1 <- mk(chartSnapshot = paste0(SIG, "|<script>alert(1)</script>"))
bad2 <- mk(chartSnapshot = paste0(SIG, '|<svg xmlns="x"><script>alert(1)</script></svg>'))
bad3 <- mk(chartSnapshot = paste0(SIG, "|<div>not an svg</div>"))
bad4 <- mk(chartSnapshot = GOOD_SVG)   # missing sig prefix entirely
for (nm in c("bad1", "bad2", "bad3", "bad4")) {
    h <- get(nm)
    expect(paste0(nm, ": hostile/malformed snapshot NOT embedded"),
           !grepl('data-role="gb2-static-fallback"', h, fixed = TRUE) &&
           !grepl("alert(1)", h, fixed = TRUE))
}

# ---- cached-branch pages for the browser reveal tests
snapc <- mk(chartSnapshot = GOOD_VAL, clientBundleHash = JS_HASH)
wr(snapc, "snap-cached.html")
expect("snap-cached: small page + fallback present",
       nchar(snapc) < 400000 && grepl("gb2-static-fallback", snapc, fixed = TRUE))
plainc <- mk(clientBundleHash = JS_HASH)
wr(plainc, "plain-cached.html")
expect("plain-cached: module-missing timer armed",
       grepl("__gb2_mmDelay", plainc, fixed = TRUE))

writeLines(JS_HASH, file.path(OUT, "hash.txt"))
cat(sprintf("-> %s\n", OUT))
if (fails > 0L) quit(status = 1)
