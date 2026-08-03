'use strict';

var viewBase; try { viewBase = require('./gbViewBase'); } catch (e) { viewBase = {}; }

var NAMED_HEX = {
    black: '#000000',
    white: '#ffffff',
    red: '#ff0000',
    blue: '#0000ff',
    green: '#008000',
    orange: '#ffa500',
    purple: '#800080',
    gray: '#808080',
    grey: '#808080',
    teal: '#008080',
    transparent: '#ffffff',
    lightgray: '#d3d3d3',
    lightgrey: '#d3d3d3',
    auto: '#000000'
};

var normalizeHex = function(value, fallback) {
    var safeFallback = fallback || '#000000';
    var s = (value === null || value === undefined) ? '' : String(value).trim();
    if (s === '' || s.toLowerCase() === '#hex')
        return safeFallback;
    if (s.charAt(0) !== '#')
        s = '#' + s;
    if (/^#[0-9a-f]{3}$/i.test(s))
        return '#' + s.substring(1).split('').map(function(ch) { return ch + ch; }).join('');
    if (/^#[0-9a-f]{6}$/i.test(s))
        return s.toLowerCase();
    return safeFallback;
};

var ensureStyles = function(styleId) {
    if (typeof document === 'undefined')
        return;

    var id = styleId || 'gb-native-swatch-styles';
    if (document.getElementById(id))
        return;

    var style = document.createElement('style');
    style.id = id;
    style.textContent = [
        '.gb-color-native,',
        '.gb-title-color-native,',
        '.gb-textfmt-color-native {',
        '    display: inline-block !important;',
        '    width: 24px !important;',
        '    min-width: 24px !important;',
        '    max-width: 24px !important;',
        '    height: 24px !important;',
        '    min-height: 24px !important;',
        '    max-height: 24px !important;',
        '    margin-left: 0 !important;',
        '    vertical-align: middle !important;',
        '    padding: 0 !important;',
        '    border: 1px solid #c3c7cd !important;',
        '    border-radius: 3px !important;',
        '    background: transparent !important;',
        '    cursor: pointer !important;',
        '    -webkit-appearance: none !important;',
        '    appearance: none !important;',
        '}',
        '.gb-color-native::-webkit-color-swatch-wrapper,',
        '.gb-title-color-native::-webkit-color-swatch-wrapper,',
        '.gb-textfmt-color-native::-webkit-color-swatch-wrapper {',
        '    padding: 0 !important;',
        '}',
        '.gb-color-native::-webkit-color-swatch,',
        '.gb-title-color-native::-webkit-color-swatch,',
        '.gb-textfmt-color-native::-webkit-color-swatch {',
        '    border: none !important;',
        '    border-radius: 2px !important;',
        '}',
        '.gb-color-native:disabled,',
        '.gb-title-color-native:disabled,',
        '.gb-textfmt-color-native:disabled {',
        '    opacity: 0.55 !important;',
        '    cursor: default !important;',
        '}'
    ].join('\n');

    (document.head || document.documentElement).appendChild(style);
};

var readOption = function(host, ui, name, fallback) {
    if (ui && ui[name])
        return viewBase.readControlValue(ui[name], fallback);

    try {
        if (host && host.model && typeof host.model.get === 'function') {
            var value = host.model.get(name);
            if (value !== undefined && value !== null && value !== '')
                return value;
        }
    } catch (e) {}

    return fallback;
};

var writeOption = function(host, ui, name, value) {
    if (ui && ui[name] && typeof ui[name].setValue === 'function') {
        viewBase.setControlValue(ui[name], value);
        return true;
    }

    try {
        if (host && host.model && typeof host.model.set === 'function') {
            host.model.set(name, value);
            return true;
        }
    } catch (e) {}

    return false;
};

var resolveNamedHex = function(colorName, fallback) {
    var name = String(colorName || '').trim().toLowerCase();
    return normalizeHex(NAMED_HEX[name] || fallback || '#000000', fallback || '#000000');
};

var defaultChoiceSelectedHex = function(host, ui, entry) {
    var fallback = entry.fallback || '#000000';
    var customToken = entry.customToken || 'custom';
    var baseValue = String(readOption(host, ui, entry.colorOption, customToken));
    if (baseValue.toLowerCase() === String(customToken).toLowerCase())
        return normalizeHex(readOption(host, ui, entry.customOption, fallback), fallback);
    return resolveNamedHex(baseValue, fallback);
};

var defaultPick = function(host, ui, entry, hex) {
    if (entry.option)
        return writeOption(host, ui, entry.option, hex);

    if (entry.customOption)
        writeOption(host, ui, entry.customOption, hex);

    if (entry.colorOption)
        writeOption(host, ui, entry.colorOption, entry.customToken || 'custom');

    return true;
};

var bindNode = function(host, ui, entry, node) {
    if (!node || node.__gbNativeBound)
        return;

    node.addEventListener('input', function() {
        var hex = normalizeHex(node.value, entry.fallback || '#000000');
        if (typeof entry.onPick === 'function')
            entry.onPick(hex, { host: host, ui: ui, readOption: readOption, writeOption: writeOption, normalizeHex: normalizeHex, resolveNamedHex: resolveNamedHex });
        else
            defaultPick(host, ui, entry, hex);
    });

    node.addEventListener('change', function() {
        var hex = normalizeHex(node.value, entry.fallback || '#000000');
        if (typeof entry.onPick === 'function')
            entry.onPick(hex, { host: host, ui: ui, readOption: readOption, writeOption: writeOption, normalizeHex: normalizeHex, resolveNamedHex: resolveNamedHex });
        else
            defaultPick(host, ui, entry, hex);
    });

    node.__gbNativeBound = true;
};

var syncEntry = function(host, ui, entry) {
    if (typeof document === 'undefined' || !entry || !entry.selector)
        return;

    var nodes = Array.prototype.slice.call(document.querySelectorAll(entry.selector));
    if (nodes.length === 0)
        return;

    var ctx = {
        host: host,
        ui: ui,
        readOption: function(name, fallback) {
            return readOption(host, ui, name, fallback);
        },
        writeOption: function(name, value) {
            return writeOption(host, ui, name, value);
        },
        normalizeHex: normalizeHex,
        resolveNamedHex: resolveNamedHex
    };

    nodes.forEach(function(node) {
        bindNode(host, ui, entry, node);

        var enabled = true;
        if (typeof entry.enabled === 'function')
            enabled = !!entry.enabled(ctx);
        else if (typeof entry.enabled === 'boolean')
            enabled = entry.enabled;

        node.disabled = !enabled;

        var hex = entry.fallback || '#000000';
        if (typeof entry.selectedHex === 'function')
            hex = entry.selectedHex(ctx);
        else if (entry.colorOption && entry.customOption)
            hex = defaultChoiceSelectedHex(host, ui, entry);
        else if (entry.option)
            hex = readOption(host, ui, entry.option, entry.fallback || '#000000');

        var normalized = normalizeHex(hex, entry.fallback || '#000000');
        if (node.value !== normalized)
            node.value = normalized;
    });
};

module.exports = {
    install: function(host, ui, config) {
        var opts = config || {};
        ensureStyles(opts.styleId);

        var pollerKey = opts.pollerKey || '_gbNativeSwatchPoller';
        var applyState = function() {
            (opts.entries || []).forEach(function(entry) {
                syncEntry(host, ui, entry);
            });
        };

        applyState();

        if (host && host[pollerKey])
            clearInterval(host[pollerKey]);
        if (host)
            host[pollerKey] = setInterval(applyState, opts.pollMs || 750);
    },

    teardown: function(host, pollerKey) {
        if (!host || !pollerKey || !host[pollerKey])
            return;
        clearInterval(host[pollerKey]);
        host[pollerKey] = null;
    },

    makeChoiceEntry: function(selector, colorOption, customOption, options) {
        var base = { selector: selector, colorOption: colorOption, customOption: customOption };
        var extra = options || {};
        for (var k in extra) {
            if (extra.hasOwnProperty(k)) base[k] = extra[k];
        }
        return base;
    },

    makeDirectEntry: function(selector, option, options) {
        var base = { selector: selector, option: option };
        var extra = options || {};
        for (var k in extra) {
            if (extra.hasOwnProperty(k)) base[k] = extra[k];
        }
        return base;
    },

    makeStandardTextEntries: function() {
        return [
            this.makeChoiceEntry('.gb-title-color-native', 'titleColor', 'titleColorCustom'),
            this.makeChoiceEntry('.gb-subtitle-color-native', 'subtitleColor', 'subtitleColorCustom'),
            this.makeChoiceEntry('.gb-xaxislabel-color-native', 'xAxisLabelColor', 'xAxisLabelColorCustom'),
            this.makeChoiceEntry('.gb-xaxistick-color-native', 'xAxisTickColor', 'xAxisTickColorCustom'),
            this.makeChoiceEntry('.gb-yaxislabel-color-native', 'yAxisLabelColor', 'yAxisLabelColorCustom'),
            this.makeChoiceEntry('.gb-yaxistick-color-native', 'yAxisTickColor', 'yAxisTickColorCustom'),
            this.makeChoiceEntry('.gb-valuelabel-color-native', 'valueLabelColor', 'valueLabelColorCustom', {
                enabled: function(ctx) {
                    return !!ctx.readOption('showValueLabels', false) || !!ctx.readOption('showPercentLabels', false);
                }
            }),
            this.makeChoiceEntry('.gb-legendtitle-color-native', 'legendTitleColor', 'legendTitleColorCustom'),
            this.makeChoiceEntry('.gb-legendtext-color-native', 'legendTextColor', 'legendTextColorCustom')
        ];
    },

    standardBackingOptions: function() {
        return [
            'titleColorCustom',
            'subtitleColorCustom',
            'xAxisLabelColorCustom',
            'xAxisTickColorCustom',
            'yAxisLabelColorCustom',
            'yAxisTickColorCustom',
            'valueLabelColorCustom',
            'legendTitleColorCustom',
            'legendTextColorCustom',
            'colorThemeCustomHex',
            'gridLineColorCustom',
            'axisLineColorCustom',
            'bgColorCustom',
            'refLineColorCustom'
        ];
    },

    hideBackingControls: function(ui, optionNames) {
        viewBase.toggleContainers(viewBase.collectControlContainers(ui, optionNames), false);
    }
};
