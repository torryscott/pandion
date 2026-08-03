'use strict';

var viewBase; try { viewBase = require('./gbViewBase'); } catch (e) { viewBase = {}; }

var STYLE_ID = 'gb-text-flyout-style';

var hasJQuery = function() {
    return typeof $ !== 'undefined';
};

var ensureStyles = function() {
    if (typeof document === 'undefined')
        return;
    if (document.getElementById(STYLE_ID))
        return;

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
        '',
        '        .gb-text-flyout-anchor {',
        '            position: relative;',
        '        }',
        '        .gb-text-flyout-anchor.has-inline-trigger {',
        '            padding-right: 34px !important;',
        '        }',
        '        .gb-text-flyout-trigger {',
        '            display: inline-flex;',
        '            align-items: center;',
        '            justify-content: center;',
        '            min-width: 24px;',
        '            height: 24px;',
        '            padding: 0 7px;',
        '            margin-left: 6px;',
        '            border: 1px solid #b9bec5;',
        '            border-radius: 999px;',
        '            background: #ffffff;',
        '            color: #376095;',
        '            font-size: 11px;',
        '            font-weight: 700;',
        '            line-height: 1;',
        '            cursor: pointer;',
        '            vertical-align: middle;',
        '            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);',
        '        }',
        '        .gb-text-flyout-trigger.is-inline-field {',
        '            position: absolute;',
        '            top: 50%;',
        '            right: 4px;',
        '            margin-left: 0;',
        '            transform: translateY(-50%);',
        '            z-index: 4;',
        '        }',
        '        .gb-text-flyout-trigger:hover {',
        '            background: #eef3fb;',
        '            border-color: #7e97bb;',
        '        }',
        '        .gb-text-flyout-trigger.is-open {',
        '            background: #376095;',
        '            border-color: #2c4f81;',
        '            color: #ffffff;',
        '        }',
        '        .gb-text-flyout-trigger:disabled {',
        '            opacity: 0.45;',
        '            cursor: default;',
        '            box-shadow: none;',
        '        }',
        '        .gb-text-flyout-panel {',
        '            position: fixed;',
        '            top: 0;',
        '            left: 0;',
        '            display: none;',
        '            width: 440px;',
        '            max-width: calc(100vw - 24px);',
        '            max-height: calc(100vh - 24px);',
        '            overflow: auto;',
        '            padding: 10px;',
        '            border: 1px solid #b9bec5;',
        '            border-radius: 8px;',
        '            background: #f4f5f7;',
        '            box-shadow: 0 12px 28px rgba(0, 0, 0, 0.24);',
        '            z-index: 2147483647;',
        '        }',
        '        .gb-text-flyout-panel.is-open {',
        '            display: block;',
        '        }',
        '        .gb-text-flyout-head {',
        '            display: flex;',
        '            align-items: center;',
        '            justify-content: space-between;',
        '            gap: 12px;',
        '            margin-bottom: 10px;',
        '        }',
        '        .gb-text-flyout-title {',
        '            font-size: 13px;',
        '            font-weight: 700;',
        '            color: #2f3135;',
        '        }',
        '        .gb-text-flyout-close {',
        '            width: 24px;',
        '            height: 24px;',
        '            border: 1px solid #b9bec5;',
        '            border-radius: 4px;',
        '            background: #ffffff;',
        '            color: #2f3135;',
        '            cursor: pointer;',
        '            font-size: 14px;',
        '            line-height: 1;',
        '        }',
        '        .gb-text-flyout-body {',
        '            display: flex;',
        '            flex-direction: column;',
        '            gap: 10px;',
        '        }',
        '        .gb-text-flyout-section {',
        '            border: 1px solid #d4d7dc;',
        '            border-radius: 6px;',
        '            background: #ffffff;',
        '            padding: 8px;',
        '        }',
        '        .gb-text-flyout-section-title {',
        '            margin-bottom: 8px;',
        '            font-size: 11px;',
        '            font-weight: 700;',
        '            letter-spacing: 0.03em;',
        '            text-transform: uppercase;',
        '            color: #5b6470;',
        '        }',
        '        .gb-text-flyout-section-body {',
        '            display: flex;',
        '            flex-wrap: wrap;',
        '            gap: 8px 10px;',
        '            align-items: flex-start;',
        '        }',
        '        .gb-text-flyout-section-body > .layout-cell,',
        '        .gb-text-flyout-section-body > .silky-option,',
        '        .gb-text-flyout-section-body > .silky-control-margin {',
        '            flex: 1 1 150px;',
        '            min-width: 140px;',
        '            max-width: 100%;',
        '            margin: 0 !important;',
        '            padding: 0 !important;',
        '        }',
        '        .gb-text-flyout-placeholder {',
        '            display: none !important;',
        '        }',
        '    '
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);
};

var getContainerForSelector = function(selector) {
    if (!hasJQuery() || !selector)
        return null;
    var $match = $(selector).first();
    if ($match.length === 0)
        return null;
    var $container = $match.closest('.layout-cell, .silky-option, .silky-control-margin');
    return $container.length > 0 ? $container : null;
};

var uniqueContainers = function(items) {
    var seen = {};
    var out = [];

    (items || []).forEach(function($item) {
        if (!$item || $item.length === 0)
            return;
        var node = $item[0];
        if (!node)
            return;
        var nodeId = node._gbUniqueId;
        if (!nodeId) {
            nodeId = '_gbUid_' + (++uniqueContainers._uidCounter);
            node._gbUniqueId = nodeId;
        }
        if (seen.hasOwnProperty(nodeId))
            return;
        seen[nodeId] = true;
        out.push($item);
    });

    return out;
};
uniqueContainers._uidCounter = 0;

var resolveAnchor = function(ui, group) {
    if (group.anchorControl) {
        var $anchor = viewBase.getControlContainer(ui, group.anchorControl);
        if ($anchor && $anchor.length > 0)
            return $anchor;
    }
    if (group.anchorSelector) {
        var $anchor = getContainerForSelector(group.anchorSelector);
        if ($anchor && $anchor.length > 0)
            return $anchor;
    }
    return null;
};

var resolveTriggerHost = function(ui, group) {
    if (group.anchorControl && ui && ui[group.anchorControl] && ui[group.anchorControl].$el) {
        var $root = ui[group.anchorControl].$el;
        var $host = $root.closest('.silky-option-input, .silky-control-margin');
        if ($host.length > 0)
            return { $host: $host, inlineField: true };

        $host = viewBase.getControlContainer(ui, group.anchorControl);
        if ($host && $host.length > 0)
            return { $host: $host, inlineField: false };
    }

    var $fallback = resolveAnchor(ui, group);
    if ($fallback && $fallback.length > 0)
        return { $host: $fallback, inlineField: false };

    return null;
};

var resolveTriggerElement = function(ui, group) {
    if (!hasJQuery())
        return null;

    if (group.triggerSelector) {
        var $trigger = $(group.triggerSelector).first();
        if ($trigger.length > 0)
            return $trigger;
    }

    var triggerMeta = resolveTriggerHost(ui, group);
    if (triggerMeta && triggerMeta.$host && triggerMeta.$host.length > 0)
        return triggerMeta.$host.children('.gb-text-flyout-trigger[data-gb-text-flyout="' + group.id + '"]').first();

    return null;
};

var resolveMoveTargets = function(ui, group) {
    if (group && typeof group.resolveTargets === 'function') {
        var resolved = group.resolveTargets(ui);
        if (Array.isArray(resolved))
            return uniqueContainers(resolved);
    }

    var items = [];

    (group.controls || []).forEach(function(name) {
        var $container = viewBase.getControlContainer(ui, name);
        if ($container && $container.length > 0)
            items.push($container);
    });

    (group.extraSelectors || []).forEach(function(selector) {
        var $container = getContainerForSelector(selector);
        if ($container && $container.length > 0)
            items.push($container);
    });

    return uniqueContainers(items);
};

var resolveSectionDefinitions = function(ui, group) {
    if (Array.isArray(group.sections) && group.sections.length > 0) {
        return group.sections.map(function(section) {
            var items = [];

            if (typeof section.resolveTargets === 'function') {
                var resolved = section.resolveTargets(ui);
                if (Array.isArray(resolved))
                    items = uniqueContainers(resolved);
            } else {
                var sectionGroup = {};
                var _k;
                for (_k in group) { if (group.hasOwnProperty(_k)) sectionGroup[_k] = group[_k]; }
                sectionGroup.controls = section.controls || [];
                sectionGroup.extraSelectors = section.extraSelectors || [];
                items = resolveMoveTargets(ui, sectionGroup);
            }

            return {
                title: section.title || '',
                items: items
            };
        }).filter(function(section) { return section.items.length > 0; });
    }

    return [{
        title: group.sectionTitle || 'Style',
        items: resolveMoveTargets(ui, group)
    }].filter(function(section) { return section.items.length > 0; });
};

var resolveAllGroupTargets = function(ui, group) {
    if (Array.isArray(group.sections) && group.sections.length > 0) {
        var sections = resolveSectionDefinitions(ui, group);
        return uniqueContainers(sections.reduce(function(acc, section) { return acc.concat(section.items); }, []));
    }

    return resolveMoveTargets(ui, group);
};

var hideGroupTargets = function(ui, group) {
    resolveAllGroupTargets(ui, group).forEach(function($item) {
        $item.hide();
    });
};

var showGroupTargets = function(ui, group) {
    resolveAllGroupTargets(ui, group).forEach(function($item) {
        $item.show();
    });
};

var ensurePanel = function(host) {
    ensureStyles();
    if (!hasJQuery())
        return null;

    if (host._gbTextFlyoutPanel && host._gbTextFlyoutPanel.length > 0)
        return host._gbTextFlyoutPanel;

    var $panel = $(
        '<div class="gb-text-flyout-panel" aria-hidden="true">' +
            '<div class="gb-text-flyout-head">' +
                '<div class="gb-text-flyout-title">Text Formatting</div>' +
                '<button type="button" class="gb-text-flyout-close" title="Close">×</button>' +
            '</div>' +
            '<div class="gb-text-flyout-body"></div>' +
        '</div>'
    );

    $('body').append($panel);
    $panel.find('.gb-text-flyout-close').on('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        module.exports.closeFlyout(host);
    });

    host._gbTextFlyoutPanel = $panel;
    host._gbTextFlyoutBody = $panel.find('.gb-text-flyout-body');
    host._gbTextFlyoutTitle = $panel.find('.gb-text-flyout-title');
    return $panel;
};

var positionPanel = function(host) {
    var state = host._gbTextFlyoutState;
    var $panel = host._gbTextFlyoutPanel;
    if (!state || !$panel || $panel.length === 0 || !state.$trigger || state.$trigger.length === 0)
        return;

    var rect = state.$trigger[0].getBoundingClientRect();
    var panelWidth = Math.min(440, Math.max(280, window.innerWidth - 24));
    var panelHeight = $panel.outerHeight() || 280;
    var left = rect.left;
    var top = rect.bottom + 8;

    if (left + panelWidth > window.innerWidth - 12)
        left = Math.max(12, window.innerWidth - panelWidth - 12);

    if (top + panelHeight > window.innerHeight - 12)
        top = Math.max(12, rect.top - panelHeight - 8);

    $panel.css({
        left: Math.round(left) + 'px',
        top: Math.round(top) + 'px',
        width: panelWidth + 'px'
    });
};

module.exports = {
    setupFlyouts: function(host, ui, groups, options) {
        if (!host || !ui || !hasJQuery())
            return false;

        ensurePanel(host);
        var opts = options || {};
        host._gbTextFlyoutGroups = groups || [];

        var self = this;
        var refresh = function() {
            (host._gbTextFlyoutGroups || []).forEach(function(group) {
                var triggerMeta = resolveTriggerHost(ui, group);
                var $host = triggerMeta && triggerMeta.$host ? triggerMeta.$host : null;
                if ($host && $host.length > 0) {
                    $host.addClass('gb-text-flyout-anchor');
                    if (triggerMeta.inlineField)
                        $host.addClass('has-inline-trigger');
                }

                var $trigger = group.triggerSelector ? $(group.triggerSelector).first() : (($host && $host.length > 0) ? $host.children('.gb-text-flyout-trigger[data-gb-text-flyout="' + group.id + '"]') : $());
                if ($trigger.length === 0) {
                    if (!$host || $host.length === 0)
                        return;
                    $trigger = $('<button type="button" class="gb-text-flyout-trigger" title="Open text formatting">Aa</button>');
                    $trigger.attr('data-gb-text-flyout', group.id);
                    if (triggerMeta.inlineField)
                        $trigger.addClass('is-inline-field');
                    $host.append($trigger);
                }

                if (!$trigger.data('gbTextFlyoutBound')) {
                    $trigger.on('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();

                        if ($trigger.prop('disabled'))
                            return;

                        if (host._gbTextFlyoutState && host._gbTextFlyoutState.group && host._gbTextFlyoutState.group.id === group.id) {
                            self.closeFlyout(host);
                            return;
                        }

                        self.openFlyout(host, ui, group, $trigger);
                    });
                    $trigger.data('gbTextFlyoutBound', true);
                }

                var enabled = typeof group.enabled === 'function' ? !!group.enabled(ui) : true;
                $trigger.prop('disabled', !enabled);
                $trigger.attr('title', (group.title || group.label || 'Text formatting') + (enabled ? '' : ' (unavailable right now)'));

                var isOpen = !!(host._gbTextFlyoutState && host._gbTextFlyoutState.group && host._gbTextFlyoutState.group.id === group.id);
                if (!isOpen)
                    hideGroupTargets(ui, group);
            });

            if (host._gbTextFlyoutState) {
                positionPanel(host);
                var state = host._gbTextFlyoutState;
                var enabled = typeof state.group.enabled === 'function' ? !!state.group.enabled(ui) : true;
                if (!enabled || !state.$trigger || state.$trigger.length === 0 || !state.$trigger.is(':visible'))
                    self.closeFlyout(host);
            }
        };

        var requestRefresh = function() {
            viewBase.requestUpdate(host, '_gbTextFlyoutRefreshQueued', refresh, 16);
        };

        if (!host._gbTextFlyoutEventsWired) {
            var watchNames = {};
            (host._gbTextFlyoutGroups || []).forEach(function(group) {
                (group.watchControls || []).forEach(function(name) { watchNames[name] = true; });
                if (group.anchorControl)
                    watchNames[group.anchorControl] = true;
            });

            Object.keys(watchNames).forEach(function(name) {
                if (ui[name])
                    viewBase.bindControlEvents(ui[name], requestRefresh);
            });

            host._gbTextFlyoutDocHandler = function(event) {
                var state = host._gbTextFlyoutState;
                if (!state)
                    return;
                var $target = $(event.target);
                if ($target.closest('.gb-text-flyout-panel').length > 0)
                    return;
                if ($target.closest('.gb-text-flyout-trigger').length > 0)
                    return;
                self.closeFlyout(host);
            };

            host._gbTextFlyoutResizeHandler = function() { positionPanel(host); };
            host._gbTextFlyoutScrollHandler = function() { self.closeFlyout(host); };

            document.addEventListener('mousedown', host._gbTextFlyoutDocHandler, true);
            window.addEventListener('resize', host._gbTextFlyoutResizeHandler, true);
            window.addEventListener('scroll', host._gbTextFlyoutScrollHandler, true);
            host._gbTextFlyoutEventsWired = true;
        }

        refresh();
        setTimeout(requestRefresh, 150);
        setTimeout(requestRefresh, 450);

        if (host._gbTextFlyoutPoller)
            clearInterval(host._gbTextFlyoutPoller);
        host._gbTextFlyoutPoller = setInterval(requestRefresh, opts.pollMs || 2000);

        return true;
    },

    openFlyout: function(host, ui, group, $trigger) {
        if (!host || !ui || !group || !$trigger || $trigger.length === 0)
            return false;

        this.closeFlyout(host);

        var $panel = ensurePanel(host);
        var $body = host._gbTextFlyoutBody;
        var $title = host._gbTextFlyoutTitle;
        var sections = resolveSectionDefinitions(ui, group);
        var targets = sections.reduce(function(acc, section) { return acc.concat(section.items); }, []);

        if (!$panel || !$body || targets.length === 0)
            return false;

        var moved = [];
        sections.forEach(function(section, sectionIndex) {
            var $section = $('<div class="gb-text-flyout-section"></div>');
            if (section.title) {
                var $heading = $('<div class="gb-text-flyout-section-title"></div>');
                $heading.text(section.title);
                $section.append($heading);
            }

            var $sectionBody = $('<div class="gb-text-flyout-section-body"></div>');
            $section.append($sectionBody);
            $body.append($section);

            section.items.forEach(function($item, itemIndex) {
                var $placeholder = $('<div class="gb-text-flyout-placeholder" data-gb-text-flyout-placeholder="' + group.id + '-' + sectionIndex + '-' + itemIndex + '"></div>');
                var $parent = $item.parent();
                var originalStyle = $item.attr('style');
                $item.before($placeholder);
                $item.show();
                $sectionBody.append($item);
                moved.push({
                    $item: $item,
                    $placeholder: $placeholder,
                    $parent: $parent,
                    originalStyle: originalStyle
                });
            });
        });

        $title.text(group.title || group.label || 'Text Formatting');
        $trigger.addClass('is-open');

        host._gbTextFlyoutState = {
            group: group,
            moved: moved,
            $trigger: $trigger
        };

        $panel.addClass('is-open').attr('aria-hidden', 'false');
        positionPanel(host);
        return true;
    },

    closeFlyout: function(host) {
        if (!host || !host._gbTextFlyoutState)
            return false;

        var state = host._gbTextFlyoutState;
        (state.moved || []).forEach(function(entry) {
            if (!entry || !entry.$item || entry.$item.length === 0 || !entry.$placeholder || entry.$placeholder.length === 0)
                return;

            entry.$placeholder.before(entry.$item);
            entry.$placeholder.remove();

            if (entry.originalStyle === undefined)
                entry.$item.removeAttr('style');
            else
                entry.$item.attr('style', entry.originalStyle);

            entry.$item.hide();
        });

        if (state.$trigger && state.$trigger.length > 0)
            state.$trigger.removeClass('is-open');

        if (host._gbTextFlyoutPanel && host._gbTextFlyoutPanel.length > 0)
            host._gbTextFlyoutPanel.removeClass('is-open').attr('aria-hidden', 'true');

        if (host._gbTextFlyoutBody && host._gbTextFlyoutBody.length > 0)
            host._gbTextFlyoutBody.empty();

        host._gbTextFlyoutState = null;
        return true;
    },

    teardown: function(host) {
        if (!host)
            return;

        this.closeFlyout(host);

        if (host._gbTextFlyoutDocHandler)
            document.removeEventListener('mousedown', host._gbTextFlyoutDocHandler, true);
        if (host._gbTextFlyoutResizeHandler)
            window.removeEventListener('resize', host._gbTextFlyoutResizeHandler, true);
        if (host._gbTextFlyoutScrollHandler)
            window.removeEventListener('scroll', host._gbTextFlyoutScrollHandler, true);

        if (host._gbTextFlyoutPanel && host._gbTextFlyoutPanel.length > 0)
            host._gbTextFlyoutPanel.remove();

        host._gbTextFlyoutPanel = null;
        host._gbTextFlyoutBody = null;
        host._gbTextFlyoutTitle = null;
        host._gbTextFlyoutState = null;
        host._gbTextFlyoutGroups = null;
        host._gbTextFlyoutDocHandler = null;
        host._gbTextFlyoutResizeHandler = null;
        host._gbTextFlyoutScrollHandler = null;
        host._gbTextFlyoutEventsWired = false;
        viewBase.clearHandles(host, ['_gbTextFlyoutPoller']);
    }
};
