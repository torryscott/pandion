// Check the rendered verification battery (see render.R) in headless
// chromium: every file must load with zero page errors, draw a real
// chart (or the expected placeholder message), and pass a few
// per-chart sanity probes (label / band / tile counts, log-axis
// ticks, no NaN anywhere in the SVG).
//
// Usage:  node scripts/verify/check.mjs
// Env:    GB2_VERIFY_OUT  dir holding the *.html files (default /tmp/gb2-verify)
//         GB2_NODE_BASE   a dir whose node_modules contains playwright
//
// ESM `import` ignores NODE_PATH, so playwright is resolved via
// createRequire from a list of candidate bases — the project, the
// script dir, /tmp (the conventional install spot on this machine).

import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';

function loadPlaywright() {
    const bases = [];
    if (process.env.GB2_NODE_BASE) bases.push(process.env.GB2_NODE_BASE);
    bases.push(
        new URL('.', import.meta.url).pathname,
        process.cwd(),
        '/tmp',
        '/private/tmp',
    );
    for (const b of bases) {
        try { return createRequire(path.join(b, 'x.js'))('playwright'); }
        catch { /* next base */ }
    }
    console.error(
        'playwright not found from any of: ' + bases.join(', ') + '\n' +
        'Install once with:  cd /tmp && npm i playwright && npx playwright install chromium\n' +
        '(or set GB2_NODE_BASE to a directory whose node_modules has it)');
    process.exit(2);
}

const { chromium } = loadPlaywright();
const OUT = process.env.GB2_VERIFY_OUT || '/tmp/gb2-verify';

// Per-case expectations. `svg: true` requires a populated chart
// (>= minNodes drawable/text elements and no "NaN" in the markup);
// `roles` requires N+ elements per data-role; `texts` requires those
// exact tick/label strings somewhere in the SVG; `placeholder`
// requires the message text and NO chart.
const CASES = [
    { name: 'cg_bar_labels',    svg: true, roles: { 'bar-value-label': 12 } },
    // Dot plot: line machinery, stroke suppressed - markers + error bars
    // only (3 cats x 2 groups = 6 markers; 6 error bars).
    { name: 'cg_dot',           svg: true, roles: { 'line-marker': 6, 'error-bar': 6 } },
    { name: 'cg_box',           svg: true },
    { name: 'cg_violin',        svg: true },
    { name: 'cg_raincloud',     svg: true },
    { name: 'rm_line',          svg: true },
    { name: 'rm_bar',           svg: true },
    { name: 'rm_dot',           svg: true, roles: { 'line-marker': 6, 'error-bar': 6 } },
    // CROSSED within factors: Time(3) x Emotion(2), no between. Default one-per-
    // slot -> x=Time(3), grouped=Emotion(2). 2 lines, 6 markers, 6 error bars.
    { name: 'rm_twoway_within', svg: true, roles: { 'line-series': 2, 'line-marker': 6, 'error-bar': 6 }, texts: ['T1', 'T2', 'T3', 'Happy', 'Sad'] },
    // CROSSED single within (Cond,2) + TWO between (Drug, Sex). Default ->
    // x=Cond, grouped=Drug, panelled=Sex: 4 lines (2 Drug x 2 Sex panels),
    // 8 markers, 8 error bars.
    { name: 'rm_mixed_bs',      svg: true, roles: { 'line-series': 4, 'line-marker': 8, 'error-bar': 8 }, texts: ['C1', 'C2', 'Drug', 'Placebo', 'M', 'F'] },
    // CROSSED 2x2 within (Time x Emotion) faceted by between grp -> x=Time,
    // grouped=Emotion, panelled=grp. An interaction plot: 4 lines, 8 markers.
    { name: 'rm_crossed',       svg: true, roles: { 'line-series': 4, 'line-marker': 8, 'error-bar': 8 }, texts: ['T1', 'T2', 'Happy', 'Sad', 'Drug', 'Placebo'] },
    { name: 'xy_basic',         svg: true, roles: { 'xy-point': 100 } },
    { name: 'xy_facet',         svg: true, roles: { 'xy-point': 100 }, texts: ['Panel A', 'Panel B'] },
    { name: 'xy_fit_ci',        svg: true, roles: { 'xy-point': 100 } },
    { name: 'xy_heatmap',       svg: true, roles: { 'xy-bin': 9, 'xy-bin-legend': 1 } },
    // log10 axes are DORMANT (Jul 9 2026, Torry: removed for now) - this
    // case now proves a SAVED log10 state renders sanely LINEAR (decade
    // ticks '10' gone, linear ticks present). Restore ['10','100'] when
    // the feature returns.
    { name: 'xy_log',           svg: true, texts: ['20', '100'] },
    { name: 'xy_bubble_labels', svg: true, roles: { 'xy-point': 20, 'xy-point-label': 20, 'xy-size-legend': 1 }, texts: ['P01'] },
    // Histogram bins ride the bar pipeline (_buildBarShape) and come
    // out as <path>, so count their data-role rather than rects.
    { name: 'dist_hist',        svg: true, roles: { 'dist-hist-bar': 10 } },
    { name: 'dist_hist_normal', svg: true, roles: { 'dist-hist-bar': 10, 'dist-normal': 2 } },
    { name: 'dist_density',     svg: true },
    { name: 'dist_histdensity', svg: true },
    { name: 'dist_qq_band',     svg: true, roles: { 'dist-qq-band': 2 } },
    { name: 'dist_ecdf',        svg: true },
    { name: 'dist_box',         svg: true },
    { name: 'freq_bar_stack',    svg: true, roles: { 'bar-value-label': 6 } },
    { name: 'freq_bar_fill_facet', svg: true, texts: ['100'] },
    { name: 'freq_pie',          svg: true, roles: { 'freq-slice': 3, 'freq-slice-label': 3, 'freq-pie-outline-all': 1 } },
    // The pooled-roles heads-up is now the shared dismissible HTML pill
    // (data-role="freq-pooled-note-pill" in `wrap`, queried off the whole
    // document), not the old static SVG footnote.
    { name: 'freq_donut_pooled', svg: true, roles: { 'freq-slice': 3, 'freq-pooled-note-pill': 1 } },
    { name: 'freq_pie_callout',  svg: true, roles: { 'freq-slice': 4, 'freq-slice-label': 4, 'freq-pie-leader': 2 }, texts: ['2.5%', '1.9%'] },
    { name: 'freq_pareto',       svg: true, roles: { 'pareto-line': 1, 'pareto-marker': 3, 'pareto-axis-label': 6 } },
    { name: 'freq_single_cat',   svg: true, minNodes: 8 },
    { name: 'freq_allna',        placeholder: 'has no usable (non-missing) rows' },
    { name: 'corr_heat',         svg: true, roles: { 'corr-tile': 16, 'corr-var-label': 8, 'corr-legend-bar': 1, 'corr-legend-tick': 3 } },
    { name: 'corr_circles',      svg: true, roles: { 'corr-circle': 10, 'corr-cell': 16 } },
    // stars are SUFFIXES on the value texts (".62***"), and the texts
    // assertion is exact-match — anchor on the diagonal's stable "1.00".
    { name: 'corr_numbers',      svg: true, roles: { 'corr-value': 16 }, texts: ['1.00'] },
    { name: 'corr_two',          svg: true, roles: { 'corr-cell': 4 } },
    { name: 'corr_one_placeholder', placeholder: 'two or more' },
    { name: 'likert_div',        svg: true, roles: { 'likert-seg': 12, 'likert-item-label': 3, 'likert-legend-item': 5, 'likert-center': 1 } },
    { name: 'likert_stacked',    svg: true, roles: { 'likert-seg': 12, 'likert-value': 8 } },
    { name: 'likert_means',      svg: true, roles: { 'likert-dot': 3, 'likert-ci': 3 } },
    { name: 'likert_reverse',    svg: true, roles: { 'likert-seg': 12, 'likert-item-label': 3 }, texts: ['Workload (R)'] },
    { name: 'likert_numeric',    svg: true, roles: { 'likert-seg': 8, 'likert-item-label': 2 } },
    { name: 'likert_continuous', svg: true, roles: { 'likert-dot': 2, 'likert-ci': 2 } },
    { name: 'likert_textrefuse', placeholder: 'is not numeric' },
    { name: 'edge_allna',       placeholder: 'has no usable (non-missing) values' },
    { name: 'edge_n1_hist',     svg: true, minNodes: 10, roles: { 'dist-hist-bar': 1 } },
    { name: 'edge_n1_qq',       placeholder: 'needs at least 2 non-missing values' },
];

const browser = await chromium.launch();
let failures = 0;

for (const c of CASES) {
    const file = path.join(OUT, c.name + '.html');
    const problems = [];
    if (!existsSync(file)) {
        report(c.name, ['missing file ' + file]);
        continue;
    }

    // Fresh context per case: file:// pages share localStorage within
    // a context, and the widget persists hint/inspector state there.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('console', (m) => {
        if (m.type() === 'error') problems.push('console.error: ' + m.text());
    });

    try {
        await page.goto('file://' + file);
        await page.waitForFunction(
            () => document.querySelector('svg') ||
                  /no usable|needs at least|drag|assign|response scale/i.test(document.body.textContent || ''),
            null, { timeout: 20000 });
        await page.waitForTimeout(250);

        const probe = await page.evaluate(() => {
            const svgs = [...document.querySelectorAll('svg')];
            return {
                hasSvg: svgs.length > 0,
                // Data marks, as opposed to frame chrome: placeholders
                // may draw a full-size empty chart frame (the jamovi
                // convention since Aug 2026), but never data.
                dataMarks: document.querySelectorAll(
                    '[data-bar-cat], [data-role="xy-point"], ' +
                    '[data-role="corr-cell"], [data-role="likert-seg"], ' +
                    '[data-role="dist-hist-bar"], [data-role="freq-slice"], ' +
                    '[data-role="line-marker"]').length,
                nodes: document.querySelectorAll(
                    'svg path, svg rect, svg circle, svg line, svg polyline, svg text').length,
                rects: document.querySelectorAll('svg rect').length,
                hasNaN: svgs.some((s) => s.outerHTML.includes('NaN')),
                texts: [...document.querySelectorAll('svg text')]
                    .map((t) => {
                        // visible label text only — drop hover <title> tooltips
                        const c = t.cloneNode(true);
                        for (const ti of c.querySelectorAll('title')) ti.remove();
                        return (c.textContent || '').trim();
                    }),
                body: (document.body.textContent || '').replace(/\s+/g, ' '),
                likertLegendRows: (() => {
                    const ys = [...document.querySelectorAll('[data-role="likert-legend-item"] rect')]
                        .map(r => Math.round(parseFloat(r.getAttribute('y')) || 0));
                    const counts = {};
                    for (const y of ys) counts[y] = (counts[y] || 0) + 1;
                    return Object.values(counts);
                })(),
            };
        });

        if (c.placeholder) {
            if (!probe.body.includes(c.placeholder))
                problems.push(`placeholder text not found: "${c.placeholder}"`);
            // Placeholders draw a full-size EMPTY chart frame since Aug
            // 2026 (an svg with axes and no data), so the contract is
            // "no DATA marks", not "no svg".
            if (probe.dataMarks > 0)
                problems.push('expected a placeholder but ' +
                    probe.dataMarks + ' data marks rendered');
        }
        if (c.svg) {
            if (!probe.hasSvg) problems.push('no <svg> rendered');
            const minNodes = c.minNodes ?? 20;
            if (probe.nodes < minNodes)
                problems.push(`svg too sparse: ${probe.nodes} drawable/text nodes (< ${minNodes})`);
            if (probe.hasNaN) problems.push('"NaN" found inside the SVG markup');
            if (c.minRects && probe.rects < c.minRects)
                problems.push(`only ${probe.rects} rects (< ${c.minRects})`);
            for (const t of c.texts || [])
                if (!probe.texts.includes(t))
                    problems.push(`expected tick/label text "${t}" not found`);
            for (const [role, min] of Object.entries(c.roles || {})) {
                const n = await page.evaluate(
                    (r) => document.querySelectorAll(`[data-role="${r}"]`).length, role);
                if (n < min)
                    problems.push(`data-role="${role}": ${n} found (< ${min})`);
            }
            if (c.name === 'likert_div' && probe.likertLegendRows.length > 1 &&
                Math.min(...probe.likertLegendRows) < 2)
                problems.push('Likert legend leaves an orphaned response level on its own row');
        }
    } catch (e) {
        problems.push('exception: ' + e.message.split('\n')[0]);
    }

    await ctx.close();
    report(c.name, problems);
}

await browser.close();
console.log(failures === 0
    ? `\nALL ${CASES.length} CHECKS PASSED (${OUT})`
    : `\n${failures} OF ${CASES.length} CASES FAILED (${OUT})`);
process.exit(failures === 0 ? 0 : 1);

function report(name, problems) {
    if (problems.length === 0) {
        console.log(`  ok   ${name}`);
    } else {
        failures += 1;
        console.log(`  FAIL ${name}`);
        for (const p of problems) console.log(`         - ${p}`);
    }
}
