// Chart setups (Sep 23 2026): a setup is a project with the rows taken out,
// opened with a data file by link (?config=<setup>&data=<file>, ?config=
// alone when the setup names its data, or ?data=<file>#setup=<packed>) or
// from a file. What this pins:
//   1. ?config=&data=: the card names both parts; Open lands on the chart:
//      the setup's rename (from), types, level order, per-column missing
//      code, dataset missing codes, a numeric and a text formula (types
//      inferred from their results), a filter, and a short-form chart
//      (analysis, roles, type, title) all apply; provenance names the data
//      host and remembers the setup; the address is cleaned;
//   2. ?config= alone fetches the data the setup names;
//   3. &data= wins over the setup's own data address;
//   4. a file missing a needed column opens the matching dialog: a close
//      name is pre-picked, a picked column fills the role, and Leave it out
//      leaves the role empty;
//   5. File > Save chart setup writes the setup (no rows, the rename kept
//      as from, the data address) and it round-trips through ?config=;
//   6. Share a link offers the setup-only link for a project from a data
//      link; it is far shorter than the full link and reopens the same
//      charts; the source line copies the setup + data link;
//   7. Copy as a hyperlink writes rich text with the link behind the words
//      and the bare link as plain text;
//   8. errors: a setup that answers 404, one that is not JSON, one of the
//      wrong kind, and one that names no data with no &data=;
//   9. a setup file opened from disk: with no data named it is applied to
//      the data already open; with data named it goes through the card;
//  10. provenance: a reload keeps the linked project's host, and an example
//      opened after a linked project (10b: straight after it) no longer
//      says "from" the old host;
//  11. a hostile column name in a setup renders as text in the dialog;
//  12. a setup saved by an older version gets the numerical-changes notice,
//      while one that states no version (written by hand) does not (1);
//  13. an Excel file opens through a setup, read.sheet picks the sheet, and
//      a sheet the workbook lacks falls back to the first one and says so;
//  14. missing-value codes: a column's own codes ADD to the dataset codes
//      (so NA stays missing beside them, 1), and a column where a dataset
//      code is a real value saves it as notMissing, so Save chart setup
//      round-trips exactly.
// CONTROL (main at 562c279): 25 failures. Case 1 fails at its first
// assertion (main offers a plain data card and opens the CSV as data), every
// setup case follows, a reload keeps no host (10), and an example opened
// straight after a linked project still claims the old host (10b). The one
// case-10 example assertion that passes on main passes only because main has
// already lost the host on reload; 10b is the real control for it.
// CONTROL 2 (this branch with its eight review fixes undone in a copy): 13
// failures, each fix's own assertions and nothing else: the card's
// both-files line, the false numerical-changes notice (1 and 6) and the saved
// setup's version stamp, the formula type dry run, the share dialog's privacy
// line, the matching dialog's wording, the open table's kept types and codes,
// the missing-sheet note, and additive missing codes (1: without it NA became
// a third condition; 14: no notMissing).
//
// Usage: node standalone/verify/setup-link-check.mjs

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

const T = 'https://example.test/';
const CSV = 'participant,condition,rt_ms,accuracy\n' +
    'p1,congruent,512,0.95\np1,incongruent,640,0.92\n' +
    'p2,congruent,498,0.97\np2,incongruent,-1,0.91\n' +
    'p3,NA,530,0.60\np3,incongruent,701,0.55\n' +
    'p4,congruent,505,NA\np4,incongruent,655,0.93\n';
const CSV_RT = CSV.replace('rt_ms', 'RT');                     // the needed column under another name
const CSV_CLOSE = CSV.replace('rt_ms', 'reaction_time');       // a close name the dialog should pre-pick
const SETUP = {
    kind: 'pandion-plots-setup', formatVersion: 1, name: 'Stroop effect',
    read: { missing: ['NA'] },
    columns: [
        { name: 'Reaction time', from: 'rt_ms', type: 'continuous', missing: ['-1'] },
        { name: 'condition', type: 'nominal', levels: ['incongruent', 'congruent'], missing: ['none'] },
        { name: 'accuracy', type: 'continuous' },
        { name: 'rt_seconds', formula: '`Reaction time` / 1000' },
        { name: 'acc_band', formula: 'IF(accuracy >= 0.9, "high", "low")' }
    ],
    filters: [{ column: 'accuracy', op: '>=', value: 0.8 }],
    charts: [{ analysis: 'Compare Groups', roles: { xvar: 'condition', yvar: 'Reaction time' }, type: 'box', title: 'Stroop interference' }]
};
const SETUP_NAMED = Object.assign({}, SETUP, { data: T + 'named/stroop.csv' });
const SETUP_BADDATA = Object.assign({}, SETUP, { data: T + 'gone/stroop.csv' });
const SETUP_OLD = Object.assign({}, SETUP, { appVersion: '3.1.1' });
const XLSX = fs.readFileSync(path.resolve(HERE, 'fixtures', 'import-fixture.xlsx'));
const SETUP_XLSX = { kind: 'pandion-plots-setup', formatVersion: 1, name: 'Excel study',
    charts: [{ analysis: 'Compare Groups', roles: { xvar: 'group', yvar: 'score' }, type: 'bar' }] };
const SETUP_SHEET = { kind: 'pandion-plots-setup', formatVersion: 1, name: 'Second sheet', read: { sheet: 'extra' },
    charts: [{ analysis: 'Frequencies', roles: { var: 'id' }, type: 'bar' }] };
const SETUP_NOSHEET = Object.assign({}, SETUP_XLSX, { name: 'No such sheet', read: { sheet: 'results' } });
const HOSTILE = { kind: 'pandion-plots-setup', formatVersion: 1, name: 'x',
    charts: [{ analysis: 'Compare Groups', roles: { xvar: 'condition', yvar: '<img src=x onerror="window.__xss=1">' } }] };

async function run(label, fn) {
    try { await fn(); }
    catch (e) { console.log('  FAIL ' + label + ': the case stopped early: ' + String((e && e.message) || e).split('\n')[0]); failures++; }
}
const browser = await chromium.launch();
const served = {};   // extra files a case publishes at example.test
async function boot(query, opts) {
    const ctx = await browser.newContext({ acceptDownloads: true });
    const page = await ctx.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(8000);
    page.on('filechooser', () => {}); // Playwright dismisses an unhandled file chooser and Chromium reports that as cancel, which the app honours; a listener keeps the chooser open
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(() => {
        try { if (!sessionStorage.getItem('__keep')) { localStorage.clear(); sessionStorage.clear(); } localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); } catch (e) {}
        try { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }); } catch (e) {}
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
            writeText: t => { window.__copied = t; return Promise.resolve(); },
            write: async items => { const it = items[0]; window.__copiedHtml = await (await it.getType('text/html')).text(); window.__copiedText = await (await it.getType('text/plain')).text(); }
        } });
    });
    await page.route('https://example.test/**', async route => {
        const u = route.request().url().slice(T.length).split('?')[0];
        const cors = { 'Access-Control-Allow-Origin': '*' };
        const files = Object.assign({
            'lab/stroop.csv': CSV, 'named/stroop.csv': CSV, 'lab/stroop-rt.csv': CSV_RT, 'lab/stroop-close.csv': CSV_CLOSE,
            'setups/stroop.setup.json': JSON.stringify(SETUP), 'setups/named.setup.json': JSON.stringify(SETUP_NAMED),
            'setups/baddata.setup.json': JSON.stringify(SETUP_BADDATA), 'setups/notjson.setup.json': 'this is not json',
            'setups/wrongkind.json': JSON.stringify({ kind: 'something-else' }), 'setups/hostile.setup.json': JSON.stringify(HOSTILE),
            'setups/old.setup.json': JSON.stringify(SETUP_OLD),
            'setups/xlsx.setup.json': JSON.stringify(SETUP_XLSX), 'setups/sheet.setup.json': JSON.stringify(SETUP_SHEET),
            'setups/nosheet.setup.json': JSON.stringify(SETUP_NOSHEET), 'lab/study.xlsx': XLSX
        }, served);
        if (files[u] == null) return route.fulfill({ status: 404, headers: cors, body: 'no' });
        const ctype = u.endsWith('.json') ? 'application/json' : u.endsWith('.xlsx')
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv';
        return route.fulfill({ status: 200, headers: Object.assign({ 'Content-Type': ctype }, cors), body: files[u] });
    });
    await page.goto(PAGE + (query || '')); await page.waitForTimeout(1200);
    return { ctx, page, errors };
}
const st = page => page.evaluate(() => {
    const S = window.PS_SHELL, P = S.project, t = P.table, c = P.charts[0] || {};
    const opts = (c.options && c.options[c.module]) || {};
    let spec = {}; try { spec = opts.chartSpec ? JSON.parse(opts.chartSpec) : {}; } catch (e) {}
    const vis = e => !!e && e.getClientRects().length > 0;
    return {
        card: document.getElementById('ps-openlink-dialog').style.display === 'flex',
        cardTitle: document.getElementById('ps-openlink-title').textContent,
        cardHost: document.getElementById('ps-openlink-host').textContent,
        cardUrl: document.getElementById('ps-openlink-url').textContent,
        cardStatus: document.getElementById('ps-openlink-status').textContent,
        privacy: (document.getElementById('ps-openlink-privacy') || {}).textContent || '',
        foot: (document.querySelector('#ps-share-dialog .ps-share-foot') || {}).textContent || '',
        notice: document.body.innerText.indexOf('recomputed under version') !== -1,
        missingByCol: t ? JSON.parse(JSON.stringify(t.missingTokensByCol || {})) : {},
        mapOpen: !!document.getElementById('ps-setup-map-dialog') && document.getElementById('ps-setup-map-dialog').style.display === 'flex',
        name: P.name, order: t ? t.order.slice() : [], types: t ? Object.assign({}, t.types) : {},
        levels: t && t.levels ? (t.levels.condition || []).slice() : [],
        rt: t && t.columns ? (t.columns['Reaction time'] || []).slice() : [],
        rawSec: t && t.raw ? (t.raw.rt_seconds || []).slice() : [], rawBand: t && t.raw ? (t.raw.acc_band || []).slice() : [],
        acc: t && t.columns ? (t.columns.accuracy || []).slice() : [],
        filters: t ? JSON.parse(JSON.stringify(t.filters || [])) : [], masked: t && t.filterMask ? t.filterMask.filter(Boolean).length : 0,
        sourceNames: t && t.sourceNames ? Object.assign({}, t.sourceNames) : {},
        module: c.module, roles: (c.roles && c.roles[c.module]) || {}, graphType: opts.graphType, title: spec.chartTitle,
        boxes: document.querySelectorAll('[data-role="box-fill"]').length,
        detail: document.getElementById('ps-doc-detail').textContent.trim(),
        src: P.sourceUrl || '', setupUrl: P.setupUrl || '', query: location.search, hash: location.hash,
        welcome: document.getElementById('ps-welcome').style.display === 'flex', copied: window.__copied || '',
        html: window.__copiedHtml || '', text: window.__copiedText || '', setupOnlyShown: vis(document.getElementById('ps-share-setuponly-row')),
        srcLine: document.getElementById('ps-share-source').hidden ? '' : document.getElementById('ps-share-source').textContent
    };
});

// ---- 1. ?config=&data=
await run('1. ?config=&data=', async () => {
    const { ctx, page, errors } = await boot('?config=' + T + 'setups/stroop.setup.json&data=' + T + 'lab/stroop.csv');
    let s = await st(page);
    ok(s.card && /chart setup/.test(s.cardTitle) && s.cardHost === 'example.test' && /Setup: https:\/\/example\.test\/setups\/stroop\.setup\.json/.test(s.cardUrl) && /Data: https:\/\/example\.test\/lab\/stroop\.csv/.test(s.cardUrl) && /fetches both files/.test(s.privacy), '1: the card names the setup and the data, and says both files are fetched (' + s.cardTitle + ')');
    await page.click('#ps-openlink-open'); await page.waitForTimeout(2500);
    s = await st(page);
    ok(!s.card && !s.mapOpen && s.name === 'Stroop effect', '1: Open lands straight on the project, no matching needed (' + s.name + ')');
    ok(!s.notice, '1: a setup that states no version opens without the numerical-changes notice');
    ok(JSON.stringify(s.order) === JSON.stringify(['participant', 'condition', 'Reaction time', 'accuracy', 'rt_seconds', 'acc_band']) && s.sourceNames['Reaction time'] === 'rt_ms', '1: rt_ms arrives as Reaction time, remembered as its source, and the formulas join (' + s.order.join(',') + ')');
    ok(s.types['Reaction time'] === 'continuous' && s.types.condition === 'nominal' && s.types.rt_seconds === 'continuous' && s.types.acc_band === 'nominal', '1: stated types apply and each formula takes the type of its results (' + s.types.rt_seconds + ', ' + s.types.acc_band + ')');
    ok(JSON.stringify(s.levels) === '["incongruent","congruent"]', '1: the level order comes from the setup, and NA stays missing beside a column\'s own code (' + s.levels.join(',') + ')');
    ok(JSON.stringify(s.missingByCol.condition) === '["NA","none"]' && JSON.stringify(s.missingByCol['Reaction time']) === '["NA","-1"]', '1: a column\'s codes add to the dataset codes (' + JSON.stringify(s.missingByCol) + ')');
    ok(s.rt[3] === null && s.rt[0] === 512 && s.acc[6] === null, '1: the per-column code -1 and the dataset code NA both read as missing');
    ok(s.rawSec[0] === '0.512' && s.rawBand[0] === 'high' && s.rawBand[4] === 'low', '1: the formulas computed (' + s.rawSec[0] + ', ' + s.rawBand[0] + ', ' + s.rawBand[4] + ')');
    ok(s.filters.length === 1 && s.filters[0].col === 'accuracy' && s.filters[0].op === 'ge' && s.masked === 3, '1: the filter applies, leaving out the three rows under 0.8 or missing (' + s.masked + ')');
    ok(s.module === 'plotbuilder' && s.roles.xvar === 'condition' && s.roles.yvar === 'Reaction time' && s.graphType === 'box' && s.title === 'Stroop interference' && s.boxes > 0, '1: the short-form chart opens as a titled box plot of the setup\'s roles (' + s.boxes + ' boxes)');
    ok(s.src === T + 'lab/stroop.csv' && s.setupUrl === T + 'setups/stroop.setup.json' && /from example\.test/.test(s.detail) && s.query === '' && s.hash === '', '1: provenance names the data host, the setup is remembered, the address is clean (' + s.detail + ')');
    ok(errors.length === 0, '1: no page errors' + (errors.length ? ' (' + errors[0] + ')' : ''));
    // ---- 7 (here, on this project): Copy as a hyperlink from Share a link
    await page.evaluate(() => window.PS_SHELL.shareLink()); await page.waitForTimeout(900);
    await page.click('#ps-share-carry-copyhl'); await page.waitForTimeout(300);
    s = await st(page);
    const link = await page.evaluate(() => document.getElementById('ps-share-carry-link').value);
    ok(s.text === link && s.html.indexOf('<a href="') === 0 && s.html.indexOf('>Open Stroop effect in Pandion Plots</a>') > 0 && s.html.indexOf(link.replace(/&/g, '&amp;')) > 0, '7: Copy as a hyperlink writes the link behind the words, and the bare link as plain text');
    // ---- 6: the source line copies the setup + data link
    ok(/chart setup from example\.test and data from example\.test/.test(s.srcLine), '6: the source line names the setup and the data (' + s.srcLine.slice(0, 70) + ')');
    await page.click('#ps-share-source-copy'); await page.waitForTimeout(200);
    s = await st(page);
    ok(s.copied === PAGE + '?config=' + T + 'setups/stroop.setup.json&data=' + T + 'lab/stroop.csv', '6: and it copies the link that opens both (' + s.copied.slice(PAGE.length) + ')');
    // ---- 6: the setup-only carried link
    ok(s.setupOnlyShown && s.foot === 'Anyone who has the link has the data.', '6: the setup-only choice is offered for a project whose data came from a link');
    const full = link;
    await page.check('#ps-share-setuponly'); await page.waitForTimeout(900);
    const setupLink = await page.evaluate(() => document.getElementById('ps-share-carry-link').value);
    const sizeLine = await page.evaluate(() => document.getElementById('ps-share-carry-size').textContent);
    const footOn = (await st(page)).foot;
    ok(/^The link carries no rows\. Whoever opens it fetches the data from example\.test\.$/.test(footOn), '6: with it ticked, the privacy line says the link carries no rows (' + footOn + ')');
    ok(setupLink.indexOf(PAGE + '?data=' + T + 'lab/stroop.csv#setup=') === 0 && setupLink.length < full.length && /data stays at example\.test/.test(sizeLine), '6: it is a ?data= link with the setup after the #, shorter than the full link (' + setupLink.length + ' vs ' + full.length + ')');
    // ---- 5: Save chart setup
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    await page.click('[data-ps-menu="file"]'); await page.waitForTimeout(300);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#ps-appmenu [data-app-command="save-setup"]')]);
    const saved = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    const rtCol = (saved.columns || []).find(c => c.name === 'Reaction time') || {};
    const cond = (saved.columns || []).find(c => c.name === 'condition') || {};
    const sec = (saved.columns || []).find(c => c.name === 'rt_seconds') || {};
    ok(JSON.stringify(saved.read.missing) === '["NA"]' && JSON.stringify(cond.missing) === '["none"]' && !rtCol.notMissing, '5: the saved codes are the dataset list plus what each column adds (' + JSON.stringify(saved.read) + ')');
    ok(/\.setup\.json$/.test(dl.suggestedFilename()) && saved.kind === 'pandion-plots-setup' && saved.data === T + 'lab/stroop.csv' && rtCol.from === 'rt_ms' && rtCol.missing && rtCol.missing[0] === '-1' && JSON.stringify(cond.levels) === '["incongruent","congruent"]' && sec.formula === '`Reaction time` / 1000' && saved.filters.length === 1, '5: Save chart setup writes the setup: the rename as from, codes, levels, formulas, filter, data address (' + dl.suggestedFilename() + ')');
    ok(typeof saved.appVersion === 'string' && Array.isArray(saved.numericalChanges) && saved.numericalChanges.length > 0, '5: the saved setup states the version and numerical changes it was made under');
    ok(JSON.stringify(saved).indexOf('"raw"') === -1 && JSON.stringify(saved).indexOf('p3') === -1 && saved.charts.length === 1 && saved.charts[0].module === 'plotbuilder', '5: and it carries no rows, only the charts');
    served['saved/stroop.setup.json'] = JSON.stringify(saved);
    await ctx.close();
    // round trip through ?config= alone (the saved setup names its data)
    const b = await boot('?config=' + T + 'saved/stroop.setup.json');
    await b.page.click('#ps-openlink-open'); await b.page.waitForTimeout(2500);
    let r = await st(b.page);
    ok(r.name === 'Stroop effect' && r.roles.yvar === 'Reaction time' && r.graphType === 'box' && r.title === 'Stroop interference' && r.boxes > 0 && r.masked === 3, '5: the saved setup reopens the same chart through ?config= (' + r.boxes + ' boxes)');
    await b.ctx.close();
    // the setup-only link reopens the charts
    const c2 = await boot(setupLink.slice(PAGE.length));
    r = await st(c2.page);
    ok(r.card && /carried in this link/.test(r.cardUrl) && /fetches the data file/.test(r.privacy), '6: the setup-only link shows the card with the setup carried in the link');
    await c2.page.click('#ps-openlink-open'); await c2.page.waitForTimeout(2500);
    r = await st(c2.page);
    ok(r.roles.yvar === 'Reaction time' && r.graphType === 'box' && r.boxes > 0 && r.src === T + 'lab/stroop.csv' && r.hash === '' && !r.notice, '6: and opens the same chart on the data from its source, with no notice');
    await c2.ctx.close();
});
// ---- 2 and 3: the setup's own data address, and &data= winning over it
await run("2 and 3: the setup's own data address, and &data= winning over it", async () => {
    const { ctx, page } = await boot('?config=' + T + 'setups/named.setup.json');
    let s = await st(page);
    ok(s.card && /named inside the setup/.test(s.cardUrl), '2: a setup that names its data says so on the card');
    await page.click('#ps-openlink-open'); await page.waitForTimeout(2500);
    s = await st(page);
    ok(s.name === 'Stroop effect' && s.src === T + 'named/stroop.csv' && s.boxes > 0, '2: ?config= alone fetches the data the setup names (' + s.src.slice(T.length) + ')');
    await ctx.close();
    const b = await boot('?config=' + T + 'setups/baddata.setup.json&data=' + T + 'lab/stroop.csv');
    await b.page.click('#ps-openlink-open'); await b.page.waitForTimeout(2500);
    s = await st(b.page);
    ok(s.name === 'Stroop effect' && s.src === T + 'lab/stroop.csv', '3: &data= wins over the setup\'s own (missing) data address');
    await b.ctx.close();
});
// ---- 4: matching a missing column
await run('4: matching a missing column', async () => {
    const { ctx, page } = await boot('?config=' + T + 'setups/stroop.setup.json&data=' + T + 'lab/stroop-rt.csv');
    await page.click('#ps-openlink-open'); await page.waitForTimeout(2000);
    let s = await st(page);
    const rows = await page.evaluate(() => Array.from(document.querySelectorAll('#ps-setup-map-rows select')).map(x => ({ exp: x.getAttribute('data-setup-expected'), val: x.value, opts: Array.from(x.options).map(o => o.value) })));
    const note4 = await page.evaluate(() => (document.querySelector('#ps-setup-map-rows .ps-finddata-meta') || {}).textContent || '');
    ok(/Continuous \u00b7 the setup looks for rt_ms/.test(note4), '4: the row says what the setup looks for (' + note4.trim() + ')');
    ok(s.mapOpen && !s.card && rows.length === 1 && rows[0].exp === 'Reaction time' && rows[0].val === '' && rows[0].opts.indexOf('RT') !== -1, '4: a missing needed column opens the matching dialog, offering the file\'s columns (' + JSON.stringify(rows[0] && rows[0].opts) + ')');
    await page.selectOption('#ps-setup-map-0', 'RT'); await page.click('#ps-setup-map-open'); await page.waitForTimeout(2000);
    s = await st(page);
    ok(!s.mapOpen && s.roles.yvar === 'Reaction time' && s.boxes > 0 && s.sourceNames['Reaction time'] === 'RT', '4: the picked column fills the role under the setup\'s name');
    await ctx.close();
    const b = await boot('?config=' + T + 'setups/stroop.setup.json&data=' + T + 'lab/stroop-close.csv');
    await b.page.click('#ps-openlink-open'); await b.page.waitForTimeout(2000);
    const pre = await b.page.evaluate(() => document.querySelector('#ps-setup-map-0') && document.querySelector('#ps-setup-map-0').value);
    ok(pre === 'reaction_time', '4: a close name is pre-picked (' + pre + ')');
    await b.page.selectOption('#ps-setup-map-0', ''); await b.page.click('#ps-setup-map-open'); await b.page.waitForTimeout(2000);
    s = await st(b.page);
    ok(!s.mapOpen && s.name === 'Stroop effect' && !s.roles.yvar && s.roles.xvar === 'condition', '4: Leave it out opens the project with that role empty');
    await b.ctx.close();
});
// ---- 8: errors
await run('8: errors', async () => {
    const cases = [
        ['setups/missing.setup.json', 'lab/stroop.csv', /answered 404 for the chart setup/],
        ['setups/notjson.setup.json', 'lab/stroop.csv', /does not point at a Pandion Plots chart setup/],
        ['setups/wrongkind.json', 'lab/stroop.csv', /not a Pandion Plots chart setup/],
        ['setups/stroop.setup.json', '', /does not name a data file/]
    ];
    for (const [su, du, re] of cases) {
        const { ctx, page } = await boot('?config=' + T + su + (du ? '&data=' + T + du : ''));
        await page.click('#ps-openlink-open'); await page.waitForTimeout(1500);
        const s = await st(page);
        ok(s.card && re.test(s.cardStatus) && !(await page.evaluate(() => document.getElementById('ps-openlink-open').disabled)), '8: ' + su + ': ' + s.cardStatus.slice(0, 80));
        await ctx.close();
    }
});
// ---- 9: a setup file from disk
await run('9: a setup file from disk', async () => {
    const { ctx, page, errors } = await boot('');
    await page.click('[data-example="dose"]'); await page.waitForTimeout(1500);
    await page.evaluate(() => { window.PS_SHELL.setColType('hours', 'ordinal'); window.PS_SHELL.setColumnMissingTokens('hours', '99'); });
    await page.waitForTimeout(400);
    const onDose = { kind: 'pandion-plots-setup', formatVersion: 1, name: 'Dose as violins',
        charts: [{ analysis: 'plotbuilder', roles: { xvar: 'condition', yvar: 'score' }, type: 'violin', title: 'Dose violins' }] };
    await page.setInputFiles('#ps-file', { name: 'dose.setup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(onDose)) });
    await page.waitForTimeout(2500);
    let s = await st(page);
    ok(s.name === 'Dose as violins' && s.graphType === 'violin' && s.title === 'Dose violins' && s.roles.yvar === 'score' && s.order.indexOf('score') !== -1, '9: a setup with no data named is applied to the data already open (' + s.name + ')');
    ok(s.types.hours === 'ordinal' && JSON.stringify(s.missingByCol.hours) === '["99"]', '9: columns the setup does not mention keep their type and missing codes (' + s.types.hours + ', ' + JSON.stringify(s.missingByCol.hours) + ')');
    await page.setInputFiles('#ps-file', { name: 'named.setup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(SETUP_NAMED)) });
    await page.waitForTimeout(1200);
    s = await st(page);
    ok(s.card && /named\.setup\.json/.test(s.cardUrl) && /named\/stroop\.csv/.test(s.cardUrl), '9: a setup that names its data goes through the card first');
    await page.click('#ps-openlink-open'); await page.waitForTimeout(2500);
    s = await st(page);
    ok(s.name === 'Stroop effect' && s.src === T + 'named/stroop.csv', '9: and opens with its data');
    ok(errors.length === 0, '9: no page errors' + (errors.length ? ' (' + errors[0] + ')' : ''));
    await ctx.close();
});
// ---- 10: provenance across an example and a reload
await run('10: provenance across an example and a reload', async () => {
    const { ctx, page } = await boot('?config=' + T + 'setups/stroop.setup.json&data=' + T + 'lab/stroop.csv');
    await page.click('#ps-openlink-open'); await page.waitForTimeout(2500);
    await page.evaluate(() => sessionStorage.setItem('__keep', '1'));
    await page.reload(); await page.waitForTimeout(1500);
    const cont = await page.evaluate(() => { const c = document.getElementById('ps-welcome-continue'); if (c && c.getClientRects().length) { c.click(); return true; } return false; });
    await page.waitForTimeout(1200);
    let s = await st(page);
    ok(/from example\.test/.test(s.detail) && s.src === T + 'lab/stroop.csv', '10: after a reload the linked project still names its data host (' + s.detail + ', continue ' + cont + ')');
    await page.evaluate(() => window.PS_SHELL.showWelcome(true)); await page.waitForTimeout(400);
    await page.click('[data-example="dose"]'); await page.waitForTimeout(1500);
    s = await st(page);
    ok(!/from example\.test/.test(s.detail) && s.src === '' && s.setupUrl === '', '10: an example opened afterwards no longer claims the old host (' + s.detail + ')');
    await ctx.close();
});
// ---- 10b: an example opened straight after a linked project
await run('10b: an example straight after a linked project', async () => {
    // A plain data link, which main can also open, so this is the control
    // for the provenance fix itself (the bug predates setups).
    const { ctx, page } = await boot('?data=' + T + 'lab/stroop.csv');
    await page.click('#ps-openlink-open'); await page.waitForTimeout(1200);
    await page.click('#ps-import-use'); await page.waitForTimeout(1200);
    let s = await st(page);
    ok(/from example\.test/.test(s.detail), '10b: a project opened from a data link names its host (' + s.detail + ')');
    await page.evaluate(() => window.PS_SHELL.showWelcome(true)); await page.waitForTimeout(400);
    await page.click('[data-example="dose"]'); await page.waitForTimeout(1500);
    s = await st(page);
    ok(!/from example\.test/.test(s.detail) && s.src === '', '10b: an example opened straight afterwards says local project (' + s.detail + ')');
    await ctx.close();
});
// ---- 11: a hostile name stays text
await run('11: a hostile name stays text', async () => {
    const { ctx, page } = await boot('?config=' + T + 'setups/hostile.setup.json&data=' + T + 'lab/stroop.csv');
    await page.click('#ps-openlink-open'); await page.waitForTimeout(2000);
    const r = await page.evaluate(() => ({ open: !!document.getElementById('ps-setup-map-dialog') && document.getElementById('ps-setup-map-dialog').style.display === 'flex', imgs: document.querySelectorAll('#ps-setup-map-rows img').length, xss: window.__xss || 0, label: (document.querySelector('#ps-setup-map-rows label strong') || {}).textContent || '' }));
    ok(r.open && r.imgs === 0 && r.xss === 0 && /^<img/.test(r.label), '11: a hostile column name is shown as text, never as markup');
    await ctx.close();
});
// ---- 12: a setup saved by an older version names what changed since
await run('12: a setup saved by an older version', async () => {
    const { ctx, page } = await boot('?config=' + T + 'setups/old.setup.json&data=' + T + 'lab/stroop.csv');
    await page.click('#ps-openlink-open'); await page.waitForTimeout(2500);
    const s = await st(page);
    ok(s.name === 'Stroop effect' && s.notice, '12: a setup saved by 3.1.1 opens with the numerical-changes notice');
    await ctx.close();
});
// ---- 13: Excel data through a setup, with the setup's sheet choice
await run('13: Excel data through a setup', async () => {
    let b = await boot('?config=' + T + 'setups/xlsx.setup.json&data=' + T + 'lab/study.xlsx');
    await b.page.click('#ps-openlink-open'); await b.page.waitForTimeout(2500);
    let s = await st(b.page);
    ok(s.name === 'Excel study' && s.order.join(',') === 'group,score,visit,done,note' && s.roles.xvar === 'group' && s.roles.yvar === 'score' && s.graphType === 'bar' && s.src === T + 'lab/study.xlsx', '13: an Excel file opens onto the setup\'s chart (' + s.order.join(',') + ')');
    await b.ctx.close();
    b = await boot('?config=' + T + 'setups/sheet.setup.json&data=' + T + 'lab/study.xlsx');
    await b.page.click('#ps-openlink-open'); await b.page.waitForTimeout(2500);
    s = await st(b.page);
    ok(s.name === 'Second sheet' && s.order.join(',') === 'id,v' && s.module === 'freqplotbuilder' && s.roles.var === 'id', '13: read.sheet picks the named sheet (' + s.order.join(',') + ')');
    await b.ctx.close();
    b = await boot('?config=' + T + 'setups/nosheet.setup.json&data=' + T + 'lab/study.xlsx');
    await b.page.click('#ps-openlink-open'); await b.page.waitForTimeout(2500);
    s = await st(b.page);
    const said = await b.page.evaluate(() => document.body.innerText.indexOf('asks for a sheet called results') !== -1);
    ok(s.order.join(',') === 'group,score,visit,done,note' && said, '13: a sheet the workbook lacks falls back to the first sheet and says so');
    await b.ctx.close();
});
// ---- 14: a column where a dataset code is a real value round-trips exactly
await run('14: missing codes round-trip exactly', async () => {
    const { ctx, page } = await boot('');
    await page.click('[data-example="dose"]'); await page.waitForTimeout(1500);
    await page.evaluate(() => window.PS_SHELL.setColumnMissingTokens('hours', '99'));
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => { const t = window.PS_SHELL.project.table;
        return { dsList: t.missingTokens.slice(), hours: t.missingTokensByCol.hours.slice() }; });
    await page.click('[data-ps-menu="file"]'); await page.waitForTimeout(300);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#ps-appmenu [data-app-command="save-setup"]')]);
    const text = fs.readFileSync(await dl.path(), 'utf8'), saved = JSON.parse(text);
    const hours = (saved.columns || []).find(c => c.name === 'hours') || {};
    ok(JSON.stringify(saved.read.missing) === JSON.stringify(before.dsList) && JSON.stringify(hours.missing) === '["99"]' && JSON.stringify(hours.notMissing) === '["NA"]', '14: the dataset codes are written, and a column that drops NA says so (' + JSON.stringify({ read: saved.read, missing: hours.missing, notMissing: hours.notMissing }) + ')');
    await page.setInputFiles('#ps-file', { name: 'dose.setup.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await page.waitForTimeout(2500);
    const after = await page.evaluate(() => { const t = window.PS_SHELL.project.table;
        return { dsList: t.missingTokens.slice(), hours: (t.missingTokensByCol.hours || []).slice(), others: Object.keys(t.missingTokensByCol) }; });
    ok(JSON.stringify(after.dsList) === JSON.stringify(before.dsList) && JSON.stringify(after.hours) === JSON.stringify(before.hours) && JSON.stringify(after.others) === '["hours"]', '14: applied again, every column keeps exactly its codes (' + JSON.stringify(after) + ')');
    await ctx.close();
});
await browser.close();
console.log(failures ? 'setup-link: FAIL (' + failures + ')' : 'setup-link: PASS');
process.exit(failures ? 1 : 0);
