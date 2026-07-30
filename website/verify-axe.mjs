// Whole-page axe gate for every public marketing page and the deployed guide.
//
// Serious/critical WCAG A/AA violations and every WCAG 2.2 target-size
// result block release preparation. Interactive guide and mobile-navigation
// states are opened before scanning; these states are not represented by
// source-only contracts.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function resolveFrom(name) {
    for (const base of [process.cwd(), new URL('.', import.meta.url).pathname,
                        '/private/tmp', '/tmp']) {
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
const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
const blockers = [];
page.on('pageerror', error => pageErrors.push(String(error)));

async function audit(label) {
    if (!await page.evaluate(() => !!window.axe))
        await page.addScriptTag({ content: axeSource });
    const violations = await page.evaluate(async axeTags => {
        const result = await window.axe.run(document, {
            runOnly: { type: 'tag', values: axeTags },
            resultTypes: ['violations'],
        });
        return result.violations.map(violation => ({
            id: violation.id,
            impact: violation.impact || 'unknown',
            nodes: violation.nodes.length,
            targets: violation.nodes.slice(0, 4).map(node =>
                node.target.join(' ')),
        }));
    }, tags);
    const stateBlockers = violations.filter(violation =>
        violation.id === 'target-size' ||
        violation.impact === 'critical' || violation.impact === 'serious');
    blockers.push(...stateBlockers.map(violation => ({
        ...violation, state: label,
    })));
    if (!violations.length) {
        console.log('  ok  ' + label + ': no A/AA violations');
        return;
    }
    if (!stateBlockers.length) {
        console.log('  ok  ' + label + ': no blocking violations (' +
            violations.map(item => item.id + ' x' + item.nodes).join(', ') +
            ')');
        return;
    }
    console.log('  FAIL ' + label);
    for (const violation of stateBlockers)
        console.log('       [' + violation.impact + '] ' + violation.id +
            ' x' + violation.nodes + ' — ' +
            violation.targets.join(', '));
}

const publicPages = [
    ['Home', 'website/index.html'],
    ['Gallery', 'website/gallery.html'],
    ['Downloads', 'website/download.html'],
    ['About', 'website/about.html'],
    ['Support', 'website/support.html'],
    ['Accessibility', 'website/accessibility.html'],
    ['Not found', 'website/404.html'],
];

console.log('case 1: every public page at desktop and reflow widths');
for (const [label, relative] of publicPages) {
    for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(fileUrl(relative));
        await page.waitForTimeout(80);
        await audit(label + ' at ' + width + 'px');
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
if (blockers.length || pageErrors.length) {
    console.log('\nWEBSITE AXE CHECK: ' +
        (blockers.length + pageErrors.length) + ' BLOCKING FAILURE(S)');
    process.exit(1);
}
console.log('\nWEBSITE AXE CHECK: PASS');
