// Rendered keyboard and reflow regression for the public site and user guide.
//
// This complements verify-accessibility.mjs's source/contrast contract with
// browser behavior: skip routes, mobile disclosures, offscreen focus, guide
// search, image-dialog focus lifecycle, and 320px page reflow.
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
function ok(condition, message) {
    if (!condition) throw new Error(message);
    console.log('  ok  ' + message);
}

const { chromium } = loadPlaywright();
const root = path.resolve(new URL('.', import.meta.url).pathname, '..');
const fileUrl = relative => 'file://' + path.join(root, relative);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));

const publicPages = [
    ['Home', 'website/index.html'],
    ['Gallery', 'website/gallery.html'],
    ['Downloads', 'website/download.html'],
    ['About', 'website/about.html'],
    ['Support', 'website/support.html'],
    ['Accessibility', 'website/accessibility.html'],
];

console.log('case 1: every marketing-page skip route works at both breakpoints');
for (const [label, relative] of publicPages) {
    for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(fileUrl(relative));
        await page.waitForTimeout(80);
        await page.keyboard.press('Tab');
        const skip = await page.evaluate(() => {
            const active = document.activeElement;
            const rect = active.getBoundingClientRect();
            return {
                className: active.className,
                text: active.textContent.trim(),
                visible: rect.width > 0 && rect.height > 0 &&
                    rect.bottom > 0 && rect.top < innerHeight,
            };
        });
        ok(String(skip.className).includes('skip-link') &&
           skip.text === 'Skip to main content' && skip.visible,
           `${label} exposes its skip link first at ${width}px`);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(50);
        const destination = await page.evaluate(() => ({
            hash: location.hash,
            active: document.activeElement && document.activeElement.id,
        }));
        ok(destination.hash === '#main-content' &&
           destination.active === 'main-content',
           `${label} moves focus to its main landmark at ${width}px`);
    }
}

console.log('case 2: marketing pages reflow and the mobile menu returns focus');
for (const [label, relative] of publicPages) {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(fileUrl(relative));
    await page.waitForTimeout(80);
    const width = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        page: document.documentElement.scrollWidth,
    }));
    ok(width.page <= width.viewport + 1,
       `${label} has no page-level horizontal overflow at 320px (${width.page}/${width.viewport})`);
}
await page.goto(fileUrl('website/index.html'));
await page.click('.nav-toggle');
let menu = await page.evaluate(() => ({
    expanded: document.querySelector('.nav-toggle').getAttribute('aria-expanded'),
    visible: getComputedStyle(document.getElementById('site-nav')).display,
}));
ok(menu.expanded === 'true' && menu.visible === 'flex',
   'the marketing mobile menu exposes its open state');
await page.keyboard.press('Escape');
menu = await page.evaluate(() => ({
    expanded: document.querySelector('.nav-toggle').getAttribute('aria-expanded'),
    focused: document.activeElement === document.querySelector('.nav-toggle'),
}));
ok(menu.expanded === 'false' && menu.focused,
   'Escape closes the marketing menu and returns focus to its trigger');

console.log('case 3: the guide drawer has no offscreen focus stops');
await page.setViewportSize({ width: 720, height: 800 });
await page.goto(fileUrl('website/docs/index.html'));
await page.waitForTimeout(180);
let guide = await page.evaluate(() => ({
    inert: document.getElementById('sidebar').hasAttribute('inert'),
    hidden: document.getElementById('sidebar').getAttribute('aria-hidden'),
    expanded: document.getElementById('hamb').getAttribute('aria-expanded'),
    overflow: document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
}));
ok(guide.inert && guide.hidden === 'true' && guide.expanded === 'false',
   'the closed 720px guide drawer is inert and hidden from accessibility APIs');
ok(guide.overflow <= 1, 'the guide has no page overflow at 720px');

await page.keyboard.press('Tab');
ok(await page.evaluate(() => document.activeElement.classList.contains('skip-link')),
   'the guide skip link is the first focus stop');
await page.keyboard.press('Enter');
await page.waitForTimeout(50);
ok(await page.evaluate(() =>
    location.hash === '#content' && document.activeElement.id === 'content'),
   'the guide skip route moves focus to the guide content');

await page.focus('#hamb');
for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    ok(!await page.evaluate(() => !!document.activeElement.closest('#sidebar')),
       `closed drawer stays out of the Tab order (${i + 1}/10)`);
}
await page.click('#hamb');
guide = await page.evaluate(() => ({
    open: document.getElementById('sidebar').classList.contains('open'),
    inert: document.getElementById('sidebar').hasAttribute('inert'),
    hidden: document.getElementById('sidebar').hasAttribute('aria-hidden'),
    expanded: document.getElementById('hamb').getAttribute('aria-expanded'),
    focused: document.activeElement && document.activeElement.id,
}));
ok(guide.open && !guide.inert && !guide.hidden &&
   guide.expanded === 'true' && guide.focused === 'navsearch',
   'opening the guide drawer restores it and moves focus to search');
await page.keyboard.press('Escape');
guide = await page.evaluate(() => ({
    open: document.getElementById('sidebar').classList.contains('open'),
    inert: document.getElementById('sidebar').hasAttribute('inert'),
    hidden: document.getElementById('sidebar').getAttribute('aria-hidden'),
    expanded: document.getElementById('hamb').getAttribute('aria-expanded'),
    focused: document.activeElement && document.activeElement.id,
}));
ok(!guide.open && guide.inert && guide.hidden === 'true' &&
   guide.expanded === 'false' && guide.focused === 'hamb',
   'Escape closes the guide drawer and restores its trigger');

await page.setViewportSize({ width: 1100, height: 800 });
await page.waitForTimeout(100);
guide = await page.evaluate(() => ({
    inert: document.getElementById('sidebar').hasAttribute('inert'),
    hidden: document.getElementById('sidebar').hasAttribute('aria-hidden'),
    hamburger: getComputedStyle(document.getElementById('hamb')).display,
    sidebar: getComputedStyle(document.getElementById('sidebar')).display,
}));
ok(!guide.inert && !guide.hidden && guide.hamburger === 'none' &&
   guide.sidebar !== 'none',
   'widening restores the ordinary guide navigation');

console.log('case 4: guide search announces state and has a keyboard exit');
await page.setViewportSize({ width: 720, height: 800 });
await page.click('#hamb');
await page.fill('#navsearch', 'chart');
await page.waitForTimeout(80);
let search = await page.evaluate(() => ({
    controls: document.getElementById('navsearch').getAttribute('aria-controls'),
    visible: getComputedStyle(document.getElementById('searchhits')).display,
    status: document.getElementById('search-status').textContent,
    count: document.querySelectorAll('#searchhits a').length,
}));
ok(search.controls === 'searchhits' && search.visible === 'block' &&
   search.count > 0 &&
   /guide results? available/.test(search.status),
   `guide search exposes and announces ${search.count} results`);
await page.keyboard.press('ArrowDown');
ok(await page.evaluate(() => !!document.activeElement.closest('#searchhits')),
   'Arrow Down moves from guide search into the results');
await page.keyboard.press('Escape');
search = await page.evaluate(() => ({
    visible: getComputedStyle(document.getElementById('searchhits')).display,
    value: document.getElementById('navsearch').value,
    status: document.getElementById('search-status').textContent,
    focused: document.activeElement && document.activeElement.id,
}));
ok(search.visible === 'none' && search.value === '' &&
   search.status === 'Search results closed.' && search.focused === 'navsearch',
   'Escape clears guide results, restores ARIA state, and returns focus to search');
await page.fill('#navsearch', 'zzzz-no-result');
await page.waitForTimeout(50);
search = await page.evaluate(() => ({
    status: document.getElementById('search-status').textContent,
    empty: document.querySelector('#searchhits .search-empty')?.textContent,
}));
ok(/^No guide sections match/.test(search.status) &&
   search.empty === 'No matches',
   'guide search publishes a no-match status without moving focus');
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');

console.log('case 5: native screenshot buttons drive a complete modal lifecycle');
const imageButtons = await page.locator('.enlarge-button').count();
ok(imageButtons > 0, `the guide created ${imageButtons} native enlarge controls`);
const firstImage = page.locator('.enlarge-button').first();
await firstImage.scrollIntoViewIfNeeded();
await firstImage.focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(80);
let lightbox = await page.evaluate(() => ({
    open: document.getElementById('lightbox').classList.contains('open'),
    focused: document.activeElement && document.activeElement.id,
    mainInert: document.getElementById('content').hasAttribute('inert'),
    mainHidden: document.getElementById('content').getAttribute('aria-hidden'),
    alt: document.querySelector('#lightbox img').alt,
}));
ok(lightbox.open && lightbox.focused === 'lightbox-close' &&
   lightbox.mainInert && lightbox.mainHidden === 'true' && lightbox.alt,
   'Enter opens the labelled image dialog, preserves alt text, and isolates the guide');
await page.keyboard.press('Tab');
ok(await page.evaluate(() => document.activeElement.id) === 'lightbox-close',
   'Tab remains contained on the image dialog’s only control');
await page.keyboard.press('Escape');
await page.waitForTimeout(50);
lightbox = await page.evaluate(() => ({
    open: document.getElementById('lightbox').classList.contains('open'),
    opener: document.activeElement &&
        document.activeElement.classList.contains('enlarge-button'),
    mainInert: document.getElementById('content').hasAttribute('inert'),
    mainHidden: document.getElementById('content').hasAttribute('aria-hidden'),
}));
ok(!lightbox.open && lightbox.opener && !lightbox.mainInert &&
   !lightbox.mainHidden,
   'Escape closes the image dialog, releases the guide, and restores its opener');
await page.keyboard.press('Space');
await page.waitForTimeout(50);
ok(await page.evaluate(() =>
    document.getElementById('lightbox').classList.contains('open') &&
    document.activeElement.id === 'lightbox-close'),
   'Space activates the same native image control');
await page.click('#lightbox-close');

console.log('case 6: the guide reflows at 320px, including WCAG text spacing');
await page.setViewportSize({ width: 320, height: 800 });
await page.goto(fileUrl('website/docs/index.html'));
await page.waitForTimeout(100);
await page.keyboard.press('Tab');
ok(await page.evaluate(() => document.activeElement.classList.contains('skip-link')),
   'the guide skip link remains first at 320px');
for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    ok(!await page.evaluate(() => !!document.activeElement.closest('#sidebar')),
       `the 320px closed drawer stays out of the Tab order (${i + 1}/10)`);
}
let reflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
    sidebarInert: document.getElementById('sidebar').hasAttribute('inert'),
}));
ok(reflow.page <= reflow.viewport + 1 && reflow.sidebarInert,
   `the ordinary 320px guide stays within the viewport (${reflow.page}/${reflow.viewport})`);
await page.addStyleTag({ content: `
    * { line-height: 1.5 !important; letter-spacing: .12em !important;
        word-spacing: .16em !important; }
    p { margin-bottom: 2em !important; }
  ` });
await page.waitForTimeout(100);
reflow = await page.evaluate(() => {
  const textOverhang = [];
  const walker = document.createTreeWalker(
      document.getElementById('content'), NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
      if (!walker.currentNode.textContent.trim() ||
          walker.currentNode.parentElement.closest('.tablewrap')) continue;
      const range = document.createRange();
      range.selectNodeContents(walker.currentNode);
      for (const rect of range.getClientRects()) {
          if (rect.right > document.documentElement.clientWidth + 1) {
              textOverhang.push(
                  walker.currentNode.parentElement.tagName + ':' +
                  walker.currentNode.textContent.trim().slice(0, 45) + ':' +
                  Math.round(rect.left) + '..' + Math.round(rect.right));
              break;
          }
      }
      if (textOverhang.length >= 8) break;
  }
  return ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
    clipped: Array.from(document.querySelectorAll(
        'button, a, p, h1, h2, h3, h4, figcaption, summary'))
      .filter(node => {
          const style = getComputedStyle(node);
          return style.overflow !== 'visible' &&
              (node.scrollWidth > node.clientWidth + 1 ||
               node.scrollHeight > node.clientHeight + 1);
      }).map(node => node.id || node.className || node.tagName).slice(0, 8),
    overhang: Array.from(document.querySelectorAll('body *'))
      .filter(node => {
          const rect = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          return style.display !== 'none' && rect.width > 0 &&
              (rect.right > document.documentElement.clientWidth + 1 ||
               rect.left < -1) &&
              !node.closest('.tablewrap, #sidebar');
      }).map(node => {
          const rect = node.getBoundingClientRect();
          return (node.id || node.className || node.tagName) + ':' +
              Math.round(rect.left) + '..' + Math.round(rect.right);
      }).slice(0, 10),
    wideContent: Array.from(document.querySelectorAll('body *'))
      .filter(node => node.scrollWidth > node.clientWidth + 1 &&
          !node.closest('.tablewrap, #sidebar'))
      .map(node => (node.id || node.className || node.tagName) + ':' +
          node.clientWidth + '/' + node.scrollWidth).slice(0, 10),
    textOverhang,
  });
});
ok(reflow.page <= reflow.viewport + 1 && reflow.clipped.length === 0,
   `the 320px guide tolerates WCAG text spacing without page overflow or clipped text ` +
   `(${reflow.page}/${reflow.viewport}; clipped: ` +
   `${reflow.clipped.join(', ') || 'none'}; overhang: ` +
   `${reflow.overhang.join(', ') || 'none'}; wide: ` +
   `${reflow.wideContent.join(', ') || 'none'}; text: ` +
   `${reflow.textOverhang.join(', ') || 'none'})`);

ok(errors.length === 0,
   `the rendered website/guide matrix produced no page errors (${errors.join(' | ') || 'none'})`);
await browser.close();
console.log('\nWEBSITE INTERACTION ACCESSIBILITY: PASS');
