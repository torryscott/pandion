# Shared utility functions for the pandion module. The v1 ggplot-era
# helpers that used to live here (unit conversion, theme/line-style
# parsers, shape codes) were removed Aug 2026: dead since the v2 JS
# renderer landed, and dead-looking validation code reads as a safety
# net that is not actually wired in.

# Resolve the chart annotations from options. The widget persists
# annotations as a JSON STRING (annotationsJson) rather than via the
# typed Array<Group> `annotations` option: jamovi's binding for that
# Array<Group> silently drops an in-place UPDATE to an existing element
# (e.g. dragging a reference line to a new position) and then wedges the
# analysis so it stops re-running for every later option change. A String
# option round-trips reliably. Prefer the JSON string when present; fall
# back to the legacy Array option for .omv files saved before the switch.
gb_resolve_annotations <- function(annotations_json, annotations_legacy) {
    if (!is.null(annotations_json) &&
        is.character(annotations_json) &&
        nzchar(annotations_json)) {
        parsed <- tryCatch(
            jsonlite::fromJSON(annotations_json, simplifyVector = FALSE),
            error = function(e) NULL
        )
        if (is.list(parsed)) return(parsed)
    }
    annotations_legacy
}

# A CSS-safe color gate (Aug 2026 audit). The rule is a CHARSET
# allowlist, not a format whitelist: every value the suite legitimately
# stores passes untouched - the '' sentinel ("derive a sensible
# default"), transparent/none, any hex form (#RGB / #RRGGBB / #RRGGBBAA),
# rgb()/rgba()/hsl() with numeric guts, and plain color names - while a
# breakout needs characters a color never does (quotes, angle brackets,
# semicolons, colons, slashes, braces, backslashes). Without those a
# value cannot escape a style="..." attribute, start a second CSS
# declaration, smuggle a url(scheme:...), or inject markup. Anything
# outside the charset maps to '' = unset, so a hostile value degrades to
# the renderer's own default rather than to a visible gray.
gb_safe_color <- function(v, fallback = '') {
    if (is.null(v) || length(v) != 1L || !is.character(v) || is.na(v))
        return(fallback)
    if (!nzchar(v)) return(v)
    if (nchar(v) > 64L) return(fallback)
    if (grepl('^[-#a-zA-Z0-9(),.% ]*$', v)) v else fallback
}

# ---- Static-snapshot helpers (Jul 2026) --------------------------------
# Single source for parsing the JS-committed chartSnapshot option
# ("<sig>|<svg>"); used by graphbuilder2_html()'s hidden-fallback embed
# AND the native snapshot Image result (distplotbuilder prototype).
# Returns list(key, svg) or NULL. The sanitize rules are load-bearing:
# the option can arrive from a crafted .omv, so the body must look like
# an SVG and carry no script element (the embed contexts - <img> data
# URI, rsvg rasterization - are the second fence).
gb_parse_snapshot <- function(raw) {
    if (!is.character(raw) || length(raw) != 1L || is.na(raw) ||
        !nzchar(raw)) return(NULL)
    # Measure BYTES, not characters (Aug 2026 audit). The ceiling this cap
    # exists to respect is jamovi's 4 MB nanomsg per-message limit, which
    # is a byte limit, and nchar() on a multibyte string counts fewer
    # characters than bytes - so a character cap let an oversized payload
    # through. nchar() also THROWS on invalid multibyte input, and this
    # runs at the tail of .run() outside any tryCatch, where a throw is a
    # dead analysis rather than a missing snapshot; type = "bytes" cannot
    # throw.
    if (nchar(raw, type = "bytes") >= 4000000) return(NULL)
    # Refuse invalid encoding outright. Under a UTF-8 locale - which is what
    # production jamovi runs - substring() and grepl() THROW on an invalid
    # multibyte string, and useBytes cannot rescue a string that is already
    # marked invalid. A snapshot is an SVG this widget generated, so invalid
    # bytes mean a corrupt or crafted option: degrade to "no snapshot"
    # rather than kill the analysis. validUTF8() itself never throws.
    if (!isTRUE(validUTF8(raw))) return(NULL)
    # useBytes on every match: the option can carry invalid multibyte data
    # from a crafted or truncated file, and R's regex engine THROWS when it
    # tries to translate that to a wide string ("input string 1 is invalid
    # in this locale"). This runs at the tail of .run() outside any
    # tryCatch, so a throw is a dead analysis (Aug 2026 audit).
    m <- regmatches(raw, regexec("^([0-9]+:-?[0-9]+)\\|", raw, useBytes = TRUE))[[1]]
    if (length(m) != 2L) return(NULL)
    body <- substring(raw, nchar(m[1]) + 1L)
    if (!grepl("^\\s*<svg[\\s>]", body, perl = TRUE, useBytes = TRUE)) return(NULL)
    if (grepl("<script", body, ignore.case = TRUE, useBytes = TRUE)) return(NULL)
    list(key = m[2], svg = body)
}

# Width/height (px) off the SVG root tag, clamped to sane display
# bounds; defaults when the attributes are absent or unparseable.
gb_svg_dims <- function(svg, default_w = 700, default_h = 450) {
    root <- regmatches(svg, regexpr("<svg[^>]*>", svg))
    grab <- function(attr, def) {
        if (length(root) != 1L) return(def)
        m <- regmatches(root, regexec(paste0('\\s', attr, '="([0-9.]+)"'), root))[[1]]
        v <- if (length(m) == 2L) suppressWarnings(as.numeric(m[2])) else NA_real_
        if (is.finite(v) && v >= 100 && v <= 3000) v else def
    }
    list(w = round(grab("width", default_w)), h = round(grab("height", default_h)))
}
