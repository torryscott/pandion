// Public-site non-text-content contract.
//
// Every public marketing image is classified in markup as decorative,
// illustrative, or data-bearing. Decorative images must have empty alt text;
// illustrative images need a useful short alternative; and data-bearing
// images must additionally point to nearby substantive prose. This keeps the
// showcase useful without making linked thumbnail names or ordinary UI
// screenshots excessively verbose.
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
function ok(condition, message, detail = '') {
    if (!condition)
        throw new Error(message + (detail ? ': ' + detail : ''));
    console.log('  ok  ' + message);
}

const { chromium } = loadPlaywright();
const root = path.resolve(new URL('.', import.meta.url).pathname, '..');
const fileUrl = relative => 'file://' + path.join(root, relative);
const publicPages = [
    ['Home', 'website/index.html'],
    ['Gallery', 'website/gallery.html'],
    ['Downloads', 'website/download.html'],
    ['About', 'website/about.html'],
    ['Support', 'website/support.html'],
    ['Accessibility', 'website/accessibility.html'],
    ['Not found', 'website/404.html'],
];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(String(error)));

let imageCount = 0;
let dataCount = 0;
for (const [label, relative] of publicPages) {
    await page.goto(fileUrl(relative));
    const result = await page.evaluate(() => {
        const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
        const failures = [];
        const images = Array.from(document.images);
        let dataBearing = 0;
        for (const image of images) {
            const kind = image.dataset.imageKind || '';
            const source = image.getAttribute('src') || '(inline)';
            if (!['decorative', 'illustrative', 'data-bearing'].includes(kind)) {
                failures.push(source + ' has no valid data-image-kind');
                continue;
            }
            const alt = normalize(image.getAttribute('alt'));
            if (kind === 'decorative') {
                if (alt) failures.push(source + ' is decorative but has nonempty alt');
                continue;
            }
            if (!alt)
                failures.push(source + ' is ' + kind + ' but has no text alternative');
            if (kind !== 'data-bearing') continue;
            dataBearing++;
            const ids = normalize(image.getAttribute('aria-describedby'))
                .split(' ').filter(Boolean);
            if (!ids.length) {
                failures.push(source + ' has no linked substantive description');
                continue;
            }
            const description = normalize(ids.map(id => {
                const node = document.getElementById(id);
                return node ? node.textContent : '';
            }).join(' '));
            if (description.length < 100)
                failures.push(source + ' description is missing or too short');
            const caption = image.closest('figure')?.querySelector('figcaption');
            if (caption && normalize(caption.textContent) === alt)
                failures.push(source + ' repeats identical alt and caption text');
        }
        return { images: images.length, dataBearing, failures };
    });
    ok(result.failures.length === 0,
       label + ' image alternatives are classified and complete',
       result.failures.join(' | '));
    imageCount += result.images;
    dataCount += result.dataBearing;
}

ok(imageCount > 0, 'the audit examined public images');
ok(dataCount === 8,
   'all eight gallery charts expose substantive linked descriptions',
   String(dataCount));
ok(pageErrors.length === 0, 'the image-alternative matrix has no page errors',
   pageErrors.join(' | '));
await browser.close();
console.log('IMAGE ALTERNATIVES CHECK: PASS (' + imageCount +
    ' images; ' + dataCount + ' data-bearing charts)');
