// Rehearse the acceptance-pack data path and pin its simple numerical anchors.
// This uses browser locators, a file-input injection, and programmatic chart
// setup/project serialization. It is NOT an independent keyboard/AT session.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = createRequire(path.join(process.env.GB2_NODE_BASE || process.cwd(), 'accessibility-probe.cjs'))('playwright');
const artifact = path.resolve(process.env.PS_PAGE || 'standalone/index.html');
const fixture = path.resolve('docs/accessibility-classroom/classroom.csv');
const out = path.resolve(process.env.PS_A11Y_OUT || 'planning/accessibility-release/source');
mkdirSync(out, { recursive: true });
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const report = {
    status: 'in-progress', artifact, sha256: hash(artifact), fixtureSha256: hash(fixture),
    limit: 'Fixture rehearsal, not AT acceptance, native file-dialog or LMS testing.',
    checks: [], errors: [],
};
const browser = await chromium.launch();
report.browserVersion = browser.version();
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
page.setDefaultTimeout(15000);
page.on('pageerror', e => report.errors.push(String(e)));
function check(condition, message) {
    if (!condition) throw new Error(message);
    report.checks.push(message); console.log('  ok  ' + message);
}
const score = () => page.evaluate(() => window.PS_SHELL.project.table.columns.Score);
async function enterValue(text) {
    await page.keyboard.press('F2');
    await page.locator('.ps-grid-cellinput').fill(text);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
}
try {
    await page.goto(pathToFileURL(artifact).href);
    await page.locator('#ps-welcome-open').click();
    await page.locator('#ps-file').setInputFiles(fixture);
    await page.locator('#ps-import-use').click();
    await page.waitForFunction(() => window.PS_SHELL.project.table?.columns?.Score?.length === 8);
    report.initialScores = await score();
    check(report.initialScores.filter(x => x != null).length === 7 && report.initialScores[7] == null,
        'CSV import retains eight records and the one missing P08 score');
    await page.locator('[data-ps-workspace="data"]').click();
    await page.locator('#ps-datagrid').focus();
    // Fresh grid enters at Participant row 1. Move to Score row 8 with keys.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowDown');
    const target = await page.evaluate(() => {
        const cell = document.getElementById(document.getElementById('ps-datagrid').getAttribute('aria-activedescendant'));
        return [cell?.dataset.gc, cell?.dataset.gr];
    });
    check(target[0] === 'Score' && target[1] === '7', 'Keyboard navigation reaches Score at P08');
    await enterValue('20');
    check((await score())[7] === 20, 'Cell editor commits 20');
    await page.keyboard.press('ControlOrMeta+z');
    check((await score())[7] == null, 'Undo restores the missing value');
    // Re-select the target after the undo redraw; this is locator assistance.
    await page.locator('td[data-gc="Score"][data-gr="7"]').click();
    await enterValue('20');
    await page.keyboard.press('Control+Shift+P');
    await page.locator('#ps-command-search').fill('Add computed column');
    await page.keyboard.press('Enter');
    await page.locator('#ps-formula-name').fill('ScorePlus5');
    await page.locator('#ps-formula-input').fill('Score +');
    await page.locator('#ps-formula-save').click();
    report.formulaError = await page.locator('#ps-formula-msg').innerText();
    check(report.formulaError.length > 0 && await page.locator('#ps-formula-dialog').isVisible(),
        'Incomplete formula reports an error without closing the editor');
    await page.locator('#ps-formula-input').fill('Score + 5');
    await page.locator('#ps-formula-save').click();
    await page.waitForFunction(() => !!window.PS_SHELL.project.table.columns.ScorePlus5);
    report.computed = await page.evaluate(() => window.PS_SHELL.project.table.columns.ScorePlus5);
    check(JSON.stringify(report.computed) === JSON.stringify([15, 17, 19, 21, 19, 21, 23, 25]),
        'Computed values equal the independent answer key');
    await page.locator('td[data-gc="Score"][data-gr="0"]').click();
    await enterValue('11');
    check(await page.evaluate(() => window.PS_SHELL.project.table.columns.ScorePlus5[0]) === 16,
        'Source edit recalculates the computed column');
    await page.keyboard.press('ControlOrMeta+z');
    check(await page.evaluate(() => window.PS_SHELL.project.table.columns.Score[0] === 10 && window.PS_SHELL.project.table.columns.ScorePlus5[0] === 15),
        'Undo restores the source and computed values');
    // Programmatic setup isolates whether these exact numbers reach the chart.
    report.bars = await page.evaluate(() => {
        window.PS_SHELL.setWorkspace('chart');
        window.PS_SHELL.setModule('plotbuilder');
        window.PS_SHELL.setRoles('plotbuilder', { xvar: 'Group', yvar: 'Score' });
        Object.assign(window.PS_SHELL.optionStore(), { errorBarType: 'se' });
        window.PS_SHELL.setModule('plotbuilder');
        return window.PS_SHELL.buildPayload().bars;
    });
    check(report.bars.length === 2, 'Corrected data produces two chart groups');
    for (const [group, mean] of [['Control', 13], ['Treatment', 17]]) {
        const bar = report.bars.find(b => b.x === group);
        check(bar?.n === 4 && bar.mean === mean && Math.abs(bar.se - Math.sqrt(5 / 3)) < 1e-12,
            group + ' payload has N=4, the correct mean, and SE=sqrt(5/3)');
    }
    await page.locator('#psroot button[aria-label="Statistics"]').first().click();
    await page.getByRole('button', { name: 'Descriptives', exact: true }).click();
    report.statisticsTables = await page.locator('#psroot .gb2-panel table').evaluateAll(tables => tables.map(table =>
        [...table.querySelectorAll('tr')].map(row => [...row.querySelectorAll('th,td')].map(cell => cell.textContent.trim()))));
    const descriptives = report.statisticsTables.find(t => t[0].includes('Mean') && t[0].includes('SD'));
    check(!!descriptives, 'Statistics exposes a descriptive table for the classroom dataset');
    // Columns by header, not position: Mode joined the table Sep 19 2026.
    const col = name => descriptives[0].indexOf(name);
    for (const [group, mean] of [['Control', '13.00'], ['Treatment', '17.00']]) {
        const row = descriptives.find(r => r[0] === group);
        check(row?.[col('N')] === '4' && row[col('Mean')] === mean && row[col('SD')] === '2.58' && row[col('SE')] === '1.29',
            group + ' descriptive table presents the expected N, mean, SD and SE to its two-decimal display precision');
    }
    report.statisticsSnapshot = await page.locator('#psroot .gb2-panel').ariaSnapshot();
    check(/13\.00/.test(report.statisticsSnapshot) && /17\.00/.test(report.statisticsSnapshot) &&
        /2\.58/.test(report.statisticsSnapshot) && /1\.29/.test(report.statisticsSnapshot),
        'Browser accessibility representation includes the displayed descriptive values');
    await page.getByRole('button', { name: 'Compare pairs', exact: true }).click();
    report.pairwiseSnapshot = await page.locator('#psroot .gb2-panel').ariaSnapshot();
    report.resultNames = await page.locator('#psroot .gb2-stcellterm:visible').evaluateAll(nodes => nodes.map(n => ({
        text: n.textContent.trim(), name: n.getAttribute('aria-label') || '',
    })));
    // ariaSnapshot also includes descendant text that may be overridden by
    // aria-label. Check actual role/name lookup, not a substring in that dump.
    check(await page.getByRole('button', { name: 't(6) = -2.19, t statistic, definition', exact: true }).count() === 1 &&
        await page.getByRole('button', { name: '.071, p value, definition', exact: true }).count() === 1 &&
        report.resultNames.every(n => n.name.includes(n.text)),
        'Definition buttons retain the displayed t statistic, p value and effect size in their accessible names');
    report.chartName = await page.locator('svg[data-role="gb2-chart-svg"]').first().getAttribute('aria-label');
    const serialized = await page.evaluate(() => window.PS_SHELL.projectText());
    writeFileSync(path.join(out, 'classroom-rehearsal.pand'), serialized);
    await page.evaluate(text => window.PS_SHELL.openProjectText(text), serialized);
    check(await page.evaluate(() => {
        const t = window.PS_SHELL.project.table;
        return t.columns.Score[7] === 20 && t.columns.Score[0] === 10 &&
            t.computed.ScorePlus5 === 'Score + 5' && t.columns.ScorePlus5[7] === 25;
    }), 'Project serialization/reopen retains the correction and formula');
    check(report.errors.length === 0, 'No browser page errors');
    report.status = 'passed';
} catch (error) {
    report.status = 'failed'; report.errors.push(String(error)); throw error;
} finally {
    writeFileSync(path.join(out, 'classroom-fixture.json'), JSON.stringify(report, null, 2) + '\n');
    await browser.close();
}
