# Plot Builder (POC) - between-subjects bar mockup powered by the
# graphbuilder2.js htmlwidget bundled at inst/widget/graphbuilder2.js.
# Aggregates data into per-cell mean/SE bars on the R side and hands them
# off to the htmlwidget for rendering. The widget owns interaction
# (drag-to-resize, axis editing, etc); R only handles the data prep.

# Auto-generated spec table for plotbuilder (chartSpec migration).
# Each row: list(arg = <snake graphbuilder2_html arg>,
#                 opt = <camelCase former option>,
#                 bool = <TRUE if the call wrapped it in isTRUE()>,
#                 default = <the former a.yaml default>).
# gb_spec_args() reads spec[[opt]] %||% default, applies isTRUE when bool.
.plotbuilderSpecTable <- list(
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
    list(arg = "group_borders", opt = "groupBorders", bool = FALSE, default = list()),
    list(arg = "group_opacities", opt = "groupOpacities", bool = FALSE, default = list()),
    list(arg = "group_corner_radii", opt = "groupCornerRadii", bool = FALSE, default = list()),
    list(arg = "group_error_bars", opt = "groupErrorBars", bool = FALSE, default = list()),
    list(arg = "category_styles", opt = "categoryStyles", bool = FALSE, default = list()),
    list(arg = "group_box_whiskers", opt = "groupBoxWhiskers", bool = FALSE, default = list()),
    list(arg = "group_data_points", opt = "groupDataPoints", bool = FALSE, default = list()),
    list(arg = "group_box_medians", opt = "groupBoxMedians", bool = FALSE, default = list()),
    list(arg = "group_box_outliers", opt = "groupBoxOutliers", bool = FALSE, default = list()),
    list(arg = "group_violin_density", opt = "groupViolinDensity", bool = FALSE, default = list()),
    list(arg = "group_violin_inner_box", opt = "groupViolinInnerBox", bool = FALSE, default = list()),
    list(arg = "group_violin_whiskers", opt = "groupViolinWhiskers", bool = FALSE, default = list()),
    list(arg = "group_violin_medians", opt = "groupViolinMedians", bool = FALSE, default = list()),
    list(arg = "bar_pattern", opt = "barPattern", bool = FALSE, default = ""),
    list(arg = "bar_pattern_density", opt = "barPatternDensity", bool = FALSE, default = 1),
    list(arg = "bar_pattern_angle", opt = "barPatternAngle", bool = FALSE, default = 45),
    list(arg = "bar_pattern_thickness", opt = "barPatternThickness", bool = FALSE, default = 1),
    list(arg = "bar_pattern_color", opt = "barPatternColor", bool = FALSE, default = ""),
    list(arg = "error_bar_direction", opt = "errorBarDirection", bool = FALSE, default = "both"),
    list(arg = "error_bar_color", opt = "errorBarColor", bool = FALSE, default = "#000000"),
    list(arg = "error_bar_thickness", opt = "errorBarThickness", bool = FALSE, default = 1.4),
    list(arg = "error_bar_cap_size", opt = "errorBarCapSize", bool = FALSE, default = 10),
    list(arg = "error_bar_cap_size_line", opt = "errorBarCapSizeLine", bool = FALSE, default = 10),
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
    list(arg = "box_whisker_color", opt = "boxWhiskerColor", bool = FALSE, default = "#222222"),
    list(arg = "box_whisker_width", opt = "boxWhiskerWidth", bool = FALSE, default = 1.5),
    list(arg = "box_whisker_style", opt = "boxWhiskerStyle", bool = FALSE, default = "solid"),
    list(arg = "box_whisker_cap_frac", opt = "boxWhiskerCapFrac", bool = FALSE, default = 0.5),
    list(arg = "box_whisker_opacity", opt = "boxWhiskerOpacity", bool = FALSE, default = 1),
    list(arg = "box_median_color", opt = "boxMedianColor", bool = FALSE, default = "#222222"),
    list(arg = "box_median_width", opt = "boxMedianWidth", bool = FALSE, default = 2),
    list(arg = "box_median_style", opt = "boxMedianStyle", bool = FALSE, default = "solid"),
    list(arg = "box_median_opacity", opt = "boxMedianOpacity", bool = FALSE, default = 1),
    list(arg = "box_outlier_shape", opt = "boxOutlierShape", bool = FALSE, default = "circle"),
    list(arg = "box_outlier_size", opt = "boxOutlierSize", bool = FALSE, default = 3),
    list(arg = "box_outlier_color", opt = "boxOutlierColor", bool = FALSE, default = ""),
    list(arg = "box_outlier_outline_color", opt = "boxOutlierOutlineColor", bool = FALSE, default = "#000000"),
    list(arg = "box_outlier_outline_width", opt = "boxOutlierOutlineWidth", bool = FALSE, default = 0),
    list(arg = "box_outlier_opacity", opt = "boxOutlierOpacity", bool = FALSE, default = 0.85),
    list(arg = "box_outlier_ring_color", opt = "boxOutlierRingColor", bool = FALSE, default = ""),
    list(arg = "box_outlier_ring_size", opt = "boxOutlierRingSize", bool = FALSE, default = 1),
    list(arg = "box_outlier_ring_width", opt = "boxOutlierRingWidth", bool = FALSE, default = 1.6),
    list(arg = "violin_bandwidth", opt = "violinBandwidth", bool = FALSE, default = 1),
    list(arg = "violin_scale", opt = "violinScale", bool = FALSE, default = "area"),
    list(arg = "violin_side", opt = "violinSide", bool = FALSE, default = "both"),
    list(arg = "violin_box_width_frac", opt = "violinBoxWidthFrac", bool = FALSE, default = 0.12),
    list(arg = "violin_box_color", opt = "violinBoxColor", bool = FALSE, default = "#222222"),
    list(arg = "violin_box_opacity", opt = "violinBoxOpacity", bool = FALSE, default = 1),
    list(arg = "violin_whisker_color", opt = "violinWhiskerColor", bool = FALSE, default = "#222222"),
    list(arg = "violin_whisker_width", opt = "violinWhiskerWidth", bool = FALSE, default = 1.5),
    list(arg = "violin_whisker_opacity", opt = "violinWhiskerOpacity", bool = FALSE, default = 1),
    list(arg = "violin_whisker_style", opt = "violinWhiskerStyle", bool = FALSE, default = "solid"),
    list(arg = "violin_median_color", opt = "violinMedianColor", bool = FALSE, default = "#ffffff"),
    list(arg = "violin_median_size", opt = "violinMedianSize", bool = FALSE, default = 4),
    list(arg = "rain_side", opt = "rainSide", bool = FALSE, default = "right"),
    list(arg = "line_width", opt = "lineWidth", bool = FALSE, default = 2),
    list(arg = "line_style", opt = "lineStyle", bool = FALSE, default = "solid"),
    list(arg = "line_opacity", opt = "lineOpacity", bool = FALSE, default = 1),
    list(arg = "line_marker_spread", opt = "lineMarkerSpread", bool = FALSE, default = 0.35),
    list(arg = "line_point_size", opt = "linePointSize", bool = FALSE, default = -1),
    list(arg = "line_point_shape", opt = "linePointShape", bool = FALSE, default = "circle"),
    list(arg = "line_point_outline_width", opt = "linePointOutlineWidth", bool = FALSE, default = 0),
    list(arg = "line_point_outline_color", opt = "linePointOutlineColor", bool = FALSE, default = "#000000"),
    list(arg = "line_point_color", opt = "linePointColor", bool = FALSE, default = ""),
    list(arg = "line_group_overrides", opt = "lineGroupOverrides", bool = FALSE, default = list()),
    list(arg = "point_scatter", opt = "pointScatter", bool = FALSE, default = "jitter"),
    list(arg = "point_shape", opt = "pointShape", bool = FALSE, default = "circle"),
    list(arg = "point_size", opt = "pointSize", bool = FALSE, default = 3),
    list(arg = "point_spread_width", opt = "pointSpreadWidth", bool = FALSE, default = 0.15),
    list(arg = "point_opacity", opt = "pointOpacity", bool = FALSE, default = 0.6),
    list(arg = "point_color", opt = "pointColor", bool = FALSE, default = ""),
    list(arg = "point_outline_width", opt = "pointOutlineWidth", bool = FALSE, default = 0.25),
    list(arg = "point_outline_color", opt = "pointOutlineColor", bool = FALSE, default = "#000000"),
    list(arg = "bar_outlier_method", opt = "barOutlierMethod", bool = FALSE, default = "iqr"),
    list(arg = "bar_outlier_iqr_k", opt = "barOutlierIqrK", bool = FALSE, default = 1.5),
    list(arg = "bar_outlier_sd_k", opt = "barOutlierSdK", bool = FALSE, default = 3),
    list(arg = "x_value_spacing", opt = "xValueSpacing", bool = TRUE, default = FALSE),
    list(arg = "bar_outlier_color", opt = "barOutlierColor", bool = FALSE, default = "#d62728"),
    list(arg = "bar_outlier_style", opt = "barOutlierStyle", bool = FALSE, default = "solid"),
    list(arg = "bar_outlier_dot_color", opt = "barOutlierDotColor", bool = FALSE, default = ""),
    list(arg = "bar_outlier_dot_shape", opt = "barOutlierDotShape", bool = FALSE, default = ""),
    list(arg = "bar_outlier_dot_size", opt = "barOutlierDotSize", bool = FALSE, default = -1),
    list(arg = "bar_outlier_dot_opacity", opt = "barOutlierDotOpacity", bool = FALSE, default = -1),
    list(arg = "bar_outlier_dot_outline_color", opt = "barOutlierDotOutlineColor", bool = FALSE, default = ""),
    list(arg = "bar_outlier_dot_outline_width", opt = "barOutlierDotOutlineWidth", bool = FALSE, default = -1),
    list(arg = "bar_outlier_size", opt = "barOutlierSize", bool = FALSE, default = 1),
    list(arg = "bar_outlier_width", opt = "barOutlierWidth", bool = FALSE, default = 1.6),
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
    list(arg = "box_show_outliers", opt = "boxShowOutliers", bool = TRUE, default = TRUE),
    list(arg = "violin_trim", opt = "violinTrim", bool = TRUE, default = TRUE),
    list(arg = "violin_show_box", opt = "violinShowBox", bool = TRUE, default = TRUE),
    list(arg = "violin_show_median", opt = "violinShowMedian", bool = TRUE, default = TRUE),
    list(arg = "line_smooth", opt = "lineSmooth", bool = TRUE, default = FALSE),
    list(arg = "line_connect_facets", opt = "lineConnectFacets", bool = TRUE, default = FALSE),
    list(arg = "show_line_points", opt = "showLinePoints", bool = TRUE, default = TRUE),
    list(arg = "line_color_match_marker", opt = "lineColorMatchMarker", bool = TRUE, default = TRUE),
    list(arg = "point_color_match", opt = "pointColorMatch", bool = TRUE, default = TRUE),
    list(arg = "bar_value_labels", opt = "barValueLabels", bool = TRUE, default = FALSE),
    list(arg = "bar_n_labels", opt = "barNLabels", bool = TRUE, default = FALSE),
    list(arg = "show_bar_outliers", opt = "showBarOutliers", bool = TRUE, default = FALSE),
    list(arg = "bar_outlier_label", opt = "barOutlierLabel", bool = TRUE, default = FALSE)
)

plotbuilderClass <- if (requireNamespace('jmvcore', quietly = TRUE)) R6::R6Class(
    "plotbuilderClass",
    inherit = plotbuilderBase,
    private = list(
        # Aggregation cache: the bars list keyed by (plotted columns +
        # data-shaping options), identical()-compared so style-only
        # commits skip the per-cell aggregation. See .run().
        .aggCache = NULL,
        # SCRIPT-SRC PROTOTYPE (GB2_SCRIPT_SRC=1, Jul 2026, pilot module):
        # serve the bundle from the module directory via the Html result's
        # scripts field instead of inlining it in the results content.
        # Set in .init() per Jonathon's guidance (Jul 2026 thread): the
        # INIT delivery already carries the scripts field, so the
        # resultsview element loads the JS while R computes and the
        # .run() payload arrives with the engine loaded and waiting.
        # The shared helper owns the package-relative path and raw-binding
        # compatibility details for all seven chart analyses.
        .init = function() {
            gb2_init_script_src(self$results$widget)
        },

        .run = function() {
            # Wall-clock at run entry: feeds the debug overlay's "R
            # prelude" line + run-entry->paint gap (speed pass Phase 0).
            run_t0 <- as.numeric(Sys.time())
            # If the widget has pushed a pending export request, drain it
            # first - jamovi's webview won't let JS save files locally,
            # so JS hands the rendered bytes to R via setOption and we
            # write them to disk here. We do this before the rest of the
            # render so a failure surfaces in the export status box.
            private$.processExportRequest()

            data <- self$data
            xvar <- self$options$xvar
            yvar <- self$options$yvar
            groupVar <- self$options$groupVar
            facetVar <- self$options$facetVar
            has_group <- !gb_family_is_missing(groupVar)
            has_facet <- !gb_family_is_missing(facetVar)
            error_type <- self$options$errorBarType
            summary_func <- self$options$summaryFunc

            if (is.null(data) || nrow(data) == 0 ||
                gb_family_is_missing(xvar) || gb_family_is_missing(yvar)) {
                # No chart -> any persisted snapshot is stale; hide the
                # native static copy alongside the message.
                tryCatch(self$results$snapshotImage$setVisible(FALSE),
                         error = function(e) NULL)
                # script-src mode needs no engine-boot ship - the bundle
                # rides the scripts field, so the placeholder is plain.
                self$results$widget$setContent(
                    gb2_engine_placeholder_html(
                        private$.placeholder(),
                        self$options$clientBundleHash,
                        script_src_ready = TRUE))
                return()
            }

            df <- data
            df[[xvar]] <- as.factor(df[[xvar]])
            if (has_group)
                df[[groupVar]] <- as.factor(df[[groupVar]])
            if (has_facet)
                df[[facetVar]] <- as.factor(df[[facetVar]])
            # Missing-data disclosure: a row is shown only when every
            # consumed role is observed (NA x/group/facet rows fall out
            # at aggregation even though only y is filtered here).
            n_rows_total <- nrow(df)
            complete_rows <- is.finite(df[[yvar]]) & !is.na(df[[xvar]])
            if (has_group) complete_rows <- complete_rows & !is.na(df[[groupVar]])
            if (has_facet) complete_rows <- complete_rows & !is.na(df[[facetVar]])
            n_rows_missing <- n_rows_total - sum(complete_rows)
            missing_note <- if (n_rows_missing > 0)
                sprintf("%d of %d cases not shown (missing values)",
                        n_rows_missing, n_rows_total) else ""
            df <- df[is.finite(df[[yvar]]), , drop = FALSE]

            x_levels <- levels(droplevels(df[[xvar]]))
            group_levels <- if (has_group) levels(droplevels(df[[groupVar]])) else NULL
            facet_levels <- if (has_facet) levels(droplevels(df[[facetVar]])) else NULL
            # Synthesized category list. Without faceting, this is
            # just the original x_levels. With faceting, every
            # original cat appears once per facet level prefixed by
            # "<facet> | "; the widget detects the separator,
            # strips it from tick labels, drops extra slot gap at
            # the boundary, and draws a strip label above each
            # block of cats sharing a facet prefix.
            FACET_SEP <- " ¦ "
            mk_x <- function(facet_lvl, cat) {
                if (has_facet) paste0(facet_lvl, FACET_SEP, cat) else cat
            }
            synth_x_levels <- if (has_facet) {
                # facet x cat, ordered facet-major then cat-within
                unlist(lapply(facet_levels, function(fl) {
                    vapply(x_levels, function(xl) mk_x(fl, xl), character(1))
                }), use.names = FALSE)
            } else {
                x_levels
            }

            # Per-cell raw values are needed for several client-side
            # features:
            #   - Distribution graph types (box / violin / raincloud)
            #     compute quartiles / density bandwidths on these.
            #   - Show Data Points overlays them as scatter dots.
            #   - Significance-bracket auto-p computes t-tests etc.
            #     on the two anchored cells' values.
            # The values arrays are small (one number per row per
            # cell) and ship per chart only once, so always-include
            # is cheaper than re-running R every time a feature
            # toggles on.
            gtype <- self$options$graphType
            include_values <- TRUE

            # Summary statistic and error half-length per cell.
            cell_stat <- function(vals) {
                vals <- vals[is.finite(vals)]
                n <- length(vals)
                if (n == 0)
                    return(NULL)
                center <- if (identical(summary_func, "median")) stats::median(vals) else mean(vals)
                # Median charts draw no SE/SD/CI bars: those formulas
                # describe the MEAN's uncertainty, so drawing them around
                # a median would mislabel the bars (disclosed in the
                # Sigma panel's Descriptives footnote).
                if (n < 2 || identical(error_type, "none") ||
                    identical(summary_func, "median")) {
                    err <- 0
                } else {
                    sd_val <- stats::sd(vals)
                    se_val <- sd_val / sqrt(n)
                    err <- switch(
                        error_type,
                        "se" = se_val,
                        "sd" = sd_val,
                        "ci95" = se_val * stats::qt(0.975, n - 1),
                        "ci99" = se_val * stats::qt(0.995, n - 1),
                        # Comparison-adjusted (Goldstein & Healy 1995): the
                        # 95% half-width over root 2, so two bars just touch
                        # when the gap equals t * sqrt(se1^2 + se2^2) - the
                        # two-sample t boundary - the one reading rule
                        # students already try to apply to ordinary CIs,
                        # where it is simply wrong. Each cell uses its OWN
                        # df while the two-sample test pools df, and
                        # t(n-1) >= t(2n-2) always, so the drawn bars are
                        # never narrower than the exact boundary:
                        # non-overlap ALWAYS implies p < .05, while a
                        # borderline significant pair can still touch. That
                        # one-sided guarantee is what the panel copy claims.
                        "ci95c" = se_val * stats::qt(0.975, n - 1) * sqrt(2),
                        se_val
                    )
                }
                out <- list(center = center, err = err, n = n)
                # I() blocks jsonlite's auto_unbox from collapsing a 1-element
                # values vector to a JSON scalar (the JS reads series via
                # Array.isArray, so an unboxed value made n=1 cells invisible
                # to every values-driven geom). Same fix as distplotbuilder.
                if (include_values) out$values <- I(as.numeric(vals))
                out
            }

            # ---- Aggregation cache: bars derive only from the plotted
            # columns + these shaping options. Style-only commits (the
            # overwhelming majority of inspector round-trips) reuse the
            # cached list and skip the per-cell masks. identical() on
            # the raw columns makes any data edit invalidate exactly —
            # same pattern as xyplotbuilder's d2d KDE cache.
            agg_sig <- list(
                vars = c(xvar, yvar,
                         if (has_group) groupVar else "",
                         if (has_facet) facetVar else ""),
                x = df[[xvar]],
                y = df[[yvar]],
                g = if (has_group) df[[groupVar]] else NULL,
                f = if (has_facet) df[[facetVar]] else NULL,
                opts = c(error_type, summary_func)
            )
            if (!is.null(private$.aggCache)
                && identical(private$.aggCache$sig, agg_sig)) {
                bars <- private$.aggCache$bars
            } else {
            bars <- list()
            # Iterate facets at the outer loop so the synth x order
            # is facet-major. When has_facet is FALSE, the loop
            # collapses to one pass with facet filter == identity.
            fl_iter <- if (has_facet) facet_levels else list(NA)
            for (fl in fl_iter) {
                facet_mask <- if (has_facet) df[[facetVar]] == fl
                              else rep(TRUE, nrow(df))
                if (has_group) {
                    for (xl in x_levels) {
                        for (gl in group_levels) {
                            vals <- df[[yvar]][
                                facet_mask
                                & df[[xvar]] == xl
                                & df[[groupVar]] == gl]
                            st <- cell_stat(vals)
                            if (is.null(st))
                                next
                            entry <- list(
                                x = mk_x(fl, xl), group = gl,
                                mean = st$center, se = st$err, n = st$n
                            )
                            if (!is.null(st$values)) entry$values <- st$values
                            bars[[length(bars) + 1L]] <- entry
                        }
                    }
                } else {
                    for (xl in x_levels) {
                        vals <- df[[yvar]][facet_mask & df[[xvar]] == xl]
                        st <- cell_stat(vals)
                        if (is.null(st))
                            next
                        entry <- list(
                            x = mk_x(fl, xl), group = NULL,
                            mean = st$center, se = st$err, n = st$n
                        )
                        if (!is.null(st$values)) entry$values <- st$values
                        bars[[length(bars) + 1L]] <- entry
                    }
                }
            }

            }
            private$.aggCache <- list(sig = agg_sig, bars = bars)

            # chartSpec migration (speed pass Phase 2): the ~200 on-chart
            # style options are gone from a.yaml; their values live in the
            # single hidden `chartSpec` JSON option, exploded here into the
            # flat graphbuilder2_html() arg list. See R/spec_explode.R.
            spec <- gb_parse_spec(self$options$chartSpec)

            # Axis / legend titles were spec options (on-chart editable), so
            # read the override flag + text from the parsed spec.
            x_title <- if (isTRUE(spec$xTitleOverride)) (spec$xTitle %||% "") else xvar
            y_title <- if (isTRUE(spec$yTitleOverride)) (spec$yTitle %||% "") else yvar
            group_title <- if (has_group) {
                if (isTRUE(spec$groupTitleOverride)) (spec$groupTitle %||% "") else groupVar
            } else {
                ""
            }

            # Options that STAY first-class jamovi options (roles, native
            # Plot Setup, actions, the annotation + spec blobs). The JS
            # setOption wrapper routes every committed key NOT in this list
            # into the chartSpec blob instead of committing it directly.
            spec_real_keys <- list(
                "data", "xvar", "yvar", "groupVar", "facetVar",
                "graphType", "summaryFunc", "errorBarType", "showDataPoints",
                "exportRequest", "exportPath", "clientBundleHash",
                "paletteLibrary", "styleLibrary", "styleStamp",
                "annotationsJson", "chartSnapshot", "chartSpec"
            )
            # Allowlist of the keys the widget legitimately folds into the
            # chartSpec blob: the style-option names it routes (the spec
            # table) + the axis-title options b.R reads from the spec + the
            # two client-only persistence options (the hidden-points badge).
            # The JS filters the blob through this both when seeding its
            # specState and when exploding into data.*, so a crafted chartSpec
            # in a shared .omv cannot inject a NON-style key (e.g. "bars",
            # "annotations") that the explode would splat over a computed
            # payload field.
            spec_keys <- c(
                vapply(.plotbuilderSpecTable, function(r) r$opt, character(1)),
                "xTitle", "xTitleOverride", "yTitle", "yTitleOverride",
                "groupTitle", "groupTitleOverride",
                "hpBadgeLeft", "hpBadgeTop"
            )

            fixed_args <- list(
                # Static-snapshot fallback: raw pass-through of the JS-committed
                # "<sig>|<svg>"; widget.R sanitizes + embeds (never in the payload).
                chart_snapshot = self$options$chartSnapshot,
                script_src_ready = TRUE,
                bars = bars,
                # Ship the stat options so the client-side panel preview can
                # diff + recompute cells optimistically (graphbuilder2.js
                # _gb2StatFold mirrors cell_stat).
                summary_func = summary_func,
                error_bar_type = error_type,
                graph_type = self$options$graphType,
                # On-chart graph-type switcher glyph strip (name -> glyph).
                graph_type_choices = list(
                    list(name = "bar",       label = "Bar"),
                    list(name = "line",      label = "Line"),
                    list(name = "dot",       label = "Dot"),
                    list(name = "box",       label = "Box"),
                    list(name = "violin",    label = "Violin"),
                    list(name = "raincloud", label = "Raincloud")
                ),
                graph_type_instant = TRUE,
                x_label = x_title,
                y_label = y_title,
                group_label = group_title,
                x_label_default = xvar,
                y_label_default = yvar,
                group_label_default = if (has_group) groupVar else "",
                x_categories = synth_x_levels,
                group_categories = group_levels,
                facet_separator = if (has_facet) FACET_SEP else "",
                facet_levels = facet_levels,
                facet_label = if (has_facet) facetVar else "",
                palette_action = self$options$paletteLibrary,
                client_bundle_hash = self$options$clientBundleHash,
                run_t0 = run_t0,
                style_action = self$options$styleLibrary,
                style_stamp = self$options$styleStamp,
                missing_note = missing_note,
                annotations = gb_resolve_annotations(
                    self$options$annotationsJson, list()),
                show_data_points = isTRUE(self$options$showDataPoints),
                # Raw blob (JS seeds its specState from data.chartSpec) +
                # the real-key list (JS routing) - both additive payload keys.
                chart_spec = self$options$chartSpec,
                spec_real_keys = spec_real_keys,
                spec_keys = spec_keys
            )
            # Explode the ~200 style values from the parsed spec into their
            # snake_case graphbuilder2_html args (defaults from the table, so
            # a fresh chart renders identically to the pre-migration build).
            spec_args <- gb_spec_args(spec, .plotbuilderSpecTable)

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

        .placeholder = function() {
            paste0(
                '<div style="font-family:sans-serif;color:#666;padding:12px;font-size:13px;">',
                'Drag a categorical variable into <strong>X-Axis Variable</strong> ',
                'and a numeric variable into <strong>Y-Axis Variable</strong> to render. ',
                'Optionally drop a categorical variable into <strong>Group By</strong> for dodged bars, ',
                'or into <strong>Panels</strong> to draw one panel per level.',
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
        # The widget can't trigger downloads inside jamovi's webview, so
        # exports come back as base64 strings via the hidden exportRequest
        # option. We decode and write to disk here. The request payload
        # is JSON: { id, format, data (base64), filename } where `id` is
        # a monotonically increasing number used to deduplicate so
        # repeated re-runs don't re-write the same file.
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
            # Skip if we've already processed this request id. The id is
            # cached in tempdir so it survives jamovi recreating the
            # analysis instance between runs - that way changing an
            # unrelated option doesn't cause the file to be re-written.
            req_id <- parsed$id
            last_id <- private$.readLastExportId()
            if (!is.null(req_id) && identical(as.character(req_id), last_id)) {
                # Already processed; keep showing whatever we previously
                # set into the status box (don't clobber it).
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

            # Cross-platform user home:
            #   - Windows: USERPROFILE env var (e.g. C:/Users/<name>) -
            #     R's path.expand("~") on Windows can resolve to the
            #     user's Documents folder rather than the profile root,
            #     which breaks ~/Desktop and ~/Downloads.
            #   - macOS / Linux: HOME / path.expand("~").
            user_home <- if (.Platform$OS.type == "windows") {
                profile <- Sys.getenv("USERPROFILE")
                if (nzchar(profile)) profile else path.expand("~")
            } else {
                path.expand("~")
            }

            # Resolve target directory in priority order:
            #   1. parsed$destination alias from the JS panel ("desktop",
            #      "documents", "downloads") -> <user_home>/<alias>.
            #   2. self$options$exportPath if set.
            #   3. Default: ~/Downloads if it exists, else user home.
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
            # Disambiguate against existing files so we never overwrite.
            full_path <- private$.uniquePath(file.path(target_dir, base_name))
            write_ok <- tryCatch({
                if (identical(ext, "pdf")) {
                    # PDF: payload is the chart's SVG. Convert via rsvg
                    # which has librsvg as its underlying engine.
                    # Bundled with most jamovi distributions; fall
                    # through to a clear error if missing so the user
                    # knows what to install.
                    if (!requireNamespace("rsvg", quietly = TRUE)) {
                        stop(
                            "PDF export needs the 'rsvg' R package. ",
                            "Install it with install.packages('rsvg')."
                        )
                    }
                    raw_bytes <- jsonlite::base64_dec(parsed$data)
                    rsvg::rsvg_pdf(raw_bytes, file = full_path)
                } else {
                    # SVG / PNG / JPG ship as direct file bytes.
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

        # Find an unused filename next to `path` by appending " (n)".
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

        # Tracks the last export request id so a single click writes a
        # single file even when the analysis re-runs for unrelated reasons.
        # Using a tempdir file (one per R session) keeps the value alive
        # if jamovi recreates the analysis instance between runs.
        .exportIdFile = function() {
            file.path(tempdir(), "plotbuilder_lastExportId.txt")
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
