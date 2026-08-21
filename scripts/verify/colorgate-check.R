source("R/utils.R"); source("R/spec_explode.R")
ok <- function(c, m) { if (!isTRUE(c)) stop(paste("FAIL:", m)); cat("  ok  ", m, "\n") }

# charset gate: everything legit passes untouched
for (v in c("", "transparent", "none", "#4478ad", "#ABC", "#cbdff1aa",
            "rgb(68, 120, 173)", "rgba(0,0,0,0.12)", "hsl(210, 40%, 50%)",
            "steelblue", "light gray"))
    ok(identical(gb_safe_color(v), v), paste0("passes: '", v, "'"))
# breakouts map to unset
for (v in c('red;"><img src=x onerror=alert(1)>', 'red;background:url(x)',
            'url(javascript:alert(1))', "red'", 'a"b', 'red</style>',
            'expression(alert(1))\\', strrep("a", 65)))
    ok(identical(gb_safe_color(v), ""), paste0("rejects: '", substr(v,1,30), "'"))
ok(identical(gb_safe_color(42), ""), "rejects non-character")

# walker: color-named fields sanitized, everything else untouched
spec <- list(
    barColor = 'red;"><img src=x>',
    chartBackground = 'x" onmouseover="alert(1)',
    chartPalette = 'My "weird" palette <3',       # user text: must survive
    pointColorMatch = TRUE,                        # bool: must survive
    xLabelDefault = 'Dose <mg>',                   # not a color: must survive
    customPalette = list('#4478ad', 'bad"one'),
    groupColors = list(list(group = "A ;\"<x>", color = 'evil">')),
    textStyles = list(list(id = "yTitle", color = "#222222", bold = TRUE))
)
clean <- gb_sanitize_colors(spec)
ok(identical(clean$barColor, ""), "hostile barColor unset")
ok(identical(clean$chartBackground, ""), "hostile chartBackground unset")
ok(identical(clean$chartPalette, spec$chartPalette), "palette NAME untouched")
ok(identical(clean$pointColorMatch, TRUE), "bool untouched")
ok(identical(clean$xLabelDefault, spec$xLabelDefault), "label untouched")
ok(identical(clean$customPalette[[1]], "#4478ad"), "good palette entry kept")
ok(identical(clean$customPalette[[2]], ""), "bad palette entry unset")
ok(identical(clean$groupColors[[1]]$group, spec$groupColors[[1]]$group),
   "group NAME untouched (names are escaped downstream, not colors)")
ok(identical(clean$groupColors[[1]]$color, ""), "hostile group color unset")
ok(identical(clean$textStyles[[1]]$color, "#222222"), "good textStyle kept")

# blob byte-stability: a legitimate blob returns the SAME string
legit <- '{"barColor":"#4478ad","barOpacity":0.9,"groupColors":[{"group":"A","color":"#dd7e2b"}]}'
ok(identical(gb_spec_sanitized_json(legit), legit), "legit blob byte-identical")
hostile <- '{"barColor":"red;\\"><img src=x onerror=alert(1)>"}'
outj <- gb_spec_sanitized_json(hostile)
ok(!grepl("<img", outj, fixed = TRUE), "hostile blob scrubbed")
ok(grepl('"barColor":""', outj, fixed = TRUE) || grepl('"barColor": ""', outj),
   "hostile color re-serialized as unset")
# args path
tbl <- list(list(arg = "bar_color", opt = "barColor", bool = FALSE, default = ""))
a <- gb_spec_args(gb_parse_spec(hostile), tbl)
ok(identical(a$bar_color, ""), "gb_spec_args sanitizes exploded arg")
# ---- regression guards (Aug 2026 audit round 2) ----------------------
# customPalette is a comma-joined LIST: the per-colour cap must apply per
# ELEMENT or a 9+-colour palette is silently wiped AND the loss is
# persisted back into chartSpec by the next style commit.
p8  <- "#2d5c94,#902634,#e18e4c,#597b2f,#faca59,#32295e,#5bb1ba,#d35a80"
p12 <- paste0(p8, ",#4478ad,#6fb3ad,#266741,#976d76")
ok(identical(gb_sanitize_colors(p8, "customPalette"), p8), "8-colour palette survives")
ok(identical(gb_sanitize_colors(p12, "customPalette"), p12), "12-colour palette survives")
ok(identical(gb_sanitize_colors("rgb(68, 120, 173),#902634", "customPalette"),
             "rgb(68, 120, 173),#902634"), "functional notation rejoins byte-identically")
ok(identical(gb_sanitize_colors(paste0(p8, ',#fff"><img src=x>'), "customPalette"),
             paste0(p8, ",")), "one hostile slot degrades, the rest survive")
j <- gb_spec_sanitized_json(paste0('{"customPalette":"', p12, '"}'))
ok(grepl(p12, j, fixed = TRUE), "12-colour palette survives the blob round trip")

# A JSON null must not abort the analysis: x[[i]] <- NULL DELETES the
# element, shrinking the list under seq_along ("subscript out of bounds").
for (blob in c('{"barColor":null,"barOpacity":0.9}',
               '{"groupColors":[{"group":null,"color":"#fff"}]}',
               '{"barColor":null}',
               '{"textStyles":[null,{"id":"yTitle","color":"#222222"}]}')) {
    r <- tryCatch(gb_spec_sanitized_json(blob), error = function(e) NULL)
    ok(!is.null(r), paste("null-bearing blob survives:", substr(blob, 1, 40)))
}
r <- gb_spec_sanitized_json('{"barColor":null,"barOpacity":0.9}')
ok(grepl("barOpacity", r, fixed = TRUE), "sibling keys survive a null neighbour")

# Entry points never throw, whatever arrives.
for (blob in c("[1,2,3]", "null", "\"a string\"", "{}", "not json at all", "123"))
    ok(!is.null(tryCatch(gb_spec_sanitized_json(blob), error = function(e) NULL)),
       paste("malformed blob degrades, never throws:", blob))
tb <- list(list(arg = "bar_color", opt = "barColor", bool = FALSE, default = "#111111"))
ok(!is.null(tryCatch(gb_spec_args(gb_parse_spec('{"barColor":null}'), tb),
                     error = function(e) NULL)), "gb_spec_args survives a null value")

cat("ALL PASS\n")
