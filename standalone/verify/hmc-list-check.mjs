// Help me choose > Use my variables, two reports from Torry, Jul 29 2026:
//
//  (a) "when you click on it, it adds it to the list below. That is
//      wonderful, except that variable is still available in the full list.
//      It's not grayed out or removed."  It WAS disabled - but the only
//      styling was a slightly lighter ink, and it still lit up on hover, so
//      it read as live.
//  (b) "if you scroll down looking at all the variables and you click on
//      one, it takes you back to the top... someone who's going through and
//      they have 50 different variables... they click one, thinking they
//      can click the next one, but then it resets."  Every pick rebuilt the
//      whole wizard, losing the scroll position.
//
// The chosen row stays IN PLACE rather than leaving the list: removing it
// would reflow every row beneath it, so the neighbour the user was about to
// click would move - report (b) again, one step later.
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

// A tall variable list, so scrolling is real rather than theoretical.
await page.evaluate(() => {
    const t = window.PS_SHELL.project.table;
    for (let i = 1; i <= 40; i++) {
        const name = 'filler' + String(i).padStart(2, '0');
        if (t.order.indexOf(name) !== -1) continue;
        t.order.push(name);
        t.types[name] = 'continuous';
        t.columns[name] = t.caseIds.map(() => 1);
    }
});
await page.evaluate(() => window.PS_SHELL.showHelpMeChoose());
await page.waitForTimeout(600);
await page.evaluate(() => {
    const tab = Array.from(document.querySelectorAll('button'))
        .find(b => (b.textContent || '').trim() === 'Use my variables');
    if (tab) tab.click();
});
await page.waitForTimeout(500);

const listState = () => page.evaluate(() => {
    const list = document.querySelector('.ps-hmc-variable-list');
    const rows = Array.from(list.querySelectorAll('.ps-hmc-variable'));
    return {
        scrollTop: Math.round(list.scrollTop),
        scrollable: list.scrollHeight > list.clientHeight + 10,
        count: rows.length,
        names: rows.map(r => r.getAttribute('data-hmc-variable')),
    };
});

console.log('case 1: a chosen variable READS as chosen, in place');
{
    const before = await listState();
    ok(before.scrollable, 'setup: the list is long enough to scroll',
       `${before.count} rows`);
    const target = before.names[3];
    await page.click(`.ps-hmc-variable[data-hmc-variable="${target}"]`);
    await page.waitForTimeout(500);
    const after = await page.evaluate((name) => {
        const row = document.querySelector(
            `.ps-hmc-variable[data-hmc-variable="${name}"]`);
        const live = Array.from(document.querySelectorAll('.ps-hmc-variable'))
            .find(b => !b.disabled);
        const cs = row ? getComputedStyle(row) : null;
        const liveCs = live ? getComputedStyle(live) : null;
        return {
            stillListed: !!row,
            disabled: row ? row.disabled : null,
            opacity: cs ? Number(cs.opacity) : null,
            liveOpacity: liveCs ? Number(liveCs.opacity) : null,
            says: row ? (row.textContent || '').replace(/\s+/g, ' ').trim() : '',
            chipped: !!Array.from(
                document.querySelectorAll('.ps-hmc-selected'))
                .find(c => (c.textContent || '').includes(name)),
        };
    }, target);
    ok(after.chipped, `picking ${target} adds it to the chosen list below`);
    ok(after.stillListed && after.disabled,
       'it stays in the full list, and is no longer pickable there');
    ok(after.opacity < after.liveOpacity,
       'and it is visibly dimmed against a still-available row',
       `${after.opacity} vs ${after.liveOpacity}`);
    ok(/Added/.test(after.says),
       'saying so in words, not only by shade', after.says);
}

console.log('case 2: hovering a chosen row does not make it look live');
{
    const name = (await listState()).names[3];
    const hovered = await page.evaluate(async (n) => {
        const row = document.querySelector(
            `.ps-hmc-variable[data-hmc-variable="${n}"]`);
        const rest = getComputedStyle(row).backgroundColor;
        row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        await new Promise(r => setTimeout(r, 60));
        return { rest, hover: getComputedStyle(row).backgroundColor };
    }, name);
    ok(hovered.rest === hovered.hover,
       'a chosen row keeps its resting background under the pointer',
       JSON.stringify(hovered));
}

console.log('case 3: picking does not throw the list back to the top');
{
    await page.evaluate(() => {
        document.querySelector('.ps-hmc-variable-list').scrollTop = 150;
    });
    await page.waitForTimeout(200);
    const mid = await listState();
    ok(mid.scrollTop > 100, 'setup: the reader has scrolled down',
       String(mid.scrollTop));
    // Pick something visible at THIS scroll position, the way a reader
    // would, then check the next one along is still under their eyes.
    const pick = await page.evaluate(() => {
        const list = document.querySelector('.ps-hmc-variable-list');
        const box = list.getBoundingClientRect();
        const row = Array.from(list.querySelectorAll('.ps-hmc-variable'))
            .filter(r => !r.disabled)
            .find(r => {
                const b = r.getBoundingClientRect();
                return b.top >= box.top && b.bottom <= box.bottom;
            });
        row.click();
        return row.getAttribute('data-hmc-variable');
    });
    await page.waitForTimeout(600);
    const after = await listState();
    ok(Math.abs(after.scrollTop - mid.scrollTop) <= 4,
       `the list holds its place after picking ${pick} ` +
       `(${mid.scrollTop} -> ${after.scrollTop})`);
    const neighbourVisible = await page.evaluate((n) => {
        const list = document.querySelector('.ps-hmc-variable-list');
        const rows = Array.from(list.querySelectorAll('.ps-hmc-variable'));
        const i = rows.findIndex(r => r.getAttribute('data-hmc-variable') === n);
        const next = rows[i + 1];
        if (!next) return null;
        const b = next.getBoundingClientRect();
        const box = list.getBoundingClientRect();
        return { name: next.getAttribute('data-hmc-variable'),
                 visible: b.top >= box.top - 1 && b.bottom <= box.bottom + 1 };
    }, pick);
    ok(neighbourVisible && neighbourVisible.visible,
       'so the variable right below it is still there to click ' +
       `(${(neighbourVisible || {}).name})`);
}

console.log('case 4: the keyboard keeps its place too');
{
    const focused = await page.evaluate(() => {
        const list = document.querySelector('.ps-hmc-variable-list');
        const row = Array.from(list.querySelectorAll('.ps-hmc-variable'))
            .filter(r => !r.disabled)[2];
        row.focus();
        row.click();
        return row.getAttribute('data-hmc-variable');
    });
    await page.waitForTimeout(600);
    const where = await page.evaluate(() => {
        const a = document.activeElement;
        return {
            tag: a ? a.tagName : null,
            isVariable: !!(a && a.classList &&
                a.classList.contains('ps-hmc-variable')),
            disabled: a ? !!a.disabled : null,
        };
    });
    ok(where.isVariable && !where.disabled,
       `after picking ${focused} with the keyboard, focus is on the next ` +
       'available variable rather than dumped on the page',
       JSON.stringify(where));
}

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('HMC LIST CHECK PASS');
await browser.close();
