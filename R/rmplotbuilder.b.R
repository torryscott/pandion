# Repeated Measures builder. Mirrors plotbuilder.b.R but reads a
# vector of `measures` (one column per repeated measure) plus an
# optional between-subjects factor, instead of a single yvar / xvar
# pair. The output `bars` list keeps the same shape Compare Groups
# produces (x = measure-label, group = between-level-or-NULL), so
# the htmlwidget renders identically and every interactive feature
# carries over.

# Auto-generated chartSpec spec table (speed pass Phase 2). See CLAUDE.md convention 22.
.rmplotbuilderSpecTable <- list(
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
    list(arg = "connect_subjects_color", opt = "connectSubjectsColor", bool = FALSE, default = "#666666"),
    list(arg = "connect_subjects_width", opt = "connectSubjectsWidth", bool = FALSE, default = 1),
    list(arg = "connect_subjects_opacity", opt = "connectSubjectsOpacity", bool = FALSE, default = 0.4),
    list(arg = "connect_subjects_style", opt = "connectSubjectsStyle", bool = FALSE, default = "solid"),
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
    list(arg = "bar_outlier_color", opt = "barOutlierColor", bool = FALSE, default = "#d62728"),
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
    list(arg = "connect_subjects_color_match", opt = "connectSubjectsColorMatch", bool = TRUE, default = TRUE),
    list(arg = "point_color_match", opt = "pointColorMatch", bool = TRUE, default = TRUE),
    list(arg = "bar_value_labels", opt = "barValueLabels", bool = TRUE, default = FALSE),
    list(arg = "bar_n_labels", opt = "barNLabels", bool = TRUE, default = FALSE),
    list(arg = "show_bar_outliers", opt = "showBarOutliers", bool = TRUE, default = FALSE),
    list(arg = "bar_outlier_label", opt = "barOutlierLabel", bool = TRUE, default = FALSE)
)

rmplotbuilderClass <- if (requireNamespace('jmvcore', quietly = TRUE)) R6::R6Class(
    "rmplotbuilderClass",
    inherit = rmplotbuilderBase,
    private = list(
        # Aggregation cache: the bars list (incl. the Cousineau-Morey
        # corrected errors) keyed by (measure columns + grouping columns
        # + error/summary options), identical()-compared so style-only
        # commits skip the per-cell work. See .run().
        .aggCache = NULL,
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
            measures <- self$options$measures
            # chartSpec migration: parse the blob ONCE up front. Axis titles
            # (and other former options) are spec keys now, and the factorial
            # path reads them BEFORE the simple path's parse at line ~571, so
            # a single early parse serves both branches + .buildFactorial.
            spec <- gb_parse_spec(self$options$chartSpec)
            betweenVar <- self$options$betweenVar
            # Between-subjects factor(s): the plural `bs` box is the current
            # input; `betweenVar` (singular) is a tombstone read only when
            # `bs` is empty, so old saved files still color correctly.
            bs <- self$options$bs
            bs <- if (is.null(bs)) character(0) else as.character(bs)
            if (!is.null(data)) bs <- bs[bs %in% names(data)]
            between_cols <- if (length(bs)) bs
                            else if (!gb_family_is_missing(betweenVar)) betweenVar
                            else character(0)
            has_group <- !gb_family_is_missing(betweenVar)
            has_facet <- FALSE  # the simple (legacy) path never facets now
            error_type <- self$options$errorBarType
            # errorBarMethod: "within" applies the Cousineau-Morey
            # within-subjects correction (Morey, 2008), "between"
            # uses the same uncorrected SD/SE that Compare Groups
            # uses. Default is "within" — between-subjects error
            # bars on repeated-measures data overstate within-
            # subject variability because they include the between-
            # subjects variance that the design controls for.
            # `between` is kept as a fallback for users who want the
            # raw uncorrected dispersion (or who want their error
            # bars to match a between-subjects analysis run in
            # parallel).
            error_method <- self$options$errorBarMethod
            if (is.null(error_method) || !nzchar(error_method))
                error_method <- "within"
            summary_func <- self$options$summaryFunc

            # Factorial within design (advanced path) takes priority when
            # the RM factor/cell boxes are filled; otherwise the simple
            # `measures` box drives one within factor (today's path). The
            # factorial helper returns NULL when no design is defined.
            # The within factors are always CROSSED: the Cells box holds one
            # drop target per level COMBINATION, so any factor can go on the
            # X-axis / Grouped by / Panels (the on-chart pivot dropdowns) and
            # two within factors can share one chart (interaction plots). A
            # declared factor left off every slot is averaged over (marginal
            # means), disclosed in the figure note.
            fac <- if (is.null(data) || nrow(data) == 0) NULL
                   else tryCatch(private$.buildFactorial(data, between_cols,
                            error_method, error_type, summary_func),
                            error = function(e) NULL)
            factorial <- !is.null(fac)

            if (is.null(data) || nrow(data) == 0
                || (!factorial && (is.null(measures) || length(measures) == 0))) {
                # No chart -> any persisted snapshot is stale; hide the
                # native static copy alongside the message.
                tryCatch(self$results$snapshotImage$setVisible(FALSE),
                         error = function(e) NULL)
                self$results$widget$setContent(gb2_engine_placeholder_html(
                    private$.placeholder(), self$options$clientBundleHash,
                    script_src_ready = TRUE))
                return()
            }

            if (factorial) {
                bars           <- fac$bars
                synth_x_levels <- fac$synth_x_levels
                group_levels   <- fac$group_levels
                facet_levels   <- fac$facet_levels
                has_group      <- fac$has_group
                has_facet      <- fac$has_facet
                FACET_SEP      <- if (nzchar(fac$facet_sep)) fac$facet_sep else " ¦ "
                use_within     <- fac$use_within
                missing_note   <- fac$missing_note
                x_title        <- fac$x_title
                y_title        <- if (isTRUE(spec$yTitleOverride))
                                      (spec$yTitle %||% "") else ""
                group_title    <- fac$group_title
                x_label_default_v     <- fac$x_label_default
                group_label_default_v <- fac$group_label_default
                facet_label_v         <- fac$facet_label
                pivot_factors_v       <- fac$pivot_factors
                pivot_obs_v           <- fac$pivot_obs
                pivot_morey_v         <- fac$pivot_morey
                pivot_miss_base_v     <- fac$pivot_miss_base
            } else {
            # Drop any measure name that isn't actually a column in
            # the dataset (defensive — jamovi normally guarantees
            # this, but stale option state from a freshly-loaded
            # analysis can leave a stray reference behind).
            measures <- measures[measures %in% names(data)]
            if (length(measures) == 0) {
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
            # Stable global subject id (the source row number). Carried
            # into each cell so the significance-bracket PAIRED tests can
            # join two measure cells by SUBJECT rather than by array
            # position — the per-column is.finite() filter below collapses
            # each measure independently, which would otherwise silently
            # misalign pairs whenever subjects have NAs in different
            # measures. A constant column, so it never perturbs aggCache.
            df[[".__gb2_subjid__"]] <- seq_len(nrow(df))
            if (has_group)
                df[[betweenVar]] <- as.factor(df[[betweenVar]])
            if (has_facet)
                df[[facetVar]] <- as.factor(df[[facetVar]])

            # Missing-data disclosure: each occasion filters non-finite
            # values independently (a case is shown wherever it was
            # measured), so the note counts cases missing AT LEAST one
            # consumed value rather than claiming full exclusion.
            n_rows_total <- nrow(df)
            any_missing <- rep(FALSE, n_rows_total)
            for (m in measures)
                any_missing <- any_missing |
                    !is.finite(suppressWarnings(as.numeric(df[[m]])))
            if (has_group) any_missing <- any_missing | is.na(df[[betweenVar]])
            if (has_facet) any_missing <- any_missing | is.na(df[[facetVar]])
            n_rows_missing <- sum(any_missing)
            missing_note <- if (n_rows_missing > 0)
                sprintf("%d of %d cases are missing at least one value (shown where measured)",
                        n_rows_missing, n_rows_total) else ""

            # x_levels: one entry per repeated-measure column, in the
            # order the user dropped them. This becomes the X-axis
            # category order in the widget.
            x_levels <- as.character(measures)
            group_levels <- if (has_group)
                levels(droplevels(df[[betweenVar]]))
            else
                NULL
            facet_levels <- if (has_facet)
                levels(droplevels(df[[facetVar]]))
            else
                NULL
            # Same synth-x scheme Compare Groups uses for facets.
            # See plotbuilder.b.R for rationale.
            FACET_SEP <- " ¦ "
            mk_x <- function(facet_lvl, cat) {
                if (has_facet) paste0(facet_lvl, FACET_SEP, cat) else cat
            }
            synth_x_levels <- if (has_facet) {
                unlist(lapply(facet_levels, function(fl) {
                    vapply(x_levels, function(xl) mk_x(fl, xl), character(1))
                }), use.names = FALSE)
            } else {
                x_levels
            }

            # Per-cell raw values are needed client-side for:
            #   - Distribution graph types (box / violin / raincloud)
            #     to compute quartiles / density bandwidths.
            #   - Show Data Points scatter overlay.
            #   - Significance-bracket auto-p tests on anchored cells.
            # Always-include is cheap and avoids re-running R when a
            # downstream feature toggles on.
            gtype <- self$options$graphType
            include_values <- TRUE

            # Per-cell summary builder. A "cell" is one (facet,
            # between) combination — when neither factor exists it
            # collapses to the whole dataset; when only one is
            # present we iterate over that one. WITHIN each cell we
            # compute the subject × measure matrix once, then derive
            # both the centre statistic (mean / median from raw
            # values) AND the error half-length per measure column.
            #
            # When `error_method == "within"` we apply the
            # Cousineau-Morey correction (Morey, 2008):
            #   1. Compute each subject's row-mean across the
            #      measure columns (NAs ignored, lenient — partial
            #      observations still contribute).
            #   2. Compute the cell's grand-mean over all non-NA
            #      values.
            #   3. Normalize Y_ij' = Y_ij − Mi + GM. The subject-
            #      level component is removed; the cell's grand
            #      mean is preserved so the centre statistic is
            #      unchanged.
            #   4. Per measure column j, compute SD/SE/CI from the
            #      NORMALIZED values, then multiply by the Morey
            #      bias factor sqrt(k / (k − 1)) where k is the
            #      number of measures. The factor corrects for the
            #      variance shrinkage caused by step 3 (which
            #      removes the between-subjects component but also
            #      biases the within-subjects variance estimator
            #      down by (k − 1) / k).
            #
            # The centre statistic is always derived from RAW
            # values — Cousineau-Morey doesn't alter the mean.
            #
            # k == 1 (only one measure) → Morey factor undefined; we
            # silently fall back to the between-subjects formula.
            n_measures <- length(measures)
            use_within <- identical(error_method, "within") && n_measures >= 2
            morey_factor <- if (use_within) sqrt(n_measures / (n_measures - 1)) else 1

            stat_for_cell <- function(cell_df) {
                # cell_df: rows = subjects in this (facet × between)
                # cell, columns INCLUDE the measure columns. We
                # extract the measure submatrix as numeric.
                mat <- as.matrix(cell_df[, measures, drop = FALSE])
                storage.mode(mat) <- "double"
                # Subject ids aligned to mat rows — sliced per measure
                # alongside its finite values so the widget can pair by
                # subject (see the .__gb2_subjid__ note above).
                subj_ids <- cell_df[[".__gb2_subjid__"]]

                # Normalize subject-by-subject when in within mode.
                # apply NAs lenient: subject-mean uses each
                # subject's available values; subjects with at
                # least one observation contribute.
                if (use_within) {
                    subj_means <- rowMeans(mat, na.rm = TRUE)
                    grand_mean <- mean(mat, na.rm = TRUE)
                    if (!is.finite(grand_mean)) grand_mean <- 0
                    # Replace NaN subject-means (all-NA rows) with
                    # NA so subtraction propagates instead of
                    # producing junk values.
                    subj_means[!is.finite(subj_means)] <- NA_real_
                    mat_norm <- mat - subj_means + grand_mean
                } else {
                    mat_norm <- mat
                }

                lapply(seq_along(measures), function(j) {
                    raw_col <- mat[, j]
                    keep <- is.finite(raw_col)
                    raw_vals <- raw_col[keep]
                    row_ids <- subj_ids[keep]
                    n <- length(raw_vals)
                    if (n == 0) return(NULL)
                    center <- if (identical(summary_func, "median"))
                        stats::median(raw_vals)
                    else
                        mean(raw_vals)
                    # Median centers draw no SE/SD/CI bars (mean-model
                    # formulas + Cousineau-Morey describe the mean).
                    if (n < 2 || identical(error_type, "none") ||
                        identical(summary_func, "median")) {
                        err <- 0
                    } else {
                        norm_vals <- mat_norm[, j]
                        norm_vals <- norm_vals[is.finite(norm_vals)]
                        n_norm <- length(norm_vals)
                        if (n_norm < 2) {
                            err <- 0
                        } else {
                            sd_val <- stats::sd(norm_vals) * morey_factor
                            se_val <- sd_val / sqrt(n_norm)
                            err <- switch(
                                error_type,
                                "se" = se_val,
                                "sd" = sd_val,
                                "ci95" = se_val * stats::qt(0.975, n_norm - 1),
                                "ci99" = se_val * stats::qt(0.995, n_norm - 1),
                                # Comparison-adjusted, over the ALREADY
                                # Cousineau-Morey-corrected SE: the two knobs
                                # are orthogonal (superb pairs its difference
                                # adjustment with every within-subject method).
                                "ci95c" = se_val * stats::qt(0.975, n_norm - 1) / sqrt(2),
                                se_val
                            )
                        }
                    }
                    out <- list(measure = measures[[j]],
                                center = center, err = err, n = n)
                    # I() blocks auto_unbox for 1-element values vectors
                    # (n=1 cells were invisible to values-driven geoms).
                    if (include_values) {
                        out$values <- I(as.numeric(raw_vals))
                        # rowIds[i] = subject id of values[i], so the
                        # widget's paired-test path joins two measures
                        # by subject (pairwise-complete), not by index.
                        out$rowIds <- I(as.integer(row_ids))
                    }
                    out
                })
            }

            # Build bars by iterating cells (facet × between) on the
            # outer loop and measures on the inner loop. Stats are
            # computed per-cell so the Cousineau-Morey centering
            # uses each cell's own subjects (mixed designs: centre
            # within each between-subjects group separately).
            # ---- Aggregation cache: bars (incl. Cousineau-Morey
            # errors) derive only from the measure/grouping columns +
            # these options. identical() on the raw columns makes any
            # data edit invalidate exactly.
            agg_sig <- list(
                m = as.character(measures),
                cols = df[measures],
                b = if (has_group) df[[betweenVar]] else NULL,
                f = if (has_facet) df[[facetVar]] else NULL,
                vars = c(if (has_group) betweenVar else "",
                         if (has_facet) facetVar else ""),
                opts = c(error_type, error_method, summary_func)
            )
            if (!is.null(private$.aggCache)
                && identical(private$.aggCache$sig, agg_sig)) {
                bars <- private$.aggCache$bars
            } else {
            bars <- list()
            fl_iter <- if (has_facet) facet_levels else list(NA)
            gl_iter <- if (has_group) group_levels else list(NA)
            for (fl in fl_iter) {
                facet_mask <- if (has_facet) df[[facetVar]] == fl
                              else rep(TRUE, nrow(df))
                for (gl in gl_iter) {
                    cell_mask <- facet_mask &
                        (if (has_group) df[[betweenVar]] == gl
                         else rep(TRUE, nrow(df)))
                    cell_df <- df[cell_mask, , drop = FALSE]
                    if (nrow(cell_df) == 0) next
                    stats_list <- stat_for_cell(cell_df)
                    for (j in seq_along(measures)) {
                        st <- stats_list[[j]]
                        if (is.null(st)) next
                        entry <- list(
                            x = mk_x(fl, measures[[j]]),
                            group = if (has_group) gl else NULL,
                            mean = st$center, se = st$err, n = st$n
                        )
                        if (!is.null(st$values)) entry$values <- st$values
                        if (!is.null(st$rowIds)) entry$rowIds <- st$rowIds
                        bars[[length(bars) + 1L]] <- entry
                    }
                }
            }

            }
            private$.aggCache <- list(sig = agg_sig, bars = bars)

            # X axis represents the repeated measure (no single
            # source variable — the title defaults to a generic
            # label, which the user can rename via the widget). Y
            # axis represents the measurement scale itself; we leave
            # it blank by default and let the user fill it in. Group
            # title uses the between-subjects factor's name.
            # chartSpec migration: `spec` was parsed once up front (line ~245).
            # Axis titles are spec keys now, so re-source override flag + text.
            x_title <- if (isTRUE(spec$xTitleOverride))
                (spec$xTitle %||% "")
            else
                "Measure"
            y_title <- if (isTRUE(spec$yTitleOverride))
                (spec$yTitle %||% "")
            else
                ""
            group_title <- if (has_group) {
                if (isTRUE(spec$groupTitleOverride))
                    (spec$groupTitle %||% "")
                else
                    betweenVar
            } else {
                ""
            }
            x_label_default_v     <- "Measure"
            group_label_default_v <- if (has_group) betweenVar else ""
            facet_label_v         <- ""
            # Simple (legacy `measures`) path has no factor registry / chips.
            pivot_factors_v       <- list()
            pivot_obs_v           <- NULL
            pivot_morey_v         <- 1
            pivot_miss_base_v     <- ""
            }

            spec_real_keys <- list(
                "data", "measures", "rm", "rmCells", "bs", "betweenVar",
                "graphType", "summaryFunc", "errorBarType", "errorBarMethod",
                "connectSubjects", "displayRoles", "showDataPoints",
                "exportRequest", "exportPath", "clientBundleHash",
                "paletteLibrary", "styleLibrary", "styleStamp",
                "annotationsJson", "chartSnapshot", "chartSpec"
            )
            spec_keys <- vapply(.rmplotbuilderSpecTable, function(r) r$opt,
                                character(1))

            fixed_args <- list(
                # Static-snapshot fallback: raw pass-through of the JS-committed
                # "<sig>|<svg>"; widget.R sanitizes + embeds (never in the payload).
                chart_snapshot = self$options$chartSnapshot,
                script_src_ready = TRUE,
                bars = bars,
                summary_func = summary_func,
                error_bar_type = error_type,
                error_bar_method = error_method,
                is_repeated_measures = TRUE,
                graph_type = self$options$graphType,
                graph_type_choices = list( list(name = "bar", label = "Bar"), list(name = "line", label = "Line"), list(name = "dot", label = "Dot"), list(name = "box", label = "Box"), list(name = "violin", label = "Violin"), list(name = "raincloud", label = "Raincloud") ),
                graph_type_instant = TRUE,
                x_label = x_title,
                y_label = y_title,
                group_label = group_title,
                x_label_default = x_label_default_v,
                y_label_default = "",
                group_label_default = group_label_default_v,
                x_categories = synth_x_levels,
                group_categories = group_levels,
                facet_separator = if (has_facet) FACET_SEP else "",
                facet_levels = facet_levels,
                facet_label = facet_label_v,
                pivot_factors = pivot_factors_v,
                rm_crossed = TRUE,
                pivot_obs = pivot_obs_v,
                pivot_morey = pivot_morey_v,
                pivot_miss_base = pivot_miss_base_v,
                palette_action = self$options$paletteLibrary,
                client_bundle_hash = self$options$clientBundleHash,
                run_t0 = run_t0,
                style_action = self$options$styleLibrary,
                style_stamp = self$options$styleStamp,
                missing_note = missing_note,
                annotations = gb_resolve_annotations(self$options$annotationsJson, list()),
                show_data_points = isTRUE(self$options$showDataPoints),
                connect_subjects = isTRUE(self$options$connectSubjects),
                chart_spec = self$options$chartSpec,
                spec_real_keys = spec_real_keys,
                spec_keys = spec_keys
            )
            spec_args <- gb_spec_args(spec, .rmplotbuilderSpecTable)

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
                'Add a within-subjects factor in <strong>Repeated Measures Factors</strong> ',
                'and give it levels, then drag each measure column into the matching ',
                '<strong>Repeated Measures Cells</strong> slot (each level becomes an X-axis category). ',
                'Optionally drop a categorical variable into <strong>Between Subject Factors</strong> ',
                'to split by group.',
                '</div>'
            )
        },

        # --- FACTORIAL within-subjects path --------------------------------
        # Reads the RM-ANOVA-style factor/cell boxes (self$options$rm +
        # rmCells), reshapes the wide columns to long, applies the same
        # Cousineau-Morey correction the simple path uses (normalised per
        # between-subjects group, across ALL within cells), and aggregates
        # to the `bars` payload the widget draws. Display roles (which factor
        # sits on the X-axis, color/grouping, or panels) come from the
        # on-chart pivot dropdowns via the displayRoles map; with none set the
        # default is one factor per slot (X-axis, Grouped by, Panels) in
        # declaration order, the rest averaged over. Returns NULL when no
        # factorial design is defined (caller falls back to the simple
        # `measures` path). Base R only; no aggCache (small designs). `bsCols`
        # is a character VECTOR of between-subjects columns (0+).
        .buildFactorial = function(data, bsCols,
                                   error_method, error_type, summary_func) {

            rm_opt    <- self$options$rm
            rmCells   <- self$options$rmCells
            if (is.null(rm_opt) || length(rm_opt) == 0)
                return(NULL)
            # chartSpec migration: axis/group titles are spec keys now. This
            # helper runs in the prelude (before .run's parse), so it parses
            # its own copy — one cheap parse per run.
            spec <- gb_parse_spec(self$options$chartSpec)

            # ---- parse the factors (label + levels + a de-duplicated
            # internal column name, distinct from any data column) --------
            factors <- list()
            for (i in seq_along(rm_opt)) {
                f <- rm_opt[[i]]
                lab <- tryCatch(as.character(f$label), error = function(e) "")
                if (length(lab) != 1 || is.na(lab[1]) || !nzchar(lab[1]))
                    lab <- paste0("Factor ", i)
                levs <- tryCatch(as.character(unlist(f$levels)),
                                 error = function(e) character(0))
                factors[[i]] <- list(label = lab, levels = levs)
            }
            labs <- vapply(factors, function(f) f$label, character(1))
            dataCols <- tryCatch(names(data), error = function(e) character(0))
            # Reserve the reshape's internal column names too, so a factor
            # LABELLED like one of them (e.g. ".value") gets a distinct
            # internal colname instead of clobbering the reshape column.
            # The display label f$label is untouched.
            reserved <- c(".subject", ".value", ".norm", ".xf", ".groupf", ".facetf")
            pre  <- c(dataCols, reserved)
            uniq <- make.unique(c(pre, labs), sep = " ")
            for (i in seq_along(factors))
                factors[[i]]$colname <- uniq[length(pre) + i]

            # ---- parse the cells (level tuple + dragged-in measure) -----
            cells <- list()
            if (!is.null(rmCells)) {
                for (i in seq_along(rmCells)) {
                    c_ <- rmCells[[i]]
                    meas <- tryCatch(c_$measure, error = function(e) NULL)
                    if (is.null(meas) || length(meas) == 0 ||
                        (is.character(meas) && !nzchar(meas[1])))
                        meas <- NA_character_
                    else
                        meas <- as.character(meas)[1]
                    lv <- tryCatch(as.character(unlist(c_$cell)),
                                   error = function(e) character(0))
                    cells[[i]] <- list(measure = meas, cell = lv)
                }
            }
            assigned <- Filter(function(c_) !is.na(c_$measure) &&
                                            c_$measure %in% names(data), cells)
            if (length(assigned) == 0)
                return(NULL)   # a factorial design isn't really defined yet

            bsCols <- if (is.null(bsCols)) character(0) else as.character(bsCols)
            bsCols <- bsCols[bsCols %in% names(data)]
            has_group_bv <- length(bsCols) > 0
            withinCols <- vapply(factors, function(f) f$colname, character(1))
            withinLabs <- vapply(factors, function(f) f$label,   character(1))
            nWithin <- length(factors)
            FACET_SEP <- " ¦ "
            n   <- nrow(data)
            sid <- seq_len(n)

            # ---- missing-data disclosure (subjects missing >=1 within
            # value or an NA between), mirroring the simple path ----------
            anymiss <- rep(FALSE, n)
            for (c_ in assigned)
                anymiss <- anymiss | !is.finite(suppressWarnings(
                    as.numeric(as.character(data[[c_$measure]]))))
            for (bv in bsCols) anymiss <- anymiss | is.na(data[[bv]])
            n_miss <- sum(anymiss)
            missing_note <- if (n_miss > 0)
                sprintf("%d of %d cases are missing at least one value (shown where measured)",
                        n_miss, n) else ""

            # ---- reshape wide -> long (subject x assigned cell) ---------
            pieces <- list()
            for (c_ in assigned) {
                y <- suppressWarnings(as.numeric(as.character(data[[c_$measure]])))
                row <- data.frame(.subject = sid, .value = y,
                                  stringsAsFactors = FALSE, check.names = FALSE)
                for (k in seq_along(factors)) {
                    lv <- if (k <= length(c_$cell)) c_$cell[[k]] else NA_character_
                    row[[withinCols[k]]] <- factor(rep(lv, n),
                                                   levels = factors[[k]]$levels)
                }
                pieces[[length(pieces) + 1L]] <- row
            }
            long <- do.call(rbind, pieces)
            for (bv in bsCols)
                long[[bv]] <- factor(data[[bv]][match(long$.subject, sid)])
            long <- long[is.finite(long$.value), , drop = FALSE]
            if (nrow(long) == 0)
                return(NULL)

            # ---- factor registry: every declared factor -> a stable id -----
            # within factors keyed by declaration position (w1, w2, ...),
            # between factors by column name ("b:<col>"). These ids are the
            # pivot dropdowns' identity (payload pivotFactors) and the
            # displayRoles map keys.
            btwCols <- bsCols
            regId   <- c(paste0("w", seq_along(withinCols)),
                         if (length(btwCols)) paste0("b:", btwCols) else NULL)
            regCol  <- setNames(c(withinCols, btwCols), regId)
            regLab  <- setNames(c(withinLabs, btwCols), regId)
            regKind <- setNames(c(rep("within",  length(withinCols)),
                                  rep("between", length(btwCols))), regId)

            # ---- default roles: one factor per slot (X-axis, Grouped by,
            # Panels) in declaration order, everything else averaged (off).
            # The on-chart pivot dropdowns override this wholesale via
            # displayRoles; this is only the fresh-chart layout when none set.
            role  <- setNames(rep("off", length(regId)), regId)
            wIds  <- paste0("w", seq_along(withinCols))
            for (i in seq_len(min(3L, length(regId))))
                role[[regId[i]]] <- c("x", "group", "panel")[i]

            # ---- pivot chips override the defaults (displayRoles JSON) ------
            # { "<id>": "x"|"group"|"panel"|"off" }; unknown ids / bad values
            # are ignored so a stale map can never wedge the chart. Empty =>
            # the defaults above stand.
            dr <- self$options$displayRoles
            if (!is.null(dr) && length(dr) == 1L && nzchar(dr)) {
                parsed <- tryCatch(
                    jsonlite::fromJSON(dr, simplifyVector = TRUE),
                    error = function(e) NULL)
                nm <- names(parsed)
                if (length(parsed) && !is.null(nm)) {
                    role[] <- "off"   # the dropdown map is authoritative
                    for (k in seq_along(parsed)) {
                        id <- nm[k]
                        rv <- as.character(parsed[[k]])[1]
                        if (!is.null(id) && id %in% regId &&
                            length(rv) == 1L && !is.na(rv) &&
                            rv %in% c("x", "group", "panel", "off"))
                            role[[id]] <- rv
                    }
                }
            }

            # ---- resolve roles -> columns. Exactly one factor on the x-axis;
            # it may be a within OR a between factor (a between-led x-axis is a
            # legitimate mixed-design layout the chips now allow). --------------
            xIds <- regId[role == "x"]
            if (length(xIds) == 0L) {
                # nothing on x: promote the first non-panel/off factor,
                # preferring a within factor for the familiar layout. If the
                # map left EVERYTHING off (e.g. a stale/garbage displayRoles),
                # fall back to promoting any factor so the chart never blanks.
                cand <- regId[!(role %in% c("panel", "off"))]
                if (length(cand) == 0L) cand <- regId
                cand <- c(cand[cand %in% wIds], cand[!(cand %in% wIds)])
                if (length(cand) == 0L) return(NULL)
                role[[cand[1]]] <- "x"; xIds <- cand[1]
            } else if (length(xIds) > 1L) {
                for (extra in xIds[-1]) role[[extra]] <- "group"
                xIds <- xIds[1]
            }
            xId  <- xIds[1]
            xcol <- unname(regCol[[xId]])
            xlab <- unname(regLab[[xId]])
            groupIds   <- regId[role == "group"]
            facetIds   <- regId[role == "panel"]
            offIds     <- regId[role == "off"]
            colorCols <- unname(regCol[groupIds]); colorLabs <- unname(regLab[groupIds])
            facetCols  <- unname(regCol[facetIds]); facetLabs  <- unname(regLab[facetIds])

            has_facet <- length(facetCols) > 0
            has_group <- length(colorCols) > 0

            # averaged-over disclosure: a factor dropped from the layout ("off")
            # pools its levels into every plotted cell (marginal means). Keep
            # the missing-cases note WITHOUT the averaged-over clause too, so
            # the JS instant re-pivot can rebuild the note for a new layout.
            miss_base <- missing_note
            if (length(offIds)) {
                anote <- sprintf("averaged over %s",
                                 paste(unname(regLab[offIds]), collapse = ", "))
                missing_note <- if (nzchar(missing_note))
                    paste0(missing_note, "; ", anote) else anote
            }

            # ---- keys: x-level, color combo, facet combo. A cell whose
            # level tuple is incomplete / blank / renamed (no longer
            # matching its factor) yields an NA factor level, and an NA
            # between/facet value yields an NA combo. DROP those rows here
            # so an NA key can never (a) crash the aggregate mask nor (b)
            # phantom-poison a valid cell via NA logical indexing. Done
            # BEFORE Cousineau-Morey so an excluded observation also does
            # not perturb a subject's normalising mean. Their finite values
            # ride the missing_note disclosure computed above.
            mkKey <- function(cols, sep) {
                if (length(cols) == 0) return(factor(rep("", nrow(long))))
                interaction(long[cols], sep = sep, drop = TRUE)
            }
            # x levels: declared factor order for a within factor, natural
            # factor levels for a between column on the x-axis.
            xLevs <- if (identical(unname(regKind[[xId]]), "within"))
                factors[[match(xcol, withinCols)]]$levels
            else
                levels(long[[xcol]])
            long$.xf     <- factor(as.character(long[[xcol]]), levels = xLevs)
            long$.groupf <- mkKey(colorCols, " / ")
            long$.facetf <- mkKey(facetCols,  " / ")
            key_ok <- !is.na(long$.xf) &
                      (!has_group | !is.na(long$.groupf)) &
                      (!has_facet | !is.na(long$.facetf))
            long <- long[key_ok, , drop = FALSE]
            if (nrow(long) == 0)
                return(NULL)
            long$.xf     <- droplevels(long$.xf)
            long$.groupf <- droplevels(long$.groupf)
            long$.facetf <- droplevels(long$.facetf)
            xlevels      <- levels(long$.xf)
            group_levels <- if (has_group) levels(long$.groupf) else NULL
            facet_levels <- if (has_facet) levels(long$.facetf) else NULL
            synth_x <- if (has_facet)
                unlist(lapply(facet_levels, function(fl)
                    paste0(fl, FACET_SEP, xlevels)), use.names = FALSE)
            else xlevels

            # ---- Cousineau-Morey: normalise per between-subjects group,
            # across ALL within cells (M = number of within cells), on the
            # NA-key-cleaned long above. -----------------------------------
            M <- length(assigned)
            use_within <- identical(error_method, "within") && M >= 2
            morey <- if (use_within) sqrt(M / (M - 1)) else 1
            long$.norm <- long$.value
            if (use_within) {
                bgCols <- bsCols
                bg <- if (length(bgCols))
                    interaction(long[bgCols], drop = TRUE)
                else factor(rep("all", nrow(long)))
                for (g in levels(bg)) {
                    ix <- which(bg == g)
                    v  <- long$.value[ix]
                    sm <- tapply(v, long$.subject[ix], mean, na.rm = TRUE)
                    gm <- mean(v, na.rm = TRUE); if (!is.finite(gm)) gm <- 0
                    long$.norm[ix] <- v - sm[as.character(long$.subject[ix])] + gm
                }
            }

            # ---- aggregate to bars {x, group, mean, se, n, values} ------
            is_median <- identical(summary_func, "median")
            bars <- list()
            fIter <- if (has_facet) facet_levels else ""
            gIter <- if (has_group) group_levels else ""
            xkey <- as.character(long$.xf)
            gkey <- as.character(long$.groupf)
            fkey <- as.character(long$.facetf)
            for (fl in fIter) for (gl in gIter) for (xl in xlevels) {
                ix <- xkey == xl &
                      (if (has_group) gkey == gl else TRUE) &
                      (if (has_facet) fkey == fl else TRUE)
                if (!any(ix)) next
                vals <- long$.value[ix]
                nn   <- length(vals)
                center <- if (is_median) stats::median(vals) else mean(vals)
                err <- 0
                # Median centers draw no SE/SD/CI bars (mean-model
                # formulas + Cousineau-Morey describe the mean).
                if (nn >= 2 && !identical(error_type, "none") && !is_median) {
                    nv <- long$.norm[ix]; nv <- nv[is.finite(nv)]
                    if (length(nv) >= 2) {
                        sd_val <- stats::sd(nv) * morey
                        se_val <- sd_val / sqrt(length(nv))
                        err <- switch(error_type,
                            "se" = se_val, "sd" = sd_val,
                            "ci95" = se_val * stats::qt(0.975, length(nv) - 1),
                            "ci99" = se_val * stats::qt(0.995, length(nv) - 1),
                            "ci95c" = se_val * stats::qt(0.975, length(nv) - 1) / sqrt(2),
                            se_val)
                    }
                }
                entry <- list(
                    x = if (has_facet) paste0(fl, FACET_SEP, xl) else xl,
                    group = if (has_group) gl else NULL,
                    mean = center, se = err, n = nn,
                    values = I(as.numeric(vals)),
                    rowIds = I(as.integer(long$.subject[ix])))
                bars[[length(bars) + 1L]] <- entry
            }
            if (length(bars) == 0) return(NULL)

            x_title <- if (isTRUE(spec$xTitleOverride))
                (spec$xTitle %||% "") else xlab
            group_title <- if (isTRUE(spec$groupTitleOverride))
                (spec$groupTitle %||% "") else paste(colorLabs, collapse = " / ")

            list(
                bars = bars, synth_x_levels = synth_x,
                group_levels = group_levels, facet_levels = facet_levels,
                has_group = has_group, has_facet = has_facet,
                facet_sep = if (has_facet) FACET_SEP else "",
                use_within = use_within, missing_note = missing_note,
                x_title = x_title, group_title = group_title,
                x_label_default = xlab,
                group_label_default = paste(colorLabs, collapse = " / "),
                facet_label = paste(facetLabs, collapse = " / "),
                # The pivot-chip registry for the on-chart layout tray: one
                # entry per declared factor with its resolved display role.
                pivot_factors = lapply(regId, function(id) list(
                    id     = id,
                    label  = unname(regLab[[id]]),
                    kind   = unname(regKind[[id]]),
                    role   = unname(role[[id]]),
                    levels = as.list(levels(long[[ regCol[[id]] ]])))),
                # Raw per-observation value + CM-normalised value + subject +
                # each factor's level, so the JS can re-aggregate INSTANTLY for
                # a new layout (the normalised value is invariant to display
                # role - it depends only on the between-subjects grouping, so a
                # re-pivot is just a regroup + mean/sd, no CM redo). Capped so a
                # huge design falls back to the R round-trip.
                pivot_obs = if (nrow(long) <= 50000L) list(
                    v  = as.numeric(long$.value),
                    nm = as.numeric(long$.norm),
                    s  = as.integer(long$.subject),
                    lv = setNames(lapply(regId, function(id)
                             as.character(long[[ regCol[[id]] ]])), regId)
                ) else NULL,
                pivot_morey = morey,
                pivot_miss_base = miss_base)
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
            file.path(tempdir(), "rmplotbuilder_lastExportId.txt")
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
