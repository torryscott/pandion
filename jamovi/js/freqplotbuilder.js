'use strict';

// Left-panel data-tip styling for Frequencies (see gbPanelTip.js).
// TIP_TEXT must match the Label string in freqplotbuilder.u.yaml exactly.

const panelTip = require('./gbPanelTip');

const TIP_TEXT =
    'One row per observation, not pre-tabulated counts.';

module.exports = {

    // Fired when the options view is (re)built.
    view_updated: function(ui) {
        panelTip.style(TIP_TEXT);
    }
};
