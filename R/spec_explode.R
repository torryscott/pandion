# chartSpec explode helper (speed pass Phase 2, Jul 2026).
#
# The on-chart editor used to persist ~200 style options as individual
# jamovi options; jamovi prices every panel change per option (protobuf
# serialize + IPC + R Options construction, x2 for INIT+RUN), so a
# 330-option analysis dispatched ~550 ms slower than a lean one. The
# migration collapses those options into ONE hidden String option,
# `chartSpec`, holding a sparse JSON object keyed by the FORMER option
# names (camelCase). This file explodes that blob back into the flat
# graphbuilder2_html() argument list, so the JS payload is unchanged and
# only the jamovi-facing option count shrinks.
#
# A module supplies a spec TABLE (see .plotbuilderSpecTable): one row per
# former option, each list(arg, opt, bool, default):
#   arg     - the snake_case graphbuilder2_html() argument name
#   opt     - the camelCase former option name (the chartSpec key)
#   bool    - TRUE when the old call wrapped the value in isTRUE()
#   default - the former a.yaml default (used when the key is absent).
# Defaults live HERE (not in the graphbuilder2_html signature) so a
# migrated module renders identically to its pre-migration self and is
# immune to signature drift.

`%||%` <- function(a, b) if (is.null(a)) b else a

# Parse a chartSpec JSON string into a plain R list. simplifyVector =
# FALSE keeps JSON arrays as R lists (matching jmvcore Array semantics)
# and scalars as length-1 atomics; any parse failure yields list() so a
# malformed blob renders defaults rather than erroring.
gb_parse_spec <- function(spec_raw) {
    if (is.null(spec_raw) || !is.character(spec_raw) || length(spec_raw) != 1L ||
        !nzchar(spec_raw))
        return(list())
    parsed <- tryCatch(
        jsonlite::fromJSON(spec_raw, simplifyVector = FALSE),
        error = function(e) list()
    )
    if (!is.list(parsed)) list() else parsed
}

# Build the named list of graphbuilder2_html() arguments from a parsed
# spec + a module table. Every table row yields exactly one argument, so
# the render is fully determined by (spec + table defaults) with no
# dependence on the shared signature's defaults.
# The DEFAULT for one option, read from the same table that supplies it.
# Shipped to the client for autoPCorrection so the bracket panel can tell
# a deliberate pick from a mere default (Aug 2026): the panel keeps a
# persisted pooled correction visible even where it cannot apply, and
# once a pooled correction became the DEFAULT that exemption would have
# fired on every chart, quietly disabling the gate.
gb_spec_default <- function(table, opt) {
    for (row in table) if (identical(row$opt, opt)) return(row$default)
    NULL
}
# ---- Color sanitisation (Aug 2026 audit) -------------------------------
# chartSpec is a hidden String option: it persists in the .omv and can be
# replaced wholesale by anyone who edits the file, and the widget
# interpolates color-valued entries into style="..." attributes assigned
# via innerHTML. gb_safe_color (utils.R) closes the breakout; this walker
# applies it to every color-carrying entry: any name containing "color"
# (the store convention - groupColors entries, categoryStyles fields,
# textStyles, bandColor and friends all follow it) plus the color-valued
# options whose names do not say so. Unnamed children (customPalette's
# bare hex strings) inherit the parent name. Booleans like
# pointColorMatch match the name rule but fail is.character, so they pass
# untouched. chartPalette is deliberately NOT listed: its value is a
# palette ID or a user-typed saved-palette NAME, never a CSS color.
# The heatmap ramp stops carry CSS colours but their names do not say so.
.gb2_color_extras <- c("chartBackground", "facetStripBackground",
                       "chartBorder", "customPalette",
                       "xyBinCustomLow", "xyBinCustomMid", "xyBinCustomHigh")
gb_spec_color_name <- function(name) {
    nzchar(name) && (grepl("color", name, ignore.case = TRUE) ||
                     name %in% .gb2_color_extras)
}
gb_sanitize_colors <- function(x, name = "") {
    if (is.list(x)) {
        nm <- names(x)
        for (i in seq_along(x)) {
            child <- if (!is.null(nm) && nzchar(nm[i])) nm[i] else name
            # x[i] <- list(v), NOT x[[i]] <- v: a JSON null parses to NULL,
            # and [[<- DELETES the element rather than storing it, so the
            # list shrinks mid-loop and seq_along walks off the end.
            x[i] <- list(gb_sanitize_colors(x[[i]], child))
        }
        return(x)
    }
    # customPalette is a comma-joined LIST of colors, not a single one, so
    # the per-color length cap has to apply per ELEMENT (a 9-color palette
    # is already 71 chars). Split, gate, rejoin: legitimate values survive
    # byte-identically - including functional notations, whose fragments
    # ("rgb(68" / " 120" / " 173)") are each charset-clean and rejoin
    # exactly - while one bad slot degrades to the palette default instead
    # of destroying the whole palette.
    if (identical(name, "customPalette") && is.character(x) &&
        length(x) == 1L && !is.na(x) && grepl(",", x, fixed = TRUE))
        return(paste(vapply(strsplit(x, ",", fixed = TRUE)[[1]],
                            gb_safe_color, character(1), USE.NAMES = FALSE),
                     collapse = ","))
    if (gb_spec_color_name(name) && is.character(x))
        return(gb_safe_color(x))
    x
}

# The blob shipped to the client must stay BYTE-IDENTICAL for legitimate
# files (the client-side explode and the echo hash-skip both key on it),
# so the sanitized spec is re-serialized ONLY when the walk actually
# changed something - i.e. only for a hostile or corrupt blob.
gb_spec_sanitized_json <- function(spec_raw) {
    if (is.null(spec_raw) || !is.character(spec_raw) ||
        length(spec_raw) != 1L || !nzchar(spec_raw)) return(spec_raw)
    # Never throw: this runs during fixed_args assembly, outside the .run()
    # tryCatch, so an unforeseen blob shape must degrade (ship the raw
    # string, which R's own arg mapping ignores key-by-key) rather than
    # abort the analysis every time the file is opened.
    tryCatch({
        spec <- gb_parse_spec(spec_raw)
        clean <- gb_sanitize_colors(spec)
        if (identical(clean, spec)) spec_raw
        else as.character(jsonlite::toJSON(clean, auto_unbox = TRUE,
                                           digits = NA))
    }, error = function(e) spec_raw)
}

gb_spec_args <- function(spec, table) {
    out <- vector("list", length(table))
    nms <- character(length(table))
    for (i in seq_along(table)) {
        row <- table[[i]]
        v <- spec[[row$opt]]
        if (is.null(v)) v <- row$default
        v <- tryCatch(gb_sanitize_colors(v, row$opt), error = function(e) row$default)
        if (isTRUE(row$bool)) v <- isTRUE(v)
        out[[i]] <- v
        nms[i] <- row$arg
    }
    names(out) <- nms
    out
}
