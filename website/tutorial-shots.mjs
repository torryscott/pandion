// Regenerate the getting-started tutorial's screenshots.
//
//   cd website && python3 -m http.server 8797 &
//   node website/tutorial-shots.mjs [port]
//
// Drives the REAL app at website/app/ headlessly and writes annotated
// shots to assets/tutorial/. Annotations (the ring around a control, the
// cursor, the drag arrow) are drawn INTO the live page before the
// screenshot, anchored to elements found by selector, so they always
// point at the real control no matter how the layout shifts. Never
// annotate these images by hand afterwards: a hand edit dies at the
// next regeneration.
//
// The shots are deliberately tighter than the marketing shots
// (shots.mjs): a tutorial reader needs to READ the control, so each
// image clips to the region the step is about, at 1280 CSS px and 2x.
//
// Run this whenever the app UI changes enough that a step no longer
// looks like its picture. The page that consumes these is start.html.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

function loadPlaywright() {
    for (const base of [process.cwd(), new URL('.', import.meta.url).pathname,
                        '/private/tmp', '/tmp']) {
        try { return createRequire(path.join(base, 'x.js'))('playwright'); }
        catch { /* try the next shared dependency location */ }
    }
    console.error('playwright not found');
    process.exit(2);
}

const PORT = process.argv[2] || '8797';
const OUT = path.resolve(new URL('.', import.meta.url).pathname, 'assets/tutorial');
fs.mkdirSync(OUT, { recursive: true });
const { chromium } = loadPlaywright();
const browser = await chromium.launch();
const problems = [];

// welcome: true keeps the first-run welcome dialog (one shot is OF it).
// Everything else suppresses both first-run dialogs before any script runs.
async function session(opts) {
    const ctx = await browser.newContext({
        viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
    await ctx.addInitScript((keepWelcome) => {
        try {
            if (!keepWelcome)
                sessionStorage.setItem('psstandalone.welcome.dismissed', '1');
        } catch (e) {}
        try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); } catch (e) {}
    }, !!(opts && opts.welcome));
    const page = await ctx.newPage();
    page.on('pageerror', e => problems.push('pageerror: ' + e.message));
    page.on('console', m => {
        if (m.type() === 'error') problems.push('console: ' + m.text()); });
    await page.goto(`http://127.0.0.1:${PORT}/app/`, { waitUntil: 'load' });
    await page.waitForTimeout(1400);
    return { ctx, page };
}

// Draw the annotations into the page. Each mark finds its target by
// css selector, optionally narrowed to the element whose text contains
// `text`. Kinds: ring (rounded highlight), cursor (a pointer whose tip
// sits on the target), arrow (curved drag arrow from `from` to the
// target). All chrome is pointer-inert and lives in one overlay.
async function annotate(page, marks) {
    const missing = await page.evaluate((marks) => {
        const find = (m) => {
            const els = [...document.querySelectorAll(m.sel)];
            const el = m.text
                ? els.find(e => (e.textContent || '').includes(m.text))
                : els[0];
            return el || null;
        };
        document.getElementById('tut-overlay')?.remove();
        const ov = document.createElement('div');
        ov.id = 'tut-overlay';
        ov.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99999;';
        document.body.appendChild(ov);
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;overflow:visible;');
        ov.appendChild(svg);
        const miss = [];
        const updates = [];
        for (const m of marks) {
            let el = find(m);
            if (!el) { miss.push(m.sel + (m.text ? ' "' + m.text + '"' : '')); continue; }
            // Re-resolve on every frame; fall back to the last live node
            // if the selector momentarily matches nothing mid-rebuild.
            const live = () => {
                if (!el.isConnected) { const f = find(m); if (f) el = f; }
                return el;
            };
            if (m.kind === 'ring') {
                const d = document.createElement('div');
                const pad = m.pad == null ? 6 : m.pad;
                d.style.cssText = 'position:absolute;box-sizing:border-box;'
                    // border-box, or the 3px borders ADD to the width
                    // below and the ring goes flush top-left with a
                    // 6px spill bottom-right (Torry caught it by eye).
                    + 'border:3px solid #375CA0;'
                    + 'border-radius:10px;box-shadow:0 0 0 3px rgba(255,255,255,0.9),'
                    + '0 2px 14px rgba(25,46,73,0.3);';
                ov.appendChild(d);
                updates.push(() => {
                    const r = live().getBoundingClientRect();
                    d.style.left = (r.left - pad) + 'px';
                    d.style.top = (r.top - pad) + 'px';
                    d.style.width = (r.width + 2 * pad) + 'px';
                    d.style.height = (r.height + 2 * pad) + 'px';
                });
            } else if (m.kind === 'cursor') {
                const c = document.createElementNS(svgNS, 'path');
                c.setAttribute('d', 'M0 0 L0 17 L4.8 13.4 L7.6 19.6 L10 18.5 L7.3 12.4 L12.4 12 Z');
                c.setAttribute('fill', '#1c1c1c');
                c.setAttribute('stroke', '#ffffff');
                c.setAttribute('stroke-width', '1.4');
                svg.appendChild(c);
                updates.push(() => {
                    const r = live().getBoundingClientRect();
                    const x = r.left + r.width * 0.62, y = r.top + r.height * 0.68;
                    c.setAttribute('transform', `translate(${x} ${y})`);
                });
            } else if (m.kind === 'arrow') {
                const fromEl = find({ sel: m.from, text: m.fromText });
                if (!fromEl) { miss.push(m.from + ' "' + (m.fromText || '') + '"'); continue; }
                const casing = document.createElementNS(svgNS, 'path');
                const line = document.createElementNS(svgNS, 'path');
                for (const [el2, w, col] of [[casing, 7, '#ffffff'], [line, 3.5, '#375CA0']]) {
                    el2.setAttribute('fill', 'none');
                    el2.setAttribute('stroke', col);
                    el2.setAttribute('stroke-width', String(w));
                    el2.setAttribute('stroke-linecap', 'round');
                    svg.appendChild(el2);
                }
                const head = document.createElementNS(svgNS, 'path');
                head.setAttribute('fill', '#375CA0');
                head.setAttribute('stroke', '#ffffff');
                head.setAttribute('stroke-width', '1.4');
                svg.appendChild(head);
                updates.push(() => {
                    const a = fromEl.getBoundingClientRect();
                    const r = live().getBoundingClientRect();
                    const x1 = a.left + a.width / 2, y1 = a.top + a.height / 2;
                    const x2 = r.left + r.width / 2, y2 = r.top + r.height / 2;
                    const mx = (x1 + x2) / 2 + (y2 - y1) * 0.18;
                    const my = (y1 + y2) / 2 - (x2 - x1) * 0.18;
                    const d = `M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`;
                    casing.setAttribute('d', d);
                    line.setAttribute('d', d);
                    const ang = Math.atan2(y2 - my, x2 - mx);
                    const hx = (t, sg) => x2 - Math.cos(ang + sg) * t;
                    const hy = (t, sg) => y2 - Math.sin(ang + sg) * t;
                    head.setAttribute('d', `M${x2} ${y2} L${hx(13, 0.42)} ${hy(13, 0.42)}`
                        + ` L${hx(13, -0.42)} ${hy(13, -0.42)} Z`);
                });
            }
        }
        // Track continuously. The app relayouts SEVERAL times after a
        // click (panel slide, picker dock, chart refit), so any one
        // "settled" moment is a guess; a per-frame resync makes the
        // guess unnecessary. Each frame re-finds the element too, so
        // even a redraw that REPLACES the node cannot strand a ring.
        const resync = () => updates.forEach(u => u());
        resync();
        if (window.__tutRaf) cancelAnimationFrame(window.__tutRaf);
        const loop = () => { resync(); window.__tutRaf = requestAnimationFrame(loop); };
        window.__tutRaf = requestAnimationFrame(loop);
        window.__tutResync = resync;
        return miss;
    }, marks);
    for (const m of missing) problems.push('annotation target not found: ' + m);
    return missing.length === 0;
}

// A clip rectangle around an element with padding, clamped to the
// viewport; `grow` widens specific sides for context.
async function clipAround(page, sel, text, grow) {
    const r = await page.evaluate(({ sel, text }) => {
        const els = [...document.querySelectorAll(sel)];
        const el = text ? els.find(e => (e.textContent || '').includes(text)) : els[0];
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { x: b.left, y: b.top, w: b.width, h: b.height };
    }, { sel, text });
    if (!r) { problems.push('clip target not found: ' + sel); return null; }
    const g = Object.assign({ left: 24, right: 24, top: 24, bottom: 24 }, grow || {});
    const x = Math.max(0, r.x - g.left), y = Math.max(0, r.y - g.top);
    return { x, y,
        width: Math.min(1280 - x, r.w + g.left + g.right),
        height: Math.min(900 - y, r.h + g.top + g.bottom) };
}

async function shot(page, name, clip) {
    await page.mouse.move(2, 898);           // park: no real hover state
    await page.evaluate(() => {
        if (document.activeElement && document.activeElement.blur)
            document.activeElement.blur();
    });
    await page.waitForTimeout(350);
    // Layout may have moved since the annotations were measured (panel
    // slide-in, chart refit); snap every mark back onto its element.
    await page.evaluate(() => { if (window.__tutResync) window.__tutResync(); });
    await page.waitForTimeout(120);
    await page.screenshot(clip ? { path: path.join(OUT, name), clip }
                               : { path: path.join(OUT, name) });
    const kb = Math.round(fs.statSync(path.join(OUT, name)).size / 1024);
    console.log(`  ${name}  ${kb} KB`);
}

// ------------------------------------------------------------- 1. welcome
{
    const { ctx, page } = await session({ welcome: true });
    await page.waitForSelector('#ps-welcome', { timeout: 10000 });
    await annotate(page, [
        { sel: '#ps-welcome-sample', kind: 'ring' },
        { sel: '#ps-welcome-sample', kind: 'cursor' },
    ]);
    await shot(page, 'welcome.png',
        await clipAround(page, '.ps-welcome-card', null,
            { left: 20, right: 20, top: 20, bottom: 20 }));
    await ctx.close();
}

// --------------------------------------------------------- 2. open button
{
    const { ctx, page } = await session();
    await annotate(page, [
        { sel: '#ps-load', kind: 'ring' },
        { sel: '#ps-load', kind: 'cursor' },
    ]);
    await shot(page, 'open-button.png',
        await clipAround(page, '#ps-load', null,
            { left: 40, right: 640, top: 28, bottom: 200 }));

    // The in-app import dialog, if the app shows one headlessly. The OS
    // file picker cannot be screenshotted (and looks different on every
    // machine), so this shot exists only if the app's own dialog opens.
    const hasDialog = await page.evaluate(() => {
        try { window.PS_SHELL.openLoader(); } catch (e) { return false; }
        return true;
    });
    await page.waitForTimeout(600);
    const dlg = hasDialog ? await page.evaluate(() => {
        const cands = [...document.querySelectorAll('[role="dialog"]')]
            .filter(d => d.id !== 'ps-welcome' && d.offsetParent !== null);
        return cands.length ? (cands[0].id || cands[0].className.toString()) : null;
    }) : null;
    if (dlg) {
        console.log('  (import dialog present: ' + dlg + ')');
        await shot(page, 'import-dialog.png',
            await clipAround(page, '[role="dialog"]:not(#ps-welcome)', null,
                { left: 20, right: 20, top: 20, bottom: 20 }));
    } else {
        console.log('  (no in-app import dialog; the page must not reference one)');
    }
    await ctx.close();
}

// -------------------------------------------------------- 3. data arrives
{
    const { ctx, page } = await session();
    await page.evaluate(() => {
        window.PS_SHELL.setWorkspace('data');
        window.PS_SHELL.selectVariable('condition');
    });
    await page.waitForTimeout(700);
    await shot(page, 'data-grid.png', { x: 0, y: 76, width: 1280, height: 620 });
    await ctx.close();
}

// -------------------------------------- 4. the chart setup panel, empty
// The sample project loads with roles already assigned, so the honest
// empty-roles story is the import path: after bringing in your own
// file, the roles read "+ Choose a variable". The flow taught here is
// click-to-choose; drag also works and the prose says so.
{
    const { ctx, page } = await session();
    await page.evaluate(() => {
        window.PS_SHELL.setWorkspace('charts');
        window.PS_SHELL.setModule('plotbuilder');
        window.PS_SHELL.setRoles('plotbuilder', {});
    });
    await page.waitForTimeout(900);

    await annotate(page, [
        { sel: '#ps-module', kind: 'ring' },
        { sel: '#ps-module', kind: 'cursor' },
    ]);
    await shot(page, 'pick-analysis.png',
        await clipAround(page, '#ps-settings-panel', null,
            { left: 14, right: 14, top: 14, bottom: -320 }));
    await page.evaluate(() => document.getElementById('tut-overlay')?.remove());

    // The picker itself, opened with a REAL mouse click (a synthetic
    // element.click() does not open it). If the app ever stops opening
    // it headlessly, the shot is skipped and the page must not show it.
    const target = await page.evaluate(() => {
        const card = [...document.querySelectorAll('.ps-role-card')]
            .find(c => (c.textContent || '').includes('Category axis'));
        if (!card) return null;
        const r = card.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height * 0.72 };
    });
    if (target) {
        await page.mouse.click(target.x, target.y);
        await page.waitForTimeout(500);
    }
    const pickerOpen = await page.evaluate(() => {
        const pk = document.querySelector('.ps-role-picker');
        return !!(pk && pk.offsetParent !== null);
    });
    if (pickerOpen) {
        await shot(page, 'role-picker.png',
            await clipAround(page, '#ps-settings-panel', null,
                { left: 14, right: 14, top: 14, bottom: -400 }));
    } else {
        console.log('  (role picker did not open headlessly; page must not show it)');
    }
    await ctx.close();
}

// ------------------------------------------------- 5. the draft appears
{
    const { ctx, page } = await session();
    await page.evaluate(() => {
        window.PS_SHELL.setWorkspace('charts');
        window.PS_SHELL.setRoles('plotbuilder',
            { xvar: 'condition', yvar: 'score' });
    });
    await page.waitForFunction(() => {
        const s = document.querySelector('#psroot svg[data-role="gb2-chart-svg"]');
        return s && s.querySelectorAll('*').length > 40;
    }, null, { timeout: 20000 });
    await page.waitForTimeout(600);
    await shot(page, 'first-chart.png', { x: 206, y: 76, width: 1074, height: 700 });
    await ctx.close();
}

// -------------------------------------------------- 6. grouped by colour
{
    const { ctx, page } = await session();
    await page.evaluate(() => {
        window.PS_SHELL.setWorkspace('charts');
        window.PS_SHELL.setRoles('plotbuilder',
            { xvar: 'condition', yvar: 'score', groupVar: 'site' });
    });
    await page.waitForFunction(() => {
        const s = document.querySelector('#psroot svg[data-role="gb2-chart-svg"]');
        return s && s.querySelectorAll('[data-bar-cat]').length > 4;
    }, null, { timeout: 20000 });
    await page.waitForTimeout(600);
    await annotate(page, [
        { sel: '.ps-role-card', text: 'Color / group', kind: 'ring' },
    ]);
    await shot(page, 'grouped.png', { x: 206, y: 76, width: 1074, height: 700 });
    await ctx.close();
}

// ----------------------------------------- 7. click-to-edit: a bar
{
    const { ctx, page } = await session();
    await page.evaluate(() => { window.PS_SHELL.setWorkspace('charts'); });
    await page.waitForFunction(() => {
        const s = document.querySelector('#psroot svg[data-role="gb2-chart-svg"]');
        return s && s.querySelectorAll('path[data-bar-cat]').length > 0;
    }, null, { timeout: 20000 });
    // A REAL click on the first bar: click-to-edit is pointer-driven.
    const bar = await page.evaluate(() => {
        const el = document.querySelector('#psroot svg[data-role="gb2-chart-svg"] path[data-bar-cat]');
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.click(bar.x, bar.y);
    await page.waitForFunction(() =>
        [...document.querySelectorAll('[data-field]')].some(e => e.offsetParent !== null),
        null, { timeout: 10000 });
    await page.waitForTimeout(500);
    await annotate(page, [
        // Wide pad on purpose: the ring's cobalt sits close to the
        // bar's own blue, and at 3px they fused into one shape. The
        // white stand-off is what makes it read as a marker (Torry).
        { sel: 'path[data-bar-cat]', kind: 'ring', pad: 10 },
    ]);
    await shot(page, 'edit-bar.png',
        await clipAround(page, '#psroot [data-role="chart-card"]', null,
            { left: 18, right: 18, top: -62, bottom: 14 }));
    await ctx.close();
}

// ---------------------------------- 8. click-to-edit: the axis title
{
    const { ctx, page } = await session();
    await page.evaluate(() => { window.PS_SHELL.setWorkspace('charts'); });
    await page.waitForFunction(() => {
        const s = document.querySelector('#psroot svg[data-role="gb2-chart-svg"]');
        return s && s.querySelectorAll('*').length > 40;
    }, null, { timeout: 20000 });
    const yt = await page.evaluate(() => {
        const svg = document.querySelector('#psroot svg[data-role="gb2-chart-svg"]');
        const t = [...svg.querySelectorAll('text')]
            .find(t => (t.textContent || '').trim() === 'score');
        if (!t) return null;
        const r = t.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (!yt) problems.push('retitle: y axis title "score" not found');
    else {
        await page.mouse.click(yt.x, yt.y);
        await page.waitForFunction(() =>
            [...document.querySelectorAll('[data-field]')].some(e => e.offsetParent !== null),
            null, { timeout: 10000 });
        await page.waitForTimeout(500);
        await annotate(page, [
            { sel: '#psroot svg[data-role="gb2-chart-svg"] text', text: 'score', kind: 'ring', pad: 5 },
        ]);
        await shot(page, 'retitle.png',
            await clipAround(page, '#psroot [data-role="chart-card"]', null,
                { left: 18, right: 18, top: 14, bottom: 14 }));
    }
    await ctx.close();
}

// ------------------------------------------------ 9. the theme flyout
{
    const { ctx, page } = await session();
    await page.evaluate(() => { window.PS_SHELL.setWorkspace('charts'); });
    await page.waitForFunction(() => {
        const s = document.querySelector('#psroot svg[data-role="gb2-chart-svg"]');
        return s && s.querySelectorAll('*').length > 40;
    }, null, { timeout: 20000 });
    const theme = await page.evaluate(() => {
        const btn = [...document.querySelectorAll('#psroot button')]
            .find(b => /theme/i.test(b.textContent || ''));
        if (!btn) return null;
        const r = btn.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (!theme) problems.push('theme button not found');
    else {
        await page.mouse.click(theme.x, theme.y);
        await page.waitForFunction(() => {
            const f = document.querySelector('[data-role="palette-flyout"]');
            return !!(f && f.offsetParent !== null);
        }, null, { timeout: 10000 });
        await page.waitForTimeout(400);
        await annotate(page, [
            { sel: '#psroot button', text: 'Theme', kind: 'ring', pad: 4 },
        ]);
        // Clip the flyout plus the button above it, with room around both.
        await shot(page, 'theme-flyout.png',
            await clipAround(page, '[data-role="palette-flyout"]', null,
                { left: 90, right: 240, top: 90, bottom: 30 }));
    }
    await ctx.close();
}

// --------------------------------------- 10. save and export buttons
{
    const { ctx, page } = await session();
    await page.evaluate(() => { window.PS_SHELL.setWorkspace('charts'); });
    await page.waitForTimeout(800);
    await annotate(page, [
        { sel: '#ps-save', kind: 'ring' },
        { sel: '#ps-export', kind: 'ring' },
    ]);
    await shot(page, 'save-export.png', { x: 0, y: 28, width: 1280, height: 122 });
    await page.evaluate(() => document.getElementById('tut-overlay')?.remove());

    // The export dialog, opened for real.
    const exp = await page.evaluate(() => {
        const b = document.getElementById('ps-export');
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.click(exp.x, exp.y);
    await page.waitForFunction(() => {
        const c = document.getElementById('ps-export-close');
        return !!(c && c.offsetParent !== null);
    }, null, { timeout: 10000 });
    await page.waitForTimeout(500);
    const dlgSel = await page.evaluate(() => {
        let n = document.getElementById('ps-export-close');
        while (n && n.parentElement) {
            const r = n.getBoundingClientRect();
            if (r.width > 380 && r.height > 260) {
                n.setAttribute('data-tut-dialog', '1');
                return true;
            }
            n = n.parentElement;
        }
        return false;
    });
    if (dlgSel) {
        await shot(page, 'export-dialog.png',
            await clipAround(page, '[data-tut-dialog]', null,
                { left: 20, right: 20, top: 20, bottom: 20 }));
    } else problems.push('export dialog container not found');
    await ctx.close();
}

await browser.close();
if (problems.length) {
    console.error('\nPROBLEMS (a step may not match its picture):');
    console.error([...new Set(problems)].join('\n'));
    process.exit(1);
}
console.log('\nall tutorial shots drew with their annotations anchored');
