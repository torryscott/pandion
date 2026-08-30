// corpus-freeze.mjs - write ONE new frozen entry into the persistence
// corpus (standalone/verify/corpus/): a .pand project built through the
// real app plus an .expect.json of the values it must still produce
// when any FUTURE version opens it. Entries are named by app version
// and freeze date and are NEVER regenerated - that is the point: the
// corpus is the set of real old bytes the compatibility gate
// (corpus-compat-check.mjs) opens forever. prepare-release.sh runs
// this so every release adds its own entry.
// Usage: node corpus-freeze.mjs [label]   (PS_PAGE overrides the page)
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
const { chromium } = createRequire('/private/tmp/x.js')('playwright');

const HERE = path.resolve(new URL('.', import.meta.url).pathname);
const PAGE = process.env.PS_PAGE || path.resolve(HERE, '..', 'index.html');
const CORPUS = path.join(HERE, 'corpus');
fs.mkdirSync(CORPUS, { recursive: true });

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 950 } });
await page.goto('file://' + path.resolve(PAGE));
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible().catch(() => false)) {
  try { await page.locator('#ps-welcome-blank, #ps-welcome-close').first().click({ timeout: 1500 }); } catch (e) {}
  await page.waitForTimeout(300);
}

// A deterministic project touching the surfaces that must survive:
// mixed column types, three chart modules, styled options, computed
// variables (ROUND included - the live example of a semantics change),
// and a cell exclusion.
const built = await page.evaluate(async () => {
  const s = ms => new Promise(r => setTimeout(r, ms));
  const S = window.PS_SHELL;
  const rows = [
    ['ctrl', 2.5, 3, 1, 2, 3], ['ctrl', -1.5, 0, 2, 3, 2],
    ['ctrl', 4.25, -7, 3, 1, 4], ['ctrl', 0.35, 12, 4, 5, 5],
    ['treat', 2.675, 5, 5, 4, 1], ['treat', 6.5, 8, 1, 2, 2],
    ['treat', 3.125, -2, 2, 3, 3], ['treat', 5.75, 9, 3, 4, 4],
    ['treat', 1.5, 4, 4, 5, 5], ['treat', 7.25, 6, 5, 1, 1]
  ];
  S.loadTable('corpus', ['group', 'a', 'b', 'q1', 'q2', 'q3'], rows, {
    group: 'nominal', a: 'continuous', b: 'continuous',
    q1: 'nominal', q2: 'nominal', q3: 'nominal'
  });
  S.setModule('plotbuilder');
  S.setRoles('plotbuilder', { xvar: 'group', yvar: 'a' });
  await s(1200);
  window.setOption('barCornerRadius', 30);
  window.setOption('chartTitle', 'Frozen bar');
  await s(600);
  S.addChart();
  await s(400);
  S.setModule('xyplotbuilder');
  S.setRoles('xyplotbuilder', { xvar: 'a', yvar: 'b' });
  await s(1200);
  window.setOption('xyShowEllipse', true);
  await s(800);
  S.addChart();
  await s(400);
  S.setModule('likertplotbuilder');
  S.setRoles('likertplotbuilder', { items: ['q1', 'q2', 'q3'] });
  await s(1200);
  S.saveComputedColumn('zsc', '(a - VMEAN(a)) / VSD(a)');
  S.saveComputedColumn('rnd', 'ROUND(a, 1)');
  S.saveComputedColumn('m', 'MEAN(a, b, ignore_missing = 1)');
  await s(400);
  S.setExcluded('a', 2, true);
  await s(800);
  const t = S.project.table;
  const col = c => t.raw[c].slice(0, 6).map(v => v == null ? null : String(v));
  const charts = [];
  for (const ch of S.charts()) {
    S.switchChart(ch.id || ch);
    await new Promise(r => setTimeout(r, 700));
    const d = window.gb2_undo && window.gb2_undo.getData();
    charts.push({
      module: (S.project.activeModule || (ch.module || '')) + '',
      graphType: d ? d.graphType : null,
      probe: d ? { barCornerRadius: d.barCornerRadius,
                   xyShowEllipse: d.xyShowEllipse === true,
                   chartTitle: d.chartTitle || '' } : null
    });
  }
  return {
    text: S.projectText(),
    expect: {
      types: Object.assign({}, t.types),
      rnd: col('rnd'), zsc: col('zsc'), m: col('m'),
      excluded_a2: true,
      chartCount: S.charts().length,
      charts
    }
  };
});
await b.close();

const appVersion = (built.text.match(/"appVersion":\s*"([^"]+)"/) || [])[1] || 'unknown';
let sha = 'unknown';
try { sha = execSync('git rev-parse --short HEAD', { cwd: HERE, encoding: 'utf8' }).trim(); } catch (e) {}
const label = process.argv[2] || 'core';
const stamp = new Date().toISOString().slice(0, 10);
const base = 'v' + appVersion + '-' + stamp + '-' + label;
const pandPath = path.join(CORPUS, base + '.pand');
if (fs.existsSync(pandPath)) {
  console.log('corpus entry already exists, refusing to overwrite: ' + base);
  process.exit(1);
}
fs.writeFileSync(pandPath, built.text);
fs.writeFileSync(path.join(CORPUS, base + '.expect.json'), JSON.stringify({
  frozenAt: new Date().toISOString(), app: appVersion, gitSha: sha,
  expect: built.expect
}, null, 2));
console.log('froze ' + base + ' (' + built.text.length + ' bytes, ' +
  built.expect.chartCount + ' charts, sha ' + sha + ')');
