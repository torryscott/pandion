// Real-browser check for COMPUTED VARIABLES (Tier 1): the formula
// dialog with guided quick-transforms (every button writes a visible
// formula), live preview + error reporting, columns that RECALCULATE
// on data edits, read-only computed cells with an fx badge, rename
// rewriting inside formulas, chart consumption, undo, and .pand /
// reload persistence. Also pins the filters-vs-computed seam: a
// z-score must NOT shift when a row filter hides rows.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

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
const PAGE = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(PAGE);
await page.waitForTimeout(600);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1000);

// ---- open the dialog from the score column's header menu
await page.click('[data-ps-workspace="data"]');
await page.waitForTimeout(500);
await page.click('th[data-grid-col="score"]', { button: 'right' });
await page.waitForTimeout(300);
await page.click('#ps-columnmenu-compute');
await page.waitForTimeout(400);
const dlg = await page.evaluate(() => ({
    open: document.getElementById('ps-formula-dialog').style.display === 'flex',
    templates: Array.from(document.querySelectorAll(
        '#ps-formula-templates button')).map(b => b.textContent.trim())
}));
if (!dlg.open || dlg.templates.indexOf('z-score') === -1 ||
    dlg.templates.indexOf('log10') === -1)
    throw new Error('dialog/templates wrong: ' + JSON.stringify(dlg));
console.log('  ok  the column menu opens the formula dialog with quick transforms');

// ---- the z-score button writes a VISIBLE formula + live preview
await page.click('[data-formula-template="z-score"]');
await page.waitForTimeout(300);
const seeded = await page.evaluate(() => ({
    name: document.getElementById('ps-formula-name').value,
    formula: document.getElementById('ps-formula-input').value,
    // The preview is a TABLE since the builder round (inputs beside the
    // result); the live values ride the result column's cells.
    res: Array.from(document.querySelectorAll(
        '#ps-formula-preview td.ps-fprev-res')).map(n => n.textContent)
}));
if (seeded.formula !== '(score - VMEAN(score)) / VSD(score)' ||
    seeded.name !== 'score_z' ||
    !seeded.res.length || !seeded.res.every(v => /^-?\d/.test(v)))
    throw new Error('z template wrong: ' + JSON.stringify(seeded));
console.log('  ok  quick transforms write visible formulas with a live preview');

// ---- a parse error reports inline
await page.fill('#ps-formula-input', 'LOG10(score');
await page.waitForTimeout(200);
const err = await page.evaluate(() =>
    document.getElementById('ps-formula-msg').textContent);
if (!/expected "\)"/.test(err))
    throw new Error('no inline parse error: ' + err);
console.log('  ok  parse errors report inline');

// ---- save the z-score
await page.fill('#ps-formula-input', '(score - VMEAN(score)) / VSD(score)');
await page.waitForTimeout(200);
await page.click('#ps-formula-save');
await page.waitForTimeout(700);
const saved = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    const z = t.columns.score_z;
    const mean = z.filter(v => v != null).reduce((a, b) => a + b, 0) / z.length;
    return { has: t.order.indexOf('score_z') !== -1,
             type: t.types.score_z,
             formula: t.computed.score_z,
             meanAbs: Math.abs(mean),
             fx: !!document.querySelector('th[data-grid-col="score_z"] .ps-grid-fx') };
});
if (!saved.has || saved.type !== 'continuous' || saved.meanAbs > 1e-9 || !saved.fx)
    throw new Error('z column wrong: ' + JSON.stringify(saved));
console.log('  ok  the saved z-score column lands continuous with an fx badge (mean 0)');

// ---- computed cells are read-only
await page.dblclick('td[data-gc="score_z"][data-gr="0"]');   // a click now SELECTS
await page.waitForTimeout(300);
const readonly = await page.evaluate(() => ({
    editor: !!document.querySelector('.ps-grid-cellinput'),
    toast: (document.getElementById('ps-toast') || {}).textContent || ''
}));
if (readonly.editor || !/computed from a formula/i.test(readonly.toast))
    throw new Error('computed cell was editable: ' + JSON.stringify(readonly));
console.log('  ok  computed cells refuse edits and explain why');

// ---- editing a SOURCE cell recomputes the column
const beforeEdit = await page.evaluate(() =>
    window.PS_SHELL.project.table.columns.score_z[0]);
await page.dblclick('td[data-gc="score"][data-gr="0"]');     // a click now SELECTS
await page.waitForTimeout(200);
await page.keyboard.press('ControlOrMeta+a');
await page.keyboard.type('120');
await page.keyboard.press('Enter');
await page.waitForTimeout(600);
await page.keyboard.press('Escape');
const afterEdit = await page.evaluate(() => ({
    z0: window.PS_SHELL.project.table.columns.score_z[0],
    raw0: window.PS_SHELL.project.table.raw.score_z[0]
}));
if (afterEdit.z0 === beforeEdit || afterEdit.z0 == null)
    throw new Error('formula did not recompute on edit: ' +
                    JSON.stringify({ beforeEdit, afterEdit }));
console.log('  ok  editing a source cell recalculates the computed column');

// ---- charts consume the computed column
await page.evaluate(() => {
    window.PS_SHELL.setRoles('plotbuilder',
        { xvar: 'condition', yvar: 'score_z' });
    window.PS_SHELL.setModule('plotbuilder');
});
await page.waitForTimeout(500);
const chart = await page.evaluate(() => {
    const p = window.PS_SHELL.buildPayload();
    return { bars: p.bars.length, yLabel: p.yLabel };
});
if (chart.bars !== 3)
    throw new Error('computed column did not drive a chart: ' +
                    JSON.stringify(chart));
console.log('  ok  computed columns drive charts like any variable');

// ---- a filter must NOT shift the z-score (computed = full-table data)
const zBefore = await page.evaluate(() =>
    window.PS_SHELL.project.table.columns.score_z[1]);
await page.evaluate(() => {
    window.PS_SHELL.setFilters([{ col: 'site', op: 'eq', value: 'East' }]);
});
await page.waitForTimeout(500);
const zSeam = await page.evaluate(() => ({
    z1: window.PS_SHELL.project.table.columns.score_z[1],
    viewRows: window.PS_SHELL.project.table.filteredView
        ? window.PS_SHELL.project.table.filteredView.raw.score_z.length : null
}));
if (zSeam.z1 !== zBefore)
    throw new Error('filter shifted the computed z-score: ' +
                    JSON.stringify({ zBefore, zSeam }));
if (zSeam.viewRows !== 12)
    throw new Error('filtered view row count wrong: ' + JSON.stringify(zSeam));
await page.evaluate(() => { window.PS_SHELL.setFilters([]); });
await page.waitForTimeout(400);
console.log('  ok  row filters never shift computed values (full-table aggregates)');

// ---- renaming the source variable rewrites the formula
await page.evaluate(() => {
    window.PS_SHELL.selectVariable('score');
});
await page.waitForTimeout(300);
await page.evaluate(() => {
    const input = document.getElementById('ps-variable-name');
    input.value = 'points';
    input.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(600);
const renamed = await page.evaluate(() => ({
    formula: window.PS_SHELL.project.table.computed.score_z,
    z0: window.PS_SHELL.project.table.columns.score_z[0]
}));
if (renamed.formula !== '(points - VMEAN(points)) / VSD(points)' ||
    renamed.z0 == null)
    throw new Error('rename did not rewrite the formula: ' +
                    JSON.stringify(renamed));
console.log('  ok  renaming a source variable rewrites every formula that uses it');

// ---- a text recode lands nominal (IF chains)
const recode = await page.evaluate(() =>
    window.PS_SHELL.saveComputedColumn('dose_group',
        'IF(condition == "Control", "none", "dosed")', null, 'condition'));
await page.waitForTimeout(500);
const recodeState = await page.evaluate(() => ({
    type: window.PS_SHELL.project.table.types.dose_group,
    levels: window.PS_SHELL.project.table.levels.dose_group
}));
if (recode.error || recodeState.type !== 'nominal' ||
    JSON.stringify(recodeState.levels.slice().sort()) !== '["dosed","none"]')
    throw new Error('recode wrong: ' + JSON.stringify({ recode, recodeState }));
console.log('  ok  IF-recodes land as nominal variables with proper levels');

// ---- undo removes the recode column entirely
await page.click('[data-ps-workspace="data"]');
await page.waitForTimeout(300);
await page.keyboard.press('ControlOrMeta+z');
await page.waitForTimeout(500);
if (await page.evaluate(() =>
    window.PS_SHELL.project.table.order.indexOf('dose_group') !== -1))
    throw new Error('undo did not remove the computed column');
console.log('  ok  computed columns ride the Data undo history');

// ---- persistence: reload + .pand
await page.reload();
await page.waitForTimeout(900);
const reloaded = await page.evaluate(() => ({
    formula: (window.PS_SHELL.project.table.computed || {}).score_z,
    z0: window.PS_SHELL.project.table.columns.score_z[0]
}));
if (!reloaded.formula || reloaded.z0 == null)
    throw new Error('computed column lost on reload: ' +
                    JSON.stringify(reloaded));
const fileText = await page.evaluate(() => window.PS_SHELL.projectFileText());
const tmp = '/tmp/ps-computed.pand';
fs.writeFileSync(tmp, fileText);
const ctx2 = await browser.newContext();
const page2 = await ctx2.newPage();
await page2.goto(PAGE);
await page2.waitForTimeout(500);
await page2.click('#ps-welcome-new');
await page2.waitForTimeout(250);
await page2.setInputFiles('#ps-file', tmp);
await page2.waitForTimeout(900);
const pand = await page2.evaluate(() => ({
    formula: (window.PS_SHELL.project.table.computed || {}).score_z,
    z0: window.PS_SHELL.project.table.columns.score_z[0]
}));
if (!pand.formula || pand.z0 == null)
    throw new Error('.pand did not carry the computed column: ' +
                    JSON.stringify(pand));
console.log('  ok  computed columns survive reload and ride .pand files');
await ctx2.close();

if (errors.length) throw new Error(errors[0]);
await browser.close();
console.log('COMPUTED VARIABLES CHECK: ALL GREEN');
