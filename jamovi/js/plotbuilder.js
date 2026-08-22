'use strict';

// Left-panel data-tip styling for Compare Groups (see gbPanelTip.js).
// The tip is found by the zero-width marker on the label in
// plotbuilder.u.yaml, so no copy of the wording lives here.

const panelTip = require('./gbPanelTip');


module.exports = {

    // Fired when the options view is (re)built.
    view_updated: function(ui) {
        panelTip.style();
    }
};
