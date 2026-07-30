// Torry, Jul 29 2026, the stats-integrity alarm: "two of my stats, even
// though I had different variables on the y-axis, under the compare
// groups analysis were exactly the same. It kept replicating... It is
// crucial that these statistics are absolutely 100% without a doubt
// accurate every single time."
//
// ROOT CAUSE (engine): the Compare-pairs enumeration memo was keyed on
// window.__gb2_lastRenderedHash, which is stamped at render END - so a
// content-changed render's sticky-panel restore looked the memo up under
// the PREVIOUS payload's hash. A duplicated document's payload hashes
// identical to its original, so after changing the duplicate's y
// variable, the panel served the ORIGINAL chart's statistics over the
// new chart (the chart itself drew correctly; only the panel lied). The
// fix keys the memo on _renderHash, the hash of the payload the render's
// own closures hold.
//
// This probe pins the exact reported flow plus the plain data-edit case,
// and cross-checks the panel's t statistic against an INDEPENDENT
// computation from the raw table - the assertion is arithmetic truth,
// not just "differs from before".
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
// Welch t for two independent samples - the reference arithmetic.
function welch(a, b) {
    const mean = v => v.reduce((s, x) => s + x, 0) / v.length;
    const varr = v => {
        const m = mean(v);
        return v.reduce((s, x) => s + (x - m) * (x - m), 0) / (v.length - 1);
    };
    const va = varr(a) / a.length, vb = varr(b) / b.length;
    const t = (mean(a) - mean(b)) / Math.sqrt(va + vb);
    const df = (va + vb) * (va + vb) /
        (va * va / (a.length - 1) + vb * vb / (b.length - 1));
    return { t, df };
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
await page.click('#ps-welcome-sample');
await page.waitForTimeout(1200);

const firstPair = () => page.evaluate(() => {
    const row = Array.from(document.querySelectorAll(
        '#psroot [data-st-pane="pairs"] tr'))
        .map(r => (r.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(x => /t\(/.test(x))[0] || '';
    // One dot at most each: the cell text runs t and p together
    // ("1.46.202"), and Student's df is an integer while Welch's is not.
    const m = row.match(/t\((\d+(?:\.\d+)?)\) = (-?\d+(?:\.\d+)?)/);
    return m ? { df: Number(m[1]), t: Number(m[2]), row } : { row };
});
const referenceWelch = (yvar) => page.evaluate((y) => {
    // First listed pair is East vs West within the first category
    // (chart order): gather those two cells' raw values.
    const t = window.PS_SHELL.project.table;
    const firstCat = t.columns.condition.find(v => v != null);
    const pick = site => t.caseIds.map((_, i) => i)
        .filter(i => t.columns.condition[i] === firstCat &&
                     t.columns.site[i] === site &&
                     t.columns[y][i] != null &&
                     !(t.excluded[y] && t.excluded[y][i]))
        .map(i => Number(t.columns[y][i]));
    return { a: pick('East'), b: pick('West') };
}, yvar);
const check = async (yvar, label) => {
    const shown = await firstPair();
    const raw = await referenceWelch(yvar);
    const ref = welch(raw.a, raw.b);
    ok(Math.abs(shown.t - ref.t) < 0.005 &&
       Math.abs(shown.df - ref.df) < 0.005,
       label + ': the panel matches independent Welch arithmetic ' +
       `(shown t(${shown.df})=${shown.t}, ref t(${ref.df.toFixed(2)})=` +
       `${ref.t.toFixed(2)})`,
       shown.row);
};

console.log('case 1: the reported flow - duplicate, then change the y variable');
await page.evaluate(() => window.PS_SHELL.addChart('plotbuilder'));
await page.waitForTimeout(500);
await page.evaluate(() => window.PS_SHELL.setRoles('plotbuilder',
    { xvar: 'condition', yvar: 'score', groupVar: 'site' }));
await page.waitForTimeout(2600);
await page.locator('#psroot button[aria-label="Statistics"]').first().click();
await page.waitForTimeout(900);
await check('score', 'original (score)');
await page.evaluate(() => document.getElementById('ps-inspector-duplicate')
    .click());
await page.waitForTimeout(1500);
await page.evaluate(() => window.PS_SHELL.setRoles('plotbuilder',
    { xvar: 'condition', yvar: 'hours', groupVar: 'site' }));
await page.waitForTimeout(2500);
// THE reported bug: this used to show score's statistics verbatim.
await check('hours', 'duplicate switched to hours');

console.log('case 2: editing a data value with the panel open');
{
    const before = await firstPair();
    // Change the data underneath the open panel, then leave and return by
    // DOCUMENT switch - the panel survives document switches (its sticky
    // restore is exactly the code path the memo poisoned), so on return
    // it must recompute for the changed data.
    await page.evaluate(() => {
        const t = window.PS_SHELL.project.table;
        const i = t.caseIds.findIndex((_, k) =>
            t.columns.condition[k] != null && t.columns.site[k] === 'East' &&
            t.columns.hours[k] != null);
        t.columns.hours[i] = 9.9;
    });
    const here = await page.evaluate(() => window.PS_SHELL.chart().id);
    const other = await page.evaluate(() =>
        window.PS_SHELL.charts().find(c => c.id !==
            window.PS_SHELL.chart().id).id);
    await page.evaluate((id) => window.PS_SHELL.switchChart(id), other);
    await page.waitForTimeout(1500);
    await page.evaluate((id) => window.PS_SHELL.switchChart(id), here);
    await page.waitForTimeout(2500);
    const after = await firstPair();
    ok(Number.isFinite(after.t) && after.t !== before.t,
       'the pair statistic moved with the data ' +
       `(t ${before.t} -> ${after.t})`);
    await check('hours', 'after the edit');
}

console.log('case 3: Student\'s t is cross-checked too, not only Welch');
// Torry, Jul 29 2026: "If it's on a Student's T, does it check it against
// that as well?" The memo key includes the test, so a stale serve could
// have happened under any of them; the arithmetic check should speak both.
{
    await page.evaluate(() => {
        const sel = Array.from(document.querySelectorAll(
            '#psroot [data-st-pane="pairs"] select, #psroot select'))
            .find(s => Array.from(s.options)
                .some(o => o.value === 'studentT'));
        sel.value = 'studentT';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(900);
    const shown = await firstPair();
    const raw = await referenceWelch('hours');
    const student = ((a, b) => {
        const mean = v => v.reduce((s, x) => s + x, 0) / v.length;
        const varr = v => {
            const m = mean(v);
            return v.reduce((s, x) => s + (x - m) * (x - m), 0) /
                (v.length - 1);
        };
        const df = a.length + b.length - 2;
        const sp2 = ((a.length - 1) * varr(a) + (b.length - 1) * varr(b)) / df;
        return { t: (mean(a) - mean(b)) /
                    Math.sqrt(sp2 * (1 / a.length + 1 / b.length)), df };
    })(raw.a, raw.b);
    ok(Math.abs(shown.df - student.df) < 0.005 &&
       Math.abs(shown.t - student.t) < 0.005,
       'Student\'s t matches independent pooled-variance arithmetic ' +
       `(shown t(${shown.df})=${shown.t}, ref t(${student.df})=` +
       `${student.t.toFixed(2)})`,
       shown.row);
}

console.log('case 4: the Descriptives tab is fresh too');
// The staleness class is not pairs-specific in principle: any Σ tab must
// move with the data. The hours edit in case 2 set one East value to 9.9;
// the Descriptives mean for that cell must reflect it.
{
    await page.evaluate(() => {
        Array.from(document.querySelectorAll('#psroot button'))
            .find(x => (x.textContent || '').trim() === 'Descriptives')
            .click();
    });
    await page.waitForTimeout(600);
    const desc = await page.evaluate(() => Array.from(
        document.querySelectorAll('#psroot [data-st-pane] td'))
        .map(x => (x.textContent || '').trim()));
    const ref = await page.evaluate(() => {
        const t = window.PS_SHELL.project.table;
        const firstCat = t.columns.condition.find(v => v != null);
        const vals = t.caseIds.map((_, i) => i)
            .filter(i => t.columns.condition[i] === firstCat &&
                         t.columns.site[i] === 'East' &&
                         t.columns.hours[i] != null)
            .map(i => Number(t.columns.hours[i]));
        const m = vals.reduce((s, x) => s + x, 0) / vals.length;
        return Math.round(m * 100) / 100;
    });
    ok(desc.some(c => Number(c) === ref),
       `Descriptives carries the post-edit mean ${ref} computed from the ` +
       'raw table');
}

if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
console.log('SIGMA FRESHNESS CHECK PASS');
await browser.close();
