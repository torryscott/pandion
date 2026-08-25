// Regenerate the LEARN tutorials' screenshots (the five deep-dive pages
// that follow the two getting-started guides).
//
//   cd website && python3 -m http.server 8797 &
//   node website/tutorial-shots-learn.mjs [port] [only]
//
// `only` filters to one section: stats | choose | rm | pub | data | workshop.
//
// Same harness as tutorial-shots.mjs (drive the REAL app at website/app/
// headlessly, annotate INTO the live page, tight clips at 1280 CSS px and
// 2x). Never hand-edit the output images: a hand edit dies at the next
// regeneration. Consumers: learn-statistics.html, learn-choosing.html,
// learn-repeated-measures.html, learn-publication.html, learn-data.html.
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
const ONLY = process.argv[3] || null;
const OUT = path.resolve(new URL('.', import.meta.url).pathname, 'assets/tutorial');
fs.mkdirSync(OUT, { recursive: true });
const { chromium } = loadPlaywright();
const browser = await chromium.launch();
const problems = [];

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
            const live = () => {
                if (!el.isConnected) { const f = find(m); if (f) el = f; }
                return el;
            };
            if (m.kind === 'ring') {
                const d = document.createElement('div');
                const pad = m.pad == null ? 6 : m.pad;
                d.style.cssText = 'position:absolute;box-sizing:border-box;'
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
            }
        }
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
    await page.mouse.move(2, 898);
    await page.evaluate(() => {
        if (document.activeElement && document.activeElement.blur)
            document.activeElement.blur();
    });
    await page.waitForTimeout(350);
    await page.evaluate(() => { if (window.__tutResync) window.__tutResync(); });
    await page.waitForTimeout(120);
    await page.screenshot(clip ? { path: path.join(OUT, name), clip }
                               : { path: path.join(OUT, name) });
    const kb = Math.round(fs.statSync(path.join(OUT, name)).size / 1024);
    console.log(`  ${name}  ${kb} KB`);
}

const want = (key) => !ONLY || ONLY === key;
// Click the VISIBLE instance of a selector with a real mouse click (the
// DOM can hold hidden duplicates, and engine buttons guard synthetic
// clicks via event.detail).
async function clickVisible(page, sel) {
    const r = await page.evaluate((sel) => {
        const el = [...document.querySelectorAll(sel)]
            .find(e => e.offsetParent !== null);
        if (!el) return null;
        // a scrolled chart column can park the button under the app
        // header, where the click lands on the header instead
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const b = el.getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }, sel);
    await page.waitForTimeout(250);
    if (!r) { problems.push('no visible element for click: ' + sel); return false; }
    await page.mouse.click(r.x, r.y);
    return true;
}
const chartsReady = async (page) => {
    await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
    await page.waitForFunction(() => {
        const s = document.querySelector('#psroot svg[data-role="gb2-chart-svg"]');
        return s && s.getBoundingClientRect().width > 100
            && s.querySelectorAll('[data-bar-cat],[data-role]').length > 10;
    }, null, { timeout: 20000 });
    await page.waitForTimeout(800);
};

// ============================================== learn-statistics.html
if (want('stats')) {
    const { ctx, page } = await session();
    await chartsReady(page);
    // zoomed out, chart + open panel + toolbar fit one viewport, so the
    // card-only clips never clamp into the app chrome above
    await page.selectOption('#ps-chart-zoom', { label: '50%' });
    await page.waitForTimeout(900);

    // --- st-errorbars: click an error bar, land on the Type strip
    const eb = await page.evaluate(() => {
        const el = document.querySelector('#psroot [data-role="error-bar"]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + 3 };
    });
    if (!eb) problems.push('no error bar to click');
    else {
        await page.mouse.click(eb.x, eb.y);
        await page.waitForFunction(() =>
            [...document.querySelectorAll('[data-role="stat-strip-label"]')]
                .some(e => e.offsetParent !== null), null, { timeout: 10000 })
            .catch(() => problems.push('error-bar panel did not open on Type'));
        await page.waitForTimeout(600);
        await page.evaluate(() => {
            const lbl = [...document.querySelectorAll('[data-role="stat-strip-label"]')]
                .find(e => e.offsetParent !== null);
            if (lbl && lbl.parentElement)
                lbl.parentElement.setAttribute('data-tut-ebband', '1');
        });
        await annotate(page, [
            { sel: '[data-tut-ebband]', kind: 'ring', pad: 8 },
        ]);
        // card-only clip: the guide serves both platforms, so the
        // standalone setup rail and data-title stay out of the frame
        await page.evaluate(() => {
            const c = document.querySelector('#psroot [data-role="chart-card"]');
            if (c) c.scrollIntoView({ block: 'start' });
        });
        await page.waitForTimeout(500);
        await shot(page, 'st-errorbars.png',
            await clipAround(page, '#psroot [data-role="chart-card"]', null,
                { left: 14, right: 14, top: 8, bottom: 14 }));
        await page.keyboard.press('Escape');
        await page.waitForTimeout(600);
    }

    // --- st-omnibus: the sigma panel's Omnibus tab
    await page.click('button[title="Statistics"]');
    await page.waitForFunction(() =>
        document.querySelectorAll('[data-st-pane]').length > 0,
        null, { timeout: 10000 })
        .catch(() => problems.push('statistics panel did not open'));
    await page.waitForTimeout(800);
    await page.evaluate(() => {
        const t = [...document.querySelectorAll('[data-st-tab]')]
            .find(e => (e.textContent || '').trim() === 'Omnibus');
        if (t) t.click();
    });
    await page.waitForTimeout(900);
    await annotate(page, [
        { sel: 'button[title="Statistics"]', kind: 'ring', pad: 4 },
        { sel: 'button[title="Statistics"]', kind: 'cursor' },
    ]);
    await page.evaluate(() => {
        const c = document.querySelector('#psroot [data-role="chart-card"]');
        if (c) c.scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(500);
    await shot(page, 'st-omnibus.png',
        await clipAround(page, '#psroot [data-role="chart-card"]', null,
            { left: 14, right: 14, top: 8, bottom: 14 }));
    await annotate(page, []);

    // --- st-pairs: the Compare pairs tab, untouched
    await page.evaluate(() => {
        const t = [...document.querySelectorAll('[data-st-tab]')]
            .find(e => (e.textContent || '').trim() === 'Compare pairs');
        if (t) t.click();
    });
    await page.waitForTimeout(900);
    await page.evaluate(() => {
        const c = document.querySelector('#psroot [data-role="chart-card"]');
        if (c) c.scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(500);
    await shot(page, 'st-pairs.png',
        await clipAround(page, '#psroot [data-role="chart-card"]', null,
            { left: 14, right: 14, top: 8, bottom: 14 }));

    // --- st-brackets: tick two pairs, Place brackets, shoot the chart
    await page.evaluate(() => {
        const cks = [...document.querySelectorAll(
            '[data-st-pane="pairs"] input[type="checkbox"]')];
        cks.slice(0, 2).forEach(c => { if (!c.checked) c.click(); });
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
        const b = [...document.querySelectorAll('[data-st-act="cmpplace"]')]
            .find(e => e.offsetParent !== null);
        if (b) b.click();
    });
    await page.waitForFunction(() => {
        const svg = document.querySelector('#psroot svg[data-role="gb2-chart-svg"]');
        return svg && [...svg.querySelectorAll('[data-ann-id]')].length >= 2;
    }, null, { timeout: 15000 })
        .catch(() => problems.push('Place brackets drew no brackets'));
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
        const x = [...document.querySelectorAll('[data-role="st-close-btn"]')]
            .find(e => e.offsetParent !== null);
        if (x) x.click();
    });
    await page.waitForTimeout(1200);
    await page.selectOption('#ps-chart-zoom', { label: 'Fit window' });
    await page.waitForTimeout(900);
    await shot(page, 'st-brackets.png',
        await clipAround(page, '#psroot svg[data-role="gb2-chart-svg"]', null,
            { left: 10, right: 10, top: 10, bottom: 10 }));
    await ctx.close();
}

// ================================================ learn-choosing.html
if (want('choose')) {
    // Chart-only shots, one per data shape. The dose sample covers five
    // analyses; the practice example covers RM + a 4-variable matrix;
    // the feedback example covers Likert.
    const chartOnly = async (page) =>
        clipAround(page, '#psroot svg[data-role="gb2-chart-svg"]', null,
            { left: 8, right: 8, top: 8, bottom: 8 });
    const waitChart = async (page, minEls) => {
        await page.waitForFunction((n) => {
            const s = document.querySelector('#psroot svg[data-role="gb2-chart-svg"]');
            return s && s.querySelectorAll('*').length > n;
        }, minEls || 40, { timeout: 20000 });
        await page.waitForTimeout(900);
    };

    {   // dose-based shapes
        const { ctx, page } = await session();
        await chartsReady(page);
        await shot(page, 'ch-cg.png', await chartOnly(page));

        await page.evaluate(() => {
            window.PS_SHELL.setModule('distplotbuilder');
            window.PS_SHELL.setRoles('distplotbuilder', { var: 'score' });
        });
        await waitChart(page);
        await shot(page, 'ch-dist.png', await chartOnly(page));

        await page.evaluate(() => {
            window.PS_SHELL.setModule('freqplotbuilder');
            window.PS_SHELL.setRoles('freqplotbuilder', { var: 'condition' });
        });
        await waitChart(page);
        await shot(page, 'ch-freq.png', await chartOnly(page));

        await page.evaluate(() => {
            window.PS_SHELL.setModule('xyplotbuilder');
            window.PS_SHELL.setRoles('xyplotbuilder', { xvar: 'hours', yvar: 'score' });
        });
        await waitChart(page);
        await shot(page, 'ch-xy.png', await chartOnly(page));
        await ctx.close();
    }

    {   // practice example: RM + correlation matrix
        const { ctx, page } = await session({ welcome: true });
        await page.waitForSelector('#ps-welcome', { timeout: 10000 });
        await page.click('[data-example="practice"]');
        await page.waitForTimeout(1200);
        await chartsReady(page);
        await shot(page, 'ch-rm.png', await chartOnly(page));

        await page.evaluate(() => {
            window.PS_SHELL.setModule('corrplotbuilder');
            window.PS_SHELL.setRoles('corrplotbuilder',
                { vars: ['session1', 'session2', 'session3', 'session4'] });
        });
        await waitChart(page);
        await shot(page, 'ch-corr.png', await chartOnly(page));
        await ctx.close();
    }

    {   // feedback example: Likert
        const { ctx, page } = await session({ welcome: true });
        await page.waitForSelector('#ps-welcome', { timeout: 10000 });
        await page.click('[data-example="feedback"]');
        await page.waitForTimeout(1200);
        await chartsReady(page);
        await shot(page, 'ch-likert.png', await chartOnly(page));
        await ctx.close();
    }

    {   // the in-chart Which graph? chooser (zoomed out so the type
        // cards fit on screen under the shrunken chart)
        const { ctx, page } = await session();
        await chartsReady(page);
        await page.selectOption('#ps-chart-zoom', { label: '50%' });
        await page.waitForTimeout(900);
        await page.click('#ps-status-check');
        await page.waitForTimeout(1000);
        await page.evaluate(() => {
            const t = [...document.querySelectorAll('button,[role="tab"]')]
                .filter(e => e.offsetParent !== null)
                .find(e => (e.textContent || '').trim() === 'Which graph?');
            if (t) t.click();
        });
        await page.waitForTimeout(1200);
        const tabRect = await page.evaluate(() => {
            const t = [...document.querySelectorAll('button,[role="tab"]')]
                .filter(e => e.offsetParent !== null)
                .find(e => (e.textContent || '').trim() === 'Which graph?');
            if (!t) return null;
            const r = t.getBoundingClientRect();
            return { y: r.top };
        });
        const top = tabRect ? Math.max(0, tabRect.y - 60) : 300;
        await shot(page, 'ch-whichgraph.png',
            { x: 270, y: top, width: 616, height: Math.min(876 - top, 616) });
        await ctx.close();
    }
}

// ====================================== learn-repeated-measures.html
if (want('rm')) {
    const { ctx, page } = await session({ welcome: true });
    await page.waitForSelector('#ps-welcome', { timeout: 10000 });
    await page.click('[data-example="practice"]');
    await page.waitForTimeout(1200);

    // --- rm-data: the wide table in the Data workspace
    await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
    await page.waitForTimeout(1200);
    await shot(page, 'rm-data.png', { x: 0, y: 76, width: 1280, height: 560 });

    // --- rm-chart: the working view, Repeated measures role ringed
    await chartsReady(page);
    await annotate(page, [
        { sel: '.ps-role-card', text: 'Repeated measures', kind: 'ring' },
    ]);
    await shot(page, 'rm-chart.png', { x: 0, y: 76, width: 1280, height: 700 });
    await annotate(page, []);

    // --- rm-method: the line panel's Error bars tab, Method strip.
    // The CM-corrected error bars here are tiny and sit under the line
    // markers, so the honest route is the one a user takes: click a
    // marker, then the panel's own Error bars tab.
    const mk = await page.evaluate(() => {
        const els = [...document.querySelectorAll(
            '#psroot [data-role="line-marker"]')];
        const el = els[1] || els[0];
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (!mk) problems.push('no RM line marker to click');
    else {
        await page.mouse.click(mk.x, mk.y);
        await page.waitForFunction(() =>
            [...document.querySelectorAll('[data-field]')]
                .some(e => e.offsetParent !== null), null, { timeout: 10000 })
            .catch(() => problems.push('RM line panel did not open'));
        await page.waitForTimeout(900);
        const tab = await page.evaluate(() => {
            const t = [...document.querySelectorAll('button,div,span')]
                .filter(e => e.offsetParent !== null
                    && (e.textContent || '').trim() === 'Error bars'
                    && e.getBoundingClientRect().height < 60
                    && !e.closest('[data-role="add-ann-menu"]'));
            const el = t[t.length - 1];
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        });
        if (!tab) problems.push('Error bars tab not found in the line panel');
        else { await page.mouse.click(tab.x, tab.y); await page.waitForTimeout(900); }
        // the Method segs ride INSIDE the Type strip on RM charts, so
        // the strip that is already showing carries both
        await page.evaluate(() => {
            const lbl = [...document.querySelectorAll('[data-role="stat-strip-label"]')]
                .find(e => e.offsetParent !== null);
            if (lbl && lbl.parentElement)
                lbl.parentElement.setAttribute('data-tut-ebband', '1');
        });
        await annotate(page, [
            { sel: '[data-tut-ebband]', kind: 'ring', pad: 8 },
        ]);
        // clip to the chart card alone: this figure serves BOTH platform
        // variants of the guide, so the standalone setup rail stays out
        await shot(page, 'rm-method.png',
            await clipAround(page, '#psroot [data-role="chart-card"]', null,
                { left: 14, right: 14, top: -62, bottom: 14 }));
        await annotate(page, []);
        for (let i = 0; i < 4; i++) {
            const open = await page.evaluate(() =>
                [...document.querySelectorAll('[data-field]')]
                    .some(e => e.offsetParent !== null));
            if (!open) break;
            await page.keyboard.press('Escape');
            await page.waitForTimeout(900);
        }
    }

    // --- rm-subjects: data points + subject connectors via the + menu
    const addVia = async (label) => {
        for (let i = 0; i < 3; i++) {
            await clickVisible(page, 'button[title="Add to chart"]');
            await page.waitForTimeout(700);
            const open = await page.evaluate(() => {
                const m = document.querySelector('[data-role="add-ann-menu"]');
                return !!(m && m.offsetParent !== null);
            });
            if (open) break;
        }
        const ok = await page.evaluate((label) => {
            const it = [...document.querySelectorAll('[data-role="add-ann-menu"] *')]
                .filter(e => e.offsetParent !== null)
                .find(e => (e.textContent || '').trim() === label
                    && !e.querySelector('*'));
            if (!it) return false;
            it.click(); return true;
        }, label);
        if (!ok) problems.push('add-menu item not found: ' + label);
        await page.waitForTimeout(1400);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
    };
    await addVia('Data points');
    const hasConn = await page.evaluate(() => {
        return new Promise((res) => {
            const el = [...document.querySelectorAll('button[title="Add to chart"]')]
                .find(e => e.offsetParent !== null);
            if (!el) return res(false);
            const r = el.getBoundingClientRect();
            const ev = (type) => el.dispatchEvent(new MouseEvent(type,
                { bubbles: true, cancelable: true, view: window,
                  clientX: r.left + 4, clientY: r.top + 4, detail: 1 }));
            ev('pointerdown'); ev('mousedown'); ev('pointerup'); ev('mouseup'); ev('click');
            setTimeout(() => {
                const m = document.querySelector('[data-role="add-ann-menu"]');
                const has = !!(m && m.offsetParent !== null
                    && [...m.querySelectorAll('span')]
                        .some(e => (e.textContent || '').trim() === 'Connect subjects'));
                res(has);
            }, 500);
        });
    });
    if (hasConn) {
        await page.evaluate(() => {
            const m = document.querySelector('[data-role="add-ann-menu"]');
            const it = [...m.querySelectorAll('span')]
                .find(e => (e.textContent || '').trim() === 'Connect subjects');
            if (it) it.click();
        });
        await page.waitForTimeout(1400);
    } else {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        await page.evaluate(() => {
            if (window.__gb2_setOption) window.__gb2_setOption('connectSubjects', true);
            else if (window.setOption) window.setOption('connectSubjects', true);
        });
        await page.waitForTimeout(1600);
    }
    await page.waitForFunction(() => {
        const s = document.querySelector('#psroot svg[data-role="gb2-chart-svg"]');
        return s && s.querySelectorAll('[data-role="subject-connector"]').length > 4;
    }, null, { timeout: 15000 })
        .catch(() => problems.push('subject connectors never drew'));
    await page.waitForTimeout(900);
    await shot(page, 'rm-subjects.png',
        await clipAround(page, '#psroot svg[data-role="gb2-chart-svg"]', null,
            { left: 10, right: 10, top: 10, bottom: 10 }));
    await ctx.close();
}

// ========================================== learn-publication.html
if (want('pub')) {
    const { ctx, page } = await session();
    await chartsReady(page);
    // grouped chart: the Vision check needs >= 2 series
    await page.evaluate(() => {
        window.PS_SHELL.setRoles('plotbuilder',
            { xvar: 'condition', yvar: 'score', groupVar: 'site' });
    });
    await page.waitForFunction(() => {
        const s = document.querySelector('#psroot svg[data-role="gb2-chart-svg"]');
        return s && s.querySelectorAll('[data-bar-cat]').length > 4;
    }, null, { timeout: 20000 });
    await page.waitForTimeout(900);

    // --- pub-add: the + menu with the finishing touches
    await clickVisible(page, 'button[title="Add to chart"]');
    await page.waitForTimeout(700);
    await annotate(page, [
        { sel: 'button[title="Add to chart"]', kind: 'ring', pad: 4 },
    ]);
    await shot(page, 'pub-add.png',
        await clipAround(page, '[data-role="add-ann-menu"]', null,
            { left: 60, right: 24, top: 70, bottom: 24 }));
    await annotate(page, []);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // --- pub-check: the Check graph tab (zoomed out so the finding
    // card and the passed pills fit under the shrunken chart)
    await page.selectOption('#ps-chart-zoom', { label: '50%' });
    await page.waitForTimeout(900);
    await page.click('#ps-status-check');
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
        const t = [...document.querySelectorAll('button,[role="tab"]')]
            .filter(e => e.offsetParent !== null)
            .find(e => (e.textContent || '').trim() === 'Check graph');
        if (t) {
            const r = t.getBoundingClientRect();
            window.__tutCheckTab = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
    });
    const ct = await page.evaluate(() => window.__tutCheckTab || null);
    if (ct) { await page.mouse.click(ct.x, ct.y); await page.waitForTimeout(1200); }
    const ckClip = await page.evaluate(() => {
        const t = [...document.querySelectorAll('button,[role="tab"]')]
            .filter(e => e.offsetParent !== null)
            .find(e => (e.textContent || '').trim() === 'Check graph');
        const card = document.querySelector('#psroot [data-role="chart-card"]');
        const y = t ? Math.max(0, t.getBoundingClientRect().top - 90) : 260;
        const c = card ? card.getBoundingClientRect() : { left: 206, width: 700, bottom: 876 };
        return { x: Math.max(0, c.left - 14), y, w: c.width + 28,
                 hMax: Math.max(120, Math.min(876, c.bottom + 14) - y) };
    });
    await shot(page, 'pub-check.png',
        { x: ckClip.x, y: ckClip.y, width: ckClip.w,
          height: Math.min(ckClip.hMax, 620) });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);

    // --- pub-vision: Chart settings -> Accessibility (CVD tiles + fixer)
    await clickVisible(page, 'button[title="Chart settings"]');
    await page.waitForTimeout(900);
    const at = await page.evaluate(() => {
        const t = [...document.querySelectorAll('[data-gs-tab]')]
            .filter(e => e.offsetParent !== null)
            .find(e => e.getAttribute('data-gs-tab') === 'accessibility');
        if (!t) return null;
        const r = t.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (!at) problems.push('Accessibility tab not found in Chart settings');
    else { await page.mouse.click(at.x, at.y); await page.waitForTimeout(1600); }
    const vzClip = await page.evaluate(() => {
        const t = [...document.querySelectorAll('[data-gs-tab="accessibility"]')]
            .find(e => e.offsetParent !== null);
        const card = document.querySelector('#psroot [data-role="chart-card"]');
        const y = t ? Math.max(0, t.getBoundingClientRect().top - 90) : 260;
        const c = card ? card.getBoundingClientRect() : { left: 206, width: 700, bottom: 876 };
        return { x: Math.max(0, c.left - 14), y, w: c.width + 28,
                 hMax: Math.max(120, Math.min(876, c.bottom + 14) - y) };
    });
    await shot(page, 'pub-vision.png',
        { x: vzClip.x, y: vzClip.y, width: vzClip.w,
          height: Math.min(vzClip.hMax, 620) });
    await ctx.close();
}

// ================================================== learn-data.html
if (want('data')) {
    // --- dat-paste: the Paste data dialog from the welcome screen
    {
        const { ctx, page } = await session({ welcome: true });
        await page.waitForSelector('#ps-welcome', { timeout: 10000 });
        const opened = await page.evaluate(() => {
            const b = [...document.querySelectorAll('#ps-welcome button, #ps-welcome [role="button"]')]
                .find(e => /paste data/i.test(e.textContent || ''));
            if (!b) return false;
            b.click(); return true;
        });
        if (!opened) problems.push('welcome Paste data button not found');
        await page.waitForTimeout(1000);
        const ta = await page.$('textarea:visible');
        if (ta) {
            await ta.fill('condition\tscore\nControl\t61\nControl\t55\nLow dose\t70\nLow dose\t74\nHigh dose\t82\nHigh dose\t88');
            await page.waitForTimeout(700);
        } else problems.push('paste dialog textarea not found');
        await shot(page, 'dat-paste.png', null);
        await ctx.close();
    }

    const { ctx, page } = await session();

    // --- dat-type: the variable inspector's type controls
    await page.evaluate(() => {
        window.PS_SHELL.setWorkspace('data');
        window.PS_SHELL.selectVariable('score');
    });
    await page.waitForTimeout(1200);
    const typed = await page.evaluate(() => {
        const sels = [...document.querySelectorAll('select')]
            .filter(e => e.offsetParent !== null
                && [...e.options].some(o => /continuous/i.test(o.textContent || '')));
        if (!sels[0]) return null;
        sels[0].setAttribute('data-tut-type', '1');
        return true;
    });
    if (!typed) problems.push('variable type select not found in inspector');
    else await annotate(page, [
        { sel: 'select[data-tut-type]', kind: 'ring', pad: 5 },
        { sel: 'select[data-tut-type]', kind: 'cursor' },
    ]);
    await shot(page, 'dat-type.png', { x: 0, y: 76, width: 1280, height: 560 });
    await annotate(page, []);

    // --- dat-exclude: the point menu on a raw data point
    await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
    await page.waitForTimeout(1000);
    await clickVisible(page, 'button[title="Add to chart"]');
    await page.waitForTimeout(600);
    await page.evaluate(() => {
        const it = [...document.querySelectorAll('[data-role="add-ann-menu"] *')]
            .filter(e => e.offsetParent !== null)
            .find(e => (e.textContent || '').trim() === 'Data points'
                && !e.querySelector('*'));
        if (it) it.click();
    });
    await page.waitForTimeout(1500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const pt = await page.evaluate(() => {
        const els = [...document.querySelectorAll(
            '#psroot svg[data-role="gb2-chart-svg"] [data-role="data-point"]')];
        const el = els[Math.floor(els.length / 2)];
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (!pt) problems.push('no data point for the exclusion menu');
    else {
        await page.mouse.click(pt.x, pt.y, { button: 'right' });
        await page.waitForTimeout(900);
        const menu = await page.evaluate(() => {
            const it = [...document.querySelectorAll('button')]
                .filter(e => e.offsetParent !== null)
                .find(e => /exclude this value/i.test(e.textContent || '')
                    && e.getBoundingClientRect().height < 80);
            if (!it) return null;
            it.setAttribute('data-tut-excl', '1');
            const r = it.getBoundingClientRect();
            return { x: r.left, y: r.top };
        });
        if (!menu) problems.push('point menu with Exclude not found');
        else await annotate(page, [
            { sel: '[data-tut-excl]', kind: 'ring', pad: 4 },
        ]);
        await shot(page, 'dat-exclude.png',
            await clipAround(page, '#psroot svg[data-role="gb2-chart-svg"]', null,
                { left: 10, right: 10, top: 10, bottom: 10 }));
        await annotate(page, []);
        // click Exclude, shoot the ghost
        await page.evaluate(() => {
            const it = document.querySelector('[data-tut-excl]');
            if (it) it.click();
        });
        await page.waitForFunction(() => {
            const s = document.querySelector('#psroot svg[data-role="gb2-chart-svg"]');
            return s && s.querySelectorAll('[data-role="data-point-hidden"]').length > 0;
        }, null, { timeout: 10000 })
            .catch(() => problems.push('excluded ghost marker never drew'));
        await page.waitForTimeout(900);
        await page.evaluate(() => {
            const g = document.querySelector('[data-role="data-point-hidden"]');
            if (g) g.setAttribute('data-tut-ghost', '1');
        });
        await annotate(page, [
            { sel: '[data-tut-ghost]', kind: 'ring', pad: 8 },
        ]);
        await shot(page, 'dat-ghost.png',
            await clipAround(page, '#psroot svg[data-role="gb2-chart-svg"]', null,
                { left: 10, right: 10, top: 10, bottom: 10 }));
        await annotate(page, []);
    }

    // --- dat-filter: rows dimmed by a filter, Filter button ringed
    await page.evaluate(() => {
        window.PS_SHELL.setWorkspace('data');
    });
    await page.waitForTimeout(900);
    await page.evaluate(() => {
        window.PS_SHELL.setFilters([{ col: 'site', op: 'eq', value: 'East' }]);
    });
    await page.waitForTimeout(1200);
    await annotate(page, [
        { sel: '#ps-data-filter-btn', kind: 'ring', pad: 4 },
    ]);
    await shot(page, 'dat-filter.png', { x: 0, y: 76, width: 1280, height: 560 });
    await ctx.close();
}

// ================================================== workshop pages
if (want('workshop')) {
    // The whole workshop runs on the Student wellbeing survey example
    // (163 students; study_method x exam_score is the compare-groups
    // pair). Four standalone shots: the type check, the first chart,
    // the recreate-me target, and the statistics panel.
    const { ctx, page } = await session({ welcome: true });
    await page.waitForSelector('#ps-welcome', { timeout: 10000 });
    await page.click('[data-example="wellbeing"]');
    await page.waitForTimeout(1800);

    // --- ws-type: the exam_score variable in the Data inspector
    await page.evaluate(() => {
        window.PS_SHELL.setWorkspace('data');
        window.PS_SHELL.selectVariable('exam_score');
    });
    await page.waitForTimeout(1200);
    const typed = await page.evaluate(() => {
        const sels = [...document.querySelectorAll('select')]
            .filter(e => e.offsetParent !== null
                && [...e.options].some(o => /continuous/i.test(o.textContent || '')));
        if (!sels[0]) return null;
        sels[0].setAttribute('data-tut-type', '1');
        return true;
    });
    if (!typed) problems.push('wellbeing type select not found in inspector');
    else await annotate(page, [
        { sel: 'select[data-tut-type]', kind: 'ring', pad: 5 },
        { sel: 'select[data-tut-type]', kind: 'cursor' },
    ]);
    await shot(page, 'ws-type.png', { x: 0, y: 76, width: 1280, height: 560 });
    await annotate(page, []);

    // --- ws-hmc: the Help me choose wizard reading the pair (task 2).
    // Real flow: + beside the chart tabs -> Help me choose -> Use my
    // variables -> pick the two columns -> shoot the recommendation.
    await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
    await page.waitForTimeout(800);
    await page.evaluate(() => document.querySelector('button.ps-tab-add').click());
    await page.waitForTimeout(800);
    const hmcStep = async (fnBody) => {
        const ok = await page.evaluate(fnBody);
        if (!ok) problems.push('ws-hmc step failed: ' + fnBody.slice(0, 60));
        await page.waitForTimeout(650);
    };
    await hmcStep(`(() => {
        const els = [...document.querySelectorAll('*')].filter(e =>
            e.offsetParent && (e.textContent || '').trim() === 'Help me choose');
        const el = els[els.length - 1];
        if (!el) return false;
        (el.closest('[role="button"], button') || el.parentElement).click();
        return true;
    })()`);
    await hmcStep(`(() => {
        const b = [...document.querySelectorAll('button')].find(e =>
            e.offsetParent && (e.textContent || '').trim() === 'Use my variables');
        if (!b) return false; b.click(); return true;
    })()`);
    for (const vn of ['study_method', 'exam_score']) {
        await hmcStep(`(() => {
            const b = [...document.querySelectorAll('button')].find(e =>
                e.offsetParent && (e.textContent || '').trim().startsWith('${vn}')
                && !/Added/.test(e.textContent || ''));
            if (!b) return false; b.click(); return true;
        })()`);
    }
    await page.waitForFunction(() => {
        const t = document.body.textContent || '';
        return /Recommended analysis/.test(t) && /2 selected variables/.test(t);
    }, null, { timeout: 10000 })
        .catch(() => problems.push('wizard recommendation never appeared'));
    await page.waitForTimeout(800);
    const hmcClip = await page.evaluate(() => {
        let el = [...document.querySelectorAll('*')].filter(e =>
            e.offsetParent && e.childElementCount === 0
            && (e.textContent || '').trim() === 'Help me choose')
            .sort((a, b2) => b2.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
        while (el && (el.getBoundingClientRect().width < 700
            || el.getBoundingClientRect().height < 400)) el = el.parentElement;
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.max(0, r.left - 6), y: Math.max(0, r.top - 6),
                 width: Math.min(1280, r.width + 12), height: Math.min(824, r.height + 12) };
    });
    if (!hmcClip) problems.push('ws-hmc modal bounds not found');
    else await shot(page, 'ws-hmc.png', hmcClip);
    await hmcStep(`(() => {
        const b = [...document.querySelectorAll('button')].find(e =>
            e.offsetParent && (e.textContent || '').trim() === 'Close');
        if (!b) return false; b.click(); return true;
    })()`);
    await page.waitForTimeout(600);

    // --- ws-first: the plain two-role chart
    await page.evaluate(() => {
        window.PS_SHELL.setWorkspace('chart');
        window.PS_SHELL.setRoles('plotbuilder',
            { xvar: 'study_method', yvar: 'exam_score' });
    });
    await page.waitForFunction(() => {
        const s = document.querySelector('#psroot svg[data-role="gb2-chart-svg"]');
        return s && s.getBoundingClientRect().width > 100
            && s.querySelectorAll('[data-bar-cat]').length > 2;
    }, null, { timeout: 20000 });
    await page.waitForTimeout(1000);
    await shot(page, 'ws-first.png', { x: 206, y: 76, width: 1074, height: 700 });

    // --- the recreate-me target (Torry's session set), six style edits:
    // full 0-100 exam scale, tick interval 10, best-method-first order,
    // wider gaps, per-bar default-palette colors, and the axis titles
    // written out (Exam Score / Study Method, click-to-rename). The
    // seventh difference (individual data points) is added AFTER these
    // through the + menu, which also yields the ws-addmenu hint shot.
    await page.evaluate(() => {
        const set = window.__gb2_setOption;
        const catEntry = (cat, color) => ({ original: cat, color: color,
            pattern: '', density: 1, angle: 45, thickness: 1,
            patternColor: '', opacity: -1, cornerRadius: -1,
            borderColor: '', borderWidth: -1, borderStyle: '',
            borderOpacity: -1, errorBarColor: '', errorBarThickness: -1,
            errorBarCapSize: -1, errorBarCapSizeLine: -1, pointSize: -1,
            pointShape: '', pointOutlineColor: '', pointOutlineWidth: -1 });
        set('yMaxOverride', true);
        set('yMax', 100);
        set('yIntervalOverride', true);
        set('yInterval', 10);
        set('categoryOrder', ['Spaced', 'Mixed', 'Cramming']);
        set('categoryGap', 0.35);
        // Torry's trio (Aug 25, 2nd rev): white, default-palette blue,
        // default-palette gold, in his mocked order. Every bar wears a
        // black border, without which the white bar would vanish into
        // the page (the teaching point).
        set('categoryStyles', [
            catEntry('Spaced', '#ffffff'),
            catEntry('Mixed', '#2d5c94'),
            catEntry('Cramming', '#faca59')]);
        set('barBorderColor', '#000000');
        set('barBorderWidth', 1.5);
        set('yTitleOverride', true);
        set('yTitle', 'Exam Score');
        set('xTitleOverride', true);
        set('xTitle', 'Study Method');
    });
    await page.waitForFunction(() => {
        const s = document.querySelector('#psroot svg[data-role="gb2-chart-svg"]');
        if (!s) return false;
        const ticks = [...s.querySelectorAll('text')]
            .map(t => (t.textContent || '').trim());
        if (!ticks.includes('100') || !ticks.includes('90')) return false;
        if (!ticks.includes('Exam Score') || !ticks.includes('Study Method'))
            return false;
        const bars = [...s.querySelectorAll('[data-bar-cat]')]
            .map(e => ({ cat: e.getAttribute('data-bar-cat'),
                         x: e.getBoundingClientRect().left,
                         w: e.getBoundingClientRect().width,
                         fill: (getComputedStyle(e).fill || ''),
                         stroke: (getComputedStyle(e).stroke || '') }))
            .sort((a, b) => a.x - b.x);
        const uniq = [];
        for (const b2 of bars)
            if (!uniq.some(u => u.cat === b2.cat)) uniq.push(b2);
        if (uniq.length >= 2) {
            const w = uniq[0].w, pitch = uniq[1].x - uniq[0].x;
            if (!(pitch - w > 0.30 * pitch)) return false;
        }
        return bars.length > 0
            && /Spaced/.test(bars[0].cat)
            && bars.some(b2 => /45, 92, 148/.test(b2.fill))
            && bars.some(b2 => /255, 255, 255/.test(b2.fill))
            && bars.some(b2 => /\b0, 0, 0\b/.test(b2.stroke));
    }, null, { timeout: 20000 })
        .catch(() => problems.push('workshop target styling never landed'));
    await page.waitForTimeout(1200);

    // --- ws-addmenu: the + menu open on the styled (still point-less)
    // chart -- exactly what a stuck participant sees mid-task. Clicking
    // Data points through the menu then adds difference seven.
    await clickVisible(page, 'button[title="Add to chart"]');
    await page.waitForFunction(() => {
        const m = document.querySelector('[data-role="add-ann-menu"]');
        return m && m.offsetParent !== null;
    }, null, { timeout: 8000 })
        .catch(() => problems.push('add menu never opened'));
    await page.waitForTimeout(400);
    await annotate(page, [
        { sel: 'button[title="Add to chart"]', kind: 'ring', pad: 4 },
        { sel: 'button[title="Add to chart"]', kind: 'cursor' },
    ]);
    await shot(page, 'ws-addmenu.png', { x: 206, y: 76, width: 1074, height: 620 });
    await annotate(page, []);
    const dpItem = await page.evaluate(() => {
        const m = document.querySelector('[data-role="add-ann-menu"]');
        if (!m) return null;
        const it = [...m.querySelectorAll('*')].filter(e =>
            e.offsetParent && (e.textContent || '').trim() === 'Data points');
        const t = it[it.length - 1];
        if (!t) return null;
        const r = t.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (!dpItem) problems.push('Data points menu item not found');
    else await page.mouse.click(dpItem.x, dpItem.y);
    await page.waitForFunction(() =>
        document.querySelectorAll('#psroot [data-role="data-point"]').length > 100,
        null, { timeout: 15000 })
        .catch(() => problems.push('data points never drew'));
    await page.waitForTimeout(1200);

    // --- ws-target: the finished seven-difference target, points and all
    await shot(page, 'ws-target.png',
        await clipAround(page, '#psroot svg[data-role="gb2-chart-svg"]', null,
            { left: 8, right: 8, top: 8, bottom: 8 }));

    // --- ws-stats: the Sigma panel's Omnibus tab on this chart
    await page.selectOption('#ps-chart-zoom', { label: '50%' });
    await page.waitForTimeout(900);
    await clickVisible(page, 'button[title="Statistics"]');
    await page.waitForFunction(() =>
        document.querySelectorAll('[data-st-pane]').length > 0,
        null, { timeout: 10000 })
        .catch(() => problems.push('wellbeing stats panel did not open'));
    await page.waitForTimeout(800);
    const omT = await page.evaluate(() => {
        const t = [...document.querySelectorAll('[data-st-tab]')]
            .find(e => (e.textContent || '').trim() === 'Omnibus');
        if (!t) return null;
        const r = t.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (omT) { await page.mouse.click(omT.x, omT.y); await page.waitForTimeout(900); }
    await page.evaluate(() => {
        const c = document.querySelector('#psroot [data-role="chart-card"]');
        if (c) c.scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(500);
    await annotate(page, [
        { sel: 'button[title="Statistics"]', kind: 'ring', pad: 4 },
        { sel: 'button[title="Statistics"]', kind: 'cursor' },
    ]);
    await shot(page, 'ws-stats.png',
        await clipAround(page, '#psroot [data-role="chart-card"]', null,
            { left: 14, right: 14, top: 8, bottom: 14 }));
    await annotate(page, []);
    await ctx.close();
}

await browser.close();
if (problems.length) {
    console.error('\nPROBLEMS (a step may not match its picture):');
    console.error([...new Set(problems)].join('\n'));
    process.exit(1);
}
console.log('\nall learn tutorial shots drew');
