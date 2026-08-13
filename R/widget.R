# Plot Builder htmlwidget renderer.
#
# Builds the self-contained HTML string that wraps the JS widget at
# inst/widget/graphbuilder2.js with a JSON payload of the prepared bar
# data and chart options. Lives inside the parent pandion module
# so the .jmo bundles everything it needs - no separate R package.

#' Build a self-contained Graph Builder 2 HTML string.
#'
#' Returns an HTML fragment that can be passed directly to a jamovi `Html`
#' result via `setContent()`. The fragment carries the aggregated bar data
#' inline as JSON and embeds the widget JS, so it has no external runtime
#' dependencies.
#'
#' @param bars A list of named lists describing each bar.
#' @return Character scalar of HTML.
#' @keywords internal

# Script-src is the production default. Keep the former inline/localStorage
# delivery behind an emergency rollback switch while the transition settles.
# The env var works for harnesses/probes; real jamovi strips inherited env at
# the Electron->server spawn, so a live installation uses the flag file:
#   touch ~/.plotstudio-inlinebundle  # temporarily use the legacy loader
#   rm ~/.plotstudio-inlinebundle     # return to script-src (default)
gb2_script_src_on <- function() {
    rollback <- tolower(trimws(Sys.getenv("GB2_INLINE_BUNDLE")))
    rollback <- rollback %in% c("1", "true", "yes", "on")
    !rollback && !file.exists(path.expand("~/.plotstudio-inlinebundle"))
}

# Shared script-src wiring for every chart analysis. The raw binding is
# intentional: jmvcore's setScripts() helper double-prefixes the package name
# on the jamovi 2.7.x versions this prototype targets.
gb2_init_script_src <- function(html_result) {
    if (!gb2_script_src_on())
        return(invisible(FALSE))
    tryCatch({
        html_result$scripts <- c("widget/graphbuilder2.min.js")
        invisible(TRUE)
    }, error = function(e) invisible(FALSE))
}

# Empty analyses used to pre-warm the inline/localStorage cache by shipping
# the engine with their placeholder. In script-src mode the Html result has
# already requested the engine, so keep placeholders payload-only.
gb2_engine_placeholder_html <- function(message_html,
                                        client_bundle_hash = "",
                                        script_src_ready = FALSE) {
    # The jamovi convention is to draw placeholders at full size rather
    # than a bare text box (Jonathon's ask, Aug 2026): an empty chart
    # frame - axes, ticks, faint gridlines, all quiet gray - at the
    # default plot size, with the module's message centered in the plot
    # area. The frame is one scalable svg (viewBox), so it shrinks
    # cleanly inside jamovi's 500px Html column and never stretches the
    # page sideways under the width-less Svg element (the earlier
    # sprawl fix). The overlay anchors in PERCENTAGES of the frame, so
    # the message stays centered at any scale.
    frame_svg <- paste0(
        '<svg viewBox="0 0 576 400" aria-hidden="true" ',
             'style="display:block;width:100%;height:auto;">',
          # no gridlines: the default chart draws none, and the empty
          # state should promise exactly what the first render delivers
          # y ticks
          paste0('<line x1="46" x2="52" y1="', c(17, 84, 151, 218, 285, 352),
                 '" y2="', c(17, 84, 151, 218, 285, 352),
                 '" stroke="#c9c9c9" stroke-width="1.5"/>', collapse = ''),
          # x ticks
          paste0('<line y1="352" y2="358" x1="', c(52, 178, 304, 430, 556),
                 '" x2="', c(52, 178, 304, 430, 556),
                 '" stroke="#c9c9c9" stroke-width="1.5"/>', collapse = ''),
          # axes drawn last
          '<line x1="52" x2="52" y1="16" y2="352" stroke="#c9c9c9" stroke-width="1.5"/>',
          '<line x1="52" x2="556" y1="352" y2="352" stroke="#c9c9c9" stroke-width="1.5"/>',
        '</svg>')
    message_html <- paste0(
        '<div style="position:relative;max-width:576px;">',
          frame_svg,
          '<div style="position:absolute;left:12%;right:6%;top:8%;bottom:16%;',
                      'display:flex;align-items:center;justify-content:center;',
                      'text-align:center;">',
            '<div style="max-width:420px;color:#555;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;">', message_html, '</div>',
          '</div>',
        '</div>')
    if (gb2_script_src_on() && isTRUE(script_src_ready))
        message_html
    else
        gb2_engine_boot_html(message_html, client_bundle_hash)
}

graphbuilder2_html <- function(bars,
                               script_src_ready = FALSE,
                               # Native-panel preview keys (Compare Groups /
                               # Repeated Measures forward these; NULL = the
                               # module doesn't, and the payload omits them so
                               # the JS fold gate skips those keys).
                               summary_func = NULL,
                               error_bar_type = NULL,
                               error_bar_method = NULL,
                               xy_points = list(),
                               xy_fits = list(),
                               xy_x_levels = character(0),
                               xy_y_levels = character(0),
                               xy_point_size = 5,
                               xy_point_shape = "circle",
                               xy_point_opacity = 0.7,
                               xy_point_color_match = TRUE,
                               xy_point_color = "#1f77b4",
                               xy_point_outline_color = "#000000",
                               xy_point_outline_width = 0,
                               xy_point_jitter = 0,
                               xy_point_shapes = list(),
                               xy_point_group_styles = "",
                               xy_ellipse_group_styles = "",
                               xy_rug_group_styles = "",
                               xy_marginal_group_styles = "",
                               xy_density2d_group_styles = "",
                               xy_ellipses = list(),
                               xy_show_ellipse = FALSE,
                               xy_ellipse_level = 0.95,
                               xy_ellipse_fill = TRUE,
                               xy_ellipse_opacity = 0.15,
                               xy_ellipse_width = 1.5,
                               xy_ellipse_style = "solid",
                               xy_ellipse_color_match = TRUE,
                               xy_ellipse_color = "#666666",
                               xy_hidden_ellipse_groups = list(),
                               xy_show_outliers = FALSE,
                               xy_outlier_threshold = 2,
                               xy_outlier_color = "#d62728",
                               xy_outlier_label = FALSE,
                               xy_outlier_size = 1,
                               xy_outlier_width = 1.6,
                               xy_density2d = list(),
                               xy_show_density2d = FALSE,
                               xy_density2d_fill = FALSE,
                               xy_density2d_levels = 5,
                               xy_density2d_opacity = 0.7,
                               xy_density2d_width = 1,
                               xy_density2d_color_match = TRUE,
                               xy_density2d_color = "#444444",
                               xy_hidden_density2d_groups = list(),
                               xy_bins = list(),
                               xy_bins_max = 0,
                               xy_bin = "none",
                               xy_bin_count = 30,
                               xy_bin_color = "#1f77b4",
                               xy_bin_palette = "single",
                               xy_bin_custom_low = "#ffffff",
                               xy_bin_custom_mid = "#76b7e8",
                               xy_bin_custom_high = "#1f77b4",
                               xy_bin_max_opacity = 0.9,
                               xy_bin_show_points = FALSE,
                               xy_bin_legend_scale = 1,
                               xy_bin_legend_color = "",
                               xy_bin_legend_dx = 0,
                               xy_bin_legend_dy = 0,
                               xy_bin_legend_show = TRUE,
                               xy_bin_legend_title = "Count",
                               xy_bin_legend_orient = "vertical",
                               xy_bin_legend_ticks = 2,
                               xy_x_scale = "linear",
                               xy_y_scale = "linear",
                               xy_reverse_x = FALSE,
                               xy_reverse_y = FALSE,
                               xy_show_fit = FALSE,
                               xy_fit_full_range = TRUE,
                               xy_has_size = FALSE,
                               xy_size_min = 0,
                               xy_size_max = 1,
                               xy_size_var = "",
                               xy_has_labels = FALSE,
                               xy_label_var = "",
                               xy_fit_type = "linear",
                               xy_loess_span = 0.75,
                               xy_fit_width = 2,
                               xy_fit_style = "solid",
                               xy_fit_color_match = TRUE,
                               xy_fit_color = "#1f77b4",
                               xy_show_ci = FALSE,
                               xy_ci_opacity = 0.2,
                               xy_ci_level = 0.95,
                               xy_hidden_fit_groups = list(),
                               fit_group_overrides = list(),
                               xy_hidden_groups = list(),
                               xy_stats = list(),
                               xy_show_stats = FALSE,
                               xy_stats_position = "topright",
                               xy_stats_corr_type = "pearson",
                               xy_stats_decimals = 2,
                               xy_stats_show_r = TRUE,
                               xy_stats_show_p = TRUE,
                               xy_stats_show_n = TRUE,
                               xy_stats_show_r2 = FALSE,
                               xy_stats_show_eqn = FALSE,
                               xy_stats_font_size = 11,
                               xy_stats_plate = TRUE,
                               xy_stats_offset_x = 0,
                               xy_stats_offset_y = 0,
                               xy_stats_width = 0,
                               xy_stats_height = 0,
                               xy_rug = "none",
                               xy_rug_length = 6,
                               xy_rug_width = 0.75,
                               xy_rug_opacity = 0.4,
                               xy_rug_color_match = TRUE,
                               xy_rug_color = "#444444",
                               xy_marginal_x_hist = list(),
                               xy_marginal_x_dens = list(),
                               xy_marginal_y_hist = list(),
                               xy_marginal_y_dens = list(),
                               xy_marginal_x_hist_groups = list(),
                               xy_marginal_x_dens_groups = list(),
                               xy_marginal_y_hist_groups = list(),
                               xy_marginal_y_dens_groups = list(),
                               xy_marginal = "none",
                               xy_marginal_axes = "both",
                               xy_marginal_size = 50,
                               xy_marginal_opacity = 0.45,
                               xy_marginal_color = "#5a8db8",
                               xy_marginal_color_match = TRUE,
                               x_min_override = FALSE,
                               x_min = 0,
                               x_max_override = FALSE,
                               x_max = 0,
                               x_interval_override = FALSE,
                               x_interval = 0,
                               graph_type = "bar",
                               graph_type_choices = NULL,
                               graph_type_instant = FALSE,
                               graph_type_option = "graphType",
                               x_label = "X",
                               y_label = "Y",
                               group_label = "",
                               # Un-overridden default labels (the variable
                               # names / computed stat labels). The widget's
                               # "Reset to original text" affordance compares
                               # the live label to these and reverts to them.
                               # NULL => fall back to the (possibly overridden)
                               # label, so a module that doesn't pass them
                               # simply never offers a title reset.
                               x_label_default = NULL,
                               y_label_default = NULL,
                               group_label_default = NULL,
                               x_categories = NULL,
                               group_categories = NULL,
                               facet_separator = "",
                               facet_levels = NULL,
                               facet_label = "",
                               # Pivot-chip factor registry (RM only): one
                               # entry per declared factor {id,label,kind,role}
                               # for the on-chart layout tray. NULL/empty for
                               # every other module.
                               pivot_factors = NULL,
                               # Raw observations for the RM instant re-pivot:
                               # {v,nm,s,lv} + the Morey factor + the base
                               # missing-cases note (see rmplotbuilder.b.R).
                               pivot_obs = NULL,
                               pivot_morey = 1,
                               pivot_miss_base = NULL,
                               # RM crossing mode: TRUE = crossed factorial,
                               # FALSE/absent = independent factors. Gates the
                               # tray's one-within constraint.
                               rm_crossed = FALSE,
                               facet_strip_show = TRUE,
                               facet_strip_position = "top",
                               facet_strip_labels = list(),
                               facet_strip_underline = TRUE,
                               facet_strip_underline_color = "#888888",
                               facet_strip_underline_width = 1,
                               facet_strip_underline_style = "solid",
                               facet_strip_underline_length = 100,
                               facet_gap = 18,
                               facet_divider = "line",
                               facet_divider_color = "#cccccc",
                               facet_divider_width = 0,
                               facet_divider_style = "solid",
                               facet_order = list(),
                               hidden_facets = list(),
                               facet_shading = "none",
                               facet_shading_color = "#f0f0f0",
                               facet_shading_opacity = 0.5,
                               facet_border = FALSE,
                               facet_border_color = "#dddddd",
                               facet_border_width = 1,
                               facet_strip_background = "none",
                               facet_strip_background_color = "#eeeeee",
                               facet_strip_background_opacity = 1,
                               facet_strip_rotation = 0,
                               facet_drop_empty = FALSE,
                               facet_layout = "inline",
                               facet_wrap_cols = 0,
                               facet_free_y = FALSE,
                               facet_x_tick_labels = "all",
                               x_tick_label_wrap = FALSE,
                               width = "100%",
                               plot_width = 6,
                               plot_height = 4,
                               y_min_override = FALSE,
                               y_axis_break = FALSE,
                               x_axis_break = FALSE,
                               y_min = 0,
                               y_max_override = FALSE,
                               y_max = 0,
                               y_interval_override = FALSE,
                               y_interval = 0,
                               chart_title = "",
                               chart_note = "",
                               chart_alt_text = "",
                               x_category_relabels = list(),
                               group_item_relabels = list(),
                               y_tick_relabels = list(),
                               text_offsets = list(),
                               legend_item_offsets = list(),
                               legend_layout_custom = FALSE,
                               legend_order = list(),
                               chart_orientation = "vertical",
                               chart_background = "",
                               chart_font_family = "",
                               chart_palette = "default",
                               custom_palette = "#2d5c94,#902634,#e18e4c,#597b2f,#faca59,#32295e,#5bb1ba,#d35a80",
                               chart_border = "none",
                               chart_grid = "none",
                               chart_grid_layer = "behind",
                               chart_grid_major_color = "#d0d0d0",
                               chart_grid_major_thickness = 0.75,
                               chart_grid_minor_enabled = FALSE,
                               chart_grid_minor_color = "#ececec",
                               chart_grid_minor_thickness = 0.5,
                               chart_grid_major_style = "solid",
                               chart_grid_minor_style = "solid",
                               chart_text_color = "",
                               chart_aspect_lock = FALSE,
                               chart_snap_to_grid = FALSE,
                               chart_align_guides = TRUE,
                               hidden_bars = list(),
                               hidden_points = list(),
                               hidden_elements = list(),
                               category_gap_overrides = list(),
                               group_gap_overrides = list(),
                               category_order = list(),
                               group_order = list(),
                               text_styles = list(),
                               group_colors = list(),
                               bar_color = "",
                               group_patterns = list(),
                               group_borders = list(),
                               group_opacities = list(),
                               dens_group_styles = list(),
                               dist_normal_group_styles = list(),
                               group_corner_radii = list(),
                               group_error_bars = list(),
                               category_styles = list(),
                               group_box_whiskers = list(),
                               group_data_points = list(),
                               group_qq_styles = list(),
                               group_box_medians = list(),
                               group_box_outliers = list(),
                               group_violin_density = list(),
                               group_violin_inner_box = list(),
                               group_violin_whiskers = list(),
                               group_violin_medians = list(),
                               bar_pattern = "",
                               bar_pattern_density = 1,
                               bar_pattern_angle = 45,
                               bar_pattern_thickness = 1,
                               bar_pattern_color = "",
                               error_bar_direction = "both",
                               error_bar_color_match = TRUE,
                               error_bar_color = "",
                               error_bar_thickness = 1.4,
                               error_bar_cap_size = 1,
                               error_bar_cap_size_line = 10,
                               bar_border_color = "#000000",
                               bar_border_width = 0,
                               bar_border_opacity = 1,
                               bar_border_style = "solid",
                               category_gap = 0.2,
                               bar_gap = 0,
                               legend_swatch_size = 12,
                               legend_row_spacing = 18,
                               legend_swatch_gap = 6,
                               legend_offset_x = 0,
                               legend_offset_y = 0,
                               annotations = list(),
                               # Chart-wide multiple-comparison correction
                               # for significance-bracket auto-p (None /
                               # Bonferroni / Holm / Benjamini-Hochberg /
                               # Tukey). Read JS-side as data.autoPCorrection;
                               # must round-trip via the payload or the
                               # user's saved choice reverts to "none" on
                               # reopen. Bracket-bearing modules pass
                               # self$options$autoPCorrection.
                               auto_p_correction = "none",
                               # Set TRUE by the rmgraph module so the
                               # widget knows the x-categories represent
                               # repeated measure columns (same subjects
                               # across cells). Used by the significance-
                               # bracket auto-p path to default to a
                               # paired t-test when comparing two
                               # measures in the same between cell.
                               is_repeated_measures = FALSE,
                               x_axis_thickness = 1.5,
                               y_axis_thickness = 1.5,
                               x_axis_style = "solid",
                               y_axis_style = "solid",
                               x_axis_color = "",
                               x_tick_color = "",
                               x_tick_direction = "out",
                               y_axis_color = "",
                               y_tick_color = "",
                               y_tick_direction = "out",
                               x_tick_length = 6,
                               y_tick_length = 6,
                               y_minor_ticks = FALSE,
                               y_minor_tick_count = 1,
                               x_minor_ticks = FALSE,
                               x_minor_tick_count = 1,
                               x_tick_thickness = 1,
                               y_tick_thickness = 1,
                               bar_opacity = 1,
                               bar_corner_radius = 0,
                               box_whisker_color = "#222222",
                               box_whisker_width = 1.5,
                               box_whisker_style = "solid",
                               box_whisker_cap_frac = 0.5,
                               box_whisker_opacity = 1,
                               box_median_color = "#222222",
                               box_median_width = 2,
                               box_median_style = "solid",
                               box_median_opacity = 1,
                               box_show_outliers = TRUE,
                               box_outlier_shape = "circle",
                               box_outlier_size = 3,
                               box_outlier_color = "",
                               box_outlier_outline_color = "#000000",
                               box_outlier_outline_width = 0,
                               box_outlier_opacity = 0.85,
                               box_outlier_ring_color = "",
                               box_outlier_ring_size = 1,
                               box_outlier_ring_width = 1.6,
                               violin_bandwidth = 1,
                               violin_scale = "area",
                               violin_trim = TRUE,
                               violin_side = "both",
                               violin_show_box = TRUE,
                               violin_show_median = TRUE,
                               violin_box_width_frac = 0.12,
                               violin_box_color = "#222222",
                               violin_box_opacity = 1,
                               violin_whisker_color = "#222222",
                               violin_whisker_width = 1.5,
                               violin_whisker_opacity = 1,
                               violin_whisker_style = "solid",
                               violin_median_color = "#ffffff",
                               violin_median_size = 4,
                               rain_side = "right",
                               line_width = 2,
                               line_style = "solid",
                               line_opacity = 1,
                               line_smooth = FALSE,
                               line_connect_facets = FALSE,
                               line_marker_spread = 0.35,
                               show_line_points = TRUE,
                               line_point_size = -1,
                               line_point_shape = "circle",
                               line_point_outline_width = 0,
                               line_point_outline_color = "#000000",
                               line_point_color = "",
                               line_color_match_marker = TRUE,
                               line_group_overrides = list(),
                               show_data_points = FALSE,
                               # Per-bar outlier overlay (plotbuilder /
                               # rmplotbuilder). Rings the raw values in
                               # each cell that fall outside an IQR fence
                               # or beyond k SD of the cell mean.
                               bar_value_labels = FALSE,
                               bar_n_labels = FALSE,
                               show_bar_outliers = FALSE,
                               bar_outlier_method = "iqr",
                               bar_outlier_iqr_k = 1.5,
                               bar_outlier_sd_k = 3,
                               bar_outlier_color = "#d62728",
                               bar_outlier_label = FALSE,
                               bar_outlier_size = 1,
                               bar_outlier_width = 1.6,
                               # Spaghetti / subject-trajectory overlay.
                               # rmgraph-only feature: when TRUE the JS
                               # widget draws a thin polyline through each
                               # subject's values across every measure,
                               # using the row-aligned values array. Style
                               # knobs (color / width / opacity / dash)
                               # are settable via the Subject Connectors
                               # inspector panel; defaults match the
                               # subtle look matplotlib spaghetti plots
                               # use by default.
                               connect_subjects = FALSE,
                               connect_subjects_color_match = TRUE,
                               connect_subjects_color = "#666666",
                               connect_subjects_width = 1,
                               connect_subjects_opacity = 0.4,
                               connect_subjects_style = "solid",
                               point_scatter = "jitter",
                               point_shape = "circle",
                               point_size = 3,
                               point_spread_width = 0.4,
                               point_opacity = 0.6,
                               point_color_match = TRUE,
                               point_color = "",
                               point_outline_width = 0.25,
                               point_outline_color = "#000000",
                               palette_action = "",
                               # One-shot chart-style library action (hidden
                               # styleLibrary option) + the per-analysis stamp
                               # that marks the default style as already
                               # applied (hidden styleStamp option).
                               style_action = "",
                               style_stamp = FALSE,
                               # Missing-data disclosure line ("" = no
                               # missing data) - each module counts its
                               # own exclusions in role-appropriate terms.
                               missing_note = "",
                               # md5 of the bundle the CLIENT confirmed it has
                               # cached (hidden clientBundleHash option, written
                               # back by the widget after it copies the bundle
                               # into localStorage). When it matches the bundle
                               # on disk we skip inlining the ~1.9 MB JS and emit
                               # a small loader instead. "" = always inline.
                               client_bundle_hash = "",
                               # Epoch seconds captured at the module's .run()
                               # entry (as.numeric(Sys.time())). Feeds the debug
                               # overlay's "R prelude" line (data materialization
                               # + aggregation before this function was reached)
                               # and the run-entry->paint gap. NULL = not passed
                               # (older callers / harness one-offs) - the overlay
                               # lines are simply omitted.
                               run_t0 = NULL,
                               # chartSpec migration (speed pass Phase 2): a
                               # migrated module ships the raw chartSpec JSON
                               # blob (so the JS seeds its specState + explodes
                               # it into data.*) and the list of option names
                               # that STAY real jamovi options (so the JS
                               # setOption wrapper knows which committed keys to
                               # route into the blob instead). Both are additive
                               # + gated on spec_real_keys, so an unmigrated
                               # module's payload is byte-identical.
                               chart_spec = "",
                               spec_real_keys = NULL,
                               # Allowlist of the keys the widget may fold into
                               # the chartSpec blob (style options + titles +
                               # client-persistence). The JS filters the blob
                               # through this so a crafted chartSpec can't inject
                               # a non-style key over a computed payload field.
                               spec_keys = NULL,
                               # Static-snapshot fallback (Jul 2026): the JS
                               # commits "<sig>|<svg>" through the hidden
                               # chartSnapshot option after a render settles;
                               # we embed the SVG as a hidden data-URI <img>
                               # beside the host div so a machine WITHOUT the
                               # module still shows the chart. Only the tiny
                               # sig enters the payload (chartSnapshotKey), so
                               # render hashing is untouched. Additive + fully
                               # defaulted: unmigrated callers are unchanged.
                               chart_snapshot = "",
                               # --- Distribution (distplotbuilder) continuous-X
                               # geometry. Additive + fully defaulted: the
                               # sibling modules never pass these, so they keep
                               # their defaults and the JS only reads them under
                               # the histogram/density/qq/ecdf graph types. ---
                               hist_bins = 30,
                               hist_bin_width = -1,
                               hist_stat = "count",
                               hist_position = "overlay",
                               hist_color = "",
                               hist_outline_color = "#ffffff",
                               hist_outline_width = 0.5,
                               hist_outline_style = "solid",
                               hist_outline_opacity = 1,
                               hist_opacity = 0.85,
                               dens_bandwidth_adjust = 1,
                               dens_kernel = "gaussian",
                               dens_fill = TRUE,
                               dens_opacity = 0.5,
                               dens_line_color = "",
                               dens_line_width = 1.5,
                               dens_line_style = "solid",
                               dens_line_opacity = 1,
                               hist_density_scale_to_count = TRUE,
                               qq_show_line = TRUE,
                               qq_line_color = "",
                               qq_line_width = 1.5,
                               qq_line_style = "dashed",
                               qq_line_opacity = 1,
                               qq_band = FALSE,
                               qq_band_level = 0.95,
                               qq_band_color = "",
                               qq_band_opacity = 0.2,
                               qq_point_size = 4,
                               qq_point_color = "",
                               qq_point_shape = "circle",
                               qq_point_opacity = 0.8,
                               qq_point_outline_color = "#000000",
                               qq_point_outline_width = 0,
                               ecdf_step = "hv",
                               ecdf_line_width = 1.5,
                               ecdf_line_color = "",
                               ecdf_line_style = "solid",
                               ecdf_line_opacity = 1,
                               ecdf_complement = FALSE,
                               ecdf_pad = TRUE,
                               dist_rug = FALSE,
                               dist_rug_color = "",
                               dist_rug_length = 7,
                               dist_rug_width = 0.75,
                               dist_rug_opacity = 0.5,
                               dist_normal_curve = FALSE,
                               dist_normal_color = "",
                               dist_normal_width = 2,
                               dist_normal_style = "solid",
                               dist_normal_opacity = 1,
                               # --- Frequencies (freqplotbuilder) categorical
                               # counts. Additive + fully defaulted: siblings
                               # never pass these; the JS only reads them when
                               # freq_mode is TRUE (bar counts / pie / donut /
                               # pareto graph types). ---
                               freq_mode = FALSE,
                               freq_stat = "count",
                               freq_position = "dodge",
                               freq_pooled_note = "",
                               # Chi-square annotation: freq_tests ships the
                               # R-computed test entries ({facet, type, chisq,
                               # df, p, n, es, esLabel, minExp, k|r,c} per
                               # consumed facet); NULL (the sibling default)
                               # keeps the key out of the payload entirely so
                               # other modules' payloads stay byte-stable.
                               freq_tests = NULL,
                               freq_show_chisq = FALSE,
                               freq_chisq_position = "topright",
                               freq_chisq_font_size = 11,
                               freq_chisq_dx = 0,
                               freq_chisq_dy = 0,
                               freq_chisq_plate = TRUE,
                               pie_hole = -1,
                               pie_start_angle = 0,
                               pie_labels = "percent",
                               slice_border_color = "",
                               slice_border_width = 1.5,
                               slice_border_style = "solid",
                               slice_border_opacity = 1,
                               pareto_line_color = "",
                               pareto_line_width = 2,
                               pareto_line_style = "solid",
                               pareto_line_opacity = 1,
                               pareto_show_markers = TRUE,
                               pareto_marker_color = "",
                               pareto_marker_shape = "circle",
                               pareto_marker_size = 7,
                               pareto_marker_opacity = 1,
                               pareto_marker_outline_color = "#ffffff",
                               pareto_marker_outline_width = 1,
                               # Right (cumulative %) axis styling — sentinel
                               # defaults inherit the left Y axis.
                               pareto_axis_color = "",
                               pareto_axis_thickness = -1,
                               pareto_axis_style = "",
                               pareto_tick_color = "",
                               pareto_tick_length = -1,
                               pareto_tick_thickness = -1,
                               pareto_tick_direction = "",
                               pareto_tick_step = 20,
                               pareto_tick_label_color = "",
                               pareto_tick_label_size = -1,
                               # --- Correlation matrix (corrplotbuilder).
                               # Additive + fully defaulted: siblings never
                               # pass these; the JS only reads them under
                               # the corr* graph types. ---
                               corr_vars = NULL,
                               corr_cells = NULL,
                               corr_raw = NULL,
                               corr_method = "pearson",
                               # Matrix-wide p adjustment (none / bonferroni /
                               # holm / fdrBH) - a draw-time filter JS-side;
                               # shipped so stars, fades, tooltips and the
                               # Sigma panel all adjust identically.
                               corr_p_adjust = "none",
                               corr_show_values = TRUE,
                               corr_decimals = 2,
                               corr_sig_level = 0.05,
                               corr_sig_treat = "none",
                               corr_sig_stars = FALSE,
                               corr_triangle = "full",
                               corr_diagonal = "one",
                               corr_pos_color = "",
                               corr_neg_color = "",
                               corr_cell_gap = 2,
                               corr_cell_corner = 0,
                               corr_cell_opacity = 1,
                               corr_cell_border_color = "",
                               corr_cell_border_width = 0,
                               corr_circle_scale = 0.92,
                               corr_number_grid = TRUE,
                               corr_var_order = NULL,
                               corr_var_relabels = NULL,
                               corr_var_styles = NULL,
                               corr_legend_show = TRUE,
                               corr_legend_title = "",
                               corr_legend_scale = 1,
                               corr_legend_orient = "vertical",
                               corr_legend_ticks = 3,
                               corr_legend_color = "",
                               corr_legend_dx = 0,
                               corr_legend_dy = 0,
                               corr_legend_bar_width = -1,
                               # --- Likert / survey (likertplotbuilder).
                               # Additive + fully defaulted: siblings never
                               # pass these; the JS only reads them under
                               # the likert* graph types. ---
                               likert_items = NULL,
                               likert_levels = NULL,
                               likert_cells = NULL,
                               likert_means = NULL,
                               likert_alpha = NULL,
                               dist_normality = NULL,
                               likert_continuous = FALSE,
                               likert_center_boundary = -1,
                               likert_sort = "original",
                               likert_show_values = TRUE,
                               likert_value_content = "percent",
                               likert_value_decimals = 0,
                               likert_show_top_box = FALSE,
                               likert_top_box_mode = "agree",
                               likert_row_gap = 0.3,
                               likert_ci_level = 0.95,
                               likert_mean_error_type = "ci",
                               likert_dot_color = "",
                               likert_dot_size = 7,
                               likert_ci_width = 2,
                               likert_item_order = NULL,
                               likert_item_relabels = NULL,
                               likert_item_styles = NULL,
                               likert_reverse_items = NULL,
                               likert_legend_show = TRUE,
                               likert_legend_orient = "horizontal",
                               likert_legend_dx = 0,
                               likert_legend_dy = 0,
                               likert_legend_swatch_size = 12,
                               likert_legend_font_size = 11,
                               likert_legend_text_color = "",
                               likert_xaxis_color = "",
                               likert_xaxis_width = 1,
                               likert_xaxis_style = "solid",
                               likert_zero_color = "",
                               likert_zero_width = 1.25,
                               likert_zero_style = "solid",
                               likert_grid_show = TRUE,
                               likert_grid_color = "",
                               likert_grid_width = 1,
                               likert_grid_style = "solid",
                               likert_x_min_override = FALSE,
                               likert_x_min = 0,
                               likert_x_max_override = FALSE,
                               likert_x_max = 0,
                               likert_x_interval_override = FALSE,
                               likert_x_interval = 0,
                               likert_dot_shape = "circle",
                               likert_dot_outline_color = "#ffffff",
                               likert_dot_outline_width = 1,
                               likert_ci_color = "",
                               likert_ci_style = "solid",
                               likert_show_mini_means = FALSE,
                               likert_x_tick_relabels = NULL) {
    if (is.null(bars))
        bars <- list()

    # The continuous-X distribution types (distplotbuilder) intentionally ship
    # an empty x_categories: their value axis is continuous, and a derived
    # category would make the categorical bar loop draw phantom bars. Only the
    # categorical graph types fall back to deriving categories from the bars.
    if ((is.null(x_categories) || length(x_categories) == 0L) &&
        !(graph_type %in% c("histogram", "density", "histdensity", "qq", "ecdf"))) {
        x_categories <- unique(vapply(bars, function(b) as.character(b$x), character(1)))
    }

    has_groups <- !is.null(group_categories) && length(group_categories) > 0L

    normalize_relabels <- function(x) {
        if (is.null(x) || length(x) == 0L) return(list())
        out <- list()
        for (i in seq_along(x)) {
            r <- x[[i]]
            orig <- ""
            rel <- ""
            if (is.list(r)) {
                if (!is.null(r$original)) orig <- as.character(r$original)
                if (!is.null(r$relabel)) rel <- as.character(r$relabel)
            }
            if (nzchar(orig)) {
                out[[length(out) + 1L]] <- list(original = orig, relabel = rel)
            }
        }
        out
    }

    normalize_offsets <- function(x) {
        if (is.null(x) || length(x) == 0L) return(list())
        out <- list()
        for (i in seq_along(x)) {
            r <- x[[i]]
            id_val <- ""
            dx_val <- 0
            dy_val <- 0
            if (is.list(r)) {
                if (!is.null(r$id)) id_val <- as.character(r$id)
                if (!is.null(r$dx)) dx_val <- as.numeric(r$dx)
                if (!is.null(r$dy)) dy_val <- as.numeric(r$dy)
            }
            if (nzchar(id_val) && (dx_val != 0 || dy_val != 0)) {
                out[[length(out) + 1L]] <- list(id = id_val, dx = dx_val, dy = dy_val)
            }
        }
        out
    }

    normalize_category_gap_overrides <- function(x) {
        if (is.null(x) || length(x) == 0L) return(list())
        out <- list()
        for (i in seq_along(x)) {
            r <- x[[i]]
            cat_v <- ""
            gap_v <- 0
            if (is.list(r)) {
                if (!is.null(r$category)) cat_v <- as.character(r$category)
                if (!is.null(r$extraGap)) gap_v <- as.numeric(r$extraGap)
            }
            if (nzchar(cat_v) && gap_v != 0) {
                out[[length(out) + 1L]] <- list(category = cat_v, extraGap = gap_v)
            }
        }
        out
    }

    normalize_group_gap_overrides <- function(x) {
        if (is.null(x) || length(x) == 0L) return(list())
        out <- list()
        for (i in seq_along(x)) {
            r <- x[[i]]
            grp_v <- ""
            gap_v <- 0
            if (is.list(r)) {
                if (!is.null(r$group)) grp_v <- as.character(r$group)
                if (!is.null(r$extraGap)) gap_v <- as.numeric(r$extraGap)
            }
            if (nzchar(grp_v) && gap_v != 0) {
                out[[length(out) + 1L]] <- list(group = grp_v, extraGap = gap_v)
            }
        }
        out
    }

    normalize_hidden_bars <- function(x) {
        if (is.null(x) || length(x) == 0L) return(list())
        out <- list()
        for (i in seq_along(x)) {
            r <- x[[i]]
            cat_v <- ""
            grp_v <- ""
            if (is.list(r)) {
                if (!is.null(r$category)) cat_v <- as.character(r$category)
                if (!is.null(r$group)) grp_v <- as.character(r$group)
            }
            if (nzchar(cat_v)) {
                out[[length(out) + 1L]] <- list(category = cat_v, group = grp_v)
            }
        }
        out
    }

    # Per-point hides (the CG/RM "hiding = excluding" store). NOTE
    # (Jul 2026): the JS has written this option since the feature
    # shipped, but it was never round-tripped through R — per-point
    # hides silently vanished on save/reload or any R-echoed re-render
    # past the pending-commit window. idx is the 0-based index into the
    # CELL's finite values array (R build order), matching the JS
    # _hiddenPointLookup keying.
    normalize_hidden_points <- function(x) {
        if (is.null(x) || length(x) == 0L) return(list())
        out <- list()
        for (i in seq_along(x)) {
            r <- x[[i]]
            if (!is.list(r) || is.null(r$idx)) next
            out[[length(out) + 1L]] <- list(
                cat = if (!is.null(r$cat)) as.character(r$cat) else "",
                group = if (!is.null(r$group)) as.character(r$group) else "",
                idx = as.integer(r$idx))
        }
        out
    }

    normalize_text_styles <- function(x) {
        if (is.null(x) || length(x) == 0L) return(list())
        out <- list()
        for (i in seq_along(x)) {
            r <- x[[i]]
            id_val <- ""
            fs <- 0
            col <- ""
            bld <- FALSE
            ital <- FALSE
            rot <- 0
            algn <- ""
            if (is.list(r)) {
                if (!is.null(r$id)) id_val <- as.character(r$id)
                if (!is.null(r$fontSize)) fs <- as.numeric(r$fontSize)
                if (!is.null(r$color)) col <- as.character(r$color)
                if (!is.null(r$bold)) bld <- isTRUE(r$bold)
                if (!is.null(r$italic)) ital <- isTRUE(r$italic)
                if (!is.null(r$rotation)) rot <- as.numeric(r$rotation)
                if (!is.null(r$align)) algn <- as.character(r$align)
            }
            if (nzchar(id_val)) {
                out[[length(out) + 1L]] <- list(
                    id = id_val,
                    fontSize = fs,
                    color = col,
                    bold = bld,
                    italic = ital,
                    rotation = rot,
                    align = algn
                )
            }
        }
        out
    }

    # User-added annotations on the chart. Each entry has at minimum a
    # `kind` (text / bracket / refLine) and the fields relevant to that
    # kind. Unused fields per kind get sensible defaults.
    normalize_annotations <- function(x) {
        if (is.null(x) || length(x) == 0L) return(list())
        out <- list()
        for (i in seq_along(x)) {
            r <- x[[i]]
            if (!is.list(r)) next
            id_v <- if (!is.null(r$id)) as.character(r$id) else ""
            kind_v <- if (!is.null(r$kind)) as.character(r$kind) else "text"
            if (!nzchar(id_v) || !nzchar(kind_v)) next
            entry <- list(
                id = id_v,
                kind = kind_v,
                text = if (!is.null(r$text)) as.character(r$text) else "",
                x = if (!is.null(r$x)) as.numeric(r$x) else 0,
                y = if (!is.null(r$y)) as.numeric(r$y) else 0,
                x2 = if (!is.null(r$x2)) as.numeric(r$x2) else 0,
                fontSize = if (!is.null(r$fontSize)) as.numeric(r$fontSize) else 14,
                color = if (!is.null(r$color)) as.character(r$color) else "#222222",
                bold = isTRUE(r$bold),
                italic = isTRUE(r$italic),
                rotation = if (!is.null(r$rotation)) as.numeric(r$rotation) else 0,
                lineColor = if (!is.null(r$lineColor)) as.character(r$lineColor) else "#222222",
                lineWidth = if (!is.null(r$lineWidth)) as.numeric(r$lineWidth) else 1.2,
                lineOpacity = if (!is.null(r$lineOpacity)) as.numeric(r$lineOpacity) else 1,
                lineStyle = if (!is.null(r$lineStyle)) as.character(r$lineStyle) else "solid",
                orientation = if (!is.null(r$orientation)) as.character(r$orientation) else "horizontal",
                zOrder = if (!is.null(r$zOrder)) as.character(r$zOrder) else "front",
                value = if (!is.null(r$value)) as.numeric(r$value) else 0,
                capHeight = if (!is.null(r$capHeight)) as.numeric(r$capHeight) else 6,
                capLeft = if (!is.null(r$capLeft)) as.numeric(r$capLeft)
                          else if (!is.null(r$capHeight)) as.numeric(r$capHeight) else 6,
                capRight = if (!is.null(r$capRight)) as.numeric(r$capRight)
                           else if (!is.null(r$capHeight)) as.numeric(r$capHeight) else 6,
                # Significance-bracket auto-stats fields. These can't be
                # re-derived from position (unlike the bar anchors, which
                # the JS re-snaps each render), so they must round-trip
                # explicitly or an auto-p / main-effect bracket reverts to
                # its manual label after any native-option change.
                # autoPTest carries the test ("auto" / "welch" / "studentT" /
                # "pairedT" / "mannWhitneyU" / "wilcoxonSignedRank") OR the
                # omnibus main-effect modes ("anovaX" / "anovaGroup").
                # "auto" (the JS-side default) resolves per anchor at
                # compute time: paired for two occasions of the same
                # subjects on RM data, Welch's otherwise.
                autoPValue = if (!is.null(r$autoPValue)) isTRUE(r$autoPValue) else FALSE,
                autoPTest = if (!is.null(r$autoPTest)) as.character(r$autoPTest) else "auto",
                autoPFormat = if (!is.null(r$autoPFormat)) as.character(r$autoPFormat) else "asterisks",
                autoPEffect = if (!is.null(r$autoPEffect)) as.character(r$autoPEffect) else "cohensD",
                # Directional hypothesis: "two" | "greater" | "less"
                # ("greater" = left anchored cell predicted above right).
                autoPTail = if (!is.null(r$autoPTail)) as.character(r$autoPTail) else "two",
                # Sigma Compare-pairs (Jul 2026): placed brackets carry
                # autoGen so Place can REPLACE its own set and Clear can
                # find it, without ever touching hand-made brackets.
                autoGen = isTRUE(r$autoGen),
                # Sigma stat box (Phase 3): WHAT the box shows ("omnibus" /
                # "normality" / "alpha" / "corrSummary") + its plate flag.
                # The text itself is never stored — computed live JS-side.
                statContent = if (!is.null(r$statContent)) as.character(r$statContent) else "",
                statPlate = if (!is.null(r$statPlate)) isTRUE(r$statPlate) else TRUE,
                # Bracket bar anchors (which two cells the legs point to).
                # Persisted so an auto-p bracket keeps its anchors across
                # an R round-trip / geometry change instead of relying on
                # the JS pixel re-snap (which fails once bars move). With
                # the anchor present the JS re-snaps each leg to the bar's
                # current center, so the bracket follows its bars.
                anchorLeftCat = if (!is.null(r$anchorLeftCat)) as.character(r$anchorLeftCat) else "",
                anchorLeftGroup = if (!is.null(r$anchorLeftGroup)) as.character(r$anchorLeftGroup) else "",
                anchorRightCat = if (!is.null(r$anchorRightCat)) as.character(r$anchorRightCat) else "",
                anchorRightGroup = if (!is.null(r$anchorRightGroup)) as.character(r$anchorRightGroup) else "",
                # Bracket label gap (px from the spine to the text); 10 is
                # the JS default, so an unset value round-trips unchanged.
                textOffset = if (!is.null(r$textOffset)) as.numeric(r$textOffset) else 10,
                # Shape-annotation fields (used by line / arrow /
                # rect / ellipse kinds). Default fill is a soft blue
                # at 0.3 opacity so a freshly-drawn shape reads as a
                # highlight; outline is opt-in.
                y2 = if (!is.null(r$y2)) as.numeric(r$y2) else 0,
                fillColor = if (!is.null(r$fillColor)) as.character(r$fillColor) else "#4a90e2",
                fillOpacity = if (!is.null(r$fillOpacity)) as.numeric(r$fillOpacity) else 0.3,
                hasFill = if (!is.null(r$hasFill)) isTRUE(r$hasFill) else TRUE,
                hasOutline = if (!is.null(r$hasOutline)) isTRUE(r$hasOutline) else FALSE,
                arrowEnd = if (!is.null(r$arrowEnd)) as.character(r$arrowEnd) else "end",
                # Polygon / star / curve / rounded-rect / arrow-head
                # parameters. nSides drives regular polygons (3-12);
                # nPoints + starInner drive stars; cornerRadius drives
                # rounded-rect; curvature is the perpendicular offset
                # (as a fraction of length) for the curved-line kind;
                # arrowHeadStyle / arrowHeadSize tune the arrowhead.
                nSides = if (!is.null(r$nSides)) as.numeric(r$nSides) else 5,
                nPoints = if (!is.null(r$nPoints)) as.numeric(r$nPoints) else 5,
                starInner = if (!is.null(r$starInner)) as.numeric(r$starInner) else 0.5,
                cornerRadius = if (!is.null(r$cornerRadius)) as.numeric(r$cornerRadius) else 0,
                curvature = if (!is.null(r$curvature)) as.numeric(r$curvature) else 0.3,
                curvatureLong = if (!is.null(r$curvatureLong)) as.numeric(r$curvatureLong) else 0,
                arrowHeadStyle = if (!is.null(r$arrowHeadStyle)) as.character(r$arrowHeadStyle) else "triangle",
                arrowHeadSize = if (!is.null(r$arrowHeadSize)) as.numeric(r$arrowHeadSize) else 1,
                # refLine length: fraction of the chart's main axis
                # (X for horizontal lines, Y for vertical lines) that
                # the line spans. Defaults span the full axis [0, 1].
                # Allows the user to shorten a reference line by
                # dragging its endpoint handles on-chart.
                startFrac = if (!is.null(r$startFrac)) as.numeric(r$startFrac) else 0,
                endFrac = if (!is.null(r$endFrac)) as.numeric(r$endFrac) else 1
            )
            # Relative bracket height (Aug 2026): px above the spanned
            # cells' per-type ceiling. Only-when-present, so payloads
            # without it stay byte-identical.
            if (!is.null(r$yRel)) entry$yRel <- as.numeric(r$yRel)
            out[[length(out) + 1L]] <- entry
        }
        out
    }

    normalize_group_colors <- function(x) {
        if (is.null(x) || length(x) == 0L) return(list())
        out <- list()
        for (i in seq_along(x)) {
            r <- x[[i]]
            orig <- ""
            col <- ""
            if (is.list(r)) {
                if (!is.null(r$original)) orig <- as.character(r$original)
                if (!is.null(r$color)) col <- as.character(r$color)
            }
            if (nzchar(orig) && nzchar(col)) {
                out[[length(out) + 1L]] <- list(original = orig, color = col)
            }
        }
        out
    }

    normalize_group_patterns <- function(x) {
        if (is.null(x) || length(x) == 0L) return(list())
        out <- list()
        for (i in seq_along(x)) {
            r <- x[[i]]
            orig <- ""
            pat <- ""
            den <- 1
            ang <- 45
            thk <- 1
            pcol <- ""
            if (is.list(r)) {
                if (!is.null(r$original)) orig <- as.character(r$original)
                if (!is.null(r$pattern)) pat <- as.character(r$pattern)
                if (!is.null(r$density)) den <- as.numeric(r$density)
                if (!is.null(r$angle)) ang <- as.numeric(r$angle)
                if (!is.null(r$thickness)) thk <- as.numeric(r$thickness)
                if (!is.null(r$patternColor)) pcol <- as.character(r$patternColor)
            }
            if (nzchar(orig) && nzchar(pat) && pat != "none") {
                out[[length(out) + 1L]] <- list(
                    original = orig,
                    pattern = pat,
                    density = den,
                    angle = ang,
                    thickness = thk,
                    patternColor = pcol
                )
            }
        }
        out
    }
    # Per-group bar-border overrides (color / width / opacity /
    # style). Mirrors normalize_group_patterns: drop entries
    # without an "original" group name; keep otherwise so the
    # widget can render per-group outline overrides on top of the
    # chart-wide barBorder* options.
    normalize_group_borders <- function(x) {
        if (is.null(x) || length(x) == 0L) return(list())
        out <- list()
        for (i in seq_along(x)) {
            r <- x[[i]]
            orig <- ""
            col  <- ""
            w    <- -1   # sentinel: "no width override, use chart-wide"
            op   <- -1   # sentinel: "no opacity override, use chart-wide"
            st   <- ""
            if (is.list(r)) {
                if (!is.null(r$original)) orig <- as.character(r$original)
                if (!is.null(r$color))    col  <- as.character(r$color)
                if (!is.null(r$width))    w    <- as.numeric(r$width)
                if (!is.null(r$opacity))  op   <- as.numeric(r$opacity)
                if (!is.null(r$style))    st   <- as.character(r$style)
            }
            # Drop fully-empty entries (no original group name OR
            # every override field is at its sentinel). Keeping
            # them would round-trip as no-op overrides forever.
            any_override <- nzchar(col) || (w >= 0) || (op >= 0) || nzchar(st)
            if (nzchar(orig) && any_override) {
                out[[length(out) + 1L]] <- list(
                    original = orig,
                    color    = col,
                    width    = w,
                    opacity  = op,
                    style    = st
                )
            }
        }
        out
    }
    # Generic per-group override normalizer (box whiskers/median/
    # outliers, violin density/inner-box/whiskers/median). Mirrors
    # normalize_group_borders' per-field-independent semantics:
    # string fields use the "" sentinel, numeric fields use -1, and
    # an entry survives only if it has an "original" key AND at least
    # one non-sentinel field (so no-op overrides don't round-trip
    # forever).
    normalize_group_overrides <- function(x, str_fields = character(0),
                                           num_fields = character(0)) {
        if (is.null(x) || length(x) == 0L) return(list())
        out <- list()
        for (i in seq_along(x)) {
            r <- x[[i]]
            if (!is.list(r)) next
            orig <- if (!is.null(r$original)) as.character(r$original) else ""
            if (!nzchar(orig)) next
            entry <- list(original = orig)
            any_override <- FALSE
            for (f in str_fields) {
                v <- if (!is.null(r[[f]])) as.character(r[[f]]) else ""
                if (length(v) != 1L || is.na(v)) v <- ""
                entry[[f]] <- v
                if (nzchar(v)) any_override <- TRUE
            }
            for (f in num_fields) {
                v <- if (!is.null(r[[f]])) as.numeric(r[[f]]) else -1
                if (length(v) != 1L || is.na(v)) v <- -1
                entry[[f]] <- v
                if (v >= 0) any_override <- TRUE
            }
            if (any_override) out[[length(out) + 1L]] <- entry
        }
        out
    }
    # Per-group bar-opacity overrides. Single numeric field; drop
    # any entry without an "original" group name OR whose opacity
    # is at the sentinel (-1 = "no override, use chart-wide").
    normalize_group_opacities <- function(x) {
        if (is.null(x) || length(x) == 0L) return(list())
        out <- list()
        for (i in seq_along(x)) {
            r <- x[[i]]
            orig <- ""
            op   <- -1
            if (is.list(r)) {
                if (!is.null(r$original)) orig <- as.character(r$original)
                if (!is.null(r$opacity))  op   <- as.numeric(r$opacity)
            }
            if (nzchar(orig) && op >= 0 && op <= 1) {
                out[[length(out) + 1L]] <- list(
                    original = orig,
                    opacity  = op
                )
            }
        }
        out
    }
    # Per-group bar-corner-radius overrides. Single non-negative
    # numeric field; sentinel is -1 ("no override, use chart-wide").
    normalize_group_corner_radii <- function(x) {
        if (is.null(x) || length(x) == 0L) return(list())
        out <- list()
        for (i in seq_along(x)) {
            r <- x[[i]]
            orig <- ""
            cr   <- -1
            if (is.list(r)) {
                if (!is.null(r$original))     orig <- as.character(r$original)
                if (!is.null(r$cornerRadius)) cr   <- as.numeric(r$cornerRadius)
            }
            if (nzchar(orig) && cr >= 0) {
                out[[length(out) + 1L]] <- list(
                    original     = orig,
                    cornerRadius = cr
                )
            }
        }
        out
    }
    # Per-group error-bar overrides. Per-field independent
    # (color / thickness / capSize each have their own sentinel).
    # Drop entries with no original AND no override fields set.
    normalize_group_error_bars <- function(x) {
        if (is.null(x) || length(x) == 0L) return(list())
        out <- list()
        for (i in seq_along(x)) {
            r <- x[[i]]
            orig <- ""
            col  <- ""
            thk  <- -1
            cap  <- -1
            capl <- -1
            if (is.list(r)) {
                if (!is.null(r$original))    orig <- as.character(r$original)
                if (!is.null(r$color))       col  <- as.character(r$color)
                if (!is.null(r$thickness))   thk  <- as.numeric(r$thickness)
                if (!is.null(r$capSize))     cap  <- as.numeric(r$capSize)
                if (!is.null(r$capSizeLine)) capl <- as.numeric(r$capSizeLine)
            }
            any_override <- nzchar(col) || (thk >= 0) || (cap >= 0) || (capl >= 0)
            if (nzchar(orig) && any_override) {
                out[[length(out) + 1L]] <- list(
                    original    = orig,
                    color       = col,
                    thickness   = thk,
                    capSize     = cap,
                    capSizeLine = capl
                )
            }
        }
        out
    }
    # Per-group scatter fit-line style overrides (width / style /
    # color / CI-band opacity). Drop entries with no group OR no
    # actual override field set. Sentinels: -1 (width / ciOpacity),
    # "" (style / color).
    normalize_fit_group_overrides <- function(x) {
        if (is.null(x) || length(x) == 0L) return(list())
        out <- list()
        for (i in seq_along(x)) {
            r <- x[[i]]
            grp <- ""; w <- -1; st <- ""; col <- ""; cio <- -1
            if (is.list(r)) {
                if (!is.null(r$group))     grp <- as.character(r$group)
                if (!is.null(r$width))     w   <- as.numeric(r$width)
                if (!is.null(r$style))     st  <- as.character(r$style)
                if (!is.null(r$color))     col <- as.character(r$color)
                if (!is.null(r$ciOpacity)) cio <- as.numeric(r$ciOpacity)
            }
            any_override <- (w >= 0) || nzchar(st) || nzchar(col) || (cio >= 0)
            if (nzchar(grp) && any_override) {
                out[[length(out) + 1L]] <- list(
                    group     = grp,
                    width     = w,
                    style     = st,
                    color     = col,
                    ciOpacity = cio
                )
            }
        }
        out
    }
    # Per-CATEGORY style overrides for ungrouped charts (single
    # store covering color / pattern / opacity / corner per X-axis
    # category). Sentinels: "" for strings, -1 for opacity +
    # cornerRadius. Pattern sub-fields (density/angle/thickness/
    # patternColor) are only meaningful when `pattern` is set, so
    # they ride along as a snapshot. Drop entries that carry no
    # actual override.
    normalize_category_styles <- function(x) {
        if (is.null(x) || length(x) == 0L) return(list())
        out <- list()
        for (i in seq_along(x)) {
            r <- x[[i]]
            orig <- ""; col <- ""; pat <- ""
            den <- 1; ang <- 45; thk <- 1; pcol <- ""
            op <- -1; cr <- -1
            bcol <- ""; bw <- -1; bst <- ""; bop <- -1
            ebcol <- ""; ebthk <- -1; ebcap <- -1; ebcapl <- -1
            psz <- -1; psh <- ""; pocol <- ""; pow <- -1
            if (is.list(r)) {
                if (!is.null(r$original))     orig <- as.character(r$original)
                if (!is.null(r$color))        col  <- as.character(r$color)
                if (!is.null(r$pattern))      pat  <- as.character(r$pattern)
                if (!is.null(r$density))      den  <- as.numeric(r$density)
                if (!is.null(r$angle))        ang  <- as.numeric(r$angle)
                if (!is.null(r$thickness))    thk  <- as.numeric(r$thickness)
                if (!is.null(r$patternColor)) pcol <- as.character(r$patternColor)
                if (!is.null(r$opacity))      op   <- as.numeric(r$opacity)
                if (!is.null(r$cornerRadius)) cr   <- as.numeric(r$cornerRadius)
                if (!is.null(r$borderColor))  bcol <- as.character(r$borderColor)
                if (!is.null(r$borderWidth))  bw   <- as.numeric(r$borderWidth)
                if (!is.null(r$borderStyle))  bst  <- as.character(r$borderStyle)
                if (!is.null(r$borderOpacity)) bop <- as.numeric(r$borderOpacity)
                if (!is.null(r$errorBarColor))     ebcol <- as.character(r$errorBarColor)
                if (!is.null(r$errorBarThickness)) ebthk <- as.numeric(r$errorBarThickness)
                if (!is.null(r$errorBarCapSize))   ebcap <- as.numeric(r$errorBarCapSize)
                if (!is.null(r$errorBarCapSizeLine)) ebcapl <- as.numeric(r$errorBarCapSizeLine)
                if (!is.null(r$pointSize))         psz   <- as.numeric(r$pointSize)
                if (!is.null(r$pointShape))        psh   <- as.character(r$pointShape)
                if (!is.null(r$pointOutlineColor)) pocol <- as.character(r$pointOutlineColor)
                if (!is.null(r$pointOutlineWidth)) pow   <- as.numeric(r$pointOutlineWidth)
            }
            any_override <- nzchar(col) || nzchar(pat) ||
                            (op >= 0) || (cr >= 0) ||
                            nzchar(bcol) || (bw >= 0) || nzchar(bst) || (bop >= 0) ||
                            nzchar(ebcol) || (ebthk >= 0) || (ebcap >= 0) || (ebcapl >= 0) ||
                            (psz >= 0) || nzchar(psh) || nzchar(pocol) || (pow >= 0)
            if (nzchar(orig) && any_override) {
                out[[length(out) + 1L]] <- list(
                    original          = orig,
                    color             = col,
                    pattern           = pat,
                    density           = den,
                    angle             = ang,
                    thickness         = thk,
                    patternColor      = pcol,
                    opacity           = op,
                    cornerRadius      = cr,
                    borderColor       = bcol,
                    borderWidth       = bw,
                    borderStyle       = bst,
                    borderOpacity     = bop,
                    errorBarColor     = ebcol,
                    errorBarThickness = ebthk,
                    errorBarCapSize   = ebcap,
                    errorBarCapSizeLine = ebcapl,
                    pointSize         = psz,
                    pointShape        = psh,
                    pointOutlineColor = pocol,
                    pointOutlineWidth = pow
                )
            }
        }
        out
    }

    # Apply any pending palette-library action (save / delete / replace)
    # to the user-level library on disk, then send the current state
    # (and this machine's ID) along with the rest of the payload.
    palette_lib <- .gb_palette_lib_read()
    palette_lib <- .gb_palette_lib_apply(palette_lib, as.character(palette_action))

    # "Default palette for new charts": an EMPTY chartPalette option
    # means the user never picked one for this analysis, so resolve it
    # against the library's defaultPalette (set via the Palette tab's
    # "Use as default" control). Analyses with an explicit id baked
    # into the .omv are untouched, and the option itself stays "" (the
    # widget only commits chartPalette on an explicit pick), so an
    # unpinned analysis keeps following the user's default. A dangling
    # saved: default falls back to the stock default.
    chart_palette <- as.character(chart_palette)
    palette_default_id <- as.character(palette_lib$defaultPalette %||% "")
    if (!nzchar(chart_palette)) {
        chart_palette <- palette_default_id
        if (startsWith(chart_palette, "saved:") &&
            is.null(palette_lib$palettes[[substring(chart_palette, 7)]]))
            chart_palette <- ""
        if (!nzchar(chart_palette)) chart_palette <- "default"
    }

    # Chart-style library: same lifecycle as the palette library (one
    # action applied per render, current state shipped back down).
    # Shares the palette library's machineId - the widget stamps every
    # action with the ONE id it receives in the payload.
    style_lib <- .gb_style_lib_read(as.character(palette_lib$machineId))
    style_lib <- .gb_style_lib_apply(style_lib, as.character(style_action))
    style_default_id <- as.character(style_lib$defaultStyle %||% "")

    # "Default style for new charts": auto-apply fires ONLY on an
    # analysis that has never rendered a widget before. styleStamp
    # FALSE alone can't distinguish a brand-new analysis from an old
    # .omv that predates the option, so it is ANDed with an empty
    # clientBundleHash: any analysis that rendered before this feature
    # existed has already committed a bundle hash and is left alone
    # (a hand-styled old chart must never be silently restyled). The
    # widget applies the style via ordinary option commits and stamps
    # styleStamp TRUE in the same batch, so this fires at most once.
    style_auto_apply <- nzchar(style_default_id) &&
        !is.null(style_lib$styles[[style_default_id]]) &&
        !isTRUE(as.logical(style_stamp)) &&
        !nzchar(as.character(client_bundle_hash))

    # Phase timings (only the slowest pieces of the R→HTML path).
    # When the GB2_TIMING env var is set we emit them as an HTML
    # comment so users can inspect via view-source in the result.
    .gb2_timings <- list(
        t_start = as.numeric(Sys.time())
    )

    payload <- list(
        bars = bars,
        isRepeatedMeasures = isTRUE(is_repeated_measures),
        xyPoints = xy_points,
        xyFits   = xy_fits,
        xyXLevels = as.list(xy_x_levels),
        xyYLevels = as.list(xy_y_levels),
        xyPointSize          = as.numeric(xy_point_size),
        xyPointShape         = as.character(xy_point_shape),
        xyPointOpacity       = as.numeric(xy_point_opacity),
        xyPointColorMatch    = isTRUE(xy_point_color_match),
        xyPointColor         = as.character(xy_point_color),
        xyPointOutlineColor  = as.character(xy_point_outline_color),
        xyPointOutlineWidth  = as.numeric(xy_point_outline_width),
        xyPointJitter        = as.numeric(xy_point_jitter),
        xyPointShapes        = as.list(xy_point_shapes),
        xyPointGroupStyles   = as.character(xy_point_group_styles),
        xyEllipseGroupStyles = as.character(xy_ellipse_group_styles),
        xyRugGroupStyles     = as.character(xy_rug_group_styles),
        xyMarginalGroupStyles = as.character(xy_marginal_group_styles),
        xyDensity2DGroupStyles = as.character(xy_density2d_group_styles),
        xyEllipses           = as.list(xy_ellipses),
        xyShowEllipse        = isTRUE(xy_show_ellipse),
        xyEllipseLevel       = as.numeric(xy_ellipse_level),
        xyEllipseFill        = isTRUE(xy_ellipse_fill),
        xyEllipseOpacity     = as.numeric(xy_ellipse_opacity),
        xyEllipseWidth       = as.numeric(xy_ellipse_width),
        xyEllipseStyle       = as.character(xy_ellipse_style),
        xyEllipseColorMatch  = isTRUE(xy_ellipse_color_match),
        xyEllipseColor       = as.character(xy_ellipse_color),
        xyHiddenEllipseGroups = as.list(xy_hidden_ellipse_groups),
        xyShowOutliers       = isTRUE(xy_show_outliers),
        xyOutlierThreshold   = as.numeric(xy_outlier_threshold),
        xyOutlierColor       = as.character(xy_outlier_color),
        xyOutlierLabel       = isTRUE(xy_outlier_label),
        xyOutlierSize        = as.numeric(xy_outlier_size),
        xyOutlierWidth       = as.numeric(xy_outlier_width),
        xyDensity2D          = as.list(xy_density2d),
        xyShowDensity2D      = isTRUE(xy_show_density2d),
        xyDensity2DFill      = isTRUE(xy_density2d_fill),
        xyDensity2DLevels    = as.numeric(xy_density2d_levels),
        xyDensity2DOpacity   = as.numeric(xy_density2d_opacity),
        xyDensity2DWidth     = as.numeric(xy_density2d_width),
        xyDensity2DColorMatch = isTRUE(xy_density2d_color_match),
        xyDensity2DColor     = as.character(xy_density2d_color),
        xyHiddenDensity2DGroups = as.list(xy_hidden_density2d_groups),
        xyBins               = as.list(xy_bins),
        xyBinsMax            = as.numeric(xy_bins_max),
        xyBin                = as.character(xy_bin),
        xyBinCount           = as.numeric(xy_bin_count),
        xyBinColor           = as.character(xy_bin_color),
        xyBinPalette         = as.character(xy_bin_palette),
        xyBinCustomLow       = as.character(xy_bin_custom_low),
        xyBinCustomMid       = as.character(xy_bin_custom_mid),
        xyBinCustomHigh      = as.character(xy_bin_custom_high),
        xyBinMaxOpacity      = as.numeric(xy_bin_max_opacity),
        xyBinShowPoints      = isTRUE(xy_bin_show_points),
        xyBinLegendScale     = as.numeric(xy_bin_legend_scale),
        xyBinLegendColor     = as.character(xy_bin_legend_color),
        xyBinLegendDX        = as.numeric(xy_bin_legend_dx),
        xyBinLegendDY        = as.numeric(xy_bin_legend_dy),
        xyBinLegendShow      = isTRUE(xy_bin_legend_show),
        xyBinLegendTitle     = as.character(xy_bin_legend_title),
        xyBinLegendOrient    = as.character(xy_bin_legend_orient),
        xyBinLegendTicks     = as.numeric(xy_bin_legend_ticks),
        xyXScale             = as.character(xy_x_scale),
        xyYScale             = as.character(xy_y_scale),
        xyReverseX           = isTRUE(xy_reverse_x),
        xyReverseY           = isTRUE(xy_reverse_y),
        xyShowFit            = isTRUE(xy_show_fit),
        xyFitFullRange       = isTRUE(xy_fit_full_range),
        xyHasSize            = isTRUE(xy_has_size),
        xySizeMin            = as.numeric(xy_size_min),
        xySizeMax            = as.numeric(xy_size_max),
        xySizeVar            = as.character(xy_size_var),
        xyHasLabels          = isTRUE(xy_has_labels),
        xyLabelVar           = as.character(xy_label_var),
        xyFitType            = as.character(xy_fit_type),
        xyLoessSpan          = as.numeric(xy_loess_span),
        xyFitWidth           = as.numeric(xy_fit_width),
        xyFitStyle           = as.character(xy_fit_style),
        xyFitColorMatch      = isTRUE(xy_fit_color_match),
        xyFitColor           = as.character(xy_fit_color),
        xyShowCI             = isTRUE(xy_show_ci),
        xyCIOpacity          = as.numeric(xy_ci_opacity),
        xyCILevel            = as.numeric(xy_ci_level),
        xyHiddenFitGroups    = as.list(xy_hidden_fit_groups),
        fitGroupOverrides    = normalize_fit_group_overrides(fit_group_overrides),
        xyHiddenGroups       = as.list(xy_hidden_groups),
        xyStats              = xy_stats,
        xyShowStats          = isTRUE(xy_show_stats),
        xyStatsPosition      = as.character(xy_stats_position),
        xyStatsCorrType      = as.character(xy_stats_corr_type),
        xyStatsDecimals      = as.numeric(xy_stats_decimals),
        xyStatsShowR         = isTRUE(xy_stats_show_r),
        xyStatsShowP         = isTRUE(xy_stats_show_p),
        xyStatsShowN         = isTRUE(xy_stats_show_n),
        xyStatsShowR2        = isTRUE(xy_stats_show_r2),
        xyStatsShowEqn       = isTRUE(xy_stats_show_eqn),
        xyStatsFontSize      = as.numeric(xy_stats_font_size),
        xyStatsPlate         = isTRUE(xy_stats_plate),
        xyStatsOffsetX       = as.numeric(xy_stats_offset_x),
        xyStatsOffsetY       = as.numeric(xy_stats_offset_y),
        xyStatsWidth         = as.numeric(xy_stats_width),
        xyStatsHeight        = as.numeric(xy_stats_height),
        xyRug                = as.character(xy_rug),
        xyRugLength          = as.numeric(xy_rug_length),
        xyRugWidth           = as.numeric(xy_rug_width),
        xyRugOpacity         = as.numeric(xy_rug_opacity),
        xyRugColorMatch      = isTRUE(xy_rug_color_match),
        xyRugColor           = as.character(xy_rug_color),
        xyMarginalXHist      = xy_marginal_x_hist,
        xyMarginalXDens      = xy_marginal_x_dens,
        xyMarginalYHist      = xy_marginal_y_hist,
        xyMarginalYDens      = xy_marginal_y_dens,
        xyMarginalXHistGroups = xy_marginal_x_hist_groups,
        xyMarginalXDensGroups = xy_marginal_x_dens_groups,
        xyMarginalYHistGroups = xy_marginal_y_hist_groups,
        xyMarginalYDensGroups = xy_marginal_y_dens_groups,
        xyMarginal           = as.character(xy_marginal),
        xyMarginalAxes       = as.character(xy_marginal_axes),
        xyMarginalSize       = as.numeric(xy_marginal_size),
        xyMarginalOpacity    = as.numeric(xy_marginal_opacity),
        xyMarginalColor      = as.character(xy_marginal_color),
        xyMarginalColorMatch = isTRUE(xy_marginal_color_match),
        xMinOverride         = isTRUE(x_min_override),
        xMin                 = as.numeric(x_min),
        xMaxOverride         = isTRUE(x_max_override),
        xMax                 = as.numeric(x_max),
        xIntervalOverride    = isTRUE(x_interval_override),
        xInterval            = as.numeric(x_interval),
        graphType = as.character(graph_type),
        graphTypeChoices = graph_type_choices,
        graphTypeInstant = isTRUE(graph_type_instant),
        graphTypeOption = as.character(graph_type_option),
        xLabel = as.character(x_label),
        yLabel = as.character(y_label),
        groupLabel = as.character(group_label),
        # Default (un-overridden) labels for the on-chart "Reset to
        # original text" affordance. Fall back to the live label when a
        # module doesn't supply a default (then live == default => the
        # widget reads it as "not overridden" and offers no reset).
        xLabelDefault = as.character(if (is.null(x_label_default)) x_label else x_label_default),
        yLabelDefault = as.character(if (is.null(y_label_default)) y_label else y_label_default),
        groupLabelDefault = as.character(if (is.null(group_label_default)) group_label else group_label_default),
        # as.list() keeps a single-element vector serialized as a JSON
        # array (not a scalar) under auto_unbox=TRUE, so single-category
        # charts don't collapse to "" and trip the JS empty-state guard.
        xCategories = as.list(as.character(x_categories)),
        groupCategories = if (has_groups) as.list(as.character(group_categories)) else list(),
        hasGroups = has_groups,
        facetSeparator = as.character(facet_separator),
        facetLevels = if (!is.null(facet_levels) && length(facet_levels) > 0L)
                          as.list(as.character(facet_levels)) else list(),
        facetLabel = as.character(facet_label),
        pivotFactors = if (!is.null(pivot_factors) && length(pivot_factors))
                           pivot_factors else list(),
        pivotObs = if (!is.null(pivot_obs)) pivot_obs else NULL,
        pivotMorey = as.numeric(pivot_morey),
        pivotMissBase = if (!is.null(pivot_miss_base)) as.character(pivot_miss_base) else "",
        rmCrossed = isTRUE(rm_crossed),
        facetStripShow = isTRUE(facet_strip_show),
        facetStripPosition = as.character(facet_strip_position),
        facetStripLabels = facet_strip_labels,
        facetStripUnderline = isTRUE(facet_strip_underline),
        facetStripUnderlineColor = as.character(facet_strip_underline_color),
        facetStripUnderlineWidth = as.numeric(facet_strip_underline_width),
        facetStripUnderlineStyle = as.character(facet_strip_underline_style),
        facetStripUnderlineLength = as.numeric(facet_strip_underline_length),
        facetGap = as.numeric(facet_gap),
        facetDivider = as.character(facet_divider),
        facetDividerColor = as.character(facet_divider_color),
        facetDividerWidth = as.numeric(facet_divider_width),
        facetDividerStyle = as.character(facet_divider_style),
        # as.list() forces a JSON array even for length 1 — a bare
        # as.character() of a single value auto-unboxes to a scalar string,
        # so hiding/ordering ONE facet reached the JS as "North" not
        # ["North"] and Array.isArray failed (the hide silently no-op'd).
        facetOrder = if (!is.null(facet_order) && length(facet_order) > 0L)
                          as.list(as.character(facet_order)) else list(),
        hiddenFacets = if (!is.null(hidden_facets) && length(hidden_facets) > 0L)
                          as.list(as.character(hidden_facets)) else list(),
        facetShading = as.character(facet_shading),
        facetShadingColor = as.character(facet_shading_color),
        facetShadingOpacity = as.numeric(facet_shading_opacity),
        facetBorder = isTRUE(facet_border),
        facetBorderColor = as.character(facet_border_color),
        facetBorderWidth = as.numeric(facet_border_width),
        facetStripBackground = as.character(facet_strip_background),
        facetStripBackgroundColor = as.character(facet_strip_background_color),
        facetStripBackgroundOpacity = as.numeric(facet_strip_background_opacity),
        facetStripRotation = as.numeric(facet_strip_rotation),
        facetDropEmpty = isTRUE(facet_drop_empty),
        facetLayout = as.character(facet_layout),
        facetWrapCols = as.integer(facet_wrap_cols),
        facetFreeY = isTRUE(facet_free_y),
        facetXTickLabels = as.character(facet_x_tick_labels),
        xTickLabelWrap = isTRUE(x_tick_label_wrap),
        plotWidth = as.numeric(plot_width),
        plotHeight = as.numeric(plot_height),
        yMinOverride = isTRUE(y_min_override),
        yAxisBreak = isTRUE(y_axis_break),
        xAxisBreak = isTRUE(x_axis_break),
        yMin = as.numeric(y_min),
        yMaxOverride = isTRUE(y_max_override),
        yMax = as.numeric(y_max),
        yIntervalOverride = isTRUE(y_interval_override),
        yInterval = as.numeric(y_interval),
        chartTitle = as.character(chart_title),
        chartNote = as.character(chart_note),
        chartAltText = as.character(chart_alt_text),
        xCategoryRelabels = normalize_relabels(x_category_relabels),
        groupItemRelabels = normalize_relabels(group_item_relabels),
        yTickRelabels = normalize_relabels(y_tick_relabels),
        textOffsets = normalize_offsets(text_offsets),
        legendItemOffsets = normalize_offsets(legend_item_offsets),
        legendLayoutCustom = isTRUE(legend_layout_custom),
        legendOrder = if (is.null(legend_order)) list() else as.list(as.character(legend_order)),
        chartOrientation = as.character(chart_orientation),
        chartBackground = as.character(chart_background),
        chartFontFamily = as.character(chart_font_family),
        chartPalette = as.character(chart_palette),
        customPalette = as.character(custom_palette),
        paletteLibrary = palette_lib$palettes,
        paletteLibraryMachineId = as.character(palette_lib$machineId),
        # The library's "default palette for new charts" id ("" = none)
        # - drives the Palette tab's "Use as default" control state.
        paletteDefaultId = palette_default_id,
        # Chart-style library: saved styles dict (name -> {groups, opts}),
        # the default-for-new-charts style name ("" = none), and the
        # one-shot auto-apply flag (see the style_auto_apply derivation).
        styleLibrary = style_lib$styles,
        styleDefaultId = style_default_id,
        styleAutoApply = isTRUE(style_auto_apply),
        # Echoed back so the JS-side commit reconciliation (pendingOpts /
        # recentCommits vs incoming data) sees the handshake option like
        # any other and the byte-identical echo skip keeps working.
        clientBundleHash = as.character(client_bundle_hash),
        chartBorder = as.character(chart_border),
        chartGrid = as.character(chart_grid),
        chartGridLayer = as.character(chart_grid_layer),
        chartGridMajorColor = as.character(chart_grid_major_color),
        chartGridMajorThickness = as.numeric(chart_grid_major_thickness),
        chartGridMinorEnabled = isTRUE(chart_grid_minor_enabled),
        chartGridMinorColor = as.character(chart_grid_minor_color),
        chartGridMinorThickness = as.numeric(chart_grid_minor_thickness),
        chartGridMajorStyle = as.character(chart_grid_major_style),
        chartGridMinorStyle = as.character(chart_grid_minor_style),
        chartTextColor = as.character(chart_text_color),
        chartAspectLock = isTRUE(chart_aspect_lock),
        chartSnapToGrid = isTRUE(chart_snap_to_grid),
        chartAlignGuides = isTRUE(chart_align_guides),
        hiddenBars = normalize_hidden_bars(hidden_bars),
        hiddenPoints = normalize_hidden_points(hidden_points),
        hiddenElements = if (is.null(hidden_elements)) list() else as.list(as.character(hidden_elements)),
        categoryGapOverrides = normalize_category_gap_overrides(category_gap_overrides),
        groupGapOverrides = normalize_group_gap_overrides(group_gap_overrides),
        categoryOrder = if (is.null(category_order)) list() else as.list(as.character(category_order)),
        groupOrder = if (is.null(group_order)) list() else as.list(as.character(group_order)),
        textStyles = normalize_text_styles(text_styles),
        groupColors = normalize_group_colors(group_colors),
        barColor = as.character(bar_color),
        groupPatterns = normalize_group_patterns(group_patterns),
        groupBorders  = normalize_group_borders(group_borders),
        groupOpacities = normalize_group_opacities(group_opacities),
        densGroupStyles = normalize_group_overrides(dens_group_styles,
                              str_fields = c("lineColor", "lineStyle"),
                              num_fields = c("lineWidth", "lineOpacity", "fillOpacity")),
        distNormalGroupStyles = normalize_group_overrides(dist_normal_group_styles,
                              str_fields = c("color", "style"),
                              num_fields = c("width", "opacity")),
        groupCornerRadii = normalize_group_corner_radii(group_corner_radii),
        groupErrorBars = normalize_group_error_bars(group_error_bars),
        categoryStyles = normalize_category_styles(category_styles),
        groupBoxWhiskers = normalize_group_overrides(
            group_box_whiskers,
            str_fields = c("color", "style"),
            num_fields = c("width", "opacity", "capFrac")),
        groupBoxMedians = normalize_group_overrides(
            group_box_medians,
            str_fields = c("color", "style"),
            num_fields = c("width", "opacity")),
        groupBoxOutliers = normalize_group_overrides(
            group_box_outliers,
            str_fields = c("shape", "color", "ringColor"),
            num_fields = c("size", "ringSize", "ringWidth")),
        groupViolinDensity = normalize_group_overrides(
            group_violin_density,
            num_fields = c("bandwidth")),
        groupViolinInnerBox = normalize_group_overrides(
            group_violin_inner_box,
            str_fields = c("color"),
            num_fields = c("widthFrac", "opacity")),
        groupViolinWhiskers = normalize_group_overrides(
            group_violin_whiskers,
            str_fields = c("color", "style"),
            num_fields = c("width", "opacity")),
        groupDataPoints = normalize_group_overrides(
            group_data_points,
            str_fields = c("color", "shape", "scatter", "outlineColor"),
            num_fields = c("size", "opacity", "spread", "outlineWidth")),
        groupQQStyles = normalize_group_overrides(
            group_qq_styles,
            str_fields = c("shape", "outlineColor", "lineColor", "lineStyle", "bandColor"),
            num_fields = c("size", "opacity", "outlineWidth", "lineWidth", "lineOpacity", "bandOpacity")),
        groupViolinMedians = normalize_group_overrides(
            group_violin_medians,
            str_fields = c("color"),
            num_fields = c("size")),
        barPattern = as.character(bar_pattern),
        barPatternDensity = as.numeric(bar_pattern_density),
        barPatternAngle = as.numeric(bar_pattern_angle),
        barPatternThickness = as.numeric(bar_pattern_thickness),
        barPatternColor = as.character(bar_pattern_color),
        errorBarDirection = as.character(error_bar_direction),
        errorBarColorMatch = isTRUE(error_bar_color_match),
        errorBarColor = as.character(error_bar_color),
        errorBarThickness = as.numeric(error_bar_thickness),
        errorBarCapSize = as.numeric(error_bar_cap_size),
        errorBarCapSizeLine = as.numeric(error_bar_cap_size_line),
        barBorderColor = as.character(bar_border_color),
        barBorderWidth = as.numeric(bar_border_width),
        barBorderOpacity = as.numeric(bar_border_opacity),
        barBorderStyle = as.character(bar_border_style),
        categoryGap = as.numeric(category_gap),
        barGap = as.numeric(bar_gap),
        legendSwatchSize = as.numeric(legend_swatch_size),
        legendOffsetX = as.numeric(legend_offset_x),
        legendOffsetY = as.numeric(legend_offset_y),
        annotations = normalize_annotations(annotations),
        autoPCorrection = as.character(auto_p_correction),
        legendRowSpacing = as.numeric(legend_row_spacing),
        legendSwatchGap = as.numeric(legend_swatch_gap),
        xAxisThickness = as.numeric(x_axis_thickness),
        yAxisThickness = as.numeric(y_axis_thickness),
        xAxisStyle = as.character(x_axis_style),
        yAxisStyle = as.character(y_axis_style),
        xAxisColor = as.character(x_axis_color),
        xTickColor = as.character(x_tick_color),
        xTickDirection = as.character(x_tick_direction),
        yAxisColor = as.character(y_axis_color),
        yTickColor = as.character(y_tick_color),
        yTickDirection = as.character(y_tick_direction),
        xTickLength = as.numeric(x_tick_length),
        yTickLength = as.numeric(y_tick_length),
        yMinorTicks = isTRUE(y_minor_ticks),
        yMinorTickCount = as.numeric(y_minor_tick_count),
        xMinorTicks = isTRUE(x_minor_ticks),
        xMinorTickCount = as.numeric(x_minor_tick_count),
        xTickThickness = as.numeric(x_tick_thickness),
        yTickThickness = as.numeric(y_tick_thickness),
        barOpacity = as.numeric(bar_opacity),
        barCornerRadius = as.numeric(bar_corner_radius),
        boxWhiskerColor = as.character(box_whisker_color),
        boxWhiskerWidth = as.numeric(box_whisker_width),
        boxWhiskerStyle = as.character(box_whisker_style),
        boxWhiskerCapFrac = as.numeric(box_whisker_cap_frac),
        boxWhiskerOpacity = as.numeric(box_whisker_opacity),
        boxMedianColor = as.character(box_median_color),
        boxMedianWidth = as.numeric(box_median_width),
        boxMedianStyle = as.character(box_median_style),
        boxMedianOpacity = as.numeric(box_median_opacity),
        boxShowOutliers = isTRUE(box_show_outliers),
        boxOutlierShape = as.character(box_outlier_shape),
        boxOutlierSize = as.numeric(box_outlier_size),
        boxOutlierColor = as.character(box_outlier_color),
        boxOutlierOutlineColor = as.character(box_outlier_outline_color),
        boxOutlierOutlineWidth = as.numeric(box_outlier_outline_width),
        boxOutlierOpacity = as.numeric(box_outlier_opacity),
        boxOutlierRingColor = as.character(box_outlier_ring_color),
        boxOutlierRingSize = as.numeric(box_outlier_ring_size),
        boxOutlierRingWidth = as.numeric(box_outlier_ring_width),
        violinBandwidth = as.numeric(violin_bandwidth),
        violinScale = as.character(violin_scale),
        violinTrim = isTRUE(violin_trim),
        violinSide = as.character(violin_side),
        violinShowBox = isTRUE(violin_show_box),
        violinShowMedian = isTRUE(violin_show_median),
        violinBoxWidthFrac = as.numeric(violin_box_width_frac),
        violinBoxColor = as.character(violin_box_color),
        violinBoxOpacity = as.numeric(violin_box_opacity),
        violinWhiskerColor = as.character(violin_whisker_color),
        violinWhiskerWidth = as.numeric(violin_whisker_width),
        violinWhiskerOpacity = as.numeric(violin_whisker_opacity),
        violinWhiskerStyle = as.character(violin_whisker_style),
        violinMedianColor = as.character(violin_median_color),
        violinMedianSize = as.numeric(violin_median_size),
        rainSide = as.character(rain_side),
        lineWidth = as.numeric(line_width),
        lineStyle = as.character(line_style),
        lineOpacity = as.numeric(line_opacity),
        lineSmooth = isTRUE(line_smooth),
        lineConnectFacets = isTRUE(line_connect_facets),
        lineMarkerSpread = as.numeric(line_marker_spread),
        showLinePoints = isTRUE(show_line_points),
        linePointSize = as.numeric(line_point_size),
        linePointShape = as.character(line_point_shape),
        linePointOutlineWidth = as.numeric(line_point_outline_width),
        linePointOutlineColor = as.character(line_point_outline_color),
        linePointColor = as.character(line_point_color),
        lineColorMatchMarker = isTRUE(line_color_match_marker),
        lineGroupOverrides = line_group_overrides,
        showDataPoints = isTRUE(show_data_points),
        barValueLabels = isTRUE(bar_value_labels),
        barNLabels = isTRUE(bar_n_labels),
        showBarOutliers = isTRUE(show_bar_outliers),
        barOutlierMethod = as.character(bar_outlier_method),
        barOutlierIqrK = as.numeric(bar_outlier_iqr_k),
        barOutlierSdK = as.numeric(bar_outlier_sd_k),
        barOutlierColor = as.character(bar_outlier_color),
        barOutlierLabel = isTRUE(bar_outlier_label),
        barOutlierSize = as.numeric(bar_outlier_size),
        barOutlierWidth = as.numeric(bar_outlier_width),
        connectSubjects = isTRUE(connect_subjects),
        connectSubjectsColorMatch = isTRUE(connect_subjects_color_match),
        connectSubjectsColor = as.character(connect_subjects_color),
        connectSubjectsWidth = as.numeric(connect_subjects_width),
        connectSubjectsOpacity = as.numeric(connect_subjects_opacity),
        connectSubjectsStyle = as.character(connect_subjects_style),
        pointScatter = as.character(point_scatter),
        pointShape = as.character(point_shape),
        pointSize = as.numeric(point_size),
        pointSpreadWidth = as.numeric(point_spread_width),
        pointOpacity = as.numeric(point_opacity),
        pointColorMatch = isTRUE(point_color_match),
        pointColor = as.character(point_color),
        pointOutlineWidth = as.numeric(point_outline_width),
        pointOutlineColor = as.character(point_outline_color),
        # --- Distribution continuous-X geometry (distplotbuilder) ---
        histBins = as.numeric(hist_bins),
        histBinWidth = as.numeric(hist_bin_width),
        histStat = as.character(hist_stat),
        histPosition = as.character(hist_position),
        histColor = as.character(hist_color),
        histOutlineColor = as.character(hist_outline_color),
        histOutlineWidth = as.numeric(hist_outline_width),
        histOutlineStyle = as.character(hist_outline_style),
        histOutlineOpacity = as.numeric(hist_outline_opacity),
        histOpacity = as.numeric(hist_opacity),
        densBandwidthAdjust = as.numeric(dens_bandwidth_adjust),
        densKernel = as.character(dens_kernel),
        densFill = isTRUE(dens_fill),
        densOpacity = as.numeric(dens_opacity),
        densLineColor = as.character(dens_line_color),
        densLineWidth = as.numeric(dens_line_width),
        densLineStyle = as.character(dens_line_style),
        densLineOpacity = as.numeric(dens_line_opacity),
        histDensityScaleToCount = isTRUE(hist_density_scale_to_count),
        qqShowLine = isTRUE(qq_show_line),
        qqLineColor = as.character(qq_line_color),
        qqLineWidth = as.numeric(qq_line_width),
        qqLineStyle = as.character(qq_line_style),
        qqLineOpacity = as.numeric(qq_line_opacity),
        qqBand = isTRUE(qq_band),
        qqBandLevel = as.numeric(qq_band_level),
        qqBandColor = as.character(qq_band_color),
        qqBandOpacity = as.numeric(qq_band_opacity),
        qqPointSize = as.numeric(qq_point_size),
        qqPointColor = as.character(qq_point_color),
        qqPointShape = as.character(qq_point_shape),
        qqPointOpacity = as.numeric(qq_point_opacity),
        qqPointOutlineColor = as.character(qq_point_outline_color),
        qqPointOutlineWidth = as.numeric(qq_point_outline_width),
        ecdfStep = as.character(ecdf_step),
        ecdfLineWidth = as.numeric(ecdf_line_width),
        ecdfLineColor = as.character(ecdf_line_color),
        ecdfLineStyle = as.character(ecdf_line_style),
        ecdfLineOpacity = as.numeric(ecdf_line_opacity),
        ecdfComplement = isTRUE(ecdf_complement),
        ecdfPad = isTRUE(ecdf_pad),
        distRug = isTRUE(dist_rug),
        distRugColor = as.character(dist_rug_color),
        distRugLength = as.numeric(dist_rug_length),
        distRugWidth = as.numeric(dist_rug_width),
        distRugOpacity = as.numeric(dist_rug_opacity),
        distNormalCurve = isTRUE(dist_normal_curve),
        distNormalColor = as.character(dist_normal_color),
        distNormalWidth = as.numeric(dist_normal_width),
        distNormalStyle = as.character(dist_normal_style),
        distNormalOpacity = as.numeric(dist_normal_opacity),
        # --- Frequencies categorical counts (freqplotbuilder) ---
        freqMode = isTRUE(freq_mode),
        freqStat = as.character(freq_stat),
        freqPosition = as.character(freq_position),
        freqPooledNote = as.character(freq_pooled_note),
        missingNote = as.character(missing_note),
        freqShowChisq = isTRUE(freq_show_chisq),
        freqChisqPosition = as.character(freq_chisq_position),
        freqChisqFontSize = as.numeric(freq_chisq_font_size),
        freqChisqDX = as.numeric(freq_chisq_dx),
        freqChisqDY = as.numeric(freq_chisq_dy),
        freqChisqPlate = isTRUE(freq_chisq_plate),
        pieHole = as.numeric(pie_hole),
        pieStartAngle = as.numeric(pie_start_angle),
        pieLabels = as.character(pie_labels),
        sliceBorderColor = as.character(slice_border_color),
        sliceBorderWidth = as.numeric(slice_border_width),
        sliceBorderStyle = as.character(slice_border_style),
        sliceBorderOpacity = as.numeric(slice_border_opacity),
        paretoLineColor = as.character(pareto_line_color),
        paretoLineWidth = as.numeric(pareto_line_width),
        paretoLineStyle = as.character(pareto_line_style),
        paretoLineOpacity = as.numeric(pareto_line_opacity),
        paretoShowMarkers = isTRUE(pareto_show_markers),
        paretoMarkerColor = as.character(pareto_marker_color),
        paretoMarkerShape = as.character(pareto_marker_shape),
        paretoMarkerSize = as.numeric(pareto_marker_size),
        paretoMarkerOpacity = as.numeric(pareto_marker_opacity),
        paretoMarkerOutlineColor = as.character(pareto_marker_outline_color),
        paretoMarkerOutlineWidth = as.numeric(pareto_marker_outline_width),
        paretoAxisColor = as.character(pareto_axis_color),
        paretoAxisThickness = as.numeric(pareto_axis_thickness),
        paretoAxisStyle = as.character(pareto_axis_style),
        paretoTickColor = as.character(pareto_tick_color),
        paretoTickLength = as.numeric(pareto_tick_length),
        paretoTickThickness = as.numeric(pareto_tick_thickness),
        paretoTickDirection = as.character(pareto_tick_direction),
        paretoTickStep = as.numeric(pareto_tick_step),
        paretoTickLabelColor = as.character(pareto_tick_label_color),
        paretoTickLabelSize = as.numeric(pareto_tick_label_size),
        # --- Correlation matrix (corrplotbuilder) ---
        corrVars = if (is.null(corr_vars)) list() else as.list(as.character(corr_vars)),
        corrCells = if (is.null(corr_cells)) list() else corr_cells,
        corrRaw = if (is.null(corr_raw)) list() else corr_raw,
        corrMethod = as.character(corr_method),
        corrPAdjust = as.character(corr_p_adjust),
        corrShowValues = isTRUE(corr_show_values),
        corrDecimals = as.numeric(corr_decimals),
        corrSigLevel = as.numeric(corr_sig_level),
        corrSigTreat = as.character(corr_sig_treat),
        corrSigStars = isTRUE(corr_sig_stars),
        corrTriangle = as.character(corr_triangle),
        corrDiagonal = as.character(corr_diagonal),
        corrPosColor = as.character(corr_pos_color),
        corrNegColor = as.character(corr_neg_color),
        corrCellGap = as.numeric(corr_cell_gap),
        corrCellCorner = as.numeric(corr_cell_corner),
        corrCellOpacity = as.numeric(corr_cell_opacity),
        corrCellBorderColor = as.character(corr_cell_border_color),
        corrCellBorderWidth = as.numeric(corr_cell_border_width),
        corrCircleScale = as.numeric(corr_circle_scale),
        corrNumberGrid = isTRUE(corr_number_grid),
        corrVarOrder = if (is.null(corr_var_order)) list() else as.list(as.character(corr_var_order)),
        corrVarRelabels = if (is.null(corr_var_relabels)) list() else corr_var_relabels,
        corrVarStyles = if (is.null(corr_var_styles)) list() else corr_var_styles,
        corrLegendShow = isTRUE(corr_legend_show),
        corrLegendTitle = as.character(corr_legend_title),
        corrLegendScale = as.numeric(corr_legend_scale),
        corrLegendOrient = as.character(corr_legend_orient),
        corrLegendTicks = as.numeric(corr_legend_ticks),
        corrLegendColor = as.character(corr_legend_color),
        corrLegendDX = as.numeric(corr_legend_dx),
        corrLegendDY = as.numeric(corr_legend_dy),
        corrLegendBarWidth = as.numeric(corr_legend_bar_width),
        # --- Likert / survey (likertplotbuilder) ---
        likertItems = if (is.null(likert_items)) list() else as.list(as.character(likert_items)),
        likertLevels = if (is.null(likert_levels)) list() else as.list(as.character(likert_levels)),
        likertCells = if (is.null(likert_cells)) list() else likert_cells,
        likertMeans = if (is.null(likert_means)) list() else likert_means,
        # Continuous battery: no response scale; the means axis is built
        # client-side from the means/CIs (numeric ticks, no level names).
        likertContinuous = isTRUE(likert_continuous),
        likertCenterBoundary = as.numeric(likert_center_boundary),
        likertSort = as.character(likert_sort),
        likertShowValues = isTRUE(likert_show_values),
        likertValueContent = as.character(likert_value_content),
        likertValueDecimals = as.numeric(likert_value_decimals),
        likertShowTopBox = isTRUE(likert_show_top_box),
        likertTopBoxMode = as.character(likert_top_box_mode),
        likertRowGap = as.numeric(likert_row_gap),
        likertCiLevel = as.numeric(likert_ci_level),
        likertMeanErrorType = as.character(likert_mean_error_type),
        likertDotColor = as.character(likert_dot_color),
        likertDotSize = as.numeric(likert_dot_size),
        likertCiWidth = as.numeric(likert_ci_width),
        likertItemOrder = if (is.null(likert_item_order)) list() else as.list(as.character(likert_item_order)),
        likertItemRelabels = if (is.null(likert_item_relabels)) list() else likert_item_relabels,
        likertItemStyles = if (is.null(likert_item_styles)) list() else likert_item_styles,
        likertReverseItems = if (is.null(likert_reverse_items)) list() else as.list(as.character(likert_reverse_items)),
        likertLegendShow = isTRUE(likert_legend_show),
        likertLegendOrient = as.character(likert_legend_orient),
        likertLegendDX = as.numeric(likert_legend_dx),
        likertLegendDY = as.numeric(likert_legend_dy),
        likertLegendSwatchSize = as.numeric(likert_legend_swatch_size),
        likertLegendFontSize = as.numeric(likert_legend_font_size),
        likertLegendTextColor = as.character(likert_legend_text_color),
        likertXAxisColor = as.character(likert_xaxis_color),
        likertXAxisWidth = as.numeric(likert_xaxis_width),
        likertXAxisStyle = as.character(likert_xaxis_style),
        likertZeroLineColor = as.character(likert_zero_color),
        likertZeroLineWidth = as.numeric(likert_zero_width),
        likertZeroLineStyle = as.character(likert_zero_style),
        likertGridShow = isTRUE(likert_grid_show),
        likertGridColor = as.character(likert_grid_color),
        likertGridWidth = as.numeric(likert_grid_width),
        likertGridStyle = as.character(likert_grid_style),
        likertXMinOverride = isTRUE(likert_x_min_override),
        likertXMin = as.numeric(likert_x_min),
        likertXMaxOverride = isTRUE(likert_x_max_override),
        likertXMax = as.numeric(likert_x_max),
        likertXIntervalOverride = isTRUE(likert_x_interval_override),
        likertXInterval = as.numeric(likert_x_interval),
        likertDotShape = as.character(likert_dot_shape),
        likertDotOutlineColor = as.character(likert_dot_outline_color),
        likertDotOutlineWidth = as.numeric(likert_dot_outline_width),
        likertCiColor = as.character(likert_ci_color),
        likertCiStyle = as.character(likert_ci_style),
        likertShowMiniMeans = isTRUE(likert_show_mini_means),
        likertXTickRelabels = if (is.null(likert_x_tick_relabels)) list() else likert_x_tick_relabels
    )

    # chartSpec migration (speed pass Phase 2): a MIGRATED module ships
    # the raw chartSpec blob + the list of option names that stay real
    # jamovi options. The JS seeds its specState from data.chartSpec,
    # explodes the blob into data.* (so the renderer + undo see every
    # style value), and routes any committed key NOT in specRealKeys
    # into the blob. Gated on spec_real_keys (non-NULL only for migrated
    # modules) so every other module's payload is byte-identical -
    # appended AFTER the list literal because an inline `= NULL` list
    # element is NOT dropped (jsonlite serializes it as a null key).
    if (!is.null(spec_real_keys)) {
        payload$chartSpec <- as.character(chart_spec)
        payload$specRealKeys <- as.list(spec_real_keys)
        if (!is.null(spec_keys))
            payload$specKeys <- as.list(spec_keys)
    }
    # Static-snapshot fallback: split the JS-committed "<sig>|<svg>" and
    # SANITIZE before anything is embedded - the option can arrive from a
    # crafted .omv, so the body must look like an SVG and carry no script
    # (belt-and-suspenders: the embed context is <img src="data:...">,
    # where scripts never execute anyway). Only the sig ships in the
    # payload (conditional key - absent when no snapshot, so every
    # existing payload stays byte-identical); the JS compares it against
    # its own serialization to skip re-committing an unchanged snapshot.
    snap_parsed <- gb_parse_snapshot(chart_snapshot)
    snap_key <- if (is.null(snap_parsed)) "" else snap_parsed$key
    snap_svg <- if (is.null(snap_parsed)) "" else snap_parsed$svg
    if (nzchar(snap_key))
        payload$chartSnapshotKey <- snap_key
    # Native-panel preview keys: shipped ONLY when the module forwards
    # them (Compare Groups / Repeated Measures), so other modules'
    # payloads stay byte-stable and the JS fold gate (`typeof data[k]
    # !== "string"`) skips the keys for them. The client uses these to
    # diff an incoming options snapshot against the rendered state and
    # optimistically recompute the cells (graphbuilder2.js
    # _gb2StatFold); the eventual R echo then hashes identical.
    if (!is.null(summary_func))
        payload$summaryFunc <- as.character(summary_func)
    if (!is.null(error_bar_type))
        payload$errorBarType <- as.character(error_bar_type)
    # errorBarMethod (RM only): lets the Label-parts copy say truthfully
    # whether the bars carry the within-subject correction. Same
    # conditional-key convention as errorBarType above.
    if (!is.null(error_bar_method))
        payload$errorBarMethod <- as.character(error_bar_method)
    # Chi-square test entries (freqplotbuilder only): shipped whenever the
    # module forwards them (even while freqShowChisq is off) so toggling
    # the readout from the "+" menu / eye is a pure draw-time filter with
    # no R round-trip. NULL (every other module) keeps the key absent.
    if (!is.null(freq_tests))
        payload$freqTests <- freq_tests
    # Sigma stats panel (Jul 2026): conditional keys so the other
    # modules' payloads stay byte-stable.
    if (!is.null(dist_normality) && length(dist_normality) > 0)
        payload$distNormality <- dist_normality
    if (!is.null(likert_alpha))
        payload$likertAlpha <- likert_alpha
    # User guide (Jul 2026): the illustrated guide ships inside the
    # installed module (inst/docs/user-guide.html - the build scripts copy
    # it there from docs/, the canonical copy). The key is GATED on the
    # file actually being installed and carries the MODULE-RELATIVE path
    # only: the JS builds the launch URL client-side against jamovi's own
    # http server (the resultsview ModuleAssetHandler serves
    # {instance}/{analysis}/module/<path> from the module's R/pandion/
    # dir), because the electron host FILTERS window.openUrl to http(s) -
    # a file:// URL is dropped SILENTLY (Jul 2026 field bug; an absolute
    # file:// URL was this feature's first, broken shape). Resolved here
    # so every module's Basics help tab gets its "Open the user guide"
    # button with zero per-module changes; when the file is not installed
    # (e.g. the sourced-tree verify harness) the key is simply absent and
    # the JS renders no button.
    user_guide_path <- tryCatch(
        system.file("docs", "user-guide.html", package = "pandion"),
        error = function(e) ""
    )
    if (is.character(user_guide_path) && length(user_guide_path) == 1 &&
            nzchar(user_guide_path))
        payload$userGuidePath <- "docs/user-guide.html"

    .gb2_timings$t_payload_built <- as.numeric(Sys.time())
    # digits = I(10): 10 SIGNIFICANT digits (I() = signif, not round).
    # jsonlite's default round(x, 4) flattened any p below 5e-5 to a
    # literal 0 and quantized the raw values arrays that feed every
    # JS-side test. The client preview mirrors round their predictions
    # the same way for echo hash parity (_gb2SigR in graphbuilder2.js).
    payload_json <- jsonlite::toJSON(
        payload,
        dataframe = "rows",
        na = "null",
        null = "null",
        auto_unbox = TRUE,
        digits = I(10)
    )
    .gb2_timings$t_json_done <- as.numeric(Sys.time())

    # Cache the widget JS in a package-level env so we read it
    # from disk + paste-collapse the ~94 000 lines exactly ONCE
    # per R session, not on every render. Previously this
    # block fired on every option change — 50-100 ms wasted per
    # render across all three modules.
    js_code <- .gb2_widget_js()
    .gb2_timings$t_js_loaded <- as.numeric(Sys.time())

    # ---- Bundle-cache handshake: ship the ~1.9 MB widget JS once per
    # client, not on every render.
    #   inline : the client hasn't confirmed this exact bundle (or the
    #            GB2_NO_BUNDLE_CACHE escape hatch is set). Embed the
    #            full bundle as before, plus a deferred snippet that
    #            copies the bundle text into localStorage and writes
    #            the hash back through the hidden clientBundleHash
    #            option (debounced via window.__gb2_setOption so it
    #            coalesces with other early edits).
    #   cached : the persisted clientBundleHash matches the bundle on
    #            disk. Emit only the payload plus a loader that reuses
    #            window.GraphBuilder2 (same-document re-render), falls
    #            back to the localStorage copy (fresh document), and
    #            as a last resort clears clientBundleHash so the next
    #            run re-ships the bundle (self-heal; a "Loading chart
    #            engine" note shows meanwhile).
    # A localStorage flag graphbuilder2.bundle.evalBlocked permanently
    # falls back to inline mode on clients whose webview rejects
    # eval(), so a broken cache can never wedge rendering.
    if (nzchar(Sys.getenv("GB2_NO_BUNDLE_CACHE")))
        client_bundle_hash <- ""
    js_hash <- .gb2_widget_js_hash()
    # SCRIPT-SRC PROTOTYPE (GB2_SCRIPT_SRC=1, Jul 2026): the bundle is
    # NOT shipped in the results content at all - the module's .b.R sets
    # the Html result's `scripts` field to 'widget/graphbuilder2.min.js'
    # and jamovi's resultsview loads it via <script src="module/...">
    # (the module_asset route, paths relative to R/pandion/). The
    # resultsview gates content insertion on the script's load promise,
    # so the engine should already be defined when the inline payload
    # script runs; engine-absent is the lifecycle diagnostic this
    # prototype exists to surface. Jonathon-agreed direction (Jul 2026
    # thread); env-gated so shipped behavior is byte-identical.
    # script_src_ready: per-module opt-in - only modules whose .init()
    # actually sets widget$scripts may take this branch (the audit's catch:
    # under the env flag alone, the other six modules would emit NO engine).
    bundle_mode <- if (gb2_script_src_on() && isTRUE(script_src_ready)) "scriptsrc"
        else if (nzchar(js_hash) &&
                 identical(as.character(client_bundle_hash), js_hash))
        "cached" else "inline"
    # WHY inline - surfaced on the debug overlay's Bundle line so a
    # machine stuck in inline mode is diagnosable at one glance.
    bundle_reason <- if (bundle_mode == "scriptsrc") "module script asset (default)"
        else if (bundle_mode == "cached") ""
        else if (nzchar(Sys.getenv("GB2_NO_BUNDLE_CACHE"))) "GB2_NO_BUNDLE_CACHE env"
        else if (!nzchar(js_hash)) "no bundle hash (md5 failed)"
        else if (!nzchar(as.character(client_bundle_hash))) "no client hash yet"
        else "hash mismatch (module updated?)"

    if (bundle_mode == "inline") {
        # Chunk builders are shared with gb2_engine_boot_html() (the
        # empty-variable engine-boot placeholder) so the two paths can
        # never drift - see their definitions near .gb2_widget_js().
        engine_chunk <- .gb2_engine_chunk_inline(js_hash, js_code)
        store_chunk  <- .gb2_store_chunk(js_hash)
    } else if (bundle_mode == "scriptsrc") {
        # The bundle arrived (or should have) via the scripts field's
        # <script src>. NO hash gate on the engine check: the script tag
        # always serves the currently installed file, so presence of
        # render() is the whole test (__hash is stamped for coherence
        # with code paths that read it). Engine absent = the content
        # script ran before the bundle loaded (the lifecycle question):
        # record it on window.__gb2_scriptSrcLate, paint a distinctive
        # note, and poll-retry so a late-arriving engine still draws -
        # the retry delay lands in window.__gb2_scriptSrcLateMs so the
        # prototype run MEASURES the gap instead of hiding it.
        engine_chunk <- paste0(
            'var __gb2_engineOk = false;\n',
            'try {\n',
            '  __gb2_engineOk = !!(window.GraphBuilder2 && window.GraphBuilder2.render);\n',
            '  if (__gb2_engineOk) { try { window.GraphBuilder2.__hash = "', js_hash, '"; } catch (_eSt) {} }\n',
            '  else {\n',
            '    try { window.__gb2_scriptSrcLate = (window.__gb2_scriptSrcLate || 0) + 1; } catch (_eL) {}\n',
            '    var __gb2_ssHost = document.getElementById(__gb2_id);\n',
            "    if (__gb2_ssHost) __gb2_ssHost.innerHTML = '<div data-role=\"gb2-scriptsrc-wait\" style=\"padding:24px 12px;color:#666;font:13px var(--gb2-ui-font);text-align:center;\">Loading the chart engine…</div>';\n",
            '    (function __gb2_ssPoll(n) {\n',
            '      if (window.GraphBuilder2 && window.GraphBuilder2.render) {\n',
            '        try { window.GraphBuilder2.__hash = "', js_hash, '"; } catch (_eS2) {}\n',
            '        try { window.__gb2_scriptSrcLateMs = n * 150; } catch (_eL2) {}\n',
            '        try { window.__gb2_authoritativeRender = true; } catch (_eA) {}\n',
            '        try { window.GraphBuilder2.render(__gb2_id, __gb2_payload); } catch (_eR) {}\n',
            '      } else if (n < 60) setTimeout(function () { __gb2_ssPoll(n + 1); }, 150);\n',
            '    })(0);\n',
            '  }\n',
            '} catch (_eC) {}\n'
        )
        store_chunk <- ''
    } else {
        engine_chunk <- paste0(
            'var __gb2_engineOk = false;\n',
            'try {\n',
            '  __gb2_engineOk = !!(typeof window !== "undefined" && window.GraphBuilder2\n',
            '      && window.GraphBuilder2.render && window.GraphBuilder2.__hash === "', js_hash, '");\n',
            '  if (!__gb2_engineOk) {\n',
            '    var __gb2_blocked = false;\n',
            '    try { __gb2_blocked = !!(window.localStorage && window.localStorage.getItem("graphbuilder2.bundle.evalBlocked")); } catch (_eB) {}\n',
            '    if (!__gb2_blocked) {\n',
            '      try {\n',
            '        var __gb2_src = window.localStorage ? window.localStorage.getItem("graphbuilder2.bundle.', js_hash, '") : null;\n',
            '        if (__gb2_src && __gb2_src.length > 100000) {\n',
            '          __gb2_body_ran = true;\n',
            '          (0, eval)(__gb2_src);\n',
            '          if (window.GraphBuilder2) window.GraphBuilder2.__hash = "', js_hash, '";\n',
            '        }\n',
            '      } catch (_eE) {\n',
            '        try { window.localStorage.setItem("graphbuilder2.bundle.evalBlocked", "1"); } catch (_eE2) {}\n',
            '      }\n',
            '      __gb2_engineOk = !!(window.GraphBuilder2 && window.GraphBuilder2.render && window.GraphBuilder2.__hash === "', js_hash, '");\n',
            '    }\n',
            '  }\n',
            '  if (!window.GraphBuilder2 || !window.GraphBuilder2.render) {\n',
            # With a snapshot present the picture IS the feedback: show it
            # alone and hide the host outright - the "Loading chart
            # engine" note on top of a visible chart read as noise/alarm
            # (Torry's 2nd field test), and on a live-but-warming machine
            # the engine's re-ship replaces this whole DOM anyway. The
            # note survives ONLY for snapshot-less pages (old files),
            # where it is the sole feedback until the honest message.
            '    try {\n',
            '      var __gb2_snap0 = document.getElementById(__gb2_id + "-snap");\n',
            '      var __gb2_hostHeal = document.getElementById(__gb2_id);\n',
            '      if (__gb2_snap0) {\n',
            '        __gb2_snap0.style.display = "block";\n',
            '        if (__gb2_hostHeal) __gb2_hostHeal.style.display = "none";\n',
            '      } else if (__gb2_hostHeal) {\n',
            "        __gb2_hostHeal.innerHTML = '<div style=\"padding:24px 12px;color:#666;font:13px var(--gb2-ui-font);text-align:center;\">Loading chart engine…<span style=\"display:block;margin-top:6px;font-size:11.5px;color:#999;\">This resolves by itself in a few seconds. If it does not, please screenshot this and report it with your jamovi version.</span></div>';\n",
            '      }\n',
            '    } catch (_eH) {}\n',
            # Staged confirmation (the caption claims "not installed
            # here", so it must never flash on a live-but-warming
            # machine): ~3 s when window.setOption never appeared (no
            # live session exists without the bridge), else the 8 s
            # worst case. Probe overrides: __gb2_mmFast / __gb2_mmDelay.
            '    var __gb2_mmFin = function () { try {\n',
            '      var __mmH = document.getElementById(__gb2_id);\n',
            '      if (!__mmH || !__mmH.isConnected) return;\n',
            '      if (window.GraphBuilder2 && window.GraphBuilder2.render) return;\n',
            '      var __mmS = document.getElementById(__gb2_id + "-snap");\n',
            '      if (__mmS) {\n',
            '        __mmS.style.display = "block";\n',
            '        var __mmC = __mmS.querySelector("[data-role=gb2-static-fallback-caption]");\n',
            '        if (__mmC) __mmC.style.display = "block";\n',
            '        try {\n',
            '          var __mmA = __mmS.querySelector("[data-role=gb2-snap-save]");\n',
            '          var __mmI = __mmS.querySelector("img");\n',
            '          if (__mmA && __mmI && __mmA.getAttribute("href") === "#") __mmA.setAttribute("href", __mmI.getAttribute("src"));\n',
            # Click feedback: the webview blocks downloads, so the Save
            # link is a silent no-op here - reveal the explanatory note
            # instead of dead silence. Listener-only (never serialized),
            # so exported HTML keeps the plain working download.
            '          if (__mmA && !__mmA.__gb2NoteWired) { __mmA.__gb2NoteWired = true; __mmA.addEventListener("click", function () { try { var __mmN = __mmS.querySelector("[data-role=gb2-snap-save-note]"); if (__mmN) __mmN.style.display = "block"; } catch (_eNt) {} }); }\n',
            '        } catch (_eSv) {}\n',
            '        __mmH.style.display = "none";\n',
            '      } else {\n',
            "        __mmH.innerHTML = '<div data-role=\"gb2-module-missing\" style=\"margin:10px;padding:12px 14px;max-width:620px;font-size:12.5px;line-height:1.55;color:#555;background:#f7f7f7;border:1px solid #ddd;border-radius:6px;\"><b>This chart needs the Pandion Plots module.</b><br>It does not appear to be installed here, so the chart cannot be drawn. The data and chart settings are saved in this file: install Pandion Plots (github.com/torryscott/pandion, Releases) and reopen the file to see the chart. If Pandion Plots is installed, re-running the analysis will restore the chart.</div>';\n",
            '      }\n',
            '    } catch (_eMM) {} };\n',
            '    try {\n',
            '      setTimeout(function () { try { if (typeof window.setOption !== "function") __gb2_mmFin(); } catch (_eF1) {} },\n',
            '                 (typeof window.__gb2_mmFast === "number" ? window.__gb2_mmFast : 3000));\n',
            '      setTimeout(__gb2_mmFin, (typeof window.__gb2_mmDelay === "number" ? window.__gb2_mmDelay : 8000));\n',
            '    } catch (_eMMArm) {}\n',
            '  }\n',
            '  if (!__gb2_engineOk) {\n',
            '    (function __gb2_poke(n) {\n',
            '      if (typeof window.setOption === "function") {\n',
            '        try { window.setOption("clientBundleHash", ""); } catch (_eP) {}\n',
            '      } else if (n < 40) {\n',
            '        setTimeout(function () { __gb2_poke(n + 1); }, 250);\n',
            '      }\n',
            '    })(0);\n',
            '  }\n',
            '} catch (_eC) {}\n'
        )
        store_chunk <- ''
    }

    widget_id <- paste0(
        "gb2-",
        as.integer(Sys.time()),
        "-",
        sample.int(.Machine$integer.max, 1L)
    )
    widget_id_json <- jsonlite::toJSON(widget_id, auto_unbox = TRUE)

    # Pre-compute R-side phase timings so we can embed them as
    # a JS object the debug overlay reads.
    payload_ms <- round((.gb2_timings$t_payload_built - .gb2_timings$t_start) * 1000, 1)
    json_ms    <- round((.gb2_timings$t_json_done    - .gb2_timings$t_payload_built) * 1000, 1)
    js_load_ms <- round((.gb2_timings$t_js_loaded    - .gb2_timings$t_json_done) * 1000, 1)
    cache_state <- if (is.null(.gb2_widget_js_cache$first_read_done)) {
        # First call this session — flag it so subsequent
        # renders can show "cached" in the overlay.
        .gb2_widget_js_cache$first_read_done <- TRUE
        "first"
    } else {
        "cached"
    }

    # .run()-entry prelude: data materialization + aggregation in the
    # module's .b.R before graphbuilder2_html was reached. -1 = the
    # caller didn't pass run_t0 (overlay omits the lines).
    prelude_ms <- if (is.null(run_t0)) -1 else
        round((.gb2_timings$t_start - as.numeric(run_t0)) * 1000, 1)

    r_timing_json <- jsonlite::toJSON(list(
        payload_ms = payload_ms,
        json_ms = json_ms,
        js_load_ms = js_load_ms,
        prelude_ms = prelude_ms,
        js_cache = cache_state,
        js_source = if (!is.null(.gb2_widget_js_cache$source))
            .gb2_widget_js_cache$source else "unknown",
        payload_bytes = nchar(payload_json),
        js_bytes = if (bundle_mode == "inline") nchar(js_code) else 0L,
        bundle_mode = bundle_mode,
        bundle_reason = bundle_reason,
        bundle_hash = js_hash,
        # Wall-clock anchor for the debug overlay's transport-gap line:
        # client Date.now() minus this ~= R marshal + jamovi engine
        # serialize + IPC + DOM insertion (same-machine clocks).
        t_start_epoch = .gb2_timings$t_start,
        # Same anchor at .run() entry (0 = not passed): its gap line is
        # the full "option landed in R -> chart painted" wall time.
        t_run_entry_epoch = if (is.null(run_t0)) 0 else as.numeric(run_t0)
    ), auto_unbox = TRUE)

    # JS-side load gate: when the iframe's window already has
    # GraphBuilder2 defined (i.e. this isn't the first render
    # in this iframe's lifetime), skip the body — we only need
    # to invoke render(). Saves another ~50-100 ms of redundant
    # IIFE body execution per subsequent render. First render
    # behaves the same as before.
    ui_font <- "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
    mod_ver <- .gb2_module_version()
    html_out <- paste0(
        '<div id="', widget_id, '" class="graphbuilder2-host" ',
        'data-gb2-version="', mod_ver, '" ',
        'style="width:', width, ';--gb2-ui-font:', ui_font, ';font-family:var(--gb2-ui-font);position:relative;">',
        # Layer A: static failure fallback. render() wipes it on success
        # (host.innerHTML = ""); only a render that never happened lets
        # the 6 s CSS reveal fire. See .gb2_diag_pending_html.
        .gb2_diag_pending_html(mod_ver),
        '</div>\n',
        # Built-without-minify note ("" in a healthy build). AFTER the
        # host div so render()'s host wipe never removes it.
        .gb2_min_missing_note_html(),
        # Static-snapshot fallback ("" when no snapshot committed yet).
        # Hidden; the cached-branch module-missing timer and the diag
        # primer reveal it when no engine ever answers.
        # GB2-SNAP markers: the delivery wrapper splits content on these to
        # detect snapshot-only deliveries (the static-copy echo differs from
        # the applied content ONLY inside this block) and patches the block
        # in place instead of wiping + rebuilding the whole chart - the
        # second visible "roll" of every edit (Torry, Jul 2026).
        '<!--GB2-SNAP-START-->',
        .gb2_snapshot_fallback_html(widget_id, snap_svg),
        '<!--GB2-SNAP-END-->',
        # Layer A.5: standalone ES5 primer - runs even when the main
        # script below dies on a parse error (separate script tags
        # parse independently) and upgrades the Layer A box.
        .gb2_diag_primer_script(widget_id_json),
        '<script>(function(){\n',
        .gb2_self_capture_chunk(),
        'var __gb2_payload = ', payload_json, ';\n',
        'var __gb2_id = ', widget_id_json, ';\n',
        'var __gb2_r_timing = ', r_timing_json, ';\n',
        'var __gb2_t0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();\n',
        'var __gb2_body_ran = false;\n',
        # One increment per loader execution = one results delivery
        # (incl. jamovi re-posts of the same run) - makes multi-delivery
        # churn visible on the overlay.
        'try { window.__gb2_deliveryCount = (window.__gb2_deliveryCount || 0) + 1; } catch (_eDc) {}\n',
        engine_chunk,
        'var __gb2_t1 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();\n',
        # Mark this render AUTHORITATIVE (it carries R\'s recomputed payload).
        # The render entry consumes the flag; only authoritative renders may
        # self-clear a matching __gb2_recentCommits pin ("R has caught up").
        # Bundle-internal local re-renders (panel preview, _gb2RerenderSoon,
        # type-switch folds) leave the flag unset, so they can never
        # prematurely release a pin that still guards in-flight echoes.
        'try { window.__gb2_authoritativeRender = true; } catch (e) {}\n',
        # Layer B failure diagnostic: a thrown render() exception (or an
        # inline bundle that executed without defining the engine) paints
        # an immediate red box instead of a silent blank. Cached-mode
        # engine-absent is NOT an error here - the "Loading chart engine"
        # note + clientBundleHash self-heal above own that path. The
        # exception is re-thrown ASYNCHRONOUSLY so devtools / pageerror
        # probes still see the original error.
        # Live engine takes over: hide the visible-by-default snapshot
        # BEFORE rendering so a working machine never shows both. Every
        # script-less context (jamovi's export pipeline runs no scripts -
        # Torry's PDF finding) keeps the picture by construction.
        'try { if (typeof window !== "undefined" && window.GraphBuilder2 && window.GraphBuilder2.render) {\n',
        '  var __gb2_sfLive = document.getElementById(__gb2_id + "-snap");\n',
        '  if (__gb2_sfLive) __gb2_sfLive.style.display = "none";\n',
        '} } catch (_eSfL) {}\n',
        # Native snapshot-Image coordination (prototype, Distribution):
        # jamovi renders the snapshotImage result as an ordinary served
        # <img> in this analysis's document. Matcher: src contains the
        # result name, OR the img follows a heading titled exactly
        # "Chart (static copy)" (document-order walk over headings+imgs;
        # the matched heading is hidden/shown along with its img).
        # FAIL-OPEN: no match means do nothing - a duplicated picture
        # beats hiding someone else's plot. Live engine -> hide the
        # native copy on screen (jamovi's export reads the MODEL, so
        # exports keep it); no engine -> the native copy IS the picture,
        # so hide our data-URI img and keep just the caption. Re-runs at
        # 400/1500 ms because the Image element can mount after us.
        # Matcher v2 (field-corrected, Torry's duplicate screenshot):
        # jamovi Image results render as a <jmv-results-image> custom
        # element - an hN.jmv-results-image-title heading + a DIV whose
        # css background-image is the served picture. There is NO <img>
        # tag (verified in the resultsview source), which is why the v1
        # img scan matched nothing. Match the custom element by its
        # title text and hide/show it WHOLE (heading included).
        'var __gb2_snapNativeSync = function () { try {\n',
        '  var els = document.querySelectorAll("jmv-results-image");\n',
        '  var nat = [];\n',
        '  for (var i = 0; i < els.length; i++) {\n',
        '    var t = els[i].querySelector(".jmv-results-image-title");\n',
        '    var txt = t ? (t.textContent || "").replace(/^\\s+|\\s+$/g, "") : "";\n',
        '    if (txt === "Chart (static copy)") nat.push(els[i]);\n',
        '  }\n',
        '  var live = !!(typeof window !== "undefined" && window.GraphBuilder2 && window.GraphBuilder2.render);\n',
        # Diagnostics mode (the timing-overlay flag) leaves the native
        # Image result VISIBLE next to the live chart - the decisive
        # copy-control experiment: right-click the static copy to get
        # jamovi's real Image-level menu and its supported copy path.
        '  var diag = false;\n',
        '  try { diag = !!(window.localStorage && window.localStorage.getItem("gb2_debug_timing") === "1"); } catch (_eDgF) {}\n',
        '  var hide = live && !diag;\n',
        # Persistent CSS is installed on the FIRST widget render, before the
        # native Image exists. When the first snapshot later makes jamovi add
        # Image + BR + annotation, all three are therefore out of layout on
        # their first style calculation (no one-frame 450px flash and no
        # surviving whitespace siblings). The data-name is jamovi's UTF-8
        # base64 encoding of "snapshotImage".
        '  var hs = document.getElementById("gb2-native-snapshot-hide-style");\n',
        '  if (!hs) {\n',
        '    hs = document.createElement("style");\n',
        '    hs.id = "gb2-native-snapshot-hide-style";\n',
        '    hs.textContent = "jmv-results-image[data-name=\\"c25hcHNob3RJbWFnZQ==\\"]," +\n',
        '      "jmv-results-image[data-name=\\"c25hcHNob3RJbWFnZQ==\\"] + br," +\n',
        '      "jmv-results-image[data-name=\\"c25hcHNob3RJbWFnZQ==\\"] + br + jmv-annotation" +\n',
        '      "{display:none !important;}";\n',
        '    (document.head || document.documentElement).appendChild(hs);\n',
        '  }\n',
        '  hs.disabled = !hide;\n',
        '  var setHidden = function (el, yes, companion) {\n',
        '    if (!el || !el.style) return;\n',
        '    if (yes) {\n',
        '      if (!el.getAttribute("data-gb2-snapshot-hidden")) {\n',
        '        try { el.__gb2SnapshotDisplay = el.style.display || ""; } catch (_eSd) {}\n',
        '        el.setAttribute("data-gb2-snapshot-hidden", companion ? "companion" : "image");\n',
        '      }\n',
        '      el.style.display = "none";\n',
        '    } else if (el.getAttribute("data-gb2-snapshot-hidden")) {\n',
        '      el.style.display = (typeof el.__gb2SnapshotDisplay === "string") ? el.__gb2SnapshotDisplay : "";\n',
        '      el.removeAttribute("data-gb2-snapshot-hidden");\n',
        '      try { delete el.__gb2SnapshotDisplay; } catch (_eDd) {}\n',
        '    } else if (!companion) {\n',
        '      el.style.display = "";\n',
        '    }\n',
        '  };\n',
        '  for (var j = 0; j < nat.length; j++) {\n',
        '    setHidden(nat[j], hide, false);\n',
        '    var br = nat[j].nextElementSibling;\n',
        '    if (br && String(br.tagName).toUpperCase() === "BR") {\n',
        '      setHidden(br, hide, true);\n',
        '      var ann = br.nextElementSibling;\n',
        '      if (ann && String(ann.tagName).toUpperCase() === "JMV-ANNOTATION") setHidden(ann, hide, true);\n',
        '    }\n',
        '  }\n',
        '  if (!nat.length) return;\n',
        '  if (!live) {\n',
        '    var __nsSn = document.getElementById(__gb2_id + "-snap");\n',
        '    if (__nsSn) { var __nsSi = __nsSn.querySelector("img"); if (__nsSi) __nsSi.style.display = "none"; }\n',
        '  }\n',
        '} catch (_eNs) {} };\n',
        # Exposed so the Diagnostics checkbox can flip the static copy
        # in and out immediately (no wait for the next delivery).
        'try { window.__gb2_snapNativeSync = __gb2_snapNativeSync; } catch (_eNsX) {}\n',
        # Hide the native static copy the INSTANT it (re)mounts: the timer
        # sweep (0/400/1500ms) left a window where the ~400px Image result
        # rendered visible then vanished on every delivery - the shrink
        # clamps the results scroller and yanks a scrolled-away user back
        # to the chart (Torry's Frequencies yank, root cause, Jul 2026).
        # childList-only observation: the sync writes style.display, which
        # an attribute observer would loop on. Registered once per window.
        # Scroll-gate, FINAL form (Jul 2026, round 4 - zero DOM footprint):
        # resultsview decides scrollIntoView with ONE check - line ~207,
        # document.querySelectorAll('.jmv-annotation.focused').length > 0.
        # Every element-based gate FAILED: in-content divs get CULLED by
        # jamovi's annotation manager, and a body-level div made the
        # annotation SYSTEM believe a note was focused (expanded strips,
        # a phantom focused editor below the chart - Torry's screenshot).
        # So patch the QUERY, not the DOM: shadow document.querySelectorAll
        # in this iframe's realm; for that EXACT selector, return a length-1
        # stand-in when the real result is empty (real focused annotations
        # pass through untouched; every other selector delegates). The
        # caller only reads .length. No element exists, so the annotation
        # UI stays fully native.
        'try { if (!window.__gb2_qsaPatched) { window.__gb2_qsaPatched = true;\n',
        '  var __gb2_sgOld = document.getElementById("gb2-scroll-gate");\n',
        '  if (__gb2_sgOld && __gb2_sgOld.parentNode) __gb2_sgOld.parentNode.removeChild(__gb2_sgOld);\n',
        '  var __gb2_origQSA = document.querySelectorAll.bind(document);\n',
        '  document.querySelectorAll = function (sel) {\n',
        '    if (sel === ".jmv-annotation.focused") {\n',
        '      var __gb2_qr = __gb2_origQSA(sel);\n',
        '      if (__gb2_qr.length === 0) return [{ gb2ScrollGate: true }];\n',
        '      return __gb2_qr;\n',
        '    }\n',
        '    return __gb2_origQSA(sel);\n',
        '  };\n',
        '} } catch (_eQp) {}\n',
        # Focus-scroll kill (Jul 2026, the yank's PROVEN driver - the blur
        # discriminator: nothing focused in the frame at delivery = drift 0,
        # chart focused = 1058px instant parent scroll): ANY focus() call
        # inside this frame that lands on an off-viewport element makes the
        # PARENT window scroll the analysis into view - including jamovi's
        # own post-swap refocus of the results group, which runs from THEIR
        # pipeline where no wrapper of ours can blur first. So shadow the
        # focus methods for the whole frame and merge preventScroll:true
        # into every call (callers passing preventScroll:false explicitly
        # are respected). Trade-off accepted: keyboard Tab focus no longer
        # auto-scrolls the parent either.
        'try { if (!window.__gb2_focusPatched) { window.__gb2_focusPatched = true;\n',
        '  var __gb2_fixFocus = function (proto) {\n',
        '    if (!proto || !proto.focus) return;\n',
        '    var __gb2_of = proto.focus;\n',
        '    proto.focus = function (opts) {\n',
        '      var o = opts || {};\n',
        '      if (o.preventScroll !== false) o = Object.assign({}, o, { preventScroll: true });\n',
        '      return __gb2_of.call(this, o);\n',
        '    };\n',
        '  };\n',
        '  __gb2_fixFocus(window.HTMLElement && window.HTMLElement.prototype);\n',
        '  __gb2_fixFocus(window.SVGElement && window.SVGElement.prototype);\n',
        '} } catch (_eFp) {}\n',
        'try { if (!window.__gb2_snapObserver && typeof MutationObserver !== "undefined") {\n',
        '  window.__gb2_snapObserver = new MutationObserver(function () { try { window.__gb2_snapNativeSync && window.__gb2_snapNativeSync(); } catch (_eO) {} });\n',
        '  window.__gb2_snapObserver.observe(document.body, { childList: true, subtree: true });\n',
        '} } catch (_eObs) {}\n',
        'try { __gb2_snapNativeSync(); setTimeout(__gb2_snapNativeSync, 400); setTimeout(__gb2_snapNativeSync, 1500); } catch (_eNsA) {}\n',
        'var __gb2_renderErr = null, __gb2_renderExc = null;\n',
        'try {\n',
        '  if (typeof window !== "undefined" && window.GraphBuilder2 && window.GraphBuilder2.render) {\n',
        '    window.GraphBuilder2.render(__gb2_id, __gb2_payload);\n',
        '  } else if (typeof GraphBuilder2 !== "undefined") {\n',
        '    GraphBuilder2.render(__gb2_id, __gb2_payload);\n',
        '  } else if (__gb2_r_timing.bundle_mode === "inline") {\n',
        '    __gb2_renderErr = "the chart engine did not define itself after the bundle script ran (bundle body executed: " + __gb2_body_ran + ")";\n',
        '  }\n',
        '} catch (_eRun) {\n',
        '  __gb2_renderExc = _eRun;\n',
        '  try {\n',
        '    __gb2_renderErr = (_eRun && _eRun.name ? _eRun.name + ": " : "") + (_eRun && _eRun.message ? _eRun.message : String(_eRun));\n',
        '    if (_eRun && _eRun.stack) __gb2_renderErr += "\\n" + String(_eRun.stack).split("\\n").slice(0, 3).join("\\n");\n',
        '  } catch (_eM) { __gb2_renderErr = "unknown render exception"; }\n',
        '}\n',
        'if (__gb2_renderErr) { try {\n',
        # A failed render re-reveals the snapshot (it was hidden above on
        # the engine-present path): the user gets the picture AND the
        # error box instead of the box alone.
        '  try { var __gb2_sfErr = document.getElementById(__gb2_id + "-snap"); if (__gb2_sfErr) __gb2_sfErr.style.display = "block"; } catch (_eSfE) {}\n',
        '  var __gb2_eh = document.getElementById(__gb2_id);\n',
        '  if (__gb2_eh) {\n',
        # Static skeleton via innerHTML; every dynamic string lands via
        # textContent (exception text can quote data-derived names).
        '    __gb2_eh.innerHTML = "<div data-role=\\"gb2-diag-error\\" style=\\"margin:10px;padding:12px 14px;max-width:660px;font-size:12.5px;line-height:1.55;color:#7a1f1f;background:#fdeeee;border:1px solid #e3b9b9;border-radius:6px;\\"><b>Pandion Plots: the chart engine hit an error.</b><br>Please screenshot this box and report it along with your jamovi version (hamburger menu, then About).<span data-role=\\"gb2-diag-err-msg\\" style=\\"display:block;margin-top:6px;white-space:pre-wrap;font-family:monospace;font-size:11.5px;\\"></span><span data-role=\\"gb2-diag-err-meta\\" style=\\"display:block;margin-top:6px;color:#9c5a5a;\\"></span></div>";\n',
        '    var __gb2_em = __gb2_eh.querySelector("[data-role=gb2-diag-err-msg]");\n',
        '    if (__gb2_em) __gb2_em.textContent = __gb2_renderErr;\n',
        '    var __gb2_meta = "module v', mod_ver, ' | bundle: " + __gb2_r_timing.bundle_mode + (__gb2_r_timing.bundle_reason ? " (" + __gb2_r_timing.bundle_reason + ")" : "") + " | engine: " + ((typeof window !== "undefined" && window.GraphBuilder2) ? "loaded" : "absent");\n',
        '    try { if (window.__gb2_bundleStoreDiag) __gb2_meta += " | store: " + window.__gb2_bundleStoreDiag; } catch (_eSd) {}\n',
        '    try { if (window.localStorage && window.localStorage.getItem("graphbuilder2.bundle.evalBlocked")) __gb2_meta += " | evalBlocked"; } catch (_eEb) {}\n',
        '    try { __gb2_meta += " | " + navigator.userAgent; } catch (_eUa) {}\n',
        '    var __gb2_emeta = __gb2_eh.querySelector("[data-role=gb2-diag-err-meta]");\n',
        '    if (__gb2_emeta) __gb2_emeta.textContent = __gb2_meta;\n',
        '  }\n',
        '} catch (_eDg) {} }\n',
        'if (__gb2_renderExc) { try { setTimeout(function () { throw __gb2_renderExc; }, 0); } catch (_eRt) {} }\n',
        'var __gb2_t2 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();\n',
        # Build the on-screen debug overlay. Lives inside the
        # host div (position:absolute / top:0 / right:0) so it
        # never escapes the result panel. Has a Copy button
        # that puts the formatted timings on the clipboard.
        # Gated on localStorage["gb2_debug_timing"] — toggled
        # from the chart Settings inspector. Off by default.
        'try {\n',
        # Exposed on window so the Chart settings Diagnostics toggle can
        # build the overlay IMMEDIATELY from this render's timings
        # (redefined with fresh closure values on every delivery; the
        # localStorage gate below is the cold-load path).
        '  window.__gb2_buildDbgOverlay = function () {\n',
        '  var host = document.getElementById(__gb2_id);\n',
        '  if (host) {\n',
        '    var oldDbg = host.querySelector("[data-role=gb2-debug]");\n',
        '    if (oldDbg && oldDbg.parentNode) oldDbg.parentNode.removeChild(oldDbg);\n',
        '    var lines = [];\n',
        '    if (__gb2_r_timing.prelude_ms >= 0) lines.push("R prelude (b.R): " + __gb2_r_timing.prelude_ms + " ms (data prep + aggregation)");\n',
        '    lines.push("R payload build: " + __gb2_r_timing.payload_ms + " ms");\n',
        '    lines.push("R JSON toJSON:   " + __gb2_r_timing.json_ms + " ms");\n',
        '    lines.push("R js file load:  " + __gb2_r_timing.js_load_ms + " ms (" + __gb2_r_timing.js_cache + ")");\n',
        '    lines.push("Payload size:    " + Math.round(__gb2_r_timing.payload_bytes / 1024) + " KB");\n',
        '    lines.push("Widget JS:       " + Math.round(__gb2_r_timing.js_bytes / 1024) + " KB (" + __gb2_r_timing.js_source + ")");\n',
        '    lines.push("JS body exec:    " + Math.round((__gb2_t1 - __gb2_t0) * 10) / 10 + " ms (ran=" + __gb2_body_ran + ")");\n',
        '    lines.push("JS render():     " + Math.round((__gb2_t2 - __gb2_t1) * 10) / 10 + " ms");\n',
        '    lines.push("JS total:        " + Math.round((__gb2_t2 - __gb2_t0) * 10) / 10 + " ms");\n',
        '    lines.push("Bundle:          " + __gb2_r_timing.bundle_mode\n',
        '        + (__gb2_r_timing.bundle_reason ? " - " + __gb2_r_timing.bundle_reason : "")\n',
        '        + (__gb2_body_ran ? " (engine ran)" : " (engine reused)"));\n',
        '    try { lines.push("R start->now:    " + (Math.round((Date.now() / 1000 - __gb2_r_timing.t_start_epoch) * 1000) / 1000) + " s (marshal+transport)"); } catch (_eGap) {}\n',
        # Client-side cache state: diagnoses a handshake that never
        # settles (bundle not stored, or the permanent evalBlocked
        # inline fallback) without needing devtools on the machine.
        '    try {\n',
        '      if (window.localStorage && __gb2_r_timing.bundle_hash) {\n',
        '        var _dbgStored = window.localStorage.getItem("graphbuilder2.bundle." + __gb2_r_timing.bundle_hash);\n',
        '        var _dbgEB = window.localStorage.getItem("graphbuilder2.bundle.evalBlocked");\n',
        '        lines.push("Client cache:    " + (_dbgStored ? "bundle stored (" + Math.round(_dbgStored.length / 1024) + " KB)" : "bundle NOT stored")\n',
        '            + (_dbgEB ? " / evalBlocked SET (eval banned - permanent inline)" : ""));\n',
        '        if (window.__gb2_bundleStoreDiag) lines.push("Last store:      " + window.__gb2_bundleStoreDiag);\n',
        '        try {\n',
        '          var _dbgTot = 0;\n',
        '          for (var _dbgI = 0; _dbgI < window.localStorage.length; _dbgI++) {\n',
        '            var _dbgK = window.localStorage.key(_dbgI);\n',
        '            _dbgTot += (_dbgK ? _dbgK.length : 0) + ((window.localStorage.getItem(_dbgK) || "").length);\n',
        '          }\n',
        '          lines.push("LS usage:        " + Math.round(_dbgTot / 1024) + " KB across " + window.localStorage.length + " keys");\n',
        '        } catch (_eTot) {}\n',
        '      }\n',
        '    } catch (_eLs) {}\n',
        # Copy diagnostics (Jul 2026, the no-toast field bug): whether a
        # getcontent request ever REACHED this document, which address/
        # level it carried, and what the watchdog did about it - the
        # one-screenshot answer to "which side is the copy dying on".
        # UNCONDITIONAL on purpose: these lines used to sit inside the
        # bundle_hash client-cache block, so any md5-unknown delivery
        # silently dropped the one diagnostic the overlay exists for.
        '    try { if (window.__gb2_copyDiag) lines.push("Copy diag:       " + window.__gb2_copyDiag); } catch (_eCd) {}\n',
        '    try { if (window.__gb2_copyLog && window.__gb2_copyLog.length) lines.push("Copy requests:   " + window.__gb2_copyLog.slice(-3).join(" | ")); } catch (_eCl) {}\n',
        '    try { if (!window.__gb2_copyLog || !window.__gb2_copyLog.length) lines.push("Copy requests:   none reached this document"); } catch (_eCn) {}\n',
        # Per-stage trail of every observed copy (written live by the
        # watchdog's __gb2_cwStage, which also rebuilds this overlay on
        # every stage - the overlay is no longer a stale snapshot).
        '    try { if (window.__gb2_copyStages && window.__gb2_copyStages.length) { lines.push("Copy stages:"); var _cst = window.__gb2_copyStages.slice(-10); for (var _csi = 0; _csi < _cst.length; _csi++) lines.push("  " + _cst[_csi]); } } catch (_eCst) {}\n',
        '    try { if (window.__gb2_lastCopyPath) lines.push("Cmd+C path:      " + window.__gb2_lastCopyPath); } catch (_eKp) {}\n',
        '    try { if (window.localStorage && window.localStorage.getItem("gb2_debug_timing") === "1" && document.querySelector("jmv-results-image")) lines.push("Static copy:     left visible (diagnostics mode - right-click IT to test the native Image menu)"); } catch (_eScv) {}\n',
        '    try { if (__gb2_r_timing.t_run_entry_epoch > 0) lines.push("run entry->now:  " + (Math.round((Date.now() / 1000 - __gb2_r_timing.t_run_entry_epoch) * 1000) / 1000) + " s (full R + transport)"); } catch (_eGap2) {}\n',
        # The decisive perceived-latency line: jamovi posts the panel
        # options to this window the INSTANT the left panel changes, so
        # stamp->now spans "user action -> painted chart". Everything
        # before run entry is jamovi dispatch we cannot reach from
        # module code. Staleness-gated so on-chart edits (no panel
        # message) do not show a bogus old delta.
        '    try {\n',
        '      if (window.__gb2_panelOptionsAt) {\n',
        '        var _pd = Date.now() - window.__gb2_panelOptionsAt;\n',
        '        if (_pd >= 0 && _pd < 30000) lines.push("panel chg->paint:" + (Math.round(_pd) / 1000) + " s (USER ACTION to chart)");\n',
        '      }\n',
        '    } catch (_ePm) {}\n',
        # Pure jamovi-dispatch share: panel change (client stamp) to R
        # run entry (R stamp, same machine clock). Negative/absurd
        # values mean the stamps describe different actions (e.g. the
        # overlay was rebuilt by the toggle long after the paint).
        '    try {\n',
        '      if (window.__gb2_panelOptionsAt && __gb2_r_timing.t_run_entry_epoch > 0) {\n',
        '        var _dd = Math.round(__gb2_r_timing.t_run_entry_epoch * 1000 - window.__gb2_panelOptionsAt);\n',
        '        if (_dd > -30000 && _dd < 30000) lines.push("panel chg->R run:" + _dd + " ms (jamovi dispatch, pre-R)");\n',
        '      }\n',
        '    } catch (_ePr) {}\n',
        '    try { if (window.__gb2_deliveryCount) lines.push("Delivery:        #" + window.__gb2_deliveryCount + " this session"); } catch (_eDc2) {}\n',
        '    var dbg = document.createElement("div");\n',
        '    dbg.setAttribute("data-role", "gb2-debug");\n',
        # jamovi's serializer opt-out: the overlay is rebuilt fresh on
        # every stage update, AFTER the render-time chrome sweep ran, so
        # it must class itself - without this the whole diagnostic text
        # rode copies and exports (Torry's PowerPoint paste, Jul 2026).
        '    dbg.className = "ignore-html";\n',
        '    dbg.style.cssText = "position:absolute;top:4px;right:4px;background:rgba(255,255,255,0.95);border:1px solid #999;border-radius:4px;padding:6px 8px;font:11px/1.4 monospace;color:#222;box-shadow:0 2px 6px rgba(0,0,0,0.12);z-index:9999;max-width:340px;white-space:pre;";\n',
        '    var pre = document.createElement("div");\n',
        '    pre.style.whiteSpace = "pre";\n',
        '    pre.textContent = lines.join("\\n");\n',
        '    var btnRow = document.createElement("div");\n',
        '    btnRow.style.cssText = "margin-top:6px;display:flex;gap:6px;";\n',
        '    var copyBtn = document.createElement("button");\n',
        '    copyBtn.type = "button";\n',
        '    copyBtn.textContent = "Copy";\n',
        '    copyBtn.style.cssText = "padding:2px 10px;font-size:11px;cursor:pointer;border:1px solid #4a90e2;background:#4a90e2;color:white;border-radius:3px;";\n',
        '    var closeBtn = document.createElement("button");\n',
        '    closeBtn.type = "button";\n',
        '    closeBtn.textContent = "Close";\n',
        '    closeBtn.style.cssText = "padding:2px 10px;font-size:11px;cursor:pointer;border:1px solid #aaa;background:white;color:#444;border-radius:3px;";\n',
        '    copyBtn.addEventListener("click", function() {\n',
        '      var text = lines.join("\\n");\n',
        '      try {\n',
        '        if (navigator.clipboard && navigator.clipboard.writeText) {\n',
        '          navigator.clipboard.writeText(text).then(function() {\n',
        '            copyBtn.textContent = "Copied!";\n',
        '            setTimeout(function() { copyBtn.textContent = "Copy"; }, 1200);\n',
        '          });\n',
        '        } else {\n',
        '          var ta = document.createElement("textarea");\n',
        '          ta.value = text;\n',
        '          document.body.appendChild(ta);\n',
        '          ta.select();\n',
        '          document.execCommand("copy");\n',
        '          document.body.removeChild(ta);\n',
        '          copyBtn.textContent = "Copied!";\n',
        '          setTimeout(function() { copyBtn.textContent = "Copy"; }, 1200);\n',
        '        }\n',
        '      } catch (_e) { copyBtn.textContent = "Copy failed"; }\n',
        '    });\n',
        '    closeBtn.addEventListener("click", function() {\n',
        '      if (dbg.parentNode) dbg.parentNode.removeChild(dbg);\n',
        '    });\n',
        '    btnRow.appendChild(copyBtn);\n',
        '    btnRow.appendChild(closeBtn);\n',
        '    dbg.appendChild(pre);\n',
        '    dbg.appendChild(btnRow);\n',
        '    host.appendChild(dbg);\n',
        '  }\n',
        '  };\n',
        '  var __gb2_show_dbg = false;\n',
        '  try { __gb2_show_dbg = !!(window.localStorage && window.localStorage.getItem("gb2_debug_timing") === "1"); } catch (_e0) {}\n',
        '  if (__gb2_show_dbg) window.__gb2_buildDbgOverlay();\n',
        '} catch (_eDbg) {}\n',
        store_chunk,
        '})();</script>'
    )
    .gb2_timings$t_html_built <- as.numeric(Sys.time())

    # Phase breakdown is also emitted as an HTML comment for
    # view-source debugging. Total R time below.
    paste_ms <- round((.gb2_timings$t_html_built - .gb2_timings$t_js_loaded) * 1000, 1)
    total_ms <- round((.gb2_timings$t_html_built - .gb2_timings$t_start) * 1000, 1)
    timing_comment <- paste0(
        "\n<!-- gb2 timings (ms): ",
        if (prelude_ms >= 0) paste0("prelude=", prelude_ms, " ") else "",
        "payload=", payload_ms,
        " json=", json_ms,
        " js_load=", js_load_ms,
        " paste=", paste_ms,
        " total_r=", total_ms,
        " bundle=", bundle_mode,
        " -->\n"
    )

    paste0(html_out, timing_comment)
}

# --- Bundle-cache handshake chunk builders ---------------------------
# Shared by graphbuilder2_html()'s inline branch AND the engine-boot
# placeholder (gb2_engine_boot_html) so the two emissions can never
# drift. Callers must declare `var __gb2_body_ran = false;` before
# splicing the engine chunk in.

# Module version for the failure-diagnostic boxes (memoized; "dev"
# when the package is not installed, e.g. the sourced-tree harness).
.gb2_module_version <- function() {
    v <- .gb2_widget_js_cache$mod_ver
    if (!is.null(v)) return(v)
    v <- tryCatch(as.character(utils::packageVersion("pandion")),
                  error = function(e) "dev")
    .gb2_widget_js_cache$mod_ver <- v
    v
}

# ---- Failure diagnostics (Jul 2026, Torry's ask: "diagnostics that
# only show up in circumstances like these") ----------------------------
# Three layers, each visible ONLY in a distinct failure mode; a healthy
# render never shows any of them (render()'s host.innerHTML = "" wipes
# the static layer within ~1 s, far inside the 6 s reveal delay).
#
#   Layer A (.gb2_diag_pending_html): a STATIC amber box inside the
#     host div, opacity:0 with a pure-CSS animation-delay reveal at 6 s.
#     Needs ZERO JavaScript - it is the only possible diagnostic when
#     the results view never executes scripts at all (the silent-blank
#     failure this was built for). Its default detail line therefore
#     says exactly that; any script that DOES run replaces it.
#
#   Layer A.5 (.gb2_diag_primer_script): a tiny standalone ES5 <script>
#     emitted BEFORE the main loader script. Separate tags parse
#     independently, so it still runs when the main script dies on a
#     PARSE error (e.g. an older webview rejecting newer syntax) - and
#     its window "error" listener captures that parse error's message.
#     At 6 s it upgrades the Layer A box: scripts run, engine state,
#     last captured script error, user agent.
#
#   Layer B (inline in graphbuilder2_html's loader): try/catch around
#     the render() invocation + a final else for "bundle ran but never
#     defined the engine". Writes an immediate red box (module version,
#     error + stack head, bundle mode/reason, store diag, evalBlocked,
#     UA) and re-throws ASYNCHRONOUSLY so devtools/pageerror probes
#     still see the original exception. Dynamic strings go through
#     textContent - exception messages can quote data-derived names.
.gb2_diag_pending_html <- function(mod_ver) {
    paste0(
        '<style>@keyframes gb2DiagShow{to{opacity:1}}</style>',
        '<div data-role="gb2-diag-pending" style="opacity:0;',
        'animation:gb2DiagShow .4s ease 6s forwards;',
        'margin:10px;padding:12px 14px;max-width:620px;',
        'font-size:12.5px;line-height:1.55;color:#7a5c1e;',
        'background:#fdf6e3;border:1px solid #e6d5a8;border-radius:6px;">',
        '<b>Pandion Plots: the chart did not draw.</b><br>',
        'The results arrived, but the chart engine did not paint anything ',
        'within a few seconds. Please screenshot this box and report it ',
        'along with your jamovi version (hamburger menu, then About). ',
        'Module version ', mod_ver, '.',
        '<span data-role="gb2-diag-detail" style="display:block;margin-top:6px;">',
        'Technical detail: scripts did not execute in this results view ',
        '(this text is the static fallback; a running script would have ',
        'replaced it).',
        '</span></div>'
    )
}

# Visible when (and ONLY when) the module was built without its
# minified bundle - .gb2_widget_js() sets min_missing when
# graphbuilder2.min.js is absent entirely (a plain `jmc --build` on a
# fresh clone; the official .jmo builds always include it). Emitted
# AFTER the host div so render()'s host wipe never removes it. The
# hash-stale dev state deliberately does NOT trigger this.
.gb2_min_missing_note_html <- function() {
    if (is.null(.gb2_widget_js_cache$min_missing)) return("")
    paste0(
        '<div data-role="gb2-diag-minmissing" style="margin:6px 10px;',
        'padding:8px 12px;max-width:640px;font-size:11.5px;line-height:1.5;',
        'color:#7a5c1e;background:#fdf6e3;border:1px solid #e6d5a8;',
        'border-radius:6px;">',
        '<b>Pandion Plots build note:</b> this copy of the module was built ',
        'without its minified chart bundle, so every chart ships a ~6 MB ',
        'script - rendering may be slow or fail outright. If you built the ',
        'module from source, run <code>bash scripts/minify-widget.sh</code> ',
        'before <code>jmc --build</code> (or use ',
        '<code>scripts/jmv-build-install.sh</code>, which does both). ',
        'The .jmo files on the GitHub releases page include the bundle.',
        '</div>'
    )
}

# The static-snapshot fallback block: the settled chart, serialized by
# the JS export builder and committed back through the chartSnapshot
# option, embedded as a data-URI <img>. The img context is the safe way
# to display an SVG that technically arrives from persisted data:
# scripts inside an <img> SVG never execute and it can load nothing
# external. Hidden by default; revealed only when no engine answers
# (a machine without the module installed - the shared-.omv case).
.gb2_snapshot_fallback_html <- function(widget_id, snap_svg) {
    if (!nzchar(snap_svg)) return("")
    b64 <- tryCatch(
        gsub("[\r\n]", "", jsonlite::base64_enc(charToRaw(enc2utf8(snap_svg)))),
        error = function(e) ""
    )
    if (!nzchar(b64)) return("")
    # VISIBLE by default (Jul 2026 rework, Torry's 2nd field test): the
    # jamovi export pipeline runs NO scripts, so a script-revealed image
    # can never reach a PDF/HTML export. Inverted: the picture shows
    # unless a LIVE engine hides it (the loader does, pre-render) -
    # script-less contexts (exports, module-less first paint) get the
    # picture for free.
    paste0(
        '<div id="', widget_id, '-snap" data-role="gb2-static-fallback" ',
        'style="display:block;margin:6px 10px;">',
        '<img alt="Chart (static snapshot)" ',
        'style="max-width:100%;height:auto;display:block;border:1px solid #e3e3e3;border-radius:6px;" ',
        'src="data:image/svg+xml;base64,', b64, '">',
        # Caption is separately hidden: the IMG reveals the moment no
        # engine is found (instant picture, also what jamovi's export
        # re-render captures), but the caption CLAIMS the module is not
        # installed - that must wait for the staged confirmation so it
        # never flashes on a live machine that is merely warming up.
        # The Save link href is wired from the img src at reveal time
        # (never duplicated - the base64 is big).
        '<div data-role="gb2-static-fallback-caption" ',
        'style="display:none;margin-top:6px;font-size:11.5px;line-height:1.5;color:#666;">',
        'Static snapshot. This chart was made with the Pandion Plots module for ',
        'jamovi, which is not installed here.',
        # jamovi-only sentences ride the ignore-html class (jamovi's own
        # serializer opt-out): visible INSIDE jamovi, skipped by every
        # export/copy serialization - so the browser reader of an
        # exported HTML file gets a clean working Save link with no
        # jamovi menu talk (Torry's Phase 4 module-less UX log).
        '<span class="ignore-html" data-role="gb2-snap-jamovi-help">',
        ' You can still use the figure: right-click it and choose Image, ',
        'then Copy, to paste it into Word or PowerPoint. Or choose ',
        'Analysis, then Export, to save this page as a PDF or HTML file. ',
        '(Export under the Image menu needs the module and does nothing ',
        'here.)</span>',
        ' To view and edit the live chart, install Pandion Plots ',
        '(github.com/torryscott/pandion, Releases) and reopen this file. ',
        '<a data-role="gb2-snap-save" download="chart.svg" href="#" ',
        'style="color:#3573bd;">Save image (SVG)</a>',
        '<span class="ignore-html" data-role="gb2-snap-save-caveat">',
        '<br>Note: this link does nothing here inside jamovi, because ',
        'jamovi blocks file downloads. It only works from a web browser, ',
        'after an HTML export: (1) export the results as HTML using ',
        'Analysis, then Export; (2) open that HTML file in a web browser; ',
        '(3) click this Save image link there.</span>',
        # Click feedback for the link INSIDE jamovi: hidden until the
        # first click, revealed by a listener the reveal scripts attach.
        # The exported HTML runs no scripts (and this div is display:none
        # + ignore-html anyway), so a browser click goes straight to the
        # download and never sees the note.
        '<div class="ignore-html" data-role="gb2-snap-save-note" ',
        'style="display:none;margin-top:5px;padding:6px 9px;background:#fdf6e3;',
        'border:1px solid #e6d9a8;border-radius:4px;color:#665f38;">',
        'Nothing downloaded: jamovi blocks file downloads in this view. ',
        'This link only works from a web browser, after an HTML export: ',
        '(1) export the results as HTML using Analysis, then Export; ',
        '(2) open that HTML file in a web browser; (3) click the Save ',
        'image link there. Or right-click the chart and choose Image, ',
        'then Copy, to use the figure directly.</div>',
        '</div></div>'
    )
}

.gb2_diag_primer_script <- function(widget_id_json) {
    paste0(
        '<script>(function(){try{\n',
        'if(!window.__gb2_errTrapOn){window.__gb2_errTrapOn=true;\n',
        'window.addEventListener("error",function(e){try{\n',
        'var m=e&&e.message?String(e.message):"unknown script error";\n',
        'if(e&&typeof e.lineno==="number"&&e.lineno>0)m+=" (line "+e.lineno+")";\n',
        'window.__gb2_lastScriptErr=m;}catch(_e1){}},true);\n',
        '}\n',
        'var id=', widget_id_json, ';\n',
        'setTimeout(function(){try{\n',
        'var h=document.getElementById(id);if(!h)return;\n',
        'var d=h.querySelector("[data-role=gb2-diag-pending]");if(!d)return;\n',
        'var s=d.querySelector("[data-role=gb2-diag-detail]");\n',
        'var msg;\n',
        'if(!window.GraphBuilder2||!window.GraphBuilder2.render){\n',
        'msg="Technical detail: scripts DO execute in this view, but the chart engine failed to load";\n',
        '}else{\n',
        'msg="Technical detail: the chart engine loaded, but the chart still did not draw";\n',
        '}\n',
        'if(window.__gb2_lastScriptErr)msg+=" - last script error: "+window.__gb2_lastScriptErr;\n',
        'msg+=".";\n',
        'try{msg+=" [ua: "+navigator.userAgent+"]";}catch(_eU){}\n',
        'if(s)s.textContent=msg;\n',
        'd.style.opacity="1";d.style.animation="none";\n',
        'try{var sn=document.getElementById(id+"-snap");if(sn){sn.style.display="block";\n',
        'var sc=sn.querySelector("[data-role=gb2-static-fallback-caption]");if(sc)sc.style.display="block";\n',
        'var sa=sn.querySelector("[data-role=gb2-snap-save]");var si=sn.querySelector("img");\n',
        'if(sa&&si&&sa.getAttribute("href")==="#")sa.setAttribute("href",si.getAttribute("src"));\n',
        'if(sa&&!sa.__gb2NoteWired){sa.__gb2NoteWired=true;sa.addEventListener("click",function(){try{var nn=sn.querySelector("[data-role=gb2-snap-save-note]");if(nn)nn.style.display="block";}catch(_eNt2){}});}\n',
        '}}catch(_eSn){}\n',
        '}catch(_e2){}},6000);\n',
        '}catch(_e0){}})();</script>\n'
    )
}

# The gated, marker-wrapped bundle body. The gate skips re-executing
# the IIFE when this exact bundle version already ran in this window;
# the __hash clause re-executes after a module upgrade mid-session
# (previously a stale engine could silently keep rendering new
# payloads).
.gb2_engine_chunk_inline <- function(js_hash, js_code) {
    gate_cond <- if (nzchar(js_hash))
        paste0('typeof window === "undefined" || typeof window.GraphBuilder2 === "undefined" || window.GraphBuilder2.__hash !== "',
               js_hash, '"')
    else
        'typeof window === "undefined" || typeof window.GraphBuilder2 === "undefined"'
    paste0(
        'if (', gate_cond, ') {\n',
        '  __gb2_body_ran = true;\n',
        '/*GB2_BUNDLE_START:', js_hash, '*/\n',
        js_code, '\n',
        '/*GB2_BUNDLE_END:', js_hash, '*/\n',
        '}\n',
        if (nzchar(js_hash))
            paste0('if (typeof window !== "undefined" && window.GraphBuilder2) { window.GraphBuilder2.__hash = "',
                   js_hash, '"; }\n')
        else ''
    )
}

# Self-source capture, spliced at the TOP of every script that carries
# the store chunk. The store snippet must find the marker-wrapped
# bundle text; production jamovi's results renderer executes our
# script such that a document.getElementsByTagName("script") scan
# cannot see it ("marker not found in 1 scripts", Torry's Jul 2026
# field report - shadow DOM / discard-after-execute), so the script
# captures its OWN source synchronously instead:
#   1. document.currentScript.textContent (script-element execution,
#      works inside shadow roots);
#   2. String(arguments.callee) - the enclosing IIFE's source - when
#      the code was eval'ed (currentScript null there);
#   3. the old DOM scan survives in the store chunk as last resort.
.gb2_self_capture_chunk <- function() {
    paste0(
        'var __gb2_selfText = "";\n',
        'try { if (document.currentScript && document.currentScript.textContent) __gb2_selfText = document.currentScript.textContent; } catch (_eCS) {}\n',
        'try { if (!__gb2_selfText && typeof arguments !== "undefined" && arguments.callee) __gb2_selfText = String(arguments.callee); } catch (_eCal) {}\n'
    )
}

# Deferred (400 ms) localStorage store + clientBundleHash write-back.
# Deferred so it never delays first paint. The hash write-back only
# happens after a verified localStorage store, so a failed store
# degrades to inline-every-render. The hash-tagged start marker
# guarantees we never store a different version's bundle text under
# this version's key. The marker literals are split
# ("GB2_BUNDLE_" + "START...") so this snippet's own source can never
# match its own search - searching the whole script text for an
# intact literal would otherwise find the snippet itself (that bug
# shipped a malformed bundle copy in the first cut).
.gb2_store_chunk <- function(js_hash) {
    if (!nzchar(js_hash)) return('')
    paste0(
        'try {\n',
        '  if (typeof window !== "undefined" && window.localStorage) {\n',
        # Every exit records WHY into window.__gb2_bundleStoreDiag (the
        # iframe window survives deliveries), surfaced on the debug
        # overlay's Client cache line - a store that silently never
        # succeeds (Jul 2026 field bug) is diagnosable without devtools.
        '    if (window.localStorage.getItem("graphbuilder2.bundle.evalBlocked")) {\n',
        '      window.__gb2_bundleStoreDiag = "skipped: evalBlocked";\n',
        '    } else {\n',
        '    setTimeout(function () { try {\n',
        '      var KEY = "graphbuilder2.bundle.', js_hash, '";\n',
        '      var MARK = "/*GB2_BUNDLE_" + "START:', js_hash, '*/";\n',
        '      var ENDM = "/*GB2_BUNDLE_" + "END:', js_hash, '*/";\n',
        '      if (!window.localStorage.getItem(KEY)) {\n',
        '        var txt = null, scs = null, selfN = 0, viaSelf = false;\n',
        '        try {\n',
        '          if (typeof __gb2_selfText === "string" && __gb2_selfText) {\n',
        '            selfN = __gb2_selfText.length;\n',
        '            var sa = __gb2_selfText.indexOf(MARK);\n',
        '            if (sa >= 0) {\n',
        '              var sb = __gb2_selfText.indexOf(ENDM, sa + MARK.length);\n',
        '              if (sb > sa) { txt = __gb2_selfText.slice(sa + MARK.length, sb); viaSelf = true; }\n',
        '            }\n',
        '          }\n',
        '        } catch (_eSf) {}\n',
        '        if (!txt) {\n',
        '          scs = document.getElementsByTagName("script");\n',
        '          for (var i = 0; i < scs.length; i++) {\n',
        '            var t = scs[i].textContent || "";\n',
        '            var a = t.indexOf(MARK);\n',
        '            if (a >= 0) {\n',
        '              var b = t.indexOf(ENDM, a + MARK.length);\n',
        '              if (b > a) { txt = t.slice(a + MARK.length, b); break; }\n',
        '            }\n',
        '          }\n',
        '        }\n',
        '        if (txt && txt.length > 100000) {\n',
        '          for (var j = window.localStorage.length - 1; j >= 0; j--) {\n',
        '            var k = window.localStorage.key(j);\n',
        '            if (k && k.indexOf("graphbuilder2.bundle.") === 0 && k !== KEY\n',
        '                && k !== "graphbuilder2.bundle.evalBlocked")\n',
        '              window.localStorage.removeItem(k);\n',
        '          }\n',
        # The bundle is structural; undo LS persistence is a
        # nice-to-have (the in-memory undo stack survives). On quota
        # pressure, prune our own bulky keys and retry ONCE.
        '          try {\n',
        '            window.localStorage.setItem(KEY, txt);\n',
        '            window.__gb2_bundleStoreDiag = "stored (from " + (viaSelf ? "self-source" : "dom scan") + ")";\n',
        '          } catch (_eQ) {\n',
        '            try {\n',
        '              window.localStorage.removeItem("graphbuilder2.undo.v2");\n',
        '              window.localStorage.removeItem("graphbuilder2.undo.v1");\n',
        '              window.localStorage.setItem(KEY, txt);\n',
        '              window.__gb2_bundleStoreDiag = "stored after pruning undo (" + (_eQ && _eQ.name ? _eQ.name : "error") + ")";\n',
        '            } catch (_eQ2) {\n',
        '              window.__gb2_bundleStoreDiag = "store FAILED: " + (_eQ2 && _eQ2.name ? _eQ2.name : "error");\n',
        '            }\n',
        '          }\n',
        '        } else if (txt) {\n',
        '          window.__gb2_bundleStoreDiag = "bundle text too short: " + txt.length;\n',
        '        } else {\n',
        '          window.__gb2_bundleStoreDiag = "marker not found (self-source " + selfN + " chars, " + (scs ? scs.length : 0) + " scripts)";\n',
        '        }\n',
        '      } else {\n',
        '        window.__gb2_bundleStoreDiag = "already stored";\n',
        '      }\n',
        '      if (window.localStorage.getItem(KEY) && typeof window.setOption === "function") {\n',
        '        if (typeof window.__gb2_setOption === "function")\n',
        '          window.__gb2_setOption("clientBundleHash", "', js_hash, '");\n',
        '        else window.setOption("clientBundleHash", "', js_hash, '");\n',
        '      }\n',
        # Release the captured self-source (~1.9 MB) once the store has
        # run - the timeout closure would otherwise pin it until GC.
        '      try { __gb2_selfText = null; } catch (_eRel) {}\n',
        '    } catch (_eS) { try { window.__gb2_bundleStoreDiag = "store threw: " + (_eS && _eS.name ? _eS.name : "error"); } catch (_eS2) {} } }, 400);\n',
        '    }\n',
        '  }\n',
        '} catch (_eS0) {}\n'
    )
}

# --- Engine-boot placeholder (speed pass Phase 1, Jul 2026) ----------
# Called by every chart module's empty-variable placeholder branch:
#   setContent(gb2_engine_boot_html(private$.placeholder(),
#                                   self$options$clientBundleHash))
# While the user is still choosing variables, this ships the widget
# bundle behind the SAME hash handshake as a real render (gated body +
# localStorage store + clientBundleHash write-back) but with no payload
# and no render() call. By the time the first variable lands, the hash
# has usually round-tripped and the first data render takes the ~16 KB
# cached branch instead of paying the 1.9 MB inline ship + parse +
# store + echo at the moment of first interaction. Degrades safely: a
# user faster than the round trip just gets the old inline first
# render.
#   - hash already confirmed -> plain message. This is also what the
#     hash echo's re-run emits, so the 1.9 MB boot content is REPLACED
#     in the results tree shortly after it lands and never lingers in
#     a saved .omv.
#   - GB2_NO_BUNDLE_CACHE / unknown hash -> plain message (handshake
#     disabled; nothing useful to boot).
#   - any internal error -> plain message (the placeholder must never
#     break on a packaging problem; the data render's own tryCatch
#     reports such errors).
gb2_engine_boot_html <- function(message_html, client_bundle_hash = "") {
    tryCatch({
        if (nzchar(Sys.getenv("GB2_NO_BUNDLE_CACHE")))
            return(message_html)
        js_hash <- .gb2_widget_js_hash()
        if (!nzchar(js_hash))
            return(message_html)
        if (identical(as.character(client_bundle_hash), js_hash))
            return(message_html)
        js_code <- .gb2_widget_js()
        paste0(
            message_html, '\n',
            # Built-without-minify note ("" in a healthy build) - shown
            # on the empty-variable page too so a from-source builder
            # sees it before ever adding a variable.
            .gb2_min_missing_note_html(),
            '<script>(function(){\n',
            .gb2_self_capture_chunk(),
            'var __gb2_body_ran = false;\n',
            .gb2_engine_chunk_inline(js_hash, js_code),
            .gb2_store_chunk(js_hash),
            '})();</script>'
        )
    }, error = function(e) message_html)
}

# Package-level cache for the widget JS file. Read once, paste
# once, return the cached string on every subsequent call.
# Prefers the minified bundle (graphbuilder2.min.js) when present
# AND CURRENT — scripts/minify-widget.sh writes a sidecar
# graphbuilder2.min.js.hash containing the source's MD5 at minify
# time. At runtime we compute the current source's MD5 and
# compare; if they don't match, the minified bundle is stale
# (i.e. someone edited graphbuilder2.js without re-running the
# minify script) and we fall back to the un-minified source so
# dev iteration sees fresh code automatically. Falls back to the
# raw source if no minified bundle exists at all.
.gb2_widget_js_cache <- new.env(parent = emptyenv())
.gb2_widget_js <- function() {
    if (!is.null(.gb2_widget_js_cache$code)) {
        return(.gb2_widget_js_cache$code)
    }
    min_path  <- system.file("widget", "graphbuilder2.min.js",      package = "pandion")
    src_path  <- system.file("widget", "graphbuilder2.js",          package = "pandion")
    hash_path <- system.file("widget", "graphbuilder2.min.js.hash", package = "pandion")

    # Default: prefer minified when present, but validate against
    # the sidecar hash so a stale .min.js doesn't shadow newer
    # source edits during dev iteration.
    js_path <- ""
    if (nzchar(min_path)) {
        js_path <- min_path
        if (nzchar(src_path) && nzchar(hash_path)) {
            recorded_hash <- tryCatch(
                trimws(readLines(hash_path, n = 1, warn = FALSE)),
                error = function(e) ""
            )
            current_hash <- tryCatch(
                unname(tools::md5sum(src_path)),
                error = function(e) ""
            )
            if (nzchar(recorded_hash) && nzchar(current_hash)
                && !identical(recorded_hash, current_hash)) {
                # Stale minify — source was edited after the last
                # minify run. Fall back to the un-minified source.
                js_path <- src_path
                if (is.null(.gb2_widget_js_cache$warned_stale)) {
                    .gb2_widget_js_cache$warned_stale <- TRUE
                    message("[pandion] graphbuilder2.min.js is older than ",
                            "graphbuilder2.js; loading the un-minified source. ",
                            "Run `bash scripts/minify-widget.sh` to refresh.")
                }
            }
        }
    } else if (nzchar(src_path)) {
        js_path <- src_path
        # The minified bundle is absent ENTIRELY - not hash-stale (the
        # normal mid-edit dev state above), but never built. This is the
        # built-from-source-without-scripts/minify-widget.sh trap (the
        # v2.4.1 regression, re-diagnosed from a jamovi-team field
        # report Jul 2026): plain `jmc --build` on a fresh clone ships
        # only the ~6 MB source, which the results webview may choke
        # on. Flag it so both HTML emissions surface a visible note.
        .gb2_widget_js_cache$min_missing <- TRUE
        if (is.null(.gb2_widget_js_cache$warned_missing)) {
            .gb2_widget_js_cache$warned_missing <- TRUE
            message("[pandion] graphbuilder2.min.js is missing from this ",
                    "build; serving the un-minified source (~6 MB per render). ",
                    "Run `bash scripts/minify-widget.sh` before building, or ",
                    "use scripts/jmv-build-install.sh.")
        }
    }
    if (!nzchar(js_path)) {
        stop("graphbuilder2 widget JS not found in installed package")
    }
    .gb2_widget_js_cache$source <- basename(js_path)
    # Identity of the file actually served (min or source) — the key
    # for the client-side bundle cache. NA-safe: md5 failure degrades
    # to "" which keeps every render in inline mode.
    h <- tryCatch(unname(tools::md5sum(js_path)), error = function(e) "")
    .gb2_widget_js_cache$hash <- if (length(h) == 1L && !is.na(h)) h else ""
    js_code <- paste(
        readLines(js_path, warn = FALSE, encoding = "UTF-8"),
        collapse = "\n"
    )
    .gb2_widget_js_cache$code <- js_code
    js_code
}

# md5 of the served bundle file, computed+cached by .gb2_widget_js().
# "" when unknown (keeps the handshake in inline mode).
.gb2_widget_js_hash <- function() {
    if (is.null(.gb2_widget_js_cache$code))
        .gb2_widget_js()
    h <- .gb2_widget_js_cache$hash
    if (is.null(h) || length(h) != 1L || is.na(h)) "" else as.character(h)
}
