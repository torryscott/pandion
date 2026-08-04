// Chart-setup de-busy pass (Torry's report, Jul 27 2026: "I know what I'm
// doing, and I find it kind of challenging sometimes").
//
// The diagnosis, pinned here as behavior:
// 1. The same fact was stated TWICE - an assigned variable appeared in the
//    list (grayed, role-tagged) AND in its role zone. Now it leaves the
//    list (jamovi's supplier behavior) and the mapping is stated once.
// 2. Satisfied zones kept shouting: dashed drop-here borders and REQUIRED
//    badges on zones already filled. Now filled zones go solid and quiet,
//    and badges mark only EMPTY zones.
// 3. Redundant chrome: the type WORD on zone chips repeated the icon; the
//    eligible count advertised at rest. The word survives only in the
//    picker (a choosing surface); the count only as the "none eligible"
//    warning.
// 4. Read-once prose held the pane forever: the analysis paragraph is one
//    sentence with the full text in its tooltip, and the drag-hint
//    sentence is gone.
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
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1400);

console.log('case 1: an assigned variable leaves the list and comes back');
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.loadTable('debusy', ['cond', 'score', 'extra'],
        [['a', '1', '4'], ['b', '2', '5'], ['a', '3', '6']],
        { cond: 'nominal', score: 'continuous', extra: 'continuous' });
    await s(900);
    window.PS_SHELL.setWorkspace('chart');
    await s(300);
    window.PS_SHELL.setModule('plotbuilder');
    window.PS_SHELL.setRoles('plotbuilder', { xvar: 'cond', yvar: 'score' });
    await s(900);
});
const moved = await page.evaluate(() => ({
    listCols: Array.from(document.querySelectorAll('#ps-columns .ps-chip'))
        .map(c => c.getAttribute('data-col')),
    zoneChip: !!document.querySelector(
        '#ps-slots [data-role-key="xvar"] .ps-slot-chip[data-col="cond"]'),
    hint: !!document.querySelector('.ps-varbox-hint')
}));
ok(JSON.stringify(moved.listCols) === JSON.stringify(['extra']) &&
   moved.zoneChip,
   `assigned variables live in their zones only; the list holds what is ` +
   `still available (${JSON.stringify(moved.listCols)})`);
ok(!moved.hint, 'the read-once drag-hint sentence is gone');
// Unassigning brings the chip back: the list is a live inventory.
await page.click('#ps-slots [data-role-key="xvar"] .ps-slot-x');
await page.waitForTimeout(400);
ok(await page.evaluate(() =>
       !!document.querySelector('#ps-columns .ps-chip[data-col="cond"]')),
   'clearing the role returns the variable to the list');
await page.evaluate(() =>
    window.PS_SHELL.setRoles('plotbuilder', { xvar: 'cond', yvar: 'score' }));
await page.waitForTimeout(600);

console.log('case 2: badges and borders quiet down as zones fill');
const zones = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('#ps-slots .ps-slot').forEach(s => {
        const drop = s.querySelector('.ps-slot-drop');
        out.push({
            key: s.getAttribute('data-role-key'),
            filled: drop.classList.contains('ps-slot-filled'),
            border: getComputedStyle(drop).borderTopStyle,
            badge: (s.querySelector('.ps-role-badge') || {}).textContent || null,
            badgeCaps: s.querySelector('.ps-role-badge')
                ? getComputedStyle(s.querySelector('.ps-role-badge'))
                    .textTransform : null,
            kindWord: !!s.querySelector('.ps-slot-chip-kind'),
            count: (s.querySelector('.ps-slot-count') || {}).textContent || null
        });
    });
    return out;
});
const by = k => zones.find(z => z.key === k);
ok(by('xvar').filled && by('xvar').border === 'solid' &&
   by('yvar').filled && by('yvar').border === 'solid',
   'filled zones read settled: solid border, no drop-here dashes');
ok(by('xvar').badge === null && by('yvar').badge === null,
   'a met requirement is not news: filled zones carry no badge');
ok(by('groupVar').badge === 'Optional' && by('facetVar').badge === 'Optional' &&
   by('groupVar').border === 'dashed' &&
   by('groupVar').badgeCaps === 'none',
   'empty zones keep the dashed invitation and a sentence-case badge');
ok(zones.every(z => !z.kindWord),
   'zone chips carry the type ICON, not the word beside it');
ok(zones.every(z => z.count === null),
   'no eligible-count chrome while candidates exist');

console.log('case 3: the type word survives in the picker, a choosing surface');
await page.click('#ps-slots [data-role-key="groupVar"] .ps-slot-drop');
await page.waitForTimeout(300);
const picker = await page.evaluate(() => ({
    rows: document.querySelectorAll('#ps-slots .ps-role-picker .ps-role-pick')
        .length,
    kinds: document.querySelectorAll(
        '#ps-slots .ps-role-picker .ps-role-pick-kind').length
}));
ok(picker.rows >= 1 && picker.kinds === picker.rows,
   `picker rows keep the type word where the user is deciding ` +
   `(${picker.kinds} of ${picker.rows})`);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

console.log('case 4: the empty-list and none-eligible states stay honest');
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.loadTable('numsonly', ['score', 't1'],
        [['1', '4'], ['2', '5'], ['3', '6']],
        { score: 'continuous', t1: 'continuous' });
    await s(900);
    window.PS_SHELL.setWorkspace('chart');
    await s(300);
    window.PS_SHELL.setModule('plotbuilder');
    window.PS_SHELL.setRoles('plotbuilder', {});
    await s(500);
});
const warn = await page.evaluate(() => {
    const xv = document.querySelector('#ps-slots [data-role-key="xvar"]');
    return (xv.querySelector('.ps-slot-count') || {}).textContent || null;
});
ok(warn === 'none eligible',
   'a zone NOTHING fits still warns before the user clicks into a dead end');
// Assign both numerics (Scatter takes two): the list has nothing left,
// and it says so instead of sitting silently empty.
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setModule('xyplotbuilder');
    window.PS_SHELL.setRoles('xyplotbuilder', { xvar: 'score', yvar: 't1' });
    await s(700);
});
const note = await page.evaluate(() => ({
    chips: document.querySelectorAll('#ps-columns .ps-chip').length,
    note: (document.querySelector('#ps-columns .ps-chip-empty-note') || {})
        .textContent || ''
}));
ok(note.chips === 0 && /Every variable is assigned/.test(note.note),
   `an emptied list explains itself ("${note.note.slice(0, 44)}...")`);
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setModule('plotbuilder');
    window.PS_SHELL.setRoles('plotbuilder', {});
    await s(400);
});

console.log('case 4b: roles first, the list behind a collapsed disclosure');
// Torry's ruling, Jul 27 2026: the slots are the primary surface and the
// picker the default assignment path; the variables list is a reference
// inventory BELOW the slots, collapsed by default, opening only on an
// explicit click, with the count on the collapsed header so "what is
// left" survives at a glance. State rides the project's UI prefs.
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.loadTable('order', ['g', 'v', 'extra'],
        [['a', '1', '9'], ['b', '2', '8'], ['a', '3', '7']],
        { g: 'nominal', v: 'continuous', extra: 'continuous' });
    await s(900);
    window.PS_SHELL.setWorkspace('chart');
    await s(300);
    window.PS_SHELL.setModule('plotbuilder');
    window.PS_SHELL.setRoles('plotbuilder', { xvar: 'g', yvar: 'v' });
    await s(700);
});
const disc = await page.evaluate(() => {
    const assign = document.querySelector('.ps-assign');
    const kids = Array.from(assign.children).map(n => n.id).filter(Boolean);
    const tog = document.getElementById('ps-varbox-toggle');
    const body = document.getElementById('ps-varbox-body');
    return {
        order: kids.join('>'),
        collapsed: body.hidden && tog.getAttribute('aria-expanded') === 'false',
        label: document.getElementById('ps-varbox-label').textContent,
        bodyVisible: body.offsetParent !== null
    };
});
ok(disc.order === 'ps-slots>ps-varbox>ps-sizeview',
   `the slots come first; the list below; Size & view last, in the same ` +
   `card idiom (Aug 2 2026) (${disc.order})`);
ok(disc.collapsed && !disc.bodyVisible,
   'the list is collapsed by default: the slots ask, the picker answers');
ok(disc.label === 'Available variables (1)',
   `the collapsed header still answers "what is left" (${disc.label})`);
await page.click('#ps-varbox-toggle');
await page.waitForTimeout(300);
const opened = await page.evaluate(() => ({
    expanded: document.getElementById('ps-varbox-toggle')
        .getAttribute('aria-expanded') === 'true',
    chips: Array.from(document.querySelectorAll('#ps-columns .ps-chip'))
        .filter(c => c.offsetParent !== null)
        .map(c => c.getAttribute('data-col'))
}));
ok(opened.expanded &&
   JSON.stringify(opened.chips) === JSON.stringify(['extra']),
   `one explicit click opens it and the chips are really visible ` +
   `(${JSON.stringify(opened.chips)})`);
// The choice is the user's and it sticks: reload, still open.
await page.reload();
await page.waitForTimeout(1600);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-continue');
    await page.waitForTimeout(1200);
}
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setWorkspace('chart');
    await s(300);
});
ok(await page.evaluate(() =>
       document.getElementById('ps-varbox-toggle')
           .getAttribute('aria-expanded') === 'true'),
   'the expand state persists with the project UI prefs across a reload');
await page.click('#ps-varbox-toggle');
await page.waitForTimeout(200);
ok(await page.evaluate(() =>
       document.getElementById('ps-varbox-body').hidden),
   'and a second click collapses it again');
await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setModule('plotbuilder');
    window.PS_SHELL.setRoles('plotbuilder', {});
    await s(400);
});

console.log('case 5: the analysis blurb is one sentence, rest in tooltip');
const blurb = await page.evaluate(() => {
    const h = document.getElementById('ps-analysis-help');
    return { text: h.textContent.trim(), tip: h.getAttribute('data-tip') || '' };
});
ok(blurb.text === 'Compare a numeric outcome across categories.' &&
   /category axis defines groups/.test(blurb.tip),
   `one visible sentence ("${blurb.text}"), full guidance one hover away`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('PANE DEBUSY CHECK PASS');
await browser.close();
