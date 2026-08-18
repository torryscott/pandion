# Distribution Plot Builder - univariate distribution plots powered by the
# graphbuilder2.js htmlwidget bundled at inst/widget/graphbuilder2.js.
#
# A single numeric variable drives every plot type. groupVar splits the
# distribution (overlaid colors for histogram / density / qq / ecdf;
# side-by-side dodged categories for box / violin / raincloud) and facetVar
# panels it. Like the sibling modules, R only preps the data: it ships each
# (facet x group) cell's raw values to the widget, which computes all
# geometry (bins, KDEs, quartiles, quantiles, steps) client-side. The
# widget owns interaction; R is a thin data/option marshaller.
#
# box / violin / raincloud reuse the shared categorical render path (the
# grouping variable becomes the dodged group within a single x slot, so the
# value lands on Y exactly as in Compare Groups). histogram / density /
# histdensity / qq / ecdf are continuous-X types handled by the widget's
# distribution renderers.

# Auto-generated chartSpec spec table (speed pass Phase 2). See CLAUDE.md convention 22.
.distplotbuilderSpecTable <- list(
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
    list(arg = "x_min", opt = "xMin", bool = FALSE, default = 0),
    list(arg = "x_max", opt = "xMax", bool = FALSE, default = 0),
    list(arg = "x_interval", opt = "xInterval", bool = FALSE, default = 0),
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
    list(arg = "bar_pattern", opt = "barPattern", bool = FALSE, default = ""),
    list(arg = "bar_pattern_density", opt = "barPatternDensity", bool = FALSE, default = 1),
    list(arg = "bar_pattern_angle", opt = "barPatternAngle", bool = FALSE, default = 45),
    list(arg = "bar_pattern_thickness", opt = "barPatternThickness", bool = FALSE, default = 1),
    list(arg = "bar_pattern_color", opt = "barPatternColor", bool = FALSE, default = ""),
    list(arg = "group_borders", opt = "groupBorders", bool = FALSE, default = list()),
    list(arg = "group_opacities", opt = "groupOpacities", bool = FALSE, default = list()),
    list(arg = "dens_group_styles", opt = "densGroupStyles", bool = FALSE, default = list()),
    list(arg = "dist_normal_group_styles", opt = "distNormalGroupStyles", bool = FALSE, default = list()),
    list(arg = "group_corner_radii", opt = "groupCornerRadii", bool = FALSE, default = list()),
    list(arg = "group_error_bars", opt = "groupErrorBars", bool = FALSE, default = list()),
    list(arg = "category_styles", opt = "categoryStyles", bool = FALSE, default = list()),
    list(arg = "group_box_whiskers", opt = "groupBoxWhiskers", bool = FALSE, default = list()),
    list(arg = "group_data_points", opt = "groupDataPoints", bool = FALSE, default = list()),
    list(arg = "group_qq_styles", opt = "groupQQStyles", bool = FALSE, default = list()),
    list(arg = "group_box_medians", opt = "groupBoxMedians", bool = FALSE, default = list()),
    list(arg = "group_box_outliers", opt = "groupBoxOutliers", bool = FALSE, default = list()),
    list(arg = "group_violin_density", opt = "groupViolinDensity", bool = FALSE, default = list()),
    list(arg = "group_violin_inner_box", opt = "groupViolinInnerBox", bool = FALSE, default = list()),
    list(arg = "group_violin_whiskers", opt = "groupViolinWhiskers", bool = FALSE, default = list()),
    list(arg = "group_violin_medians", opt = "groupViolinMedians", bool = FALSE, default = list()),
    list(arg = "error_bar_direction", opt = "errorBarDirection", bool = FALSE, default = "both"),
    list(arg = "error_bar_color", opt = "errorBarColor", bool = FALSE, default = "#000000"),
    list(arg = "error_bar_thickness", opt = "errorBarThickness", bool = FALSE, default = 1.4),
    list(arg = "error_bar_cap_size", opt = "errorBarCapSize", bool = FALSE, default = 10),
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
    list(arg = "hist_bin_width", opt = "histBinWidth", bool = FALSE, default = -1),
    list(arg = "hist_color", opt = "histColor", bool = FALSE, default = ""),
    list(arg = "hist_outline_color", opt = "histOutlineColor", bool = FALSE, default = "#ffffff"),
    list(arg = "hist_outline_width", opt = "histOutlineWidth", bool = FALSE, default = 0.5),
    list(arg = "hist_outline_style", opt = "histOutlineStyle", bool = FALSE, default = "solid"),
    list(arg = "hist_outline_opacity", opt = "histOutlineOpacity", bool = FALSE, default = 1),
    list(arg = "hist_opacity", opt = "histOpacity", bool = FALSE, default = 0.85),
    list(arg = "dens_bandwidth_adjust", opt = "densBandwidthAdjust", bool = FALSE, default = 1),
    list(arg = "dens_kernel", opt = "densKernel", bool = FALSE, default = "gaussian"),
    list(arg = "dens_opacity", opt = "densOpacity", bool = FALSE, default = 0.5),
    list(arg = "dens_line_color", opt = "densLineColor", bool = FALSE, default = ""),
    list(arg = "dens_line_width", opt = "densLineWidth", bool = FALSE, default = 1.5),
    list(arg = "dens_line_style", opt = "densLineStyle", bool = FALSE, default = "solid"),
    list(arg = "dens_line_opacity", opt = "densLineOpacity", bool = FALSE, default = 1),
    list(arg = "qq_line_color", opt = "qqLineColor", bool = FALSE, default = ""),
    list(arg = "qq_line_width", opt = "qqLineWidth", bool = FALSE, default = 1.5),
    list(arg = "qq_line_style", opt = "qqLineStyle", bool = FALSE, default = "dashed"),
    list(arg = "qq_line_opacity", opt = "qqLineOpacity", bool = FALSE, default = 1),
    list(arg = "qq_band_level", opt = "qqBandLevel", bool = FALSE, default = 0.95),
    list(arg = "qq_band_color", opt = "qqBandColor", bool = FALSE, default = ""),
    list(arg = "qq_band_opacity", opt = "qqBandOpacity", bool = FALSE, default = 0.2),
    list(arg = "qq_point_size", opt = "qqPointSize", bool = FALSE, default = 4),
    list(arg = "qq_point_color", opt = "qqPointColor", bool = FALSE, default = ""),
    list(arg = "qq_point_shape", opt = "qqPointShape", bool = FALSE, default = "circle"),
    list(arg = "qq_point_opacity", opt = "qqPointOpacity", bool = FALSE, default = 0.8),
    list(arg = "qq_point_outline_color", opt = "qqPointOutlineColor", bool = FALSE, default = "#000000"),
    list(arg = "qq_point_outline_width", opt = "qqPointOutlineWidth", bool = FALSE, default = 0),
    list(arg = "ecdf_step", opt = "ecdfStep", bool = FALSE, default = "hv"),
    list(arg = "ecdf_line_width", opt = "ecdfLineWidth", bool = FALSE, default = 1.5),
    list(arg = "ecdf_line_color", opt = "ecdfLineColor", bool = FALSE, default = ""),
    list(arg = "ecdf_line_style", opt = "ecdfLineStyle", bool = FALSE, default = "solid"),
    list(arg = "ecdf_line_opacity", opt = "ecdfLineOpacity", bool = FALSE, default = 1),
    list(arg = "dist_rug_color", opt = "distRugColor", bool = FALSE, default = ""),
    list(arg = "dist_rug_length", opt = "distRugLength", bool = FALSE, default = 7),
    list(arg = "dist_rug_width", opt = "distRugWidth", bool = FALSE, default = 0.75),
    list(arg = "dist_rug_opacity", opt = "distRugOpacity", bool = FALSE, default = 0.5),
    list(arg = "dist_normal_color", opt = "distNormalColor", bool = FALSE, default = ""),
    list(arg = "dist_normal_width", opt = "distNormalWidth", bool = FALSE, default = 2),
    list(arg = "dist_normal_style", opt = "distNormalStyle", bool = FALSE, default = "solid"),
    list(arg = "dist_normal_opacity", opt = "distNormalOpacity", bool = FALSE, default = 1),
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
    list(arg = "x_min_override", opt = "xMinOverride", bool = TRUE, default = FALSE),
    list(arg = "x_max_override", opt = "xMaxOverride", bool = TRUE, default = FALSE),
    list(arg = "x_interval_override", opt = "xIntervalOverride", bool = TRUE, default = FALSE),
    list(arg = "legend_layout_custom", opt = "legendLayoutCustom", bool = TRUE, default = FALSE),
    list(arg = "bar_n_labels", opt = "barNLabels", bool = TRUE, default = FALSE),
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
    list(arg = "point_color_match", opt = "pointColorMatch", bool = TRUE, default = TRUE),
    list(arg = "show_bar_outliers", opt = "showBarOutliers", bool = TRUE, default = FALSE),
    list(arg = "bar_outlier_label", opt = "barOutlierLabel", bool = TRUE, default = FALSE),
    list(arg = "dens_fill", opt = "densFill", bool = TRUE, default = TRUE),
    list(arg = "hist_density_scale_to_count", opt = "histDensityScaleToCount", bool = TRUE, default = TRUE),
    list(arg = "qq_show_line", opt = "qqShowLine", bool = TRUE, default = TRUE),
    list(arg = "qq_band", opt = "qqBand", bool = TRUE, default = FALSE),
    list(arg = "ecdf_complement", opt = "ecdfComplement", bool = TRUE, default = FALSE),
    list(arg = "ecdf_pad", opt = "ecdfPad", bool = TRUE, default = TRUE),
    list(arg = "dist_rug", opt = "distRug", bool = TRUE, default = FALSE),
    list(arg = "dist_normal_curve", opt = "distNormalCurve", bool = TRUE, default = FALSE)
)

distplotbuilderClass <- if (requireNamespace('jmvcore', quietly = TRUE)) R6::R6Class(
    "distplotbuilderClass",
    inherit = distplotbuilderBase,
    private = list(
        # Aggregation cache: the bars list keyed by (plotted columns),
        # identical()-compared so style-only commits skip the per-cell
        # aggregation. See .run().
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
            valvar <- self$options$var
            groupVar <- self$options$groupVar
            facetVar <- self$options$facetVar
            has_group <- !gb_family_is_missing(groupVar)
            has_facet <- !gb_family_is_missing(facetVar)
            error_type <- self$options$errorBarType
            summary_func <- self$options$summaryFunc
            gtype <- self$options$graphType

            # box / violin / raincloud render on the shared categorical
            # path (value on Y, groups dodged on X). Everything else is a
            # continuous-X distribution type (value on X).
            is_categorical <- gtype %in% c("box", "violin", "raincloud")

            if (is.null(data) || nrow(data) == 0 ||
                gb_family_is_missing(valvar)) {
                # No chart -> any persisted snapshot is stale; hide the
                # native static copy alongside the placeholder.
                tryCatch(self$results$snapshotImage$setVisible(FALSE),
                         error = function(e) NULL)
                self$results$widget$setContent(gb2_engine_placeholder_html(
                    private$.placeholder(), self$options$clientBundleHash,
                    script_src_ready = TRUE))
                return()
            }
            # Native static copy (prototype): feed the persisted snapshot
            # into jamovi's own Image result so native export + module-less
            # display carry the picture. State/size updates are cheap; the
            # actual rasterization happens in .renderSnapshot.
            private$.updateSnapshotImage()

            df <- data
            if (has_group)
                df[[groupVar]] <- as.factor(df[[groupVar]])
            if (has_facet)
                df[[facetVar]] <- as.factor(df[[facetVar]])
            # Missing-data disclosure (NA group/facet rows fall out at
            # aggregation even though only the value is filtered here).
            n_rows_total <- nrow(df)
            complete_rows <- is.finite(suppressWarnings(as.numeric(df[[valvar]])))
            if (has_group) complete_rows <- complete_rows & !is.na(df[[groupVar]])
            if (has_facet) complete_rows <- complete_rows & !is.na(df[[facetVar]])
            n_rows_missing <- n_rows_total - sum(complete_rows)
            missing_note <- if (n_rows_missing > 0)
                sprintf("%d of %d cases not shown (missing values)",
                        n_rows_missing, n_rows_total) else ""
            df <- df[is.finite(df[[valvar]]), , drop = FALSE]

            if (nrow(df) == 0) {
                # A variable IS assigned — the generic "drag a variable"
                # hint would be misleading. Say what's actually wrong.
                self$results$widget$setContent(private$.placeholder(paste0(
                    '<strong>', htmltools::htmlEscape(valvar), '</strong> has no ',
                    'usable (non-missing) values to plot.'
                )))
                return()
            }

            group_levels <- if (has_group) levels(droplevels(df[[groupVar]])) else NULL
            facet_levels <- if (has_facet) levels(droplevels(df[[facetVar]])) else NULL

            # Facet synthesis mirrors the sibling modules: with faceting,
            # every cell is repeated per facet level and the x slot is
            # prefixed "<facet> | <cat>". The widget detects the separator,
            # strips it from tick labels, gaps the facet boundaries, and
            # draws a strip label per block. The continuous-X types carry
            # the facet level in a dedicated `facet` field instead (x is the
            # value axis, so it can't encode the facet).
            FACET_SEP <- " ¦ "
            mk_x <- function(facet_lvl, cat) {
                if (has_facet) paste0(facet_lvl, FACET_SEP, cat) else cat
            }

            # Per-cell summary + raw values. The raw values are always
            # shipped: box / violin / raincloud compute quartiles & density
            # bandwidths from them, the continuous types bin / KDE / rank /
            # quantile them, and Show Data Points overlays them.
            cell_stat <- function(vals) {
                vals <- vals[is.finite(vals)]
                n <- length(vals)
                if (n == 0)
                    return(NULL)
                center <- if (identical(summary_func, "median")) stats::median(vals) else mean(vals)
                # Median centers draw no SE/SD/CI bars (mean-model
                # formulas; same rule as plotbuilder's cell_stat).
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
                        se_val
                    )
                }
                # I() blocks jsonlite's auto_unbox from collapsing a single
                # value to a JSON scalar — the JS reads values via
                # Array.isArray, so an unboxed 42 (instead of [42]) made
                # every n=1 series invisible (blank chart with the 0-1
                # fallback axis).
                list(center = center, err = err, n = n, values = I(as.numeric(vals)))
            }

            # The single x slot for distribution plots: all observations in
            # a facet share one categorical slot ("" label), and groups are
            # dodged within it / overlaid by color. Faceting still splits
            # the slot per facet level via mk_x.
            SLOT <- ""

            # ---- Aggregation cache: bars derive only from the plotted
            # columns + the cell-stat options (cells carry raw values
            # plus a summaryFunc center and an errorBarType half-
            # length, so both belong in the signature). identical() on
            # the raw columns makes any data edit invalidate exactly.
            agg_sig <- list(
                vars = c(valvar,
                         if (has_group) groupVar else "",
                         if (has_facet) facetVar else ""),
                v = df[[valvar]],
                g = if (has_group) df[[groupVar]] else NULL,
                f = if (has_facet) df[[facetVar]] else NULL,
                opts = c(error_type, summary_func)
            )
            if (!is.null(private$.aggCache)
                && identical(private$.aggCache$sig, agg_sig)) {
                bars <- private$.aggCache$bars
            } else {
            bars <- list()
            fl_iter <- if (has_facet) facet_levels else list(NA)
            for (fl in fl_iter) {
                facet_mask <- if (has_facet) df[[facetVar]] == fl
                              else rep(TRUE, nrow(df))
                grp_iter <- if (has_group) group_levels else list(NA)
                for (gl in grp_iter) {
                    grp_mask <- if (has_group) df[[groupVar]] == gl
                                else rep(TRUE, nrow(df))
                    vals <- df[[valvar]][facet_mask & grp_mask]
                    st <- cell_stat(vals)
                    if (is.null(st))
                        next
                    entry <- list(
                        x = mk_x(fl, SLOT),
                        group = if (has_group) gl else NULL,
                        facet = if (has_facet) fl else NULL,
                        mean = st$center, se = st$err, n = st$n,
                        values = st$values
                    )
                    bars[[length(bars) + 1L]] <- entry
                }
            }

            }
            private$.aggCache <- list(sig = agg_sig, bars = bars)

            # Sigma stats panel (Jul 2026): per-cell Shapiro-Wilk shipped
            # to the widget for the Normality tab. Same math as the
            # summary table's W/p columns; the moments the panel shows
            # are computed JS-side from the raw values it already has.
            dist_normality <- list()
            for (b in bars) {
                vals <- as.numeric(b$values)
                vals <- vals[is.finite(vals)]
                n_v <- length(vals)
                sw <- if (n_v >= 3 && n_v <= 5000 &&
                          length(unique(vals)) > 1L)
                    tryCatch(stats::shapiro.test(vals),
                             error = function(e) NULL) else NULL
                dist_normality[[length(dist_normality) + 1L]] <- list(
                    group = if (!is.null(b$group)) as.character(b$group)
                            else "",
                    facet = if (!is.null(b$facet)) as.character(b$facet)
                            else "",
                    n = as.integer(n_v),
                    w = if (!is.null(sw))
                            round(as.numeric(sw$statistic), 3)
                        else NA,
                    p = if (!is.null(sw)) as.numeric(sw$p.value)
                        else NA)
            }

            # Q-Q and density geometry need at least 2 non-missing values
            # in SOME series (the per-series n<2 skips handle smaller
            # siblings): the Q-Q theoretical x-range degenerates at n=1
            # and a KDE is undefined. Without this gate the widget drew
            # bare axes with no glyphs and nothing to click.
            if (gtype %in% c("qq", "density")) {
                max_n <- if (length(bars))
                    max(vapply(bars, function(b) b$n, numeric(1))) else 0
                if (max_n < 2) {
                    what <- if (identical(gtype, "qq")) "A Q-Q plot" else "A density plot"
                    self$results$widget$setContent(private$.placeholder(paste0(
                        what, ' needs at least 2 non-missing values - <strong>',
                        htmltools::htmlEscape(valvar), '</strong> has ', max_n, '.'
                    )))
                    return()
                }
            }

            # x-categories: the categorical types need one slot per facet
            # (the dodged-group container). The continuous types ignore the
            # categorical x entirely (value axis), so we pass none and let
            # the widget build the value axis from the pooled values.
            synth_x_levels <- if (has_facet) {
                vapply(facet_levels, function(fl) mk_x(fl, SLOT), character(1))
            } else {
                SLOT
            }
            x_categories <- if (is_categorical) synth_x_levels else character(0)
            # The facet prefix stays embedded in x for BOTH families: the
            # categorical path strips it from tick labels, and the continuous
            # path's wrap-panel builder filters bars per facet by parsing it.
            facet_sep_out <- if (has_facet) FACET_SEP else ""

            var_name <- valvar
            # Axis-label defaults by plot type: the value lands on Y for the
            # categorical types and on X for the continuous ones; qq / ecdf
            # relabel their derived axes.
            default_x <- if (is_categorical) "" else switch(
                gtype,
                "qq" = "Theoretical Quantiles",
                var_name
            )
            default_y <- if (is_categorical) var_name else switch(
                gtype,
                "histogram" = switch(self$options$histStat,
                                     "density" = "Density",
                                     "proportion" = "Proportion", "Count"),
                "histdensity" = switch(self$options$histStat,
                                       "density" = "Density",
                                       "proportion" = "Proportion", "Count"),
                "density" = "Density",
                "qq" = "Sample Quantiles",
                "ecdf" = "Cumulative Proportion",
                var_name
            )

            # chartSpec migration: parse the blob; axis titles are spec
            # options, so re-source the override flag + text from `spec`.
            spec <- gb_parse_spec(self$options$chartSpec)

            x_title <- if (isTRUE(spec$xTitleOverride))
                (spec$xTitle %||% "") else default_x
            y_title <- if (isTRUE(spec$yTitleOverride))
                (spec$yTitle %||% "") else default_y
            group_title <- if (has_group) {
                if (isTRUE(spec$groupTitleOverride))
                    (spec$groupTitle %||% "") else groupVar
            } else {
                ""
            }

            spec_real_keys <- list(
                "data", "var", "groupVar", "facetVar", "histBins", "histStat",
                "histPosition", "graphType", "summaryFunc", "errorBarType",
                "showDataPoints", "exportRequest", "exportPath", "clientBundleHash",
                "paletteLibrary", "styleLibrary", "styleStamp",
                "annotationsJson", "chartSnapshot", "chartSpec"
            )
            spec_keys <- vapply(.distplotbuilderSpecTable, function(r) r$opt,
                                character(1))

            fixed_args <- list(
                # Static-snapshot fallback: raw pass-through of the JS-committed
                # "<sig>|<svg>"; widget.R sanitizes + embeds (never in the payload).
                chart_snapshot = self$options$chartSnapshot,
                script_src_ready = TRUE,
                bars = bars,
                graph_type = self$options$graphType,
                graph_type_choices = list( list(name = "histogram", label = "Histogram"), list(name = "density", label = "Density"), list(name = "histdensity", label = "Hist+Density"), list(name = "box", label = "Box"), list(name = "violin", label = "Violin"), list(name = "raincloud", label = "Raincloud"), list(name = "qq", label = "Q-Q"), list(name = "ecdf", label = "ECDF") ),
                graph_type_instant = FALSE,
                x_label = x_title,
                y_label = y_title,
                group_label = group_title,
                x_label_default = default_x,
                y_label_default = default_y,
                group_label_default = if (has_group) groupVar else "",
                x_categories = x_categories,
                group_categories = group_levels,
                facet_separator = facet_sep_out,
                facet_levels = facet_levels,
                facet_label = if (has_facet) facetVar else "",
                palette_action = self$options$paletteLibrary,
                client_bundle_hash = self$options$clientBundleHash,
                run_t0 = run_t0,
                style_action = self$options$styleLibrary,
                style_stamp = self$options$styleStamp,
                missing_note = missing_note,
                annotations = gb_resolve_annotations(self$options$annotationsJson, list()),
                show_data_points = isTRUE(self$options$showDataPoints),
                hist_bins = self$options$histBins,
                hist_stat = self$options$histStat,
                hist_position = self$options$histPosition,
                dist_normality = dist_normality,
                chart_spec = self$options$chartSpec,
                spec_real_keys = spec_real_keys,
                spec_keys = spec_keys
            )
            spec_args <- gb_spec_args(spec, .distplotbuilderSpecTable)

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

            self$results$widget$setContent(html)
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

        .placeholder = function(msg) {
            # With no message: the standard "assign your variables" hint.
            # With one: a data-state explanation in the same chrome (used
            # for "variable has no usable values" and the per-type
            # minimum-n messages, so users see WHY the chart is empty
            # rather than a misleading drag-variables hint).
            body <- if (!missing(msg) && is.character(msg) && nzchar(msg)) {
                msg
            } else {
                paste0(
                    'Drag a numeric variable into <strong>Variable</strong> to render a ',
                    'distribution plot. Optionally drop a categorical variable into ',
                    '<strong>Group By</strong> to split the distribution, or into ',
                    '<strong>Panels</strong> to panel it.'
                )
            }
            paste0(
                '<div style="font-family:sans-serif;color:#666;padding:12px;font-size:13px;">',
                body,
                '</div>'
            )
        },

        # --- Export pipeline ---------------------------------------------
        # The widget can't trigger downloads inside jamovi's webview, so
        # exports come back as base64 strings via the hidden exportRequest
        # option. We decode and write to disk here. The request payload is
        # JSON: { id, format, data (base64), filename } where `id` is a
        # monotonically increasing number used to deduplicate so repeated
        # re-runs don't re-write the same file.
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

            # Cross-platform user home (see sibling modules for rationale).
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
        # Module-named so it never collides with a sibling's dedupe marker.
        .exportIdFile = function() {
            file.path(tempdir(), "distplotbuilder_lastExportId.txt")
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
