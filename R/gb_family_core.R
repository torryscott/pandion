# Shared helpers for the Graph Builder analyses.
#
# This file once held the v1 ggplot theme / palette / export helpers;
# the v2 HTML-widget architecture (see CLAUDE.md) made all of them dead
# code and they were deleted along with gb_family_data.R /
# gb_family_axes.R / gb_family_export.R. The one survivor is the
# universal "is this variable role empty?" guard used by every module.

gb_family_is_missing <- function(value) {
    if (is.null(value))
        return(TRUE)
    if (length(value) == 0)
        return(TRUE)
    if (is.character(value))
        return(all(trimws(value) == ""))
    FALSE
}
