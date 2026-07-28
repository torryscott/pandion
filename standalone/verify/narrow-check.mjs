// Punch list item 17: below 760px the menu bar, the navigator, the workspace
// switcher and the inspector were all display:none, with no hamburger, drawer
// or bottom sheet anywhere. On a Chromebook in portrait or a half-screen
// window the user lost the ability to switch workspaces, create a document, or
// assign a variable. Open / Save / Reset / Export survived in the command bar,
// which is why the app looked usable and was not.
//
// The fix moves the SAME panels over the main area on demand rather than
// building a second set of controls, so this probe checks reachability, not
// the existence of a parallel mobile UI.
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
const pageUrl = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
const browser = await chromium.launch();
// A Chromebook in portrait, which is the case the item names.
const page = await browser.newPage({ viewport: { width: 720, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
function ok(cond, msg) {
    if (!cond) throw new Error(msg);
    console.log('  ok  ' + msg);
}
const vis = sel => page.evaluate(s => {
    const n = document.querySelector(s);
    if (!n) return { exists: false };
    const cs = getComputedStyle(n);
    const r = n.getBoundingClientRect();
    return { exists: true, display: cs.display,
             shown: cs.display !== 'none' && cs.visibility !== 'hidden' &&
                    r.width > 0 && r.height > 0,
             w: Math.round(r.width) };
}, sel);

await page.goto(pageUrl);
await page.waitForTimeout(500);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(500);
}

console.log('case 1: the narrow window admits it has more chrome');
const closed = {
    nav: await vis('.ps-project-panel'),
    inspector: await vis('.ps-controls'),
    menubar: await vis('.ps-menubar')
};
ok(!closed.nav.shown && !closed.inspector.shown && !closed.menubar.shown,
   'setup: at 720px the three panels are out of the layout');
for (const id of ['ps-narrow-menu', 'ps-narrow-nav', 'ps-narrow-inspector']) {
    const b = await vis('#' + id);
    ok(b.exists && b.shown, `a control for it is on screen (#${id})`);
}

console.log('case 2: the workspace switcher is reachable again');
await page.click('#ps-narrow-nav');
await page.waitForTimeout(300);
const nav = await vis('.ps-project-panel');
ok(nav.shown, `the navigator opens over the main area (${nav.w}px wide)`);
const switcher = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-ps-workspace]'))
        .filter(b => b.getBoundingClientRect().width > 0)
        .map(b => b.getAttribute('data-ps-workspace')));
ok(switcher.length === 3,
   `with all three workspaces clickable (${JSON.stringify(switcher)})`);
ok(await page.evaluate(() => {
       const b = document.getElementById('ps-project-add');
       return !!b && b.getBoundingClientRect().width > 0;
   }),
   'and the new-document button, so a document can still be created');

// The gesture that matters: switch workspace from the drawer.
await page.click('[data-ps-workspace="data"]');
await page.waitForTimeout(500);
ok(await page.evaluate(() => window.PS_SHELL.workspace()) === 'data',
   'picking a workspace from the drawer works');
ok(!(await vis('.ps-project-panel')).shown,
   'and the drawer gets out of the way afterwards, rather than sitting on it');

console.log('case 3: the inspector is reachable, which is how a role is set');
await page.evaluate(() => window.PS_SHELL.setWorkspace('chart'));
await page.waitForTimeout(500);
await page.click('#ps-narrow-inspector');
await page.waitForTimeout(300);
ok((await vis('.ps-controls')).shown,
   'the settings panel opens over the main area');
const roleSlots = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.ps-slot-drop'))
        .filter(n => n.getBoundingClientRect().width > 0).length);
ok(roleSlots >= 2,
   `so variables can be assigned on a narrow window (${roleSlots} slots)`);
// Assigning through the picker is the real test, since drag is impractical
// here. Roles are CLEARED first: the sample project arrives with xvar and yvar
// already set, so "the store is non-empty" would have passed without the
// drawer opening at all.
const assigned = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setRoles('plotbuilder', {});
    await sleep(500);
    const before = JSON.stringify(window.PS_SHELL.rolesStore());
    const slot = document.querySelectorAll('.ps-slot-drop')[0];
    slot.click();
    await sleep(300);
    const pick = document.querySelector('.ps-role-picker .ps-role-pick');
    const pickLabel = pick ? pick.getAttribute('data-col') : null;
    if (pick) pick.click();
    await sleep(500);
    return { before: before, pickLabel: pickLabel,
             after: JSON.stringify(window.PS_SHELL.rolesStore()) };
});
ok(assigned.before === '{}',
   `setup: the roles really are empty before the click (${assigned.before})`);
ok(assigned.pickLabel && assigned.after !== '{}',
   `and picking from inside the drawer assigns one ` +
   `("${assigned.pickLabel}" -> ${assigned.after.slice(0, 60)})`);

console.log('case 4: the menu bar comes back rather than being replaced');
await page.keyboard.press('Escape');
await page.waitForTimeout(250);
await page.click('#ps-narrow-menu');
await page.waitForTimeout(300);
const menu = await vis('.ps-menubar');
ok(menu.shown, 'the hamburger reveals the real menu bar');
const names = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('[data-ps-menu]'));
    return { shown: all.filter(b => b.getBoundingClientRect().width > 0)
                 .map(b => b.textContent),
             total: all.length };
});
// Compared against the app's OWN menu count rather than a hardcoded number:
// the claim is "not a reduced copy", and pinning 5 turned adding a menu into
// a probe failure that said nothing about narrow layout (t3-45 added Data).
ok(names.shown.length === names.total && names.shown.indexOf('File') !== -1 &&
   names.shown.indexOf('Help') !== -1,
   `carrying every menu, not a reduced copy (${names.shown.length} of ` +
   `${names.total}: ${JSON.stringify(names.shown)})`);
// And the menus themselves still open from there.
const opened = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('[data-ps-menu="file"]').click();
    await sleep(300);
    const m = document.getElementById('ps-appmenu');
    return { shown: m.style.display === 'block',
             items: m.querySelectorAll('button').length };
});
ok(opened.shown && opened.items > 3,
   `and a menu opens with its commands (${opened.items} items)`);

console.log('case 5: it puts itself away');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await page.click('#ps-narrow-nav');
await page.waitForTimeout(250);
ok((await vis('.ps-project-panel')).shown, 'setup: a drawer is open');
await page.click('#ps-narrow-scrim', { force: true });
await page.waitForTimeout(300);
ok(!(await vis('.ps-project-panel')).shown, 'clicking outside closes it');
await page.click('#ps-narrow-nav');
await page.waitForTimeout(250);
await page.keyboard.press('Escape');
await page.waitForTimeout(250);
ok(!(await vis('.ps-project-panel')).shown, 'and so does Escape');

// Widening puts the panels back in the grid, so a drawer left open would be
// sitting on top of the very panel it is.
await page.click('#ps-narrow-nav');
await page.waitForTimeout(250);
await page.setViewportSize({ width: 1400, height: 1000 });
await page.waitForTimeout(400);
const wide = await page.evaluate(() => ({
    nav: getComputedStyle(document.querySelector('.ps-project-panel')).position,
    inspector: getComputedStyle(document.querySelector('.ps-controls')).display,
    menubar: getComputedStyle(document.querySelector('.ps-menubar')).display,
    scrim: document.getElementById('ps-narrow-scrim').hidden,
    buttons: getComputedStyle(document.getElementById('ps-narrow-nav')).display
}));
ok(wide.nav !== 'fixed' && wide.inspector !== 'none' &&
   wide.menubar !== 'none',
   `widening restores the ordinary layout (${JSON.stringify(wide)})`);
ok(wide.scrim === true && wide.buttons === 'none',
   'and the narrow-only chrome disappears with it');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('NARROW CHECK PASS');
await browser.close();
