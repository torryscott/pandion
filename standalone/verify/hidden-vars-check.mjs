// Two of Torry's Jul 29 2026 requests, one probe.
//
//  (a) "If I hide a column in data view, I'd also like that column to be
//      hidden in the corresponding variable picker on the chart
//      workspace."  One hide, one truth: hidden columns leave the
//      Available-variables list, the role pickers, and the one-candidate
//      suggestion - with disclosure at every seam, because a variable that
//      silently vanishes from a picker reads as data loss. The invariant
//      that must NEVER move: an ASSIGNED column stays assigned; hiding
//      cannot silently change a chart.
//
//  (b) "There are multiple tabs, but there's only an X at the very end.
//      I'm not sure that is clear to the user that, when they press that
//      X, that's actually closing the chart that's currently highlighted."
//      Every tab now carries its own close button, visually bound to what
//      it closes; the keyboard model (exactly one tabbable close, on the
//      active tab) is unchanged, which the tab-accessibility contract
//      pins separately.
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
function ok(cond, msg, extra) {
    if (!cond) throw new Error(msg + (extra ? ' :: ' + extra : ''));
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

const varboxState = () => page.evaluate(() => {
    const chips = Array.from(
        document.querySelectorAll('#ps-columns .ps-chip'))
        .map(c => c.getAttribute('data-col'));
    const label = (document.getElementById('ps-varbox-label') || {})
        .textContent || '';
    const note = document.querySelector('.ps-varbox-hiddennote');
    return { chips, label,
             note: note ? note.textContent.replace(/\s+/g, ' ').trim() : null };
});

console.log('case 1: a hidden column leaves the chart-side surfaces');
{
    // Open the varbox disclosure so the chips actually render for reading.
    await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        const tog = document.getElementById('ps-varbox-toggle');
        if (tog && tog.getAttribute('aria-expanded') !== 'true') tog.click();
        await s(300);
    });
    const before = await varboxState();
    ok(before.chips.includes('hours'),
       'setup: hours is offered in Available variables');
    await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        window.PS_SHELL.setWorkspace('data');
        await s(400);
        window.PS_SHELL.selectVariable('hours');
        window.PS_SHELL.runCommand('data-hide-col');
        await s(300);
        window.PS_SHELL.setWorkspace('chart');
        await s(500);
    });
    const after = await varboxState();
    ok(!after.chips.includes('hours'),
       'hiding hours in the Data workspace removes it from the list');
    ok(/\(\d+\)/.test(after.label) &&
       Number(after.label.match(/\((\d+)\)/)[1]) ===
       Number(before.label.match(/\((\d+)\)/)[1]) - 1,
       'and the Available count drops with it',
       before.label + ' -> ' + after.label);
    ok(after.note && /1 variable is hidden in the Data workspace/
           .test(after.note),
       'a footer says where it went instead of letting it read as lost',
       after.note);
}

console.log('case 2: the role picker excludes it and says so');
{
    const picker = await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        const drop = document.querySelector(
            '#ps-slots .ps-role-card[data-role-key="yvar"] .ps-slot-drop');
        drop.click();
        await s(300);
        const rows = Array.from(document.querySelectorAll(
            '#ps-slots .ps-role-pick')).map(r =>
            (r.getAttribute('data-col') || r.textContent.trim()));
        const notes = Array.from(document.querySelectorAll(
            '#ps-slots .ps-role-picker-none'))
            .map(n => n.textContent.replace(/\s+/g, ' ').trim());
        document.dispatchEvent(new KeyboardEvent('keydown',
            { key: 'Escape', bubbles: true }));
        await s(200);
        return { rows, notes };
    });
    ok(!picker.rows.some(r => /hours/.test(r)),
       'the value-axis picker no longer offers hours');
    ok(picker.notes.some(n => /hidden in the Data workspace/.test(n)),
       'and it discloses that a fitting variable is hidden',
       JSON.stringify(picker.notes));
}

console.log('case 3: an ASSIGNED column survives being hidden');
{
    const assigned = await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        // score is assigned to yvar on the sample chart; hide it.
        window.PS_SHELL.setWorkspace('data');
        await s(300);
        window.PS_SHELL.selectVariable('score');
        window.PS_SHELL.runCommand('data-hide-col');
        await s(300);
        window.PS_SHELL.setWorkspace('chart');
        await s(700);
        const roles = window.PS_SHELL.rolesStore();
        const chip = document.querySelector(
            '#ps-slots .ps-role-card[data-role-key="yvar"] .ps-slot-chip');
        const svg = Array.from(document.querySelectorAll('#psroot svg'))
            .sort((a, b) => (b.clientWidth * b.clientHeight) -
                            (a.clientWidth * a.clientHeight))[0];
        return {
            yvar: roles.yvar,
            chipText: chip ? chip.textContent.trim() : null,
            drawn: !!svg && svg.clientWidth > 300,
        };
    });
    ok(assigned.yvar === 'score',
       'score stays assigned to the value axis while hidden');
    ok(assigned.chipText && /score/.test(assigned.chipText),
       'its slot chip still shows it', assigned.chipText);
    ok(assigned.drawn, 'and the chart still draws - hiding never silently ' +
       'changes a chart');
}

console.log('case 4: Show all columns from the chart side brings them back');
{
    const restored = await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        const note = document.querySelector('.ps-varbox-hiddennote button');
        if (!note) return null;
        note.click();
        await s(500);
        return {
            chips: Array.from(
                document.querySelectorAll('#ps-columns .ps-chip'))
                .map(c => c.getAttribute('data-col')),
            noteGone: !document.querySelector('.ps-varbox-hiddennote'),
        };
    });
    ok(restored && restored.chips.includes('hours'),
       'the footer Show-all action restores the hidden variables in place');
    ok(restored.noteGone, 'and the disclosure retires itself');
}

console.log('case 5: every tab carries its own labelled close button');
{
    await page.evaluate(async () => {
        const s = ms => new Promise(r => setTimeout(r, ms));
        window.PS_SHELL.addChart('xyplotbuilder');
        await s(600);
    });
    const strip = await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll('#ps-tabs .ps-tab'));
        const active = window.PS_SHELL.chart().id;
        const activeName = window.PS_SHELL.chart().name;
        const kbd = document.querySelectorAll('#ps-tabs .ps-tab-x-kbd');
        const stops = Array.from(document.querySelectorAll('#ps-tabs .ps-tab-x'))
            .filter(x => x.tabIndex === 0);
        return {
            tabs: tabs.map(t => {
                const x = t.querySelector('.ps-tab-x');
                const name = t.querySelector('.ps-tab-name').textContent;
                return {
                    name,
                    hasX: !!x,
                    // Mouse-only mirrors: silent to AT, out of the keyboard
                    // order (a real button among tablist children is an axe
                    // aria-required-children violation - the first cut of
                    // this feature failed axe in 8 states proving it).
                    ariaHidden: x ? x.getAttribute('aria-hidden') : null,
                    xTab: x ? x.tabIndex : null,
                    xVisible: x ? getComputedStyle(x).visibility : null,
                    tipNamesTab: x
                        ? (x.getAttribute('data-tip') || '').includes(name)
                        : false,
                    isActive: t.getAttribute('data-chart-id') === active,
                    nestedInTabButton:
                        !!t.querySelector('[role="tab"] .ps-tab-x'),
                };
            }),
            kbdCount: kbd.length,
            kbdLabel: kbd.length
                ? kbd[0].getAttribute('aria-label') : null,
            kbdNamesActive: kbd.length
                ? (kbd[0].getAttribute('aria-label') || '')
                    .includes(activeName)
                : false,
            oneStop: stops.length === 1 &&
                stops[0].classList.contains('ps-tab-x-kbd'),
        };
    });
    ok(strip.tabs.length >= 2 && strip.tabs.every(t => t.hasX),
       `every tab has its own close button (${strip.tabs.length} tabs)`);
    ok(strip.tabs.every(t => t.tipNamesTab),
       'each names ITS tab, not the active one');
    ok(strip.tabs.every(t => t.ariaHidden === 'true' && t.xTab === -1),
       'the per-tab X\'s are mouse-only mirrors: silent to AT and out of ' +
       'the keyboard order (tablist children must be tabs)');
    ok(strip.tabs.every(t => !t.nestedInTabButton),
       'none is nested inside the role=tab button');
    const act = strip.tabs.find(t => t.isActive);
    const rest = strip.tabs.filter(t => !t.isActive);
    ok(act.xVisible === 'visible',
       'the active tab shows its X constantly');
    ok(rest.every(t => t.xVisible === 'hidden'),
       'inactive tabs reserve the space but reveal only on hover');
    ok(strip.kbdCount === 1 && strip.kbdNamesActive && strip.oneStop,
       'and the ONE keyboard/AT close is the labelled button outside the ' +
       'tablist, naming the active document',
       JSON.stringify({ label: strip.kbdLabel }));
}

console.log('case 6: clicking an INACTIVE tab\'s X closes that tab');
{
    const target = await page.evaluate(() => {
        const active = window.PS_SHELL.chart().id;
        const other = Array.from(
            document.querySelectorAll('#ps-tabs .ps-tab'))
            .find(t => t.getAttribute('data-chart-id') !== active);
        return { id: other.getAttribute('data-chart-id'), active };
    });
    // A real hover then click, the way a mouse user meets the reveal.
    const box = await page.locator(
        `#ps-tabs .ps-tab[data-chart-id="${target.id}"]`).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(200);
    await page.click(
        `#ps-tabs .ps-tab[data-chart-id="${target.id}"] .ps-tab-x`);
    await page.waitForTimeout(500);
    const after = await page.evaluate((t) => ({
        stillThere: !!document.querySelector(
            '#ps-tabs .ps-tab[data-chart-id="' + t.id + '"]'),
        active: window.PS_SHELL.chart().id,
    }), target);
    ok(!after.stillThere, 'the inactive tab is gone');
    ok(after.active === target.active,
       'and the ACTIVE document was untouched - the X closed what it was ' +
       'bound to, not the highlighted tab');
}

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('HIDDEN VARS CHECK PASS');
await browser.close();
