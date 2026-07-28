// Real-browser check for COPY AS IMAGE (Tier 1): Cmd/Ctrl+C on a chart
// or layout writes a 2x PNG ClipboardItem via the export pipeline, the
// Edit menu carries the command, and the Data workspace keeps its TSV
// range copy untouched.
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
const PAGE = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(PAGE);
await page.waitForTimeout(600);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1000);

// Capture clipboard writes (headless Chromium exposes the API but a
// probe must observe the payload, not the real clipboard).
async function armCapture() {
    await page.evaluate(() => {
        window.__copied = [];
        navigator.clipboard.write = async (items) => {
            for (const it of items) {
                for (const type of it.types) {
                    const blob = await it.getType(type);
                    const buf = new Uint8Array(await blob.arrayBuffer());
                    window.__copied.push({ type, size: buf.length,
                        sig: Array.from(buf.slice(0, 8)).join(',') });
                }
            }
        };
    });
}
await armCapture();
await page.keyboard.press('ControlOrMeta+c');
await page.waitForTimeout(1600);
const chartCopy = await page.evaluate(() => ({
    copied: window.__copied,
    toast: (document.getElementById('ps-toast') || {}).textContent || ''
}));
if (chartCopy.copied.length !== 1 ||
    chartCopy.copied[0].type !== 'image/png' ||
    chartCopy.copied[0].sig !== '137,80,78,71,13,10,26,10' ||
    chartCopy.copied[0].size < 15000)
    throw new Error('chart Cmd+C did not write a valid PNG: ' +
                    JSON.stringify(chartCopy));
if (!/copied as an image/i.test(chartCopy.toast))
    throw new Error('no confirmation toast: ' + chartCopy.toast);
console.log('  ok  Cmd/Ctrl+C copies the chart as a valid 2x PNG with a toast');

// The Data workspace keeps its own copy semantics.
await page.click('[data-ps-workspace="data"]');
await page.waitForTimeout(500);
await page.evaluate(() => { window.__copied = []; });
await page.keyboard.press('ControlOrMeta+c');
await page.waitForTimeout(600);
if ((await page.evaluate(() => window.__copied.length)) !== 0)
    throw new Error('Data-workspace Cmd+C wrongly wrote an image');
console.log('  ok  Data workspace keeps its TSV copy (no image hijack)');

// Edit menu exposes the command, enabled on charts.
await page.click('[data-ps-workspace="chart"]');
await page.waitForTimeout(400);
await page.click('[data-ps-menu="edit"]');
await page.waitForTimeout(300);
// Matched on the command, not the prose: t3-46 put a plain "Copy" in this menu,
// so this entry now names what it will copy and the label moves with the
// workspace.
const menu = await page.evaluate(() => {
    const b = document.querySelector('#ps-appmenu [data-app-command="copy-image"]');
    return b ? { disabled: b.disabled, label: b.textContent.trim() } : null;
});
if (!menu || menu.disabled)
    throw new Error('Edit menu lacks an enabled image copy: ' +
                    JSON.stringify(menu));
if (!/^Copy chart as image/.test(menu.label))
    throw new Error('on a chart it should say what it copies: ' + menu.label);
console.log('  ok  Edit menu carries an enabled "' + menu.label + '"');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

// Layouts copy the composed page.
await page.evaluate(() => { window.PS_SHELL.createLayoutFromTemplate('single'); });
await page.waitForTimeout(1200);
await page.evaluate(() => { window.__copied = []; });
await page.keyboard.press('ControlOrMeta+c');
await page.waitForTimeout(1800);
const layoutCopy = await page.evaluate(() => window.__copied);
if (layoutCopy.length !== 1 || layoutCopy[0].type !== 'image/png' ||
    layoutCopy[0].size < 10000)
    throw new Error('layout Cmd+C did not write a PNG: ' +
                    JSON.stringify(layoutCopy));
console.log('  ok  layouts copy the composed page as a PNG');

// And the menu says so, rather than promising a chart it will not copy.
await page.click('[data-ps-menu="edit"]');
await page.waitForTimeout(300);
const layLabel = await page.evaluate(() => {
    const b = document.querySelector('#ps-appmenu [data-app-command="copy-image"]');
    return b ? b.textContent.trim() : null;
});
if (!/^Copy layout as image/.test(layLabel || ''))
    throw new Error('the menu still promises a chart in Layouts: ' + layLabel);
console.log('  ok  and the Edit entry reads "' + layLabel + '" there');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

if (errors.length) throw new Error(errors[0]);
await browser.close();
console.log('COPY IMAGE CHECK: ALL GREEN');
