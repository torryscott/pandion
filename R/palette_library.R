# Cross-file palette library.
#
# jamovi renders each .omv's widget output in a sandboxed iframe with
# its own opaque origin, so localStorage is per-file - saving a palette
# in one analysis doesn't surface it in another. To support a true
# user-level library that follows the user across files (and even
# across new analyses they create), we persist it as a small JSON file
# in the user's per-app config directory.
#
# Communication with the widget is via the `paletteLibrary` jamovi
# option as a one-shot action (save / delete / replace). R applies
# eligible actions to disk and sends the current library back to the
# widget on every render. Stale actions baked into a shared .omv are
# rejected by:
#   1. machineId mismatch  - .omv was edited on a different machine.
#   2. timestamp <= lastAppliedTs - this action was already applied
#      (either by us, or it's older than our most recent apply).
#
# Result: opening someone else's .omv never silently mutates your
# local library, and reopening your own .omv never re-applies an
# already-saved action.

# Namespaces this app has shipped under, newest first. The config dir is
# keyed by package name, so every rename orphans the previous library
# unless it is carried across - and the loss is SILENT (the code simply
# finds no file and seeds an empty one). That already happened once:
# the graphbuilder -> plotstudio rename stranded a styles.json that was
# never noticed missing. .gb_lib_migrate_legacy() below is what keeps
# the pandion rename from repeating it.
.GB_LEGACY_LIB_NAMESPACES <- c("plotstudio", "graphbuilder")

.gb_lib_dir_for <- function(ns) {
    tryCatch(
        tools::R_user_dir(ns, which = "config"),
        error = function(e) file.path(Sys.getenv("HOME", "~"), paste0(".", ns)))
}

# Copy palettes.json / styles.json across from the newest legacy
# namespace that has them, but ONLY into a directory that has neither.
#
# The window this runs in is exactly one call wide: the first read of a
# missing library seeds an empty one and writes it to disk, after which
# this correctly does nothing forever. Copy, never move, so the legacy
# directory stays intact as a rollback. Fail silently: a broken
# migration must never take the app down with it.
.gb_lib_migrate_legacy <- function(d) {
    tryCatch({
        files <- c("palettes.json", "styles.json")
        if (any(file.exists(file.path(d, files))))
            return(invisible(FALSE))
        for (ns in .GB_LEGACY_LIB_NAMESPACES) {
            old <- .gb_lib_dir_for(ns)
            if (!dir.exists(old) || identical(normalizePath(old, mustWork = FALSE),
                                              normalizePath(d, mustWork = FALSE)))
                next
            src <- file.path(old, files)
            src <- src[file.exists(src)]
            if (!length(src)) next
            file.copy(src, d, overwrite = FALSE)
            return(invisible(TRUE))
        }
        invisible(FALSE)
    }, error = function(e) invisible(FALSE))
}

.gb_palette_lib_dir <- function() {
    d <- tryCatch(
        tools::R_user_dir("pandion", which = "config"),
        error = function(e) file.path(Sys.getenv("HOME", "~"), ".pandion"))
    if (!dir.exists(d)) {
        tryCatch(
            dir.create(d, recursive = TRUE, showWarnings = FALSE),
            error = function(e) NULL)
    }
    .gb_lib_migrate_legacy(d)
    d
}

.gb_palette_lib_file <- function() {
    file.path(.gb_palette_lib_dir(), "palettes.json")
}

# Stable per-machine ID generated once on first read and persisted in
# the library file. Used as the cross-machine guard: only actions
# bearing this exact ID may rewrite the local library.
.gb_palette_lib_new_machine_id <- function() {
    paste0(
        "m_",
        as.integer(Sys.time()),
        "_",
        paste(sample(c(0:9, letters), 12, replace = TRUE), collapse = ""))
}

.gb_palette_lib_empty <- function(machineId = NULL) {
    list(
        version        = 1L,
        machineId      = if (is.null(machineId)) .gb_palette_lib_new_machine_id() else machineId,
        lastAppliedTs  = 0,
        # Palette id every NEW analysis starts with ("" = the stock
        # default). Set from the widget's "Use as default" control.
        defaultPalette = "",
        palettes       = setNames(list(), character(0)))
}

.gb_palette_lib_read <- function() {
    f <- .gb_palette_lib_file()
    if (!file.exists(f)) {
        lib <- .gb_palette_lib_empty()
        # Seed the file so subsequent reads return the same machineId.
        # Failure to write (read-only FS, etc.) is non-fatal - we just
        # treat the library as empty in-memory for this session.
        .gb_palette_lib_write(lib)
        return(lib)
    }
    out <- tryCatch(
        jsonlite::read_json(f, simplifyVector = FALSE),
        error = function(e) NULL)
    if (!is.list(out)) {
        # Corrupt/truncated file (write_json is not atomic, so a crash
        # mid-write leaves garbage). Back it up, reseed an empty library,
        # and WRITE it back like the file-missing branch - otherwise every
        # render re-reads the garbage and mints a fresh machineId, silently
        # dropping every save for BOTH this library and the style library
        # (which adopts this machineId). Writing stabilizes the id so the
        # libraries self-heal instead of needing a manual delete.
        tryCatch(file.rename(f, paste0(f, ".corrupt")), error = function(e) NULL)
        lib <- .gb_palette_lib_empty()
        .gb_palette_lib_write(lib)
        return(lib)
    }
    if (is.null(out$machineId) || !nzchar(as.character(out$machineId)))
        out$machineId <- .gb_palette_lib_new_machine_id()
    if (is.null(out$lastAppliedTs)) out$lastAppliedTs <- 0
    if (is.null(out$defaultPalette) || !is.character(out$defaultPalette))
        out$defaultPalette <- ""
    if (is.null(out$palettes) || !is.list(out$palettes))
        out$palettes <- setNames(list(), character(0))
    out
}

.gb_palette_lib_write <- function(lib) {
    f <- .gb_palette_lib_file()
    # Force palettes to serialize as a JSON object even when empty by
    # always passing a named list (jsonlite renders an unnamed empty
    # list as []).
    if (length(lib$palettes) == 0) {
        lib$palettes <- setNames(list(), character(0))
    }
    # Atomic write: serialize to a sibling temp file, then rename over the
    # target (rename is atomic on the same filesystem). A crash mid-write can
    # no longer leave a truncated palettes.json - the corruption that churned
    # the machineId. Falls back to a direct write if rename is unavailable.
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

# Apply a single action JSON (from the `paletteLibrary` option) if it's
# eligible. Returns the (possibly updated) library.
.gb_palette_lib_apply <- function(lib, action_json) {
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
    if (identical(kind, "save")) {
        name <- as.character(action$name %||% "")
        if (!nzchar(name)) return(lib)
        cols <- action$colors
        if (is.null(cols)) return(lib)
        if (!is.character(cols)) {
            cols <- vapply(
                cols,
                function(x) if (length(x) > 0) as.character(x[[1]]) else NA_character_,
                character(1))
        }
        cols <- cols[!is.na(cols) & nzchar(cols)]
        if (length(cols) == 0) return(lib)
        lib$palettes[[name]] <- as.list(cols)
    } else if (identical(kind, "delete")) {
        name <- as.character(action$name %||% "")
        if (!nzchar(name)) return(lib)
        lib$palettes[[name]] <- NULL
        # A default that pointed at the deleted palette would dangle;
        # clear it so resolution falls back to the stock default.
        if (identical(as.character(lib$defaultPalette %||% ""), paste0("saved:", name)))
            lib$defaultPalette <- ""
    } else if (identical(kind, "rename")) {
        from <- as.character(action$from %||% "")
        to   <- as.character(action$to %||% "")
        if (!nzchar(from) || !nzchar(to) || identical(from, to)) return(lib)
        if (is.null(lib$palettes[[from]])) return(lib)
        # The widget blocks renaming onto an existing name; guard here
        # too so a stale action can never silently merge two palettes.
        if (!is.null(lib$palettes[[to]])) return(lib)
        lib$palettes[[to]]   <- lib$palettes[[from]]
        lib$palettes[[from]] <- NULL
        # Keep the default pointing at the same palette across a rename.
        if (identical(as.character(lib$defaultPalette %||% ""), paste0("saved:", from)))
            lib$defaultPalette <- paste0("saved:", to)
    } else if (identical(kind, "setdefault")) {
        id <- as.character(action$id %||% "")
        # "" clears the default. A saved: id must still exist - a stale
        # action from an old .omv must not install a dangling default.
        if (startsWith(id, "saved:") && is.null(lib$palettes[[substring(id, 7)]]))
            return(lib)
        lib$defaultPalette <- id
    } else if (identical(kind, "savedefault")) {
        # One-shot combo from the Vision check's "Make these my default
        # palette" button: the paletteLibrary option carries ONE action
        # per commit (an immediate second commit would overwrite the
        # first inside the debounce window), so save + setdefault ride
        # together in a single action.
        name <- as.character(action$name %||% "")
        if (!nzchar(name)) return(lib)
        cols <- action$colors
        if (is.null(cols)) return(lib)
        if (!is.character(cols)) {
            cols <- vapply(
                cols,
                function(x) if (length(x) > 0) as.character(x[[1]]) else NA_character_,
                character(1))
        }
        cols <- cols[!is.na(cols) & nzchar(cols)]
        if (length(cols) == 0) return(lib)
        lib$palettes[[name]] <- as.list(cols)
        lib$defaultPalette <- paste0("saved:", name)
    } else if (identical(kind, "replace")) {
        repl <- action$palettes
        if (!is.list(repl)) return(lib)
        new_pals <- setNames(list(), character(0))
        for (nm in names(repl)) {
            if (!is.character(nm) || !nzchar(nm)) next
            cols <- repl[[nm]]
            if (!is.character(cols)) {
                cols <- tryCatch(
                    vapply(
                        cols,
                        function(x) if (length(x) > 0) as.character(x[[1]]) else NA_character_,
                        character(1)),
                    error = function(e) character(0))
            }
            cols <- cols[!is.na(cols) & nzchar(cols)]
            if (length(cols) == 0) next
            new_pals[[nm]] <- as.list(cols)
        }
        lib$palettes <- new_pals
    } else {
        return(lib)
    }
    lib$lastAppliedTs <- ts
    .gb_palette_lib_write(lib)
    lib
}

# Helper: %||% for default-on-NULL.
`%||%` <- function(a, b) if (is.null(a)) b else a
