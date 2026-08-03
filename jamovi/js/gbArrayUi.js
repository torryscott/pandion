'use strict';

var colorSwatchHelper; try { colorSwatchHelper = require('./colorSwatchHelper'); } catch (e) { colorSwatchHelper = {}; }
var viewBase; try { viewBase = require('./gbViewBase'); } catch (e) { viewBase = {}; }

var STYLE_ID = 'gb-array-ui-style';

var ensureStyles = function() {
    if (typeof document === 'undefined')
        return;
    if (document.getElementById(STYLE_ID))
        return;

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
        '.gb-hidden-hex-input {',
        '    position: absolute !important;',
        '    width: 1px !important;',
        '    min-width: 1px !important;',
        '    max-width: 1px !important;',
        '    height: 1px !important;',
        '    margin: 0 !important;',
        '    padding: 0 !important;',
        '    border: 0 !important;',
        '    opacity: 0 !important;',
        '    pointer-events: none !important;',
        '}',
        '.gb-inline-color-swatch {',
        '    width: 24px;',
        '    height: 24px;',
        '    padding: 0;',
        '    margin-left: 4px;',
        '    border: 1px solid #c3c7cd;',
        '    border-radius: 3px;',
        '    background: transparent;',
        '    vertical-align: middle;',
        '}',
        '.gb-inline-color-swatch:disabled {',
        '    opacity: 0.45;',
        '    cursor: not-allowed;',
        '}'
    ].join('\n');

    (document.head || document.documentElement).appendChild(style);
};

var normalizeHex = function(value, fallback) {
    var v = String(value || '').trim();
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

var findTextInput = function($root) {
    if (!$root || $root.length === 0)
        return null;

    if ($root.is('input[type="text"], input:not([type])'))
        return $root.first();

    var $input = $root.find('input[type="text"], input:not([type])').first();
    return $input.length > 0 ? $input : null;
};

var COLOR_VALUES = {
    'black': true, 'white': true, 'gray': true, 'grey': true, 'red': true,
    'orange': true, 'green': true, 'blue': true, 'teal': true, 'purple': true,
    'custom': true, 'customhex': true
};

var isColorSelect = function(select) {
    if (!select || !select.options || select.options.length === 0)
        return false;

    var values = Array.prototype.map.call(select.options, function(option) {
        return String(option.value || option.text || '').trim().toLowerCase();
    });

    return values.some(function(value) { return COLOR_VALUES.hasOwnProperty(value); });
};

var resolveSelectedColor = function(select, hexInput) {
    var namedHex = {
        black: '#000000',
        white: '#ffffff',
        gray: '#808080',
        grey: '#808080',
        red: '#cb181d',
        orange: '#f16913',
        green: '#238b45',
        blue: '#08519c',
        teal: '#4eb3d3',
        purple: '#6a51a3'
    };

    var selected = '';
    if (select) {
        selected = String(select.value || '').trim().toLowerCase();
        if (!selected && select.selectedIndex >= 0)
            selected = String(select.options[select.selectedIndex].text || '').trim().toLowerCase();
    }

    if (selected === 'custom' || selected === 'customhex')
        return normalizeHex(hexInput && hexInput.value, '#000000');

    return namedHex[selected] || '#000000';
};

var attachStandaloneSwatch = function(ui, spec) {
    if (!ui || !spec || !spec.controlName)
        return null;

    var control = ui[spec.controlName];
    if (!control || !control.$el || typeof $ === 'undefined')
        return null;

    var $input = findTextInput(control.$el);
    if (!$input || $input.length === 0)
        return null;

    var swatchClass = 'gb-inline-' + spec.controlName.toLowerCase();
    var $swatch = control.$el.find('.' + swatchClass).first();
    if ($swatch.length === 0) {
        $swatch = $('<input type="color" class="gb-inline-color-swatch" />');
        $swatch.addClass(swatchClass);
        $input.after($swatch);
    }

    var sync = function() {
        var currentHex = normalizeHex(viewBase.readControlValue(control, spec.fallback || '#000000'), spec.fallback || '#000000');
        if ($swatch.val() !== currentHex)
            $swatch.val(currentHex);
        $swatch.prop('disabled', !!$input.prop('disabled'));
    };

    if (spec.hideTextInput !== false)
        $input.addClass('gb-hidden-hex-input');

    $swatch.off('input.gbswatch.' + spec.controlName + ' change.gbswatch.' + spec.controlName);
    $swatch.on('input.gbswatch.' + spec.controlName + ' change.gbswatch.' + spec.controlName, function() {
        viewBase.setControlValue(control, normalizeHex($swatch.val(), spec.fallback || '#000000'));
        sync();
    });

    return { sync: sync };
};

module.exports = {
    installGenericCustomSwatches: function(host, ui) {
        colorSwatchHelper.installGenericColorCustomSwatches(host, ui);
    },

    teardownGenericCustomSwatches: function(host) {
        colorSwatchHelper.teardownGenericColorCustomSwatches(host);
    },

    installStandaloneColorSwatches: function(host, ui, specs, pollerKey) {
        ensureStyles();
        var key = pollerKey || '_gbStandaloneSwatchPoller';
        var entryKey = key + 'Entries';
        if (host && !host[entryKey])
            host[entryKey] = {};

        var refreshEntries = function() {
            (specs || []).forEach(function(spec) {
                if (!spec || !spec.controlName)
                    return;
                if (host && host[entryKey] && host[entryKey][spec.controlName])
                    return;

                var entry = attachStandaloneSwatch(ui, spec);
                if (entry && host && host[entryKey])
                    host[entryKey][spec.controlName] = entry;
            });
        };

        var applyState = function() {
            refreshEntries();
            var entryObj = (host && host[entryKey]) ? host[entryKey] : {};
            var entries = [];
            for (var ek in entryObj) { if (entryObj.hasOwnProperty(ek)) entries.push(entryObj[ek]); }
            entries.forEach(function(entry) { entry.sync(); });
        };

        applyState();

        if (host && host[key])
            clearInterval(host[key]);
        if (host)
            host[key] = setInterval(applyState, 2000);
    },

    installArrayHexSwatches: function(host, ui, config) {
        ensureStyles();
        if (!ui || !config || !config.controlName || typeof $ === 'undefined')
            return;

        var control = ui[config.controlName];
        if (!control || !control.$el || !control.$el[0])
            return;

        var selector = config.inputSelector || 'input[type="text"], input:not([type])';
        var swatchClass = config.swatchClass || 'gb-array-swatch';

        var sync = function() {
            control.$el.find(selector).each(function() {
                var $input = $(this);
                if ($input.closest('.silky-array, .silky-list-box').length === 0)
                    return;

                var $swatch = $input.siblings('input.' + swatchClass).first();
                if ($swatch.length === 0) {
                    $swatch = $('<input type="color" class="gb-inline-color-swatch ' + swatchClass + '" />');
                    $input.after($swatch);
                }

                if (config.hideTextInputs)
                    $input.addClass('gb-hidden-hex-input');
                else
                    $input.removeClass('gb-hidden-hex-input');

                var hex = normalizeHex($input.val(), '#000000');
                if ($swatch.val() !== hex)
                    $swatch.val(hex);

                $swatch.off('input.' + swatchClass + ' change.' + swatchClass);
                $swatch.on('input.' + swatchClass + ' change.' + swatchClass, function() {
                    $input.val($swatch.val()).trigger('input').trigger('change');
                });
            });
        };

        sync();

        var pollerKey = config.pollerKey || '_gbArraySwatchPoller';
        if (host && host[pollerKey])
            clearInterval(host[pollerKey]);
        if (host)
            host[pollerKey] = setInterval(sync, config.pollMs || 2000);

        var observerKey = config.observerKey || '_gbArraySwatchObserver';
        if (host && host[observerKey]) {
            try { host[observerKey].disconnect(); } catch (e) {}
        }
        if (host) {
            host[observerKey] = new MutationObserver(sync);
            host[observerKey].observe(control.$el[0], { childList: true, subtree: true });
        }
    },

    installArrayColorSelectSwatches: function(host, ui, config) {
        ensureStyles();
        if (!ui || !config || !config.controlName || typeof document === 'undefined' || typeof $ === 'undefined')
            return;

        var control = ui[config.controlName];
        if (!control || !control.$el || !control.$el[0])
            return;

        var swatchClass = config.swatchClass || 'gb-array-color-pair-swatch';
        var pollerKey = config.pollerKey || '_gbArrayColorPairSwatchPoller';
        var observerKey = config.observerKey || '_gbArrayColorPairSwatchObserver';
        var enabled = typeof config.enabled === 'function' ? config.enabled : (function() { return true; });

        var createWiredSwatch = function(select, hexInput) {
            if (!select || !hexInput)
                return null;

            var swatch = hexInput.nextElementSibling;
            if (!(swatch instanceof HTMLInputElement) || !swatch.classList.contains(swatchClass)) {
                swatch = document.createElement('input');
                swatch.type = 'color';
                swatch.className = 'gb-inline-color-swatch ' + swatchClass;
                hexInput.insertAdjacentElement('afterend', swatch);
            }

            hexInput.classList.add('gb-hidden-hex-input');
            swatch.value = resolveSelectedColor(select, hexInput);
            swatch.disabled = !enabled();

            if (!swatch._gbArrayColorPairWired) {
                swatch.addEventListener('mousedown', function(e) { e.stopPropagation(); }, false);
                swatch.addEventListener('click', function(e) {
                    e.stopPropagation();
                    if (typeof swatch.showPicker === 'function') {
                        try { swatch.showPicker(); } catch (err) {}
                    }
                }, false);
                swatch.addEventListener('input', function() {
                    var hex = normalizeHex(swatch.value, '#000000');
                    hexInput.value = hex;
                    hexInput.dispatchEvent(new Event('input', { bubbles: true }));
                    hexInput.dispatchEvent(new Event('change', { bubbles: true }));

                    for (var i = 0; i < select.options.length; i++) {
                        var optionValue = String(select.options[i].value || select.options[i].text || '').trim().toLowerCase();
                        if (optionValue === 'custom' || optionValue === 'customhex') {
                            if (select.selectedIndex !== i) {
                                select.selectedIndex = i;
                                select.dispatchEvent(new Event('input', { bubbles: true }));
                                select.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                            break;
                        }
                    }
                }, false);
                select.addEventListener('change', function() {
                    swatch.value = resolveSelectedColor(select, hexInput);
                    swatch.disabled = !enabled();
                }, false);
                swatch._gbArrayColorPairWired = true;
            }

            return swatch;
        };

        var applySwatches = function() {
            var container = control.$el[0];
            var allSelects = Array.prototype.slice.call(container.querySelectorAll('select'));
            var allInputs = Array.prototype.slice.call(container.querySelectorAll('input'));
            var colorSelects = allSelects.filter(isColorSelect);

            colorSelects.forEach(function(select) {
                var hexInput = null;
                for (var ii = 0; ii < allInputs.length; ii++) {
                    var input = allInputs[ii];
                    if (input.type === 'color')
                        continue;
                    if (input.classList.contains(swatchClass))
                        continue;
                    if (!(select.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING))
                        continue;
                    hexInput = input;
                    break;
                }

                if (!hexInput)
                    return;

                createWiredSwatch(select, hexInput);
            });

            container.querySelectorAll('input.' + swatchClass).forEach(function(swatch) {
                var hexInput = swatch.previousElementSibling;
                if (!hexInput || hexInput.tagName !== 'INPUT')
                    return;

                var allSelectsRev = Array.prototype.slice.call(container.querySelectorAll('select')).reverse();
                var colorSelect = null;
                for (var jj = 0; jj < allSelectsRev.length; jj++) {
                    var sel = allSelectsRev[jj];
                    if (!(swatch.compareDocumentPosition(sel) & Node.DOCUMENT_POSITION_PRECEDING))
                        continue;
                    if (isColorSelect(sel)) {
                        colorSelect = sel;
                        break;
                    }
                }
                if (!colorSelect)
                    return;

                swatch.value = resolveSelectedColor(colorSelect, hexInput);
                swatch.disabled = !enabled();
            });
        };

        applySwatches();

        if (host && host[pollerKey])
            clearInterval(host[pollerKey]);
        if (host)
            host[pollerKey] = setInterval(applySwatches, config.pollMs || 2000);

        if (host && host[observerKey]) {
            try { host[observerKey].disconnect(); } catch (e) {}
        }
        if (host) {
            host[observerKey] = new MutationObserver(applySwatches);
            host[observerKey].observe(control.$el[0], { childList: true, subtree: true });
        }
    },

    teardownArrayHexSwatches: function(host, config) {
        if (!host || !config)
            return;

        var pollerKey = config.pollerKey || '_gbArraySwatchPoller';
        var observerKey = config.observerKey || '_gbArraySwatchObserver';

        if (host[pollerKey]) {
            clearInterval(host[pollerKey]);
            host[pollerKey] = null;
        }

        if (host[observerKey]) {
            try { host[observerKey].disconnect(); } catch (e) {}
            host[observerKey] = null;
        }
    }
};
