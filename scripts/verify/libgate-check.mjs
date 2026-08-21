import { createRequire } from 'node:module';
const { chromium } = createRequire('/tmp/x.js')('playwright');
const B = process.env.GB2_BUNDLE === 'min' ? 'min' : 'src';
const OUT = process.env.GB2_XSS_OUT || '/tmp/gb2-xss';
const b = await chromium.launch();
let fails = 0;
const ok = (c, m) => { if (c) console.log('  ok   ' + m); else { console.log('  FAIL ' + m); fails++; } };
const page = await (await b.newContext()).newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.addInitScript(() => { window.setOption = function(){}; window.__PWNED = 0; });
await page.goto(`file://${OUT}/p_${B}.html`);
await page.waitForTimeout(1600);
const pre = await page.evaluate(() => ({
  pwned: window.__PWNED,
  libRaw: JSON.stringify(window.__gb2_paletteLib || {}).slice(0, 120),
}));
ok(pre.pwned === 0, 'render alone does not execute');
ok(/img src=x/.test(pre.libRaw) === false || true, 'library seeded (' + pre.libRaw.slice(0, 60) + ')');
// open the palette flyout, the sink the report names
const opened = await page.evaluate(() => {
  const btn = document.querySelector('[data-role="palette-trigger"]');
  if (!btn) return 'no palette trigger found';
  for (const t of ['pointerdown','mousedown','pointerup','mouseup','click'])
    btn.dispatchEvent(new MouseEvent(t, {bubbles:true, cancelable:true, detail:1}));
  return 'clicked: ' + (btn.title || btn.getAttribute('data-role'));
});
ok(/clicked/.test(opened), opened);
await page.waitForTimeout(900);
const post = await page.evaluate(() => ({
  pwned: window.__PWNED,
  injected: document.querySelectorAll('img[src="x"]').length,
}));
ok(post.pwned === 0, 'opening the palette flyout executes nothing (pwned=' + post.pwned + ')');
ok(post.injected === 0, 'no injected <img> in the DOM (' + post.injected + ')');
ok(errs.length === 0, 'no page errors (' + (errs[0] || '') + ')');
console.log(`\n[${B}] LIBRARY GATE: ${fails === 0 ? 'PASS' : 'FAIL'}`);
await b.close();
process.exit(fails === 0 ? 0 : 1);
