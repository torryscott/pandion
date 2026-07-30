// Accessibility regression gate for the rendered verification battery:
// axe-core (WCAG A/AA tags) over representative pages in headless
// chromium, plus a structural contract on the chart svg (role/label/
// tabindex, the injected :focus-visible stylesheet, the live region).
// Baselined fully CLEAN on 2026-07-03 - any new violation fails.
//
// Deliberately ignored wrapper-only rules:
//   document-title, html-has-lang - the battery writes raw widget
//   fragments with no <html> wrapper; in production that document
//   belongs to jamovi's results iframe (upstream), not the module.
// WCAG 2.2 target-size is release blocking; compact controls must satisfy
// either the 24px minimum or the rule's spacing exception.
//
// Usage:  node scripts/verify/a11y-check.mjs
// Env:    GB2_VERIFY_OUT  dir holding the *.html files (default /tmp/gb2-verify)
//         GB2_NODE_BASE   a dir whose node_modules has playwright + axe-core
// Exit:   0 = clean, 1 = violations/contract failures, 2 = deps missing (skip)

import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function resolveFrom(name) {
    const bases = [];
    if (process.env.GB2_NODE_BASE) bases.push(process.env.GB2_NODE_BASE);
    bases.push(
        new URL('.', import.meta.url).pathname,
        process.cwd(),
        '/tmp',
        '/private/tmp',
    );
    for (const b of bases) {
        try { return createRequire(path.join(b, 'x.js')).resolve(name); }
        catch { /* next base */ }
    }
    return null;
}

const pwPath = resolveFrom('playwright');
const axePath = resolveFrom('axe-core');
if (!pwPath || !axePath) {
    console.error(
        'a11y-check: playwright and/or axe-core not found.\n' +
        'Install once with:  cd /tmp && npm i playwright axe-core && npx playwright install chromium');
    process.exit(2);
}
const { chromium } = createRequire(pwPath)('playwright');
const axeSource = readFileSync(path.join(path.dirname(axePath), 'axe.min.js'), 'utf8');

const OUT = process.env.GB2_VERIFY_OUT || '/tmp/gb2-verify';
const IGNORE = new Set(['document-title', 'html-has-lang']);
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

// Pages: one rich chart per interaction family + the wizard when the
// harness rendered it (run.sh --extras writes wizard_a11y.html; a
// standalone invocation without it just audits the battery pages).
const PAGES = [
    { name: 'cg_bar_labels', openPanel: true, openFind: true, contract: true },
    { name: 'corr_heat' },
    { name: 'freq_pie_callout', contract: true },
    { name: 'wizard_a11y', optional: true },
];

async function runAxe(page) {
    const res = await page.evaluate(async (tags) => {
        const r = await window.axe.run(document, {
            runOnly: { type: 'tag', values: tags },
            resultTypes: ['violations'],
        });
        return r.violations.map(v => ({
            id: v.id, impact: v.impact, nodes: v.nodes.length,
            sample: v.nodes[0] ? v.nodes[0].html.slice(0, 110) : '',
        }));
    }, AXE_TAGS);
    return res.filter(v => !IGNORE.has(v.id));
}

let failures = 0;
function report(label, violations) {
    if (violations.length === 0) {
        console.log('  ok   ' + label);
        return;
    }
    failures += violations.length;
    console.log('  FAIL ' + label);
    for (const v of violations) {
        console.log('       [' + (v.impact || '?') + '] ' + v.id + ' x' + v.nodes +
            (v.sample ? '  e.g. ' + v.sample : ''));
    }
}

const browser = await chromium.launch();
for (const p of PAGES) {
    const file = path.join(OUT, p.name + '.html');
    if (!existsSync(file)) {
        if (p.optional) { console.log('  --   ' + p.name + ' (not rendered, skipped)'); continue; }
        console.log('  FAIL ' + p.name + ' (file missing: ' + file + ')');
        failures++;
        continue;
    }
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(String(e).slice(0, 120)));
    try {
        await page.goto('file://' + file, { waitUntil: 'load' });
        await page.waitForTimeout(2500);
        await page.addScriptTag({ content: axeSource });
        report(p.name + ' (default)', await runAxe(page));

        if (p.contract) {
            const c = await page.evaluate(() => {
                const svg = document.querySelector('svg[data-role="gb2-chart-svg"]');
                const bad = [];
                if (!svg) bad.push('chart svg missing');
                else {
                    if (svg.getAttribute('role') !== 'img') bad.push('svg role != img');
                    const label = svg.getAttribute('aria-label') || '';
                    if (!label.length) bad.push('svg aria-label empty');
                    if (/Summary table/i.test(label)) bad.push('svg points to retired Summary table');
                    if (!/Statistics panel/i.test(label)) bad.push('svg does not point to Statistics panel');
                    if (svg.getAttribute('tabindex') !== '0') bad.push('svg not focusable');
                }
                if (/^Pie chart\./.test((svg && svg.getAttribute('aria-label')) || '')) {
                    const staleAxes = Array.from(document.querySelectorAll('div'))
                        // Match the target itself, not an ancestor whose
                        // textContent happens to include a hidden target.
                        .filter(el => /^Click to add [XY]-axis title$/.test((el.textContent || '').trim()))
                        .filter(el => getComputedStyle(el).display !== 'none' &&
                                      el.getBoundingClientRect().width > 0 &&
                                      el.getBoundingClientRect().height > 0);
                    if (staleAxes.length) bad.push('pie exposes axis-title add zones');
                }
                if (!document.querySelector('style[data-role="gb2-a11y-css"]')) bad.push('focus-visible stylesheet missing');
                if (!document.querySelector('div[data-role="gb2-a11y-live"]')) bad.push('live region missing');
                return bad;
            });
            if (c.length === 0) console.log('  ok   ' + p.name + ' (a11y contract)');
            else { failures += c.length; console.log('  FAIL ' + p.name + ' (a11y contract): ' + c.join('; ')); }
        }

        if (p.openPanel) {
            const clicked = await page.evaluate(() => {
                const bar = document.querySelector('svg [data-bar-cat]');
                if (!bar) return false;
                for (const t of ['pointerdown', 'pointerup', 'click']) {
                    bar.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true }));
                }
                return true;
            });
            if (clicked) {
                await page.waitForTimeout(1200);
                report(p.name + ' (panel open)', await runAxe(page));
            } else {
                failures++;
                console.log('  FAIL ' + p.name + ' (panel open): no [data-bar-cat] to click');
            }
        }
        if (p.openFind) {
            await page.locator('[data-role="setting-search-trigger"]').click();
            await page.locator('[data-role="setting-search-input"]').fill('color');
            await page.waitForTimeout(50);
            report(p.name + ' (Find open)', await runAxe(page));
            const findContract = await page.evaluate(() => {
                const bad = [];
                const trigger = document.querySelector('[data-role="setting-search-trigger"]');
                const dialog = document.querySelector('[data-role="setting-search"]');
                const input = document.querySelector('[data-role="setting-search-input"]');
                const list = document.querySelector('[data-role="setting-search-results"]');
                const selected = document.querySelectorAll('[role="option"][aria-selected="true"]');
                if (trigger?.getAttribute('aria-expanded') !== 'true') bad.push('trigger not expanded');
                if (dialog?.getAttribute('role') !== 'dialog') bad.push('dialog role missing');
                if (input?.getAttribute('role') !== 'combobox') bad.push('combobox role missing');
                if (list?.getAttribute('role') !== 'listbox') bad.push('listbox role missing');
                if (selected.length !== 1) bad.push('active option is not unique');
                if (input?.getAttribute('aria-activedescendant') !== selected[0]?.id) bad.push('active descendant mismatch');
                return bad;
            });
            if (findContract.length === 0) console.log('  ok   ' + p.name + ' (Find a11y contract)');
            else { failures += findContract.length; console.log('  FAIL ' + p.name + ' (Find a11y contract): ' + findContract.join('; ')); }
            await page.keyboard.press('Escape');
        }
        if (pageErrors.length) {
            failures++;
            console.log('  FAIL ' + p.name + ' (page errors): ' + pageErrors.join(' | '));
        }
    } catch (e) {
        failures++;
        console.log('  FAIL ' + p.name + ' (probe error): ' + String(e).slice(0, 160));
    }
    await ctx.close();
}
await browser.close();

if (failures > 0) {
    console.log('\nA11Y CHECK: ' + failures + ' FAILURE(S) (' + OUT + ')');
    process.exit(1);
}
console.log('\nA11Y CHECK PASSED (' + OUT + ')');
