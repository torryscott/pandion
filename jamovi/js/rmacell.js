'use strict';

// Label formatter for a repeated-measures cell tuple (an array of level names,
// e.g. ["EPM","D1"]), rendered on the right of each cells-box row as
// "EPM, D1". Ported verbatim from jmv's rmacell format so the mock's cells grid
// reads identically to Repeated Measures ANOVA. `Format` is a jamovi-injected
// global available to option-UI format modules.

var rma_cell = new Format({

    name: 'rma_cell',

    default: [],

    toString: function(raw) {
        if (raw === null || raw.length === 0)
            return '';
        var r = raw[0];
        for (var i = 1; i < raw.length; i++)
            r = r + ', ' + raw[i];
        return r;
    },

    parse: function(value) {
        return value;
    },

    isValid: function(raw) {
        if (raw === null)
            return true;

        if (Array.isArray(raw) === false)
            return false;

        for (var i = 0; i < raw.length; i++) {
            if (typeof(raw[i]) !== 'string')
                return false;
        }

        return true;
    },

    isEmpty: function(raw) {
        return raw === null || raw.length === 0;
    },

    isEqual: function(raw1, raw2) {
        if (raw1.length !== raw2.length)
            return false;

        for (var i = 0; i < raw1.length; i++) {
            if (raw1[i] !== raw2[i])
                return false;
        }

        return true;
    }
});

module.exports = rma_cell;
