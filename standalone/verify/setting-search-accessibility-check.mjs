// Adjudicate dynamic aria-controls review items through their full lifecycle.
// Programmatic chart setup and browser keys do not establish AT acceptance.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(path.join(process.env.GB2_NODE_BASE || process.cwd(), 'accessibility-probe.cjs'));
const playwright = require('playwright');
const engine = process.env.PS_BROWSER || 'chromium';
if (!['chromium', 'firefox', 'webkit'].includes(engine)) throw new Error('Unknown PS_BROWSER');
const artifact = path.resolve(process.env.PS_PAGE || 'standalone/index.html');
const out = path.resolve(process.env.PS_A11Y_OUT || 'planning/accessibility-release/source');
mkdirSync(out, { recursive: true });
const report = {
    suite: 'setting-search-relationships', browser: engine, artifact,
    sha256: createHash('sha256').update(readFileSync(artifact)).digest('hex'),
    status: 'in-progress', states: [], errors: [],
    limit: 'DOM and browser accessibility representation; no screen reader or installed jamovi acceptance.',
};
const browser = await playwright[engine].launch();
report.browserVersion = browser.version();
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
page.setDefaultTimeout(15000);
page.on('pageerror', error => report.errors.push(String(error)));
function check(condition, message) { if (!condition) throw new Error(message); }
async function state(label, open, active = false) {
    const data = await page.evaluate(() => {
        const button = document.querySelector('[data-role="setting-search-trigger"]');
        const menuId = button?.getAttribute('aria-controls');
        const menu = document.getElementById(menuId);
        const input = menu?.querySelector('[data-role="setting-search-input"]');
        const listId = input?.getAttribute('aria-controls');
        const list = document.getElementById(listId);
        const activeId = input?.getAttribute('aria-activedescendant');
        const option = document.getElementById(activeId);
        return {
            menuId, listId, activeId,
            menuCount: [...document.querySelectorAll('[id]')].filter(n => n.id === menuId).length,
            listCount: [...document.querySelectorAll('[id]')].filter(n => n.id === listId).length,
            menuRole: menu?.getAttribute('role'), listRole: list?.getAttribute('role'),
            inputRole: input?.getAttribute('role'),
            menuVisible: !!menu?.getClientRects().length,
            expanded: button?.getAttribute('aria-expanded'),
            inputExpanded: input?.getAttribute('aria-expanded'),
            inputFocused: document.activeElement === input,
            triggerFocused: document.activeElement === button,
            activeInList: !!option && list?.contains(option),
            activeRole: option?.getAttribute('role'),
            selected: option?.getAttribute('aria-selected'),
        };
    });
    report.states.push({ label, ...data });
    check(data.menuCount === 1 && data.listCount === 1, label + ': unique controls targets must exist');
    check(data.menuRole === 'dialog' && data.listRole === 'listbox' && data.inputRole === 'combobox', label + ': target roles');
    check(data.menuVisible === open && data.expanded === String(open) && data.inputExpanded === String(open), label + ': visibility/expanded agree');
    if (open) check(data.inputFocused, label + ': search owns focus');
    if (active) check(data.activeInList && data.activeRole === 'option' && data.selected === 'true', label + ': selected result is a real descendant');
    if (!open) check(!data.activeId, label + ': closed search has no stale active result');
    return data;
}
try {
    await page.goto(pathToFileURL(artifact).href);
    await page.waitForFunction(() => !!window.PS_SHELL);
    if (await page.locator('#ps-welcome').isVisible()) await page.click('#ps-welcome-sample');
    await page.evaluate(() => {
        const header = ['Group', 'Score', 'X', 'T1', 'T2', 'Item'];
        const rows = Array.from({ length: 12 }, (_, i) => [i % 2 ? 'B' : 'A', 10 + i, i + 1, 9 + i, 12 + i, i % 5 + 1].map(String));
        window.PS_SHELL.loadTable('Setting search review', header, rows, {
            Group: 'nominal', Score: 'continuous', X: 'continuous',
            T1: 'continuous', T2: 'continuous', Item: 'ordinal',
        });
        window.PS_SHELL.setWorkspace('chart');
    });
    const families = [
        ['plotbuilder', { xvar: 'Group', yvar: 'Score' }],
        ['distplotbuilder', { var: 'Score' }],
        ['freqplotbuilder', { var: 'Group' }],
        ['rmplotbuilder', { measures: ['T1', 'T2'], betweenVar: 'Group' }],
        ['corrplotbuilder', { vars: ['Score', 'X', 'T1'] }],
        ['likertplotbuilder', { items: ['Item'] }],
        ['xyplotbuilder', { xvar: 'X', yvar: 'Score' }],
    ];
    for (const [module, roles] of families) {
        await page.evaluate(({ module, roles }) => {
            window.PS_SHELL.setModule(module);
            window.PS_SHELL.setRoles(module, roles);
        }, { module, roles });
        const trigger = page.locator('[data-role="setting-search-trigger"]');
        await trigger.waitFor({ state: 'visible' });
        await state(module + ' closed', false);
        await trigger.focus();
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => document.activeElement?.matches('[data-role="setting-search-input"]'));
        await state(module + ' open', true);
        const input = page.locator('[data-role="setting-search-input"]');
        await input.fill('title');
        await page.keyboard.press('ArrowDown');
        await state(module + ' filtered result', true, true);
        report.states.at(-1).accessibilitySnapshot = await page.getByRole('dialog', { name: 'Find a setting', exact: true }).ariaSnapshot();
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.activeElement?.matches('[data-role="setting-search-trigger"]'));
        check((await state(module + ' dismissed', false)).triggerFocused, 'Escape returns focus');
        await page.evaluate(module => window.PS_SHELL.setModule(module), module);
        await trigger.waitFor({ state: 'visible' });
        await state(module + ' rebuilt', false);
        console.log('  ok  ' + module + ' relationships, result focus, Escape and rebuild');
    }
    await page.evaluate(() => {
        window.PS_SHELL.addLayout();
        window.PS_SHELL.setWorkspace('layout');
    });
    report.layoutHistory = await page.getByRole('group', { name: 'Layout history', exact: true }).ariaSnapshot();
    check(/group "Layout history"/.test(report.layoutHistory) && /button/.test(report.layoutHistory), 'Layout history is a named group with buttons');
    report.brand = await page.locator('.ps-brand').ariaSnapshot();
    check(/Pandion Plots/.test(report.brand), 'Visible brand remains available');
    check(report.errors.length === 0, 'No page errors');
    report.status = 'passed';
} catch (error) {
    report.status = 'failed';
    report.errors.push(String(error));
    throw error;
} finally {
    writeFileSync(path.join(out, 'setting-search-' + engine + '.json'), JSON.stringify(report, null, 2) + '\n');
    await browser.close();
}
