# Usage counters (Sep 2026)

What pandionplots.com counts, and the one-time setup that turns the
counters on. Read this before touching `worker/` or `wrangler.jsonc`.

## What is counted

| Item | Counted by | How |
| --- | --- | --- |
| Browser app launches at pandionplots.com/app | this Worker | the hosted app sends one empty `POST /api/hit/launch` when it boots, plus `launch-day` once per browser per calendar day |
| Portable HTML file downloads from the site | this Worker | the "Download HTML app" buttons send `POST /api/hit/portable` on click |
| Desktop installers and every jamovi .jmo | GitHub | `download_count` per release asset, read by usage.html straight from the public Releases API |
| Their daily history (Oct 2026) | this Worker, hourly | the scheduled job reads those same public totals every hour and stores how much each grew; see "Daily history" below |
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

The footer line on the home page and the table on usage.html fetch
`GET /api/counts` after the page loads and stay hidden (or show dashes)
when it fails, so the site never depends on the counter. Clicking a row
of that table fetches `GET /api/daily` for its chart; a failure there
says so in the chart and nothing else changes.

## Daily history (Oct 2026)

`GET /api/daily` answers the same counts day by day:

    {"hitsSince": "2026-09-25",
     "hits": {"launch": [["2026-09-25", 12], ...], "launch-day": [...], "portable": [...]},
     "downloadsSince": "2026-10-01", "downloadsChecked": "2026-10-01T14:59:00.000Z",
     "downloads": {"Pandion-Plots-macOS.dmg": [["2026-10-02", 3], ...], ...}}

A day with no row had zero. The usage page zero-fills from `hitsSince`
(every counter started together) and bins by day, week (Monday start)
or month, all in UTC days.

GitHub keeps only a running total per file, so the Worker's scheduled job
(`wrangler.jsonc` "triggers", minute 59 of every hour; `snapshotDownloads`
in index.js) reads the releases, compares each installer and .jmo total
with the last one it saw (`download_totals`), and adds the growth to
today's row in `downloads`. The first run only records the totals; the
history starts that day (`meta.downloads_since`). A new release's files
count from zero; a file that was deleted and uploaded again counts from
its new total; a failed or rate-limited check changes nothing and the
next hour catches up. Update feeds, .blockmap files and the macOS update
.zip are skipped (apps fetch those, not people).

No migration is needed: the job creates its three tables on its first
run (they are in `schema.sql` too, for a fresh database). The requests
are unauthenticated and conditional (`If-None-Match`), and an unchanged
answer does not use up GitHub's rate limit. If Cloudflare's shared
addresses ever hit that limit, a token raises it:
`npx wrangler secret put GITHUB_TOKEN` with a fine-grained token that has
read-only access to public repositories. The Worker sends it when present.

To see that the job is running: `curl -s https://pandionplots.com/api/daily`
shows `downloadsChecked` within the last hour (it moves only when a check
succeeds), and the Worker's logs show one `download history:` line per
run. `worker/verify-worker.mjs` covers the arithmetic and, when sql.js is
installed beside playwright, the whole job on real SQLite.

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
