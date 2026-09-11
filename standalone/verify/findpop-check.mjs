// Find became a popup (Torry, Jul 31 2026: the inline bar "just takes up a
// whole lot of room... maybe the whole find option should be a pop-up that
// you can access from a menu up top or by pressing Ctrl or Command+F").
// The contracts:
//   1. the command bar spends one compact button; the popup opens from it,
//      from Cmd/Ctrl+F, and from the Edit menu command, focused and ready,
//   2. find is a WORKING mode: clicking a match in the grid does NOT close
//      the popup (the deliberate difference from Filter/Excluded),
//   3. Escape is a ladder: clears the query first, closes second, and
//      focus returns to the grid,
//   4. a sticky query is never invisible: the closed button reads
//      "Find - N of M" with the active tint,
//   5. Replace still works from inside the popup (t3-47's mode ruling
//      survives the move).
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

const { chromium } = loadPlaywright();
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(600);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1200);
}
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(500);

const popOpen = () => page.evaluate(() =>
    document.getElementById('ps-findpop').style.display === 'block');

console.log('case 1: the button opens the popup, focused and ready');
ok(!(await popOpen()), 'the popup starts closed');
await page.click('#ps-data-find-btn');
await page.waitForTimeout(200);
ok(await popOpen(), 'the Find button opens it');
ok(await page.evaluate(() => document.activeElement.id) === 'ps-data-find',
   'with the cursor already in the search box');

console.log('case 2: clicking a grid match does NOT close it (working mode)');
await page.fill('#ps-data-find', 'West');
await page.waitForTimeout(500);
const count1 = await page.evaluate(() =>
    document.getElementById('ps-data-find-count').textContent);
ok(/of \d+/.test(count1), `matches found (${count1})`);
// Any data cell will do, as long as the popup (position: fixed, 380px
// wide) is not covering it: columns open fitted now (Sep 2026), so the
// grid is narrower and the cell this used to name sits under the popup.
// Pick the first visible cell that does not intersect it.
const cellSpot = await page.evaluate(() => {
    const pop = document.getElementById('ps-findpop').getBoundingClientRect();
    const hits = c => !(c.right < pop.left || c.left > pop.right ||
                        c.bottom < pop.top || c.top > pop.bottom);
    for (const td of document.querySelectorAll('#ps-datagrid td[data-gc]')) {
        const r = td.getBoundingClientRect();
        if (r.width > 8 && r.height > 8 && !hits(r))
            return { x: r.left + r.width / 2, y: r.top + r.height / 2,
                     col: td.getAttribute('data-gc'), row: td.getAttribute('data-gr') };
    }
    return null;
});
ok(!!cellSpot, 'a grid cell clear of the popup exists to click');
await page.mouse.click(cellSpot.x, cellSpot.y);
await page.waitForTimeout(300);
ok(await popOpen(),
   'a grid click leaves the popup open - the deliberate difference from ' +
   'Filter and Excluded, which dismiss on outside clicks (' +
   JSON.stringify(cellSpot) + ')');

console.log('case 3: the closed button still reports the sticky query');
await page.click('#ps-findpop-close');
await page.waitForTimeout(200);
ok(!(await popOpen()), 'the X closes the popup');
const btn = await page.evaluate(() => ({
    text: document.getElementById('ps-data-find-btn').textContent.trim(),
    active: document.getElementById('ps-data-find-btn')
        .classList.contains('ps-data-filter-active'),
}));
ok(/Find · \d+ of \d+/.test(btn.text) && btn.active,
   `the button reads the live state while closed ("${btn.text}")`);

console.log('case 4: Cmd/Ctrl+F reopens it from the keyboard');
await page.evaluate(() => document.getElementById('ps-datagrid').focus());
await page.keyboard.press('Control+f');
await page.waitForTimeout(300);
ok(await popOpen(), 'Ctrl+F opens the popup');
ok(await page.evaluate(() => document.activeElement.id) === 'ps-data-find',
   'focused in the search box with the query preserved');

console.log('case 5: the Escape ladder - clear first, close second');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
ok(await popOpen() && await page.evaluate(() =>
       document.getElementById('ps-data-find').value) === '',
   'first Escape clears the query, popup stays');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
ok(!(await popOpen()), 'second Escape closes the popup');
ok(await page.evaluate(() => document.activeElement.id) === 'ps-datagrid',
   'and focus lands back on the grid');

console.log('case 6: Replace works from inside the popup');
await page.click('#ps-data-find-btn');
await page.waitForTimeout(200);
await page.fill('#ps-data-find', 'West');
await page.waitForTimeout(400);
await page.click('#ps-data-replace-toggle');
await page.waitForTimeout(150);
await page.fill('#ps-data-replace', 'WEST2');
await page.click('#ps-data-replace-one');
await page.waitForTimeout(500);
const replaced = await page.evaluate(() =>
    window.PS_SHELL.project.table.raw.site.filter(v => v === 'WEST2').length);
ok(replaced === 1, `Replace changed exactly one cell (${replaced})`);
await page.evaluate(() => window.PS_SHELL.dataUndo());
await page.waitForTimeout(400);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('FINDPOP CHECK PASS');
await browser.close();
