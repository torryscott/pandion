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
// graphType === null means KEEP THE CHART AS IT COMES, touching nothing.
// That case matters more than the others: this helper used to poke
// setOption('graphType', ...) before every keep, which MANUFACTURED the very
// field whose absence was the defect, so the naming assertions passed against
// a state a user cannot reach. A real chart's option store is empty until the
// type is switched, and the engine writes nothing when you pick the type you
// are already on.
async function keepAs(graphType, section) {
    await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
    await page.waitForTimeout(300);
    if (graphType) {
        await page.evaluate((g) => window.setOption('graphType', g), graphType);
        await page.waitForTimeout(1500);
    }
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
// The FIRST keep touches nothing, which is how a page is normally kept.
const storeAtFirstKeep = await page.evaluate(() =>
    Object.keys(window.PS_SHELL.chart().options[window.PS_SHELL.chart().module] || {}));
await keepAs(null, 'Section 1');
await keepAs('box', 'Section 1');
await keepAs('violin', 'Section 1');
ok(storeAtFirstKeep.indexOf('graphType') === -1,
   'the first page was kept from a chart whose option store holds no ' +
   'graphType at all, which is the ordinary case (' +
   JSON.stringify(storeAtFirstKeep) + ')');
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
   'the derived name leads with what kind of chart it was, INCLUDING the ' +
   'untouched default type nothing was ever committed for');

console.log('case 1b: Scatter switches type through xyBin, not graphType');
// Scatter is structural, not an edge case: its template declares
// graphTypeOption "xyBin", so the flyout never writes graphType at all and a
// point cloud and a heatmap of the same two variables were indistinguishable
// in the page list and in the export, permanently.
await page.evaluate(() => {
    window.PS_SHELL.setWorkspace('chart');
    window.PS_SHELL.setModule('xyplotbuilder');
});
// The roles validate themselves onto the sample's two continuous columns.
await page.waitForFunction(() =>
    !!document.querySelector('.graphbuilder2-host svg'), null, { timeout: 8000 });
await page.waitForTimeout(600);
await keepAs(null, 'Section 1');                 // a plain scatter
await page.evaluate(() => window.setOption('xyBin', 'square'));
await page.waitForTimeout(1700);
await keepAs(null, 'Section 1');                 // the same data as a heatmap
await page.evaluate(() => window.PS_SHELL.setWorkspace('pinboard'));
await page.waitForTimeout(700);
const xyRows = await page.evaluate(() =>
    [...document.querySelectorAll('[data-project-pin-id]')]
        .map(r => r.querySelector('.ps-pinrow-name').textContent).slice(-2));
ok(xyRows[0] !== xyRows[1],
   'a scatter and a heatmap of the same variables get different names (' +
   xyRows.join(' | ') + ')');
ok(/Scatter/.test(xyRows[0]) && /Heatmap/.test(xyRows[1]),
   'and each is named for what it actually is');
// Put the tab back so the later cases run on the chart they expect.
await page.evaluate(() => {
    window.PS_SHELL.setWorkspace('chart');
    window.PS_SHELL.setModule('plotbuilder');
});
await page.waitForTimeout(1600);
await page.evaluate(() => window.PS_SHELL.setWorkspace('pinboard'));
await page.waitForTimeout(600);

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
    stored: window.PS_SHELL.project.pinboards.flatMap(b => b.pins)[2].pageTitle,
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
// Index-relative, not hard-coded: earlier cases add pages to this section.
const before4 = await page.evaluate(() =>
    window.PS_SHELL.project.pinboards.map(b => b.pins.length));
const movedAt = 2;
const movedId = await page.evaluate((n) =>
    window.PS_SHELL.project.pinboards[0].pins[n].id, movedAt);
await pageMenuAt(movedAt);
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
             title: pin.pageTitle, note: pin.note || '', kept: !!pin.at,
             counts: bs.map(b => b.pins.length) };
}, movedId);
ok(afterMove.at === 1 &&
   afterMove.counts[0] === before4[0] - 1 &&
   afterMove.counts[1] === before4[1] + 1,
   'the page left Section 1 and joined Section 2 (' +
   JSON.stringify(before4) + ' -> ' + JSON.stringify(afterMove.counts) + ')');
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
ok(undone.at === 0 && undone.idx === movedAt,
   'undo returns it to its own section AND its old position');

console.log('case 5b: undoing a move to a NEW section takes the section too');
const boards5 = await page.evaluate(() => window.PS_SHELL.project.pinboards.length);
await pageMenuAt(0);
await clickMenu('Move to section');
await page.waitForTimeout(300);
await clickMenu('New section');
await page.waitForTimeout(700);
ok(await page.evaluate(() => window.PS_SHELL.project.pinboards.length) === boards5 + 1,
   'the move created a section for the page');
await page.evaluate(() => {
    const items = [...document.querySelectorAll('#ps-toast .ps-toast-item')];
    items.find(i => /Moved to/.test(i.textContent)).querySelector('button').click();
});
await page.waitForTimeout(600);
ok(await page.evaluate(() => window.PS_SHELL.project.pinboards.length) === boards5,
   'and undoing takes it away again, rather than leaving an empty section ' +
   'nobody asked for');

console.log('case 5c: a drifted page can be brought up to date');
// Append-only. The current chart joins as a NEW page below the old one, both
// keeping their own dates, because refreshing in place would destroy the
// evidence the record exists to hold.
await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
await page.waitForTimeout(400);
await page.evaluate(() => window.setOption('barCornerRadius', 22));
await page.waitForTimeout(1900);
await page.evaluate(() => window.PS_SHELL.setWorkspace('pinboard'));
await page.waitForTimeout(800);
const drifted = await page.evaluate(() => {
    const b = window.PS_SHELL.project.pinboards
        .find(bb => bb.pins.some(p => p.srcChart));
    const p = b.pins.find(p => p.srcChart);
    return { id: p.id, board: b.id, n: b.pins.length };
});
await page.evaluate((id) => {
    const el = document.querySelector('.ps-pinpage[data-pin-id="' + id + '"]');
    el.scrollIntoView({ block: 'center' });
}, drifted.id);
await page.waitForTimeout(300);
const driftChip = await page.evaluate((id) => {
    const el = document.querySelector('.ps-pinpage[data-pin-id="' + id + '"]');
    const d = el && el.querySelector('.ps-pinpage-drift');
    return d ? d.textContent : null;
}, drifted.id);
ok(driftChip === 'source chart has changed',
   'the page card itself says its source has moved on, so scrolling the ' +
   'notebook shows it rather than only the rail of a selected page');
// Give it a note and a title so we can prove both come forward.
for (let i = 0; i < 3; i++) {
    const on = await page.evaluate(() =>
        document.getElementById('ps-pininsp-sel').style.display !== 'none');
    if (on) break;
    await page.evaluate((id) => {
        document.querySelector('.ps-pinpage[data-pin-id="' + id + '"]').click();
    }, drifted.id);
    await page.waitForTimeout(350);
}
await page.click('#ps-pininsp-note');
await page.type('#ps-pininsp-note', 'THE REASON THIS PAGE EXISTS', { delay: 1 });
await page.evaluate(() => document.getElementById('ps-pininsp-note').blur());
await page.waitForTimeout(400);
ok(await page.evaluate(() =>
    document.getElementById('ps-pininsp-update').style.display !== 'none'),
   'the rail offers Keep an updated copy on a drifted page');
await page.click('#ps-pininsp-update');
await page.waitForTimeout(900);
const updated = await page.evaluate((d) => {
    const b = window.PS_SHELL.project.pinboards.find(bb => bb.id === d.board);
    const at = b.pins.findIndex(p => p.id === d.id);
    const orig = b.pins[at], copy = b.pins[at + 1];
    return { n: b.pins.length, origAt: at,
             origSrc: orig.src.length, origAt_: orig.at,
             copyNote: copy && copy.note, copyAt: copy && copy.at,
             copySame: copy && copy.src === orig.src,
             copyId: copy && copy.id, selected: window.PS_SHELL.project.pinboards
                 .flatMap(x => x.pins).length };
}, drifted);
ok(updated.n === drifted.n + 1,
   'one new page, not a replacement (' + drifted.n + ' -> ' + updated.n + ')');
ok(!updated.copySame,
   'the copy holds the CURRENT chart, which differs from the original');
ok(updated.copyNote === 'THE REASON THIS PAGE EXISTS',
   'and carries the note forward, which is why the page existed');
ok(updated.copyAt > updated.origAt_,
   'both versions keep their own kept dates');
const verdicts = await page.evaluate((d) => {
    const b = window.PS_SHELL.project.pinboards.find(bb => bb.id === d.board);
    const at = b.pins.findIndex(p => p.id === d.id);
    return [...document.querySelectorAll('.ps-pinpage')]
        .filter(el => [b.pins[at].id, b.pins[at + 1].id]
            .indexOf(el.getAttribute('data-pin-id')) !== -1)
        .map(el => !!el.querySelector('.ps-pinpage-drift'));
}, drifted);
ok(verdicts[0] === true && verdicts[1] === false,
   'the original still reads as drifted and the copy reads as current');
await page.evaluate(() => {
    const items = [...document.querySelectorAll('#ps-toast .ps-toast-item')];
    items.find(i => /Updated copy/.test(i.textContent)).querySelector('button').click();
});
await page.waitForTimeout(600);
ok(await page.evaluate((d) => window.PS_SHELL.project.pinboards
       .find(bb => bb.id === d.board).pins.length, drifted) === drifted.n,
   'and it is one click back');

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

console.log('case 10: a section folds its page list, and a keep reopens it');
// Forty pages is forty rail rows, and the rail's table of contents could
// not be closed. The active section row is the disclosure, wearing the
// chart groups' exact vocabulary: chevron, aria-expanded, the count badge
// when folded, a persisted fold, and the one-shot force-open so a keep
// into a folded section can never look like nothing happened.
const foldState = () => page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-project-board-id]')];
    const listed = rows.find(r => r.querySelector('.ps-project-gchev'));
    return {
        pages: document.querySelectorAll('[data-project-pin-id]').length,
        aria: listed ? listed.getAttribute('aria-expanded') : null,
        count: listed ? ((listed.querySelector('.ps-project-gcount') || {})
            .textContent || null) : null
    };
});
await page.evaluate(() => window.PS_SHELL.setWorkspace('pinboard'));
await page.waitForTimeout(700);
const f0 = await foldState();
ok(f0.pages > 0 && f0.aria === 'true',
   'the active section lists its pages and says it is expanded (' +
   f0.pages + ' pages)');
await page.evaluate(() => {
    document.querySelector('[data-project-board-id].ps-project-active').click();
});
await page.waitForTimeout(400);
const f1 = await foldState();
ok(f1.pages === 0 && f1.aria === 'false' && f1.count === String(f0.pages),
   'clicking the row you are already reading folds the list, and the badge ' +
   'carries the hidden count (' + f1.count + ')');
await page.reload();
await page.waitForTimeout(2200);
const f2 = await foldState();
ok(f2.pages === 0 && f2.aria === 'false',
   'the fold survives a reload');
// keep a page from the chart workspace; the fold must open for it
await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
await page.waitForTimeout(1400);
const fo = await page.evaluate(() => {
    const r = document.querySelector('.graphbuilder2-host').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await page.mouse.click(fo.x, fo.y, { button: 'right' });
await page.waitForTimeout(400);
await page.evaluate(() => {
    const b = [...document.querySelectorAll('#ps-contextmenu button')]
        .find(x => /^Keep/i.test(x.textContent.trim()));
    b.click();
});
await page.waitForTimeout(400);
await page.evaluate(() => {
    const b = [...document.querySelectorAll('#ps-contextmenu button')]
        .find(x => /keep-to-/.test(x.getAttribute('data-context-action') || ''));
    if (b) b.click();
});
await page.waitForTimeout(1100);
const f3 = await foldState();
ok(f3.pages === f0.pages + 1 && f3.aria === 'true',
   'keeping a page into the folded section opens it, once, so the keep is ' +
   'visible (' + f3.pages + ' pages showing)');
await page.evaluate(() => window.PS_SHELL.setWorkspace('pinboard'));
await page.waitForTimeout(600);
await page.evaluate(() => {
    document.querySelector('[data-project-board-id].ps-project-active').click();
});
await page.waitForTimeout(400);
const f4 = await foldState();
ok(f4.pages === 0 && f4.count === String(f0.pages + 1),
   'and an explicit click wins over the force-open, re-folding at the new ' +
   'count (' + f4.count + ')');
await page.evaluate(() => {
    document.querySelector('[data-project-board-id].ps-project-active').click();
});
await page.waitForTimeout(400);
ok((await foldState()).pages === f0.pages + 1,
   'a second click shows them again, so the whole thing is one toggle');

ok(errors.length === 0, 'no page errors (' + errors.slice(0, 2).join(' | ') + ')');
console.log('notebook-pages-check: all cases passed');
await browser.close();
