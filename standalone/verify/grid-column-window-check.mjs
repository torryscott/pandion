// A wide table builds only the columns near the viewport (Oct 5 2026, the
// 12,570 by 1,010 survey file). The grid has always built a window of rows;
// across columns it built everything, so that file put 141,000 cells in the
// page: nine seconds to open the Data workspace and about three for every
// scroll. Body rows now carry the columns near the viewport plus one spacer
// cell either side. The header row and the colgroup still carry every column.
//
// What must hold:
//   - a table under the threshold renders whole, with no spacer anywhere
//   - on a wide table the built cells sit exactly under their own headers
//   - scrolling sideways never shows a column without its cells
//   - the keyboard, the cell editor and Find all reach a column that was not
//     built when they started
//   - a column resize leaves the window true
// Control: against the tree before this change, case 2 fails (every row
// carries all 200 cells and there is no spacer).
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
const SOFT = process.env.PS_SOFT === '1';
let failed = 0;
function ok(cond, msg) {
    if (!cond) {
        if (!SOFT) throw new Error(msg);
        failed++; console.log('  FAIL  ' + msg); return;
    }
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

async function load(nCols, nRows, mark) {
    await page.evaluate(async ([cols, rows, m]) => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const header = [];
        for (let c = 0; c < cols; c++) header.push('c' + String(c + 1).padStart(3, '0'));
        const body = [];
        for (let i = 0; i < rows; i++) {
            const row = [];
            for (let c = 0; c < cols; c++) row.push(String((i * 7 + c) % 101));
            body.push(row);
        }
        if (m) body[m.row][m.col] = m.text;
        window.PS_SHELL.loadTable('wide', header, body);
        await sleep(900);
        window.PS_SHELL.setWorkspace('data');
        await sleep(500);
    }, [nCols, nRows, mark || null]);
    await page.waitForTimeout(500);
}
// What is built, and whether it is where it should be.
const shape = () => page.evaluate(() => {
    const grid = document.getElementById('ps-datagrid');
    const gb = grid.getBoundingClientRect();
    const ths = Array.from(grid.querySelectorAll('thead th[data-grid-col]'));
    const row = Array.from(grid.querySelectorAll('tbody tr'))
        .find(tr => tr.querySelector('td[data-gc]'));
    const tds = row ? Array.from(row.querySelectorAll('td[data-gc]')) : [];
    const byName = {};
    tds.forEach(td => { byName[td.getAttribute('data-gc')] = td; });
    let worst = 0, uncovered = [];
    ths.forEach(th => {
        const name = th.getAttribute('data-grid-col');
        const hb = th.getBoundingClientRect();
        const td = byName[name];
        if (td) {
            const tb = td.getBoundingClientRect();
            worst = Math.max(worst, Math.abs(tb.left - hb.left),
                             Math.abs(tb.width - hb.width));
        } else if (hb.right > gb.left + 47 && hb.left < gb.right) {
            uncovered.push(name);       // a header on screen with no cells
        }
    });
    return {
        ths: ths.length,
        cols: grid.querySelectorAll('colgroup col').length,
        rowCells: tds.length,
        first: tds.length ? tds[0].getAttribute('data-gc') : '',
        last: tds.length ? tds[tds.length - 1].getAttribute('data-gc') : '',
        spacers: grid.querySelectorAll('td.ps-grid-colspacer').length,
        allCells: grid.querySelectorAll('td[data-gc]').length,
        worst, uncovered,
        scrollLeft: grid.scrollLeft, scrollWidth: grid.scrollWidth,
        clientWidth: grid.clientWidth
    };
});
const scrollTo = async left => {
    await page.evaluate(x => { document.getElementById('ps-datagrid').scrollLeft = x; }, left);
    await page.waitForTimeout(220);
};
const active = () => page.evaluate(() => {
    const grid = document.getElementById('ps-datagrid');
    const id = grid.getAttribute('aria-activedescendant');
    const td = id ? document.getElementById(id) : null;
    if (!td) return null;
    const b = td.getBoundingClientRect(), gb = grid.getBoundingClientRect();
    return { col: td.getAttribute('data-gc'), row: Number(td.getAttribute('data-gr')),
             inView: b.left >= gb.left - 1 && b.right <= gb.right + 1 };
});
const cellPoint = (col, row) => page.evaluate(([c, r]) => {
    const td = Array.from(document.querySelectorAll('#ps-datagrid td[data-gc]'))
        .find(x => x.getAttribute('data-gc') === c && Number(x.getAttribute('data-gr')) === r);
    if (!td) return null;
    const b = td.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}, [col, row]);

console.log('case 1: a table under the threshold renders whole');
await load(40, 60);
let s = await shape();
ok(s.ths === 40 && s.rowCells === 40, 'every row carries all 40 cells (' + s.rowCells + ')');
ok(s.spacers === 0, 'and there is no spacer cell anywhere');
ok(s.worst < 1.5, 'cells sit under their headers (worst offset ' + s.worst.toFixed(2) + ' px)');

console.log('case 2: a wide table builds only the columns near the viewport');
await load(200, 300, { row: 250, col: 189, text: 'needle-xyz' });
s = await shape();
ok(s.ths === 200 && s.cols === 201, 'the header and the colgroup still carry all 200 columns');
ok(s.rowCells > 5 && s.rowCells < 60, 'a body row carries ' + s.rowCells + ' cells, not 200');
ok(s.first === 'c001', 'starting at the first column');
ok(s.spacers > 0, 'with a spacer standing in for the rest');
ok(s.worst < 1.5, 'the built cells sit exactly under their own headers (worst ' + s.worst.toFixed(2) + ' px)');
ok(s.uncovered.length === 0, 'and no header on screen is missing its cells');
ok(s.scrollWidth > s.clientWidth * 5, 'the table keeps its full width to scroll (' + s.scrollWidth + ' px)');

console.log('case 3: scrolling sideways brings the columns with it');
let gaps = [];
const widthAll = s.scrollWidth;
for (let x = 500; x < widthAll; x += 700) {
    await scrollTo(x);
    const at = await shape();
    if (at.uncovered.length || at.worst >= 1.5) gaps.push(x + ':' + at.uncovered.join(',') + ':' + at.worst.toFixed(1));
}
ok(gaps.length === 0, 'at every stop across the table the columns on screen have their cells' +
   (gaps.length ? ' (gaps at ' + gaps.slice(0, 4).join(' | ') + ')' : ''));
await scrollTo(widthAll);
s = await shape();
ok(s.last === 'c200', 'the far end builds the last column (' + s.last + ')');
ok(s.first !== 'c001' && s.rowCells < 60, 'and has let go of the first (' + s.first + ', ' + s.rowCells + ' cells)');
ok(s.worst < 1.5 && s.uncovered.length === 0, 'still aligned there (worst ' + s.worst.toFixed(2) + ' px)');
await scrollTo(0);
s = await shape();
ok(s.first === 'c001' && s.uncovered.length === 0, 'and scrolling back rebuilds the start');

console.log('case 4: the arrow keys walk into columns that were not built');
let pt = await cellPoint('c003', 2);
await page.mouse.click(pt.x, pt.y);
await page.waitForTimeout(150);
const builtAtStart = (await shape()).last;
for (let i = 0; i < 70; i++) await page.keyboard.press('ArrowRight');
await page.waitForTimeout(300);
let a = await active();
ok(a && a.col === 'c073' && a.row === 2, 'seventy presses to the right land on c073 (' + (a && a.col) + ')');
ok(builtAtStart < 'c073', 'a column that did not exist when the walk began (the window ended at ' + builtAtStart + ')');
ok(a && a.inView, 'and the active cell is on screen');
s = await shape();
ok(s.uncovered.length === 0 && s.worst < 1.5, 'with the columns around it built and aligned');

console.log('case 5: typing there edits that column');
await page.keyboard.type('4242');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
const stored = await page.evaluate(() => window.PS_SHELL.project.table.raw.c073[2]);
ok(stored === '4242', 'the value is stored in c073, row 3 (' + stored + ')');
// Enter commits and opens the next cell down for entry, as it always has.
const next = await page.evaluate(() => {
    const input = document.querySelector('#ps-datagrid td input, #ps-datagrid td textarea');
    const td = input ? input.closest('td') : null;
    return td ? td.getAttribute('data-gc') + '/' + td.getAttribute('data-gr') : null;
});
ok(next === 'c073/3', 'Enter moved the editor down within the same column (' + next + ')');
await page.keyboard.press('Escape');
await page.waitForTimeout(250);
const shown = await page.evaluate(() => {
    const td = Array.from(document.querySelectorAll('#ps-datagrid td[data-gc]'))
        .find(x => x.getAttribute('data-gc') === 'c073' && x.getAttribute('data-gr') === '2');
    return td ? td.textContent.trim() : null;
});
ok(shown && shown.indexOf('4242') === 0, 'and the grid shows it (' + shown + ')');

console.log('case 6: a column resize leaves the window true');
await scrollTo(0);
await page.evaluate(() => { document.getElementById('ps-datagrid').scrollTop = 0; });
await page.waitForTimeout(250);
const grip = await page.evaluate(() => {
    const th = document.querySelector('#ps-datagrid thead th[data-grid-col="c002"]');
    const r = th.querySelector('.ps-grid-col-resizer');
    const b = (r || th).getBoundingClientRect();
    return { x: r ? b.x + b.width / 2 : b.right - 2, y: b.y + b.height / 2,
             w: th.getBoundingClientRect().width };
});
await page.mouse.move(grip.x, grip.y);
await page.mouse.down();
await page.mouse.move(grip.x + 120, grip.y, { steps: 6 });
await page.mouse.move(grip.x + 260, grip.y, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(350);
const wider = await page.evaluate(() =>
    document.querySelector('#ps-datagrid thead th[data-grid-col="c002"]').getBoundingClientRect().width);
ok(wider > grip.w + 150, 'the column is wider (' + Math.round(grip.w) + ' to ' + Math.round(wider) + ' px)');
s = await shape();
ok(s.worst < 1.5 && s.uncovered.length === 0, 'cells still sit under their headers, none missing (worst ' + s.worst.toFixed(2) + ' px)');
gaps = [];
for (let x = 400; x < 4200; x += 600) {
    await scrollTo(x);
    const at = await shape();
    if (at.uncovered.length || at.worst >= 1.5) gaps.push(x + ':' + at.uncovered.join(','));
}
ok(gaps.length === 0, 'and scrolling on from there stays covered' + (gaps.length ? ' (gaps at ' + gaps.join(' | ') + ')' : ''));

console.log('case 7: select all still means the whole table');
await scrollTo(0);
pt = await cellPoint('c003', 2);
await page.mouse.click(pt.x, pt.y);
await page.waitForTimeout(120);
await page.keyboard.press((process.platform === 'darwin' ? 'Meta' : 'Control') + '+a');
await page.waitForTimeout(250);
const sel = await page.evaluate(() => ({
    status: document.getElementById('ps-grid-selection-status').textContent,
    stats: document.getElementById('ps-grid-stats').textContent
}));
console.log('  --  ' + sel.status + ' | ' + sel.stats);
ok(/60,?000/.test(sel.status + ' ' + sel.stats),
   'the selection counts all 60,000 cells, built or not');

console.log('case 8: Find reveals a match far outside what is built');
await scrollTo(0);
await page.evaluate(() => { document.getElementById('ps-datagrid').scrollTop = 0; });
await page.waitForTimeout(250);
ok((await cellPoint('c190', 250)) === null, 'the cell holding the match is not built before the search');
await page.click('#ps-data-find-btn');
await page.waitForTimeout(250);
await page.fill('#ps-data-find', 'needle-xyz');
await page.waitForTimeout(500);
await page.keyboard.press('Enter');
await page.waitForTimeout(600);
const found = await page.evaluate(() => {
    const grid = document.getElementById('ps-datagrid');
    const td = Array.from(grid.querySelectorAll('td[data-gc]'))
        .find(x => x.getAttribute('data-gc') === 'c190' && x.getAttribute('data-gr') === '250');
    if (!td) return null;
    const b = td.getBoundingClientRect(), gb = grid.getBoundingClientRect();
    return { text: td.textContent.trim(),
             inView: b.left >= gb.left && b.right <= gb.right + 1 &&
                     b.top >= gb.top && b.bottom <= gb.bottom + 1 };
});
ok(found && found.text.indexOf('needle-xyz') === 0, 'the matching cell is built (' + (found && found.text) + ')');
ok(found && found.inView, 'and on screen');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
if (failed) { console.log('\ngrid-column-window-check: ' + failed + ' FAILED'); process.exit(1); }
console.log('\ngrid-column-window-check: all cases passed');
