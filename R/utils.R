# Shared utility functions for pandion module
# Used by both bargraph (Categorical Plot Builder) and rmgraph (Repeated Measures Plot Builder)

# Convert pt value to mm for ggplot2 linewidth/stroke (1pt = 0.3528mm)
ptToMm <- function(pt) as.numeric(pt) * 0.3528

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

# Convert tick length preset name to numeric pt value
tickLenPt <- function(val) {
    switch(val,
        "none"   = 0,
        "vshort" = 3,
        "short"  = 5,
        "medium" = 8,
        "long"   = 13,
        "vlong"  = 21,
        5  # fallback
    )
}

# Compute minor break positions between major breaks
computeMinorBreaks <- function(majorBreaks, count) {
    if (is.null(majorBreaks) || length(majorBreaks) < 2 || is.na(count) || count < 1) return(NULL)
    unlist(lapply(seq_len(length(majorBreaks) - 1), function(i) {
        seq(majorBreaks[i], majorBreaks[i + 1], length.out = count + 2)[2:(count + 1)]
    }))
}

# Validate colors (hex codes or R color names)
validateColor <- function(colorVal, fallback = '#808080') {
    if (is.null(colorVal) || length(colorVal) == 0 || is.na(colorVal) || colorVal == '') return(fallback)
    colorVal <- trimws(colorVal)
    if (grepl('^#[0-9A-Fa-f]{6}$', colorVal)) return(colorVal)
    if (tolower(colorVal) %in% tolower(grDevices::colors())) return(colorVal)
    return(fallback)
}

# Parse "x, y" offset string into list(x=, y=)
parseOffset <- function(val, defaultX = 0, defaultY = 0) {
    if (is.null(val) || val == '') return(list(x = defaultX, y = defaultY))
    parts <- strsplit(trimws(val), ",")[[1]]
    x <- as.numeric(trimws(parts[1]))
    y <- if (length(parts) >= 2) as.numeric(trimws(parts[2])) else defaultY
    list(x = ifelse(is.na(x), defaultX, x), y = ifelse(is.na(y), defaultY, y))
}

# Splice additions into a base vector at a given start position
spliceAt <- function(base, additions, startAt, pad = '#808080') {
    if (length(additions) == 0) return(base)
    startIdx <- max(1L, as.integer(startAt))
    endIdx <- startIdx + length(additions) - 1L
    if (startIdx > length(base)) {
        base <- c(base, rep(pad, startIdx - length(base) - 1L))
        base <- c(base, additions)
    } else {
        if (endIdx > length(base)) base <- c(base, rep(pad, endIdx - length(base)))
        base[startIdx:endIdx] <- additions
    }
    base
}

# Smart parser for theme direct input entries — classifies tokens by type, not position
# First token is always fill color (any R color name or #hex); remaining tokens:
#   pattern name, color name/#hex (for pattern color), or number (1st=density, 2nd=angle)
parseThemeEntry <- function(entry, mapPatCol) {
    tokens <- trimws(strsplit(trimws(entry), ",")[[1]])
    tokens <- tokens[nchar(tokens) > 0]
    if (length(tokens) == 0) return(NULL)

    fillCol <- validateColor(tokens[1], '#808080')
    pat <- 'none'; dens <- 0.3; patCol <- '#000000'; ang <- 30

    knownPatterns <- c('none', 'stripe', 'crosshatch', 'circle')
    allRColors <- tolower(grDevices::colors())

    for (tk in tokens[-1]) {
        tkLower <- tolower(tk)
        if (tkLower %in% knownPatterns) {
            pat <- tkLower
        } else if (grepl('^#[0-9A-Fa-f]{6}$', tk) || tkLower %in% allRColors) {
            patCol <- tk
        } else {
            v <- suppressWarnings(as.numeric(tk))
            if (!is.na(v)) {
                if (v >= 0 && v <= 1) dens <- v
                else ang <- v
            }
        }
    }

    list(c = fillCol, p = pat, d = dens, pc = patCol, a = ang)
}

# Smart parser for line style override entries — classifies tokens by type
parseLineStyleEntry <- function(entry) {
    tokens <- trimws(strsplit(trimws(entry), ",")[[1]])
    tokens <- tokens[nchar(tokens) > 0]
    if (length(tokens) == 0) return(NULL)

    style <- NULL; width <- NULL; shape <- NULL; pointSize <- NULL; color <- NULL

    knownStyles <- c('solid', 'dashed', 'dotted', 'dotdash', 'longdash', 'twodash')
    knownShapes <- c('circle', 'square', 'triangle', 'diamond',
                     'circleopen', 'squareopen', 'triangleopen', 'diamondopen')

    numberCount <- 0
    for (tk in tokens) {
        tkLower <- tolower(tk)
        if (tkLower %in% knownStyles) {
            style <- tkLower
        } else if (tkLower %in% knownShapes) {
            shape <- switch(tkLower,
                'circleopen' = 'circleOpen', 'squareopen' = 'squareOpen',
                'triangleopen' = 'triangleOpen', 'diamondopen' = 'diamondOpen',
                tkLower)
        } else if (is.null(color) && grepl('^#[0-9A-Fa-f]{6}$', tk)) {
            color <- tk
        } else if (is.null(color) && tkLower %in% tolower(grDevices::colors())) {
            color <- tk
        } else {
            v <- suppressWarnings(as.numeric(tk))
            if (!is.na(v)) {
                numberCount <- numberCount + 1
                if (numberCount == 1) width <- v
                else if (numberCount == 2) pointSize <- v
            }
        }
    }

    list(style = style, width = width, shape = shape, pointSize = pointSize, color = color)
}

# Resolve a color option that has a "custom" hex companion
resolveColor <- function(colorVal, customHex, fallback = '#000000') {
    if (colorVal == 'custom') {
        return(validateColor(customHex, fallback))
    }
    colorMap <- list(
        'black'  = '#000000',
        'white'  = '#FFFFFF',
        'gray'   = '#808080',
        'red'    = '#CB181D',
        'orange' = '#F16913',
        'green'  = '#238B45',
        'blue'   = '#08519C',
        'teal'   = '#4EB3D3',
        'purple' = '#6A51A3'
    )
    mapped <- colorMap[[colorVal]]
    if (!is.null(mapped)) return(mapped)
    return(validateColor(colorVal, fallback))
}

# Build fontface string from bold/italic booleans
fontFace <- function(bold, italic) {
    if (bold && italic) "bold.italic"
    else if (bold) "bold"
    else if (italic) "italic"
    else "plain"
}

# Map shape name to ggplot2 numeric code (solid, no fill/stroke)
shapeCode <- function(shapeName) {
    switch(shapeName,
        'circle'        = 16,
        'square'        = 15,
        'triangle'      = 17,
        'diamond'       = 18,
        'circleOpen'    = 1,
        'squareOpen'    = 0,
        'triangleOpen'  = 2,
        'diamondOpen'   = 5,
        16  # default circle
    )
}

# Map shape name to fillable ggplot2 code (supports fill + color/border)
shapeCodeFillable <- function(shapeName) {
    switch(shapeName,
        'circle'        = 21,
        'square'        = 22,
        'triangle'      = 24,
        'diamond'       = 23,
        'circleOpen'    = 1,
        'squareOpen'    = 0,
        'triangleOpen'  = 2,
        'diamondOpen'   = 5,
        21  # default circle
    )
}

# Map pattern name to ggpattern key
patternKey <- function(patternName) {
    switch(tolower(patternName),
        'stripe'     = 'stripe',
        'crosshatch' = 'crosshatch',
        'circle'     = 'circle',
        'none'       = 'none',
        'none'  # default
    )
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
        !nzchar(raw) || nchar(raw) >= 4000000) return(NULL)
    m <- regmatches(raw, regexec("^([0-9]+:-?[0-9]+)\\|", raw))[[1]]
    if (length(m) != 2L) return(NULL)
    body <- substring(raw, nchar(m[1]) + 1L)
    if (!grepl("^\\s*<svg[\\s>]", body, perl = TRUE)) return(NULL)
    if (grepl("<script", body, ignore.case = TRUE)) return(NULL)
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
