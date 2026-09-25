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
// Usage: node worker/verify-worker.mjs
import worker, { isCountable } from './index.js';
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
if (fails) { console.log('COUNTER WORKER: ' + fails + ' failure(s)'); process.exit(1); }
console.log('COUNTER WORKER: ALL GREEN');
