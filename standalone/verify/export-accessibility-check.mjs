// Accessible-export contract for the shared SVG serializer and standalone
// export workflow.
//
// SVG must remain a named/described image outside Pandion. PDF receives the
// same title/description as document metadata, while raster users receive
// copyable companion text plus honest attachment guidance.
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
function ok(condition, message, detail = '') {
    if (!condition)
        throw new Error(message + (detail ? ': ' + detail : ''));
    console.log('  ok  ' + message);
}

const { chromium } = loadPlaywright();
const pagePath = process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(String(error)));
await page.goto('file://' + pagePath);
await page.waitForTimeout(500);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(700);
}

console.log('case 1: the shared serializer embeds portable SVG semantics');
const shared = await page.evaluate(() => {
    const host = document.getElementById('psroot');
    const text = host.__gb2_serializeSvg();
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const root = doc.documentElement;
    return {
        role: root.getAttribute('role'),
        labelledby: root.getAttribute('aria-labelledby'),
        tabindex: root.getAttribute('tabindex'),
        title: root.querySelector(':scope > title')?.textContent || '',
        description: root.querySelector(':scope > desc')?.textContent || '',
        hook: host.__gb2_accessibleDescription(),
    };
});
ok(shared.role === 'img' &&
   shared.labelledby === 'gb2-export-title gb2-export-description' &&
   shared.tabindex === null,
   'shared SVG is a noninteractive named image', JSON.stringify(shared));
ok(shared.title.length > 3 && shared.description.length > 40 &&
   shared.hook === shared.description,
   'shared SVG title and description use the live generated chart summary');

console.log('case 2: the standalone export dialog supplies companion text');
await page.click('#ps-export');
await page.waitForTimeout(80);
const dialog = await page.evaluate(() => ({
    description: document.getElementById('ps-export-description').value,
    describedby: document.getElementById('ps-export-description')
        .getAttribute('aria-describedby'),
    help: document.getElementById('ps-export-description-help').textContent,
    copyName: document.getElementById('ps-export-copy-description').textContent,
}));
ok(dialog.description.length > 40 && /chart|plot/i.test(dialog.description),
   'the export dialog starts with a useful generated description',
   dialog.description);
ok(dialog.describedby === 'ps-export-description-help' &&
   /SVG embeds/i.test(dialog.help) && /PDF/i.test(dialog.help) &&
   /PNG or JPG/i.test(dialog.help) && /alt text|long description/i.test(dialog.help),
   'the dialog explains vector, PDF, and raster accessibility behavior');
ok(/Copy description/i.test(dialog.copyName),
   'raster publishers receive a direct copy-description action');

const custom = 'Scores increase from Control through High dose. ' +
    'The High dose group has the largest mean; error bars show standard errors.';
await page.fill('#ps-export-description', custom);
await page.click('#ps-export-copy-description');
await page.waitForTimeout(50);
const copyStatus = await page.locator('#ps-export-copy-status').textContent();
ok(/copied|blocked/i.test(copyStatus),
   'copy-description reports success or an honest browser restriction',
   copyStatus);

console.log('case 3: standalone SVG and PDF receive the edited description');
const standaloneSvg = await page.evaluate(async () => {
    const source = await window.PS_SHELL.exportSource('white');
    const doc = new DOMParser().parseFromString(source.svg, 'image/svg+xml');
    const root = doc.documentElement;
    return {
        role: root.getAttribute('role'),
        labelledby: root.getAttribute('aria-labelledby'),
        title: root.querySelector(':scope > title')?.textContent || '',
        description: root.querySelector(':scope > desc')?.textContent || '',
    };
});
ok(standaloneSvg.role === 'img' &&
   standaloneSvg.labelledby ===
       'pandion-export-title pandion-export-description' &&
   standaloneSvg.description === custom,
   'standalone SVG embeds the edited companion description',
   JSON.stringify(standaloneSvg));

const pdf = await page.evaluate(async () => {
    const blob = await window.PS_SHELL.exportBlob('pdf', 96, 'white');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.slice(i, i + 8192));
    return { type: blob.type, binary };
});
ok(pdf.type === 'application/pdf' && pdf.binary.startsWith('%PDF'),
   'accessible PDF path still produces a valid vector PDF');
ok(pdf.binary.includes(custom) ||
   (pdf.binary.includes('/Subject') &&
    pdf.binary.includes('Scores increase from Control')),
   'PDF document metadata carries the companion description');

await page.keyboard.press('Escape');
await page.waitForTimeout(50);
await page.click('#ps-export');
await page.waitForTimeout(50);
ok(await page.inputValue('#ps-export-description') === custom,
   'the edited description persists with the chart document');
await page.keyboard.press('Escape');

console.log('case 4: layout exports receive a figure-level description');
await page.evaluate(() => window.PS_SHELL.createLayoutFromTemplate('single'));
await page.waitForTimeout(700);
await page.evaluate(() => window.PS_SHELL.runCommand('layout-add-text'));
await page.waitForTimeout(150);
await page.click('#ps-export');
await page.waitForTimeout(50);
const layoutDescription = await page.inputValue('#ps-export-description');
ok(/Multi-panel figure/i.test(layoutDescription) &&
   /Visible text includes/i.test(layoutDescription),
   'layout export generates a figure-level item summary',
   layoutDescription);
const layoutSvg = await page.evaluate(async () => {
    const source = await window.PS_SHELL.exportSource('white');
    const doc = new DOMParser().parseFromString(source.svg, 'image/svg+xml');
    return {
        role: doc.documentElement.getAttribute('role'),
        desc: doc.documentElement.querySelector(':scope > desc')?.textContent || '',
    };
});
ok(layoutSvg.role === 'img' && layoutSvg.desc === layoutDescription,
   'layout SVG embeds its figure-level description');

ok(pageErrors.length === 0, 'export accessibility produced no page errors',
   pageErrors.join(' | '));
await browser.close();
console.log('EXPORT ACCESSIBILITY CHECK: PASS');
