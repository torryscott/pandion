// Regression guard for the STANDALONE-SWEEP-JUL25 punch list fixes.
//
// Every assertion here failed before its fix and passes after, and each one
// exists because nothing else in the suite covers that surface. Two are worth
// singling out:
//
//   * "layout zoom does not blank panels" guards a REGRESSION this session
//     shipped and then reverted. Keying chart snapshots on PROJECT_REV was too
//     coarse (it bumps on layout-only state), so changing the zoom blanked
//     every panel to a placeholder. It was reproduced only on the third
//     attempt; without this test it would come back silently.
//
//   * the file-drop cases assert the loader is TOPMOST, not merely displayed.
//     The weaker assertion passes while the bug is present, which is exactly
//     why the bug survived: the loader was always shown, just underneath the
//     start centre.
import { createRequire } from 'node:module';
import path from 'node:path';

function loadPlaywright() {
    for (const base of [process.cwd(), new URL('.', import.meta.url).pathname,
                        '/private/tmp', '/tmp']) {
        try { return createRequire(path.join(base, 'x.js'))('playwright'); }
        catch { /* try the next shared dependency location */ }
    }
    console.error('playwright not found');
    process.exit(2);
}
const { chromium } = loadPlaywright();
const PAGE = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));

const browser = await chromium.launch();
const errors = [];
function ok(cond, msg) {
    if (!cond) throw new Error(msg);
    console.log('  ok  ' + msg);
}
async function freshPage(opts) {
    const ctx = await browser.newContext(Object.assign(
        { viewport: { width: 1440, height: 900 } }, opts || {}));
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(PAGE);
    return { ctx, page };
}
async function sampleApp(opts) {
    const { ctx, page } = await freshPage(opts);
    await page.waitForSelector('#ps-welcome-sample', { timeout: 20000 });
    await page.click('#ps-welcome-sample');
    await page.waitForSelector('.graphbuilder2-host svg', { timeout: 20000 });
    await page.waitForTimeout(700);
    return { ctx, page };
}

// ---------------------------------------------------------------- item t2-44
// 22 CSS rules used `font: <size> inherit`, which is invalid (inherit is legal
// only as the WHOLE value), so the browser dropped them and most controls fell
// back to the UA default. 51 of 67 rendered in Arial 13.3333px.
{
    const { ctx, page } = await sampleApp();
    const bad = await page.evaluate(() => {
        let n = 0;
        document.querySelectorAll('button, input, select, textarea').forEach(el => {
            if (el.closest('.graphbuilder2-host')) return;
            if (!el.offsetParent && el.offsetWidth === 0) return;
            const fam = getComputedStyle(el).fontFamily.split(',')[0].replace(/"/g, '');
            if (!/apple-system|BlinkMac|Segoe|system-ui|Roboto|Helvetica/i.test(fam)) n++;
        });
        return n;
    });
    ok(bad === 0, `no shell control falls back to the browser default font (${bad} bad)`);
    await ctx.close();
}

// ---------------------------------------------------------------- item t2-29
// Every button had a hover and no :active, so no click felt like it landed.
{
    const { ctx, page } = await sampleApp();
    const press = await page.evaluate(() => {
        const el = document.getElementById('ps-reset');
        const rest = getComputedStyle(el).backgroundColor;
        // :active cannot be forced from script, so assert the stylesheet
        // instead. Count SELECTORS, not rules: the press states are grouped,
        // so a rule-level count reads 6 where 34 controls are covered.
        let active = 0, dur = getComputedStyle(el).transitionDuration;
        for (const ss of document.styleSheets) {
            let rules; try { rules = ss.cssRules; } catch { continue; }
            for (const r of rules) {
                if (!r.selectorText) continue;
                active += r.selectorText.split(',')
                    .filter(s => /:active/.test(s)).length;
            }
        }
        document.body.classList.add('ps-reduce-motion');
        const reduced = getComputedStyle(el).transitionDuration;
        document.body.classList.remove('ps-reduce-motion');
        return { rest, active, dur, reduced };
    });
    ok(press.active >= 20, `press states are defined broadly (${press.active} :active rules)`);
    ok(/0\.09s/.test(press.dur), `chrome transitions are 90ms (${press.dur})`);
    ok(parseFloat(press.reduced) < 0.01, `ps-reduce-motion collapses them (${press.reduced})`);
    await ctx.close();
}

// ---------------------------------------------------------------- item t2-25
// The chrome was four stacked near-whites and carried no brand colour. App bar
// only: the status bar deliberately stays light.
{
    const { ctx, page } = await sampleApp();
    const chrome = await page.evaluate(() => ({
        appbar: getComputedStyle(document.querySelector('.ps-appbar')).backgroundColor,
        statusbar: getComputedStyle(document.querySelector('.ps-statusbar')).backgroundColor,
        theme: (document.querySelector('meta[name=theme-color]') || {}).content,
        wing: getComputedStyle(document.querySelector('.ps-appbar'))
                .getPropertyValue('--ps-wing-upper').trim()
    }));
    ok(chrome.appbar === 'rgb(25, 46, 73)', `app bar is the brand navy (${chrome.appbar})`);
    ok(/^rgb\(2[45]\d, 2\d\d, 2\d\d\)$/.test(chrome.statusbar),
       `status bar stays light by decision (${chrome.statusbar})`);
    ok(chrome.theme === '#192E49', 'theme-color matches the app bar');
    ok(chrome.wing === '#ffffff', 'the wing is recoloured for navy via custom properties');
    await ctx.close();
}

// ---------------------------------------------------------------- item t2-41
// No manifest meant the product could never leave the browser tab.
{
    const { ctx, page } = await sampleApp();
    const m = await page.evaluate(async () => {
        const link = document.querySelector('link[rel=manifest]');
        if (!link) return { present: false };
        try {
            const r = await fetch(link.href);
            if (!r.ok) return { present: true, fetched: false, status: r.status };
            const j = await r.json();
            return { present: true, fetched: true,
                     name: !!(j.name || j.short_name),
                     display: j.display,
                     sizes: (j.icons || []).map(i => i.sizes).sort().join(','),
                     start: !!j.start_url };
        } catch (e) { return { present: true, fetched: false, err: String(e) }; }
    });
    ok(m.present, 'a manifest is linked');
    // file:// cannot fetch a sibling manifest in every context; only assert the
    // CONTENTS when it actually loaded (the hosted copy always can).
    if (m.fetched) {
        ok(m.name && m.start, 'manifest carries name and start_url');
        ok(m.display === 'standalone', `display is standalone (${m.display})`);
        ok(m.sizes === '192x192,512x512', `both required icon sizes (${m.sizes})`);
    } else {
        console.log('  --  manifest not fetchable from this page origin, contents not checked');
    }
    await ctx.close();
}

// ---------------------------------------------------------------- item t1-01
// The loader sits at z-index 9999 and the start centre at 13000, so on a cold
// load every path through openLoader() rendered UNDERNEATH it.
{
    async function dropOnStartScreen(name, content, type) {
        const { ctx, page } = await freshPage();
        await page.waitForSelector('#ps-welcome', { state: 'visible', timeout: 20000 });
        await page.evaluate(({ name, content, type }) => {
            const dt = new DataTransfer();
            dt.items.add(new File([content], name, { type }));
            document.dispatchEvent(new DragEvent('drop',
                { dataTransfer: dt, bubbles: true, cancelable: true }));
        }, { name, content, type });
        await page.waitForTimeout(900);
        const v = await page.evaluate(() => {
            const l = document.getElementById('ps-loader');
            if (!l || getComputedStyle(l).display === 'none') return { shown: false };
            const w = document.getElementById('ps-welcome');
            const r = l.getBoundingClientRect();
            const top = document.elementFromPoint(r.x + r.width / 2, r.y + 60);
            return { shown: true,
                     covered: !!(w && getComputedStyle(w).display !== 'none'),
                     topmost: !!(top && l.contains(top)) };
        });
        await ctx.close();
        return v;
    }
    const csv = await dropOnStartScreen('d.csv', 'g,v\nA,1\nB,2\n', 'text/csv');
    ok(csv.shown && !csv.covered && csv.topmost,
       'a CSV dropped on the start screen shows the import preview on top');
    const png = await dropOnStartScreen('x.png', '\x89PNG\r\n\x1a\nrubbish', 'image/png');
    ok(png.shown && !png.covered,
       'an unsupported file surfaces a readable message rather than nothing');
    const proj = await dropOnStartScreen('x.pand', '{"nope":true}', 'application/json');
    ok(proj.shown && !proj.covered,
       'a corrupt project file surfaces its message rather than nothing');
}

// ---------------------------------------------------------------- item t1-08
// Reset styling discarded everything with no confirm and nothing to recover
// it, and bypassed setOption so the engine's undo could not help either.
{
    const { ctx, page } = await sampleApp();
    const r = await page.evaluate(async () => {
        const sleep = ms => new Promise(x => setTimeout(x, ms));
        const c = PS_SHELL.charts().filter(x => x.type !== 'layout')[0];
        window.setOption('barColor', '#ff0000');
        await sleep(600);
        const styled = JSON.stringify(c.options[c.module] || {});
        document.getElementById('ps-reset').click();
        await sleep(500);
        const cleared = JSON.stringify(c.options[c.module] || {});
        const btn = document.querySelector('#ps-toast button');
        if (btn) btn.click();
        await sleep(700);
        return { styled, cleared, hadUndo: !!btn,
                 restored: JSON.stringify(c.options[c.module] || {}) };
    });
    ok(/ff0000/.test(r.styled), 'a style edit lands on the chart');
    // Not "the store is empty": item 27 put plotWidth/plotHeight in it, and
    // the button says Reset chart STYLING. The plot size is the pane fit, not
    // a style, and clearing it would only flash - auto-fit would write the
    // same numbers straight back. So the contract is that styling goes and
    // the size stays, which is what this now asserts.
    ok(!/ff0000/.test(r.cleared), `Reset styling clears it (${r.cleared})`);
    ok(Object.keys(JSON.parse(r.cleared)).every(
           k => k === 'plotWidth' || k === 'plotHeight'),
       'leaving nothing behind but the pane size');
    ok(r.hadUndo, 'Reset styling offers an Undo toast');
    ok(/ff0000/.test(r.restored), 'Undo restores the styling exactly');
    await ctx.close();
}

// ---------------------------------------------------------------- item t1-06
// Data could be imported and never exported, so a cleaned table could not
// leave the app. Writes t.raw, so zero-padded ids survive.
{
    const { ctx, page } = await sampleApp({ acceptDownloads: true });
    await page.evaluate(() => {
        // headless Chromium exposes showSaveFilePicker but cannot show it
        window.showSaveFilePicker = undefined;
        const p = PS_SHELL.parseCSV('id,note,v\n007,"needs, review",5\n008,"said ""fine""",6\n');
        PS_SHELL.loadTable('fidelity.csv', p.header, p.rows);
    });
    await page.waitForTimeout(900);
    await page.click('[data-ps-menu="file"]');
    await page.waitForTimeout(200);
    const [dl] = await Promise.all([
        page.waitForEvent('download'),
        page.click('[data-app-command="export-data"]')
    ]);
    const stream = await dl.createReadStream();
    let text = '';
    for await (const chunk of stream) text += chunk;
    const lines = text.trim().split(/\r?\n/);
    ok(lines[0] === 'id,note,v', `header round-trips (${lines[0]})`);
    ok(lines[1].startsWith('007,'), 'zero-padded ids survive export');
    ok(lines[1].includes('"needs, review"'), 'a comma inside a field stays quoted');
    ok(lines[2].includes('"said ""fine"""'), 'embedded quotes are doubled');
    await ctx.close();
}

// ------------------------------------------------------------------ B1 / B2
// Layout panels for NON-ACTIVE charts are drawn from cached snapshots. Those
// used to go stale on data edits (B1) and be dropped silently from exports
// (B2). Snapshots are now revision-keyed on a drawing-scoped epoch.
{
    const { ctx, page } = await sampleApp();
    const r = await page.evaluate(async () => {
        const sleep = ms => new Promise(x => setTimeout(x, ms));
        const chartId = PS_SHELL.charts().filter(c => c.type !== 'layout')[0].id;
        PS_SHELL.addLayout(); await sleep(900);
        const lay = PS_SHELL.charts().find(c => c.type === 'layout');
        lay.items = [{ id: 'p1', kind: 'chart', chartId, x: 20, y: 20, w: 460, h: 320 }];
        PS_SHELL.switchChart(lay.id); await sleep(1400);
        const panel = () => {
            const it = document.querySelector('.ps-litem');
            if (!it) return '(none)';
            const s = it.querySelector('svg');
            return s ? s.textContent.replace(/\s+/g, ' ').trim().slice(0, 50) : '(placeholder)';
        };
        const drawn = panel();

        // REGRESSION GUARD: layout-only state must not invalidate anything
        const z = document.getElementById('ps-lzoom');
        let afterZoom = '(no zoom control)';
        if (z) {
            const other = [...z.options].map(o => o.value).find(v => v !== z.value);
            if (other) { z.value = other; z.dispatchEvent(new Event('change', { bubbles: true })); }
            await sleep(600);
            afterZoom = panel();
        }

        // B1: a DATA change must invalidate and redraw
        const t = PS_SHELL.project.table;
        const rows = [];
        for (let i = 0; i < t.raw[t.order[0]].length; i++)
            rows.push(t.order.map(c => c === t.order[1]
                ? String(Number(t.raw[c][i]) * 3 + 500) : t.raw[c][i]));
        PS_SHELL.loadTable(t.name, t.order, rows);
        await sleep(1700);
        PS_SHELL.switchChart(lay.id); await sleep(1400);
        return { drawn, afterZoom, afterData: panel() };
    });
    ok(r.drawn !== '(placeholder)' && r.drawn !== '(none)',
       `a layout panel draws a non-active chart (${r.drawn})`);
    ok(r.afterZoom === r.drawn,
       `layout zoom does not blank panels (REGRESSION GUARD) (${r.afterZoom})`);
    ok(r.afterData !== r.drawn,
       `a data edit redraws the panel instead of showing stale data (${r.afterData})`);
    await ctx.close();
}
{
    const { ctx, page } = await sampleApp();
    const msg = await page.evaluate(async () => {
        const sleep = ms => new Promise(x => setTimeout(x, ms));
        PS_SHELL.addChart(); await sleep(900);
        const empty = PS_SHELL.charts().filter(c => c.type !== 'layout').slice(-1)[0];
        PS_SHELL.setRoles(empty.module, {});
        PS_SHELL.addLayout(); await sleep(800);
        const lay = PS_SHELL.charts().find(c => c.type === 'layout');
        lay.items = [{ id: 'p1', kind: 'chart', chartId: empty.id, x: 20, y: 20, w: 400, h: 280 }];
        PS_SHELL.switchChart(lay.id); await sleep(1200);
        try { await PS_SHELL.exportSource('svg'); return null; }
        catch (e) { return String(e && e.message || e); }
    });
    ok(msg && /panel/i.test(msg),
       'a layout export refuses when a panel cannot be drawn');
    ok(msg && /silently|out of the figure/i.test(msg),
       'the refusal says what would otherwise happen');
}

// ---------------------------------------------------------------- item t1-05
// The shell shipped distNormality empty and the engine does not degrade
// silently: it printed "n/a (needs 3-5000 values)" against the student's real
// cell name, telling them their sample size was wrong when it was not.
// Expected values below are R's shapiro.test on the sample dataset's three
// condition groups, so this pins PARITY and not merely presence.
{
    const { ctx, page } = await sampleApp();
    const norm = await page.evaluate(async () => {
        const sleep = ms => new Promise(x => setTimeout(x, ms));
        PS_SHELL.setModule('distplotbuilder'); await sleep(500);
        PS_SHELL.setRoles('distplotbuilder', { var: 'score', groupVar: 'condition' });
        await sleep(1600);
        return window.gb2_undo.getData().distNormality;
    });
    ok(Array.isArray(norm) && norm.length === 3,
       `Normality ships a row per cell (${norm && norm.length})`);
    const want = { 'Control': [0.978, 0.950102],
                   'Low dose': [0.975, 0.936255],
                   'High dose': [0.956, 0.771885] };
    for (const e of norm) {
        const w = want[e.group];
        ok(!!w, `cell is identified by group (${e.group})`);
        ok(Math.abs(e.w - w[0]) < 5e-4,
           `${e.group}: W matches R (${e.w} vs ${w[0]})`);
        ok(Math.abs(e.p - w[1]) < 1e-5,
           `${e.group}: p matches R (${e.p.toFixed(6)} vs ${w[1]})`);
    }
    await ctx.close();
}

// ---- t4-10 (prose em dashes) + t4-21 (persistent storage) ----
{
    const { ctx, page } = await freshPage();
    // Spy on the persistence request before any app code runs.
    await page.addInitScript(() => {
        window.__psPersistAsked = 0;
        if (navigator.storage && navigator.storage.persist) {
            const real = navigator.storage.persist.bind(navigator.storage);
            navigator.storage.persist = function () {
                window.__psPersistAsked++;
                return real();
            };
        }
    });
    await page.goto(PAGE);
    await page.waitForTimeout(400);
    if (await page.locator('#ps-welcome').isVisible()) {
        await page.click('#ps-welcome-sample');
        await page.waitForTimeout(300);
    }

    // The grid's selection summary. Three prose em dashes broke the house
    // rule; the other four \u2014 in the shell are missing-value glyphs that
    // CLAUDE.md convention 19 mandates, so this checks the PROSE only.
    await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
    await page.waitForTimeout(400);
    const cellBoxes = await page.evaluate(() => {
        const cells = document.querySelectorAll('#ps-datagrid td[data-gc]');
        const pick = i => {
            const r = cells[i].getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        };
        return cells.length > 12 ? [pick(0), pick(12)] : null;
    });
    ok(!!cellBoxes, 'the data grid rendered cells to select');
    await page.mouse.move(cellBoxes[0].x, cellBoxes[0].y);
    await page.mouse.down();
    await page.mouse.move(cellBoxes[1].x, cellBoxes[1].y, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const summary = await page.evaluate(() => {
        const m = document.body.innerText.match(/[^\n]*cells selected[^\n]*/);
        return m ? m[0].trim() : '';
    });
    ok(/cells selected/.test(summary),
       `a real drag selected a range ("${summary.slice(0, 70)}")`);
    ok(summary.indexOf('\u2014') === -1,
       `the grid selection summary carries no em dash ("${summary.slice(0, 70)}")`);

    ok(!(await page.title()).includes('\u2014'),
       `the document title carries no em dash ("${await page.title()}")`);

    const asked = await page.evaluate(() => window.__psPersistAsked);
    const persisted = await page.evaluate(() =>
        navigator.storage && navigator.storage.persisted
            ? navigator.storage.persisted() : null);
    ok(asked > 0 || persisted === true,
       `the app asks the browser to keep its storage (calls=${asked}, already=${persisted})`);

    await page.evaluate(() => window.PS_SHELL.showDiagnostics());
    await page.waitForTimeout(250);
    const diag = await page.evaluate(() =>
        document.getElementById('ps-diagnostics-grid').textContent);
    ok(/Storage persistence/.test(diag),
       'Diagnostics reports whether storage is persistent');
    ok(/Last successful autosave/.test(diag),
       'Diagnostics reports when work last reached storage');
    await ctx.close();
}

// ---- t1-14: Cmd/Ctrl+P reaches the vector exporter, not the DOM printer ----
{
    const { ctx, page } = await freshPage();
    let domPrints = 0;
    await page.addInitScript(() => {
        window.__psDomPrints = 0;
        window.print = function () { window.__psDomPrints++; };
    });
    await page.goto(PAGE);
    await page.waitForTimeout(400);
    if (await page.locator('#ps-welcome').isVisible()) {
        await page.click('#ps-welcome-sample');
        await page.waitForTimeout(400);
    }
    const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${MOD}+p`);
    await page.waitForTimeout(350);
    ok(await page.locator('#ps-exporter').isVisible(),
       'Cmd/Ctrl+P opens the exporter');
    ok(await page.evaluate(() => {
        const q = document.querySelector('input[name="ps-export-format"]:checked');
        return q ? q.value : null;
    }) === 'pdf', 'Cmd/Ctrl+P preselects the vector PDF format');
    domPrints = await page.evaluate(() => window.__psDomPrints);
    ok(domPrints === 0, 'Cmd/Ctrl+P never reaches the browser DOM printer');

    // and the browser's own File > Print still gets an honest page
    ok(await page.evaluate(() => {
        for (const sheet of document.styleSheets) {
            let rules;
            try { rules = sheet.cssRules; } catch { continue; }
            for (const r of rules)
                if (r.media && String(r.media.mediaText).includes('print')) return true;
        }
        return false;
    }), 'a print stylesheet exists for File > Print');
    await ctx.close();
}

// ---- t4-08: the start centre can be dismissed on a COLD load ----
// Escape used to be gated on BOOT_RESTORED, false on a first visit, and there
// was no X, no Close and no backdrop click - so the very first screen a
// student sees had no "let me look around" path.
for (const [how, act] of [
    ['Escape', async page => page.keyboard.press('Escape')],
    ['the close button', async page => page.click('#ps-welcome-close')],
    ['a backdrop click', async page => page.mouse.click(12, 12)]
]) {
    const { ctx, page } = await freshPage();
    await page.goto(PAGE);
    await page.waitForTimeout(450);
    ok(await page.locator('#ps-welcome').isVisible(),
       `the start centre shows on a cold load (before ${how})`);
    await act(page);
    await page.waitForTimeout(250);
    ok(!(await page.locator('#ps-welcome').isVisible()),
       `${how} dismisses the start centre on a cold load`);
    ok(await page.evaluate(() =>
        !document.querySelector('.ps-page').hasAttribute('aria-hidden')),
       `${how} also un-hides the app behind it`);
    await ctx.close();
}

// ---- t4-07: the privacy promise is stated IN the app, in all three places ----
{
    const { ctx, page } = await freshPage();
    await page.goto(PAGE);
    await page.waitForTimeout(450);
    const claim = /no accounts|not uploaded|stays on th(is|e) machine|nothing is uploaded/i;
    ok(claim.test(await page.evaluate(() =>
        document.getElementById('ps-welcome').innerText)),
       'the start centre states where the data lives');
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(300);
    await page.evaluate(() => window.PS_SHELL.openLoader
        ? window.PS_SHELL.openLoader() : document.getElementById('ps-load').click());
    await page.waitForTimeout(250);
    ok(claim.test(await page.evaluate(() =>
        document.getElementById('ps-loader').innerText)),
       'the loader states that the file is not uploaded');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    await page.evaluate(() => window.PS_SHELL.runCommand
        ? window.PS_SHELL.runCommand('about') : null);
    await page.waitForTimeout(250);
    // About was a 2.8-second toast when this was written; t4-03 made it a
    // dialog with the licence, copyright and citation, so the promise lives
    // there now. Reading the toast quietly passed on an empty string for as
    // long as `claim` happened to match nothing.
    ok(await page.evaluate(() =>
           getComputedStyle(document.getElementById('ps-about-dialog'))
               .display !== 'none'),
       'About opens a dialog rather than a toast that leaves');
    ok(claim.test(await page.evaluate(() =>
        document.getElementById('ps-about-dialog').innerText)),
       'and states the privacy promise');
    await ctx.close();
}

if (errors.length) throw new Error(errors[0]);
await browser.close();
console.log('PUNCH LIST CHECK: ALL GREEN');
