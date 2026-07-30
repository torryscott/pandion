// Runtime accessibility contract for the standalone modal foundation.
//
// Covers the shared dialog loop plus the three separately implemented
// overlays (Load Data, Export, and the command palette). The test deliberately
// adds hidden and tabindex=-1 sentinels to prove they cannot enter a focus
// loop, and checks background isolation and focus return at each boundary.
import { createRequire } from 'node:module';
import path from 'node:path';

function loadPlaywright() {
    for (const base of [process.cwd(), new URL('.', import.meta.url).pathname,
                        '/private/tmp', '/tmp']) {
        try { return createRequire(path.join(base, 'x.js'))('playwright'); }
        catch { /* try the next shared dependency location */ }
    }
    console.error('playwright not found');
    process.exit(2);
}
function ok(condition, message) {
    if (!condition) throw new Error(message);
    console.log('  ok  ' + message);
}

const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
await page.goto(pageUrl);
await page.waitForTimeout(650);

const bootModal = await page.evaluate(() => {
    const root = document.getElementById('ps-welcome');
    const hiddenContinue = document.getElementById('ps-welcome-continue');
    return {
        shown: root.style.display,
        role: root.getAttribute('role'),
        modal: root.getAttribute('aria-modal'),
        pageHidden: document.querySelector('.ps-page').getAttribute('aria-hidden'),
        pageInert: document.querySelector('.ps-page').hasAttribute('inert'),
        focused: document.activeElement && document.activeElement.id,
        hiddenContinueRendered: hiddenContinue.getClientRects().length > 0,
    };
});
ok(bootModal.shown === 'flex' && bootModal.role === 'dialog' &&
   bootModal.modal === 'true',
   'the start center opens as a modal dialog');
ok(bootModal.pageHidden === 'true' && bootModal.pageInert,
   'an open modal hides and inerts the application background');
ok(bootModal.focused === 'ps-welcome-open' && !bootModal.hiddenContinueRendered,
   'initial start-center focus skips its hidden recovery action');

await page.click('#ps-welcome-sample');
await page.waitForTimeout(650);

const modalInventory = await page.evaluate(() => {
    const selector =
        '#ps-welcome,#ps-command-palette,#ps-loader,#ps-exporter,.ps-dialog-overlay';
    return Array.from(document.querySelectorAll(selector)).map(root => ({
        id: root.id,
        role: root.getAttribute('role'),
        modal: root.getAttribute('aria-modal'),
        named: !!(root.getAttribute('aria-label') ||
                   root.getAttribute('aria-labelledby')),
    }));
});
ok(modalInventory.length >= 15 &&
   modalInventory.every(item =>
       item.role === 'dialog' && item.modal === 'true' && item.named),
   'all standalone modal roots have dialog, modal, and accessible-name semantics');

console.log('case 1: shared shell dialogs use only rendered tab stops');
await page.focus('#ps-load');
await page.evaluate(() => window.PS_SHELL.runCommand('preferences'));
await page.waitForTimeout(350);
await page.evaluate(() => {
    const root = document.getElementById('ps-preferences');
    const hidden = document.createElement('button');
    hidden.id = 'ps-modal-hidden-sentinel';
    hidden.style.display = 'none';
    hidden.textContent = 'Hidden sentinel';
    root.appendChild(hidden);
    const negative = document.createElement('button');
    negative.id = 'ps-modal-negative-sentinel';
    negative.tabIndex = -1;
    negative.textContent = 'Negative sentinel';
    root.appendChild(negative);
});
const genericOpen = await page.evaluate(() => ({
    focused: document.activeElement && document.activeElement.id,
    hidden: document.querySelector('.ps-page').getAttribute('aria-hidden'),
    inert: document.querySelector('.ps-page').hasAttribute('inert'),
}));
ok(genericOpen.focused === 'ps-preferences-close' &&
   genericOpen.hidden === 'true' && genericOpen.inert,
   'a shared dialog receives initial focus and isolates the background');

await page.focus('#ps-preferences-save');
await page.keyboard.press('Tab');
ok(await page.evaluate(() => document.activeElement.id) === 'ps-preferences-close',
   'Tab wraps from the last rendered control without visiting hidden or negative sentinels');
await page.keyboard.press('Shift+Tab');
ok(await page.evaluate(() => document.activeElement.id) === 'ps-preferences-save',
   'Shift+Tab wraps back to the last rendered control');
await page.keyboard.press('Escape');
await page.waitForTimeout(80);
const genericClosed = await page.evaluate(() => ({
    shown: document.getElementById('ps-preferences').style.display,
    focused: document.activeElement && document.activeElement.id,
    hidden: document.querySelector('.ps-page').hasAttribute('aria-hidden'),
    inert: document.querySelector('.ps-page').hasAttribute('inert'),
}));
ok(genericClosed.shown === 'none' && genericClosed.focused === 'ps-load' &&
   !genericClosed.hidden && !genericClosed.inert,
   'Escape closes a shared dialog, restores its opener, and releases the background');

console.log('case 2: the command palette follows the combobox/listbox pattern');
await page.focus('#ps-load');
await page.keyboard.press('Control+Shift+P');
await page.waitForTimeout(180);
let palette = await page.evaluate(() => {
    const search = document.getElementById('ps-command-search');
    const active = document.getElementById(
        search.getAttribute('aria-activedescendant') || '');
    return {
        shown: document.getElementById('ps-command-palette').style.display,
        role: search.getAttribute('role'),
        controls: search.getAttribute('aria-controls'),
        expanded: search.getAttribute('aria-expanded'),
        activeId: active && active.id,
        activeRole: active && active.getAttribute('role'),
        selected: active && active.getAttribute('aria-selected'),
        disabled: active && active.disabled,
        focused: document.activeElement && document.activeElement.id,
        inert: document.querySelector('.ps-page').hasAttribute('inert'),
    };
});
ok(palette.shown === 'flex' && palette.role === 'combobox' &&
   palette.controls === 'ps-command-results' && palette.expanded === 'true' &&
   palette.focused === 'ps-command-search' && palette.inert,
   'the palette opens on its expanded search combobox and isolates the background');
ok(palette.activeId && palette.activeRole === 'option' &&
   palette.selected === 'true' && !palette.disabled,
   'the combobox exposes one enabled, selected active listbox option');

const beforeArrow = palette.activeId;
await page.keyboard.press('ArrowDown');
palette = await page.evaluate(() => {
    const search = document.getElementById('ps-command-search');
    const id = search.getAttribute('aria-activedescendant');
    const active = document.getElementById(id || '');
    return {
        id,
        selected: active && active.getAttribute('aria-selected'),
        selectedCount: document.querySelectorAll(
            '#ps-command-results [role="option"][aria-selected="true"]').length,
        focused: document.activeElement && document.activeElement.id,
    };
});
ok(palette.id !== beforeArrow && palette.selected === 'true' &&
   palette.selectedCount === 1 && palette.focused === 'ps-command-search',
   'Arrow navigation changes the single active option without moving DOM focus');

await page.keyboard.press('Tab');
ok(await page.evaluate(() => document.activeElement.id) === 'ps-command-close',
   'Tab reaches the palette’s explicit Close action');
await page.keyboard.press('Tab');
ok(await page.evaluate(() => document.activeElement.id) === 'ps-command-search',
   'Tab wraps from Close to the search field');
await page.keyboard.press('Shift+Tab');
ok(await page.evaluate(() => document.activeElement.id) === 'ps-command-close',
   'Shift+Tab wraps from search back to Close');
await page.keyboard.press('Escape');
await page.waitForTimeout(80);
const paletteClosed = await page.evaluate(() => ({
    shown: document.getElementById('ps-command-palette').style.display,
    expanded: document.getElementById('ps-command-search')
        .getAttribute('aria-expanded'),
    active: document.getElementById('ps-command-search')
        .hasAttribute('aria-activedescendant'),
    focused: document.activeElement && document.activeElement.id,
    inert: document.querySelector('.ps-page').hasAttribute('inert'),
}));
ok(paletteClosed.shown === 'none' && paletteClosed.expanded === 'false' &&
   !paletteClosed.active && paletteClosed.focused === 'ps-load' &&
   !paletteClosed.inert,
   'Escape closes the palette, clears transient state, and restores its opener');

console.log('case 3: Load Data and Export use the same modal boundary');
await page.click('#ps-load');
await page.waitForTimeout(160);
let special = await page.evaluate(() => ({
    role: document.getElementById('ps-loader').getAttribute('role'),
    modal: document.getElementById('ps-loader').getAttribute('aria-modal'),
    labelledby: document.getElementById('ps-loader').getAttribute('aria-labelledby'),
    describedby: document.getElementById('ps-loader').getAttribute('aria-describedby'),
    focused: document.activeElement && document.activeElement.id,
    hiddenImportRendered:
        document.getElementById('ps-import-use').getClientRects().length > 0,
}));
ok(special.role === 'dialog' && special.modal === 'true' &&
   special.labelledby === 'ps-loader-title' &&
   special.describedby === 'ps-loader-description',
   'Load Data is a named, described modal dialog');
ok(special.focused === 'ps-loader-close' && !special.hiddenImportRendered,
   'Load Data places focus on Close and leaves its conditional Import action out');
await page.focus('#ps-sample');
await page.keyboard.press('Tab');
ok(await page.evaluate(() => document.activeElement.id) === 'ps-loader-close',
   'Load Data wraps past its hidden conditional action');
await page.keyboard.press('Escape');
await page.waitForTimeout(80);
ok(await page.evaluate(() => document.activeElement.id) === 'ps-load',
   'Load Data returns focus to its opener');

await page.focus('#ps-load');
await page.evaluate(() => window.PS_SHELL.runCommand('export'));
await page.waitForTimeout(160);
special = await page.evaluate(() => ({
    shown: document.getElementById('ps-exporter').style.display,
    focused: document.activeElement && document.activeElement.id,
    inert: document.querySelector('.ps-page').hasAttribute('inert'),
}));
ok(special.shown === 'flex' && special.focused === 'ps-export-name' &&
   special.inert,
   'Export opens on the filename field and isolates the background');
await page.focus('#ps-export-go');
await page.keyboard.press('Tab');
ok(await page.evaluate(() => document.activeElement.id) === 'ps-export-close',
   'Export wraps from its last enabled action to Close');
await page.keyboard.press('Escape');
await page.waitForTimeout(80);
const exportClosed = await page.evaluate(() => ({
    focused: document.activeElement && document.activeElement.id,
    inert: document.querySelector('.ps-page').hasAttribute('inert'),
}));
ok(exportClosed.focused === 'ps-load' && !exportClosed.inert,
   'Export returns focus and releases the background on Escape');

ok(errors.length === 0,
   `the modal matrix produced no page errors (${errors.join(' | ') || 'none'})`);

await browser.close();
console.log('\nSTANDALONE MODAL ACCESSIBILITY: PASS');
