'use strict';

var viewBase; try { viewBase = require('./gbViewBase'); } catch (e) { viewBase = {}; }

var uniqueValues = function(values) {
    var seen = {};
    var result = [];

    (values || []).forEach(function(value) {
        if (!value || seen.hasOwnProperty(value))
            return;
        seen[value] = true;
        result.push(value);
    });

    return result;
};

var STANDARD_ADVANCED_CONTROLS = {
    text: [
        'fontFamily',
        'baseFontSize',
        'showSubtitle',
        'plotSubtitle',
        'titleFontSize',
        'titleBold',
        'titleItalic',
        'titleColor',
        'titleColorCustom',
        'subtitleFontSize',
        'subtitleBold',
        'subtitleItalic',
        'subtitleColor',
        'subtitleColorCustom',
        'xAxisLabelFontSize',
        'xAxisLabelColor',
        'xAxisLabelColorCustom',
        'yAxisLabelFontSize',
        'yAxisLabelColor',
        'yAxisLabelColorCustom',
        'xAxisTickFontSize',
        'xAxisTickBold',
        'xAxisTickItalic',
        'xAxisTickColor',
        'xAxisTickColorCustom',
        'xAxisTickRotation',
        'xAxisTickMargin',
        'yAxisTickFontSize',
        'yAxisTickBold',
        'yAxisTickItalic',
        'yAxisTickColor',
        'yAxisTickColorCustom',
        'yAxisTickMargin'
    ],
    axes: [
        'xRangeMode',
        'xMin',
        'xMax',
        'xInterval',
        'showXTickMarks',
        'xTickDirection',
        'xTickLength',
        'xTickWeight',
        'xTickRelabelList',
        'yRangeMode',
        'yMin',
        'yMax',
        'yInterval',
        'showYTickMarks',
        'majorTickDirection',
        'majorTickLength',
        'majorTickWeight',
        'yTickRelabelList',
        'facetScales',
        'facetLabelSize'
    ],
    style: [
        'showValueLabels',
        'showPercentLabels',
        'valueLabelPosition',
        'valueLabelDecimals',
        'valueLabelSize',
        'valueLabelBold',
        'valueLabelItalic',
        'valueLabelMargin',
        'valueLabelColor',
        'valueLabelColorCustom',
        'labelMinPercent',
        'useCustomColors',
        'colorThemeCustomHex',
        'customColorRows',
        'showGridLines',
        'gridLines',
        'gridLineStyle',
        'gridLineSize',
        'gridLineColor',
        'gridLineColorCustom',
        'showAxisLines',
        'axisLineColor',
        'axisLineColorCustom',
        'axisLineWeight',
        'bgColor',
        'bgColorCustom'
    ],
    legend: [
        'legendPosition',
        'showLegendTitle',
        'legendTitleText',
        'legendTitleFontSize',
        'legendTitleBold',
        'legendTitleItalic',
        'legendTitleColor',
        'legendTitleColorCustom',
        'showLegendItems',
        'legendTextFontSize',
        'legendTextBold',
        'legendTextItalic',
        'legendTextColor',
        'legendTextColorCustom',
        'showLegendKeys',
        'legendKeySize',
        'legendKeySpacing'
    ],
    annotations: [
        'showRefLine',
        'referenceLines',
        'refLineAxis',
        'refLineValue',
        'refLineStyle',
        'refLineWeight',
        'refLineColor',
        'refLineColorCustom'
    ],
    layout: [
        'plotWidth',
        'plotHeight'
    ]
};

module.exports = {
    standardAdvancedControls: STANDARD_ADVANCED_CONTROLS,

    combineControlLists: function() {
        var combined = [];
        Array.prototype.slice.call(arguments).forEach(function(list) {
            if (!Array.isArray(list))
                return;
            list.forEach(function(value) {
                combined.push(value);
            });
        });
        return uniqueValues(combined);
    },

    watchControlValue: function(host, control, callback, fallback, pollMs, handleKey) {
        if (!control || typeof callback !== 'function')
            return;

        var lastValue = viewBase.readControlValue(control, fallback);
        callback(lastValue);

        var apply = function() {
            var nextValue = viewBase.readControlValue(control, fallback);
            if (nextValue === lastValue)
                return;
            lastValue = nextValue;
            callback(nextValue);
        };

        viewBase.bindControlEvents(control, apply);

        if (host && handleKey) {
            if (host[handleKey])
                clearInterval(host[handleKey]);
            host[handleKey] = setInterval(apply, pollMs || 2000);
        }
    },

    setupComplexityWatcher: function(host, ui, onUpdate) {
        if (!ui || !ui.uiComplexity || typeof onUpdate !== 'function')
            return;

        this.watchControlValue(
            host,
            ui.uiComplexity,
            onUpdate,
            'advanced',
            250,
            '_gbComplexityPoller'
        );
    },

    setupConditionalVisibility: function(host, ui, config) {
        if (!ui || !config || !config.controlName || typeof config.onUpdate !== 'function')
            return;

        var control = ui[config.controlName];
        this.watchControlValue(
            host,
            control,
            function(value) { config.onUpdate(value, ui, host); },
            config.fallbackValue,
            config.pollMs || 2000,
            config.handleKey || '_gbConditionalPoller'
        );
    },

    applyVisibilityMap: function(map, activeKey) {
        if (!map)
            return;

        Object.keys(map).forEach(function(key) {
            var entry = map[key];
            if (!entry)
                return;

            var shouldShow = Array.isArray(entry.showWhen)
                ? entry.showWhen.indexOf(activeKey) !== -1
                : key === activeKey;

            viewBase.toggleContainer(entry.container || entry, shouldShow);
        });
    },

    hideAdvancedControls: function(host, ui, controlNames) {
        if (!ui)
            return;

        var complexity = (host && host._gbUiComplexity)
            ? host._gbUiComplexity
            : viewBase.readControlValue(ui.uiComplexity, 'advanced');

        if (complexity !== 'simple')
            return;

        uniqueValues(controlNames || []).forEach(function(controlName) {
            var container = viewBase.getControlContainer(ui, controlName);
            viewBase.toggleContainer(container, false);
        });
    }
};
