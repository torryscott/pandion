// Cmd/Ctrl+F must find the thing you are looking at.
//
// THE BUG. The key called gridMenuFind() unconditionally, and that
// function hops to the Data workspace itself - its own comment said "safe
// app-wide" for that reason. So pressing Find while working on a chart
// threw the chart off screen and opened the data grid's find box.
// Meanwhile the ENGINE advertises the same chord for its own "Find a
// setting", both on its toolbar button and in its keyboard-shortcuts
// sheet, and typing "color blind" there returns the Vision check. The one
// advertised keyboard route to a chart control never reached it.
//
// Resolved by workspace now, the undoScope precedent: the key, the Edit
// menu row and the command all go through findScope(), so the row can
// never name one thing while the key does another.
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
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(Number(process.env.PS_BOOT || 1300));
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1900);

// What the key did is read off the focused control, which is the whole
// point of the feature: Find puts your cursor in a search box.
const landed = () => page.evaluate(() => {
    const a = document.activeElement;
    return { ws: window.PS_SHELL.workspace(),
             field: (a && (a.placeholder || a.getAttribute('aria-label') ||
                           a.id)) || '(body)' };
});
const menuFindRow = async (which) => {
    await page.click('[data-ps-menu="edit"]');
    await page.waitForTimeout(400);
    const rows = await page.evaluate(() => Array.from(
        document.querySelectorAll('#ps-appmenu button'))
        .map(x => x.textContent.trim()).filter(t => /Find/.test(t)));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    return rows.join(' | ');
};

console.log('case 1: in Charts it finds a chart setting');
await page.keyboard.press('Meta+f');
await page.waitForTimeout(900);
const inChart = await landed();
ok(inChart.ws === 'chart',
   'the key did not throw the chart away to reach the data grid');
ok(/setting/i.test(inChart.field),
   `the cursor is in the engine's setting search ("${inChart.field}")`);
ok(/Find a chart setting/.test(await menuFindRow()),
   'and the Edit menu row names what the key will do here');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

console.log('case 2: in Data it still finds data');
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(900);
await page.keyboard.press('Meta+f');
await page.waitForTimeout(900);
const inData = await landed();
ok(inData.ws === 'data' && /data/i.test(inData.field),
   `the cursor is in the data finder ("${inData.field}")`);
ok(/Find in data/.test(await menuFindRow()),
   'and the menu row follows, so the label and the key can never disagree');

console.log('case 3: a chart with no variables has nothing to search');
await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
await page.waitForTimeout(600);
await page.evaluate(() => window.PS_SHELL.setRoles('plotbuilder', {}));
await page.waitForTimeout(1500);
await page.keyboard.press('Meta+f');
await page.waitForTimeout(900);
const empty = await landed();
ok(/data/i.test(empty.field),
   `an empty chart falls back to the data finder rather than doing ` +
   `nothing ("${empty.field}")`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('FIND SCOPE: PASS');
await browser.close();
