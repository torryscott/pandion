// UX-02: independent fixture counts, asserted on the status users read.
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
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('file://' + path.resolve(process.env.PS_PAGE || 'standalone/index.html'));
  await page.waitForFunction(() => !!window.PS_SHELL);
  if (await page.locator('#ps-welcome').isVisible()) await page.locator('#ps-welcome-close').click();
  const rows = Array.from({ length: 8 }, (_, i) => [String(10 + i), String(20 + i), i % 2 ? 'B' : 'A', i < 4 ? 'North' : 'South']);
  async function fixture(data, roles = { measures: ['Before', 'After'] }) {
    await page.evaluate(({ data, roles }) => {
      const S = window.PS_SHELL;
      S.loadTable('case count audit', ['Before', 'After', 'Group', 'Site'], data,
        { Before: 'continuous', After: 'continuous', Group: 'nominal', Site: 'nominal' });
      S.setModule('rmplotbuilder'); S.setRoles('rmplotbuilder', roles); S.setWorkspace('chart');
    }, { data, roles });
  }
  async function status(label, cases, conditions, measurements, complete = cases) {
    const want = `${cases} case${cases === 1 ? '' : 's'} · ${conditions} condition${conditions === 1 ? '' : 's'}`;
    // Render completion is asynchronous, notably for exclusion commands.
    // Still report the actual status on failure instead of only a timeout.
    const tokens = [want, `${measurements} measurement${measurements === 1 ? '' : 's'}`];
    if (complete < cases && conditions > 1) tokens.push(`${complete} complete case${complete === 1 ? '' : 's'}`);
    await page.waitForFunction(tokens => {
      const text = document.getElementById('ps-status-selection').textContent;
      return tokens.every(t => text.includes(t));
    }, tokens, { timeout: 5000 }).catch(() => {});
    const text = await page.locator('#ps-status-selection').textContent();
    assert.ok(text.startsWith(want), `${label}: expected ${want}, read ${text}`);
    assert.ok(text.includes(`${measurements} measurement${measurements === 1 ? '' : 's'}`), label + ': measurements: ' + text); checks++;
    if (complete < cases && conditions > 1) {
      assert.ok(text.includes(`${complete} complete case${complete === 1 ? '' : 's'}`), label + ': complete cases'); checks++;
    }
    checks++;
    console.log(`  ok ${label}: ${text}`);
  }
  await fixture(rows);
  await status('eight people measured twice', 8, 2, 16);
  if (process.env.PS_UX_EVIDENCE) {
    await fs.mkdir(process.env.PS_UX_EVIDENCE, { recursive: true });
    await page.screenshot({ path: path.join(process.env.PS_UX_EVIDENCE, 'repeated-case-count-fixed.png') });
  }
  const incomplete = structuredClone(rows);
  incomplete[0][0] = ''; incomplete[1][1] = '';
  await fixture(incomplete);
  await status('partial observations still count their distinct cases', 8, 2, 14, 6);
  incomplete[2][0] = ''; incomplete[2][1] = '';
  await fixture(incomplete);
  await status('wholly missing case does not enter the chart', 7, 2, 12, 5);
  await fixture(rows, { measures: ['Before', 'After'], betweenVar: 'Group', facetVar: 'Site' });
  await status('groups and panels do not multiply participants', 8, 2, 16);
  await page.evaluate(() => window.PS_SHELL.setFilters([{ col: 'Site', op: 'eq', value: 'North' }]));
  await status('filtered cases', 4, 2, 8);
  await page.evaluate(() => window.PS_SHELL.setExcludedRows([0], true));
  await status('excluded row', 3, 2, 6);
  await page.evaluate(() => window.PS_SHELL.setExcluded('After', 1, true));
  await status('excluded measurement', 3, 2, 5, 2);
  await page.evaluate(() => window.PS_SHELL.setExcluded('Before', 1, true));
  await status('all measurements excluded for one case', 2, 2, 4);
  await page.evaluate(() => window.PS_SHELL.setExcluded('After', 1, false));
  await status('included measurement restores its case', 3, 2, 5, 2);
  await fixture(rows.map(row => ['12', '12', row[2], row[3]]));
  await status('equal numeric values do not merge participants', 8, 2, 16);
  await fixture(rows, { measures: ['Before'] });
  await status('one measurement', 8, 1, 8);
  await fixture([rows[0]], { measures: ['Before'] });
  await status('singular wording', 1, 1, 1);
  await page.evaluate(() => {
    const S = window.PS_SHELL;
    S.loadTable('three occasions', ['Before', 'After', 'Followup'],
      Array.from({ length: 8 }, (_, i) => [String(i), String(i + 10), i === 0 ? '' : String(i + 20)]),
      { Before: 'continuous', After: 'continuous', Followup: 'continuous' });
    S.setRoles('rmplotbuilder', { measures: ['Before', 'After', 'Followup'] });
  });
  await status('three conditions with one missing measurement', 8, 3, 23, 7);
  await page.evaluate(() => window.PS_SHELL.setExcluded('Before', 1, true));
  await status('three conditions with missing and excluded measurements', 8, 3, 22, 6);
  await fixture(rows);
  await page.evaluate(() => {
    const S = window.PS_SHELL;
    S.setModule('plotbuilder'); S.setRoles('plotbuilder', { xvar: 'Group', yvar: 'After' });
  });
  await page.waitForFunction(() => /8 cases.*2 categories/.test(document.getElementById('ps-status-selection').textContent));
  assert.ok(!/measurements/.test(await page.locator('#ps-status-selection').textContent())); checks++;
  assert.deepEqual(errors, []);
  console.log(`CASE COUNT PASS (${checks} checks)`);
} finally { await browser.close(); }
