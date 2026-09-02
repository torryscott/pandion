// inspector-rail-check.mjs - the right-rail dock for the engine's editing
// panel (Torry, Sep 2026): an opt-in preference moves the SAME panel from
// under the chart into the settings column's dock slot. Same controls, no
// second set. What this pins:
//   1. default (preference off): the panel is the chart's skirt, the dock
//      is empty, and the payload carries no dock key - byte-for-byte the
//      old behaviour, which is also jamovi's path;
//   2. preference on: a bar click opens the panel INSIDE the dock, sized
//      to it, with no horizontal overflow and its tab row free to wrap;
//   3. the color picker stacks under the controls instead of beside them;
//   4. the Statistics panel stays under the chart (its tables want the
//      width), and the next element selection returns to the rail;
//   5. an option commit's re-render keeps exactly one panel in the dock;
//   6. the preference persists across a reload;
//   7. switching the preference back puts the panel under the chart again.
// Control: against main's shell + engine cases 2 to 5 fail (no dock).
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
const open = async () => {
  await page.goto('file://' + PAGE);
  await page.waitForTimeout(700);
  if (await page.locator('#ps-welcome').isVisible().catch(() => false)) {
    try { await page.locator('#ps-welcome-blank, #ps-welcome-close').first().click({ timeout: 1500 }); } catch (e) {}
    await page.waitForTimeout(300);
  }
};
await open();

const loadChart = () => page.evaluate(async () => {
  const s = ms => new Promise(r => setTimeout(r, ms));
  const S = window.PS_SHELL;
  const rows = [];
  const vals = { A: [4, 6, 9, 13, 7], B: [10, 14, 15, 21, 12], C: [2, 3, 4, 3, 5] };
  for (const g of Object.keys(vals)) for (const v of vals[g]) rows.push([g, v]);
  S.loadTable('rail', ['g', 'y'], rows, { g: 'nominal', y: 'continuous' });
  S.setModule('plotbuilder');
  S.setRoles('plotbuilder', { xvar: 'g', yvar: 'y' });
  S.setWorkspace('chart');
  await s(1600);
});
const setDockPref = async (value) => {
  return page.evaluate(async (value) => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.runCommand('preferences');
    await s(400);
    const sel = document.getElementById('ps-pref-dock');
    if (!sel) { document.getElementById('ps-preferences-save').click(); await s(300); return false; }
    sel.value = value;
    document.getElementById('ps-preferences-save').click();
    await s(900);
    return true;
  }, value);
};
// The panel's placement and geometry, wherever it lives.
const panelState = () => page.evaluate(() => {
  const p = document.querySelector('[data-gb2-inspector]') ||
    (document.querySelector('.graphbuilder2-host [data-role="inspector-title"]') || {}).parentElement || null;
  const dock = document.getElementById('ps-engine-dock');
  const host = document.querySelector('.graphbuilder2-host');
  const svg = [...host.querySelectorAll('svg')]
    .sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight))[0];
  const shown = !!p && p.style.display !== 'none' && p.offsetParent !== null;
  return {
    exists: !!p, shown,
    inDock: !!p && !!dock && dock.contains(p),
    inHost: !!p && host.contains(p),
    dockMode: p ? p.getAttribute('data-gb2-dock') : null,
    dockCount: dock ? dock.querySelectorAll('[data-gb2-inspector]').length : -1,
    panelW: p ? p.getBoundingClientRect().width : 0,
    dockW: dock ? dock.getBoundingClientRect().width : 0,
    chartW: svg ? svg.getBoundingClientRect().width : 0,
    overflowX: p ? (p.scrollWidth - p.clientWidth) : 0,
    tabWrap: (() => {
      const anyTab = p && p.querySelector('[data-bs-tab],[data-ls-tab],[data-xytab],[data-ps-tab],[data-dp-tab],[data-helpnav]');
      const tb = anyTab ? anyTab.parentElement : null;
      if (!tb) return null;
      const btns = [...tb.querySelectorAll('button')];
      const tops = new Set(btns.map(x => Math.round(x.getBoundingClientRect().top)));
      return { flexWrap: getComputedStyle(tb).flexWrap, rows: tops.size, tabs: btns.length,
               overflow: tb.scrollWidth - tb.clientWidth };
    })(),
    payloadDock: (window.gb2_undo && window.gb2_undo.getData().inspectorDock) || null
  };
});
const clickBar = async () => {
  const bar = page.locator('.graphbuilder2-host svg [data-bar-cat]:not([data-role]):not(text)').first();
  const box = await bar.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(600);
};

console.log('case 1: the default is the panel under the chart, dock empty');
await loadChart();
await clickBar();
let st = await panelState();
ok(st.shown && st.inHost && !st.inDock && st.dockCount <= 0,
  'default: panel under the chart, dock slot empty (' + JSON.stringify({ inHost: st.inHost, inDock: st.inDock, dockMode: st.dockMode, dockCount: st.dockCount }) + ')');
ok(st.payloadDock === null, 'default payload carries no inspectorDock key');
ok(Math.abs(st.panelW - st.chartW) < 40 || st.panelW >= st.chartW,
  'default: the panel tracks the chart width (' + Math.round(st.panelW) + ' vs chart ' + Math.round(st.chartW) + ')');

console.log('case 2: preference on: the panel opens in the rail, sized to it, tabs wrap');
const prefOk = await setDockPref('rail');
ok(prefOk, 'the Preferences dialog offers the dock choice');
await clickBar();
st = await panelState();
ok(st.shown && st.inDock && !st.inHost && st.dockMode === 'rail' && st.dockCount === 1,
  'rail: the panel lives in the dock slot (' + JSON.stringify({ inDock: st.inDock, inHost: st.inHost, dockMode: st.dockMode, dockCount: st.dockCount }) + ')');
ok(st.payloadDock === 'rail', 'the payload declares inspectorDock: rail');
ok(st.dockW > 200 && Math.abs(st.panelW - (st.dockW - 20)) < 30,
  'rail: the panel fills the dock (' + Math.round(st.panelW) + ' in a ' + Math.round(st.dockW) + 'px dock)');
ok(st.overflowX <= 2, 'rail: no horizontal overflow inside the panel (' + st.overflowX + 'px)');
ok(!!st.tabWrap && st.tabWrap.flexWrap === 'wrap' && st.tabWrap.overflow <= 2,
  'rail: the tab row is allowed to wrap and does not overflow (' + JSON.stringify(st.tabWrap) + ')');
ok(!!st.tabWrap && (st.tabWrap.rows >= 2 || st.tabWrap.tabs <= 3),
  'rail: a multi-tab row wraps onto a second line (' + JSON.stringify(st.tabWrap) + ')');

console.log('case 3: the color picker stacks under the controls');
const stack = await page.evaluate(async () => {
  const s = ms => new Promise(r => setTimeout(r, ms));
  const p = document.querySelector('[data-gb2-inspector]');
  if (!p) return { found: false, noPanel: true };
  const sw = p.querySelector('[data-role="primary-color"], [data-field="color-btn"], button[data-field$="color"]');
  if (sw) { sw.click(); await s(500); }
  const pop = document.querySelector('[data-role="color-picker"]');
  const bodyRow = p.querySelector('[data-role="inspector-bodyrow"]');
  if (!pop || pop.style.display === 'none' || !sw) return { found: !!pop, shown: !!pop && pop.style.display !== 'none', sw: !!sw };
  const pr = pop.getBoundingClientRect(), wr = sw.getBoundingClientRect(), panel = p.getBoundingClientRect();
  return { found: true, inPanel: p.contains(pop), dir: bodyRow ? getComputedStyle(bodyRow).flexDirection : null,
           popTop: Math.round(pr.top), swatchBottom: Math.round(wr.bottom), popRight: Math.round(pr.right), panelRight: Math.round(panel.right),
           stacked: pr.top >= wr.bottom - 4, inside: pr.right <= panel.right + 2 && pr.left >= panel.left - 2 };
});
ok(stack.found && stack.inPanel && stack.stacked && stack.inside,
  'rail: the picker opens inside the panel, below the swatch row, within the dock (' + JSON.stringify(stack) + ')');

console.log('case 4: Statistics stays under the chart; the next selection returns to the rail');
await page.evaluate(async () => {
  const s = ms => new Promise(r => setTimeout(r, ms));
  const click = el => { el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); el.click(); };
  const btn = document.querySelector('.graphbuilder2-host button[aria-label="Statistics"]');
  if (btn) { click(btn); await s(900); }
});
st = await panelState();
ok(st.shown && st.inHost && !st.inDock && st.dockMode === 'below',
  'Statistics opens under the chart even in rail mode (' + JSON.stringify({ inHost: st.inHost, inDock: st.inDock, dockMode: st.dockMode }) + ')');
ok(st.panelW >= st.chartW - 40, 'and keeps its chart-tracking width (' + Math.round(st.panelW) + ' vs chart ' + Math.round(st.chartW) + ')');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await clickBar();
st = await panelState();
ok(st.shown && st.inDock && st.dockCount === 1, 'the next bar click is back in the rail');

console.log('case 5: an option commit re-renders and keeps exactly one panel in the dock');
await page.evaluate(async () => {
  window.setOption('barCornerRadius', 25);
  await new Promise(r => setTimeout(r, 2200));   // the shell echo lands
});
st = await panelState();
ok(st.dockCount === 1 && st.shown && st.inDock,
  'after the echo: one panel in the dock, still showing (' + JSON.stringify({ dockCount: st.dockCount, shown: st.shown, inDock: st.inDock }) + ')');

console.log('case 6: the preference survives a reload');
await open();
await loadChart();
await clickBar();
st = await panelState();
ok(st.shown && st.inDock && st.dockMode === 'rail',
  'after reload the panel opens in the rail again (' + JSON.stringify({ inDock: st.inDock, dockMode: st.dockMode }) + ')');

console.log('case 7: switching back puts the panel under the chart');
await setDockPref('below');
await clickBar();
st = await panelState();
ok(st.shown && st.inHost && !st.inDock && st.dockMode === 'below' && st.dockCount === 0,
  'preference off again: panel under the chart, dock empty (' + JSON.stringify({ inHost: st.inHost, inDock: st.inDock, dockCount: st.dockCount }) + ')');

// ---------------------------------------------------------------- round 2
// Cases 1 to 7 are about PLACEMENT (does the panel go to the rail). These
// are about what the rail does to a panel once it is there, from the two
// things Torry hit on the first build: a title bar that overlapped itself,
// and a column that made him scroll past the whole chart setup to reach
// the panel.
//
// CONTROL: delete the four #ps-engine-dock rules in standalone/index.html
// (title flex-wrap, the scope-host flex-basis, the title-cell flex base,
// the crumb clamp) and cases 8 and 9 go red - 8 with crumbScope true on
// every strip that offers a this/all switch, 9 with the crumb painting
// about 100px outside the panel and the eye knocked onto its own line.
const loadGrouped = (level) => page.evaluate(async (lv) => {
  const s = ms => new Promise(r => setTimeout(r, ms));
  const S = window.PS_SHELL, rows = [];
  const gs = ['Lecture', 'Reading', 'Practice'], res = [lv, 'Off campus'];
  for (const g of gs) for (const r of res) for (let i = 0; i < 6; i++)
    rows.push([g, r, 50 + i * 3 + gs.indexOf(g) * 5 + res.indexOf(r) * 4]);
  S.loadTable('grp', ['study_method', 'residence', 'exam_score'], rows,
    { study_method: 'nominal', residence: 'nominal', exam_score: 'continuous' });
  S.setModule('plotbuilder');
  S.setRoles('plotbuilder', { xvar: 'study_method', yvar: 'exam_score', groupVar: 'residence' });
  S.setWorkspace('chart');
  await s(1900);
}, level);
// Real gestures: a bare dispatchEvent click carries detail 0 and is
// swallowed by the engine's phantom-click guard.
const clickAt = async (sel, name) => {
  const box = await page.evaluate(([s2, n]) => {
    const el2 = [...document.querySelectorAll(s2)].find(x => x.textContent.trim() === n);
    if (!el2) return null;
    const r = el2.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, [sel, name]);
  if (!box) return false;
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(650);
  return true;
};
// The collision the fix is about was a title CELL squeezed to 26px around
// a crumb still painting 120px, so measure the CRUMB, which is what the
// reader sees. And count a hit only when the rects meet on BOTH axes: the
// fix drops the scope cluster onto its own line, directly under the title,
// where a horizontal-only test would be permanently and wrongly red.
const titleGeom = () => page.evaluate(() => {
  const t = document.querySelector('#ps-engine-dock [data-role="inspector-title"]');
  if (!t) return null;
  const shown = el => !!el && getComputedStyle(el).display !== 'none' &&
    el.getBoundingClientRect().width > 0;
  const R = el => { const b = el.getBoundingClientRect();
    return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
  const hit = (a, c) => !!(a && c) &&
    (Math.min(a.r, c.r) - Math.max(a.l, c.l) > 1) &&
    (Math.min(a.b, c.b) - Math.max(a.t, c.t) > 1);
  const crumb = t.querySelector('[data-role="gb2-crumb"]');
  const scope = t.querySelector('[data-role="scope-title-host"], [data-role="bs-title-scope"]');
  const acts = t.querySelector('[data-role="title-actions"]');
  const panel = document.querySelector('#ps-engine-dock [data-gb2-inspector]');
  const tt = crumb ? crumb.lastElementChild : null;
  const tR = R(t), cR = crumb ? R(crumb) : null;
  const sR = shown(scope) ? R(scope) : null, aR = shown(acts) ? R(acts) : null;
  return {
    crumbScope: hit(cR, sR), crumbActs: hit(cR, aR), scopeActs: hit(sR, aR),
    spillPastPanel: (cR && panel) ? Math.round(cR.r - R(panel).r) : 0,
    ellipsised: tt ? tt.scrollWidth > tt.clientWidth + 1 : false,
    actsLine: aR ? Math.round(aR.t - tR.t) : null,
    scopeShown: !!sR,
    title: crumb ? crumb.innerText.replace(/\n/g, ' / ') : ''
  };
});

console.log('case 8: the docked title bar never overlaps itself, on any tab');
await setDockPref('rail');
await loadGrouped('On campus');
await clickBar();
{
  let seen = 0, withScope = 0, bad = [];
  for (const tab of ['Bars', 'Border', 'Error bars', 'Gap', 'Order', 'Border']) {
    if (!(await clickAt('[data-bs-tab]', tab))) continue;
    const g = await titleGeom();
    if (!g) continue;
    seen++;
    if (g.scopeShown) withScope++;
    if (g.crumbScope || g.crumbActs || g.scopeActs)
      bad.push(tab + ' ' + JSON.stringify(g));
  }
  ok(seen >= 5, 'walked the panel tabs in the rail (' + seen + ')');
  ok(withScope >= 1, 'at least one tab offers a this/all switch, so the ' +
    'collision case is actually exercised (' + withScope + ')');
  ok(bad.length === 0,
    'no two title-bar parts share screen space on any tab: this is the ' +
    'reported jumbling, where the title cell was squeezed to 26px and its ' +
    'crumb painted straight through "Applies to" (' + bad.join(' ; ') + ')');
}

console.log('case 9: a long level name stays inside the panel and keeps the eye in place');
await loadGrouped('Students living on campus in university halls of residence');
await clickBar();
await clickAt('[data-bs-tab]', 'Border');
{
  const g = await titleGeom();
  ok(!!g && g.spillPastPanel <= 0,
    'the title does not paint outside the panel: unclamped it ran about ' +
    '100px past the border and into the page (' + (g && g.spillPastPanel) + 'px)');
  ok(!!g && g.ellipsised,
    'it ellipsises instead, which is what the engine already asks for and ' +
    'never got, because nothing clamped the crumb to its cell');
  ok(!!g && g.actsLine !== null && g.actsLine < 30,
    'and the eye stays on the first line rather than being pushed below ' +
    'the title (top offset ' + (g && g.actsLine) + 'px)');
  ok(!!g && !g.crumbScope && !g.crumbActs,
    'still no overlap with a name this long (' + JSON.stringify(g) + ')');
}

console.log('case 10: the panel takes the column, and the switch is the way back');
await loadGrouped('On campus');
const colState = () => page.evaluate(() => {
  const pane = document.getElementById('ps-inspector-chart');
  const sw = pane.querySelector('.ps-dock-switch');
  const dock = document.getElementById('ps-engine-dock');
  const panel = dock.querySelector('[data-gb2-inspector]');
  const setupVisible = [...pane.children].some(c =>
    c !== sw && c !== dock && getComputedStyle(c).display !== 'none');
  return {
    live: pane.classList.contains('ps-dock-live'),
    editing: pane.classList.contains('ps-dock-editing'),
    switchShown: !!sw && getComputedStyle(sw).display !== 'none',
    setupVisible,
    panelInDock: !!panel,
    panelShowing: !!panel && getComputedStyle(panel).display !== 'none',
    dockH: Math.round(dock.getBoundingClientRect().height),
    panelW: panel ? Math.round(panel.getBoundingClientRect().width) : 0,
    heading: (document.getElementById('ps-inspector-title') || {}).textContent || ''
  };
});
{
  let st2 = await colState();
  ok(!st2.switchShown && st2.setupVisible && st2.dockH === 0,
    'with nothing selected the column is the chart setup, with no switch ' +
    'and no empty dock strip (' + JSON.stringify(st2) + ')');
  await clickBar();
  st2 = await colState();
  const editW = st2.panelW;
  ok(st2.editing && !st2.setupVisible && st2.switchShown && st2.panelShowing,
    'selecting a part hands the column to the panel: this is the ask, ' +
    'since the panel used to sit below the whole setup (' + JSON.stringify(st2) + ')');
  ok(/editing/i.test(st2.heading), 'and the column heading says so ("' + st2.heading + '")');
  await page.click('#ps-dock-switch-setup');
  await page.waitForTimeout(450);
  st2 = await colState();
  ok(st2.setupVisible && !st2.editing && st2.switchShown,
    'the switch goes back to the setup and stays on offer');
  ok(st2.panelInDock && st2.live,
    'and the part stays SELECTED, so this is a toggle and not a close ' +
    'button: the engine closes its panel on any click outside it, which ' +
    'ate the selection until the switch stopped its own click');
  ok(st2.panelW === editW,
    'the panel keeps its width while stood down, so a re-render on the ' +
    'setup view cannot size it to a wider box (' + st2.panelW + ' vs ' + editW + ')');
  await page.click('#ps-dock-switch-edit');
  await page.waitForTimeout(450);
  ok((await colState()).editing, 'and back again');
  await page.click('#ps-dock-switch-setup');
  await page.waitForTimeout(350);
  await clickBar();
  ok((await colState()).editing,
    'clicking a chart part while on the setup view returns to the panel, ' +
    'so a click is never swallowed by the view you happen to be on');
  await page.evaluate(() => window.PS_SHELL.addChart('plotbuilder'));
  await page.waitForTimeout(2200);
  st2 = await colState();
  ok(!st2.editing && st2.setupVisible && !st2.panelInDock,
    'a NEW chart starts on its own setup with an empty dock: measured ' +
    'before the guard, it arrived wearing the previous chart\'s panel ' +
    'with its own role slots hidden behind it (' + JSON.stringify(st2) + ')');
}
await setDockPref('below');
{
  const belowState = await page.evaluate(() => {
    const pane = document.getElementById('ps-inspector-chart');
    const sw = pane.querySelector('.ps-dock-switch');
    return { switchShown: !!sw && getComputedStyle(sw).display !== 'none',
             editing: pane.classList.contains('ps-dock-editing'),
             setupVisible: [...pane.children].some(c => c !== sw &&
               c.id !== 'ps-engine-dock' && getComputedStyle(c).display !== 'none') };
  });
  ok(!belowState.switchShown && !belowState.editing && belowState.setupVisible,
    'with the preference off none of this exists: no switch, no hidden ' +
    'setup, which is also jamovi\'s path (' + JSON.stringify(belowState) + ')');
}

ok(pageErrors.length === 0, 'no page errors (' + pageErrors.slice(0, 2).join(' | ') + ')');
console.log((fail === 0 ? 'INSPECTOR RAIL CHECK PASS' : 'INSPECTOR RAIL CHECK FAIL') +
  ' (' + pass + ' ok, ' + fail + ' failing)');
await b.close();
process.exit(fail === 0 ? 0 : 1);
