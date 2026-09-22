// Share a link (Sep 21 2026, Torry): File > Share a link makes a link that
// opens the project, three ways, and every open-data hit offers Copy link.
// What this pins:
//   1. the File menu carries Share a link; the dialog opens on Carry it in
//      the link with a #pand= link, its length, and Copy writes it;
//   2. a carried link opens elsewhere: the card says the project travels in
//      the link, Open unpacks it into the same project, and the # is gone
//      from the address; a damaged link says so and leaves the card usable;
//   3. Only the current chart shrinks the link and the opened copy holds
//      one document; a big table trips the long-link warning;
//   4. Host it on GitHub, Public: a github.com page address is rewritten to
//      the raw route, Check reports what the file is and whether a browser
//      may read it, the link is ?project= or ?data= as fitting, Freeze pins
//      the raw route to the commit the GitHub API reports, a host without
//      CORS is named, and a plain file under Locked is refused;
//   5. Unlisted with a token: one POST to api.github.com/gists with
//      public:false and the project text, and the link points at the gist's
//      live raw address; opened elsewhere, the project lands with its
//      provenance;
//   6. Locked with a token: the gist holds only the locked text, the link
//      carries #key=, the opened copy is the project; a wrong key and a
//      missing key each get a plain sentence;
//   7. Locked by hand: Save the locked copy downloads the locked text, and
//      Check on its address accepts it and adds the key;
//   8. Copy link on a Find open data hit and on the project's source line.
// GitHub is served by Playwright's request interception with the CORS
// header the real routes send, so the probe needs no network.
// CONTROL (the find-open-data branch): case 1 fails at its first assertion.
//
// Usage: node standalone/verify/share-link-check.mjs

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
const SHA = '0123456789abcdef0123456789abcdef01234567';
const RAW = 'https://raw.githubusercontent.com/u/r/main/data/';

const browser = await chromium.launch();
const gists = {};          // name -> content, shared by every page in the run
const lockedByHand = {};   // name -> content saved through the download button
async function boot(query, opts) {
    const ctx = await browser.newContext({ acceptDownloads: true });
    const page = await ctx.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.addInitScript(() => {
        try { localStorage.clear(); localStorage.setItem('psstandalone.coach.clickToEdit.v1', '1'); sessionStorage.clear(); } catch (e) {}
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } }, configurable: true });
    });
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    const seen = { gists: [], commits: [] };
    const cors = { 'Access-Control-Allow-Origin': '*' };
    await page.route('https://api.github.com/**', async (route) => {
        const req = route.request(), u = req.url();
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: Object.assign({ 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, X-GitHub-Api-Version', 'Access-Control-Allow-Methods': 'GET, POST' }, cors) });
        if (u === 'https://api.github.com/gists' && req.method() === 'POST') {
            const body = JSON.parse(req.postData() || '{}');
            seen.gists.push({ auth: req.headers()['authorization'], body });
            const files = {};
            for (const name of Object.keys(body.files || {})) { gists[name] = body.files[name].content; files[name] = { raw_url: 'https://gist.githubusercontent.com/u/abc/raw/' + SHA + '/' + name }; }
            return route.fulfill({ status: 201, headers: Object.assign({ 'Content-Type': 'application/json' }, cors), body: JSON.stringify({ html_url: 'https://gist.github.com/u/abc', files }) });
        }
        if (u.startsWith('https://api.github.com/repos/u/r/commits')) { seen.commits.push(u); return route.fulfill({ status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, cors), body: JSON.stringify([{ sha: SHA }]) }); }
        return route.fulfill({ status: 404, headers: cors, body: '{}' });
    });
    await page.route('https://gist.githubusercontent.com/**', async (route) => {
        const name = decodeURIComponent(route.request().url().split('/raw/').pop().replace(/^[0-9a-f]{40}\//, ''));
        if (gists[name] == null) return route.fulfill({ status: 404, headers: cors, body: 'no' });
        return route.fulfill({ status: 200, headers: Object.assign({ 'Content-Type': 'text/plain' }, cors), body: gists[name] });
    });
    await page.route('https://raw.githubusercontent.com/**', async (route) => {
        const u = route.request().url();
        const m = u.match(/^https:\/\/raw\.githubusercontent\.com\/u\/r\/(main|[0-9a-f]{40})\/data\/(.+)$/);
        if (!m) return route.fulfill({ status: 404, headers: cors, body: 'no' });
        const file = decodeURIComponent(m[2]);
        let body = null, type = 'text/plain';
        if (file === 'week3.pand') { body = PAND; type = 'application/json'; }
        else if (file === 'scores.csv') { body = CSV; type = 'text/csv'; }
        else if (lockedByHand[file] != null) body = lockedByHand[file];
        if (body == null) return route.fulfill({ status: 404, headers: cors, body: 'no' });
        return route.fulfill({ status: 200, headers: Object.assign({ 'Content-Type': type }, cors), body });
    });
    await page.route('https://blocked.test/**', route => route.abort('failed'));
    await page.route('https://vincentarelbundock.github.io/**', async (route) => {
        const u = route.request().url();
        if (u.endsWith('/datasets.csv')) return route.fulfill({ status: 200, headers: Object.assign({ 'Content-Type': 'text/csv' }, cors), body: '"Package","Item","Title","Rows","Cols","n_binary","n_character","n_factor","n_logical","n_numeric","CSV","Doc"\n"datasets","ToothGrowth","Tooth growth",60,3,1,0,1,0,2,"https://vincentarelbundock.github.io/Rdatasets/csv/datasets/ToothGrowth.csv","https://vincentarelbundock.github.io/Rdatasets/doc/datasets/ToothGrowth.html"\n' });
        return route.fulfill({ status: 404, headers: cors, body: 'no' });
    });
    await page.goto(PAGE + (query || '')); await page.waitForTimeout(1100);
    return { ctx, page, errors, seen };
}
const state = page => page.evaluate(() => {
    const S = window.PS_SHELL, d = document.getElementById('ps-share-dialog'), c = document.getElementById('ps-openlink-dialog');
    return { open: d.style.display === 'flex', card: c.style.display === 'flex', cardTitle: document.getElementById('ps-openlink-title').textContent, cardHost: document.getElementById('ps-openlink-host').textContent, cardSub: document.getElementById('ps-openlink-sub').textContent, cardStatus: document.getElementById('ps-openlink-status').textContent,
        carryLink: document.getElementById('ps-share-carry-link').value, carrySize: document.getElementById('ps-share-carry-size').textContent, carryWarn: document.getElementById('ps-share-carry-warn').hidden ? '' : document.getElementById('ps-share-carry-warn').textContent,
        chartOnlyOffered: document.getElementById('ps-share-chartonly-row').getClientRects().length > 0,
        ghLink: document.getElementById('ps-share-gh-link').value, ghStatus: document.getElementById('ps-share-gh-status').textContent, ghCopyDisabled: document.getElementById('ps-share-gh-copy').disabled, addr: document.getElementById('ps-share-addr').value, freezeOffered: document.getElementById('ps-share-freeze-row').getClientRects().length > 0,
        sourceLine: document.getElementById('ps-share-source').hidden ? '' : document.getElementById('ps-share-source').textContent,
        copied: window.__copied || '', hash: location.hash, query: location.search, name: S.project.name, docs: S.project.charts.length, cols: S.project.table ? S.project.table.order.slice() : null, src: S.project.sourceUrl || '', detail: document.getElementById('ps-doc-detail').textContent.trim(), welcome: document.getElementById('ps-welcome').style.display === 'flex' };
});
async function openShare(page) { await page.evaluate(() => window.PS_SHELL.shareLink()); await page.waitForTimeout(700); }
async function githubTab(page, vis) {
    await page.click('#ps-share-dialog [data-share-mode="github"]'); await page.waitForTimeout(150);
    if (vis) { await page.check('#ps-share-dialog input[name="ps-share-vis"][value="' + vis + '"]'); await page.waitForTimeout(100); }
}

// ---- 1. the menu entry and the carried link
let carried = '';
{
    const { ctx, page, errors } = await boot('');
    await page.click('[data-example="dose"]'); await page.waitForTimeout(1000);
    await page.click('[data-ps-menu="file"]'); await page.waitForTimeout(300);
    const item = await page.evaluate(() => { const els = Array.from(document.querySelectorAll('[role="menuitem"], .ps-menu-item, button')); const it = els.find(e => /Share a link/.test(e.textContent || '')); return it ? it.textContent.trim() : null; });
    ok(item && /Share a link/.test(item), '1: the File menu offers Share a link (' + item + ')');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    await openShare(page);
    let s = await state(page);
    ok(s.open && s.carryLink.indexOf('#pand=') > 0 && s.carryLink.indexOf(PAGE) === 0, '1: the dialog opens on Carry it in the link with a #pand= link on this page');
    ok(/1 document/.test(s.carrySize) && /characters/.test(s.carrySize) && !s.chartOnlyOffered && !s.carryWarn, '1: the size line counts the document and the table, no chart-only choice on a one-chart project, no warning (' + s.carrySize + ')');
    await page.click('#ps-share-carry-copy'); await page.waitForTimeout(200);
    s = await state(page);
    ok(s.copied === s.carryLink, '1: Copy writes the link');
    carried = s.carryLink;
    ok(errors.length === 0, '1: no page errors' + (errors.length ? ' (' + errors[0] + ')' : ''));
    await ctx.close();
}
// ---- 2. opening a carried link elsewhere
{
    const { ctx, page, errors } = await boot(carried.slice(PAGE.length));
    let s = await state(page);
    ok(s.card && /shared project/.test(s.cardTitle) && /inside it/.test(s.cardSub) && s.cardHost === 'this link itself' && !s.welcome, '2: the card says the project travels in the link (' + s.cardTitle + ')');
    await page.click('#ps-openlink-open'); await page.waitForTimeout(1500);
    s = await state(page);
    ok(!s.card && /dose/i.test(s.name) && s.docs === 1 && s.cols && s.cols.length >= 2 && s.hash === '', '2: Open unpacks the same project and the # is gone from the address (' + s.name + ', ' + s.docs + ' document, hash "' + s.hash + '")');
    ok(errors.length === 0, '2: no page errors' + (errors.length ? ' (' + errors[0] + ')' : ''));
    await ctx.close();
    const b = await boot('#pand=' + carried.split('#pand=')[1].slice(0, 40));
    await b.page.click('#ps-openlink-open'); await b.page.waitForTimeout(800);
    s = await state(b.page);
    ok(s.card && /cut short|readable/.test(s.cardStatus) && !(await b.page.evaluate(() => document.getElementById('ps-openlink-open').disabled)), '2: a damaged link says so and leaves Open usable (' + s.cardStatus.slice(0, 60) + ')');
    await b.ctx.close();
}
// ---- 3. Only the current chart, and the long-link warning
{
    const { ctx, page } = await boot('?project=' + RAW + 'week3.pand');
    await page.click('#ps-openlink-open'); await page.waitForTimeout(1500);
    let s = await state(page);
    ok(s.docs > 1 && /from raw\.githubusercontent\.com/.test(s.detail), '3: setup: a multi-document project opened from GitHub (' + s.docs + ' documents)');
    await openShare(page);
    s = await state(page);
    const fullLen = s.carryLink.length;
    const freezeHiddenAtStart = await page.evaluate(() => document.getElementById('ps-share-freeze-row').getClientRects().length === 0);
    ok(s.chartOnlyOffered && fullLen > 0 && /from raw\.githubusercontent\.com/.test(s.sourceLine) && freezeHiddenAtStart, '3: chart-only is offered, the freeze row is not yet, and the source line names where the project came from');
    await page.check('#ps-share-chartonly'); await page.waitForTimeout(700);
    s = await state(page);
    ok(s.carryLink.length < fullLen && /1 document/.test(s.carrySize), '3: chart-only makes a shorter link carrying one document (' + s.carryLink.length + ' < ' + fullLen + ')');
    const one = s.carryLink;
    await page.click('#ps-share-source-copy'); await page.waitForTimeout(150);
    s = await state(page);
    ok(s.copied === PAGE + '?project=' + RAW + 'week3.pand', '8: the source line copies a link that opens the file the project came from');
    await ctx.close();
    const b = await boot(one.slice(PAGE.length));
    await b.page.click('#ps-openlink-open'); await b.page.waitForTimeout(1500);
    s = await state(b.page);
    ok(!s.card && s.docs === 1 && s.cols && s.cols.length > 0, '3: the chart-only link opens with one document');
    await b.ctx.close();
    // a big table trips the warning
    const c = await boot('');
    await c.page.click('[data-example="dose"]'); await c.page.waitForTimeout(1000);
    await c.page.evaluate(() => { document.getElementById('ps-load').click(); });
    await c.page.waitForTimeout(300);
    const rows = ['id,group,score']; for (let i = 0; i < 4000; i++) rows.push('s' + i + ',' + (i % 3 === 0 ? 'ctrl' : i % 3 === 1 ? 'low' : 'high') + ',' + ((i * 7919) % 1000) / 10);
    await c.page.fill('#ps-paste', rows.join('\n') + '\n'); await c.page.click('#ps-paste-use'); await c.page.waitForTimeout(800); await c.page.click('#ps-import-use'); await c.page.waitForTimeout(1200);
    await openShare(c.page);
    s = await state(c.page);
    ok(s.carryLink.length > 10000 && /email/.test(s.carryWarn), '3: a big table trips the long-link warning (' + s.carryLink.length + ' characters)');
    await c.ctx.close();
}
// ---- 4. Host it on GitHub, Public
{
    const { ctx, page, seen, errors } = await boot('');
    await page.click('[data-example="dose"]'); await page.waitForTimeout(1000);
    await openShare(page); await githubTab(page, 'public');
    await page.fill('#ps-share-addr', 'https://github.com/u/r/blob/main/data/week3.pand'); await page.click('#ps-share-check'); await page.waitForTimeout(900);
    let s = await state(page);
    ok(s.addr === RAW + 'week3.pand', '4: a github.com page address is rewritten to the raw route');
    ok(/Reachable/.test(s.ghStatus) && /Pandion Plots project/.test(s.ghStatus) && /follows the file/.test(s.ghStatus) && s.ghLink === PAGE + '?project=' + RAW + 'week3.pand' && !s.ghCopyDisabled && s.freezeOffered, '4: Check reports a readable project on a branch and builds a ?project= link (' + s.ghStatus.slice(0, 70) + ')');
    await page.check('#ps-share-freeze'); await page.waitForTimeout(700);
    s = await state(page);
    ok(seen.commits.length === 1 && /path=data%2Fweek3\.pand/.test(seen.commits[0]) && s.ghLink === PAGE + '?project=https://raw.githubusercontent.com/u/r/' + SHA + '/data/week3.pand' && /Frozen at 0123456/.test(s.ghStatus), '4: Freeze asks GitHub once and pins the raw route to that commit');
    await page.uncheck('#ps-share-freeze'); await page.waitForTimeout(200);
    s = await state(page);
    ok(s.ghLink === PAGE + '?project=' + RAW + 'week3.pand', '4: unfreezing restores the branch link');
    await page.click('#ps-share-gh-copy'); await page.waitForTimeout(150);
    s = await state(page);
    ok(s.copied === s.ghLink, '4: Copy writes the link');
    await page.fill('#ps-share-addr', RAW + 'scores.csv'); await page.click('#ps-share-check'); await page.waitForTimeout(800);
    s = await state(page);
    ok(/a data file/.test(s.ghStatus) && s.ghLink === PAGE + '?data=' + RAW + 'scores.csv', '4: a CSV becomes a ?data= link');
    await page.fill('#ps-share-addr', 'https://blocked.test/file.pand'); await page.click('#ps-share-check'); await page.waitForTimeout(800);
    s = await state(page);
    ok(/CORS/.test(s.ghStatus) && /blocked\.test/.test(s.ghStatus) && s.ghCopyDisabled, '4: a host that refuses browsers is named (' + s.ghStatus.slice(0, 60) + ')');
    await githubTab(page, 'locked');
    await page.fill('#ps-share-addr', RAW + 'week3.pand'); await page.click('#ps-share-check'); await page.waitForTimeout(800);
    s = await state(page);
    ok(/not locked/.test(s.ghStatus) && s.ghCopyDisabled, '4: a plain file under Locked is refused (' + s.ghStatus.slice(0, 50) + ')');
    ok(errors.length === 0, '4: no page errors' + (errors.length ? ' (' + errors[0] + ')' : ''));
    await ctx.close();
}
// ---- 5. Unlisted with a token
let unlistedLink = '';
{
    const { ctx, page, seen } = await boot('');
    await page.click('[data-example="dose"]'); await page.waitForTimeout(1000);
    await openShare(page); await githubTab(page, 'unlisted');
    const btn = await page.textContent('#ps-share-create');
    ok(/secret gist/.test(btn), '5: the button names a secret gist');
    await page.click('#ps-share-create'); await page.waitForTimeout(300);
    let s = await state(page);
    ok(/Paste a GitHub token/.test(s.ghStatus) && seen.gists.length === 0, '5: without a token nothing is sent and the dialog says what is missing');
    await page.fill('#ps-share-token', 'github_pat_test'); await page.click('#ps-share-create'); await page.waitForTimeout(900);
    s = await state(page);
    const g = seen.gists[0];
    const fname = g ? Object.keys(g.body.files)[0] : '';
    let parsed = null; try { parsed = JSON.parse(g.body.files[fname].content); } catch (e) {}
    ok(seen.gists.length === 1 && g.auth === 'Bearer github_pat_test' && g.body.public === false && /\.pand$/.test(fname) && parsed && parsed.kind === 'pandion-plots-project', '5: one POST creates a secret gist holding the project file (' + fname + ')');
    ok(s.ghLink === PAGE + '?project=https://gist.githubusercontent.com/u/abc/raw/' + fname && /secret gist/.test(s.ghStatus) && !s.ghCopyDisabled, '5: the link points at the gist\'s live raw address (' + s.ghLink.slice(PAGE.length) + ')');
    unlistedLink = s.ghLink;
    await ctx.close();
    const b = await boot(unlistedLink.slice(PAGE.length));
    await b.page.click('#ps-openlink-open'); await b.page.waitForTimeout(1500);
    s = await state(b.page);
    ok(!s.card && /dose/i.test(s.name) && /from gist\.githubusercontent\.com/.test(s.detail), '5: opened elsewhere, the project lands with its provenance (' + s.detail + ')');
    await b.ctx.close();
}
// ---- 6. Locked with a token
{
    const { ctx, page, seen, errors } = await boot('');
    await page.click('[data-example="wellbeing"]'); await page.waitForTimeout(1000);
    await openShare(page); await githubTab(page, 'locked');
    await page.fill('#ps-share-token', 'github_pat_test'); await page.click('#ps-share-create'); await page.waitForTimeout(1200);
    let s = await state(page);
    const g = seen.gists[0], fname = g ? Object.keys(g.body.files)[0] : '';
    const content = g ? g.body.files[fname].content : '';
    ok(g && g.body.public === false && /\.pand\.locked$/.test(fname) && content.indexOf('PANDION-LOCKED 1\n') === 0 && content.indexOf('pandion-plots-project') < 0, '6: the gist holds only the locked text (' + fname + ')');
    const m = s.ghLink.match(/#key=([A-Za-z0-9_-]{22})$/);
    ok(m && s.ghLink.indexOf(PAGE + '?project=https://gist.githubusercontent.com/u/abc/raw/' + fname + '#key=') === 0 && /key is in the link/.test(s.ghStatus), '6: the link carries the key after the # (' + (m ? m[1].length : 0) + ' characters)');
    ok(errors.length === 0, '6: no page errors' + (errors.length ? ' (' + errors[0] + ')' : ''));
    const link = s.ghLink;
    await ctx.close();
    const b = await boot(link.slice(PAGE.length));
    s = await state(b.page);
    ok(s.card && /locked/.test(s.cardSub) && /travels in the link/.test(s.cardSub), '6: the card says the file is locked and the key travels in the link');
    await b.page.click('#ps-openlink-open'); await b.page.waitForTimeout(1500);
    s = await state(b.page);
    ok(!s.card && /wellbeing/i.test(s.name) && s.hash === '' && /from gist\.githubusercontent\.com/.test(s.detail), '6: Open unlocks it into the project and the key is gone from the address (' + s.name + ')');
    await b.ctx.close();
    const wrong = await boot(link.slice(PAGE.length).replace(/#key=.*$/, '#key=AAAAAAAAAAAAAAAAAAAAAA'));
    await wrong.page.click('#ps-openlink-open'); await wrong.page.waitForTimeout(1200);
    s = await state(wrong.page);
    ok(s.card && /does not fit/.test(s.cardStatus), '6: a wrong key is refused in the card (' + s.cardStatus + ')');
    await wrong.ctx.close();
    const none = await boot(link.slice(PAGE.length).replace(/#key=.*$/, ''));
    await none.page.click('#ps-openlink-open'); await none.page.waitForTimeout(1200);
    s = await state(none.page);
    ok(s.card && /carries no key/.test(s.cardStatus), '6: a locked file without a key says what is missing (' + s.cardStatus.slice(0, 50) + ')');
    await none.ctx.close();
}
// ---- 7. Locked by hand
{
    const { ctx, page } = await boot('');
    await page.click('[data-example="practice"]'); await page.waitForTimeout(1000);
    await openShare(page); await githubTab(page, 'locked');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#ps-share-download')]);
    const text = fs.readFileSync(await dl.path(), 'utf8');
    ok(/\.pand\.locked$/.test(dl.suggestedFilename()) && text.indexOf('PANDION-LOCKED 1\n') === 0, '7: Save the locked copy downloads the locked text (' + dl.suggestedFilename() + ')');
    lockedByHand['secret.pand.locked'] = text;
    await page.fill('#ps-share-addr', RAW + 'secret.pand.locked'); await page.click('#ps-share-check'); await page.waitForTimeout(900);
    let s = await state(page);
    ok(/a locked project/.test(s.ghStatus) && /#key=[A-Za-z0-9_-]{22}$/.test(s.ghLink) && s.ghLink.indexOf(PAGE + '?project=' + RAW + 'secret.pand.locked#key=') === 0, '7: Check accepts the locked file it made and adds the key (' + s.ghStatus.slice(0, 60) + ')');
    const link = s.ghLink;
    await ctx.close();
    const b = await boot(link.slice(PAGE.length));
    await b.page.click('#ps-openlink-open'); await b.page.waitForTimeout(1500);
    s = await state(b.page);
    ok(!s.card && /practice/i.test(s.name) && /from raw\.githubusercontent\.com/.test(s.detail), '7: the hand-hosted locked file opens elsewhere (' + s.name + ')');
    // a locked file this window never made
    await openShare(b.page); await githubTab(b.page, 'locked');
    await b.page.fill('#ps-share-addr', RAW + 'secret.pand.locked'); await b.page.click('#ps-share-check'); await b.page.waitForTimeout(900);
    s = await state(b.page);
    ok(/does not hold its key/.test(s.ghStatus) && s.ghCopyDisabled, '7: a locked file from another window is refused, with the reason');
    await b.ctx.close();
}
// ---- 8. Copy link on an open-data hit
{
    const { ctx, page } = await boot('');
    await page.click('#ps-welcome-find'); await page.waitForTimeout(500);
    await page.type('#ps-finddata-q', 'tooth'); await page.waitForTimeout(500);
    await page.click('#ps-finddata-results [data-find-copylink]'); await page.waitForTimeout(200);
    const s = await state(page);
    ok(s.copied === PAGE + '?data=https://vincentarelbundock.github.io/Rdatasets/csv/datasets/ToothGrowth.csv', '8: Copy link on a hit copies a ?data= link that opens it here (' + s.copied.slice(PAGE.length) + ')');
    await ctx.close();
}
await browser.close();
console.log(failures ? 'share-link: FAIL (' + failures + ')' : 'share-link: PASS');
process.exit(failures ? 1 : 0);
