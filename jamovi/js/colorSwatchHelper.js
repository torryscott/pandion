'use strict';

var NAMED_COLORS = {
    black: '#000000',
    white: '#ffffff',
    red: '#d62728',
    blue: '#1f77b4',
    green: '#2ca02c',
    orange: '#ff7f0e',
    purple: '#9467bd',
    grey: '#7f7f7f',
    gray: '#7f7f7f',
    yellow: '#bcbd22',
    brown: '#8c564b',
    pink: '#e377c2',
    cyan: '#17becf',
    magenta: '#d33682',
    teal: '#1b9e77'
};

var STYLE_ID = 'gb-generic-color-swatch-style';

var normalizeHex = function(value, fallback) {
    if (typeof value !== 'string')
        return fallback;
    var v = value.trim();
    if (v === '')
        return fallback;
    if (v[0] !== '#')
        v = '#' + v;
    if (/^#[0-9a-fA-F]{6}$/.test(v))
        return v.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(v))
        return ('#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]).toLowerCase();
    return fallback;
};

var colorFromChoice = function(choice) {
    var key = String(choice || '').trim().toLowerCase();
    return NAMED_COLORS[key] || '#000000';
};

var readValue = function(ui, name, fallback) {
    var control = ui[name];
    if (!control || typeof control.value !== 'function')
        return fallback;
    try {
        var v = control.value();
        return (v === null || v === undefined || v === '') ? fallback : v;
    } catch (e) {
        return fallback;
    }
};

var writeValue = function(ui, name, value) {
    var control = ui[name];
    if (!control || typeof control.setValue !== 'function')
        return;
    try {
        control.setValue(value);
    } catch (e) {
        // ignore write failures for unavailable controls
    }
};

var detectEnabled = function(control, fallbackEnabled) {
    if (!control || !control.$el)
        return fallbackEnabled;
    var $field = control.$el.find('input,select,textarea').first();
    if ($field.length === 0)
        return fallbackEnabled;
    return !$field.prop('disabled');
};

var resolveCustomToken = function(baseValue) {
    if (String(baseValue || '').toLowerCase() === 'custom')
        return baseValue;
    return 'custom';
};

var ensureStyles = function() {
    if (document.getElementById(STYLE_ID))
        return;

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
        '',
        '        .gb-hidden-hex-input {',
        '            position: absolute !important;',
        '            width: 1px !important;',
        '            min-width: 1px !important;',
        '            max-width: 1px !important;',
        '            height: 1px !important;',
        '            margin: 0 !important;',
        '            padding: 0 !important;',
        '            border: 0 !important;',
        '            opacity: 0 !important;',
        '            pointer-events: none !important;',
        '        }',
        '        .gb-color-native,',
        '        .gb-auto-color-native {',
        '            width: 24px;',
        '            height: 24px;',
        '            padding: 0;',
        '            margin-left: 4px;',
        '            border: 1px solid #c3c7cd;',
        '            border-radius: 3px;',
        '            -webkit-appearance: none;',
        '            appearance: none;',
        '            background: transparent;',
        '            vertical-align: middle;',
        '        }',
        '        .gb-color-native::-webkit-color-swatch-wrapper,',
        '        .gb-auto-color-native::-webkit-color-swatch-wrapper {',
        '            padding: 0;',
        '        }',
        '        .gb-color-native::-webkit-color-swatch,',
        '        .gb-auto-color-native::-webkit-color-swatch {',
        '            border: 0;',
        '            border-radius: 2px;',
        '        }',
        '        .gb-color-native:disabled,',
        '        .gb-auto-color-native:disabled {',
        '            opacity: 0.45;',
        '            cursor: not-allowed;',
        '        }',
        '    '
    ].join('\n');

    (document.head || document.documentElement).appendChild(style);
};

var findTextInput = function($root) {
    if (!$root || $root.length === 0)
        return null;

    if ($root.is('input[type="text"], input:not([type])'))
        return $root.first();

    var $input = $root.find('input[type="text"], input:not([type])').first();
    return $input.length > 0 ? $input : null;
};

var attachEntry = function(ui, customName) {
    var customControl = ui[customName];
    if (!customControl || !customControl.$el)
        return null;

    var $root = customControl.$el;
    if ($root.closest('.silky-array, .silky-list-box').length > 0)
        return null;

    var $hexInput = findTextInput($root);
    if (!$hexInput || $hexInput.length === 0)
        return null;

    var swatchClass = 'gb-auto-' + customName.toLowerCase();
    var $swatch = $root.find('input.' + swatchClass).first();
    if ($swatch.length === 0) {
        $swatch = $('<input type="color" class="gb-auto-color-native" title="Pick color" />');
        $swatch.addClass(swatchClass);
        $hexInput.after($swatch);
    }

    $hexInput.addClass('gb-hidden-hex-input');

    var baseName = customName.replace(/Custom$/i, '');
    var baseControl = ui[baseName];

    var sync = function() {
        var enabled = detectEnabled(baseControl, detectEnabled(customControl, true));
        $swatch.prop('disabled', !enabled);

        var baseValue = String(readValue(ui, baseName, 'custom'));
        var currentHex = normalizeHex(String(readValue(ui, customName, '#000000')), '#000000');
        var swatchHex = (baseValue.toLowerCase() === 'custom')
            ? currentHex
            : colorFromChoice(baseValue);

        if ($swatch.val() !== swatchHex)
            $swatch.val(swatchHex);
    };

    $swatch.off('input.gbcustom.' + customName + ' change.gbcustom.' + customName);
    $swatch.on('input.gbcustom.' + customName + ' change.gbcustom.' + customName, function() {
        var picked = normalizeHex($swatch.val(), '#000000');
        writeValue(ui, customName, picked);

        if (baseControl && typeof baseControl.setValue === 'function') {
            var baseValue = readValue(ui, baseName, '');
            var customToken = resolveCustomToken(baseValue);
            if (String(baseValue || '').toLowerCase() !== 'custom')
                writeValue(ui, baseName, customToken);
        }

        sync();
    });

    return { sync: sync };
};

var installGenericColorCustomSwatches = function(host, ui) {
    ensureStyles();

    if (!host._genericColorSwatchEntries)
        host._genericColorSwatchEntries = {};

    if (host._genericColorSwatchPoller)
        clearInterval(host._genericColorSwatchPoller);

    var controlsToBind = [];
    var refreshEntries = function() {
        Object.keys(ui || {}).forEach(function(name) {
            if (!/ColorCustom$/i.test(name))
                return;
            if (host._genericColorSwatchEntries[name])
                return;

            var entry = attachEntry(ui, name);
            if (!entry)
                return;

            host._genericColorSwatchEntries[name] = entry;
            var baseName = name.replace(/Custom$/i, '');
            if (ui[name])
                controlsToBind.push(ui[name]);
            if (ui[baseName])
                controlsToBind.push(ui[baseName]);
        });
    };

    var applyState = function() {
        refreshEntries();
        Object.keys(host._genericColorSwatchEntries).forEach(function(name) {
            var entry = host._genericColorSwatchEntries[name];
            if (entry && typeof entry.sync === 'function')
                entry.sync();
        });
    };

    var queued = null;
    var requestApply = function() {
        if (queued)
            return;
        queued = setTimeout(function() {
            queued = null;
            applyState();
        }, 16);
    };

    if (!host._genericColorSwatchEventsWired) {
        controlsToBind.forEach(function(ctrl) {
            if (!ctrl || typeof ctrl.on !== 'function')
                return;
            try { ctrl.on('change', requestApply); } catch (e) {}
            try { ctrl.on('input', requestApply); } catch (e) {}
        });
        host._genericColorSwatchEventsWired = true;
    }

    applyState();
    host._genericColorSwatchPoller = setInterval(applyState, 1500);
};

var teardownGenericColorCustomSwatches = function(host) {
    if (host && host._genericColorSwatchPoller) {
        clearInterval(host._genericColorSwatchPoller);
        host._genericColorSwatchPoller = null;
    }
    if (host)
        host._genericColorSwatchEntries = null;
    if (host)
        host._genericColorSwatchEventsWired = false;
};

module.exports = {
    installGenericColorCustomSwatches: installGenericColorCustomSwatches,
    teardownGenericColorCustomSwatches: teardownGenericColorCustomSwatches
};
