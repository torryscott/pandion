// The client half of the library hold-back. Held back, the three surfaces
// that offer to SAVE must be gone; restored, they must all come back. The
// second half is the control: without it this probe would pass just as
// happily against an engine that had deleted the feature outright.
import { createRequire } from 'node:module';
const { chromium } = createRequire('/tmp/x.js')('playwright');
const BUNDLE = process.env.GB2_BUNDLE === 'min' ? 'min' : 'src';
const OUT = process.env.GB2_LIBHOLD_OUT || '/tmp/gb2-libhold';

const b = await chromium.launch();
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ok   ' : '  FAIL ') + m); };

async function surfaces(state) {
    const page = await (await b.newContext()).newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    await page.addInitScript(() => { window.setOption = function () {}; });
    await page.goto(`file://${OUT}/lib_${state}_${BUNDLE}.html`);
    await page.waitForSelector('[data-role="chart-card"], svg', { timeout: 15000 });
    await page.waitForTimeout(600);

    // Chart settings: is there a "Chart styles" tab?
    const gear = await page.$('[data-role="global-settings"], [title*="Chart settings" i]');
    if (gear) { await gear.click(); await page.waitForTimeout(400); }
    const stylesTab = await page.$$eval('[data-gs-tab]',
        (els) => els.map((e) => e.getAttribute('data-gs-tab'))).catch(() => []);

    // Find a setting: open it and search. Reading innerHTML would match the
    // inlined engine SOURCE, which contains that label in its own registry
    // call, and pass forever no matter what the gate does.
    const findBtn = await page.$('[data-role="setting-search-trigger"]');
    let findsStyles = false;
    if (findBtn) {
        await findBtn.click();
        await page.waitForTimeout(300);
        const box = await page.$('[data-role="setting-search"] input, input[placeholder*="Find" i]');
        if (box) {
            await box.type('chart style', { delay: 15 });
            await page.waitForTimeout(400);
            findsStyles = await page.evaluate(() => {
                const panel = document.querySelector('[data-role="setting-search"]')
                    || document.querySelector('[role="dialog"]');
                return !!panel && (panel.innerText || '').indexOf('Chart style preset') >= 0;
            });
        }
        await page.keyboard.press('Escape');
    }

    const r = {
        errs: errs.length,
        hasStylesTab: stylesTab.indexOf('styles') >= 0,
        tabs: stylesTab.join(','),
        findsStyles
    };
    await page.close();
    return r;
}

const off = await surfaces('off');
ok(off.errs === 0, 'held back: clean load');
ok(!off.hasStylesTab, `held back: no Chart styles tab (tabs: ${off.tabs})`);
ok(!off.findsStyles, 'held back: Find a setting does not offer the style preset');

const on = await surfaces('on');
ok(on.errs === 0, 'restored: clean load');
ok(on.hasStylesTab, `restored: the Chart styles tab is back (tabs: ${on.tabs})`);
ok(on.findsStyles, 'restored: Find a setting offers the style preset again');

await b.close();
console.log(fail ? `libhold-check: FAIL (${fail}/${pass + fail})`
                 : `libhold-check: PASS (${pass} checks, ${BUNDLE})`);
process.exit(fail ? 1 : 0);
