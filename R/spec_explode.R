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
gb_spec_args <- function(spec, table) {
    out <- vector("list", length(table))
    nms <- character(length(table))
    for (i in seq_along(table)) {
        row <- table[[i]]
        v <- spec[[row$opt]]
        if (is.null(v)) v <- row$default
        if (isTRUE(row$bool)) v <- isTRUE(v)
        out[[i]] <- v
        nms[i] <- row$arg
    }
    names(out) <- nms
    out
}
