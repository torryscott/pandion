// Real-browser smoke for the standalone Help Me Choose guidance flow.
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
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
await page.goto(pageUrl);
await page.waitForTimeout(350);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(180);
}

await page.evaluate(() => window.PS_SHELL.showAnalysisGallery());
if ((await page.locator('[data-analysis-module]').count()) !== 7 ||
    (await page.locator('[data-analysis-help]').count()) !== 1)
    throw new Error('New chart gallery does not contain seven analyses plus Help Me Choose');
const regularBox = await page.locator('[data-analysis-module]').first().boundingBox();
const guideBox = await page.locator('[data-analysis-help]').boundingBox();
if (!regularBox || !guideBox ||
    Math.abs(regularBox.width - guideBox.width) > 1 ||
    Math.abs(regularBox.height - guideBox.height) > 1)
    throw new Error(`Help Me Choose card is not the same size as the analysis cards: ` +
                    JSON.stringify({ regularBox, guideBox }));
console.log('  ok  Help Me Choose occupies an equal-sized eighth gallery position');

const initialCharts = await page.evaluate(() => window.PS_SHELL.charts().length);
await page.click('[data-analysis-help]');
if (!(await page.locator('#ps-help-choose').isVisible()) ||
    (await page.locator('#ps-help-choose [data-hmc-go]').count()) !== 7)
    throw new Error('Help Me Choose did not open its complete first question');
if ((await page.evaluate(() => window.PS_SHELL.charts().length)) !== initialCharts)
    throw new Error('opening guidance created an unwanted chart document');
console.log('  ok  guidance opens without adding a project document');

await page.click('[data-hmc-go="compare"]');
if ((await page.locator('#ps-help-choose [data-hmc-go]').count()) !== 3 ||
    !(await page.locator('#ps-help-choose-body').textContent()).includes(
        'How much of each group'))
    throw new Error('Compare Groups did not reveal its progressive follow-up');
if (process.env.PS_SCREENSHOT)
    await page.locator('#ps-help-choose .ps-hmc-card').screenshot({
        path: path.resolve(process.env.PS_SCREENSHOT)
    });
await page.click('[data-hmc-go="compare-spread"]');
if (!(await page.locator('[data-hmc-create="plotbuilder"]').isVisible()) ||
    !(await page.locator('#ps-help-choose-body').textContent()).includes(
        'BoxViolinRaincloud'))
    throw new Error('Compare Groups recommendation lacks its rationale or starting styles');
await page.click('#ps-help-choose-body .ps-hmc-actions .ps-btn:not(.ps-primary)');
if (!(await page.locator('[data-hmc-go="compare-summary"]').isVisible()))
    throw new Error('Back did not return to the prior chooser question');
console.log('  ok  progressive questions explain and preserve navigation context');

await page.click('[data-hmc-go="compare-summary"]');
await page.click('[data-hmc-create="plotbuilder"]');
await page.waitForTimeout(180);
const created = await page.evaluate(() => ({
    count: window.PS_SHELL.charts().length,
    module: window.PS_SHELL.chart().module,
    workspace: window.PS_SHELL.workspace()
}));
if (created.count !== initialCharts + 1 ||
    created.module !== 'plotbuilder' || created.workspace !== 'chart')
    throw new Error(`accepted recommendation created the wrong document: ` +
                    JSON.stringify(created));
if (await page.locator('#ps-help-choose').isVisible())
    throw new Error('chooser remained open after creating the chart');
console.log('  ok  confirmation creates the recommended existing chart module');

await page.evaluate(() => window.PS_SHELL.showHelpMeChoose());
await page.click('[data-hmc-go="scatter"]');
if (!(await page.locator('[data-hmc-create="xyplotbuilder"]').isVisible()) ||
    !(await page.locator('#ps-help-choose-body').textContent()).includes(
        'two numeric variables'))
    throw new Error('direct Scatter route recommends the wrong analysis');
await page.click('#ps-help-choose-close');
if (await page.locator('#ps-help-choose').isVisible())
    throw new Error('Close did not dismiss Help Me Choose');
console.log('  ok  every recommendation remains dismissible before creation');

await page.evaluate(() => window.PS_SHELL.loadTable(
    'chooser-groups',
    ['condition', 'score', 'site'],
    [
        ['Control', 61, 'East'],
        ['Control', 55, 'West'],
        ['Low dose', 70, 'East'],
        ['Low dose', 74, 'West']
    ],
    ['nominal', 'continuous', 'nominal']
));
await page.evaluate(() => window.PS_SHELL.showHelpMeChoose());
await page.click('[data-hmc-mode="variables"]');
if ((await page.locator('[data-hmc-variable]').count()) !== 3 ||
    !(await page.locator('[data-hmc-dropzone]').isVisible()))
    throw new Error('variable-guided route did not expose the project supplier and target');
await page.click('[data-hmc-variable="condition"]');
await page.click('[data-hmc-variable="score"]');
if ((await page.locator('.ps-hmc-selected').count()) !== 2 ||
    (await page.locator('.ps-hmc-selected-icon .ps-ticon').count()) !== 2 ||
    (await page.locator('.ps-hmc-selected-type').allTextContents()).join('|') !==
        'Nominal|Continuous')
    throw new Error('selected variables did not preserve their measure icons and labels');
const groupRecommendation = page.locator(
    '.ps-hmc-data-result:not(:has(.ps-hmc-alternative)) .ps-hmc-result-head h3'
).first();
if ((await groupRecommendation.textContent()).trim() !== 'Compare Groups' ||
    !(await page.locator('[data-hmc-data-create="plotbuilder"]').first().isVisible()))
    throw new Error('categorical plus numeric variables did not recommend Compare Groups');
if (!(await page.locator('#ps-help-choose-body').textContent()).includes(
        'condition \u00b7 nominal') ||
    !(await page.locator('#ps-help-choose-body').textContent()).includes(
        'score \u00b7 continuous'))
    throw new Error('the chooser did not explain the detected measure types');
await page.click('[data-hmc-data-create="plotbuilder"]');
await page.waitForTimeout(120);
const assignedCompare = await page.evaluate(() => ({
    module: window.PS_SHELL.chart().module,
    roles: window.PS_SHELL.rolesStore()
}));
if (assignedCompare.module !== 'plotbuilder' ||
    assignedCompare.roles.xvar !== 'condition' ||
    assignedCompare.roles.yvar !== 'score')
    throw new Error(`accepted variable recommendation did not assign roles: ` +
                    JSON.stringify(assignedCompare));
console.log('  ok  selected measure types recommend and configure Compare Groups');

await page.evaluate(() => window.PS_SHELL.loadTable(
    'chooser-repeated',
    ['t1', 't2', 't3'],
    [
        [1.2, 1.7, 2.1],
        [2.4, 2.8, 3.3],
        [3.1, 3.6, 4.2]
    ],
    ['continuous', 'continuous', 'continuous']
));
await page.evaluate(() => window.PS_SHELL.showHelpMeChoose());
await page.click('[data-hmc-mode="variables"]');
for (const variable of ['t1', 't2', 't3'])
    await page.click(`[data-hmc-variable="${variable}"]`);
if ((await page.locator('.ps-hmc-data-result').first()
        .locator('.ps-hmc-result-head h3').textContent()).trim() !==
        'Repeated Measures')
    throw new Error('sequential continuous columns did not recommend Repeated Measures');
await page.click('#ps-help-choose-close');
console.log('  ok  sequential measure names activate repeated-measures logic');

await page.evaluate(() => window.PS_SHELL.loadTable(
    'chooser-likert',
    ['q1', 'q2', 'q3', 'group'],
    [
        [1, 2, 3, 'A'],
        [2, 3, 4, 'A'],
        [3, 4, 5, 'B'],
        [4, 5, 1, 'B'],
        [5, 1, 2, 'B']
    ],
    ['continuous', 'continuous', 'continuous', 'nominal']
));
await page.evaluate(() => window.PS_SHELL.showHelpMeChoose());
await page.click('[data-hmc-mode="variables"]');
for (const variable of ['q1', 'q2', 'q3', 'group'])
    await page.click(`[data-hmc-variable="${variable}"]`);
if ((await page.locator('.ps-hmc-data-result').first()
        .locator('.ps-hmc-result-head h3').textContent()).trim() !==
        'Likert / Survey')
    throw new Error('same-scale item battery did not recommend Likert / Survey');
if (!(await page.locator('#ps-help-choose-body').textContent()).includes(
        'group would remain unassigned'))
    throw new Error('chooser did not disclose the tag-along variable capacity limit');
await page.click('[data-hmc-data-create="likertplotbuilder"]');
await page.waitForTimeout(120);
const assignedLikert = await page.evaluate(() => ({
    module: window.PS_SHELL.chart().module,
    roles: window.PS_SHELL.rolesStore()
}));
if (assignedLikert.module !== 'likertplotbuilder' ||
    JSON.stringify(assignedLikert.roles.items) !== JSON.stringify(['q1', 'q2', 'q3']))
    throw new Error(`Likert recommendation assigned the wrong battery: ` +
                    JSON.stringify(assignedLikert));
console.log('  ok  shared response scales identify and configure Likert batteries');

// Escape keeps working past the first screen (the M4 audit's confirmed
// trap: a step render destroyed the focused button, focus fell to
// <body>, and the dialog's Escape/Tab handlers went silent). Escape now
// steps BACK per press, then closes from the start screen.
async function hmcState() {
    return await page.evaluate(() => {
        const dialog = document.getElementById('ps-help-choose');
        return {
            open: dialog.style.display === 'flex',
            focusInside: dialog.contains(document.activeElement) &&
                document.activeElement !== document.body,
            atStart: !!document.querySelector(
                '#ps-help-choose-body .ps-hmc-question')
        };
    });
}
await page.evaluate(() => window.PS_SHELL.showHelpMeChoose());
await page.waitForTimeout(150);
await page.click('.ps-hmc-option');       // enter step 2 of the questions
await page.waitForTimeout(150);
const trapped = await hmcState();
if (!trapped.open || !trapped.focusInside)
    throw new Error('step render orphaned keyboard focus: ' +
                    JSON.stringify(trapped));
console.log('  ok  step renders keep focus inside the dialog');
await page.keyboard.press('Escape');      // back to the start screen
await page.waitForTimeout(150);
const backed = await hmcState();
if (!backed.open)
    throw new Error('first Escape closed instead of stepping back');
await page.keyboard.press('Escape');      // start screen -> closed
await page.waitForTimeout(150);
const closed = await hmcState();
if (closed.open)
    throw new Error('Escape from the start screen did not close the dialog');
console.log('  ok  Escape steps back, then closes from the start screen');

if (errors.length) throw new Error(errors[0]);
await browser.close();
console.log('HELP ME CHOOSE CHECK: ALL GREEN');
