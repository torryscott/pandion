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
import { readFileSync, readdirSync } from 'node:fs';
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

// Mechanism: every image on every source page reserves its box before it
// loads (the home page first, Sep 12 2026; every other page Sep 16 2026,
// 121 images, so any fragment link into any page lands where it points).
// Generated copies (app/, docs/, pandion-plots.html) are built from
// sources checked elsewhere.
const pages = readdirSync(websiteDir).filter(f => /\.html$/.test(f) && f !== 'pandion-plots.html').sort();
let unsizedTotal = 0, imgTotal = 0;
for (const f of pages) {
    const html = readFileSync(path.join(websiteDir, f), 'utf8');
    const imgs = html.match(/<img\b[^>]*>/gs) || [];
    const unsized = imgs.filter(t => !(/\bwidth="\d+"/.test(t) && /\bheight="\d+"/.test(t)))
        .map(t => (t.match(/src="([^"]+)"/) || [])[1] || '?');
    imgTotal += imgs.length; unsizedTotal += unsized.length;
    if (unsized.length) console.log('  unsized on ' + f + ': ' + unsized.join(', '));
}
ok(imgTotal > 0 && unsizedTotal === 0,
   'every image on every page carries width and height attributes (' + imgTotal + ' images on ' + pages.length + ' pages' + (unsizedTotal ? ', ' + unsizedTotal + ' unsized' : '') + ')');

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

// Outcome, every page: the attributes must not distort a picture (a CSS
// width with no height turns an attribute height into a fixed pixel
// height), and every fragment target reachable from the site's own links
// lands at the scroll padding, exactly as the Downloads tab does.
const targets = new Map();   // page -> Set of ids
for (const f of pages) {
    const html = readFileSync(path.join(websiteDir, f), 'utf8');
    for (const m of html.matchAll(/href="(?:([\w.-]+\.html))?#([\w.-]+)"/g)) {
        const pg = m[1] || f, id = m[2];
        if (!pages.includes(pg)) continue;
        if (!targets.has(pg)) targets.set(pg, new Set());
        targets.get(pg).add(id);
    }
}
const shapePage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
let distorted = 0, checkedImgs = 0;
for (const f of pages) {
    await shapePage.goto(url(f));
    await shapePage.waitForLoadState('networkidle');
    const bad = await shapePage.evaluate(() => Array.from(document.images)
        .filter(im => im.naturalWidth > 0 && im.clientWidth > 0 && im.clientHeight > 0 && getComputedStyle(im).objectFit === 'fill')
        .map(im => ({ src: im.getAttribute('src'), nat: im.naturalWidth / im.naturalHeight, box: im.clientWidth / im.clientHeight }))
        .filter(x => Math.abs(x.nat - x.box) / x.nat > 0.03));
    checkedImgs += await shapePage.evaluate(() => document.images.length);
    if (bad.length) { distorted += bad.length; console.log('  distorted on ' + f + ': ' + bad.map(b => b.src + ' (' + b.nat.toFixed(2) + ' vs ' + b.box.toFixed(2) + ')').join(', ')); }
}
await shapePage.close();
ok(distorted === 0, 'no image is distorted by its size attributes (' + checkedImgs + ' rendered images checked)');

let landings = 0, misses = [];
const landPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
for (const [pg, ids] of targets) {
    for (const id of ids) {
        await landPage.goto(url(pg) + '#' + id);
        await landPage.waitForLoadState('networkidle');
        await landPage.waitForTimeout(1500);   // smooth scroll + late image decode
        const r = await landPage.evaluate(id => {
            const t = document.getElementById(id) || document.querySelector('[name="' + id + '"]');
            if (!t) return { missing: true };
            const de = document.documentElement;
            const pad = parseFloat(getComputedStyle(de).scrollPaddingTop) || 0;
            const box = t.getBoundingClientRect();
            const docTop = box.top + de.scrollTop;
            // Only a target the page can actually bring to the padding line
            // is judged: not a hidden tab section (zero box), not one that
            // starts above the line (the skip link's main, at the top), and
            // not one so near the bottom that the page runs out of scroll.
            const hidden = !t.offsetParent && getComputedStyle(t).position !== 'fixed';
            const reachable = !hidden && docTop >= pad && (de.scrollHeight - docTop) >= (de.clientHeight - pad);
            return { pad, top: box.top, reachable };
        }, id);
        if (r.missing) continue;
        if (!r.reachable) continue;
        landings++;
        if (Math.abs(r.top - r.pad) > 8) misses.push(pg + '#' + id + ' (' + Math.round(r.top - r.pad) + 'px off)');
    }
}
await landPage.close();
ok(landings > 0 && misses.length === 0, 'every linked fragment target lands at the scroll padding (' + landings + ' targets on ' + targets.size + ' pages' + (misses.length ? '; off: ' + misses.join(', ') : '') + ')');

await browser.close();
console.log(fails ? 'WEBSITE ANCHOR LANDING: ' + fails + ' FAILED' : 'WEBSITE ANCHOR LANDING: PASS');
process.exit(fails ? 1 : 0);
