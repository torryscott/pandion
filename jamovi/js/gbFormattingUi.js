'use strict';

var viewBase; try { viewBase = require('./gbViewBase'); } catch (e) { viewBase = {}; }

var STYLE_ID = 'gb-formatting-ui-style';

var setImportant = function($els, prop, val) {
    if (!$els || $els.length === 0)
        return;
    $els.each(function() {
        this.style.setProperty(prop, val, 'important');
    });
};

var slugify = function(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
};

var compactControlRow = function(ui, controlName) {
    var $cell = viewBase.getControlContainer(ui, controlName);
    var $row = viewBase.getRowContainer(ui, controlName);

    if ($row && $row.length > 0) {
        $row.addClass('gb-formatting-row');
        setImportant($row, 'margin-top', '0px');
        setImportant($row, 'margin-bottom', '0px');
        setImportant($row, 'padding-top', '0px');
        setImportant($row, 'padding-bottom', '0px');
        setImportant($row.children('.layout-cell'), 'margin-top', '0px');
        setImportant($row.children('.layout-cell'), 'margin-bottom', '0px');
        setImportant($row.children('.layout-cell'), 'padding-top', '0px');
        setImportant($row.children('.layout-cell'), 'padding-bottom', '0px');
    }

    if ($cell && $cell.length > 0) {
        $cell.addClass('gb-formatting-cell');
        setImportant($cell, 'margin-top', '0px');
        setImportant($cell, 'margin-bottom', '0px');
        setImportant($cell, 'padding-top', '0px');
        setImportant($cell, 'padding-bottom', '0px');

        var $inputs = $cell.find('input[type="text"], input[type="number"]');
        var $selects = $cell.find('select');
        var $containers = $cell.find('.silky-option-input, .silky-control-margin, [class*="silky-control-margin"]');

        setImportant($inputs, 'height', '26px');
        setImportant($inputs, 'min-height', '26px');
        setImportant($inputs, 'line-height', '24px');
        setImportant($selects, 'height', '26px');
        setImportant($selects, 'min-height', '26px');
        setImportant($selects, 'line-height', '24px');
        setImportant($containers, 'margin-top', '0px');
        setImportant($containers, 'margin-bottom', '0px');
        setImportant($containers, 'padding-top', '0px');
        setImportant($containers, 'padding-bottom', '0px');
        setImportant($containers, 'min-height', '26px');
    }
};

var findSectionHeader = function(sectionName) {
    var $section = viewBase.findCollapseBox(sectionName);
    if ($section && $section.length > 0) {
        var $header = $section.is('button, .silky-options-group-title, .header')
            ? $section
            : $section.find('button, .silky-options-group-title, .header').first();
        if ($header && $header.length > 0)
            return $header;
    }

    var target = String(sectionName || '').trim().toLowerCase();
    if (!target || typeof $ === 'undefined')
        return null;

    var found = null;
    $('button, .silky-options-group-title, .header').each(function() {
        var text = ($(this).text() || '').trim().toLowerCase();
        if (text === target || text.indexOf(target) !== -1) {
            found = $(this);
            return false;
        }
    });

    return found;
};

var ensureStyles = function() {
    if (typeof document === 'undefined')
        return;
    if (document.getElementById(STYLE_ID))
        return;

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
        '.gb-formatting-badge {',
        '    display: inline-flex;',
        '    align-items: center;',
        '    gap: 6px;',
        '    padding: 2px 8px;',
        '    margin: 2px 0 6px 0;',
        '    border-radius: 999px;',
        '    background: #eef3fb;',
        '    color: #376095;',
        '    font-size: 11px;',
        '    font-weight: 600;',
        '}',
        '.gb-formatting-badge::before {',
        '    content: "T";',
        '    display: inline-flex;',
        '    align-items: center;',
        '    justify-content: center;',
        '    width: 16px;',
        '    height: 16px;',
        '    border-radius: 50%;',
        '    background: #376095;',
        '    color: #fff;',
        '    font-size: 10px;',
        '    font-weight: 700;',
        '}',
        '.gb-formatting-host {',
        '    position: relative;',
        '}',
        '.gb-formatting-host.compact {',
        '    opacity: 0.92;',
        '}',
        '.gb-formatting-section-badge {',
        '    display: inline-flex;',
        '    align-items: center;',
        '    gap: 5px;',
        '    margin-left: 8px;',
        '    padding: 2px 8px;',
        '    border-radius: 999px;',
        '    background: #eef3fb;',
        '    color: #376095;',
        '    font-size: 10px;',
        '    font-weight: 700;',
        '    letter-spacing: 0.02em;',
        '    pointer-events: none;',
        '    vertical-align: middle;',
        '}',
        '.gb-formatting-section-badge::before {',
        '    content: "T";',
        '    display: inline-flex;',
        '    align-items: center;',
        '    justify-content: center;',
        '    width: 15px;',
        '    height: 15px;',
        '    border-radius: 50%;',
        '    background: #376095;',
        '    color: #fff;',
        '    font-size: 9px;',
        '    font-weight: 700;',
        '}',
        '.gb-formatting-row .layout-cell,',
        '.gb-formatting-row .silky-option,',
        '.gb-formatting-row .silky-control-margin,',
        '.gb-formatting-row .silky-option-input {',
        '    margin-top: 0 !important;',
        '    margin-bottom: 0 !important;',
        '    padding-top: 0 !important;',
        '    padding-bottom: 0 !important;',
        '}',
        '.gb-formatting-cell .gb-inline-color-swatch,',
        '.gb-formatting-cell .gb-auto-color-native {',
        '    margin-left: 6px;',
        '}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);
};

var ensureBadge = function($container, label) {
    if (!$container || $container.length === 0)
        return;

    if ($container.children('.gb-formatting-badge').length > 0)
        return;

    var $badge = $('<div class="gb-formatting-badge"></div>');
    $badge.text(label || 'Formatting');
    $container.prepend($badge);
    $container.addClass('gb-formatting-host compact');
};

var ensureSectionBadge = function(sectionName, label, detail) {
    ensureStyles();
    if (typeof $ === 'undefined')
        return false;

    var $header = findSectionHeader(sectionName);
    if (!$header || $header.length === 0)
        return false;

    var badgeId = slugify(sectionName || label || 'formatting');
    if ($header.children('.gb-formatting-section-badge[data-gb-formatting-badge="' + badgeId + '"]').length > 0)
        return true;

    var $badge = $('<span class="gb-formatting-section-badge"></span>');
    $badge.attr('data-gb-formatting-badge', badgeId);
    $badge.text(label || 'Text');
    if (detail)
        $badge.attr('title', detail);

    $header.append($badge);
    return true;
};

module.exports = {
    injectStyles: function() {
        ensureStyles();
    },

    enhanceFormattingBox: function(control, name) {
        ensureStyles();
        if (!control || !control.$el || typeof $ === 'undefined')
            return false;

        var $container = control.$el.closest('.silky-option, .layout-box, .layout-cell, .silky-options-group');
        if ($container.length === 0)
            return false;

        ensureBadge($container, name || 'Formatting');
        return true;
    },

    enhanceCombinedFormattingBoxes: function(controls, sectionName) {
        ensureStyles();
        if (typeof $ === 'undefined' || !Array.isArray(controls) || controls.length === 0)
            return false;

        var enhanced = false;
        controls.forEach(function(control) {
            if (!control || !control.$el)
                return;
            var $container = control.$el.closest('.silky-option, .layout-box, .layout-cell, .silky-options-group');
            if ($container.length === 0)
                return;
            ensureBadge($container, sectionName || 'Formatting');
            enhanced = true;
        });

        return enhanced;
    },

    setupTextFormattingCompact: function(host, ui, sections) {
        ensureStyles();
        var self = this;
        (sections || []).forEach(function(section) {
            if (Array.isArray(section.controls) && section.controls.length > 1) {
                var controls = section.controls.map(function(name) { return ui && ui[name]; }).filter(Boolean);
                self.enhanceCombinedFormattingBoxes(controls, section.label);
            } else if (section.control && ui && ui[section.control]) {
                self.enhanceFormattingBox(ui[section.control], section.label);
            }
        });

        return true;
    },

    setupFamilyFormatting: function(host, ui, config) {
        ensureStyles();
        if (!host || !ui)
            return false;

        var options = config || {};
        var pollerKey = options.pollerKey || '_gbFormattingPoller';
        var queuedKey = options.queuedKey || '_gbFormattingQueuedRefresh';
        var watchControls = options.watchControls || [];
        var compactControls = options.compactControls || [];
        var sectionBadges = options.sectionBadges || [];

        var refresh = function() {
            sectionBadges.forEach(function(section) {
                if (!section)
                    return;
                ensureSectionBadge(section.section || section.name, section.label || 'Text', section.detail);
            });
            compactControls.forEach(function(controlName) { compactControlRow(ui, controlName); });
        };

        var requestRefresh = function() {
            viewBase.requestUpdate(host, queuedKey, refresh, 16);
        };

        if (!host._gbFormattingEventsWired) {
            watchControls.forEach(function(name) {
                if (ui[name])
                    viewBase.bindControlEvents(ui[name], requestRefresh);
            });
            host._gbFormattingEventsWired = true;
        }

        refresh();
        setTimeout(requestRefresh, 120);
        setTimeout(requestRefresh, 400);

        if (host[pollerKey])
            clearInterval(host[pollerKey]);
        host[pollerKey] = setInterval(requestRefresh, options.pollMs || 2000);

        return true;
    },

    setupStandardFormatting: function(host, ui, options) {
        var opts = options || {};
        var sectionBadges = [
            { section: 'Title & Subtitle', label: 'Text', detail: 'Text formatting controls' },
            { section: 'X-Axis', label: 'Text', detail: 'Axis label and tick formatting' },
            { section: 'Y-Axis', label: 'Text', detail: 'Axis label and tick formatting' },
            { section: 'Legend', label: 'Text', detail: 'Legend title and label formatting' }
        ];

        var compactControls = [
            'fontFamily',
            'baseFontSize',
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
            'xAxisTickFontSize',
            'xAxisTickColor',
            'xAxisTickColorCustom',
            'xAxisTickRotation',
            'yAxisLabelFontSize',
            'yAxisLabelColor',
            'yAxisLabelColorCustom',
            'yAxisTickFontSize',
            'yAxisTickColor',
            'yAxisTickColorCustom',
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
        ];

        var watchControls = [
            'showTitle',
            'showSubtitle',
            'showXLabel',
            'showYLabel',
            'showXTickLabels',
            'showYTickLabels',
            'showLegend',
            'showLegendTitle',
            'showLegendItems',
            'showLegendKeys'
        ];

        var mergedOpts = {};
        var k;
        for (k in opts) { if (opts.hasOwnProperty(k)) mergedOpts[k] = opts[k]; }
        mergedOpts.sectionBadges = sectionBadges.concat(opts.sectionBadges || []);
        mergedOpts.compactControls = compactControls.concat(opts.compactControls || []);
        mergedOpts.watchControls = watchControls.concat(opts.watchControls || []);
        return this.setupFamilyFormatting(host, ui, mergedOpts);
    }
};
