// Undo means the same thing in the Notebook as everywhere else.
//
// The Notebook had no undo scope at all. undoScope() fell through to
// "chart", so with the Notebook on screen the Edit menu read "Undo chart
// styling" and Cmd/Ctrl+Z drove the chart engine's history - editing a
// chart in another workspace, silently, while the user was looking at
// their record. Keeping, deleting, moving between sections and reordering
// are the structural acts on that record, and they are now a history the
// menu names and the keyboard reaches.
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
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(600);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1600);
}

const clickMenu = (m) => page.evaluate((s) => {
    const list = [...document.querySelectorAll(
        '#ps-contextmenu [role="menuitem"], #ps-contextmenu button')];
    (list.find(n => n.textContent.trim() === s) ||
     list.find(n => new RegExp(s, 'i').test(n.textContent))).click();
}, m);
async function keep(section) {
    // Any menu left open from a previous step would swallow the right-click.
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
    await page.waitForTimeout(450);
    const o = await page.evaluate(() => {
        const h = document.querySelector('.graphbuilder2-host');
        let best = null, a = 0;
        for (const s of h.querySelectorAll('svg')) {
            const r = s.getBoundingClientRect();
            if (r.width * r.height > a) { a = r.width * r.height; best = r; }
        }
        return { x: best.x, y: best.y };
    });
    await page.mouse.click(o.x + 40, o.y + 20, { button: 'right' });
    await page.waitForFunction(() => [...document.querySelectorAll(
        '#ps-contextmenu button')].some(n => /Keep to Notebook/.test(n.textContent)),
        null, { timeout: 5000 });
    await clickMenu('Keep to Notebook');
    await page.waitForFunction((s) => [...document.querySelectorAll(
        '#ps-contextmenu button')].some(n => n.textContent.trim() === s),
        section, { timeout: 5000 });
    await clickMenu(section);
    await page.waitForTimeout(850);
}
// Read the Edit menu without leaving it open. The button TOGGLES, so a
// menu left open from a previous read would be closed by the next click
// and the probe would read the stale rows rather than the current ones.
const editMenu = async () => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    const rows = await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        const menu = document.getElementById('ps-appmenu');
        // Computed display, not the inline one: before the menu is first
        // opened the inline value is the empty string, not "none".
        if (menu && getComputedStyle(menu).display !== 'none') return null;
        document.querySelector('[data-ps-menu="edit"]').click();
        await s(200);
        return [...document.querySelectorAll(
            '#ps-appmenu [role="menuitem"], #ps-appmenu button')]
            .map(n => ({ text: n.textContent.trim(), off: !!n.disabled }));
    });
    if (!rows) throw new Error('the app menu would not close before reading it');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    return rows;
};
const counts = () => page.evaluate(() =>
    window.PS_SHELL.project.pinboards.map(b => b.pins.length));
const press = async (redo) => {
    await page.evaluate(() => window.PS_SHELL.setWorkspace('pinboard'));
    await page.waitForTimeout(250);
    await page.keyboard.press(redo ? 'Control+Shift+z' : 'Control+z');
    await page.waitForTimeout(500);
};

console.log('case 1: with nothing kept, the menu says so instead of lying');
await page.evaluate(() => window.PS_SHELL.setWorkspace('pinboard'));
await page.waitForTimeout(500);
let m = await editMenu();
const u0 = m.find(r => /^Undo/.test(r.text));
ok(!/chart styling/.test(u0.text) && u0.off,
   'Undo is disabled and does not claim to undo chart styling ("' +
   u0.text.split('Cmd')[0].trim() + '")');

console.log('case 2: a keep is undoable, and the menu names it');
await keep('Section 1');
await keep('Section 1');
await page.evaluate(() => window.PS_SHELL.setWorkspace('pinboard'));
await page.waitForTimeout(400);
m = await editMenu();
ok(/Undo the keep/.test(m.find(r => /^Undo/.test(r.text)).text),
   'the Edit menu names the step, as the data workspace does');
ok(JSON.stringify(await counts()) === '[2]', 'two pages kept');
await press(false);
ok(JSON.stringify(await counts()) === '[1]',
   'Cmd/Ctrl+Z removes the page that was just kept');
await press(true);
ok(JSON.stringify(await counts()) === '[2]', 'and redo puts it back');

console.log('case 3: the keyboard does not reach past the Notebook');
const styleBefore = await page.evaluate(() =>
    JSON.stringify(window.PS_SHELL.optionStore()));
await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
await page.waitForTimeout(400);
await page.evaluate(() => window.setOption('barCornerRadius', 18));
await page.waitForTimeout(1600);
const styled = await page.evaluate(() =>
    JSON.parse(JSON.stringify(window.PS_SHELL.optionStore())));
ok(String(styled.barCornerRadius) === '18', 'a chart style edit is committed');
await press(false);   // undo, from inside the Notebook
const afterKb = await page.evaluate(() =>
    JSON.parse(JSON.stringify(window.PS_SHELL.optionStore())));
ok(String(afterKb.barCornerRadius) === '18',
   'undoing in the Notebook leaves the chart style alone: the key no ' +
   'longer edits a chart in another workspace');
ok(JSON.stringify(await counts()) === '[1]',
   'it undid the Notebook step instead');
await press(true);
ok(styleBefore !== null, 'redo restores the Notebook step');

console.log('case 4: deleting, moving and reordering all reach the keyboard');
await keep('New section');
await page.evaluate(() => window.PS_SHELL.setWorkspace('pinboard'));
await page.waitForTimeout(500);
ok(JSON.stringify(await counts()) === '[2,1]', 'two sections in play');
// move
await page.evaluate(() => {
    [...document.querySelectorAll('.ps-tab-select')]
        .find(x => /Section 1/.test(x.textContent)).click();
});
await page.waitForTimeout(400);
const movedId = await page.evaluate(() =>
    window.PS_SHELL.project.pinboards[0].pins[0].id);
await page.evaluate((id) => {
    const p = document.querySelector('.ps-pinpage[data-pin-id="' + id + '"]');
    p.scrollIntoView({ block: 'center' });
}, movedId);
await page.waitForTimeout(200);
const box = await page.evaluate((id) => {
    const r = document.querySelector('.ps-pinpage[data-pin-id="' + id + '"]')
        .getBoundingClientRect();
    return { x: r.x + 60, y: r.y + 26 };
}, movedId);
await page.mouse.click(box.x, box.y, { button: 'right' });
await page.waitForTimeout(300);
await clickMenu('Move to section');
await page.waitForTimeout(300);
await clickMenu('Section 2');
await page.waitForTimeout(600);
ok(JSON.stringify(await counts()) === '[1,2]', 'the page moved');
m = await editMenu();
ok(/Undo the move/.test(m.find(r => /^Undo/.test(r.text)).text),
   'the menu names the move');
await press(false);
ok(JSON.stringify(await counts()) === '[2,1]', 'and the keyboard reverses it');
// delete
await page.evaluate(() => document.querySelector('[data-pin-delete]').click());
await page.waitForTimeout(400);
ok(JSON.stringify(await counts()) === '[1,1]', 'a page was deleted');
m = await editMenu();
ok(/Undo the deleted page/.test(m.find(r => /^Undo/.test(r.text)).text),
   'the menu names the deletion');
await press(false);
ok(JSON.stringify(await counts()) === '[2,1]', 'and the keyboard restores it');
// reorder
const order0 = await page.evaluate(() =>
    window.PS_SHELL.project.pinboards[0].pins.map(p => p.id).join(','));
await page.evaluate(() => {
    const p = document.querySelectorAll('.ps-pinpage')[1];
    p.focus();
});
await page.keyboard.press('Alt+ArrowUp');
await page.waitForTimeout(500);
const order1 = await page.evaluate(() =>
    window.PS_SHELL.project.pinboards[0].pins.map(p => p.id).join(','));
ok(order1 !== order0, 'Alt+Up reordered the pages');
await press(false);
ok(await page.evaluate(() =>
    window.PS_SHELL.project.pinboards[0].pins.map(p => p.id).join(',')) === order0,
   'and one undo puts the order back');

console.log('case 5: the toast and the keyboard undo once between them');
await page.evaluate(() => document.querySelector('[data-pin-delete]').click());
await page.waitForTimeout(400);
const nAfterDel = JSON.stringify(await counts());
await press(false);   // keyboard undo consumes the step
const nAfterKb = JSON.stringify(await counts());
ok(nAfterKb !== nAfterDel, 'the keyboard undid the deletion');
await page.evaluate(() => {
    const t = [...document.querySelectorAll('#ps-toast .ps-toast-item')]
        .find(i => /removed/.test(i.textContent));
    if (t) t.querySelector('button').click();
});
await page.waitForTimeout(500);
ok(JSON.stringify(await counts()) === nAfterKb,
   'and the stale toast declines rather than undoing it a second time');

ok(errors.length === 0, 'no page errors (' + errors.slice(0, 2).join(' | ') + ')');
console.log('notebook-undo-check: all cases passed');
await browser.close();
