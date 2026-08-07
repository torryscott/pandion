// Finding a page, naming it, moving it, and getting it back.
//
// Four defects, one surface. (1) Forty pages were forty screens of
// scrolling: the rail listed sections and stopped, so nothing in the app
// was a list of pages. (2) Every page kept from one chart tab carried the
// same derived name, so a list would have read the same line over and
// over. (3) A page kept into the wrong section could not be moved at all -
// the only remedy threw away the note and the kept time. (4) Delete-undo
// resolved the section at UNDO time, so deleting, switching section, then
// undoing put the page in a section the user never chose.
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

const menu = () => page.evaluate(() =>
    [...document.querySelectorAll('#ps-contextmenu [role="menuitem"], ' +
        '#ps-contextmenu button')].map(n => (n.textContent || '').trim()));
const clickMenu = (m) => page.evaluate((s) => {
    const list = [...document.querySelectorAll(
        '#ps-contextmenu [role="menuitem"], #ps-contextmenu button')];
    const hit = list.find(n => n.textContent.trim() === s) ||
        list.find(n => new RegExp(s, 'i').test(n.textContent));
    hit.click();
}, m);
async function chartOrigin() {
    return page.evaluate(() => {
        const h = document.querySelector('.graphbuilder2-host');
        let best = null, a = 0;
        for (const s of h.querySelectorAll('svg')) {
            const r = s.getBoundingClientRect();
            if (r.width * r.height > a) { a = r.width * r.height; best = r; }
        }
        return { x: best.x, y: best.y };
    });
}
async function keepAs(graphType, section) {
    await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
    await page.waitForTimeout(300);
    await page.evaluate((g) => window.setOption('graphType', g), graphType);
    await page.waitForTimeout(1500);
    const o = await chartOrigin();
    await page.mouse.click(o.x + 40, o.y + 20, { button: 'right' });
    await page.waitForTimeout(250);
    await clickMenu('Keep to Notebook');
    await page.waitForTimeout(300);
    await clickMenu(section);
    await page.waitForTimeout(850);
}
// The page card's own right-click, aimed with a real pointer.
async function pageMenuAt(nth) {
    const box = await page.evaluate((n) => {
        const p = [...document.querySelectorAll('.ps-pinpage')][n];
        p.scrollIntoView({ block: 'center' });
        const r = p.getBoundingClientRect();
        return { x: r.x + 60, y: r.y + 26 };
    }, nth);
    await page.waitForTimeout(200);
    await page.mouse.click(box.x, box.y, { button: 'right' });
    await page.waitForTimeout(300);
    return box;
}

console.log('case 1: the rail lists the pages of the section you are in');
await keepAs('bar', 'Section 1');
await keepAs('box', 'Section 1');
await keepAs('violin', 'Section 1');
await page.evaluate(() => window.PS_SHELL.setWorkspace('pinboard'));
await page.waitForTimeout(700);
const rows = await page.evaluate(() =>
    [...document.querySelectorAll('[data-project-pin-id]')]
        .map(r => r.querySelector('.ps-pinrow-name').textContent));
ok(rows.length === 3, 'three kept pages, three rows in the rail');
ok(new Set(rows).size === 3,
   'and each row names its own page rather than repeating the analysis ' +
   '(' + rows.join(' | ') + ')');
ok(rows[0].indexOf('Bar') === 0 && rows[1].indexOf('Box') === 0,
   'the derived name leads with what kind of chart it was');

console.log('case 2: a row jumps to its page');
await page.evaluate(() => {
    const s = document.getElementById('ps-pinscroll');
    s.closest('[style]') && null;
    document.querySelectorAll('[data-project-pin-id]')[2].click();
});
await page.waitForTimeout(700);
const jumped = await page.evaluate(() => {
    const pins = window.PS_SHELL.project.pinboards.flatMap(b => b.pins);
    const sel = document.querySelector('.ps-pinpage-sel');
    return { ws: window.PS_SHELL.workspace(),
             id: sel && sel.getAttribute('data-pin-id'),
             third: pins[2].id };
});
ok(jumped.ws === 'pinboard' && jumped.id === jumped.third,
   'clicking the third row selects the third page');

console.log('case 3: naming a page renames it everywhere at once');
await page.click('#ps-pininsp-name');
await page.type('#ps-pininsp-name', 'The bimodal one', { delay: 2 });
await page.waitForTimeout(400);
const named = await page.evaluate(() => ({
    stored: window.PS_SHELL.project.pinboards.flatMap(b => b.pins)[2].title,
    rail: [...document.querySelectorAll('[data-project-pin-id]')]
        .map(r => r.querySelector('.ps-pinrow-name').textContent),
    card: [...document.querySelectorAll('.ps-pinpage-num')].map(n => n.textContent),
}));
ok(named.stored === 'The bimodal one', 'the title is stored on the page');
ok(named.rail[2] === 'The bimodal one', 'the rail row takes the title');
ok(/The bimodal one/.test(named.card[2]),
   'so does the page card, which is what you are looking at');

console.log('case 4: a page can be moved to another section');
await keepAs('line', 'New section');
await page.evaluate(() => window.PS_SHELL.setWorkspace('pinboard'));
await page.waitForTimeout(600);
await page.evaluate(() => {
    [...document.querySelectorAll('.ps-tab-select')]
        .find(x => /Section 1/.test(x.textContent)).click();
});
await page.waitForTimeout(500);
const movedId = await page.evaluate(() =>
    window.PS_SHELL.project.pinboards[0].pins[2].id);
await pageMenuAt(2);
const pm = await menu();
ok(pm.some(t => /^Move to section/.test(t)),
   'the page menu offers Move to section (' + pm.join(' | ') + ')');
await clickMenu('Move to section');
await page.waitForTimeout(300);
const targets = await menu();
ok(targets.indexOf('Section 2') !== -1 && targets.indexOf('New section') !== -1,
   'listing the sections by name, then New section - the Send to layout shape');
await clickMenu('Section 2');
await page.waitForTimeout(700);
const afterMove = await page.evaluate((id) => {
    const bs = window.PS_SHELL.project.pinboards;
    const at = bs.findIndex(b => b.pins.some(p => p.id === id));
    const pin = bs[at].pins.find(p => p.id === id);
    return { at: at, active: window.PS_SHELL.project.ui.activeBoard,
             title: pin.title, note: pin.note || '', kept: !!pin.at,
             counts: bs.map(b => b.pins.length) };
}, movedId);
ok(afterMove.at === 1 && afterMove.counts[0] === 2 && afterMove.counts[1] === 2,
   'the page left Section 1 and joined Section 2');
ok(afterMove.title === 'The bimodal one' && afterMove.kept,
   'carrying its title and its kept time, which re-keeping would have lost');
ok(afterMove.active === 'b2',
   'and the Notebook follows it, so the move is something you can see');

console.log('case 5: the move is one click back');
await page.evaluate(() => {
    const items = [...document.querySelectorAll('#ps-toast .ps-toast-item')];
    items.find(i => /Moved to/.test(i.textContent)).querySelector('button').click();
});
await page.waitForTimeout(600);
const undone = await page.evaluate((id) => {
    const bs = window.PS_SHELL.project.pinboards;
    return { at: bs.findIndex(b => b.pins.some(p => p.id === id)),
             idx: bs[0].pins.findIndex(p => p.id === id) };
}, movedId);
ok(undone.at === 0 && undone.idx === 2,
   'undo returns it to its own section AND its old position');

console.log('case 6: deleting, switching section, then undoing');
const doomed = await page.evaluate(() =>
    window.PS_SHELL.project.pinboards[0].pins[0].id);
await page.evaluate(() => document.querySelector('[data-pin-delete]').click());
await page.waitForTimeout(400);
const toastSays = await page.evaluate(() =>
    [...document.querySelectorAll('#ps-toast .ps-toast-item')]
        .map(i => i.textContent).find(t => /removed/.test(t)));
ok(/Section 1/.test(toastSays),
   'the toast names the section it came out of ("' + toastSays.trim() + '")');
await page.evaluate(() => {
    [...document.querySelectorAll('.ps-tab-select')]
        .find(x => /Section 2/.test(x.textContent)).click();
});
await page.waitForTimeout(500);
await page.evaluate(() => {
    const items = [...document.querySelectorAll('#ps-toast .ps-toast-item')];
    items.find(i => /removed/.test(i.textContent)).querySelector('button').click();
});
await page.waitForTimeout(600);
const back = await page.evaluate((id) => {
    const bs = window.PS_SHELL.project.pinboards;
    return { at: bs.findIndex(b => b.pins.some(p => p.id === id)),
             idx: bs[0].pins.findIndex(p => p.id === id),
             active: window.PS_SHELL.project.ui.activeBoard };
}, doomed);
ok(back.at === 0 && back.idx === 0,
   'the page returns to the section it was deleted from, at its own ' +
   'position, not to whichever section happened to be on screen');
ok(back.active === 'b1',
   'and the Notebook goes there, so the undo is visible rather than silent');

ok(errors.length === 0, 'no page errors (' + errors.slice(0, 2).join(' | ') + ')');
console.log('notebook-pages-check: all cases passed');
await browser.close();
