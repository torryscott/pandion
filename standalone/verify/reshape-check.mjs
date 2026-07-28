// Real-browser check for RESHAPE LONG-TO-WIDE (Tier 1, Torry's
// rulings): refuse-and-explain DEFAULTS with explicit one-click
// remedies. Trial-level data (many rows per person per occasion)
// refuses naming a concrete case; the "average" remedy previews exact
// means with disclosure. An inconsistent carried column refuses
// loudly; the "carry first value" remedy proceeds. Applying replaces
// the table in ONE undoable step, drives Repeated Measures end to
// end, and remedies RESET when the column choices change.
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
await page.waitForTimeout(900);

// Trial-level long data: 3 subjects x 2 sessions x 2 trials, one
// carried condition column - s3's condition CONTRADICTS itself.
await page.evaluate(() => {
    const rows = [
        ['s1', 'pre',  '10', 'Control'],
        ['s1', 'pre',  '14', 'Control'],
        ['s1', 'post', '20', 'Control'],
        ['s1', 'post', '24', 'Control'],
        ['s2', 'pre',  '30', 'Drug'],
        ['s2', 'pre',  '34', 'Drug'],
        ['s2', 'post', '40', 'Drug'],
        ['s2', 'post', '44', 'Drug'],
        ['s3', 'pre',  '50', 'Drug'],
        ['s3', 'pre',  '54', 'Drug'],
        ['s3', 'post', '60', 'Control'],   // the contradiction
        ['s3', 'post', '64', 'Control']
    ];
    window.PS_SHELL.loadTable('trials', ['subject', 'session', 'rt', 'condition'],
        rows, { subject: 'id', session: 'nominal', rt: 'continuous',
                condition: 'nominal' });
});
await page.waitForTimeout(500);

// ---- open from the Data overflow menu
await page.click('[data-ps-workspace="data"]');
await page.waitForTimeout(400);
await page.click('#ps-data-more');
await page.waitForTimeout(250);
await page.click('#ps-datamenu-reshape');
await page.waitForTimeout(400);
const opened = await page.evaluate(() => ({
    open: document.getElementById('ps-reshape-dialog').style.display === 'flex',
    id: document.getElementById('ps-reshape-id').value,
    occ: document.getElementById('ps-reshape-occ').value,
    val: document.getElementById('ps-reshape-value').value
}));
if (!opened.open || opened.id !== 'subject' || opened.occ !== 'session' ||
    opened.val !== 'rt')
    throw new Error('dialog defaults wrong: ' + JSON.stringify(opened));
console.log('  ok  the dialog opens with sensible ID/occasions/value defaults');

// ---- DUPLICATES refuse by default, naming a concrete case
const refusal1 = await page.evaluate(() => ({
    problem: document.getElementById('ps-reshape-problem').textContent,
    applyDisabled: document.getElementById('ps-reshape-apply').disabled
}));
if (!/s1 has 2 rows for pre/.test(refusal1.problem) ||
    !/ONE measurement per person per occasion/.test(refusal1.problem) ||
    !refusal1.applyDisabled)
    throw new Error('duplicate refusal wrong: ' + JSON.stringify(refusal1));
console.log('  ok  repeated measurements refuse by default with a concrete example');

// ---- the averaging remedy is an explicit click; means preview exactly
await page.click('[data-reshape-remedy="aggregateMean"]');
await page.waitForTimeout(300);
const refusal2 = await page.evaluate(() => ({
    problem: document.getElementById('ps-reshape-problem').textContent
}));
if (!/condition is not constant within each person/.test(refusal2.problem) ||
    !/s3 has both "Drug" and "Control"/.test(refusal2.problem))
    throw new Error('inconsistency refusal wrong: ' + JSON.stringify(refusal2));
console.log('  ok  the inconsistent carried column then refuses loudly, naming the person');

// ---- carry-first remedy unlocks the preview with BOTH disclosures
await page.click('[data-reshape-remedy="carryFirst"]');
await page.waitForTimeout(300);
const preview = await page.evaluate(() => ({
    note: document.getElementById('ps-reshape-note').textContent,
    table: document.getElementById('ps-reshape-preview').textContent,
    applyDisabled: document.getElementById('ps-reshape-apply').disabled
}));
if (!/6 cells averaged/.test(preview.note) ||
    !/first value/.test(preview.note) || preview.applyDisabled)
    throw new Error('remedied preview wrong: ' + JSON.stringify(preview));
if (!/rt_pre/.test(preview.table) || !/12/.test(preview.table))
    throw new Error('preview means wrong (s1 pre mean should be 12): ' +
                    preview.table);
console.log('  ok  both remedies disclose in the preview note; means are exact');

// ---- apply: one undoable step into wide; RM draws end to end
await page.click('#ps-reshape-apply');
await page.waitForTimeout(700);
const wide = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return { order: t.order, rows: t.raw.subject.length,
             s1pre: t.raw.rt_pre[0], s1post: t.raw.rt_post[0],
             s3cond: t.raw.condition[2],
             toast: (document.getElementById('ps-toast') || {}).textContent };
});
if (JSON.stringify(wide.order) !==
    '["subject","condition","rt_pre","rt_post"]' || wide.rows !== 3)
    throw new Error('wide shape wrong: ' + JSON.stringify(wide));
if (wide.s1pre !== '12' || wide.s1post !== '22' || wide.s3cond !== 'Drug')
    throw new Error('wide values wrong: ' + JSON.stringify(wide));
if (!/one undo restores the long table/.test(wide.toast))
    throw new Error('no undo disclosure: ' + wide.toast);
console.log('  ok  applying lands 3 people x 2 occasions with exact means');
await page.evaluate(() => {
    window.PS_SHELL.setRoles('rmplotbuilder',
        { measures: ['rt_pre', 'rt_post'], betweenVar: 'condition' });
    window.PS_SHELL.setModule('rmplotbuilder');
});
await page.waitForTimeout(600);
const rm = await page.evaluate(() => {
    const p = window.PS_SHELL.buildPayload();
    return { cells: p ? p.bars.length : 0, rm: p ? p.isRepeatedMeasures : false };
});
if (rm.cells !== 4 || !rm.rm)
    throw new Error('reshaped data did not drive RM: ' + JSON.stringify(rm));
console.log('  ok  the reshaped table drives Repeated Measures (2 occasions x 2 groups)');

// ---- one undo restores the long table
await page.click('[data-ps-workspace="data"]');
await page.waitForTimeout(400);
await page.keyboard.press('ControlOrMeta+z');
await page.waitForTimeout(500);
const undone = await page.evaluate(() => ({
    rows: window.PS_SHELL.project.table.raw.subject.length,
    cols: window.PS_SHELL.project.table.order.length
}));
if (undone.rows !== 12 || undone.cols !== 4)
    throw new Error('undo did not restore the long table: ' +
                    JSON.stringify(undone));
console.log('  ok  one undo restores the long table');

// ---- remedies RESET when the column choices change
await page.click('#ps-data-more');
await page.waitForTimeout(250);
await page.click('#ps-datamenu-reshape');
await page.waitForTimeout(400);
await page.click('[data-reshape-remedy="aggregateMean"]');
await page.waitForTimeout(250);
await page.selectOption('#ps-reshape-value', 'rt');   // re-pick = new situation
await page.waitForTimeout(300);
const reset = await page.evaluate(() =>
    document.getElementById('ps-reshape-problem').textContent);
if (!/s1 has 2 rows for pre/.test(reset))
    throw new Error('remedies did not reset on re-pick: ' + reset);
console.log('  ok  changing a column resets accepted remedies (each refusal re-confronted)');

if (errors.length) throw new Error(errors[0]);
await browser.close();
console.log('RESHAPE CHECK: ALL GREEN');
