// The editing panel beside the chart (Torry, Sep 14 2026). On a window too
// short to show the chart with a panel under it, the SAME engine panel
// docks into the settings column in place of Chart setup, for exactly as
// long as something is selected; taller windows keep it under the chart.
// Measured at five real laptop geometries: a 1366x768 laptop at 125%
// scaling gives the page 1093x500 (or 560 with the taskbar hidden), the
// same laptop at 100% gives 1366x620, a 1080p laptop at 125% gives
// 1536x730, a MacBook Air 13 gives 1470x800. The rule is automatic and
// preference-overridable, and the engine gates on a payload key jamovi
// never ships (the render-boundary control at the end).
import { createRequire } from 'node:module';
import path from 'node:path';
function loadPlaywright() {
    for (const base of [process.env.GB2_NODE_BASE, process.cwd(), '/private/tmp', '/tmp'].filter(Boolean)) {
        try { return createRequire(path.join(base, 'x.js'))('playwright'); } catch { /* next */ }
    }
    console.error('playwright not found'); process.exit(2);
}
const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const PREF_KEY = 'psstandalone.preferences.v1';
let fails = 0; const ok = (c, m) => { console.log((c ? '  ok  ' : ' FAIL ') + m); if (!c) fails++; };
const browser = await chromium.launch();
const errors = [];
async function openAt(w, h, prefs) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    page.on('pageerror', e => errors.push(`${w}x${h}: ${String(e).slice(0, 140)}`));
    await page.addInitScript((a) => {
        try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); } catch (e) {}
        try { if (a.p) localStorage.setItem(a.k, JSON.stringify(a.p)); } catch (e) {}
    }, { k: PREF_KEY, p: prefs || null });
    await page.goto(pageUrl); await page.waitForTimeout(600);
    return page;
}
async function loadSample(page) { await page.click('#ps-welcome-sample'); await page.waitForTimeout(2200); }
async function clickBar(page) {
    const m = await page.evaluate(() => {
        const s = [...document.querySelectorAll('.graphbuilder2-host svg')].sort((a, b) => {
            const A = a.getBoundingClientRect(), B = b.getBoundingClientRect(); return B.width * B.height - A.width * A.height; })[0];
        const r = s.querySelector('[data-bar-cat]').getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.click(m.x, m.y); await page.waitForTimeout(1000);
}
async function state(page) {
    return page.evaluate(() => {
        const svg = [...document.querySelectorAll('.graphbuilder2-host svg')].sort((a, b) => {
            const A = a.getBoundingClientRect(), B = b.getBoundingClientRect(); return B.width * B.height - A.width * A.height; })[0];
        const r = svg.getBoundingClientRect(); const pane = document.querySelector('.ps-main-workspace'); const ws = pane.getBoundingClientRect();
        const vis = a => Math.max(0, Math.min(a.bottom, ws.bottom) - Math.max(a.top, ws.top));
        const p = document.querySelector('.gb2-panel'); const slot = document.getElementById('ps-engine-dock-slot');
        const col = document.querySelector('.ps-controls'); const chartPane = document.getElementById('ps-inspector-chart');
        const shown = p && getComputedStyle(p).display !== 'none';
        const tabs = p ? [...p.querySelectorAll('[data-gb2-promoted-tabbar="1"] > button, [data-bs-tab]')] : [];
        const pb = p ? p.getBoundingClientRect() : null;
        const clipped = tabs.filter(t => { const b = t.getBoundingClientRect(); return b.right > pb.right + 1 || b.left < pb.left - 1; }).length;
        const rows = new Set(tabs.map(t => Math.round(t.getBoundingClientRect().top))).size;
        const body = p ? p.querySelector('[data-role="inspector-bodyrow"]') : null;
        const dockBar = document.querySelector('#ps-engine-dock .ps-dock-bar');
        return {
            chartH: Math.round(r.height), chartVis: Math.round(vis(r)),
            paneOverY: pane.scrollHeight - pane.clientHeight, paneOverX: pane.scrollWidth - pane.clientWidth,
            panel: shown ? {
                where: p.getAttribute('data-gb2-dock'), inSlot: slot.contains(p),
                w: Math.round(pb.width), h: Math.round(pb.height),
                overflowX: p.scrollWidth - p.clientWidth, slotOverflowX: slot.scrollWidth - slot.clientWidth,
                tabRows: rows, clipped, stacked: body ? getComputedStyle(body).flexDirection : null,
                maxH: p.style.maxHeight } : null,
            colW: Math.round(col.getBoundingClientRect().width),
            live: chartPane.classList.contains('ps-dock-live'), beside: document.body.classList.contains('ps-dock-beside'),
            setupVisible: [...chartPane.children].some(c => c.id !== 'ps-engine-dock' && getComputedStyle(c).display !== 'none'),
            dockBarVisible: !!dockBar && dockBar.getBoundingClientRect().height > 0,
            pref: (() => { try { return (JSON.parse(localStorage.getItem('psstandalone.preferences.v1') || '{}') || {}).panelDock || ''; } catch (e) { return 'err'; } })()
        };
    });
}
function expectBeside(st, label) {
    ok(!!st.panel && st.panel.inSlot && st.panel.where === 'host', `${label}: panel docked in the column`);
    if (!st.panel) return;
    ok(st.chartVis >= st.chartH - 1, `${label}: the whole chart stays on screen (${st.chartVis} of ${st.chartH}px)`);
    ok(st.paneOverY <= 1 && st.paneOverX <= 1, `${label}: the chart pane does not scroll (${st.paneOverX}/${st.paneOverY}px over)`);
    ok(st.colW === 380, `${label}: the column is 380px (${st.colW})`);
    ok(!st.setupVisible && st.dockBarVisible && st.live, `${label}: Chart setup stands down, the dock bar shows`);
    ok(st.panel.overflowX <= 1 && st.panel.slotOverflowX <= 1, `${label}: nothing escapes the panel sideways (${st.panel.overflowX}/${st.panel.slotOverflowX})`);
    ok(st.panel.stacked === 'column', `${label}: the picker stacks under the controls`);
    ok(st.panel.maxH === '', `${label}: no height cap in the column`);
    ok(st.panel.clipped === 0, `${label}: no tab is clipped (${st.panel.tabRows} row(s))`);
}
function expectBelow(st, label) {
    ok(!!st.panel && !st.panel.inSlot && st.panel.where === 'below', `${label}: panel under the chart`);
    if (!st.panel) return;
    ok(st.colW === 330, `${label}: the column keeps its 330px (${st.colW})`);
    ok(st.setupVisible && !st.live, `${label}: Chart setup stays`);
    ok(st.panel.stacked === 'row', `${label}: the picker sits beside the controls`);
    ok(st.panel.maxH !== '', `${label}: the height cap applies (${st.panel.maxH})`);
    ok(st.panel.tabRows === 1, `${label}: tabs on one row`);
}

console.log('case 1: automatic placement goes beside on the short geometries');
for (const [w, h] of [[1093, 500], [1093, 560], [1366, 620]]) {
    const page = await openAt(w, h); await loadSample(page); await clickBar(page);
    expectBeside(await state(page), `${w}x${h}`);
    await page.close();
}
console.log('case 2: and stays under the chart on the tall ones');
for (const [w, h] of [[1536, 730], [1470, 800]]) {
    const page = await openAt(w, h); await loadSample(page); await clickBar(page);
    expectBelow(await state(page), `${w}x${h}`);
    await page.close();
}
console.log('case 3: the panel is a consequence of a selection: it leaves with it');
{
    const page = await openAt(1093, 500); await loadSample(page); await clickBar(page);
    let st = await state(page); ok(!!st.panel && st.panel.inSlot, 'docked after a bar click');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.keyboard.press('Escape'); await page.waitForTimeout(600);
    st = await state(page);
    ok(!st.panel && !st.live && st.setupVisible, 'two Escapes (picker, then selection) return Chart setup');
    await clickBar(page); st = await state(page); ok(!!st.panel && st.panel.inSlot, 'a new selection docks again');
    await page.click('#ps-dock-done'); await page.waitForTimeout(600);
    st = await state(page); ok(!st.panel && !st.live && st.setupVisible, 'Done clears the selection and returns Chart setup');
    // Statistics docks too (Torry: the panels that link to the chart need it on screen)
    const sig = await page.evaluate(() => { const b = [...document.querySelectorAll('.graphbuilder2-host [data-role="chart-toolbar"] button')].find(x => /Σ|Statistics/i.test(x.textContent + (x.getAttribute('title') || '') + (x.getAttribute('aria-label') || ''))); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    ok(!!sig, 'the Statistics toolbar button is found');
    if (sig) {
        await page.mouse.click(sig.x, sig.y); await page.waitForTimeout(1200);
        st = await state(page);
        ok(!!st.panel && st.panel.inSlot, 'the Statistics panel docks in the column');
        ok(st.panel && st.panel.overflowX <= 1 && st.chartVis >= st.chartH - 1, 'its tables scroll inside; the chart stays whole');
        await page.click('#ps-dock-done'); await page.waitForTimeout(600);
        st = await state(page); ok(!st.panel && st.setupVisible, 'Done closes Statistics too');
    }
    await page.close();
}
console.log('case 4: the preference overrides the rule and persists');
{
    let page = await openAt(1093, 500, { panelDock: 'below' }); await loadSample(page); await clickBar(page);
    let st = await state(page); ok(!!st.panel && !st.panel.inSlot && st.colW === 330, 'Under the chart: a short window keeps the panel below');
    await page.close();
    page = await openAt(1470, 800, { panelDock: 'beside' }); await loadSample(page); await clickBar(page);
    st = await state(page); ok(!!st.panel && st.panel.inSlot && st.colW === 380, 'Beside the chart: a tall window docks it');
    ok(st.chartVis >= st.chartH - 1 && st.paneOverY <= 1, `and the chart is whole and unscrolled (${st.chartVis} of ${st.chartH})`);
    await page.close();
    // The dialog's Save commits it: the same select, saved, moves an open panel.
    page = await openAt(1470, 800); await loadSample(page); await clickBar(page);
    st = await state(page); ok(!!st.panel && !st.panel.inSlot, 'default on a tall window: below');
    await page.evaluate(() => { const s = document.getElementById('ps-pref-dock'); s.value = 'beside'; document.getElementById('ps-preferences-save').click(); });
    await page.waitForTimeout(1500);
    st = await state(page);
    ok(st.pref === 'beside', `Preferences saved the choice (${st.pref})`);
    ok(!!st.panel && st.panel.inSlot, 'and the open panel moved to the column on save');
    await page.close();
}
console.log('case 5: a window resize moves an open panel');
{
    const page = await openAt(1470, 800); await loadSample(page); await clickBar(page);
    let st = await state(page); ok(!!st.panel && !st.panel.inSlot, 'tall: below');
    await page.setViewportSize({ width: 1093, height: 500 }); await page.waitForTimeout(900);
    st = await state(page); ok(!!st.panel && st.panel.inSlot && st.colW === 380, 'shrunk to a laptop: the panel moves beside');
    ok(st.chartVis >= st.chartH - 1, `the chart is whole there (${st.chartVis} of ${st.chartH})`);
    await page.setViewportSize({ width: 1470, height: 800 }); await page.waitForTimeout(900);
    st = await state(page); ok(!!st.panel && !st.panel.inSlot && st.colW === 330, 'grown back: the panel returns under the chart');
    await page.close();
}
console.log('case 6: render-boundary control: without the payload key the engine never docks');
{
    const page = await openAt(1093, 500);
    await page.evaluate(() => { const o = window.GraphBuilder2.render; window.GraphBuilder2.render = function (id, payload) { if (payload) delete payload.inspectorDock; return o.apply(this, arguments); }; });
    await loadSample(page); await clickBar(page);
    const st = await state(page);
    ok(!!st.panel && !st.panel.inSlot && st.panel.where === 'below' && !st.live, 'key absent: the panel is the chart\'s skirt even on the short window');
    await page.close();
}
ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors[0] : ''));
await browser.close();
console.log(fails ? 'PANEL DOCK CHECK: ' + fails + ' FAILED' : 'PANEL DOCK CHECK PASS');
process.exit(fails ? 1 : 0);
