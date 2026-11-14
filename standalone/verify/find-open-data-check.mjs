// Find open data (Sep 21 2026, Torry): a welcome action opens a dialog
// that searches three collections whose search and file hosts both allow a
// browser on another origin to read them, and every Open goes through the
// link path (openFromLink). What this pins:
//   1. the welcome carries Find open data; it opens the dialog with the
//      search box focused, the welcome away, and a note that names where
//      the teaching list comes from and that the search stays local;
//   2. Teaching datasets: typing filters the Rdatasets index live, a hit
//      shows its package, shape and variable kinds, and links its docs;
//      no match says so;
//   3. Open on a hit fetches the CSV into the import preview; Use this
//      data makes it the table and the detail line names the host;
//   4. Research data: the note names zenodo.org, the search runs on Enter
//      (not per keystroke), asks for datasets with readable files, lists
//      only records holding a file this app can open (a zip-only record,
//      an oversized file and a README text file are dropped), and shows
//      each file's size;
//   5. Open on a Zenodo file lands in the preview with the file's real
//      name (the link ends in /content) and the provenance says zenodo.org;
//   6. a failed Zenodo search and a rate-limited one each leave a plain
//      sentence, and the Open button of a failed fetch is usable again;
//   7. Cancel and Escape close the dialog and bring the welcome back;
//   8. Replication data (Nov 2 2026): the note names dataverse.harvard.edu,
//      the search runs on Enter as one request for files filtered to the
//      content types the app reads, the hits are grouped under their
//      dataset (three files, one row, an Excel file named without an
//      extension getting .xlsx from its content type; a repeat of a file
//      from an older version, a PDF, a restricted file and an oversized
//      file are dropped), the row carries the authors, year and DOI parsed from
//      the citation and links the dataset page, Open on a .tab file lands
//      in the preview under its real name with the provenance naming the
//      host, and a failed or rate-limited search leaves a plain sentence.
// The collections are served by Playwright's request interception with
// the CORS header the real hosts send, so the probe needs no network.
// CONTROL (the open-by-link branch without this change): case 1 fails at
// its first assertion (no welcome action).
//
// Usage: node standalone/verify/find-open-data-check.mjs

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
const HERE = new URL('.', import.meta.url).pathname;
const PAGE = 'file://' + (process.env.PS_PAGE ? path.resolve(process.env.PS_PAGE) : path.resolve(HERE, '..', 'index.html'));
let failures = 0;
function ok(cond, label) { if (cond) console.log('  ok  ' + label); else { console.log('  FAIL ' + label); failures++; } }

const RD = 'https://vincentarelbundock.github.io/Rdatasets/';
const INDEX = '"Package","Item","Title","Rows","Cols","n_binary","n_character","n_factor","n_logical","n_numeric","CSV","Doc"\n' +
  '"datasets","ToothGrowth","The Effect of Vitamin C on Tooth Growth in Guinea Pigs",60,3,1,0,1,0,2,"' + RD + 'csv/datasets/ToothGrowth.csv","' + RD + 'doc/datasets/ToothGrowth.html"\n' +
  '"datasets","sleep","Student\'s Sleep Data",20,3,1,0,2,0,1,"' + RD + 'csv/datasets/sleep.csv","' + RD + 'doc/datasets/sleep.html"\n' +
  '"psych","bfi","25 Personality items representing 5 factors",2800,28,0,0,0,0,28,"' + RD + 'csv/psych/bfi.csv","' + RD + 'doc/psych/bfi.html"\n' +
  '"palmerpenguins","penguins","Size measurements for adult foraging penguins near Palmer Station, Antarctica",344,8,1,0,3,0,5,"' + RD + 'csv/palmerpenguins/penguins.csv","' + RD + 'doc/palmerpenguins/penguins.html"\n';
const TOOTH = 'rownames,len,supp,dose\n1,4.2,VC,0.5\n2,11.5,VC,0.5\n3,7.3,VC,0.5\n4,5.8,OJ,1\n5,6.4,OJ,1\n6,10,OJ,2\n';
const ZCSV = 'trip,distance_km,prey_g\n1,12.5,310\n2,9.8,275\n3,15.1,402\n';
const ZENODO = JSON.stringify({ hits: { total: 3, hits: [
  { id: 1, doi: '10.5281/zenodo.1', metadata: { title: 'Penguin foraging trips', publication_date: '2024-03-01', creators: [{ name: 'Doe, Jane' }, { name: 'Roe, Rick' }], resource_type: { id: 'dataset' } }, links: { self_html: 'https://zenodo.org/records/1' },
    files: [{ key: 'data.csv', size: 2048, links: { self: 'https://zenodo.org/api/records/1/files/data.csv/content' } }, { key: 'readme.pdf', size: 100000, links: { self: 'https://zenodo.org/api/records/1/files/readme.pdf/content' } }, { key: 'README.txt', size: 900, links: { self: 'https://zenodo.org/api/records/1/files/README.txt/content' } }] },
  { id: 2, doi: '10.5281/zenodo.2', metadata: { title: 'Archive only', publication_date: '2023-01-01', creators: [{ name: 'Solo, Han' }], resource_type: { id: 'dataset' } }, links: { self_html: 'https://zenodo.org/records/2' },
    files: [{ key: 'bundle.zip', size: 5000, links: { self: 'https://zenodo.org/api/records/2/files/bundle.zip/content' } }] },
  { id: 3, doi: '10.5281/zenodo.3', metadata: { title: 'Huge table', publication_date: '2022-01-01', creators: [{ name: 'Big, Data' }], resource_type: { id: 'dataset' } }, links: { self_html: 'https://zenodo.org/records/3' },
    files: [{ key: 'huge.csv', size: 300 * 1024 * 1024, links: { self: 'https://zenodo.org/api/records/3/files/huge.csv/content' } }] }
] } });

const browser = await chromium.launch();
async function boot() {
    const ctx = await browser.newContext();
    const page = await ctx.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('filechooser', () => {}); // Playwright dismisses an unhandled file chooser and Chromium reports that as cancel, which the app honours; a listener keeps the chooser open
    await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); sessionStorage.clear(); } catch (e) {} });
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    const seen = { zenodo: [], dataverse: [] };
    const mode = { zenodo: 'ok', zenodoFile: 'ok', dataverse: 'ok', dvFile: 'ok' };
    const cors = { 'Access-Control-Allow-Origin': '*' };
    await page.route('https://vincentarelbundock.github.io/**', async (route) => {
        const u = route.request().url();
        if (u === RD + 'datasets.csv') return route.fulfill({ status: 200, headers: Object.assign({ 'Content-Type': 'text/csv' }, cors), body: INDEX });
        if (u === RD + 'csv/datasets/ToothGrowth.csv') return route.fulfill({ status: 200, headers: Object.assign({ 'Content-Type': 'text/csv' }, cors), body: TOOTH });
        return route.fulfill({ status: 404, headers: cors, body: 'no' });
    });
    await page.route('https://zenodo.org/**', async (route) => {
        const u = route.request().url();
        if (u.startsWith('https://zenodo.org/api/records?')) {
            seen.zenodo.push(u);
            if (mode.zenodo === 'abort') return route.abort('failed');
            if (mode.zenodo === 'rate') return route.fulfill({ status: 429, headers: Object.assign({ 'Content-Type': 'application/json' }, cors), body: '{"message":"slow down"}' });
            return route.fulfill({ status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, cors), body: ZENODO });
        }
        if (u === 'https://zenodo.org/api/records/1/files/data.csv/content') {
            if (mode.zenodoFile === 'fail') return route.fulfill({ status: 500, headers: cors, body: 'boom' });
            return route.fulfill({ status: 200, headers: Object.assign({ 'Content-Type': 'text/plain' }, cors), body: ZCSV });
        }
        return route.fulfill({ status: 404, headers: cors, body: 'no' });
    });
    await page.route('https://dataverse.harvard.edu/**', async (route) => {
        const u = route.request().url();
        if (u.startsWith('https://dataverse.harvard.edu/api/search?')) {
            seen.dataverse.push(u);
            if (mode.dataverse === 'abort') return route.abort('failed');
            if (mode.dataverse === 'rate') return route.fulfill({ status: 429, headers: Object.assign({ 'Content-Type': 'application/json' }, cors), body: '{"status":"ERROR","message":"slow down"}' });
            return route.fulfill({ status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, cors), body: DATAVERSE });
        }
        if (u === 'https://dataverse.harvard.edu/api/access/datafile/102') {
            if (mode.dvFile === 'fail') return route.fulfill({ status: 500, headers: cors, body: 'boom' });
            return route.fulfill({ status: 200, headers: Object.assign({ 'Content-Type': 'text/tab-separated-values' }, cors), body: DVTSV });
        }
        return route.fulfill({ status: 404, headers: cors, body: 'no' });
    });
    await page.goto(PAGE); await page.waitForTimeout(1100);
    return { ctx, page, errors, seen, mode };
}
const DVTSV = 'item\tscore\nq1\t3\nq2\t4\nq3\t5\n';
const DV_CITE = 'Doe, Jane; Roe, Rick; Poe, Edgar; Moe, Larry, 2023, "Test anxiety and achievement", https://doi.org/10.7910/DVN/ABC123, Harvard Dataverse, V2';
const dvHit = (o) => Object.assign({ type: 'file', published_at: '2023-05-01T00:00:00Z', restricted: false,
    dataset_name: 'Test anxiety and achievement', dataset_id: '10', dataset_persistent_id: 'doi:10.7910/DVN/ABC123', dataset_citation: DV_CITE }, o,
    { url: 'https://dataverse.harvard.edu/api/access/datafile/' + o.file_id });
const DATAVERSE = JSON.stringify({ status: 'OK', data: { q: 'anxiety', total_count: 60, start: 0, spelling_alternatives: {}, count_in_response: 7, items: [
  dvHit({ name: 'scores.csv', file_id: '101', file_content_type: 'text/csv', size_in_bytes: 2048 }),
  dvHit({ name: 'items.tab', file_id: '102', file_content_type: 'text/tab-separated-values', size_in_bytes: 4096 }),
  dvHit({ name: 'scores.csv', file_id: '103', file_content_type: 'text/csv', size_in_bytes: 2000 }),
  dvHit({ name: 'Supplement 2', file_id: '107', file_content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size_in_bytes: 10276 }),
  dvHit({ name: 'codebook.pdf', file_id: '104', file_content_type: 'application/pdf', size_in_bytes: 90000 }),
  dvHit({ name: 'secret.tab', file_id: '105', file_content_type: 'text/tab-separated-values', size_in_bytes: 5000, restricted: true,
    dataset_name: 'Locked study', dataset_id: '11', dataset_persistent_id: 'doi:10.7910/DVN/LOCKED', dataset_citation: 'Solo, Han, 2021, "Locked study", https://doi.org/10.7910/DVN/LOCKED, Harvard Dataverse, V1' }),
  dvHit({ name: 'huge.csv', file_id: '106', file_content_type: 'text/csv', size_in_bytes: 300 * 1024 * 1024,
    dataset_name: 'Huge table', dataset_id: '12', dataset_persistent_id: 'doi:10.7910/DVN/HUGE', dataset_citation: 'Big, Data, 2022, "Huge table", https://doi.org/10.7910/DVN/HUGE, Harvard Dataverse, V1' })
] } });
const state = page => page.evaluate(() => {
    const S = window.PS_SHELL, d = document.getElementById('ps-finddata-dialog');
    const rows = Array.from(document.querySelectorAll('#ps-finddata-results .ps-finddata-row')).map(r => r.textContent.replace(/\s+/g, ' ').trim());
    return { open: d.style.display === 'flex', welcome: document.getElementById('ps-welcome').style.display === 'flex', focused: document.activeElement && document.activeElement.id,
        note: document.getElementById('ps-finddata-note').textContent, status: document.getElementById('ps-finddata-status').textContent, rows,
        opens: Array.from(document.querySelectorAll('#ps-finddata-results [data-find-open]')).map(b => ({ url: b.getAttribute('data-find-open'), name: b.getAttribute('data-find-name'), disabled: b.disabled, text: b.textContent })),
        abouts: Array.from(document.querySelectorAll('#ps-finddata-results .ps-finddata-about')).map(a => a.getAttribute('href')),
        source: document.querySelector('#ps-finddata-dialog [data-source][aria-selected="true"]') && document.querySelector('#ps-finddata-dialog [data-source][aria-selected="true"]').getAttribute('data-source'),
        cols: S.project.table ? S.project.table.order.slice() : null, name: S.project.name, src: S.project.sourceUrl || '', detail: document.getElementById('ps-doc-detail').textContent.trim(),
        preview: (() => { const u = document.getElementById('ps-import-use'); return !!u && u.style.display !== 'none'; })() };
});

// ---- 1. the welcome action and the dialog
{
    const { ctx, page, errors } = await boot();
    const action = await page.evaluate(() => { const b = document.getElementById('ps-welcome-find'); const r = b && b.getBoundingClientRect(); return b ? { text: b.textContent.replace(/\s+/g, ' ').trim(), visible: r.width > 0 } : null; });
    const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('#ps-finddata-dialog [data-source]')).map(b => b.getAttribute('data-source')));
    ok(action && action.visible && /Open data from the web/.test(action.text) && tabs.join(',') === 'rdatasets,zenodo,dataverse,link', '1: the welcome offers Open data from the web, a dialog with four sources (' + (action && action.text) + ')');
    await page.click('#ps-welcome-find'); await page.waitForTimeout(500);
    let s = await state(page);
    ok(s.open && !s.welcome && s.focused === 'ps-finddata-q' && s.source === 'rdatasets', '1: it opens the dialog on Teaching datasets with the search box focused and the welcome away');
    ok(/vincentarelbundock\.github\.io/.test(s.note) && /this browser/.test(s.note), '1: the note names where the list comes from and that the search stays local');
    ok(/Type to search 4 datasets from 3 R packages/.test(s.status), '1: the loaded list is counted in the status line (' + s.status + ')');
    // ---- 2. live filtering
    await page.type('#ps-finddata-q', 'tooth'); await page.waitForTimeout(400);
    s = await state(page);
    ok(s.rows.length === 1 && /ToothGrowth/.test(s.rows[0]) && /datasets/.test(s.rows[0]) && /60 rows/.test(s.rows[0]) && /3 columns/.test(s.rows[0]) && /2 numeric, 1 factor/.test(s.rows[0]), '2: typing filters the list live and the hit shows package, shape and variable kinds (' + s.rows[0] + ')');
    ok(s.abouts.length === 1 && s.abouts[0] === RD + 'doc/datasets/ToothGrowth.html', '2: About links the documentation page');
    ok(s.opens.length === 1 && s.opens[0].url === RD + 'csv/datasets/ToothGrowth.csv' && s.opens[0].name === 'ToothGrowth.csv', '2: Open carries the CSV link and the file name');
    await page.fill('#ps-finddata-q', 'guinea pigs'); await page.waitForTimeout(400);
    s = await state(page);
    ok(s.rows.length === 1 && /ToothGrowth/.test(s.rows[0]), '2: words in the title match too, all of them (' + s.rows.length + ' rows)');
    await page.fill('#ps-finddata-q', 'zzzz'); await page.waitForTimeout(400);
    s = await state(page);
    ok(s.rows.length === 0 && /No datasets match/.test(s.status), '2: no match says so (' + s.status + ')');
    // ---- 3. Open a teaching dataset
    await page.fill('#ps-finddata-q', 'tooth'); await page.waitForTimeout(400);
    await page.click('#ps-finddata-results [data-find-open]'); await page.waitForTimeout(1200);
    s = await state(page);
    ok(!s.open && s.preview, '3: Open closes the dialog and lands the CSV in the import preview');
    await page.click('#ps-import-use'); await page.waitForTimeout(900);
    s = await state(page);
    ok(s.cols && s.cols.join(',') === 'rownames,len,supp,dose', '3: Use this data makes it the table (' + (s.cols || []).join(',') + ')');
    ok(s.src === RD + 'csv/datasets/ToothGrowth.csv' && /from vincentarelbundock\.github\.io/.test(s.detail), '3: the project remembers the link and the detail line names the host (' + s.detail + ')');
    ok(errors.length === 0, '3: no page errors' + (errors.length ? ' (' + errors[0] + ')' : ''));
    await ctx.close();
}
// ---- 4. Zenodo
{
    const { ctx, page, errors, seen, mode } = await boot();
    await page.click('#ps-welcome-find'); await page.waitForTimeout(400);
    await page.click('#ps-finddata-dialog [data-source="zenodo"]'); await page.waitForTimeout(300);
    let s = await state(page);
    ok(s.source === 'zenodo' && /zenodo\.org/.test(s.note) && /nothing is uploaded/i.test(s.note) && /press Enter/i.test(s.status), '4: the Research data note names zenodo.org and the status asks for Enter');
    await page.type('#ps-finddata-q', 'penguin'); await page.waitForTimeout(500);
    ok(seen.zenodo.length === 0, '4: typing alone sends nothing to zenodo.org');
    await page.keyboard.press('Enter'); await page.waitForTimeout(800);
    s = await state(page);
    const sent = seen.zenodo.length === 1 ? decodeURIComponent(seen.zenodo[0]) : '';
    ok(seen.zenodo.length === 1 && /q=\(penguin\) AND metadata\.resource_type\.id:dataset AND files\.types:\(csv OR tsv OR txt OR xlsx OR xlsm\)/.test(sent) && /size=25/.test(sent), '4: Enter sends one search asking for datasets with readable files (' + sent + ')');
    ok(s.rows.length === 1 && /Penguin foraging trips/.test(s.rows[0]) && /Doe, Jane, Roe, Rick/.test(s.rows[0]) && /2024/.test(s.rows[0]) && /DOI 10\.5281\/zenodo\.1/.test(s.rows[0]), '4: only the record with a readable file is listed, with its people, year and DOI (' + s.rows[0] + ')');
    ok(s.opens.length === 1 && s.opens[0].name === 'data.csv' && /2 KB/.test(s.rows[0]) && !/readme\.pdf/.test(s.rows[0]) && !/README\.txt/.test(s.rows[0]), '4: the CSV is offered with its size; the PDF and the README text file are not');
    ok(s.abouts.length === 1 && s.abouts[0] === 'https://zenodo.org/records/1' && /1 record found/.test(s.status), '4: About links the record page and the status counts what is shown (' + s.status + ')');
    // ---- 5. Open a Zenodo file
    await page.click('#ps-finddata-results [data-find-open]'); await page.waitForTimeout(1200);
    s = await state(page);
    ok(!s.open && s.preview, '5: Open lands the file in the import preview');
    await page.click('#ps-import-use'); await page.waitForTimeout(900);
    s = await state(page);
    ok(s.cols && s.cols.join(',') === 'trip,distance_km,prey_g' && /^data\b/.test(s.name || '') && /from zenodo\.org/.test(s.detail), '5: the table, the file\'s real name and the provenance all land (' + s.name + '; ' + s.detail + ')');
    ok(errors.length === 0, '5: no page errors' + (errors.length ? ' (' + errors[0] + ')' : ''));
    await ctx.close();
}
// ---- 6. failures
{
    const { ctx, page, seen, mode } = await boot();
    await page.click('#ps-welcome-find'); await page.waitForTimeout(400);
    await page.click('#ps-finddata-dialog [data-source="zenodo"]'); await page.waitForTimeout(300);
    mode.zenodo = 'abort';
    await page.fill('#ps-finddata-q', 'penguin'); await page.keyboard.press('Enter'); await page.waitForTimeout(800);
    let s = await state(page);
    ok(s.open && /Could not reach zenodo\.org/.test(s.status) && s.rows.length === 0, '6: a failed search names the host (' + s.status + ')');
    mode.zenodo = 'rate';
    await page.keyboard.press('Enter'); await page.waitForTimeout(800);
    s = await state(page);
    ok(/limiting searches/.test(s.status) && /minute/.test(s.status), '6: a rate-limited search says to wait (' + s.status + ')');
    mode.zenodo = 'ok'; mode.zenodoFile = 'fail';
    await page.keyboard.press('Enter'); await page.waitForTimeout(800);
    await page.click('#ps-finddata-results [data-find-open]'); await page.waitForTimeout(1000);
    s = await state(page);
    ok(s.open && /answered 500/.test(s.status) && s.opens.length === 1 && !s.opens[0].disabled && s.opens[0].text === 'Open', '6: a failed fetch reports in the dialog and the Open button is usable again (' + s.status + ')');
    // ---- 7. Cancel and Escape
    await page.click('#ps-finddata-cancel'); await page.waitForTimeout(400);
    s = await state(page);
    ok(!s.open && s.welcome, '7: Cancel closes the dialog and brings the welcome back');
    await page.click('#ps-welcome-find'); await page.waitForTimeout(400);
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    s = await state(page);
    ok(!s.open && s.welcome, '7: Escape does the same');
    await ctx.close();
}
// ---- 8. Harvard Dataverse
{
    const { ctx, page, errors, seen, mode } = await boot();
    await page.click('#ps-welcome-find'); await page.waitForTimeout(400);
    await page.click('#ps-finddata-dialog [data-source="dataverse"]'); await page.waitForTimeout(300);
    let s = await state(page);
    ok(s.source === 'dataverse' && /dataverse\.harvard\.edu/.test(s.note) && /nothing is uploaded/i.test(s.note) && /press Enter/i.test(s.status), '8: the Replication data note names dataverse.harvard.edu and the status asks for Enter');
    await page.type('#ps-finddata-q', 'anxiety'); await page.waitForTimeout(500);
    ok(seen.dataverse.length === 0, '8: typing alone sends nothing to dataverse.harvard.edu');
    await page.keyboard.press('Enter'); await page.waitForTimeout(800);
    s = await state(page);
    const sent = seen.dataverse.length === 1 ? decodeURIComponent(seen.dataverse[0]) : '';
    ok(seen.dataverse.length === 1 && /type=file/.test(sent) && /per_page=50/.test(sent) && /q=anxiety/.test(sent) && /fq=fileContentType:\("text\/csv" OR "text\/tab-separated-values"/.test(sent), '8: Enter sends one search for files of the readable content types (' + sent + ')');
    ok(s.rows.length === 1 && /Test anxiety and achievement/.test(s.rows[0]) && /Doe, Jane, Roe, Rick, Poe, Edgar, and others/.test(s.rows[0]) && /2023/.test(s.rows[0]) && /DOI 10\.7910\/DVN\/ABC123/.test(s.rows[0]), '8: the readable files group under one dataset row with authors, year and DOI from the citation (' + s.rows[0] + ')');
    ok(s.opens.length === 3 && s.opens[0].name === 'scores.csv' && s.opens[1].name === 'items.tab' && s.opens[1].url === 'https://dataverse.harvard.edu/api/access/datafile/102' && s.opens[2].name === 'Supplement 2.xlsx' && s.opens[2].url === 'https://dataverse.harvard.edu/api/access/datafile/107', '8: the row lists the CSV, the .tab and the extension-less Excel file (as .xlsx) once each; the older-version repeat, the PDF, the restricted file and the oversized file are dropped (' + s.opens.map(o => o.name).join(',') + ')');
    ok(s.abouts.length === 1 && s.abouts[0] === 'https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi%3A10.7910%2FDVN%2FABC123', '8: About links the dataset page by its persistent id (' + s.abouts[0] + ')');
    ok(/1 dataset from the first 7 of about 60 matching files/.test(s.status), '8: the status counts the datasets shown against the files that matched (' + s.status + ')');
    await page.click('#ps-finddata-results [data-find-open][data-find-name="items.tab"]'); await page.waitForTimeout(1200);
    s = await state(page);
    ok(!s.open && s.preview, '8: Open on the .tab file closes the dialog and lands in the import preview');
    await page.click('#ps-import-use'); await page.waitForTimeout(900);
    s = await state(page);
    ok(s.cols && s.cols.join(',') === 'item,score' && /^items\b/.test(s.name || '') && /from dataverse\.harvard\.edu/.test(s.detail), '8: the tab-separated table, the file\'s real name and the provenance all land (' + s.name + '; ' + s.detail + ')');
    ok(errors.length === 0, '8: no page errors' + (errors.length ? ' (' + errors[0] + ')' : ''));
    await ctx.close();
}
{
    const { ctx, page, seen, mode } = await boot();
    await page.click('#ps-welcome-find'); await page.waitForTimeout(400);
    await page.click('#ps-finddata-dialog [data-source="dataverse"]'); await page.waitForTimeout(300);
    mode.dataverse = 'abort';
    await page.type('#ps-finddata-q', 'anxiety'); await page.keyboard.press('Enter'); await page.waitForTimeout(800);
    let s = await state(page);
    ok(s.open && /Could not reach dataverse\.harvard\.edu/.test(s.status) && s.rows.length === 0, '8: a failed search names the host (' + s.status + ')');
    mode.dataverse = 'rate';
    await page.keyboard.press('Enter'); await page.waitForTimeout(800);
    s = await state(page);
    ok(/limiting searches/.test(s.status) && /minute/.test(s.status), '8: a rate-limited search says to wait (' + s.status + ')');
    mode.dataverse = 'ok'; mode.dvFile = 'fail';
    await page.keyboard.press('Enter'); await page.waitForTimeout(800);
    await page.click('#ps-finddata-results [data-find-open][data-find-name="items.tab"]'); await page.waitForTimeout(1000);
    s = await state(page);
    ok(s.open && /answered 500/.test(s.status) && s.opens.length === 3 && !s.opens[1].disabled && s.opens[1].text === 'Open', '8: a failed fetch reports in the dialog and the Open button is usable again (' + s.status + ')');
    ok(seen.dataverse.length === 3, '8: three searches were sent in all (' + seen.dataverse.length + ')');
    await ctx.close();
}
await browser.close();
console.log(failures ? 'find-open-data: FAIL (' + failures + ')' : 'find-open-data: PASS');
process.exit(failures ? 1 : 0);
