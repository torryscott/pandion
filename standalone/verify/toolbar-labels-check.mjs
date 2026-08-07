// Labeled chart toolbar, standalone only (Torry, Aug 6 2026): the engine
// appends a word beside the five panel-opener icons when the host ships
// toolbarLabels - same icons as jamovi for familiarity, more descriptive
// where the standalone has room. The "?" leaves the toolbar here (the
// Help menu reaches every panel it opened, driving the hidden button),
// and jamovi stays byte-identical by construction: it never sends the
// key, and this suite proves a flag-less payload renders zero labels.
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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(pageUrl);
await page.waitForTimeout(700);
if (await page.locator('#ps-welcome').isVisible()) {
    await page.click('#ps-welcome-sample');
    await page.waitForTimeout(1600);
}
await page.waitForFunction(() => {
    const svg = document.querySelector('.graphbuilder2-host svg');
    return !!svg && svg.querySelectorAll('*').length > 30;
}, null, { timeout: 20000 });

console.log('case 1: the five panel-openers carry their words');
const labels = await page.evaluate(() =>
    [...document.querySelectorAll(
        '[data-role="chart-toolbar"] [data-role="toolbar-btn-label"]')]
        .map(n => n.textContent));
ok(JSON.stringify(labels) ===
   JSON.stringify(['Stats', 'Show/hide', 'Settings', 'Find', 'Add']),
   `Stats / Show\/hide / Settings / Find / Add ride their icons ` +
   `(${labels.join(', ')})`);
// Round 2 (Torry's screenshot): the two zone dividers flanked Export and
// the "?" - both hidden here - so they stood next to nothing.
ok(await page.evaluate(() =>
       [...document.querySelectorAll(
           '[data-role="chart-toolbar"] [data-role="toolbar-divider"]')]
           .every(d => d.offsetParent === null)),
   'the orphaned zone dividers are hidden with the buttons they flanked');
ok(await page.evaluate(() => {
    const b = [...document.querySelectorAll(
        '[data-role="chart-toolbar"] button')]
        .find(x => x.getAttribute('aria-label') === 'Statistics');
    return b.getBoundingClientRect().width > 40;
}), 'and the buttons widened past their 24px icon squares');

console.log('case 2: the labeled button still does its job');
await page.evaluate(() => {
    const b = [...document.querySelectorAll(
        '[data-role="chart-toolbar"] button')]
        .find(x => x.getAttribute('aria-label') === 'Statistics');
    b.dispatchEvent(new MouseEvent('click', { bubbles: true,
        cancelable: true }));
});
await page.waitForTimeout(900);
ok(await page.evaluate(() =>
       !!document.querySelector('.graphbuilder2-host [data-st-pane], ' +
           '.graphbuilder2-host [data-st-scroll]')),
   'the labeled Sigma button opens the Statistics panel');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

console.log('case 2b: the Show/hide word survives a hide (the eye is the ' +
            'one icon that rewrites itself)');
// Torry's screenshot bug: the Visibility panel's eye toggles update the
// icon IN PLACE (window.__gb2_updateVisBtnIcon - their exact call), no
// re-render heals anything, and the innerHTML rewrite ate the label.
// Drive that call directly, then the full hide for the steady state.
await page.evaluate(() => window.__gb2_updateVisBtnIcon());
await page.waitForTimeout(200);
ok(await page.evaluate(() => {
    const lbs = [...document.querySelectorAll(
        '[data-role="chart-toolbar"] [data-role="toolbar-btn-label"]')]
        .map(n => n.textContent);
    return lbs.filter(t => t === 'Show/hide').length === 1;
}), 'an in-place icon rewrite keeps exactly one Show/hide word');
await page.evaluate(() => window.setOption('hiddenElements', ['yTitle']));
await page.waitForTimeout(1100);
const hidState = await page.evaluate(() => {
    const b = [...document.querySelectorAll(
        '[data-role="chart-toolbar"] button')]
        .find(x => (x.getAttribute('aria-label') || '').indexOf('hidden') >= 0
            || (x.getAttribute('aria-label') || '')
                .indexOf('Show / hide') === 0);
    const lb = b && b.querySelector('[data-role="toolbar-btn-label"]');
    return { title: b ? b.getAttribute('aria-label') : null,
             label: lb ? lb.textContent : null,
             labels: [...b.querySelectorAll(
                 '[data-role="toolbar-btn-label"]')].length };
});
ok(/hidden/.test(hidState.title || '') && hidState.label === 'Show/hide' &&
   hidState.labels === 1,
   `the slashed eye keeps its word, exactly one of it ` +
   `("${hidState.title}")`);
await page.evaluate(() => window.setOption('hiddenElements', []));
await page.waitForTimeout(900);

console.log('case 3: the "?" leaves the toolbar; the Help menu covers it');
ok(await page.evaluate(() => {
    const b = document.querySelector(
        '[data-role="chart-toolbar"] button[aria-label="Help & shortcuts"]');
    return !!b && b.offsetParent === null;
}), 'the help button exists for the menu to drive, but is not shown');
await page.click('[data-ps-menu="help"]');
await page.waitForTimeout(300);
ok(await page.evaluate(() => {
    const item = [...document.querySelectorAll('#ps-appmenu button')]
        .find(b => b.textContent.trim() === 'Chart basics');
    return !!item && !item.disabled;
}), 'the Help menu gained Chart basics, enabled with a drawn chart');
await page.evaluate(() => {
    [...document.querySelectorAll('#ps-appmenu button')]
        .find(b => b.textContent.trim() === 'Chart basics').click();
});
await page.waitForTimeout(900);
ok(await page.evaluate(() => {
    const panel = document.querySelector('.graphbuilder2-host .gb2-panel');
    return !!panel && /shortcut|Start here|guide/i.test(panel.textContent);
}), 'and it opens the engine Basics panel through the hidden button');

console.log('case 3b: a narrow window compresses the words back to icons');
await page.setViewportSize({ width: 760, height: 900 });
await page.waitForTimeout(600);
const tight = await page.evaluate(() => {
    const bar = document.querySelector('[data-role="chart-toolbar"]');
    const lbl = bar.querySelector('[data-role="toolbar-btn-label"]');
    return { tight: bar.classList.contains('ps-tb-tight'),
             labelHidden: lbl.offsetParent === null,
             zoomThere: !!bar.querySelector('#ps-chart-zoom'),
             overflow: bar.scrollWidth > bar.clientWidth + 2 };
});
ok(tight.tight && tight.labelHidden && tight.zoomThere && !tight.overflow,
   'narrow: the words yield, icons and the zoom stay, nothing overflows');
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForTimeout(600);
ok(await page.evaluate(() => {
    const bar = document.querySelector('[data-role="chart-toolbar"]');
    return !bar.classList.contains('ps-tb-tight') &&
        bar.querySelector('[data-role="toolbar-btn-label"]')
            .offsetParent !== null;
}), 'and the words return with the room');

console.log('case 4: a flag-less payload renders ZERO labels (the jamovi ' +
            'identity)');
const bare = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const payload = window.PS_SHELL.buildPayload();
    delete payload.toolbarLabels;
    const host = document.querySelector('.graphbuilder2-host');
    window.GraphBuilder2.render(host.id, payload);
    await s(1200);
    return {
        labels: document.querySelectorAll(
            '[data-role="chart-toolbar"] [data-role="toolbar-btn-label"]')
            .length,
        statsW: (() => {
            const b = [...document.querySelectorAll(
                '[data-role="chart-toolbar"] button')]
                .find(x => x.getAttribute('aria-label') === 'Statistics');
            return b ? b.getBoundingClientRect().width : 0;
        })(),
    };
});
ok(bare.labels === 0 && bare.statsW > 0 && bare.statsW <= 30,
   `without the key the toolbar is jamovi's: no labels, 24px icon ` +
   `buttons (${bare.labels} labels, ${Math.round(bare.statsW)}px)`);

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('TOOLBAR LABELS CHECK PASS');
await browser.close();
