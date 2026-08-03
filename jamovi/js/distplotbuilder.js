'use strict';

// Left-panel data-tip styling for the Distribution module (Jul 2026).
// The panel deliberately holds nothing but the variable boxes and one
// data-tip Label; the shared gbPanelTip helper renders it muted italic.
// TIP_TEXT must match the Label string in distplotbuilder.u.yaml exactly
// (on any mismatch the line just renders plain, never broken).

const panelTip = require('./gbPanelTip');

const TIP_TEXT =
    'One numeric variable. Group By overlays shapes; Panels separates them.';

module.exports = {

    // Fired when the options view is (re)built.
    view_updated: function(ui) {
        panelTip.style(TIP_TEXT);
    }
};
