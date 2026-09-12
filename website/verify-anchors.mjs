// Fragment navigation must land where the link points. The Downloads tab on
// every page links to index.html#downloads, and the browser performs that
// scroll as soon as the document parses, BEFORE the screenshots above the
// section have loaded. An image with no width/height attributes occupies no
// height until its bytes arrive, so the scroll target is computed against a
// page ~2000px shorter than the final one; when the images land, everything
// above the section grows and the viewport is left well above it (Torry's
// report: "quite a bit above where it should be"). The fix is to give every
// content image its intrinsic width and height so the layout is stable from
// the first parse. This check asserts both the mechanism (every img on the
// home page carries width and height) and the outcome (the section sits at
// the html scroll-padding after a full load, for a direct hash load and for
// the cross-page tab click).
import { createRequire } from 'node:module';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
function loadPlaywright() {
    for (const base of [process.env.GB2_NODE_BASE, process.cwd(), '/private/tmp', '/tmp'].filter(Boolean)) {
        try { return createRequire(path.join(base, 'x.js'))('playwright'); } catch { /* next */ }
    }
    console.error('playwright not found'); process.exit(2);
}
const { chromium } = loadPlaywright();
const websiteDir = path.dirname(fileURLToPath(import.meta.url));
const url = f => 'file://' + path.join(websiteDir, f);
let fails = 0; const ok = (c, m) => { console.log((c ? '  ok  ' : ' FAIL ') + m); if (!c) fails++; };

// Mechanism: every image on the home page reserves its box before it loads.
const html = readFileSync(path.join(websiteDir, 'index.html'), 'utf8');
const imgs = html.match(/<img\b[^>]*>/gs) || [];
const unsized = imgs.filter(t => !(/\bwidth="\d+"/.test(t) && /\bheight="\d+"/.test(t)))
    .map(t => (t.match(/src="([^"]+)"/) || [])[1] || '?');
ok(imgs.length > 0 && unsized.length === 0,
   'every image on index.html carries width and height attributes' + (unsized.length ? ' (missing: ' + unsized.join(', ') + ')' : ' (' + imgs.length + ' images)'));

// Outcome: the section lands at the scroll padding once everything has loaded.
const browser = await chromium.launch();
async function landing(label, go) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await go(page);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);   // smooth scroll + late image decode
    const r = await page.evaluate(() => {
        const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
        const top = document.querySelector('#downloads').getBoundingClientRect().top;
        return { pad, top, header: document.querySelector('header').getBoundingClientRect().height };
    });
    const off = Math.round(r.top - r.pad);
    ok(Math.abs(off) <= 8 && errors.length === 0,
       label + ': #downloads sits at the scroll padding after a full load (section top ' + Math.round(r.top) + 'px, padding ' + r.pad + 'px, header ' + Math.round(r.header) + 'px)');
    await page.close();
}
await landing('direct hash load', p => p.goto(url('index.html') + '#downloads'));
await landing('Downloads tab from another page', async p => {
    await p.goto(url('about.html'));
    await p.locator('nav a', { hasText: 'Downloads' }).first().click();
    await p.waitForLoadState('load');
});
await browser.close();
console.log(fails ? 'WEBSITE ANCHOR LANDING: ' + fails + ' FAILED' : 'WEBSITE ANCHOR LANDING: PASS');
process.exit(fails ? 1 : 0);
