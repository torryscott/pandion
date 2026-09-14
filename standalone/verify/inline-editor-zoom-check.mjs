// Inline text editor vs view zoom (Sep 2026, Torry's Safari report): with
// the standalone view zoom at anything but 100 percent, double-clicking a
// label opened the inline editor far from the label in Safari (left of it
// at 150, right and below it at 75, off the canvas at 50) while Chrome was
// fine. The editor measured its target through getScreenCTM, and Safari
// leaves an ancestor CSS zoom out of that matrix (memory: Safari CSS zoom
// semantics), so the label's visual centre came back divided by the zoom
// before the editor divided it by the zoom AGAIN. The fix measures the
// label's client rect instead, the same primitive every drag already
// trusts (the Sep 2 zoom-drift fix), so the matrix never enters it.
//
// Headless Chromium and WebKit both include the zoom in getScreenCTM, so
// the real bug cannot be reproduced from this machine. The probe therefore
// runs every case twice:
//   native  - the engine as the browser reports it: no regression at any
//             zoom, and the 100 percent rows pin the no-zoom shape;
//   shim    - getScreenCTM patched to Safari's shape (the scale part
//             omitted, the translation kept), which is the CONTROL: on the
//             unfixed bundle every 150 / 75 / 50 shim row fails by exactly
//             the zoom factor, on the fixed bundle every row passes because
//             the editor no longer reads the matrix at all.
// Targets: the X-axis title (unrotated) and the Y-axis title (rotated), at
// 100 / 150 / 75 / 50 percent. Each editor's visual centre must sit on the
// label's visual centre within a few logical px, and Escape must tear the
// editor down and show the label again. WebKit runs too when Playwright's
// webkit build is present (skipped otherwise, never failed).
//
// Usage: node standalone/verify/inline-editor-zoom-check.mjs

import { createRequire } from 'node:module';
import path from 'node:path';

function loadPlaywright() {
    const bases = [];
    if (process.env.GB2_NODE_BASE) bases.push(process.env.GB2_NODE_BASE);
    bases.push(process.cwd(), new URL('.', import.meta.url).pathname,
               '/private/tmp', '/tmp');
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
function ok(cond, label) {
    if (cond) console.log('  ok  ' + label);
    else { console.log('  FAIL ' + label); failures++; }
}
const fmt = n => (Math.round(n * 100) / 100).toFixed(2);
// Logical px between the editor's centre and the label's centre. The
// textarea is placed on the label's centre by construction, so at 100
// percent the two coincide to within layout rounding; the bug moves the
// box by (1/zoom - 1) times the label's distance from the wrap edge,
// which is tens to hundreds of px.
const TOL = 4;
const ZOOMS = ['1', '1.5', '0.75', '0.5'];
const TARGETS = [
    { name: 'X-axis title', text: 'condition' },
    { name: 'Y-axis title', text: 'score' }
];

// Safari's getScreenCTM under an ancestor CSS zoom: the scale reads 1.0
// while the translation is still the visual offset (Torry's on-screen
// readout, Sep 2 2026). Divide the linear part by the ancestor zoom and
// keep e/f, on every SVG element.
const SAFARI_SHIM = () => {
    const orig = SVGGraphicsElement.prototype.getScreenCTM;
    SVGGraphicsElement.prototype.getScreenCTM = function () {
        const m = orig.call(this);
        if (!m) return m;
        let z = 1;
        const root = this.ownerSVGElement || this;
        for (let p = root.parentElement; p; p = p.parentElement) {
            const v = parseFloat(p.style && p.style.zoom);
            if (v && isFinite(v) && v > 0) z *= v;
        }
        if (Math.abs(z - 1) < 0.0005) return m;
        // m.scale(k) is m times a uniform scale: the linear part divides
        // by z and the translation stays. An SVGMatrix, which is what
        // SVGPoint.matrixTransform demands in both engines.
        return m.scale(1 / z);
    };
};

async function runEngine(engineName, shim) {
    let browser;
    try { browser = await pw[engineName].launch(); }
    catch (e) {
        console.log('  skip ' + engineName + ' (not installed): ' + String(e).split('\n')[0]);
        return;
    }
    const mode = engineName + (shim ? ' + Safari-shaped getScreenCTM' : ' native');
    console.log('== ' + mode);
    const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(() => {
        try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); }
        catch (e) { /* private mode */ }
    });
    if (shim) await page.addInitScript(SAFARI_SHIM);
    await page.goto(PAGE);
    await page.waitForTimeout(700);
    if (await page.locator('#ps-welcome').isVisible().catch(() => false)) {
        await page.click('#ps-welcome-sample');
        await page.waitForTimeout(1800);
    }
    try {
        const got = page.locator('button', { hasText: 'Got it' }).first();
        if (await got.isVisible()) { await got.click(); await page.waitForTimeout(300); }
    } catch { /* no toast */ }
    await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        PS_SHELL.setWorkspace('chart');
        PS_SHELL.setModule('plotbuilder');
        PS_SHELL.setRoles('plotbuilder',
            { xvar: 'condition', yvar: 'score', groupVar: 'site' });
        await s(1500);
    });
    if (shim) {
        const a = await page.evaluate(() => {
            let svg = null, area = 0;
            for (const s of document.querySelectorAll('.graphbuilder2-host svg')) {
                const b = s.getBoundingClientRect();
                if (b.width * b.height > area) { area = b.width * b.height; svg = s; }
            }
            return svg ? svg.getScreenCTM().a : null;
        });
        ok(a !== null, 'shim sanity: chart svg found (ctm.a=' + a + ')');
    }

    const setZoom = async z => {
        await page.selectOption('#ps-chart-zoom', z);
        await page.waitForFunction(want => {
            const h = document.querySelector('.graphbuilder2-host');
            if (!h) return false;
            return Number(h.style.zoom === '' ? '1' : h.style.zoom) === Number(want);
        }, z, { timeout: 6000 });
        await page.waitForTimeout(500);
    };
    // Visual rect of the chart text whose content matches, on the chart
    // svg (the largest one: the first svg is a toolbar icon).
    const textRect = text => page.evaluate(text => {
        let svg = null, area = 0;
        for (const s of document.querySelectorAll('.graphbuilder2-host svg')) {
            const b = s.getBoundingClientRect();
            if (b.width * b.height > area) { area = b.width * b.height; svg = s; }
        }
        if (!svg) return null;
        const els = Array.from(svg.querySelectorAll('text'))
            .filter(t => (t.textContent || '').trim() === text);
        if (!els.length) return null;
        const r = els[0].getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height,
                 cx: r.left + r.width / 2, cy: r.top + r.height / 2,
                 vis: getComputedStyle(els[0]).visibility };
    }, text);
    const editorRect = () => page.evaluate(() => {
        const ed = document.querySelector('textarea[data-role="inline-text-editor"]');
        if (!ed) return null;
        const r = ed.getBoundingClientRect();
        return { cx: r.left + r.width / 2, cy: r.top + r.height / 2,
                 width: r.width, height: r.height };
    });

    for (const z of ZOOMS) {
        await setZoom(z);
        const Z = Number(z);
        for (const t of TARGETS) {
            const tag = '[' + engineName + (shim ? '/shim' : '') + ' zoom ' + z + '] ' + t.name;
            let r0 = await textRect(t.text);
            if (!r0) { ok(false, tag + ': label found'); continue; }
            // First click selects the label (its panel may scroll the pane),
            // then the double-click at the re-measured spot opens the editor.
            await page.mouse.click(r0.cx, r0.cy);
            await page.waitForTimeout(700);
            r0 = await textRect(t.text);
            await page.mouse.dblclick(r0.cx, r0.cy);
            let opened = true;
            try {
                await page.waitForSelector('textarea[data-role="inline-text-editor"]', { timeout: 3000 });
            } catch { opened = false; }
            ok(opened, tag + ': double-click opened the inline editor');
            if (!opened) continue;
            await page.waitForTimeout(120);
            const er = await editorRect();
            const lr = await textRect(t.text);
            const dx = (er.cx - lr.cx) / Z, dy = (er.cy - lr.cy) / Z;
            ok(Math.abs(dx) <= TOL && Math.abs(dy) <= TOL,
               tag + ': editor centred on the label (dx=' + fmt(dx) + ' dy=' + fmt(dy) +
               ' logical px; label at ' + fmt(lr.cx) + ',' + fmt(lr.cy) +
               ' editor at ' + fmt(er.cx) + ',' + fmt(er.cy) + ')');
            ok(lr.vis === 'hidden', tag + ': the label hides while the editor is open');
            // Escape steps out one layer at a time (the text panel docks
            // the color picker, and the document-level Escape closes that
            // first), so press until the editor is gone, three tries max.
            let gone = false, presses = 0;
            while (!gone && presses < 3) {
                await page.keyboard.press('Escape');
                presses++;
                await page.waitForTimeout(250);
                gone = await page.evaluate(
                    () => !document.querySelector('textarea[data-role="inline-text-editor"]'));
            }
            const back = await textRect(t.text);
            ok(gone && back && back.vis !== 'hidden',
               tag + ': Escape removed the editor and showed the label again (' +
               presses + ' press' + (presses === 1 ? '' : 'es') + ')');
            // Clear the selection so the next target starts from rest.
            await page.keyboard.press('Escape');
            await page.waitForTimeout(250);
        }
    }
    await setZoom('1');
    ok(errors.length === 0, mode + ': no page errors' +
       (errors.length ? ' (' + errors[0] + ')' : ''));
    await browser.close();
}

await runEngine('chromium', false);
await runEngine('chromium', true);
await runEngine('webkit', false);
await runEngine('webkit', true);

console.log(failures ? 'inline-editor-zoom: FAIL (' + failures + ')' : 'inline-editor-zoom: PASS');
process.exit(failures ? 1 : 0);
