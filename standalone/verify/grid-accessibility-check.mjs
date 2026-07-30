// Runtime accessibility contract for the standalone Data workspace.
//
// This is deliberately separate from assistive-technology acceptance testing:
// it pins the DOM focus model, virtual coordinates, cell naming relationships,
// and editor announcements that NVDA, JAWS, and VoiceOver depend on.
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
function ok(condition, message) {
    if (!condition) throw new Error(message);
    console.log('  ok  ' + message);
}

const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 960 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
await page.goto(pageUrl);
await page.waitForTimeout(500);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(400);
}

await page.evaluate(async () => {
    const rows = [];
    for (let i = 0; i < 1205; i++) {
        rows.push([
            String(i + 1),
            i === 0 ? '' : String((i * 7) % 101),
            i % 2 ? 'Treatment' : 'Control',
            'Observation ' + (i + 1),
        ]);
    }
    window.PS_SHELL.loadTable(
        'Accessible grid contract',
        ['Participant', 'Score', 'Group', 'Notes'],
        rows,
    );
    window.PS_SHELL.setWorkspace('data');
    await new Promise(resolve => setTimeout(resolve, 700));
});

const structure = await page.evaluate(() => {
    const grid = document.getElementById('ps-datagrid');
    const table = grid.querySelector('table');
    const col = grid.querySelector('th[data-grid-col]');
    const row = grid.querySelector('td[data-grid-row]');
    const cell = grid.querySelector('td[data-gc]');
    return {
        gridRole: grid.getAttribute('role'),
        multi: grid.getAttribute('aria-multiselectable'),
        rowcount: Number(grid.getAttribute('aria-rowcount')),
        colcount: Number(grid.getAttribute('aria-colcount')),
        tableRole: table && table.getAttribute('role'),
        header: col && {
            role: col.getAttribute('role'),
            index: Number(col.getAttribute('aria-colindex')),
            id: col.id,
        },
        row: row && {
            role: row.getAttribute('role'),
            rowindex: Number(row.getAttribute('aria-rowindex')),
            colindex: Number(row.getAttribute('aria-colindex')),
            id: row.id,
        },
        cell: cell && {
            role: cell.getAttribute('role'),
            rowindex: Number(cell.getAttribute('aria-rowindex')),
            colindex: Number(cell.getAttribute('aria-colindex')),
            labelledby: cell.getAttribute('aria-labelledby'),
            id: cell.id,
        },
    };
});
ok(structure.gridRole === 'grid' && structure.multi === 'true',
   'the focus owner is a multiselectable ARIA grid');
ok(structure.rowcount === 1206 && structure.colcount === 5,
   `the grid exposes all rows and visible columns (${structure.rowcount} × ${structure.colcount})`);
ok(structure.tableRole === 'presentation',
   'the layout table does not create a competing nested grid');
ok(structure.header.role === 'columnheader' && structure.header.index === 2 &&
   structure.row.role === 'rowheader' && structure.row.rowindex === 2 &&
   structure.row.colindex === 1,
   'column and row headers expose their roles and 1-based coordinates');
ok(structure.cell.role === 'gridcell' && structure.cell.rowindex === 2 &&
   structure.cell.colindex === 2,
   'the first data cell exposes row 2, column 2 after the header axes');

const relationships = await page.evaluate(() => {
    const cell = document.querySelector('#ps-datagrid td[data-gc]');
    const ids = (cell.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    return {
        labels: ids,
        allExist: ids.every(id => !!document.getElementById(id)),
        state: cell.getAttribute('aria-describedby'),
        stateText: cell.getAttribute('aria-describedby')
            ? document.getElementById(cell.getAttribute('aria-describedby')).textContent
            : '',
    };
});
ok(relationships.labels.length === 3 && relationships.allExist,
   'each gridcell is labelled by a column header, row header, and visible value');

// The second visible cell is Score row 1, intentionally blank.
const missing = await page.evaluate(() => {
    const cell = document.querySelector(
        '#ps-datagrid td[data-gc="Score"][data-gr="0"]',
    );
    const description = cell && cell.getAttribute('aria-describedby');
    return {
        description,
        text: description ? document.getElementById(description).textContent : '',
    };
});
ok(missing.description && /Missing value/.test(missing.text),
   'missing-value state is explicitly associated with the active-cell candidate');

await page.evaluate(async () => {
    window.PS_SHELL.setExcluded('Score', 0, true);
    await new Promise(resolve => setTimeout(resolve, 250));
});
const excluded = await page.evaluate(() => {
    const cell = document.querySelector(
        '#ps-datagrid td[data-gc="Score"][data-gr="0"]',
    );
    const description = cell && cell.getAttribute('aria-describedby');
    return description ? document.getElementById(description).textContent : '';
});
ok(/Value excluded from charts/.test(excluded),
   'excluded state is included in the cell description before editing');
await page.evaluate(async () => {
    window.PS_SHELL.setExcluded('Score', 0, false);
    await new Promise(resolve => setTimeout(resolve, 250));
});

await page.locator('#ps-datagrid').focus();
await page.waitForTimeout(120);
const keyboardEntry = await page.evaluate(() => {
    const grid = document.getElementById('ps-datagrid');
    const cell = document.getElementById(grid.getAttribute('aria-activedescendant'));
    return {
        active: grid.getAttribute('aria-activedescendant'),
        row: cell && Number(cell.getAttribute('data-gr')),
        col: cell && cell.getAttribute('data-gc'),
    };
});
ok(keyboardEntry.active && keyboardEntry.row === 0 &&
   keyboardEntry.col === 'Participant',
   'Tab-style focus entry seats the first visible cell as the active descendant');

const firstCell = page.locator('#ps-datagrid td[data-gc]').first();
await firstCell.click();
await page.waitForTimeout(150);
let active = await page.evaluate(() => {
    const grid = document.getElementById('ps-datagrid');
    return {
        ownsFocus: document.activeElement === grid,
        active: grid.getAttribute('aria-activedescendant'),
        selected: document.querySelector('#ps-datagrid td.ps-grid-sel-focus')?.id,
    };
});
ok(active.ownsFocus && active.active && active.active === active.selected,
   'a selected cell becomes the grid active descendant while DOM focus stays on the grid');

await page.keyboard.press('ArrowDown');
await page.waitForTimeout(150);
active = await page.evaluate(() => {
    const grid = document.getElementById('ps-datagrid');
    const cell = document.getElementById(grid.getAttribute('aria-activedescendant'));
    return {
        active: grid.getAttribute('aria-activedescendant'),
        rowindex: cell && Number(cell.getAttribute('aria-rowindex')),
        row: cell && Number(cell.getAttribute('data-gr')),
    };
});
ok(active.active && active.row === 1 && active.rowindex === 3,
   'Arrow navigation updates the active descendant and virtual row index');

const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
await page.keyboard.press(`${modifier}+ArrowDown`);
await page.waitForTimeout(450);
const last = await page.evaluate(() => {
    const grid = document.getElementById('ps-datagrid');
    const cell = document.getElementById(grid.getAttribute('aria-activedescendant'));
    return {
        rowcount: Number(grid.getAttribute('aria-rowcount')),
        row: cell && Number(cell.getAttribute('data-gr')),
        rowindex: cell && Number(cell.getAttribute('aria-rowindex')),
        labelledbyExists: cell && (cell.getAttribute('aria-labelledby') || '')
            .split(/\s+/).filter(Boolean).every(id => !!document.getElementById(id)),
    };
});
ok(last.row === 1204 && last.rowindex === 1206 && last.rowcount === 1206,
   'the last virtual window retains the dataset total and absolute row position');
ok(last.labelledbyExists,
   'row and column header associations survive a virtual-window rebuild');

// Return to the first row and exercise the dynamic editor.
await page.keyboard.press(`${modifier}+ArrowUp`);
await page.waitForTimeout(350);
await page.keyboard.press('ArrowRight');
await page.keyboard.press('Enter');
await page.waitForTimeout(180);
let editor = await page.evaluate(() => {
    const input = document.querySelector('#ps-datagrid .ps-grid-cellinput');
    return input && {
        label: input.getAttribute('aria-label'),
        describedby: input.getAttribute('aria-describedby'),
        instructions: document.getElementById(input.getAttribute('aria-describedby'))?.textContent,
    };
});
ok(editor && /Edit Score, row 1/.test(editor.label) &&
   /Current value: missing/.test(editor.label),
   `the editor names its variable, row, and current value ("${editor && editor.label}")`);
ok(editor.describedby === 'ps-grid-editor-instructions' &&
   /Enter to save/.test(editor.instructions) && /Escape to cancel/.test(editor.instructions),
   'the editor references save, advance, and cancel instructions');

await page.keyboard.type('42');
await page.keyboard.press('Enter');
await page.waitForTimeout(180);
editor = await page.evaluate(() => {
    const input = document.querySelector('#ps-datagrid .ps-grid-cellinput');
    return {
        label: input && input.getAttribute('aria-label'),
        status: document.getElementById('ps-grid-edit-status').textContent,
    };
});
ok(/Edit Score, row 2/.test(editor.label) &&
   /Saved Score, row 1 as 42/.test(editor.status) &&
   /Editing Score, row 2/.test(editor.status),
   'Enter announces the saved value and the next edited cell');

await page.keyboard.press('Escape');
await page.waitForTimeout(180);
const cancel = await page.evaluate(() => ({
    status: document.getElementById('ps-grid-edit-status').textContent,
    gridFocused: document.activeElement === document.getElementById('ps-datagrid'),
    active: document.getElementById('ps-datagrid').getAttribute('aria-activedescendant'),
}));
ok(/Edit canceled\. Score, row 2\./.test(cancel.status) &&
   cancel.gridFocused && cancel.active,
   'Escape announces cancellation and returns focus to the active grid cell');

const computed = await page.evaluate(async () => {
    const result = window.PS_SHELL.saveComputedColumn(
        'Double Score',
        'Score * 2',
    );
    await new Promise(resolve => setTimeout(resolve, 350));
    const cell = document.querySelector(
        '#ps-datagrid td[data-gc="Double Score"][data-gr="0"]',
    );
    const description = cell && cell.getAttribute('aria-describedby');
    return {
        result,
        readonly: cell && cell.getAttribute('aria-readonly'),
        state: description ? document.getElementById(description).textContent : '',
    };
});
ok(computed.result.ok && computed.readonly === 'true' &&
   /Computed value; edit the formula from the column menu/.test(computed.state),
   `computed cells disclose their read-only formula-editing route ` +
   `(${JSON.stringify(computed)})`);
await page.locator(
    '#ps-datagrid td[data-gc="Double Score"][data-gr="0"]',
).click();
await page.keyboard.press('Enter');
await page.waitForTimeout(180);
const computedEdit = await page.evaluate(() => ({
    editor: !!document.querySelector('#ps-datagrid .ps-grid-cellinput'),
    toast: document.getElementById('ps-toast').textContent,
}));
ok(!computedEdit.editor && /computed from a formula/.test(computedEdit.toast),
   'attempting to edit a computed cell refuses access and announces the formula route');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('GRID ACCESSIBILITY CHECK PASS');
await browser.close();
