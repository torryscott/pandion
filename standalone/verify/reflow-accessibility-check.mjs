// Rendered 200%/400% reflow, WCAG text-spacing, and focus-obscuration matrix
// for the standalone application.
//
// Two-dimensional chart, data-grid, and layout surfaces may scroll. The
// application frame, its command bars, dialogs, drawers, and lower editor may
// not create page-level overflow, clip their controls, or hide keyboard focus.
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
const page = await browser.newPage({ viewport: { width: 640, height: 720 } });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(String(error)));
await page.goto(pageUrl);
await page.waitForTimeout(650);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(900);

async function frameGeometry(label) {
    const report = await page.evaluate(() => {
        const viewport = {
            width: document.documentElement.clientWidth,
            height: document.documentElement.clientHeight,
        };
        const topLevel = [
            '.ps-appbar', '.ps-commandbar', '.ps-main-workspace',
            '.ps-statusbar',
        ].map(selector => {
            const node = document.querySelector(selector);
            const rect = node.getBoundingClientRect();
            return {
                selector,
                left: Math.round(rect.left),
                right: Math.round(rect.right),
                top: Math.round(rect.top),
                bottom: Math.round(rect.bottom),
            };
        });
        const clippedControls = Array.from(document.querySelectorAll(
            'button, a[href], input, select, textarea, label'))
          .filter(node => {
              const style = getComputedStyle(node);
              const rect = node.getBoundingClientRect();
              if (style.display === 'none' || style.visibility === 'hidden' ||
                  rect.width <= 2 || rect.height <= 2 ||
                  style.clip !== 'auto' || style.clipPath !== 'none')
                  return false;
              if (node.closest(
                  '.ps-datagrid, #ps-lviewport, ' +
                  '.graphbuilder2-host [data-role="chart-toolbar"]'))
                  return false;
              return style.overflow !== 'visible' &&
                  (node.scrollWidth > node.clientWidth + 1 ||
                   node.scrollHeight > node.clientHeight + 1);
          })
          .map(node => ({
              node: node.id || node.className || node.tagName,
              client: node.clientWidth + 'x' + node.clientHeight,
              scroll: node.scrollWidth + 'x' + node.scrollHeight,
          })).slice(0, 12);
        return {
            viewport,
            pageWidth: document.documentElement.scrollWidth,
            topLevel,
            clippedControls,
        };
    });
    ok(report.pageWidth <= report.viewport.width + 1,
       `${label} has no page-level horizontal overflow ` +
       `(${report.pageWidth}/${report.viewport.width})`);
    ok(report.topLevel.every(rect =>
        rect.left >= -1 && rect.right <= report.viewport.width + 1 &&
        rect.top >= -1 && rect.bottom <= report.viewport.height + 1),
       `${label} keeps the application frame inside the viewport ` +
       `(${JSON.stringify(report.topLevel)})`);
    ok(report.clippedControls.length === 0,
       `${label} has no clipped controls outside its intentional 2-D scrollers ` +
       `(${JSON.stringify(report.clippedControls)})`);
}

async function focusVisibility(label, rootSelector = 'body') {
    const report = await page.evaluate(async rootSel => {
        const root = document.querySelector(rootSel);
        const selectors = [
            'button:not([disabled])', 'a[href]', 'input:not([disabled])',
            'select:not([disabled])', 'textarea:not([disabled])',
            '[tabindex]:not([tabindex="-1"])',
        ].join(',');
        const nodes = Array.from(root.querySelectorAll(selectors))
          .filter((node, index, all) => all.indexOf(node) === index)
          .filter(node => {
              const style = getComputedStyle(node);
              const rect = node.getBoundingClientRect();
              return style.display !== 'none' && style.visibility !== 'hidden' &&
                  rect.width > 0 && rect.height > 0 &&
                  !node.closest('[inert], [aria-hidden="true"]');
          }).slice(0, 180);
        const obscured = [];
        // Judge RESTING visibility only: focusing can legitimately animate
        // chrome (the narrow drawers close on focus-out and re-open with a
        // slide when focus returns), and a rect captured mid-animation
        // reports a control off-screen that lands on-screen a few frames
        // later. Wait for the element's position to hold still.
        const settle = el => new Promise(resolve => {
            let last = el.getBoundingClientRect().left;
            let tries = 0;
            const tick = () => {
                const now = el.getBoundingClientRect().left;
                if (Math.abs(now - last) < 0.5 || ++tries > 30) return resolve();
                last = now;
                requestAnimationFrame(() => requestAnimationFrame(tick));
            };
            requestAnimationFrame(() => requestAnimationFrame(tick));
        });
        for (const node of nodes) {
            node.focus({ preventScroll: true });
            // Export format radios are visually represented by their adjacent
            // card; the transparent native input owns focus while :focus-
            // visible outlines that card. Test the actual indicator surface.
            const visual = node.matches('.ps-export-format input') &&
                node.nextElementSibling ? node.nextElementSibling : node;
            visual.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            await settle(visual);
            const rect = visual.getBoundingClientRect();
            const left = Math.max(0, rect.left);
            const right = Math.min(innerWidth, rect.right);
            const top = Math.max(0, rect.top);
            const bottom = Math.min(innerHeight, rect.bottom);
            let exposed = false;
            if (right > left && bottom > top) {
                const points = [
                    [(left + right) / 2, (top + bottom) / 2],
                    [left + 1, top + 1], [right - 1, top + 1],
                    [left + 1, bottom - 1], [right - 1, bottom - 1],
                ];
                exposed = points.some(point => {
                    const hit = document.elementFromPoint(point[0], point[1]);
                    return !!hit &&
                        (visual.contains(hit) || hit.contains(visual));
                });
            }
            if (!exposed) obscured.push({
                node: node.id || node.getAttribute('aria-label') ||
                    node.textContent.trim().slice(0, 35) || node.tagName,
                rect: [
                    Math.round(rect.left), Math.round(rect.top),
                    Math.round(rect.right), Math.round(rect.bottom),
                ],
                hit: (() => {
                    const x = Math.max(0, Math.min(innerWidth - 1,
                        (left + right) / 2));
                    const y = Math.max(0, Math.min(innerHeight - 1,
                        (top + bottom) / 2));
                    const found = document.elementFromPoint(x, y);
                    if (!found) return null;
                    const trail = [];
                    let current = found;
                    while (current && trail.length < 4) {
                        trail.push(current.id ||
                            (typeof current.className === 'string' &&
                             current.className) || current.tagName);
                        current = current.parentElement;
                    }
                    return trail.join(' > ');
                })(),
                active: document.activeElement === node,
            });
            if (obscured.length >= 12) break;
        }
        return { checked: nodes.length, obscured };
    }, rootSelector);
    ok(report.checked > 0 && report.obscured.length === 0,
       `${label} leaves all ${report.checked} focus targets at least partly ` +
       `visible (${JSON.stringify(report.obscured)})`);
}

async function setWorkspace(workspace) {
    await page.evaluate(value => window.PS_SHELL.setWorkspace(value), workspace);
    await page.waitForTimeout(workspace === 'chart' ? 500 : 260);
}

console.log('case 1: 200% and 400% equivalent workspace widths');
for (const width of [640, 320]) {
    await page.setViewportSize({ width, height: width === 320 ? 640 : 720 });
    for (const workspace of ['chart', 'data']) {
        await setWorkspace(workspace);
        await frameGeometry(`${workspace} workspace at ${width}px`);
        await focusVisibility(`${workspace} workspace at ${width}px`);
    }
    await page.evaluate(async () => {
        if (!window.PS_SHELL.charts().some(chart => chart.type === 'layout'))
            window.PS_SHELL.addLayout();
        window.PS_SHELL.setWorkspace('layout');
    });
    await page.waitForTimeout(500);
    await frameGeometry(`layout workspace at ${width}px`);
    await focusVisibility(`layout workspace at ${width}px`);
}

console.log('case 2: complete WCAG text-spacing override at 320px');
await page.addStyleTag({ content: `
    * { line-height: 1.5 !important; letter-spacing: .12em !important;
        word-spacing: .16em !important; }
    p { margin-bottom: 2em !important; }
` });
await page.waitForTimeout(120);
for (const workspace of ['chart', 'data', 'layout']) {
    await setWorkspace(workspace);
    await frameGeometry(`${workspace} workspace with text spacing`);
    await focusVisibility(`${workspace} workspace with text spacing`);
}

async function inspectDialog(label, id, open) {
    await page.focus('#ps-load');
    await open();
    await page.waitForTimeout(130);
    const geometry = await page.evaluate(dialogId => {
        const dialog = document.getElementById(dialogId);
        const card = dialog.querySelector(
            '.ps-dialog-card, .ps-command-palette-card, ' +
            '.ps-loader-card, .ps-export-card');
        const rect = card.getBoundingClientRect();
        const clipped = Array.from(card.querySelectorAll(
            'button, a[href], input, select, textarea, label, p, h2, h3'))
          .filter(node => {
              const style = getComputedStyle(node);
              const box = node.getBoundingClientRect();
              return style.display !== 'none' && style.visibility !== 'hidden' &&
                  box.width > 0 && box.height > 0 &&
                  style.overflow !== 'visible' &&
                  (node.scrollWidth > node.clientWidth + 1 ||
                   (node.tagName !== 'TEXTAREA' &&
                    node.scrollHeight > node.clientHeight + 1));
          }).map(node => node.id || node.className || node.tagName).slice(0, 10);
        const wide = Array.from(card.querySelectorAll('*'))
          .filter(node => {
              const style = getComputedStyle(node);
              const box = node.getBoundingClientRect();
              return style.display !== 'none' && box.width > 0 &&
                  (node.scrollWidth > node.clientWidth + 1 ||
                   box.right > rect.right + 1 || box.left < rect.left - 1);
          }).map(node => ({
              node: node.id || node.className || node.tagName,
              client: node.clientWidth,
              scroll: node.scrollWidth,
              box: Math.round(node.getBoundingClientRect().left) + '..' +
                  Math.round(node.getBoundingClientRect().right),
          })).slice(0, 12);
        return {
            rect: [rect.left, rect.top, rect.right, rect.bottom],
            scroll: [card.clientWidth, card.scrollWidth,
                     card.clientHeight, card.scrollHeight],
            viewport: [innerWidth, innerHeight],
            clipped,
            wide,
        };
    }, id);
    ok(geometry.rect[0] >= -1 && geometry.rect[1] >= -1 &&
       geometry.rect[2] <= geometry.viewport[0] + 1 &&
       geometry.rect[3] <= geometry.viewport[1] + 1 &&
       geometry.scroll[1] <= geometry.scroll[0] + 1,
       `${label} stays inside 320×640 and scrolls vertically when needed ` +
       `(${JSON.stringify(geometry)})`);
    ok(geometry.clipped.length === 0,
       `${label} does not clip text with WCAG spacing ` +
       `(${geometry.clipped.join(', ') || 'none'})`);
    await focusVisibility(`${label} focus`, '#' + id);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(50);
}

console.log('case 3: every ordinary specialized dialog at 320px');
await inspectDialog('New chart', 'ps-analysis-gallery',
    () => page.evaluate(() => window.PS_SHELL.runCommand('new-chart')));
await inspectDialog('Help me choose', 'ps-help-choose',
    () => page.evaluate(() => window.PS_SHELL.showHelpMeChoose()));
await inspectDialog('New layout', 'ps-layout-gallery',
    () => page.evaluate(() => window.PS_SHELL.runCommand('new-layout')));
await inspectDialog('Computed variable', 'ps-formula-dialog',
    () => page.evaluate(() => window.PS_SHELL.runCommand('data-compute')));
await inspectDialog('Reshape', 'ps-reshape-dialog',
    () => page.evaluate(() => window.PS_SHELL.runCommand('data-reshape')));
await inspectDialog('Preferences', 'ps-preferences',
    () => page.evaluate(() => window.PS_SHELL.runCommand('preferences')));
await inspectDialog('About', 'ps-about-dialog',
    () => page.evaluate(() => window.PS_SHELL.runCommand('about')));
await inspectDialog('What’s new', 'ps-whatsnew-dialog',
    () => page.evaluate(() => window.PS_SHELL.runCommand('whats-new')));
await inspectDialog('Keyboard shortcuts', 'ps-shortcuts-dialog',
    () => page.evaluate(() => window.PS_SHELL.runCommand('shortcuts')));
await inspectDialog('Diagnostics', 'ps-diagnostics',
    () => page.evaluate(() => window.PS_SHELL.runCommand('diagnostics')));
await inspectDialog('Show me how', 'ps-tour-dialog',
    () => page.evaluate(() => window.PS_SHELL.runCommand('show-me-how')));
await inspectDialog('Command Palette', 'ps-command-palette',
    () => page.evaluate(() => window.PS_SHELL.runCommand('command-palette')));
await inspectDialog('Load Data', 'ps-loader',
    () => page.evaluate(() => window.PS_SHELL.openLoader()));
await setWorkspace('chart');
await inspectDialog('Export', 'ps-exporter',
    () => page.evaluate(() => window.PS_SHELL.runCommand('export')));

console.log('case 4: narrow drawers, filter dialog, and lower chart editor');
await setWorkspace('chart');
for (const [button, root, label] of [
    ['#ps-narrow-nav', '.ps-project-panel', 'project drawer'],
    ['#ps-narrow-inspector', '.ps-controls', 'settings drawer'],
    ['#ps-narrow-menu', '.ps-menubar', 'application-menu drawer'],
]) {
    await page.focus(button);
    await page.keyboard.press('Enter');
    // The drawers SLIDE in (a transform transition): hit-testing before
    // the slide settles photographs controls mid-flight and reports
    // them off-screen - the failure x drifted run to run (358, 328,
    // 395...), the classic mid-animation signature. Wait for the
    // drawer's position to hold still across frames.
    await page.waitForFunction(sel => new Promise(resolve => {
        const el = document.querySelector(sel);
        if (!el) return resolve(false);
        const r0 = el.getBoundingClientRect();
        // OPEN (real size) and STILL (same spot two frames later, and no
        // live transform): a first poll that lands before the drawer even
        // starts opening must not read hidden-at-zero as settled.
        if (r0.width < 50) return resolve(false);
        requestAnimationFrame(() => requestAnimationFrame(() => {
            const r1 = el.getBoundingClientRect();
            resolve(Math.abs(r1.left - r0.left) < 0.5 &&
                    getComputedStyle(el).transform === 'none');
        }));
    }), root, { timeout: 3000 });
    await page.waitForTimeout(60);
    await focusVisibility(label + ' open');
    await focusVisibility(label + ' contents', root);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(50);
}

await setWorkspace('data');
await page.click('#ps-data-filter-btn');
await page.waitForTimeout(80);
const filterGeometry = await page.evaluate(() => {
    const node = document.getElementById('ps-filtermenu');
    const rect = node.getBoundingClientRect();
    return {
        rect: [rect.left, rect.top, rect.right, rect.bottom],
        viewport: [innerWidth, innerHeight],
        horizontalOverflow: node.scrollWidth - node.clientWidth,
    };
});
ok(filterGeometry.rect[0] >= -1 && filterGeometry.rect[1] >= -1 &&
   filterGeometry.rect[2] <= filterGeometry.viewport[0] + 1 &&
   filterGeometry.rect[3] <= filterGeometry.viewport[1] + 1 &&
   filterGeometry.horizontalOverflow <= 1,
   `row-filter dialog fits the reflow viewport ` +
   `(${JSON.stringify(filterGeometry)})`);
await focusVisibility('row-filter dialog focus', '#ps-filtermenu');
await page.keyboard.press('Escape');

await setWorkspace('chart');
const lowerOpened = await page.evaluate(() => {
    const bar = document.querySelector('svg [data-bar-cat]');
    if (!bar) return false;
    for (const type of ['pointerdown', 'pointerup', 'click'])
        bar.dispatchEvent(new PointerEvent(type, {
            bubbles: true, cancelable: true, pointerId: 1, isPrimary: true,
        }));
    return true;
});
await page.waitForTimeout(400);
ok(lowerOpened && await page.locator('.gb2-panel').isVisible(),
   'a chart part opens the lower editor for the reflow pass');
await frameGeometry('chart with lower editor and text spacing');
await focusVisibility('shared lower chart editor focus', '.gb2-panel');

ok(pageErrors.length === 0,
   `the reflow matrix produced no page errors ` +
   `(${pageErrors.join(' | ') || 'none'})`);
await browser.close();
console.log('\nSTANDALONE REFLOW ACCESSIBILITY: PASS');
