// M1 shell probe: CSV import (paste path, real gestures), type inference +
// the type-flip chip, role selects, module switching, per-module option
// isolation, and reload persistence of an imported table.
//
// Usage: node standalone/verify/m1-shell-check.mjs

import { createRequire } from 'node:module';
import path from 'node:path';

function loadPlaywright() {
    const bases = [];
    if (process.env.GB2_NODE_BASE) bases.push(process.env.GB2_NODE_BASE);
    bases.push(new URL('.', import.meta.url).pathname, process.cwd(), '/tmp', '/private/tmp');
    for (const b of bases) {
        try { return createRequire(path.join(b, 'x.js'))('playwright'); }
        catch { /* next */ }
    }
    console.error('playwright not found; cd /tmp && npm i playwright');
    process.exit(2);
}
const playwright = loadPlaywright();
const browserName = process.env.PS_BROWSER || 'chromium';
if (!['chromium', 'firefox', 'webkit'].includes(browserName))
    throw new Error(`Unsupported PS_BROWSER: ${browserName}`);
const browserType = playwright[browserName];
const PAGE = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));

let failures = 0;
function ok(cond, label) {
    if (cond) console.log('  ok  ' + label);
    else { console.log('  FAIL ' + label); failures++; }
}

const browser = await browserType.launch();
async function newTestContext() {
    const context = await browser.newContext();
    if (process.env.PS_OFFLINE === '1') {
        await context.route(/^https?:\/\//, route => route.abort('internetdisconnected'));
    }
    return context;
}
const ctx = await newTestContext();
const page = await ctx.newPage();
// Assign a variable to a role slot via the real click path: click the
// slot's drop box (the card expands into an INLINE picker of eligible
// variables), then pick the variable. Multi-role pickers stay open
// after a pick, so only click the drop when the picker is not already
// expanded (a second drop click would toggle it closed).
async function assignRole(roleKey, col) {
    const cardSel = '#ps-slots .ps-slot[data-role-key="' + roleKey + '"]';
    // An EMPTY optional slot is a collapsed "+ row" (Torry, Aug 2026):
    // clicking it opens the picker AND expands the full card, after
    // which the normal path applies.
    const addSel = '#ps-slots .ps-role-add-row[data-role-key="' + roleKey + '"]';
    if (await page.evaluate(sel => !!document.querySelector(sel), addSel)) {
        await page.click(addSel);
        await page.waitForTimeout(150);
    }
    const open = await page.evaluate(sel =>
        !!document.querySelector(sel + ' .ps-role-picker'), cardSel);
    if (!open) {
        await page.click(cardSel + ' .ps-slot-drop');
        await page.waitForTimeout(120);
    }
    await page.click(cardSel + ' .ps-role-picker button[data-col="' + col + '"]');
    await page.waitForTimeout(250);
}
// Roles-first pass (Jul 27 2026): the variables list is collapsed by
// default. Real-gesture cases that click, hover, or drag a LIST chip must
// expand it first, exactly as a user would.
async function expandVars() {
    await page.evaluate(() => {
        const t = document.getElementById('ps-varbox-toggle');
        if (t && t.getAttribute('aria-expanded') !== 'true') t.click();
    });
    await page.waitForTimeout(150);
}
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(PAGE);
await page.waitForTimeout(400);

// ---------------------------------------------------------------- app frame
{
    console.log('case 0: desktop-style application frame');
    const welcome = await page.evaluate(() => ({
        shown: document.getElementById('ps-welcome').style.display,
        sample: !!document.getElementById('ps-welcome-sample'),
        continueShown: document.getElementById(
            'ps-welcome-continue').style.display
    }));
    ok(welcome.shown === 'flex' && welcome.sample &&
       welcome.continueShown === 'none',
       'first launch opens the start center with a project template');
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(150);
    const shell = await page.evaluate(() => ({
        appbar: !!document.querySelector('.ps-appbar'),
        toolbar: !!document.querySelector('.ps-commandbar'),
        projectPanel: !!document.querySelector('.ps-project-panel'),
        inspector: !!document.querySelector('.ps-controls'),
        statusbar: !!document.querySelector('.ps-statusbar'),
        workspace: window.PS_SHELL.workspace(),
        title: document.getElementById('ps-doc-name').textContent,
        chartItems: document.querySelectorAll(
            '#ps-project-nav [data-project-chart-id]').length,
        boardItems: document.querySelectorAll(
            '#ps-project-nav [data-project-board-id]').length
    }));
    ok(shell.appbar && shell.toolbar && shell.projectPanel &&
       shell.inspector && shell.statusbar,
       'persistent application chrome is present');
    // Aug 6 2026: the navigator is the full table of contents - the chart
    // AND the notebook's default section.
    ok(shell.workspace === 'chart' && shell.title === 'Dose response study' &&
       shell.chartItems === 1 && shell.boardItems === 1,
       'project identity and navigator reflect the active sample project');
    ok(await page.evaluate(() =>
        document.getElementById('ps-welcome').style.display === 'none' &&
        window.PS_SHELL.recentProjects().length === 1),
       'choosing a template enters the application and records a recent project');
    await page.click('[data-ps-menu="file"]');
    const menu = await page.evaluate(() => ({
        shown: document.getElementById('ps-appmenu').style.display,
        commands: Array.from(document.querySelectorAll(
            '#ps-appmenu [data-app-command]')).map(b =>
                b.getAttribute('data-app-command'))
    }));
    ok(menu.shown === 'block' &&
       JSON.stringify(menu.commands) ===
       '["new-project","open","welcome","rename-project","save","save-as","export",' +
       '"export-data"]',
       'File menu exposes the complete project lifecycle');
    await page.keyboard.press('Escape');
    await page.click('[data-ps-workspace="data"]');
    await page.waitForTimeout(100);
    const dataMode = await page.evaluate(() => ({
        workspace: window.PS_SHELL.workspace(),
        grid: document.getElementById('ps-datacard').style.display,
        parked: document.getElementById('ps-workcard').classList.contains(
            'ps-pane-parked'),
        active: document.querySelector(
            '[data-ps-workspace="data"]').getAttribute('aria-current')
    }));
    ok(dataMode.workspace === 'data' && dataMode.grid === 'block' &&
       dataMode.parked && dataMode.active === 'page',
       'Data workspace takes the center while safely parking the renderer');
    await page.click('th[data-grid-col="score"]');
    const variableInspector = await page.evaluate(() => ({
        pane: document.getElementById('ps-inspector-data').classList.contains(
            'ps-inspector-active'),
        name: document.getElementById('ps-variable-name').value,
        type: document.getElementById('ps-variable-type').value,
        // Named rather than counted. This assertion used to pin the count at 6,
        // which made it fail the moment t3-47 added the numeric summary: a
        // frozen number cannot tell a regression from a feature. Naming them
        // says which rows must be there and lets more arrive.
        labels: Array.from(document.querySelectorAll(
            '#ps-variable-stats .ps-inspector-stat span')).map(s => s.textContent)
    }));
    ok(variableInspector.pane && variableInspector.name === 'score' &&
       variableInspector.type === 'continuous' &&
       ['Rows', 'Valid', 'Missing', 'Distinct', 'Excluded', 'Used in']
           .every(l => variableInspector.labels.indexOf(l) !== -1),
       'column selection opens a populated variable inspector ' +
       `(${JSON.stringify(variableInspector.labels)})`);
    ok(['Mean', 'SD', 'Median', 'Min', 'Max']
           .every(l => variableInspector.labels.indexOf(l) !== -1),
       'and a continuous column also carries its numeric summary (t3-47)');
    await page.click('[data-ps-workspace="chart"]');
    await page.waitForTimeout(100);
    ok(await page.evaluate(() =>
        window.PS_SHELL.workspace() === 'chart' &&
       !document.getElementById('ps-workcard').classList.contains(
            'ps-pane-parked')),
       'Charts workspace restores the live renderer');
    await page.keyboard.press('Control+Shift+P');
    await page.waitForTimeout(80);
    const palette = await page.evaluate(() => ({
        shown: document.getElementById('ps-command-palette').style.display,
        count: document.querySelectorAll(
            '#ps-command-results [data-palette-command]').length,
        duplicate: !!document.querySelector(
            '#ps-command-results [data-palette-command="duplicate-document"]')
    }));
    ok(palette.shown === 'flex' && palette.count >= 10 && palette.duplicate,
       'command palette exposes searchable application commands');
    await page.keyboard.press('Escape');
    await page.evaluate(() =>
        sessionStorage.removeItem('psstandalone.welcome.dismissed'));
    await page.reload();
    await page.waitForTimeout(350);
    const recovery = await page.evaluate(() => ({
        welcome: document.getElementById('ps-welcome').style.display,
        continueButton: document.getElementById(
            'ps-welcome-continue').style.display,
        name: window.PS_SHELL.project.name
    }));
    ok(recovery.welcome === 'flex' && recovery.continueButton === 'flex' &&
       recovery.name === 'Dose response study',
       'a new session offers recovery of the autosaved project');
    await page.click('#ps-welcome-continue');
    await page.waitForTimeout(100);
    ok(await page.evaluate(() =>
        document.getElementById('ps-welcome').style.display === 'none'),
       'Continue resumes the recovered project');
}

// ---------------------------------------------------------------- parser units
{
    console.log('case 1: CSV parser units');
    const u = await page.evaluate(() => {
        const P = window.PS_SHELL.parseCSV;
        const bom = P('﻿a,b\n1,x\n2,y');
        const semi = P('a;b\n1;"x;1"\n2;"he said ""hi"""');
        const tabs = P('a\tb\n1\tx\r\n2\ty\r\n');
        const junk = P('just one line');
        return {
            bomHeader: bom && bom.header, bomRows: bom && bom.rows,
            semiRows: semi && semi.rows,
            tabRows: tabs && tabs.rows,
            junkNull: junk === null
        };
    });
    ok(JSON.stringify(u.bomHeader) === '["a","b"]', 'BOM stripped, header parsed');
    ok(JSON.stringify(u.bomRows) === '[["1","x"],["2","y"]]', 'comma rows');
    ok(JSON.stringify(u.semiRows) === '[["1","x;1"],["2","he said \\"hi\\""]]',
       'semicolon + quoted fields + escaped quotes');
    ok(JSON.stringify(u.tabRows) === '[["1","x"],["2","y"]]', 'tab + CRLF rows');
    ok(u.junkNull, 'headerless text rejected');
}

// ---------------------------------------------------------------- paste import
{
    console.log('case 2: paste import via the real overlay');
    await page.click('#ps-load');
    await page.fill('#ps-paste',
        'treat,value,tag\nA,1.5,red\nA,2.5,blue\nB,3.5,red\nB,NA,blue\nC,5,red\nC,6,blue');
    await page.click('#ps-paste-use');
    await page.waitForTimeout(120);
    ok(await page.evaluate(() =>
        document.getElementById('ps-import-preview').style.display === 'block' &&
        document.querySelectorAll('#ps-import-preview th').length === 3),
       'paste opens a typed import preview');
    await page.click('#ps-import-use');
    await page.waitForTimeout(250);
    const t = await page.evaluate(() => {
        const tab = window.PS_SHELL.project.table;
        return { name: tab.name, order: tab.order, types: tab.types,
                 levels: tab.levels, loaderShown: document.getElementById('ps-loader').style.display };
    });
    ok(t.name === 'pasted-data', 'table adopted');
    ok(JSON.stringify(t.order) === '["treat","value","tag"]', 'column order');
    ok(t.types.treat === 'nominal' && t.types.value === 'continuous' && t.types.tag === 'nominal',
       'jamovi-type inference (NA stays continuous)');
    ok(JSON.stringify(t.levels.treat) === '["A","B","C"]', 'first-seen levels');
    ok(t.loaderShown === 'none', 'overlay closed after adopt');
}

// ---------------------------------------------------------------- roles + render
{
    console.log('case 3: roles via the real selects');
    // CG roles reset by the new table; assign via the slot picker.
    // Empty optional roles render as collapsed "+ rows" (Torry, Aug
    // 2026): count role ENTRIES, whichever form each takes.
    const slots = await page.evaluate(() =>
        document.querySelectorAll('#ps-slots [data-role-key]').length);
    ok(slots === 4, 'four role entries for CG (cards + collapsed rows)');
    await assignRole('xvar', 'treat');
    await assignRole('yvar', 'value');
    const drew = await page.evaluate(() => {
        const bars = Array.from(document.querySelectorAll('[data-bar-cat]'))
            .filter(el => el.tagName.toLowerCase() === 'path' && el.getAttribute('fill'));
        const p = window.PS_SHELL.buildPayload();
        return { bars: bars.length, cells: p ? p.bars.length : 0,
                 missing: p ? p.missingNote : null };
    });
    ok(drew.bars === 3, 'chart drew 3 bars from the pasted table');
    ok(drew.cells === 3, 'payload has 3 cells');
    ok(drew.missing === '1 of 6 cases not shown (missing values)', 'NA disclosed');
}

// ---------------------------------------------------------------- type menu
{
    console.log('case 4: variable type menu');
    // Set "value" to Nominal via the chip menu: the CG yvar (numeric)
    // role must drop and the shell must show its assign-a-role message.
    async function chipBox(col) {
        return await page.evaluate((col) => {
            const chips = Array.from(document.querySelectorAll('#ps-columns .ps-chip'));
            const c = chips.find(x => x.getAttribute('data-col') === col);
            c.scrollIntoView({ block: 'center' });
            const r = c.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }, col);
    }
    // The chip path is probed on an UNASSIGNED variable: since the
    // de-busy pass an assigned variable's chip lives in its role zone,
    // and its type changes from the data grid header (openTypeMenu below
    // drives that same code path).
    await expandVars();
    let chip = await chipBox('tag');
    await page.mouse.click(chip.x, chip.y);
    await page.waitForTimeout(150);
    const menu = await page.evaluate(() => ({
        shown: document.getElementById('ps-typemenu').style.display === 'block',
        items: Array.from(document.querySelectorAll('#ps-typemenu button[data-type]'))
            .map(b => b.getAttribute('data-type'))
    }));
    ok(menu.shown, 'type menu opens from the chip');
    ok(JSON.stringify(menu.items) === '["id","nominal","ordinal","continuous"]',
       'menu lists the four jamovi types');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    await page.evaluate(() => window.PS_SHELL.openTypeMenu(240, 240, 'value'));
    await page.waitForTimeout(150);
    ok(await page.evaluate(() =>
           (document.querySelector('#ps-typemenu .ps-tm-cur') || {})
               .getAttribute?.('data-type')) === 'continuous',
       'current type highlighted for the assigned variable');
    await page.click('#ps-typemenu button[data-type="nominal"]');
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => ({
        type: window.PS_SHELL.project.table.types.value,
        yRole: window.PS_SHELL.rolesStore().yvar || null,
        hostText: document.getElementById('psroot').textContent
    }));
    ok(after.type === 'nominal', 'column set to nominal');
    ok(after.yRole === null, 'numeric role dropped on the type change');
    ok(after.hostText.indexOf('Assign') !== -1, 'assign-a-role message shown');
    // Back to continuous and reassign.
    chip = await chipBox('value');
    await page.mouse.click(chip.x, chip.y);
    await page.waitForTimeout(150);
    await page.click('#ps-typemenu button[data-type="continuous"]');
    await page.waitForTimeout(150);
    await assignRole('yvar', 'value');
}

// ---------------------------------------------------------------- module switch
{
    console.log('case 5: module switch + per-module options');
    // Give CG a styling edit, then switch to Frequencies: freq must start
    // clean (per-module option isolation) and draw counts.
    await page.evaluate(() => {
        window.setOption('chartSpec', JSON.stringify({ chartTitle: 'CG title' }));
    });
    await page.waitForTimeout(300);
    await page.selectOption('#ps-module', 'freqplotbuilder');
    await page.waitForTimeout(150);
    await assignRole('var', 'treat');
    const freq = await page.evaluate(() => {
        const p = window.PS_SHELL.buildPayload();
        return { cells: p ? p.bars.map(b => [b.x, b.n]) : null,
                 opts: Object.keys(window.PS_SHELL.optionStore()),
                 tests: p ? p.freqTests.length : 0 };
    });
    ok(JSON.stringify(freq.cells) === '[["A",2],["B",2],["C",2]]', 'freq counts');
    // The point is ISOLATION: a Compare Groups style edit must not appear in
    // the Frequencies store. plotWidth/plotHeight are not style - they are the
    // plot size, written per module by punch list 27's fit-to-pane - so they
    // are named rather than making the assertion vaguer.
    const freqLeak = freq.opts.filter(k =>
        ['plotWidth', 'plotHeight'].indexOf(k) === -1);
    ok(freqLeak.length === 0,
       'freq options clean, CG edit isolated (got ' + freq.opts.join(',') + ')');
    ok(freq.tests === 1, 'GOF chi-square shipped');
    await page.selectOption('#ps-module', 'plotbuilder');
    await page.waitForTimeout(300);
    const back = await page.evaluate(() => ({
        spec: window.PS_SHELL.optionStore().chartSpec || null,
        title: (function () {
            const svgs = Array.from(document.querySelectorAll('svg'))
                .sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight));
            const texts = Array.from(svgs[0].querySelectorAll('text')).map(t => t.textContent);
            return texts.some(s => (s || '').indexOf('CG title') !== -1);
        })()
    }));
    ok(!!back.spec && back.spec.indexOf('CG title') !== -1, 'CG options survived the round trip');
    ok(back.title, 'CG chart title renders after switching back');
}

// ---------------------------------------------------------------- persistence
{
    console.log('case 6: reload persistence of imported table');
    await page.reload();
    await page.waitForTimeout(400);
    const re = await page.evaluate(() => {
        const tab = window.PS_SHELL.project.table;
        const p = window.PS_SHELL.buildPayload();
        return { name: tab.name, module: window.PS_SHELL.chart().module,
                 cells: p && p.bars ? p.bars.length : 0,
                 title: p ? (JSON.parse(window.PS_SHELL.optionStore().chartSpec || '{}').chartTitle || null) : null };
    });
    ok(re.name === 'pasted-data', 'imported table restored');
    ok(re.module === 'plotbuilder', 'module restored');
    ok(re.cells === 3, 'chart rebuilt from restored table');
    ok(re.title === 'CG title', 'per-module options restored');
}

// ---------------------------------------------------------------- data grid
{
    console.log('case 7: data grid view');
    // Still on the restored pasted-data table from case 6.
    await page.click('[data-ps-workspace="data"]');
    await page.waitForTimeout(150);
    const g = await page.evaluate(() => {
        const card = document.getElementById('ps-datacard');
        const ths = Array.from(card.querySelectorAll('th[data-grid-col]'))
            .map(th => ({ col: th.getAttribute('data-grid-col'),
                          type: (th.getAttribute('data-tip') || '').split(' ')[0],
                          icon: !!th.querySelector('.ps-grid-badge .ps-ticon'),
                          role: (th.querySelector('.ps-grid-role') || {}).textContent || null }));
        const rows = card.querySelectorAll('tbody tr').length;
        const missCells = card.querySelectorAll('td.ps-grid-miss').length;
        return { visible: card.style.display !== 'none', ths, rows, missCells };
    });
    ok(g.visible, 'Data workspace opens the grid');
    ok(g.rows === 6, 'all 6 rows rendered');
    ok(g.missCells === 1, 'missing cell marked');
    const byCol = {};
    for (const th of g.ths) byCol[th.col] = th;
    ok(byCol.treat && byCol.treat.type === 'Nominal' && byCol.treat.icon &&
       byCol.treat.role === 'X AXIS', 'treat header: nominal icon + X role tag');
    ok(byCol.value && byCol.value.type === 'Continuous' && byCol.value.icon &&
       byCol.value.role === 'Y AXIS', 'value header: continuous icon + Y role tag');
    ok(byCol.tag && byCol.tag.role === null, 'unassigned column has no role tag');
    // Role tags follow a role change live.
    await page.click('[data-ps-workspace="chart"]');
    await page.waitForTimeout(100);
    await assignRole('groupVar', 'tag');
    await page.click('[data-ps-workspace="data"]');
    await page.waitForTimeout(100);
    const tagRole = await page.evaluate(() => {
        const th = document.querySelector('th[data-grid-col="tag"] .ps-grid-role');
        return th ? th.textContent : null;
    });
    ok(!!tagRole && tagRole.indexOf('GROUP') !== -1,
       'role tag follows Group By assignment');
    // Open state survives reload.
    await page.reload();
    await page.waitForTimeout(400);
    const re = await page.evaluate(() => ({
        visible: document.getElementById('ps-datacard').style.display !== 'none',
        rows: document.querySelectorAll('#ps-datacard tbody tr').length
    }));
    ok(re.visible && re.rows === 6, 'grid open state + content survive reload');
    // Spreadsheet-style range selection: dragging from treat[0] through
    // value[2] selects the 3 x 2 rectangle without opening an editor.
    async function gridCellBox(col, row) {
        return await page.evaluate(({ col, row }) => {
            const cells = Array.from(document.querySelectorAll(
                '#ps-datagrid td[data-gc]'));
            const td = cells.find(cell =>
                cell.getAttribute('data-gc') === col &&
                Number(cell.getAttribute('data-gr')) === row);
            const r = td.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }, { col, row });
    }
    const rangeStart = await gridCellBox('treat', 0);
    const rangeEnd = await gridCellBox('value', 2);
    await page.mouse.move(rangeStart.x, rangeStart.y);
    await page.mouse.down();
    await page.mouse.move(rangeEnd.x, rangeEnd.y, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(120);
    const range = await page.evaluate(() => ({
        selected: document.querySelectorAll(
            '#ps-datagrid td.ps-grid-selected').length,
        ariaSelected: document.querySelectorAll(
            '#ps-datagrid td[aria-selected="true"]').length,
        status: document.getElementById('ps-grid-selection-status').textContent,
        editing: !!document.querySelector('.ps-grid-cellinput'),
        nativeSelection: window.getSelection().toString(),
        copied: (() => {
            const transfer = new DataTransfer();
            document.getElementById('ps-datagrid').dispatchEvent(
                new ClipboardEvent('copy', {
                    bubbles: true, cancelable: true, clipboardData: transfer
                }));
            return transfer.getData('text/plain');
        })()
    }));
    ok(range.selected === 6 && range.ariaSelected === 6 && !range.editing,
       'dragging selects a rectangular cell range without editing');
    ok(range.nativeSelection === '',
       'range dragging does not create a competing browser text selection');
    ok(range.status.includes('3 rows') && range.status.includes('6 cells'),
       'range size is announced in the grid footer');
    if (browserName === 'chromium') {
        ok(range.copied === 'A\t1.5\nA\t2.5\nB\t3.5',
           'copy emits the selected range as spreadsheet-compatible TSV');
    } else {
        console.log('  --  synthetic ClipboardEvent payload is Chromium-only; ' +
                    'clipboard behavior is covered by the Chromium feature probe');
    }
    const pastedFill = await page.evaluate(() => {
        const transfer = new DataTransfer();
        transfer.setData('text/plain', '9');
        document.getElementById('ps-datagrid').dispatchEvent(
            new ClipboardEvent('paste', {
                bubbles: true, cancelable: true, clipboardData: transfer
            }));
        const t = window.PS_SHELL.project.table;
        return t.raw.treat.slice(0, 3).concat(t.raw.value.slice(0, 3));
    });
    if (browserName === 'chromium') {
        ok(pastedFill.every(v => v === '9'),
           'pasting one value fills the complete selected range');
    }
    await page.evaluate(() => window.PS_SHELL.dataUndo());
    await page.waitForTimeout(120);
    await page.mouse.click(rangeStart.x, rangeStart.y, { button: 'right' });
    await page.waitForTimeout(100);
    const rangeMenu = await page.evaluate(() => ({
        label: document.getElementById('ps-cellmenu-toggle').textContent,
        selected: document.querySelectorAll(
            '#ps-datagrid td.ps-grid-selected').length
    }));
    ok(rangeMenu.label === 'Exclude 6 values' && rangeMenu.selected === 6,
       'right-click preserves the range and offers a batch action');
    await page.keyboard.press('Escape');
    await page.click('th[data-grid-col="tag"]');
    const columnSelection = await page.evaluate(() => ({
        selected: document.querySelectorAll(
            '#ps-datagrid td.ps-grid-selected').length,
        header: document.querySelector(
            'th[data-grid-col="tag"]').classList.contains('ps-grid-axis-selected')
    }));
    ok(columnSelection.selected === 6 && columnSelection.header,
       'clicking a column header selects the complete variable');
    // Close it again.
    await page.click('[data-ps-workspace="chart"]');
    await page.waitForTimeout(100);
    const closed = await page.evaluate(() =>
        document.getElementById('ps-datacard').style.display === 'none');
    ok(closed, 'grid closes');
}

// ---------------------------------------------------------------- cell editing
{
    console.log('case 8: cell editing + add row');
    await page.click('[data-ps-workspace="data"]');
    await page.waitForTimeout(150);
    async function cellBox(col, row) {
        return await page.evaluate(({ col, row }) => {
            const tds = document.querySelectorAll('#ps-datagrid td[data-gr="' + row + '"]');
            for (const td of tds) {
                if (td.getAttribute('data-gc') !== col) continue;
                td.scrollIntoView({ block: 'center' });
                const r = td.getBoundingClientRect();
                return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            }
            return null;
        }, { col, row });
    }
    // Numeric commit: click value[0] (1.5), replace with 9, Enter.
    // The M4 editor deliberately opens WITHOUT selecting its text (the
    // column-sizing probe pins that), so replacing = select-all first.
    let b = await cellBox('value', 0);
    await page.mouse.click(b.x, b.y, { clickCount: 2 });  // click selects; dblclick edits
    await page.waitForTimeout(100);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('9');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const e1 = await page.evaluate(() => ({
        raw: window.PS_SHELL.project.table.raw.value[0],
        typed: window.PS_SHELL.project.table.columns.value[0],
        editedTag: document.getElementById('ps-datainfo').textContent.indexOf('(edited)') !== -1,
        cellA: window.PS_SHELL.buildPayload().bars[0],
        editorRow: (() => {
            const inp = document.querySelector('.ps-grid-cellinput');
            return inp ? inp.closest('td').getAttribute('data-gr') : null;
        })()
    }));
    ok(e1.raw === '9' && e1.typed === 9, 'numeric commit writes raw + typed');
    ok(e1.cellA.x === 'A' && e1.cellA.group === 'red' &&
       e1.cellA.mean === 9 && e1.cellA.n === 1,
       'chart cell recomputed live (A x red: mean ' + e1.cellA.mean + ')');
    ok(e1.editedTag, '(edited) marker shown');
    ok(e1.editorRow === '1', 'Enter moved the editor down');
    // Esc cancels the row-1 editor.
    await page.keyboard.type('777');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    const e2 = await page.evaluate(() => ({
        v: window.PS_SHELL.project.table.columns.value[1],
        editing: !!document.querySelector('.ps-grid-cellinput')
    }));
    ok(e2.v === 2.5 && !e2.editing, 'Esc cancels without committing');
    // Garbage in a numeric column -> missing (type stays declared).
    b = await cellBox('value', 2);
    await page.mouse.click(b.x, b.y, { clickCount: 2 });  // click selects; dblclick edits
    await page.waitForTimeout(100);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('abc');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const e3 = await page.evaluate(() => ({
        typed: window.PS_SHELL.project.table.columns.value[2],
        kind: window.PS_SHELL.project.table.types.value,
        missing: window.PS_SHELL.buildPayload().missingNote
    }));
    ok(e3.typed === null && e3.kind === 'continuous', 'garbage numeric input becomes missing');
    ok(e3.missing === '2 of 6 cases not shown (missing values)', 'missing note follows');
    b = await cellBox('value', 2);
    await page.mouse.click(b.x, b.y, { clickCount: 2 });  // click selects; dblclick edits
    await page.waitForTimeout(100);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('3.5');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    // Factor edit introduces a new level; tag is the active Group By.
    b = await cellBox('tag', 0);
    await page.mouse.click(b.x, b.y, { clickCount: 2 });  // click selects; dblclick edits
    await page.waitForTimeout(100);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('green');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const e4 = await page.evaluate(() => ({
        levels: window.PS_SHELL.project.table.levels.tag,
        groups: window.PS_SHELL.buildPayload().groupCategories
    }));
    ok(e4.levels.indexOf('green') !== -1, 'factor edit adds a level');
    ok(e4.groups.indexOf('green') !== -1, 'new level reaches the chart groups');
    // Add row moved into the row context menu (M4p): insert below the
    // last row, then commit its first cell by hand.
    await page.click('td.ps-grid-rownum[data-grid-row="5"]', { button: 'right' });
    await page.waitForTimeout(200);
    await page.click('#ps-rowmenu >> text=Insert row below');
    await page.waitForTimeout(300);
    b = await cellBox('treat', 6);
    await page.mouse.click(b.x, b.y, { clickCount: 2 });  // click selects; dblclick edits
    await page.waitForTimeout(150);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('A');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const e5 = await page.evaluate(() => ({
        n: window.PS_SHELL.project.table.raw.treat.length,
        treat: window.PS_SHELL.project.table.raw.treat[6],
        missing: window.PS_SHELL.buildPayload().missingNote,
        rows: document.querySelectorAll('#ps-datacard tbody tr').length
    }));
    ok(e5.n === 7 && e5.treat === 'A', 'Add row + first-cell commit');
    ok(e5.rows === 7, 'grid shows the new row');
    ok(e5.missing === '2 of 7 cases not shown (missing values)', 'new row missing values disclosed');
    // Edits survive reload.
    await page.reload();
    await page.waitForTimeout(400);
    const e6 = await page.evaluate(() => ({
        v0: window.PS_SHELL.project.table.columns.value[0],
        n: window.PS_SHELL.project.table.raw.treat.length,
        editedTag: document.getElementById('ps-datainfo').textContent.indexOf('(edited)') !== -1
    }));
    ok(e6.v0 === 9 && e6.n === 7 && e6.editedTag, 'edited data survives reload');
}

// ---------------------------------------------------------------- exclusion
{
    console.log('case 9: exclude / include values');
    // State from case 8: 7 rows, value[0]=9, tag[0]=green (the only green),
    // CG roles treat/value + Group By tag, grid open.
    async function cellBox2(col, row) {
        return await page.evaluate(({ col, row }) => {
            const tds = document.querySelectorAll('#ps-datagrid td[data-gr="' + row + '"]');
            for (const td of tds) {
                if (td.getAttribute('data-gc') !== col) continue;
                td.scrollIntoView({ block: 'center' });
                const r = td.getBoundingClientRect();
                return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            }
            return null;
        }, { col, row });
    }
    // Right-click value[0] -> menu offers Exclude value.
    let b = await cellBox2('value', 0);
    await page.mouse.click(b.x, b.y, { button: 'right' });
    await page.waitForTimeout(150);
    const menu1 = await page.evaluate(() => ({
        shown: document.getElementById('ps-cellmenu').style.display === 'block',
        label: document.getElementById('ps-cellmenu-toggle').textContent
    }));
    ok(menu1.shown && menu1.label === 'Exclude value', 'context menu offers Exclude value');
    await page.click('#ps-cellmenu-toggle');
    await page.waitForTimeout(300);
    const ex1 = await page.evaluate(() => {
        const td = (() => {
            const tds = document.querySelectorAll('#ps-datagrid td[data-gr="0"]');
            for (const t of tds) if (t.getAttribute('data-gc') === 'value') return t;
        })();
        const p = window.PS_SHELL.buildPayload();
        return {
            struck: td.className.indexOf('ps-grid-excl') !== -1,
            text: td.textContent,
            typed: window.PS_SHELL.project.table.columns.value[0],
            raw: window.PS_SHELL.project.table.raw.value[0],
            missing: p.missingNote,
            exclCount: (document.getElementById('ps-data-exclusions-count') || {}).textContent || '',
            restoreBtn: !!document.getElementById('ps-data-restore'),
            info: document.getElementById('ps-datainfo').textContent
        };
    });
    ok(ex1.struck && ex1.text === '9', 'cell struck through, value still visible');
    ok(ex1.typed === null && ex1.raw === '9', 'excluded reads as missing, raw untouched');
    // M4l semantics: excluded values are disclosed as "N value excluded"
    // (command bar + datainfo), NOT folded into the missing-values note,
    // which keeps counting only genuinely missing cases.
    ok(ex1.missing === '2 of 7 cases not shown (missing values)',
       'missing note keeps counting real missing only');
    ok(ex1.exclCount.indexOf('1 value excluded') !== -1 && ex1.restoreBtn,
       'command bar shows exclusion count + Restore');
    ok(ex1.info.indexOf('1 value excluded') !== -1, 'datainfo discloses exclusion');
    // Right-click again -> Include value -> restored; then re-exclude.
    b = await cellBox2('value', 0);
    await page.mouse.click(b.x, b.y, { button: 'right' });
    await page.waitForTimeout(150);
    const menu2 = await page.evaluate(() =>
        document.getElementById('ps-cellmenu-toggle').textContent);
    ok(menu2 === 'Include value', 'menu flips to Include value');
    await page.click('#ps-cellmenu-toggle');
    await page.waitForTimeout(300);
    const ex2 = await page.evaluate(() => ({
        typed: window.PS_SHELL.project.table.columns.value[0],
        missing: window.PS_SHELL.buildPayload().missingNote
    }));
    ok(ex2.typed === 9 && ex2.missing === '2 of 7 cases not shown (missing values)',
       'include restores the value and the counts');
    // Excluding the ONLY green tag removes the level from the chart groups.
    b = await cellBox2('tag', 0);
    await page.mouse.click(b.x, b.y, { button: 'right' });
    await page.waitForTimeout(150);
    await page.click('#ps-cellmenu-toggle');
    await page.waitForTimeout(300);
    const ex3 = await page.evaluate(() => ({
        groups: window.PS_SHELL.buildPayload().groupCategories,
        levels: window.PS_SHELL.project.table.levels.tag
    }));
    ok(ex3.groups.indexOf('green') === -1 && ex3.levels.indexOf('green') === -1,
       'excluding the only green drops the level from the chart');
    // Exclusions survive reload.
    await page.reload();
    await page.waitForTimeout(400);
    const ex4 = await page.evaluate(() => ({
        struckCells: document.querySelectorAll('#ps-datagrid td.ps-grid-excl').length,
        typedTag: window.PS_SHELL.project.table.columns.tag[0],
        info: document.getElementById('ps-datainfo').textContent
    }));
    ok(ex4.struckCells === 1 && ex4.typedTag === null &&
       ex4.info.indexOf('1 value excluded') !== -1, 'exclusion survives reload');
    // Restore all (inside the exclusion dropdown, Jul 31 2026).
    await page.click('#ps-data-excl-btn');
    await page.waitForTimeout(200);
    await page.click('#ps-data-restore');
    await page.waitForTimeout(300);
    const ex5 = await page.evaluate(() => ({
        struckCells: document.querySelectorAll('#ps-datagrid td.ps-grid-excl').length,
        typedTag: window.PS_SHELL.project.table.columns.tag[0],
        groups: window.PS_SHELL.buildPayload().groupCategories
    }));
    ok(ex5.struckCells === 0 && ex5.typedTag === 'green' &&
       ex5.groups.indexOf('green') !== -1, 'Restore all brings everything back');
}

// ---------------------------------------------------------------- measure types
{
    console.log('case 10: ordinal / ID semantics + drag-to-role');
    // State: pasted-data, CG roles treat X / value Y / tag GROUP.
    // The variable chips live in the CHARTS inspector now: switch
    // workspaces first (case 9 ends in Data).
    await page.click('[data-ps-workspace="chart"]');
    await page.waitForTimeout(200);
    // Ordinal keeps a numeric column usable as Y AND as ordered categories.
    async function chipBox(col) {
        return await page.evaluate((col) => {
            const chips = Array.from(document.querySelectorAll('#ps-columns .ps-chip'));
            const c = chips.find(x => x.getAttribute('data-col') === col);
            c.scrollIntoView({ block: 'center' });
            const r = c.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }, col);
    }
    // value is ASSIGNED (Y), so since the de-busy pass its chip lives in
    // the role zone: the type change goes through the grid-header path.
    await page.evaluate(() => window.PS_SHELL.openTypeMenu(240, 240, 'value'));
    await page.waitForTimeout(150);
    await page.click('#ps-typemenu button[data-type="ordinal"]');
    await page.waitForTimeout(300);
    const o1 = await page.evaluate(() => ({
        yRole: window.PS_SHELL.rolesStore().yvar || null,
        levels: window.PS_SHELL.project.table.levels.value,
        typedFirst: window.PS_SHELL.project.table.columns.value[0]
    }));
    ok(o1.yRole === 'value', 'numeric ordinal keeps the Y role');
    ok(o1.typedFirst === 9, 'numeric ordinal stores numbers');
    ok(o1.levels[0] === '2.5' && Number(o1.levels[o1.levels.length - 1]) >= 9,
       'ordinal levels ascend numerically (' + o1.levels.join(',') + ')');
    // One variable in TWO roles stays reachable through the picker (the
    // list drag-copy retired with the chip; the picker offers every
    // eligible variable, assigned elsewhere or not).
    await page.click('#ps-slots .ps-slot[data-role-key="xvar"] .ps-slot-drop');
    await page.waitForTimeout(200);
    await page.click('#ps-slots .ps-role-picker button[data-col="value"]');
    await page.waitForTimeout(300);
    const o2 = await page.evaluate(() => {
        const p = window.PS_SHELL.buildPayload();
        return { x: window.PS_SHELL.rolesStore().xvar,
                 y: window.PS_SHELL.rolesStore().yvar,
                 cats: p ? p.xCategories : null };
    });
    ok(o2.x === 'value' && o2.y === 'value',
       'the picker assigns the X role while the Y role is kept (dual role)');
    ok(o2.cats && o2.cats[0] === '2.5' &&
       Number(o2.cats[o2.cats.length - 1]) >= 9,
       'chart categories follow the ordinal order');
    // ID columns leave every role offer.
    await expandVars();
    const chip = await chipBox('treat');
    await page.mouse.click(chip.x, chip.y);
    await page.waitForTimeout(150);
    await page.click('#ps-typemenu button[data-type="id"]');
    await page.waitForTimeout(300);
    await page.click('#ps-slots .ps-slot[data-role-key="xvar"] .ps-slot-drop');
    await page.waitForTimeout(120);
    const o3 = await page.evaluate(() => ({
        offered: !!document.querySelector('#ps-slots .ps-role-picker button[data-col="treat"]')
    }));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    ok(!o3.offered, 'ID column is not offered to any role');
    // The grid header selects its full column; its type badge keeps the
    // quick type-menu path (Data workspace).
    await page.click('[data-ps-workspace="data"]');
    await page.waitForTimeout(200);
    const th = await page.evaluate(() => {
        const t = document.querySelector('#ps-datagrid th[data-grid-col="tag"]');
        t.scrollIntoView({ block: 'center' });
        const r = t.getBoundingClientRect();
        const b = t.querySelector('.ps-grid-badge').getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    });
    await page.mouse.click(th.x, th.y);
    await page.waitForTimeout(150);
    const o4 = await page.evaluate(() => ({
        shown: document.getElementById('ps-typemenu').style.display === 'block',
        head: (document.querySelector('#ps-typemenu .ps-tm-head') || {}).textContent
    }));
    ok(o4.shown && o4.head === 'tag', 'grid header type badge opens the type menu');
    ok(await page.evaluate(() =>
        document.querySelectorAll('#ps-datagrid th .ps-ticon').length >= 3),
       'grid headers show type icons');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    // Legacy migration: old numeric/factor names load as the new types.
    const o5 = await page.evaluate(() => {
        window.PS_SHELL.loadTable('legacy', ['a', 'b'],
            [['x', '1'], ['y', '2']], { a: 'factor', b: 'numeric' });
        const t = window.PS_SHELL.project.table;
        return { a: t.types.a, b: t.types.b };
    });
    ok(o5.a === 'nominal' && o5.b === 'continuous', 'legacy type names migrate');
}

// ---------------------------------------------------------------- supplier
{
    console.log('case 11: supplier box interactions');
    // State from case 10's migration step: table 'legacy' with a (nominal)
    // and b (continuous), no roles assigned, module plotbuilder. The
    // supplier slots live in the Charts inspector.
    await page.click('[data-ps-workspace="chart"]');
    await page.waitForTimeout(200);
    await assignRole('xvar', 'a');
    const s0 = await page.evaluate(() => window.PS_SHELL.rolesStore().xvar);
    ok(s0 === 'a', 'slot picker assigns');
    // Slot clear button.
    await page.click('#ps-slots .ps-slot[data-role-key="xvar"] .ps-slot-x');
    await page.waitForTimeout(250);
    const s1 = await page.evaluate(() => ({
        x: window.PS_SHELL.rolesStore().xvar || null,
        empty: !!document.querySelector('#ps-slots .ps-slot[data-role-key="xvar"] .ps-slot-empty')
    }));
    ok(s1.x === null && s1.empty, 'slot clear button unassigns');
    // Drag a slot chip back to the variables box to unassign.
    await assignRole('xvar', 'a');
    // Roles-first pass: the target is the whole variables BOX, and it
    // accepts while COLLAPSED - the header itself is the drop target.
    await page.dragAndDrop('#ps-slots .ps-slot[data-role-key="xvar"] .ps-slot-chip',
                           '#ps-varbox');
    await page.waitForTimeout(250);
    const s2 = await page.evaluate(() => window.PS_SHELL.rolesStore().xvar || null);
    ok(s2 === null, 'dragging a slot chip onto the collapsed box unassigns');
    // Drag between slots MOVES the assignment. Pre-scroll the target
    // card into view: playwright otherwise scrolls it mid-gesture and
    // the cards shift under the pressed pointer (the drag then starts
    // on a NEIGHBORING chip - a probe artifact, not an app bug).
    await assignRole('xvar', 'a');
    // An EMPTY optional slot is a collapsed "+ row" now (Torry, Aug
    // 2026) - still a real drop target, addressed by role key alone so
    // the selector matches either form.
    await page.evaluate(() => document.querySelector(
        '#ps-slots [data-role-key="groupVar"]')
        .scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(150);
    await page.dragAndDrop('#ps-slots .ps-slot[data-role-key="xvar"] .ps-slot-chip',
                           '#ps-slots [data-role-key="groupVar"]');
    await page.waitForTimeout(250);
    const s3 = await page.evaluate(() => ({
        x: window.PS_SHELL.rolesStore().xvar || null,
        g: window.PS_SHELL.rolesStore().groupVar || null
    }));
    ok(s3.x === null && s3.g === 'a', 'dragging between slots moves the assignment');
    // De-busy pass (Torry, Jul 27 2026): an assigned variable LEAVES the
    // box and lives in its role zone, so the mapping is stated once.
    const s4 = await page.evaluate(() => ({
        inList: !!document.querySelector('#ps-columns .ps-chip[data-col="a"]'),
        inZone: !!document.querySelector('#ps-slots ' +
            '.ps-slot[data-role-key="groupVar"] .ps-slot-chip[data-col="a"]')
    }));
    ok(!s4.inList && s4.inZone,
       'the assigned variable moves out of the box into its role zone');
    // Filter narrows the list (input auto-hidden under 9 columns; force it).
    const s5 = await page.evaluate(() => {
        const f = document.getElementById('ps-varfilter');
        f.style.display = '';
        f.value = 'b';
        f.dispatchEvent(new Event('input'));
        return Array.from(document.querySelectorAll('#ps-columns .ps-chip'))
            .map(c => c.getAttribute('data-col'));
    });
    ok(JSON.stringify(s5) === '["b"]', 'filter narrows the variable list');
    await page.evaluate(() => {
        const f = document.getElementById('ps-varfilter');
        f.value = '';
        f.dispatchEvent(new Event('input'));
    });
}

// ---------------------------------------------------------------- data undo
{
    console.log('case 12: data undo/redo keys');
    // Fresh known table.
    await page.evaluate(() => {
        window.PS_SHELL.loadTable('undo-t', ['g', 'v'],
            [['A', '1'], ['A', '2'], ['B', '3'], ['B', '4']], null);
        window.PS_SHELL.setRoles('plotbuilder', { xvar: 'g', yvar: 'v' });
    });
    await page.waitForTimeout(300);
    if (!(await page.evaluate(() => window.PS_SHELL.project.ui.dataOpen)))
        {
            await page.click('[data-ps-workspace="data"]');
            await page.waitForTimeout(150);
        }
    // Edit v[0] 1 -> 9, then Ctrl+Z / Ctrl+Y.
    const b = await page.evaluate(() => {
        const tds = document.querySelectorAll('#ps-datagrid td[data-gr="0"]');
        for (const td of tds) if (td.getAttribute('data-gc') === 'v') {
            td.scrollIntoView({ block: 'center' });
            const r = td.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
    });
    await page.mouse.click(b.x, b.y, { clickCount: 2 });  // click selects; dblclick edits
    await page.waitForTimeout(100);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('9');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const u0 = await page.evaluate(() => window.PS_SHELL.project.table.columns.v[0]);
    ok(u0 === 9, 'edit applied');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);
    const u1 = await page.evaluate(() => ({
        v: window.PS_SHELL.project.table.columns.v[0],
        mean: window.PS_SHELL.buildPayload().bars[0].mean
    }));
    ok(u1.v === 1 && u1.mean === 1.5, 'Ctrl+Z reverts the edit and the chart');
    await page.keyboard.press('Control+y');
    await page.waitForTimeout(300);
    const u2 = await page.evaluate(() => window.PS_SHELL.project.table.columns.v[0]);
    ok(u2 === 9, 'Ctrl+Y reapplies');
    // Exclusion + type change undo in sequence.
    await page.evaluate(() => {
        const tds = document.querySelectorAll('#ps-datagrid td[data-gr="2"]');
        for (const td of tds) if (td.getAttribute('data-gc') === 'v')
            // cancelable: a real right-click IS, and without it the grid's
            // preventDefault() is a no-op, which is not what the app sees.
            td.dispatchEvent(new MouseEvent('contextmenu',
                { bubbles: true, cancelable: true,
                  clientX: 400, clientY: 300 }));
    });
    await page.waitForTimeout(150);
    await page.click('#ps-cellmenu-toggle');
    await page.waitForTimeout(250);
    const u3 = await page.evaluate(() => window.PS_SHELL.project.table.columns.v[2]);
    ok(u3 === null, 'exclusion applied');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(250);
    const u4 = await page.evaluate(() => ({
        v: window.PS_SHELL.project.table.columns.v[2],
        redo: true
    }));
    ok(u4.v === 3, 'Ctrl+Z reverts the exclusion');
    // Shift+Z redo variant.
    await page.keyboard.press('Control+Shift+z');
    await page.waitForTimeout(250);
    const u5 = await page.evaluate(() => window.PS_SHELL.project.table.columns.v[2]);
    ok(u5 === null, 'Ctrl+Shift+Z redoes');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);
    // Meta (Command) modifier works too.
    await page.keyboard.press('Meta+z');
    await page.waitForTimeout(250);
    const u6 = await page.evaluate(() => window.PS_SHELL.project.table.columns.v[0]);
    ok(u6 === 1, 'Command+Z works (undoes the earlier redo)');
    // Routing: after a CHART edit, the key passes through to the engine
    // (the data stack must not pop).
    await page.evaluate(() => {
        window.setOption('chartSpec', JSON.stringify({ chartTitle: 'route check' }));
    });
    await page.waitForTimeout(200);
    const r0 = await page.evaluate(() => window.PS_SHELL.dataHistory());
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(250);
    const r1 = await page.evaluate(() => window.PS_SHELL.dataHistory());
    ok(r0.undo === r1.undo, 'chart-edit recency routes Ctrl+Z to the engine');
    // History clears on new data.
    await page.evaluate(() => {
        window.PS_SHELL.loadTable('undo-t2', ['a'], [['1'], ['2']], null);
    });
    await page.waitForTimeout(200);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);
    const u7 = await page.evaluate(() => window.PS_SHELL.project.table.name);
    ok(u7 === 'undo-t2', 'history cleared on new data (undo is a no-op)');
}

// ---------------------------------------------------------------- new modules
{
    console.log('case 13: RM / Correlation / Likert via the supplier');
    await page.evaluate(() => {
        const lv = ['Low', 'Mid', 'High'];
        const header = ['t1', 't2', 't3', 'grp', 'q1', 'q2'];
        const rows = [];
        for (let i = 0; i < 30; i++) {
            rows.push([String(10 + i % 7), String(12 + (i * 2) % 9),
                       String(14 + (i * 3) % 11), i % 2 ? 'A' : 'B',
                       lv[i % 3], lv[(i + 1) % 3]]);
        }
        window.PS_SHELL.loadTable('mods', header, rows,
            { grp: 'nominal', q1: 'nominal', q2: 'nominal' },
            { q1: lv, q2: lv });
        window.PS_SHELL.setModule('rmplotbuilder');
    });
    await page.waitForTimeout(300);
    // The supplier lives in the Charts inspector (case 12 ends in Data).
    await page.click('[data-ps-workspace="chart"]');
    await page.waitForTimeout(200);
    // RM: measures via the multi-slot picker (toggle two on), between via drag.
    await page.click('#ps-slots .ps-slot[data-role-key="measures"] .ps-slot-drop');
    await page.waitForTimeout(120);
    await page.click('#ps-slots .ps-role-picker button[data-col="t1"]');
    await page.waitForTimeout(200);
    // The multi picker stays open: pick the second measure directly.
    await page.click('#ps-slots .ps-role-picker button[data-col="t2"]');
    await page.waitForTimeout(250);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    await page.evaluate(() => document.querySelector(
        '#ps-slots [data-role-key="betweenVar"]')
        .scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(150);
    await expandVars();
    // Empty optional slot = collapsed "+ row", itself the drop target.
    await page.dragAndDrop('#ps-columns .ps-chip[data-col="grp"]',
        '#ps-slots [data-role-key="betweenVar"]');
    await page.waitForTimeout(350);
    const rm = await page.evaluate(() => {
        const p = window.PS_SHELL.buildPayload();
        const svgs = Array.from(document.querySelectorAll('svg'))
            .sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight));
        return { cells: p ? p.bars.length : 0,
                 rowIds: p && p.bars[0].rowIds ? p.bars[0].rowIds.length : 0,
                 isRM: p ? p.isRepeatedMeasures : null,
                 groups: p ? p.groupCategories : null,
                 drew: !!svgs[0] && svgs[0].querySelectorAll('*').length > 20 };
    });
    ok(rm.cells === 4 && rm.isRM === true, 'RM: 2 measures x 2 groups cells');
    ok(rm.rowIds > 0, 'RM cells carry subject rowIds');
    ok(JSON.stringify(rm.groups) === '["B","A"]', 'between groups first-seen');
    ok(rm.drew, 'RM chart drew');
    // Multi-slot picker TOGGLE removes a member.
    await page.click('#ps-slots .ps-slot[data-role-key="measures"] .ps-slot-drop');
    await page.waitForTimeout(120);
    await page.click('#ps-slots .ps-role-picker button[data-col="t2"]');
    await page.waitForTimeout(250);
    const rm2 = await page.evaluate(() =>
        window.PS_SHELL.rolesStore().measures.slice());
    ok(JSON.stringify(rm2) === '["t1"]', 'picker toggle removes a measure');
    // Correlation: two numeric vars minimum enforced, then drawn.
    await page.evaluate(() => {
        window.PS_SHELL.setRoles('corrplotbuilder', { vars: ['t1'] });
        window.PS_SHELL.setModule('corrplotbuilder');
    });
    await page.waitForTimeout(250);
    const c1 = await page.evaluate(() =>
        document.getElementById('psroot').textContent.indexOf('at least 2') !== -1);
    ok(c1, 'corr under-minimum shows the assign message');
    await page.evaluate(() =>
        window.PS_SHELL.setRoles('corrplotbuilder', { vars: ['t1', 't2', 't3'] }));
    await page.waitForTimeout(350);
    const c2 = await page.evaluate(() => {
        const p = window.PS_SHELL.buildPayload();
        return { cells: p ? p.corrCells.length : 0,
                 drawn: document.querySelectorAll('[data-role="corr-cell"]').length };
    });
    ok(c2.cells === 6 && c2.drawn >= 9, 'corr matrix drawn (6 cells, 3x3 grid)');
    // Likert battery.
    await page.evaluate(() => {
        window.PS_SHELL.setRoles('likertplotbuilder', { items: ['q1', 'q2'] });
        window.PS_SHELL.setModule('likertplotbuilder');
    });
    await page.waitForTimeout(350);
    const lk = await page.evaluate(() => {
        const p = window.PS_SHELL.buildPayload();
        return { levels: p ? p.likertLevels : null,
                 segs: document.querySelectorAll('[data-role="likert-seg"]').length };
    });
    ok(JSON.stringify(lk.levels) === '["Low","Mid","High"]', 'likert level union in declared order');
    ok(lk.segs >= 4, 'likert segments drawn');
}

// ---------------------------------------------------------------- omv import
{
    console.log('case 14: jamovi .omv import (real fixture)');
    // Ground truth read byte-for-byte from the fixture during development:
    // 240 rows x 18 cols; group Text/Nominal A/B/C; rt Integer with an NA
    // in row 1; hours Decimal 6.4 first; q1 Integer Ordinal 1..5; t3 has a
    // double-NaN missing; id Continuous 1..240.
    await page.setInputFiles('#ps-file',
        new URL('./fixtures/graphbuilder-test-data.omv', import.meta.url).pathname);
    await page.waitForTimeout(800);
    const o = await page.evaluate(() => {
        const t = window.PS_SHELL.project.table;
        return {
            name: t.name, cols: t.order.length, rows: t.raw[t.order[0]].length,
            types: { id: t.types.id, group: t.types.group, hours: t.types.hours,
                     q1: t.types.q1, rt: t.types.rt },
            groupLevels: t.levels.group,
            q1Levels: t.levels.q1,
            group0: t.columns.group[0],
            hours0: t.columns.hours[0],
            rt0: t.columns.rt[0], rt1: t.columns.rt[1],
            id239: t.columns.id[239],
            t3miss: t.columns.t3[1]
        };
    });
    ok(o.name === 'graphbuilder-test-data' && o.cols === 18 && o.rows === 240,
       'omv adopted: 18 columns x 240 rows');
    ok(o.types.group === 'nominal' && o.types.hours === 'continuous' &&
       o.types.q1 === 'ordinal' && o.types.rt === 'continuous',
       'measure types mapped');
    ok(JSON.stringify(o.groupLevels) === '["A","B","C"]', 'text levels from xdata order');
    // The fixture DECLARES q1's levels 5..1 (reverse-scored test data);
    // the declared xdata order must win over ascending resorting.
    ok(JSON.stringify(o.q1Levels) === '["5","4","3","2","1"]',
       'ordinal levels keep the file-declared order');
    ok(o.group0 === 'A' && o.hours0 === 6.4 && o.id239 === 240,
       'cell values decoded (text codes + doubles + ints)');
    ok(o.rt0 === null && o.rt1 === 498, 'integer NA sentinel becomes missing');
    ok(o.t3miss === null, 'double NaN becomes missing');
    // The imported data drives a chart end to end.
    await page.evaluate(() => {
        window.PS_SHELL.setRoles('plotbuilder', { xvar: 'group', yvar: 'score' });
        window.PS_SHELL.setModule('plotbuilder');
    });
    await page.waitForTimeout(400);
    const drew = await page.evaluate(() => {
        const p = window.PS_SHELL.buildPayload();
        return { cells: p ? p.bars.length : 0,
                 cats: p ? p.xCategories : null };
    });
    ok(drew.cells === 3 && JSON.stringify(drew.cats) === '["A","B","C"]',
       'imported omv draws a 3-bar chart');
}

// ---------------------------------------------------------------- project file
{
    console.log('case 15: .pand project save/load round trip');
    // Build a distinctive state: fresh table + edit + exclusion + RM
    // multi-roles + a chart styling edit + a non-default error method.
    await page.evaluate(() => {
        window.PS_SHELL.loadTable('roundtrip', ['g', 'p1', 'p2'],
            [['A', '1', '4'], ['A', '2', '5'], ['B', '3', '6'], ['B', '4', '7']],
            null);
        const t = window.PS_SHELL.project.table;
        t.raw.p1[0] = '9';                       // edited cell
        t.edited = true;
        t.excluded = { p2: { 1: 1 } };           // excluded cell
        window.PS_SHELL.chart().roles.rmplotbuilder =
            { measures: ['p1', 'p2'], betweenVar: 'g' };
        window.PS_SHELL.chart().options.rmplotbuilder =
            { chartSpec: JSON.stringify({ chartTitle: 'RT check' }),
              errorBarMethod: 'between' };
        window.PS_SHELL.setModule('rmplotbuilder');
    });
    await page.waitForTimeout(400);
    const fileText = await page.evaluate(() => window.PS_SHELL.projectFileText());
    const fname = await page.evaluate(() => window.PS_SHELL.projectFileName());
    // M4b: projects carry a user-facing NAME; the filename derives from
    // it (falling back to the dataset name only when unnamed).
    const expectName = await page.evaluate(() =>
        (window.PS_SHELL.project.name || window.PS_SHELL.project.table.name)
            .replace(/\.pand$/i, '').replace(/[^\w.-]+/g, '_') + '.pand');
    ok(fname === expectName, 'file name from the project name (.pand)');
    const head = JSON.parse(fileText);
    ok(head.kind === 'pandion-plots-project' && head.formatVersion === 2 &&
       !!head.savedAt && !!head.project, 'versioned self-identifying format');
    // A real Save click produces a download with that name. (Headless
    // Chromium EXPOSES showSaveFilePicker but cannot show its dialog -
    // disable it here so the click takes the download path; case 19
    // covers the picker paths with mocks.)
    await page.evaluate(() => { window.showSaveFilePicker = undefined; });
    const [dl] = await Promise.all([
        page.waitForEvent('download'),
        page.click('#ps-save')
    ]);
    ok(dl.suggestedFilename() === fname, 'Save downloads the file');
    // Fresh context = a brand-new session; load the saved file.
    const fs = await import('node:fs');
    const tmpPath = '/tmp/ps-roundtrip-probe.pand';
    fs.writeFileSync(tmpPath, fileText);
    const ctx2 = await newTestContext();
    const page2 = await ctx2.newPage();
    const errors2 = [];
    page2.on('pageerror', e => errors2.push(String(e)));
    await page2.goto(PAGE);
    await page2.waitForTimeout(400);
    // A fresh session opens on the start center; its Open action leads
    // to the loader (the welcome overlay blocks the command bar).
    await page2.click('#ps-welcome-new');
    await page2.waitForTimeout(200);
    await page2.setInputFiles('#ps-file', tmpPath);
    await page2.waitForTimeout(600);
    const re = await page2.evaluate(() => {
        const t = window.PS_SHELL.project.table;
        const p = window.PS_SHELL.buildPayload();
        const svgs = Array.from(document.querySelectorAll('svg'))
            .sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight));
        const texts = svgs[0] ? Array.from(svgs[0].querySelectorAll('text')).map(x => x.textContent) : [];
        return {
            name: t.name, edited: t.edited,
            p1cell: t.columns.p1[0],
            excl: t.columns.p2[1],
            module: window.PS_SHELL.chart().module,
            measures: window.PS_SHELL.rolesStore().measures,
            ebm: p ? p.errorBarMethod : null,
            title: texts.some(s => (s || '').indexOf('RT check') !== -1),
            cells: p ? p.bars.length : 0
        };
    });
    ok(re.name === 'roundtrip' && re.edited === true, 'table + edited flag restored');
    ok(re.p1cell === 9, 'edited cell restored');
    ok(re.excl === null, 'exclusion restored');
    ok(re.module === 'rmplotbuilder' &&
       JSON.stringify(re.measures) === '["p1","p2"]', 'module + multi roles restored');
    ok(re.ebm === 'between', 'analysis options restored');
    ok(re.title, 'chart styling (title) restored and drawn');
    ok(re.cells === 4, 'chart rebuilt (2 measures x 2 groups)');
    ok(errors2.length === 0, 'fresh session loads with zero errors');
    await ctx2.close();
}

// ---------------------------------------------------------------- chart tabs
{
    console.log('case 16: chart tabs');
    // Start clean on the sample.
    await page.evaluate(() => { localStorage.removeItem('psstandalone.project.v2'); });
    await page.click('#ps-load');
    await page.waitForTimeout(150);
    await page.click('#ps-sample');
    await page.waitForTimeout(400);
    // Give chart 1 a title, then add a second chart.
    await page.evaluate(() => {
        window.setOption('chartSpec', JSON.stringify({ chartTitle: 'Tab one title' }));
    });
    await page.waitForTimeout(250);
    // M4g: the tab + is contextual - in Charts it opens the analysis
    // gallery directly (no intermediate add-menu).
    await page.click('.ps-tab-add');
    await page.waitForTimeout(250);
    ok(await page.evaluate(() =>
        document.getElementById('ps-analysis-gallery').style.display === 'flex' &&
        document.querySelectorAll('[data-analysis-module]').length === 7 &&
        document.querySelectorAll('[data-analysis-help]').length === 1),
       'New chart opens the complete guided analysis gallery');
    await page.click('#ps-analysis-grid [data-analysis-module="plotbuilder"]');
    await page.waitForTimeout(300);
    const t1 = await page.evaluate(() => ({
        n: window.PS_SHELL.charts().length,
        active: window.PS_SHELL.chart().name,
        placeholder: document.getElementById('psroot').textContent.indexOf('Assign') !== -1,
        guided: !!document.querySelector('#psroot .ps-guided-empty'),
        opts: Object.keys(window.PS_SHELL.optionStore())
    }));
    ok(t1.n === 2 && t1.active === 'Chart 2', 'add creates + activates Chart 2');
    ok(t1.placeholder && t1.guided, 'new chart starts with actionable assignment guidance');
    ok(t1.opts.length === 0, 'new chart styling is clean (isolation)');
    // Chart 2 becomes a Frequencies chart.
    await page.selectOption('#ps-module', 'freqplotbuilder');
    await page.waitForTimeout(150);
    await assignRole('var', 'condition');
    const t2 = await page.evaluate(() => ({
        cells: (window.PS_SHELL.buildPayload() || {}).bars.length,
        mod: window.PS_SHELL.chart().module
    }));
    ok(t2.mod === 'freqplotbuilder' && t2.cells === 3, 'Chart 2 draws its own analysis');
    // Back to tab 1: its module, roles, and title all intact.
    await page.click('.ps-tab[data-chart-id="c1"]');
    await page.waitForTimeout(350);
    const t3 = await page.evaluate(() => {
        const svgs = Array.from(document.querySelectorAll('svg'))
            .sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight));
        const texts = svgs[0] ? Array.from(svgs[0].querySelectorAll('text')).map(x => x.textContent) : [];
        return { mod: window.PS_SHELL.chart().module,
                 title: texts.some(s => (s || '').indexOf('Tab one title') !== -1) };
    });
    ok(t3.mod === 'plotbuilder' && t3.title, 'tab 1 restores with its own styling');
    // Rename via F2 (M4c: rename routes through the command system -
    // F2 focuses the inspector's Document name field; the old tab
    // double-click editor is gone).
    await page.click('.ps-tab[data-chart-id="c1"]');
    await page.waitForTimeout(250);
    await page.keyboard.press('F2');
    await page.waitForTimeout(150);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Dose response');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    const t4 = await page.evaluate(() =>
        window.PS_SHELL.charts().map(c => c.name));
    ok(JSON.stringify(t4) === '["Dose response","Chart 2"]', 'F2 rename');
    // Double-click rename is back: manual double-click detection in
    // the click handler (the first click's switchChart rebuilds the
    // strip, so the NATIVE dblclick event never fires across it).
    await page.dblclick('.ps-tab[data-chart-id="c1"]');
    await page.waitForTimeout(200);
    ok(await page.evaluate(() => !!document.querySelector('.ps-tab-rename')),
       'double-click opens the inline tab rename');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    // Tabs survive reload AND ride the .pand file.
    await page.reload();
    await page.waitForTimeout(400);
    const t5 = await page.evaluate(() => ({
        names: window.PS_SHELL.charts().map(c => c.name),
        active: window.PS_SHELL.chart().name
    }));
    ok(JSON.stringify(t5.names) === '["Dose response","Chart 2"]' &&
       t5.active === 'Dose response', 'tabs persist across reload');
    const twoChartFile = await page.evaluate(() => window.PS_SHELL.projectFileText());
    const fs2 = await import('node:fs');
    fs2.writeFileSync('/tmp/ps-two-charts.pand', twoChartFile);
    // Close chart 2.
    await page.click('.ps-tab[data-chart-id="c2"] .ps-tab-select');
    await page.waitForTimeout(200);
    await page.click('.ps-tab-x[data-chart-id="c2"]');
    await page.waitForTimeout(300);
    const t6 = await page.evaluate(() => ({
        n: window.PS_SHELL.charts().length,
        closeBtns: document.querySelectorAll('.ps-tab-x').length
    }));
    ok(t6.n === 1 && t6.closeBtns === 0, 'close removes the tab (last tab unclosable)');
    // The saved two-chart file restores both tabs in a fresh session.
    const ctx3 = await newTestContext();
    const page3 = await ctx3.newPage();
    await page3.goto(PAGE);
    await page3.waitForTimeout(400);
    await page3.click('#ps-welcome-new');
    await page3.waitForTimeout(200);
    await page3.setInputFiles('#ps-file', '/tmp/ps-two-charts.pand');
    await page3.waitForTimeout(500);
    const t7 = await page3.evaluate(() => ({
        names: window.PS_SHELL.charts().map(c => c.name),
        tabEls: document.querySelectorAll('.ps-tab').length
    }));
    ok(JSON.stringify(t7.names) === '["Dose response","Chart 2"]' && t7.tabEls === 2,
       'two-chart .pand restores both tabs');
    // Legacy v2 project files migrate to one tab.
    const legacy = JSON.stringify({
        kind: 'pandion-plots-project', formatVersion: 1, savedAt: 'x',
        project: { version: 2, module: 'freqplotbuilder',
            roles: { freqplotbuilder: { var: 'g' } },
            options: { freqplotbuilder: {} },
            ui: { dataOpen: false },
            table: { name: 'legacy2', order: ['g'],
                     raw: { g: ['A', 'B', 'A'] }, types: { g: 'nominal' } } }
    });
    fs2.writeFileSync('/tmp/ps-legacy.pand', legacy);
    await page3.click('#ps-load');
    await page3.setInputFiles('#ps-file', '/tmp/ps-legacy.pand');
    await page3.waitForTimeout(500);
    const t8 = await page3.evaluate(() => ({
        n: window.PS_SHELL.charts().length,
        mod: window.PS_SHELL.chart().module,
        cells: (window.PS_SHELL.buildPayload() || {}).bars.length
    }));
    ok(t8.n === 1 && t8.mod === 'freqplotbuilder' && t8.cells === 2,
       'single-chart-era file migrates to one tab');
    await ctx3.close();
}

// ---------------------------------------------------------------- tab reorder
{
    console.log('case 17: pointer drag-to-reorder tabs');
    // Case 16 left one tab (c1); add two more.
    for (let k = 0; k < 2; k++) {
        await page.click('.ps-tab-add');
        await page.waitForTimeout(250);
        await page.click('#ps-analysis-grid [data-analysis-module="plotbuilder"]');
        await page.waitForTimeout(200);
    }
    async function tabCenter(id) {
        return await page.evaluate((id) => {
            const t = document.querySelector('.ps-tab[data-chart-id="' + id + '"]');
            const r = t.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left };
        }, id);
    }
    const ids0 = await page.evaluate(() =>
        window.PS_SHELL.charts().map(c => c.id));
    ok(JSON.stringify(ids0) === '["c1","c2","c3"]', 'three tabs to reorder');
    // Drag c3 inline to before c1, asserting the mid-drag look.
    let from = await tabCenter('c3');
    let to = await tabCenter('c1');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.left + 4, from.y, { steps: 8 });
    await page.waitForTimeout(120);
    const mid = await page.evaluate(() => {
        const dragged = document.querySelector('.ps-tab-dragging');
        const others = ['c1', 'c2'].map(id =>
            document.querySelector('.ps-tab[data-chart-id="' + id + '"]').style.transform);
        return { draggedId: dragged ? dragged.getAttribute('data-chart-id') : null,
                 draggedTf: dragged ? dragged.style.transform : '',
                 others };
    });
    ok(mid.draggedId === 'c3' && mid.draggedTf.indexOf('translate') === 0,
       'dragged tab slides inline with the pointer');
    ok(mid.others.every(t => t.indexOf('translate') === 0),
       'other tabs part out of the way');
    await page.mouse.up();
    await page.waitForTimeout(250);
    const st1 = await page.evaluate(() => ({
        ids: window.PS_SHELL.charts().map(c => c.id),
        chrome: document.querySelectorAll('.ps-tab-dragging').length +
                Array.from(document.querySelectorAll('.ps-tab'))
                    .filter(t => t.style.transform).length,
        active: window.PS_SHELL.chart().id
    }));
    ok(JSON.stringify(st1.ids) === '["c3","c1","c2"]', 'dropped before the first tab');
    ok(st1.chrome === 0, 'drag chrome cleared after drop');
    // Drag c3 to the far end.
    from = await tabCenter('c3');
    const c2c = await tabCenter('c2');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(c2c.x + 60, from.y, { steps: 8 });
    await page.waitForTimeout(120);
    await page.mouse.up();
    await page.waitForTimeout(250);
    const st2 = await page.evaluate(() =>
        window.PS_SHELL.charts().map(c => c.id));
    ok(JSON.stringify(st2) === '["c1","c2","c3"]', 'dragged to the end');
    // A drag-release must NOT switch tabs; a plain click still does.
    ok(st1.active === (await page.evaluate(() => window.PS_SHELL.chart().id)),
       'reorders never change the active chart');
    const c2now = await tabCenter('c2');
    await page.mouse.click(c2now.x, c2now.y);
    await page.waitForTimeout(250);
    ok((await page.evaluate(() => window.PS_SHELL.chart().id)) === 'c2',
       'plain tab click still switches');
    // Esc abandons a live drag with no reorder.
    from = await tabCenter('c3');
    to = await tabCenter('c1');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.left + 4, from.y, { steps: 6 });
    await page.waitForTimeout(100);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    await page.mouse.up();
    await page.waitForTimeout(200);
    const st3 = await page.evaluate(() => ({
        ids: window.PS_SHELL.charts().map(c => c.id),
        chrome: document.querySelectorAll('.ps-tab-dragging').length +
                Array.from(document.querySelectorAll('.ps-tab'))
                    .filter(t => t.style.transform).length
    }));
    ok(JSON.stringify(st3.ids) === '["c1","c2","c3"]' && st3.chrome === 0,
       'Esc abandons the drag cleanly');
    // Order persists across reload; active chart intact.
    await page.reload();
    await page.waitForTimeout(400);
    const st4 = await page.evaluate(() => ({
        ids: window.PS_SHELL.charts().map(c => c.id),
        active: window.PS_SHELL.chart().id
    }));
    ok(JSON.stringify(st4.ids) === '["c1","c2","c3"]' && st4.active === 'c2',
       'reordered tabs persist with the active chart intact');
}

// ---------------------------------------------------------------- role typing
{
    console.log('case 18: per-role accepted types');
    // Fresh table: nominal cat, continuous num.
    await page.evaluate(() => {
        window.PS_SHELL.loadTable('typed', ['cat', 'num'],
            [['A', '1.5'], ['B', '2.5'], ['A', '3.5'], ['B', '4.5']], null);
        window.PS_SHELL.setRoles('plotbuilder', {});
        window.PS_SHELL.setModule('plotbuilder');
    });
    await page.waitForTimeout(300);
    // The X (categories) picker must NOT offer the continuous column.
    await page.click('#ps-slots .ps-slot[data-role-key="xvar"] .ps-slot-drop');
    await page.waitForTimeout(120);
    const g1 = await page.evaluate(() => ({
        offersCat: !!document.querySelector('#ps-slots .ps-role-picker button[data-col="cat"]'),
        offersNum: !!document.querySelector('#ps-slots .ps-role-picker button[data-col="num"]')
    }));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    ok(g1.offersCat && !g1.offersNum, 'X picker offers nominal, not continuous');
    // Dragging the continuous chip over X neither highlights nor assigns.
    await expandVars();
    await page.dragAndDrop('#ps-columns .ps-chip[data-col="num"]',
        '#ps-slots .ps-slot[data-role-key="xvar"] .ps-slot-drop');
    await page.waitForTimeout(250);
    const g2 = await page.evaluate(() => window.PS_SHELL.rolesStore().xvar || null);
    ok(g2 === null, 'continuous chip cannot drop into a category slot');
    // Y (values) is the mirror image.
    await page.click('#ps-slots .ps-slot[data-role-key="yvar"] .ps-slot-drop');
    await page.waitForTimeout(120);
    const g3 = await page.evaluate(() => ({
        offersCat: !!document.querySelector('#ps-slots .ps-role-picker button[data-col="cat"]'),
        offersNum: !!document.querySelector('#ps-slots .ps-role-picker button[data-col="num"]')
    }));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    ok(!g3.offersCat && g3.offersNum, 'Y picker offers continuous, not nominal');
    // The accepted types live in the drop tooltip; the eligible COUNT
    // renders only as the "none eligible" warning (de-busy pass, Torry
    // Jul 27 2026), so with candidates available there is no count
    // chrome at all. The dedicated pane-debusy probe covers the warning.
    const g4 = await page.evaluate(() => {
        const slots = Array.from(document.querySelectorAll('#ps-slots .ps-slot'));
        return slots.map(s => {
            const count = s.querySelector('.ps-slot-count');
            const drop = s.querySelector('.ps-slot-drop');
            return { key: s.getAttribute('data-role-key'),
                     count: count ? count.textContent : null,
                     tip: drop ? drop.getAttribute('data-tip') : null };
        });
    });
    ok(g4.every(s => s.count === null),
       'no count chrome while candidates exist (the count is a warning only)');
    // Ruling flipped (Torry, Aug 2026): the drop zones carry NO hover
    // pop-up - it covered the picker list, and the accepted types live
    // permanently in the picker rows' badges. The aria-label remains the
    // screen-reader path.
    ok(g4.every(s => !s.tip),
       'drop zones carry no hover pop-up (the picker badges carry the types)');
    // Flipping num to ordinal makes it eligible BOTH ways (dual role).
    await page.evaluate(() => {
        const chips = Array.from(document.querySelectorAll('#ps-columns .ps-chip'));
        chips.find(c => c.getAttribute('data-col') === 'num').click();
    });
    await page.waitForTimeout(150);
    await page.click('#ps-typemenu button[data-type="ordinal"]');
    await page.waitForTimeout(250);
    await page.click('#ps-slots .ps-slot[data-role-key="xvar"] .ps-slot-drop');
    await page.waitForTimeout(120);
    const g5 = await page.evaluate(() =>
        !!document.querySelector('#ps-slots .ps-role-picker button[data-col="num"]'));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    ok(g5, 'numeric ordinal becomes eligible for the category slot');
    // A TEXT ordinal must NOT enter a values slot (numbers required).
    await page.evaluate(() => {
        const chips = Array.from(document.querySelectorAll('#ps-columns .ps-chip'));
        chips.find(c => c.getAttribute('data-col') === 'cat').click();
    });
    await page.waitForTimeout(150);
    await page.click('#ps-typemenu button[data-type="ordinal"]');
    await page.waitForTimeout(250);
    await page.click('#ps-slots .ps-slot[data-role-key="yvar"] .ps-slot-drop');
    await page.waitForTimeout(120);
    const g6 = await page.evaluate(() => ({
        cat: !!document.querySelector('#ps-slots .ps-role-picker button[data-col="cat"]'),
        num: !!document.querySelector('#ps-slots .ps-role-picker button[data-col="num"]')
    }));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    ok(!g6.cat && g6.num, 'text ordinal stays out of the values slot');
}

// ---------------------------------------------------------------- cmd+s save
{
    console.log('case 19: Cmd/Ctrl+S save');
    // Mocked File System Access: first save picks, later saves write
    // silently to the same handle.
    await page.evaluate(() => {
        window.__fsCalls = { picker: 0, writes: [] };
        window.showSaveFilePicker = async (opts) => {
            window.__fsCalls.picker++;
            window.__fsCalls.suggested = opts.suggestedName;
            return {
                createWritable: async () => ({
                    write: async (t) => { window.__fsCalls.writes.push(t); },
                    close: async () => {}
                })
            };
        };
    });
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(300);
    await page.keyboard.press('Meta+s');
    await page.waitForTimeout(300);
    const s1 = await page.evaluate(() => ({
        picker: window.__fsCalls.picker,
        writes: window.__fsCalls.writes.length,
        suggested: window.__fsCalls.suggested,
        valid: (() => {
            try {
                const o = JSON.parse(window.__fsCalls.writes[1]);
                return o.kind === 'pandion-plots-project' && !!o.project;
            } catch (e) { return false; }
        })(),
        btn: document.getElementById('ps-save').textContent
    }));
    ok(s1.picker === 1 && s1.writes === 2,
       'first save picks the file, second writes silently in place');
    ok(/\.pand$/.test(s1.suggested), 'picker suggests the .pand name');
    ok(s1.valid, 'written content is a valid project file');
    ok(s1.btn === 'Saved', 'Save button flashes Saved');
    // A handle that goes STALE (file moved / permission revoked) falls
    // back to a download on the failing reuse. Fresh page = fresh handle;
    // the mock succeeds once, then throws.
    await page.reload();
    await page.waitForTimeout(400);
    await page.evaluate(() => {
        let uses = 0;
        window.showSaveFilePicker = async () => ({
            createWritable: async () => {
                if (++uses > 1) throw new DOMException('gone', 'NotAllowedError');
                return { write: async () => {}, close: async () => {} };
            }
        });
    });
    await page.keyboard.press('Control+s');   // pick + write ok
    await page.waitForTimeout(300);
    const [dl2] = await Promise.all([
        page.waitForEvent('download'),
        page.keyboard.press('Control+s')      // reuse fails -> download
    ]);
    ok(/\.pand$/.test(dl2.suggestedFilename()), 'stale handle falls back to a download');
    // Without the API at all, Ctrl+S downloads directly.
    await page.evaluate(() => { window.showSaveFilePicker = undefined; });
    const [dl3] = await Promise.all([
        page.waitForEvent('download'),
        page.keyboard.press('Control+s')
    ]);
    ok(/\.pand$/.test(dl3.suggestedFilename()), 'no-API browsers download on Ctrl+S');
}

// ---------------------------------------------------------------- layouts
{
    console.log('case 20: layout tabs (figure composition)');
    // UNITS: this case tests layout GEOMETRY, and it types raw numbers into
    // the page/inset/position fields. Since t4-45 those fields are read in
    // the user's chosen unit (inches by default), so 20 would mean twenty
    // INCHES. Pin pixels for the duration, exactly as a user would from
    // Preferences, so every number below means what it says. units-check
    // owns the conversion behaviour itself.
    await page.evaluate(() => window.PS_SHELL.runCommand('preferences'));
    await page.waitForTimeout(400);
    await page.selectOption('#ps-pref-units', 'px');
    await page.click('#ps-preferences-save');
    await page.waitForTimeout(500);
    // The precision editor benefits from a taller viewport for real-pointer
    // gestures and its page viewport.
    await page.setViewportSize({ width: 1280, height: 920 });
    // Clean start: sample table -> chart 1 (CG, roles pre-assigned),
    // then a second chart tab running Frequencies.
    await page.evaluate(() => { localStorage.removeItem('psstandalone.project.v2'); });
    await page.click('#ps-load');
    await page.waitForTimeout(150);
    await page.click('#ps-sample');
    await page.waitForTimeout(500);
    await page.click('.ps-tab-add');
    await page.waitForTimeout(250);
    await page.click('#ps-analysis-grid [data-analysis-module="plotbuilder"]');
    await page.waitForTimeout(250);
    await page.selectOption('#ps-module', 'freqplotbuilder');
    await page.waitForTimeout(150);
    await assignRole('var', 'condition');
    // New layout: the Layouts workspace routes creation through the
    // TEMPLATE GALLERY (M4h); Blank canvas = the old direct creation.
    await page.click('[data-ps-workspace="layout"]');
    await page.waitForTimeout(250);
    await page.click('text=Create layout');
    await page.waitForTimeout(300);
    await page.click('[data-layout-template="blank"]');
    await page.waitForTimeout(120);
    await page.click('#ps-layout-gallery-create');
    await page.waitForTimeout(400);
    // Pin the scroll so the whole canvas sits inside the viewport for
    // the real-pointer gestures below (probe law: scrollIntoView before
    // page.mouse coordinates).
    await page.evaluate(() =>
        document.getElementById('ps-layout').scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(100);
    const l1 = await page.evaluate(() => ({
        n: window.PS_SHELL.charts().length,
        active: window.PS_SHELL.chart().name,
        type: window.PS_SHELL.chart().type,
        canvasShown: document.getElementById('ps-layout').style.display,
        hostParked: document.getElementById('psroot').classList.contains('ps-offscreen'),
        rolesHidden: document.getElementById('ps-slots').offsetParent === null,
        deadGap: (() => {
            const t = document.getElementById('ps-tabs').getBoundingClientRect();
            const l = document.getElementById('ps-layout').getBoundingClientRect();
            return l.top - t.bottom;
        })()
    }));
    ok(l1.n === 3 && l1.type === 'layout' && l1.active === 'Layout 1',
       'the + menu adds a layout tab');
    ok(l1.canvasShown === 'block' && l1.hostParked,
       'canvas shown, engine host parked offscreen');
    ok(l1.rolesHidden, 'role controls hide on a layout tab');
    // The parked host must be OUT OF FLOW: its inline position:relative
    // once beat the .ps-offscreen rule and left a page-tall dead white
    // block between the tabs and the canvas (Torry's field report).
    ok(l1.deadGap < 40,
       'no dead space above the canvas (gap ' + Math.round(l1.deadGap) + 'px)');
    const lPrecision = await page.evaluate(() => {
        const c = window.PS_SHELL.chart();
        return {
            page: c.page,
            view: c.view,
            pageChoice: document.getElementById('ps-lpage').value,
            zoomChoice: document.getElementById('ps-lzoom').value,
            grid: document.getElementById('ps-lcanvas').classList.contains('ps-lgrid-on'),
            marginGuide: getComputedStyle(document.querySelector('.ps-lmargin-guide')).display
        };
    });
    ok(lPrecision.page.w === 1008 && lPrecision.page.h === 672 &&
       lPrecision.pageChoice === 'canvas' && lPrecision.zoomChoice === 'fit',
       'new layouts start with a named page preset and fit-page zoom');
    ok(lPrecision.view.snap && lPrecision.view.guides && lPrecision.grid &&
       lPrecision.marginGuide === 'block',
       'grid, snapping, smart guides, and margins start enabled');
    const lInsetStable = await page.evaluate(() => {
        const canvas = document.getElementById('ps-lcanvas');
        const stage = document.getElementById('ps-lstage');
        const inset = document.getElementById('ps-lmargin');
        const before = {
            transform: canvas.style.transform,
            stageW: stage.style.width,
            stageH: stage.style.height
        };
        inset.value = '52';
        inset.dispatchEvent(new Event('change', { bubbles: true }));
        inset.value = '20';
        inset.dispatchEvent(new Event('change', { bubbles: true }));
        const guide = canvas.querySelector('.ps-lmargin-guide');
        return {
            before,
            after: {
                transform: canvas.style.transform,
                stageW: stage.style.width,
                stageH: stage.style.height
            },
            inset: window.PS_SHELL.chart().page.margin,
            guide: [guide.style.top, guide.style.right,
                    guide.style.bottom, guide.style.left]
        };
    });
    ok(JSON.stringify(lInsetStable.before) === JSON.stringify(lInsetStable.after),
       'repeated inset edits do not change fit zoom or page geometry');
    ok(lInsetStable.inset === 20 &&
       lInsetStable.guide.every(v => v === '20px'),
       'inset edits update only the four margin-guide edges');
    // Pin 100% and disable snapping/guides for the exact pointer-delta
    // assertions retained below; the new controls themselves are covered.
    await page.selectOption('#ps-lzoom', '1');
    await page.click('#ps-lsnap');
    await page.click('#ps-lguides');
    await page.waitForTimeout(150);
    await page.selectOption('#ps-lpage', 'square');
    await page.waitForTimeout(150);
    const lPageSquare = await page.evaluate(() => ({
        w: window.PS_SHELL.chart().page.w,
        h: window.PS_SHELL.chart().page.h,
        cw: document.getElementById('ps-lcanvas').style.width,
        ch: document.getElementById('ps-lcanvas').style.height
    }));
    ok(lPageSquare.w === 768 && lPageSquare.h === 768 &&
       lPageSquare.cw === '768px' && lPageSquare.ch === '768px',
       'page presets update stored and visible canvas geometry');
    await page.selectOption('#ps-lpage', 'canvas');
    await page.waitForTimeout(150);
    // Place both charts (snapshots exist from their live renders).
    async function layAddChart(id) {
        await page.click('#ps-laddchart');
        await page.waitForTimeout(120);
        await page.click('#ps-lchartmenu button[data-chart="' + id + '"]');
        await page.waitForTimeout(300);
    }
    await layAddChart('c1');
    await layAddChart('c2');
    const l2 = await page.evaluate(() => {
        const panels = Array.from(document.querySelectorAll(
            '#ps-lcanvas .ps-litem[data-kind="chart"]'));
        return { n: panels.length,
                 svgs: panels.map(p => !!p.querySelector('svg')),
                 halos: panels.map(p => p.querySelectorAll(
                     '[data-role^="sel-halo"], .gb2-halo-union').length) };
    });
    ok(l2.n === 2 && l2.svgs.every(Boolean), 'both charts render as snapshot panels');
    ok(l2.halos.every(h => h === 0), 'snapshots are chrome-stripped');
    // Panel labels: bold A then B, auto-incrementing.
    await page.click('#ps-laddlabel');
    await page.waitForTimeout(150);
    await page.click('#ps-laddlabel');
    await page.waitForTimeout(150);
    const l3 = await page.evaluate(() => {
        const c = window.PS_SHELL.chart();
        const labels = c.items.filter(it => it.kind === 'text');
        return { texts: labels.map(it => it.text),
                 bold: labels.every(it => it.bold === true),
                 size: labels.every(it => it.fontSize === 20),
                 next: c.nextLabel };
    });
    ok(JSON.stringify(l3.texts) === '["A","B"]' && l3.bold && l3.size && l3.next === 2,
       'panel labels stamp bold A, B and keep counting');
    // Precision selection: Shift-click adds to the selection, alignment
    // acts on both, and Duplicate preserves the pair as the new selection.
    let rp1 = await itemRect('i1');
    let rp2 = await itemRect('i2');
    await page.mouse.click(rp1.x + 20, rp1.y + 10);
    await page.keyboard.down('Shift');
    await page.mouse.click(rp2.x + 20, rp2.y + 10);
    await page.keyboard.up('Shift');
    await page.waitForTimeout(120);
    // Torry's cohesion ruling, Jul 27 2026: the RAIL is the ONE selection
    // surface, as in Data and Charts. The old #ps-linspect band between
    // toolbar and canvas was a parallel copy of the same controls and is
    // gone; these assertions moved to the rail's ctx ids and now also pin
    // the band's absence, the command idiom on the toolbar, and the hint
    // line's departure to tooltips.
    // The one-shot coach mark anchors near the rail; a user in its way
    // dismisses it, so the probe does too (never force-click through it,
    // which would mask a real occlusion bug).
    await page.evaluate(() => {
        const okBtn = document.getElementById('ps-coach-ok');
        const coach = document.getElementById('ps-coach');
        if (okBtn && coach && !coach.hidden) okBtn.click();
    });
    await page.waitForTimeout(150);
    const lMulti0 = await page.evaluate(() => ({
        selected: document.querySelectorAll('#ps-lcanvas .ps-litem-sel').length,
        bandGone: !document.getElementById('ps-linspect'),
        hintGone: !document.querySelector('.ps-lhint'),
        commandBar: document.querySelectorAll('#ps-ltoolbar .ps-command').length,
        // The rule this case exists for, stated directly: EVERY button in
        // the bar is the shared command component. The old proxy was a
        // count of at least 10, which quietly encoded how many controls
        // the bar happened to hold - so moving the canvas aids to the rail
        // (t4-43), a deliberate change, failed it at 6.
        offIdiom: document.querySelectorAll(
            '#ps-ltoolbar button:not(.ps-command)').length,
        // The icon buttons must RENDER, not merely exist: the first cut of
        // the shared component lost a specificity fight with the base
        // .ps-command rule and the svgs crushed to 7px wide (Torry's
        // invisible-Undo screenshot). Geometry is the assertion.
        undoIcon: (() => {
            const r = document.querySelector('#ps-lundo svg')
                .getBoundingClientRect();
            return Math.round(r.width) >= 12 && Math.round(r.height) >= 12;
        })(),
        strayBtn: document.querySelectorAll('#ps-ltoolbar .ps-btn').length,
        inspector: document.getElementById('ps-inspector-layout').classList.contains(
            'ps-inspector-active'),
        contextualTitle: document.getElementById(
            'ps-layout-selection-title').textContent,
        contextualAlign: document.querySelector(
            '[data-ctx-align="top"]').disabled
    }));
    ok(lMulti0.selected === 2 && !lMulti0.contextualAlign,
       'Shift-click creates an actionable multi-selection');
    ok(lMulti0.bandGone && lMulti0.hintGone,
       'the duplicate selection band and the inline hint text are gone: the ' +
       'rail is the one selection surface, instructions live in tips');
    ok(lMulti0.commandBar >= 6 && lMulti0.offIdiom === 0 &&
       lMulti0.strayBtn === 0 && lMulti0.undoIcon,
       `the layout toolbar speaks the command idiom with VISIBLE icon ` +
       `buttons, no stray ps-btn (${lMulti0.commandBar} commands)`);
    ok(lMulti0.inspector && lMulti0.contextualTitle === '2 selected items',
       'layout selection populates the rail properties inspector');
    await page.click('[data-ctx-align="top"]');
    await page.waitForTimeout(120);
    const lMulti1 = await page.evaluate(() => {
        const its = window.PS_SHELL.chart().items.filter(i => i.id === 'i1' || i.id === 'i2');
        return { ys: its.map(i => i.y), before: window.PS_SHELL.chart().items.length };
    });
    ok(Math.abs(lMulti1.ys[0] - lMulti1.ys[1]) < 0.01,
       'alignment commands operate on the multi-selection');
    // The rail Duplicate button is gone (Aug 5 2026): the keyboard
    // shortcut is the multi-select duplicate path now.
    await page.keyboard.press('ControlOrMeta+d');
    await page.waitForTimeout(120);
    const lMulti2 = await page.evaluate(() => ({
        n: window.PS_SHELL.chart().items.length,
        selected: document.querySelectorAll('#ps-lcanvas .ps-litem-sel').length
    }));
    ok(lMulti2.n === lMulti1.before + 2 && lMulti2.selected === 2,
       'Duplicate copies every selected item and selects the copies');
    await page.keyboard.press('Delete');
    await page.waitForTimeout(120);
    ok(await page.evaluate(() => window.PS_SHELL.chart().items.length === 4),
       'Delete removes an entire multi-selection');
    // Exact inspector positioning + documented ten-pixel keyboard nudge.
    rp1 = await itemRect('i1');
    await page.mouse.click(rp1.x + 20, rp1.y + 10);
    await page.fill('#ps-ctx-lx', '80');
    await page.locator('#ps-ctx-lx').blur();
    await page.waitForTimeout(100);
    await page.evaluate(() =>
        document.getElementById('ps-lviewport').focus());
    await page.keyboard.press('Alt+Shift+ArrowRight');
    await page.waitForTimeout(100);
    const lExact = await page.evaluate(() => {
        const it = window.PS_SHELL.chart().items.find(i => i.id === 'i1');
        return { x: it.x, shown: document.getElementById('ps-ctx-lx').value };
    });
    ok(lExact.x === 90 && lExact.shown === '90',
       'exact coordinates and Alt+Shift+arrow nudging stay synchronized');
    // Drag chart 2's panel to a clear spot (pointer path, item follows).
    async function itemRect(id) {
        return await page.evaluate((id) => {
            const r = document.querySelector(
                '#ps-lcanvas .ps-litem[data-item-id="' + id + '"]').getBoundingClientRect();
            return { x: r.x, y: r.y, w: r.width, h: r.height };
        }, id);
    }
    const beforeDrag = await page.evaluate(() => {
        const it = window.PS_SHELL.chart().items.find(i => i.kind === 'chart' && i.id === 'i2');
        return { x: it.x, y: it.y };
    });
    let r2 = await itemRect('i2');
    await page.mouse.move(r2.x + 40, r2.y + 12);
    await page.mouse.down();
    await page.mouse.move(r2.x + 40 + 60, r2.y + 12 + 300, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const l4 = await page.evaluate((was) => {
        const it = window.PS_SHELL.chart().items.find(i => i.id === 'i2');
        const saved = JSON.parse(localStorage.getItem('psstandalone.project.v2'));
        const savedIt = saved.charts.find(c => c.type === 'layout')
            .items.find(i => i.id === 'i2');
        return { dx: it.x - was.x, dy: it.y - was.y,
                 persisted: savedIt.x === it.x && savedIt.y === it.y };
    }, beforeDrag);
    ok(Math.abs(l4.dx - 60) <= 2 && Math.abs(l4.dy - 300) <= 2 && l4.persisted,
       'panels drag by the pointer delta and persist');
    // Corner-resize chart 1's panel (select first, then grab the handle).
    let r1 = await itemRect('i1');
    await page.mouse.click(r1.x + 30, r1.y + 10);
    await page.waitForTimeout(150);
    const grew = await page.evaluate(() => {
        const h = document.querySelector(
            '#ps-lcanvas .ps-litem[data-item-id="i1"] [data-role="lay-resize"]');
        if (!h) return null;
        const r = h.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    ok(!!grew, 'selecting a panel shows its resize handle');
    // M4i: a plain corner drag preserves the aspect ratio (dominant
    // axis drives one scale factor); Shift restores freeform W/H.
    const preResize = await page.evaluate(() => {
        const it = window.PS_SHELL.chart().items.find(i => i.id === 'i1');
        return { w: it.w, h: it.h };
    });
    await page.mouse.move(grew.x, grew.y);
    await page.mouse.down();
    await page.mouse.move(grew.x - 140, grew.y - 60, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const l5p = await page.evaluate(() => {
        const it = window.PS_SHELL.chart().items.find(i => i.id === 'i1');
        return { w: it.w, h: it.h };
    });
    ok(Math.abs(l5p.w / l5p.h - preResize.w / preResize.h) < 0.03 &&
       l5p.w < preResize.w,
       'plain corner drag scales proportionally (M4i)');
    // Shift DURING the drag = freeform W/H. (Shift at pointerdown means
    // multi-select, so the modifier joins after the drag has armed.)
    const grew2 = await page.evaluate(() => {
        const h = document.querySelector(
            '#ps-lcanvas .ps-litem[data-item-id="i1"] [data-role="lay-resize"]');
        const r = h.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.move(grew2.x, grew2.y);
    await page.mouse.down();
    await page.mouse.move(grew2.x - 10, grew2.y + 5, { steps: 2 });
    await page.keyboard.down('Shift');
    await page.mouse.move(grew2.x - 40, grew2.y + 30, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await page.waitForTimeout(200);
    const l5 = await page.evaluate((pre) => {
        const it = window.PS_SHELL.chart().items.find(i => i.id === 'i1');
        return { dw: it.w - pre.w, dh: it.h - pre.h,
                 ratioChanged: Math.abs((it.w / it.h) - (pre.w / pre.h)) > 0.05 };
    }, l5p);
    ok(l5.dw < -15 && l5.dh > 10 && l5.ratioChanged,
       'Shift mid-drag unlocks freeform width/height');
    // Pixel truth: the snapshot bars actually PAINT. (A document-wide
    // clip-id collision once clipped every clone to nothing while all
    // geometry probes passed - getBoundingClientRect ignores clip-path.)
    const pxPt = await page.evaluate(() => {
        const p = document.querySelector(
            '#ps-lcanvas .ps-litem[data-item-id="i1"]');
        const r = p.getBoundingClientRect();
        return { x: r.x + r.width * 0.35, y: r.y + r.height * 0.6 };
    });
    const pxShot = await page.screenshot();
    const pxRGB = await page.evaluate(async ({ b64, x, y }) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const cv = document.createElement('canvas');
        cv.width = img.width; cv.height = img.height;
        const cx = cv.getContext('2d');
        cx.drawImage(img, 0, 0);
        const d = cx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
        return [d[0], d[1], d[2]];
    }, { b64: pxShot.toString('base64'), x: pxPt.x, y: pxPt.y });
    ok(pxRGB[0] < 240 || pxRGB[1] < 240 || pxRGB[2] < 240,
       'snapshot bars actually paint (clip ids rewritten): rgb ' + pxRGB.join(','));
    // Plain text: add, double-click edit, background click commits.
    await page.click('#ps-laddtext');
    await page.waitForTimeout(150);
    const textId = await page.evaluate(() => {
        const its = window.PS_SHELL.chart().items;
        return its[its.length - 1].id;
    });
    const rt = await itemRect(textId);
    await page.mouse.dblclick(rt.x + 10, rt.y + 8);
    await page.waitForTimeout(150);
    await page.keyboard.type('Figure 1. Dose response.');
    // Commit path = a background click (the editor-flush guard).
    // PROBE GEOMETRY LAW (Jul 28 2026, found by a focus spy): the canvas
    // rect is UNCLIPPED child geometry - when the canvas overflows its
    // scrolling viewport, its bottom-right corner extends under the RIGHT
    // RAIL, so a "background" click aimed there lands on whatever rail
    // control happens to sit at that y. It hit inert padding for months
    // (focus fell to body, harmlessly), then the rail grew a Page-size
    // section and the SAME coordinate landed on the document-name INPUT,
    // whose input guard swallowed the very next Delete keypress. Clamp
    // background clicks to the VIEWPORT'S OWN visible box.
    const canvasRect = await page.evaluate(() => {
        const r = document.getElementById('ps-lcanvas').getBoundingClientRect();
        const v = document.getElementById('ps-lviewport').getBoundingClientRect();
        return { x: r.x, y: r.y,
                 right: Math.min(r.x + r.width, v.x + v.width),
                 bottom: Math.min(r.y + r.height, v.y + v.height) };
    });
    await page.mouse.click(canvasRect.right - 20, canvasRect.bottom - 12);
    await page.waitForTimeout(200);
    const l6 = await page.evaluate((id) => {
        const it = window.PS_SHELL.chart().items.find(i => i.id === id);
        const elT = document.querySelector(
            '#ps-lcanvas .ps-litem[data-item-id="' + id + '"] .ps-ltext');
        return { text: it.text, shown: elT ? elT.textContent : null };
    }, textId);
    ok(l6.text === 'Figure 1. Dose response.' && l6.shown === l6.text,
       'double-click edit commits on a background click');
    // Delete key removes the selected item.
    const rDel = await itemRect(textId);
    await page.mouse.click(rDel.x + 8, rDel.y + 6);
    await page.waitForTimeout(150);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(150);
    const l7 = await page.evaluate((id) => ({
        gone: !window.PS_SHELL.chart().items.some(i => i.id === id),
        n: window.PS_SHELL.chart().items.length
    }), textId);
    ok(l7.gone && l7.n === 4, 'Delete removes the selected item');
    // Capture the project file BEFORE the reload checks.
    const layoutFile = await page.evaluate(() => window.PS_SHELL.projectFileText());
    const fsL = await import('node:fs');
    fsL.writeFileSync('/tmp/ps-layout.pand', layoutFile);
    // Reload: snapshots are session-only, so the layout must re-render
    // its charts offscreen and repaint the panels.
    await page.reload();
    await page.waitForTimeout(1200);
    const l8 = await page.evaluate(() => {
        const c = window.PS_SHELL.chart();
        const panels = Array.from(document.querySelectorAll(
            '#ps-lcanvas .ps-litem[data-kind="chart"]'));
        return { type: c.type, items: c.items.length,
                 panels: panels.length,
                 svgs: panels.map(p => !!p.querySelector('svg')),
                 parked: document.getElementById('psroot').classList.contains('ps-offscreen'),
                 snaps: window.PS_SHELL.snapshots().sort() };
    });
    ok(l8.type === 'layout' && l8.items === 4 && l8.panels === 2,
       'layout tab restores from localStorage');
    ok(l8.svgs.every(Boolean) && JSON.stringify(l8.snaps) === '["c1","c2"]',
       'reload re-captures chart snapshots offscreen');
    ok(l8.parked, 'engine host stays parked after the ensure pass');
    // Switching back to a chart un-parks the engine. M4g scopes the tab
    // strip per workspace, so enter Charts first (c1's tab lives there).
    await page.click('[data-ps-workspace="chart"]');
    await page.waitForTimeout(300);
    await page.click('.ps-tab[data-chart-id="c1"]');
    await page.waitForTimeout(400);
    const l9 = await page.evaluate(() => ({
        parked: document.getElementById('psroot').classList.contains('ps-offscreen'),
        bars: document.querySelectorAll('[data-bar-cat]').length > 0
    }));
    ok(!l9.parked && l9.bars, 'chart tabs still render live after a layout visit');
    // The .pand file restores the whole layout in a fresh session,
    // and the label counter keeps going (C next).
    const ctxL = await newTestContext();
    const pageL = await ctxL.newPage();
    await pageL.goto(PAGE);
    await pageL.waitForTimeout(400);
    await pageL.click('#ps-welcome-new');
    await pageL.waitForTimeout(200);
    await pageL.setInputFiles('#ps-file', '/tmp/ps-layout.pand');
    await pageL.waitForTimeout(1200);
    await pageL.click('#ps-laddlabel');
    await pageL.waitForTimeout(200);
    const l10 = await pageL.evaluate(() => {
        const c = window.PS_SHELL.chart();
        const panels = Array.from(document.querySelectorAll(
            '#ps-lcanvas .ps-litem[data-kind="chart"]'));
        const texts = c.items.filter(i => i.kind === 'text').map(i => i.text);
        return { type: c.type, panels: panels.length,
                 svgs: panels.map(p => !!p.querySelector('svg')), texts };
    });
    ok(l10.type === 'layout' && l10.panels === 2 && l10.svgs.every(Boolean),
       '.pand round trip restores the layout with live snapshots');
    ok(JSON.stringify(l10.texts) === '["A","B","C"]',
       'the panel-label counter rides the project file');
    await ctxL.close();
}

// ---------------------------------------------------------------- standalone export
{
    console.log('case 21: standalone chart + layout export');
    async function mockExportWriter() {
        await page.evaluate(() => {
            window.__psExportWritten = null;
            Object.defineProperty(window, 'showSaveFilePicker', {
                configurable: true,
                value: async (opts) => ({
                    createWritable: async () => ({
                        write: async (blob) => {
                            const bytes = new Uint8Array(await blob.arrayBuffer());
                            const pdfDataUrl = blob.type === 'application/pdf'
                                ? await new Promise((resolve, reject) => {
                                    const r = new FileReader();
                                    r.onload = () => resolve(String(r.result || ''));
                                    r.onerror = () => reject(r.error);
                                    r.readAsDataURL(blob);
                                })
                                : '';
                            window.__psExportWritten = {
                                name: opts.suggestedName,
                                type: blob.type,
                                size: blob.size,
                                head: Array.from(bytes.slice(0, 12)),
                                pdfAscii: blob.type === 'application/pdf'
                                    ? Array.from(bytes).map(b =>
                                        b >= 32 && b <= 126
                                            ? String.fromCharCode(b) : ' ').join('')
                                    : '',
                                pdfBase64: pdfDataUrl
                                    ? pdfDataUrl.substring(pdfDataUrl.indexOf(',') + 1) : '',
                                text: blob.type.indexOf('svg') !== -1
                                    ? await blob.text() : ''
                            };
                        },
                        close: async () => {}
                    })
                })
            });
        });
    }
    async function waitForExport() {
        await page.waitForFunction(() => !!window.__psExportWritten);
        return await page.evaluate(() => window.__psExportWritten);
    }
    async function chooseExportFormat(format) {
        await page.click(
            'label.ps-export-format:has(input[value="' + format + '"]) span');
    }
    async function openChartExporter() {
        await page.click('#ps-export');
    }

    await page.click('.ps-tab[data-chart-id="c1"]');
    await page.waitForTimeout(350);
    await mockExportWriter();
    await openChartExporter();
    await page.waitForTimeout(50);
    const e0 = await page.evaluate(() => ({
        shown: document.getElementById('ps-exporter').style.display,
        role: document.getElementById('ps-exporter').getAttribute('role'),
        title: document.getElementById('ps-export-title').textContent,
        focused: document.activeElement && document.activeElement.id
    }));
    ok(e0.shown === 'flex' && e0.role === 'dialog' && e0.title === 'Export chart',
       'export opens as a labelled modal dialog');
    ok(e0.focused === 'ps-export-name', 'export moves focus to the filename');
    await chooseExportFormat('svg');
    await page.fill('#ps-export-name', 'Dose response');
    await page.selectOption('#ps-export-bg', 'white');
    await page.click('#ps-export-go');
    const e1 = await waitForExport();
    ok(e1.name === 'Dose response.svg' && e1.type.indexOf('image/svg+xml') === 0,
       'chart SVG uses the chosen filename and MIME type');
    ok(e1.text.includes('Control') && e1.text.includes('High dose') &&
       e1.text.includes('data-ps-export-background="1"'),
       'chart SVG carries chart content + selected background');
    ok(!e1.text.includes('data-role="selection-group"') &&
       !e1.text.includes('data-role="inspector-indicator"'),
       'chart SVG strips editing chrome');

    await mockExportWriter();
    await openChartExporter();
    await chooseExportFormat('png');
    await page.selectOption('#ps-export-dpi', '96');
    await page.fill('#ps-export-name', 'Dose response raster');
    await page.click('#ps-export-go');
    const e2 = await waitForExport();
    ok(e2.name === 'Dose response raster.png' && e2.type === 'image/png',
       'PNG export writes a PNG file');
    ok(JSON.stringify(e2.head.slice(0, 8)) === '[137,80,78,71,13,10,26,10]' &&
       e2.size > 1000, 'PNG export has a valid signature + painted bytes');

    await mockExportWriter();
    await openChartExporter();
    await chooseExportFormat('pdf');
    const pdfUi = await page.evaluate(() => ({
        dpiDisabled: document.getElementById('ps-export-dpi').disabled,
        note: document.getElementById('ps-export-dims').textContent
    }));
    ok(pdfUi.dpiDisabled && pdfUi.note.includes('vector PDF') &&
       pdfUi.note.includes('sharp at any size'),
       'PDF is presented as resolution-independent vector output');
    await page.fill('#ps-export-name', 'Dose response print');
    await page.click('#ps-export-go');
    const e3 = await waitForExport();
    ok(e3.name === 'Dose response print.pdf' && e3.type === 'application/pdf',
       'PDF export writes a PDF file');
    ok(String.fromCharCode(...e3.head.slice(0, 4)) === '%PDF',
       'PDF export has a valid PDF header');
    ok(!e3.pdfAscii.includes('/Subtype /Image') &&
       !e3.pdfAscii.includes('/DCTDecode'),
       'ordinary chart PDF contains vector drawing commands, not a page image');
    const fsPdf = await import('node:fs');
    fsPdf.writeFileSync('/tmp/ps-standalone-export.pdf',
        Buffer.from(e3.pdfBase64, 'base64'));

    const layoutId = await page.evaluate(() =>
        window.PS_SHELL.charts().find(c => c.type === 'layout').id);
    // M4g: layout tabs live in the Layouts workspace strip.
    await page.click('[data-ps-workspace="layout"]');
    await page.waitForTimeout(300);
    await page.click('.ps-tab[data-chart-id="' + layoutId + '"]');
    await page.waitForTimeout(700);
    await page.selectOption('#ps-lpage', 'wide');
    await page.waitForTimeout(150);
    await mockExportWriter();
    await page.click('#ps-export');
    await chooseExportFormat('svg');
    await page.selectOption('#ps-export-bg', 'white');
    await page.fill('#ps-export-name', 'Complete figure');
    await page.click('#ps-export-go');
    const e4 = await waitForExport();
    const nestedCount = (e4.text.match(/<svg/g) || []).length;
    ok(e4.name === 'Complete figure.svg' &&
       e4.text.includes('viewBox="0 0 1152 648"'),
       'layout SVG uses the selected presentation page geometry');
    ok(nestedCount >= 3 && e4.text.includes('>A<') && e4.text.includes('>B<'),
       'layout SVG combines both chart panels and panel labels');

    await mockExportWriter();
    await page.click('#ps-export');
    await chooseExportFormat('pdf');
    await page.fill('#ps-export-name', 'Complete figure print');
    await page.click('#ps-export-go');
    const eLayoutPdf = await waitForExport();
    ok(eLayoutPdf.name === 'Complete figure print.pdf' &&
       eLayoutPdf.type === 'application/pdf' &&
       !eLayoutPdf.pdfAscii.includes('/Subtype /Image'),
       'layout PDF keeps both chart panels as vector content');
    fsPdf.writeFileSync('/tmp/ps-standalone-layout-export.pdf',
        Buffer.from(eLayoutPdf.pdfBase64, 'base64'));

    await page.click('#ps-export');
    await chooseExportFormat('png');
    await page.selectOption('#ps-export-dpi', '600');
    const eLimit = await page.evaluate(() => ({
        disabled: document.getElementById('ps-export-go').disabled,
        note: document.getElementById('ps-export-dims').textContent
    }));
    ok(eLimit.disabled && eLimit.note.includes('too large'),
       'oversized raster export is blocked with a clear explanation');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(50);
    ok(await page.evaluate(() =>
        document.getElementById('ps-exporter').style.display === 'none'),
       'Escape closes the export dialog');

    const e5 = await page.evaluate(async () => {
        const blob = await window.PS_SHELL.exportBlob('jpg', 96, 'white');
        const bytes = new Uint8Array(await blob.arrayBuffer());
        return { type: blob.type, size: blob.size, head: Array.from(bytes.slice(0, 2)) };
    });
    ok(e5.type === 'image/jpeg' && e5.head[0] === 255 && e5.head[1] === 216 &&
       e5.size > 1000, 'JPG export has a valid JPEG signature + painted bytes');

    await page.evaluate(() => window.PS_SHELL.addChart());
    await page.waitForTimeout(250);
    const e6 = await page.evaluate(async () => {
        try {
            await window.PS_SHELL.exportBlob('svg', 96, 'white');
            return '';
        } catch (e) {
            return String(e && e.message || e);
        }
    });
    ok(e6.includes('Assign the required variables'),
       'an unconfigured chart cannot export a stale previous chart');
}

ok(errors.length === 0, 'zero page errors' + (errors.length ? ': ' + errors[0] : ''));
await browser.close();
console.log(failures === 0 ? 'M1 SHELL PASS' : 'M1 SHELL: ' + failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
