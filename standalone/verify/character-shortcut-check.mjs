// A11Y-03: '?' belongs to the focused chart component. Drive real keyboard
// input in the standalone shell or an R-generated jamovi widget. Native
// composition/defaultPrevented guards use synthetic events as separate cases.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
let pw;
for (const base of [process.env.GB2_NODE_BASE, process.cwd(), '/private/tmp', '/tmp'].filter(Boolean)) {
    try { pw = createRequire(path.join(base, 'probe.js'))('playwright'); break; }
    catch { /* try the next shared dependency location */ }
}
assert(pw, 'Playwright required; set GB2_NODE_BASE to its installation directory');
const hostDir = process.env.GB2_SHORTCUT_HOST_DIR;
const browserName = process.env.PS_SHORTCUT_BROWSER || 'chromium';
const browser = await pw[browserName].launch();
const errors = [];
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('filechooser', () => {}); // Playwright dismisses an unhandled file chooser and Chromium reports that as cancel, which the app honours; a listener keeps the chooser open
    page.setDefaultTimeout(12000);
    page.on('pageerror', e => errors.push(String(e)));
    if (!hostDir && process.env.PS_SHORTCUT_SOURCE) {
        await page.route('**/graphbuilder2.min.js', route => route.fulfill({
            contentType: 'text/javascript', body: readFileSync(process.env.PS_SHORTCUT_SOURCE, 'utf8'),
        }));
    }
    const file = hostDir ? path.join(hostDir, 'cg_bar_labels.html')
        : process.env.PS_PAGE || 'standalone/index.html';
    await page.goto(pathToFileURL(path.resolve(file)).href);
    if (!hostDir) {
        await page.locator('#ps-welcome-sample').click();
        await page.waitForTimeout(900);
        if (await page.locator('#ps-coach-ok').isVisible()) await page.locator('#ps-coach-ok').click();
    }
    const chart = page.locator('.graphbuilder2-host svg[data-role="gb2-chart-svg"]');
    await chart.waitFor();
    const host = page.locator('.graphbuilder2-host');
    const isHelp = () => host.locator('[data-role="inspector-title"]').evaluateAll(ns =>
        ns.some(n => n.getBoundingClientRect().height > 0 && /Help & shortcuts/.test(n.textContent)));
    // Stand-in surrounding controls for the R HTML result, outside the chart.
    if (hostDir) await host.evaluate(h => {
        const b = document.createElement('button'); b.id = 'shortcut-outside';
        b.textContent = 'Surrounding results control'; h.before(b);
    });
    const outside = page.locator(hostDir ? '#shortcut-outside' : '#ps-load');
    await outside.focus();
    await page.keyboard.press('?');
    assert.equal(await isHelp(), false, 'Outside focus must not open chart Help');
    console.log('  ok outside focus leaves Help closed');

    async function toggle(expected) {
        await chart.focus();
        await page.keyboard.press('?');
        await page.waitForTimeout(250);
        assert.equal(await isHelp(), expected, 'Focused chart toggles Help once');
    }
    await toggle(true);
    await outside.focus();
    await page.keyboard.press('?');
    assert.equal(await isHelp(), true, 'Outside focus must not close existing Help');
    await toggle(false);
    await chart.focus();
    await page.keyboard.press('Shift+Slash');
    await page.waitForTimeout(250);
    assert.equal(await isHelp(), true, 'Physical Shift+/ is the same shortcut');
    await toggle(false);
    console.log('  ok focused chart opens/closes Help; outside input preserves it');

    // Native typing surfaces within the component: fixture controls isolate
    // the shared handler's exclusions from individual editors' validation.
    await host.evaluate(h => {
        const group = document.createElement('div'); group.id = 'shortcut-fields';
        group.innerHTML = '<input id="shortcut-input" aria-label="Fixture text">' +
            '<textarea id="shortcut-textarea" aria-label="Fixture note"></textarea>' +
            '<select id="shortcut-select" aria-label="Fixture choice"><option>One</option><option>Two</option></select>' +
            '<div id="shortcut-editable" contenteditable="true" role="textbox" aria-label="Fixture rich text"><span>Text</span></div>';
        h.appendChild(group);
    });
    for (const id of ['input', 'textarea', 'editable', 'select']) {
        const field = page.locator('#shortcut-' + id);
        await field.focus();
        await page.keyboard.press('?');
        assert.equal(await isHelp(), false, id + ': typing does not open Help');
        if (id === 'input' || id === 'textarea') assert.equal(await field.inputValue(), '?');
        if (id === 'editable') assert.match(await field.textContent(), /\?/);
    }
    await page.locator('#shortcut-fields').evaluate(n => n.remove());
    console.log('  ok native typing and selection within the chart are preserved');

    await chart.focus();
    for (const options of [{ isComposing: true }, { keyCode: 229 }, { ctrlKey: true },
                           { altKey: true }, { metaKey: true }, { alreadyHandled: true }]) {
        await chart.evaluate((n, opts) => {
            const e = new KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true, ...opts });
            if (opts.alreadyHandled) e.preventDefault();
            n.dispatchEvent(e);
        }, options);
        assert.equal(await isHelp(), false, 'Composition/modified/handled event is ignored');
    }
    // A stale event aimed at the chart cannot substitute for actual focus.
    await outside.focus();
    await chart.dispatchEvent('keydown', { key: '?', bubbles: true, cancelable: true });
    assert.equal(await isHelp(), false, 'Target alone does not authorize the shortcut');
    console.log('  ok composing, modified, handled and stale-target events are ignored');

    if (!hostDir) {
        await page.click('#ps-export');
        await page.locator('#ps-export-description').focus();
        await page.keyboard.press('?');
        assert.equal(await isHelp(), false, 'Export dialog typing does not open Help');
        assert.match(await page.inputValue('#ps-export-description'), /\?/);
        await page.locator('#ps-export-close').focus();
        await page.keyboard.press('?');
        assert.equal(await isHelp(), false, 'Export dialog button does not open Help');
        await page.keyboard.press('Escape');
        await page.evaluate(() => PS_SHELL.setWorkspace('data'));
        await page.locator('#ps-datagrid').focus();
        await page.keyboard.press('?');
        assert.equal(await isHelp(), false, 'Hidden chart does not react from Data');
        await page.evaluate(() => PS_SHELL.setWorkspace('chart'));
        await page.waitForTimeout(250);
        assert.equal(await isHelp(), false, 'Returning from Data must not reveal an accidentally opened Help panel');
        // The actual menu command is the standalone's visible Help route;
        // its redundant engine toolbar button is intentionally hidden.
        await page.evaluate(() => PS_SHELL.runCommand('help-basics'));
    } else {
        await host.getByRole('button', { name: 'Help & shortcuts', exact: true }).click();
    }
    // The shell opens the panel, then selects its tab on a 60 ms retry.
    await page.waitForTimeout(250);
    assert.equal(await isHelp(), true, 'Explicit Help route still opens the panel');
    await host.locator('[data-basics-topic="keys"]').click();
    assert.match(await host.locator('[data-role="basics-pane"]').textContent(), /Open or close Help while the chart is focused/);
    await page.keyboard.press('?');
    await page.waitForTimeout(250);
    assert.equal(await isHelp(), false, 'Focused Help controls belong to the chart component');
    console.log('  ok explicit Help route and standalone dialog/workspace behavior');

    await page.evaluate(() => {
        if (window.PS_SHELL) PS_SHELL.render();
        else {
            const h = document.querySelector('.graphbuilder2-host');
            GraphBuilder2.render(h.id, window.gb2_undo.getData());
        }
    });
    await toggle(true);
    await toggle(false);
    await outside.focus();
    await page.keyboard.press('?');
    assert.equal(await isHelp(), false, 'Rebuilt chart remains scoped');
    assert.deepEqual(errors, []);
    console.log('CHARACTER SHORTCUT CHECK: PASS (' + (hostDir ? 'R-generated host' : 'standalone') + '; ' + browserName + ')');
} finally {
    await browser.close();
}
