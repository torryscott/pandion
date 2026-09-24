// Point marks (Sep 2026), driven in a headless browser over the pages
// marks-render.R writes.
//
//   GB2_MARKS_OUT=/tmp/gb2-marks node scripts/verify/marks-check.mjs
//
// "Mark points by" colors and shapes each data point by a second
// variable while the bars, boxes and means keep pooling every point.
// Real mouse gestures for everything the user clicks on the chart
// (synthetic clicks are blind to the pointer routing), and a mock
// window.setOption to read what the chart commits. Each section catches
// its own error, so a control run against an engine without the feature
// still exercises every section.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

function loadPlaywright() {
    const bases = [process.env.GB2_NODE_BASE, process.cwd(), '/tmp', '/private/tmp']
        .filter(Boolean);
    for (const base of bases) {
        try { return createRequire(path.join(base, 'x.js'))('playwright'); }
        catch { /* try next */ }
    }
    console.error('playwright not found');
    process.exit(2);
}

const { chromium } = loadPlaywright();
const OUT = process.env.GB2_MARKS_OUT || '/tmp/gb2-marks';
const expected = JSON.parse(fs.readFileSync(path.join(OUT, 'expected.json'), 'utf8'));

let failures = 0;
function expect(label, condition, detail = '') {
    if (condition) console.log('  ok: ' + label + (detail ? ' ' + detail : ''));
    else {
        failures++;
        console.log('  FAIL: ' + label + (detail ? ' ' + detail : ''));
    }
}

const browser = await chromium.launch();

async function open(name) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(() => {
        window.__commits = [];
        window.setOption = (k, v) => { window.__commits.push([k, v]); };
    });
    await page.goto('file://' + path.join(OUT, name + '.html'));
    await page.waitForFunction(() => document.querySelector('[data-role="gb2-chart-svg"]'), null, { timeout: 15000 });
    await page.waitForTimeout(400);
    await page.mouse.move(1, 1);
    page.__errors = errors;
    return { ctx, page };
}

// Everything committed so far, with chartSpec exploded into its keys.
async function flush(page) {
    return page.evaluate(() => {
        try { window.__gb2_inspectorInputAt = 0; } catch (e) {}
        window.dispatchEvent(new Event('beforeunload'));
        const out = { real: {}, spec: {} };
        for (const [k, v] of window.__commits) {
            if (k === 'chartSpec') {
                try { Object.assign(out.spec, JSON.parse(v)); } catch (e) {}
            } else out.real[k] = v;
        }
        return out;
    });
}

async function clickAt(page, x, y) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(250);
}
async function center(page, selector, frac = 0.5) {
    return page.evaluate(([sel, f]) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width * f, y: r.top + r.height / 2, w: r.width, h: r.height };
    }, [selector, frac]);
}
async function clickSel(page, selector, frac = 0.5) {
    const c = await center(page, selector, frac);
    if (!c) return false;
    await clickAt(page, c.x, c.y);
    return true;
}

// Per point: its mark, tag and fill.
async function pointsInfo(page) {
    return page.evaluate(() => Array.from(document.querySelectorAll('[data-role="data-point"]')).map(p => ({
        mark: p.getAttribute('data-point-mark'),
        tag: p.tagName.toLowerCase(),
        fill: p.getAttribute('fill'),
        stroke: p.getAttribute('stroke'),
        pts: (p.getAttribute('points') || '').trim().split(/\s+/).filter(Boolean).length,
        cat: p.getAttribute('data-point-cat'),
        idx: Number(p.getAttribute('data-point-idx')),
        size: p.getBoundingClientRect().width,
    })));
}
async function keyInfo(page) {
    return page.evaluate(() => {
        const g = document.querySelector('[data-role="mark-legend"]');
        if (!g) return null;
        const title = g.querySelector('[data-role="mark-legend-title"]');
        return {
            title: title ? title.textContent : null,
            titleTop: title ? title.getBoundingClientRect().top : null,
            rows: Array.from(g.querySelectorAll('[data-role="mark-legend-row"]')).map(r => ({
                level: r.getAttribute('data-mark-level'),
                label: r.querySelector('[data-role="mark-legend-label"]').textContent,
                tag: r.querySelector('[data-role="mark-legend-swatch"]').tagName.toLowerCase(),
                fill: r.querySelector('[data-role="mark-legend-swatch"]').getAttribute('fill'),
            })),
        };
    });
}
const uniq = a => Array.from(new Set(a));
// A point whose centre really lands on its own hit halo (points overlap,
// and error bars and other halos can sit on top).
async function pointTarget(page, mark) {
    return page.evaluate(m => {
        const sel = m == null ? '[data-role="data-point"]' : '[data-role="data-point"][data-point-mark="' + m + '"]';
        for (const p of document.querySelectorAll(sel)) {
            p.scrollIntoView({ block: 'center' });
            const r = p.getBoundingClientRect();
            const x = r.left + r.width / 2, y = r.top + r.height / 2;
            const hit = document.elementFromPoint(x, y);
            if (hit && hit.getAttribute('data-point-idx') === p.getAttribute('data-point-idx') &&
                hit.getAttribute('data-point-cat') === p.getAttribute('data-point-cat')) return { x, y };
        }
        return null;
    }, mark);
}

// ------------------------------------------------------------ marks
console.log('== point marks: the first mark variable shows legible, marked points');
try {
    const { ctx, page } = await open('mk_bar');
    const pts = await pointsInfo(page);
    expect('the points appear although the chart had them off', pts.length === 31, '(' + pts.length + ')');
    expect('every point carries its mark', pts.every(p => p.mark !== null));
    const F = pts.filter(p => p.mark === 'F'), M = pts.filter(p => p.mark === 'M'), U = pts.filter(p => p.mark === '');
    expect('F points share one filled circle look',
        F.length > 0 && F.every(p => p.tag === 'circle') && uniq(F.map(p => p.fill)).length === 1);
    expect('M points share one square look',
        M.length > 0 && M.every(p => p.tag === 'rect') && uniq(M.map(p => p.fill)).length === 1);
    expect('F and M differ in color', F[0] && M[0] && F[0].fill !== M[0].fill);
    expect('the point without a recorded sex is an open gray circle',
        U.length === 1 && U[0].tag === 'circle' && U[0].fill === 'none' && /#8a8a8a/i.test(U[0].stroke || ''));
    expect('the points were raised to a legible size', pts.every(p => p.size >= 5.5), '(' + Math.min(...pts.map(p => p.size)).toFixed(1) + 'px)');
    const key = await keyInfo(page);
    expect('the key names the variable', key && key.title === 'sex');
    expect('the key lists F, M, Not recorded',
        key && JSON.stringify(key.rows.map(r => r.label)) === JSON.stringify(['F', 'M', 'Not recorded']));
    expect('key swatches match the points',
        key && key.rows[0].tag === 'circle' && key.rows[0].fill === F[0].fill &&
        key.rows[1].tag === 'rect' && key.rows[1].fill === M[0].fill);
    const c = await flush(page);
    expect('commits the points on', c.real.showDataPoints === true, JSON.stringify(c.real));
    expect('stamps markAutoShown and the legible size + opacity',
        c.spec.markAutoShown === true && c.spec.pointSize === 6 && c.spec.pointOpacity === 0.9,
        JSON.stringify({ a: c.spec.markAutoShown, s: c.spec.pointSize, o: c.spec.pointOpacity }));
    expect('no page errors', page.__errors.length === 0, page.__errors.join(' | '));

    // Bars pool every point: identical to the chart without marks.
    const heights = async p => p.evaluate(() => Array.from(
        document.querySelectorAll('[data-bar-cat]:not([data-role])')).map(b => +b.getBoundingClientRect().height.toFixed(2)));
    const hMarked = await heights(page);
    // Same axis on both: the unmarked chart also shows its points.
    const other = await open('mk_none_points');
    const hPlain = await heights(other.page);
    expect('bar heights equal the unmarked chart (the means still pool every point)',
        hMarked.length === 2 && JSON.stringify(hMarked) === JSON.stringify(hPlain),
        JSON.stringify([hMarked, hPlain]));
    expect('an unmarked chart draws no key', (await keyInfo(other.page)) === null);
    await other.ctx.close();

    console.log('== point marks: the Marks tab edits a level');
    const mPt = await pointTarget(page, 'M');
    expect('an M point is clickable', !!mPt);
    await clickAt(page, mPt.x, mPt.y);
    await page.waitForTimeout(300);
    const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('[data-dp-tab]')).map(b => b.textContent.trim()));
    expect('the Data points panel has a Marks tab', tabs.includes('Marks'), JSON.stringify(tabs));
    const onMarks = await page.evaluate(() => {
        const pane = document.querySelector('[data-dp-tab-pane="marks"]');
        return !!pane && pane.style.display !== 'none';
    });
    expect('clicking a marked point opens the Marks tab', onMarks);
    const cur = await page.evaluate(() => {
        const b = document.querySelector('[data-dp-tab-pane="marks"] [data-field="mark-color"][data-mark-cur="1"]');
        if (!b) return null;
        const row = b.closest('[data-mark-row]');
        return row.querySelector('span').textContent;
    });
    expect('the clicked level (M) is the current row', cur === 'M', String(cur));
    const scopeShown = () => page.evaluate(() => Array.from(document.querySelectorAll('[data-dp-scope]'))
        .some(b => b.getClientRects().length > 0));
    expect('the Marks tab has no This/All scope toggle', !(await scopeShown()));
    await clickSel(page, '[data-dp-tab="point"]');
    expect('the Points tab brings the toggle back', await scopeShown());
    const note = await page.evaluate(() => {
        const n = document.querySelector('[data-field="dp-marks-note"]');
        return n ? n.textContent : null;
    });
    expect('the Points tab says where the colors and shapes come from', !!note && /Marks tab/.test(note), String(note));
    await clickSel(page, '[data-dp-tab="marks"]');
    await clickSel(page, '[data-dp-tab-pane="marks"] [data-field="mark-shape"][data-mark-i="1"][data-val="diamond"]');
    const afterShape = await pointsInfo(page);
    const M2 = afterShape.filter(p => p.mark === 'M');
    expect('M points redraw as diamonds', M2.length > 0 && M2.every(p => p.tag === 'polygon' && p.pts === 4));
    expect('F points keep their circles', afterShape.filter(p => p.mark === 'F').every(p => p.tag === 'circle'));
    const k2 = await keyInfo(page);
    expect('the key follows (M is a diamond)', k2 && k2.rows[1].tag === 'polygon');
    const c2 = await flush(page);
    const st = (c2.spec.pointMarkStyles || []).find(e => e.level === 'M');
    expect('commits pointMarkStyles for M', st && st.shape === 'diamond', JSON.stringify(c2.spec.pointMarkStyles));

    await clickSel(page, '[data-dp-tab-pane="marks"] [data-field="mark-legend-show"]');
    await page.waitForTimeout(400);
    expect('unchecking "Show the key" removes the key', (await keyInfo(page)) === null);
    const c3 = await flush(page);
    expect('commits the key as hidden', Array.isArray(c3.spec.hiddenElements) && c3.spec.hiddenElements.includes('markLegend'),
        JSON.stringify(c3.spec.hiddenElements));
    expect('no page errors after editing', page.__errors.length === 0, page.__errors.join(' | '));
    await ctx.close();
} catch (e) { expect('section ran to the end', false, String((e && e.message) || e)); }

console.log('== point marks: stored colors and shapes');
try {
    const { ctx, page } = await open('mk_bar_styled');
    const pts = await pointsInfo(page);
    expect('F points are red triangles', pts.filter(p => p.mark === 'F').every(p => p.tag === 'polygon' && p.pts === 3 && p.fill === '#c2242c'));
    expect('M points are blue squares', pts.filter(p => p.mark === 'M').every(p => p.tag === 'rect' && p.fill === '#2d5c94'));
    const c = await flush(page);
    expect('an already-stamped chart does not re-adjust anything', c.spec.markAutoShown === undefined && c.real.showDataPoints === undefined,
        JSON.stringify(c));
    // The key opens the Marks tab on its row.
    await clickSel(page, '[data-role="mark-legend-row"][data-mark-level="F"] [data-role="mark-legend-label"]');
    await page.waitForTimeout(300);
    const cur = await page.evaluate(() => {
        const pane = document.querySelector('[data-dp-tab-pane="marks"]');
        if (!pane || pane.style.display === 'none') return null;
        const b = pane.querySelector('[data-field="mark-color"][data-mark-cur="1"]');
        return b ? b.closest('[data-mark-row]').querySelector('span').textContent : null;
    });
    expect('clicking the key opens the Marks tab on that level', cur === 'F', String(cur));
    await ctx.close();
} catch (e) { expect('section ran to the end', false, String((e && e.message) || e)); }

console.log('== point marks: hidden key, hidden point, other chart types');
try {
    const a = await open('mk_bar_nokey');
    expect('a hidden key stays hidden', (await keyInfo(a.page)) === null);
    expect('its points are still marked', (await pointsInfo(a.page)).every(p => p.mark !== null));
    await a.ctx.close();

    const b = await open('mk_bar_hidden');
    const pts = await pointsInfo(b.page);
    const ghosts = await b.page.evaluate(() => document.querySelectorAll('[data-role="data-point-hidden"]').length);
    expect('one hidden point draws as a ghost, 30 stay', pts.length === 30 && ghosts === 1, '(' + pts.length + ', ' + ghosts + ')');
    const byCat = Object.fromEntries(expected.map(e => [e.x, e.marks]));
    const aligned = pts.every(p => byCat[p.cat] && byCat[p.cat][p.idx] === p.mark);
    expect('every remaining point keeps its own mark (alignment survives the hide)', aligned);
    await b.ctx.close();

    const c = await open('mk_box_grouped');
    const kc = await keyInfo(c.page);
    const lastGroupRow = await c.page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('[data-legend-row]'));
        return rows.length ? Math.max(...rows.map(r => r.getBoundingClientRect().bottom)) : null;
    });
    expect('box plot: marked points', (await pointsInfo(c.page)).every(p => p.mark !== null));
    expect('the key sits under the group legend', kc && lastGroupRow != null && kc.titleTop > lastGroupRow,
        JSON.stringify([kc && kc.titleTop, lastGroupRow]));
    await c.ctx.close();

    const d = await open('mk_rain');
    const rp = await pointsInfo(d.page);
    expect('raincloud: the rain is marked', rp.length === 31 && rp.every(p => p.mark !== null));
    expect('raincloud: key drawn', (await keyInfo(d.page)) !== null);
    await d.ctx.close();

    const e = await open('mk_none_points');
    const ep = await pointsInfo(e.page);
    expect('no mark variable: plain points, no marks', ep.length === 31 && ep.every(p => p.mark === null));
    const pt0 = await pointTarget(e.page, null);
    await clickAt(e.page, pt0.x, pt0.y);
    await e.page.waitForTimeout(300);
    const tabs = await e.page.evaluate(() => Array.from(document.querySelectorAll('[data-dp-tab]')).map(t => t.textContent.trim()));
    expect('no mark variable: no Marks tab', tabs.length > 0 && !tabs.includes('Marks'), JSON.stringify(tabs));
    await e.ctx.close();
} catch (e) { expect('section ran to the end', false, String((e && e.message) || e)); }

console.log('== point marks with the Line marker shape');
try {
    const m = await open('ml_dot_marks');
    const LM = await m.page.evaluate(() => Array.from(
        document.querySelectorAll('[data-role="line-marker"]')).map(x => x.getAttribute('data-marker-shape')));
    expect('mean lines and marked points together', LM.length === 2 && LM.every(x => x === 'line') &&
        (await pointsInfo(m.page)).every(p => p.mark !== null) && (await keyInfo(m.page)) !== null);
    expect('no page errors', m.page.__errors.length === 0, m.page.__errors.join(' | '));
    await m.ctx.close();
} catch (e) { expect('section ran to the end', false, String((e && e.message) || e)); }

await browser.close();
if (failures > 0) {
    console.log(failures + ' check(s) failed');
    process.exit(1);
}
console.log('all point-mark checks passed');
