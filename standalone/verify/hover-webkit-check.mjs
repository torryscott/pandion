// Safari hover fix (Aug 24 2026): hover brighten and drag-lift shadows
// ride SVG <defs><filter> references (_gb2HoverFx) because WebKit does
// not RENDER CSS filter functions on individual SVG elements (it
// accepts them into the cascade and getComputedStyle reports them while
// zero pixels change - the live-site probe that found this). Contracts,
// pixel-tested in BOTH engines:
//   1. hovering a bar changes rendered pixels (chromium AND webkit),
//   2. the element carries a url(#gb2-hb-*) filter attribute during
//      hover, and leave removes it and restores the pixels,
//   3. the hover defs persist in the live svg (the harvest's
//      attribute-snapshot restore depends on that), while the harvest
//      clone path is covered by hover-export-check.
// Exit 2 when the playwright webkit engine is unavailable (skip).
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
function ok(cond, msg) {
    if (!cond) throw new Error(msg);
    console.log('  ok  ' + msg);
}

const pw = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));

async function engineRun(name, engine) {
    console.log(`--- ${name} ---`);
    let browser;
    try { browser = await engine.launch(); }
    catch (e) {
        if (name === 'webkit') { console.error('webkit unavailable: ' + e.message.split('\n')[0]); process.exit(2); }
        throw e;
    }
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(pageUrl);
    await page.waitForTimeout(800);
    if (await page.locator('#ps-welcome').isVisible()) {
        await page.click('#ps-welcome-sample');
        await page.waitForTimeout(1800);
    }
    try {
        const got = page.locator('button', { hasText: 'Got it' }).first();
        if (await got.isVisible()) { await got.click(); await page.waitForTimeout(300); }
    } catch {}
    const box = await page.evaluate(() => {
        const b = document.querySelector('.graphbuilder2-host svg path[data-bar-cat]');
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: r.left + 8, y: r.top + 12, w: Math.max(8, r.width - 16),
                 h: Math.max(8, Math.min(60, r.height - 24)),
                 cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    });
    ok(!!box, 'found a bar to hover');
    const clip = { x: box.x, y: box.y, width: box.w, height: box.h };
    await page.mouse.move(20, 700);
    await page.waitForTimeout(200);
    const before = await page.screenshot({ clip });
    await page.mouse.move(box.cx, box.cy);
    await page.waitForTimeout(250);
    const during = await page.screenshot({ clip });
    const hoverState = await page.evaluate(() => {
        const b = document.querySelector('.graphbuilder2-host svg path[data-bar-cat]');
        return { attr: b.getAttribute('filter') || '',
                 defs: !!b.ownerSVGElement.querySelector('defs[data-role="gb2-hover-filters"]') };
    });
    ok(!before.equals(during), 'hover changes rendered pixels');
    ok(/^url\(#gb2-hb-/.test(hoverState.attr),
       `hover rides a defs filter reference (${hoverState.attr})`);
    ok(hoverState.defs, 'hover filter defs present in the live svg');
    await page.mouse.move(20, 700);
    await page.waitForTimeout(250);
    const after = await page.screenshot({ clip });
    const restState = await page.evaluate(() => {
        const b = document.querySelector('.graphbuilder2-host svg path[data-bar-cat]');
        return { attr: b.getAttribute('filter') || '',
                 defs: !!b.ownerSVGElement.querySelector('defs[data-role="gb2-hover-filters"]') };
    });
    ok(restState.attr === '', 'leave removes the filter attribute');
    ok(restState.defs, 'defs persist after leave (harvest snapshot-restore contract)');
    ok(before.equals(after), 'leave restores the exact pre-hover pixels');
    ok(errors.length === 0, 'no page errors (' + errors.join(' | ').slice(0, 160) + ')');
    await browser.close();
}

await engineRun('chromium', pw.chromium);
await engineRun('webkit', pw.webkit);
console.log('hover-webkit-check: ALL OK');
