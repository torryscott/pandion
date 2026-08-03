# Cross-file chart-style library.
#
# The whole-chart sibling of the palette library (see palette_library.R's
# header for the full rationale: sandboxed iframes make localStorage
# per-file, so a user-level library must live on disk). A "style" is a
# named set of LOOK-ONLY option values captured from one chart and
# re-applied to any other chart via ordinary option commits JS-side.
# R's only job is durable cross-file persistence: a styles.json beside
# palettes.json in the per-app config dir, updated through the one-shot
# `styleLibrary` action option with the same machineId + timestamp
# guards, and shipped back to the widget on every render.
#
# Each stored style is { groups: [..], opts: {optionKey: value, ..} }.
# `groups` records which capture groups the user checked at save time
# (colors/text/axes/bars/background); `opts` is treated as an OPAQUE
# bag by R - the widget owns the capture map and only ever applies
# option keys it recognises for the current module, so a style saved
# by a newer widget never breaks an older one.
#
# The machine identity is SHARED with the palette library: the widget
# stamps every action with the one machineId it receives in the render
# payload, so both libraries must judge actions against the same id.
# .gb_style_lib_read() adopts the palette library's machineId on every
# read (styles.json keeps a copy only for human inspection).

.gb_style_lib_file <- function() {
    file.path(.gb_palette_lib_dir(), "styles.json")
}

.gb_style_lib_empty <- function(machineId) {
    list(
        version       = 1L,
        machineId     = machineId,
        lastAppliedTs = 0,
        # Name of the saved style every NEW analysis starts from
        # ("" = plain stock defaults). Set from the widget's
        # "Set as default for new charts" star.
        defaultStyle  = "",
        styles        = setNames(list(), character(0)))
}

.gb_style_lib_read <- function(machineId) {
    f <- .gb_style_lib_file()
    if (!file.exists(f)) {
        lib <- .gb_style_lib_empty(machineId)
        # Seed the file; failure to write (read-only FS, etc.) is
        # non-fatal - the library is just empty in-memory this session.
        .gb_style_lib_write(lib)
        return(lib)
    }
    out <- tryCatch(
        jsonlite::read_json(f, simplifyVector = FALSE),
        error = function(e) NULL)
    if (!is.list(out)) {
        # Corrupt styles.json: back it up and reseed + write an empty library
        # so a later read stops re-reading the garbage (self-heal), mirroring
        # the palette library. The machineId is the shared palette id, so this
        # never churns identity - it just recovers the styles file.
        tryCatch(file.rename(f, paste0(f, ".corrupt")), error = function(e) NULL)
        lib <- .gb_style_lib_empty(machineId)
        .gb_style_lib_write(lib)
        return(lib)
    }
    # Adopt the shared machine identity (see header).
    out$machineId <- machineId
    if (is.null(out$lastAppliedTs)) out$lastAppliedTs <- 0
    if (is.null(out$defaultStyle) || !is.character(out$defaultStyle))
        out$defaultStyle <- ""
    if (is.null(out$styles) || !is.list(out$styles))
        out$styles <- setNames(list(), character(0))
    out
}

.gb_style_lib_write <- function(lib) {
    f <- .gb_style_lib_file()
    # Force styles to serialize as a JSON object even when empty
    # (jsonlite renders an unnamed empty list as []).
    if (length(lib$styles) == 0) {
        lib$styles <- setNames(list(), character(0))
    }
    # Atomic write (temp file + rename) so a crash mid-write can't leave a
    # truncated styles.json. Falls back to a direct write if rename fails.
    tryCatch({
        tmp <- paste0(f, ".tmp")
        jsonlite::write_json(lib, tmp, auto_unbox = TRUE, pretty = TRUE)
        if (!isTRUE(file.rename(tmp, f))) {
            unlink(tmp)
            jsonlite::write_json(lib, f, auto_unbox = TRUE, pretty = TRUE)
        }
    }, error = function(e) NULL)
    invisible(lib)
}

# Coerce an action's `groups` payload to a clean character vector.
.gb_style_lib_groups <- function(groups) {
    if (is.null(groups)) return(character(0))
    if (!is.character(groups)) {
        groups <- tryCatch(
            vapply(
                groups,
                function(x) if (length(x) > 0) as.character(x[[1]]) else NA_character_,
                character(1)),
            error = function(e) character(0))
    }
    groups[!is.na(groups) & nzchar(groups)]
}

# Apply a single action JSON (from the `styleLibrary` option) if it's
# eligible. Returns the (possibly updated) library. Verbs mirror the
# palette library: save / delete / rename / setdefault, plus the
# savedefault combo (the option carries ONE action per commit, so a
# save that should also become the default rides in a single action).
.gb_style_lib_apply <- function(lib, action_json) {
    if (!is.character(action_json) || length(action_json) == 0 || nchar(action_json) == 0) {
        return(lib)
    }
    action <- tryCatch(
        jsonlite::fromJSON(action_json, simplifyVector = FALSE),
        error = function(e) NULL)
    if (!is.list(action)) return(lib)

    # Cross-machine guard: only apply actions tagged with this
    # machine's ID. Otherwise a shared .omv would silently rewrite
    # the recipient's library.
    if (!identical(as.character(action$machineId), as.character(lib$machineId))) {
        return(lib)
    }
    ts <- suppressWarnings(as.numeric(action$timestamp))
    if (!is.finite(ts) || ts <= as.numeric(lib$lastAppliedTs)) {
        return(lib)
    }

    kind <- as.character(action$kind %||% "")
    if (identical(kind, "save") || identical(kind, "savedefault")) {
        # "Update from this chart" is a save under the existing name;
        # the widget re-sends the style's stored groups alongside the
        # refreshed opts, so groups survive updates.
        name <- as.character(action$name %||% "")
        if (!nzchar(name)) return(lib)
        groups <- .gb_style_lib_groups(action$groups)
        if (length(groups) == 0) return(lib)
        opts <- action$opts
        if (!is.list(opts) || length(opts) == 0 || is.null(names(opts))) return(lib)
        opts <- opts[nzchar(names(opts))]
        if (length(opts) == 0) return(lib)
        lib$styles[[name]] <- list(groups = as.list(groups), opts = opts)
        if (identical(kind, "savedefault"))
            lib$defaultStyle <- name
    } else if (identical(kind, "delete")) {
        name <- as.character(action$name %||% "")
        if (!nzchar(name)) return(lib)
        lib$styles[[name]] <- NULL
        # A default that pointed at the deleted style would dangle;
        # clear it so new analyses fall back to stock defaults.
        if (identical(as.character(lib$defaultStyle %||% ""), name))
            lib$defaultStyle <- ""
    } else if (identical(kind, "rename")) {
        from <- as.character(action$from %||% "")
        to   <- as.character(action$to %||% "")
        if (!nzchar(from) || !nzchar(to) || identical(from, to)) return(lib)
        if (is.null(lib$styles[[from]])) return(lib)
        # The widget blocks renaming onto an existing name; guard here
        # too so a stale action can never silently merge two styles.
        if (!is.null(lib$styles[[to]])) return(lib)
        lib$styles[[to]]   <- lib$styles[[from]]
        lib$styles[[from]] <- NULL
        # Keep the default pointing at the same style across a rename.
        if (identical(as.character(lib$defaultStyle %||% ""), from))
            lib$defaultStyle <- to
    } else if (identical(kind, "setdefault")) {
        name <- as.character(action$name %||% "")
        # "" clears the default. A named default must still exist - a
        # stale action from an old .omv must not install a dangling
        # default.
        if (nzchar(name) && is.null(lib$styles[[name]]))
            return(lib)
        lib$defaultStyle <- name
    } else {
        return(lib)
    }
    lib$lastAppliedTs <- ts
    .gb_style_lib_write(lib)
    lib
}
