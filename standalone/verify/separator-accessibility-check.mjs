// Runtime accessibility contract for application pane splitters and Data
// column separators. Pins range/value semantics across pointer, keyboard,
// reset, and viewport-change paths.
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
await page.waitForTimeout(500);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(450);
}

const readPane = key => page.evaluate(splitter => {
    const bar = document.querySelector('[data-splitter="' + splitter + '"]');
    const body = document.querySelector('.ps-app-body');
    const cssName = splitter === 'rail' ? '--ps-rail-w' : '--ps-insp-w';
    return {
        role: bar.getAttribute('role'),
        orientation: bar.getAttribute('aria-orientation'),
        min: Number(bar.getAttribute('aria-valuemin')),
        max: Number(bar.getAttribute('aria-valuemax')),
        now: Number(bar.getAttribute('aria-valuenow')),
        text: bar.getAttribute('aria-valuetext'),
        css: Number.parseFloat(getComputedStyle(body).getPropertyValue(cssName)),
    };
}, key);

let rail = await readPane('rail');
let inspector = await readPane('inspector');
ok(rail.role === 'separator' && rail.orientation === 'vertical' &&
   rail.min === 150 && rail.now === 205 && rail.max >= rail.now &&
   rail.css === rail.now && /205 pixels/.test(rail.text),
   `the project-rail separator exposes its effective range and width (${JSON.stringify(rail)})`);
ok(inspector.role === 'separator' && inspector.orientation === 'vertical' &&
   inspector.min === 240 && inspector.now === 330 &&
   inspector.max >= inspector.now && inspector.css === inspector.now &&
   /330 pixels/.test(inspector.text),
   `the settings separator exposes its effective range and width (${JSON.stringify(inspector)})`);

await page.locator('[data-splitter="rail"]').focus();
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(120);
rail = await readPane('rail');
ok(rail.now === 213 && rail.css === 213,
   'ArrowRight updates the rail width and aria-valuenow together');
await page.keyboard.press('Shift+ArrowLeft');
await page.waitForTimeout(120);
rail = await readPane('rail');
ok(rail.now === 181 && rail.css === 181,
   'Shift+ArrowLeft applies the larger step to both visual and semantic values');
await page.keyboard.press('Home');
await page.waitForTimeout(120);
rail = await readPane('rail');
ok(rail.now === 205 && rail.css === 205,
   'Home restores and announces the default project-rail width');

await page.locator('[data-splitter="inspector"]').focus();
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(120);
inspector = await readPane('inspector');
ok(inspector.now === 322 && inspector.css === 322,
   'ArrowRight moves the physical inspector divider right and reports its narrower width');
await page.keyboard.press('Home');
await page.waitForTimeout(120);
inspector = await readPane('inspector');
ok(inspector.now === 330 && inspector.css === 330,
   'Home restores and announces the default settings-panel width');

const railHandle = page.locator('[data-splitter="rail"]');
const railBox = await railHandle.boundingBox();
await page.mouse.move(railBox.x + railBox.width / 2, railBox.y + railBox.height / 2);
await page.mouse.down();
await page.mouse.move(railBox.x + railBox.width / 2 + 24,
                      railBox.y + railBox.height / 2);
await page.mouse.up();
await page.waitForTimeout(150);
rail = await readPane('rail');
ok(rail.now === 229 && rail.css === 229,
   'pointer resizing updates the project-rail semantic value live');

await page.setViewportSize({ width: 900, height: 940 });
await page.waitForTimeout(180);
rail = await readPane('rail');
inspector = await readPane('inspector');
ok(rail.max < 380 && inspector.max < 560 &&
   rail.now <= rail.max && inspector.now <= inspector.max &&
   rail.css === rail.now && inspector.css === inspector.now,
   'viewport changes recompute effective pane maxima and clamp reported/applied widths');
await page.setViewportSize({ width: 1440, height: 940 });
await page.waitForTimeout(180);

await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(350);
const firstColumn = page.locator('#ps-datagrid th[data-grid-col]').first();
const firstName = await firstColumn.getAttribute('data-grid-col');
let column = await firstColumn.evaluate(head => {
    const handle = head.querySelector('.ps-grid-col-resizer');
    return {
        label: handle.getAttribute('aria-label'),
        role: handle.getAttribute('role'),
        orientation: handle.getAttribute('aria-orientation'),
        min: Number(handle.getAttribute('aria-valuemin')),
        max: Number(handle.getAttribute('aria-valuemax')),
        now: Number(handle.getAttribute('aria-valuenow')),
        text: handle.getAttribute('aria-valuetext'),
        measured: Math.round(head.getBoundingClientRect().width),
    };
});
ok(column.role === 'separator' && column.orientation === 'vertical' &&
   column.min === 72 && column.max === 600 &&
   Math.abs(column.now - column.measured) <= 1 &&
   column.label === `Resize ${firstName} column` &&
   column.text.includes(`${firstName} column width`),
   `the Data column separator names and reports its current pixel width (${JSON.stringify(column)})`);

await firstColumn.locator('.ps-grid-col-resizer').focus();
const beforeKey = column.now;
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(180);
column = await page.locator(
    `#ps-datagrid th[data-grid-col="${firstName}"]`,
).evaluate(head => {
    const handle = head.querySelector('.ps-grid-col-resizer');
    return {
        focused: document.activeElement === handle,
        now: Number(handle.getAttribute('aria-valuenow')),
        text: handle.getAttribute('aria-valuetext'),
    };
});
ok(column.focused && column.now === beforeKey + 8 &&
   column.text.includes(`${column.now} pixels`),
   'keyboard column resize rebuilds the grid while preserving focus and the new value');

const columnHandle = page.locator(
    `#ps-datagrid th[data-grid-col="${firstName}"] .ps-grid-col-resizer`,
);
const columnBox = await columnHandle.boundingBox();
const beforePointer = column.now;
await page.mouse.move(
    columnBox.x + columnBox.width / 2,
    columnBox.y + columnBox.height / 2,
);
await page.mouse.down();
await page.mouse.move(
    columnBox.x + columnBox.width / 2 + 30,
    columnBox.y + columnBox.height / 2,
);
await page.mouse.up();
await page.waitForTimeout(180);
column = await page.locator(
    `#ps-datagrid th[data-grid-col="${firstName}"] .ps-grid-col-resizer`,
).evaluate(handle => ({
    now: Number(handle.getAttribute('aria-valuenow')),
    text: handle.getAttribute('aria-valuetext'),
}));
ok(column.now === beforePointer + 30 && column.text.includes(`${column.now} pixels`),
   'pointer column resize updates aria-valuenow and aria-valuetext live');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('SEPARATOR ACCESSIBILITY CHECK PASS');
await browser.close();
