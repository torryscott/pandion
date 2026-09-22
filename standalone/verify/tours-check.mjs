// Workspace tours (Sep 20 2026, Torry's "Tours" item): js/ps-tours.js and
// the Charts tour. Orientation only: a spotlight on one landmark at a time
// plus a card, never a click into the app. What this pins:
//   1. with a drawn chart, the tour opens on its first card, the spotlight
//      encloses the chart, and every following card's spotlight encloses
//      the landmark it names (Sigma, ?, +, the type button);
//   2. Back and Next walk the cards; Done on the last card closes the tour
//      and remembers it as seen;
//   3. keyboard: Right advances, Left goes back, Tab stays inside the card,
//      Escape exits and returns focus into the app;
//   4. the spotlight FOLLOWS a rebuilt toolbar: a re-render replaces the
//      Sigma button element and the spot re-attaches to the new one;
//   5. the Help menu entry exists, is enabled with a chart, is disabled with
//      data but no drawn chart (with a reason), and the palette lists it;
//   6. a bare app (no data): starting the tour opens the built-in example,
//      the chart draws, the tour starts, and the coach mark stays hidden;
//   7. the chart's empty state offers "New here? Tour this workspace" only
//      while the tour can run and has not been seen;
//   8. no tour chrome inside the chart host (exports cannot carry it).
// CONTROL: on main (no ps-tours.js) case 1 fails at the first assertion.
//
// Usage: node standalone/verify/tours-check.mjs

import { createRequire } from 'node:module';
import path from 'node:path';

function loadPlaywright() {
    const bases = [];
    if (process.env.GB2_NODE_BASE) bases.push(process.env.GB2_NODE_BASE);
    bases.push(process.cwd(), new URL('.', import.meta.url).pathname, '/private/tmp', '/tmp');
    for (const b of bases) {
        try { return createRequire(path.join(b, 'x.js'))('playwright'); }
        catch { /* try the next shared dependency location */ }
    }
    console.error('playwright not found; cd /tmp && npm i playwright');
    process.exit(2);
}
const { chromium } = loadPlaywright();
const PAGE = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
let failures = 0;
function ok(cond, label) { if (cond) console.log('  ok  ' + label); else { console.log('  FAIL ' + label); failures++; } }

const browser = await chromium.launch();
async function boot({ welcome = false } = {}) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage({ viewport: { width: 1470, height: 900 } });
    page.on('filechooser', () => {}); // Playwright dismisses an unhandled file chooser and Chromium reports that as cancel, which the app honours; a listener keeps the chooser open
    await page.addInitScript((welcome) => {
        try {
            localStorage.clear();
            localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1');
            if (!welcome) sessionStorage.setItem('psstandalone.welcome.dismissed', '1');
        } catch (e) {}
    }, welcome);
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.goto(PAGE); await page.waitForTimeout(900);
    return { ctx, page, errors };
}
// The tour's state as the page sees it: the card copy, the spotlight box
// and the box of the element a selector names.
const snap = (sel) => {
    const T = window.PS_TOURS, a = T && T.active();
    const root = document.getElementById('ps-tour');
    const spot = root && root.querySelector('.ps-tour-spot');
    const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
    const vis = Array.from(document.querySelectorAll(sel || 'x')).find(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    return {
        active: a, open: !!(root && !root.hidden),
        eyebrow: root ? root.querySelector('#ps-tour-eyebrow').textContent : '',
        title: root ? root.querySelector('#ps-tour-title').textContent : '',
        body: root ? root.querySelector('#ps-tour-body').textContent : '',
        next: root ? root.querySelector('#ps-tour-next').textContent : '',
        backOff: root ? root.querySelector('#ps-tour-back').disabled : null,
        spotShown: !!(spot && spot.style.display !== 'none'),
        spot: spot && spot.style.display !== 'none' ? rect(spot) : null,
        target: rect(vis),
        focus: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : ''
    };
};
const union = (rs) => rs.reduce((u, r) => ({ l: Math.min(u.l, r.l), t: Math.min(u.t, r.t), r: Math.max(u.r, r.r), b: Math.max(u.b, r.b) }), { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity });
const encloses = (spot, t, pad = 8) => !!(spot && t && spot.l <= t.l + 1 && spot.t <= t.t + 1 && spot.r >= t.r - 1 && spot.b >= t.b - 1 && spot.l >= t.l - pad && spot.t >= t.t - pad);

// ---- 1 + 2 + 3 + 4 + 8: the tour on a drawn chart
{
    const { ctx, page, errors } = await boot();
    await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        const S = window.PS_SHELL;
        S.loadTable('tour probe', ['cond', 'score'], [['a', 2], ['a', 3], ['a', 4], ['b', 5], ['b', 6], ['b', 7]], { cond: 'nominal', score: 'continuous' });
        await s(600);
        S.setWorkspace('chart'); S.setModule('plotbuilder'); S.setRoles('plotbuilder', { xvar: 'cond', yvar: 'score' });
        await s(1500);
    });
    const started = await page.evaluate(() => window.PS_TOURS && window.PS_TOURS.start('charts'));
    await page.waitForTimeout(500);
    let s = await page.evaluate(snap, '#ps-slots');
    ok(started === true && s.open && s.active && s.active.id === 'charts' && s.active.step === 0, '1: the Charts tour opens on its first card (' + JSON.stringify(s.active) + ')');
    ok(/^Charts tour . 1 of \d$/.test(s.eyebrow) && s.title === 'Chart setup', '1: the first card is the setup rail (' + s.eyebrow + ')');
    ok(s.spotShown && encloses(s.spot, s.target), '1: the spotlight encloses the setup rail');
    ok(s.backOff === true && s.next === 'Next', '1: Back is off on the first card, Next reads Next');
    ok(s.focus === 'ps-tour-next', '1: focus lands on Next');
    // walk forward with the mouse, checking each landmark's spotlight
    // A step may union two landmarks (type button + palette chip, + and
    // the eye): the spotlight must enclose EVERY named element and hug the
    // union of them, not any one of them.
    const expect = [
        { title: 'One rule runs this room', sels: ['#psroot svg[data-role="gb2-chart-svg"]'] },
        { title: 'Type and theme', sels: ['[data-role="graphtype-trigger"]', '[data-role="palette-trigger"]'] },
        { title: 'The numbers', sels: ['button[aria-label="Statistics"]'] },
        { title: 'Hide, settings, find', sels: ['button[aria-label$="hide elements"]', 'button[aria-label="Chart settings"]', '[data-role="setting-search-trigger"]'] },
        { title: 'Add to the chart', sels: ['button[aria-label="Add to chart"]'] },
        { title: 'Check my chart', sels: ['#ps-status-check'] },
        { title: 'Export', sels: ['#ps-export'] },
        { title: 'Which graph?', sels: ['[data-ps-menu="help"]'] }
    ];
    for (const e of expect) {
        await page.click('#ps-tour-next'); await page.waitForTimeout(320);
        const rects = [];
        for (const sel of e.sels) { s = await page.evaluate(snap, sel); rects.push(s.target); }
        const u = rects.every(Boolean) ? union(rects) : null;
        ok(s.title === e.title && encloses(s.spot, u, 8), '1: "' + e.title + '" spotlights ' + e.sels.join(' + ') + (s.title === e.title ? '' : ' (got "' + s.title + '")') + (encloses(s.spot, u, 8) ? '' : ' spot=' + JSON.stringify(s.spot) + ' union=' + JSON.stringify(u)));
    }
    ok(s.next === 'Done' && /9 of 9/.test(s.eyebrow), '2: the last card reads Done (' + s.eyebrow + ')');
    await page.click('#ps-tour-back'); await page.waitForTimeout(320);
    s = await page.evaluate(snap, '#ps-export');
    ok(s.title === 'Export' && encloses(s.spot, s.target), '2: Back returns to the previous card with its spotlight');
    // 4: rebuild the toolbar under the Sigma card and watch the spot follow
    for (let i = 0; i < 4; i++) await page.click('#ps-tour-back'); await page.waitForTimeout(320);
    const before = await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button[aria-label="Statistics"]')).find(x => x.getBoundingClientRect().width > 0); b.__probeMark = 1; return document.getElementById('ps-tour-title').textContent; });
    ok(before === 'The numbers', '4: on the Sigma card (' + before + ')');
    await page.evaluate(async () => { const s = ms => new Promise(r => setTimeout(r, ms)); window.PS_SHELL.setRoles('plotbuilder', { xvar: 'cond', yvar: 'score', groupVar: 'cond' }); await s(1400); });
    const after = await page.evaluate(() => { const b = Array.from(document.querySelectorAll('button[aria-label="Statistics"]')).find(x => x.getBoundingClientRect().width > 0); return { fresh: !b.__probeMark }; });
    s = await page.evaluate(snap, 'button[aria-label="Statistics"]');
    ok(after.fresh && s.open && s.title === 'The numbers' && encloses(s.spot, s.target), '4: after a re-render replaced the Sigma button, the spotlight sits on the new one');
    // 8: nothing of the tour lives inside the chart host
    const inHost = await page.evaluate(() => document.querySelectorAll('#psroot .ps-tour, #psroot .ps-tour-card, #psroot .ps-tour-spot').length);
    ok(inHost === 0, '8: no tour chrome inside the chart host');
    // 3: keyboard
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(250);
    s = await page.evaluate(snap, 'button[aria-label$="hide elements"]');
    ok(s.title === 'Hide, settings, find', '3: Right arrow advances (' + s.title + ')');
    await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(250);
    s = await page.evaluate(snap, 'button[aria-label="Statistics"]');
    ok(s.title === 'The numbers', '3: Left arrow goes back (' + s.title + ')');
    const tabbed = [];
    for (let i = 0; i < 4; i++) { await page.keyboard.press('Tab'); tabbed.push(await page.evaluate(() => document.activeElement.id)); }
    ok(tabbed.every(id => /^ps-tour-(exit|back|next)$/.test(id)) && tabbed[0] === 'ps-tour-exit', '3: Tab cycles inside the card (' + tabbed.join(' > ') + ')');
    await page.keyboard.press('Escape'); await page.waitForTimeout(250);
    s = await page.evaluate(snap);
    const focusInApp = await page.evaluate(() => { const a = document.activeElement; return !!(a && !a.closest('#ps-tour')); });
    ok(!s.open && !s.active && focusInApp, '3: Escape exits and focus returns to the app');
    // 2: Done marks it seen
    await page.evaluate(() => { window.PS_TOURS.forget(); window.PS_TOURS.start('charts'); });
    await page.waitForTimeout(300);
    const seenBefore = await page.evaluate(() => window.PS_TOURS.seen('charts'));
    for (let i = 0; i < 9; i++) { await page.click('#ps-tour-next'); await page.waitForTimeout(120); }
    const done = await page.evaluate(() => ({ open: !document.getElementById('ps-tour').hidden, seen: window.PS_TOURS.seen('charts') }));
    ok(seenBefore === false && !done.open && done.seen === true, '2: Done closes the tour and remembers it as seen');
    // 5: the Help menu entry with a chart drawn
    const menu = await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        document.querySelector('[data-ps-menu="help"]').click(); await s(300);
        const b = document.querySelector('#ps-appmenu [data-app-command="tour-charts"]');
        const out = { present: !!b, label: b && b.textContent.trim(), off: b && b.disabled };
        document.querySelector('[data-ps-menu="help"]').click(); await s(150);
        out.palette = window.PS_SHELL.runCommandCatalog().some(c => c.command === 'tour-charts');
        return out;
    });
    ok(menu.present && /Tour the Charts workspace/.test(menu.label) && menu.off === false, '5: Help > Tour the Charts workspace is present and enabled with a chart (' + menu.label + ')');
    ok(menu.palette, '5: the command palette lists it');
    // 5b: from the menu, the tour actually starts
    await page.evaluate(() => { document.querySelector('[data-ps-menu="help"]').click(); });
    await page.waitForTimeout(250);
    await page.click('#ps-appmenu [data-app-command="tour-charts"]'); await page.waitForTimeout(500);
    s = await page.evaluate(snap);
    ok(s.open && s.active && s.active.step === 0, '5: the menu entry starts the tour');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    ok(errors.length === 0, 'chart: no page errors' + (errors.length ? ' (' + errors[0] + ')' : ''));
    await ctx.close();
}
// ---- 5 (disabled) + 7: data present, chart not drawn
{
    const { ctx, page, errors } = await boot();
    await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        const S = window.PS_SHELL;
        S.loadTable('tour probe', ['cond', 'score'], [['a', 2], ['b', 5]], { cond: 'nominal', score: 'continuous' });
        await s(500);
        S.setWorkspace('chart'); S.setModule('plotbuilder'); S.setRoles('plotbuilder', {});
        await s(900);
    });
    const st = await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        const out = { state: window.PS_SHELL.chartHelpState(), line: !!document.getElementById('ps-empty-tour') };
        document.querySelector('[data-ps-menu="help"]').click(); await s(300);
        const b = document.querySelector('#ps-appmenu [data-app-command="tour-charts"]');
        out.off = b && b.disabled; out.tip = b && b.getAttribute('data-tip');
        document.querySelector('[data-ps-menu="help"]').click(); await s(150);
        const r = window.PS_TOURS.start('charts'); await s(300);
        out.started = r; const t = document.getElementById('ps-tour'); out.open = !!(t && !t.hidden);
        out.toast = (document.getElementById('ps-toast') || {}).textContent || '';
        return out;
    });
    ok(st.state === 'empty' && st.off === true && /Assign variables so this chart draws/.test(st.tip || ''), '5: with data but no drawn chart the entry is disabled with a reason (' + st.tip + ')');
    ok(st.line === false, '7: the empty state does not offer the tour when it could not run');
    ok(st.started === true && st.open === false && /Assign variables/.test(st.toast), '5: a forced start refuses with a toast instead of pointing at nothing (' + st.toast.slice(0, 60) + ')');
    ok(errors.length === 0, 'no-chart: no page errors' + (errors.length ? ' (' + errors[0] + ')' : ''));
    await ctx.close();
}
// ---- 6 + 7: a bare app
{
    const { ctx, page, errors } = await boot();
    const bare = await page.evaluate(() => {
        const S = window.PS_SHELL;
        return { table: !!(S.project.table && S.project.table.order && S.project.table.order.length), ws: S.workspace(), line: !!document.getElementById('ps-empty-tour'), lineText: (document.getElementById('ps-empty-tour') || {}).textContent || '', coachKeyCleared: (localStorage.removeItem('psstandalone.coach.clickToEdit.v1'), true) };
    });
    console.log('  info  bare app: table=' + bare.table + ' ws=' + bare.ws + ' line=' + bare.line);
    if (bare.line) ok(/New here\? Tour this workspace/.test(bare.lineText), '7: the empty state offers the tour to a bare app (' + bare.lineText + ')');
    const r = await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        const line = document.getElementById('ps-empty-tour');
        if (line) line.click(); else window.PS_TOURS.start('charts');
        for (let i = 0; i < 80; i++) { await s(100); if (!document.getElementById('ps-tour')?.hidden) break; }
        await s(300);
        const coach = document.getElementById('ps-coach');
        return { open: !document.getElementById('ps-tour')?.hidden, state: window.PS_SHELL.chartHelpState(), name: window.PS_SHELL.project.name, coachHidden: !coach || coach.hidden, ws: window.PS_SHELL.workspace() };
    });
    ok(r.open && r.state === 'ready' && /Dose response/.test(r.name), '6: from a bare app the tour opens the example and starts (' + r.name + ', ' + r.state + ')');
    ok(r.coachHidden && r.ws === 'chart', '6: the coach mark stays hidden under the tour, on the Charts workspace');
    ok(errors.length === 0, 'bare: no page errors' + (errors.length ? ' (' + errors[0] + ')' : ''));
    await ctx.close();
}
// ---- 9: the coach mark's second button (the real first-chart entry point)
{
    const ctx = await browser.newContext();
    const page = await ctx.newPage({ viewport: { width: 1470, height: 900 } });
    page.on('filechooser', () => {}); // Playwright dismisses an unhandled file chooser and Chromium reports that as cancel, which the app honours; a listener keeps the chooser open
    await page.addInitScript(() => { try { localStorage.clear(); sessionStorage.setItem('psstandalone.welcome.dismissed', '1'); } catch (e) {} });
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.goto(PAGE); await page.waitForTimeout(1200);
    const coach = await page.evaluate(() => { const c = document.getElementById('ps-coach'); const b = document.getElementById('ps-coach-tour'); return { shown: !!(c && !c.hidden), btn: b ? b.textContent.trim() : '' }; });
    ok(coach.shown && coach.btn === 'Tour this workspace', '9: the coach mark on the first drawn chart carries a Tour this workspace button (' + JSON.stringify(coach) + ')');
    await page.click('#ps-coach-tour'); await page.waitForTimeout(500);
    const after = await page.evaluate(() => ({ coachHidden: document.getElementById('ps-coach').hidden, seen: localStorage.getItem('psstandalone.coach.clickToEdit.v1'), tour: window.PS_TOURS.active() }));
    ok(after.coachHidden && after.seen === '1' && after.tour && after.tour.step === 0, '9: clicking it dismisses the coach for good and starts the tour (' + JSON.stringify(after) + ')');
    ok(errors.length === 0, 'coach: no page errors' + (errors.length ? ' (' + errors[0] + ')' : ''));
    await ctx.close();
}
// ---- 10: New project (no table): the empty state offers the tour, which opens the example
{
    const { ctx, page, errors } = await boot();
    // New project lands on the Data workspace (an empty grid); the chart
    // card, and the line in it, are what the user sees on switching to Charts.
    await page.evaluate(async () => { const s = ms => new Promise(r => setTimeout(r, ms)); window.PS_SHELL.showWelcome(true); await s(200); document.getElementById('ps-welcome-new').click(); await s(500); window.PS_SHELL.setWorkspace('chart'); await s(500); });
    const st = await page.evaluate(() => { const S = window.PS_SHELL; const l = document.getElementById('ps-empty-tour'); return { table: S.tableHasData(), state: S.chartHelpState(), line: l ? l.textContent : '' }; });
    ok(st.table === false && st.state === 'empty' && st.line === 'New here? Tour this workspace', '10: a new project holds no data and its empty state offers the tour (' + JSON.stringify(st) + ')');
    await page.click('#ps-empty-tour');
    const r = await page.evaluate(async () => { const s = ms => new Promise(r => setTimeout(r, ms)); for (let i = 0; i < 80; i++) { await s(100); const t = document.getElementById('ps-tour'); if (t && !t.hidden) break; } await s(200); return { tour: window.PS_TOURS.active(), name: window.PS_SHELL.project.name, state: window.PS_SHELL.chartHelpState(), note: document.getElementById('ps-tour-note').textContent, noteShown: !document.getElementById('ps-tour-note').hidden }; });
    ok(r.tour && r.tour.step === 0 && /Dose response/.test(r.name) && r.state === 'ready', '10: the tour opens the example so it has landmarks, then starts (' + r.name + ')');
    ok(r.noteShown && /Dose response example is open/.test(r.note), '10: and the first card says so (' + r.note + ')');
    await page.click('#ps-tour-next'); await page.waitForTimeout(250);
    ok(await page.evaluate(() => document.getElementById('ps-tour-note').hidden), '10: the note rides the first card only');
    ok(errors.length === 0, 'new-project: no page errors' + (errors.length ? ' (' + errors[0] + ')' : ''));
    await ctx.close();
}
// ---- the room tours: a generic walk. Each card either spotlights the
// landmark it names or is skipped because that landmark is not on screen.
async function walk(page, id, expect) {
    await page.evaluate((id) => window.PS_TOURS.start(id), id); await page.waitForTimeout(700);
    const seen = [];
    for (let guard = 0; guard < 20; guard++) {
        const st = await page.evaluate(() => { const a = window.PS_TOURS.active(); if (!a) return null; const r = document.getElementById('ps-tour'); return { title: r.querySelector('#ps-tour-title').textContent, next: r.querySelector('#ps-tour-next').textContent, spotShown: r.querySelector('.ps-tour-spot').style.display !== 'none' }; });
        if (!st) break;
        const exp = expect[st.title];
        let enc = null;
        if (exp && exp.length) {
            const rects = []; let s;
            for (const sel of exp) { s = await page.evaluate(snap, sel); rects.push(s.target); }
            enc = rects.every(Boolean) ? encloses(s.spot, union(rects), 8) : false;
        }
        seen.push({ title: st.title, spotShown: st.spotShown, enc });
        if (st.next === 'Done') break;
        await page.click('#ps-tour-next'); await page.waitForTimeout(300);
    }
    await page.evaluate(() => { window.PS_TOURS.exit(); window.PS_TOURS.forget(); });
    return seen;
}
const titles = (seen) => seen.map(x => x.title).join(' | ');
const allSpotted = (seen, expect) => seen.every(x => !expect[x.title] || !expect[x.title].length || x.enc === true);
// ---- 11: the app tour, from the Data workspace, with a target-less closing card
{
    const { ctx, page, errors } = await boot();
    await page.evaluate(() => window.PS_SHELL.setWorkspace('data')); await page.waitForTimeout(500);
    const exp = { 'Four rooms, one project': ['.ps-workspace-switcher'], 'Your documents': ['#ps-project-nav', '#ps-project-add'], 'Open and Save project': ['#ps-load', '#ps-save'], 'Help': ['[data-ps-menu="help"]'], 'The whole trick': [] };
    const seen = await walk(page, 'app', exp);
    ok(titles(seen) === Object.keys(exp).join(' | '), '11: the app tour walks its five cards (' + titles(seen) + ')');
    ok(allSpotted(seen, exp), '11: every app card spotlights its landmark');
    ok(seen[4] && seen[4].spotShown === false, '11: the closing card has no spotlight, just the scrim');
    ok(errors.length === 0, 'app: no page errors' + (errors.length ? ' (' + errors[0] + ')' : ''));
    await ctx.close();
}
// ---- 12: the Data tour on the example (so a role badge exists)
{
    const { ctx, page, errors } = await boot();
    const exp = { 'Columns are variables': ['tr:has(#ps-grid-col-0)'], 'Roles on the sheet': ['.ps-grid-role'], 'Editing': ['#ps-data-undo', '#ps-data-addrow'], 'Find': ['#ps-data-find-btn'], 'Filter and Columns': ['#ps-data-filter-btn', '#ps-data-hidden-columns'], 'Variable properties': ['#ps-settings-panel'], 'Export data': ['#ps-export'], 'The source of truth': [] };
    const seen = await walk(page, 'data', exp);
    const ws = await page.evaluate(() => window.PS_SHELL.workspace());
    ok(ws === 'data' && titles(seen) === Object.keys(exp).join(' | '), '12: the Data tour switches to Data and walks its eight cards (' + titles(seen) + ')');
    ok(allSpotted(seen, exp), '12: every Data card spotlights its landmark');
    ok(errors.length === 0, 'data: no page errors' + (errors.length ? ' (' + errors[0] + ')' : ''));
    await ctx.close();
}
// ---- 13: the Notebook tour, empty then with a kept page
{
    const { ctx, page, errors } = await boot();
    await page.evaluate(() => window.PS_SHELL.setWorkspace('pinboard')); await page.waitForTimeout(500);
    const link = await page.evaluate(() => { const l = document.getElementById('ps-empty-tour-notebook'); return l ? l.textContent : ''; });
    ok(link === 'New here? Tour this workspace', '13: the empty Notebook offers the tour (' + link + ')');
    const exp = { 'How a page arrives': ['#ps-pinscroll'], 'Sections': ['#ps-tabs'], "A page's verbs": ['.ps-pinpage-actions'], 'The page rail': ['#ps-inspector-pinboard'], 'Export Notebook': ['#ps-export'], 'Pages stay honest': [] };
    let seen = await walk(page, 'notebook', exp);
    ok(titles(seen) === "How a page arrives | Sections | The page rail | Export Notebook | Pages stay honest", '13: with nothing kept, the page-verbs card is skipped honestly (' + titles(seen) + ')');
    ok(allSpotted(seen, exp), '13: every shown Notebook card spotlights its landmark');
    await page.evaluate(async () => { const s = ms => new Promise(r => setTimeout(r, ms)); const S = window.PS_SHELL; S.setWorkspace('chart'); await s(400); S.pinChartForTest(); await s(500); });
    seen = await walk(page, 'notebook', exp);
    ok(titles(seen) === Object.keys(exp).join(' | ') && allSpotted(seen, exp), '13: with a kept page all six cards show and the verbs card spotlights the page bar (' + titles(seen) + ')');
    ok(errors.length === 0, 'notebook: no page errors' + (errors.length ? ' (' + errors[0] + ')' : ''));
    await ctx.close();
}
// ---- 14: the Layouts tour, empty then with a layout
{
    const { ctx, page, errors } = await boot();
    await page.evaluate(() => window.PS_SHELL.setWorkspace('layout')); await page.waitForTimeout(500);
    const link = await page.evaluate(() => { const l = document.getElementById('ps-workspace-empty-tour'); return l ? { hidden: l.hidden, tour: l.getAttribute('data-tour'), text: l.textContent } : null; });
    ok(link && !link.hidden && link.tour === 'layouts', '14: the empty Layouts room offers its tour (' + JSON.stringify(link) + ')');
    const empty = { 'Create a layout': ['#ps-workspace-empty-create'], 'Add chart, Add text': ['#ps-laddchart', '#ps-laddpin', '#ps-laddlabel'], 'The page': ['#ps-lcanvas'], 'Layout properties': ['#ps-inspector-layout'], 'Export layout': ['#ps-export'], 'Keep first, arrange later': [] };
    let seen = await walk(page, 'layouts', empty);
    ok(titles(seen) === 'Create a layout | Export layout | Keep first, arrange later' && allSpotted(seen, empty), '14: with no layout, only the create, export and closing cards show (' + titles(seen) + ')');
    await page.click('#ps-workspace-empty-tour'); await page.waitForTimeout(500);
    const fromLink = await page.evaluate(() => { const a = window.PS_TOURS.active(); window.PS_TOURS.exit(); window.PS_TOURS.forget(); return a; });
    ok(fromLink && fromLink.id === 'layouts', '14: the empty-state link starts the Layouts tour');
    await page.evaluate(async () => { const s = ms => new Promise(r => setTimeout(r, ms)); window.PS_SHELL.addLayout(); await s(700); });
    const full = Object.assign({}, empty, { 'Create a layout': ['button[aria-label="New layout"]'] });
    seen = await walk(page, 'layouts', full);
    ok(titles(seen) === Object.keys(full).join(' | ') && allSpotted(seen, full), '14: with a layout all six cards show, the first on the New layout plus (' + titles(seen) + ')');
    ok(errors.length === 0, 'layouts: no page errors' + (errors.length ? ' (' + errors[0] + ')' : ''));
    await ctx.close();
}
// ---- 15 + 16: five Help entries, the palette, and the welcome link
{
    const { ctx, page, errors } = await boot();
    const menu = await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        document.querySelector('[data-ps-menu="help"]').click(); await s(300);
        const items = ['tour-app', 'tour-data', 'tour-charts', 'tour-notebook', 'tour-layouts'].map(c => { const b = document.querySelector('#ps-appmenu [data-app-command="' + c + '"]'); return b ? { c, label: b.textContent.trim(), off: b.disabled } : { c, missing: true }; });
        document.querySelector('[data-ps-menu="help"]').click(); await s(150);
        const pal = window.PS_SHELL.runCommandCatalog().filter(x => /^tour-/.test(x.command)).length;
        return { items, pal };
    });
    ok(menu.items.every(i => !i.missing && !i.off) && menu.pal === 5, '15: Help lists five tours, all enabled with a chart, and the palette has all five (' + menu.items.map(i => i.label).join(' / ') + ')');
    await page.evaluate(async () => { const s = ms => new Promise(r => setTimeout(r, ms)); window.PS_SHELL.showWelcome(true); await s(300); });
    const wl = await page.evaluate(() => { const l = document.getElementById('ps-welcome-tour'); const r = l && l.getBoundingClientRect(); return l ? { text: l.textContent, visible: r.width > 0 } : null; });
    ok(wl && wl.visible && /two-minute tour/.test(wl.text), '16: the welcome dialog offers the app tour (' + (wl && wl.text) + ')');
    await page.click('#ps-welcome-tour'); await page.waitForTimeout(600);
    const after = await page.evaluate(() => ({ welcome: document.getElementById('ps-welcome').style.display, tour: window.PS_TOURS.active() }));
    ok(after.welcome === 'none' && after.tour && after.tour.id === 'app' && after.tour.step === 0, '16: it closes the welcome and starts the app tour (' + JSON.stringify(after) + ')');
    ok(errors.length === 0, 'menu+welcome: no page errors' + (errors.length ? ' (' + errors[0] + ')' : ''));
    await ctx.close();
}
await browser.close();
console.log(failures ? 'tours: FAIL (' + failures + ')' : 'tours: PASS');
process.exit(failures ? 1 : 0);
