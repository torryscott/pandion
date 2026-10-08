// Sigma-panel <-> Summary-table parity checks (Jul 2026).
// Confirms the Σ panel now carries every column the retiring
// "Summary Statistics" table showed, plus the copy-as-Word-table path:
//   - Compare Groups / Repeated Measures Descriptives: CI lower/upper
//     (level tracks errorBarType; RM within uses the Cousineau-Morey SE)
//   - Frequencies Counts: Cumulative % + Std. residual
//   - Correlation: full "All pairs" table (not just the strongest pair)
//   - Likert Item means: per-level % columns
//   - every Copy-table button writes text/html (a real <table>) + TSV,
//     so a paste into Word/Docs lands as a formatted table.
// Runs against the render.R battery fixtures ($GB2_VERIFY_OUT), so it
// exercises both the source and (--min) minified bundles.
import { createRequire } from 'node:module';
import path from 'node:path';

function loadPlaywright() {
    for (const b of [process.env.GB2_NODE_BASE, process.cwd(), '/tmp', '/private/tmp'].filter(Boolean)) {
        try { return createRequire(path.join(b, 'x.js'))('playwright'); } catch { }
    }
    console.error('playwright not found (npm i playwright in /tmp or set GB2_NODE_BASE)');
    process.exit(2);
}
const { chromium } = loadPlaywright();
const OUT = process.env.GB2_VERIFY_OUT || '/tmp/gb2-verify';
const browser = await chromium.launch();
let fails = 0;
const check = (n, c, d) => c ? console.log('  ok   ' + n)
    : (console.log('  FAIL ' + n + '  :: ' + (d || '')), fails++);

async function open(file) {
    const ctx = await browser.newContext();      // fresh ctx: no shared localStorage
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto('file://' + path.join(OUT, file));
    await page.waitForTimeout(800);
    return { ctx, page, errs };
}
async function openStats(page) {
    const has = await page.evaluate(() => {
        const b = document.querySelector('[title="Statistics"]');
        if (!b) return false;
        b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return true;
    });
    await page.waitForTimeout(600);
    return has;
}
const paneHeaders = (page, sel) => page.evaluate(s => {
    const p = document.querySelector(s);
    const tbl = p && p.querySelector('table');
    if (!tbl) return null;
    return Array.from(tbl.querySelectorAll('tr')[0].children).map(c => c.textContent.trim());
}, sel);
const paneRows = (page, sel) => page.evaluate(s => {
    const p = document.querySelector(s);
    if (!p) return null;
    return Array.from(p.querySelectorAll('table tr')).slice(1)
        .map(r => Array.from(r.children).map(c => c.textContent.trim()));
}, sel);

// ---- Compare Groups: Descriptives gains CI lower/upper ----
{
    const { ctx, page, errs } = await open('cg_bar_labels.html');
    console.log('Compare Groups (cg_bar_labels): Descriptives CI columns');
    check('Sigma panel opens', await openStats(page), 'no Statistics button');
    const h = await paneHeaders(page, '[data-st-pane="desc"]');
    check('has "CI lower" header', h && h.some(x => /CI lower/i.test(x)), JSON.stringify(h));
    check('has "CI upper" header', h && h.some(x => /CI upper/i.test(x)), JSON.stringify(h));
    check('CI header states a level (95%/99%)', h && h.some(x => /9\d% CI/i.test(x)), JSON.stringify(h));
    const rows = await paneRows(page, '[data-st-pane="desc"]');
    check('every row width matches header', rows && rows.every(r => r.length === h.length), JSON.stringify(rows && rows[0]));
    check('no page errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
}
// ---- Repeated Measures: CI columns + Cousineau-Morey disclosure ----
{
    const { ctx, page, errs } = await open('rm_bar.html');
    console.log('Repeated Measures (rm_bar): Descriptives CI columns');
    await openStats(page);
    const h = await paneHeaders(page, '[data-st-pane="desc"]');
    check('has CI lower + CI upper',
          h && h.some(x => /CI lower/i.test(x)) && h.some(x => /CI upper/i.test(x)), JSON.stringify(h));
    const foot = await page.evaluate(() => {
        const p = document.querySelector('[data-st-pane="desc"]');
        return p ? p.textContent : '';
    });
    check('within-SE disclosed (Cousineau-Morey)', /Cousineau/i.test(foot), foot.slice(0, 120));
    check('no page errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
}
// ---- Frequencies: Counts gains Cumulative % + Std. residual ----
{
    const { ctx, page, errs } = await open('freq_bar_stack.html');
    console.log('Frequencies (freq_bar_stack): Counts cumulative % + std residual');
    await openStats(page);
    const h = await paneHeaders(page, '[data-st-pane="counts"]');
    const rows = await paneRows(page, '[data-st-pane="counts"]');
    check('has "Cumulative %"', h && h.some(x => /Cumulative %/i.test(x)), JSON.stringify(h));
    check('has "Std. residual"', h && h.some(x => /Std\. residual/i.test(x)), JSON.stringify(h));
    const cumIdx = h ? h.findIndex(x => /Cumulative/i.test(x)) : -1;
    check('cumulative reaches ~100 by the last row',
          rows && Math.abs(parseFloat(rows[rows.length - 1][cumIdx]) - 100) < 0.6,
          rows && rows[rows.length - 1][cumIdx]);
    const resIdx = h ? h.findIndex(x => /Std\. residual/i.test(x)) : -1;
    check('std residuals are real numbers (not all dashes)',
          rows && rows.some(r => /-?\d/.test(r[resIdx])), '');
    check('no page errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
}
// ---- Correlation: full "All pairs" table ----
{
    const { ctx, page, errs } = await open('corr_heat.html');
    console.log('Correlation (corr_heat): All-pairs table');
    await openStats(page);
    const info = await page.evaluate(() => {
        const pt = document.querySelector('[data-st-corrpairs] table');
        return {
            hasCard: /All pairs/.test(document.body.textContent),
            rows: pt ? pt.querySelectorAll('tr').length : 0,
            hdr: pt ? Array.from(pt.querySelectorAll('tr')[0].children).map(c => c.textContent.trim()) : [],
        };
    });
    check('has "All pairs" card', info.hasCard, '');
    check('lists every pair (header + >1 rows)', info.rows > 2, 'rows=' + info.rows);
    check('pairs header = Pair, r, p, n', /Pair.*r.*p.*n/i.test(info.hdr.join(',')), JSON.stringify(info.hdr));
    check('no page errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
}
// ---- Likert: per-level % columns ----
{
    const { ctx, page, errs } = await open('likert_div.html');
    console.log('Likert (likert_div): per-level % columns');
    await openStats(page);
    const h = await paneHeaders(page, '[data-st-pane="means"]');
    const rows = await paneRows(page, '[data-st-pane="means"]');
    const pctIdxs = h ? h.map((x, i) => /%$/.test(x) ? i : -1).filter(i => i >= 0) : [];
    check('has >= 2 per-level % columns', pctIdxs.length >= 2, JSON.stringify(h));
    // CI header now states the level ("95% CI"), Jul 2026 parity pass
    check('keeps Mean + CI', h && h.includes('Mean') && h.some(x => /% CI$/.test(x)), JSON.stringify(h));
    const sum = rows && pctIdxs.reduce((s, i) => s + parseFloat(rows[0][i] || 0), 0);
    check('row-0 per-level % sum ~ 100', rows && Math.abs(sum - 100) < 1.5, String(sum));
    check('no page errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
}
// ---- Copy-to-Word: clipboard carries a text/html <table> + TSV ----
{
    const { ctx, page, errs } = await open('cg_bar_labels.html');
    console.log('Copy-to-Word (cg_bar_labels): text/html table + text/plain TSV');
    await openStats(page);
    await page.evaluate(() => {
        window.__capHtml = null; window.__capTsv = null;
        document.addEventListener('copy', e => {
            try {
                window.__capHtml = e.clipboardData.getData('text/html');
                window.__capTsv = e.clipboardData.getData('text/plain');
            } catch (_) { }
        }, false);
        const b = document.querySelector('[data-st-act="copycgdesc"]');
        if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(120);
    const cap = await page.evaluate(() => ({ html: window.__capHtml, tsv: window.__capTsv }));
    check('clipboard carries an HTML <table>', !!cap.html && /<table[\s>]/i.test(cap.html), (cap.html || '').slice(0, 80));
    check('HTML table has <td> cells', !!cap.html && /<td/i.test(cap.html), '');
    check('HTML header carries the CI column', !!cap.html && /CI lower/i.test(cap.html), '');
    check('clipboard also carries TSV', !!cap.tsv && cap.tsv.indexOf('\t') >= 0, (cap.tsv || '').slice(0, 60));
    check('no page errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
}

await browser.close();
if (fails) { console.log('\nSIGMA-PARITY: ' + fails + ' CHECK(S) FAILED'); process.exit(1); }
console.log('\nSIGMA-PARITY: ALL CHECKS PASSED');
