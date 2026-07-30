// Website resize, reflow, text-spacing, long-label, and focus-obscuration gate.
//
// A 640 CSS-pixel viewport represents a 1280px laptop at 200% zoom; 320 CSS
// pixels represents the WCAG 1.4.10 reflow requirement (typically 400% on the
// same display). The text override is the exact WCAG 1.4.12 test matrix.
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
const root = path.resolve(new URL('.', import.meta.url).pathname, '..');
const fileUrl = relative => 'file://' + path.join(root, relative);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 640, height: 800 } });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(String(error)));

const publicPages = [
    ['Home', 'website/index.html'],
    ['Gallery', 'website/gallery.html'],
    ['Downloads', 'website/download.html'],
    ['About', 'website/about.html'],
    ['Support', 'website/support.html'],
    ['Accessibility', 'website/accessibility.html'],
    ['Not found', 'website/404.html'],
];
const textSpacingCss = `
    * { line-height: 1.5 !important; letter-spacing: .12em !important;
        word-spacing: .16em !important; }
    p { margin-bottom: 2em !important; }
`;
const translatedLabels = [
    'Übersicht und Einführung',
    'Beispielvisualisierungen',
    'Herunterladen und installieren',
    'Ausführliche Produktinformationen',
    'Unterstützung und Fehlerbehebung',
    'Erklärung zur Barrierefreiheit',
    'Pandion Plots im Browser ausprobieren',
];

async function layoutState() {
    return page.evaluate(() => {
        const clipped = Array.from(document.querySelectorAll(
            'a, button, p, li, label, summary, figcaption, h1, h2, h3, h4'))
            .filter(node => {
                const style = getComputedStyle(node);
                const rect = node.getBoundingClientRect();
                if (style.display === 'none' || style.visibility === 'hidden' ||
                    rect.width === 0 || rect.height === 0) return false;
                return (style.overflowX !== 'visible' &&
                        node.scrollWidth > node.clientWidth + 1) ||
                       (style.overflowY !== 'visible' &&
                        node.scrollHeight > node.clientHeight + 1);
            })
            .slice(0, 8)
            .map(node => node.tagName + '.' + node.className + '=' +
                (node.textContent || '').trim().slice(0, 45));
        return {
            viewport: document.documentElement.clientWidth,
            pageWidth: document.documentElement.scrollWidth,
            clipped,
        };
    });
}

async function assertReflow(label) {
    const state = await layoutState();
    ok(state.pageWidth <= state.viewport + 1,
        label + ' has no page-level horizontal overflow',
        state.pageWidth + '/' + state.viewport);
    ok(state.clipped.length === 0, label + ' has no clipped text',
        state.clipped.join(' | '));
}

async function assertFocusNotObscured(label, selector = 'body') {
    const focusables = page.locator(selector).locator(
        'a[href], button:not([disabled]), input:not([disabled]), ' +
        'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
    const count = await focusables.count();
    let checked = 0;
    for (let index = 0; index < count; index++) {
        const node = focusables.nth(index);
        if (!await node.isVisible()) continue;
        await node.scrollIntoViewIfNeeded();
        await node.focus();
        await page.waitForTimeout(12);
        const state = await node.evaluate(element => {
            const rect = element.getBoundingClientRect();
            const header = document.querySelector('header');
            const headerRect = header ? header.getBoundingClientRect() : null;
            const inHeader = !!element.closest('header');
            const isSkipLink = element.classList.contains('skip-link');
            const style = getComputedStyle(element);
            return {
                name: element.getAttribute('aria-label') ||
                    (element.textContent || '').trim().slice(0, 45) ||
                    element.tagName,
                visible: style.display !== 'none' &&
                    style.visibility !== 'hidden' &&
                    rect.width > 0 && rect.height > 0,
                top: rect.top,
                bottom: rect.bottom,
                left: rect.left,
                right: rect.right,
                headerBottom: headerRect ? headerRect.bottom : 0,
                inHeader,
                isSkipLink,
                viewportWidth: innerWidth,
                viewportHeight: innerHeight,
            };
        });
        if (!state.visible) continue;
        checked++;
        const horizontallyVisible = state.right > 0 &&
            state.left < state.viewportWidth;
        const verticallyVisible = state.bottom > 0 &&
            state.top < state.viewportHeight;
        const clearsStickyHeader = state.inHeader || state.isSkipLink ||
            state.top >= state.headerBottom - 1;
        if (!(horizontallyVisible && verticallyVisible &&
              clearsStickyHeader))
            throw new Error(label + ' obscures focus on ' + state.name +
                ': ' + JSON.stringify(state));
    }
    ok(checked > 0,
        label + ' keeps ' + checked + ' visible focus targets unobscured');
}

console.log('case 1: every public page reflows at 200% and 400% equivalents');
for (const [label, relative] of publicPages) {
    for (const width of [640, 320]) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(fileUrl(relative));
        await page.waitForTimeout(80);
        await assertReflow(label + ' at ' + width + ' CSS px');
    }
}

console.log('case 2: every public page survives the WCAG text-spacing override');
for (const [label, relative] of publicPages) {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(fileUrl(relative));
    await page.addStyleTag({ content: textSpacingCss });
    await page.waitForTimeout(80);
    await assertReflow(label + ' with WCAG text spacing');
}

console.log('case 3: translated-like labels wrap instead of clipping');
for (const [label, relative] of publicPages) {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(fileUrl(relative));
    await page.evaluate(labels => {
        const links = Array.from(document.querySelectorAll('.nav-links a'));
        links.forEach((link, index) => {
            link.textContent = labels[index % labels.length];
        });
        const toggle = document.querySelector('.nav-toggle');
        if (toggle) {
            const text = Array.from(toggle.childNodes).find(node =>
                node.nodeType === Node.TEXT_NODE);
            if (text) text.nodeValue = ' Ausführliches Navigationsmenü';
        }
        const primary = document.querySelector(
            'main a.btn, main button, main [role="button"]');
        if (primary)
            primary.textContent =
                'Ausführliche Informationen anzeigen und anschließend fortfahren';
    }, translatedLabels);
    const toggle = page.locator('.nav-toggle');
    if (await toggle.count() && await toggle.isVisible())
        await toggle.click();
    await page.addStyleTag({ content: textSpacingCss });
    await page.waitForTimeout(80);
    await assertReflow(label + ' with translated-like labels');
}

console.log('case 4: sticky marketing chrome never obscures focused controls');
for (const [label, relative] of publicPages) {
    for (const width of [640, 320]) {
        await page.setViewportSize({ width, height: 640 });
        await page.goto(fileUrl(relative));
        await page.waitForTimeout(60);
        await assertFocusNotObscured(label + ' at ' + width + 'px');
        const toggle = page.locator('.nav-toggle');
        if (await toggle.count() && await toggle.isVisible()) {
            await toggle.click();
            await page.waitForTimeout(40);
            await assertFocusNotObscured(
                label + ' open navigation at ' + width + 'px', 'header');
        }
    }
}

await browser.close();
if (pageErrors.length) {
    console.log('  FAIL page errors: ' + pageErrors.join(' | '));
    process.exit(1);
}
console.log('WEBSITE REFLOW CHECK: PASS');
