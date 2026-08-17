# Correlation Matrix Plot Builder - multivariate r-matrix plots powered by
# the graphbuilder2.js htmlwidget bundled at inst/widget/graphbuilder2.js.
#
# Two or more numeric variables drive a symmetric correlation matrix.
# R computes r / p / n per pair (pairwise-complete observations,
# cor.test) and ships them as corrCells; the widget owns ALL rendering -
# the heatmap / circles / numbers / mixed cell geometry, the diverging
# color scale + its legend, triangle / diagonal / significance
# treatments, value overlays, and every panel interaction. Display
# options (decimals, alpha, triangle, colors, ...) are draw-time filters
# in the widget, so edits never wait on an R round-trip; only the
# variable list and the correlation method recompute cells here.

# Auto-generated chartSpec spec table (speed pass Phase 2). Each row:
# list(arg=<snake graphbuilder2_html arg>, opt=<camel former option>,
#      bool=<TRUE if the call wrapped isTRUE()>, default=<former a.yaml default>).
.corrplotbuilderSpecTable <- list(
    list(arg = "chart_title", opt = "chartTitle", bool = FALSE, default = ""),
    list(arg = "chart_note", opt = "chartNote", bool = FALSE, default = ""),
    list(arg = "chart_alt_text", opt = "chartAltText", bool = FALSE, default = ""),
    list(arg = "plot_width", opt = "plotWidth", bool = FALSE, default = 6),
    list(arg = "plot_height", opt = "plotHeight", bool = FALSE, default = 4),
    list(arg = "chart_background", opt = "chartBackground", bool = FALSE, default = ""),
    list(arg = "chart_border", opt = "chartBorder", bool = FALSE, default = "none"),
    list(arg = "chart_font_family", opt = "chartFontFamily", bool = FALSE, default = ""),
    list(arg = "chart_text_color", opt = "chartTextColor", bool = FALSE, default = ""),
    list(arg = "hidden_elements", opt = "hiddenElements", bool = FALSE, default = list()),
    list(arg = "text_styles", opt = "textStyles", bool = FALSE, default = list()),
    list(arg = "text_offsets", opt = "textOffsets", bool = FALSE, default = list()),
    list(arg = "corr_p_adjust", opt = "corrPAdjust", bool = FALSE, default = "none"),
    list(arg = "corr_decimals", opt = "corrDecimals", bool = FALSE, default = 2),
    list(arg = "corr_sig_level", opt = "corrSigLevel", bool = FALSE, default = 0.05),
    list(arg = "corr_sig_treat", opt = "corrSigTreat", bool = FALSE, default = "none"),
    list(arg = "corr_triangle", opt = "corrTriangle", bool = FALSE, default = "full"),
    list(arg = "corr_diagonal", opt = "corrDiagonal", bool = FALSE, default = "one"),
    list(arg = "corr_pos_color", opt = "corrPosColor", bool = FALSE, default = ""),
    list(arg = "corr_neg_color", opt = "corrNegColor", bool = FALSE, default = ""),
    list(arg = "corr_cell_gap", opt = "corrCellGap", bool = FALSE, default = 2),
    list(arg = "corr_cell_corner", opt = "corrCellCorner", bool = FALSE, default = 0),
    list(arg = "corr_cell_opacity", opt = "corrCellOpacity", bool = FALSE, default = 1),
    list(arg = "corr_cell_border_color", opt = "corrCellBorderColor", bool = FALSE, default = ""),
    list(arg = "corr_cell_border_width", opt = "corrCellBorderWidth", bool = FALSE, default = 0),
    list(arg = "corr_circle_scale", opt = "corrCircleScale", bool = FALSE, default = 0.92),
    list(arg = "corr_var_order", opt = "corrVarOrder", bool = FALSE, default = list()),
    list(arg = "corr_var_relabels", opt = "corrVarRelabels", bool = FALSE, default = list()),
    list(arg = "corr_var_styles", opt = "corrVarStyles", bool = FALSE, default = list()),
    list(arg = "corr_legend_title", opt = "corrLegendTitle", bool = FALSE, default = ""),
    list(arg = "corr_legend_scale", opt = "corrLegendScale", bool = FALSE, default = 1),
    list(arg = "corr_legend_orient", opt = "corrLegendOrient", bool = FALSE, default = "vertical"),
    list(arg = "corr_legend_ticks", opt = "corrLegendTicks", bool = FALSE, default = 3),
    list(arg = "corr_legend_color", opt = "corrLegendColor", bool = FALSE, default = ""),
    list(arg = "corr_legend_dx", opt = "corrLegendDX", bool = FALSE, default = 0),
    list(arg = "corr_legend_dy", opt = "corrLegendDY", bool = FALSE, default = 0),
    list(arg = "corr_legend_bar_width", opt = "corrLegendBarWidth", bool = FALSE, default = -1),
    list(arg = "chart_aspect_lock", opt = "chartAspectLock", bool = TRUE, default = FALSE),
    list(arg = "chart_snap_to_grid", opt = "chartSnapToGrid", bool = TRUE, default = FALSE),
    list(arg = "chart_align_guides", opt = "chartAlignGuides", bool = TRUE, default = TRUE),
    list(arg = "corr_show_values", opt = "corrShowValues", bool = TRUE, default = TRUE),
    list(arg = "corr_sig_stars", opt = "corrSigStars", bool = TRUE, default = FALSE),
    list(arg = "corr_number_grid", opt = "corrNumberGrid", bool = TRUE, default = TRUE),
    list(arg = "corr_value_content", opt = "corrValueContent", bool = FALSE, default = "r"),
    list(arg = "corr_color_numbers", opt = "corrColorNumbers", bool = TRUE, default = TRUE),
    list(arg = "corr_legend_show", opt = "corrLegendShow", bool = TRUE, default = TRUE)
)

corrplotbuilderClass <- if (requireNamespace('jmvcore', quietly = TRUE)) R6::R6Class(
    "corrplotbuilderClass",
    inherit = corrplotbuilderBase,
    private = list(
        # Aggregation cache: the cells list keyed by (columns + method),
        # identical()-compared so style-only commits skip the n^2
        # cor.test pass. See .run().
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
            vars <- self$options$vars

            if (is.null(data) || nrow(data) == 0 ||
                is.null(vars) || length(vars) < 2) {
                # No chart -> any persisted snapshot is stale; hide the
                # native static copy alongside the message.
                tryCatch(self$results$snapshotImage$setVisible(FALSE),
                         error = function(e) NULL)
                self$results$widget$setContent(gb2_engine_placeholder_html(
                    private$.placeholder(), self$options$clientBundleHash,
                    script_src_ready = TRUE))
                return()
            }

            method <- self$options$corrMethod
            cols <- lapply(vars, function(v) suppressWarnings(as.numeric(data[[v]])))
            names(cols) <- vars

            # Missing-data disclosure: correlations use pairwise complete
            # cases (nothing is dropped globally), so the note flags that
            # per-pair n varies whenever any case has a missing value.
            n_rows_total <- if (length(cols)) length(cols[[1]]) else 0L
            any_missing <- if (n_rows_total > 0)
                Reduce(`|`, lapply(cols, function(cl) !is.finite(cl)))
            else logical(0)
            n_rows_missing <- sum(any_missing)
            missing_note <- if (n_rows_missing > 0)
                sprintf("%d of %d cases have missing values; each correlation uses its pairwise complete cases (n varies by pair)",
                        n_rows_missing, n_rows_total) else ""

            # Raw columns for the widget's INSTANT method switch (Jul 10
            # 2026, Torry: Pearson -> Spearman waited ~2s on R). Pearson/
            # Spearman recompute fully client-side; Kendall's tau-b paints
            # instantly with its exact p landing on the echo. Size-gated so
            # a big dataset never bloats the payload (the method switch
            # just stays R-bound there). NAs serialize as JSON null
            # (widget.R's toJSON uses na = "null").
            corr_raw <- NULL
            if (n_rows_total > 0 && length(cols) * n_rows_total <= 200000) {
                # unname: the JS expects an ARRAY parallel to corrVars (a
                # named list would serialize as a JSON object)
                corr_raw <- unname(lapply(cols, function(cl) {
                    v <- as.numeric(cl); v[!is.finite(v)] <- NA
                    I(v)
                }))
            }

            # ---- Aggregation cache: cells derive only from the plotted
            # columns + the correlation method. identical() on the raw
            # columns makes any data edit invalidate exactly.
            agg_sig <- list(vars = vars, cols = cols, method = method)
            if (!is.null(private$.aggCache)
                && identical(private$.aggCache$sig, agg_sig)) {
                cells <- private$.aggCache$cells
            } else {
            cells <- list()
            nv <- length(vars)
            for (i in seq_len(nv)) {
                xi <- cols[[i]]
                for (j in i:nv) {
                    xj <- cols[[j]]
                    if (i == j) {
                        n_ij <- sum(is.finite(xi))
                        entry <- list(a = vars[i], b = vars[j],
                                      r = 1, p = 0, n = n_ij)
                    } else {
                        ok <- is.finite(xi) & is.finite(xj)
                        n_ij <- sum(ok)
                        r_ij <- NA_real_
                        p_ij <- NA_real_
                        # Pairwise r needs >= 3 complete pairs and
                        # variance on both sides; otherwise the cell
                        # ships without r/p and the widget draws an
                        # NA cell.
                        if (n_ij >= 3
                            && stats::sd(xi[ok]) > 0
                            && stats::sd(xj[ok]) > 0) {
                            # cor.test DEFAULTS (no exact=) on purpose:
                            # jamovi's corrmatrix passes none either, so
                            # small-n tie-free Spearman/Kendall p values
                            # are exact there and must be exact here too
                            # (and already are in Scatter's xy_stats) or
                            # the two modules print different p values
                            # for the same pair.
                            ct <- tryCatch(
                                suppressWarnings(stats::cor.test(
                                    xi[ok], xj[ok],
                                    method = method)),
                                error = function(e) NULL
                            )
                            if (!is.null(ct)) {
                                r_ij <- unname(ct$estimate)
                                p_ij <- ct$p.value
                            }
                        }
                        entry <- list(a = vars[i], b = vars[j], n = n_ij)
                        if (is.finite(r_ij)) entry$r <- r_ij
                        if (is.finite(p_ij)) entry$p <- p_ij
                    }
                    cells[[length(cells) + 1L]] <- entry
                }
            }

            }
            private$.aggCache <- list(sig = agg_sig, cells = cells)

            # chartSpec migration (speed pass Phase 2): the ~43 style options
            # are gone from a.yaml; their values ride the single hidden
            # `chartSpec` JSON option, exploded here into the flat
            # graphbuilder2_html() arg list. See R/spec_explode.R.
            spec <- gb_parse_spec(self$options$chartSpec)

            # Options that STAY first-class jamovi options; the JS setOption
            # wrapper routes every OTHER committed key into the chartSpec blob.
            spec_real_keys <- list(
                "data", "vars", "graphType", "corrMethod",
                "exportRequest", "exportPath", "clientBundleHash",
                "styleLibrary", "styleStamp", "annotationsJson", "chartSnapshot", "chartSpec"
            )
            # Allowlist of keys the widget may fold into the blob (corr has no
            # axis titles / hidden-points badge, so it is just the spec table
            # option names). The JS filters both its specState seed and the
            # explode through this, so a crafted chartSpec cannot inject a
            # non-style key over a computed payload field.
            spec_keys <- vapply(.corrplotbuilderSpecTable, function(r) r$opt,
                                character(1))

            fixed_args <- list(
                # Static-snapshot fallback: raw pass-through of the JS-committed
                # "<sig>|<svg>"; widget.R sanitizes + embeds (never in the payload).
                chart_snapshot = self$options$chartSnapshot,
                script_src_ready = TRUE,
                bars = list(),
                graph_type = self$options$graphType,
                graph_type_choices = list(
                    list(name = "corrheatmap", label = "Heatmap"),
                    list(name = "corrcircles", label = "Circles"),
                    list(name = "corrnumbers", label = "Numbers"),
                    list(name = "corrmixed",   label = "Mixed")
                ),
                graph_type_instant = TRUE,
                x_categories = character(0),
                client_bundle_hash = self$options$clientBundleHash,
                run_t0 = run_t0,
                style_action = self$options$styleLibrary,
                style_stamp = self$options$styleStamp,
                missing_note = missing_note,
                annotations = gb_resolve_annotations(
                    self$options$annotationsJson, list()),
                corr_vars = vars,
                corr_cells = cells,
                corr_raw = corr_raw,
                corr_method = method,
                chart_spec = self$options$chartSpec,
                spec_real_keys = spec_real_keys,
                spec_keys = spec_keys
            )
            spec_args <- gb_spec_args(spec, .corrplotbuilderSpecTable)

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
                    'Drag <strong>two or more</strong> numeric variables into ',
                    '<strong>Variables</strong> to render a correlation matrix. ',
                    'Click cells, variable names, or the color scale on the ',
                    'chart to customize it.'
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
            file.path(tempdir(), "corrplotbuilder_lastExportId.txt")
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
