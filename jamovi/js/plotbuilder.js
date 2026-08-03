'use strict';

// Left-panel data-tip styling for Compare Groups (see gbPanelTip.js).
// TIP_TEXT must match the Label string in plotbuilder.u.yaml exactly.

const panelTip = require('./gbPanelTip');

const TIP_TEXT =
    'X is the categories, Y is the numbers. One row per observation.';

module.exports = {

    // Fired when the options view is (re)built.
    view_updated: function(ui) {
        panelTip.style(TIP_TEXT);
    }
};
