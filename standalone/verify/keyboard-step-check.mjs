// Stepping through a chart's parts from the keyboard must reach every part
// and then let go, on every chart type.
//
// THE BUG (found by the gesture consistency review, Nov 2026). The keyboard
// finds its place by looking the current selection's key up in its list of
// parts (_kbNavModel, built from the Label parts list). Two things broke
// that lookup:
//   - two parts with the same keys. A line and its markers both select
//     "bars:<group>", as do Q-Q points and their reference line. The lookup
//     always answered the first of the pair, so Tab stepped to the second
//     and announced it forever ("Marker. Part 2 of 9"): the axes, the
//     legend and the editing panel were out of reach on a Q-Q plot and on
//     a line chart. Which line chart depended on the data: the pair only
//     collapsed into one stop when the longest line and the largest marker
//     happened to belong to the same series. With this probe's table the
//     Repeated Measures line chart loops before the fix and the Compare
//     Groups one does not, so case 1 walks both.
//   - a key with no name in it. Pie slices name their category in data-cat
//     and a raincloud's cloud sits outside its cell's group, so the list
//     held a bare "freqSlice:" and "bars:" that no click ever selects. From
//     a clicked slice or cloud, Tab left the chart at once, and on a pie
//     Down announced "Slice. Part 1 of 3" forever.
//
// The contracts, each starting from a real click on the chart's main mark:
//   1. Line charts, Compare Groups and Repeated Measures: Tab moves on
//      every press, reaches both axes, the error bars and the legend, then
//      leaves the chart.
//   2. Q-Q plot: the same.
//   3. Pie: Tab reaches the slice labels and the legend, then leaves; Right
//      moves from slice to slice.
//   4. Raincloud: Tab steps to the next part instead of leaving at once, and
//      a full circle with Alt+Down never selects a cloud with no group.
// A guard for a chart that always worked: a bar chart keeps the same stops
// in the same order.
//
// CONTROL: PS_EXPECT_BROKEN=1 with PS_PAGE aimed at a page built before the
// fix must find every numbered case red, or the probe proves nothing.
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
let failed = 0;
let currentCase = '';
const caseRed = {};
function ok(cond, msg) {
    if (cond) { console.log('  ok  ' + msg); return; }
    failed++;
    console.log('  FAIL ' + msg);
}
// A check the fix is responsible for. Normally it must hold. Under the
// control it is only recorded: every numbered case has to show at least one
// of these failing against the pre-fix page.
function key(cond, msg) {
    if (!EXPECT_BROKEN) { ok(cond, msg); return; }
    if (!cond) caseRed[currentCase] = true;
    console.log('  ' + (cond ? 'held' : 'red ') + ' ' + msg);
}
function startCase(name, title, guard) {
    currentCase = name;
    if (!guard) caseRed[name] = false;
    console.log(name + ': ' + title);
}

const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));

// One table for every chart: two groups in three categories, three
// repeated measures.
const HEADER = ['grp', 'sex', 'score', 't1', 't2', 't3'];
const TYPES = { grp: 'nominal', sex: 'nominal', score: 'continuous',
                t1: 'continuous', t2: 'continuous', t3: 'continuous' };
function makeRows() {
    let seed = 20261110;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const norm = () => { let s = 0; for (let i = 0; i < 6; i++) s += rnd(); return (s - 3) / 0.7071; };
    const rows = [];
    for (let i = 0; i < 60; i++) {
        const g = ['a', 'b', 'c'][i % 3], sex = i % 2 ? 'F' : 'M';
        const y = 50 + (g === 'b' ? 6 : g === 'c' ? 12 : 0) + (sex === 'F' ? 3 : 0) + norm() * 8;
        const t1 = 30 + norm() * 5, t2 = t1 - 3 + norm() * 3, t3 = t2 + 1 + norm() * 3;
        rows.push([g, sex, y.toFixed(1), t1.toFixed(1), t2.toFixed(1), t3.toFixed(1)]);
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
        S.loadTable('keyboard', HEADER, ROWS, TYPES, null); await s(700);
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
        window.__kb = {
            // A point on an element of this kind that a real click would
            // deliver to the chart itself (not to an axis strip above it).
            point(sel) {
                const svg = svgOf();
                for (const el of svg.querySelectorAll(sel)) {
                    const r = el.getBoundingClientRect();
                    if (!(r.width > 0 && r.height > 0)) continue;
                    for (const [fx, fy] of [[.5, .5], [.3, .4], [.7, .6], [.5, .25], [.5, .75]]) {
                        const x = r.left + r.width * fx, y = r.top + r.height * fy;
                        const top = document.elementFromPoint(x, y);
                        if (top && svg.contains(top)) return { x, y };
                    }
                }
                return null;
            },
            // The one selected part, as the engine stores it; whether the
            // chart still holds the keyboard; what was just announced.
            state() {
                let sel = [];
                try { sel = JSON.parse(localStorage.getItem('graphbuilder2.inspector.v1') || '[]'); } catch (e) {}
                const live = document.querySelector('div[data-role="gb2-a11y-live"]');
                return { key: sel.length === 1 ? String(sel[0]) : '',
                         onChart: document.activeElement === svgOf(),
                         said: live ? live.textContent.trim() : '' };
            }
        };
    });
    return page;
}
const state = (page) => page.evaluate(() => window.__kb.state());
async function clickMark(page, sel) {
    const p = await page.evaluate((s) => window.__kb.point(s), sel);
    if (!p) return null;
    await page.mouse.click(p.x, p.y);
    await w(page, 450);
    return state(page);
}
// Press Tab until the chart lets go (or a limit), recording each stop.
async function tabWalk(page, limit) {
    const stops = [];
    let left = false;
    for (let i = 0; i < limit; i++) {
        await page.keyboard.press('Tab');
        await w(page, 240);
        const s = await state(page);
        if (!s.onChart) { left = true; break; }
        stops.push(s.key);
    }
    return { stops, left };
}
const kindOf = (k) => { const a = String(k || '').split(':'); return a[0] === 'text' ? a.slice(0, 2).join(':') : a[0]; };
const neverRepeats = (stops, start) => stops.every((k, i) => k !== (i ? stops[i - 1] : start));

// ---------------------------------------------------------------- 1
startCase('1', 'Line charts: Tab reaches every part, then leaves');
for (const [name, mod, roles] of [
    ['Compare Groups', 'plotbuilder', { xvar: 'grp', yvar: 'score', groupVar: 'sex' }],
    ['Repeated Measures', 'rmplotbuilder', { measures: ['t1', 't2', 't3'], betweenVar: 'sex' }]]) {
    const page = await openChart(mod, roles, { graphType: 'line' });
    const start = await clickMark(page, '[data-role="line-marker"]');
    ok(!!start && /^bars:/.test(start.key) && start.onChart,
       `${name}: a click on a marker selects its series and arms the keyboard (${start ? start.key : 'no marker found'})`);
    const walk = await tabWalk(page, 14);
    const kinds = walk.stops.map(kindOf);
    key(neverRepeats(walk.stops, start.key), `${name}: every Tab moves to another part (${walk.stops.join(', ')})`);
    key(['yAxis', 'xAxis', 'errorBars', 'legend'].every(k => kinds.includes(k)),
        `${name}: both axes, the error bars and the legend are reached`);
    key(walk.left, `${name}: and after the last part Tab leaves the chart`);
    await page.close();
}

// ---------------------------------------------------------------- 2
startCase('2', 'Q-Q plot: Tab reaches every part, then leaves');
{
    const page = await openChart('distplotbuilder', { var: 'score', groupVar: 'sex' }, { graphType: 'qq' });
    const start = await clickMark(page, '[data-role="dist-qq-line"]');
    ok(!!start && /^distQQ:/.test(start.key) && start.onChart,
       `a click on a reference line selects its series (${start ? start.key : 'no line found'})`);
    const walk = await tabWalk(page, 14);
    const kinds = walk.stops.map(kindOf);
    key(neverRepeats(walk.stops, start.key), `every Tab moves to another part (${walk.stops.join(', ')})`);
    key(['yAxis', 'xAxis', 'legend'].every(k => kinds.includes(k)), 'both axes and the legend are reached');
    key(walk.left, 'and after the last part Tab leaves the chart');
    await page.close();
}

// ---------------------------------------------------------------- 3
startCase('3', 'Pie: Tab reaches the slice labels and the legend; Right moves between slices');
{
    const page = await openChart('freqplotbuilder', { var: 'grp' }, { graphType: 'pie' });
    const start = await clickMark(page, '[data-role="freq-slice"]');
    ok(!!start && /^freqSlice:.+/.test(start.key) && start.onChart,
       `a click on a slice selects it (${start ? start.key : 'no slice found'})`);
    await page.keyboard.press('ArrowRight'); await w(page, 260);
    const next = await state(page);
    key(/^freqSlice:.+/.test(next.key) && next.key !== start.key,
        `Right moves to another slice (${start.key} then ${next.key})`);
    const walk = await tabWalk(page, 8);
    key(walk.stops.includes('text:pieSliceLabel') && walk.stops.includes('legend'),
        `Tab reaches the slice labels and the legend (${walk.stops.join(', ') || 'no stops'})`);
    ok(walk.left, 'and Tab leaves the chart in the end');
    await page.close();
}

// ---------------------------------------------------------------- 4
startCase('4', 'Raincloud: Tab steps on from a clicked cloud; no cloud without a group');
{
    const page = await openChart('plotbuilder', { xvar: 'grp', yvar: 'score', groupVar: 'sex' }, { graphType: 'raincloud' });
    const start = await clickMark(page, '[data-role="violin-fill"]');
    ok(!!start && /^bars:.+/.test(start.key) && start.onChart,
       `a click on a cloud selects its series (${start ? start.key : 'no cloud found'})`);
    await page.keyboard.press('Tab'); await w(page, 260);
    const one = await state(page);
    key(one.onChart && one.key !== start.key, `Tab steps to the next part (${one.onChart ? one.key : 'the chart let go'})`);
    // a full circle: Alt+Down wraps, so it comes back round to the clouds
    const seen = [];
    for (let i = 0; i < 12; i++) {
        await page.keyboard.press('Alt+ArrowDown'); await w(page, 230);
        const s = await state(page);
        if (seen.includes(s.key)) break;
        seen.push(s.key);
    }
    const clouds = seen.filter(k => /^bars:/.test(k));
    key(clouds.length > 0 && clouds.every(k => /^bars:.+/.test(k)),
        `a full circle selects the cloud by its group (${clouds.join(', ') || 'never came back to it'})`);
    await page.close();
}

// ---------------------------------------------------------------- guards
startCase('guard', 'a bar chart keeps its stops in the same order', true);
{
    const page = await openChart('plotbuilder', { xvar: 'grp', yvar: 'score', groupVar: 'sex' }, { graphType: 'bar' });
    const start = await clickMark(page, '[data-bar-cat]:not([data-role])');
    const walk = await tabWalk(page, 14);
    const kinds = walk.stops.map(kindOf).join(' > ');
    ok(!!start && /^bars:/.test(start.key) &&
       kinds === 'yAxis > text:yTitle > xAxis > text:xTitle > text:xCat > text:yTick > errorBars > legend' && walk.left,
       `bars, then ${kinds}, then out`);
    await page.close();
}

ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors[0].slice(0, 160) : ''));
await browser.close();

if (EXPECT_BROKEN) {
    const held = Object.keys(caseRed).filter(k => !caseRed[k]);
    if (failed || held.length) {
        console.log('\nkeyboard-step-check control: NOT red where expected' +
            (held.length ? ' (' + held.join(', ') + ' held on the pre-fix page)' : '') +
            (failed ? ' (' + failed + ' setup check(s) failed)' : ''));
        process.exit(1);
    }
    console.log('\nkeyboard-step-check control: every case is red on the pre-fix page');
    process.exit(0);
}
if (failed) { console.log('\nkeyboard-step-check: ' + failed + ' FAILED'); process.exit(1); }
console.log('\nkeyboard-step-check: all cases passed');
