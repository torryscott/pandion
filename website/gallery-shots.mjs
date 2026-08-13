// Regenerate the gallery figures on the landing site.
//
//   cd website && python3 -m http.server 8792 &
//   node website/gallery-shots.mjs [port]
//
// This script did not exist until August 2026, and its absence was the
// problem. The eight gallery images were rendered by hand in July, their
// source tables were never committed, and when the default palette changed
// there was no way to redraw the same figures. The data now lives in
// gallery-data.mjs and the recipe lives here, so the set can always be
// rebuilt.
//
// It renders SIX of the eight. corr-matrix.png and likert.png draw from the
// diverging ramps rather than the categorical palette, so a palette change
// does not touch them, and re-rendering would only invent new numbers that
// their captions would then contradict. Leaving them alone is deliberate.
//
// Figures come out of the app's own export pipeline rather than a page
// screenshot, so they carry real DPI metadata and no app chrome.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { GALLERY_DATA } from './gallery-data.mjs';

function loadPlaywright() {
    for (const base of [process.cwd(), new URL('.', import.meta.url).pathname,
                        '/private/tmp', '/tmp']) {
        try { return createRequire(path.join(base, 'x.js'))('playwright'); }
        catch { /* try the next shared dependency location */ }
    }
    console.error('playwright not found');
    process.exit(2);
}

const PORT = process.argv[2] || '8792';
const OUT = path.resolve(new URL('.', import.meta.url).pathname, 'assets/gallery');
const { chromium } = loadPlaywright();
const browser = await chromium.launch();
const problems = [];

// Each figure names the claims its caption makes that can only be checked
// against the drawing rather than against the data. The dataset generator
// proves everything checkable from the numbers alone; these are the rest.
const FIGURES = [
    {
        file: 'donut.png', data: 'donut',
        module: 'freqplotbuilder',
        roles: { var: 'Major' },
        options: { graphType: 'donut' },
        expect: { 'freq-slice': 5, 'freq-slice-label': 5 },
    },
    {
        file: 'grouped-bar.png', data: 'groupedBar',
        module: 'plotbuilder',
        roles: { xvar: 'Test', yvar: 'Recall', groupVar: 'Practice' },
        // "Bars show condition means with standard-error bars."
        options: { graphType: 'bar', summaryFunc: 'mean', errorBarType: 'se' },
        expect: { 'error-bar': 4 },
        bars: 4,
    },
    {
        file: 'rm-line.png', data: 'rmLine',
        module: 'rmplotbuilder',
        roles: { measures: ['Baseline', 'Week 4', 'Week 8'], betweenVar: 'Group' },
        // "Points are means with Cousineau-Morey-corrected error bars."
        // The correction IS errorBarMethod: within; without it the caption
        // would be describing something the chart is not doing.
        options: { graphType: 'line', errorBarType: 'se', errorBarMethod: 'within' },
        // Repeated Measures ships NO y title by default. That is deliberate
        // in the app, a nudge to name your own measure, but it leaves this
        // the only figure in the gallery with a blank axis, and the app's
        // own Check graph flags it. Naming it is what the nudge is asking
        // for. Axis titles are chartSpec keys, not top-level options.
        spec: { yTitleOverride: true, yTitle: 'Score' },
        expect: { 'line-series': 2, 'line-marker': 6, 'error-bar': 6 },
    },
    {
        file: 'scatter-marginals.png', data: 'scatter',
        module: 'xyplotbuilder',
        roles: { xvar: 'Stress', yvar: 'Cortisol', groupVar: 'Age group' },
        // No marginals, deliberately. The file is named for them but the
        // July image never had any, the caption does not claim them, and
        // the site's own alt text calls it "Scatter by group".
        options: { graphType: 'scatter' },
        expect: { 'xy-point': 68 },
    },
    {
        file: 'histdensity.png', data: 'histDensity',
        module: 'distplotbuilder',
        roles: { var: 'Reaction time' },
        // "Bars show counts and the overlaid curve shows the estimated
        // distribution shape."
        options: { graphType: 'histdensity', histStat: 'count' },
        expect: { 'dist-density-line': 1 },
        // "with the highest concentration in the low-to-mid 70s" is a claim
        // about the BINNING, not about the data: a sample centred on 73 can
        // still put its tallest bar at 68-72. Only the render can settle it.
        modalBarWithin: [70, 76],
    },
    {
        file: 'raincloud.png', data: 'raincloud',
        module: 'plotbuilder',
        roles: { xvar: 'Condition', yvar: 'Score' },
        options: { graphType: 'raincloud' },
        expect: { 'violin-fill': 3, 'box-fill': 3, 'box-median': 3 },
        // "a red ring identifies a low-dose score near 53 as a potential
        // outlier". Singular, so exactly one across the whole chart. This is
        // emergent from the Tukey fence, not a setting, which is why it is
        // checked here and not only in the generator.
        rings: 1,
    },
];

async function session() {
    // Fresh context per figure. The app autosaves the project to
    // localStorage and restores it on boot, so a reused context would
    // silently start from the previous figure's state.
    const ctx = await browser.newContext({
        viewport: { width: 1520, height: 950 }, deviceScaleFactor: 2 });
    // Suppress both first-run dialogs before any page script runs, rather
    // than clicking through them.
    await ctx.addInitScript(() => {
        try { sessionStorage.setItem('psstandalone.welcome.dismissed', '1'); } catch (e) {}
        try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); } catch (e) {}
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => problems.push('pageerror: ' + e.message));
    page.on('console', m => {
        if (m.type() === 'error') problems.push('console: ' + m.text()); });
    page.on('response', r => {
        if (r.status() >= 400) problems.push(r.status() + ' ' + r.url()); });
    await page.goto(`http://127.0.0.1:${PORT}/app/`, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    return { ctx, page };
}

// The chart svg carries its own data-role. Do NOT reach for
// querySelector('svg'): the first svg in the document is a 0x0 hidden icon
// sprite in <body>, and the host holds a dozen more for toolbar buttons.
const CHART = '#psroot svg[data-role="gb2-chart-svg"]';

for (const fig of FIGURES) {
    const ds = GALLERY_DATA[fig.data];
    if (!ds) { problems.push(`${fig.file}: no dataset named ${fig.data}`); continue; }
    const { ctx, page } = await session();

    await page.evaluate(({ ds, fig }) => {
        window.PS_SHELL.loadTable(ds.name, ds.header, ds.rows, ds.types, ds.levels);
        window.PS_SHELL.setModule(fig.module);
        window.PS_SHELL.setRoles(fig.module, fig.roles);
    }, { ds, fig });
    await page.waitForTimeout(600);

    // setRoles silently NULLS any role whose column type it will not accept,
    // with no error and no return value: the chart just becomes a
    // placeholder card. Catch that here rather than shipping a blank figure.
    const roleTrouble = await page.evaluate((fig) => {
        const got = window.PS_SHELL.rolesStore() || {};
        const missing = Object.keys(fig.roles).filter(k => {
            const v = got[k];
            return Array.isArray(fig.roles[k]) ? !(v && v.length) : !v;
        });
        const ph = window.PS_SHELL.buildRaw && window.PS_SHELL.buildRaw().placeholder;
        return { missing, ph: ph || null };
    }, fig);
    if (roleTrouble.missing.length)
        problems.push(`${fig.file}: roles dropped: ${roleTrouble.missing.join(', ')}`);
    if (roleTrouble.ph)
        problems.push(`${fig.file}: placeholder instead of a chart: ${roleTrouble.ph}`);

    await page.evaluate((opts) => {
        for (const [k, v] of Object.entries(opts)) window.setOption(k, v);
    }, fig.options);
    // Style keys travel in one chartSpec blob rather than as top-level
    // options, and writing it REPLACES what is there, so it goes in a single
    // call after the real options.
    if (fig.spec)
        await page.evaluate((sp) => window.setOption('chartSpec', JSON.stringify(sp)), fig.spec);
    await page.waitForTimeout(1800);

    // Node count, not a fixed sleep: a placeholder has very few nodes.
    await page.waitForFunction((sel) => {
        const s = document.querySelector(sel);
        return s && s.querySelectorAll('*').length > 40;
    }, CHART, { timeout: 20000 });

    // Park the pointer and drop focus, or a hover highlight and a focus ring
    // bake into the export.
    await page.mouse.move(4, 946);
    await page.evaluate(() => document.activeElement && document.activeElement.blur
        && document.activeElement.blur());
    await page.waitForTimeout(400);

    const seen = await page.evaluate((sel) => {
        const svg = document.querySelector(sel);
        const counts = {};
        svg.querySelectorAll('[data-role]').forEach(el => {
            const r = el.getAttribute('data-role');
            counts[r] = (counts[r] || 0) + 1;
        });
        // data-bar-cat also tags the group wrappers, the x ticks and the
        // category labels, so a raw count of it is about three times the
        // number of bars. The bars themselves are the paths.
        counts.__bars = svg.querySelectorAll('path[data-bar-cat]').length;
        // Any role naming an outlier, so a renamed role still shows up
        // rather than silently reading as zero. Excluding the "-hit" twins:
        // every visible ring carries a transparent hit clone at the same
        // spot, which would double the count.
        counts.__rings = [...svg.querySelectorAll('[data-role]')]
            .filter(el => {
                const r = el.getAttribute('data-role');
                return /outlier/i.test(r) && !/-hit$/.test(r);
            }).length;
        return counts;
    }, CHART);

    // Every visible word on the figure starts with a capital: axis titles,
    // the legend heading and its entries, category labels. Numeric ticks and
    // percentages start with a digit or a minus and are left alone. The
    // titles come from the column names, so this is really a guard on
    // gallery-data.py, and it belongs here because nothing else would catch
    // a lower-case column name creeping back in.
    const lower = await page.evaluate((sel) => {
        const svg = document.querySelector(sel);
        return [...svg.querySelectorAll('text')]
            .map(t => (t.textContent || '').trim())
            .filter(s => /^[a-z]/.test(s));
    }, CHART);
    if (lower.length)
        problems.push(`${fig.file}: labels start lower case: ${[...new Set(lower)].join(', ')}`);

    for (const [role, want] of Object.entries(fig.expect || {})) {
        const got = seen[role] || 0;
        if (got !== want) problems.push(`${fig.file}: ${role} drew ${got}, expected ${want}`);
    }
    if (fig.bars != null && seen.__bars !== fig.bars)
        problems.push(`${fig.file}: ${seen.__bars} bars, expected ${fig.bars}`);
    if (fig.rings != null && seen.__rings !== fig.rings)
        problems.push(`${fig.file}: ${seen.__rings} outlier rings, expected ${fig.rings} `
            + `(the caption says "a red ring", singular)`);

    // The modal-bin claim, measured off the drawing: find the tallest
    // histogram bar, then convert its centre from pixels to data units by
    // interpolating between two rendered x tick labels.
    if (fig.modalBarWithin) {
        const at = await page.evaluate((sel) => {
            const svg = document.querySelector(sel);
            const bars = [...svg.querySelectorAll('[data-role="dist-hist-bar"]')];
            if (!bars.length) return null;
            const box = el => el.getBBox();
            const tall = bars.reduce((a, b) => box(b).height > box(a).height ? b : a);
            const cx = box(tall).x + box(tall).width / 2;
            const ticks = [...svg.querySelectorAll('text')]
                .map(t => ({ v: parseFloat(t.textContent), x: t.getBBox().x + t.getBBox().width / 2 }))
                .filter(t => Number.isFinite(t.v))
                .sort((a, b) => a.x - b.x);
            if (ticks.length < 2) return null;
            // Two ticks straddling the bar, or the nearest pair.
            let lo = ticks[0], hi = ticks[ticks.length - 1];
            for (let i = 0; i < ticks.length - 1; i++)
                if (ticks[i].x <= cx && ticks[i + 1].x >= cx) { lo = ticks[i]; hi = ticks[i + 1]; }
            if (hi.x === lo.x) return null;
            return lo.v + (cx - lo.x) * (hi.v - lo.v) / (hi.x - lo.x);
        }, CHART);
        const [a, b] = fig.modalBarWithin;
        if (at == null) problems.push(`${fig.file}: could not locate the tallest bar to check the modal claim`);
        else if (at < a || at > b)
            problems.push(`${fig.file}: tallest bar sits at about ${at.toFixed(1)}, `
                + `but the caption says the low-to-mid 70s (${a} to ${b})`);
        else console.log(`    modal bar at about ${at.toFixed(1)}, in the low-to-mid 70s`);
    }

    const lint = await page.evaluate(() => {
        const host = document.querySelector('.graphbuilder2-host');
        if (!host || typeof host.__gb2_graphLint !== 'function') return 'MISSING';
        const f = host.__gb2_graphLint();
        if (!f) return 'MISSING';
        return ((f.findings || f) || []).map(x => x.id || x.title || 'unnamed').join(', ');
    });
    if (lint === 'MISSING') problems.push(`${fig.file}: __gb2_graphLint is gone, unverified`);
    else if (lint) console.log(`    Check graph: ${lint}`);

    // The app's own export, not a screenshot: no chrome, hover un-armed, and
    // a real pHYs density chunk in the bytes.
    const b64 = await page.evaluate(async () => {
        const blob = await window.PS_SHELL.exportBlob('png', 192, 'white');
        return await new Promise(r => {
            const fr = new FileReader();
            fr.onload = () => r(fr.result.split(',')[1]);
            fr.readAsDataURL(blob);
        });
    });
    const dest = path.join(OUT, fig.file);
    fs.writeFileSync(dest, Buffer.from(b64, 'base64'));
    const kb = Math.round(fs.statSync(dest).size / 1024);
    console.log(`  ${fig.file}  ${kb} KB`);

    await ctx.close();
}

await browser.close();
if (problems.length) {
    console.error('\nPROBLEMS (a figure may not match its caption):');
    console.error([...new Set(problems)].join('\n'));
    process.exit(1);
}
console.log('\nall six figures drew as their captions describe');
