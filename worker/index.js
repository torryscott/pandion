// Pandion Plots usage counters (Sep 2026). See worker/README.md.
//
// The site is static files served from ./website. This Worker answers only
// the paths that are not static files: two counter endpoints. Everything
// else falls through to the static assets exactly as before.
//
//   POST /api/hit/<kind>   one empty ping; kind is launch, launch-day or
//                          portable. No body, no cookie, no identifier is
//                          read or stored. Same-site requests from what
//                          looks like a person's browser only (crawlers,
//                          HTTP libraries and Cloudflare's verified bots
//                          are dropped; see isCountable).
//   GET  /api/counts       {"launch": {"count": n, "since": "YYYY-MM-DD"},
//                          ...} for the footer line and the usage table.
//   GET  /api/daily        the same counts day by day, plus the daily
//                          history of GitHub downloads, for the charts on
//                          the usage page (Oct 2026).
//
// And one scheduled job (wrangler.jsonc "triggers"): every hour it reads
// GitHub's running download totals for the installers and the jamovi
// modules and records how much each grew since the last check, because
// GitHub keeps only the running total. See snapshotDownloads below.
//
// Storage is a D1 table of (day, kind, n): whole-day integers and nothing
// else. Without the DB binding (before the one-time setup in the README)
// pings are dropped and /api/counts answers 503, and the pages hide their
// counters; nothing else on the site changes.

const KINDS = new Set(["launch", "launch-day", "portable"]);
const SITE = /(^|\.)pandionplots\.com$/i;
const LOCAL = /^(localhost|127\.0\.0\.1)$/i;

function sameSite(req) {
  // A browser sends Origin on every POST (sendBeacon included); Referer is
  // the fallback for the rare agent that omits it. Local development counts
  // too (wrangler dev), the public site never sees those hostnames.
  const ref = req.headers.get("Origin") || req.headers.get("Referer") || "";
  if (!ref) return false;
  try {
    const h = new URL(ref).hostname;
    return SITE.test(h) || LOCAL.test(h);
  } catch (e) { return false; }
}

// Crawlers and scripts announce themselves in the User-Agent; this is the
// well-behaved majority (search engines, link previewers, AI crawlers,
// monitors, HTTP libraries). A scraper pretending to be Chrome gets past
// it, as it gets past every counter.
const BOT_UA = /bot|crawl|spider|slurp|scan|monitor|headless|lighthouse|pagespeed|python-requests|python-urllib|curl\/|wget\/|httpclient|java\/|go-http-client|libwww|okhttp|axios\/|node-fetch|undici|phantomjs|facebookexternalhit|embedly|whatsapp|telegrambot|skypeuripreview|discordbot|pinterest|linkedinbot|twitterbot|applebot|gptbot|claudebot|anthropic|ccbot|bytespider|petalbot|semrush|ahrefs|mj12|yandex|baidu|duckduck|bingpreview|ia_archiver|archive\.org|feedfetcher|validator|uptime|pingdom|datadog|newrelic|siteimprove/i;

// Would a person's browser have sent this? Three tests, each free:
//   1. the User-Agent does not name a crawler or an HTTP library;
//   2. the Sec-Fetch headers, when the browser sends them (every current
//      browser does), say a same-origin page made the request. Absent
//      headers pass: Safari before 16.4 sent none, and the Origin check
//      in sameSite still applies;
//   3. Cloudflare does not flag the request as a verified bot.
function isCountable(req) {
  const ua = req.headers.get("User-Agent") || "";
  if (!ua || BOT_UA.test(ua)) return false;
  const site = req.headers.get("Sec-Fetch-Site");
  if (site && site !== "same-origin") return false;
  const mode = req.headers.get("Sec-Fetch-Mode");
  if (mode && mode !== "no-cors" && mode !== "cors" && mode !== "same-origin") return false;
  const cf = req.cf || {};
  if (cf.verifiedBotCategory) return false;
  if (cf.botManagement && cf.botManagement.verifiedBot) return false;
  return true;
}

// The D1 binding as wrangler.jsonc names it (pandion_counts; DB is
// accepted too, the name the README first suggested).
function db(env) { return env.pandion_counts || env.DB || null; }

async function bump(env, kind) {
  await db(env).prepare(
    "INSERT INTO hits (day, kind, n) VALUES (date('now'), ?, 1) " +
    "ON CONFLICT(day, kind) DO UPDATE SET n = n + 1"
  ).bind(kind).run();
}

const NO_STORE = { "Cache-Control": "no-store" };

// ---- GitHub download history (Oct 2026) -----------------------------------
// GitHub reports one running total per release file and nothing about when
// the downloads happened. So every hour the Worker reads the totals,
// compares each with the last total it saw, and adds the increase to
// today's row in `downloads`. The first check only notes the totals (the
// baseline): the history starts that day, and the usage table's all-time
// counts keep coming from GitHub directly.
//
// Three tables, created here on the first run so no manual migration is
// needed (worker/schema.sql lists them too):
//   downloads(day, asset, n)              the daily increases, by file name
//   download_totals(release, asset, total) the last total seen per file
//   meta(key, value)                      downloads_since (the baseline day),
//                                         downloads_checked, downloads_etag
const GH_RELEASES = "https://api.github.com/repos/torryscott/pandion/releases?per_page=100";
// Installers and jamovi modules only. Update feeds (.yml), differential
// update files (.blockmap) and the macOS auto-update archive (.zip) are
// fetched by the apps themselves, not by people, and the page never shows
// them. A new installer type needs its extension added here.
const GH_FILE = /\.(dmg|exe|jmo)$/i;
const DOWNLOAD_TABLES = [
  "CREATE TABLE IF NOT EXISTS downloads (day TEXT NOT NULL, asset TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, asset))",
  "CREATE TABLE IF NOT EXISTS download_totals (release TEXT NOT NULL, asset TEXT NOT NULL, total INTEGER NOT NULL, PRIMARY KEY (release, asset))",
  "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
];

function utcDay(ms) { return new Date(ms).toISOString().slice(0, 10); }

// [{release, asset, total}] for every installer or module file on a
// published release.
function totalsFromReleases(releases) {
  const out = [];
  for (const rel of Array.isArray(releases) ? releases : []) {
    if (!rel || rel.draft) continue;
    const tag = String(rel.tag_name || rel.id || "");
    if (!tag) continue;
    for (const a of rel.assets || []) {
      const name = String((a && a.name) || "");
      if (!GH_FILE.test(name)) continue;
      const total = Number(a.download_count);
      if (!Number.isFinite(total) || total < 0) continue;
      out.push({ release: tag, asset: name, total: Math.floor(total) });
    }
  }
  return out;
}

// How much each file name grew since the totals last seen, and which
// totals changed. A file seen for the first time (a new release) counts
// from zero: it did not exist at the last check. GitHub's count only
// grows unless a file is deleted and uploaded again, which starts it from
// zero, so a total that went down means everything it shows now is new.
function downloadIncrements(previous, current) {
  const prev = new Map((previous || []).map(r => [r.release + "\u001f" + r.asset, Number(r.total) || 0]));
  const increments = {};
  const changed = [];
  for (const c of current) {
    const key = c.release + "\u001f" + c.asset;
    const seen = prev.has(key);
    const before = seen ? prev.get(key) : 0;
    const delta = c.total >= before ? c.total - before : c.total;
    if (delta > 0) increments[c.asset] = (increments[c.asset] || 0) + delta;
    if (!seen || before !== c.total) changed.push(c);
  }
  return { increments, changed };
}

// One hourly check. Returns what happened, for the log and the tests;
// never throws for an outside failure (GitHub down or rate-limited: the
// next hour picks up everything, attributed to that hour's day).
async function snapshotDownloads(env, scheduledTime, fetchImpl) {
  const d = db(env);
  if (!d) return { status: "no-database" };
  const now = Number(scheduledTime) || Date.now();
  const day = utcDay(now);
  const stamp = new Date(now).toISOString();
  await d.batch(DOWNLOAD_TABLES.map(sql => d.prepare(sql)));
  const meta = {};
  for (const r of ((await d.prepare("SELECT key, value FROM meta").all()).results || [])) meta[r.key] = r.value;
  const setMeta = (key, value) => d.prepare(
    "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).bind(key, value);

  // GitHub asks every API client to name itself. A conditional request
  // that comes back 304 (nothing changed) does not use up the rate limit,
  // and a GITHUB_TOKEN secret, if one is ever set, raises that limit.
  const headers = {
    "User-Agent": "pandionplots.com download history",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (meta.downloads_etag) headers["If-None-Match"] = meta.downloads_etag;
  if (env.GITHUB_TOKEN) headers["Authorization"] = "Bearer " + env.GITHUB_TOKEN;
  let res;
  try { res = await (fetchImpl || fetch)(GH_RELEASES, { headers }); }
  catch (e) { return { status: "github-unreachable" }; }
  if (res.status === 304) {
    await setMeta("downloads_checked", stamp).run();
    return { status: "unchanged" };
  }
  if (!res.ok) return { status: "github-" + res.status };
  let releases;
  try { releases = await res.json(); } catch (e) { return { status: "github-bad-json" }; }
  if (!Array.isArray(releases)) return { status: "github-bad-json" };

  const current = totalsFromReleases(releases);
  const upsertTotal = c => d.prepare(
    "INSERT INTO download_totals (release, asset, total) VALUES (?, ?, ?) " +
    "ON CONFLICT(release, asset) DO UPDATE SET total = excluded.total"
  ).bind(c.release, c.asset, c.total);
  const tail = [setMeta("downloads_checked", stamp)];
  const etag = res.headers.get("ETag");
  if (etag) tail.push(setMeta("downloads_etag", etag));

  // A batch is one transaction: the new totals and the increases they
  // imply are written together or not at all, so nothing is counted twice.
  if (!meta.downloads_since) {
    await d.batch(current.map(upsertTotal).concat([setMeta("downloads_since", day)], tail));
    return { status: "baseline", files: current.length };
  }
  const previous = (await d.prepare("SELECT release, asset, total FROM download_totals").all()).results || [];
  const { increments, changed } = downloadIncrements(previous, current);
  const writes = changed.map(upsertTotal);
  let added = 0;
  for (const asset of Object.keys(increments)) {
    added += increments[asset];
    writes.push(d.prepare(
      "INSERT INTO downloads (day, asset, n) VALUES (?, ?, ?) " +
      "ON CONFLICT(day, asset) DO UPDATE SET n = n + excluded.n"
    ).bind(day, asset, increments[asset]));
  }
  await d.batch(writes.concat(tail));
  return { status: "recorded", downloads: added };
}

export { sameSite, isCountable, totalsFromReleases, downloadIncrements, snapshotDownloads };

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname.startsWith("/api/hit/")) {
      if (req.method !== "POST") return new Response(null, { status: 405, headers: NO_STORE });
      const kind = url.pathname.slice("/api/hit/".length);
      if (db(env) && KINDS.has(kind) && sameSite(req) && isCountable(req)) {
        try { await bump(env, kind); } catch (e) { /* a full day quota or a hiccup: an undercount, never an error to the visitor */ }
      }
      return new Response(null, { status: 204, headers: NO_STORE });
    }

    if (url.pathname === "/api/counts") {
      const cors = { "Access-Control-Allow-Origin": "*" };
      if (!db(env)) {
        return Response.json({ error: "counter database not configured" },
          { status: 503, headers: Object.assign({}, cors, NO_STORE) });
      }
      let results = [];
      try {
        results = (await db(env).prepare(
          "SELECT kind, SUM(n) AS n, MIN(day) AS since FROM hits GROUP BY kind"
        ).all()).results || [];
      } catch (e) {
        return Response.json({ error: "counter database unavailable" },
          { status: 503, headers: Object.assign({}, cors, NO_STORE) });
      }
      const out = { updated: new Date().toISOString() };
      for (const r of results) out[r.kind] = { count: Number(r.n) || 0, since: r.since };
      return Response.json(out, { headers: Object.assign({ "Cache-Control": "public, max-age=60" }, cors) });
    }

    if (url.pathname === "/api/daily") {
      const cors = { "Access-Control-Allow-Origin": "*" };
      const d = db(env);
      if (!d) {
        return Response.json({ error: "counter database not configured" },
          { status: 503, headers: Object.assign({}, cors, NO_STORE) });
      }
      let hitRows;
      try {
        hitRows = (await d.prepare("SELECT day, kind, n FROM hits ORDER BY day, kind").all()).results || [];
      } catch (e) {
        return Response.json({ error: "counter database unavailable" },
          { status: 503, headers: Object.assign({}, cors, NO_STORE) });
      }
      // The download tables appear with the first hourly check; until then
      // there is simply no download history yet.
      let dlRows = [], dlMeta = [];
      try {
        dlRows = (await d.prepare("SELECT day, asset, n FROM downloads ORDER BY day, asset").all()).results || [];
        dlMeta = (await d.prepare(
          "SELECT key, value FROM meta WHERE key IN ('downloads_since', 'downloads_checked')"
        ).all()).results || [];
      } catch (e) { dlRows = []; dlMeta = []; }
      const meta = {};
      for (const r of dlMeta) meta[r.key] = r.value;
      const hits = {}, downloads = {};
      for (const r of hitRows) (hits[r.kind] = hits[r.kind] || []).push([r.day, Number(r.n) || 0]);
      for (const r of dlRows) (downloads[r.asset] = downloads[r.asset] || []).push([r.day, Number(r.n) || 0]);
      return Response.json({
        updated: new Date().toISOString(),
        // Every counter started together, so the first day of any of them
        // is when counting began; a kind with no row on a day had zero.
        hitsSince: hitRows.length ? hitRows[0].day : null,
        hits,
        downloadsSince: meta.downloads_since || null,
        downloadsChecked: meta.downloads_checked || null,
        downloads,
      }, { headers: Object.assign({ "Cache-Control": "public, max-age=300" }, cors) });
    }

    // Everything else is the static site, with its own 404 page.
    return env.ASSETS.fetch(req);
  },

  // The hourly GitHub check (wrangler.jsonc "triggers"). The log line is
  // what shows under the Worker's logs in the Cloudflare dashboard.
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(snapshotDownloads(env, controller.scheduledTime)
      .then(r => console.log("download history:", JSON.stringify(r)))
      .catch(e => console.log("download history failed:", String(e))));
  }
};
