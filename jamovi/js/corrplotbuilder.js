'use strict';

// Left-panel data-tip styling for Correlation Matrix (see gbPanelTip.js).
// TIP_TEXT must match the Label string in corrplotbuilder.u.yaml exactly.

const panelTip = require('./gbPanelTip');

const TIP_TEXT =
    'Two or more numeric variables: different measures, not conditions.';

module.exports = {

    // Fired when the options view is (re)built.
    view_updated: function(ui) {
        panelTip.style(TIP_TEXT);
    }
};
