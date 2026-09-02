// rail-controls-check.mjs - the two things Torry asked for after living with
// the right-rail dock for an afternoon (Sep 2 2026). Both are about the
// column being a PLACE you work in rather than a thing that appears when the
// engine happens to have a panel open:
//
//   ASK 1: "it'd be nice to have the editing versus chart setup buttons up
//   there permanently, so even after you click off of an element, you can
//   still reach the editing menu". The switch used to be gated on a panel
//   actually showing, so clicking empty chart space took the way back with
//   it. Cases 1 to 3.
//
//   ASK 2: "the HSV and the swatches stay really small even when there's
//   room in the right rail for them to be larger". The picker is built at a
//   hard 184px and the quick-pick chips at a floored 22px, both sized for
//   the panel's old home under the chart. Cases 4 to 6.
//
// Placement (does the panel reach the rail at all) is inspector-rail-check's
// job and is not repeated here; this file is about the controls once it is
// there. Case 5 is the guard that matters most: the engine is shared, so a
// size that leaks into the under-chart path is a size jamovi ships.
//
// CONTROL, run against this tree before the engine change: cases 1 to 3 pass
// (the shell fix is in) and cases 4 and 6 go red - the picker measures 184px
// at every rail width and the chips 22px, so nothing grows. Case 5 passes
// either way, which is the point of it.
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
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
await page.addInitScript(() => {
  try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); } catch (e) {}
});
await page.goto('file://' + PAGE);
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible().catch(() => false)) {
  try { await page.locator('#ps-welcome-blank, #ps-welcome-close').first().click({ timeout: 1500 }); } catch (e) {}
  await page.waitForTimeout(300);
}

const loadChart = () => page.evaluate(async () => {
  const s = ms => new Promise(r => setTimeout(r, ms));
  const S = window.PS_SHELL, rows = [];
  const vals = { A: [4, 6, 9, 13, 7], B: [10, 14, 15, 21, 12], C: [2, 3, 4, 3, 5] };
  for (const g of Object.keys(vals)) for (const v of vals[g]) rows.push([g, v]);
  S.loadTable('rail', ['g', 'y'], rows, { g: 'nominal', y: 'continuous' });
  S.setModule('plotbuilder');
  S.setRoles('plotbuilder', { xvar: 'g', yvar: 'y' });
  S.setWorkspace('chart');
  await s(1700);
});
const setDockPref = (value) => page.evaluate(async (v) => {
  const s = ms => new Promise(r => setTimeout(r, ms));
  window.PS_SHELL.runCommand('preferences');
  await s(400);
  const sel = document.getElementById('ps-pref-dock');
  if (!sel) { document.getElementById('ps-preferences-save').click(); await s(300); return false; }
  sel.value = v;
  document.getElementById('ps-preferences-save').click();
  await s(900);
  return true;
}, value);

// Geometry is measured with the pointer parked off the chart: a mark under
// the resting cursor takes a real mouseenter and paints its hover state.
const park = async () => {
  await page.mouse.move(20, 500);
  await page.waitForTimeout(180);
};
// Real gestures throughout. A bare dispatchEvent click carries detail 0 and
// coordinates 0,0, which the engine's phantom-click guard swallows, so a
// synthetic-click probe of these surfaces is structurally blind.
const clickBar = async () => {
  const bar = page.locator('.graphbuilder2-host svg [data-bar-cat]:not([data-role]):not(text)').first();
  const box = await bar.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(700);
  await park();
};
// Clicking off a part, which is how the engine closes its panel. Hunt for a
// spot whose topmost element is the chart svg itself rather than a mark or a
// label; a fixed coordinate would land on a bar as soon as heights change.
const clickEmptyChart = async () => {
  const pt = await page.evaluate(() => {
    const host = document.querySelector('.graphbuilder2-host');
    const svg = [...host.querySelectorAll('svg')]
      .sort((a, c) => (c.clientWidth * c.clientHeight) - (a.clientWidth * a.clientHeight))[0];
    const r = svg.getBoundingClientRect();
    for (let fy = 0.10; fy < 0.45; fy += 0.05)
      for (let fx = 0.18; fx < 0.80; fx += 0.04) {
        const x = r.x + r.width * fx, y = r.y + r.height * fy;
        if (document.elementFromPoint(x, y) === svg) return { x, y };
      }
    return null;
  });
  if (!pt) return false;
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(700);
  await park();
  return true;
};
// What the column is showing: which view, whether the switch is on offer,
// and which of the two bodies has a box.
const viewState = () => page.evaluate(() => {
  const pane = document.getElementById('ps-inspector-chart');
  const sw = pane.querySelector('.ps-dock-switch');
  const dock = document.getElementById('ps-engine-dock');
  const empty = document.getElementById('ps-dock-empty');
  const panel = dock ? dock.querySelector('[data-gb2-inspector]') : null;
  const roles = pane.querySelector('.ps-assign');
  return {
    switchShown: !!sw && getComputedStyle(sw).display !== 'none',
    editing: pane.classList.contains('ps-dock-editing'),
    live: pane.classList.contains('ps-dock-live'),
    emptyShown: !!empty && getComputedStyle(empty).display !== 'none',
    emptyH: empty ? Math.round(empty.getBoundingClientRect().height) : -1,
    rolesShown: !!roles && roles.getBoundingClientRect().height > 0,
    panelShowing: !!panel && getComputedStyle(panel).display !== 'none',
    heading: (document.getElementById('ps-inspector-title') || {}).textContent || ''
  };
});

console.log('case 1: the switch is there before anything is selected');
await loadChart();
ok(await setDockPref('rail'), 'the Preferences dialog offers the dock choice');
{
  const st = await viewState();
  ok(st.switchShown && !st.panelShowing,
    'with a chart open and nothing ever selected, the switch is on offer: ' +
    'gated on a live panel it only existed once you had already found the ' +
    'panel some other way (' + JSON.stringify(st) + ')');
  await page.click('#ps-dock-switch-edit');
  await page.waitForTimeout(400);
  const ed = await viewState();
  ok(ed.editing && ed.emptyShown && ed.emptyH > 20 && !ed.rolesShown,
    'and Editing is reachable from a cold start, showing what to do rather ' +
    'than an empty column (' + JSON.stringify(ed) + ')');
  ok(/editing/i.test(ed.heading),
    'with a heading that names the view ("' + ed.heading + '")');
}

console.log('case 2: selecting and deselecting never takes the way back with it');
{
  await clickBar();
  let st = await viewState();
  ok(st.switchShown && st.editing && st.live && st.panelShowing && !st.rolesShown,
    'a bar click hands the column to the panel (' + JSON.stringify(st) + ')');
  ok(await clickEmptyChart(), 'found empty chart space to click off onto');
  st = await viewState();
  ok(st.switchShown,
    'clicking off a part KEEPS the switch: this is the ask, since the ' +
    'switch used to vanish with the panel and stranded the user on ' +
    'whichever view they happened to be on (' + JSON.stringify(st) + ')');
  ok(st.editing && st.emptyShown && !st.panelShowing && !st.live,
    'the Editing view stays on and states its empty case (' + JSON.stringify(st) + ')');
  // The round trip with nothing selected is the part that was unreachable:
  // going to the setup and back had no button to come back on.
  await page.click('#ps-dock-switch-setup');
  await page.waitForTimeout(400);
  st = await viewState();
  ok(st.switchShown && !st.editing && st.rolesShown && !st.emptyShown,
    'Chart setup gives the roles back (' + JSON.stringify(st) + ')');
  await page.click('#ps-dock-switch-edit');
  await page.waitForTimeout(400);
  st = await viewState();
  ok(st.editing && st.emptyShown && !st.rolesShown,
    'and Editing is still reachable with nothing selected (' + JSON.stringify(st) + ')');
  await clickBar();
  st = await viewState();
  ok(st.panelShowing && !st.emptyShown,
    'selecting again fills the view that was already waiting for it');
}

console.log('case 3: none of this exists in the default under-the-chart mode');
await setDockPref('below');
{
  let st = await viewState();
  ok(!st.switchShown && !st.editing && st.rolesShown && !st.emptyShown,
    'preference off: no switch, no view state, the roles just stand (' +
    JSON.stringify(st) + ')');
  await clickBar();
  st = await viewState();
  ok(!st.switchShown && !st.editing && st.rolesShown,
    'and selecting a part does not summon one, which is also jamovi\'s ' +
    'path (' + JSON.stringify(st) + ')');
}

// ------------------------------------------------------------------ ask 2
// The colour controls were sized for the panel's old home under the chart,
// where 184px of picker beside 700px of panel is a reasonable share. In the
// rail they ARE the column's width budget, and they still measure 184 no
// matter how far out the splitter is dragged.
const railWidth = () => page.evaluate(() => Math.round(
  document.querySelector('.ps-controls').getBoundingClientRect().width));
// Drag the real splitter, never the custom property splitApply writes: the
// property is the OUTPUT, so poking it would prove nothing about whether a
// user can reach these widths. Overshoot and let splitSet clamp, because the
// drag's own start value is the stored width, not the live one.
const dragRail = async (dx) => {
  const at = await page.evaluate(() => {
    const s = document.querySelector('[data-splitter="inspector"]');
    const r = s.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(at.x + dx * i / 6, at.y);
  await page.mouse.up();
  await page.waitForTimeout(600);
  await park();
  return railWidth();
};
// The colour surfaces as rendered. The picker is measured wherever it sits;
// the chips are every visible quick-pick swatch in the panel, found by the
// namespaced attribute _renderPaletteRowHtml stamps rather than by one
// panel's prefix, so this reads the same row on any module.
const colourGeom = () => page.evaluate(() => {
  const p = document.querySelector('[data-gb2-inspector]');
  if (!p || getComputedStyle(p).display === 'none') return null;
  const pick = p.querySelector('[data-role="color-picker"]');
  const shown = !!pick && getComputedStyle(pick).display !== 'none';
  const sv = shown ? pick.querySelector('[data-role="sv"]') : null;
  const chips = [...p.querySelectorAll('button')].filter(el =>
    [...el.attributes].some(a => /-palette$/.test(a.name)) &&
    el.getBoundingClientRect().width > 0);
  // The nearest neighbour of a chip, in either direction. Within a row that
  // is the next centre along; between rows it is the row pitch, because the
  // quick-pick row wraps and WCAG's spacing exception measures a circle, not
  // a line. Counting only horizontal pairs would also read a fully wrapped
  // column, where every chip is alone on its line, as unmeasurable.
  const rows = [];
  chips.forEach(el => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const row = rows.filter(x => Math.abs(x.cy - cy) <= 4)[0];
    if (row) row.xs.push(cx); else rows.push({ cy: cy, xs: [cx] });
  });
  let minPitch = Infinity;
  rows.forEach(row => {
    const xs = row.xs.sort((a, c) => a - c);
    for (let i = 1; i < xs.length; i++) minPitch = Math.min(minPitch, xs[i] - xs[i - 1]);
  });
  const cys = rows.map(r => r.cy).sort((a, c) => a - c);
  for (let i = 1; i < cys.length; i++) minPitch = Math.min(minPitch, cys[i] - cys[i - 1]);
  const dock = document.getElementById('ps-engine-dock');
  let inner = 0;
  if (dock && dock.getBoundingClientRect().width > 0) {
    const cs = getComputedStyle(dock);
    inner = dock.getBoundingClientRect().width -
      parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  }
  const rnd = n => Math.round(n * 10) / 10;
  return {
    pickShown: shown,
    pickW: shown ? rnd(pick.getBoundingClientRect().width) : 0,
    svH: sv ? rnd(sv.getBoundingClientRect().height) : 0,
    chips: chips.length,
    chipW: chips.length ? rnd(chips[0].getBoundingClientRect().width) : 0,
    pitch: isFinite(minPitch) ? rnd(minPitch) : null,
    dockInner: rnd(inner),
    panelW: rnd(p.getBoundingClientRect().width)
  };
});
// Every size the probe stands at, kept for the one spacing invariant that
// has to hold at all of them.
const seen = [];
const sample = async (name) => {
  const g = await colourGeom();
  if (g) seen.push({ name, g });
  return g;
};

console.log('case 4: a wider rail gives the colour controls the room');
await setDockPref('rail');
await clickBar();
const baseW = await railWidth();
const base = await sample('rail default ' + baseW + 'px');
ok(!!base && base.pickShown && base.chips > 0,
  'the bar panel lands on its colour strip with the picker docked, which ' +
  'is what there is to measure (' + JSON.stringify(base) + ')');
ok(!!base && base.chipW >= 22,
  'the chips are at least the shipped 22px at the default rail width: the ' +
  'geometry may only ever grow, because 22px at a 3px gap is what puts ' +
  'adjacent targets 25px apart and passes WCAG 2.2 target-size by the ' +
  'spacing exception (' + (base && base.chipW) + 'px)');
{
  // The splitter drag re-lays the chart and closes the panel, so the panel
  // is re-opened at each width rather than measured through the gesture.
  const wideW = await dragRail(-400);
  ok(wideW > baseW + 100,
    'the splitter really widened the rail before anything was measured: a ' +
    'drag that silently did nothing would let every size assertion below ' +
    'pass by comparing one width with itself (' + baseW + ' -> ' + wideW + 'px)');
  await clickBar();
  const wide = await sample('rail max ' + wideW + 'px');
  ok(!!wide && wide.pickShown && wide.pickW >= base.pickW + 40,
    'the picker grows into the wider rail: this is the ask, and unfixed it ' +
    'measures the same hard 184px it was built at whatever the column ' +
    'offers (' + (base && base.pickW) + ' -> ' + (wide && wide.pickW) +
    'px, sv square ' + (base && base.svH) + ' -> ' + (wide && wide.svH) +
    'px, in a ' + (wide && wide.dockInner) + 'px dock)');
  ok(!!wide && wide.pickW <= wide.dockInner + 1,
    'and never wider than the dock it lives in (' + (wide && wide.pickW) +
    ' in ' + (wide && wide.dockInner) + 'px)');
  ok(!!wide && wide.chipW > 22.5,
    'the quick-pick chips grow with it, since the ask names the swatches ' +
    'as well as the picker (' + (base && base.chipW) + ' -> ' +
    (wide && wide.chipW) + 'px)');

  const narrowW = await dragRail(400);
  ok(narrowW < baseW,
    'and the splitter narrows again to its minimum (' + narrowW + 'px)');
  await clickBar();
  const narrow = await sample('rail min ' + narrowW + 'px');
  ok(!!narrow && narrow.chipW >= 22,
    'at the narrowest the rail can be dragged to, the chips are still no ' +
    'smaller than 22px: growing into space is one thing, shrinking out of ' +
    'the target-size exception is another (' + (narrow && narrow.chipW) + 'px)');
  ok(!!narrow && narrow.pickShown && narrow.pickW <= narrow.dockInner + 1,
    'and the picker still fits the column it is in (' + (narrow && narrow.pickW) +
    ' in ' + (narrow && narrow.dockInner) + 'px)');
}

console.log('case 5: under the chart nothing moved, which is jamovi\'s path');
await setDockPref('below');
await clickBar();
{
  const below = await sample('under the chart');
  ok(!!below && below.pickW === 184,
    'the picker is the historical 184px exactly. The engine is shared, so ' +
    'a rule that reads the panel width instead of the rail would size ' +
    'jamovi\'s picker too, against a 700px panel (' +
    (below && below.pickW) + 'px in a ' + (below && below.panelW) + 'px panel)');
  ok(!!below && below.chipW === 22,
    'and a chip is the floored 22px (' + (below && below.chipW) + 'px)');
}

console.log('case 6: chips keep their target spacing at every size');
{
  const bad = seen.filter(s => !(s.g.pitch >= 24));
  ok(seen.length >= 4 && seen.every(s => s.g.pitch !== null),
    'measured a real chip pitch at every width the probe stood at (' +
    seen.length + ')');
  ok(bad.length === 0,
    'the nearest two chip centres stay at least 24px apart everywhere, ' +
    'which is the invariant the target-size gate rides on and the reason ' +
    'the chip geometry has a floor at all: ' +
    seen.map(s => s.name + ' ' + s.g.chipW + 'px chips, ' + s.g.pitch +
      'px pitch').join(' ; '));
}

ok(pageErrors.length === 0, 'no page errors (' + pageErrors.slice(0, 2).join(' | ') + ')');
console.log((fail === 0 ? 'RAIL CONTROLS CHECK PASS' : 'RAIL CONTROLS CHECK FAIL') +
  ' (' + pass + ' ok, ' + fail + ' failing)');
await b.close();
process.exit(fail === 0 ? 0 : 1);
