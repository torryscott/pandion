// Runtime accessibility contract for the application-level bypass routes.
//
// Verifies first/second focus position, rendered visibility, stable workspace
// destination, and the responsive settings-drawer behavior.
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
async function resetFocus(page) {
    await page.evaluate(() => {
        document.body.tabIndex = -1;
        document.body.focus();
        document.body.removeAttribute('tabindex');
    });
}

const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
await page.goto(pageUrl);
await page.waitForTimeout(550);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(550);
}

console.log('case 1: the bypass routes lead the wide-screen Tab order');
await resetFocus(page);
await page.keyboard.press('Tab');
let state = await page.evaluate(() => {
    const active = document.activeElement;
    const rect = active.getBoundingClientRect();
    return {
        id: active.id,
        text: active.textContent.trim(),
        visible: rect.width > 0 && rect.height > 0 &&
            rect.bottom > 0 && rect.top < innerHeight,
    };
});
ok(state.id === 'ps-skip-workspace' &&
   state.text === 'Skip to active workspace' && state.visible,
   'Skip to active workspace is the first visible focus stop');
await page.keyboard.press('Enter');
await page.waitForTimeout(50);
ok(await page.evaluate(() => document.activeElement.id) === 'ps-main-workspace',
   'the first bypass route moves focus to the workspace landmark');

await resetFocus(page);
await page.keyboard.press('Tab');
await page.keyboard.press('Tab');
state = await page.evaluate(() => {
    const active = document.activeElement;
    const rect = active.getBoundingClientRect();
    return {
        id: active.id,
        text: active.textContent.trim(),
        visible: rect.width > 0 && rect.height > 0 &&
            rect.bottom > 0 && rect.top < innerHeight,
    };
});
ok(state.id === 'ps-skip-settings' &&
   state.text === 'Skip to settings panel' && state.visible,
   'Skip to settings panel is the second visible focus stop');
await page.keyboard.press('Enter');
await page.waitForTimeout(50);
ok(await page.evaluate(() => document.activeElement.id) === 'ps-settings-panel',
   'the second bypass route moves focus to the settings region');

console.log('case 2: the workspace target remains stable across all workspaces');
for (const workspace of ['data', 'chart', 'pinboard', 'layout']) {
    await page.evaluate(value => window.PS_SHELL.setWorkspace(value), workspace);
    await page.waitForTimeout(180);
    await page.focus('#ps-skip-workspace');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    state = await page.evaluate(() => ({
        workspace: window.PS_SHELL.workspace(),
        focused: document.activeElement && document.activeElement.id,
    }));
    ok(state.workspace === workspace && state.focused === 'ps-main-workspace',
       `the ${workspace} workspace uses the same working bypass destination`);
}

console.log('case 3: the narrow settings route reveals its real destination');
await page.setViewportSize({ width: 720, height: 800 });
await page.waitForTimeout(100);
await resetFocus(page);
await page.keyboard.press('Tab');
await page.keyboard.press('Tab');
await page.keyboard.press('Enter');
await page.waitForTimeout(80);
state = await page.evaluate(() => {
    const body = document.querySelector('.ps-app-body');
    const settings = document.getElementById('ps-settings-panel');
    const rect = settings.getBoundingClientRect();
    return {
        drawer: body.classList.contains('ps-narrow-inspector-open'),
        focused: document.activeElement === settings,
        visible: rect.width > 0 && rect.height > 0 &&
            rect.right > 0 && rect.left < innerWidth,
    };
});
ok(state.drawer && state.focused && state.visible,
   'the narrow bypass opens the real inspector drawer before focusing it');
await page.keyboard.press('Escape');
ok(!await page.evaluate(() =>
    document.querySelector('.ps-app-body')
        .classList.contains('ps-narrow-inspector-open')),
   'Escape dismisses the narrow inspector after bypass entry');

ok(errors.length === 0,
   `the bypass matrix produced no page errors (${errors.join(' | ') || 'none'})`);
await browser.close();
console.log('\nSTANDALONE BYPASS ACCESSIBILITY: PASS');
