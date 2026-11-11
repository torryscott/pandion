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
