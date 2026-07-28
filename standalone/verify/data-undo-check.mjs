// Real-browser smoke for persistent Data undo/redo keyboard routing.
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

const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 920 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
await page.goto(pageUrl);
await page.waitForTimeout(350);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(150);
}
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(180);

const cell = page.locator('#ps-datagrid td[data-gc="score"][data-gr="0"]');
await cell.click({ button: 'right' });
await page.click('#ps-cellmenu-clear');
await page.waitForTimeout(180);
let state = await page.evaluate(() => ({
    value: window.PS_SHELL.project.table.raw.score[0],
    history: window.PS_SHELL.dataHistory()
}));
if (state.value !== '' || state.history.undo < 1)
    throw new Error(`Clear selected values did not create Data history: ` +
                    JSON.stringify(state));
console.log('  ok  clearing a value creates a persistent Data undo step');

// The action button is intentionally temporary; history must outlive it.
await page.waitForTimeout(6100);
if (await page.locator('#ps-toast').evaluate(node =>
        node.classList.contains('ps-toast-show')))
    throw new Error('temporary action toast did not expire');

await page.keyboard.press('Control+z');
await page.waitForTimeout(180);
state = await page.evaluate(() => ({
    value: window.PS_SHELL.project.table.raw.score[0],
    history: window.PS_SHELL.dataHistory(),
    toast: document.getElementById('ps-toast').textContent
}));
// P4: the toast NAMES the step now ("Undid clearing the cells") instead of a
// fixed "Previous data state restored", so this asserts the name.
if (state.value !== '61' || state.history.redo < 1 ||
    !/Undid clearing the cells/.test(state.toast))
    throw new Error(`Data Cmd/Ctrl+Z did not restore the value: ` +
                    JSON.stringify(state));
console.log('  ok  Cmd/Ctrl+Z restores Data after the action toast expires');

await page.keyboard.press('Control+Shift+z');
await page.waitForTimeout(180);
state = await page.evaluate(() => ({
    value: window.PS_SHELL.project.table.raw.score[0],
    toast: document.getElementById('ps-toast').textContent
}));
if (state.value !== '' || !/Redid clearing the cells/.test(state.toast))
    throw new Error(`Data redo did not reapply the clear: ${JSON.stringify(state)}`);
console.log('  ok  Cmd/Ctrl+Shift+Z reapplies the Data change');

if (errors.length) throw new Error(errors[0]);
await browser.close();
console.log('DATA UNDO CHECK: ALL GREEN');
