// t4-32: New chart from selection (Torry-approved design, Jul 27 2026).
//
// THE RULE: context may shape OFFERS, only an explicit gesture may produce
// an outcome. The command never picks the analysis: it opens the New chart
// dialog ARMED with the selected variables, and every card shows its own
// reading of that selection (a concrete role mapping, or a stated refusal)
// BEFORE anything is created. The arm is ONE-SHOT: the next plain New chart
// is byte-identical to today's. Readings consume the wizard's classifier
// (hmcSummaryFor), so the two surfaces cannot disagree.
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
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1400);

console.log('case 1: the simple pair, end to end through the real gesture');
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.loadTable('pair', ['cond', 'score'],
        [['a', '1'], ['b', '2'], ['a', '3'], ['b', '4'],
         ['a', '5'], ['b', '6']],
        { cond: 'nominal', score: 'continuous' });
    await s(900);
    window.PS_SHELL.setWorkspace('data');
    await s(400);
    window.PS_SHELL.setGridSelection('cond', 0, 'score', 5, 'column');
});
await page.waitForTimeout(200);
await page.click('th[data-grid-col="cond"]', { button: 'right' });
await page.waitForTimeout(300);
await page.click('#ps-columnmenu-chart');
await page.waitForTimeout(500);
const armed = await page.evaluate(() => ({
    open: getComputedStyle(document.getElementById('ps-analysis-gallery'))
        .display !== 'none',
    chips: Array.from(document.querySelectorAll('#ps-analysis-arm .ps-arm-chip'))
        .map(c => c.textContent),
    cgLine: document.querySelector(
        '[data-analysis-module="plotbuilder"] small').textContent
}));
ok(armed.open, 'the command opens the New chart dialog, never a chart');
ok(JSON.stringify(armed.chips) === JSON.stringify(['cond', 'score']),
   `armed with the selected variables (${JSON.stringify(armed.chips)})`);
ok(/score on values/.test(armed.cgLine) &&
   /cond on the category axis/.test(armed.cgLine),
   `the Compare Groups card shows ITS reading of the selection ` +
   `("${armed.cgLine}")`);
await page.click('[data-analysis-module="plotbuilder"]');
await page.waitForTimeout(1200);
const made = await page.evaluate(() => ({
    roles: window.PS_SHELL.rolesStore(),
    bars: document.querySelectorAll('[data-bar-cat]').length,
    toast: document.getElementById('ps-toast').innerText
}));
ok(made.roles.xvar === 'cond' && made.roles.yvar === 'score',
   `clicking the card creates the chart WITH the mapping it showed ` +
   `(${JSON.stringify(made.roles)})`);
ok(made.bars > 0, `and the chart is drawn (${made.bars} bar elements)`);
ok(/Started Compare Groups from your selection/.test(made.toast),
   `disclosed in the toast ("${made.toast.replace(/\n/g, ' ').slice(0, 60)}")`);

console.log('case 2: the ambiguous trio shows one reading per question');
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.loadTable('trio', ['cond', 't1', 't2'],
        [['a', '1', '2'], ['b', '3', '4'], ['a', '5', '6'],
         ['b', '7', '8'], ['a', '2', '3'], ['b', '4', '5']],
        { cond: 'nominal', t1: 'continuous', t2: 'continuous' });
    await s(900);
    window.PS_SHELL.setWorkspace('data');
    await s(400);
    window.PS_SHELL.setGridSelection('cond', 0, 't2', 5, 'column');
});
await page.waitForTimeout(200);
await page.click('th[data-grid-col="t1"]', { button: 'right' });
await page.waitForTimeout(300);
await page.click('#ps-columnmenu-chart');
await page.waitForTimeout(500);
const trio = await page.evaluate(() => {
    const line = k => document.querySelector(
        '[data-analysis-module="' + k + '"] small').textContent;
    return { cg: line('plotbuilder'), rm: line('rmplotbuilder'),
             xy: line('xyplotbuilder'), corr: line('corrplotbuilder') };
});
ok(/exactly one value variable/.test(trio.cg) && /Opens empty/.test(trio.cg),
   `Compare Groups states its refusal rather than graying out ` +
   `("${trio.cg}")`);
ok(/t1, t2 as occasions/.test(trio.rm) && /between-subject groups/.test(trio.rm),
   `Repeated Measures reads the trio its way ("${trio.rm}")`);
ok(/t1 vs t2/.test(trio.xy) && /cond as color groups/.test(trio.xy),
   `Scatter reads it another way ("${trio.xy}")`);
ok(/numeric variables only/.test(trio.corr) && /cond stays out/.test(trio.corr),
   `Correlation names what it would leave out ("${trio.corr}")`);

console.log('case 2b: the armed cards carry NO live previews');
// Previews were t4-33 and were REMOVED by the Aug 25 2026 backlog ruling
// (Torry: "I don't think we need the previews"). The per-card readings are
// the information; this pins the absence so the renders cannot creep back.
await page.waitForTimeout(700);   // past the old 30ms preview batch window
const previews = await page.evaluate(() => ({
    boxes: document.querySelectorAll('.ps-analysis-preview').length,
    host: !!document.getElementById('ps-preview-host'),
    glyphs: document.querySelectorAll('#ps-analysis-grid .ps-analysis-icon').length
}));
ok(previews.boxes === 0 && !previews.host,
   'no preview boxes and no offscreen preview host exist');
ok(previews.glyphs >= 7,
   `every card keeps its generic glyph (${previews.glyphs} icons)`);
await page.click('[data-analysis-module="xyplotbuilder"]');
await page.waitForTimeout(1200);
const xy = await page.evaluate(() => window.PS_SHELL.rolesStore());
ok(xy.xvar === 't1' && xy.yvar === 't2' && xy.groupVar === 'cond',
   `picking Scatter gets Scatter's mapping (${JSON.stringify(xy)})`);

console.log('case 3: the arm is one-shot; plain New chart stays plain');
await page.evaluate(() => window.PS_SHELL.runCommand('new-chart'));
await page.waitForTimeout(500);
const plain = await page.evaluate(() => ({
    armHidden: document.getElementById('ps-analysis-arm').hidden,
    cgLine: document.querySelector(
        '[data-analysis-module="plotbuilder"] small').textContent
}));
ok(plain.armHidden && !/With your selection/.test(plain.cgLine),
   `an ordinary New chart is byte-identical to today: no chips, generic ` +
   `requirement lines ("${plain.cgLine}")`);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

console.log('case 4: a refusing card still opens, empty, as it said it would');
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setWorkspace('data');
    await s(300);
    window.PS_SHELL.setGridSelection('cond', 0, 't2', 5, 'column');
    window.PS_SHELL.runCommand('data-chart-sel');
});
await page.waitForTimeout(500);
await page.click('[data-analysis-module="plotbuilder"]');
await page.waitForTimeout(900);
const empty = await page.evaluate(() => ({
    roles: window.PS_SHELL.rolesStore(),
    module: window.PS_SHELL.chart().module
}));
ok(empty.module === 'plotbuilder' &&
   !empty.roles.xvar && !empty.roles.yvar,
   `Compare Groups opens with empty roles, exactly as its card stated ` +
   `(${JSON.stringify(empty.roles)})`);

console.log('case 5: two hundred columns is a refusal, not a guess');
const cap = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const cols = []; const row = [];
    for (let i = 0; i < 14; i++) { cols.push('c' + i); row.push(String(i)); }
    window.PS_SHELL.loadTable('wide', cols, [row, row, row]);
    await s(900);
    window.PS_SHELL.setWorkspace('data');
    await s(300);
    window.PS_SHELL.setGridSelection('c0', 0, 'c13', 2, 'column');
    await s(200);
    window.PS_SHELL.runCommand('data-chart-sel');
    await s(500);
    return {
        open: getComputedStyle(document.getElementById('ps-analysis-gallery'))
            .display !== 'none',
        toast: document.getElementById('ps-toast').innerText
    };
});
ok(!cap.open && /select up to 12/.test(cap.toast),
   `past the ceiling the command refuses with the rule stated, and no ` +
   `dialog opens ("${cap.toast.replace(/\n/g, ' ').slice(0, 70)}")`);

console.log('case 6: the wizard handoff carries the variables');
const hmc = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.loadTable('trio2', ['cond', 't1', 't2'],
        [['a', '1', '2'], ['b', '3', '4'], ['a', '5', '6']],
        { cond: 'nominal', t1: 'continuous', t2: 'continuous' });
    await s(900);
    window.PS_SHELL.setWorkspace('data');
    await s(300);
    window.PS_SHELL.setGridSelection('cond', 0, 't2', 2, 'column');
    window.PS_SHELL.runCommand('data-chart-sel');
    await s(400);
    const card = document.querySelector('[data-analysis-help]');
    card.click();
    await s(700);
    const dlg = document.querySelector('.ps-hmc-card');
    return { open: !!dlg && dlg.offsetParent !== null,
             text: dlg ? dlg.innerText : '' };
});
ok(hmc.open, 'the Help me choose card opens the wizard');
ok(/cond/.test(hmc.text) && /t1/.test(hmc.text) && /t2/.test(hmc.text),
   'with the selected variables already in its box, so the wizard reasons ' +
   'about the same selection the cards did');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('CHART FROM SELECTION CHECK PASS');
await browser.close();
