// The usage counters on the site (Sep 2026, worker/README.md).
//
// The home page footer carries one settled line ("Opened in the browser N
// times since <date>") and About carries the "How much it is used" table.
// Both fill in after the page loads from GET /api/counts (launches and
// the portable file, our Worker) and from GitHub's Releases API (every
// installer and .jmo, summed across releases, earliest asset date as
// "since"); both degrade honestly when a source fails. The portable
// download buttons send a click ping. The pages are served under a routed
// https://pandionplots.com so the page's own fetch('/api/counts') resolves
// (a file:// page cannot fetch at all).
//
// Cases:
//   1. About with both sources routed to fixtures: every row fills with
//      the right sums and dates, old plotstudio-*.jmo names fold into the
//      jamovi 2.7 rows, an asset the fixture lists but the page has no row
//      for is added from the label map, feeds and archives are left out,
//      the status line stays hidden.
//   2. About with both sources failing: dashes stay, the status line
//      shows, no page error.
//   3. Home: the footer line shows the launch count and date; hidden when
//      the API fails; the portable buttons (home and Download page) send
//      POST /api/hit/portable with no body on click.
// CONTROL (the site before the counters): every case finds no markup.
//
// Usage: node website/verify-counts.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
function loadPlaywright() {
    for (const base of [process.env.GB2_NODE_BASE, process.cwd(), '/private/tmp', '/tmp'].filter(Boolean)) {
        try { return createRequire(path.join(base, 'x.js'))('playwright'); } catch { /* next */ }
    }
    console.error('playwright not found'); process.exit(2);
}
const { chromium } = loadPlaywright();
const websiteDir = path.dirname(fileURLToPath(import.meta.url));
let fails = 0; const ok = (c, m) => { console.log((c ? '  ok  ' : ' FAIL ') + m); if (!c) fails++; };

const COUNTS = { updated: '2026-09-25T10:00:00Z',
    launch: { count: 1234, since: '2026-09-25' }, 'launch-day': { count: 321, since: '2026-09-25' }, portable: { count: 45, since: '2026-09-26' } };
const asset = (name, n, at) => ({ name, download_count: n, created_at: at });
const RELEASES = [
    { tag_name: 'v3.1.3', assets: [asset('Pandion-Plots-macOS.dmg', 16, '2026-09-14T10:00:00Z'), asset('Pandion-Plots-Windows-x64.exe', 26, '2026-09-14T10:00:00Z'),
        asset('pandion-macos-arm64.jmo', 35, '2026-09-14T10:00:00Z'), asset('pandion-win-x64.jmo', 32, '2026-09-14T10:00:00Z'),
        asset('pandion-macos-arm64-jamovi28.jmo', 18, '2026-09-14T10:00:00Z'), asset('pandion-win-x64-jamovi28.jmo', 17, '2026-09-14T10:00:00Z'),
        asset('pandion-macos-x64.jmo', 4, '2026-09-23T10:00:00Z'),
        asset('latest.yml', 31, '2026-09-14T10:00:00Z'), asset('Pandion-Plots-macOS.zip', 3, '2026-09-14T10:00:00Z')] },
    { tag_name: 'v3.1.0', assets: [asset('Pandion-Plots-macOS.dmg', 13, '2026-08-23T10:00:00Z'), asset('Pandion-Plots-Windows-x64.exe', 10, '2026-08-23T10:00:00Z'),
        asset('pandion-macos-arm64.jmo', 6, '2026-08-23T10:00:00Z'), asset('pandion-win-x64.jmo', 10, '2026-08-23T10:00:00Z')] },
    { tag_name: 'v2.9.5', assets: [asset('plotstudio-macos-arm64.jmo', 8, '2026-07-25T10:00:00Z'), asset('plotstudio-win-x64.jmo', 6, '2026-07-25T10:00:00Z')] },
];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

async function open(browser, file, { counts, releases } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pings = [];
    await ctx.route('https://pandionplots.com/**', route => {
        const u = new URL(route.request().url());
        if (u.pathname.startsWith('/api/hit/')) {
            pings.push({ kind: u.pathname.slice('/api/hit/'.length), method: route.request().method(), body: route.request().postData() });
            return route.fulfill({ status: 204 });
        }
        if (u.pathname === '/api/counts') {
            return counts ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(counts) })
                          : route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"down"}' });
        }
        const f = path.join(websiteDir, u.pathname === '/' ? 'index.html' : u.pathname);
        if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
        return route.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
    });
    await ctx.route('https://api.github.com/**', route => releases
        ? route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(releases) })
        : route.fulfill({ status: 403, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' }));
    // Nothing else leaves the page (fonts, other hosts): stay offline.
    await ctx.route(/^https?:\/\/(?!pandionplots\.com|api\.github\.com)/, route => route.abort());
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.goto('https://pandionplots.com/' + file);
    await page.waitForTimeout(1200);
    return { ctx, page, pings, errors };
}
const rowsOf = page => page.evaluate(() => {
    const out = {};
    for (const tr of document.querySelectorAll('[data-role="usage-table"] tbody tr')) {
        const tds = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
        out[tr.getAttribute('data-kind') || tr.getAttribute('data-asset')] = { item: tds[0], by: tds[1], since: tds[2], count: tds[3] };
    }
    const st = document.querySelector('[data-role="usage-status"]');
    return { rows: out, status: st ? (st.hidden ? null : st.textContent.trim()) : null };
});
const clickPortable = page => page.evaluate(() => {
    const l = document.querySelector('a[data-count="portable"]');
    if (!l) return false;
    l.addEventListener('click', e => e.preventDefault(), { once: true });
    l.click();
    return true;
});

const browser = await chromium.launch();
try {
    // Case 1: About, both sources answer.
    {
        const { ctx, page, errors } = await open(browser, 'about.html', { counts: COUNTS, releases: RELEASES });
        const r = await rowsOf(page);
        const g = k => r.rows[k] || {};
        ok(g('launch').count === '1,234' && g('launch').since === '25 Sep 2026', 'About: the launch row shows the count and its since date (' + JSON.stringify(g('launch')) + ')');
        ok(g('launch-day').count === '321', 'About: the launch-day row fills (' + g('launch-day').count + ')');
        ok(g('portable').count === '45' && g('portable').since === '26 Sep 2026', 'About: the portable row fills from our counter (' + JSON.stringify(g('portable')) + ')');
        ok(g('Pandion-Plots-macOS.dmg').count === '29' && g('Pandion-Plots-macOS.dmg').since === '23 Aug 2026', 'About: the macOS installer sums across releases with the earliest date (' + JSON.stringify(g('Pandion-Plots-macOS.dmg')) + ')');
        ok(g('Pandion-Plots-Windows-x64.exe').count === '36', 'About: the Windows installer sums (' + g('Pandion-Plots-Windows-x64.exe').count + ')');
        ok(g('pandion-macos-arm64.jmo').count === '49' && g('pandion-macos-arm64.jmo').since === '25 Jul 2026', 'About: the jamovi 2.7 macOS row folds the old plotstudio name in (' + JSON.stringify(g('pandion-macos-arm64.jmo')) + ')');
        ok(g('pandion-win-x64.jmo').count === '48', 'About: the jamovi 2.7 Windows row folds the old name in (' + g('pandion-win-x64.jmo').count + ')');
        ok(g('pandion-macos-arm64-jamovi28.jmo').count === '18' && g('pandion-win-x64-jamovi28.jmo').count === '17', 'About: the jamovi 28 rows fill');
        ok(g('pandion-macos-x64.jmo').count === '4' && /Intel/.test(g('pandion-macos-x64.jmo').item || ''), 'About: an asset the page had no row for is added from the label map (' + JSON.stringify(g('pandion-macos-x64.jmo')) + ')');
        ok(!r.rows['latest.yml'] && !r.rows['Pandion-Plots-macOS.zip'], 'About: update feeds and the auto-update archive are left out');
        ok(r.status === null, 'About: the status line stays hidden when both sources answer');
        ok(errors.length === 0, 'About: no page errors' + (errors.length ? ': ' + errors[0] : ''));
        await ctx.close();
    }
    // Case 2: About, both sources fail.
    {
        const { ctx, page, errors } = await open(browser, 'about.html', {});
        const r = await rowsOf(page);
        const allDash = Object.values(r.rows).every(x => x.count === '-' && x.since === '-');
        ok(Object.keys(r.rows).length >= 9 && allDash, 'About: with both sources down every row keeps its dashes (' + Object.keys(r.rows).length + ' rows)');
        ok(typeof r.status === 'string' && /could not be loaded/i.test(r.status), 'About: and the status line says so (' + r.status + ')');
        ok(errors.length === 0, 'About: no page errors when the sources fail' + (errors.length ? ': ' + errors[0] : ''));
        await ctx.close();
    }
    // Case 3: the home page footer and the portable click ping.
    {
        const a = await open(browser, 'index.html', { counts: COUNTS });
        const foot = await a.page.evaluate(() => { const s = document.querySelector('[data-role="foot-count"]'); return s ? { hidden: s.hidden, text: s.textContent.replace(/\s+/g, ' ').trim() } : null; });
        ok(!!foot && foot.hidden === false && /1,234/.test(foot.text) && /25 Sep 2026/.test(foot.text), 'home: the footer line shows the launch count and date (' + JSON.stringify(foot) + ')');
        ok(await clickPortable(a.page), 'home: the portable button carries data-count');
        await a.page.waitForTimeout(400);
        ok(a.pings.length === 1 && a.pings[0].kind === 'portable' && a.pings[0].method === 'POST' && !a.pings[0].body, 'home: the portable button sends one empty POST /api/hit/portable (' + JSON.stringify(a.pings) + ')');
        ok(a.errors.length === 0, 'home: no page errors' + (a.errors.length ? ': ' + a.errors[0] : ''));
        await a.ctx.close();
        const b = await open(browser, 'index.html', {});
        const foot2 = await b.page.evaluate(() => { const s = document.querySelector('[data-role="foot-count"]'); return s ? s.hidden : null; });
        ok(foot2 === true, 'home: the footer line stays hidden when the counter API fails');
        ok(b.errors.length === 0, 'home: no page errors when the API fails');
        await b.ctx.close();
        const c = await open(browser, 'download.html', { counts: COUNTS });
        ok(await clickPortable(c.page), 'download page: the portable button carries data-count');
        await c.page.waitForTimeout(400);
        ok(c.pings.length === 1 && c.pings[0].kind === 'portable', 'download page: the portable button sends the click ping too');
        await c.ctx.close();
    }
} finally {
    await browser.close();
}
if (fails) { console.log('USAGE COUNTERS: ' + fails + ' failure(s)'); process.exit(1); }
console.log('USAGE COUNTERS: ALL GREEN');
