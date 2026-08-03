'use strict';

var hasJQuery = function() {
    return typeof $ !== 'undefined';
};

var asJQuery = function(value) {
    if (!hasJQuery() || !value)
        return null;
    if (value.jquery)
        return value;
    return $(value);
};

module.exports = {
    installPreloadHide: function(styleId) {
        if (typeof document === 'undefined')
            return;

        var id = styleId || 'gb-preload';
        if (document.getElementById(id))
            return;

        var style = document.createElement('style');
        style.id = id;
        style.textContent = 'body{opacity:0}';
        (document.head || document.documentElement).appendChild(style);
    },

    revealBody: function() {
        if (typeof document === 'undefined' || !document.body)
            return;

        var preloadStyles = Array.prototype.slice.call(document.querySelectorAll('style[id*="preload"]'));
        preloadStyles.forEach(function(style) {
            if (style && style.textContent && style.textContent.indexOf('body{opacity:0}') !== -1 && style.parentNode)
                style.parentNode.removeChild(style);
        });

        document.body.style.transition = 'opacity 0.15s ease';
        document.body.style.opacity = '1';
        setTimeout(function() {
            document.body.style.transition = '';
            document.body.style.opacity = '';
        }, 200);
    },

    debug: function(host, message) {
        if (host && host._enableDebugLogs)
            console.log(message);
    },

    runSetups: function(host, ui, setups, options) {
        var opts = options || {};
        var delay = opts.delay || 0;
        var self = this;

        setTimeout(function() {
            (setups || []).forEach(function(entry) {
                var name = entry.name || 'anonymousSetup';
                var fn = entry.fn || entry;
                try {
                    fn.call(host, ui);
                } catch (err) {
                    console.error('[pandion] setup failed:', name, err);
                }
            });

            if (opts.reveal !== false)
                self.revealBody();
        }, delay);
    },

    readControlValue: function(control, fallback) {
        if (!control || typeof control.value !== 'function')
            return fallback;
        try {
            var value = control.value();
            return (value === null || value === undefined || value === '') ? fallback : value;
        } catch (e) {
            return fallback;
        }
    },

    setControlValue: function(control, value) {
        if (!control || typeof control.setValue !== 'function')
            return;
        try {
            control.setValue(value);
        } catch (e) {
            // ignore unavailable controls
        }
    },

    bindControlEvents: function(control, handler) {
        if (!control || typeof control.on !== 'function' || typeof handler !== 'function')
            return;
        try { control.on('change', handler); } catch (e) {}
        try { control.on('input', handler); } catch (e) {}
    },

    requestUpdate: function(host, key, fn, delay) {
        if (!host || typeof fn !== 'function')
            return;
        if (host[key])
            return;

        host[key] = setTimeout(function() {
            host[key] = null;
            fn();
        }, delay || 16);
    },

    toggleContainer: function(container, shouldShow) {
        var $container = asJQuery(container);
        if (!$container || $container.length === 0)
            return;

        if (shouldShow)
            $container.show();
        else
            $container.hide();

        var $parentCell = $container.parent('.layout-cell');
        if ($parentCell.length > 0) {
            if (shouldShow)
                $parentCell.show();
            else
                $parentCell.hide();
        }
    },

    toggleContainers: function(containers, shouldShow) {
        var self = this;
        (containers || []).forEach(function(container) { self.toggleContainer(container, shouldShow); });
    },

    getControlContainer: function(ui, controlName) {
        if (!hasJQuery() || !ui || !ui[controlName] || !ui[controlName].$el)
            return null;

        var $root = ui[controlName].$el;
        var $container = $root.closest('.silky-option, .layout-cell, .silky-control-margin, .silky-options-group');
        if ($container.length === 0)
            $container = $root.parent();
        return $container;
    },

    getRowContainer: function(ui, controlName) {
        if (!hasJQuery() || !ui || !ui[controlName] || !ui[controlName].$el)
            return null;

        var $root = ui[controlName].$el;
        var $row = $root.closest('.layout-box, .layout-cell, .silky-option');
        if ($row.length === 0)
            $row = $root.parent();
        return $row;
    },

    collectControlContainers: function(ui, controlNames) {
        var self = this;
        var seen = [];
        (controlNames || []).forEach(function(name) {
            var $container = self.getControlContainer(ui, name);
            if ($container && $container.length > 0)
                seen.push($container);
        });
        return seen;
    },

    findCollapseBox: function(labelText) {
        if (!hasJQuery())
            return null;

        var target = String(labelText || '').trim().toLowerCase();
        if (!target)
            return null;

        var found = null;
        $('button, .silky-options-group-title, .header').each(function() {
            var text = ($(this).text() || '').trim().toLowerCase();
            if (text === target) {
                found = $(this).closest('.silky-options-group, .layout-box, .layout-cell');
                return false;
            }
        });

        return found;
    },

    findLabelSection: function(labelText) {
        if (!hasJQuery())
            return null;

        var target = String(labelText || '').trim().toLowerCase();
        if (!target)
            return null;

        var found = null;
        $('.silky-label, label, button').each(function() {
            var text = ($(this).text() || '').trim().toLowerCase();
            if (text === target) {
                found = $(this).closest('.layout-box, .layout-cell, .silky-option');
                return false;
            }
        });

        return found;
    },

    clearHandles: function(host, keys) {
        (keys || []).forEach(function(key) {
            if (!host || !host[key])
                return;
            clearInterval(host[key]);
            clearTimeout(host[key]);
            host[key] = null;
        });
    }
};
