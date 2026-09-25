// Pandion Plots usage counters (Sep 2026). See worker/README.md.
//
// The site is static files served from ./website. This Worker answers only
// the paths that are not static files: two counter endpoints. Everything
// else falls through to the static assets exactly as before.
//
//   POST /api/hit/<kind>   one empty ping; kind is launch, launch-day or
//                          portable. No body, no cookie, no identifier is
//                          read or stored. Same-site requests only.
//   GET  /api/counts       {"launch": {"count": n, "since": "YYYY-MM-DD"},
//                          ...} for the footer line and the About table.
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

async function bump(env, kind) {
  await env.DB.prepare(
    "INSERT INTO hits (day, kind, n) VALUES (date('now'), ?, 1) " +
    "ON CONFLICT(day, kind) DO UPDATE SET n = n + 1"
  ).bind(kind).run();
}

const NO_STORE = { "Cache-Control": "no-store" };

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname.startsWith("/api/hit/")) {
      if (req.method !== "POST") return new Response(null, { status: 405, headers: NO_STORE });
      const kind = url.pathname.slice("/api/hit/".length);
      if (env.DB && KINDS.has(kind) && sameSite(req)) {
        try { await bump(env, kind); } catch (e) { /* a full day quota or a hiccup: an undercount, never an error to the visitor */ }
      }
      return new Response(null, { status: 204, headers: NO_STORE });
    }

    if (url.pathname === "/api/counts") {
      const cors = { "Access-Control-Allow-Origin": "*" };
      if (!env.DB) {
        return Response.json({ error: "counter database not configured" },
          { status: 503, headers: Object.assign({}, cors, NO_STORE) });
      }
      let results = [];
      try {
        results = (await env.DB.prepare(
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

    // Everything else is the static site, with its own 404 page.
    return env.ASSETS.fetch(req);
  }
};
