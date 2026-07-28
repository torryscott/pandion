// Real-browser check for the NOVICE DISCOVERABILITY polish (the M4
// audit's UX pressure points): the needs-variables empty state offers
// a way forward ("Choose variables" + "Not sure? Help me choose"),
// the data grid has a VISIBLE Add-row affordance (right-click was the
// only path), and right-clicking a column header moves the variable
// inspector to that column so the menu and the panel agree.
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
const { chromium } = loadPlaywright();
const PAGE = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(PAGE);
await page.waitForTimeout(700);
await page.click('#ps-welcome-sample');
await page.waitForTimeout(900);

// ---- the needs-variables empty state offers a way forward
await page.evaluate(() => {
    window.PS_SHELL.setModule('xyplotbuilder');
    window.PS_SHELL.setRoles('xyplotbuilder', {});
});
await page.waitForTimeout(500);
const empty = await page.evaluate(() => {
    const choose = document.getElementById('ps-empty-choose');
    const hmc = document.getElementById('ps-empty-hmc');
    return {
        heading: (document.querySelector('.ps-guided-empty h3') || {})
            .textContent || '',
        choose: choose ? choose.textContent.trim() : null,
        hmc: hmc ? hmc.textContent.trim() : null,
        visible: !!(choose && choose.offsetParent)
    };
});
if (!/needs variables/.test(empty.heading) || !empty.visible ||
    empty.choose !== 'Choose variables' ||
    empty.hmc !== 'Not sure? Help me choose')
    throw new Error('empty state lacks the action buttons: ' +
                    JSON.stringify(empty));
console.log('  ok  the needs-variables state offers Choose variables + ' +
            'Help me choose');

// ---- "Help me choose" opens the wizard; Escape still closes it
await page.click('#ps-empty-hmc');
await page.waitForTimeout(300);
if (!(await page.locator('#ps-help-choose').isVisible()))
    throw new Error('Help me choose did not open the wizard');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
if (await page.locator('#ps-help-choose').isVisible())
    throw new Error('Escape did not close the wizard');
console.log('  ok  Help me choose opens the wizard from the empty state ' +
            '(Escape closes)');

// ---- "Choose variables" pulses the Chart setup card
await page.click('#ps-empty-choose');
await page.waitForTimeout(150);
const pulsed = await page.evaluate(() => {
    const slots = document.getElementById('ps-slots');
    const card = slots && (slots.closest('.ps-card') || slots);
    return !!(card && card.classList.contains('ps-attention-pulse'));
});
if (!pulsed) throw new Error('Choose variables did not pulse the setup card');
console.log('  ok  Choose variables points at the Chart setup inspector');

// ---- visible Add-row button appends a row and opens its editor
await page.evaluate(() => window.PS_SHELL.setWorkspace('data'));
await page.waitForTimeout(500);
const before = await page.evaluate(() =>
    window.PS_SHELL.project.table.caseIds.length);
const btnVisible = await page.evaluate(() =>
    !!document.getElementById('ps-data-addrow').offsetParent);
if (!btnVisible) throw new Error('Add row button is not visible');
await page.click('#ps-data-addrow');
await page.waitForTimeout(500);
const afterAdd = await page.evaluate(() => ({
    rows: window.PS_SHELL.project.table.caseIds.length,
    editing: !!document.querySelector('#ps-datagrid input, #ps-datagrid textarea')
}));
if (afterAdd.rows !== before + 1 || !afterAdd.editing)
    throw new Error('Add row failed: ' + JSON.stringify({ before, afterAdd }));
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
console.log('  ok  the visible Add row button appends a row and opens ' +
            'its editor (' + before + ' -> ' + afterAdd.rows + ')');

// ---- right-clicking a column header moves the inspector to it
const target = await page.evaluate(() => {
    const ths = Array.from(document.querySelectorAll('th[data-grid-col]'));
    const th = ths[ths.length - 1];
    const r = th.getBoundingClientRect();
    return { col: th.getAttribute('data-grid-col'),
             x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.click(target.x, target.y, { button: 'right' });
await page.waitForTimeout(300);
const inspect = await page.evaluate(() => ({
    menu: document.getElementById('ps-columnmenu').style.display,
    subtitle: document.getElementById('ps-inspector-subtitle').textContent,
    active: (document.querySelector('th.ps-grid-col-active') || {})
        .getAttribute
        ? document.querySelector('th.ps-grid-col-active')
            .getAttribute('data-grid-col') : null
}));
if (inspect.menu !== 'block' ||
    inspect.subtitle !== 'Inspecting ' + target.col ||
    inspect.active !== target.col)
    throw new Error('column right-click did not move the inspector: ' +
                    JSON.stringify({ target: target.col, inspect }));
console.log('  ok  right-clicking the ' + target.col +
            ' header moves the inspector to it');

// ---- role-picker redesign: inline eligible-variable picker
await page.evaluate(() => {
    window.PS_SHELL.setWorkspace('chart');
    window.PS_SHELL.setModule('xyplotbuilder');
    window.PS_SHELL.setRoles('xyplotbuilder', {});
});
await page.waitForTimeout(500);
const cardState = await page.evaluate(() => {
    const xv = document.querySelector('#ps-slots [data-role-key="xvar"]');
    return { needed: xv.classList.contains('ps-role-card-needed'),
             count: (xv.querySelector('.ps-slot-count') || {}).textContent,
             badge: (xv.querySelector('.ps-role-badge') || {}).textContent,
             desc: !!xv.querySelector('.ps-role-description') };
});
// De-busy pass (Torry, Jul 27 2026): a positive eligible count no longer
// renders (the count survives only as the "none eligible" warning); the
// empty required card keeps its accent + a sentence-case Required badge.
if (!cardState.needed || cardState.count != null ||
    cardState.badge !== 'Required' || cardState.desc)
    throw new Error('empty required card wrong: ' + JSON.stringify(cardState));
console.log('  ok  the empty required card carries the accent + Required ' +
            'badge, no count chrome, no always-on prose');
await page.click('#ps-slots [data-role-key="xvar"] .ps-slot-drop');
await page.waitForTimeout(200);
const picker = await page.evaluate(() => {
    const p = document.querySelector(
        '#ps-slots [data-role-key="xvar"] .ps-role-picker');
    if (!p) return null;
    return { blurb: (p.querySelector('.ps-role-picker-blurb') || {})
                 .textContent || '',
             cols: Array.from(p.querySelectorAll('button[data-col]'))
                 .map(b => b.getAttribute('data-col')).sort().join(','),
             dimmed: Array.from(document.querySelectorAll(
                 '#ps-columns .ps-chip.ps-chip-dim'))
                 .map(c => c.getAttribute('data-col')).sort().join(',') };
});
if (!picker || picker.cols !== 'hours,score' ||
    !/horizontal/.test(picker.blurb) || !/Accepts/.test(picker.blurb) ||
    picker.dimmed !== 'condition,site')
    throw new Error('inline picker wrong: ' + JSON.stringify(picker));
console.log('  ok  the card expands into an inline picker (eligible only, ' +
            'teaching blurb inside) and dims incompatible list chips');
await page.click('#ps-slots .ps-role-picker button[data-col="score"]');
await page.waitForTimeout(600);
const afterPick = await page.evaluate(() => ({
    xvar: window.PS_SHELL.rolesStore().xvar,
    open: !!document.querySelector('#ps-slots .ps-role-picker'),
    dim: document.querySelectorAll('#ps-columns .ps-chip.ps-chip-dim').length
}));
if (afterPick.xvar !== 'score' || afterPick.open || afterPick.dim !== 0)
    throw new Error('pick did not assign/close: ' + JSON.stringify(afterPick));
console.log('  ok  picking assigns, closes the picker, and un-dims the list');

// ---- one-candidate suggestion chip (explicit accept, never silent)
const suggest = await page.evaluate(() => {
    const s = document.querySelector(
        '#ps-slots [data-role-key="yvar"] .ps-role-suggest');
    return s ? s.textContent : null;
});
if (!suggest || suggest.indexOf('hours') === -1)
    throw new Error('yvar should suggest the one unassigned candidate: ' +
                    JSON.stringify(suggest));
await page.click('#ps-slots [data-role-key="yvar"] .ps-role-suggest');
await page.waitForTimeout(600);
const roles2 = await page.evaluate(() => ({
    yvar: window.PS_SHELL.rolesStore().yvar,
    chip: !!document.querySelector('#ps-slots .ps-role-suggest')
}));
if (roles2.yvar !== 'hours')
    throw new Error('suggestion click did not assign: ' +
                    JSON.stringify(roles2));
console.log('  ok  the one-candidate suggestion chip assigns on an ' +
            'explicit click (Use hours)');

// ---- bidirectional highlight: hovering a variable previews its roles
// Roles-first pass (Jul 27 2026): the list is collapsed by default; a
// real hover needs it expanded, exactly as a user would.
await page.evaluate(() => {
    const t = document.getElementById('ps-varbox-toggle');
    if (t && t.getAttribute('aria-expanded') !== 'true') t.click();
});
await page.waitForTimeout(150);
await page.hover('#ps-columns .ps-chip[data-col="condition"]');
await page.waitForTimeout(150);
const hover = await page.evaluate(() => {
    const get = k => {
        const c = document.querySelector('#ps-slots [data-role-key="' + k + '"]');
        return c.classList.contains('ps-role-eligible') ? 'glow' :
            c.classList.contains('ps-role-dimmed') ? 'dim' : 'plain';
    };
    return { xvar: get('xvar'), groupVar: get('groupVar'),
             facetVar: get('facetVar') };
});
if (hover.groupVar !== 'glow' || hover.facetVar !== 'glow' ||
    hover.xvar !== 'dim')
    throw new Error('hover highlight wrong: ' + JSON.stringify(hover));
await page.mouse.move(5, 5);
await page.waitForTimeout(150);
const cleared = await page.evaluate(() =>
    document.querySelectorAll('#ps-slots .ps-role-eligible, ' +
        '#ps-slots .ps-role-dimmed').length);
if (cleared !== 0)
    throw new Error('hover highlight did not clear: ' + cleared);
console.log('  ok  hovering a variable glows the roles it fits and dims ' +
            'the rest (clears on leave)');

// ---- Escape closes an open picker
await page.click('#ps-slots [data-role-key="groupVar"] .ps-slot-drop');
await page.waitForTimeout(200);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
const escClosed = await page.evaluate(() =>
    !document.querySelector('#ps-slots .ps-role-picker'));
if (!escClosed) throw new Error('Escape did not close the role picker');
console.log('  ok  Escape closes the inline picker');

if (errors.length) throw new Error(errors[0]);
await browser.close();
console.log('NOVICE AFFORDANCES CHECK: ALL GREEN');
