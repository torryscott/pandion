// Hover must never bake into an export, and handing the hover back must not
// over-reach.
//
// Hovering a mark arms a visual change (brighten, ring, thicken). The export
// harvest clones the LIVE svg, so whatever the pointer is doing at that moment
// is what lands in the copied, exported and saved file. Pandion used to defend
// against this with a hand-maintained table of "stash the old value, put it
// back on the clone", and that table drifted: 67 sites arm a hover, 14 stash.
// The harvest now fires each hovered element's own leave twin instead, which
// covers every site by construction. This probe is what keeps that true.
//
// For each target it indexes every element in the chart, hovers, harvests, and
// asserts three things:
//   1. the clone matches the PRE-hover chart everywhere
//   2. the live chart is unchanged afterwards, ANYWHERE, so the user sees
//      neither a flicker nor a mark left switched on that nothing can clear
//   3. the tooltip stays where the pointer is
//
// Each target runs twice: once on the most OVERLAPPED mark and once on the
// biggest. Depth matters because only the topmost element in a stack is
// hovered, so a re-arm reaching the ones underneath leaves them armed for good
// (the browser sends those no leave either). Size matters because the deepest
// mark is sometimes a sliver whose hover does nothing.
//
// Run:  node scripts/verify/hover-export-check.mjs
//       GB2_VERIFY_OUT=/tmp/gb2-verify   (fixtures, as the rest of the harness)
//
// NOTE: fixtures must be rendered with GB2_INLINE_BUNDLE=1. The default
// script-src build ships a ~20 KB stub whose bundle a file:// page cannot load.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';

// ESM `import` ignores NODE_PATH, so playwright is resolved from a list of
// candidate bases, the same way check.mjs does it.
function loadPlaywright() {
    const bases = [];
    if (process.env.GB2_NODE_BASE) bases.push(process.env.GB2_NODE_BASE);
    bases.push(
        new URL('.', import.meta.url).pathname,
        process.cwd(),
        '/tmp',
        '/private/tmp',
    );
    for (const b of bases) {
        try { return createRequire(path.join(b, 'x.js'))('playwright'); }
        catch { /* next base */ }
    }
    console.error(
        'playwright not found from any of: ' + bases.join(', ') + '\n' +
        'Install once with:  cd /tmp && npm i playwright && npx playwright install chromium\n' +
        '(or set GB2_NODE_BASE to a directory whose node_modules has it)');
    process.exit(2);
}

const { chromium } = loadPlaywright();
const OUT = process.env.GB2_VERIFY_OUT || '/tmp/gb2-verify';

// One hover target per rendering family. Point-shaped marks matter most: their
// hover paints a ring on an otherwise transparent hit element, which is both
// the most visible residue and the case the old stash table never covered.
const TARGETS = [
    ['cg_bar_labels.html', '[data-bar-cat]', 'Compare Groups bar'],
    ['cg_dot.html', '[data-role="line-marker"]', 'Compare Groups dot'],
    ['cg_raincloud.html', 'circle[pointer-events="all"]', 'raincloud point'],
    ['rm_bar.html', '[data-bar-cat]', 'Repeated Measures bar'],
    ['rm_line.html', '[data-role="line-series-hit"]', 'Repeated Measures line'],
    ['dist_hist.html', '[data-role="dist-hist-bar"]', 'histogram bin'],
    ['dist_qq_band.html', '[data-role="dist-qq-point"]', 'Q-Q point'],
    ['xy_basic.html', '[data-role="xy-point"]', 'scatter point'],
    ['xy_facet.html', '[data-role="xy-point"]', 'scatter point, faceted'],
    ['xy_heatmap.html', '[data-role="xy-bin"]', 'heatmap tile'],
    ['corr_heat.html', '[data-role="corr-cell"]', 'correlation cell'],
    ['likert_div.html', '[data-role="likert-seg"]', 'Likert segment'],
    ['likert_means.html', '[data-role="likert-dot-hit"]', 'Likert mean dot'],
    ['freq_pie.html', '[data-role="freq-slice"]', 'pie slice'],
    ['freq_bar_stack.html', '[data-bar-cat]', 'stacked frequency bar']
];

// The harvest reads the LAST RECORDED pointer position, which can outlive the
// pointer itself: leave the window without passing back over the chart and that
// position still names a mark. Firing "enter" at it afterwards would arm a hover
// nobody is pointing at, and no leave could ever clear it.
const STALE = [
    ['cg_bar_labels.html', '[data-bar-cat]', 'Compare Groups bar'],
    ['dist_hist.html', '[data-role="dist-hist-bar"]', 'histogram bin'],
    ['corr_heat.html', '[data-role="corr-cell"]', 'correlation cell'],
    ['freq_bar_stack.html', '[data-bar-cat]', 'stacked frequency bar']
];

// Three enter handlers position a tooltip from the event's own coordinates, so
// the harvest's synthetic events must carry the real pointer position.
const TIP = [
    ['xy_basic.html', '[data-role="xy-point"]', 'scatter point'],
    ['dist_qq_band.html', '[data-role="dist-qq-point"]', 'Q-Q point']
];

const STUB = `class GB2StubSvgView extends HTMLElement {}
try { customElements.define('jmv-results-svg', GB2StubSvgView); } catch (e) {}`;

const SNAP = `(root => { const out = {};
  root.querySelectorAll('[data-hl-i]').forEach(e => { const a = {};
    for (const at of e.attributes) if (at.name !== 'data-hl-i') a[at.name] = at.value;
    out[e.getAttribute('data-hl-i')] = a; });
  return out; })`;

// clone the chart the way jamovi's harvest does. The querySelector shadow
// is gone (Aug 2026): production parks a hidden sanitized TWIN wearing the
// jmv-results-svg-content class, rebuilt on render/redraw settle, and
// jamovi's class-first selector takes it. This fixture page has no
// jmv-results-svg wrapper at render time (the twin gate saw none and built
// nothing), so wrap the host now and ask the widget to build the twin,
// exactly as the first settle inside real jamovi would have.
const HARVEST = `(() => {
  const host = document.querySelector('.graphbuilder2-host');
  let item = document.querySelector('jmv-results-svg');
  if (!item) { item = document.createElement('jmv-results-svg');
               host.parentNode.insertBefore(item, host); item.appendChild(host); }
  if (host.__gb2_buildHarvestTwin) host.__gb2_buildHarvestTwin();
  return item.querySelector('svg.jmv-results-svg-content') ?? item.querySelector('svg'); })`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
await ctx.addInitScript(STUB);

let fail = 0, ran = 0, skipped = 0;
const problems = [];

async function open(file) {
    const page = await ctx.newPage();
    await page.goto('file://' + file);
    await page.waitForTimeout(2400);
    const n = await page.evaluate(`(() => {
      const s = document.querySelector('svg[data-role="gb2-chart-svg"]');
      if (!s) return -1;
      let i = 0; s.querySelectorAll('*').forEach(e => e.setAttribute('data-hl-i', String(i++)));
      return i; })()`);
    if (n < 0) { await page.close(); return null; }
    return page;
}

// strategy 'deep' = most overlapped mark, 'area' = biggest mark
function pickExpr(sel, strategy) {
    return `(() => {
      const s = document.querySelector('svg[data-role="gb2-chart-svg"]');
      let best = null, bDepth = -1, bA = -1;
      s.querySelectorAll(${JSON.stringify(sel)}).forEach(e => {
        const r = e.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1) return;
        const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
        const depth = document.elementsFromPoint(cx, cy).filter(n => s.contains(n)).length;
        const a = r.width * r.height;
        const better = ${strategy === 'deep'
            ? '(depth > bDepth || (depth === bDepth && a > bA))'
            : '(a > bA)'};
        if (better) { bDepth = depth; bA = a; best = e; }
      });
      if (!best) return null;
      const r = best.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, depth: bDepth }; })()`;
}

async function runCase(fixture, sel, label, strategy) {
    const tag = `${label}, ${strategy === 'deep' ? 'most overlapped' : 'largest'}`;
    const file = path.join(OUT, fixture);
    if (!existsSync(file)) { console.log(`  SKIP  ${tag} (no fixture ${fixture})`); skipped++; return; }
    const page = await open(file);
    if (!page) { console.log(`  SKIP  ${tag} (no chart svg)`); skipped++; return; }
    try {
        const pt = await page.evaluate(pickExpr(sel, strategy));
        if (!pt) { console.log(`  SKIP  ${tag} (no target ${sel})`); skipped++; return; }

        await page.mouse.move(5, 5);
        await page.waitForTimeout(300);
        const before = await page.evaluate(`(${SNAP})(document.querySelector('svg[data-role="gb2-chart-svg"]'))`);
        await page.mouse.move(pt.x, pt.y);
        await page.waitForTimeout(650);
        const after = await page.evaluate(`(${SNAP})(document.querySelector('svg[data-role="gb2-chart-svg"]'))`);

        const clone = await page.evaluate(`(() => { const c = (${HARVEST})(); return c ? (${SNAP})(c) : null; })()`);
        if (!clone) { console.log(`  SKIP  ${tag} (harvest produced no clone)`); skipped++; return; }
        const post = await page.evaluate(`(${SNAP})(document.querySelector('svg[data-role="gb2-chart-svg"]'))`);

        const changed = [];
        for (const i of Object.keys(before)) {
            const b = before[i], a = after[i] || {};
            for (const k of new Set([...Object.keys(b), ...Object.keys(a)]))
                if (b[k] !== a[k]) changed.push([i, k, b[k], a[k]]);
        }

        // 1. nothing the hover did may survive into the clone
        const norm = v => (v === undefined ? ' ' : String(v).replace(/\s+/g, ''));
        const leaks = [];
        for (const [i, k, b] of changed) {
            if (!clone[i]) continue;              // element stripped outright, cannot leak
            if (norm(clone[i][k]) !== norm(b)) leaks.push([i, k, b, clone[i][k]]);
        }
        // elements born during the hover count too; the harvest legitimately
        // adds its own title/desc/style to the clone root
        const born = await page.evaluate(`(() => {
          const c = (${HARVEST})();
          let extra = 0;
          c.querySelectorAll('*').forEach(e => {
            if (e.hasAttribute('data-hl-i')) return;
            if (e.parentNode === c && /^(title|desc|style)$/i.test(e.tagName)) return;
            extra++; });
          return extra; })()`);

        // 2. the live chart must come back BYTE-IDENTICAL. The harvest restores
        //    a snapshot rather than replaying hover events, so there is no
        //    reason to tolerate any difference at all, not even whitespace.
        const drift = [];
        for (const i of Object.keys(after)) {
            const a = after[i], q = post[i] || {};
            for (const k of new Set([...Object.keys(a), ...Object.keys(q)]))
                if (a[k] !== q[k]) drift.push([i, k, a[k], q[k]]);
        }

        ran++;
        const ok = leaks.length === 0 && born === 0 && drift.length === 0;
        if (!ok) fail++;
        let note = `changed=${String(changed.length).padStart(2)}  stack=${String(pt.depth).padStart(2)}`;
        if (!changed.length) note += '  (hover did not arm: weak assertion)';
        console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${tag.padEnd(44)} ${note}`);
        for (const [i, k, b, c] of leaks.slice(0, 4))
            problems.push(`${tag}: el#${i} ${k} should be ${JSON.stringify(b)}, clone has ${JSON.stringify(c)}`);
        if (born) problems.push(`${tag}: ${born} element(s) created by the hover survived into the clone`);
        for (const [i, k, a, q] of drift.slice(0, 4))
            problems.push(`${tag}: live chart drifted on el#${i} ${k}: ${JSON.stringify(a)} -> ${JSON.stringify(q)}`);
    } finally {
        await page.close();
    }
}

for (const [fixture, sel, label] of TARGETS) {
    await runCase(fixture, sel, label, 'deep');
    await runCase(fixture, sel, label, 'area');
}

console.log('');
for (const [fixture, sel, label] of STALE) {
    const file = path.join(OUT, fixture);
    if (!existsSync(file)) { console.log(`  SKIP  stale pointer, ${label}`); skipped++; continue; }
    const page = await open(file);
    if (!page) { console.log(`  SKIP  stale pointer, ${label}`); skipped++; continue; }
    try {
        const pt = await page.evaluate(pickExpr(sel, 'deep'));
        if (!pt) { console.log(`  SKIP  stale pointer, ${label}`); skipped++; continue; }
        const read = () => page.evaluate(`(${SNAP})(document.querySelector('svg[data-role="gb2-chart-svg"]'))`);

        // cross the chart the way a user does, then leave it entirely: the
        // browser clears the hover, but the recorded position still names a
        // mark because the menu the user moved onto is outside this document
        await page.mouse.move(pt.x, pt.y);
        await page.waitForTimeout(400);
        await page.mouse.move(5, 5);
        await page.waitForTimeout(400);
        const was = await read();
        await page.evaluate(`(() => { window.__gb2_ptrX = ${pt.x}; window.__gb2_ptrY = ${pt.y}; })()`);
        await page.evaluate(`(() => { (${HARVEST})(); })()`);
        await page.waitForTimeout(200);
        const now = await read();

        const stuck = [];
        for (const i of Object.keys(was)) {
            const a = was[i], q = now[i] || {};
            for (const k of new Set([...Object.keys(a), ...Object.keys(q)]))
                if (a[k] !== q[k]) stuck.push([i, k, a[k], q[k]]);
        }
        ran++;
        if (stuck.length) {
            fail++;
            console.log(`  FAIL  stale pointer, ${label}`);
            for (const [i, k, a, q] of stuck.slice(0, 4))
                problems.push(`stale pointer, ${label}: el#${i} ${k} went ${JSON.stringify(a)} -> ${JSON.stringify(q)} with nothing pointing at it`);
        } else {
            console.log(`  ok    stale pointer, ${label}`);
        }
    } finally {
        await page.close();
    }
}

console.log('');
for (const [fixture, sel, label] of TIP) {
    const file = path.join(OUT, fixture);
    if (!existsSync(file)) { console.log(`  SKIP  tooltip stays put, ${label}`); skipped++; continue; }
    const page = await open(file);
    if (!page) { console.log(`  SKIP  tooltip stays put, ${label}`); skipped++; continue; }
    try {
        const pt = await page.evaluate(pickExpr(sel, 'area'));
        if (!pt) { console.log(`  SKIP  tooltip stays put, ${label}`); skipped++; continue; }
        const tip = () => page.evaluate(`(() => {
          const t = document.querySelector('[data-role="xy-tooltip"]');
          if (!t || t.style.display === 'none') return null;
          const r = t.getBoundingClientRect();
          return { x: Math.round(r.x), y: Math.round(r.y) }; })()`);

        await page.mouse.move(pt.x, pt.y);
        await page.waitForTimeout(650);
        const was = await tip();
        if (!was) { console.log(`  SKIP  tooltip stays put, ${label} (no tooltip shown)`); skipped++; continue; }
        await page.evaluate(`(() => { (${HARVEST})(); })()`);
        await page.waitForTimeout(150);
        const now = await tip();

        ran++;
        // it may legitimately hide; what it must not do is jump somewhere else
        const moved = now && (Math.abs(now.x - was.x) > 4 || Math.abs(now.y - was.y) > 4);
        if (moved) {
            fail++;
            console.log(`  FAIL  tooltip stays put, ${label}`);
            problems.push(`tooltip stays put, ${label}: jumped from (${was.x}, ${was.y}) to (${now.x}, ${now.y}) after the harvest`);
        } else {
            console.log(`  ok    tooltip stays put, ${label}`);
        }
    } finally {
        await page.close();
    }
}

await browser.close();

console.log('');
if (problems.length) {
    console.log('problems:');
    for (const p of problems) console.log('  - ' + p);
    console.log('');
}
console.log(`hover-export: ${ran - fail}/${ran} targets clean, ${skipped} skipped`);
process.exit(fail ? 1 : 0);
