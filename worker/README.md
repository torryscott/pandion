# Usage counters (Sep 2026)

What pandionplots.com counts, and the one-time setup that turns the
counters on. Read this before touching `worker/` or `wrangler.jsonc`.

## What is counted

| Item | Counted by | How |
| --- | --- | --- |
| Browser app launches at pandionplots.com/app | this Worker | the hosted app sends one empty `POST /api/hit/launch` when it boots, plus `launch-day` once per browser per calendar day |
| Portable HTML file downloads from the site | this Worker | the "Download HTML app" buttons send `POST /api/hit/portable` on click |
| Desktop installers and every jamovi .jmo | GitHub | `download_count` per release asset, read by about.html straight from the public Releases API |
| jamovi library installs | nobody | jamovi serves those; the module is not listed there yet |

The app pings only when `psUpdateHosted()` is true (hostname is
pandionplots.com) and `navigator.webdriver` is false. The desktop app,
the portable file, every file:// probe and every headless run send
nothing, by construction. A ping carries no body, no cookie and no
identifier; the Worker stores `(day, kind, count)` and nothing else.

Bots are kept out of the launch count three ways (Sep 25 2026, Torry's
ask): the Worker drops a ping whose User-Agent names a crawler or an HTTP
library, whose Sec-Fetch headers say another site made it, or which
Cloudflare flags as a verified bot (`isCountable` in worker/index.js;
`worker/verify-worker.mjs` pins the rules and build.sh runs it). A
scraper impersonating a browser still gets through, as everywhere.
GitHub's download counts cannot be filtered; the table says so.

The footer line on the home page and the "Usage" table on
About fetch `GET /api/counts` after the page loads and stay hidden (or
show dashes) when it fails, so the site never depends on the counter.

## One-time setup (needs a Cloudflare login)

The live project serves `./website` as Workers static assets
(`wrangler.jsonc` has an `assets` block and `website/.assetsignore` is
honored live). Adding `main` to that config turns it into a Worker with
assets: static files are still served first, and the Worker only sees
paths that are not files, which is exactly `/api/hit/*` and `/api/counts`.

1. `npx wrangler login` (once per machine).
2. `npx wrangler d1 create pandion-counts`; let wrangler add the binding
   to `wrangler.jsonc` (its default name `pandion_counts` is what the
   Worker reads; `DB` works too).
3. Commit the config and push `main` (the git deploy binds the database).
4. `npx wrangler d1 execute pandion-counts --remote --file worker/schema.sql`
5. Deploy: either push `main` (if the project builds from git) or
   `npx wrangler deploy` from the repo root.
6. Check: `curl -s https://pandionplots.com/api/counts` answers JSON, and
   after opening the app once, `launch` is 1.

Until the binding is deployed the Worker runs without a database: pings
are dropped, `/api/counts` answers 503, the pages hide their counters.
Done Sep 25 2026 (database 59b66b38..., binding `pandion_counts`).

If the dashboard shows the project is Cloudflare Pages rather than
Workers, the same three handlers belong in `functions/api/hit/[kind].js`
and `functions/api/counts.js` at the repository root, with the D1 binding
set in the Pages project settings; nothing on the pages changes.

## Local run

`npx wrangler dev` serves the site with the Worker in front; add
`--local` D1 with the schema for a working counter. The probes do not
need it: `website/verify-counts.mjs` routes `/api/counts` and the GitHub
API to fixtures, and `standalone/verify/launch-ping-check.mjs` loads the
app under a routed pandionplots.com hostname and records the pings.

## The privacy promise, kept exactly

Three sentences on the site say what is sent (index.html's "Private by
design" pillar, about.html's "Free, private, open" paragraph, the About
table's introduction) and support.html says "no tracking". The app's own
About dialog says the data is never sent and, only on the hosted copy,
that one launch ping is. Keep those in step with this file.
