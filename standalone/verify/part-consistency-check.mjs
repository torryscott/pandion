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
