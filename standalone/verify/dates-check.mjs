// Punch list t3-48: no date measure type, so dates landed Nominal in
// first-seen order.
//
// ps-xlsx does the hard part correctly (builtin numFmt ids, custom formatCode
// sniffing, serial-to-ISO) and the type system had nowhere to put the result.
// So the most common longitudinal shape a student brings produced a chart with
// one bar per day, ordered by whatever order the rows happened to arrive in,
// chronological only by lexicographic accident.
//
// This is the item's own HIGH-VALUE SLICE, and nothing more: dates stay
// Nominal, but their levels are ordered CHRONOLOGICALLY so the axis reads left
// to right, plus the extract-year/month actions that turn 400 daily levels
// into a comparison worth looking at. A real continuous date axis is a
// separate project and is explicitly not attempted.
//
// The risk in a detector like this is FALSE POSITIVES: mistyping a category
// column as dates would reorder someone's chart for no reason. Case 3 is that.
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
await page.waitForTimeout(1300);

console.log('case 1: dates are ordered by date, not by arrival');
const dates = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    // Deliberately OUT of order, and crossing a year and a month boundary so
    // a lexicographic sort and a chronological one cannot coincide by luck.
    window.PS_SHELL.loadTable('visits', ['visit', 'score'], [
        ['2024-03-09', '5'], ['2023-11-02', '3'], ['2024-01-15', '7'],
        ['2023-11-02', '4'], ['2024-12-01', '2'], ['2024-03-09', '6']
    ]);
    await s(1000);
    const t = window.PS_SHELL.project.table;
    return { type: t.types.visit, levels: t.levels.visit.slice(),
             flagged: !!(t.dateColumns && t.dateColumns.visit) };
});
ok(dates.type === 'nominal',
   `the column stays Nominal, because there is no date type and this slice ` +
   `does not invent one (${dates.type})`);
ok(dates.flagged, 'but the app knows it is dates');
ok(JSON.stringify(dates.levels) ===
   JSON.stringify(['2023-11-02', '2024-01-15', '2024-03-09', '2024-12-01']),
   `and the levels read left to right in DATE order rather than the order ` +
   `the rows arrived in (${JSON.stringify(dates.levels)})`);

console.log('case 2: which is what the chart axis then uses');
const axis = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setModule('plotbuilder');
    await s(400);
    window.PS_SHELL.setRoles('plotbuilder', { xvar: 'visit', yvar: 'score' });
    await s(1200);
    const p = window.PS_SHELL.buildPayload();
    return p.xCategories;
});
ok(JSON.stringify(axis) ===
   JSON.stringify(['2023-11-02', '2024-01-15', '2024-03-09', '2024-12-01']),
   `the payload's category order is chronological, so the drawn axis is too ` +
   `(${JSON.stringify(axis)})`);

console.log('case 3: and an ordinary text column is NOT touched');
const notDates = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.loadTable('plain', ['grp', 'n'], [
        ['Control', '1'], ['Low dose', '2'], ['High dose', '3'],
        // A near-miss that matches the SHAPE but is not a real date, and a
        // number that Date.parse would happily accept.
        ['2024-13-45', '4'], ['5', '5']
    ]);
    await s(900);
    const t = window.PS_SHELL.project.table;
    return { flagged: !!(t.dateColumns && t.dateColumns.grp),
             levels: t.levels.grp.slice() };
});
ok(!notDates.flagged,
   'a category column is not mistaken for dates, which would have reordered ' +
   'someone\'s chart for no reason');
ok(JSON.stringify(notDates.levels.slice(0, 3)) ===
   JSON.stringify(['Control', 'Low dose', 'High dose']),
   `and keeps its meaningful first-seen order ` +
   `(${JSON.stringify(notDates.levels.slice(0, 3))})`);

// A column that is PART dates. The previous fixture has no valid dates at
// all, so a rule of "some dates is enough" would still refuse it and the
// assertion would pass for the wrong reason. This is the case that separates
// "every value parses" from "any value parses".
const mixed = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.loadTable('mixed', ['when', 'n'], [
        ['2024-01-01', '1'], ['Control', '2'], ['2024-02-01', '3'],
        ['Baseline', '4']
    ]);
    await s(900);
    const t = window.PS_SHELL.project.table;
    return { flagged: !!(t.dateColumns && t.dateColumns.when),
             levels: t.levels.when.slice() };
});
ok(!mixed.flagged,
   `a column of real dates MIXED with labels is not treated as dates, ` +
   `because reordering it would move the labels too ` +
   `(${JSON.stringify(mixed.levels)})`);

console.log('case 4: a column of impossible dates is not dates either');
const impossible = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.loadTable('bad', ['d', 'n'], [
        ['2024-13-01', '1'], ['2024-00-10', '2'], ['2024-05-45', '3']
    ]);
    await s(900);
    const t = window.PS_SHELL.project.table;
    return !!(t.dateColumns && t.dateColumns.d);
});
ok(!impossible,
   'month 13, month 0 and day 45 all match the SHAPE and are refused on the ' +
   'calendar, so the check is not a regex alone');

console.log('case 5: extract year and month');
const extracted = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.loadTable('visits', ['visit', 'score'], [
        ['2024-03-09', '5'], ['2023-11-02', '3'], ['2024-01-15', '7'],
        ['2024-12-01', '2']
    ]);
    await s(1000);
    window.PS_SHELL.extractDatePart('visit', 'year');
    await s(900);
    window.PS_SHELL.extractDatePart('visit', 'month');
    await s(900);
    const t = window.PS_SHELL.project.table;
    return { order: t.order.slice(),
             yearVals: t.columns['visit year'],
             yearType: t.types['visit year'],
             monthVals: t.columns['visit month'],
             monthLevels: t.levels['visit month'],
             toast: document.getElementById('ps-toast').innerText };
});
ok(extracted.yearType === 'continuous' &&
   JSON.stringify(extracted.yearVals) === JSON.stringify([2024, 2023, 2024, 2024]),
   `year comes out as a NUMBER a value axis will take ` +
   `(${extracted.yearType}, ${JSON.stringify(extracted.yearVals)})`);
ok(JSON.stringify(extracted.monthVals) ===
   JSON.stringify(['Mar', 'Nov', 'Jan', 'Dec']),
   `month comes out as a name (${JSON.stringify(extracted.monthVals)})`);
// The same ordering problem one level up: month NAMES sort alphabetically
// into Apr, Aug, Dec unless the calendar order is declared.
ok(extracted.monthLevels[0] === 'Jan' && extracted.monthLevels[11] === 'Dec',
   `in CALENDAR order rather than alphabetical, which is the same problem ` +
   `this item is about repeated one level up ` +
   `(${JSON.stringify(extracted.monthLevels.slice(0, 4))})`);
ok(/snapshot/.test(extracted.toast),
   `and the app says it is a snapshot, because the formula engine is numeric ` +
   `and cannot express this as a live formula ` +
   `("${extracted.toast.replace(/\n/g, ' ').slice(0, 90)}")`);

console.log('case 6: the advisory offers it where it applies');
const advice = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    window.PS_SHELL.setWorkspace('data');
    await s(300);
    window.PS_SHELL.selectVariable('visit');
    await s(500);
    const body = document.getElementById('ps-variable-advice');
    const shown = getComputedStyle(
        document.getElementById('ps-variable-advice-section')).display;
    const acts = Array.from(body.querySelectorAll('[data-advice]'))
        .map(b => b.getAttribute('data-advice'));
    // Captured BEFORE switching away: reading body.innerText in the return
    // object evaluates it after the next selectVariable has already cleared
    // the panel, which reads as an empty advisory.
    const text = body.innerText;
    window.PS_SHELL.selectVariable('score');
    await s(400);
    const otherShown = getComputedStyle(
        document.getElementById('ps-variable-advice-section')).display;
    return { shown, acts, text, otherShown };
});
ok(advice.shown !== 'none' && advice.acts.indexOf('advice-year') !== -1 &&
   advice.acts.indexOf('advice-month') !== -1,
   `the date column offers both extractions (${JSON.stringify(advice.acts)})`);
ok(/date order/.test(advice.text),
   `and explains what it already did about the order ` +
   `("${advice.text.replace(/\n/g, ' ').slice(0, 80)}")`);
ok(advice.otherShown === 'none',
   'while an ordinary numeric column is not nagged with it');

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('DATES CHECK PASS');
await browser.close();
