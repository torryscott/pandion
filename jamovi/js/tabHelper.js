'use strict';

module.exports = {

    _sortGroupsByDomOrder: function($groups) {
        if (!$groups || $groups.length <= 1)
            return $groups;

        var nodes = $groups.get().slice().sort(function(a, b) {
            if (a === b)
                return 0;
            if (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING)
                return 1;
            return -1;
        });

        return $(nodes);
    },

    _resolveGroupFromElement: function($element) {
        if (!$element || $element.length === 0)
            return $();

        var selectors = [
            '.silky-target-layoutbox',
            '.silky-target-layout-box',
            '.target-layout-box',
            '.silky-options-group',
            '.layout-cell',
            '.layout-box'
        ];

        for (var i = 0; i < selectors.length; i++) {
            var $group = $element.closest(selectors[i]);
            if ($group.length > 0)
                return $group.first();
        }

        return $element.first();
    },

    _resolveExplicitGroupFromControl: function($element) {
        if (!$element || $element.length === 0)
            return $();

        var $cell = $element.closest('.layout-cell');
        if ($cell.length > 0) {
            var $row = $cell.parent();
            if ($row && $row.length > 0)
                return $row.first();
        }

        return this._resolveGroupFromElement($element);
    },

    ensureTabStyles: function() {
        if (typeof $ === 'undefined')
            return;

        if ($('#gb-tab-system-styles').length > 0)
            return;

        var styles = [
            '<style id="gb-tab-system-styles">',
            '  .gb-tab-bar {',
            '    display: flex;',
            '    width: 100%;',
            '    border-bottom: 2px solid #ddd;',
            '    margin: 8px 0 8px 0;',
            '    position: sticky;',
            '    top: 0;',
            '    background: white;',
            '    z-index: 5;',
            '  }',
            '  .gb-tab-bar + * {',
            '    margin-top: 0 !important;',
            '  }',
            '  .gb-tab {',
            '    padding: 6px 14px;',
            '    font-size: 12px;',
            '    font-weight: 600;',
            '    color: #666;',
            '    cursor: pointer;',
            '    border-bottom: 2px solid transparent;',
            '    margin-bottom: -2px;',
            '    transition: color 0.15s, border-color 0.15s;',
            '    user-select: none;',
            '  }',
            '  .gb-tab:hover { color: #376095; }',
            '  .gb-tab.active {',
            '    color: #376095;',
            '    border-bottom-color: #376095;',
            '  }',
            '  .gb-tab-empty {',
            '    display: none !important;',
            '  }',
            '  .gb-tab-hidden {',
            '    display: none !important;',
            '  }',
            '</style>'
        ].join('');

        $('head').append(styles);
    },

    initTabSystem: function(context, options) {
        if (typeof $ === 'undefined')
            return false;

        var opts = options || {};
        var tabs = Array.isArray(opts.tabs) ? opts.tabs : [];
        if (tabs.length === 0)
            return false;

        var debug = (typeof opts.debug === 'function') ? opts.debug : function() {};
        if (opts.injectStyles !== false)
            this.ensureTabStyles();

        var sectionToTab = {};
        var allSectionNames = [];
        tabs.forEach(function(tab) {
            var sections = Array.isArray(tab.sections) ? tab.sections : [];
            sections.forEach(function(s) {
                sectionToTab[s] = tab.id;
                allSectionNames.push(s);
            });
        });

        var $taggedGroups = $();
        var self = this;
        $('button, .silky-options-group-header, .silky-collapse-header, .collapse-box-header, .options-group-header').each(function() {
            // jQuery's text() already returns decoded text, so no HTML entity
            // unescaping is needed here.
            var rawText = ($(this).text() || '').trim();
            var matchedSection = allSectionNames.indexOf(rawText) !== -1 ? rawText : null;

            if (!matchedSection) {
                var stripped = rawText.replace(/^[^a-zA-Z(]+/, '');
                if (allSectionNames.indexOf(stripped) !== -1)
                    matchedSection = stripped;
            }

            if (matchedSection) {
                var $group = self._resolveGroupFromElement($(this));
                $group.attr('data-gb-tab', sectionToTab[matchedSection]);
                $taggedGroups = $taggedGroups.add($group);
            }
        });

        var explicitGroups = Array.isArray(opts.explicitGroups) ? opts.explicitGroups : [];
        explicitGroups.forEach(function(groupSpec) {
            if (!groupSpec || !groupSpec.tabId || !Array.isArray(groupSpec.controls))
                return;

            groupSpec.controls.forEach(function(controlName) {
                if (!opts.ui || !opts.ui[controlName] || !opts.ui[controlName].$el)
                    return;

                var $group = self._resolveExplicitGroupFromControl(opts.ui[controlName].$el);
                if ($group.length === 0)
                    return;

                $group.attr('data-gb-tab', groupSpec.tabId);
                $taggedGroups = $taggedGroups.add($group);
            });
        });

        if ($taggedGroups.length === 0) {
            debug('Tab system: no sections found, skipping');
            return false;
        }

        $taggedGroups = this._sortGroupsByDomOrder($taggedGroups);

        var tabsWithContent = {};
        $taggedGroups.each(function() {
            var tabId = $(this).attr('data-gb-tab');
            if (tabId)
                tabsWithContent[tabId] = true;
        });

        var $tabBar = $('<div class="gb-tab-bar"></div>');
        tabs.forEach(function(tab, index) {
            var $tab = $('<div class="gb-tab" data-tab="' + tab.id + '">' + tab.label + '</div>');
            if (index === 0)
                $tab.addClass('active');

            var hasSections = Array.isArray(tab.sections) && tab.sections.length > 0;
            var hasContent = !!tabsWithContent[tab.id];
            var shouldHideForNoContent = hasSections ? !hasContent : (tab.id !== 'all' && tab.id !== 'setup');
            if (opts.hideEmptyTabs !== false && shouldHideForNoContent)
                $tab.addClass('gb-tab-empty');

            $tabBar.append($tab);
        });

        var $anchorGroup = $();
        if (opts.insertBeforeControl && opts.ui && opts.ui[opts.insertBeforeControl] && opts.ui[opts.insertBeforeControl].$el)
            $anchorGroup = this._resolveExplicitGroupFromControl(opts.ui[opts.insertBeforeControl].$el);

        if (!$anchorGroup || $anchorGroup.length === 0)
            $anchorGroup = $taggedGroups.first();

        $tabBar.insertBefore($anchorGroup);

        var parent = $tabBar.parent()[0];
        if (parent) {
            parent.style.setProperty('flex-wrap', 'wrap', 'important');
            parent.style.setProperty('align-items', 'flex-start', 'important');
            parent.style.setProperty('align-content', 'flex-start', 'important');
            parent.style.setProperty('gap', '0', 'important');
            parent.style.setProperty('margin', '0', 'important');
            parent.style.setProperty('padding', '0', 'important');
        }

        var first = $taggedGroups.first()[0];
        if (first) {
            if (opts.firstSectionMarginTop !== undefined && opts.firstSectionMarginTop !== null)
                first.style.setProperty('margin-top', String(opts.firstSectionMarginTop), 'important');
            if (opts.firstSectionMarginBottom !== undefined && opts.firstSectionMarginBottom !== null)
                first.style.setProperty('margin-bottom', String(opts.firstSectionMarginBottom), 'important');
        }

        function setGroupHidden($group, hidden) {
            if (hidden)
                $group.addClass('gb-tab-hidden');
            else
                $group.removeClass('gb-tab-hidden');

            var parentEl = $group.parent()[0];
            if (parentEl && parentEl !== parent && parentEl.className && parentEl.className.indexOf('layout-cell') !== -1) {
                if (hidden)
                    $(parentEl).addClass('gb-tab-hidden');
                else
                    $(parentEl).removeClass('gb-tab-hidden');
            }
        }

        function updateFirstSection() {
            $taggedGroups.each(function() {
                var parentEl = $(this).parent()[0];
                if (parentEl && parentEl !== parent && parentEl.className && parentEl.className.indexOf('layout-cell') !== -1)
                    parentEl.style.removeProperty('margin-top');
            });
        }

        function activateTab(tabId) {
            $tabBar.find('.gb-tab').removeClass('active');
            $tabBar.find('.gb-tab[data-tab="' + tabId + '"]').addClass('active');

            if (tabId === 'all') {
                $taggedGroups.each(function() {
                    setGroupHidden($(this), false);
                });
            } else {
                $taggedGroups.each(function() {
                    setGroupHidden($(this), $(this).attr('data-gb-tab') !== tabId);
                });
            }
            updateFirstSection();
        }

        context._tabBar = $tabBar;
        context._tabIds = tabs.map(function(t) { return t.id; });
        context._simpleTabIds = Array.isArray(opts.simpleTabIds) ? opts.simpleTabIds.slice() : null;
        context._activateTab = activateTab;

        $tabBar.find('.gb-tab').on('click', function() {
            activateTab($(this).data('tab'));
        });

        var defaultTab = opts.initialTabId || (tabs[0] && tabs[0].id) || null;
        if (defaultTab)
            activateTab(defaultTab);

        return true;
    },

    updateTabVisibilityByComplexity: function(context, uiComplexity) {
        if (!context || !context._tabBar || !context._activateTab)
            return;

        var isSimple = (uiComplexity === 'simple');
        var allowed = (isSimple && Array.isArray(context._simpleTabIds) && context._simpleTabIds.length > 0)
            ? context._simpleTabIds
            : context._tabIds;

        var currentActive = context._tabBar.find('.gb-tab.active').data('tab');

        context._tabBar.find('.gb-tab').each(function() {
            var $tab = $(this);
            var tabId = $tab.data('tab');
            var empty = $tab.hasClass('gb-tab-empty');
            var shouldShow = !empty && allowed.indexOf(tabId) !== -1;
            if (shouldShow)
                $tab.show();
            else
                $tab.hide();
        });

        if (allowed.indexOf(currentActive) === -1) {
            var fallback = null;
            context._tabBar.find('.gb-tab:visible').each(function() {
                fallback = $(this).data('tab');
                return false;
            });
            if (fallback)
                context._activateTab(fallback);
        }
    }
};
