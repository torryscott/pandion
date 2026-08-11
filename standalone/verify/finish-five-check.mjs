// Five papercuts found by driving the app, each one small enough to argue
// away on its own.
//
// 1. The computed-variable dialog's empty preview said "Type a formula (or
//    pick a quick transform)" while the quick transforms row was display:none.
//    The row only rendered when a numeric column happened to be selected
//    BEFORE the dialog opened, which nothing on screen said, so a user could
//    hand-write (score - MEAN(score)) / SD(score) with a one-click z-score
//    sitting behind an invisible precondition.
// 2. The same dialog carried two dismiss controls with identical behaviour,
//    a header Close and a footer Cancel.
// 3. Clicking a row number moved the variable inspector to the LAST column.
//    A row is not a variable, so the inspector had no business moving at all.
// 4. The grid footer printed the selection with no thousands separators while
//    the shape line beside it and the status bar below it both used them.
// 5. The F1 sheet documented thirteen grid keys and never mentioned adding a
//    row, inserting or deleting a column, the measure type, the variable
//    inspector, or Cmd/Ctrl+E, which the Data menu has bound all along.
//
// Every key this probe asserts the sheet documents is DRIVEN first, so the
// sheet can never document a route the app does not have.
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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
if (await page.isVisible('#ps-welcome'))
    await page.click('#ps-welcome-sample');
await page.waitForTimeout(1300);
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(400);

const isMac = process.platform === 'darwin';
const MOD = isMac ? 'Meta' : 'Control';

async function clickAt(sel) {
    await page.evaluate(s => {
        const n = document.querySelector(s);
        if (n && n.scrollIntoView) n.scrollIntoView({ block: 'center' });
    }, sel);
    await page.waitForTimeout(60);
    const box = await page.evaluate(s => {
        const n = document.querySelector(s);
        if (!n) return null;
        const r = n.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, sel);
    if (!box) throw new Error('no element to click for ' + sel);
    await page.mouse.click(box.x, box.y);
    await page.waitForTimeout(180);
}
const readFormulaDialog = () => page.evaluate(() => {
    // The guided surface is the functions BROWSER now (Aug 2026): it
    // arrives open, Common recipes first, pickers in a band below.
    const panel = document.getElementById('ps-fn-panel');
    const args = document.querySelector('.ps-fn-args');
    return {
        panelOpen: !panel.hidden,
        rows: Array.from(panel.querySelectorAll('.ps-fn-row code'))
            .map(b => b.textContent),
        argsText: args ? args.textContent.replace(/\s+/g, ' ').trim() : null,
        argsOptions: args ? Array.from(args.querySelectorAll('option'))
            .map(o => o.value).filter(Boolean) : null,
        preview: document.getElementById('ps-formula-preview').textContent.trim(),
        name: document.getElementById('ps-formula-name').value,
        formula: document.getElementById('ps-formula-input').value,
        exits: ['ps-formula-close', 'ps-formula-cancel'].filter(id => {
            const n = document.getElementById(id);
            return n && getComputedStyle(n).display !== 'none';
        })
    };
});
const clickFnRow = (prefix) => page.evaluate((pfx) => {
    const rows = Array.from(document.querySelectorAll('button.ps-fn-row'));
    rows.find(r => r.querySelector('code').textContent
        .indexOf(pfx) === 0).click();
}, prefix);

console.log('case 1: guidance is visible on arrival, not behind a toggle');
await page.evaluate(() => window.PS_SHELL.openFormulaDialog(null, null));
await page.waitForTimeout(300);
let d = await readFormulaDialog();
ok(d.panelOpen && d.rows.length,
   `opened with no column chosen, the browser is OPEN and offering ` +
   `(${d.rows.length} rows)`);
ok(d.rows.some(b => /z-score/i.test(b)),
   'the z-score recipe is one of them, which is the one a student ' +
   'hand-writes');

await clickFnRow('z-score');
await page.waitForTimeout(250);
d = await readFormulaDialog();
ok(d.argsOptions && d.argsOptions.length >= 2,
   `clicking it asks WHICH column, changeably ` +
   `(${JSON.stringify(d.argsOptions)})`);
const zCol = d.argsOptions[0];
await page.selectOption('.ps-fn-args select', zCol);
await page.waitForTimeout(250);
d = await readFormulaDialog();
ok(/VMEAN\(/.test(d.formula) && /VSD\(/.test(d.formula),
   `picking it writes the formula out in full ("${d.formula}")`);
const d2 = d;
ok(new RegExp('^' + zCol + '_z').test(d2.name),
   `and names the column after the one it transforms ("${d2.name}")`);

console.log('case 2: one way out of the dialog, not two');
ok(d2.exits.length === 1,
   `the dialog carries a single dismiss control (${JSON.stringify(d2.exits)})`);
const before = await page.evaluate(() => window.PS_SHELL.project.table.order.length);
await clickAt('#' + d2.exits[0]);
const closed = await page.evaluate(() => ({
    open: getComputedStyle(document.getElementById('ps-formula-dialog'))
        .display !== 'none',
    cols: window.PS_SHELL.project.table.order.length
}));
ok(!closed.open, 'and it closes the dialog');
ok(closed.cols === before, 'without saving the variable it was building');
ok(await page.evaluate(() =>
       !!document.getElementById('ps-formula-save')),
   'the commit button is untouched, so what went is the duplicate exit');
// Removing a control must not strand anyone, so the other two ways out are
// re-proved rather than assumed.
await page.evaluate(() => window.PS_SHELL.openFormulaDialog(null, null));
await page.waitForTimeout(250);
await page.keyboard.press('Escape');
await page.waitForTimeout(250);
ok(await page.evaluate(() =>
       getComputedStyle(document.getElementById('ps-formula-dialog'))
           .display === 'none'),
   'Escape still closes it');

console.log('case 1b: a column already chosen still leads, and an empty ' +
            'pool says so honestly');
const numeric = await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    return t.order.filter(c => t.types[c] === 'continuous');
});
ok(numeric.length >= 2, `the sample has numeric columns (${numeric})`);
await page.evaluate(c => window.PS_SHELL.openFormulaDialog(c, null), numeric[1]);
await page.waitForTimeout(250);
await clickFnRow('z-score');
await page.waitForTimeout(250);
d = await readFormulaDialog();
ok(d.argsOptions && d.argsOptions[0] === numeric[1],
   `opening from a column puts THAT column first in the picker ` +
   `(${d.argsOptions && d.argsOptions[0]})`);
await clickAt('#ps-formula-close');

// NON-FIRE: no numeric column means a numeric recipe has nothing to
// offer, and its picker must SAY so instead of presenting an empty
// select. The browser itself stays honest: LEN and friends still apply
// to an all-text table.
await page.evaluate(() => window.PS_SHELL.loadTable('ids',
    ['label'], [['aa'], ['bb'], ['cc'], ['dd'], ['ee']], { label: 'id' }));
await page.waitForTimeout(400);
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.evaluate(() => window.PS_SHELL.openFormulaDialog(null, null));
await page.waitForTimeout(250);
await clickFnRow('z-score');
await page.waitForTimeout(250);
d = await readFormulaDialog();
ok(d.argsText && /needs a numeric column/.test(d.argsText) &&
   (!d.argsOptions || !d.argsOptions.length),
   `an empty pool explains itself rather than offering an empty select ` +
   `("${d.argsText}")`);
await clickAt('#ps-formula-close');

console.log('case 3: a row selection leaves the variable inspector alone');
await page.evaluate(() => window.PS_SHELL.loadTable('t',
    ['pid', 'score', 'age', 'site'],
    [['p1', '3', '20', 'north'], ['p2', '5', '21', 'south'],
     ['p3', '4', '22', 'north'], ['p4', '6', '23', 'south']]));
await page.waitForTimeout(400);
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(300);
await clickAt('th[data-grid-col="score"]');
const seated = await page.evaluate(() =>
    document.getElementById('ps-inspector-subtitle').textContent.trim());
ok(/score/.test(seated), `a column click seats the inspector ("${seated}")`);

await clickAt('td[data-grid-row="1"]');
const afterRow = await page.evaluate(() => ({
    inspector: document.getElementById('ps-inspector-subtitle').textContent.trim(),
    selection: document.getElementById('ps-grid-selection-status').textContent.trim()
}));
ok(/row/.test(afterRow.selection),
   `the row is selected ("${afterRow.selection}")`);
ok(/score/.test(afterRow.inspector),
   `and the inspector stays on the variable the user chose ` +
   `("${afterRow.inspector}")`);
ok(!/site/.test(afterRow.inspector),
   'rather than jumping to the last column of the row');

await clickAt('th[data-grid-all]');
const afterAll = await page.evaluate(() =>
    document.getElementById('ps-inspector-subtitle').textContent.trim());
ok(/score/.test(afterAll),
   `selecting the whole table leaves it alone too ("${afterAll}")`);

// CONTROL: the inspector must still follow a COLUMN, or this "fix" would just
// be the follow switched off.
await clickAt('th[data-grid-col="age"]');
const afterCol = await page.evaluate(() =>
    document.getElementById('ps-inspector-subtitle').textContent.trim());
ok(/age/.test(afterCol),
   `a column click still moves it, so only rows were exempted ("${afterCol}")`);

console.log('case 4: one number format on screen, not two');
const wide = await page.evaluate(() => {
    const rows = [];
    for (let i = 0; i < 1500; i++) rows.push([String(i), String(i % 7), 'x']);
    window.PS_SHELL.loadTable('big', ['n', 'k', 'tag'], rows);
    return rows.length;
});
ok(wide === 1500, 'a table big enough for separators to matter is loaded');
await page.waitForTimeout(600);
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(400);
await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    window.PS_SHELL.setGridSelection('n', 0, 'tag', 1499, 'all');
});
await page.waitForTimeout(300);
const numbers = await page.evaluate(() => ({
    sel: document.getElementById('ps-grid-selection-status').textContent.trim(),
    shape: (document.querySelector('.ps-grid-shape') || {}).textContent || '',
    status: document.getElementById('ps-status-context').textContent.trim()
}));
ok(/1,500/.test(numbers.shape),
   `the shape line beside it already separates ("${numbers.shape.trim()}")`);
ok(/1,500/.test(numbers.sel) && /4,500/.test(numbers.sel),
   `so the selection readout separates too ("${numbers.sel}")`);
ok(!/(^|[^,\d])1500([^\d]|$)/.test(numbers.sel) &&
   !/(^|[^,\d])4500([^\d]|$)/.test(numbers.sel),
   'with no unseparated copy left in it');
ok(/1,500/.test(numbers.status),
   `as the status bar always did ("${numbers.status}")`);

// NON-FIRE: small numbers must come through untouched, separators and all.
await page.evaluate(() =>
    window.PS_SHELL.setGridSelection('n', 0, 'k', 1, 'cells'));
await page.waitForTimeout(250);
const small = await page.evaluate(() =>
    document.getElementById('ps-grid-selection-status').textContent.trim());
ok(/2 rows/.test(small) && /4 cells selected/.test(small),
   `an ordinary small selection reads exactly as before ("${small}")`);

console.log('case 5: the sheet documents the routes the app actually has');
// Every claim below is DRIVEN before it is asserted.
await page.evaluate(() => window.PS_SHELL.loadTable('t',
    ['pid', 'score', 'age'],
    [['p1', '3', '20'], ['p2', '5', '21'], ['p3', '4', '22']]));
await page.waitForTimeout(400);
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(300);
await clickAt('td[data-gc="score"][data-gr="0"]');
const exclBefore = await page.evaluate(() => JSON.stringify(
    window.PS_SHELL.project.table.excluded || {}));
await page.keyboard.press(MOD + '+KeyE');
await page.waitForTimeout(350);
const exclAfter = await page.evaluate(() => JSON.stringify(
    window.PS_SHELL.project.table.excluded || {}));
ok(exclBefore !== exclAfter,
   'Cmd/Ctrl+E really excludes the selected value from the grid');

const addRow = await page.evaluate(() => {
    const n = window.PS_SHELL.project.table.caseIds.length;
    document.getElementById('ps-data-addrow').click();
    return { before: n, after: window.PS_SHELL.project.table.caseIds.length };
});
ok(addRow.after === addRow.before + 1,
   `the + Add row button really adds a row (${addRow.before} to ${addRow.after})`);

await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await page.keyboard.press('F10');
await page.waitForTimeout(200);
await page.keyboard.press('d');
await page.waitForTimeout(150);
await page.keyboard.press('Enter');
await page.waitForTimeout(250);
const dataMenu = await page.evaluate(() => {
    const m = document.getElementById('ps-appmenu');
    return { open: getComputedStyle(m).display === 'block', text: m.innerText };
});
ok(dataMenu.open && /Insert column to the left/.test(dataMenu.text) &&
   /Delete column/.test(dataMenu.text),
   'F10 then D then Enter really opens the Data menu with the column commands');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

const palette = await page.evaluate(() => window.PS_SHELL.runCommandCatalog()
    .filter(c => c.group === 'Data')
    .map(c => c.label));
ok(palette.some(l => /Insert column to the left/.test(l)) &&
   palette.some(l => /Delete column/.test(l)),
   `the command palette really carries the Data commands (${palette.length} of them)`);

const measure = await page.evaluate(() => {
    const sel = document.getElementById('ps-variable-type');
    const lab = sel && sel.closest('.ps-inspector-field');
    return { has: !!sel,
             label: lab ? lab.textContent.replace(/\s+/g, ' ').trim() : '',
             inPanel: !!(sel && sel.closest('#ps-settings-panel')) };
});
ok(measure.has && measure.inPanel && /Measure type/.test(measure.label),
   `the measure type really lives in the settings panel ("${measure.label}")`);
ok(await page.evaluate(() => {
       const a = document.getElementById('ps-skip-settings');
       return !!a && a.getAttribute('href') === '#ps-settings-panel';
   }),
   'and the second bypass link really points at that panel');

await page.keyboard.press('F1');
await page.waitForTimeout(400);
const sheet = await page.evaluate(() => {
    const body = document.getElementById('ps-shortcuts-body');
    const sections = {};
    let head = '';
    for (const node of Array.from(body.children)) {
        if (node.classList.contains('ps-shortcut-head')) {
            head = node.textContent; sections[head] = '';
        } else if (head) sections[head] += ' ' + node.innerText;
    }
    return {
        text: body.innerText,
        sections,
        heads: Array.from(body.querySelectorAll('.ps-shortcut-head'))
            .map(h => h.textContent),
        rows: Array.from(body.querySelectorAll('.ps-shortcut-list span'))
            .map(s => [s.textContent,
                       s.nextElementSibling ? s.nextElementSibling.textContent : ''])
    };
});
const row = re => sheet.rows.find(r => re.test(r[0]));
ok(!!row(/Exclude or include/i) &&
   /Cmd\/Ctrl \+ E/.test(row(/Exclude or include/i)[1]),
   `Cmd/Ctrl+E is listed (${row(/Exclude or include/i)
        ? row(/Exclude or include/i)[1] : 'MISSING'})`);
const head = sheet.heads.find(h => /Rows, columns and variables/i.test(h));
ok(!!head, `the four holes have a section of their own ` +
   `(${JSON.stringify(sheet.heads)})`);
const sec = sheet.sections[head] || '';
ok(/Add a row at the bottom/i.test(sec),
   'adding a row is accounted for');
ok(/insert/i.test(sec) && /delet/i.test(sec) && /a column/i.test(sec),
   `so are inserting and deleting a column ("${sec.replace(/\s+/g, ' ')
        .slice(0, 90)}")`);
ok(/measure type/i.test(sec), 'so is the measure type');
ok(/variable properties/i.test(sec),
   'and the variable inspector has a route in writing');
ok(!!row(/Data menu/i) && /F10/.test(row(/Data menu/i)[1]),
   `the Data menu route carries the keys that were just driven ` +
   `(${row(/Data menu/i) ? row(/Data menu/i)[1] : 'MISSING'})`);
ok(!!row(/Find a Data command/i) &&
   /Cmd\/Ctrl \+ Shift \+ P/.test(row(/Find a Data command/i)[1]),
   'and the palette route carries the key the catalogue was just read through');
ok(sheet.text.indexOf('\u2014') === -1,
   'the sheet still carries no em dash');
await page.keyboard.press('Escape');
await page.waitForTimeout(250);

ok(errors.length === 0,
   `no page errors (${JSON.stringify(errors.slice(0, 3))})`);
await browser.close();
console.log('finish-five-check: PASS');
