import { readFileSync } from 'node:fs';

const html = readFileSync('standalone/index.html', 'utf8');
const shell = readFileSync('standalone/js/ps-shell.js', 'utf8');
let failures = 0;

function check(condition, message) {
    if (condition) console.log('  ok  ' + message);
    else {
        failures++;
        console.error('  FAIL ' + message);
    }
}

check(
    /<body>\s*<nav class="ps-bypass" aria-label="Bypass application chrome">/.test(html),
    'bypass navigation is the first application content',
);
check(
    /id="ps-skip-workspace" href="#ps-main-workspace"/.test(html) &&
    /id="ps-skip-settings" href="#ps-settings-panel"/.test(html),
    'bypass links point to stable workspace and settings targets',
);
check(
    /id="ps-settings-panel" role="region"[\s\S]*?aria-labelledby="ps-inspector-title" tabindex="-1"/.test(html) &&
    /id="ps-main-workspace" tabindex="-1"/.test(html),
    'both bypass destinations are programmatically focusable',
);
check(
    /\.ps-bypass a:focus\s*\{[^}]*transform:\s*none/s.test(html),
    'bypass links become visible on focus',
);
check(
    /function wireBypassLinks\(\)/.test(shell) &&
    /window\.innerWidth <= 760\) narrowSet\("inspector"\)/.test(shell) &&
    /wireNarrowChrome\(\);\s*wireBypassLinks\(\);/.test(shell),
    'settings bypass opens the responsive inspector before focusing it',
);
check(
    /Skip to the active workspace", "First Tab stop"/.test(shell) &&
    /Skip to the settings panel", "Second Tab stop"/.test(shell),
    'the Keyboard shortcuts sheet documents both bypass routes',
);
check(
    /id="ps-datagrid"[^>]*role="grid" aria-label="Project data grid" aria-multiselectable="true"[\s\S]*?aria-describedby="ps-grid-instructions"/.test(html),
    'the focusable data-grid owner has the composite grid role and instructions',
);
check(
    /id="ps-grid-instructions"[\s\S]*?arrow keys[\s\S]*?Enter or F2[\s\S]*?Shift[\s\S]*?F1/.test(html),
    'grid instructions cover navigation, editing, selection, and further help',
);
check(
    /id="ps-grid-editor-instructions"[\s\S]*?Enter to save and move down[\s\S]*?Tab to save and move across[\s\S]*?Escape to cancel/.test(html) &&
    /id="ps-grid-edit-status"[\s\S]*?role="status" aria-live="polite" aria-atomic="true"/.test(html),
    'cell editors have persistent keyboard instructions and a polite edit-status channel',
);
check(
    /grid\.setAttribute\("aria-rowcount", String\(n \+ 1\)\)/.test(shell) &&
    /grid\.setAttribute\("aria-colcount", String\(visibleCols\.length \+ 1\)\)/.test(shell) &&
    /role="presentation"/.test(shell),
    'the outer grid owns total virtual dimensions and the inner table is presentational',
);
check(
    /role="row" aria-rowindex="1"/.test(shell) &&
    /role="columnheader" aria-colindex="1"/.test(shell) &&
    /role="rowheader" aria-rowindex="/.test(shell) &&
    /role="gridcell" aria-rowindex="/.test(shell) &&
    /aria-colindex="/.test(shell),
    'generated headers, rows, and cells expose 1-based virtual coordinates',
);
check(
    /grid\.setAttribute\("aria-activedescendant", activeCell\.id\)/.test(shell) &&
    /grid\.addEventListener\("focus"[\s\S]*?gridSetSelection\(cols\[0\], 0, cols\[0\], 0\)/.test(shell) &&
    /td\.setAttribute\("aria-labelledby",[\s\S]*?gridColumnHeaderId\(visibleCol\)[\s\S]*?gridRowHeaderId\(row\)[\s\S]*?valueId/.test(shell) &&
    /td\.setAttribute\("aria-describedby", stateId\)/.test(shell),
    'grid entry and movement track an active cell named from its column, row, value, and state',
);
check(
    /input\.setAttribute\("aria-label", "Edit " \+ gridEditTarget\(col, row\)[\s\S]*?Current value:/.test(shell) &&
    /input\.setAttribute\("aria-describedby", "ps-grid-editor-instructions"\)/.test(shell),
    'the in-cell editor names its variable, row, and current value and references its instructions',
);
check(
    // A commit whose text nothing could read is not a save, and the status
    // has to say which of the two happened before it says what comes next.
    /gridAnnounceEdit\(\(voided[\s\S]*?is missing\.[\s\S]*?"Saved "[\s\S]*?gridNextEditAnnouncement\(next\)\)/.test(shell) &&
    /gridAnnounceEdit\("Edit canceled\./.test(shell),
    'save, unread, advance, and cancel paths publish explicit edit status',
);
check(
    /x\.setAttribute\("aria-label", removeLabel\)/.test(shell) &&
    /removeLabel = "Remove " \+ col \+ " from " \+ presentation\.label/.test(shell),
    'role-chip remove buttons name the variable and its displayed role',
);
check(
    // The ACCESSIBLE close button: labelled with the active document's
    // name, outside the tablist (its content model allows only tabs).
    // The per-tab X's added Jul 29 2026 are mouse-only mirrors -
    // aria-hidden, tabIndex -1 - so this button remains the one the
    // keyboard and screen readers meet; hidden-vars-check case 5 and
    // tab-accessibility-check pin the live behavior.
    /x\.setAttribute\("aria-label", "Close document " \+ currentDocument\.name\)/.test(shell) &&
    /tx\.setAttribute\("aria-hidden", "true"\)/.test(shell),
    'document close buttons have specific accessible names',
);
check(
    /id="ps-tabs" role="group" aria-label="Documents and actions"/.test(html) &&
    /id="psroot" class="graphbuilder2-host" role="tabpanel"/.test(html) &&
    /id="ps-layout" role="tabpanel"/.test(html),
    'document navigation declares its grouped tab/action strip and chart/layout tab panels',
);
check(
    /tablist\.setAttribute\("role", "tablist"\)/.test(shell) &&
    /tablist\.setAttribute\("aria-label",/.test(shell) &&
    /select\.setAttribute\("role", "tab"\)/.test(shell) &&
    /select\.setAttribute\("aria-controls", panelId\)/.test(shell) &&
    /select\.setAttribute\("aria-selected"/.test(shell) &&
    /select\.tabIndex = c\.id === PROJECT\.activeChart \? 0 : -1/.test(shell) &&
    /\.ps-tab-select\[aria-selected="true"\]/.test(html),
    'document tabs expose selected state, panel ownership, and roving focus',
);
check(
    /e\.key === "ArrowLeft" \|\| e\.key === "ArrowRight"/.test(shell) &&
    /e\.key === "Home"/.test(shell) &&
    /e\.key === "End"/.test(shell) &&
    /e\.key === "F2"/.test(shell) &&
    /TAB_PENDING_FOCUS_ID = nextId/.test(shell),
    'document tabs support Arrow, Home, End, and F2 keyboard operation with focus retention',
);
check(
    /function splitMetrics\(key\)/.test(shell) &&
    /bar\.setAttribute\("aria-valuemin", String\(m\.min\)\)/.test(shell) &&
    /bar\.setAttribute\("aria-valuemax", String\(m\.max\)\)/.test(shell) &&
    /bar\.setAttribute\("aria-valuenow", String\(m\.now\)\)/.test(shell) &&
    /window\.addEventListener\("resize", splitApply\)/.test(shell),
    'pane splitters expose viewport-aware minimum, maximum, and current widths',
);
check(
    /aria-orientation="vertical" aria-valuemin="72" aria-valuemax="600"/.test(shell) &&
    /handle\.setAttribute\("aria-valuenow", String\(width\)\)/.test(shell) &&
    /gridSyncColumnResizers\(\)/.test(shell),
    'Data column separators expose and synchronize their pixel-width ranges',
);
check(
    /id="ps-loader" role="dialog" aria-modal="true"[\s\S]*?aria-labelledby="ps-loader-title" aria-describedby="ps-loader-description"/.test(html) &&
    /function shellDialogTabbables\(root\)/.test(shell) &&
    /node\.tabIndex < 0/.test(shell) &&
    /node\.getClientRects\(\)\.length > 0/.test(shell) &&
    /shellTrapTab\(this, e\)/.test(shell),
    'all modal implementations share a rendered, enabled, nonnegative tab-stop filter',
);
check(
    /page\.setAttribute\("inert", ""\)/.test(shell) &&
    /page\.removeAttribute\("inert"\)/.test(shell) &&
    /function shellRefreshPageModal\(\)/.test(shell),
    'modal open and close paths consistently isolate and release the application background',
);
check(
    /id="ps-command-search"[\s\S]*?role="combobox" aria-autocomplete="list"[\s\S]*?aria-controls="ps-command-results" aria-expanded="false"/.test(html) &&
    /id="ps-command-close"[\s\S]*?aria-label="Close command palette"/.test(html) &&
    /b\.setAttribute\("role", "option"\)/.test(shell) &&
    /search\.setAttribute\("aria-activedescendant", current\.id\)/.test(shell) &&
    /setCommandPaletteCurrent\(COMMAND_PALETTE_INDEX \+ direction, direction\)/.test(shell),
    'the command palette exposes a combobox/listbox active option and an explicit exit',
);
check(
    /id="ps-layout-instructions"[\s\S]*?Up and Down Arrow[\s\S]*?Alt with an arrow moves[\s\S]*?Control plus Alt[\s\S]*?F2 edits selected text[\s\S]*?F1/.test(html) &&
    /id="ps-layout-live"[\s\S]*?role="status" aria-live="polite" aria-atomic="true"/.test(html) &&
    /id="ps-lviewport" tabindex="0" role="listbox"[\s\S]*?aria-multiselectable="true"[\s\S]*?aria-describedby="ps-layout-instructions"/.test(html),
    'the Layout composite publishes its selection/edit instructions and live status channel',
);
check(
    /id="ps-layout-options"/.test(html) &&
    /option\.setAttribute\("role", "option"\)/.test(shell) &&
    /option\.setAttribute\("aria-selected"/.test(shell) &&
    /option\.setAttribute\("aria-label", layItemAccessibleLabel\(items\[oi\]\)\)/.test(shell) &&
    /option\.setAttribute\("aria-posinset"/.test(shell) &&
    /option\.setAttribute\("aria-setsize"/.test(shell) &&
    /viewport\.setAttribute\("aria-activedescendant"/.test(shell),
    'layout items expose names, selected state, order, and active-descendant ownership',
);
check(
    /function layNavigateItem\(delta, edge, extend\)/.test(shell) &&
    /function layResizeSelectedFree\(dw, dh\)/.test(shell) &&
    /function layResizeSelectedProportionally\(delta\)/.test(shell) &&
    /function layOpenKeyboardContext\(\)/.test(shell) &&
    /canvasFocused && e\.key === "F2"/.test(shell) &&
    /canvasFocused && e\.key === "Enter"/.test(shell) &&
    /e\.key === "F10" && e\.shiftKey/.test(shell) &&
    /e\.key === "PageUp" \|\| e\.key === "PageDown"/.test(shell),
    'Layout exposes keyboard selection, move/resize, exact fields, text edit, layering, and command-menu routes',
);
check(
    /href="mailto:contact@pandionplots\.com"/.test(html),
    'the standalone About dialog publishes the product barrier contact',
);

if (failures) {
    console.error(`\nSTANDALONE ACCESSIBILITY SOURCE CONTRACT: ${failures} FAILURE(S)`);
    process.exit(1);
}
console.log('\nSTANDALONE ACCESSIBILITY SOURCE CONTRACT: PASS');
