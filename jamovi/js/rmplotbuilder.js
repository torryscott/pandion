'use strict';

// UI event handlers for the Repeated Measures chart (rmplotbuilder).
//
// These drive the FACTORIAL within-subjects input (the RM-ANOVA-style
// factors + cells boxes in rmplotbuilder.u.yaml). When the user edits the
// within-subjects factors (the RMAnovaFactorsBox bound to `rm`), we compute
// the Cartesian product of the factor levels and materialise ONE cell per
// combination into `rmCells`, so the ListBox renders a "drag variable here"
// drop target per factorial cell. The simple single-factor path (the
// `measures` box) needs no handlers.
//
// Ported (trimmed) from jmv's anovaRM event handlers via rmfactormock;
// `utils` is a jamovi-injected global available to option-UI modules, and
// ./rmacell (shared with the mock) is the level-tuple label formatter.
//
// Because this file lives at jamovi/js/<name>.js the compiler wires it up as
// `this.handlers = require('./rmplotbuilder')` for the compiled UI view.

const rma_cell = require('./rmacell');
const panelTip = require('./gbPanelTip');

// Left-panel data-tip (see gbPanelTip.js); must match rmplotbuilder.u.yaml.
const TIP_TEXT =
    'Wide format: one column per measurement occasion, one row per subject.';

module.exports = {

    // Fired once when the options view is (re)built: seed the factor-cell
    // grid from whatever `rm` currently holds.
    view_updated: function(ui) {
        panelTip.style(TIP_TEXT);
        this._factorCells = null;
        this.updateFactorCells(ui);
    },

    // The within factors / their levels changed -> regenerate the cell grid.
    rm_changed: function(ui) {
        this.updateFactorCells(ui);
    },

    // Initialise rmCells the first time it is touched while still null.
    rmCells_changed: function(ui) {
        if (ui.rmCells.value() === null) {
            let cells = this.rmCells_init(ui);
            ui.rmCells.setPropertyValue('maxItemCount', cells.length);
            ui.rmCells.setValue(cells);
        }
        else {
            this.filterCells(ui);
        }
    },

    // Cartesian product of every factor's levels, last-index-fastest (jmv's
    // order), stored on the view as this._factorCells, then synced into the
    // rmCells option via filterCells.
    updateFactorCells: function(ui) {
        let value = ui.rm.value();
        if (value === null)
            return;

        // Defensive: a factor with zero levels would divide by
        // levels.length === 0 (NaN) below and spin forever, hanging the
        // options panel. RMAnovaFactorsBox normally keeps >= 1 level; bail.
        for (let i = 0; i < value.length; i++) {
            if (!value[i] || !value[i].levels || value[i].levels.length === 0)
                return;
        }

        // The within factors are always CROSSED: the Cartesian product of
        // every factor's levels - one cell per COMBINATION - which is what an
        // interaction plot of two within factors needs. Any factor left off
        // every display slot is averaged over on the chart.
        this._factorCells = this.crossedCells(value);
        this.filterCells(ui);
    },

    crossedCells: function(value) {
        // Cartesian product of every factor's levels, last-index-fastest.
        let data = [], indices = [];
        for (let i = 0; i < value.length; i++) indices[i] = 0;
        let end = (value.length === 0);
        while (end === false) {
            let cell = [];
            for (let k = 0; k < indices.length; k++) cell.push(value[k].levels[indices[k]]);
            data.push(cell);
            let r = indices.length - 1;
            if (r < 0) end = true;
            while (r >= 0) {
                indices[r] = (indices[r] + 1) % value[r].levels.length;
                if (indices[r] === 0) r -= 1; else break;
                if (r === -1) end = true;
            }
        }
        return data;
    },

    // Build a fresh rmCells value (all measures empty) from the factor cells.
    rmCells_init: function(ui) {
        if (this._factorCells === null || this._factorCells === undefined)
            return [];

        let cells = [];
        let factorCells = utils.clone(this._factorCells);
        for (let factorCell of factorCells)
            cells.push({ measure: null, cell: factorCell });

        return cells;
    },

    // Reconcile the existing rmCells with the current (factor, level) rows:
    // carry every already-dragged measure onto the row with the SAME
    // (factor, level) tuple by CONTENT (not by index), append rows for new
    // levels, drop rows for removed ones. So adding/reordering a factor never
    // re-maps a column onto the wrong condition.
    filterCells: function(ui) {
        if (this._factorCells === null || this._factorCells === undefined)
            return;

        let existing = utils.clone(ui.rmCells.value(), []);
        let factorCells = utils.clone(this._factorCells);

        // Carry each already-dragged measure onto the cell with the SAME
        // (factor, level) tuple, wherever it now sits - so adding, removing or
        // reordering a factor/level never re-maps a column onto the wrong
        // condition (the old by-index reconcile did exactly that).
        let SEP = String.fromCharCode(1);
        let byKey = {};
        for (let c of existing) {
            if (c && c.measure !== null && c.measure !== undefined && c.cell)
                byKey[c.cell.join(SEP)] = c.measure;
        }
        let cells = [];
        for (let fc of factorCells) {
            let key = fc.join(SEP);
            cells.push({ measure: (key in byKey) ? byKey[key] : null, cell: fc });
        }

        // Only write when something actually changed, to avoid a setValue ->
        // rmCells_changed -> filterCells loop.
        let changed = existing.length !== cells.length;
        for (let i = 0; !changed && i < cells.length; i++) {
            if (!existing[i]
                || existing[i].measure !== cells[i].measure
                || rma_cell.isEqual(existing[i].cell, cells[i].cell) === false)
                changed = true;
        }
        if (changed) {
            ui.rmCells.setValue(cells);
            ui.rmCells.setPropertyValue('maxItemCount', cells.length);
        }
    }
};
