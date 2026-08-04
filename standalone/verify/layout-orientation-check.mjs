// Real-browser smoke for layout gallery and editable page orientation.
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
const page = await browser.newPage({ viewport: { width: 1500, height: 960 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
await page.goto(pageUrl);
await page.waitForTimeout(350);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(150);
}
await page.evaluate(() => {
    window.PS_SHELL.addChart('plotbuilder');
    window.PS_SHELL.showLayoutGallery();
});
await page.waitForTimeout(120);

if (await page.locator('[data-layout-orientation]').count() !== 2 ||
    await page.locator('[data-layout-template]').count() !== 8)
    throw new Error('orientation duplicated or replaced the template gallery');
// Aug 1 2026 (Torry): the gallery preselected "single" whenever charts
// existed, so a fresh layout arrived with a chart nobody placed. BLANK is
// the default now; templates are an explicit choice.
if (await page.locator('[data-layout-template="blank"]')
        .getAttribute('aria-pressed') !== 'true')
    throw new Error('the gallery must preselect Blank, not auto-place a chart');
console.log('  ok  the gallery defaults to Blank: no chart appears unplaced');
const landscapePreview = await page.locator(
    '[data-layout-template="single"] .ps-layout-template-preview').boundingBox();
if (landscapePreview.width <= landscapePreview.height)
    throw new Error('Landscape does not retain the established preview');

await page.click('[data-layout-orientation="portrait"]');
await page.waitForTimeout(80);
const portraitPreview = await page.locator(
    '[data-layout-template="single"] .ps-layout-template-preview').boundingBox();
if (portraitPreview.height <= portraitPreview.width ||
    await page.locator(
        '[data-layout-orientation="portrait"]').getAttribute('aria-pressed') !==
        'true')
    throw new Error('Portrait did not adapt the existing gallery previews');
console.log('  ok  one gallery switches the same templates between orientations');

await page.click('[data-layout-template="main-side"]');
await page.click('#ps-layout-gallery-create');
await page.waitForTimeout(220);
const portraitLayout = await page.evaluate(() => {
    const layout = window.PS_SHELL.charts().find(doc =>
        doc.id === window.PS_SHELL.workspaceDocument());
    return {
        page: layout.page,
        charts: layout.items.filter(item => item.kind === 'chart')
    };
});
if (portraitLayout.page.h <= portraitLayout.page.w ||
    portraitLayout.charts.length !== 2 ||
    portraitLayout.charts[0].y >= portraitLayout.charts[1].y ||
    portraitLayout.charts[0].h <= portraitLayout.charts[1].h)
    throw new Error(`portrait Main + supporting did not adapt vertically: ` +
                    JSON.stringify(portraitLayout));
if (await page.locator('#ps-layout-orientation').inputValue() !== 'portrait')
    throw new Error('Layout inspector did not reflect Portrait');
console.log('  ok  Portrait creates an adapted vertical hierarchy');

await page.selectOption('#ps-layout-orientation', 'landscape');
await page.waitForTimeout(180);
const landscapeLayout = await page.evaluate(() => {
    const layout = window.PS_SHELL.charts().find(doc =>
        doc.id === window.PS_SHELL.workspaceDocument());
    const inside = layout.items.filter(item => item.kind === 'chart')
        .every(item => item.x >= 0 && item.y >= 0 &&
            item.x + item.w <= layout.page.w &&
            item.y + item.h <= layout.page.h);
    return { page: layout.page, inside };
});
if (landscapeLayout.page.w <= landscapeLayout.page.h ||
    !landscapeLayout.inside ||
    await page.locator('#ps-lpage').inputValue() !== 'canvas')
    throw new Error(`inspector orientation change did not preserve the layout: ` +
                    JSON.stringify(landscapeLayout));
console.log('  ok  the inspector changes orientation without clipping items');

await page.selectOption('#ps-lpage', 'letterp');
await page.waitForTimeout(150);
if (await page.locator('#ps-layout-orientation').inputValue() !== 'portrait')
    throw new Error('page presets and inspector orientation diverged');
console.log('  ok  portrait page presets stay synchronized with the inspector');

if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
await browser.close();
console.log('LAYOUT ORIENTATION CHECK: ALL GREEN');
