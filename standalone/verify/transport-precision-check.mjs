// Original-observation precision through standalone and real R-host HTML.
// Generate fixtures with transport-precision.R first. PS_TRANSPORT_HOST=jamovi
// reads those HTML files; otherwise PS_PAGE selects source/portable/website.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { chromium } = createRequire('/private/tmp/x.js')('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = process.argv[2] || '/tmp/pandion-transport-precision';
const refs = JSON.parse(fs.readFileSync(path.join(dir, 'expected.json'), 'utf8'));
const jamovi = process.env.PS_TRANSPORT_HOST === 'jamovi';
let checks = 0;
function same(a, b, label) { assert.deepEqual(a, b, label); checks++; }
function near(a, b, label) {
  assert.ok(Number.isFinite(a) && Math.abs(a - b) <= 3e-13 * Math.abs(b) + Number.MIN_VALUE,
    label + ': ' + a + ' vs R ' + b); checks++;
}
// Parse R's exact hexadecimal representation independently of its JSON
// formatter. This covers tiny/huge values, 17-digit decimals and both signs.
function hexDouble(s) {
  const m = s.match(/^(-?)0x([0-9a-f]+)(?:\.([0-9a-f]+))?p([+-]?\d+)$/i);
  assert.ok(m, 'valid R hex double: ' + s);
  const frac = m[3] || '';
  return (m[1] ? -1 : 1) * (Number('0x' + m[2] + frac) / 16 ** frac.length) * 2 ** Number(m[4]);
}
const wire = JSON.parse(fs.readFileSync(path.join(dir, 'wire.json'), 'utf8')).bars[0].values;
same(wire.length, refs.hex.length, 'wire shape');
wire.forEach((v, i) => same(v, hexDouble(refs.hex[i]), 'R -> JSON -> JS exact double ' + i));

const browser = await chromium.launch();
try {
  for (const [name, cs] of Object.entries(refs.cases)) {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.goto(pathToFileURL(jamovi ? path.join(dir, name + '.html') :
      path.resolve(root, process.env.PS_PAGE || 'standalone/index.html')).href);
    if (!jamovi) {
      await page.waitForFunction(() => !!window.PS_SHELL);
      if (await page.locator('#ps-welcome').isVisible())
        await page.locator('#ps-welcome-blank, #ps-welcome-close').first().click();
      await page.evaluate(cs => {
        const S = window.PS_SHELL;
        const types = Object.fromEntries(cs.header.map(c => [c, c === 'g' ? 'nominal' : 'continuous']));
        S.loadTable('transport', cs.header, cs.rows, types);
        S.setModule(cs.module); S.setRoles(cs.module, cs.roles);
      }, cs);
    }
    await page.waitForFunction(() => !!window.gb2_undo?.getData());
    await page.waitForTimeout(600);
    const data = await page.evaluate(() => window.gb2_undo.getData());
    const column = c => cs.rows.map(r => Number(r[cs.header.indexOf(c)]));
    if (cs.module === 'xyplotbuilder') {
      // The renderer expands the parallel wire arrays into point objects.
      same(Array.isArray(data.xyPoints) ? data.xyPoints.map(p => p.x) : data.xyPoints.xs,
        column('t1'), name + ' x observations');
      same(Array.isArray(data.xyPoints) ? data.xyPoints.map(p => p.y) : data.xyPoints.ys,
        column('t2'), name + ' y observations');
    } else if (cs.module === 'corrplotbuilder') {
      same(data.corrRaw, [column('t1'), column('t2')], name + ' raw matrix');
    } else if (cs.module === 'rmplotbuilder') {
      for (const c of ['t1', 't2'])
        same(data.bars.find(b => b.x === c)?.values, column(c), name + ' paired ' + c);
    } else {
      for (const g of ['A', 'B']) {
        const bar = data.bars.find(b => cs.module === 'plotbuilder' ? b.x === g : b.group === g);
        same(bar?.values, cs.rows.filter(r => r[0] === g).map(r => Number(r[1])), name + ' raw ' + g);
        if (cs.summaries) {
          near(bar.mean, cs.summaries[g].mean, name + ' center ' + g);
          near(bar.se, cs.summaries[g].se, name + ' error bar ' + g);
        }
      }
    }
    if (cs.summaries) {
      await page.locator('button[aria-label="Statistics"]').click();
      await page.getByRole('button', { name: 'Descriptives', exact: true }).click();
      const table = await page.evaluate(() => {
        const pane = [...document.querySelectorAll('[data-st-pane]')].find(p => p.offsetParent && /MEAN/i.test(p.innerText));
        return pane && [...pane.querySelectorAll('tr')].map(r => [...r.querySelectorAll('td,th')].map(c => c.innerText));
      });
      assert.ok(table, name + ' descriptives table'); checks++;
      for (const g of ['A', 'B']) {
        const row = table.find(r => r[0] === g);
        assert.ok(row, name + ' descriptives row ' + g); checks++;
        for (const [label, key] of [['MEAN', 'mean'], ['SD', 'sd'], ['SE', 'se']]) {
          const shown = row[table[0].findIndex(h => h.toUpperCase() === label)];
          assert.ok(shown !== undefined && Math.abs(Number(shown) - cs.summaries[g][key]) <= 0.00501,
            name + ' displayed ' + g + ' ' + label + ': ' + shown); checks++;
        }
      }
      // Preview median/mean/SD, then apply the real R/standalone authoritative
      // payload twice. Values must survive and the second echo must settle.
      const echo = await page.evaluate(original => {
        const d = JSON.parse(JSON.stringify(original));
        d.summaryFunc = 'median';
        window.__gb2_statFold(d, { summaryFunc: 'median' }, d.errorBarType);
        d.summaryFunc = 'mean'; d.errorBarType = 'sd';
        window.__gb2_statFold(d, { summaryFunc: 'mean', errorBarType: 'sd' }, 'se');
        const folded = d.bars.map(b => ({ mean: b.mean, sd: b.se, values: b.values }));
        const host = document.querySelector('.graphbuilder2-host');
        const opts = window.__gb2_panelOptions; window.__gb2_panelOptions = null;
        window.GraphBuilder2.render(host.id, JSON.parse(JSON.stringify(original)));
        const hash = window.__gb2_lastRenderedHash;
        window.GraphBuilder2.render(host.id, JSON.parse(JSON.stringify(original)));
        const stable = hash === window.__gb2_lastRenderedHash;
        window.__gb2_panelOptions = opts;
        return { folded, stable, bars: window.gb2_undo.getData().bars };
      }, data);
      for (let i = 0; i < data.bars.length; i++) {
        const ref = cs.summaries[data.bars[i].x];
        near(echo.folded[i].mean, ref.mean, name + ' preview center');
        near(echo.folded[i].sd, ref.sd, name + ' preview SD');
        same(echo.folded[i].values, data.bars[i].values, name + ' preview observations');
        same(echo.bars[i].values, data.bars[i].values, name + ' echoed observations');
      }
      same(echo.stable, true, name + ' repeated authoritative echo settles');
    }
    same(errors, [], name + ' no page errors');
    await page.close();
    console.log('  ok ' + name);
  }
  console.log('TRANSPORT PRECISION PASS (' + checks + ' checks; ' + (jamovi ? 'Jamovi R host' : 'standalone') + ')');
} finally { await browser.close(); }
