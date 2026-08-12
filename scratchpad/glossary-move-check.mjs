// The glossary lives in-panel everywhere EXCEPT jamovi, where it moved
// to the online user guide (Aug 2026, jamovi's ask: reference content
// this large overwhelmed the results column). Both sides guarded here:
//   1. plain page (the standalone shape): Glossary tab present + opens
//   2. wrapped in a jamovi results element: tab gone, stale session
//      state lands on Basics, and with a userGuidePath the Basics row
//      carries a glossary button that launches guide#glossary
import { createRequire } from 'node:module';
const { chromium } = createRequire('/tmp/x.js')('playwright');
const b = await chromium.launch();
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ok   ' : '  FAIL ') + m); };

const page = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
await page.addInitScript(() => { window.setOption = function () {}; });
await page.goto('file:///tmp/gb2-verify/cg_bar_labels.html');
await page.waitForTimeout(1800);

// ---- 1. plain page: tab present, opens, renders entries ----
const openHelp = () => page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === '?');
  for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
    btn.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true }));
});
await openHelp();
await page.waitForTimeout(400);
const plain = await page.evaluate(() => {
  const tab = document.querySelector('[data-helpnav="glossary"]');
  return { tab: !!tab };
});
ok(plain.tab, 'plain page: Glossary tab present (standalone behavior)');
await page.evaluate(() => {
  const tab = document.querySelector('[data-helpnav="glossary"]');
  for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
    tab.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true }));
});
await page.waitForTimeout(400);
const plainOpen = await page.evaluate(() => {
  const t = document.querySelector('[data-role="inspector-title"]');
  return { title: t ? t.textContent : '', hasEntries: document.body.innerHTML.includes('Common misread') };
});
ok(/Glossary/.test(plainOpen.title), 'plain page: glossary opens (' + plainOpen.title + ')');
ok(plainOpen.hasEntries, 'plain page: entries render');

// ---- 2. wrap in a jamovi results element and re-render ----
// (glossary open state rides __gb2_helpPanelLive across the re-render,
// which is exactly the stale-session case the redirect must catch)
await page.evaluate(() => {
  const host = document.querySelector('.graphbuilder2-host');
  const wrap = document.createElement('jmv-results-svg');
  host.parentNode.insertBefore(wrap, host);
  wrap.appendChild(host);
  window.__gb2_lastRenderedHash = null;
  const s = [...document.scripts].find((x) => /GraphBuilder2\.render\(/.test(x.textContent || ''));
  (0, eval)(s.textContent);
});
await page.waitForTimeout(800);
const wrapped = await page.evaluate(() => {
  const t = document.querySelector('[data-role="inspector-title"]');
  return {
    tab: !!document.querySelector('[data-helpnav="glossary"]'),
    title: t ? t.textContent : '(no panel)',
  };
});
ok(!wrapped.tab, 'jamovi: Glossary tab is GONE');
ok(/Help/.test(wrapped.title), 'jamovi: stale glossary session landed on Basics (' + wrapped.title + ')');

// ---- 3. with a userGuidePath, Basics offers the glossary button ----
await page.evaluate(() => {
  window.__launched = [];
  window.openUrl = undefined;
  window.open = (u) => { window.__launched.push(u); return null; };
  const host = document.querySelector('.graphbuilder2-host');
  window.__gb2_lastRenderedHash = null;
  const s = [...document.scripts].find((x) => /GraphBuilder2\.render\(/.test(x.textContent || ''));
  // patch the payload inline: re-eval with userGuidePath injected
  const txt = s.textContent.replace(/"chartTitle"/, '"userGuidePath":"docs/user-guide.html","chartTitle"');
  (0, eval)(txt);
});
await page.waitForTimeout(800);
await openHelp();
await page.waitForTimeout(400);
const withGuide = await page.evaluate(() => {
  const btn = document.querySelector('[data-role="open-glossary"]');
  if (!btn) return { btn: false };
  for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
    btn.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true }));
  return { btn: true, launched: window.__launched };
});
ok(withGuide.btn, 'jamovi + installed guide: Statistics glossary button present');
ok(withGuide.btn && withGuide.launched.length === 1 &&
   /module\/docs\/user-guide\.html#glossary$/.test(withGuide.launched[0]),
   'button launches the guide at #glossary (' + (withGuide.launched || ['none'])[0] + ')');

// ---- 4. the guide itself carries the generated section ----
import { readFileSync } from 'node:fs';
const guide = readFileSync('/Users/tsdennis/Desktop/plotstudio/docs/user-guide.html', 'utf8');
ok(guide.includes('<h2 id="glossary">'), 'guide: #glossary section exists');
const terms = (guide.match(/class="glossentry"/g) || []).length;
ok(terms >= 100, `guide: ${terms} generated entries`);
ok(guide.includes('GB2-GLOSSARY-START'), 'guide: regeneration markers present');

console.log(`\nVERDICT: ${pass} pass, ${fail} fail => ${fail === 0 ? 'PASS' : 'FAIL'}`);
await b.close();
process.exit(fail === 0 ? 0 : 1);
