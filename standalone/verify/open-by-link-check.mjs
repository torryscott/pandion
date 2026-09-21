// Open by link (Sep 21 2026, Torry's "pipeline into the program"): the app
// arrives with ?data=<url>, ?project=<url> or ?example=<id>. What this pins:
//   1. ?data=: a confirmation card names the host and shows the url, the
//      welcome stays away; Open fetches the CSV in the browser and it lands
//      as the project's table, the provenance line says where it came
//      from, and the query is gone from the address bar;
//   2. Not now: nothing is fetched, the welcome shows, the query is gone;
//   3. ?project=: a .pand file opens with its charts, name and provenance;
//   4. a non-http link is ignored (no card, the welcome shows);
//   5. a server error and a blocked fetch each leave a plain message in the
//      card, with Open still usable;
//   6. an oversized file is refused before it is read;
//   7. ?example=<id> opens the built-in example with no card.
// The remote files are served by Playwright's request interception, with
// the CORS header a public host would send, so the probe needs no network.
// CONTROL (main): case 1 fails at the first assertion (no card).
//
// Usage: node standalone/verify/open-by-link-check.mjs

import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

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
const HERE = new URL('.', import.meta.url).pathname;
const PAGE = 'file://' + (process.env.PS_PAGE ? path.resolve(process.env.PS_PAGE) : path.resolve(HERE, '..', 'index.html'));
let failures = 0;
function ok(cond, label) { if (cond) console.log('  ok  ' + label); else { console.log('  FAIL ' + label); failures++; } }

const CSV = 'group,score,hours\nA,12,3.1\nA,15,2.8\nB,20,4.4\nB,22,4.9\nC,30,6.0\n';
const PAND_PATH = fs.readdirSync(path.join(HERE, 'corpus')).filter(f => f.endsWith('.pand')).sort().pop();
const PAND = fs.readFileSync(path.join(HERE, 'corpus', PAND_PATH), 'utf8');
let pandName = '';
try { const j = JSON.parse(PAND); pandName = (j.snapshot && j.snapshot.name) || j.name || ''; } catch (e) {}

const browser = await chromium.launch();
async function boot(query, routes) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); sessionStorage.clear(); } catch (e) {} });
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.route('https://example.test/**', async (route) => {
        const u = route.request().url();
        const r = routes && routes[u.slice('https://example.test'.length)];
        if (!r) return route.fulfill({ status: 404, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'no' });
        if (r.abort) return route.abort('failed');
        return route.fulfill({ status: r.status || 200, headers: Object.assign({ 'Access-Control-Allow-Origin': '*', 'Content-Type': r.type || 'text/csv' }, r.headers || {}), body: r.body || '' });
    });
    await page.goto(PAGE + (query || '')); await page.waitForTimeout(1100);
    return { ctx, page, errors };
}
const state = () => page => page.evaluate(() => {
    const S = window.PS_SHELL, d = document.getElementById('ps-openlink-dialog');
    return { card: d.style.display === 'flex', host: document.getElementById('ps-openlink-host').textContent, url: document.getElementById('ps-openlink-url').textContent, status: document.getElementById('ps-openlink-status').textContent, welcome: document.getElementById('ps-welcome').style.display === 'flex', query: location.search, cols: S.project.table ? S.project.table.order.slice() : null, name: S.project.name, charts: S.project.charts.length, source: S.project.sourceUrl || '', detail: document.getElementById('ps-doc-detail').textContent.trim() };
});

// ---- 1. ?data= with a CSV
{
    const { ctx, page, errors } = await boot('?data=https://example.test/lab/scores.csv', { '/lab/scores.csv': { body: CSV } });
    let s = await state()(page);
    ok(s.card && !s.welcome && s.host === 'example.test' && s.url === 'https://example.test/lab/scores.csv', '1: the card names the host and the link, and the welcome stays away (' + s.host + ')');
    await page.click('#ps-openlink-open'); await page.waitForTimeout(1200);
    // A fetched CSV rides the ordinary import path, which previews the
    // parse (delimiter, first row, types) before it is used: two clicks.
    const preview = await page.evaluate(() => { const u = document.getElementById('ps-import-use'); const l = document.getElementById('ps-loader'); return { loader: !!l && l.style.display !== 'none' && getComputedStyle(l).display !== 'none', use: !!u && u.style.display !== 'none', rows: document.querySelectorAll('#ps-import-preview tr').length }; });
    ok(!(await state()(page)).card && preview.loader && preview.use && preview.rows >= 3, '1: Open fetches the CSV into the import preview (' + preview.rows + ' preview rows)');
    await page.click('#ps-import-use'); await page.waitForTimeout(900);
    s = await state()(page);
    ok(s.cols && s.cols.join(',') === 'group,score,hours', '1: Use this data makes it the table (' + (s.cols || []).join(',') + ')');
    ok(s.source === 'https://example.test/lab/scores.csv' && /from example\.test/.test(s.detail), '1: the project remembers its source and the detail line says so (' + s.detail + ')');
    ok(s.query === '', '1: the query is gone from the address bar after opening');
    ok(errors.length === 0, '1: no page errors' + (errors.length ? ' (' + errors[0] + ')' : ''));
    await ctx.close();
}
// ---- 2. Not now
{
    const { ctx, page } = await boot('?data=https://example.test/lab/scores.csv', { '/lab/scores.csv': { body: CSV } });
    const before = await state()(page);
    await page.click('#ps-openlink-cancel'); await page.waitForTimeout(400);
    const s = await state()(page);
    ok(before.card && !s.card && s.welcome && s.query === '' && s.cols.join(',') !== 'group,score,hours', '2: Not now keeps the current project, shows the welcome, and drops the query');
    await ctx.close();
}
// ---- 3. ?project= with a .pand file
{
    const { ctx, page, errors } = await boot('?project=https://example.test/course/week3.pand', { '/course/week3.pand': { body: PAND, type: 'application/json' } });
    let s = await state()(page);
    ok(s.card && /project/i.test(await page.textContent('#ps-openlink-title')), '3: the card says it is a project file');
    await page.click('#ps-openlink-open'); await page.waitForTimeout(1500);
    s = await state()(page);
    ok(!s.card && s.charts >= 1 && s.source === 'https://example.test/course/week3.pand' && /from example\.test/.test(s.detail), '3: the project opens with its charts and provenance, unsaved (' + s.name + ', ' + s.charts + ' documents, ' + s.detail + ')');
    ok(errors.length === 0, '3: no page errors' + (errors.length ? ' (' + errors[0] + ')' : ''));
    await ctx.close();
}
// ---- 4. a non-http link is ignored
{
    const { ctx, page } = await boot('?data=javascript:alert(1)');
    const s = await state()(page);
    ok(!s.card && s.welcome, '4: a javascript: link is ignored and the welcome shows as usual');
    await ctx.close();
}
// ---- 5. a server error, then a blocked fetch
{
    const { ctx, page } = await boot('?data=https://example.test/missing.csv', { '/missing.csv': { status: 404, body: 'gone' } });
    await page.click('#ps-openlink-open'); await page.waitForTimeout(800);
    let s = await state()(page);
    ok(s.card && /answered 404/.test(s.status) && !(await page.evaluate(() => document.getElementById('ps-openlink-open').disabled)), '5: a server error is reported in the card and Open is usable again (' + s.status + ')');
    await ctx.close();
    const b = await boot('?data=https://example.test/blocked.csv', { '/blocked.csv': { abort: true } });
    await b.page.click('#ps-openlink-open'); await b.page.waitForTimeout(800);
    s = await state()(b.page);
    ok(s.card && /Could not fetch it from example\.test/.test(s.status) && /CORS/.test(s.status), '5: a blocked fetch names the host and the likely cause (' + s.status.slice(0, 50) + '...)');
    await b.ctx.close();
}
// ---- 6. oversized
{
    const { ctx, page } = await boot('?data=https://example.test/huge.csv', { '/huge.csv': { body: CSV, headers: { 'Content-Length': String(400 * 1024 * 1024) } } });
    await page.click('#ps-openlink-open'); await page.waitForTimeout(800);
    const s = await state()(page);
    ok(s.card && /too large/.test(s.status) && s.cols.join(',') !== 'group,score,hours', '6: an oversized file is refused before it is read (' + s.status.slice(0, 40) + '...)');
    await ctx.close();
}
// ---- 7. ?example=
{
    const { ctx, page, errors } = await boot('?example=wellbeing');
    const s = await state()(page);
    ok(!s.card && !s.welcome && /wellbeing/i.test(s.name) && s.query === '', '7: a built-in example opens straight away with no card (' + s.name + ')');
    ok(errors.length === 0, '7: no page errors' + (errors.length ? ' (' + errors[0] + ')' : ''));
    await ctx.close();
}
// ---- 8. the welcome's From a link (New project shows the welcome)
{
    const { ctx, page, errors } = await boot('', { '/lab/scores.csv': { body: CSV } });
    let s = await state()(page);
    const action = await page.evaluate(() => { const b = document.getElementById('ps-welcome-link'); const r = b && b.getBoundingClientRect(); return b ? { text: b.textContent.replace(/\s+/g, ' ').trim(), visible: r.width > 0 } : null; });
    ok(s.welcome && action && action.visible && /From a link/.test(action.text), '8: the welcome offers From a link (' + (action && action.text.slice(0, 40)) + ')');
    await page.click('#ps-welcome-link'); await page.waitForTimeout(400);
    const dlg = await page.evaluate(() => ({ open: document.getElementById('ps-linkopen-dialog').style.display === 'flex', focused: document.activeElement && document.activeElement.id, welcome: document.getElementById('ps-welcome').style.display === 'flex' }));
    ok(dlg.open && dlg.focused === 'ps-linkopen-url' && !dlg.welcome, '8: it opens the link dialog with the box focused and the welcome away');
    await page.fill('#ps-linkopen-url', 'not a link'); await page.click('#ps-linkopen-open'); await page.waitForTimeout(300);
    const bad = await page.evaluate(() => ({ status: document.getElementById('ps-linkopen-status').textContent, open: document.getElementById('ps-linkopen-dialog').style.display === 'flex' }));
    ok(bad.open && /full link/.test(bad.status), '8: a non-link is refused in place (' + bad.status + ')');
    await page.fill('#ps-linkopen-url', 'https://example.test/lab/scores.csv'); await page.keyboard.press('Enter'); await page.waitForTimeout(1200);
    const prev = await page.evaluate(() => { const u = document.getElementById('ps-import-use'); return { open: document.getElementById('ps-linkopen-dialog').style.display === 'flex', use: !!u && u.style.display !== 'none' }; });
    ok(!prev.open && prev.use, '8: Enter fetches the file into the import preview');
    await page.click('#ps-import-use'); await page.waitForTimeout(900);
    s = await state()(page);
    ok(s.cols && s.cols.join(',') === 'group,score,hours' && /from example\.test/.test(s.detail), '8: and it becomes the table with its provenance (' + s.detail + ')');
    ok(errors.length === 0, '8: no page errors' + (errors.length ? ' (' + errors[0] + ')' : ''));
    await ctx.close();
}
// ---- 9. Cancel returns to the welcome
{
    const { ctx, page } = await boot('');
    await page.click('#ps-welcome-link'); await page.waitForTimeout(300);
    await page.click('#ps-linkopen-cancel'); await page.waitForTimeout(300);
    const s = await state()(page);
    ok(s.welcome && !(await page.evaluate(() => document.getElementById('ps-linkopen-dialog').style.display === 'flex')), '9: Cancel closes the dialog and brings the welcome back');
    await ctx.close();
}
await browser.close();
console.log(failures ? 'open-by-link: FAIL (' + failures + ')' : 'open-by-link: PASS');
process.exit(failures ? 1 : 0);
