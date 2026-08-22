'use strict';

// Left-panel data-tip styling for the Distribution module (Jul 2026).
// The panel deliberately holds nothing but the variable boxes and one
// data-tip Label; the shared gbPanelTip helper renders it muted italic.
// The tip is found by the zero-width marker on the label in
// distplotbuilder.u.yaml, so no copy of the wording lives here.
// (on any mismatch the line just renders plain, never broken).

const panelTip = require('./gbPanelTip');


module.exports = {

    // Fired when the options view is (re)built.
    view_updated: function(ui) {
        panelTip.style();
    }
};
