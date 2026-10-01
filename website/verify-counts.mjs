// The usage counters on the site (Sep 2026, worker/README.md).
//
// The home page footer carries one settled line ("Browser app used N
// times since <date>") and usage.html (its own page since Sep 25 2026, so
// Torry can open it directly; no nav entry) carries the "Usage" table.
// Both fill in after the page loads from GET /api/counts (launches and
// the portable file, our Worker) and from GitHub's Releases API (every
// installer and .jmo, summed across releases, earliest asset date as
// "since"); both degrade honestly when a source fails. The portable
// download buttons send a click ping. The pages are served under a routed
// https://pandionplots.com so the page's own fetch('/api/counts') resolves
// (a file:// page cannot fetch at all).
//
// Cases:
//   1. The usage page with both sources routed to fixtures: every row fills with
//      the right sums and dates, old plotstudio-*.jmo names fold into the
//      jamovi 2.7 rows, an asset the fixture lists but the page has no row
//      for is added from the label map, feeds and archives are left out,
//      the status line stays hidden.
//   2. The usage page with both sources failing: dashes stay, the status line
//      shows, no page error.
//   3. Home: the footer line shows the launch count and date; hidden when
//      the API fails; the portable buttons (home and Download page) send
//      POST /api/hit/portable with no body on click.
//   4. The history behind each row (Oct 2026), on a fixed clock with
//      /api/daily routed to a fixture: every row becomes a button; a row
//      opens its chart with the right days, totals and zero-filled gaps;
//      the range and Day/Week/Month buttons rebin it (sums checked against
//      an independent count here) and a grouping that would leave one
//      point is disabled; the pointer and the arrow keys read each point;
//      the numbers table matches; a download row folds the old jamovi name
//      in and starts on the first hourly check; a row with no history,
//      and /api/daily failing, both say so; the row and Close both close
//      it; nothing overflows at 320px; axe finds nothing with it open.
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

async function open(browser, file, { counts, releases, daily, now, width } = {}) {
    const ctx = await browser.newContext({ viewport: { width: width || 1280, height: 900 } });
    const pings = [];
    await ctx.route('https://pandionplots.com/**', route => {
        const u = new URL(route.request().url());
        if (u.pathname.startsWith('/api/hit/')) {
            pings.push({ kind: u.pathname.slice('/api/hit/'.length), method: route.request().method(), body: route.request().postData() });
            return route.fulfill({ status: 204 });
        }
        if (u.pathname === '/api/daily') {
            return daily ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(daily) })
                         : route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"down"}' });
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
    if (now) await page.clock.setFixedTime(new Date(now));
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
        const { ctx, page, errors } = await open(browser, 'usage.html', { counts: COUNTS, releases: RELEASES });
        const r = await rowsOf(page);
        const g = k => r.rows[k] || {};
        ok(g('launch').count === '1,234' && g('launch').since === '25 Sep 2026', 'Usage page: the launch row shows the count and its since date (' + JSON.stringify(g('launch')) + ')');
        ok(g('launch-day').count === '321', 'Usage page: the launch-day row fills (' + g('launch-day').count + ')');
        ok(g('portable').count === '45' && g('portable').since === '26 Sep 2026', 'Usage page: the portable row fills from our counter (' + JSON.stringify(g('portable')) + ')');
        ok(g('Pandion-Plots-macOS.dmg').count === '29' && g('Pandion-Plots-macOS.dmg').since === '23 Aug 2026', 'Usage page: the macOS installer sums across releases with the earliest date (' + JSON.stringify(g('Pandion-Plots-macOS.dmg')) + ')');
        ok(g('Pandion-Plots-Windows-x64.exe').count === '36', 'Usage page: the Windows installer sums (' + g('Pandion-Plots-Windows-x64.exe').count + ')');
        ok(g('pandion-macos-arm64.jmo').count === '49' && g('pandion-macos-arm64.jmo').since === '25 Jul 2026', 'Usage page: the jamovi 2.7 macOS row folds the old plotstudio name in (' + JSON.stringify(g('pandion-macos-arm64.jmo')) + ')');
        ok(g('pandion-win-x64.jmo').count === '48', 'Usage page: the jamovi 2.7 Windows row folds the old name in (' + g('pandion-win-x64.jmo').count + ')');
        ok(g('pandion-macos-arm64-jamovi28.jmo').count === '18' && g('pandion-win-x64-jamovi28.jmo').count === '17', 'Usage page: the jamovi 28 rows fill');
        ok(g('pandion-macos-x64.jmo').count === '4' && /Intel/.test(g('pandion-macos-x64.jmo').item || ''), 'Usage page: an asset the page had no row for is added from the label map (' + JSON.stringify(g('pandion-macos-x64.jmo')) + ')');
        ok(!r.rows['latest.yml'] && !r.rows['Pandion-Plots-macOS.zip'], 'Usage page: update feeds and the auto-update archive are left out');
        ok(r.status === null, 'Usage page: the status line stays hidden when both sources answer');
        ok(errors.length === 0, 'Usage page: no page errors' + (errors.length ? ': ' + errors[0] : ''));
        await ctx.close();
    }
    // Case 2: About, both sources fail.
    {
        const { ctx, page, errors } = await open(browser, 'usage.html', {});
        const r = await rowsOf(page);
        const allDash = Object.values(r.rows).every(x => x.count === '-' && x.since === '-');
        ok(Object.keys(r.rows).length >= 9 && allDash, 'Usage page: with both sources down every row keeps its dashes (' + Object.keys(r.rows).length + ' rows)');
        ok(typeof r.status === 'string' && /could not be loaded/i.test(r.status), 'Usage page: and the status line says so (' + r.status + ')');
        ok(errors.length === 0, 'Usage page: no page errors when the sources fail' + (errors.length ? ': ' + errors[0] : ''));
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
    // Case 4: the history behind each row.
    {
        const NOW = '2026-10-20T15:00:00Z';
        const DAY = 86400000, day0 = Date.UTC(2026, 8, 25), today = Date.UTC(2026, 9, 20);
        const iso = t => new Date(t).toISOString().slice(0, 10);
        // Starts: a fixed pattern with every fifth day missing (a zero, not a gap).
        const launch = {}, launchDay = {};
        for (let t = day0, i = 0; t <= today; t += DAY, i++) {
            if (i % 5 !== 3) launch[iso(t)] = (i * 7) % 11 + 1;
            launchDay[iso(t)] = (i % 4) + 1;
        }
        const DAILY = {
            updated: NOW, hitsSince: '2026-09-25',
            hits: { launch: Object.entries(launch), 'launch-day': Object.entries(launchDay) },
            downloadsSince: '2026-10-01', downloadsChecked: '2026-10-20T14:59:00.000Z',
            downloads: {
                'Pandion-Plots-macOS.dmg': [['2026-10-02', 2], ['2026-10-09', 1], ['2026-10-20', 3]],
                'plotstudio-win-x64.jmo': [['2026-10-03', 1]],
                'pandion-win-x64.jmo': [['2026-10-03', 2], ['2026-10-10', 4]],
            },
        };
        // The expected numbers, counted here independently of the page.
        const sumDays = (series, from, to) => { let n = 0; for (let t = from; t <= to; t += DAY) n += series[iso(t)] || 0; return n; };
        const fmt = n => n.toLocaleString('en-US');
        const { ctx, page, errors } = await open(browser, 'usage.html', { counts: COUNTS, releases: RELEASES, daily: DAILY, now: NOW });
        const chart = () => page.evaluate(() => {
            const panel = document.querySelector('[data-role="usage-chart"]');
            const pressed = sel => Array.from(panel.querySelectorAll(sel)).filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent.replace(/\s*\(.*\)\s*/, '').trim());
            return {
                hidden: panel.hidden,
                title: panel.querySelector('[data-role="uc-title"]').textContent,
                total: panel.querySelector('[data-role="uc-total"]').textContent.replace(/\s+/g, ' ').trim(),
                note: panel.querySelector('[data-role="uc-note"]').textContent,
                points: panel.querySelectorAll('[data-role="uc-point"]').length,
                line: !!panel.querySelector('[data-role="uc-line"]'),
                empty: (panel.querySelector('.uc-empty') || {}).textContent || null,
                range: pressed('[data-range]'), bin: pressed('[data-bin]'),
                disabled: Array.from(panel.querySelectorAll('[data-bin]')).filter(b => b.disabled).map(b => b.textContent.trim()),
                numbers: Array.from(panel.querySelectorAll('[data-role="uc-rows"] tr')).map(tr => Array.from(tr.children).map(td => td.textContent)),
                expanded: Array.from(document.querySelectorAll('.usage-row-btn')).filter(b => b.getAttribute('aria-expanded') === 'true').map(b => b.textContent.trim()),
            };
        });
        const clickRow = key => page.click(`tr[data-kind="${key}"] .usage-row-btn, tr[data-asset="${key}"] .usage-row-btn`);
        const press = sel => page.click('[data-role="usage-chart"] ' + sel);

        const armed = await page.evaluate(() => [document.querySelectorAll('[data-role="usage-table"] tbody tr').length,
            document.querySelectorAll('[data-role="usage-table"] tbody tr .usage-row-btn[aria-controls="usage-chart"]').length]);
        ok(armed[0] === 10 && armed[1] === 10, 'History: every row, the added Intel one too, becomes a button that controls the chart (' + armed.join(' of ') + ')');
        let c = await chart();
        ok(c.hidden === true, 'History: the chart stays closed until a row is clicked');

        await clickRow('launch'); await page.waitForTimeout(150);
        c = await chart();
        const s30 = sumDays(launch, day0, today);
        ok(!c.hidden && c.title === 'Browser app, every start (reloads included)' && c.expanded.length === 1, 'History: a row opens its chart, titled after the row, its button expanded (' + c.title + ')');
        ok(c.range.join() === '1M' && c.bin.join() === 'Day' && c.points === 26 && c.line, 'History: it opens on the last month by day, from the first counted day: 26 points (' + c.range + ', ' + c.bin + ', ' + c.points + ')');
        ok(c.total === fmt(s30) + ' starts in the last 30 days (counting began 25 Sep 2026)', 'History: the total says what the window holds and when counting began (' + c.total + ')');
        ok(c.numbers.length === 26 && c.numbers[0][0] === 'Tue 20 Oct 2026, so far' && c.numbers[0][1] === String(launch['2026-10-20']) && c.numbers[25][0] === 'Fri 25 Sep 2026',
           'History: the numbers table lists every day, newest first, today marked so far (' + JSON.stringify(c.numbers[0]) + ')');
        const zeroDay = c.numbers.find(r => r[0] === 'Mon 28 Sep 2026');
        ok(zeroDay && zeroDay[1] === '0', 'History: a day with no row is a zero, not a gap (' + JSON.stringify(zeroDay) + ')');

        await press('[data-range="7"]'); c = await chart();
        ok(c.points === 7 && c.total === fmt(sumDays(launch, today - 6 * DAY, today)) + ' starts in the last 7 days', 'History: 1W shows the last seven days (' + c.points + ', ' + c.total + ')');
        ok(c.disabled.join() === 'Month', 'History: a grouping that would leave one point is disabled (Month on a week)');
        await press('[data-bin="week"]'); c = await chart();
        ok(c.bin.join() === 'Week' && c.points === 2 && c.numbers[0][0] === '19 Oct to 20 Oct 2026, so far' && c.numbers[0][1] === String(sumDays(launch, Date.UTC(2026, 9, 19), today))
           && c.numbers[1][0] === '14 Oct to 18 Oct 2026', 'History: weeks start on Monday and the window trims the first one (' + JSON.stringify(c.numbers) + ')');

        await press('[data-range="all"]'); c = await chart();
        ok(c.range.join() === 'All' && c.bin.join() === 'Week' && c.points === 5, 'History: All keeps the chosen grouping: five weeks since 25 Sep (' + c.points + ')');
        ok(c.numbers[4][0] === '25 Sep to 27 Sep 2026' && c.numbers[4][1] === String(sumDays(launch, day0, Date.UTC(2026, 8, 27))), 'History: the first week starts on the first counted day (' + JSON.stringify(c.numbers[4]) + ')');
        await press('[data-bin="month"]'); c = await chart();
        ok(c.points === 2 && c.numbers[0][0] === 'October 2026, so far' && c.numbers[0][1] === fmt(sumDays(launch, Date.UTC(2026, 9, 1), today))
           && c.numbers[1][0] === '25 Sep to 30 Sep 2026', 'History: months, the partial first one shown as its span (' + JSON.stringify(c.numbers) + ')');
        ok(c.total === fmt(s30) + ' starts since 25 Sep 2026', 'History: All totals everything since counting began (' + c.total + ')');

        // The pointer reads a point.
        await press('[data-range="30"]'); await press('[data-bin="day"]');
        // Bring the chart into view first, instantly: the page scrolls smoothly,
        // and a point still below the window would be aimed at off-screen.
        await page.evaluate(() => document.querySelector('[data-role="uc-plot"]').scrollIntoView({ block: 'center', behavior: 'instant' }));
        await page.waitForTimeout(50);
        const pt = await page.evaluate(() => { const r = document.querySelectorAll('[data-role="uc-point"]')[10].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
        await page.mouse.move(pt.x, pt.y);
        const tip = await page.evaluate(() => { const t = document.querySelector('[data-role="uc-tip"]'); return t && !t.hidden ? t.textContent : null; });
        const d10 = iso(day0 + 10 * DAY), n10 = launch[d10] || 0;
        ok(tip === n10 + ' ' + (n10 === 1 ? 'start' : 'starts') + 'Mon 5 Oct 2026', 'History: hovering a point shows its count and day (' + tip + ')');
        await page.mouse.move(5, 5);
        // The keyboard reads the points too.
        await page.focus('[data-role="uc-plot"]');
        let kb = await page.evaluate(() => [document.querySelector('[data-role="uc-tip"]').textContent, document.querySelector('[data-role="uc-live"]').textContent]);
        ok(kb[0].startsWith(String(launch['2026-10-20'])) && /20 Oct 2026, so far/.test(kb[1]), 'History: focusing the chart reads the newest point aloud (' + kb[1] + ')');
        await page.keyboard.press('ArrowLeft');
        kb = await page.evaluate(() => document.querySelector('[data-role="uc-live"]').textContent);
        ok(kb === (launch['2026-10-19'] || 0) + ' starts, Mon 19 Oct 2026', 'History: the left arrow steps back a day (' + kb + ')');
        await page.keyboard.press('Home');
        kb = await page.evaluate(() => document.querySelector('[data-role="uc-live"]').textContent);
        ok(/Fri 25 Sep 2026$/.test(kb), 'History: Home goes to the first point (' + kb + ')');

        // Browser-days: a day counts browsers, a week adds days.
        await clickRow('launch-day'); c = await chart();
        ok(c.title.startsWith('Browser app, days it was opened') && c.expanded.length === 1 && / browser-days in the last 30 days/.test(c.total), 'History: switching rows retitles the chart and moves the expanded state (' + c.total + ')');

        // A download row: the old jamovi name folds in; history starts at the first hourly check.
        await clickRow('pandion-win-x64.jmo'); c = await chart();
        ok(c.points === 20 && c.total === '7 downloads in the last 30 days (download history began 1 Oct 2026)', 'History: a download row starts at the first hourly check and folds the old file name in (' + c.points + ', ' + c.total + ')');
        ok(c.numbers.find(r => r[0] === 'Sat 3 Oct 2026')[1] === '3' && /every hour/.test(c.note) && /starts on 1 Oct 2026/.test(c.note), 'History: 1 + 2 on 3 Oct, and the note says how the history is kept (' + c.note + ')');

        // A row that has never been clicked: zeros, honestly.
        await clickRow('portable'); c = await chart();
        ok(c.points === 26 && c.total === '0 download clicks in the last 30 days (counting began 25 Sep 2026)', 'History: a counter with no clicks yet shows zeros since counting began (' + c.total + ')');

        // Closing: the same row, then Close (focus returns to the row).
        await clickRow('portable'); c = await chart();
        ok(c.hidden && c.expanded.length === 0, 'History: clicking the open row again closes it');
        await clickRow('launch'); await press('[data-role="uc-close"]');
        c = await chart();
        const focused = await page.evaluate(() => document.activeElement && document.activeElement.closest('tr') ? document.activeElement.closest('tr').getAttribute('data-kind') : null);
        ok(c.hidden && focused === 'launch', 'History: Close closes it and puts focus back on the row (' + focused + ')');

        // A plain click anywhere on the row works too.
        await page.click('tr[data-kind="launch-day"] td:last-child'); c = await chart();
        ok(!c.hidden && c.title.startsWith('Browser app, days it was opened'), 'History: clicking anywhere on a row opens it');

        // Accessibility with the chart open.
        let axeSrc = null;
        for (const base of [process.env.GB2_NODE_BASE, process.cwd(), '/private/tmp', '/tmp'].filter(Boolean)) {
            try { axeSrc = fs.readFileSync(createRequire(path.join(base, 'x.js')).resolve('axe-core/axe.min.js'), 'utf8'); break; } catch { /* next */ }
        }
        if (axeSrc) {
            await page.addScriptTag({ content: axeSrc });
            const v = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
                .violations.map(x => x.id + ' x' + x.nodes.length + ': ' + x.nodes[0].target.join(' ')));
            ok(v.length === 0, 'History: axe finds no WCAG 2.2 AA violation with the chart open' + (v.length ? ' (' + v.join('; ') + ')' : ''));
        } else console.log('  --  History: axe check skipped (axe-core not installed)');
        ok(errors.length === 0, 'History: no page errors' + (errors.length ? ': ' + errors[0] : ''));
        await ctx.close();

        // Before the first hourly check, and with /api/daily down.
        const early = Object.assign({}, DAILY, { downloadsSince: null, downloads: {} });
        const e1 = await open(browser, 'usage.html', { counts: COUNTS, releases: RELEASES, daily: early, now: NOW });
        await e1.page.click('tr[data-asset="Pandion-Plots-macOS.dmg"] .usage-row-btn'); await e1.page.waitForTimeout(150);
        const e1c = await e1.page.evaluate(() => [document.querySelector('.uc-empty') && document.querySelector('.uc-empty').textContent, document.querySelector('[data-role="uc-note"]').textContent]);
        ok(e1c[0] === 'No history yet.' && /fills in after the first check/.test(e1c[1]), 'History: before the first hourly check a download row says it has no history yet (' + e1c.join(' | ') + ')');
        await e1.ctx.close();
        const e2 = await open(browser, 'usage.html', { counts: COUNTS, releases: RELEASES, daily: null, now: NOW });
        await e2.page.click('tr[data-kind="launch"] .usage-row-btn'); await e2.page.waitForTimeout(200);
        const e2c = await e2.page.evaluate(() => document.querySelector('.uc-empty') && document.querySelector('.uc-empty').textContent);
        ok(e2c === 'The history could not be loaded right now.' && e2.errors.length === 0, 'History: with /api/daily down the chart says so, with no page error (' + e2c + ')');
        await e2.ctx.close();

        // A phone: the chart fits the column.
        const ph = await open(browser, 'usage.html', { counts: COUNTS, releases: RELEASES, daily: DAILY, now: NOW, width: 320 });
        await ph.page.click('tr[data-kind="launch"] .usage-row-btn'); await ph.page.waitForTimeout(200);
        const over = await ph.page.evaluate(() => [document.documentElement.scrollWidth - document.documentElement.clientWidth,
            document.querySelectorAll('[data-role="uc-point"]').length,
            Math.round(document.querySelector('[data-role="uc-plot"] svg').getBoundingClientRect().right), document.documentElement.clientWidth]);
        ok(over[0] <= 0 && over[1] === 26 && over[2] <= over[3], 'History: at 320px the open chart fits without sideways scrolling (' + JSON.stringify(over) + ')');
        await ph.ctx.close();
    }
} finally {
    await browser.close();
}
if (fails) { console.log('USAGE COUNTERS: ' + fails + ' failure(s)'); process.exit(1); }
console.log('USAGE COUNTERS: ALL GREEN');
