// Punch list items 18a, 18b and 18c: the three ways inferType got a column's
// type wrong and said nothing.
//
//   18a  inferType tested the MODULE constant {"": 1, "NA": 1} instead of the
//        table's declared missing tokens, so typing "." or "-99" into the
//        missing-labels field did nothing for typing. And the escape hatch was
//        broken too: setMissingTokens re-read the cells but never re-decided
//        the type, so the column stayed nominal and the user had to change the
//        type by hand as well, with nothing saying so.
//   18b  the first unparseable value returned "nominal" and stopped, so a typo
//        in row 40,000 demoted a whole column with no count and no offender
//        named - and the import preview shows six rows, so it was invisible.
//   18c  "007" and "0x10" parsed as 7 and 16, so participant ids, ZIP codes and
//        student numbers were rewritten on screen and in every chart label.
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
const page = await browser.newPage({ viewport: { width: 1500, height: 960 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
function ok(cond, msg) {
    if (!cond) throw new Error(msg);
    console.log('  ok  ' + msg);
}
await page.goto(pageUrl);
await page.waitForTimeout(500);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(400);
}

// ---------------------------------------------------------------- 18a
console.log('case 1: declared missing tokens decide the type');
// "." is the sentinel the field's own placeholder advertises.
await page.evaluate(() => {
    window.PS_SHELL.loadTable('sentinels', ['grp', 'score'], [
        ['a', '5'], ['a', '7'], ['b', '.'], ['b', '9'],
        ['a', '6'], ['b', '.'], ['a', '8'], ['b', '4']
    ]);
});
await page.waitForTimeout(400);
const before = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return { type: t.types.score, numericish: t.numericish.score };
});
ok(before.type === 'nominal' && before.numericish === false,
   `setup: "." holds the column at nominal (${JSON.stringify(before)})`);

await page.evaluate(() => window.PS_SHELL.setMissingTokens('NA, .'));
await page.waitForTimeout(500);
const after = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return { type: t.types.score, numericish: t.numericish.score,
             cell2: t.columns.score[2], cell0: t.columns.score[0],
             toast: document.getElementById('ps-toast').textContent };
});
ok(after.cell2 === null,
   'declaring "." missing makes that cell read as missing');
ok(after.type === 'continuous' && after.numericish === true,
   `and the type is re-decided rather than left behind ` +
   `(${after.type}, numericish ${after.numericish})`);
ok(after.cell0 === 5, 'the surviving values are stored as numbers');
ok(/score is now Continuous/i.test(after.toast),
   `and the re-typing is disclosed, not silent ("${after.toast.slice(0, 90)}")`);

// No evidence is not a reason to re-type: declaring a column's ONLY value
// missing must not quietly drop it off every value axis.
await page.evaluate(() => {
    window.PS_SHELL.loadTable('blanked', ['grp', 'v'], [
        ['a', '-99'], ['a', '-99'], ['b', '-99'], ['b', '-99']
    ]);
});
await page.waitForTimeout(350);
ok(await page.evaluate(() => window.PS_SHELL.project.table.types.v) === 'continuous',
   'setup: a sentinel-only column starts continuous');
await page.evaluate(() => window.PS_SHELL.setMissingTokens('NA, -99'));
await page.waitForTimeout(450);
const blanked = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return { type: t.types.v, cell: t.columns.v[0] };
});
ok(blanked.type === 'continuous' && blanked.cell === null,
   `blanking every value leaves the type alone (${blanked.type})`);

// Put the sentinel table back for the remaining case-1 assertions.
await page.evaluate(() => {
    window.PS_SHELL.loadTable('sentinels', ['grp', 'score'], [
        ['a', '5'], ['a', '7'], ['b', '.'], ['b', '9'],
        ['a', '6'], ['b', '.'], ['a', '8'], ['b', '4']
    ]);
    window.PS_SHELL.setMissingTokens('NA, .');
});
await page.waitForTimeout(450);

// It is now usable as a value axis, which is the consequence the item names.
const usable = await page.evaluate(() => {
    window.PS_SHELL.setModule('plotbuilder');
    window.PS_SHELL.setRoles('plotbuilder', { xvar: 'grp', yvar: 'score' });
    const p = window.PS_SHELL.buildPayload();
    return p && p.bars ? p.bars.length : 0;
});
ok(usable === 2,
   `the variable drops on a value axis and the chart aggregates (${usable} cells)`);

// A type the USER chose is not overwritten by a later token change.
await page.evaluate(() => {
    window.PS_SHELL.setColType('score', 'nominal');
    window.PS_SHELL.setMissingTokens('NA');
});
await page.waitForTimeout(400);
ok(await page.evaluate(() => window.PS_SHELL.project.table.types.score) === 'nominal',
   'a hand-chosen type survives a later change to the missing labels');

// ---------------------------------------------------------------- 18b
console.log('case 2: one bad value names itself instead of demoting silently');
await page.evaluate(() => {
    const rows = [];
    for (let i = 0; i < 200; i++) rows.push(['g' + (i % 2), String(i % 50)]);
    rows[137][1] = 'n/a';        // the row nobody would ever scroll to
    window.PS_SHELL.loadTable('typo', ['grp', 'value'], rows);
    window.PS_SHELL.setWorkspace('data');
    window.PS_SHELL.selectVariable('value');
});
await page.waitForTimeout(500);
const audit = await page.evaluate(() => {
    const a = window.PS_SHELL.project.table.typeAudit.value;
    return { seen: a.seen, bad: a.bad, offenders: a.offenders,
             firstBadRow: a.firstBadRow, allNamed: a.allBadNamed };
});
ok(audit.bad === 1 && audit.seen === 200,
   `the audit counts every offender rather than stopping at the first ` +
   `(${audit.bad} of ${audit.seen})`);
ok(audit.firstBadRow === 137 && audit.offenders[0].value === 'n/a',
   `and it records which value and which row (row ${audit.firstBadRow})`);

const advice = await page.evaluate(() => {
    const sec = document.getElementById('ps-variable-advice-section');
    return { shown: sec.style.display === 'block',
             text: document.getElementById('ps-variable-advice').innerText,
             actions: Array.from(document.querySelectorAll('[data-advice]'))
                 .map(b => b.getAttribute('data-advice')) };
});
ok(advice.shown, 'the variable inspector says why the column is not numeric');
ok(/1 of 200/.test(advice.text) && /n\/a/.test(advice.text),
   `naming the count and the value ("${advice.text.split('\n')[0].slice(0, 110)}")`);
ok(advice.actions.indexOf('advice-goto') !== -1 &&
   advice.actions.indexOf('advice-missing') !== -1,
   `and offers both ways through (${JSON.stringify(advice.actions)})`);

// "Go to the first one" answers the "unidentifiable" half directly.
await page.click('[data-advice="advice-goto"]');
await page.waitForTimeout(400);
const landed = await page.evaluate(() => {
    const s = window.PS_SHELL.gridSelection();
    const td = document.querySelector(
        '#ps-datagrid td[data-gc="value"][data-gr="137"]');
    return { row: s && s.focusRow, col: s && s.focusCol, rendered: !!td };
});
ok(landed.row === 137 && landed.col === 'value' && landed.rendered,
   `"Go to the first one" scrolls to and selects the offending cell ` +
   `(${JSON.stringify(landed)})`);

await page.evaluate(() => window.PS_SHELL.selectVariable('value'));
await page.waitForTimeout(250);
await page.click('[data-advice="advice-missing"]');
await page.waitForTimeout(600);
const fixed = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return { type: t.types.value, tokens: t.missingTokens,
             cell: t.columns.value[137], raw: t.raw.value[137],
             advice: document.getElementById('ps-variable-advice-section')
                 .style.display };
});
ok(fixed.type === 'continuous' && fixed.cell === null,
   `"Treat these as missing" resolves it in one click (${fixed.type})`);
ok(fixed.tokens.indexOf('n/a') !== -1 && fixed.raw === 'n/a',
   `the token is declared and the original text is untouched ` +
   `(${JSON.stringify(fixed.tokens)}, raw "${fixed.raw}")`);
ok(fixed.advice === 'none', 'and the advisory stands down once resolved');

// A genuinely textual column is NOT nagged: above a fifth this is just text.
await page.evaluate(() => {
    const rows = [];
    for (let i = 0; i < 20; i++) rows.push(['g', i < 8 ? 'lots of text' : String(i)]);
    window.PS_SHELL.loadTable('texty', ['grp', 'label'], rows);
    window.PS_SHELL.selectVariable('label');
});
await page.waitForTimeout(400);
ok(await page.evaluate(() => document.getElementById('ps-variable-advice-section')
       .style.display) === 'none',
   'a column that is genuinely text draws no advisory');

// ---------------------------------------------------------------- 18c
console.log('case 3: zero-padded and hex-looking codes keep their text');
await page.evaluate(() => {
    window.PS_SHELL.loadTable('ids', ['pid', 'zip', 'hexish', 'score'], [
        ['007', '02134', '0x10', '5'],
        ['012', '02134', '0x1f', '7'],
        ['031', '90210', '0x20', '9'],
        ['004', '90210', '0x2a', '4']
    ]);
    window.PS_SHELL.setWorkspace('data');
});
await page.waitForTimeout(500);
const ids = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    const cell = (col, row) => {
        const td = document.querySelector(
            '#ps-datagrid td[data-gc="' + col + '"][data-gr="' + row + '"]');
        return td ? td.textContent : null;
    };
    return { pidType: t.types.pid, zipType: t.types.zip,
             hexType: t.types.hexish, scoreType: t.types.score,
             pidCell: cell('pid', 0), hexCell: cell('hexish', 0),
             pidValue: t.columns.pid[0], scoreValue: t.columns.score[0] };
});
ok(ids.pidType !== 'continuous' && ids.zipType !== 'continuous' &&
   ids.hexType !== 'continuous',
   `codes are not typed as measurements ` +
   `(pid ${ids.pidType}, zip ${ids.zipType}, hex ${ids.hexType})`);
ok(ids.pidCell === '007' && ids.hexCell === '0x10',
   `and the grid shows the value the user typed ` +
   `("${ids.pidCell}", "${ids.hexCell}")`);
ok(ids.pidValue === '007',
   `the typed view keeps the text too, so chart labels cannot rewrite it ` +
   `(${JSON.stringify(ids.pidValue)})`);
ok(ids.scoreType === 'continuous' && ids.scoreValue === 5,
   'an ordinary numeric column beside them is unaffected');

// And the type that exists for exactly this case is now reachable.
await page.evaluate(() => window.PS_SHELL.selectVariable('pid'));
await page.waitForTimeout(300);
const idAdvice = await page.evaluate(() => ({
    shown: document.getElementById('ps-variable-advice-section')
        .style.display === 'block',
    text: document.getElementById('ps-variable-advice').innerText,
    hasId: !!document.querySelector('[data-advice="advice-id"]')
}));
ok(idAdvice.shown && idAdvice.hasId,
   `the inspector routes the user to the ID type ` +
   `("${idAdvice.text.split('\n')[0].slice(0, 110)}")`);
ok(/would become 7/.test(idAdvice.text),
   'and states exactly what the old behaviour would have done to the value');
await page.click('[data-advice="advice-id"]');
await page.waitForTimeout(500);
ok(await page.evaluate(() => window.PS_SHELL.project.table.types.pid) === 'id',
   'one click sets the type to ID');

// Decimals starting with zero are numbers, not codes: the rule has to be
// narrow or it would demote half of every real dataset.
await page.evaluate(() => {
    window.PS_SHELL.loadTable('decimals', ['grp', 'p'], [
        ['a', '0.5'], ['a', '0.25'], ['b', '0'], ['b', '0.125']
    ]);
});
await page.waitForTimeout(400);
const dec = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return { type: t.types.p, first: t.columns.p[0] };
});
ok(dec.type === 'continuous' && dec.first === 0.5,
   `"0.5" and "0" stay continuous (${dec.type}, ${dec.first})`);

// ---------------------------------------------------------------- preview
console.log('case 4: the import preview discloses it before adoption');
const previewNote = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const rows = ['grp,value'];
    for (let i = 0; i < 400; i++) rows.push('g' + (i % 2) + ',' + (i % 30));
    rows[301] = 'g0,oops';
    const file = new File([rows.join('\n')], 'typo.csv', { type: 'text/csv' });
    const dt = new DataTransfer();
    dt.items.add(file);
    document.dispatchEvent(new DragEvent('drop',
        { dataTransfer: dt, bubbles: true, cancelable: true }));
    await sleep(900);
    return document.getElementById('ps-import-preview').innerText;
});
ok(/otherwise numeric/i.test(previewNote) && /oops/.test(previewNote),
   `the preview names the value that decided the type, though it is far ` +
   `outside the six visible rows ("${(previewNote.match(
       /[^\n]*otherwise numeric[^\n]*/) || [''])[0].slice(0, 130)}")`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('TYPING CHECK PASS');
await browser.close();
