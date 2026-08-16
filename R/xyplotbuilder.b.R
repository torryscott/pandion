# Correlations (XY plot builder). Mirrors plotbuilder.b.R but
# emits an xyPoints array (one entry per observation) instead of
# per-cell aggregated bars. The widget detects scatter mode and
# renders with dual continuous axes.

.xyplotbuilderSpecTable <- list(
    list(arg = "xy_point_size", opt = "xyPointSize", bool = FALSE, default = 5),
    list(arg = "xy_point_shape", opt = "xyPointShape", bool = FALSE, default = "circle"),
    list(arg = "xy_point_opacity", opt = "xyPointOpacity", bool = FALSE, default = 0.7),
    list(arg = "xy_point_color", opt = "xyPointColor", bool = FALSE, default = "#1f77b4"),
    list(arg = "xy_point_outline_color", opt = "xyPointOutlineColor", bool = FALSE, default = "#000000"),
    list(arg = "xy_point_outline_width", opt = "xyPointOutlineWidth", bool = FALSE, default = 0),
    list(arg = "xy_point_jitter", opt = "xyPointJitter", bool = FALSE, default = 0),
    list(arg = "xy_point_shapes", opt = "xyPointShapes", bool = FALSE, default = list()),
    list(arg = "xy_point_group_styles", opt = "xyPointGroupStyles", bool = FALSE, default = ""),
    list(arg = "xy_ellipse_group_styles", opt = "xyEllipseGroupStyles", bool = FALSE, default = ""),
    list(arg = "xy_rug_group_styles", opt = "xyRugGroupStyles", bool = FALSE, default = ""),
    list(arg = "xy_marginal_group_styles", opt = "xyMarginalGroupStyles", bool = FALSE, default = ""),
    list(arg = "xy_density2d_group_styles", opt = "xyDensity2DGroupStyles", bool = FALSE, default = ""),
    list(arg = "xy_ellipse_opacity", opt = "xyEllipseOpacity", bool = FALSE, default = 0.15),
    list(arg = "xy_ellipse_width", opt = "xyEllipseWidth", bool = FALSE, default = 1.5),
    list(arg = "xy_ellipse_style", opt = "xyEllipseStyle", bool = FALSE, default = "solid"),
    list(arg = "xy_ellipse_color", opt = "xyEllipseColor", bool = FALSE, default = "#666666"),
    list(arg = "xy_hidden_ellipse_groups", opt = "xyHiddenEllipseGroups", bool = FALSE, default = list()),
    list(arg = "xy_outlier_threshold", opt = "xyOutlierThreshold", bool = FALSE, default = 2),
    list(arg = "xy_outlier_color", opt = "xyOutlierColor", bool = FALSE, default = "#d62728"),
    list(arg = "xy_outlier_size", opt = "xyOutlierSize", bool = FALSE, default = 1),
    list(arg = "xy_outlier_width", opt = "xyOutlierWidth", bool = FALSE, default = 1.6),
    list(arg = "xy_density2d_opacity", opt = "xyDensity2DOpacity", bool = FALSE, default = 0.7),
    list(arg = "xy_density2d_width", opt = "xyDensity2DWidth", bool = FALSE, default = 1),
    list(arg = "xy_density2d_color", opt = "xyDensity2DColor", bool = FALSE, default = "#444444"),
    list(arg = "xy_hidden_density2d_groups", opt = "xyHiddenDensity2DGroups", bool = FALSE, default = list()),
    list(arg = "xy_bin_color", opt = "xyBinColor", bool = FALSE, default = "#1f77b4"),
    list(arg = "xy_bin_palette", opt = "xyBinPalette", bool = FALSE, default = "single"),
    list(arg = "xy_bin_custom_low", opt = "xyBinCustomLow", bool = FALSE, default = "#ffffff"),
    list(arg = "xy_bin_custom_mid", opt = "xyBinCustomMid", bool = FALSE, default = "#76b7e8"),
    list(arg = "xy_bin_custom_high", opt = "xyBinCustomHigh", bool = FALSE, default = "#1f77b4"),
    list(arg = "xy_bin_max_opacity", opt = "xyBinMaxOpacity", bool = FALSE, default = 0.9),
    list(arg = "xy_bin_legend_scale", opt = "xyBinLegendScale", bool = FALSE, default = 1),
    list(arg = "xy_bin_legend_color", opt = "xyBinLegendColor", bool = FALSE, default = ""),
    list(arg = "xy_bin_legend_dx", opt = "xyBinLegendDX", bool = FALSE, default = 0),
    list(arg = "xy_bin_legend_dy", opt = "xyBinLegendDY", bool = FALSE, default = 0),
    list(arg = "xy_bin_legend_title", opt = "xyBinLegendTitle", bool = FALSE, default = "Count"),
    list(arg = "xy_bin_legend_orient", opt = "xyBinLegendOrient", bool = FALSE, default = "vertical"),
    list(arg = "xy_bin_legend_ticks", opt = "xyBinLegendTicks", bool = FALSE, default = 2),
    list(arg = "xy_x_scale", opt = "xyXScale", bool = FALSE, default = "linear"),
    list(arg = "xy_y_scale", opt = "xyYScale", bool = FALSE, default = "linear"),
    list(arg = "xy_fit_width", opt = "xyFitWidth", bool = FALSE, default = 2),
    list(arg = "xy_fit_style", opt = "xyFitStyle", bool = FALSE, default = "solid"),
    list(arg = "xy_fit_color", opt = "xyFitColor", bool = FALSE, default = "#1f77b4"),
    list(arg = "xy_ci_opacity", opt = "xyCIOpacity", bool = FALSE, default = 0.2),
    list(arg = "xy_hidden_fit_groups", opt = "xyHiddenFitGroups", bool = FALSE, default = list()),
    list(arg = "fit_group_overrides", opt = "fitGroupOverrides", bool = FALSE, default = list()),
    list(arg = "xy_hidden_groups", opt = "xyHiddenGroups", bool = FALSE, default = list()),
    list(arg = "xy_stats_position", opt = "xyStatsPosition", bool = FALSE, default = "topright"),
    list(arg = "xy_stats_decimals", opt = "xyStatsDecimals", bool = FALSE, default = 2),
    list(arg = "xy_stats_font_size", opt = "xyStatsFontSize", bool = FALSE, default = 11),
    list(arg = "xy_stats_offset_x", opt = "xyStatsOffsetX", bool = FALSE, default = 0),
    list(arg = "xy_stats_offset_y", opt = "xyStatsOffsetY", bool = FALSE, default = 0),
    list(arg = "xy_stats_width", opt = "xyStatsWidth", bool = FALSE, default = 0),
    list(arg = "xy_stats_height", opt = "xyStatsHeight", bool = FALSE, default = 0),
    list(arg = "xy_rug", opt = "xyRug", bool = FALSE, default = "none"),
    list(arg = "xy_rug_length", opt = "xyRugLength", bool = FALSE, default = 6),
    list(arg = "xy_rug_width", opt = "xyRugWidth", bool = FALSE, default = 0.75),
    list(arg = "xy_rug_opacity", opt = "xyRugOpacity", bool = FALSE, default = 0.4),
    list(arg = "xy_rug_color", opt = "xyRugColor", bool = FALSE, default = "#444444"),
    list(arg = "xy_marginal_axes", opt = "xyMarginalAxes", bool = FALSE, default = "both"),
    list(arg = "xy_marginal_size", opt = "xyMarginalSize", bool = FALSE, default = 50),
    list(arg = "xy_marginal_opacity", opt = "xyMarginalOpacity", bool = FALSE, default = 0.45),
    list(arg = "xy_marginal_color", opt = "xyMarginalColor", bool = FALSE, default = "#5a8db8"),
    list(arg = "x_min", opt = "xMin", bool = FALSE, default = 0),
    list(arg = "x_max", opt = "xMax", bool = FALSE, default = 0),
    list(arg = "x_interval", opt = "xInterval", bool = FALSE, default = 0),
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
    list(arg = "facet_x_tick_labels", opt = "facetXTickLabels", bool = FALSE, default = "all"),
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
    list(arg = "line_point_size", opt = "linePointSize", bool = FALSE, default = 7),
    list(arg = "line_point_shape", opt = "linePointShape", bool = FALSE, default = "circle"),
    list(arg = "line_point_outline_width", opt = "linePointOutlineWidth", bool = FALSE, default = 0),
    list(arg = "line_point_outline_color", opt = "linePointOutlineColor", bool = FALSE, default = "#000000"),
    list(arg = "line_group_overrides", opt = "lineGroupOverrides", bool = FALSE, default = list()),
    list(arg = "point_scatter", opt = "pointScatter", bool = FALSE, default = "jitter"),
    list(arg = "point_shape", opt = "pointShape", bool = FALSE, default = "circle"),
    list(arg = "point_size", opt = "pointSize", bool = FALSE, default = 3),
    list(arg = "point_spread_width", opt = "pointSpreadWidth", bool = FALSE, default = 0.15),
    list(arg = "point_opacity", opt = "pointOpacity", bool = FALSE, default = 0.6),
    list(arg = "point_color", opt = "pointColor", bool = FALSE, default = ""),
    list(arg = "point_outline_width", opt = "pointOutlineWidth", bool = FALSE, default = 0.25),
    list(arg = "point_outline_color", opt = "pointOutlineColor", bool = FALSE, default = "#000000"),
    list(arg = "xy_point_color_match", opt = "xyPointColorMatch", bool = TRUE, default = TRUE),
    list(arg = "xy_show_ellipse", opt = "xyShowEllipse", bool = TRUE, default = FALSE),
    list(arg = "xy_ellipse_fill", opt = "xyEllipseFill", bool = TRUE, default = TRUE),
    list(arg = "xy_ellipse_color_match", opt = "xyEllipseColorMatch", bool = TRUE, default = TRUE),
    list(arg = "xy_show_outliers", opt = "xyShowOutliers", bool = TRUE, default = FALSE),
    list(arg = "xy_outlier_label", opt = "xyOutlierLabel", bool = TRUE, default = FALSE),
    list(arg = "xy_density2d_fill", opt = "xyDensity2DFill", bool = TRUE, default = FALSE),
    list(arg = "xy_density2d_color_match", opt = "xyDensity2DColorMatch", bool = TRUE, default = TRUE),
    list(arg = "xy_bin_show_points", opt = "xyBinShowPoints", bool = TRUE, default = FALSE),
    list(arg = "xy_bin_legend_show", opt = "xyBinLegendShow", bool = TRUE, default = TRUE),
    list(arg = "xy_reverse_x", opt = "xyReverseX", bool = TRUE, default = FALSE),
    list(arg = "xy_reverse_y", opt = "xyReverseY", bool = TRUE, default = FALSE),
    list(arg = "xy_show_fit", opt = "xyShowFit", bool = TRUE, default = FALSE),
    list(arg = "xy_fit_full_range", opt = "xyFitFullRange", bool = TRUE, default = TRUE),
    list(arg = "xy_fit_color_match", opt = "xyFitColorMatch", bool = TRUE, default = TRUE),
    list(arg = "xy_show_ci", opt = "xyShowCI", bool = TRUE, default = FALSE),
    list(arg = "xy_show_stats", opt = "xyShowStats", bool = TRUE, default = FALSE),
    list(arg = "xy_stats_show_r", opt = "xyStatsShowR", bool = TRUE, default = TRUE),
    list(arg = "xy_stats_show_p", opt = "xyStatsShowP", bool = TRUE, default = TRUE),
    list(arg = "xy_stats_show_n", opt = "xyStatsShowN", bool = TRUE, default = TRUE),
    list(arg = "xy_stats_show_r2", opt = "xyStatsShowR2", bool = TRUE, default = FALSE),
    list(arg = "xy_stats_show_eqn", opt = "xyStatsShowEqn", bool = TRUE, default = FALSE),
    list(arg = "xy_stats_plate", opt = "xyStatsPlate", bool = TRUE, default = TRUE),
    list(arg = "xy_rug_color_match", opt = "xyRugColorMatch", bool = TRUE, default = TRUE),
    list(arg = "xy_marginal_color_match", opt = "xyMarginalColorMatch", bool = TRUE, default = TRUE),
    list(arg = "x_min_override", opt = "xMinOverride", bool = TRUE, default = FALSE),
    list(arg = "x_max_override", opt = "xMaxOverride", bool = TRUE, default = FALSE),
    list(arg = "x_interval_override", opt = "xIntervalOverride", bool = TRUE, default = FALSE),
    list(arg = "facet_strip_show", opt = "facetStripShow", bool = TRUE, default = TRUE),
    list(arg = "facet_strip_underline", opt = "facetStripUnderline", bool = TRUE, default = TRUE),
    list(arg = "facet_border", opt = "facetBorder", bool = TRUE, default = FALSE),
    list(arg = "facet_drop_empty", opt = "facetDropEmpty", bool = TRUE, default = FALSE),
    list(arg = "facet_free_y", opt = "facetFreeY", bool = TRUE, default = FALSE),
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
    list(arg = "show_line_points", opt = "showLinePoints", bool = TRUE, default = TRUE),
    list(arg = "point_color_match", opt = "pointColorMatch", bool = TRUE, default = TRUE)
)

xyplotbuilderClass <- if (requireNamespace('jmvcore', quietly = TRUE)) R6::R6Class(
    "xyplotbuilderClass",
    inherit = xyplotbuilderBase,
    private = list(
        # Aggregation cache: the whole computed-artifact bundle
        # (points incl. residuals, lm/loess fits, ellipses, marginals,
        # bin tiles, stats) keyed by (plotted columns + data-shaping
        # options), identical()-compared like the d2d KDE cache below.
        # Style-only commits skip every fit. See .run().
        .aggCache = NULL,
        # --- Perf: cache the heavy 2-D density KDE across runs ---
        # The analysis object persists between option changes, so a KDE
        # computed for a given (x, y, group, grid) is reused whenever a
        # later option change doesn't alter the plotted data — turning the
        # ~100 ms/group kde2d into a no-op for appearance-only edits (the
        # dominant cost behind the left-panel "1-2 s" lag).
        .d2dKdeCache = NULL,
        .init = function() {
            gb2_init_script_src(self$results$widget)
        },
        # Sticky flag: set TRUE the first time the user enables 2-D
        # density this session. Once set, the (cached) kde2d keeps being
        # computed even when the overlay is toggled off, so re-showing it
        # is an instant widget-side flip instead of an R round-trip. Only
        # the very first enable pays the round-trip.
        .d2dEverEnabled = FALSE,
        # Same sticky pattern for marginals + tile bins: once shown this
        # session, keep computing their geometry so toggling/switching
        # them from the chart is instant (only the first enable round-trips).
        .marginalEverShown = FALSE,
        .binEverShown = FALSE,
        # Optional phase timing → ~/gb2_perf.log, active only while the
        # sentinel file ~/.gb2_perf exists (so it's off in normal use).
        .perfLast = NULL,
        .perf = function(label) {
            if (!file.exists(path.expand("~/.gb2_perf"))) return(invisible())
            now <- Sys.time()
            if (!is.null(private$.perfLast)) {
                ms <- as.numeric(difftime(now, private$.perfLast,
                                          units = "secs")) * 1000
                try(cat(sprintf("[%s] %-24s %8.1f ms\n",
                    format(now, "%H:%M:%OS3"), label, ms),
                    file = path.expand("~/gb2_perf.log"), append = TRUE),
                    silent = TRUE)
            }
            private$.perfLast <- now
        },
        .run = function() {
            # Wall-clock at run entry: feeds the debug overlay's "R
            # prelude" line + run-entry->paint gap (speed pass Phase 0).
            run_t0 <- as.numeric(Sys.time())
            private$.perfLast <- Sys.time()
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
            sizeVar <- self$options$sizeVar
            labelVar <- self$options$labelVar
            has_group <- !gb_family_is_missing(groupVar)
            has_facet <- !gb_family_is_missing(facetVar)
            has_size <- !gb_family_is_missing(sizeVar)
            has_label <- !gb_family_is_missing(labelVar)

            if (is.null(data) || nrow(data) == 0 ||
                gb_family_is_missing(xvar) || gb_family_is_missing(yvar)) {
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
            # Capture factor levels BEFORE coercion so the widget
            # can label integer positions on the axis with the
            # original level names. as.numeric(factor) returns the
            # underlying integer codes (1..N) — perfect for
            # plotting an ordinal scale. Numeric / continuous
            # variables stay numeric; their level arrays are
            # empty and the widget skips the override path.
            xy_x_levels <- if (is.factor(data[[xvar]]))
                as.character(levels(data[[xvar]])) else character(0)
            xy_y_levels <- if (is.factor(data[[yvar]]))
                as.character(levels(data[[yvar]])) else character(0)
            # UNORDERED categoricals specifically (jamovi ships an ordinal
            # measure type as an ORDERED factor, the is.ordered convention
            # helpmechoose already relies on). The Check-graph rule needs
            # the distinction: an ordered scale plotted by rank is a
            # defensible approximation, whereas a fit line across
            # unordered categories is computed on codes an arbitrary
            # reordering would change.
            xy_x_nominal <- is.factor(data[[xvar]]) && !is.ordered(data[[xvar]])
            xy_y_nominal <- is.factor(data[[yvar]]) && !is.ordered(data[[yvar]])
            # Coerce to numeric and drop any row with a non-finite
            # X or Y. groupVar / facetVar stay as factors so their
            # levels are stable.
            df[[xvar]] <- as.numeric(df[[xvar]])
            df[[yvar]] <- as.numeric(df[[yvar]])
            if (has_group)
                df[[groupVar]] <- as.factor(df[[groupVar]])
            if (has_facet)
                df[[facetVar]] <- as.factor(df[[facetVar]])
            # Missing-data disclosure. Scatter draws RAW per-row points,
            # so a row leaves the DRAWN chart only when x or y is
            # non-finite - or, when faceted, its facet is NA (that point
            # matches no panel and is dropped). An NA GROUP value is
            # still plotted (as an ungrouped point), so it is NOT an
            # exclusion; counting it would over-report and contradict
            # the chart. (Unlike the aggregating modules, whose
            # droplevels() genuinely drops NA-group rows.)
            n_rows_total <- nrow(df)
            complete_rows <- is.finite(df[[xvar]]) & is.finite(df[[yvar]])
            if (has_facet) complete_rows <- complete_rows & !is.na(df[[facetVar]])
            n_rows_missing <- n_rows_total - sum(complete_rows)
            missing_note <- if (n_rows_missing > 0)
                sprintf("%d of %d cases not shown (missing values)",
                        n_rows_missing, n_rows_total) else ""
            df <- df[is.finite(df[[xvar]]) & is.finite(df[[yvar]]),
                     , drop = FALSE]

            group_levels <- if (has_group)
                levels(droplevels(df[[groupVar]])) else NULL
            facet_levels <- if (has_facet)
                levels(droplevels(df[[facetVar]])) else NULL

            # ---- Aggregation cache: everything from here to the bars
            # placeholder below derives ONLY from the plotted columns +
            # the data-shaping options in this signature. Style-only
            # commits (the overwhelming majority of inspector round
            # trips) restore the bundle and skip the lm/loess fits,
            # ellipses, marginals and bin tiles entirely. The sticky
            # ever-shown flags are included so their one-time flips
            # recompute; identical() on raw columns makes data edits
            # invalidate exactly (same pattern as the d2d KDE cache).
            agg_sig <- list(
                vars = c(xvar, yvar,
                         if (has_group) groupVar else "",
                         if (has_facet) facetVar else "",
                         if (has_size) sizeVar else "",
                         if (has_label) labelVar else ""),
                x = df[[xvar]],
                y = df[[yvar]],
                g = if (has_group) df[[groupVar]] else NULL,
                f = if (has_facet) df[[facetVar]] else NULL,
                s = if (has_size) df[[sizeVar]] else NULL,
                lbl = if (has_label) as.character(df[[labelVar]]) else NULL,
                opts = list(
                    fit = self$options$xyFitType,
                    span = self$options$xyLoessSpan,
                    ci = self$options$xyCILevel,
                    ell = self$options$xyEllipseLevel,
                    d2d = isTRUE(self$options$xyShowDensity2D),
                    d2dEver = isTRUE(private$.d2dEverEnabled),
                    d2dLv = self$options$xyDensity2DLevels,
                    marg = self$options$xyMarginal,
                    margBins = self$options$xyMarginalBins,
                    margEver = isTRUE(private$.marginalEverShown),
                    bin = self$options$xyBin,
                    binN = self$options$xyBinCount,
                    binEver = isTRUE(private$.binEverShown),
                    corr = self$options$xyStatsCorrType
                )
            )
            if (!is.null(private$.aggCache)
                && identical(private$.aggCache$sig, agg_sig)) {
                a <- private$.aggCache$art
                xy_points <- a$xy_points
                xy_fits <- a$xy_fits
                xy_ellipses <- a$xy_ellipses
                xy_density2d <- a$xy_density2d
                xy_bins <- a$xy_bins
                xy_bins_max <- a$xy_bins_max
                xy_marginal_x_hist <- a$xy_marginal_x_hist
                xy_marginal_x_dens <- a$xy_marginal_x_dens
                xy_marginal_y_hist <- a$xy_marginal_y_hist
                xy_marginal_y_dens <- a$xy_marginal_y_dens
                xy_marginal_x_hist_groups <- a$xy_marginal_x_hist_groups
                xy_marginal_x_dens_groups <- a$xy_marginal_x_dens_groups
                xy_marginal_y_hist_groups <- a$xy_marginal_y_hist_groups
                xy_marginal_y_dens_groups <- a$xy_marginal_y_dens_groups
                xy_stats <- a$xy_stats
                xy_size_min <- a$xy_size_min
                xy_size_max <- a$xy_size_max
                private$.perf("aggregate [CACHED]")
            } else {
            # Build xyPoints: one entry per observation. The widget
            # renders points at (toPxX(x), toPxY(y)) with color per
            # group when groupVar is set. Empty array when data has
            # no finite (x, y) pairs.
            #
            # Shared per-group linear lm pool. Fit one lm(y ~ x)
            # per group up-front; downstream blocks (linear fit
            # line, stats-overlay slope/intercept/R², outlier
            # residuals) all read from this pool instead of
            # re-fitting. Cuts ~2/3 of the lm() calls that used
            # to happen on every render. Key is as.character(g)
            # so factor levels stable across the call.
            #
            # IMPORTANT: the predictor name in the formula must
            # match the column name in the newdata passed to
            # predict() downstream — fit-line block uses
            # `data.frame(g_x = x_seq)`, so the lm formula has
            # to use g_x too. Otherwise predict() silently
            # ignores newdata and returns the training fitted
            # values, which is N rows instead of length(x_seq).
            group_lm_pool <- list()
            pool_groups <- if (has_group) group_levels else list("__all__")
            for (pg in pool_groups) {
                pg_mask <- if (has_group) df[[groupVar]] == pg
                           else rep(TRUE, nrow(df))
                pg_idx <- which(pg_mask
                                & is.finite(df[[xvar]])
                                & is.finite(df[[yvar]]))
                if (length(pg_idx) < 2) next
                g_x <- df[[xvar]][pg_idx]
                g_y <- df[[yvar]][pg_idx]
                pg_fit <- tryCatch(stats::lm(g_y ~ g_x),
                                   error = function(e) NULL)
                pg_x_lo <- min(g_x); pg_x_hi <- max(g_x)
                group_lm_pool[[as.character(pg)]] <- list(
                    fit = pg_fit,
                    idx = pg_idx,
                    x = g_x, y = g_y,
                    x_lo = pg_x_lo, x_hi = pg_x_hi,
                    n = length(g_x)
                )
            }

            # Standardized residuals for the outlier overlay.
            # ALWAYS computed (cheap: residuals of the already-fitted
            # per-group lms ÷ their sd) so toggling the outlier overlay
            # is an INSTANT widget-side show/hide rather than an R round-
            # trip. The widget gates the rings on data.xyShowOutliers, so
            # the values just sit in the payload until the user wants them.
            residuals_by_row <- rep(NA_real_, nrow(df))
            if (TRUE) {
                for (rg_key in names(group_lm_pool)) {
                    rg_entry <- group_lm_pool[[rg_key]]
                    if (is.null(rg_entry) || is.null(rg_entry$fit)) next
                    if (rg_entry$n < 3) next
                    rg_res <- as.numeric(stats::residuals(rg_entry$fit))
                    if (length(rg_res) != length(rg_entry$idx)) next
                    rg_sd <- stats::sd(rg_res)
                    if (!is.finite(rg_sd) || rg_sd <= 0) next
                    residuals_by_row[rg_entry$idx] <- rg_res / rg_sd
                }
            }
            # Emit xyPoints as PARALLEL ARRAYS, not array-of-
            # objects. jsonlite::toJSON serializes flat numeric /
            # character vectors ~10× faster than a list of N
            # tiny lists, and the JSON output is also ~3× smaller
            # (no repeated field names). For a dataset with 60
            # observations this brings R JSON serialization from
            # ~180 ms down to ~25 ms.
            #
            # The widget normalizes back to array-of-objects at
            # the top of render() (O(N), <1 ms) so every
            # downstream renderer keeps its existing per-point
            # access pattern unchanged.
            xy_points <- list(
                parallel = TRUE,
                xs = as.numeric(df[[xvar]]),
                ys = as.numeric(df[[yvar]]),
                rows = as.integer(seq_len(nrow(df))),
                residual_stds = as.numeric(residuals_by_row)
            )
            if (has_group) {
                xy_points$groups <- as.character(df[[groupVar]])
            }
            if (has_facet) {
                xy_points$facets <- as.character(df[[facetVar]])
            }
            # Per-point labels (an ID / name column). NA labels ship as
            # empty strings; the widget draws nothing for those points.
            if (has_label) {
                lbl_chr <- as.character(df[[labelVar]])
                lbl_chr[is.na(lbl_chr)] <- ""
                xy_points$labels <- lbl_chr
            }
            # Bubble: per-point size values (the widget scales them
            # area-proportionally into a pixel-radius range). NA-safe —
            # the widget falls back to the default point size for any
            # non-finite size. Range is shipped for the size legend.
            xy_size_min <- 0; xy_size_max <- 1
            if (has_size) {
                size_vals <- suppressWarnings(as.numeric(df[[sizeVar]]))
                xy_points$sizes <- as.numeric(size_vals)
                size_finite <- size_vals[is.finite(size_vals)]
                if (length(size_finite) > 0) {
                    xy_size_min <- min(size_finite)
                    xy_size_max <- max(size_finite)
                }
            }

            # Compute per-group fit lines. For each group's subset
            # of points, fit y ~ x and emit the fitted line
            # vertices (with optional 95% CI band). The widget
            # reads data.xyFits and draws lines over the points
            # layer.
            #
            # Two fit types share this code path:
            #   - "linear": OLS via stats::lm — analytic CI from
            #     predict(..., interval = "confidence").
            #   - "loess":  local-regression smooth via stats::loess
            #     with the user-supplied span (default 0.75). CI is
            #     built from predict(..., se = TRUE): the fitted
            #     value ± t_{0.975, df} * se.fit (Student-t,
            #     matching ggplot2 stat_smooth).
            #
            # Both branches produce the same {x, y, lwr, upr} shape
            # per vertex, so the widget renders them identically.
            # Always compute fits + CI bounds (regardless of the
            # xyShowFit / xyShowCI toggles), so flipping those
            # toggles in the inspector is an INSTANT widget-side
            # show/hide rather than a ~1 s R round-trip. Widget
            # gates rendering on data.xyShowFit / data.xyShowCI,
            # so the unused data just sits in the payload at low
            # cost (a couple hundred predict() rows total).
            xy_fits <- list()
            if (nrow(df) >= 2) {
                fit_groups <- if (has_group) group_levels else list("__all__")
                show_ci   <- TRUE
                fit_type  <- self$options$xyFitType
                if (!nzchar(fit_type)) fit_type <- "linear"
                loess_span <- self$options$xyLoessSpan
                if (!is.numeric(loess_span) || !is.finite(loess_span)
                    || loess_span <= 0) loess_span <- 0.75
                ci_level <- self$options$xyCILevel
                if (!is.numeric(ci_level) || !is.finite(ci_level)
                    || ci_level <= 0 || ci_level >= 1) ci_level <- 0.95
                for (g in fit_groups) {
                    # Reuse the shared linear fit + cached x/y
                    # vectors from group_lm_pool. Loess and the
                    # polynomial branches still fit their own
                    # model (lm with poly() / loess) since their
                    # structure differs from the baseline lm.
                    pool_entry <- group_lm_pool[[as.character(g)]]
                    if (is.null(pool_entry)) next
                    g_x <- pool_entry$x
                    g_y <- pool_entry$y
                    # Minimum N per fit type:
                    #   linear: 2 (CI prefers 3+ but ok)
                    #   poly2:  3 (need at least one degree of
                    #     freedom for the residual variance)
                    #   poly3:  4 (same logic)
                    #   loess:  4 (span fit needs neighbors)
                    min_n <- if (fit_type == "loess") 4L
                             else if (fit_type == "poly3") 4L
                             else if (fit_type == "poly2") 3L
                             else 2L
                    if (length(g_x) < min_n) next
                    x_lo <- pool_entry$x_lo; x_hi <- pool_entry$x_hi
                    if (!is.finite(x_lo) || !is.finite(x_hi)
                        || x_hi <= x_lo) next
                    # 100 evenly spaced X positions across the
                    # group's data range gives a smooth-enough line
                    # for both fit types.
                    x_seq <- seq(x_lo, x_hi, length.out = 100)

                    fit_entry <- list(
                        group = if (has_group) g else NULL,
                        # Widget reads this to decide whether to
                        # extrapolate the line / CI band out to the
                        # chart's x edges. Loess is only valid inside
                        # the data's convex hull, so extending it can
                        # produce wild slopes — the widget stops loess
                        # at the data range.
                        fit_type = fit_type
                    )
                    branch_ok <- FALSE

                    if (fit_type == "loess") {
                        # stats::loess returns NA outside the data's
                        # convex hull by default; we already clamp
                        # x_seq to [x_lo, x_hi] so no NAs should
                        # arise from extrapolation.
                        fit <- tryCatch(
                            stats::loess(g_y ~ g_x,
                                         span = loess_span,
                                         na.action = stats::na.omit),
                            error = function(e) NULL,
                            warning = function(w) {
                                tryCatch(
                                    suppressWarnings(stats::loess(
                                        g_y ~ g_x,
                                        span = loess_span,
                                        na.action = stats::na.omit)),
                                    error = function(e) NULL
                                )
                            }
                        )
                        if (is.null(fit)) next
                        nd <- data.frame(g_x = x_seq)
                        pred <- tryCatch(
                            stats::predict(fit, newdata = nd,
                                           se = show_ci),
                            error = function(e) NULL
                        )
                        if (is.null(pred)) next
                        if (show_ci && is.list(pred)
                            && !is.null(pred$fit)
                            && !is.null(pred$se.fit)) {
                            # Student-t critical value with the
                            # effective residual df from loess.
                            tcrit <- tryCatch(
                                stats::qt(1 - (1 - ci_level) / 2,
                                          df = fit$enp),
                                error = function(e) 1.96
                            )
                            if (!is.finite(tcrit)) tcrit <- 1.96
                            yhat <- as.numeric(pred$fit)
                            yse  <- as.numeric(pred$se.fit)
                            lwr  <- yhat - tcrit * yse
                            upr  <- yhat + tcrit * yse
                            # Parallel-arrays wire format — see
                            # xy_points refactor above. Widget
                            # zips back to array-of-objects at
                            # render(). Cuts xy_fits JSON time
                            # ~5× vs the lapply-of-tiny-lists.
                            fit_entry$points <- list(
                                parallel = TRUE,
                                xs   = as.numeric(x_seq),
                                ys   = as.numeric(yhat),
                                lwrs = as.numeric(lwr),
                                uprs = as.numeric(upr)
                            )
                        } else {
                            yhat <- as.numeric(if (is.list(pred)) pred$fit else pred)
                            fit_entry$points <- list(
                                parallel = TRUE,
                                xs = as.numeric(x_seq),
                                ys = as.numeric(yhat)
                            )
                        }
                        branch_ok <- TRUE
                    } else {
                        # lm-based fits (linear / poly2 / poly3)
                        # all use the same analytic CI from
                        # predict(..., interval = "confidence").
                        # Only the model formula varies. We build
                        # the formula with stats::poly so the
                        # design is orthogonal (numerically
                        # stabler than raw x^2 / x^3 columns).
                        poly_deg <- if (fit_type == "poly2") 2L
                                    else if (fit_type == "poly3") 3L
                                    else 1L
                        fit <- if (poly_deg == 1L) {
                            # Reuse the shared linear lm — same
                            # formula, no need to refit.
                            pool_entry$fit
                        } else {
                            # Wrap in tryCatch — poly() fails when
                            # there are fewer unique x values than
                            # the degree.
                            tryCatch(stats::lm(g_y ~ stats::poly(g_x, poly_deg)),
                                     error = function(e) NULL)
                        }
                        if (is.null(fit)) next
                        nd <- data.frame(g_x = x_seq)
                        pred <- if (show_ci) {
                            tryCatch(
                                stats::predict(fit, newdata = nd,
                                               interval = "confidence",
                                               level = ci_level),
                                error = function(e) NULL
                            )
                        } else {
                            tryCatch(
                                stats::predict(fit, newdata = nd),
                                error = function(e) NULL
                            )
                        }
                        if (is.null(pred)) next
                        if (show_ci && is.matrix(pred)) {
                            fit_entry$points <- list(
                                parallel = TRUE,
                                xs   = as.numeric(x_seq),
                                ys   = as.numeric(pred[, "fit"]),
                                lwrs = as.numeric(pred[, "lwr"]),
                                uprs = as.numeric(pred[, "upr"])
                            )
                        } else {
                            yhat <- as.numeric(pred)
                            fit_entry$points <- list(
                                parallel = TRUE,
                                xs = as.numeric(x_seq),
                                ys = as.numeric(yhat)
                            )
                        }
                        branch_ok <- TRUE
                    }

                    if (branch_ok) {
                        xy_fits[[length(xy_fits) + 1L]] <- fit_entry
                    }
                }
            }

            # Correlation statistics. Per-group cor.test() —
            # method selectable (Pearson / Spearman / Kendall).
            # When ungrouped, one entry with group = NULL. Need >= 3
            # finite observations per cell, else skip (cor.test
            # errors below that threshold).
            # Compute correlation stats unconditionally for the
            # same instant-toggle reason as the fit block above.
            # cor.test + lm per group is cheap; the overlay just
            # isn't drawn when xyShowStats is FALSE.
            xy_stats <- list()
            if (TRUE) {
                corr_type <- self$options$xyStatsCorrType
                if (!nzchar(corr_type)) corr_type <- "pearson"
                stat_groups <- if (has_group) group_levels else list(NA)
                # Facet-aware: when faceting is on, compute stats
                # within each facet level (× group) so each wrap
                # panel can show its own correlation rather than the
                # pooled-across-facets numbers. Each row is tagged
                # with `facet`; the widget filters by panel. When
                # ungrouped/unfaceted this collapses to the original
                # single per-group pass. The lm() is fit fresh per
                # cell (group_lm_pool pools facets, so it can't be
                # reused here) — for the non-faceted case that yields
                # the same R²/equation as before (same data).
                stat_facets <- if (has_facet) facet_levels else list(NA)
                for (fl in stat_facets) {
                    facet_mask <- if (has_facet)
                        (as.character(df[[facetVar]]) == as.character(fl))
                        else rep(TRUE, nrow(df))
                    for (sg in stat_groups) {
                        grp_mask <- if (has_group) (df[[groupVar]] == sg)
                                    else rep(TRUE, nrow(df))
                        cell_mask <- facet_mask & grp_mask
                        cell_mask[is.na(cell_mask)] <- FALSE
                        sg_x_raw <- df[[xvar]][cell_mask]
                        sg_y_raw <- df[[yvar]][cell_mask]
                        sg_ok <- is.finite(sg_x_raw) & is.finite(sg_y_raw)
                        sg_x <- sg_x_raw[sg_ok]
                        sg_y <- sg_y_raw[sg_ok]
                        if (length(sg_x) < 3) next
                        ct <- tryCatch(
                            stats::cor.test(sg_x, sg_y, method = corr_type),
                            error = function(e) NULL,
                            warning = function(w) {
                                # Ties in Spearman / Kendall emit a
                                # warning but still produce a usable
                                # estimate; rerun suppressing.
                                tryCatch(
                                    suppressWarnings(stats::cor.test(
                                        sg_x, sg_y, method = corr_type)),
                                    error = function(e) NULL
                                )
                            }
                        )
                        if (is.null(ct)) next
                        entry <- list(
                            n = length(sg_x),
                            r = as.numeric(ct$estimate),
                            p = as.numeric(ct$p.value),
                            method = corr_type
                        )
                        # Linear lm() fit for R² / equation overlays,
                        # fit on this cell's points.
                        lm_fit <- tryCatch(
                            stats::lm(sg_y ~ sg_x),
                            error = function(e) NULL,
                            warning = function(w) NULL
                        )
                        if (!is.null(lm_fit)) {
                            entry$r2 <- as.numeric(
                                summary(lm_fit)$r.squared
                            )
                            co <- stats::coef(lm_fit)
                            if (length(co) >= 2L
                                && is.finite(co[1L])
                                && is.finite(co[2L])) {
                                entry$intercept <- as.numeric(co[1L])
                                entry$slope     <- as.numeric(co[2L])
                            }
                        }
                        # Sigma stats panel (Jul 2026): ship BOTH
                        # correlation flavors regardless of the overlay's
                        # selected method, so the panel shows Pearson and
                        # Spearman side by side with no R round-trip.
                        pe <- tryCatch(suppressWarnings(
                            stats::cor.test(sg_x, sg_y, method = "pearson")),
                            error = function(e) NULL)
                        if (!is.null(pe)) {
                            entry$pearsonR <- as.numeric(pe$estimate)
                            entry$pearsonP <- as.numeric(pe$p.value)
                        }
                        sp <- tryCatch(suppressWarnings(
                            stats::cor.test(sg_x, sg_y, method = "spearman")),
                            error = function(e) NULL)
                        if (!is.null(sp)) {
                            entry$rho <- as.numeric(sp$estimate)
                            entry$rhoP <- as.numeric(sp$p.value)
                        }
                        if (has_group) entry$group <- as.character(sg)
                        if (has_facet) entry$facet <- as.character(fl)
                        xy_stats[[length(xy_stats) + 1L]] <- entry
                    }
                }
            }

            # Marginal distributions (histogram or density) along
            # X and Y. Both shapes are ALWAYS computed (when
            # there's enough data) so toggling the inspector's
            # Type strip between Histogram and Density is a
            # widget-side render flip rather than an R round-trip.
            # Eight arrays go out:
            #   xy_marginal_x_hist / xy_marginal_x_dens         — global X
            #   xy_marginal_y_hist / xy_marginal_y_dens         — global Y
            #   xy_marginal_x_hist_groups / xy_marginal_x_dens_groups — per-group X
            #   xy_marginal_y_hist_groups / xy_marginal_y_dens_groups — per-group Y
            # Widget picks two of them based on data.xyMarginal.
            xy_marginal_x_hist <- list()
            xy_marginal_x_dens <- list()
            xy_marginal_y_hist <- list()
            xy_marginal_y_dens <- list()
            xy_marginal_x_hist_groups <- list()
            xy_marginal_x_dens_groups <- list()
            xy_marginal_y_hist_groups <- list()
            xy_marginal_y_dens_groups <- list()
            # Sticky + always-both: once marginals have been shown this
            # session, keep computing BOTH histogram and density variants
            # so the widget can switch type / toggle them on and off
            # INSTANTLY (no R round-trip). Only the very first enable pays
            # a round-trip.
            m_type_top <- self$options$xyMarginal
            if (!nzchar(m_type_top)) m_type_top <- "none"
            if (m_type_top %in% c("histogram", "density"))
                private$.marginalEverShown <- TRUE
            if ((m_type_top %in% c("histogram", "density")
                 || isTRUE(private$.marginalEverShown))
                && nrow(df) >= 2) {
                x_vals_all <- df[[xvar]][is.finite(df[[xvar]])]
                y_vals_all <- df[[yvar]][is.finite(df[[yvar]])]
                n_bins <- self$options$xyMarginalBins
                if (!is.numeric(n_bins) || !is.finite(n_bins)
                    || n_bins < 2) n_bins <- 30L
                n_bins <- as.integer(n_bins)
                build_hist <- function(vals, breaks_override = NULL) {
                    if (length(vals) < 2) return(list())
                    br <- if (!is.null(breaks_override)) breaks_override
                          else pretty(vals, n = n_bins)
                    if (length(br) < 2) return(list())
                    h <- tryCatch(
                        graphics::hist(vals, breaks = br, plot = FALSE),
                        error = function(e) NULL,
                        warning = function(w) {
                            tryCatch(
                                suppressWarnings(
                                    graphics::hist(vals, breaks = br, plot = FALSE)),
                                error = function(e) NULL
                            )
                        }
                    )
                    if (is.null(h)) return(list())
                    out <- vector("list", length(h$counts))
                    for (i in seq_along(h$counts)) {
                        out[[i]] <- list(
                            start = as.numeric(h$breaks[i]),
                            end   = as.numeric(h$breaks[i + 1L]),
                            value = as.numeric(h$counts[i])
                        )
                    }
                    out
                }
                build_dens <- function(vals) {
                    if (length(vals) < 4) return(list())
                    d <- tryCatch(stats::density(vals),
                                  error = function(e) NULL)
                    if (is.null(d)) return(list())
                    out <- vector("list", length(d$x))
                    for (i in seq_along(d$x)) {
                        out[[i]] <- list(
                            x = as.numeric(d$x[i]),
                            y = as.numeric(d$y[i])
                        )
                    }
                    out
                }
                # Compute BOTH variants (X + Y, global + per-group) so a
                # histogram <-> density switch is an instant widget flip.
                xy_marginal_x_hist <- build_hist(x_vals_all)
                xy_marginal_y_hist <- build_hist(y_vals_all)
                xy_marginal_x_dens <- build_dens(x_vals_all)
                xy_marginal_y_dens <- build_dens(y_vals_all)
                if (has_group && length(group_levels) > 0) {
                    shared_br_x <- if (length(x_vals_all) >= 2)
                        pretty(x_vals_all, n = n_bins) else NULL
                    shared_br_y <- if (length(y_vals_all) >= 2)
                        pretty(y_vals_all, n = n_bins) else NULL
                    for (g in group_levels) {
                        g_mask <- df[[groupVar]] == g
                        g_x <- df[[xvar]][g_mask & is.finite(df[[xvar]])]
                        g_y <- df[[yvar]][g_mask & is.finite(df[[yvar]])]
                        g_lbl <- as.character(g)
                        xy_marginal_x_hist_groups[[length(xy_marginal_x_hist_groups) + 1L]] <-
                            list(group = g_lbl, rows = build_hist(g_x, shared_br_x))
                        xy_marginal_y_hist_groups[[length(xy_marginal_y_hist_groups) + 1L]] <-
                            list(group = g_lbl, rows = build_hist(g_y, shared_br_y))
                        xy_marginal_x_dens_groups[[length(xy_marginal_x_dens_groups) + 1L]] <-
                            list(group = g_lbl, rows = build_dens(g_x))
                        xy_marginal_y_dens_groups[[length(xy_marginal_y_dens_groups) + 1L]] <-
                            list(group = g_lbl, rows = build_dens(g_y))
                    }
                }
            }

            # Data ellipses (per-group bivariate Gaussian).
            # ALWAYS compute ellipses (cov + eigen per group, ~10-30ms)
            # so toggling them is an INSTANT widget-side show/hide rather
            # than an R round-trip. The widget gates drawing on
            # data.xyShowEllipse, so the perimeter points just sit in the
            # payload until the user turns the overlay on.
            xy_ellipses <- list()
            if (nrow(df) >= 3) {
                ell_level <- self$options$xyEllipseLevel
                if (!is.numeric(ell_level) || ell_level <= 0
                    || ell_level >= 1) ell_level <- 0.95
                chi <- tryCatch(stats::qchisq(ell_level, df = 2),
                                error = function(e) 5.991)
                if (!is.finite(chi) || chi <= 0) chi <- 5.991
                t_seq <- seq(0, 2 * pi, length.out = 100)
                ell_groups <- if (has_group) group_levels else list("__all__")
                for (eg in ell_groups) {
                    eg_mask <- if (has_group) df[[groupVar]] == eg
                               else rep(TRUE, nrow(df))
                    ex <- df[[xvar]][eg_mask]
                    ey <- df[[yvar]][eg_mask]
                    ok <- is.finite(ex) & is.finite(ey)
                    ex <- ex[ok]; ey <- ey[ok]
                    if (length(ex) < 3) next
                    mx <- mean(ex); my <- mean(ey)
                    S  <- tryCatch(stats::cov(cbind(ex, ey)),
                                   error = function(e) NULL)
                    if (is.null(S)) next
                    eig <- tryCatch(eigen(S, symmetric = TRUE),
                                    error = function(e) NULL)
                    if (is.null(eig)
                        || any(!is.finite(eig$values))
                        || any(eig$values <= 0)) next
                    # Principal axes scaled to the selected probability level.
                    a_vec <- sqrt(chi * eig$values[1]) * eig$vectors[, 1]
                    b_vec <- sqrt(chi * eig$values[2]) * eig$vectors[, 2]
                    ct <- cos(t_seq); st <- sin(t_seq)
                    px <- mx + ct * a_vec[1] + st * b_vec[1]
                    py <- my + ct * a_vec[2] + st * b_vec[2]
                    pts <- vector("list", length(t_seq))
                    for (k in seq_along(t_seq)) {
                        pts[[k]] <- list(
                            x = as.numeric(px[k]),
                            y = as.numeric(py[k])
                        )
                    }
                    entry <- list(points = pts)
                    if (has_group) entry$group <- as.character(eg)
                    xy_ellipses[[length(xy_ellipses) + 1L]] <- entry
                }
            }

            # Density contours (per-group bivariate KDE).
            # Gated on xyShowDensity2D — kde2d on a 100×100 grid
            # is BY FAR the heaviest single operation in this
            # analysis (~100 ms per group). Computing it on
            # every render even when contours are off was the
            # dominant cost in the "1-2 second delay" the user
            # observed. Net trade: first toggle of contours has
            # a brief delay; subsequent renders + first-render
            # are much faster.
            private$.perf("prep + fits + marginals")
            xy_density2d <- list()
            d2d_status <- "off"
            # 2-D density (kde2d) is the one genuinely expensive overlay,
            # so we DON'T always compute it. Instead it's "sticky": once
            # the user has enabled it this session, keep computing it (the
            # kde cache below makes that nearly free) so later show/hide
            # toggles are instant. Only the very first enable round-trips.
            if (isTRUE(self$options$xyShowDensity2D))
                private$.d2dEverEnabled <- TRUE
            if ((isTRUE(self$options$xyShowDensity2D)
                 || isTRUE(private$.d2dEverEnabled))
                && nrow(df) >= 5
                && requireNamespace("MASS", quietly = TRUE)) {
                d2d_levels_n <- self$options$xyDensity2DLevels
                if (!is.numeric(d2d_levels_n) || !is.finite(d2d_levels_n)
                    || d2d_levels_n < 1) d2d_levels_n <- 5
                d2d_levels_n <- max(1L, min(20L, as.integer(d2d_levels_n)))
                d2d_grid_n <- 100L
                d2d_groups <- if (has_group) group_levels else list("__all__")
                # The kde2d grids depend ONLY on the plotted x/y per group
                # and the grid size — not on contour levels, color,
                # opacity, etc. Cache them on the persisted analysis object
                # so an option change that doesn't alter the data reuses
                # them and skips the ~100 ms/group KDE. Contour extraction
                # (cheap) still runs each time, so a levels change is fast.
                d2d_sig <- list(
                    x = df[[xvar]], y = df[[yvar]],
                    g = if (has_group) as.character(df[[groupVar]]) else NULL,
                    groups = vapply(d2d_groups, as.character, character(1)),
                    grid = d2d_grid_n
                )
                if (!is.null(private$.d2dKdeCache) &&
                    identical(private$.d2dKdeCache$sig, d2d_sig)) {
                    d2d_kdes <- private$.d2dKdeCache$kdes
                    d2d_status <- "CACHED"
                } else {
                    d2d_kdes <- list()
                    for (dg in d2d_groups) {
                        dg_mask <- if (has_group) df[[groupVar]] == dg
                                   else rep(TRUE, nrow(df))
                        dx <- df[[xvar]][dg_mask & is.finite(df[[xvar]])]
                        dy <- df[[yvar]][dg_mask & is.finite(df[[yvar]])]
                        # KDE needs > a handful of points to be
                        # meaningful — skip sparse groups.
                        if (length(dx) < 5 || length(dy) < 5) next
                        if (length(dx) != length(dy)) next
                        # Expand the kde2d grid beyond the data range so the
                        # outermost density rings CLOSE instead of being
                        # clipped flat at the data bounding box. kde2d's
                        # default lims = range(data), so any ring that bulges
                        # past an extreme point gets cut off in a straight
                        # line (it ends mid-plot, short of the axes). Pad each
                        # axis by ~3 effective kernel SDs (0.75 * the kde2d
                        # bandwidth = 3 * bw.nrd), enough to enclose the
                        # 0.1*max outer ring. The widget mirrors this exact
                        # padding for its instant client-side preview so the
                        # two agree. Falls back to a span-fraction if the
                        # bandwidth is degenerate.
                        d2d_bw <- function(v) {
                            s <- stats::sd(v)
                            iqrh <- stats::IQR(v) / 1.34
                            h <- min(s, iqrh)
                            if (!is.finite(h) || h <= 0) h <- if (is.finite(s) && s > 0) s else 1
                            4 * 1.06 * h * length(v)^(-1 / 5)
                        }
                        d2d_xr <- range(dx); d2d_yr <- range(dy)
                        d2d_xp <- 0.75 * d2d_bw(dx)
                        d2d_yp <- 0.75 * d2d_bw(dy)
                        if (!is.finite(d2d_xp) || d2d_xp <= 0)
                            d2d_xp <- 0.2 * (d2d_xr[2] - d2d_xr[1])
                        if (!is.finite(d2d_yp) || d2d_yp <= 0)
                            d2d_yp <- 0.2 * (d2d_yr[2] - d2d_yr[1])
                        if (!is.finite(d2d_xp) || d2d_xp <= 0) d2d_xp <- 1
                        if (!is.finite(d2d_yp) || d2d_yp <= 0) d2d_yp <- 1
                        d2d_lims <- c(d2d_xr[1] - d2d_xp, d2d_xr[2] + d2d_xp,
                                      d2d_yr[1] - d2d_yp, d2d_yr[2] + d2d_yp)
                        kk <- tryCatch(
                            MASS::kde2d(dx, dy, n = d2d_grid_n, lims = d2d_lims),
                            error = function(e) NULL
                        )
                        if (!is.null(kk) && is.matrix(kk$z)) {
                            d2d_kdes[[as.character(dg)]] <- kk
                        }
                    }
                    private$.d2dKdeCache <- list(sig = d2d_sig, kdes = d2d_kdes)
                    d2d_status <- "COMPUTED"
                }
                for (dg in d2d_groups) {
                    kde <- d2d_kdes[[as.character(dg)]]
                    if (is.null(kde) || !is.matrix(kde$z)) next
                    z_max <- max(kde$z, na.rm = TRUE)
                    if (!is.finite(z_max) || z_max <= 0) next
                    # Evenly-spaced levels from a low fraction of
                    # max (so the outermost contour is meaningful,
                    # not a noise floor) up to just below max.
                    lvls <- seq(z_max * 0.1, z_max * 0.95,
                                length.out = d2d_levels_n)
                    cl <- tryCatch(
                        grDevices::contourLines(
                            x = kde$x, y = kde$y, z = kde$z,
                            levels = lvls),
                        error = function(e) NULL
                    )
                    if (is.null(cl) || length(cl) == 0) next
                    paths <- vector("list", length(cl))
                    for (ci in seq_along(cl)) {
                        line <- cl[[ci]]
                        if (is.null(line) || length(line$x) < 2) {
                            paths[[ci]] <- list(level = NA, points = list())
                            next
                        }
                        pts <- vector("list", length(line$x))
                        for (pi in seq_along(line$x)) {
                            pts[[pi]] <- list(
                                x = as.numeric(line$x[pi]),
                                y = as.numeric(line$y[pi])
                            )
                        }
                        paths[[ci]] <- list(
                            level = as.numeric(line$level),
                            points = pts
                        )
                    }
                    entry <- list(paths = paths)
                    if (has_group) entry$group <- as.character(dg)
                    xy_density2d[[length(xy_density2d) + 1L]] <- entry
                }
            }
            private$.perf(paste0("density2d [", d2d_status, "]"))

            # Tile bins (square heat-map). Gated on xyBin so
            # the cut() + table() doesn't fire on every render
            # when binning is off (typical case).
            xy_bins <- list()
            xy_bins_max <- 0L
            bin_mode_top <- self$options$xyBin
            if (!nzchar(bin_mode_top)) bin_mode_top <- "none"
            # Sticky: once tile-binning has been shown this session, keep
            # computing the grid so toggling it is instant (first enable
            # still round-trips).
            if (bin_mode_top != "none") private$.binEverShown <- TRUE
            n_bins_tile <- self$options$xyBinCount
            if (!is.numeric(n_bins_tile) || !is.finite(n_bins_tile)
                || n_bins_tile < 2) n_bins_tile <- 30L
            n_bins_tile <- max(2L, min(200L, as.integer(n_bins_tile)))
            tile_mask <- is.finite(df[[xvar]]) & is.finite(df[[yvar]])
            if ((bin_mode_top != "none" || isTRUE(private$.binEverShown))
                && sum(tile_mask) >= 5) {
                fx <- df[[xvar]][tile_mask]
                fy <- df[[yvar]][tile_mask]
                x_min_b <- min(fx); x_max_b <- max(fx)
                y_min_b <- min(fy); y_max_b <- max(fy)
                if (is.finite(x_min_b) && is.finite(x_max_b)
                    && x_max_b > x_min_b
                    && is.finite(y_min_b) && is.finite(y_max_b)
                    && y_max_b > y_min_b) {
                    # Breaks are GLOBAL (from all points) so the tile grid
                    # + color scale stay comparable across facet panels
                    # (which share axes). When faceting, build a separate
                    # 2-D histogram per facet level and tag each bin with
                    # its facet, so the widget draws each panel's own
                    # density. xy_bins_max stays the global max so a given
                    # count reads the same in every panel.
                    x_br <- seq(x_min_b, x_max_b, length.out = n_bins_tile + 1L)
                    y_br <- seq(y_min_b, y_max_b, length.out = n_bins_tile + 1L)
                    f_all <- if (has_facet)
                        as.character(df[[facetVar]])[tile_mask] else NULL
                    tile_facets <- if (has_facet) facet_levels else list(NA)
                    for (tfl in tile_facets) {
                        sel <- if (has_facet) (f_all == tfl)
                               else rep(TRUE, length(fx))
                        if (!any(sel)) next
                        x_idx <- cut(fx[sel], breaks = x_br,
                                     include.lowest = TRUE, labels = FALSE)
                        y_idx <- cut(fy[sel], breaks = y_br,
                                     include.lowest = TRUE, labels = FALSE)
                        valid <- !is.na(x_idx) & !is.na(y_idx)
                        if (!any(valid)) next
                        tab <- table(
                            factor(x_idx[valid], levels = seq_len(n_bins_tile)),
                            factor(y_idx[valid], levels = seq_len(n_bins_tile))
                        )
                        for (i in seq_len(nrow(tab))) {
                            for (j in seq_len(ncol(tab))) {
                                cnt <- as.integer(tab[i, j])
                                if (cnt > 0) {
                                    if (cnt > xy_bins_max) xy_bins_max <- cnt
                                    entry <- list(
                                        x_lo  = as.numeric(x_br[i]),
                                        x_hi  = as.numeric(x_br[i + 1L]),
                                        y_lo  = as.numeric(y_br[j]),
                                        y_hi  = as.numeric(y_br[j + 1L]),
                                        count = cnt
                                    )
                                    if (has_facet)
                                        entry$facet <- as.character(tfl)
                                    xy_bins[[length(xy_bins) + 1L]] <- entry
                                }
                            }
                        }
                    }
                }
            }

            # XY plots don't use the bars / cell-stats pipeline —
            # they hand the per-observation xyPoints array straight
            # to the widget. `bars` stays empty so downstream code
            # that reads it (e.g. legend grouping) still sees an
            # empty array. The category-axis machinery is bypassed
            # entirely in the widget when graphType == "scatter".
            }
            private$.aggCache <- list(sig = agg_sig, art = list(
                xy_points = xy_points,
                xy_fits = xy_fits,
                xy_ellipses = xy_ellipses,
                xy_density2d = xy_density2d,
                xy_bins = xy_bins,
                xy_bins_max = xy_bins_max,
                xy_marginal_x_hist = xy_marginal_x_hist,
                xy_marginal_x_dens = xy_marginal_x_dens,
                xy_marginal_y_hist = xy_marginal_y_hist,
                xy_marginal_y_dens = xy_marginal_y_dens,
                xy_marginal_x_hist_groups = xy_marginal_x_hist_groups,
                xy_marginal_x_dens_groups = xy_marginal_x_dens_groups,
                xy_marginal_y_hist_groups = xy_marginal_y_hist_groups,
                xy_marginal_y_dens_groups = xy_marginal_y_dens_groups,
                xy_stats = xy_stats,
                xy_size_min = xy_size_min,
                xy_size_max = xy_size_max))

            bars <- list()

            # chartSpec migration: axis titles are spec keys now.
            spec <- gb_parse_spec(self$options$chartSpec)
            x_title <- if (isTRUE(spec$xTitleOverride))
                (spec$xTitle %||% "")
            else
                xvar
            y_title <- if (isTRUE(spec$yTitleOverride))
                (spec$yTitle %||% "")
            else
                yvar
            group_title <- if (has_group) {
                if (isTRUE(spec$groupTitleOverride))
                    (spec$groupTitle %||% "")
                else
                    groupVar
            } else {
                ""
            }

            private$.perf("tiles + bins")
            spec_real_keys <- list(
                "data", "xvar", "yvar", "groupVar", "facetVar",
                "sizeVar", "labelVar", "graphType", "xyBin",
                "xyBinCount", "summaryFunc", "errorBarType",
                "showDataPoints", "xyFitType", "xyLoessSpan",
                "xyShowDensity2D", "xyDensity2DLevels", "xyMarginal",
                "xyMarginalBins", "xyCILevel", "xyEllipseLevel",
                "xyStatsCorrType", "exportRequest", "exportPath",
                "clientBundleHash", "paletteLibrary", "styleLibrary",
                "styleStamp", "annotationsJson", "chartSnapshot", "chartSpec"
            )
            spec_keys <- vapply(.xyplotbuilderSpecTable, function(r) r$opt,
                                character(1))

            fixed_args <- list(
                # Static-snapshot fallback: raw pass-through of the JS-committed
                # "<sig>|<svg>"; widget.R sanitizes + embeds (never in the payload).
                chart_snapshot = self$options$chartSnapshot,
                script_src_ready = TRUE,
                bars = bars,
                xy_points = xy_points,
                xy_has_size = has_size,
                xy_size_min = xy_size_min,
                xy_size_max = xy_size_max,
                xy_size_var = if (has_size) as.character(sizeVar) else "",
                xy_has_labels = has_label,
                xy_label_var = if (has_label) as.character(labelVar) else "",
                xy_fits = xy_fits,
                xy_x_levels = xy_x_levels,
                xy_x_nominal = xy_x_nominal,
                xy_y_nominal = xy_y_nominal,
                xy_y_levels = xy_y_levels,
                xy_ellipses = xy_ellipses,
                xy_ellipse_level = self$options$xyEllipseLevel,
                xy_density2d = xy_density2d,
                xy_show_density2d = isTRUE(self$options$xyShowDensity2D),
                xy_density2d_levels = self$options$xyDensity2DLevels,
                xy_bins = xy_bins,
                xy_bins_max = xy_bins_max,
                xy_bin = self$options$xyBin,
                graph_type_choices = list(
                        list(name = "scatter", value = "none",   label = "Scatter"),
                        list(name = "heatmap", value = "square", label = "Heatmap")
                    ),
                graph_type_option = "xyBin",
                graph_type_instant = FALSE,
                xy_bin_count = self$options$xyBinCount,
                xy_fit_type = self$options$xyFitType,
                xy_loess_span = self$options$xyLoessSpan,
                xy_ci_level = self$options$xyCILevel,
                xy_stats = xy_stats,
                xy_stats_corr_type = self$options$xyStatsCorrType,
                xy_marginal_x_hist = xy_marginal_x_hist,
                xy_marginal_x_dens = xy_marginal_x_dens,
                xy_marginal_y_hist = xy_marginal_y_hist,
                xy_marginal_y_dens = xy_marginal_y_dens,
                xy_marginal_x_hist_groups = xy_marginal_x_hist_groups,
                xy_marginal_x_dens_groups = xy_marginal_x_dens_groups,
                xy_marginal_y_hist_groups = xy_marginal_y_hist_groups,
                xy_marginal_y_dens_groups = xy_marginal_y_dens_groups,
                xy_marginal = self$options$xyMarginal,
                graph_type = self$options$graphType,
                x_label = x_title,
                y_label = y_title,
                group_label = group_title,
                x_label_default = xvar,
                y_label_default = yvar,
                group_label_default = if (has_group) groupVar else "",
                x_categories = list(),
                group_categories = group_levels,
                facet_separator = "",
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
                chart_spec = self$options$chartSpec,
                spec_real_keys = spec_real_keys,
                spec_keys = spec_keys
            )
            spec_args <- gb_spec_args(spec, .xyplotbuilderSpecTable)

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

            private$.perf("html / payload build")
            # Native static copy: feed the persisted snapshot into
            # jamovi's own Image result (native export, native copy
            # menu, module-less display).
            private$.updateSnapshotImage()
            self$results$widget$setContent(html)
            private$.perf("setContent dispatch")
        },

        .placeholder = function() {
            paste0(
                '<div style="font-family:sans-serif;color:#666;padding:12px;font-size:13px;">',
                'Drag two numeric variables into <strong>X Variable</strong> ',
                'and <strong>Y Variable</strong> to render a scatter plot. ',
                'Optionally drop a categorical variable into <strong>Group By</strong> ',
                'to color points (and split fit lines) per group, or into ',
                '<strong>Panels</strong> to draw one panel per level.',
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
            file.path(tempdir(), "xyplotbuilder_lastExportId.txt")
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
