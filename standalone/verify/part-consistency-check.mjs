// The same gesture must do the same thing on every kind of chart part.
//
// The gesture consistency review (Nov 2026) drew 38 chart setups and ran one
// list of gestures over each. These are the places where a part behaved
// unlike its neighbours, each now fixed and pinned here:
//
//   gap      The Distribution dot plot's Gap tab carries Category spacing,
//            but the setting was missing from that module's list of saved
//            settings, so the value was dropped on the echo and the slider
//            snapped back the moment it was let go.
//
//   delete   Delete did nothing on eight kinds of part whose panel has a
//            Hide button (a scatter group, a histogram, density, Q-Q or
//            ECDF series, a pie slice, the Pareto line, a correlation
//            variable, a Likert item). It now hides them through the store
//            the button writes, so Cmd/Ctrl+Z brings them back.
//
//   likert   Switching a Likert chart between its bar views and its means
//            view closed whichever editor was open (the level editor or
//            the dots editor). One now becomes the other, and the way back
//            returns to the level that was open.
//
//   outline  A click on a number the chart computes (a bar's value, a pie
//            slice's label, the number on a Likert segment or in a
//            correlation cell, a number on the correlation colour scale)
//            opened that kind's one shared editor and drew nothing on the
//            chart. Every label of the kind is now outlined.
//
//   rename   A double-click renames a category label, a legend label or
//            an axis title on the chart, but did nothing on a Likert item
//            label or a correlation variable label. Both now open the same
//            editor.
//
//   readout  Pie slices, histogram bars, Likert segments, scatter points
//            and correlation cells say what they show when the pointer
//            rests on them. Bars, line and dot markers, boxes, violins,
//            rainclouds, Pareto bars and heatmap tiles said nothing. Each
//            now has a readout, checked here against arithmetic done in
//            this file from the table.
//
// Every case starts from real mouse and keyboard input on the standalone
// page. CONTROL: PS_EXPECT_BROKEN=1 with PS_PAGE aimed at a page built
// before the fixes must find every case red, or the probe proves nothing.
// PS_ONLY=<case,case> runs a subset.
import { createRequire } from 'node:module';
import path from 'node:path';

function loadPlaywright() {
    for (const base of [process.env.GB2_NODE_BASE, process.cwd(),
                        new URL('.', import.meta.url).pathname,
                        '/private/tmp', '/tmp'].filter(Boolean)) {
        try { return createRequire(path.join(base, 'x.js'))('playwright'); }
        catch { /* try the next shared dependency location */ }
    }
    console.error('playwright not found');
    process.exit(2);
}

const EXPECT_BROKEN = process.env.PS_EXPECT_BROKEN === '1';
const ONLY = (process.env.PS_ONLY || '').split(',').map(s => s.trim()).filter(Boolean);
let failed = 0;
let currentCase = '';
const caseRed = {};
function ok(cond, msg) {
    if (cond) { console.log('  ok  ' + msg); return; }
    failed++;
    console.log('  FAIL ' + msg);
}
// A check the fix is responsible for. Normally it must hold. Under the
// control it is only recorded: every case has to show at least one of these
// failing against the pre-fix page.
function key(cond, msg) {
    if (!EXPECT_BROKEN) { ok(cond, msg); return; }
    if (!cond) caseRed[currentCase] = true;
    console.log('  ' + (cond ? 'held' : 'red ') + ' ' + msg);
}
function wanted(name) { return !ONLY.length || ONLY.includes(name); }
function startCase(name, title) {
    currentCase = name;
    caseRed[name] = false;
    console.log(name + ': ' + title);
}

const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));

// One table that can feed every analysis: two grouping columns, two
// continuous ones, three repeated measures and four survey items.
const HEADER = ['grp', 'sex', 'y', 'x', 't1', 't2', 't3', 'q1', 'q2', 'q3', 'q4'];
const TYPES = { grp: 'nominal', sex: 'nominal', y: 'continuous', x: 'continuous',
                t1: 'continuous', t2: 'continuous', t3: 'continuous',
                q1: 'ordinal', q2: 'ordinal', q3: 'ordinal', q4: 'ordinal' };
function makeRows() {
    let seed = 20261110;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const norm = () => { let s = 0; for (let i = 0; i < 6; i++) s += rnd(); return (s - 3) / 0.7071; };
    const rows = [];
    for (let i = 0; i < 60; i++) {
        const g = ['a', 'b', 'c'][i % 3], sex = i % 2 ? 'F' : 'M';
        const base = 50 + (g === 'b' ? 6 : g === 'c' ? 12 : 0) + (sex === 'F' ? 3 : 0);
        const y = base + norm() * 8, x = 20 + norm() * 5 + (y - 50) * 0.3;
        const t1 = 30 + norm() * 5, t2 = t1 - 3 + norm() * 3, t3 = t2 + 1 + norm() * 3;
        const q = () => String(1 + Math.min(4, Math.max(0, Math.round(2 + norm() * 1.2))));
        rows.push([g, sex, y.toFixed(1), x.toFixed(1), t1.toFixed(1), t2.toFixed(1), t3.toFixed(1),
                   q(), q(), q(), q()]);
    }
    return rows;
}
const ROWS = makeRows();

const browser = await chromium.launch();
const errors = [];
const w = (page, ms) => page.waitForTimeout(ms);

async function openChart(mod, roles, real) {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
    page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(() => {
        try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); } catch (e) {}
    });
    await page.goto(pageUrl);
    await w(page, Number(process.env.PS_BOOT || 1300));
    if (await page.locator('#ps-welcome').isVisible()) {
        await page.click('#ps-welcome-sample');
        await w(page, 1700);
    }
    await page.evaluate(async ({ mod, roles, real, HEADER, ROWS, TYPES }) => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        const S = window.PS_SHELL;
        S.loadTable('parts', HEADER, ROWS, TYPES, null); await s(700);
        S.setModule(mod); await s(300);
        const c = S.chart();
        const o = c.options[mod] || (c.options[mod] = {});
        Object.assign(o, real || {});
        S.setRoles(mod, roles); await s(1800);
    }, { mod, roles, real, HEADER, ROWS, TYPES });
    await page.evaluate(() => {
        const svgOf = () => {
            const host = document.querySelector('.graphbuilder2-host');
            let best = null, area = 0;
            for (const s of (host ? host.querySelectorAll('svg') : [])) {
                const a = s.clientWidth * s.clientHeight;
                if (a > area) { area = a; best = s; }
            }
            return best;
        };
        window.__pc = {
            svg: svgOf,
            // A point on the nth visible element of this kind that a real
            // click would deliver to the chart itself (not to a strip above
            // it). fx/fy pick the spot inside the element's box.
            point(sel, n, fx, fy) {
                const svg = svgOf();
                let seen = 0;
                for (const el of svg.querySelectorAll(sel)) {
                    const r = el.getBoundingClientRect();
                    if (!(r.width > 0 && r.height > 0)) continue;
                    if (seen++ < (n || 0)) continue;
                    const spots = (fx != null) ? [[fx, fy]] : [[.5, .5], [.3, .4], [.7, .6], [.5, .25], [.5, .75], [.15, .2]];
                    for (const [ax, ay] of spots) {
                        const x = r.left + r.width * ax, y = r.top + r.height * ay;
                        const top = document.elementFromPoint(x, y);
                        if (top && svg.contains(top)) return { x, y };
                    }
                    return null;
                }
                return null;
            },
            // A point ON the stroke of the nth path or line of this kind:
            // the middle of a line's box is rarely on the line.
            onStroke(sel, n) {
                const svg = svgOf();
                const el = Array.from(svg.querySelectorAll(sel)).filter(e => {
                    const r = e.getBoundingClientRect(); return r.width > 0 || r.height > 0;
                })[n || 0];
                if (!el || !el.getTotalLength) return null;
                const len = el.getTotalLength(), m = el.getScreenCTM();
                for (const f of [.5, .35, .65, .2, .8, .1, .9]) {
                    const q = el.getPointAtLength(len * f);
                    const x = q.x * m.a + q.y * m.c + m.e, y = q.x * m.b + q.y * m.d + m.f;
                    const top = document.elementFromPoint(x, y);
                    if (top && svg.contains(top)) return { x, y };
                }
                return null;
            },
            count(sel) {
                let n = 0;
                for (const el of svgOf().querySelectorAll(sel)) {
                    const r = el.getBoundingClientRect();
                    if (r.width > 0 && r.height > 0) n++;
                }
                return n;
            },
            // Centres of every visible element of this kind, in page pixels.
            centres(sel) {
                const out = [];
                for (const el of svgOf().querySelectorAll(sel)) {
                    const r = el.getBoundingClientRect();
                    if (r.width > 0 && r.height > 0) out.push({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
                }
                return out;
            },
            // The editing panel: is it open, what is it called, and how
            // many shapes mark the selection on the chart.
            panel() {
                const panel = document.querySelector('[data-gb2-inspector="1"]');
                const open = !!(panel && panel.offsetHeight > 8 && panel.textContent.trim().length > 0);
                const crumb = panel && panel.querySelector('[data-role="gb2-crumb"]');
                let title = '';
                if (open && crumb && crumb.children.length) title = crumb.children[crumb.children.length - 1].textContent;
                let marks = 0;
                for (const g of svgOf().querySelectorAll('[data-role^="inspector-indicator"], [data-role="inspector-bar-glow"]'))
                    marks += g.childElementCount;
                return { open, title: title.replace(/\s+/g, ' ').trim(), marks };
            },
            // Of the visible labels of this kind, how many sit inside one
            // of the light boxes that mark a shared-editor selection.
            outlined(sel) {
                const svg = svgOf();
                const boxes = Array.from(svg.querySelectorAll('polygon.gb2-halo-union')).map(b => b.getBoundingClientRect());
                let labels = 0, covered = 0;
                for (const el of svg.querySelectorAll(sel)) {
                    const r = el.getBoundingClientRect();
                    if (!(r.width > 0 && r.height > 0)) continue;
                    labels++;
                    if (boxes.some(b => b.left <= r.left + 1 && b.top <= r.top + 1 &&
                                        b.right >= r.right - 1 && b.bottom >= r.bottom - 1)) covered++;
                }
                return { labels, covered, boxes: boxes.length };
            },
            // The text editor that opens ON the chart (not the panel's
            // text box): is it open, what does it hold, where is it.
            editor() {
                const act = document.activeElement;
                const panel = document.querySelector('[data-gb2-inspector="1"]');
                if (!act || act.tagName !== 'TEXTAREA' || (panel && panel.contains(act))) return { open: false };
                const r = act.getBoundingClientRect();
                return { open: true, value: act.value, x: r.left + r.width / 2, y: r.top + r.height / 2 };
            },
            texts(sel) {
                return Array.from(svgOf().querySelectorAll(sel)).map(t => t.textContent.trim());
            },
            // The readout that follows the pointer, as one line of text
            // ('' when it is not showing).
            tip() {
                const t = document.querySelector('[data-role="xy-tooltip"]');
                if (!t || getComputedStyle(t).display === 'none') return '';
                return Array.from(t.children).map(c => c.textContent.replace(/\s+/g, ' ').trim()).join(' | ');
            },
            // Which cell the nth visible element of this kind belongs to.
            cellOf(sel, n) {
                let seen = 0;
                for (const el of svgOf().querySelectorAll(sel)) {
                    const r = el.getBoundingClientRect();
                    if (!(r.width > 0 && r.height > 0)) continue;
                    if (seen++ < (n || 0)) continue;
                    const c = el.closest('[data-bar-cat]');
                    const g = el.closest('[data-bar-group]');
                    return { cat: c ? c.getAttribute('data-bar-cat') : '', group: g ? g.getAttribute('data-bar-group') : '',
                             count: el.getAttribute('data-count') };
                }
                return null;
            },
            // The one selected part, as the engine stores it.
            key() {
                let sel = [];
                try { sel = JSON.parse(localStorage.getItem('graphbuilder2.inspector.v1') || '[]'); } catch (e) {}
                return sel.length === 1 ? String(sel[0]) : '';
            },
            // A setting as the app holds it for this chart: the module's
            // own options first, then its one blob of style settings.
            setting(mod, name) {
                const o = (window.PS_SHELL.chart().options || {})[mod] || {};
                if (Object.prototype.hasOwnProperty.call(o, name)) return o[name];
                try { const sp = JSON.parse(o.chartSpec || '{}'); return sp[name]; } catch (e) { return undefined; }
            }
        };
    });
    return page;
}
const selKey = (page) => page.evaluate(() => window.__pc.key());
async function clickAt(page, sel, n, fx, fy) {
    const p = await page.evaluate(([s, i, ax, ay]) => window.__pc.point(s, i, ax, ay), [sel, n || 0, fx, fy]);
    if (!p) return false;
    await page.mouse.click(p.x, p.y);
    await w(page, 450);
    return true;
}
// Long enough for the engine's own flush and the app's echo re-render.
const ECHO = 2600;
const panelOf = (page) => page.evaluate(() => window.__pc.panel());
// Pick another chart type from the toolbar's own menu.
async function switchType(page, gt) {
    await page.locator('[data-role="graphtype-trigger"]').first().click();
    await w(page, 300);
    await page.locator(`[data-role="graphtype-flyout"] [data-gt="${gt}"]`).first().click({ force: true });
    await w(page, ECHO);
}

// ------------------------------------------------------------------- gap
if (wanted('gap')) {
    startCase('gap', 'Distribution dot plot: Category spacing holds after it is let go');
    const page = await openChart('distplotbuilder', { var: 'y', groupVar: 'sex' }, { graphType: 'dot' });
    ok(await clickAt(page, '[data-role="line-marker"]'), 'a dot was clicked');
    const gapTab = page.locator('[data-ls-tab="gap"]').first();
    if (await gapTab.count() > 0) { await gapTab.click(); await w(page, 350); }
    const before = await page.evaluate(() => window.__pc.centres('[data-role="line-marker"]'));
    const slider = page.locator('.graphbuilder2-host [data-field="cat-spacing"], #ps-engine-dock-slot [data-field="cat-spacing"]').first();
    ok(await slider.count() > 0 && await slider.isVisible(), 'the Gap tab shows Category spacing');
    if (await slider.count() > 0) {
        await slider.focus();
        for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowLeft');
        await w(page, 250);
        const during = await page.evaluate(() => window.__pc.centres('[data-role="line-marker"]'));
        const spread = (c) => c.length < 2 ? 0 : Math.hypot(c[c.length - 1].x - c[0].x, c[c.length - 1].y - c[0].y);
        ok(spread(during) < spread(before) - 4, 'the dots move closer while the slider moves ('
            + Math.round(spread(before)) + ' to ' + Math.round(spread(during)) + ' px)');
        await w(page, ECHO);
        const after = await page.evaluate(() => window.__pc.centres('[data-role="line-marker"]'));
        key(Math.abs(spread(after) - spread(during)) < 2, 'they stay there after the redraw ('
            + Math.round(spread(after)) + ' px)');
        const saved = await page.evaluate(() => window.__pc.setting('distplotbuilder', 'lineCategorySpacing'));
        key(typeof saved === 'number' && Math.abs(saved - 0.7) < 0.001, 'the chart keeps the value (' + saved + ')');
        const shown = await page.evaluate(() => {
            const el = document.querySelector('[data-field="cat-spacing"]');
            return el ? Number(el.value) : null;
        });
        key(shown !== null && Math.abs(shown - 0.7) < 0.001, 'the slider still reads 70% (' + shown + ')');
    }
    await page.close();
}

// ---------------------------------------------------------------- delete
if (wanted('delete')) {
    startCase('delete', 'Delete hides a part wherever its panel has a Hide button; Undo brings it back');
    const dist = (gt) => ['distplotbuilder', { var: 'y', groupVar: 'sex' }, { graphType: gt }];
    // what to click, the selection it makes, where the hide is stored, and
    // which marks must be fewer afterwards
    const PARTS = [
        { name: 'scatter group', chart: ['xyplotbuilder', { xvar: 'x', yvar: 'y', groupVar: 'sex' }, { xyBin: 'none' }],
          click: '[data-role="xy-point"]', sel: /^xyPoint:(.+)$/, store: 'xyHiddenGroups', id: g => g, marks: '[data-role="xy-point"]' },
        { name: 'histogram series', chart: dist('histogram'),
          click: '[data-role="dist-hist-bar"]', sel: /^distHist:(.+)$/, store: 'hiddenElements', id: g => 'distGroup:' + g, marks: '[data-role="dist-hist-bar"]' },
        { name: 'density series', chart: dist('density'),
          click: '[data-role="dist-density-fill"]', sel: /^distDensity:(.+)$/, store: 'hiddenElements', id: g => 'distGroup:' + g, marks: '[data-role="dist-density-fill"]' },
        { name: 'Q-Q series', chart: dist('qq'),
          click: '[data-role="dist-qq-line"]', sel: /^distQQ:(.+)$/, store: 'hiddenElements', id: g => 'distGroup:' + g, marks: '[data-role="dist-qq-point"]' },
        { name: 'ECDF line', chart: dist('ecdf'), stroke: true,
          click: '[data-role="dist-ecdf-line"]', sel: /^distEcdf:(.+)$/, store: 'hiddenElements', id: g => 'distGroup:' + g, marks: '[data-role="dist-ecdf-line"]' },
        { name: 'pie slice', chart: ['freqplotbuilder', { var: 'grp' }, { graphType: 'pie' }],
          click: '[data-role="freq-slice"]', sel: /^freqSlice:(.+)$/, store: 'hiddenElements', id: g => 'freqSlice:' + g, marks: '[data-role="freq-slice"]' },
        { name: 'Pareto line', chart: ['freqplotbuilder', { var: 'grp' }, { graphType: 'pareto' }], stroke: true,
          click: '[data-role="pareto-line"]', sel: /^(paretoLine)$/, store: 'hiddenElements', id: () => 'paretoLine', marks: '[data-role="pareto-line"]' },
        { name: 'correlation variable', chart: ['corrplotbuilder', { vars: ['x', 'y', 't1', 't2'] }, { graphType: 'corrheatmap' }],
          click: '[data-role="corr-var-label-g"] text', sel: /^corrVar:(.+)$/, store: 'hiddenElements', id: g => 'corrVar:' + g, marks: '[data-role="corr-var-label-g"]' },
        { name: 'Likert item', chart: ['likertplotbuilder', { items: ['q1', 'q2', 'q3', 'q4'] }, { graphType: 'likertdiverging' }],
          click: '[data-role="likert-item-label"]', sel: /^likertItem:(.+)$/, store: 'hiddenElements', id: g => 'likertItem:' + g, marks: '[data-role="likert-item-label"]' }
    ];
    for (const part of PARTS) {
        const page = await openChart(...part.chart);
        const mod = part.chart[0];
        const count = () => page.evaluate((q) => window.__pc.count(q), part.marks);
        const n0 = await count();
        let clicked;
        if (part.stroke) {
            const q = await page.evaluate((c) => window.__pc.onStroke(c, 0), part.click);
            clicked = !!q;
            if (q) { await page.mouse.click(q.x, q.y); await w(page, 450); }
        } else {
            clicked = await clickAt(page, part.click);
        }
        const k = await selKey(page);
        const m = part.sel.exec(k);
        ok(clicked && !!m && n0 > 0, `${part.name}: a click selects it (${k || 'nothing selected'})`);
        if (!m) { await page.close(); continue; }
        const id = part.id(m[1]);
        await page.keyboard.press('Delete');
        await w(page, ECHO);
        const stored = await page.evaluate(([mo, st]) => window.__pc.setting(mo, st), [mod, part.store]);
        const n1 = await count();
        key(Array.isArray(stored) && stored.includes(id) && n1 < n0,
            `${part.name}: Delete hides it (${n0} marks, then ${n1}; stored as ${id})`);
        key((await selKey(page)) === '', `${part.name}: and its panel closes`);
        await page.keyboard.press('ControlOrMeta+z');
        await w(page, ECHO);
        const n2 = await count();
        const back = await page.evaluate(([mo, st]) => window.__pc.setting(mo, st), [mod, part.store]);
        ok(n2 === n0 && !(Array.isArray(back) && back.includes(id)),
           `${part.name}: Undo brings it back (${n2} marks)`);
        await page.close();
    }
}

// ---------------------------------------------------------------- likert
if (wanted('likert')) {
    startCase('likert', 'Likert: the open editor follows a switch between the bar views and the means view');
    const items = { items: ['q1', 'q2', 'q3', 'q4'] };
    {
        const page = await openChart('likertplotbuilder', items, { graphType: 'likertdiverging' });
        // the corner of a segment: its middle belongs to the number on it
        ok(await clickAt(page, '[data-role="likert-seg"]', 2, .12, .15), 'a segment was clicked');
        const k0 = await selKey(page);
        ok(/^likertLevel:.+/.test(k0), `it opens that level's editor (${k0 || 'nothing selected'})`);
        await switchType(page, 'likertmeans');
        const p1 = await panelOf(page), k1 = await selKey(page);
        key(p1.open && k1 === 'likertMeanDots', `on a switch to means the dots editor is open (${p1.open ? k1 : 'panel closed'})`);
        await switchType(page, 'likertstacked');
        const p2 = await panelOf(page), k2 = await selKey(page);
        key(p2.open && k2 === k0, `on a switch back the same level's editor is open again (${p2.open ? k2 : 'panel closed'})`);
        await page.close();
    }
    {
        const page = await openChart('likertplotbuilder', items, { graphType: 'likertmeans' });
        ok(await clickAt(page, '[data-role="likert-dot-hit"]'), 'a mean dot was clicked');
        ok((await selKey(page)) === 'likertMeanDots', 'it opens the dots editor');
        await switchType(page, 'likertdiverging');
        const p3 = await panelOf(page), k3 = await selKey(page);
        key(p3.open && /^likertLevel:.+/.test(k3), `with no level opened before, a switch to the bars opens a level's editor (${p3.open ? k3 : 'panel closed'})`);
        await page.close();
    }
}

// ---------------------------------------------------------------- outline
if (wanted('outline')) {
    startCase('outline', 'A click on a computed number outlines every label its editor changes');
    const KINDS = [
        { name: 'bar value labels', sel: 'text:barValueLabel', labels: '[data-role="bar-value-label"]',
          chart: ['plotbuilder', { xvar: 'grp', yvar: 'y', groupVar: 'sex' },
                  { graphType: 'bar', chartSpec: JSON.stringify({ barValueLabels: true }) }] },
        { name: 'pie slice labels', sel: 'text:pieSliceLabel', labels: '[data-role="freq-slice-label"]',
          chart: ['freqplotbuilder', { var: 'grp' }, { graphType: 'pie' }] },
        { name: 'Likert segment numbers', sel: 'text:likertValueLabel', labels: '[data-role="likert-value"]',
          chart: ['likertplotbuilder', { items: ['q1', 'q2', 'q3', 'q4'] }, { graphType: 'likertdiverging' }] },
        { name: 'correlation cell numbers', sel: 'text:corrValueLabel', labels: '[data-role="corr-value"]',
          chart: ['corrplotbuilder', { vars: ['x', 'y', 't1', 't2'] }, { graphType: 'corrheatmap' }] },
        { name: 'colour scale numbers', sel: 'text:corrLegendTick', labels: '[data-role="corr-legend-tick"]',
          chart: ['corrplotbuilder', { vars: ['x', 'y', 't1', 't2'] }, { graphType: 'corrheatmap' }] }
    ];
    for (const kind of KINDS) {
        const page = await openChart(...kind.chart);
        const clicked = await clickAt(page, kind.labels);
        const k = await selKey(page);
        ok(clicked && k === kind.sel, `${kind.name}: a click on one opens their editor (${k || 'nothing selected'})`);
        const o = await page.evaluate((q) => window.__pc.outlined(q), kind.labels);
        key(o.labels > 0 && o.covered === o.labels,
            `${kind.name}: every label is outlined (${o.covered} of ${o.labels})`);
        await page.keyboard.press('Escape'); await w(page, 350);
        await page.keyboard.press('Escape'); await w(page, 350);
        const gone = await page.evaluate((q) => window.__pc.outlined(q), kind.labels);
        ok(gone.boxes === 0, `${kind.name}: and the outlines leave with the selection`);
        await page.close();
    }
}

// ---------------------------------------------------------------- rename
if (wanted('rename')) {
    startCase('rename', 'A double-click renames a Likert item label and a correlation variable label on the chart');
    const editorOf = (page) => page.evaluate(() => window.__pc.editor());
    const centreOf = (page, sel, n) => page.evaluate(([q, i]) => {
        const el = window.__pc.svg().querySelectorAll(q)[i];
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, [sel, n || 0]);
    async function retype(page, text) {
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.type(text);
        await page.keyboard.press('Enter');
        await w(page, ECHO);
    }
    {
        // q2 is reverse-scored, so its label on the chart reads "q2 (R)"
        const page = await openChart('likertplotbuilder', { items: ['q1', 'q2', 'q3', 'q4'] },
            { graphType: 'likertdiverging', chartSpec: JSON.stringify({ likertReverseItems: ['q2'] }) });
        const lab = '[data-role="likert-item-label"]';
        const c0 = await centreOf(page, lab, 0);
        await page.mouse.dblclick(c0.x, c0.y); await w(page, 450);
        const e0 = await editorOf(page);
        key(e0.open && e0.value === 'q1', `Likert item: a double-click opens the editor on the chart (${e0.open ? '"' + e0.value + '"' : 'no editor'})`);
        if (e0.open) {
            await retype(page, 'Trust');
            const names = await page.evaluate((q) => window.__pc.texts(q), lab);
            const saved = await page.evaluate(() => window.__pc.setting('likertplotbuilder', 'likertItemRelabels'));
            key(names[0] === 'Trust' && JSON.stringify(saved || []).includes('"Trust"'),
                `Likert item: typing a name and Enter renames it (${names.join(', ')})`);
        }
        const before = await page.evaluate((q) => window.__pc.texts(q), lab);
        ok(/\(R\)$/.test(before[1] || ''), `the reverse-scored item is marked on the chart ("${before[1]}")`);
        const c1 = await centreOf(page, lab, 1);
        await page.mouse.dblclick(c1.x, c1.y); await w(page, 450);
        const e1 = await editorOf(page);
        key(e1.open && e1.value === 'q2', `Likert item: the editor starts from the name, without the reverse-scored mark (${e1.open ? '"' + e1.value + '"' : 'no editor'})`);
        await page.keyboard.press('Escape'); await w(page, 300);
        const after = await page.evaluate((q) => window.__pc.texts(q), lab);
        ok(after[1] === before[1], 'Escape leaves the name as it was');
        await page.close();
    }
    {
        const page = await openChart('corrplotbuilder', { vars: ['x', 'y', 't1', 't2'] }, { graphType: 'corrheatmap' });
        const col = '[data-role="corr-var-label-g"][data-axis="col"] text';
        const row = '[data-role="corr-var-label-g"][data-axis="row"] text';
        const cc = await centreOf(page, col, 1);
        await page.mouse.dblclick(cc.x, cc.y); await w(page, 450);
        const e0 = await editorOf(page);
        key(e0.open && e0.value === 'y', `correlation variable: a double-click on a column label opens the editor (${e0.open ? '"' + e0.value + '"' : 'no editor'})`);
        if (e0.open) {
            ok(Math.hypot(e0.x - cc.x, e0.y - cc.y) < 40, 'over the label that was double-clicked');
            await retype(page, 'Height');
            const cols = await page.evaluate((q) => window.__pc.texts(q), col);
            const rows = await page.evaluate((q) => window.__pc.texts(q), row);
            const saved = await page.evaluate(() => window.__pc.setting('corrplotbuilder', 'corrVarRelabels'));
            key(cols[1] === 'Height' && rows[1] === 'Height' && JSON.stringify(saved || []).includes('"Height"'),
                `correlation variable: the new name shows on its row and its column (${rows.join(', ')})`);
        }
        const rc = await centreOf(page, row, 2);
        await page.mouse.dblclick(rc.x, rc.y); await w(page, 450);
        const e1 = await editorOf(page);
        key(e1.open && e1.value === 't1' && Math.hypot(e1.x - rc.x, e1.y - rc.y) < 40,
            `correlation variable: and a row label does the same (${e1.open ? '"' + e1.value + '"' : 'no editor'})`);
        await page.keyboard.press('Escape'); await w(page, 300);
        await page.close();
    }
}

// ---------------------------------------------------------------- readout
if (wanted('readout')) {
    startCase('readout', 'Bars, markers, boxes and heatmap tiles say what they show under the pointer');
    // the readout's own number rule, written again here: four significant
    // figures, whole numbers from 1000 up
    const f4 = (v) => Math.abs(v) >= 1000 ? String(Math.round(v)) : String(Number(v.toPrecision(4)));
    const col = (name) => HEADER.indexOf(name);
    const vals = (name, keep) => ROWS.filter(keep).map(r => parseFloat(r[col(name)]));
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1)); };
    const q7 = (a, p) => { const b = a.slice().sort((x, y) => x - y), h = p * (b.length - 1), lo = Math.floor(h), hi = Math.ceil(h);
                           return lo === hi ? b[lo] : b[lo] + (h - lo) * (b[hi] - b[lo]); };
    const T975_DF9 = 2.2621571628;          // ten values in every grp x sex cell
    async function hover(page, sel, n) {
        const pt = await page.evaluate(([q, i]) => window.__pc.point(q, i), [sel, n || 0]);
        if (!pt) return null;
        await page.mouse.move(4, 4);
        await page.mouse.move(pt.x - 2, pt.y - 2);
        await page.mouse.move(pt.x, pt.y);
        await w(page, 250);
        const text = await page.evaluate(() => window.__pc.tip());
        const cell = await page.evaluate(([q, i]) => window.__pc.cellOf(q, i), [sel, n || 0]);
        return { text, cell, pt };
    }
    const BAR = '[data-bar-cat]:not([data-role])';
    const cg = { xvar: 'grp', yvar: 'y', groupVar: 'sex' };
    {
        const page = await openChart('plotbuilder', cg, { graphType: 'bar', errorBarType: 'se' });
        const h = await hover(page, BAR, 1);
        const a = h && h.cell ? vals('y', r => r[col('grp')] === h.cell.cat && r[col('sex')] === h.cell.group) : [];
        const want = a.length ? [`${h.cell.cat} \u00b7 ${h.cell.group}`, `Mean = ${f4(mean(a))}`, `SE = ${f4(sd(a) / Math.sqrt(a.length))}`, `n = ${a.length}`].join(' | ') : '(no bar)';
        key(!!h && h.text === want, `a bar: name, mean, SE and n ("${h ? h.text : ''}")`);
        // a press and a drag is not a question: the readout steps aside
        if (h) {
            await page.mouse.down(); await page.mouse.move(h.pt.x + 3, h.pt.y + 1); await w(page, 120);
            const during = await page.evaluate(() => window.__pc.tip());
            await page.mouse.up(); await w(page, 300);
            ok(during === '', 'the readout hides while the mouse button is down');
        }
        await page.close();
    }
    {
        const page = await openChart('plotbuilder', cg, { graphType: 'bar', errorBarType: 'ci95' });
        const h = await hover(page, BAR, 2);
        const a = h && h.cell ? vals('y', r => r[col('grp')] === h.cell.cat && r[col('sex')] === h.cell.group) : [];
        const half = a.length ? T975_DF9 * sd(a) / Math.sqrt(a.length) : 0;
        key(!!h && a.length === 10 && h.text.includes(`95% CI: ${f4(mean(a) - half)} to ${f4(mean(a) + half)}`),
            `a bar under 95% intervals: the interval as drawn ("${h ? h.text : ''}")`);
        await page.close();
    }
    {
        const page = await openChart('plotbuilder', cg, { graphType: 'bar', summaryFunc: 'median', errorBarType: 'se' });
        const h = await hover(page, BAR, 0);
        const a = h && h.cell ? vals('y', r => r[col('grp')] === h.cell.cat && r[col('sex')] === h.cell.group) : [];
        key(!!h && a.length > 0 && h.text.includes(`Median = ${f4(q7(a, 0.5))}`) && !/SE =|CI/.test(h.text),
            `a median chart: the median and no error bar ("${h ? h.text : ''}")`);
        await page.close();
    }
    {
        const page = await openChart('plotbuilder', cg, { graphType: 'line', errorBarType: 'se' });
        const h = await hover(page, '[data-role="line-marker"]', 0);
        const a = h && h.cell ? vals('y', r => r[col('grp')] === h.cell.cat && r[col('sex')] === h.cell.group) : [];
        key(!!h && a.length > 0 && h.text.includes(`Mean = ${f4(mean(a))}`) && h.text.includes(`n = ${a.length}`),
            `a line marker: mean and n ("${h ? h.text : ''}")`);
        await page.close();
    }
    {
        const page = await openChart('rmplotbuilder', { measures: ['t1', 't2', 't3'], betweenVar: 'sex' }, { graphType: 'bar', errorBarType: 'se' });
        const h = await hover(page, BAR, 0);
        const a = h && h.cell ? vals(h.cell.cat, r => r[col('sex')] === h.cell.group) : [];
        key(!!h && a.length === 30 && h.text.includes(`Mean = ${f4(mean(a))}`) && /SE = [\d.]+ \(within-subject\)/.test(h.text) && h.text.includes('n = 30'),
            `a Repeated Measures bar: mean, the within-subject SE and n ("${h ? h.text : ''}")`);
        await page.close();
    }
    {
        const page = await openChart('plotbuilder', cg, { graphType: 'box' });
        const h = await hover(page, '[data-role="box-fill"]', 0);
        const a = h && h.cell ? vals('y', r => r[col('grp')] === h.cell.cat && r[col('sex')] === h.cell.group) : [];
        key(!!h && a.length > 0 && h.text.includes(`Median = ${f4(q7(a, 0.5))}`) &&
            h.text.includes(`Quartiles: ${f4(q7(a, 0.25))} to ${f4(q7(a, 0.75))}`) && /Whiskers: /.test(h.text) && h.text.includes(`n = ${a.length}`),
            `a box: median, quartiles, whisker ends and n ("${h ? h.text : ''}")`);
        await page.close();
    }
    {
        const page = await openChart('plotbuilder', cg, { graphType: 'violin' });
        const h = await hover(page, '[data-role="violin-fill"]', 0);
        const a = h && h.cell ? vals('y', r => r[col('grp')] === h.cell.cat && r[col('sex')] === h.cell.group) : [];
        key(!!h && a.length > 0 && h.text.includes(`Median = ${f4(q7(a, 0.5))}`) &&
            h.text.includes(`Range: ${f4(Math.min(...a))} to ${f4(Math.max(...a))}`) && !/Whiskers/.test(h.text),
            `a violin: median, quartiles and the range ("${h ? h.text : ''}")`);
        await page.close();
    }
    {
        const page = await openChart('freqplotbuilder', { var: 'grp' }, { graphType: 'bar', freqStat: 'percent' });
        const h = await hover(page, BAR, 0);
        key(!!h && /Count = 20 \| Percent = 33\.33%$/.test(h.text), `a Frequencies bar in percent: the count and the percent ("${h ? h.text : ''}")`);
        await page.close();
    }
    {
        const page = await openChart('freqplotbuilder', { var: 'grp' }, { graphType: 'pareto' });
        const h = await hover(page, BAR, 0);
        key(!!h && /Count = 20 \| Share: 33\.33% of 60$/.test(h.text), `a Pareto bar: the count and its share ("${h ? h.text : ''}")`);
        await page.close();
    }
    {
        const page = await openChart('xyplotbuilder', { xvar: 'x', yvar: 'y' }, { xyBin: 'square' });
        const h = await hover(page, '[data-role="xy-bin"]', 3);
        const m = h ? /^Count = (\d+) \| x: (-?[\d.]+) to (-?[\d.]+) \| y: (-?[\d.]+) to (-?[\d.]+)$/.exec(h.text) : null;
        let inside = -1;
        if (m) {
            const [x0, x1, y0, y1] = m.slice(2).map(Number);
            // the edges are printed to four figures, so allow that much
            const ex = 6e-4 * Math.max(Math.abs(x0), Math.abs(x1)), ey = 6e-4 * Math.max(Math.abs(y0), Math.abs(y1));
            inside = ROWS.filter(r => { const x = parseFloat(r[col('x')]), y = parseFloat(r[col('y')]);
                                        return x >= x0 - ex && x <= x1 + ex && y >= y0 - ey && y <= y1 + ey; }).length;
        }
        key(!!m && String(h.cell.count) === m[1] && inside >= Number(m[1]) && Number(m[1]) > 0,
            `a heatmap tile: its count and the ranges it covers ("${h ? h.text : ''}"; ${inside} rows inside)`);
        await page.close();
    }
}

await browser.close();

if (errors.length) { failed++; console.log('  FAIL page errors: ' + errors.slice(0, 3).join(' | ')); }
if (EXPECT_BROKEN) {
    const names = Object.keys(caseRed);
    const notRed = names.filter(n => !caseRed[n]);
    if (notRed.length || failed) {
        console.log('\nCONTROL FAILED: not red before the fix: ' + (notRed.join(', ') || 'none')
            + (failed ? '; ' + failed + ' unrelated check(s) failed' : ''));
        process.exit(1);
    }
    console.log('\nCONTROL OK: every case is red on the pre-fix page (' + names.join(', ') + ')');
    process.exit(0);
}
if (failed) { console.log('\npart-consistency-check: ' + failed + ' FAILED'); process.exit(1); }
console.log('\npart-consistency-check: ALL OK');
