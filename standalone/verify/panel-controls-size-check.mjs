// panel-controls-size-check.mjs - the colour controls take a bounded share
// of the panel they are in (Torry, Sep 2026). The HSV picker shipped as a
// fixed 184px column with a 96px gradient and the quick-pick chips were
// floored at 22px, all of which sit cramped inside a panel several times
// that wide. With the host-declared key panelFitControls the engine
// measures the panel and grows them; without it every size is the constant
// it always was, which is jamovi's path.
//
// This replaces rail-controls-check, which tested the same sizing inside a
// right-rail dock that has since been removed.
//
// What it pins:
//   1. in the standalone the picker and its gradient are bigger than the
//      historical constants, and the gradient follows the window height;
//   2. chips only ever GROW from 22px, and adjacent chip centres stay at
//      least 24px apart, which is what carries the target-size guidance by
//      spacing;
//   3. the picker never takes the majority of the panel, since it is docked
//      beside the controls and every pixel it takes comes out of them;
//   4. with the key withheld (jamovi's path) every size is exactly the
//      historical constant - the control that proves the fit cannot leak;
//   5. the removed rail leaves nothing behind: no dock, no preference, no
//      view switch.
// Control: against the pre-change engine case 1 fails (picker 184, sv 96).
import { createRequire } from 'node:module';
import path from 'node:path';
const { chromium } = createRequire('/private/tmp/x.js')('playwright');

const HERE = path.resolve(new URL('.', import.meta.url).pathname);
const PAGE = path.resolve(process.env.PS_PAGE || path.resolve(HERE, '..', 'index.html'));
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) pass++; else { fail++; console.log('  FAIL ' + label); } };

const browser = await chromium.launch();
const pageErrors = [];

async function open(width, height, stripKey) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  page.on('pageerror', e => pageErrors.push(String(e)));
  await page.addInitScript(() => {
    try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); } catch (e) {}
  });
  if (stripKey) {
    // Intercept at the engine boundary, not at the shell's buildPayload:
    // the shell calls its own internal copy, so wrapping the exported one
    // changes nothing (the panelcap-check lesson).
    await page.addInitScript(() => {
      const arm = () => {
        if (!window.GraphBuilder2 || window.GraphBuilder2.__stripped) return false;
        const orig = window.GraphBuilder2.render;
        window.GraphBuilder2.render = function (id, payload) {
          try { if (payload) delete payload.panelFitControls; } catch (e) {}
          return orig.apply(this, arguments);
        };
        window.GraphBuilder2.__stripped = true;
        return true;
      };
      if (!arm()) {
        const t = setInterval(() => { if (arm()) clearInterval(t); }, 20);
        setTimeout(() => clearInterval(t), 15000);
      }
    });
  }
  await page.goto('file://' + PAGE);
  await page.waitForTimeout(900);
  if (await page.locator('#ps-welcome').isVisible().catch(() => false)) {
    try { await page.locator('#ps-welcome-blank, #ps-welcome-close').first().click({ timeout: 1500 }); } catch (e) {}
    await page.waitForTimeout(400);
  }
  await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const S = window.PS_SHELL, rows = [];
    for (const g of ['Alpha', 'Bravo', 'Charlie']) for (let i = 0; i < 10; i++) rows.push([g, 60 + i]);
    S.loadTable('sz', ['g', 'y'], rows, { g: 'nominal', y: 'continuous' });
    S.setModule('plotbuilder');
    S.setRoles('plotbuilder', { xvar: 'g', yvar: 'y' });
    S.setWorkspace('chart');
    await s(2400);
  });
  return { ctx, page };
}

// Select a bar, open its colour picker, and measure everything at once.
async function measure(page) {
  const bar = page.locator('.graphbuilder2-host svg [data-bar-cat]:not([data-role])').first();
  const box = await bar.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const t = document.querySelector('.graphbuilder2-host [data-role="inspector-title"]');
    const panel = t ? t.closest('div').parentElement : null;
    const sw = panel && panel.querySelector('[data-role="primary-color"]');
    if (sw) sw.click();
  });
  await page.waitForTimeout(800);
  // Park the pointer away: a chip under the resting cursor renders hovered.
  await page.mouse.move(4, 4);
  await page.waitForTimeout(120);
  return page.evaluate(() => {
    const t = document.querySelector('.graphbuilder2-host [data-role="inspector-title"]');
    const panel = t ? t.closest('div').parentElement : null;
    const pop = document.querySelector('[data-role="color-picker"]');
    const sv = pop ? pop.querySelector('[data-role="sv"]') : null;
    const chips = [...document.querySelectorAll('button[data-bs-palette]')];
    const r = el => el ? el.getBoundingClientRect() : null;
    const cr = chips.map(c => r(c));
    return {
      panelW: panel ? Math.round(r(panel).width) : 0,
      pickerW: pop ? Math.round(r(pop).width) : 0,
      pickerShown: !!pop && pop.style.display !== 'none',
      svH: sv ? Math.round(r(sv).height) : 0,
      chipW: cr.length ? +cr[0].width.toFixed(2) : 0,
      chipPitch: cr.length > 1 ? +(cr[1].left - cr[0].left).toFixed(2) : 0,
      chipCount: cr.length
    };
  });
}

console.log('case 1: in the standalone the controls take the room the panel has');
let s = await open(1512, 900, false);
let m = await measure(s.page);
ok(m.pickerShown && m.pickerW > 184,
  'the picker is wider than the 184px it shipped at (' + m.pickerW + ' in a ' + m.panelW + 'px panel)');
ok(m.svH > 96, 'the gradient is taller than its 96px constant (' + m.svH + ')');
ok(m.chipCount > 4, 'the quick-pick row rendered (' + m.chipCount + ' chips)');
await s.ctx.close();

console.log('case 2: the gradient follows the window height, the picker does not overrun the panel');
const tall = await open(1920, 1200, false);
const mt = await measure(tall.page);
ok(mt.svH > m.svH, 'a taller window gives a taller gradient (' + m.svH + ' -> ' + mt.svH + ')');
ok(mt.pickerW <= Math.round(mt.panelW * 0.5),
  'the picker stays a minority of the panel, since it sits beside the controls (' +
  mt.pickerW + ' of ' + mt.panelW + ')');
await tall.ctx.close();

console.log('case 3: the chips keep their settled density at every size');
const narrow = await open(1180, 780, false);
const mn = await measure(narrow.page);
for (const [label, x] of [['default', m], ['tall', mt], ['narrow', mn]]) {
  // 21.9, not 22: a 22px chip measures 21.98 under sub-pixel layout.
  // The chips deliberately do NOT grow with the panel - their 22px edge
  // and 25px centre spacing are a settled ruling that swatch-row-check
  // pins, and growing them measured as a regression there.
  ok(x.chipW >= 21.9 && x.chipW < 23,
    'chips hold their settled 22px at ' + label + ' (' + x.chipW + ')');
  ok(x.chipPitch >= 24, 'adjacent chip centres stay 24px apart at ' + label + ' (' + x.chipPitch + ')');
}
await narrow.ctx.close();

console.log('case 4: without the key every size is the historical constant (jamovi path)');
const bare = await open(1512, 900, true);
const mb = await measure(bare.page);
ok(mb.pickerW === 184, 'the picker is exactly 184px (' + mb.pickerW + ')');
ok(mb.svH === 96, 'the gradient is exactly 96px (' + mb.svH + ')');
ok(Math.round(mb.chipW) === 22, 'chips are exactly 22px (' + mb.chipW + ')');
await bare.ctx.close();

console.log('case 5: the removed right-rail leaves nothing behind');
const last = await open(1512, 900, false);
const rail = await last.page.evaluate(() => ({
  dock: !!document.getElementById('ps-engine-dock'),
  pref: !!document.getElementById('ps-pref-dock'),
  sw: !!document.querySelector('.ps-dock-switch'),
  cls: document.body.className.indexOf('ps-dock-rail') !== -1,
  marker: !!document.querySelector('[data-gb2-inspector]')
}));
ok(!rail.dock && !rail.pref && !rail.sw && !rail.cls && !rail.marker,
  'no dock, preference, switch, body class or panel marker survives (' + JSON.stringify(rail) + ')');
// Select something first: with nothing selected there is no panel to find.
await measure(last.page);
const below = await last.page.evaluate(() => {
  const t = document.querySelector('.graphbuilder2-host [data-role="inspector-title"]');
  const panel = t ? t.closest('div').parentElement : null;
  const host = document.querySelector('.graphbuilder2-host');
  return { inHost: !!panel && host.contains(panel) };
});
ok(below.inHost, 'and the panel is back under the chart');
await last.ctx.close();

ok(pageErrors.length === 0, 'no page errors (' + pageErrors.slice(0, 2).join(' | ') + ')');
console.log((fail === 0 ? 'PANEL CONTROLS SIZE CHECK PASS' : 'PANEL CONTROLS SIZE CHECK FAIL') +
  ' (' + pass + ' ok, ' + fail + ' failing)');
await browser.close();
process.exit(fail === 0 ? 0 : 1);
