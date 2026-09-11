// corr-decimals-label-check.mjs - the correlation Values tab's Decimals
// control names its scope. It governs the coefficient only: p prints at
// a fixed three decimals with "< .001" below that on every surface (the
// APA and jamovi convention, convention 19), and the bare word
// "Decimals" beside cells that print both r and p read as a control
// that did nothing for p (Torry, Sep 2026). So the label is "Decimals
// (r)" with a tooltip saying why p does not follow, on the heatmap and
// on the numbers matrix, and the behavior it describes is pinned here:
// r follows the control at 1 and 3 decimals while p stays at three.
import { createRequire } from 'node:module';
import path from 'node:path';
const { chromium } = createRequire('/private/tmp/x.js')('playwright');

const HERE = path.resolve(new URL('.', import.meta.url).pathname);
const PAGE = path.resolve(process.env.PS_PAGE || path.resolve(HERE, '..', 'index.html'));
let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) { pass++; }
  else { fail++; console.log('  FAIL ' + label); }
};

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 950 } });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
// The first-run click-to-edit coach toast sits over the chart and
// intercepts the cell click; mark it seen before the page loads.
await page.addInitScript(() => {
  try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); } catch (e) {}
});
await page.goto('file://' + PAGE);
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible().catch(() => false)) {
  try { await page.locator('#ps-welcome-blank, #ps-welcome-close').first().click({ timeout: 1500 }); } catch (e) {}
  await page.waitForTimeout(300);
}

await page.evaluate(async () => {
  const s = ms => new Promise(r => setTimeout(r, ms));
  let seed = 11; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const rows = [];
  for (let i = 0; i < 30; i++) {
    const a = rnd(); rows.push([a, 0.6 * a + 0.4 * rnd(), 0.2 * a + 0.8 * rnd()]);
  }
  const S = window.PS_SHELL;
  S.loadTable('dl', ['a', 'b', 'c'], rows, { a: 'continuous', b: 'continuous', c: 'continuous' });
  S.setModule('corrplotbuilder');
  S.setRoles('corrplotbuilder', { vars: ['a', 'b', 'c'] });
  await s(1500);
  window.setOption('corrShowValues', true);
  window.setOption('corrValueContent', 'rp');
  await s(1800);
});

// The Values tab of the cells panel: a corner click on a cell's hit rect
// (a center click lands on the value text and routes to the text panel),
// then the tab.
async function openValuesTab() {
  const has = await page.evaluate(() =>
    !![...document.querySelectorAll('.graphbuilder2-host span')]
      .find(el => !el.closest('svg') && !el.children.length && /^Decimals/.test((el.textContent || '').trim()) && el.offsetParent));
  if (has) return true;
  const cell = page.locator('.graphbuilder2-host svg [data-role="corr-cell"]').first();
  const box = await cell.boundingBox();
  if (!box) return false;
  await page.mouse.click(box.x + 3, box.y + 3);
  await page.waitForTimeout(500);
  const tab = page.locator('.graphbuilder2-host button', { hasText: /^Values$/ }).first();
  if (await tab.count()) { await tab.click(); await page.waitForTimeout(400); }
  return page.evaluate(() =>
    !![...document.querySelectorAll('.graphbuilder2-host span')]
      .find(el => !el.closest('svg') && !el.children.length && /^Decimals/.test((el.textContent || '').trim()) && el.offsetParent));
}
const readLabel = () => page.evaluate(() => {
  const el = [...document.querySelectorAll('.graphbuilder2-host span')]
    .find(x => !x.closest('svg') && !x.children.length && /^Decimals/.test((x.textContent || '').trim()) && x.offsetParent);
  return el ? { text: el.textContent.trim(), title: el.getAttribute('title') || '' } : null;
});
const readValues = () => page.evaluate(() => ({
  r: [...document.querySelectorAll('.graphbuilder2-host svg [data-role="corr-value"]')].map(t => t.textContent.trim()),
  p: [...document.querySelectorAll('.graphbuilder2-host svg [data-role="corr-value-p"]')].map(t => t.textContent.trim())
}));

console.log('case 1: heatmap Values tab label');
ok(await openValuesTab(), 'the Values tab opens on the heatmap');
let lbl = await readLabel();
ok(!!lbl && lbl.text === 'Decimals (r)', 'the control is labeled "Decimals (r)" (got ' + JSON.stringify(lbl) + ')');
ok(!!lbl && /three decimals/.test(lbl.title) && /APA/.test(lbl.title) && /do not follow/.test(lbl.title),
  'its tooltip says p prints at three decimals by the APA convention and does not follow the control');

console.log('case 2: r follows the control, p stays at three decimals');
const decRe = d => new RegExp('^(-?\\d*\\.\\d{' + d + '}|1(\\.0+)?|\\u2014)$');
// in-cell p reads "p=.131" / "p<.001" (bare ".131" / "<.001" in p-only mode)
const pRe = /^(p\s*)?[=<]?\s*(<\s*)?\.\d{3}$|^—$/;
for (const d of [1, 3]) {
  await page.evaluate(async (d) => { window.setOption('corrDecimals', d); await new Promise(r => setTimeout(r, 1800)); }, d);
  const v = await readValues();
  ok(v.r.length >= 3 && v.r.every(t => decRe(d).test(t)),
    'decimals ' + d + ': every r text has ' + d + ' decimal(s) (' + v.r.join(' ') + ')');
  ok(v.p.length >= 3 && v.p.every(t => pRe.test(t)),
    'decimals ' + d + ': every p text stays at three decimals (' + v.p.join(' ') + ')');
}

console.log('case 3: numbers matrix carries the same label');
await page.evaluate(async () => { window.setOption('graphType', 'corrnumbers'); await new Promise(r => setTimeout(r, 2000)); });
ok(await openValuesTab(), 'the Values tab opens on the numbers matrix');
lbl = await readLabel();
ok(!!lbl && lbl.text === 'Decimals (r)' && /three decimals/.test(lbl.title),
  'numbers matrix: "Decimals (r)" with the same tooltip (got ' + JSON.stringify(lbl) + ')');
const vn = await readValues();
ok(vn.r.length >= 3 && vn.r.every(t => decRe(3).test(t)) && vn.p.every(t => pRe.test(t)),
  'numbers matrix at 3 decimals: r at three, p at three (' + vn.r.join(' ') + ' | ' + vn.p.join(' ') + ')');

ok(pageErrors.length === 0, 'no page errors (' + pageErrors.slice(0, 2).join(' | ') + ')');
console.log((fail === 0 ? 'CORR DECIMALS LABEL CHECK PASS' : 'CORR DECIMALS LABEL CHECK FAIL') +
  ' (' + pass + ' ok, ' + fail + ' failing)');
await b.close();
process.exit(fail === 0 ? 0 : 1);
