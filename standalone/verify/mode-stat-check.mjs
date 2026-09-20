// Mode as a summary statistic (Sep 19 2026, Torry's item): in the Data
// workspace's variable summary and in the Sigma panel's Descriptives tables
// (Compare Groups / Repeated Measures, and Distribution). Convention:
// jamovi's, the most frequent value, the smallest when several tie; the
// tables print a dash when every value occurs once and an asterisk on a
// tie, the variable summary says the same in words.
//
// Cases: (1) a typed column with a clear mode, a tied column, and an
// all-distinct column in the Data workspace summary; (2) the Compare Groups
// Descriptives table has a Mode column whose cells match a mode computed
// independently here from the same cell values; (3) the Distribution
// Descriptives table too. CONTROL (main): every case red.
//
// Usage: node standalone/verify/mode-stat-check.mjs

import { createRequire } from 'node:module';
import path from 'node:path';

function loadPlaywright() {
    const bases = [];
    if (process.env.GB2_NODE_BASE) bases.push(process.env.GB2_NODE_BASE);
    bases.push(process.cwd(), new URL('.', import.meta.url).pathname, '/private/tmp', '/tmp');
    for (const b of bases) {
        try { return createRequire(path.join(b, 'x.js'))('playwright'); }
        catch { /* try the next shared dependency location */ }
    }
    console.error('playwright not found; cd /tmp && npm i playwright');
    process.exit(2);
}
const { chromium } = loadPlaywright();
const PAGE = 'file://' + (process.env.PS_PAGE
    ? path.resolve(process.env.PS_PAGE)
    : path.resolve(new URL('.', import.meta.url).pathname, '..', 'index.html'));
let failures = 0;
function ok(cond, label) { if (cond) console.log('  ok  ' + label); else { console.log('  FAIL ' + label); failures++; } }

// Independent reference: smallest of the most frequent values, null when
// every value occurs once, plus the tie count.
function refMode(vals) {
    const c = new Map(); for (const v of vals) c.set(v, (c.get(v) || 0) + 1);
    let best = 0; for (const n of c.values()) best = Math.max(best, n);
    const tied = [...c.entries()].filter(([, n]) => n === best).map(([v]) => v).sort((a, b) => a - b);
    return { value: tied[0], count: best, ties: tied.length };
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1470, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(String(e)));
await page.addInitScript(() => { try { localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); sessionStorage.setItem('psstandalone.welcome.dismissed', '1'); } catch (e) {} });
await page.goto(PAGE); await page.waitForTimeout(900);

// ---- 1. the Data workspace variable summary
const ds = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const S = window.PS_SHELL;
    // Three columns with known modes: clear (3), tied (1, 2 and 3 share the
    // top count), distinct (every value once).
    S.loadTable('mode probe', ['cond', 'clear', 'tied', 'distinct'],
        [['a', 2, 1, 1], ['a', 3, 1, 2], ['a', 3, 2, 3], ['b', 3, 2, 4], ['b', 5, 3, 5], ['b', 5, 3, 6]],
        { cond: 'nominal', clear: 'continuous', tied: 'continuous', distinct: 'continuous' });
    await s(800);
    S.setWorkspace('data'); await s(400);
    const out = {};
    for (const col of ['clear', 'tied', 'distinct']) {
        S.selectVariable(col);
        await s(300);
        const stat = Array.from(document.querySelectorAll('*')).find(e => e.children.length <= 2 && /^Mode/.test((e.textContent || '').trim()) && e.textContent.trim().length < 60);
        out[col] = stat ? stat.textContent.replace(/\s+/g, ' ').trim() : '';
    }
    return out;
});
ok(/Mode\s*3(\.0*)?\b/.test(ds.clear) && !/tie|distinct/.test(ds.clear), '1: a clear mode shows its value (' + ds.clear + ')');
ok(/Mode\s*1\b.*3 values tie/.test(ds.tied), '1: a three-way tie shows the smallest and says how many tie (' + ds.tied + ')');
ok(/none \(every value is distinct\)/.test(ds.distinct), '1: an all-distinct column says there is no mode (' + ds.distinct + ')');

// ---- 2. Compare Groups Sigma Descriptives
const cg = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const S = window.PS_SHELL;
    S.setWorkspace('chart'); S.setModule('plotbuilder');
    S.setRoles('plotbuilder', { xvar: 'cond', yvar: 'clear' });
    await s(1800);
    const btn = document.querySelector('#psroot button[aria-label="Statistics"]'); if (btn) btn.click();
    await s(900);
    const tab = Array.from(document.querySelectorAll('[data-gb2-inspector] button')).find(b => /^Descriptives$/.test((b.textContent || '').trim())); if (tab) tab.click();
    await s(500);
    const pane = document.querySelector('[data-gb2-inspector] [data-st-pane="desc"]') || document.querySelector('[data-gb2-inspector]');
    const table = pane.querySelector('table');
    if (!table) return { heads: [], rows: [] };
    const heads = Array.from(table.querySelectorAll('th')).map(t => t.textContent.trim());
    const rows = Array.from(table.querySelectorAll('tbody tr, tr')).map(r => Array.from(r.querySelectorAll('td')).map(td => td.textContent.trim())).filter(r => r.length);
    const foot = pane.textContent;
    return { heads, rows, foot };
});
const modeIdx = cg.heads.indexOf('Mode');
ok(modeIdx > 0 && cg.heads[modeIdx - 1] === 'Median', '2: the Compare Groups Descriptives table has a Mode column after Median (' + cg.heads.join(',') + ')');
const cellIdx = cg.heads.indexOf('Cell');
const expect = { a: refMode([2, 3, 3]), b: refMode([3, 5, 5]) };
const gotA = cg.rows.find(r => r[cellIdx] === 'a'), gotB = cg.rows.find(r => r[cellIdx] === 'b');
ok(gotA && Number(gotA[modeIdx]) === expect.a.value && gotB && Number(gotB[modeIdx]) === expect.b.value,
   '2: the Mode cells match an independent computation (a=' + (gotA && gotA[modeIdx]) + ', b=' + (gotB && gotB[modeIdx]) + ')');
ok(/most frequent value/.test(cg.foot || ''), '2: the footnote explains the dash and the asterisk');

// ---- 3. Distribution Sigma Descriptives, with a tie and an all-distinct cell
const dist = await page.evaluate(async () => {
    const s = ms => new Promise(r => setTimeout(r, ms));
    const S = window.PS_SHELL;
    S.setModule('distplotbuilder');
    S.setRoles('distplotbuilder', { var: 'distinct' });
    await s(1800);
    const btn = document.querySelector('#psroot button[aria-label="Statistics"]'); if (btn) btn.click();
    await s(900);
    const tab = Array.from(document.querySelectorAll('[data-gb2-inspector] button')).find(b => /^Descriptives$/.test((b.textContent || '').trim())); if (tab) tab.click();
    await s(500);
    const pane = document.querySelector('[data-gb2-inspector] [data-st-pane="desc"]') || document.querySelector('[data-gb2-inspector]');
    const table = pane.querySelector('table');
    if (!table) return { heads: [], rows: [] };
    const heads = Array.from(table.querySelectorAll('th')).map(t => t.textContent.trim());
    const rows = Array.from(table.querySelectorAll('tr')).map(r => Array.from(r.querySelectorAll('td')).map(td => td.textContent.trim())).filter(r => r.length);
    return { heads, rows };
});
const dIdx = dist.heads.indexOf('Mode');
ok(dIdx > 0 && dist.heads[dIdx - 1] === 'Median', '3: the Distribution Descriptives table has a Mode column after Median (' + dist.heads.join(',') + ')');
ok(dist.rows.length >= 1 && /^—$/.test(dist.rows[0][dIdx] || ''), '3: an all-distinct variable shows a dash for its mode (' + (dist.rows[0] && dist.rows[0][dIdx]) + ')');
ok(errors.length === 0, 'no page errors' + (errors.length ? ' (' + errors[0] + ')' : ''));
await browser.close();
console.log(failures ? 'mode-stat: FAIL (' + failures + ')' : 'mode-stat: PASS');
process.exit(failures ? 1 : 0);
