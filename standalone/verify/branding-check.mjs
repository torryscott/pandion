// Real-browser smoke for the initial Pandion Plots branding pass.
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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
await page.goto(pageUrl);
await page.waitForTimeout(350);

if (!(await page.locator('#ps-welcome').isVisible()) ||
    await page.locator('#ps-welcome-title').textContent() !==
        'Welcome to Pandion Plots')
    throw new Error('start screen did not adopt Pandion Plots');
const welcomeLogo = page.locator('.ps-welcome-logo .ps-brand-logo');
const welcomeBox = await welcomeLogo.boundingBox();
if (!welcomeBox || Math.abs(welcomeBox.height - welcomeBox.width) > 2 ||
    await welcomeLogo.locator('use').getAttribute('href') !==
        '#ps-pandion-wing')
    throw new Error('start screen does not use the supplied square wing mark');
if (await page.locator('#ps-pandion-wing path').count() !== 2)
    throw new Error('embedded Pandion wing artwork is incomplete');
console.log('  ok  start screen uses the supplied Pandion wing vector mark');

await page.click('#ps-welcome-sample');
await page.waitForTimeout(180);
if (await page.locator('.ps-brand strong').textContent() !== 'Pandion Plots' ||
    await page.locator('.ps-brand').getAttribute('aria-label') !==
        'Pandion Plots' ||
    await page.locator('.ps-brand .ps-brand-logo use').getAttribute('href') !==
        '#ps-pandion-wing')
    throw new Error('application header branding is incomplete');
if (!(await page.title()).endsWith('· Pandion Plots'))
    throw new Error(`document title is not branded: ${await page.title()}`);
console.log('  ok  app chrome and document title use Pandion Plots');

await page.click('[data-ps-menu="help"]');
if (!(await page.locator('#ps-appmenu').getByText(
    'About Pandion Plots', { exact: true }).isVisible()))
    throw new Error('Help menu retains the provisional product name');
await page.keyboard.press('Escape');

const compatibility = await page.evaluate(() => {
    const file = JSON.parse(window.PS_SHELL.projectFileText());
    return {
        kind: file.kind,
        app: file.app,
        diagnostics: window.PS_SHELL.diagnosticsText()
    };
});
if (compatibility.kind !== 'pandion-plots-project' ||
    compatibility.app !== 'pandion-plots-standalone' ||
    !compatibility.diagnostics.includes('Pandion Plots'))
    throw new Error(`branding or project compatibility diverged: ` +
                    JSON.stringify(compatibility));
console.log('  ok  diagnostics are branded while .pand identity stays compatible');

if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
await browser.close();
console.log('BRANDING CHECK: ALL GREEN');
