// ymax-bracket-grow-check.mjs - a significance bracket must not grow the
// canvas when the AXIS, not the user, pushes it off the plot; a bracket the
// user drags above the plot still earns its room, and the room is given
// back once the bracket comes back down.
//
// Torry's report (Nov 7 2026, the desktop app): with a bracket on a Compare
// Groups bar chart, typing a new Max in the axis Range strip made the chart
// vanish and then sit "way down at the bottom" while the bracket stayed put.
// The Range field previews on every keystroke, so 1-6-0 passes through a Max
// of 1; the bars sit ~42,000 px above the plot (clipped, invisible) and the
// bracket, whose spine rides the bars' ceiling and is never clipped, draws
// ~46,000 px up. The post-redraw canvas sweep read that as content above the
// canvas and grew the svg from 490 to 46,714 px, shifting the chart down by
// the same amount; the upward growth had no cap and was grow-only within a
// mount, so the final digit brought the bars back 46,000 px down.
//
// What this pins (chromium, the standalone page):
//   1. no bracket: typing 1 / 16 / 160 never changes the canvas (baseline);
//   2. with a bracket: the same keystrokes leave the canvas at its natural
//      height with no chart shift, every step, and the bars return;
//   3. a committed Max below the data (a deliberately cut axis) grows nothing;
//   4. a real spine drag above the plot grows the canvas, mid-drag and after
//      the release's echo re-render;
//   5. dragging it back down gives the room back on the release redraw.
// Control: PS_EXPECT_BROKEN=1 against a page served from the pre-fix engine
// (e.g. PS_PAGE=<main checkout>/standalone/index.html) asserts the OLD
// behaviour instead (the balloon in 2 and 3, the kept shift in 5), so the
// probe is shown to see the bug it guards.
//
// Usage: PS_PAGE=<tree>/standalone/index.html node standalone/verify/ymax-bracket-grow-check.mjs
import { createRequire } from 'node:module';
import path from 'node:path';

function loadPlaywright() {
  const bases = [];
  if (process.env.GB2_NODE_BASE) bases.push(process.env.GB2_NODE_BASE);
  bases.push(process.cwd(), new URL('.', import.meta.url).pathname, '/private/tmp', '/tmp');
  for (const base of bases) {
    try { return createRequire(path.join(base, 'x.js'))('playwright'); }
    catch { /* try the next shared dependency location */ }
  }
  console.error('playwright not found');
  process.exit(2);
}
const { chromium } = loadPlaywright();
const HERE = path.resolve(new URL('.', import.meta.url).pathname);
const PAGE = path.resolve(process.env.PS_PAGE || path.resolve(HERE, '..', 'index.html'));
const BROKEN = process.env.PS_EXPECT_BROKEN === '1';
let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) { pass++; console.log('  ok  ' + label); }
  else { fail++; console.log('  FAIL ' + label); }
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1500, height: 950 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.addInitScript(() => {
  try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); } catch (e) {}
});
await page.goto('file://' + PAGE);
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible().catch(() => false)) {
  try { await page.locator('#ps-welcome-blank, #ps-welcome-close').first().click({ timeout: 1500 }); } catch (e) {}
  await page.waitForTimeout(300);
}

console.log('setup: a two-group bar chart (Saline high, Rb1 low)');
await page.evaluate(async () => {
  const s = ms => new Promise(r => setTimeout(r, ms));
  const rows = [];
  const vals = { Saline: [80, 95, 150, 130, 85, 110], Rb1: [40, 55, 60, 45, 50, 52] };
  for (const g of Object.keys(vals)) for (const v of vals[g]) rows.push([g, v]);
  const S = window.PS_SHELL;
  S.loadTable('br', ['Intervention', 'Presses'], rows, { Intervention: 'nominal', Presses: 'continuous' });
  S.setModule('plotbuilder');
  S.setRoles('plotbuilder', { xvar: 'Intervention', yvar: 'Presses' });
  await s(1800);
});

// The chart's state in one read: canvas height, the chart-content shift,
// the bars' tops, the bracket's spine, the stored Max.
const snap = () => page.evaluate(() => {
  const host = document.querySelector('.graphbuilder2-host');
  const svg = [...host.querySelectorAll('svg')]
    .sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight))[0];
  const d = window.gb2_undo.getData();
  const g = svg.querySelector('[data-role="chart-shift"]');
  const m = /translate\(\s*0\s*,\s*(-?[\d.]+)/.exec((g && g.getAttribute('transform')) || '');
  const bars = [...svg.querySelectorAll('[data-bar-cat]')]
    .filter(el => (el.tagName.toLowerCase() === 'rect' || el.tagName.toLowerCase() === 'path') && !el.getAttribute('data-role'))
    .map(el => { const bb = el.getBBox(); return { y: bb.y, h: bb.height }; });
  const spine = svg.querySelector('[data-ann-id] [data-role="bracket-h-line"]');
  const svgR = svg.getBoundingClientRect();
  const spineR = spine ? spine.getBoundingClientRect() : null;
  return {
    h: Number(svg.getAttribute('height')), shift: m ? Number(m[1]) : 0,
    bars, yMax: d.yMax, ov: d.yMaxOverride,
    spineY: spine ? Number(spine.getAttribute('y1')) : null,
    spineTopInCanvas: spineR ? (spineR.top - svgR.top) : null,
    brackets: svg.querySelectorAll('[data-ann-id]').length
  };
});
const natural = (await snap()).h;
ok(natural > 300 && natural < 1200, 'setup: natural canvas height ' + natural);

// Open the left-axis panel through its hit strip (the unlabelled ns-resize
// div over the Y axis), the way a click does.
const openAxis = async () => {
  const pt = await page.evaluate(() => {
    const host = document.querySelector('.graphbuilder2-host');
    const hit = [...host.querySelectorAll('div')].find(d => d.style.cursor === 'ns-resize' && d.offsetHeight > 40);
    if (!hit) return null;
    const r = hit.getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  });
  if (!pt) return false;
  await page.mouse.click(pt[0], pt[1]);
  await page.waitForTimeout(600);
  return page.evaluate(() => !!document.querySelector('[data-gb2-inspector] [data-field="max"]'));
};
// Type a value the way a person does: the field previews on every input
// event, so each partial number paints.
const typeMax = async (seq) => {
  const out = [];
  for (const v of seq) {
    await page.evaluate((v) => {
      const inp = document.querySelector('[data-gb2-inspector] [data-field="max"]');
      inp.focus(); inp.value = v; inp.dispatchEvent(new Event('input', { bubbles: true }));
    }, v);
    await page.waitForTimeout(150);
    out.push(Object.assign({ typed: v }, await snap()));
  }
  await page.evaluate(() => {
    const inp = document.querySelector('[data-gb2-inspector] [data-field="max"]');
    inp.dispatchEvent(new Event('change', { bubbles: true })); inp.blur();
  });
  await page.waitForTimeout(2600);
  out.push(Object.assign({ typed: 'echo' }, await snap()));
  return out;
};
const stayedNatural = (steps, label) => {
  for (const st of steps) {
    ok(near(st.h, natural, 2) && st.shift === 0,
      label + ': after "' + st.typed + '" the canvas is ' + st.h + ' px with shift ' + st.shift);
  }
};

console.log('case 1: no bracket, typing 1 / 16 / 160 never moves the canvas');
ok(await openAxis(), 'the left-axis panel opened');
stayedNatural(await typeMax(['1', '16', '160']), 'no bracket');
await page.evaluate(async () => { window.__gb2_setOption('yMaxOverride', false); await new Promise(r => setTimeout(r, 2600)); });

console.log('setup: one bracket placed from the Statistics panel');
const placed = await page.evaluate(async () => {
  const s = ms => new Promise(r => setTimeout(r, ms));
  const click = el => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    el.click();
  };
  const host = document.querySelector('.graphbuilder2-host');
  const stats = host.querySelector('button[title="Statistics"]');
  if (stats) { click(stats); await s(1000); }
  const rowsSel = [...host.querySelectorAll('[data-st-pane="pairs"] tr[data-link] input[type="checkbox"]')];
  rowsSel.slice(0, 1).forEach(cb => { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); });
  await s(400);
  const place = [...host.querySelectorAll('button')].find(x => /^Place brackets/.test((x.textContent || '').trim()));
  if (place) { click(place); await s(2600); }
  return (window.gb2_undo.getData().annotations || []).filter(a => a && a.kind === 'bracket').length;
});
ok(placed === 1, 'one bracket is on the chart (' + placed + ')');
const rest = await snap();
ok(near(rest.h, natural, 2) && rest.shift === 0, 'placing it left the canvas at ' + rest.h + ' px, shift ' + rest.shift);

console.log('case 2: with the bracket, typing 1 / 16 / 160');
ok(await openAxis(), 'the left-axis panel opened');
const steps = await typeMax(['1', '16', '160']);
if (BROKEN) {
  const one = steps[0], last = steps[steps.length - 2];
  ok(one.h > 5000 && one.shift > 1000,
    'CONTROL: after "1" the canvas ballooned to ' + one.h + ' px with shift ' + one.shift);
  ok(last.h > 5000 && last.shift > 1000,
    'CONTROL: after "160" the chart is still parked ' + last.shift + ' px down (canvas ' + last.h + ')');
} else {
  stayedNatural(steps, 'with bracket');
}
const settled = steps[steps.length - 1];
ok(settled.bars.length === 2 && settled.bars.every(bb => bb.y > 0 && bb.y + bb.h <= natural + 2),
  'after the echo both bars are back inside the plot (' + JSON.stringify(settled.bars.map(x => Math.round(x.y))) + ')');
ok(settled.brackets === 1 && settled.spineY !== null && settled.spineY < Math.min(...settled.bars.map(x => x.y)),
  'the bracket is drawn above the bars (spine ' + Math.round(settled.spineY) + ')');

console.log('case 3: a committed Max below the data grows nothing');
await page.evaluate(async () => {
  window.__gb2_setOption('yMaxOverride', true);
  window.__gb2_setOption('yMax', 60);
  await new Promise(r => setTimeout(r, 2600));
});
const cut = await snap();
ok(cut.yMax === 60 && cut.ov === true, 'the Max is committed at 60 (' + cut.yMax + ')');
if (BROKEN) {
  ok(cut.shift > 20, 'CONTROL: the cut axis grew the canvas (shift ' + cut.shift + ', height ' + cut.h + ')');
} else {
  ok(near(cut.h, natural, 2) && cut.shift === 0,
    'the bracket off the axis did not grow the canvas (' + cut.h + ' px, shift ' + cut.shift + ')');
}
await page.evaluate(async () => {
  window.__gb2_setOption('yMaxOverride', false);
  await new Promise(r => setTimeout(r, 2600));
});
const back = await snap();
ok(near(back.h, natural, 2) && back.shift === 0 && back.spineY !== null && back.spineY > 0,
  'with the override cleared the chart is natural again and the bracket is on the canvas (spine ' + Math.round(back.spineY) + ')');

console.log('case 4: a real spine drag above the plot grows the canvas');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const spineHit = await page.evaluate(() => {
  const el = document.querySelector('.graphbuilder2-host svg [data-ann-id] [data-role="bracket-line-hit"]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const svg = el.ownerSVGElement.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, canvasTop: svg.top };
});
ok(!!spineHit, 'the bracket spine is grabbable');
// end 60 px above the canvas top edge
const lift = spineHit.y - spineHit.canvasTop + 60;
await page.mouse.move(spineHit.x, spineHit.y);
await page.mouse.down();
await page.mouse.move(spineHit.x, spineHit.y - 30, { steps: 4 });
await page.mouse.move(spineHit.x, spineHit.y - lift, { steps: 8 });
await page.waitForTimeout(150);
const mid = await snap();
ok(mid.shift > 20 && mid.h > natural + 20,
  'mid-drag the canvas grew (height ' + mid.h + ', shift ' + mid.shift + ')');
await page.mouse.up();
await page.waitForTimeout(2600);
const grown = await snap();
ok(grown.shift > 20 && grown.h > natural + 20,
  'after the release and its echo the room is kept (height ' + grown.h + ', shift ' + grown.shift + ')');
ok(grown.spineTopInCanvas !== null && grown.spineTopInCanvas >= 0,
  'the bracket sits inside the canvas (' + (grown.spineTopInCanvas && grown.spineTopInCanvas.toFixed(0)) + ' px from the top)');
ok(grown.bars.length === 2, 'both bars are still drawn');
const keptShift = grown.shift;

console.log('case 5: dragging the bracket back down gives the room back');
const spineHit2 = await page.evaluate(() => {
  const el = document.querySelector('.graphbuilder2-host svg [data-ann-id] [data-role="bracket-line-hit"]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
ok(!!spineHit2, 'the spine is grabbable again');
await page.mouse.move(spineHit2.x, spineHit2.y);
await page.mouse.down();
await page.mouse.move(spineHit2.x, spineHit2.y + 30, { steps: 4 });
await page.mouse.move(spineHit2.x, spineHit2.y + lift - 10, { steps: 8 });
await page.mouse.up();
// Before the commit's echo re-render (which rebuilds the engine and so
// resets the shift on any engine), only a redraw can give the room back.
await page.waitForTimeout(250);
const downPre = await snap();
await page.waitForTimeout(2600);
const down = await snap();
if (BROKEN) {
  ok(downPre.shift >= keptShift - 2,
    'CONTROL: before the echo the old engine keeps the shift after the bracket comes back (' + downPre.shift + ')');
} else {
  ok(near(downPre.h, natural, 2) && downPre.shift === 0,
    'the release redraw gives the room back before any echo (' + downPre.h + ' px, shift ' + downPre.shift + ')');
  ok(near(down.h, natural, 2) && down.shift === 0,
    'and the canvas is still natural after the echo (' + down.h + ' px, shift ' + down.shift + ')');
}
ok(down.brackets === 1 && down.spineY !== null && down.spineY > 0 && down.spineY < Math.min(...down.bars.map(x => x.y)),
  'the bracket is back just above the bars (spine ' + Math.round(down.spineY) + ')');

ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close();
console.log((fail ? 'FAIL ' : 'PASS ') + pass + ' passed, ' + fail + ' failed' + (BROKEN ? ' (control run, expecting the old behaviour)' : ''));
process.exit(fail ? 1 : 0);
