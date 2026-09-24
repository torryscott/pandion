// Point marks (Sep 2026), driven in a headless browser over the pages
// marks-render.R writes.
//
//   GB2_MARKS_OUT=/tmp/gb2-marks node scripts/verify/marks-check.mjs
//
// "Mark points by" colors and shapes each data point by a second
// variable while the bars, boxes and means keep pooling every point.
// The marks are edited through the ordinary Data points panel (Color and
// Shape scoped over the mark levels), and the key beside the chart is a
// chart part like the legend: draggable, its title and labels renamable,
// hidden from the Legend panel. Real mouse gestures for everything the
// user clicks on the chart (synthetic clicks are blind to the pointer
// routing), and a mock window.setOption to read what the chart commits.
// Each section catches its own error, so a control run against an engine
// without the feature still exercises every section.

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
const visible = (page, sel) => page.evaluate(s => {
    const el = document.querySelector(s);
    return !!el && el.getClientRects().length > 0;
}, sel);
const text = (page, sel) => page.evaluate(s => {
    const el = document.querySelector(s);
    return el ? el.textContent.trim() : null;
}, sel);
const panelTitle = page => page.evaluate(() => {
    const t = document.querySelector('[data-role="inspector-title"]');
    return t ? t.textContent.replace(/\s+/g, ' ').trim() : null;
});
// Type into the text panel's box and commit with Enter.
async function rename(page, value) {
    const box = page.locator('textarea[data-field="text-content"]');
    await box.click();
    await box.fill(value);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
}
const lower = s => String(s || '').toLowerCase();
// A color as the browser reads an inline style back: "rgb(r, g, b)".
function asRgb(c) {
    const m = /^#([0-9a-f]{6})$/i.exec(String(c || '').trim());
    if (!m) return lower(c);
    const n = parseInt(m[1], 16);
    return 'rgb(' + (n >> 16) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ')';
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
        const m = /translate\(\s*([-\d.]+)[ ,]+([-\d.]+)/.exec(g.getAttribute('transform') || '');
        return {
            title: title ? title.textContent : null,
            titleTop: title ? title.getBoundingClientRect().top : null,
            tx: m ? Number(m[1]) : 0, ty: m ? Number(m[2]) : 0,
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
// The scope toggle as the user reads it (null when not offered).
async function scopeRow(page) {
    return page.evaluate(() => {
        const g = document.querySelector('[data-dp-scope="group"]');
        const a = document.querySelector('[data-dp-scope="all"]');
        if (!g || !a || !g.getClientRects().length) return null;
        return { group: g.textContent.trim(), all: a.textContent.trim() };
    });
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

    console.log('== point marks: the Data points panel edits the clicked level');
    const mPt = await pointTarget(page, 'M');
    expect('an M point is clickable', !!mPt);
    await clickAt(page, mPt.x, mPt.y);
    await page.waitForTimeout(300);
    const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('[data-dp-tab]')).map(b => b.textContent.trim()));
    expect('the Data points panel opens on its Points tab, no Marks tab',
        tabs.length > 0 && !tabs.includes('Marks') && (await visible(page, '[data-dp-tab-pane="point"]')), JSON.stringify(tabs));
    let sc = await scopeRow(page);
    expect('the Color strip scopes over the mark levels: M / All levels',
        !!sc && sc.group === 'M' && sc.all === 'All levels', JSON.stringify(sc));
    expect('"Follow graph colors" is not offered while the points are marked',
        !(await page.evaluate(() => !!document.querySelector('[data-field="color-auto"]'))));
    const chip = await page.evaluate(() => {
        const b = document.querySelector('[data-dp-strip="point-color"] [data-field="color-btn"]');
        return b ? b.style.background : null;
    });
    expect('the Color chip shows the M color', asRgb(chip) === asRgb(M[0].fill), String(chip) + ' vs ' + M[0].fill);
    const hint = await text(page, '[data-field="dp-marks-hint"]');
    expect('the Color strip says what the colors mark', !!hint && /sex/.test(hint) && /Reset/.test(hint), String(hint));

    await clickSel(page, '[data-dp-btn="point-shape"]');
    sc = await scopeRow(page);
    expect('the Shape strip scopes over the mark levels too', !!sc && sc.group === 'M' && sc.all === 'All levels', JSON.stringify(sc));
    await clickSel(page, '[data-preset-shape="diamond"]');
    const afterShape = await pointsInfo(page);
    const M2 = afterShape.filter(p => p.mark === 'M');
    expect('M points redraw as diamonds', M2.length > 0 && M2.every(p => p.tag === 'polygon' && p.pts === 4));
    expect('F points keep their circles', afterShape.filter(p => p.mark === 'F').every(p => p.tag === 'circle'));
    const k2 = await keyInfo(page);
    expect('the key follows (M is a diamond)', k2 && k2.rows[1].tag === 'polygon');
    const c2 = await flush(page);
    const st = (c2.spec.pointMarkStyles || []).find(e => e.level === 'M');
    expect('commits pointMarkStyles for M', st && st.shape === 'diamond', JSON.stringify(c2.spec.pointMarkStyles));
    expect('the chart-wide point shape is left alone', c2.spec.pointShape === undefined && c2.real.pointShape === undefined,
        JSON.stringify({ spec: c2.spec.pointShape, real: c2.real.pointShape }));

    await clickSel(page, '[data-dp-scope="all"]');
    await clickSel(page, '[data-preset-shape="square"]');
    const afterAll = await pointsInfo(page);
    expect('All levels: every point takes the shape', afterAll.every(p => p.tag === 'rect'));
    const c3 = await flush(page);
    const stAll = c3.spec.pointMarkStyles || [];
    expect('commits every level', ['F', 'M', ''].every(l => (stAll.find(e => e.level === l) || {}).shape === 'square'),
        JSON.stringify(stAll));

    await clickSel(page, '[data-dp-btn="point-size"]');
    sc = await scopeRow(page);
    expect('the Size strip keeps the ordinary bar scope', !!sc && sc.all === 'All bars', JSON.stringify(sc));

    // The panel reopens on the strip the Points tab remembers (Size, just
    // clicked): the row follows the strip in view.
    const uPt = await pointTarget(page, '');
    expect('the Not recorded point is clickable', !!uPt);
    await clickAt(page, uPt.x, uPt.y);
    await page.waitForTimeout(300);
    sc = await scopeRow(page);
    expect('reopened on the remembered Size strip: the bar scope', !!sc && sc.all === 'All bars', JSON.stringify(sc));
    await clickSel(page, '[data-dp-btn="point-color"]');
    sc = await scopeRow(page);
    expect('back on Color: the Not recorded level scopes as Not recorded / All levels',
        !!sc && sc.group === 'Not recorded' && sc.all === 'All levels', JSON.stringify(sc));
    await clickAt(page, mPt.x, mPt.y);
    await page.waitForTimeout(300);
    await clickSel(page, '[data-dp-btn="point-color"]');
    // The link sits inside a wrapping sentence: click its own line box.
    await page.locator('[data-field="mark-reset"]').click();
    await page.waitForTimeout(300);
    const afterReset = await pointsInfo(page);
    expect('Reset restores the default colors and shapes',
        afterReset.filter(p => p.mark === 'F').every(p => p.tag === 'circle') &&
        afterReset.filter(p => p.mark === 'M').every(p => p.tag === 'rect'));
    const c4 = await flush(page);
    expect('commits the empty store', Array.isArray(c4.spec.pointMarkStyles) && c4.spec.pointMarkStyles.length === 0,
        JSON.stringify(c4.spec.pointMarkStyles));

    console.log('== point marks: the key is hidden from the Legend panel');
    await clickSel(page, '[data-role="mark-legend-row"][data-mark-level="M"] [data-role="mark-legend-swatch"]');
    await page.waitForTimeout(300);
    expect('a key swatch opens the Legend panel', /legend/i.test(await panelTitle(page) || ''), String(await panelTitle(page)));
    const eye = 'button[aria-label="Hide Points key"]';
    expect('the panel offers the key\'s eye', await visible(page, eye));
    await clickSel(page, eye);
    await page.waitForTimeout(500);
    expect('the eye hides the key', (await keyInfo(page)) === null);
    const c5 = await flush(page);
    expect('commits the key as hidden', Array.isArray(c5.spec.hiddenElements) && c5.spec.hiddenElements.includes('markLegend'),
        JSON.stringify(c5.spec.hiddenElements));
    expect('no page errors after editing', page.__errors.length === 0, page.__errors.join(' | '));
    await ctx.close();
} catch (e) { expect('section ran to the end', false, String((e && e.message) || e)); }

console.log('== point marks: stored colors and shapes; the key is a chart part');
try {
    const { ctx, page } = await open('mk_bar_styled');
    const pts = await pointsInfo(page);
    expect('F points are red triangles', pts.filter(p => p.mark === 'F').every(p => p.tag === 'polygon' && p.pts === 3 && p.fill === '#c2242c'));
    expect('M points are blue squares', pts.filter(p => p.mark === 'M').every(p => p.tag === 'rect' && p.fill === '#2d5c94'));
    const c = await flush(page);
    expect('an already-stamped chart does not re-adjust anything', c.spec.markAutoShown === undefined && c.real.showDataPoints === undefined,
        JSON.stringify(c));
    // A label opens its text panel and renames the level in the key.
    await clickSel(page, '[data-role="mark-legend-row"][data-mark-level="F"] [data-role="mark-legend-label"]');
    await page.waitForTimeout(300);
    expect('clicking a key label opens its text panel', /points key label/i.test(await panelTitle(page) || ''), String(await panelTitle(page)));
    await rename(page, 'Female');
    let k = await keyInfo(page);
    expect('the label reads the new name', k && k.rows[0].label === 'Female', JSON.stringify(k && k.rows.map(r => r.label)));
    let cc = await flush(page);
    expect('commits markRelabels', JSON.stringify(cc.spec.markRelabels) === JSON.stringify([{ original: 'F', relabel: 'Female' }]),
        JSON.stringify(cc.spec.markRelabels));
    // The title too.
    await clickSel(page, '[data-role="mark-legend-title"]');
    await page.waitForTimeout(300);
    expect('clicking the key title opens its text panel', /points key title/i.test(await panelTitle(page) || ''), String(await panelTitle(page)));
    await rename(page, 'Sex of mouse');
    k = await keyInfo(page);
    expect('the title reads the new name', k && k.title === 'Sex of mouse', String(k && k.title));
    cc = await flush(page);
    expect('commits markTitle', cc.spec.markTitle === 'Sex of mouse', String(cc.spec.markTitle));
    // Drag the key by its empty space.
    const bg = await page.evaluate(() => {
        const r = document.querySelector('[data-role="mark-legend-bg"]');
        if (!r) return null;
        const b = r.getBoundingClientRect();
        return { x: b.left + 2, y: b.top + 2, w: b.width, h: b.height };
    });
    expect('the key has a drag target behind it', !!bg && bg.w > 20 && bg.h > 20, JSON.stringify(bg));
    const before = await keyInfo(page);
    await page.mouse.move(bg.x, bg.y);
    await page.mouse.down();
    await page.mouse.move(bg.x - 20, bg.y + 20, { steps: 6 });
    await page.mouse.move(bg.x - 40, bg.y + 40, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const after = await keyInfo(page);
    expect('the key follows the drag', !!after && after.tx < before.tx - 20 && after.ty > before.ty + 20,
        JSON.stringify([before && [before.tx, before.ty], after && [after.tx, after.ty]]));
    cc = await flush(page);
    expect('commits the key offset', typeof cc.spec.markLegendOffsetX === 'number' && cc.spec.markLegendOffsetX <= -20 &&
        typeof cc.spec.markLegendOffsetY === 'number' && cc.spec.markLegendOffsetY >= 20,
        JSON.stringify([cc.spec.markLegendOffsetX, cc.spec.markLegendOffsetY]));
    expect('no page errors', page.__errors.length === 0, page.__errors.join(' | '));
    await ctx.close();
} catch (e) { expect('section ran to the end', false, String((e && e.message) || e)); }

console.log('== point marks: a saved key title, relabel and offset render');
try {
    const { ctx, page } = await open('mk_bar_named');
    const k = await keyInfo(page);
    expect('the saved title shows', k && k.title === 'Sex of mouse', String(k && k.title));
    expect('the saved relabel shows, the rest keep their names',
        k && JSON.stringify(k.rows.map(r => r.label)) === JSON.stringify(['Female', 'M', 'Not recorded']),
        JSON.stringify(k && k.rows.map(r => r.label)));
    expect('the saved offset moves the key', k && k.tx === 20 && k.ty >= 10, JSON.stringify(k && [k.tx, k.ty]));
    await ctx.close();
} catch (e) { expect('section ran to the end', false, String((e && e.message) || e)); }

console.log('== point marks: points already on keep their size');
try {
    const { ctx, page } = await open('mk_bar_ptson');
    const pts = await pointsInfo(page);
    expect('marked, at the size the user had', pts.length === 31 && pts.every(p => p.mark !== null && p.size < 5.5),
        '(' + Math.max(...pts.map(p => p.size)).toFixed(1) + 'px)');
    const c = await flush(page);
    // The chartSpec blob is cumulative: pointSize 4 is the fixture's own
    // value, still 4 (not raised to 6), and no opacity was written.
    expect('stamps markAutoShown without touching size or opacity',
        c.spec.markAutoShown === true && c.spec.pointSize === 4 && c.spec.pointOpacity === undefined &&
        c.real.showDataPoints === undefined, JSON.stringify(c));
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
    await clickSel(c.page, '[data-role="mark-legend-row"][data-mark-level="F"] [data-role="mark-legend-swatch"]');
    await c.page.waitForTimeout(300);
    expect('grouped: the Legend panel offers both eyes',
        (await visible(c.page, 'button[aria-label="Hide Legend"]')) && (await visible(c.page, 'button[aria-label="Hide Points key"]')));
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
    const sc0 = await scopeRow(e.page);
    expect('no mark variable: the ordinary scope toggle and "Follow graph colors"',
        !!sc0 && sc0.all === 'All bars' && (await visible(e.page, '[data-field="color-auto"]')), JSON.stringify(sc0));
    await e.ctx.close();
} catch (e) { expect('section ran to the end', false, String((e && e.message) || e)); }

console.log('== a first click on the open-shape level: the row reads that level');
try {
    // The Not recorded level's default shape is open, which makes the
    // Outline tab land on Width (a programmatic click) while the panel
    // opens; the Points tab's scope row must still read the Color strip
    // it shows, not the strip that click touched.
    const { ctx, page } = await open('mk_bar');
    const uPt = await pointTarget(page, '');
    await clickAt(page, uPt.x, uPt.y);
    await page.waitForTimeout(300);
    const sc = await scopeRow(page);
    expect('fresh panel on the Not recorded point: Not recorded / All levels',
        !!sc && sc.group === 'Not recorded' && sc.all === 'All levels', JSON.stringify(sc));
    const shown = await page.evaluate(() => { const s = document.querySelector('[data-dp-strip="point-color"]'); return !!s && s.style.display !== 'none'; });
    expect('and the Color strip is the one in view', shown);
    await ctx.close();
} catch (e) { expect('section ran to the end', false, String((e && e.message) || e)); }

console.log('== the point menu: dismissing it clears the selection ring');
try {
    const { ctx, page } = await open('mk_bar_styled');
    const ring = () => page.evaluate(() => document.querySelectorAll('[data-role="data-point-selected"]').length);
    const menu = () => page.evaluate(() => !!document.querySelector('[data-role="gb2-point-menu"]'));
    const pt = await pointTarget(page, 'M');
    await page.mouse.click(pt.x, pt.y, { button: 'right' });
    await page.waitForTimeout(300);
    expect('a right-click opens the point menu with the ring', (await menu()) && (await ring()) === 1);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    expect('Escape closes the menu and the ring goes with it', !(await menu()) && (await ring()) === 0, 'ring ' + (await ring()));
    await page.mouse.click(pt.x, pt.y, { button: 'right' });
    await page.waitForTimeout(300);
    const c = await center(page, '[data-role="gb2-chart-svg"]', 0.5);
    await clickAt(page, c.x, c.y - c.h * 0.3);
    expect('an outside click closes the menu and the ring goes with it', !(await menu()) && (await ring()) === 0, 'ring ' + (await ring()));
    // With the Data points panel open the ring is the live selection's.
    await clickAt(page, pt.x, pt.y);
    await page.waitForTimeout(300);
    await page.mouse.click(pt.x, pt.y, { button: 'right' });
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    expect('with the panel open the selected point keeps its ring', (await ring()) === 1);
    expect('no page errors', page.__errors.length === 0, page.__errors.join(' | '));
    await ctx.close();
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
