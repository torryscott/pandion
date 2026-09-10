// Whole-page axe gate for every public marketing page and the deployed guide.
//
// All selected A/AA violations block release preparation, at any impact.
// Full violation and incomplete evidence is retained in PS_A11Y_OUT. Interactive guide and mobile-navigation
// states are opened before scanning; these states are not represented by
// source-only contracts.
import { websiteInventory } from './accessibility-inventory.mjs';
import { createAxeReport } from '../scripts/verify/axe-report.mjs';
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
        'website verify-axe: playwright and axe-core are required. ' +
        'For a local audit, install axe-core in /tmp.');
    process.exit(2);
}
const { chromium } = createRequire(playwrightPath)('playwright');
const axeSource = readFileSync(
    path.join(path.dirname(axePath), 'axe.min.js'), 'utf8');
const root = path.resolve(new URL('.', import.meta.url).pathname, '..');
const fileUrl = relative => 'file://' + path.join(root, relative);
const inventory = websiteInventory(path.join(root, 'website'));
const evidence = createAxeReport({ suite: 'website', artifact: path.join(root, 'website'), inventory });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(String(error)));

async function audit(label) {
    if (!await page.evaluate(() => !!window.axe))
        await page.addScriptTag({ content: axeSource });
    await evidence.scan(page, label);
}
async function auditDisclosures(label) {
    let visible = 0;
    for (const details of await page.locator('details').all()) {
        if (!await details.isVisible()) continue;
        visible++;
        if (await details.getAttribute('open') === null)
            await details.locator('summary').click();
    }
    if (visible) await audit(label + ' disclosures open');
}

const publicPages = inventory.filter(entry => entry.surface !== 'application')
    .map(entry => [entry.file, 'website/' + entry.file]);

console.log('case 1: every public page at desktop and reflow widths');
for (const [label, relative] of publicPages) {
    for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(fileUrl(relative));
        // Platform choice persists across teaching pages. Start from a known
        // edition so a prior page cannot hide this page's default content.
        if (await page.locator('[data-pf-choice="standalone"]').count())
            await page.locator('[data-pf-choice="standalone"]').click();
        await page.waitForTimeout(80);
        await audit(label + ' at ' + width + 'px');
        await auditDisclosures(label + ' standalone at ' + width + 'px');
        if (await page.locator('[data-pf-choice="jamovi"]').count()) {
            await page.locator('[data-pf-choice="jamovi"]').click();
            if (await page.locator('[data-pf-choice="jamovi"]').getAttribute('aria-pressed') !== 'true')
                throw new Error(label + ': the jamovi instructions did not activate');
            await audit(label + ' jamovi instructions at ' + width + 'px');
            await auditDisclosures(label + ' jamovi at ' + width + 'px');
        }
        if (width === 320 && await page.locator('.nav-toggle').isVisible()) {
            await page.locator('.nav-toggle').click();
            if (await page.locator('.nav-toggle').getAttribute('aria-expanded') !== 'true')
                throw new Error(label + ': the mobile navigation did not open');
            await audit(label + ' mobile navigation open');
        }
    }
}

console.log('case 2: marketing mobile navigation');
await page.setViewportSize({ width: 320, height: 800 });
await page.goto(fileUrl('website/index.html'));
await page.click('.nav-toggle');
await audit('Home with mobile navigation open');

console.log('case 3: guide default, drawer, search, and image dialog states');
await page.setViewportSize({ width: 1100, height: 800 });
await page.goto(fileUrl('website/docs/index.html'));
await page.waitForTimeout(180);
await audit('Guide desktop');

await page.setViewportSize({ width: 720, height: 800 });
await page.waitForTimeout(80);
await audit('Guide mobile drawer closed');
await page.click('#hamb');
await page.waitForTimeout(50);
await audit('Guide mobile drawer open');
await page.fill('#navsearch', 'chart');
await page.waitForTimeout(50);
await audit('Guide search results open');
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');

const imageButton = page.locator('.enlarge-button').first();
await imageButton.scrollIntoViewIfNeeded();
await imageButton.click();
await page.waitForTimeout(50);
await audit('Guide image dialog open');
await page.keyboard.press('Escape');

await page.setViewportSize({ width: 320, height: 800 });
await page.goto(fileUrl('website/docs/index.html'));
await page.waitForTimeout(100);
await audit('Guide at 320px');

if (pageErrors.length)
    console.log('  FAIL page errors: ' + pageErrors.join(' | '));
await browser.close();
const summary = evidence.finish(pageErrors);
if (summary.failed) {
    console.log('\nWEBSITE AXE CHECK: ' +
        (summary.blockingRules + summary.errors) + ' BLOCKING FAILURE(S)');
    process.exit(1);
}
console.log('\nWEBSITE AXE CHECK: PASS');
