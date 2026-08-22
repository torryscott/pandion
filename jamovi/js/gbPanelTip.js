'use strict';

// Shared left-panel data-tip styler (Jul 2026, suite-wide per Torry).
//
// Every chart module's options panel holds only its variable boxes plus
// ONE data-tip Label; the guidance boxes were tried and removed (an
// empty panel says "look right" on its own - the chart is the editor).
// jamovi's Label control has no styling knobs, so each module's
// jamovi/js/<name>.js calls style() from view_updated to render its tip
// muted italic.
//
// The tip is found by a zero-width marker at the START of the label
// string in the .u.yaml, NOT by comparing against a copy of the text
// (Aug 2026 audit). Each module used to keep its own TIP_TEXT constant
// that had to match the label character for character, maintained by
// hand and enforced by nothing: edit the label and the styling silently
// fell off, and the label could never be translated. The marker moves
// with the string it marks, so neither can happen. u.yaml is now the
// only place the wording lives.
//
// Failure posture is unchanged: everything is guarded, and on any DOM
// surprise the tip simply renders plain, never a broken panel.

// U+200B, zero width. Prefixed to the tip label in every chart module's
// .u.yaml; invisible on screen and to screen readers, and String.trim()
// leaves it in place (it is not Unicode White_Space).
const MARKER = '\u200B';
const STYLE_ID = 'gb-paneltip-style';
const CSS = '.gb-paneltip { color: #666 !important; font-style: italic; }';

module.exports = {

    // Accepts (and ignores) a legacy text argument so an events file
    // that has not been updated still works.
    style: function() {
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
                        (el.textContent || '').trim().charAt(0) === MARKER)
                    el.classList.add('gb-paneltip');
            }
        }
        catch (e) {
            console.error('[pandion] panel tip styling failed:', e);
        }
    }
};
