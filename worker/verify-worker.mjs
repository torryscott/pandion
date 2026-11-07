// The counter Worker's rules, run in Node against the module itself (the
// Cloudflare runtime is not needed: fetch(req, env) is plain JavaScript
// over Request/Response, which Node 18+ has).
//
//   1. a person's browser ping (Origin, same-origin Sec-Fetch, a Chrome
//      User-Agent) is counted once; the reply is 204 with no body
//   2. an old browser with no Sec-Fetch headers but a good Origin counts
//   3. Googlebot, GPTBot, curl and a Python script are not counted
//   4. a cross-site Sec-Fetch-Site or a missing Origin is not counted
//   5. Cloudflare's verified-bot flag drops the ping
//   6. an unknown kind or a GET is not counted (405 on GET)
//   7. /api/counts sums the table per kind, with the earliest day
//   8. without a database: 503 JSON on /api/counts, 204 on a ping
// Every dropped ping still answers 204, so a bot learns nothing.
//
// The daily history (Oct 2026):
//   9. /api/daily groups the table day by day per kind, with the first day
//      counting began, and has no download history before the first check
//  10. which files count as downloads (installers and modules, not update
//      feeds or archives, not drafts), and how a total's growth becomes a
//      day's downloads: growth, a new file, a re-uploaded file, no change
//  11. the hourly job end to end on real SQLite (sql.js, when installed
//      beside playwright; skipped otherwise): baseline, growth, a 304 that
//      costs nothing, a new release and a reset, GitHub refusing, the
//      scheduled() entry point itself, and what /api/daily then reports,
//      including the note every run leaves (refusals and GitHub's rate-limit
//      state too, so a stalled history can be diagnosed from outside).
//
// The site pings (Nov 2026):
//  12. page:<id>, time:<id>:<band> and tour:<id>:start|done count; the
//      same shapes with a wrong case, an empty or over-long id, a path in
//      the id, an unknown band or verb, or an extra part do not; and
//      /api/daily gives each kind its own first day (hitsSinceOf) beside
//      the shared hitsSince.
//
// The printed cards (Nov 2026):
//  13. a phone opening pandionplots.com/card (the QR code) is redirected to
//      the home page and counted once as card, the count written after the
//      redirect goes out; HEAD, prefetch, prerender, a script, a frame, a
//      click from this site, a phone with no Sec-Fetch headers, link
//      previews, crawlers, curl and verified bots are redirected but not
//      counted; a QR app's browser that names itself a scanner counts; no
//      page can ping "card"; no database or a failing one still redirects;
//      look-alike paths are the static site; /api/counts and /api/daily
//      carry the card kind like any other.
//
// Usage: node worker/verify-worker.mjs
import worker, { isCountable, isScanCountable, kindOk, totalsFromReleases, downloadIncrements, snapshotDownloads } from './index.js';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
let fails = 0; const ok = (c, m) => { console.log((c ? '  ok  ' : ' FAIL ') + m); if (!c) fails++; };

function mockEnv(rows) {
    const bumps = [];
    const db = {
        prepare: sql => ({
            bind: (...a) => ({ run: async () => { bumps.push(a[0]); return {}; } }),
            all: async () => ({ results: rows || [] }),
        }),
    };
    return { env: { pandion_counts: db, ASSETS: { fetch: async () => new Response('asset', { status: 200 }) } }, bumps };
}
const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
function ping(kind, headers, cf) {
    const r = new Request('https://pandionplots.com/api/hit/' + kind, { method: 'POST', headers });
    if (cf) Object.defineProperty(r, 'cf', { value: cf });
    return r;
}
const human = { 'Origin': 'https://pandionplots.com', 'User-Agent': CHROME, 'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Mode': 'no-cors' };

// 1
{
    const { env, bumps } = mockEnv();
    const res = await worker.fetch(ping('launch', human), env);
    ok(res.status === 204 && (await res.text()) === '', 'a person\'s ping answers 204 with no body');
    ok(bumps.length === 1 && bumps[0] === 'launch', 'and is counted once as launch (' + JSON.stringify(bumps) + ')');
    ok(isCountable(ping('launch', human)) === true, 'isCountable says yes to it');
}
// 2
{
    const { env, bumps } = mockEnv();
    await worker.fetch(ping('launch-day', { 'Origin': 'https://pandionplots.com', 'User-Agent': 'Mozilla/5.0 (iPad; CPU OS 15_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1' }), env);
    ok(bumps.length === 1 && bumps[0] === 'launch-day', 'an older Safari with no Sec-Fetch headers still counts');
}
// 3
{
    const bots = [
        ['Googlebot', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
        ['GPTBot', 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.0; +https://openai.com/gptbot'],
        ['curl', 'curl/8.4.0'],
        ['python-requests', 'python-requests/2.31'],
        ['a headless browser', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0.0.0 Safari/537.36'],
    ];
    for (const [name, ua] of bots) {
        const { env, bumps } = mockEnv();
        const res = await worker.fetch(ping('launch', Object.assign({}, human, { 'User-Agent': ua })), env);
        ok(res.status === 204 && bumps.length === 0, name + ' is answered 204 but not counted');
    }
}
// 4
{
    let m = mockEnv();
    await worker.fetch(ping('launch', Object.assign({}, human, { 'Sec-Fetch-Site': 'cross-site' })), m.env);
    ok(m.bumps.length === 0, 'a cross-site Sec-Fetch-Site is not counted');
    m = mockEnv();
    await worker.fetch(ping('launch', { 'User-Agent': CHROME }), m.env);
    ok(m.bumps.length === 0, 'a ping with no Origin or Referer is not counted');
    m = mockEnv();
    await worker.fetch(ping('launch', Object.assign({}, human, { 'Origin': 'https://evil.example' })), m.env);
    ok(m.bumps.length === 0, 'a foreign Origin is not counted');
}
// 5
{
    const { env, bumps } = mockEnv();
    await worker.fetch(ping('launch', human, { verifiedBotCategory: 'Search Engine Crawler' }), env);
    ok(bumps.length === 0, 'Cloudflare\'s verified-bot flag drops the ping');
}
// 6
{
    let m = mockEnv();
    await worker.fetch(ping('install', human), m.env);
    ok(m.bumps.length === 0, 'an unknown kind is not counted');
    m = mockEnv();
    const res = await worker.fetch(new Request('https://pandionplots.com/api/hit/launch', { headers: human }), m.env);
    ok(res.status === 405 && m.bumps.length === 0, 'a GET ping is refused (405) and not counted');
}
// 7
{
    const { env } = mockEnv([{ kind: 'launch', n: 12, since: '2026-09-25' }, { kind: 'portable', n: 3, since: '2026-09-27' }]);
    const res = await worker.fetch(new Request('https://pandionplots.com/api/counts'), env);
    const j = await res.json();
    ok(res.status === 200 && j.launch && j.launch.count === 12 && j.launch.since === '2026-09-25' && j.portable.count === 3, '/api/counts reports each kind with its count and first day (' + JSON.stringify(j) + ')');
    ok(res.headers.get('access-control-allow-origin') === '*' && /max-age=60/.test(res.headers.get('cache-control') || ''), 'and is cacheable for a minute, readable cross-origin');
}
// 8
{
    const env = { ASSETS: { fetch: async () => new Response('asset') } };
    const res = await worker.fetch(new Request('https://pandionplots.com/api/counts'), env);
    ok(res.status === 503, 'without a database /api/counts answers 503');
    const res2 = await worker.fetch(ping('launch', human), env);
    ok(res2.status === 204, 'and a ping still answers 204');
    const res3 = await worker.fetch(new Request('https://pandionplots.com/about.html'), env);
    ok((await res3.text()) === 'asset', 'every other path is the static site');
}
// 9
{
    const answers = {
        hits: [{ day: '2026-09-25', kind: 'launch', n: 5 }, { day: '2026-09-25', kind: 'launch-day', n: 3 },
               { day: '2026-09-27', kind: 'launch', n: 2 }, { day: '2026-09-28', kind: 'portable', n: 1 }],
    };
    const fake = (dlThrows) => ({
        prepare: sql => ({
            all: async () => {
                if (/FROM hits/.test(sql)) return { results: answers.hits };
                if (dlThrows) throw new Error('D1_ERROR: no such table: downloads');
                if (/FROM downloads/.test(sql)) return { results: [{ day: '2026-10-02', asset: 'Pandion-Plots-macOS.dmg', n: 4 }] };
                if (/FROM meta/.test(sql)) return { results: [{ key: 'downloads_since', value: '2026-10-01' }, { key: 'downloads_checked', value: '2026-10-02T09:59:00.000Z' }] };
                return { results: [] };
            },
        }),
    });
    const env = d => ({ pandion_counts: d, ASSETS: { fetch: async () => new Response('asset') } });
    let res = await worker.fetch(new Request('https://pandionplots.com/api/daily'), env(fake(true)));
    let j = await res.json();
    ok(res.status === 200 && j.hitsSince === '2026-09-25', '/api/daily answers with the day counting began (' + j.hitsSince + ')');
    ok(JSON.stringify(j.hits.launch) === '[["2026-09-25",5],["2026-09-27",2]]' && JSON.stringify(j.hits.portable) === '[["2026-09-28",1]]',
       'and each kind day by day, in day order (' + JSON.stringify(j.hits) + ')');
    ok(j.downloadsSince === null && JSON.stringify(j.downloads) === '{}', 'before the first hourly check there is no download history, and no error');
    ok(/max-age=300/.test(res.headers.get('cache-control') || '') && res.headers.get('access-control-allow-origin') === '*', 'it is cacheable for five minutes, readable cross-origin');
    res = await worker.fetch(new Request('https://pandionplots.com/api/daily'), env(fake(false)));
    j = await res.json();
    ok(j.downloadsSince === '2026-10-01' && j.downloadsChecked === '2026-10-02T09:59:00.000Z' && JSON.stringify(j.downloads) === '{"Pandion-Plots-macOS.dmg":[["2026-10-02",4]]}',
       'after it, the download history comes with its first day and the last check (' + JSON.stringify(j.downloads) + ')');
    res = await worker.fetch(new Request('https://pandionplots.com/api/daily'), { ASSETS: { fetch: async () => new Response('asset') } });
    ok(res.status === 503, 'without a database /api/daily answers 503');
}
// 10
{
    const rel = [
        { tag_name: 'v3.2.0', draft: true, assets: [{ name: 'Pandion-Plots-macOS.dmg', download_count: 9 }] },
        { tag_name: 'v3.1.3', assets: [
            { name: 'Pandion-Plots-macOS.dmg', download_count: 16 }, { name: 'Pandion-Plots-Windows-x64.exe', download_count: 26 },
            { name: 'pandion-win-x64.jmo', download_count: 32 }, { name: 'latest.yml', download_count: 300 },
            { name: 'latest-mac.yml', download_count: 300 }, { name: 'Pandion-Plots-macOS.zip', download_count: 3 },
            { name: 'Pandion-Plots-Windows-x64.exe.blockmap', download_count: 4 }] },
    ];
    const t = totalsFromReleases(rel);
    ok(t.length === 3 && t.every(x => x.release === 'v3.1.3') && t.map(x => x.asset).join() === 'Pandion-Plots-macOS.dmg,Pandion-Plots-Windows-x64.exe,pandion-win-x64.jmo',
       'only installers and modules on published releases count (' + t.map(x => x.asset).join(', ') + ')');
    const prev = [{ release: 'v3.1.3', asset: 'Pandion-Plots-macOS.dmg', total: 10 }, { release: 'v3.1.3', asset: 'Pandion-Plots-Windows-x64.exe', total: 40 },
                  { release: 'v3.1.3', asset: 'pandion-win-x64.jmo', total: 32 }];
    const cur = [{ release: 'v3.1.3', asset: 'Pandion-Plots-macOS.dmg', total: 16 }, { release: 'v3.1.3', asset: 'Pandion-Plots-Windows-x64.exe', total: 3 },
                 { release: 'v3.1.3', asset: 'pandion-win-x64.jmo', total: 32 }, { release: 'v3.2.0', asset: 'Pandion-Plots-macOS.dmg', total: 2 }];
    const r = downloadIncrements(prev, cur);
    ok(r.increments['Pandion-Plots-macOS.dmg'] === 8, 'growth on an old release and a new release\'s file add up per file name (6 + 2 = ' + r.increments['Pandion-Plots-macOS.dmg'] + ')');
    ok(r.increments['Pandion-Plots-Windows-x64.exe'] === 3, 'a total that went down was re-uploaded: everything it shows now is new (' + r.increments['Pandion-Plots-Windows-x64.exe'] + ')');
    ok(!('pandion-win-x64.jmo' in r.increments) && r.changed.length === 3, 'an unchanged file adds nothing and is not rewritten (' + r.changed.length + ' totals changed)');
}
// 11
{
    let initSqlJs = null;
    for (const base of [process.env.GB2_NODE_BASE, process.cwd(), '/private/tmp', '/tmp'].filter(Boolean)) {
        try { initSqlJs = createRequire(path.join(base, 'x.js'))('sql.js'); break; } catch { /* next */ }
    }
    if (!initSqlJs) {
        console.log('  --  the hourly job on real SQLite skipped: sql.js is not installed (npm install sql.js beside playwright)');
    } else {
        const SQL = await initSqlJs();
        const sdb = new SQL.Database();
        sdb.exec(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql'), 'utf8'));
        // A D1 stand-in over SQLite: prepare/bind/run/all/first, and batch as one transaction.
        const stmt = (sql, params = []) => ({
            sql, params,
            bind: (...p) => stmt(sql, p),
            run: async () => { sdb.run(sql, params); return { success: true }; },
            all: async () => { const st = sdb.prepare(sql); st.bind(params); const results = []; while (st.step()) results.push(st.getAsObject()); st.free(); return { results }; },
            first: async col => { const st = sdb.prepare(sql); st.bind(params); const row = st.step() ? st.getAsObject() : null; st.free(); return row ? (col ? row[col] : row) : null; },
        });
        const d1 = { prepare: sql => stmt(sql), batch: async list => {
            sdb.run('BEGIN');
            try { for (const s of list) sdb.run(s.sql, s.params); sdb.run('COMMIT'); } catch (e) { sdb.run('ROLLBACK'); throw e; }
            return list.map(() => ({ success: true }));
        } };
        const env = { pandion_counts: d1, ASSETS: { fetch: async () => new Response('asset') } };
        const rows = sql => { const r = sdb.exec(sql); return r.length ? r[0].values : []; };
        const sent = [];
        let reply = null;
        const gh = async (url, init) => { sent.push(init.headers); return reply(); };
        const json = (body, etag) => () => new Response(JSON.stringify(body), { status: 200, headers: etag ? { ETag: etag } : {} });
        const at = iso => Date.parse(iso);
        const rel = (tag, files) => ({ tag_name: tag, assets: Object.entries(files).map(([name, n]) => ({ name, download_count: n })) });

        reply = json([rel('v3.1.3', { 'Pandion-Plots-macOS.dmg': 100, 'pandion-win-x64.jmo': 30, 'latest.yml': 999 }), rel('v3.1.0', { 'Pandion-Plots-macOS.dmg': 20 })], 'W/"a"');
        let r = await snapshotDownloads(env, at('2026-10-01T10:59:00Z'), gh);
        ok(r.status === 'baseline' && r.files === 3 && rows('SELECT COUNT(*) FROM downloads')[0][0] === 0, 'the first check notes the totals and records no downloads (' + JSON.stringify(r) + ')');
        ok(rows("SELECT value FROM meta WHERE key = 'downloads_since'")[0][0] === '2026-10-01', 'and marks the day the history starts');
        const note = () => JSON.parse(rows("SELECT value FROM meta WHERE key = 'downloads_last_run'")[0][0]);
        ok(note().status === 'baseline' && note().files === 3 && note().at === '2026-10-01T10:59:00.000Z', 'and leaves a note of what it did (' + JSON.stringify(note()) + ')');
        ok(!sent[0]['If-None-Match'] && /pandionplots/.test(sent[0]['User-Agent']) && !sent[0].Authorization, 'it names itself to GitHub and sends no token it does not have');

        reply = json([rel('v3.1.3', { 'Pandion-Plots-macOS.dmg': 103, 'pandion-win-x64.jmo': 31, 'latest.yml': 1500 }), rel('v3.1.0', { 'Pandion-Plots-macOS.dmg': 21 })], 'W/"b"');
        r = await snapshotDownloads(env, at('2026-10-01T11:59:00Z'), gh);
        ok(r.status === 'recorded' && r.downloads === 5, 'the next check records the growth (' + JSON.stringify(r) + ')');
        ok(JSON.stringify(rows("SELECT day, asset, n FROM downloads ORDER BY asset")) === '[["2026-10-01","Pandion-Plots-macOS.dmg",4],["2026-10-01","pandion-win-x64.jmo",1]]',
           'per file name, summed across releases, on that day (' + JSON.stringify(rows('SELECT day, asset, n FROM downloads ORDER BY asset')) + ')');
        ok(sent[1]['If-None-Match'] === 'W/"a"', 'and asks GitHub only for what changed since the last answer');

        reply = () => new Response(null, { status: 304 });
        r = await snapshotDownloads(env, at('2026-10-01T12:59:00Z'), gh);
        ok(r.status === 'unchanged' && sent[2]['If-None-Match'] === 'W/"b"' && rows('SELECT SUM(n) FROM downloads')[0][0] === 5, 'an unchanged answer (304) records nothing');
        ok(note().status === 'unchanged', 'but its note says the check ran (' + JSON.stringify(note()) + ')');

        reply = json([rel('v3.2.0', { 'Pandion-Plots-macOS.dmg': 2 }), rel('v3.1.3', { 'Pandion-Plots-macOS.dmg': 103, 'pandion-win-x64.jmo': 0 }), rel('v3.1.0', { 'Pandion-Plots-macOS.dmg': 21 })], 'W/"c"');
        r = await snapshotDownloads(env, at('2026-10-02T00:59:00Z'), gh);
        ok(r.status === 'recorded' && r.downloads === 2, 'a new release counts from zero, and a re-uploaded file that reads 0 adds nothing (' + JSON.stringify(r) + ')');
        ok(JSON.stringify(rows("SELECT n FROM downloads WHERE day = '2026-10-02'")) === '[[2]]', 'on the new day');

        reply = () => new Response('{"message":"API rate limit exceeded"}', { status: 403,
            headers: { 'X-RateLimit-Limit': '60', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(Date.parse('2026-10-02T02:30:00Z') / 1000) } });
        const before = JSON.stringify(rows('SELECT * FROM downloads')) + JSON.stringify(rows('SELECT * FROM download_totals'));
        r = await snapshotDownloads(env, at('2026-10-02T01:59:00Z'), gh);
        ok(r.status === 'github-403' && before === JSON.stringify(rows('SELECT * FROM downloads')) + JSON.stringify(rows('SELECT * FROM download_totals')),
           'GitHub refusing changes nothing; the next hour catches up');
        const refused = note();
        ok(refused.status === 'github-403' && refused.remaining === 0 && refused.limit === 60 && refused.reset === '2026-10-02T02:30:00.000Z' && refused.authenticated === false,
           'a refusal is noted with GitHub\'s allowance and whether a token was sent (' + JSON.stringify(refused) + ')');

        // The real entry point, with fetch and a token as Cloudflare would provide them.
        const realFetch = globalThis.fetch;
        globalThis.fetch = gh;
        reply = json([rel('v3.2.0', { 'Pandion-Plots-macOS.dmg': 5 }), rel('v3.1.3', { 'Pandion-Plots-macOS.dmg': 103, 'pandion-win-x64.jmo': 1 }), rel('v3.1.0', { 'Pandion-Plots-macOS.dmg': 21 })], 'W/"d"');
        const waits = [];
        const logs = []; const realLog = console.log; console.log = (...a) => logs.push(a.join(' '));
        try {
            await worker.scheduled({ scheduledTime: at('2026-10-02T02:59:00Z'), cron: '59 * * * *' }, Object.assign({ GITHUB_TOKEN: 'test-token' }, env), { waitUntil: p => waits.push(p) });
            await Promise.all(waits);
        } finally { globalThis.fetch = realFetch; console.log = realLog; }
        ok(waits.length === 1 && logs.some(l => /download history: .*"recorded"/.test(l)), 'scheduled() runs the check and logs what it did (' + logs.join(' | ') + ')');
        ok(sent[sent.length - 1].Authorization === 'Bearer test-token', 'a GITHUB_TOKEN secret, when set, is sent');

        const res = await worker.fetch(new Request('https://pandionplots.com/api/daily'), env);
        const j = await res.json();
        ok(j.downloadsSince === '2026-10-01' && j.downloadsChecked === '2026-10-02T02:59:00.000Z', '/api/daily reports when the history starts and the last check (' + j.downloadsSince + ', ' + j.downloadsChecked + ')');
        ok(j.downloadsLastRun && j.downloadsLastRun.status === 'recorded' && j.downloadsLastRun.downloads === 4, 'and the last run\'s note (' + JSON.stringify(j.downloadsLastRun) + ')');
        ok(JSON.stringify(j.downloads['Pandion-Plots-macOS.dmg']) === '[["2026-10-01",4],["2026-10-02",5]]' && JSON.stringify(j.downloads['pandion-win-x64.jmo']) === '[["2026-10-01",1],["2026-10-02",1]]',
           'and each file day by day (' + JSON.stringify(j.downloads) + ')');
        // the counters' own table, on the same database
        sdb.run("INSERT INTO hits (day, kind, n) VALUES ('2026-09-25', 'launch', 3), ('2026-09-26', 'launch', 1)");
        const pingRes = await worker.fetch(ping('launch', human), env);
        const today = new Date().toISOString().slice(0, 10);
        ok(pingRes.status === 204 && rows("SELECT n FROM hits WHERE kind = 'launch' AND day = '" + today + "'")[0][0] === 1, 'a ping still lands on today\'s row in the same database');
        const j2 = await (await worker.fetch(new Request('https://pandionplots.com/api/daily'), env)).json();
        ok(j2.hitsSince === '2026-09-25' && j2.hits.launch.length === 3, '/api/daily lists the counters\' days from the first (' + JSON.stringify(j2.hits.launch) + ')');
    }
}
// 12
{
    const { env, bumps } = mockEnv();
    const good = ['page:gallery', 'page:home', 'page:learn-data', 'page:workshop-7', 'time:gallery:lt10',
                  'time:learn-data:ge300', 'tour:data:start', 'tour:three-rules:done'];
    for (const k of good) await worker.fetch(ping(k, human), env);
    ok(bumps.length === good.length && bumps.join(',') === good.join(','),
       'the page, time-band and film kinds count, as sent (' + bumps.length + ' of ' + good.length + ')');
    const bad = ['page:', 'page:Gallery', 'page:../x', 'page:' + 'a'.repeat(41), 'page:gallery.html', 'page:gallery:x',
                 'time:gallery:lt5', 'time:gallery', 'time::lt10', 'tour:data:open', 'tour:data', 'tour:Data:start',
                 'pages:gallery', 'PAGE:home', ' page:home'];
    const before = bumps.length;
    for (const k of bad) {
        const res = await worker.fetch(ping(k, human), env);
        if (res.status !== 204) ok(false, 'a dropped kind still answers 204 (' + k + ' -> ' + res.status + ')');
    }
    ok(bumps.length === before, 'and nothing merely shaped like them does (' + bad.length + ' tried, all 204)');
    ok(kindOk('launch') && kindOk('launch-day') && kindOk('portable') && !kindOk('launch '),
       'kindOk keeps the three original kinds, exactly');
    const { env: env2 } = mockEnv([
        { day: '2026-09-25', kind: 'launch', n: 3 }, { day: '2026-09-26', kind: 'launch', n: 1 },
        { day: '2026-11-03', kind: 'page:gallery', n: 2 }, { day: '2026-11-04', kind: 'page:gallery', n: 5 },
        { day: '2026-11-04', kind: 'tour:data:start', n: 1 }]);
    const j = await (await worker.fetch(new Request('https://pandionplots.com/api/daily'), env2)).json();
    ok(j.hitsSince === '2026-09-25' && j.hitsSinceOf.launch === '2026-09-25' && j.hitsSinceOf['page:gallery'] === '2026-11-03' &&
       j.hitsSinceOf['tour:data:start'] === '2026-11-04',
       '/api/daily keeps the shared first day and gives each kind its own (' + JSON.stringify(j.hitsSinceOf) + ')');
    ok(JSON.stringify(j.hits['page:gallery']) === '[["2026-11-03",2],["2026-11-04",5]]', 'and lists a page kind day by day');
    // /api/counts reads rows the database has already summed per kind
    // (the mock hands back whatever rows it holds), so give it that shape.
    const { env: env3 } = mockEnv([{ kind: 'page:gallery', n: 7, since: '2026-11-03' }, { kind: 'launch', n: 4, since: '2026-09-25' }]);
    const c = await (await worker.fetch(new Request('https://pandionplots.com/api/counts'), env3)).json();
    ok(c['page:gallery'] && c['page:gallery'].count === 7 && c['page:gallery'].since === '2026-11-03',
       '/api/counts carries a page kind with its first day like any other (' + JSON.stringify(c['page:gallery']) + ')');
}
// 13
{
    const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
    const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
    // What a phone's browser sends when the camera hands it the address.
    const scan = { 'User-Agent': IPHONE, 'Sec-Fetch-Site': 'none', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document', 'Sec-Fetch-User': '?1' };
    const visit = (p, headers, { method, cf } = {}) => {
        const r = new Request('https://pandionplots.com' + p, { method: method || 'GET', headers });
        if (cf) Object.defineProperty(r, 'cf', { value: cf });
        return r;
    };
    const HOME = 'https://pandionplots.com/';
    let m = mockEnv();
    let res = await worker.fetch(visit('/card', scan), m.env);
    ok(res.status === 302 && res.headers.get('location') === HOME && (await res.text()) === '',
       'a scan of the card goes straight on to the home page (' + res.status + ' to ' + res.headers.get('location') + ')');
    ok(/no-store/.test(res.headers.get('cache-control') || ''), 'and nothing may keep the redirect, so the next scan comes back to be counted');
    ok(m.bumps.length === 1 && m.bumps[0] === 'card', 'and it is counted once as card (' + JSON.stringify(m.bumps) + ')');
    ok(isScanCountable(visit('/card', scan)) === true, 'isScanCountable says yes to it');
    m = mockEnv();
    await worker.fetch(visit('/card', Object.assign({}, scan, { 'User-Agent': ANDROID })), m.env);
    await worker.fetch(visit('/card', Object.assign({}, scan, { 'Sec-Fetch-Site': 'cross-site' })), m.env);
    await worker.fetch(visit('/card', Object.assign({}, scan, { 'User-Agent': ANDROID.replace('Pixel 8)', 'Pixel 8; wv)') + ' QRScanner/3.1' })), m.env);
    ok(m.bumps.length === 3, 'an Android phone, a page opened from another app or site, and a QR app\'s own browser that names itself a scanner all count (' + m.bumps.length + ' of 3)');
    m = mockEnv();
    for (const p of ['/card/', '/CARD', '/Card?from=aera']) {
        res = await worker.fetch(visit(p, scan), m.env);
        if (res.status !== 302 || res.headers.get('location') !== HOME) ok(false, p + ' redirects home (' + res.status + ')');
    }
    ok(m.bumps.length === 3, '/card/, /CARD and /Card?from=... count and redirect the same (' + m.bumps.length + ' of 3)');
    m = mockEnv(); const waits = [];
    res = await worker.fetch(visit('/card', scan), m.env, { waitUntil: p => waits.push(p) });
    const countedBefore = m.bumps.length;
    await Promise.all(waits);
    ok(res.status === 302 && waits.length === 1 && m.bumps.length === 1,
       'on Cloudflare the count rides waitUntil, so the redirect never waits on the database (' + countedBefore + ' then ' + m.bumps.length + ')');
    const notCounted = [
        ['a HEAD request', visit('/card', scan, { method: 'HEAD' })],
        ['a prefetch (Sec-Purpose)', visit('/card', Object.assign({}, scan, { 'Sec-Purpose': 'prefetch' }))],
        ['a prerender', visit('/card', Object.assign({}, scan, { 'Sec-Purpose': 'prefetch;prerender' }))],
        ['an old-style prefetch (Purpose)', visit('/card', Object.assign({}, scan, { 'Purpose': 'prefetch' }))],
        ['a preview (X-Purpose)', visit('/card', Object.assign({}, scan, { 'X-Purpose': 'preview' }))],
        ['a script fetching it', visit('/card', Object.assign({}, scan, { 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Dest': 'empty' }))],
        ['the address inside another page', visit('/card', Object.assign({}, scan, { 'Sec-Fetch-Dest': 'iframe' }))],
        ['a click from this site\'s own pages', visit('/card', Object.assign({}, scan, { 'Sec-Fetch-Site': 'same-origin' }))],
        ['a phone too old to send Sec-Fetch headers', visit('/card', { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1' })],
        ['an address-guessing tool posing as an old browser', visit('/card', { 'User-Agent': 'Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1)' })],
        ['a link preview (iMessage, Facebook)', visit('/card', Object.assign({}, scan, { 'User-Agent': 'facebookexternalhit/1.1 Facebot Twitterbot/1.0' }))],
        ['a WhatsApp preview', visit('/card', { 'User-Agent': 'WhatsApp/2.23.20.0' })],
        ['Slack unfurling', visit('/card', { 'User-Agent': 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)' })],
        ['Googlebot', visit('/card', Object.assign({}, scan, { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }))],
        ['a headless browser', visit('/card', Object.assign({}, scan, { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0.0.0 Safari/537.36' }))],
        ['curl', visit('/card', { 'User-Agent': 'curl/8.4.0' })],
        ['no User-Agent', visit('/card', { 'Sec-Fetch-Site': 'none', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' })],
        ['a Cloudflare verified bot', visit('/card', scan, { cf: { verifiedBotCategory: 'Monitoring & Analytics' } })],
    ];
    let quiet = 0;
    for (const [name, req] of notCounted) {
        const mm = mockEnv();
        const r = await worker.fetch(req, mm.env);
        if (r.status === 302 && r.headers.get('location') === HOME && mm.bumps.length === 0) quiet++;
        else ok(false, name + ' should be redirected but not counted (' + r.status + ', ' + mm.bumps.length + ' counted)');
    }
    ok(quiet === notCounted.length, 'redirected home but not counted: ' + notCounted.map(x => x[0]).join(', ') + ' (' + quiet + ' of ' + notCounted.length + ')');
    m = mockEnv();
    await worker.fetch(ping('card', human), m.env);
    ok(m.bumps.length === 0 && !kindOk('card'), 'no page can ping the card count: only opening /card counts');
    res = await worker.fetch(visit('/card', scan), { ASSETS: { fetch: async () => new Response('asset') } });
    ok(res.status === 302 && res.headers.get('location') === HOME, 'without a database the card still goes home');
    const refusing = { pandion_counts: { prepare: () => ({ bind: () => ({ run: async () => { throw new Error('D1_ERROR: daily quota'); } }) }) },
                       ASSETS: { fetch: async () => new Response('asset') } };
    res = await worker.fetch(visit('/card', scan), refusing);
    ok(res.status === 302 && res.headers.get('location') === HOME, 'and a database that refuses the write still sends the scan home');
    let lookalike = 0;
    const paths = ['/cards', '/card/aera', '/cardx', '/card.html', '/x/card', '/api/card'];
    for (const p of paths) {
        const mm = mockEnv();
        const r = await worker.fetch(visit(p, scan), mm.env);
        if (r.status === 200 && (await r.text()) === 'asset' && mm.bumps.length === 0) lookalike++;
        else ok(false, p + ' should be the static site');
    }
    ok(lookalike === paths.length, 'look-alike paths are the static site, uncounted: ' + paths.join(', '));
    m = mockEnv();
    res = await worker.fetch(visit('/card', scan, { method: 'POST' }), m.env);
    ok(res.status === 200 && (await res.text()) === 'asset' && m.bumps.length === 0, 'a POST to /card is no scan: the static site answers it');
    const { env: envC } = mockEnv([{ kind: 'card', n: 12, since: '2026-11-08' }]);
    const cj = await (await worker.fetch(new Request('https://pandionplots.com/api/counts'), envC)).json();
    ok(cj.card && cj.card.count === 12 && cj.card.since === '2026-11-08', '/api/counts carries the card kind with its first day (' + JSON.stringify(cj.card) + ')');
    const { env: envD } = mockEnv([{ day: '2026-09-25', kind: 'launch', n: 3 }, { day: '2026-11-08', kind: 'card', n: 4 }, { day: '2026-11-09', kind: 'card', n: 1 }]);
    const dj = await (await worker.fetch(new Request('https://pandionplots.com/api/daily'), envD)).json();
    ok(dj.hitsSinceOf.card === '2026-11-08' && JSON.stringify(dj.hits.card) === '[["2026-11-08",4],["2026-11-09",1]]',
       '/api/daily lists the scans day by day from their own first day (' + JSON.stringify(dj.hits.card) + ')');
}
if (fails) { console.log('COUNTER WORKER: ' + fails + ' failure(s)'); process.exit(1); }
console.log('COUNTER WORKER: ALL GREEN');
