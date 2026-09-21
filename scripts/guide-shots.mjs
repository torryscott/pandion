// Regenerate the user guide's screenshots from the app (Sep 20 2026).
//
//   node scripts/guide-shots.mjs [only]
//
// `only` filters: gallery | ui | a file stem such as guide-stats. Writes
// docs/img/shots/guide-*.png. Nothing here is hand-editable: a hand edit
// dies at the next run, which is the point (the July 2026 images were made
// once by hand and could never be redrawn when the default palette changed).
//
// Two kinds of image. Chart FIGURES (the galleries and the normal-curve
// shot) come out of the app's own export pipeline (PS_SHELL.exportBlob at
// 192 DPI on white): no chrome, hover un-armed, real DPI metadata. UI SHOTS
// (toolbar, flyouts, panels, dialogs, the wizard) are clipped page
// screenshots at 2x of the real app driven headlessly through PS_SHELL and
// real clicks, the same way website/tutorial-shots.mjs works. Every figure
// is drawn from one of the app's three built-in example datasets, so the
// pictures match what a reader can open from the welcome dialog.
//
// The guide is shared by the browser app and the jamovi module. These UI
// shots show the APP (labeled toolbar, Help menu). Surfaces that exist only
// inside jamovi (the export tray, the "?" button) are described in the
// guide's jamovi channel text rather than pictured.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

function loadPlaywright() {
    const bases = [];
    if (process.env.GB2_NODE_BASE) bases.push(process.env.GB2_NODE_BASE);
    bases.push(process.cwd(), new URL('.', import.meta.url).pathname, '/private/tmp', '/tmp');
    for (const b of bases) {
        try { return createRequire(path.join(b, 'x.js'))('playwright'); }
        catch { /* next */ }
    }
    console.error('playwright not found; cd /tmp && npm i playwright');
    process.exit(2);
}
const { chromium } = loadPlaywright();
const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const PAGE = 'file://' + path.join(ROOT, 'standalone', 'index.html');
const OUT = path.join(ROOT, 'docs', 'img', 'shots');
const ONLY = process.argv[2] || null;
const CHART = '#psroot svg[data-role="gb2-chart-svg"]';
const problems = [];
const browser = await chromium.launch();

async function session(viewport) {
    const ctx = await browser.newContext({ viewport: viewport || { width: 1280, height: 900 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => {
        try { localStorage.clear(); sessionStorage.setItem('psstandalone.welcome.dismissed', '1'); } catch (e) {}
        try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); } catch (e) {}
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => problems.push('pageerror: ' + e.message));
    await page.goto(PAGE, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    return { ctx, page };
}
const s = (page, ms) => page.waitForTimeout(ms);
async function draw(page, fig) {
    await page.evaluate(({ fig }) => {
        const S = window.PS_SHELL;
        S.openExample(fig.example);
    }, { fig });
    await s(page, 700);
    await page.evaluate(({ fig }) => {
        const S = window.PS_SHELL;
        S.setWorkspace('chart');
        S.setModule(fig.module);
        S.setRoles(fig.module, fig.roles);
    }, { fig });
    await s(page, 700);
    const trouble = await page.evaluate((fig) => {
        const got = window.PS_SHELL.rolesStore() || {};
        return Object.keys(fig.roles).filter(k => { const v = got[k]; return Array.isArray(fig.roles[k]) ? !(v && v.length) : !v; });
    }, fig);
    if (trouble.length) problems.push(fig.file + ': roles dropped: ' + trouble.join(', '));
    await page.evaluate((opts) => { for (const [k, v] of Object.entries(opts || {})) window.setOption(k, v); }, fig.options || {});
    if (fig.spec) await page.evaluate((sp) => window.setOption('chartSpec', JSON.stringify(sp)), fig.spec);
    await s(page, 1600);
    await page.waitForFunction((sel) => { const el = document.querySelector(sel); return el && el.querySelectorAll('*').length > 40; }, CHART, { timeout: 20000 });
    await page.mouse.move(4, 880);
    await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
    await s(page, 300);
}
async function exportFigure(page, file) {
    const b64 = await page.evaluate(async () => {
        const blob = await window.PS_SHELL.exportBlob('png', 192, 'white');
        return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(blob); });
    });
    fs.writeFileSync(path.join(OUT, file), Buffer.from(b64, 'base64'));
    console.log('  ' + file + '  ' + Math.round(fs.statSync(path.join(OUT, file)).size / 1024) + ' KB');
}
async function clipOf(page, sel, grow, pickText) {
    const r = await page.evaluate(({ sel, pickText }) => {
        const els = [...document.querySelectorAll(sel)].filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; });
        const el = pickText ? els.find(e => (e.textContent || '').includes(pickText)) : els[0];
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { x: b.left, y: b.top, w: b.width, h: b.height, vw: window.innerWidth, vh: window.innerHeight };
    }, { sel, pickText });
    if (!r) { problems.push('clip target not found: ' + sel); return null; }
    const g = Object.assign({ left: 16, right: 16, top: 16, bottom: 16 }, grow || {});
    const x = Math.max(0, r.x - g.left), y = Math.max(0, r.y - g.top);
    return { x, y, width: Math.min(r.vw - x, r.w + g.left + g.right), height: Math.min(r.vh - y, r.h + g.top + g.bottom) };
}
async function shot(page, file, clip) {
    await page.mouse.move(4, 4);
    await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
    await s(page, 350);
    if (!clip) { problems.push(file + ': no clip'); return; }
    await page.screenshot({ path: path.join(OUT, file), clip });
    console.log('  ' + file + '  ' + Math.round(fs.statSync(path.join(OUT, file)).size / 1024) + ' KB  (' + Math.round(clip.width) + 'x' + Math.round(clip.height) + ')');
}

// ----------------------------------------------------------------- figures
const CG = { example: 'dose', module: 'plotbuilder', roles: { xvar: 'condition', yvar: 'score', groupVar: 'site' } };
const RM = { example: 'wellbeing', module: 'rmplotbuilder', roles: { measures: ['stress_wk1', 'stress_wk6', 'stress_wk12'], betweenVar: 'residence' } };
const XY = { example: 'wellbeing', module: 'xyplotbuilder', roles: { xvar: 'sleep_hours', yvar: 'gpa' } };
const DI = { example: 'wellbeing', module: 'distplotbuilder', roles: { var: 'screen_hours' } };
const FQ = { example: 'wellbeing', module: 'freqplotbuilder', roles: { var: 'class_year', groupVar: 'residence' } };
const CO = { example: 'wellbeing', module: 'corrplotbuilder', roles: { vars: ['sleep_hours', 'screen_hours', 'gpa', 'exam_score'] } };
const LK = { example: 'wellbeing', module: 'likertplotbuilder', roles: { items: ['q1_belonging', 'q2_support', 'q3_workload', 'q4_facilities', 'q5_recommend'] } };
const FIGURES = [
    Object.assign({ file: 'guide-gallery-cg-bar.png', options: { graphType: 'bar' } }, CG),
    Object.assign({ file: 'guide-gallery-cg-line.png', options: { graphType: 'line' } }, CG),
    Object.assign({ file: 'guide-gallery-cg-dot.png', options: { graphType: 'dot' } }, CG),
    Object.assign({ file: 'guide-gallery-cg-box.png', options: { graphType: 'box' } }, CG),
    Object.assign({ file: 'guide-gallery-cg-violin.png', options: { graphType: 'violin' } }, CG),
    Object.assign({ file: 'guide-gallery-cg-raincloud.png', options: { graphType: 'raincloud' } }, CG),
    { file: 'guide-gallery-cg-facets.png', example: 'dose', module: 'plotbuilder', roles: { xvar: 'condition', yvar: 'score', facetVar: 'site' }, options: { graphType: 'bar' } },
    Object.assign({ file: 'guide-gallery-rm-line.png', options: { graphType: 'line' } }, RM),
    Object.assign({ file: 'guide-gallery-rm-bar.png', options: { graphType: 'bar' } }, RM),
    Object.assign({ file: 'guide-gallery-rm-dot.png', options: { graphType: 'dot' } }, RM),
    { file: 'guide-gallery-rm-sessions.png', example: 'practice', module: 'rmplotbuilder', roles: { measures: ['session1', 'session2', 'session3', 'session4'], betweenVar: 'group' }, options: { graphType: 'line' } },
    { file: 'guide-gallery-xy-groups.png', example: 'wellbeing', module: 'xyplotbuilder', roles: { xvar: 'sleep_hours', yvar: 'gpa', groupVar: 'residence' }, options: { graphType: 'scatter' } },
    Object.assign({ file: 'guide-gallery-xy-fit.png', options: { graphType: 'scatter', xyFitType: 'linear' }, spec: { xyShowFit: true, xyShowCI: true } }, XY),
    Object.assign({ file: 'guide-gallery-xy-heatmap.png', options: { graphType: 'scatter', xyBin: 'square' } }, XY),
    Object.assign({ file: 'guide-gallery-dist-histogram.png', options: { graphType: 'histogram' } }, DI),
    Object.assign({ file: 'guide-gallery-dist-density.png', options: { graphType: 'density' } }, DI),
    Object.assign({ file: 'guide-gallery-dist-histdensity.png', options: { graphType: 'histdensity' } }, DI),
    Object.assign({ file: 'guide-gallery-dist-qq.png', options: { graphType: 'qq' }, spec: { qqBand: true } }, DI),
    Object.assign({ file: 'guide-gallery-dist-ecdf.png', options: { graphType: 'ecdf' } }, DI),
    Object.assign({ file: 'guide-gallery-dist-box.png', options: { graphType: 'box' } }, DI),
    Object.assign({ file: 'guide-gallery-dist-violin.png', options: { graphType: 'violin' } }, DI),
    Object.assign({ file: 'guide-gallery-dist-raincloud.png', options: { graphType: 'raincloud' } }, DI),
    // Dot Plot is mean plus every raw value: the points overlay must be on.
    { file: 'guide-gallery-dist-dot.png', example: 'wellbeing', module: 'distplotbuilder', roles: { var: 'screen_hours', groupVar: 'chronotype' }, options: { graphType: 'dot', showDataPoints: true } },
    Object.assign({ file: 'guide-normal-curve.png', options: { graphType: 'histogram' }, spec: { distNormalCurve: true } }, DI),
    Object.assign({ file: 'guide-gallery-freq-stacked.png', options: { graphType: 'bar', freqPosition: 'stack' } }, FQ),
    { file: 'guide-gallery-freq-fill-facets.png', example: 'wellbeing', module: 'freqplotbuilder', roles: { var: 'class_year', groupVar: 'residence', facetVar: 'chronotype' }, options: { graphType: 'bar', freqPosition: 'fill' } },
    { file: 'guide-gallery-freq-pie.png', example: 'wellbeing', module: 'freqplotbuilder', roles: { var: 'class_year' }, options: { graphType: 'pie' } },
    { file: 'guide-gallery-freq-donut.png', example: 'wellbeing', module: 'freqplotbuilder', roles: { var: 'class_year' }, options: { graphType: 'donut' } },
    { file: 'guide-gallery-freq-pareto.png', example: 'wellbeing', module: 'freqplotbuilder', roles: { var: 'study_spot' }, options: { graphType: 'pareto' } },
    Object.assign({ file: 'guide-gallery-corr-heatmap.png', options: { graphType: 'corrheatmap' } }, CO),
    Object.assign({ file: 'guide-gallery-corr-circles.png', options: { graphType: 'corrcircles' } }, CO),
    Object.assign({ file: 'guide-gallery-corr-numbers.png', options: { graphType: 'corrnumbers' }, spec: { corrSigStars: true } }, CO),
    Object.assign({ file: 'guide-gallery-corr-mixed.png', options: { graphType: 'corrmixed' } }, CO),
    Object.assign({ file: 'guide-gallery-likert-diverging.png', options: { graphType: 'likertdiverging' } }, LK),
    Object.assign({ file: 'guide-gallery-likert-stacked.png', options: { graphType: 'likertstacked' } }, LK),
    Object.assign({ file: 'guide-gallery-likert-means.png', options: { graphType: 'likertmeans' } }, LK)
];

if (!ONLY || ONLY === 'gallery' || /^guide-/.test(ONLY)) {
    for (const fig of FIGURES) {
        if (ONLY && ONLY !== 'gallery' && fig.file.indexOf(ONLY) !== 0) continue;
        const { ctx, page } = await session();
        try { await draw(page, fig); await exportFigure(page, fig.file); }
        catch (e) { problems.push(fig.file + ': ' + e.message.split('\n')[0]); }
        await ctx.close();
    }
}

// ---------------------------------------------------------------- UI shots
// A drawn Compare Groups chart on the Dose response example is the stage
// for every panel shot, the same chart the guide's first steps produce.
const STAGE = Object.assign({ file: 'stage', options: { graphType: 'bar' } }, CG);
const INSPECTOR = '[data-gb2-inspector]';
async function clickToolbar(page, label) {
    await page.evaluate((label) => {
        const b = [...document.querySelectorAll('#psroot [data-role="chart-toolbar"] button')].find(x => (x.getAttribute('aria-label') || '') === label || (x.getAttribute('data-role') || '') === label);
        if (b) b.click();
    }, label);
    await s(page, 500);
}
async function clickPanelTab(page, text) {
    await page.evaluate(({ sel, text }) => {
        const b = [...document.querySelectorAll(sel + ' button')].find(x => (x.textContent || '').trim() === text);
        if (b) b.click();
    }, { sel: INSPECTOR, text });
    await s(page, 450);
}
const UI = [
    { file: 'guide-toolbar.png', run: async (page) => clipOf(page, '#ps-workcard', { left: 8, right: 8, top: 8, bottom: 8 }) },
    { file: 'guide-chart-type.png', run: async (page) => { await clickToolbar(page, 'graphtype-trigger'); return clipOf(page, '[data-role="graphtype-flyout"]', { top: 60, left: 40, right: 200 }); } },
    { file: 'guide-bar-style.png', run: async (page) => { await page.click('#psroot path[data-bar-cat]'); await s(page, 700); return clipOf(page, INSPECTOR, { top: 10 }); } },
    { file: 'guide-palette.png', run: async (page) => { await clickToolbar(page, 'palette-trigger'); return clipOf(page, '[data-role="palette-flyout"]', { top: 60, left: 120, right: 60 }); } },
    { file: 'guide-vision-check.png', run: async (page) => { await clickToolbar(page, 'Chart settings'); await clickPanelTab(page, 'Accessibility'); return clipOf(page, INSPECTOR, { top: 10 }); } },
    { file: 'guide-add-menu.png', run: async (page) => { await clickToolbar(page, 'Add to chart'); return clipOf(page, '[data-role="add-ann-menu"]', { top: 60, left: 260, right: 60 }); } },
    { file: 'guide-stats.png', run: async (page) => { await clickToolbar(page, 'Statistics'); await s(page, 700); await page.evaluate(() => { const b = document.querySelector('[data-st-tab="pairs"]'); if (b) b.click(); }); await s(page, 500); return clipOf(page, INSPECTOR, { top: 10 }); } },
    { file: 'guide-basics.png', run: async (page) => { await page.evaluate(() => window.PS_SHELL.runCommand('help-basics')); await s(page, 900); return clipOf(page, INSPECTOR, { top: 10 }); } },
    { file: 'guide-label-parts.png', run: async (page) => { await page.evaluate(() => window.PS_SHELL.runCommand('help-anatomy')); await s(page, 1200); return clipOf(page, '#ps-workcard', { left: 8, right: 8, top: 8, bottom: 8 }); } },
    { file: 'guide-check-graph.png', run: async (page) => { await page.evaluate(() => window.PS_SHELL.runCommand('help-lint')); await s(page, 900); return clipOf(page, INSPECTOR, { top: 10 }); } },
    { file: 'guide-glossary.png', run: async (page) => { await page.evaluate(() => window.PS_SHELL.runCommand('help-glossary')); await s(page, 900); return clipOf(page, INSPECTOR, { top: 10, bottom: 0 }); } },
    { file: 'guide-which-graph.png', run: async (page) => { await page.evaluate(() => window.PS_SHELL.runCommand('help-chooser')); await s(page, 900); return clipOf(page, INSPECTOR, { top: 10 }); } },
    { file: 'guide-export.png', run: async (page) => { await page.click('#ps-export'); await s(page, 700); return clipOf(page, '#ps-exporter > *', { left: 12, right: 12, top: 12, bottom: 12 }); } },
    { file: 'guide-wizard-questions.png', run: async (page) => { await page.evaluate(() => window.PS_SHELL.showHelpMeChoose(null, window.PS_SHELL.chart().id)); await s(page, 700); await page.evaluate(() => { const b = document.querySelector('[data-hmc-mode="questions"]'); if (b) b.click(); }); await s(page, 500); return clipOf(page, '#ps-help-choose > *', { left: 12, right: 12, top: 12, bottom: 12 }); } },
    { file: 'guide-wizard-data.png', run: async (page) => { await page.evaluate(() => window.PS_SHELL.showHelpMeChoose(null, window.PS_SHELL.chart().id)); await s(page, 700); await page.evaluate(() => { const b = document.querySelector('[data-hmc-mode="variables"]'); if (b) b.click(); }); await s(page, 500); return clipOf(page, '#ps-help-choose > *', { left: 12, right: 12, top: 12, bottom: 12 }); } }
];
if (!ONLY || ONLY === 'ui' || /^guide-/.test(ONLY)) {
    for (const u of UI) {
        if (ONLY && ONLY !== 'ui' && u.file.indexOf(ONLY) !== 0) continue;
        // 1440 wide: the toolbar buttons carry their words at this width, and
        // the guide's copy names them (Stats, Show/hide, Settings, Find, Add).
        const { ctx, page } = await session({ width: 1440, height: 1300 });
        try { await draw(page, STAGE); const clip = await u.run(page); await shot(page, u.file, clip); }
        catch (e) { problems.push(u.file + ': ' + e.message.split('\n')[0]); }
        await ctx.close();
    }
}
await browser.close();
if (problems.length) { console.log('PROBLEMS:'); problems.forEach(p => console.log('  ' + p)); process.exit(1); }
console.log('guide shots: OK');
