// Punch list t2-30: everything transient snapped into existence.
//
// Dialogs were a display:flex toggle, so a 2px backdrop blur and a 65px
// shadow materialised in one frame, which reads as a glitch rather than as
// something opening. The menubar dropdowns and the context menu, the two
// most-opened surfaces in the app, were raw display:block toggles. The
// eligibility hint strobed: a 45% opacity swing with no transition, firing on
// every chip hover while a person is deciding where to drop. And reveal-in-
// data teleported, where the engine solves the same problem with a smooth
// centred scroll.
//
// These are ENTRY animations only. A leave animation on a display:none toggle
// needs the node kept alive afterwards, and none of these surfaces is worth
// that complication.
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
const page = await browser.newPage({ viewport: { width: 1400, height: 920 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1300);

console.log('case 1: the two most-opened surfaces animate in');
const menu = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('[data-ps-menu="file"]').click();
    await s(60);
    const m = document.getElementById('ps-appmenu');
    const cs = getComputedStyle(m);
    const out = { name: cs.animationName, dur: cs.animationDuration,
                  display: cs.display };
    document.querySelector('[data-ps-menu="file"]').click();
    return out;
});
ok(menu.display === 'block',
   `setup: the menu is open (${menu.display})`);
ok(menu.name && menu.name !== 'none',
   `it enters with an animation rather than appearing in one frame ` +
   `(${menu.name} ${menu.dur})`);

console.log('case 2: dialogs open rather than materialise');
const dlg = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.runCommand('preferences');
    await s(60);
    const o = document.getElementById('ps-preferences');
    const card = o.querySelector('.ps-dialog-card');
    const out = { overlay: getComputedStyle(o).animationName,
                  card: getComputedStyle(card).animationName,
                  cardDur: getComputedStyle(card).animationDuration };
    document.getElementById('ps-preferences-cancel').click();
    await s(300);
    return out;
});
ok(dlg.overlay !== 'none' && dlg.card !== 'none',
   `both the scrim and the card animate, so the blur and the shadow arrive ` +
   `together rather than snapping (${dlg.overlay} / ${dlg.card} ${dlg.cardDur})`);

console.log('case 3: the eligibility hint no longer strobes');
const strobe = await page.evaluate(() => {
    const card = document.querySelector('.ps-role-card');
    const chip = document.querySelector('#ps-columns .ps-chip');
    function props(el) {
        const cs = getComputedStyle(el);
        return { prop: cs.transitionProperty, dur: cs.transitionDuration };
    }
    return { card: props(card), chip: props(chip) };
});
ok(/opacity/.test(strobe.card.prop),
   `the role card transitions opacity, which is the 45% swing the hint used ` +
   `to make instantly (${strobe.card.prop})`);
ok(/opacity/.test(strobe.chip.prop),
   `and so does the variable chip (${strobe.chip.prop})`);
// The press feedback those elements already had must survive: `transition` is
// a shorthand, and this rule sits after the press-states block, so omitting
// background-color would have silently dropped it.
ok(/background-color/.test(strobe.chip.prop),
   `while KEEPING the background-color transition the press states rely on, ` +
   `which the shorthand would otherwise have replaced (${strobe.chip.prop})`);

console.log('case 4: reveal-in-data scrolls rather than teleporting');
const reveal = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const rows = [];
    for (let i = 0; i < 400; i++) rows.push([String(i), i === 350 ? 'needle' : 'x']);
    window.PS_SHELL.loadTable('long', ['n', 'w'], rows);
    await s(1000);
    window.PS_SHELL.setWorkspace('data');
    await s(600);
    const grid = document.getElementById('ps-datagrid');
    grid.scrollTop = 0;
    await s(200);
    const calls = [];
    const realTo = grid.scrollTo && grid.scrollTo.bind(grid);
    grid.scrollTo = function (opt) {
        calls.push(opt && opt.behavior);
        if (realTo) realTo(opt);
    };
    window.PS_SHELL.gridRevealFound({ col: 'w', row: 350 });
    await s(900);
    return { calls, top: grid.scrollTop };
});
ok(reveal.calls.indexOf('smooth') !== -1,
   `a far jump is animated (${JSON.stringify(reveal.calls)})`);
ok(reveal.top > 0,
   `and it actually lands somewhere (scrollTop ${Math.round(reveal.top)})`);

console.log('case 5: and the motion preference still wins');
const reduced = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    document.body.classList.add('ps-reduce-motion');
    await s(100);
    document.querySelector('[data-ps-menu="file"]').click();
    await s(60);
    const dur = getComputedStyle(document.getElementById('ps-appmenu'))
        .animationDuration;
    document.querySelector('[data-ps-menu="file"]').click();
    document.body.classList.remove('ps-reduce-motion');
    return dur;
});
// Parsed, not pattern-matched: the 0.001ms override computes as "1e-06s".
ok(parseFloat(reduced) < 0.01,
   `under reduce-motion every one of these collapses, because the global ` +
   `override already covers animation-duration (${reduced})`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('MOTION CHECK PASS');
await browser.close();
