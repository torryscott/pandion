// The locked corner resize follows the pointer smoothly (Sep 16 2026,
// Torry: with the aspect ratio locked, resizing "jumps back and forth
// randomly" on every graph type instead of the smooth drag it is unlocked).
//
// The corner grip's move handler picked a driving axis per event: the
// larger of |dx| and |dy| drove, and the other side followed the grab-time
// ratio. Along a diagonal drag the dominant axis flips from event to
// event, and the two formulas give different sizes whenever the drag's
// slope is not the chart's ratio, so the chart alternated between two
// sizes as fast as the pointer reported. Now the pointer's travel is
// projected onto the locked diagonal (the least-squares fit to both
// axes), which is continuous in the pointer and never flips.
//
// Case (chromium + webkit): lock the ratio, press the corner grip, drag
// along a 45-degree path with one-pixel jitter (so |dx| and |dy| trade
// places every event), and read the svg's width after every move. The
// width must never decrease during an outward drag, and must land close
// to the projected target. CONTROL (main's engine): the width zigzags,
// tens of decreases across 80 moves.
//
// Usage: node standalone/verify/aspect-lock-check.mjs

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
const pw = loadPlaywright();
const PAGE = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
let failures = 0;
function ok(cond, label) { if (cond) console.log('  ok  ' + label); else { console.log('  FAIL ' + label); failures++; } }

async function engineRun(name, type) {
    let browser;
    try { browser = await type.launch(); } catch (e) { console.log('== ' + name + ': not installed, skipped'); return; }
    console.log('== ' + name);
    const T = t => '[' + name + '] ' + t;
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(() => { try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); localStorage.setItem('psstandalone.preferences.v1', JSON.stringify({ panelDock: 'below' })); } catch (e) {} });
    await page.goto(PAGE); await page.waitForTimeout(700);
    if (await page.locator('#ps-welcome').isVisible().catch(() => false)) { await page.click('#ps-welcome-sample'); await page.waitForTimeout(1800); }
    try { const got = page.locator('button', { hasText: 'Got it' }).first(); if (await got.isVisible()) { await got.click(); await page.waitForTimeout(300); } } catch {}
    for (const gt of ['bar', 'line']) {
        await page.evaluate(async g => {
            const s = ms => new Promise(r => setTimeout(r, ms));
            PS_SHELL.setWorkspace('chart'); PS_SHELL.setModule('plotbuilder');
            PS_SHELL.setRoles('plotbuilder', { xvar: 'condition', yvar: 'score', groupVar: 'site' });
            await s(1200);
            window.setOption('graphType', g);
            window.setOption('plotWidth', 6); window.setOption('plotHeight', 3.6);   // ratio 0.6, not 1
            window.setOption('chartAspectLock', true);
            await s(2500);
        }, gt);
        const grip = await page.evaluate(() => {
            const host = document.querySelector('.graphbuilder2-host');
            const g = Array.from(host.querySelectorAll('div')).find(d => d.style.cursor === 'nwse-resize');
            if (!g) return null;
            const svg = host.querySelector('svg[data-role="gb2-chart-svg"]');
            const r = g.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: svg.getAttribute('width'), h: svg.getAttribute('height') };
        });
        ok(!!grip, T(gt + ': the corner resize grip exists'));
        if (!grip) continue;
        await page.mouse.move(grip.x, grip.y); await page.waitForTimeout(150);
        const under = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? (e.style && e.style.cursor) || e.tagName : null; }, [grip.x, grip.y]);
        ok(under === 'nwse-resize', T(gt + ': the pointer is over the corner grip (' + under + ')'));
        await page.evaluate(() => { window.__alWidths = []; const svg = document.querySelector('.graphbuilder2-host svg[data-role="gb2-chart-svg"]'); const mo = new MutationObserver(() => window.__alWidths.push(parseFloat(svg.getAttribute('width')))); mo.observe(svg, { attributes: true, attributeFilter: ['width', 'height'] }); window.__alMo = mo; });
        await page.mouse.down();
        // A diagonal with one-pixel jitter: the dominant axis trades places every event.
        for (let i = 1; i <= 80; i++) {
            const j = (i % 2) ? 1 : -1;
            await page.mouse.move(grip.x + i * 3 + j, grip.y + i * 3 - j);
        }
        await page.mouse.up();
        await page.waitForTimeout(300);
        const r = await page.evaluate(() => { window.__alMo.disconnect(); const w = window.__alWidths.filter(v => isFinite(v)); let dec = 0, maxDrop = 0; for (let i = 1; i < w.length; i++) if (w[i] < w[i - 1] - 0.01) { dec++; maxDrop = Math.max(maxDrop, w[i - 1] - w[i]); } return { n: w.length, first: w[0], last: w[w.length - 1], dec, maxDrop }; });
        ok(r.n >= 40, T(gt + ': the chart resized live through the drag (' + r.n + ' size writes)'));
        ok(r.last > r.first + 100, T(gt + ': the chart grew along the drag (' + Math.round(r.first) + ' -> ' + Math.round(r.last) + ')'));
        ok(r.dec === 0, T(gt + ': the width never stepped backwards during the outward drag (' + r.dec + ' decreases, largest ' + r.maxDrop.toFixed(1) + 'px)'));
        const ratio = await page.evaluate(() => { const svg = document.querySelector('.graphbuilder2-host svg[data-role="gb2-chart-svg"]'); return parseFloat(svg.getAttribute('height')) / parseFloat(svg.getAttribute('width')); });
        ok(Math.abs(ratio - 0.6) < 0.02, T(gt + ': the locked ratio held (' + ratio.toFixed(3) + ' for 0.6)'));
    }
    ok(errors.length === 0, T('no page errors' + (errors.length ? ' (' + errors[0] + ')' : '')));
    await page.close(); await browser.close();
}
await engineRun('chromium', pw.chromium);
await engineRun('webkit', pw.webkit);
console.log(failures ? 'aspect-lock: FAIL (' + failures + ')' : 'aspect-lock: PASS');
process.exit(failures ? 1 : 0);
