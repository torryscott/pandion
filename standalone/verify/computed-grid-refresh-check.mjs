// UX-01: exercise real cell commits and inspect the visible grid before any
// workspace change. Reading only PS_SHELL.project missed the stale-cell bug.
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

function loadPlaywright() {
  for (const base of [process.cwd(), new URL('.', import.meta.url).pathname,
                      '/private/tmp', '/tmp']) {
    try { return createRequire(path.join(base, 'probe.js'))('playwright'); }
    catch { /* try the next shared dependency location */ }
  }
  throw new Error('playwright not found');
}
const { chromium } = loadPlaywright();
const browser = await chromium.launch();
let checks = 0;
const values = [13, 14, 18, 20, 12, 15, 17, 19];
const before = [12, 15, 11, 14, 13, 16, 10, 12];
const close = (a, b, label) => {
  assert.ok(Math.abs(a - b) < 1e-10, `${label}: ${a} != ${b}`); checks++;
};
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('file://' + path.resolve(process.env.PS_PAGE || 'standalone/index.html'));
  await page.waitForFunction(() => !!window.PS_SHELL);
  if (await page.locator('#ps-welcome').isVisible()) await page.locator('#ps-welcome-close').click();
  await page.evaluate(({ values, before }) => {
    const S = window.PS_SHELL;
    S.loadTable('computed grid audit', ['Group', 'Before', 'After', 'Site'],
      values.map((v, i) => [i % 2 ? 'B' : 'A', String(before[i]), String(v), i < 4 ? 'North' : 'South']),
      { Group: 'nominal', Before: 'continuous', After: 'continuous', Site: 'nominal' });
    for (const [name, expression] of [['Change', 'After - Before'], ['Twice', 'Change * 2'], ['Centered', 'After - VMEAN(After)']]) {
      const r = S.saveComputedColumn(name, expression);
      if (!r.ok) throw Error(r.error);
    }
    S.setModule('plotbuilder'); S.setRoles('plotbuilder', { xvar: 'Group', yvar: 'Change' });
    S.setWorkspace('data');
  }, { values, before });

  async function verifyGrid(label, expected = values) {
    const measured = expected.filter(v => v != null);
    const mean = measured.reduce((a, b) => a + b, 0) / measured.length;
    const actual = await page.evaluate(() => Array.from(document.querySelectorAll('#ps-datagrid td[data-gc]')).map(td => {
      const ids = (td.getAttribute('aria-labelledby') || '').split(/\s+/);
      const label = ids.map(id => document.getElementById(id)?.textContent || '').join(' ');
      return { col: td.getAttribute('data-gc'), row: Number(td.getAttribute('data-gr')), text: td.textContent, label };
    }));
    for (const col of ['Change', 'Twice', 'Centered']) for (let i = 0; i < expected.length; i++) {
      const wanted = expected[i] == null ? null : col === 'Change' ? expected[i] - before[i]
        : col === 'Twice' ? (expected[i] - before[i]) * 2 : expected[i] - mean;
      const cell = actual.find(c => c.col === col && c.row === i);
      assert.ok(cell, `${label}: ${col} row ${i + 1} exists`);
      if (wanted == null) { assert.equal(cell.text, '\u2014', `${label}: missing ${col} row ${i + 1}`); checks++; }
      else close(Number(cell.text), wanted, `${label}: visible ${col} row ${i + 1}`);
      assert.ok(cell.label.includes(cell.text), `${label}: accessible name uses the displayed value`); checks++;
    }
    console.log('  ok ' + label);
  }
  async function edit(row, value, commit, next) {
    const td = page.locator(`#ps-datagrid td[data-gc="After"][data-gr="${row}"]`);
    await td.dblclick();
    const input = page.locator('.ps-grid-cellinput');
    await input.fill(String(value));
    if (commit === 'blur') await page.locator('#ps-datacard .ps-data-commandbar').click({ position: { x: 5, y: 5 } });
    else await input.press(commit);
    if (next) {
      assert.equal(await page.locator('.ps-grid-cellinput').getAttribute('aria-label'), next, 'next editor retains focus');
      assert.equal(await page.locator('.ps-grid-cellinput').evaluate(e => e === document.activeElement), true); checks += 2;
    }
    values[row] = value;
    await verifyGrid(commit + ' commit');
    await page.keyboard.press('Escape');
  }

  await verifyGrid('initial values');
  await edit(0, 15, 'Enter', 'Edit After, row 2. Current value: 14');
  await edit(1, 16, 'Tab', 'Edit Site, row 2. Current value: North');
  await edit(2, 21, 'blur');

  await page.locator('#ps-data-undo').click(); values[2] = 18;
  await verifyGrid('undo');
  await page.locator('#ps-data-redo').click(); values[2] = 21;
  await verifyGrid('redo');

  // Selection and export consume the same values visible in the grid.
  await page.locator('th[data-grid-col="Change"]').click();
  const copy = await page.evaluate(() => window.PS_SHELL.selectionText());
  const copiedLines = copy.trim().split(/\r?\n/);
  assert.equal(copiedLines[0], 'Change'); checks++;
  assert.deepEqual(copiedLines.slice(1).map(Number), values.map((v, i) => v - before[i])); checks++;
  const sum = values.reduce((s, v, i) => s + v - before[i], 0);
  assert.ok((await page.locator('#ps-grid-stats').textContent()).includes(String(sum))); checks++;
  const saved = await page.evaluate(() => window.PS_SHELL.projectText());
  const exported = JSON.parse(saved);
  assert.deepEqual(exported.project.table.raw.Change.map(Number), values.map((v, i) => v - before[i])); checks++;

  // Excluding an input is another in-place mutation that must refresh formulas.
  await page.locator('td[data-gc="After"][data-gr="1"]').click();
  await page.keyboard.press('ControlOrMeta+e');
  await verifyGrid('excluded source', values.map((v, i) => i === 1 ? null : v));
  await page.keyboard.press('ControlOrMeta+e');
  await verifyGrid('included source');

  // A computed filter can change every cell's dimming after a source edit.
  await page.evaluate(() => window.PS_SHELL.setFilters([{ col: 'Change', op: 'gt', value: '0' }]));
  await edit(0, 10, 'Enter', 'Edit After, row 2. Current value: 16');
  const rowState = await page.evaluate(() => Array.from(document.querySelectorAll('td[data-gr="0"][data-gc]')).map(td => ({
    text: td.textContent, state: (td.getAttribute('aria-describedby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ')
  })));
  assert.ok(rowState.every(c => /active row filter/.test(c.state)), 'every newly filtered cell exposes the new filter state'); checks++;
  const kept = values.filter((v, i) => v - before[i] > 0).length;
  assert.equal((await page.locator('#ps-data-filter-btn').textContent()).trim(), `Filter · ${kept} of 8`); checks++;

  const payload = await page.evaluate(() => window.PS_SHELL.buildPayload());
  assert.deepEqual(payload.bars.flatMap(b => b.values).sort((a, b) => a - b),
    values.map((v, i) => v - before[i]).filter(v => v > 0).sort((a, b) => a - b)); checks++;
  const restored = await page.evaluate(text => window.PS_SHELL.openProjectText(text), saved);
  assert.ok(!restored?.error, 'saved project reopens'); checks++;
  await verifyGrid('reopened saved project', [15, 16, 21, 20, 12, 15, 17, 19]);

  if (process.env.PS_UX_EVIDENCE) {
    await fs.mkdir(process.env.PS_UX_EVIDENCE, { recursive: true });
    await page.screenshot({ path: path.join(process.env.PS_UX_EVIDENCE, 'computed-grid-fixed.png') });
  }

  // Whole-column recalculation in a virtualized grid must update every
  // mounted result without rebuilding the table or jumping to the first row.
  await page.evaluate(() => {
    const S = window.PS_SHELL;
    S.loadTable('long sheet', ['After'], Array.from({ length: 2000 }, (_, i) => [String(i)]), { After: 'continuous' });
    S.saveComputedColumn('Centered', 'After - VMEAN(After)');
    S.setWorkspace('data');
  });
  await page.locator('#ps-datagrid').evaluate(e => { e.scrollTop = 10000; });
  await page.waitForFunction(() => Number(document.querySelector('td[data-gc="After"]')?.getAttribute('data-gr')) > 100);
  const target = await page.evaluate(() => {
    const g = document.getElementById('ps-datagrid').getBoundingClientRect();
    return Array.from(document.querySelectorAll('td[data-gc="After"]')).filter(e => {
      const r = e.getBoundingClientRect(); return r.top > g.top + 100 && r.bottom < g.bottom - 100;
    }).map(e => Number(e.getAttribute('data-gr')))[0];
  });
  assert.ok(Number.isInteger(target));
  await page.locator(`td[data-gc="After"][data-gr="${target}"]`).dblclick();
  const scroll = await page.locator('#ps-datagrid').evaluate(e => e.scrollTop);
  await page.locator('.ps-grid-cellinput').fill(String(target + 10));
  await page.locator('.ps-grid-cellinput').press('Enter');
  assert.ok(Math.abs(await page.locator('#ps-datagrid').evaluate(e => e.scrollTop) - scroll) < 2, 'virtual grid keeps its scroll position'); checks++;
  const mounted = await page.locator('td[data-gc="Centered"]').evaluateAll(cells => cells.map(td => ({ row: Number(td.getAttribute('data-gr')), value: Number(td.textContent) })));
  assert.ok(mounted.length < 2000 && mounted.length > 2, 'virtual window stays bounded'); checks++;
  for (const cell of mounted) close(cell.value, cell.row + (cell.row === target ? 10 : 0) - 999.505, 'mounted whole-column result');
  await page.keyboard.press('Escape');
  await page.locator('#ps-datagrid').evaluate(e => { e.scrollTop = 0; });
  await page.waitForSelector('td[data-gc="Centered"][data-gr="0"]');
  close(Number(await page.locator('td[data-gc="Centered"][data-gr="0"]').textContent()), -999.505, 'newly mounted result');
  console.log('  ok virtualized grid, focus, scroll, and newly mounted results');
  assert.deepEqual(errors, []);
  console.log(`COMPUTED GRID REFRESH PASS (${checks} checks)`);
} finally { await browser.close(); }
