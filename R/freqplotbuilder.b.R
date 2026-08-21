# Frequencies Plot Builder - categorical count / proportion plots powered by
# the graphbuilder2.js htmlwidget bundled at inst/widget/graphbuilder2.js.
#
# A single categorical variable drives every plot type; the module COUNTS
# rows (nothing is measured), so there is no numeric Y role. groupVar adds a
# second categorical dimension on the bar type (dodged / stacked / 100%
# stacked via freqPosition) and facetVar panels it. pie / donut / pareto are
# single-panel types: they use the main variable only and POOL across any
# assigned group / facet variable (an on-chart footnote says so), keeping
# the chart alive rather than erroring when users hop graph types.
#
# Like the sibling modules, R only preps the data: it ships per-cell counts
# in the shared `bars` channel (mean = count, se = 0, values = empty) and
# the widget computes all geometry client-side - including the
# count -> percent / proportion transform (freqStat) and the stacked / 100%
# layouts, so those edits never wait on an R round-trip. The widget owns
# interaction; R is a thin data/option marshaller.
#
# Payload mapping per type:
#   bar    - x = (facet ¦) category, group = groupVar level (bars dodge /
#            stack inside each category slot exactly as Compare Groups).
#   pie    - x = "" and group = CATEGORY: slices ride the group-color /
#   donut    legend / per-group-style machinery, so palettes, legend
#            renames and per-slice styling all reuse the suite conventions.
#   pareto - x = category with x_categories pre-sorted by descending
#            count; bars ride the plain categorical path and the widget
#            draws the cumulative-percent line + right axis.

# Auto-generated chartSpec spec table (speed pass Phase 2). See CLAUDE.md convention 22.
.freqplotbuilderSpecTable <- list(
    list(arg = "facet_strip_position", opt = "facetStripPosition", bool = FALSE, default = "top"),
    list(arg = "facet_strip_labels", opt = "facetStripLabels", bool = FALSE, default = list()),
    list(arg = "facet_strip_underline_color", opt = "facetStripUnderlineColor", bool = FALSE, default = "#888888"),
    list(arg = "facet_strip_underline_width", opt = "facetStripUnderlineWidth", bool = FALSE, default = 1),
    list(arg = "facet_strip_underline_style", opt = "facetStripUnderlineStyle", bool = FALSE, default = "solid"),
    list(arg = "facet_strip_underline_length", opt = "facetStripUnderlineLength", bool = FALSE, default = 100),
    list(arg = "facet_gap", opt = "facetGap", bool = FALSE, default = 18),
    list(arg = "facet_divider", opt = "facetDivider", bool = FALSE, default = "line"),
    list(arg = "facet_divider_color", opt = "facetDividerColor", bool = FALSE, default = "#cccccc"),
    list(arg = "facet_divider_width", opt = "facetDividerWidth", bool = FALSE, default = 0),
    list(arg = "facet_divider_style", opt = "facetDividerStyle", bool = FALSE, default = "solid"),
    list(arg = "facet_order", opt = "facetOrder", bool = FALSE, default = list()),
    list(arg = "hidden_facets", opt = "hiddenFacets", bool = FALSE, default = list()),
    list(arg = "facet_shading", opt = "facetShading", bool = FALSE, default = "none"),
    list(arg = "facet_shading_color", opt = "facetShadingColor", bool = FALSE, default = "#f0f0f0"),
    list(arg = "facet_shading_opacity", opt = "facetShadingOpacity", bool = FALSE, default = 0.5),
    list(arg = "facet_border_color", opt = "facetBorderColor", bool = FALSE, default = "#dddddd"),
    list(arg = "facet_border_width", opt = "facetBorderWidth", bool = FALSE, default = 1),
    list(arg = "facet_strip_background", opt = "facetStripBackground", bool = FALSE, default = "none"),
    list(arg = "facet_strip_background_color", opt = "facetStripBackgroundColor", bool = FALSE, default = "#eeeeee"),
    list(arg = "facet_strip_background_opacity", opt = "facetStripBackgroundOpacity", bool = FALSE, default = 1),
    list(arg = "facet_strip_rotation", opt = "facetStripRotation", bool = FALSE, default = 0),
    list(arg = "facet_layout", opt = "facetLayout", bool = FALSE, default = "inline"),
    list(arg = "facet_wrap_cols", opt = "facetWrapCols", bool = FALSE, default = 0),
    list(arg = "facet_x_tick_labels", opt = "facetXTickLabels", bool = FALSE, default = "all"),
    list(arg = "plot_width", opt = "plotWidth", bool = FALSE, default = 6),
    list(arg = "plot_height", opt = "plotHeight", bool = FALSE, default = 4),
    list(arg = "y_min", opt = "yMin", bool = FALSE, default = 0),
    list(arg = "y_max", opt = "yMax", bool = FALSE, default = 0),
    list(arg = "y_interval", opt = "yInterval", bool = FALSE, default = 0),
    list(arg = "chart_title", opt = "chartTitle", bool = FALSE, default = ""),
    list(arg = "chart_note", opt = "chartNote", bool = FALSE, default = ""),
    list(arg = "chart_alt_text", opt = "chartAltText", bool = FALSE, default = ""),
    list(arg = "x_category_relabels", opt = "xCategoryRelabels", bool = FALSE, default = list()),
    list(arg = "group_item_relabels", opt = "groupItemRelabels", bool = FALSE, default = list()),
    list(arg = "y_tick_relabels", opt = "yTickRelabels", bool = FALSE, default = list()),
    list(arg = "text_offsets", opt = "textOffsets", bool = FALSE, default = list()),
    list(arg = "legend_item_offsets", opt = "legendItemOffsets", bool = FALSE, default = list()),
    list(arg = "legend_order", opt = "legendOrder", bool = FALSE, default = list()),
    list(arg = "chart_orientation", opt = "chartOrientation", bool = FALSE, default = "vertical"),
    list(arg = "chart_background", opt = "chartBackground", bool = FALSE, default = ""),
    list(arg = "chart_font_family", opt = "chartFontFamily", bool = FALSE, default = ""),
    list(arg = "chart_palette", opt = "chartPalette", bool = FALSE, default = ""),
    list(arg = "custom_palette", opt = "customPalette", bool = FALSE, default = "#2d5c94,#902634,#e18e4c,#597b2f,#faca59,#32295e,#5bb1ba,#d35a80"),
    list(arg = "chart_border", opt = "chartBorder", bool = FALSE, default = "none"),
    list(arg = "chart_grid", opt = "chartGrid", bool = FALSE, default = "none"),
    list(arg = "chart_grid_layer", opt = "chartGridLayer", bool = FALSE, default = "behind"),
    list(arg = "chart_grid_major_color", opt = "chartGridMajorColor", bool = FALSE, default = "#d0d0d0"),
    list(arg = "chart_grid_major_thickness", opt = "chartGridMajorThickness", bool = FALSE, default = 0.75),
    list(arg = "chart_grid_minor_color", opt = "chartGridMinorColor", bool = FALSE, default = "#ececec"),
    list(arg = "chart_grid_minor_thickness", opt = "chartGridMinorThickness", bool = FALSE, default = 0.5),
    list(arg = "chart_grid_major_style", opt = "chartGridMajorStyle", bool = FALSE, default = "solid"),
    list(arg = "chart_grid_minor_style", opt = "chartGridMinorStyle", bool = FALSE, default = "solid"),
    list(arg = "chart_text_color", opt = "chartTextColor", bool = FALSE, default = ""),
    list(arg = "chart_font_scale", opt = "chartFontScale", bool = FALSE, default = 1),
    list(arg = "hidden_bars", opt = "hiddenBars", bool = FALSE, default = list()),
    list(arg = "hidden_points", opt = "hiddenPoints", bool = FALSE, default = list()),
    list(arg = "hidden_elements", opt = "hiddenElements", bool = FALSE, default = list()),
    list(arg = "category_gap_overrides", opt = "categoryGapOverrides", bool = FALSE, default = list()),
    list(arg = "group_gap_overrides", opt = "groupGapOverrides", bool = FALSE, default = list()),
    list(arg = "category_order", opt = "categoryOrder", bool = FALSE, default = list()),
    list(arg = "group_order", opt = "groupOrder", bool = FALSE, default = list()),
    list(arg = "text_styles", opt = "textStyles", bool = FALSE, default = list()),
    list(arg = "group_colors", opt = "groupColors", bool = FALSE, default = list()),
    list(arg = "bar_color", opt = "barColor", bool = FALSE, default = ""),
    list(arg = "group_patterns", opt = "groupPatterns", bool = FALSE, default = list()),
    list(arg = "bar_pattern", opt = "barPattern", bool = FALSE, default = ""),
    list(arg = "bar_pattern_density", opt = "barPatternDensity", bool = FALSE, default = 1),
    list(arg = "bar_pattern_angle", opt = "barPatternAngle", bool = FALSE, default = 45),
    list(arg = "bar_pattern_thickness", opt = "barPatternThickness", bool = FALSE, default = 1),
    list(arg = "bar_pattern_color", opt = "barPatternColor", bool = FALSE, default = ""),
    list(arg = "group_borders", opt = "groupBorders", bool = FALSE, default = list()),
    list(arg = "group_opacities", opt = "groupOpacities", bool = FALSE, default = list()),
    list(arg = "group_corner_radii", opt = "groupCornerRadii", bool = FALSE, default = list()),
    list(arg = "group_error_bars", opt = "groupErrorBars", bool = FALSE, default = list()),
    list(arg = "category_styles", opt = "categoryStyles", bool = FALSE, default = list()),
    list(arg = "error_bar_direction", opt = "errorBarDirection", bool = FALSE, default = "both"),
    list(arg = "error_bar_color", opt = "errorBarColor", bool = FALSE, default = "#000000"),
    list(arg = "error_bar_thickness", opt = "errorBarThickness", bool = FALSE, default = 1.4),
    list(arg = "error_bar_cap_size", opt = "errorBarCapSize", bool = FALSE, default = 1),
    list(arg = "bar_border_color", opt = "barBorderColor", bool = FALSE, default = "#000000"),
    list(arg = "bar_border_width", opt = "barBorderWidth", bool = FALSE, default = 0),
    list(arg = "bar_border_opacity", opt = "barBorderOpacity", bool = FALSE, default = 1),
    list(arg = "bar_border_style", opt = "barBorderStyle", bool = FALSE, default = "solid"),
    list(arg = "category_gap", opt = "categoryGap", bool = FALSE, default = 0.2),
    list(arg = "bar_gap", opt = "barGap", bool = FALSE, default = 0),
    list(arg = "legend_swatch_size", opt = "legendSwatchSize", bool = FALSE, default = 12),
    list(arg = "legend_row_spacing", opt = "legendRowSpacing", bool = FALSE, default = 18),
    list(arg = "legend_swatch_gap", opt = "legendSwatchGap", bool = FALSE, default = 6),
    list(arg = "legend_offset_x", opt = "legendOffsetX", bool = FALSE, default = 0),
    list(arg = "legend_offset_y", opt = "legendOffsetY", bool = FALSE, default = 0),
    list(arg = "auto_p_correction", opt = "autoPCorrection", bool = FALSE, default = "none"),
    list(arg = "x_axis_thickness", opt = "xAxisThickness", bool = FALSE, default = 1.5),
    list(arg = "y_axis_thickness", opt = "yAxisThickness", bool = FALSE, default = 1.5),
    list(arg = "x_axis_style", opt = "xAxisStyle", bool = FALSE, default = "solid"),
    list(arg = "y_axis_style", opt = "yAxisStyle", bool = FALSE, default = "solid"),
    list(arg = "x_axis_color", opt = "xAxisColor", bool = FALSE, default = ""),
    list(arg = "x_tick_color", opt = "xTickColor", bool = FALSE, default = ""),
    list(arg = "x_tick_direction", opt = "xTickDirection", bool = FALSE, default = "out"),
    list(arg = "y_axis_color", opt = "yAxisColor", bool = FALSE, default = ""),
    list(arg = "y_tick_color", opt = "yTickColor", bool = FALSE, default = ""),
    list(arg = "y_tick_direction", opt = "yTickDirection", bool = FALSE, default = "out"),
    list(arg = "x_tick_length", opt = "xTickLength", bool = FALSE, default = 6),
    list(arg = "y_tick_length", opt = "yTickLength", bool = FALSE, default = 6),
    list(arg = "y_minor_tick_count", opt = "yMinorTickCount", bool = FALSE, default = 1),
    list(arg = "x_minor_tick_count", opt = "xMinorTickCount", bool = FALSE, default = 1),
    list(arg = "x_tick_thickness", opt = "xTickThickness", bool = FALSE, default = 1),
    list(arg = "y_tick_thickness", opt = "yTickThickness", bool = FALSE, default = 1),
    list(arg = "bar_opacity", opt = "barOpacity", bool = FALSE, default = 1),
    list(arg = "bar_corner_radius", opt = "barCornerRadius", bool = FALSE, default = 0),
    list(arg = "freq_chisq_position", opt = "freqChisqPosition", bool = FALSE, default = "topright"),
    list(arg = "freq_chisq_font_size", opt = "freqChisqFontSize", bool = FALSE, default = 11),
    list(arg = "freq_chisq_dx", opt = "freqChisqDX", bool = FALSE, default = 0),
    list(arg = "freq_chisq_dy", opt = "freqChisqDY", bool = FALSE, default = 0),
    list(arg = "pie_hole", opt = "pieHole", bool = FALSE, default = -1),
    list(arg = "pie_start_angle", opt = "pieStartAngle", bool = FALSE, default = 0),
    list(arg = "pie_labels", opt = "pieLabels", bool = FALSE, default = "percent"),
    list(arg = "slice_border_color", opt = "sliceBorderColor", bool = FALSE, default = ""),
    list(arg = "slice_border_width", opt = "sliceBorderWidth", bool = FALSE, default = 1.5),
    list(arg = "slice_border_style", opt = "sliceBorderStyle", bool = FALSE, default = "solid"),
    list(arg = "slice_border_opacity", opt = "sliceBorderOpacity", bool = FALSE, default = 1),
    list(arg = "pareto_line_color", opt = "paretoLineColor", bool = FALSE, default = ""),
    list(arg = "pareto_line_width", opt = "paretoLineWidth", bool = FALSE, default = 2),
    list(arg = "pareto_line_style", opt = "paretoLineStyle", bool = FALSE, default = "solid"),
    list(arg = "pareto_line_opacity", opt = "paretoLineOpacity", bool = FALSE, default = 1),
    list(arg = "pareto_marker_color", opt = "paretoMarkerColor", bool = FALSE, default = ""),
    list(arg = "pareto_marker_shape", opt = "paretoMarkerShape", bool = FALSE, default = "circle"),
    list(arg = "pareto_marker_size", opt = "paretoMarkerSize", bool = FALSE, default = 7),
    list(arg = "pareto_marker_opacity", opt = "paretoMarkerOpacity", bool = FALSE, default = 1),
    list(arg = "pareto_marker_outline_color", opt = "paretoMarkerOutlineColor", bool = FALSE, default = "#ffffff"),
    list(arg = "pareto_marker_outline_width", opt = "paretoMarkerOutlineWidth", bool = FALSE, default = 1),
    list(arg = "pareto_axis_color", opt = "paretoAxisColor", bool = FALSE, default = ""),
    list(arg = "pareto_axis_thickness", opt = "paretoAxisThickness", bool = FALSE, default = -1),
    list(arg = "pareto_axis_style", opt = "paretoAxisStyle", bool = FALSE, default = ""),
    list(arg = "pareto_tick_color", opt = "paretoTickColor", bool = FALSE, default = ""),
    list(arg = "pareto_tick_length", opt = "paretoTickLength", bool = FALSE, default = -1),
    list(arg = "pareto_tick_thickness", opt = "paretoTickThickness", bool = FALSE, default = -1),
    list(arg = "pareto_tick_direction", opt = "paretoTickDirection", bool = FALSE, default = ""),
    list(arg = "pareto_tick_step", opt = "paretoTickStep", bool = FALSE, default = 20),
    list(arg = "pareto_tick_label_color", opt = "paretoTickLabelColor", bool = FALSE, default = ""),
    list(arg = "pareto_tick_label_size", opt = "paretoTickLabelSize", bool = FALSE, default = -1),
    list(arg = "facet_strip_show", opt = "facetStripShow", bool = TRUE, default = TRUE),
    list(arg = "facet_strip_underline", opt = "facetStripUnderline", bool = TRUE, default = TRUE),
    list(arg = "facet_border", opt = "facetBorder", bool = TRUE, default = FALSE),
    list(arg = "facet_drop_empty", opt = "facetDropEmpty", bool = TRUE, default = FALSE),
    list(arg = "facet_free_y", opt = "facetFreeY", bool = TRUE, default = FALSE),
    list(arg = "x_tick_label_wrap", opt = "xTickLabelWrap", bool = TRUE, default = FALSE),
    list(arg = "y_min_override", opt = "yMinOverride", bool = TRUE, default = FALSE),
    list(arg = "y_axis_break", opt = "yAxisBreak", bool = TRUE, default = TRUE),
    list(arg = "x_axis_break", opt = "xAxisBreak", bool = TRUE, default = TRUE),
    list(arg = "y_max_override", opt = "yMaxOverride", bool = TRUE, default = FALSE),
    list(arg = "y_interval_override", opt = "yIntervalOverride", bool = TRUE, default = FALSE),
    list(arg = "legend_layout_custom", opt = "legendLayoutCustom", bool = TRUE, default = FALSE),
    list(arg = "chart_grid_minor_enabled", opt = "chartGridMinorEnabled", bool = TRUE, default = FALSE),
    list(arg = "chart_aspect_lock", opt = "chartAspectLock", bool = TRUE, default = FALSE),
    list(arg = "chart_snap_to_grid", opt = "chartSnapToGrid", bool = TRUE, default = FALSE),
    list(arg = "chart_align_guides", opt = "chartAlignGuides", bool = TRUE, default = TRUE),
    list(arg = "error_bar_color_match", opt = "errorBarColorMatch", bool = TRUE, default = FALSE),
    list(arg = "y_minor_ticks", opt = "yMinorTicks", bool = TRUE, default = FALSE),
    list(arg = "x_minor_ticks", opt = "xMinorTicks", bool = TRUE, default = FALSE),
    list(arg = "bar_value_labels", opt = "barValueLabels", bool = TRUE, default = FALSE),
    list(arg = "bar_n_labels", opt = "barNLabels", bool = TRUE, default = FALSE),
    list(arg = "freq_show_chisq", opt = "freqShowChisq", bool = TRUE, default = FALSE),
    list(arg = "freq_chisq_plate", opt = "freqChisqPlate", bool = TRUE, default = TRUE),
    list(arg = "pareto_show_markers", opt = "paretoShowMarkers", bool = TRUE, default = TRUE)
)

freqplotbuilderClass <- if (requireNamespace('jmvcore', quietly = TRUE)) R6::R6Class(
    "freqplotbuilderClass",
    inherit = freqplotbuilderBase,
    private = list(
        # Aggregation cache: the bars list keyed by (plotted columns +
        # payload shape), identical()-compared so style-only commits skip
        # the counting pass. See .run().
        .aggCache = NULL,
        .init = function() {
            gb2_init_script_src(self$results$widget)
        },
        .run = function() {
            # Wall-clock at run entry: feeds the debug overlay's "R
            # prelude" line + run-entry->paint gap (speed pass Phase 0).
            run_t0 <- as.numeric(Sys.time())
            # Drain any pending export request first so a failure surfaces
            # in the export status box before the main render.
            private$.processExportRequest()

            data <- self$data
            catvar <- self$options$var
            groupVar <- self$options$groupVar
            facetVar <- self$options$facetVar
            gtype <- self$options$graphType
            freq_stat <- self$options$freqStat
            freq_position <- self$options$freqPosition

            is_pie <- gtype %in% c("pie", "donut")
            is_pareto <- identical(gtype, "pareto")
            # pie / donut pool across BOTH roles. pareto pools across
            # group (a single ranked series + one cumulative line) but
            # supports Facet By: small multiples, each panel independently
            # ranked with its own cumulative line. Whatever stays pooled
            # gets the footnote below; the bars channel always carries
            # every count.
            has_group <- !gb_family_is_missing(groupVar)
            has_facet <- !gb_family_is_missing(facetVar)
            use_group <- has_group && !is_pie && !is_pareto
            use_facet <- has_facet && !is_pie

            if (is.null(data) || nrow(data) == 0 ||
                gb_family_is_missing(catvar)) {
                # No chart -> any persisted snapshot is stale; hide the
                # native static copy alongside the message.
                tryCatch(self$results$snapshotImage$setVisible(FALSE),
                         error = function(e) NULL)
                self$results$widget$setContent(gb2_engine_placeholder_html(
                    private$.placeholder(), self$options$clientBundleHash,
                    script_src_ready = TRUE))
                return()
            }

            df <- data
            df[[catvar]] <- as.factor(df[[catvar]])
            if (use_group)
                df[[groupVar]] <- as.factor(df[[groupVar]])
            if (use_facet)
                df[[facetVar]] <- as.factor(df[[facetVar]])
            # A row only counts when every consumed role is observed -
            # NA in the counted variable (or in an active group / facet
            # split) has no cell to land in.
            keep <- !is.na(df[[catvar]])
            if (use_group) keep <- keep & !is.na(df[[groupVar]])
            if (use_facet) keep <- keep & !is.na(df[[facetVar]])
            missing_note <- if (sum(!keep) > 0)
                sprintf("%d of %d cases not shown (missing values)",
                        sum(!keep), length(keep)) else ""
            df <- df[keep, , drop = FALSE]

            if (nrow(df) == 0) {
                # No chart -> any persisted snapshot is stale; hide the
                # native static copy alongside the message.
                tryCatch(self$results$snapshotImage$setVisible(FALSE),
                         error = function(e) NULL)
                self$results$widget$setContent(private$.placeholder(paste0(
                    '<strong>', htmltools::htmlEscape(catvar), '</strong> has no ',
                    'usable (non-missing) rows to count.'
                )))
                return()
            }

            cat_levels <- levels(droplevels(df[[catvar]]))
            group_levels <- if (use_group) levels(droplevels(df[[groupVar]])) else NULL
            facet_levels <- if (use_facet) levels(droplevels(df[[facetVar]])) else NULL

            # Facet synthesis mirrors the sibling modules: with faceting,
            # every category slot is repeated per facet level and x is
            # synthesized "<facet> ¦ <cat>"; the widget detects the
            # separator, strips it from tick labels, gaps facet blocks and
            # draws a strip per block.
            FACET_SEP <- " ¦ "
            mk_x <- function(facet_lvl, cat) {
                if (use_facet) paste0(facet_lvl, FACET_SEP, cat) else cat
            }

            # ---- Aggregation cache: the bars derive only from the
            # consumed columns + the payload SHAPE (bar / pie / pareto lay
            # the same counts out differently - pie swaps the category
            # into the group field). freqStat / freqPosition are widget-
            # side transforms and deliberately NOT in the signature.
            shape <- if (is_pie) "pie" else if (is_pareto) "pareto" else "bar"
            agg_sig <- list(
                vars = c(catvar,
                         if (use_group) groupVar else "",
                         if (use_facet) facetVar else ""),
                v = df[[catvar]],
                g = if (use_group) df[[groupVar]] else NULL,
                f = if (use_facet) df[[facetVar]] else NULL,
                opts = shape
            )
            if (!is.null(private$.aggCache)
                && identical(private$.aggCache$sig, agg_sig)) {
                bars <- private$.aggCache$bars
                tests <- private$.aggCache$tests
            } else {
            bars <- list()
            fl_iter <- if (use_facet) facet_levels else list(NA)
            for (fl in fl_iter) {
                facet_mask <- if (use_facet) df[[facetVar]] == fl
                              else rep(TRUE, nrow(df))
                for (cl in cat_levels) {
                    cat_mask <- df[[catvar]] == cl
                    gl_iter <- if (use_group) group_levels else list(NA)
                    for (gl in gl_iter) {
                        grp_mask <- if (use_group) df[[groupVar]] == gl
                                    else rep(TRUE, nrow(df))
                        n <- sum(facet_mask & cat_mask & grp_mask)
                        if (n == 0)
                            next
                        entry <- if (is_pie) list(
                            # Slices ride the GROUP machinery: colorFor,
                            # legend rows, per-group styles, renames.
                            x = "",
                            group = cl,
                            mean = n, se = 0, n = n,
                            values = I(numeric(0))
                        ) else list(
                            x = mk_x(fl, cl),
                            group = if (use_group) gl else NULL,
                            facet = if (use_facet) fl else NULL,
                            mean = n, se = 0, n = n,
                            values = I(numeric(0))
                        )
                        bars[[length(bars) + 1L]] <- entry
                    }
                }
            }

            # Chi-square test entries (the freqShowChisq annotation +
            # summary-table note) derive from the SAME counts as the
            # bars, so they live in the cache bundle beside them: the
            # signature above (columns + shape) already pins everything
            # they depend on (use_group / use_facet fold into g / f /
            # shape). Computed even while the option is off, so turning
            # the readout on is a pure widget-side (draw-time) toggle.
            tests <- private$.computeChisqTests(bars, is_pie, use_group,
                                                use_facet, FACET_SEP)

            }
            private$.aggCache <- list(sig = agg_sig, bars = bars,
                                      tests = tests)

            # ---- Post-cache derivations (defined on BOTH branches via
            # `bars`): category totals drive the pareto sort.
            cat_totals <- vapply(cat_levels, function(cl) {
                tot <- 0
                for (b in bars) {
                    key <- if (is_pie) b$group else b$x
                    if (is_pie) {
                        if (identical(key, cl)) tot <- tot + b$n
                    } else {
                        # strip any facet prefix back off
                        bare <- if (use_facet) sub(paste0("^.*", FACET_SEP), "", key) else key
                        if (identical(bare, cl)) tot <- tot + b$n
                    }
                }
                tot
            }, numeric(1))

            x_categories <- if (is_pie) {
                ""
            } else if (is_pareto && use_facet) {
                # Faceted pareto: each panel is independently ranked, so
                # sort that facet's categories by ITS OWN counts (desc).
                unlist(lapply(facet_levels, function(fl) {
                    ftot <- vapply(cat_levels, function(cl) {
                        tot <- 0
                        for (b in bars) {
                            if (identical(b$facet, fl)) {
                                bare <- sub(paste0("^.*", FACET_SEP), "", b$x)
                                if (identical(bare, cl)) tot <- tot + b$n
                            }
                        }
                        tot
                    }, numeric(1))
                    vapply(cat_levels[order(-ftot)],
                           function(cl) mk_x(fl, cl), character(1))
                }))
            } else if (is_pareto) {
                cat_levels[order(-cat_totals)]
            } else if (use_facet) {
                unlist(lapply(facet_levels, function(fl)
                    vapply(cat_levels, function(cl) mk_x(fl, cl), character(1))))
            } else {
                cat_levels
            }
            facet_sep_out <- if (use_facet) FACET_SEP else ""

            # Pooling footnote for the single-panel types (drawn as a
            # small caption by the widget): never silently ignore an
            # assigned role.
            # A role is "pooled" only when assigned but NOT consumed
            # (pareto now consumes Facet By, so it's no longer pooled).
            pooled <- character(0)
            if (has_group && !use_group) pooled <- c(pooled, groupVar)
            if (has_facet && !use_facet) pooled <- c(pooled, facetVar)
            freq_pooled_note <- if (length(pooled))
                paste0("Pooled across ", paste(pooled, collapse = " and ")) else ""

            # Axis-label defaults: categories on X, the counted statistic
            # on Y. 100% stacking always reads as percent regardless of
            # freqStat; pie / donut draw no axes at all.
            stat_label <- switch(freq_stat,
                                 "percent" = "Percent",
                                 "proportion" = "Proportion",
                                 "Count")
            default_x <- if (is_pie) "" else catvar
            default_y <- if (is_pie) "" else if (identical(gtype, "bar")
                && use_group && identical(freq_position, "fill")) "Percent" else stat_label

            # chartSpec migration: parse the blob; axis titles are spec
            # options, so re-source the override flag + text from `spec`.
            spec <- gb_parse_spec(self$options$chartSpec)

            x_title <- if (isTRUE(spec$xTitleOverride))
                (spec$xTitle %||% "") else default_x
            y_title <- if (isTRUE(spec$yTitleOverride))
                (spec$yTitle %||% "") else default_y
            group_title <- if (is_pie) {
                if (isTRUE(spec$groupTitleOverride))
                    (spec$groupTitle %||% "") else catvar
            } else if (use_group) {
                if (isTRUE(spec$groupTitleOverride))
                    (spec$groupTitle %||% "") else groupVar
            } else {
                ""
            }

            spec_real_keys <- list(
                "data", "var", "groupVar", "facetVar", "freqStat", "freqPosition",
                "graphType", "summaryFunc", "errorBarType", "showDataPoints",
                "exportRequest", "exportPath", "clientBundleHash",
                "paletteLibrary", "styleLibrary", "styleStamp",
                "annotationsJson", "chartSnapshot", "chartSpec"
            )
            spec_keys <- vapply(.freqplotbuilderSpecTable, function(r) r$opt,
                                character(1))

            fixed_args <- list(
                # Static-snapshot fallback: raw pass-through of the JS-committed
                # "<sig>|<svg>"; widget.R sanitizes + embeds (never in the payload).
                chart_snapshot = self$options$chartSnapshot,
                script_src_ready = TRUE,
                bars = bars,
                graph_type = gtype,
                graph_type_choices = list( list(name = "bar", label = "Bar"), list(name = "pie", label = "Pie"), list(name = "donut", label = "Donut"), list(name = "pareto", label = "Pareto") ),
                graph_type_instant = FALSE,
                x_label = x_title,
                y_label = y_title,
                group_label = group_title,
                x_label_default = default_x,
                y_label_default = default_y,
                group_label_default = if (is_pie) catvar else if (use_group) groupVar else "",
                x_categories = x_categories,
                group_categories = if (is_pie) cat_levels else group_levels,
                facet_separator = facet_sep_out,
                facet_levels = facet_levels,
                facet_label = if (use_facet) facetVar else "",
                palette_action = self$options$paletteLibrary,
                client_bundle_hash = self$options$clientBundleHash,
                run_t0 = run_t0,
                style_action = self$options$styleLibrary,
                style_stamp = self$options$styleStamp,
                missing_note = missing_note,
                annotations = gb_resolve_annotations(self$options$annotationsJson, list()),
                freq_mode = TRUE,
                freq_stat = freq_stat,
                freq_position = freq_position,
                freq_pooled_note = freq_pooled_note,
                freq_tests = tests,
                chart_spec = self$options$chartSpec,
                spec_real_keys = spec_real_keys,
                spec_keys = spec_keys,
                auto_p_correction_default =
                    gb_spec_default(.freqplotbuilderSpecTable, "autoPCorrection")
            )
            spec_args <- gb_spec_args(spec, .freqplotbuilderSpecTable)

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
                    'Drag a categorical variable into <strong>Variable</strong> to ',
                    'count its categories. Optionally drop a second categorical ',
                    'variable into <strong>Group By</strong> for dodged / stacked ',
                    'bars, or into <strong>Panels</strong> to panel the chart.'
                )
            }
            paste0(
                '<div style="font-family:sans-serif;color:#666;padding:12px;font-size:13px;">',
                body,
                '</div>'
            )
        },

        # --- Chi-square tests (freqShowChisq annotation) -------------------
        # Computed from the SAME bars list the chart draws (the summary-
        # table fidelity rule), per CONSUMED facet: an uncorrected Pearson
        # test of independence on var x group when a group is consumed and
        # >= 2 group levels carry data in that facet, else a goodness-of-
        # fit test against EQUAL proportions on the (pooled-over-group)
        # category counts. Pie / donut pool both roles -> one pooled GOF;
        # pareto consumes facets -> per-facet GOF. Hidden bars are NOT
        # excluded (statistics reflect the data, like the summary table).
        # Hand-rolled observed/expected sums + stats::pchisq match
        # chisq.test(correct = FALSE) / chisq.test(counts) exactly while
        # skipping their small-expected-count warning noise (the widget's
        # Check-graph lint surfaces that caution instead, via minExp).
        # Empty levels drop per facet for free (bars only exist for n > 0
        # cells); k < 2 categories -> no entry for that facet.
        .computeChisqTests = function(bars, is_pie, use_group, use_facet,
                                      facet_sep) {
            tests <- list()
            # Bars -> {facet, cat, grp, n}. Pie / donut carry the category
            # in the GROUP field (x = ""); bar / pareto carry it in x with
            # any facet prefix, which strips back off via the shipped
            # facet (the .populateSummaryTable idiom).
            entries <- lapply(bars, function(b) {
                facet_lbl <- if (use_facet && !is.null(b$facet))
                    as.character(b$facet) else ""
                cat_lbl <- if (is_pie) as.character(b$group)
                           else as.character(b$x)
                if (nzchar(facet_lbl)) {
                    pre <- paste0(facet_lbl, facet_sep)
                    if (startsWith(cat_lbl, pre))
                        cat_lbl <- substring(cat_lbl, nchar(pre) + 1L)
                }
                grp_lbl <- if (use_group && !is.null(b$group))
                    as.character(b$group) else ""
                list(facet = facet_lbl, cat = cat_lbl, grp = grp_lbl,
                     n = as.numeric(b$n))
            })
            facet_keys <- unique(vapply(entries, function(e) e$facet,
                                        character(1)))
            for (fl in facet_keys) {
                sub_e <- Filter(function(e) identical(e$facet, fl), entries)
                cats <- unique(vapply(sub_e, function(e) e$cat, character(1)))
                grps <- unique(vapply(sub_e, function(e) e$grp, character(1)))
                obs <- matrix(0, nrow = length(cats), ncol = length(grps),
                              dimnames = list(cats, grps))
                # Integer indices via match(): a character subscript of ""
                # (the ungrouped column label) matches NOTHING by R rule.
                for (e in sub_e) {
                    ri <- match(e$cat, cats)
                    ci <- match(e$grp, grps)
                    obs[ri, ci] <- obs[ri, ci] + e$n
                }
                n <- sum(obs)
                if (n <= 0) next
                # Defensive droplevels-equivalent (a bars-built table can't
                # actually carry an all-zero row/column, but keep df honest).
                obs <- obs[rowSums(obs) > 0, colSums(obs) > 0, drop = FALSE]
                row_tot <- rowSums(obs)
                col_tot <- colSums(obs)
                r <- nrow(obs)
                cc <- ncol(obs)
                if (use_group && cc >= 2L && r >= 2L) {
                    # Test of independence (uncorrected Pearson).
                    expd <- outer(row_tot, col_tot) / n
                    chisq <- sum((obs - expd)^2 / expd)
                    df <- (r - 1L) * (cc - 1L)
                    # Adjusted standardized residuals (Haberman), matching
                    # chisq.test()$stdres exactly: WHICH cells drive a
                    # significant result. Shipped per cell for the summary
                    # table's Std. residual column and the readout hover's
                    # "biggest departure" line.
                    sres <- (obs - expd) /
                        sqrt(expd * outer(1 - row_tot / n, 1 - col_tot / n))
                    cells <- list()
                    for (ri in seq_len(r)) for (cj in seq_len(cc))
                        cells[[length(cells) + 1L]] <- list(
                            cat = rownames(obs)[ri],
                            grp = colnames(obs)[cj],
                            stdres = as.numeric(sres[ri, cj]))
                    tests[[length(tests) + 1L]] <- list(
                        facet = fl, type = "independence",
                        chisq = as.numeric(chisq), df = as.integer(df),
                        p = as.numeric(stats::pchisq(chisq, df,
                                                     lower.tail = FALSE)),
                        n = as.integer(round(n)),
                        es = as.numeric(sqrt(chisq /
                                             (n * min(r - 1L, cc - 1L)))),
                        esLabel = "V",
                        minExp = as.numeric(min(expd)),
                        cells = cells,
                        r = as.integer(r), c = as.integer(cc)
                    )
                } else {
                    # Goodness of fit vs equal proportions on the pooled
                    # category counts. Also the fallback when a consumed
                    # group has < 2 levels with data in this facet.
                    k <- length(row_tot)
                    if (k < 2L) next
                    expd <- n / k
                    chisq <- sum((row_tot - expd)^2 / expd)
                    df <- k - 1L
                    # GOF stdres matches chisq.test()$stdres under equal
                    # proportions: (obs - exp) / sqrt(exp * (1 - 1/k)).
                    sres <- (row_tot - expd) / sqrt(expd * (1 - 1 / k))
                    cells <- list()
                    for (ri in seq_along(row_tot))
                        cells[[length(cells) + 1L]] <- list(
                            cat = names(row_tot)[ri], grp = "",
                            stdres = as.numeric(sres[[ri]]))
                    tests[[length(tests) + 1L]] <- list(
                        facet = fl, type = "gof",
                        chisq = as.numeric(chisq), df = as.integer(df),
                        p = as.numeric(stats::pchisq(chisq, df,
                                                     lower.tail = FALSE)),
                        n = as.integer(round(n)),
                        es = as.numeric(sqrt(chisq / n)),
                        esLabel = "w",
                        minExp = as.numeric(expd),
                        cells = cells,
                        k = as.integer(k)
                    )
                }
            }
            tests
        },

        # One APA line per test, facet-prefixed, "; "-joined, led by the
        # test name - the same wording the on-chart plate draws (the JS
        # keeps its source ASCII; here \u escapes render the real glyphs).
        # Mixed types (a facet fell back to GOF) label each block.
        .chisqNote = function(tests) {
            if (length(tests) == 0) return(NULL)
            apa <- function(t) {
                fmt2 <- function(v) formatC(as.numeric(v), format = "f",
                                            digits = 2)
                strip0 <- function(s) sub("^(-?)0\\.", "\\1.", s)
                p <- as.numeric(t$p)
                p_txt <- if (!is.finite(p)) "p = NA"
                         else if (p < 0.001) "p < .001"
                         else paste0("p = ", strip0(formatC(p, format = "f",
                                                            digits = 3)))
                paste0("\u03c7\u00b2(", t$df, ", N = ", t$n, ") = ",
                       fmt2(t$chisq), ", ", p_txt, ", ", t$esLabel, " = ",
                       strip0(fmt2(t$es)))
            }
            lab <- function(type) if (identical(type, "independence"))
                "Chi-square test of independence" else
                "Goodness-of-fit test (equal proportions)"
            line <- function(t) paste0(
                if (nzchar(t$facet)) paste0(t$facet, ": ") else "", apa(t))
            types <- unique(vapply(tests, function(t) as.character(t$type),
                                   character(1)))
            if (length(types) == 1L) {
                paste0(lab(types[[1L]]), ": ",
                       paste(vapply(tests, line, character(1)),
                             collapse = "; "))
            } else {
                blocks <- vapply(types, function(ty) {
                    sel <- Filter(function(t)
                        identical(as.character(t$type), ty), tests)
                    paste0(lab(ty), ": ",
                           paste(vapply(sel, line, character(1)),
                                 collapse = "; "))
                }, character(1))
                paste(blocks, collapse = ". ")
            }
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
            file.path(tempdir(), "freqplotbuilder_lastExportId.txt")
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
