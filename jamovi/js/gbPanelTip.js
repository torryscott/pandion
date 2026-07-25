'use strict';

// Shared left-panel data-tip styler (Jul 2026, suite-wide per Torry).
//
// Every chart module's options panel holds only its variable boxes plus
// ONE data-tip Label; the guidance boxes were tried and removed (an
// empty panel says "look right" on its own - the chart is the editor).
// jamovi's Label control has no styling knobs, so each module's
// jamovi/js/<name>.js calls style(TIP_TEXT) from view_updated to render
// its tip muted italic.
//
// Failure posture: everything is guarded - on a text-anchor mismatch or
// any DOM surprise the tip simply renders plain, never a broken panel.

const STYLE_ID = 'gb-paneltip-style';
const CSS = '.gb-paneltip { color: #666 !important; font-style: italic; }';

module.exports = {

    style: function(tipText) {
        try {
            if (typeof document === 'undefined' || !document.body)
                return;
            if (!document.getElementById(STYLE_ID)) {
                const style = document.createElement('style');
                style.id = STYLE_ID;
                style.textContent = CSS;
                (document.head || document.documentElement).appendChild(style);
            }
            const walk = document.body.getElementsByTagName('*');
            for (let i = 0; i < walk.length; i++) {
                const el = walk[i];
                if (el.children.length === 0 &&
                        (el.textContent || '').trim() === tipText)
                    el.classList.add('gb-paneltip');
            }
        }
        catch (e) {
            console.error('[pandion] panel tip styling failed:', e);
        }
    }
};
