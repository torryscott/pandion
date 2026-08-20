# Likert / Survey Plot Builder - item-battery plots powered by the
# graphbuilder2.js htmlwidget bundled at inst/widget/graphbuilder2.js.
#
# Two or more items sharing one response scale drive the chart. R derives
# the master response-level list (the union across items, first-seen
# order for factors, ascending for numeric codings), counts each
# item x level cell (percent of the item's non-missing n), and computes
# per-item means with a t CI on the 1..k index coding. The widget owns
# all rendering - the diverging / 100% stacked rows (center boundary,
# neutral split, item sorting are draw-time filters), the mean-dot
# summary, the response-level legend, and every panel interaction. Only
# the item columns and likertCiLevel recompute here.

# Auto-generated chartSpec spec table (speed pass Phase 2). See CLAUDE.md
# convention 22. Row: list(arg=<snake graphbuilder2_html arg>, opt=<camel
# former option>, bool=<TRUE if isTRUE()-wrapped>, default=<former a.yaml default>).
.likertplotbuilderSpecTable <- list(
    list(arg = "chart_title", opt = "chartTitle", bool = FALSE, default = ""),
    list(arg = "chart_note", opt = "chartNote", bool = FALSE, default = ""),
    list(arg = "chart_alt_text", opt = "chartAltText", bool = FALSE, default = ""),
    list(arg = "plot_width", opt = "plotWidth", bool = FALSE, default = 6),
    list(arg = "plot_height", opt = "plotHeight", bool = FALSE, default = 4),
    list(arg = "chart_background", opt = "chartBackground", bool = FALSE, default = ""),
    list(arg = "chart_border", opt = "chartBorder", bool = FALSE, default = "none"),
    list(arg = "chart_font_family", opt = "chartFontFamily", bool = FALSE, default = ""),
    list(arg = "chart_text_color", opt = "chartTextColor", bool = FALSE, default = ""),
    list(arg = "chart_font_scale", opt = "chartFontScale", bool = FALSE, default = 1),
    list(arg = "hidden_elements", opt = "hiddenElements", bool = FALSE, default = list()),
    list(arg = "text_styles", opt = "textStyles", bool = FALSE, default = list()),
    list(arg = "text_offsets", opt = "textOffsets", bool = FALSE, default = list()),
    list(arg = "bar_opacity", opt = "barOpacity", bool = FALSE, default = 1),
    list(arg = "bar_corner_radius", opt = "barCornerRadius", bool = FALSE, default = 0),
    list(arg = "bar_border_color", opt = "barBorderColor", bool = FALSE, default = "#000000"),
    list(arg = "bar_border_width", opt = "barBorderWidth", bool = FALSE, default = 0),
    list(arg = "bar_border_opacity", opt = "barBorderOpacity", bool = FALSE, default = 1),
    list(arg = "bar_border_style", opt = "barBorderStyle", bool = FALSE, default = "solid"),
    list(arg = "group_colors", opt = "groupColors", bool = FALSE, default = list()),
    list(arg = "group_opacities", opt = "groupOpacities", bool = FALSE, default = list()),
    list(arg = "group_borders", opt = "groupBorders", bool = FALSE, default = list()),
    list(arg = "likert_center_boundary", opt = "likertCenterBoundary", bool = FALSE, default = -1),
    list(arg = "likert_sort", opt = "likertSort", bool = FALSE, default = "original"),
    list(arg = "likert_value_content", opt = "likertValueContent", bool = FALSE, default = "percent"),
    list(arg = "likert_value_decimals", opt = "likertValueDecimals", bool = FALSE, default = 0),
    list(arg = "likert_row_gap", opt = "likertRowGap", bool = FALSE, default = 0.3),
    list(arg = "likert_mean_error_type", opt = "likertMeanErrorType", bool = FALSE, default = "ci"),
    list(arg = "likert_dot_color", opt = "likertDotColor", bool = FALSE, default = ""),
    list(arg = "likert_dot_size", opt = "likertDotSize", bool = FALSE, default = 7),
    list(arg = "likert_ci_width", opt = "likertCiWidth", bool = FALSE, default = 2),
    list(arg = "likert_item_order", opt = "likertItemOrder", bool = FALSE, default = list()),
    list(arg = "likert_item_relabels", opt = "likertItemRelabels", bool = FALSE, default = list()),
    list(arg = "likert_item_styles", opt = "likertItemStyles", bool = FALSE, default = list()),
    list(arg = "likert_reverse_items", opt = "likertReverseItems", bool = FALSE, default = list()),
    list(arg = "likert_legend_orient", opt = "likertLegendOrient", bool = FALSE, default = "horizontal"),
    list(arg = "likert_legend_dx", opt = "likertLegendDX", bool = FALSE, default = 0),
    list(arg = "likert_legend_dy", opt = "likertLegendDY", bool = FALSE, default = 0),
    list(arg = "likert_legend_swatch_size", opt = "likertLegendSwatchSize", bool = FALSE, default = 12),
    list(arg = "likert_legend_font_size", opt = "likertLegendFontSize", bool = FALSE, default = 11),
    list(arg = "likert_legend_text_color", opt = "likertLegendTextColor", bool = FALSE, default = ""),
    list(arg = "likert_xaxis_color", opt = "likertXAxisColor", bool = FALSE, default = ""),
    list(arg = "likert_xaxis_width", opt = "likertXAxisWidth", bool = FALSE, default = 1),
    list(arg = "likert_xaxis_style", opt = "likertXAxisStyle", bool = FALSE, default = "solid"),
    list(arg = "likert_zero_color", opt = "likertZeroLineColor", bool = FALSE, default = ""),
    list(arg = "likert_zero_width", opt = "likertZeroLineWidth", bool = FALSE, default = 1.25),
    list(arg = "likert_zero_style", opt = "likertZeroLineStyle", bool = FALSE, default = "solid"),
    list(arg = "likert_grid_color", opt = "likertGridColor", bool = FALSE, default = ""),
    list(arg = "likert_grid_width", opt = "likertGridWidth", bool = FALSE, default = 1),
    list(arg = "likert_grid_style", opt = "likertGridStyle", bool = FALSE, default = "solid"),
    list(arg = "likert_x_min", opt = "likertXMin", bool = FALSE, default = 0),
    list(arg = "likert_x_max", opt = "likertXMax", bool = FALSE, default = 0),
    list(arg = "likert_x_interval", opt = "likertXInterval", bool = FALSE, default = 0),
    list(arg = "likert_dot_shape", opt = "likertDotShape", bool = FALSE, default = "circle"),
    list(arg = "likert_dot_outline_color", opt = "likertDotOutlineColor", bool = FALSE, default = "#ffffff"),
    list(arg = "likert_dot_outline_width", opt = "likertDotOutlineWidth", bool = FALSE, default = 1),
    list(arg = "likert_ci_color", opt = "likertCiColor", bool = FALSE, default = ""),
    list(arg = "likert_ci_style", opt = "likertCiStyle", bool = FALSE, default = "solid"),
    list(arg = "likert_x_tick_relabels", opt = "likertXTickRelabels", bool = FALSE, default = list()),
    list(arg = "chart_aspect_lock", opt = "chartAspectLock", bool = TRUE, default = FALSE),
    list(arg = "chart_snap_to_grid", opt = "chartSnapToGrid", bool = TRUE, default = FALSE),
    list(arg = "chart_align_guides", opt = "chartAlignGuides", bool = TRUE, default = TRUE),
    list(arg = "likert_show_values", opt = "likertShowValues", bool = TRUE, default = TRUE),
    list(arg = "likert_show_top_box", opt = "likertShowTopBox", bool = TRUE, default = FALSE),
    list(arg = "likert_top_box_mode", opt = "likertTopBoxMode", bool = FALSE, default = "agree"),
    list(arg = "likert_legend_show", opt = "likertLegendShow", bool = TRUE, default = TRUE),
    list(arg = "likert_grid_show", opt = "likertGridShow", bool = TRUE, default = TRUE),
    list(arg = "likert_x_min_override", opt = "likertXMinOverride", bool = TRUE, default = FALSE),
    list(arg = "likert_x_max_override", opt = "likertXMaxOverride", bool = TRUE, default = FALSE),
    list(arg = "likert_x_interval_override", opt = "likertXIntervalOverride", bool = TRUE, default = FALSE),
    list(arg = "likert_show_mini_means", opt = "likertShowMiniMeans", bool = TRUE, default = FALSE)
)

likertplotbuilderClass <- if (requireNamespace('jmvcore', quietly = TRUE)) R6::R6Class(
    "likertplotbuilderClass",
    inherit = likertplotbuilderBase,
    private = list(
        # Aggregation cache: cells + means keyed by (columns + CI level),
        # identical()-compared so style-only commits skip the counting
        # pass. See .run().
        .aggCache = NULL,
        .init = function() {
            gb2_init_script_src(self$results$widget)
        },
        .run = function() {
            # Wall-clock at run entry: feeds the debug overlay's "R
            # prelude" line + run-entry->paint gap (speed pass Phase 0).
            run_t0 <- as.numeric(Sys.time())
            private$.processExportRequest()

            data <- self$data
            items <- self$options$items

            if (is.null(data) || nrow(data) == 0 ||
                is.null(items) || length(items) < 1) {
                # No chart -> any persisted snapshot is stale; hide the
                # native static copy alongside the message.
                tryCatch(self$results$snapshotImage$setVisible(FALSE),
                         error = function(e) NULL)
                self$results$widget$setContent(gb2_engine_placeholder_html(
                    private$.placeholder(), self$options$clientBundleHash,
                    script_src_ready = TRUE))
                return()
            }

            # chartSpec migration: parse the blob early so the R-side alpha
            # computation can read reverse-scoring from it (likertReverseItems
            # is a spec option). The do.call below re-uses this `spec`.
            spec <- gb_parse_spec(self$options$chartSpec)

            ci_level <- self$options$likertCiLevel
            if (!is.numeric(ci_level) || ci_level <= 0.5 || ci_level >= 1)
                ci_level <- 0.95

            # Master response levels: union across items, keeping factor
            # level order (first seen) and ascending numeric codes. raws
            # keeps each numeric item's actual values for the continuous
            # route below.
            cols <- list()
            raws <- list()
            lv_all <- character(0)
            for (it in items) {
                x <- data[[it]]
                if (is.factor(x)) {
                    lv <- levels(x)
                    obs <- as.character(x)
                } else {
                    xn <- suppressWarnings(as.numeric(x))
                    lv <- as.character(sort(unique(xn[is.finite(xn)])))
                    obs <- ifelse(is.finite(xn), as.character(xn), NA_character_)
                    raws[[it]] <- xn
                }
                lv_all <- union(lv_all, lv)
                cols[[it]] <- obs
            }

            # Missing-data disclosure: items keep their own n (a skipped
            # item drops that respondent from that row only).
            n_rows_total <- nrow(data)
            any_missing <- rep(FALSE, n_rows_total)
            for (it in items)
                any_missing <- any_missing | is.na(cols[[it]])
            n_rows_missing <- sum(any_missing)
            missing_note <- if (n_rows_missing > 0)
                sprintf("%d of %d respondents skipped at least one item (item ns vary)",
                        n_rows_missing, n_rows_total) else ""

            if (length(lv_all) < 2) {
                # No chart -> any persisted snapshot is stale; hide the
                # native static copy alongside the message.
                tryCatch(self$results$snapshotImage$setVisible(FALSE),
                         error = function(e) NULL)
                self$results$widget$setContent(private$.placeholder(paste0(
                    'The selected items have fewer than 2 distinct response ',
                    'levels - there is nothing to stack.'
                )))
                return()
            }

            # Continuous-item route: dozens of distinct values means these
            # are continuous measurements, not a shared response scale.
            # Stacking is impossible (a cell per item x unique value would
            # hang the render), but each item's MEAN with a t CI is still
            # perfectly plottable - so all-numeric batteries route to the
            # Means chart computed from the RAW values (the widget gets
            # likert_continuous and offers only the Means type). Only a
            # non-numeric many-level battery (free text, IDs) still refuses.
            continuous <- FALSE
            if (length(lv_all) > 25) {
                nonnum <- items[!vapply(items, function(it)
                    is.numeric(data[[it]]), logical(1))]
                if (length(nonnum) > 0) {
                    # No chart -> any persisted snapshot is stale; hide the
                    # native static copy alongside the message.
                    tryCatch(self$results$snapshotImage$setVisible(FALSE),
                             error = function(e) NULL)
                    self$results$widget$setContent(private$.placeholder(paste0(
                        'These items have ', length(lv_all), ' distinct values - ',
                        'Likert items need a small shared response scale ',
                        '(typically 3-11 levels), and <strong>',
                        htmltools::htmlEscape(nonnum[[1]]),
                        '</strong> is not numeric, so item means cannot be ',
                        'computed either. Categorical variables with many ',
                        'levels belong in the Frequencies analysis.'
                    )))
                    return()
                }
                continuous <- TRUE
            }

            agg_sig <- list(items = items, cols = cols,
                            levels = lv_all, ci = ci_level,
                            cont = continuous)
            if (!is.null(private$.aggCache)
                && identical(private$.aggCache$sig, agg_sig)) {
                cells <- private$.aggCache$cells
                means <- private$.aggCache$means
            } else {
            cells <- list()
            means <- list()
            for (it in items) {
                if (continuous) {
                    # Means straight from the raw measurements; no cells
                    # (there is no response scale to count).
                    v <- raws[[it]]
                    v <- v[is.finite(v)]
                    n_it <- length(v)
                    m_entry <- list(item = it, n = n_it)
                    if (n_it >= 1) {
                        m_val <- mean(v)
                        m_entry$mean <- m_val
                        if (n_it >= 2) {
                            se <- stats::sd(v) / sqrt(n_it)
                            if (is.finite(se)) m_entry$se <- se
                            half <- se * stats::qt(0.5 + ci_level / 2, n_it - 1)
                            if (is.finite(half)) {
                                m_entry$lo <- m_val - half
                                m_entry$hi <- m_val + half
                            }
                        }
                    }
                    means[[length(means) + 1L]] <- m_entry
                    next
                }
                obs <- cols[[it]]
                obs <- obs[!is.na(obs)]
                n_it <- length(obs)
                # index coding 1..k on the master levels drives the means
                code <- match(obs, lv_all)
                for (li in seq_along(lv_all)) {
                    n_cell <- sum(obs == lv_all[li])
                    if (n_cell == 0 && n_it > 0) next
                    cells[[length(cells) + 1L]] <- list(
                        item = it, level = lv_all[li],
                        n = n_cell,
                        pct = if (n_it > 0) 100 * n_cell / n_it else 0
                    )
                }
                m_entry <- list(item = it, n = n_it)
                if (n_it >= 1) {
                    m_val <- mean(code)
                    m_entry$mean <- m_val
                    if (n_it >= 2) {
                        se <- stats::sd(code) / sqrt(n_it)
                        if (is.finite(se)) m_entry$se <- se
                        half <- se * stats::qt(0.5 + ci_level / 2, n_it - 1)
                        if (is.finite(half)) {
                            m_entry$lo <- m_val - half
                            m_entry$hi <- m_val + half
                        }
                    }
                }
                means[[length(means) + 1L]] <- m_entry
            }

            }
            private$.aggCache <- list(sig = agg_sig, cells = cells, means = means)

            # Continuous batteries ship NO levels (the means axis is built
            # from the means/CIs client-side) and force the Means type -
            # the only one the data supports; the on-chart switcher offers
            # just that one card. The user's stored graphType option is
            # untouched, so a later swap to discrete items restores it.
            lv_out <- if (continuous) character(0) else lv_all
            gtype_out <- if (continuous) "likertmeans" else self$options$graphType
            gchoices <- if (continuous)
                list(list(name = "likertmeans", label = "Means"))
            else list(
                list(name = "likertdiverging", label = "Diverging"),
                list(name = "likertstacked",   label = "Stacked"),
                list(name = "likertmeans",     label = "Means")
            )

            # Sigma stats panel (Jul 2026): Cronbach's alpha for the
            # battery. Items ride the 1..k index coding (the raw values
            # on the continuous route), with REVERSE-SCORED items
            # reflected first — mixed keying deflates alpha — matching
            # the chart's scoring (which likewise ignores reverse-scoring
            # on the continuous route). Listwise-complete rows; needs
            # k >= 2 items, n >= 3 rows, and positive total variance.
            likert_alpha <- NULL
            if (length(items) >= 2) {
                rev_set <- as.character(unlist(
                    spec$likertReverseItems))
                k_lv <- length(lv_all)
                mat <- tryCatch(vapply(items, function(it) {
                    if (continuous) return(as.numeric(raws[[it]]))
                    v <- as.numeric(match(cols[[it]], lv_all))
                    if (it %in% rev_set) (k_lv + 1) - v else v
                }, numeric(nrow(data))), error = function(e) NULL)
                if (!is.null(mat) && is.matrix(mat)) {
                    ok_rows <- apply(is.finite(mat), 1L, all)
                    m2 <- mat[ok_rows, , drop = FALSE]
                    if (nrow(m2) >= 3) {
                        vt <- stats::var(rowSums(m2))
                        vi <- sum(apply(m2, 2L, stats::var))
                        if (is.finite(vt) && vt > 0 && is.finite(vi)) {
                            kk <- ncol(m2)
                            likert_alpha <- list(
                                alpha = as.numeric(
                                    (kk / (kk - 1)) * (1 - vi / vt)),
                                k = as.integer(kk),
                                n = as.integer(nrow(m2)))
                        }
                    }
                }
            }

            # chartSpec migration (speed pass Phase 2): the ~68 style options
            # ride the single hidden `chartSpec` JSON option (parsed into
            # `spec` early, above), exploded here into the flat
            # graphbuilder2_html() arg list. likertCiLevel STAYS a real option
            # (data-shaping - it recomputes the CIs). See R/spec_explode.R.
            spec_real_keys <- list(
                "data", "items", "graphType", "likertCiLevel",
                "exportRequest", "exportPath", "clientBundleHash",
                "styleLibrary", "styleStamp", "annotationsJson", "chartSnapshot", "chartSpec"
            )
            spec_keys <- vapply(.likertplotbuilderSpecTable, function(r) r$opt,
                                character(1))

            fixed_args <- list(
                # Static-snapshot fallback: raw pass-through of the JS-committed
                # "<sig>|<svg>"; widget.R sanitizes + embeds (never in the payload).
                chart_snapshot = self$options$chartSnapshot,
                script_src_ready = TRUE,
                bars = list(),
                graph_type = gtype_out,
                graph_type_choices = gchoices,
                graph_type_instant = TRUE,
                x_categories = character(0),
                client_bundle_hash = self$options$clientBundleHash,
                run_t0 = run_t0,
                style_action = self$options$styleLibrary,
                style_stamp = self$options$styleStamp,
                missing_note = missing_note,
                annotations = gb_resolve_annotations(
                    self$options$annotationsJson, list()),
                likert_items = items,
                likert_levels = lv_out,
                likert_cells = cells,
                likert_means = means,
                likert_alpha = likert_alpha,
                likert_continuous = continuous,
                likert_ci_level = ci_level,
                chart_spec = self$options$chartSpec,
                spec_real_keys = spec_real_keys,
                spec_keys = spec_keys
            )
            spec_args <- gb_spec_args(spec, .likertplotbuilderSpecTable)

            html <- tryCatch(
                do.call(graphbuilder2_html, c(fixed_args, spec_args)),
                error = function(e) {
                    paste0(
                        '<div style="font-family:sans-serif;color:#a00;padding:12px;">',
                        '<strong>Pandion Plots error:</strong> ',
                        htmltools::htmlEscape(conditionMessage(e)),
                        '</div>'
                    )
                }
            )

            # Native static copy: feed the persisted snapshot into
            # jamovi's own Image result (native export, native copy
            # menu, module-less display).
            private$.updateSnapshotImage()
            self$results$widget$setContent(html)
        },

        .placeholder = function(msg) {
            body <- if (!missing(msg) && is.character(msg) && nzchar(msg)) {
                msg
            } else {
                paste0(
                    'Drag your survey items into <strong>Items</strong> to render ',
                    'a Likert chart. Items should share one response scale ',
                    '(e.g. Strongly Disagree ... Strongly Agree). Click bars, item ',
                    'names, or the legend on the chart to customize it.'
                )
            }
            paste0(
                '<div style="font-family:sans-serif;color:#666;padding:12px;font-size:13px;">',
                body,
                '</div>'
            )
        },

        .updateSnapshotImage = function() {
            img <- self$results$snapshotImage
            snap <- gb_parse_snapshot(self$options$chartSnapshot)
            if (is.null(snap)) {
                tryCatch(img$setVisible(FALSE), error = function(e) NULL)
                return()
            }
            tryCatch({
                dims <- gb_svg_dims(snap$svg)
                img$setSize(dims$w, dims$h)
                img$setState(snap$svg)
                img$setVisible(TRUE)
            }, error = function(e) NULL)
        },

        # renderFun for the snapshotImage result: rasterize the persisted
        # SVG onto jamovi's plot device at 2x for crispness. rsvg ships
        # with the module (the PDF-export dependency); without it the
        # image stays empty rather than erroring (FALSE = nothing drawn).
        .renderSnapshot = function(image, ggtheme, theme, ...) {
            svg <- image$state
            if (is.null(svg) || !is.character(svg) || !nzchar(svg))
                return(FALSE)
            if (!requireNamespace("rsvg", quietly = TRUE))
                return(FALSE)
            tryCatch({
                px_w <- max(400, round((if (is.numeric(image$width)) image$width else 700) * 2))
                bmp <- rsvg::rsvg(charToRaw(enc2utf8(svg)), width = px_w)
                grid::grid.newpage()
                grid::grid.raster(bmp)
                TRUE
            }, error = function(e) FALSE)
        },

        # --- Export pipeline ---------------------------------------------
        # Identical to the sibling modules; only the tempdir dedupe marker
        # is module-named. See distplotbuilder.b.R for the rationale.
        .processExportRequest = function() {
            req_raw <- self$options$exportRequest
            if (is.null(req_raw) || !nzchar(req_raw)) {
                self$results$exportStatus$setContent("")
                return()
            }
            parsed <- tryCatch(
                jsonlite::fromJSON(req_raw, simplifyVector = TRUE),
                error = function(e) NULL
            )
            if (is.null(parsed) || is.null(parsed$data) || is.null(parsed$format)) {
                self$results$exportStatus$setContent(private$.exportStatusHtml(
                    "Export request was malformed; please try again.", isError = TRUE
                ))
                return()
            }

            # Only act on a request that originated in THIS session. The JS
            # builds `id` as "<Date.now() ms>-<random>"; a request replayed
            # from a saved (or crafted) .omv carries an old or future
            # timestamp and must never silently write to disk - closing both
            # the reopen-rewrites-a-file surprise and the arbitrary-path
            # write a hostile file could reach via a persisted exportPath. A
            # real click is processed within seconds, so the window is ample.
            # An id whose prefix does not parse as a timestamp (or is
            # missing) is treated as stale too - never trusted through.
            req_ts <- suppressWarnings(as.numeric(
                sub("-.*$", "", as.character(parsed$id))))
            now_ms <- as.numeric(Sys.time()) * 1000
            if (length(req_ts) != 1L || !is.finite(req_ts) ||
                req_ts < now_ms - 300000 || req_ts > now_ms + 60000) {
                self$results$exportStatus$setContent("")
                return()
            }
            req_id <- parsed$id
            last_id <- private$.readLastExportId()
            if (!is.null(req_id) && identical(as.character(req_id), last_id)) {
                return()
            }
            private$.writeLastExportId(req_id)

            ext <- tolower(parsed$format)
            base_name <- if (!is.null(parsed$filename) && nzchar(parsed$filename))
                parsed$filename
            else
                paste0("plot.", ext)
            # Sanitize to a single, safe filename component: strip any
            # directory parts and separators so a crafted name ("../../x",
            # an absolute path, a Windows path) can never escape target_dir.
            base_name <- basename(gsub("\\", "/", base_name, fixed = TRUE))
            if (!nzchar(base_name) || base_name %in% c(".", ".."))
                base_name <- paste0("plot.", ext)

            user_home <- if (.Platform$OS.type == "windows") {
                profile <- Sys.getenv("USERPROFILE")
                if (nzchar(profile)) profile else path.expand("~")
            } else {
                path.expand("~")
            }

            dest_alias <- parsed$destination
            target_dir <- ""
            if (!is.null(dest_alias) && nzchar(dest_alias)) {
                sub <- switch(
                    tolower(dest_alias),
                    "desktop"   = "Desktop",
                    "documents" = "Documents",
                    "downloads" = "Downloads",
                    NULL
                )
                if (!is.null(sub)) target_dir <- file.path(user_home, sub)
            }
            if (!nzchar(target_dir)) {
                user_dir <- self$options$exportPath
                if (!is.null(user_dir) && nzchar(user_dir)) {
                    target_dir <- path.expand(user_dir)
                } else {
                    downloads <- file.path(user_home, "Downloads")
                    target_dir <- if (dir.exists(downloads)) downloads else user_home
                }
            }
            if (!dir.exists(target_dir)) {
                dir_ok <- tryCatch(
                    { dir.create(target_dir, recursive = TRUE, showWarnings = FALSE); TRUE },
                    error = function(e) FALSE
                )
                if (!dir_ok || !dir.exists(target_dir)) {
                    self$results$exportStatus$setContent(private$.exportStatusHtml(
                        paste0("Save folder does not exist and could not be created: ",
                               htmltools::htmlEscape(target_dir)),
                        isError = TRUE
                    ))
                    return()
                }
            }
            full_path <- private$.uniquePath(file.path(target_dir, base_name))
            write_ok <- tryCatch({
                if (identical(ext, "pdf")) {
                    if (!requireNamespace("rsvg", quietly = TRUE)) {
                        stop(
                            "PDF export needs the 'rsvg' R package. ",
                            "Install it with install.packages('rsvg')."
                        )
                    }
                    raw_bytes <- jsonlite::base64_dec(parsed$data)
                    rsvg::rsvg_pdf(raw_bytes, file = full_path)
                } else {
                    raw_bytes <- jsonlite::base64_dec(parsed$data)
                    writeBin(raw_bytes, full_path)
                }
                TRUE
            }, error = function(e) {
                self$results$exportStatus$setContent(private$.exportStatusHtml(
                    paste0("Could not write file: ", htmltools::htmlEscape(conditionMessage(e))),
                    isError = TRUE
                ))
                FALSE
            })
            if (!isTRUE(write_ok)) return()

            self$results$exportStatus$setContent(private$.exportStatusHtml(
                paste0(
                    "Saved <strong>", htmltools::htmlEscape(basename(full_path)),
                    "</strong> to <code>", htmltools::htmlEscape(dirname(full_path)),
                    "</code>"
                ),
                isError = FALSE
            ))
        },

        .uniquePath = function(path) {
            if (!file.exists(path)) return(path)
            ext <- tools::file_ext(path)
            stem <- tools::file_path_sans_ext(path)
            for (i in 2:999) {
                candidate <- if (nzchar(ext))
                    sprintf("%s (%d).%s", stem, i, ext)
                else
                    sprintf("%s (%d)", stem, i)
                if (!file.exists(candidate)) return(candidate)
            }
            path
        },

        .exportStatusHtml = function(html, isError = FALSE) {
            color <- if (isTRUE(isError)) "#a00" else "#2a7a2a"
            paste0(
                '<div style="font-family:sans-serif;color:', color,
                ';padding:8px 12px;font-size:12px;">', html, '</div>'
            )
        },

        .exportIdFile = function() {
            file.path(tempdir(), "likertplotbuilder_lastExportId.txt")
        },
        .readLastExportId = function() {
            f <- private$.exportIdFile()
            if (!file.exists(f)) return(NULL)
            tryCatch(
                readLines(f, n = 1L, warn = FALSE)[1L],
                error = function(e) NULL
            )
        },
        .writeLastExportId = function(id) {
            f <- private$.exportIdFile()
            tryCatch(writeLines(as.character(id), f), error = function(e) NULL)
        }
    )
)
