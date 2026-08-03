'use strict';

// Left-panel data-tip styling for Likert / Survey (see gbPanelTip.js).
// TIP_TEXT must match the Label string in likertplotbuilder.u.yaml exactly.

const panelTip = require('./gbPanelTip');

const TIP_TEXT =
    'All items must share one response scale (e.g. 1-5 agreement).';

module.exports = {

    // Fired when the options view is (re)built.
    view_updated: function(ui) {
        panelTip.style(TIP_TEXT);
    }
};
