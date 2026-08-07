// The variable panel showed the wrong numbers after an exclusion.
//
// Excluding a value updated the grid, the footer, the command bar chip and the
// title strip, and never the Variable properties panel a foot to the right,
// which carries Excluded, Valid, Missing and the Mean. So the chip read
// "Excluded 1" while the panel beside it read "Excluded 0" and the OLD mean,
// in the same frame. It healed only if you selected a DIFFERENT column and
// came back; reselecting the same one did nothing.
//
// Measured on the sample data: after excluding a fat-fingered value the panel
// held Mean 91.9 and Max 520 when the truth was Mean 73.3 and Max 91. Someone
// chasing an outlier excludes two or three more values watching a number that
// never moves, then reads the stale one into a write-up.
//
// The row filter had the same omission.
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
function ok(cond, msg) {
    if (!cond) throw new Error(msg);
    console.log('  ok  ' + msg);
}

const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 960 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1300);
}
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(500);

// Read the panel as a user does, off the rendered text.
const panel = () => page.evaluate(() => {
    const n = document.getElementById('ps-variable-stats');
    const out = {};
    if (!n) return out;
    n.innerText.split('\n').forEach((line, i, all) => {
        if (/^(Rows|Valid|Missing|Distinct|Excluded|Mean|SD|Median|Min|Max)$/.test(line.trim()))
            out[line.trim()] = (all[i + 1] || '').trim();
    });
    return out;
});

console.log('case 1: excluding a value moves the panel it is standing next to');
await page.evaluate(() => window.PS_SHELL.selectVariable('score'));
await page.waitForTimeout(400);
const before = await panel();
ok(before.Excluded === '0' && before.Valid === '24',
   'clean to begin with, got ' + JSON.stringify(before));
const meanBefore = before.Mean;
await page.evaluate(() => window.PS_SHELL.setExcluded('score', 2, true));
await page.waitForTimeout(800);
const after = await panel();
ok(after.Excluded === '1',
   'the Excluded count follows without reselecting, got ' + JSON.stringify(after));
ok(after.Valid === '23', 'and Valid follows, got ' + after.Valid);
ok(after.Mean !== meanBefore,
   'and the Mean is recomputed, was ' + meanBefore + ' now ' + after.Mean);

console.log('case 2: it agrees with the chip that was always right');
const chip = await page.evaluate(() => {
    const n = Array.from(document.querySelectorAll('#ps-datacmd *, .ps-command'))
        .map(x => x.textContent || '').find(tx => /Excluded/.test(tx));
    return n || '';
});
ok(/1/.test(chip),
   'the command bar chip says one too, got ' + JSON.stringify(chip.slice(0, 60)));

console.log('case 3: including it back returns the panel');
await page.evaluate(() => window.PS_SHELL.setExcluded('score', 2, false));
await page.waitForTimeout(800);
const back = await panel();
ok(back.Excluded === '0' && back.Valid === '24' && back.Mean === meanBefore,
   'every number returns, got ' + JSON.stringify(back));

// A row filter is deliberately NOT asserted here. The panel computes from the
// full table while the filter panel's own copy says failing rows "leave every
// chart and statistic", so the two disagree, and which one is right is a
// design decision rather than a defect to pin. It is written up as a decision
// with a recommendation instead of being settled by a probe.

ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
console.log('INSPECTOR FRESHNESS CHECK: ALL GREEN');
await browser.close();
