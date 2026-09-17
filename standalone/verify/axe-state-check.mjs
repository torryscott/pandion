// Whole-application axe gate for the standalone shell.
//
// Unlike the shared-widget audit, this opens the real start center, every
// workspace, all six application menus, the command palette, and the major
// modal families. All selected A/AA violations block, regardless of impact.
// Full violation and incomplete evidence is retained in PS_A11Y_OUT.
import { createAxeReport } from '../../scripts/verify/axe-report.mjs';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function resolveFrom(name) {
    for (const base of [process.env.GB2_NODE_BASE, process.cwd(), new URL('.', import.meta.url).pathname,
                        '/private/tmp', '/tmp'].filter(Boolean)) {
        try { return createRequire(path.join(base, 'x.js')).resolve(name); }
        catch { /* try the next shared dependency location */ }
    }
    return null;
}
const playwrightPath = resolveFrom('playwright');
const axePath = resolveFrom('axe-core');
if (!playwrightPath || !axePath) {
    console.error(
        'axe-state-check: playwright and axe-core are required. ' +
        'For a local audit, install axe-core in /tmp.');
    process.exit(2);
}
const { chromium } = createRequire(playwrightPath)('playwright');
const axeSource = readFileSync(
    path.join(path.dirname(axePath), 'axe.min.js'), 'utf8');
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const imageFixture = path.resolve(new URL('.', import.meta.url).pathname,
    'fixtures', 'probe-image.png');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const pageErrors = [];
const contractFailures = [];
page.on('pageerror', error => pageErrors.push(String(error)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
await page.addScriptTag({ content: axeSource });

const evidence = createAxeReport({ suite: 'shell', artifact: pageUrl });
async function audit(label) {
    await evidence.scan(page, label);
}
async function auditShellDialog(label, id, open) {
    await page.focus('#ps-load');
    await open();
    await page.waitForTimeout(180);
    const opened = await page.evaluate(dialogId => {
        const dialog = document.getElementById(dialogId);
        return {
            shown: !!dialog && dialog.style.display === 'flex',
            focusInside: !!dialog && dialog.contains(document.activeElement),
            inert: document.querySelector('.ps-page').hasAttribute('inert'),
        };
    }, id);
    contract(opened.shown && opened.focusInside && opened.inert,
        label + ' opens with focus inside and the app background inert');
    await audit(label);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(80);
    const closed = await page.evaluate(dialogId => ({
        shown: document.getElementById(dialogId).style.display,
        focused: document.activeElement && document.activeElement.id,
        inert: document.querySelector('.ps-page').hasAttribute('inert'),
    }), id);
    contract(closed.shown === 'none' && closed.focused === 'ps-load' &&
        !closed.inert,
        label + ' closes with Escape and restores its opener');
}
function contract(condition, message) {
    if (condition) console.log('  ok  ' + message);
    else {
        contractFailures.push(message);
        console.log('  FAIL ' + message);
    }
}

console.log('case 1: start center');
await audit('Start center');
await page.click('#ps-welcome-sample');
await page.waitForTimeout(900);

console.log('case 2: complete workspaces');
await audit('Charts workspace');
let rolePattern = await page.evaluate(() => {
    const filled = Array.from(document.querySelectorAll(
        '#ps-slots .ps-slot-filled'));
    return {
        filled: filled.length,
        groups: filled.filter(node => node.getAttribute('role') === 'group' &&
            node.tabIndex === -1).length,
        changeButtons: filled.filter(node => {
            const button = node.querySelector('.ps-slot-change');
            return button && /Change|Add/.test(button.textContent) &&
                button.hasAttribute('aria-label');
        }).length,
        nestedButtons: filled.filter(node =>
            node.getAttribute('role') === 'button' &&
            !!node.querySelector('button')).length,
    };
});
contract(rolePattern.filled >= 2 &&
    rolePattern.groups === rolePattern.filled &&
    rolePattern.changeButtons === rolePattern.filled &&
    rolePattern.nestedButtons === 0,
    'filled role assignments are named groups with native Change/Add controls');
await page.locator('#ps-slots .ps-slot-filled .ps-slot-change').first().focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(100);
contract(await page.locator('#ps-slots .ps-role-picker').isVisible(),
    'the filled-role Change control opens its picker from the keyboard');
await audit('Charts role picker');
contract(await page.evaluate(() => {
    const covered = document.querySelector('#ps-slots button[data-role-key="groupVar"]');
    if (!covered) return false;
    covered.focus();
    return document.activeElement !== covered;
}), 'covered role controls cannot receive keyboard focus behind the picker');
await page.keyboard.press('Escape');
await page.locator('#ps-slots button[data-role-key="groupVar"]').focus();
await page.keyboard.press('Enter');
contract(await page.locator('#ps-slots .ps-role-card[data-role-key="groupVar"] .ps-role-picker').isVisible(),
    'closing the picker restores keyboard access to the next role');
await page.keyboard.press('Escape');
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(350);
await audit('Data workspace');
await page.evaluate(async () => {
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    window.PS_SHELL.addLayout();
    await sleep(700);
    window.PS_SHELL.setWorkspace('layout');
    await sleep(300);
});
await page.click('#ps-laddtext');
await page.waitForTimeout(150);
await audit('Layouts workspace');

console.log('case 3: all application menus');
const menuNames = await page.locator('[data-ps-menu]').evaluateAll(nodes =>
    nodes.map(node => node.getAttribute('data-ps-menu')));
for (const menu of menuNames) {
    await page.click('[data-ps-menu="' + menu + '"]');
    // 180ms, not 60: command enable-state syncs on open, and the chrome's
    // 90ms color transition means a just-enabled item is mid-flight from
    // its disabled gray - axe at 60ms once sampled #90969c on data-compute
    // (dist pass only; the inlined engine shifts boot timing) and flagged a
    // contrast failure on a frame of animation. Settle past the transition.
    await page.waitForTimeout(180);
    await audit(menu[0].toUpperCase() + menu.slice(1) + ' menu');
    await page.keyboard.press('Escape');
}

console.log('case 4: palette and every specialized modal family');
await page.focus('#ps-load');
await page.keyboard.press('Control+Shift+P');
await page.waitForTimeout(150);
await audit('Command palette');
await page.keyboard.press('Escape');

await page.click('#ps-load');
await page.waitForTimeout(150);
await audit('Load Data dialog');
await page.keyboard.press('Escape');

await page.evaluate(() => window.PS_SHELL.runCommand('export'));
await page.waitForTimeout(150);
await audit('Export dialog');
await page.keyboard.press('Escape');

await auditShellDialog('New chart dialog', 'ps-analysis-gallery',
    () => page.evaluate(() => window.PS_SHELL.runCommand('new-chart')));
await auditShellDialog('Help me choose dialog', 'ps-help-choose',
    () => page.evaluate(() => window.PS_SHELL.showHelpMeChoose()));
await auditShellDialog('New layout dialog', 'ps-layout-gallery',
    () => page.evaluate(() => window.PS_SHELL.runCommand('new-layout')));
await auditShellDialog('Computed variable dialog', 'ps-formula-dialog',
    () => page.evaluate(() => window.PS_SHELL.runCommand('data-compute')));
await auditShellDialog('Reshape dialog', 'ps-reshape-dialog',
    () => page.evaluate(() => window.PS_SHELL.runCommand('data-reshape')));
await auditShellDialog('Preferences dialog', 'ps-preferences',
    () => page.evaluate(() => window.PS_SHELL.runCommand('preferences')));
await auditShellDialog('About dialog', 'ps-about-dialog',
    () => page.evaluate(() => window.PS_SHELL.runCommand('about')));
await auditShellDialog('What’s new dialog', 'ps-whatsnew-dialog',
    () => page.evaluate(() => window.PS_SHELL.runCommand('whats-new')));
await auditShellDialog('Keyboard shortcuts dialog', 'ps-shortcuts-dialog',
    () => page.evaluate(() => window.PS_SHELL.runCommand('shortcuts')));
await auditShellDialog('Diagnostics dialog', 'ps-diagnostics',
    () => page.evaluate(() => window.PS_SHELL.runCommand('diagnostics')));

await page.evaluate(() => {
    window.PS_SHELL.setWorkspace('layout');
    window.PS_IMG_WARN_BYTES = 40;
});
await page.focus('#ps-load');
await page.setInputFiles('#ps-laddimage-file', imageFixture);
await page.waitForTimeout(180);
const imageDialog = await page.evaluate(() => ({
    shown: document.getElementById('ps-imgsize-dialog').style.display,
    focusInside: document.getElementById('ps-imgsize-dialog')
        .contains(document.activeElement),
    inert: document.querySelector('.ps-page').hasAttribute('inert'),
}));
contract(imageDialog.shown === 'flex' && imageDialog.focusInside &&
    imageDialog.inert,
    'Large image dialog opens through its real file-selection route');
await audit('Large image dialog');
await page.keyboard.press('Escape');
await page.waitForTimeout(80);
contract(await page.evaluate(() =>
    document.getElementById('ps-imgsize-dialog').style.display === 'none' &&
    document.activeElement.id === 'ps-load' &&
    !document.querySelector('.ps-page').hasAttribute('inert')),
    'Large image dialog closes with Escape and restores its opener');
await page.evaluate(() => { window.PS_IMG_WARN_BYTES = null; });

console.log('case 5: row-filter popover and shared lower chart editor');
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(220);
await page.click('#ps-data-filter-btn');
await page.waitForTimeout(100);
contract(await page.locator('#ps-filtermenu').isVisible(),
    'the row-filter dialog is open');
await audit('Row-filter dialog');
await page.keyboard.press('Escape');

await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
await page.waitForTimeout(500);
const editorOpened = await page.evaluate(() => {
    const bar = document.querySelector('svg [data-bar-cat]');
    if (!bar) return false;
    for (const type of ['pointerdown', 'pointerup', 'click'])
        bar.dispatchEvent(new PointerEvent(type, {
            bubbles: true, cancelable: true, pointerId: 1, isPrimary: true,
        }));
    return true;
});
await page.waitForTimeout(500);
contract(editorOpened && await page.locator('.gb2-panel').isVisible(),
    'a chart part opens the shared lower editor');
// The shared editor is part of the complete standalone experience. Its
// compact swatches use the WCAG 2.2 spacing exception, so both target size
// and ordinary A/AA findings are release blocking here.
await audit('Shared lower chart editor');

if (pageErrors.length)
    console.log('  FAIL page errors: ' + pageErrors.join(' | '));
await browser.close();
const summary = evidence.finish([...pageErrors, ...contractFailures]);
if (summary.failed) {
    console.log('\nSTANDALONE AXE STATE CHECK: ' +
        (summary.blockingRules + summary.errors) +
        ' BLOCKING FAILURE(S)');
    process.exit(1);
}
console.log('\nSTANDALONE AXE STATE CHECK: PASS');
