'use strict';

// Left-panel data-tip styling for Scatter (see gbPanelTip.js).
// TIP_TEXT must match the Label string in xyplotbuilder.u.yaml exactly.

const panelTip = require('./gbPanelTip');

const TIP_TEXT =
    'Both variables numeric. Every row of your data becomes one point.';

module.exports = {

    // Fired when the options view is (re)built.
    view_updated: function(ui) {
        panelTip.style(TIP_TEXT);
    }
};
